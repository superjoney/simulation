// Call center simulator server.
// Serves the simulator (public/), mints ElevenLabs conversation tokens when an
// API key is configured, and saves each session's log under sessions/.
// No dependencies: needs Node 18+ (global fetch).

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ELEVENLABS_API_KEY || "";
const PUBLIC_DIR = path.join(__dirname, "public");
// On Railway, point this at a mounted volume so logs survive redeploys.
const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, "sessions");
// Set SIM_LABEL (e.g. "TEST") on a test copy: it shows as a badge so it's never mistaken for the live link.
// Set this to download every saved log at /api/sessions?key=<value>.
const RESEARCHER_KEY = process.env.RESEARCHER_KEY || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function conversationToken(req, res) {
  if (!API_KEY) return sendJson(res, 404, { error: "no_api_key" });
  const agentId = new URL(req.url, "http://x").searchParams.get("agent_id") || "";
  if (!/^agent_[A-Za-z0-9]+$/.test(agentId)) return sendJson(res, 400, { error: "invalid_agent_id" });
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": API_KEY } }
    );
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.token) {
      console.error("Token request failed:", r.status, body);
      return sendJson(res, 502, { error: "token_request_failed", status: r.status });
    }
    sendJson(res, 200, { token: body.token });
  } catch (err) {
    console.error("Token request error:", err);
    sendJson(res, 502, { error: "token_request_failed" });
  }
}

function saveSession(req, res) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 5e6) req.destroy();
  });
  req.on("end", () => {
    let log;
    try {
      log = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }
    const safe = (s) => String(s || "").replace(/[^\w.-]+/g, "_").slice(0, 60);
    const name = `${safe(log.participantId) || "anon"}_${safe(log.sessionId)}.json`;
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.writeFile(path.join(SESSIONS_DIR, name), JSON.stringify(log, null, 2), (err) => {
      if (err) return sendJson(res, 500, { error: "write_failed" });
      sendJson(res, 200, { saved: `sessions/${name}` });
    });
  });
}

/* ---------- progress: random call order per participant, and resume ----------
   Kept in SESSIONS_DIR/progress.json, keyed by the participant's name (case and spacing ignored).
   A new name gets a random order (always including the "always" customer, when set); a name with
   calls still to do gets its saved order back. */
const PROGRESS_FILE = path.join(SESSIONS_DIR, "progress.json");
let progress = {};
try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); } catch { progress = {}; }
function saveProgress() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE + ".tmp", JSON.stringify(progress, null, 2));
  fs.renameSync(PROGRESS_FILE + ".tmp", PROGRESS_FILE);
}
const nameKey = (n) => String(n || "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 80);
const ID_RE = /^[a-z0-9_-]{1,40}$/i;

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function progressStart(req, res) {
  const b = await readJson(req);
  const key = nameKey(b && b.name);
  const clients = (b && Array.isArray(b.clients) ? b.clients : []).filter((c) => ID_RE.test(c));
  const count = Math.max(1, Math.min(Number(b && b.count) || 2, clients.length));
  if (!key || !clients.length) return sendJson(res, 400, { error: "name_and_clients_required" });
  // Right-rail version (e.g. upcoming / recap / both): one per participant, random unless the researcher picks it
  const variants = (b && Array.isArray(b.variants) ? b.variants : []).filter((v) => ID_RE.test(v));
  const pickedVariant = b && variants.includes(b.variant) ? b.variant : null;
  // never the same version twice in a row: skip the one given to the participant who started most recently
  const randomVariant = () => {
    if (!variants.length) return null;
    let last = null, lastAt = "";
    for (const k of Object.keys(progress)) { const r = progress[k]; if (r.variant && r.startedAt > lastAt) { lastAt = r.startedAt; last = r.variant; } }
    const pool = variants.length > 1 ? variants.filter((v) => v !== last) : variants;
    return pool[crypto.randomInt(pool.length)];
  };
  const p = progress[key];
  if (p && !p.finishedAt && p.done.length < p.order.length) {
    if (!p.variant && variants.length) p.variant = pickedVariant || randomVariant();   // records from before variants existed
    p.resumes = (p.resumes || 0) + 1; p.updatedAt = new Date().toISOString(); saveProgress();
    return sendJson(res, 200, { name: p.name, order: p.order, done: p.done, variant: p.variant || null, resumed: true });
  }
  const override = b && Array.isArray(b.order) && b.order.length && b.order.every((c) => clients.includes(c)) ? b.order : null;
  // "always": a customer every participant gets (e.g. Ruth); the rest of the slots are random, in a random order
  const always = b && ID_RE.test(b.always || "") && clients.includes(b.always) ? b.always : null;
  const order = override || (always
    ? shuffled([always].concat(shuffled(clients.filter((c) => c !== always)).slice(0, count - 1)))
    : shuffled(clients).slice(0, count));
  const variant = pickedVariant || randomVariant();
  progress[key] = { name: String(b.name).trim().slice(0, 80), order, chosenBy: override ? "researcher" : "random",
    variant, variantChosenBy: pickedVariant ? "researcher" : "random", done: [],
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: null, runs: ((p && p.runs) || 0) + 1 };
  saveProgress();
  return sendJson(res, 200, { order, done: [], variant, resumed: false });
}

async function progressCall(req, res) {
  const b = await readJson(req);
  const p = progress[nameKey(b && b.name)];
  const n = Number(b && b.n);
  if (!p || !Number.isInteger(n) || n < 1 || n > p.order.length) return sendJson(res, 404, { error: "unknown" });
  if (!p.done.includes(n)) p.done.push(n);
  p.updatedAt = new Date().toISOString();
  if (p.done.length >= p.order.length) p.finishedAt = p.updatedAt;
  saveProgress();
  return sendJson(res, 200, { done: p.done, finished: !!p.finishedAt });
}

function listSessions(req, res) {
  const key = new URL(req.url, "http://x").searchParams.get("key") || "";
  const ok = RESEARCHER_KEY && key.length === RESEARCHER_KEY.length &&
    crypto.timingSafeEqual(Buffer.from(key), Buffer.from(RESEARCHER_KEY));
  if (!ok) return sendJson(res, 403, { error: "forbidden" });
  fs.readdir(SESSIONS_DIR, (err, names) => {
    const logs = (err ? [] : names.filter((n) => n.endsWith(".json") && n !== "progress.json").sort())
      .map((n) => { try { return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, n), "utf8")); } catch { return null; } })
      .filter(Boolean);
    res.writeHead(200, {
      "Content-Type": MIME[".json"],
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="sessions-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.end(JSON.stringify(logs, null, 2));
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (urlPath.endsWith("/")) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://x");
    if (pathname === "/api/config" && req.method === "GET") {
      return sendJson(res, 200, { tokenAuth: Boolean(API_KEY), label: process.env.SIM_LABEL || "" });
    }
    if (pathname === "/api/conversation-token" && req.method === "GET") return conversationToken(req, res);
    if (pathname === "/api/sessions" && req.method === "POST") return saveSession(req, res);
    if (pathname === "/api/progress/start" && req.method === "POST") return progressStart(req, res);
    if (pathname === "/api/progress/call" && req.method === "POST") return progressCall(req, res);
    if (pathname === "/api/sessions" && req.method === "GET") return listSessions(req, res);
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    res.writeHead(405);
    res.end();
  })
  .listen(PORT, () => {
    console.log(`Call center simulator running at http://localhost:${PORT}`);
    console.log(API_KEY ? "Agents connect with WebRTC tokens (API key set)" : "No API key set: agents must be public");
  });
