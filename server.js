// Call center simulator server.
// Serves the simulator (public/), mints ElevenLabs conversation tokens when an
// API key is configured, and saves each session's log under sessions/.
// No dependencies: needs Node 18+ (global fetch).

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ELEVENLABS_API_KEY || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSIONS_DIR = path.join(__dirname, "sessions");

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
      return sendJson(res, 200, { tokenAuth: Boolean(API_KEY) });
    }
    if (pathname === "/api/conversation-token" && req.method === "GET") return conversationToken(req, res);
    if (pathname === "/api/sessions" && req.method === "POST") return saveSession(req, res);
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    res.writeHead(405);
    res.end();
  })
  .listen(PORT, () => {
    console.log(`Call center simulator running at http://localhost:${PORT}`);
    console.log(API_KEY ? "Agents connect with WebRTC tokens (API key set)" : "No API key set: agents must be public");
  });
