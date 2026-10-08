// Call center simulator server.
// Serves the simulator (public/) and the researcher dashboard (/admin), mints ElevenLabs conversation
// tokens when an API key is configured, and records each participant's progress as an event log.
// No dependencies: needs Node 18+ (global fetch).

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createStore } = require("./lib/store");
const { createAuth } = require("./lib/auth");
const metrics = require("./lib/metrics");
const study = require("./lib/study");
const { createBaseline, compare: compareBaseline } = require("./lib/baseline");

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ELEVENLABS_API_KEY || "";
const PUBLIC_DIR = path.join(__dirname, "public");
// On Railway, point this at a mounted volume so data survives redeploys.
const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, "sessions");
// Set SIM_LABEL (e.g. "TEST") on a test copy: it shows as a badge so it's never mistaken for the live link.
const SIM_LABEL = process.env.SIM_LABEL || "";
// Optional: download every saved session log at /api/sessions?key=<value> (the dashboard covers this too).
const RESEARCHER_KEY = process.env.RESEARCHER_KEY || "";

const store = createStore(SESSIONS_DIR);

// The study settings the browser uses (public/config.js), read once for exports
function loadStudyConfig() {
  try {
    const sandbox = { window: {} };
    require("vm").runInNewContext(fs.readFileSync(path.join(PUBLIC_DIR, "config.js"), "utf8"), sandbox, { timeout: 1000 });
    return sandbox.window.SIM_CONFIG || {};
  } catch (e) { console.warn("Couldn't read public/config.js:", e.message); return {}; }
}
const STUDY_CONFIG = loadStudyConfig();
const PANEL_CURRENT = ((STUDY_CONFIG.activity || {}).modules || []).filter((m) => m.current).map((m) => m.id);
const auth = createAuth(process.env.RESEARCHERS);
const baseline = createBaseline(SESSIONS_DIR);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, body, headers) {
  res.writeHead(status, Object.assign({ "Content-Type": MIME[".json"], "Cache-Control": "no-store" }, headers || {}));
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > limit) { reject(new Error("too_large")); req.destroy(); }
    });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("invalid_json")); } });
    req.on("error", reject);
  });
}

const isHttps = (req) => (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";

/* ---------------- ElevenLabs ---------------- */

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

/* ---------------- participants ---------------- */

function progressOf(p) {
  const s = metrics.summarize(p, store.readEvents(p.code));
  return {
    consented: s.consented, audioReady: s.audioReady, briefed: s.briefed, done: s.done, callsDone: s.callsDone,
    surveyDone: !!(p.survey && p.survey.submittedAt),
    completedCalls: s.calls.filter((c) => c.completed).map((c) => c.n),
  };
}
const surveyView = (p) => (p.survey && p.survey.answers) || null;
const panelView = (p) => (p.panel && p.panel.state) || null;

// Survey audio: one file per recording, in <data>/audio/<code>/
const AUDIO_DIR = path.join(SESSIONS_DIR, "audio");
const AUDIO_TYPES = { "audio/webm": ".webm", "audio/mp4": ".m4a", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/mpeg": ".mp3" };
const AUDIO_MIME = { ".webm": "audio/webm", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
const FILE_RE = /^[a-z0-9_-]{1,40}-\d{13}\.(webm|m4a|ogg|wav|mp3)$/;

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("too_large")); req.destroy(); } else parts.push(c); });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

function cleanAnswers(raw, code) {
  const out = {};
  Object.keys(raw && typeof raw === "object" ? raw : {}).slice(0, 40).forEach((id) => {
    if (!/^[a-z0-9_-]{1,40}$/i.test(id)) return;
    const a = raw[id] || {};
    const value = typeof a.value === "number" || typeof a.value === "string" ? String(a.value).slice(0, 200) : null;
    out[id] = {
      text: String(a.text || "").slice(0, 10000),
      value: value == null ? null : typeof a.value === "number" ? Number(value) : value,
      recordings: (Array.isArray(a.recordings) ? a.recordings : []).filter((f) => FILE_RE.test(f) && fs.existsSync(path.join(AUDIO_DIR, code, f))).slice(0, 20),
      dictated: !!a.dictated, typed: !!a.typed,
    };
  });
  return out;
}
const publicView = (p) => ({ code: p.code, firstName: p.firstName || "", listed: !!p.listed, orderIndex: p.orderIndex });

async function participantApi(req, res, pathname, query) {
  if (pathname === "/api/participant" && req.method === "GET") {
    const p = store.byCode(query.get("p"));
    if (!p) return sendJson(res, 404, { error: "unknown_code" });
    return sendJson(res, 200, { participant: publicView(p), progress: progressOf(p), survey: surveyView(p), panel: panelView(p) });
  }
  if (pathname === "/api/survey/audio" && req.method === "POST") {
    const p = store.byCode(query.get("p"));
    const q = String(query.get("q") || "");
    if (!p || !/^[a-z0-9_-]{1,40}$/i.test(q)) return sendJson(res, 404, { error: "unknown" });
    const ext = AUDIO_TYPES[String(req.headers["content-type"] || "").split(";")[0].trim()] || ".webm";
    const buf = await readRaw(req, 30e6).catch(() => null);
    if (!buf || !buf.length) return sendJson(res, 413, { error: "too_large_or_empty" });
    const dir = path.join(AUDIO_DIR, p.code);
    fs.mkdirSync(dir, { recursive: true });
    const file = q.toLowerCase() + "-" + Date.now() + ext;
    fs.writeFileSync(path.join(dir, file), buf);
    return sendJson(res, 200, { file });
  }
  const body = await readBody(req, 1e6).catch((e) => ({ __err: e.message }));
  if (body.__err) return sendJson(res, 400, { error: body.__err });

  if (pathname === "/api/participant/identify" && req.method === "POST") {
    const p = store.identify(body.email);
    if (!p) return sendJson(res, 400, { error: "invalid_email" });
    return sendJson(res, 200, { participant: publicView(p), progress: progressOf(p), survey: surveyView(p), panel: panelView(p) });
  }
  if (pathname === "/api/survey" && req.method === "POST") {
    const p = store.byCode(body.p);
    if (!p) return sendJson(res, 404, { error: "unknown_code" });
    const prev = p.survey || {};
    const survey = { answers: cleanAnswers(body.answers, p.code), startedAt: prev.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(), submittedAt: prev.submittedAt || (body.submit ? new Date().toISOString() : null) };
    // a recording can finish uploading just after submit: keep any file the earlier save had
    Object.keys(prev.answers || {}).forEach((id) => {
      const a = survey.answers[id], b = prev.answers[id];
      if (a && b) a.recordings = Array.from(new Set(b.recordings.concat(a.recordings)));
    });
    store.update(p.code, { survey });
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/panel" && req.method === "POST") {
    const p = store.byCode(body.p);
    if (!p) return sendJson(res, 404, { error: "unknown_code" });
    const prev = p.panel || {};
    const st = body.state || {};
    const ids = (xs, n) => (Array.isArray(xs) ? xs : []).filter((x) => typeof x === "string" && /^[a-z0-9_-]{1,40}$/i.test(x)).slice(0, n || 60);
    const comments = cleanAnswers(st.comments, p.code);
    const state = {
      order: ids(st.order), stars: ids(st.stars, 10),
      custom: (Array.isArray(st.custom) ? st.custom : []).slice(0, 20)
        .filter((c) => c && /^custom-\d{1,3}$/.test(c.id)).map((c) => ({ id: c.id, name: String(c.name || "").slice(0, 80), desc: String(c.desc || "").slice(0, 400) })),
      comments, general: cleanAnswers({ general: st.general }, p.code).general || null,
    };
    // a recording can finish uploading just after a save: keep files the earlier save had
    const old = (prev.state && prev.state.comments) || {};
    Object.keys(old).forEach((id) => { if (comments[id]) comments[id].recordings = Array.from(new Set(old[id].recordings.concat(comments[id].recordings))); });
    if (prev.state && prev.state.general && state.general) state.general.recordings = Array.from(new Set(prev.state.general.recordings.concat(state.general.recordings)));
    store.update(p.code, { panel: { state, startedAt: prev.startedAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
      submittedAt: prev.submittedAt || (body.submit ? new Date().toISOString() : null) } });
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/participant/update" && req.method === "POST") {
    const p = store.byCode(body.p);
    if (!p) return sendJson(res, 404, { error: "unknown_code" });
    if (typeof body.firstName === "string") store.update(p.code, { firstName: body.firstName.trim().slice(0, 60) });
    if (Number.isInteger(body.orders) && body.orders > 0) store.assignOrder(p.code, body.orders);
    return sendJson(res, 200, { participant: publicView(store.byCode(p.code)) });
  }
  if (pathname === "/api/events" && req.method === "POST") {
    const p = store.byCode(body.p);
    if (!p) return sendJson(res, 404, { error: "unknown_code" });
    const events = (Array.isArray(body.events) ? body.events : []).slice(0, 1000)
      .filter((e) => e && typeof e.type === "string")
      .map((e) => { const o = {}; Object.keys(e).slice(0, 20).forEach((k) => { const v = e[k]; o[k] = typeof v === "string" ? v.slice(0, 4000) : v; }); return o; });
    if (events.length) store.appendEvents(p.code, events);
    return sendJson(res, 200, { ok: true, stored: events.length });
  }
  return sendJson(res, 404, { error: "not_found" });
}

/* ---------------- researcher dashboard ---------------- */

function summaries() {
  return store.all().map((p) => metrics.summarize(p, store.readEvents(p.code)));
}
const lite = (s) => Object.assign({}, s, { calls: s.calls.map((c) => Object.assign({}, c, { transcript: undefined, steps: undefined, features: undefined })) });

async function adminApi(req, res, pathname, query) {
  if (pathname === "/api/admin/login" && req.method === "POST") {
    if (!auth.enabled) return sendJson(res, 503, { error: "no_researchers_configured" });
    const body = await readBody(req, 1e4).catch(() => ({}));
    const name = auth.check(body.name, body.password);
    if (!name) return sendJson(res, 401, { error: "wrong_name_or_password" });
    return sendJson(res, 200, { name }, { "Set-Cookie": auth.cookieFor(name, isHttps(req)) });
  }
  if (pathname === "/api/admin/logout" && req.method === "POST") {
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": auth.clearCookie() });
  }
  const me = auth.who(req);
  if (pathname === "/api/admin/me") return sendJson(res, 200, { name: me, configured: auth.enabled, label: SIM_LABEL });
  if (!me) return sendJson(res, 401, { error: "sign_in" });

  if (pathname === "/api/admin/overview" && req.method === "GET") {
    const all = summaries();
    return sendJson(res, 200, { overview: metrics.overview(all), participants: all.map(lite) });
  }
  if (pathname === "/api/admin/participant" && req.method === "GET") {
    const p = store.byCode(query.get("code"));
    if (!p) return sendJson(res, 404, { error: "unknown_code" });
    const events = store.readEvents(p.code);
    return sendJson(res, 200, { summary: metrics.summarize(p, events), events });
  }
  if (pathname === "/api/admin/invite" && req.method === "POST") {
    const body = await readBody(req, 1e6).catch(() => ({}));
    const r = store.invite(body.emails);
    console.log(`${me} invited ${r.added.length} participant(s)`);
    const brief = (p) => ({ code: p.code, email: p.email, firstName: p.firstName || "" });
    return sendJson(res, 200, { added: r.added.map(brief), updated: r.updated.map(brief), skipped: r.skipped });
  }
  if (pathname === "/api/admin/remove" && req.method === "POST") {
    const body = await readBody(req, 1e5).catch(() => ({}));
    const codes = (Array.isArray(body.codes) ? body.codes : [body.code]).filter(Boolean).slice(0, 1000);
    const removed = codes.filter((c) => store.remove(c));
    if (removed.length) console.log(`${me} deleted ${removed.length} participant(s): ${removed.join(", ")}`);
    return sendJson(res, removed.length ? 200 : 404, { ok: removed.length > 0, removed });
  }
  if (pathname === "/api/admin/audio" && req.method === "GET") {
    const p = store.byCode(query.get("code"));
    const file = String(query.get("file") || "");
    if (!p || !FILE_RE.test(file)) return sendJson(res, 404, { error: "not_found" });
    const full = path.join(AUDIO_DIR, p.code, file);
    let stat;
    try { stat = fs.statSync(full); } catch { return sendJson(res, 404, { error: "not_found" }); }
    const type = AUDIO_MIME[path.extname(file)] || "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) { res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end(); }
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": "private, no-store" });
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${p.code}-${file}"` });
    return fs.createReadStream(full).pipe(res);
  }
  if (pathname === "/api/admin/study" && req.method === "GET") return sendJson(res, 200, study.definitions());
  // a researcher's call on how an anchor question went (overrides the automatic guess)
  if (pathname === "/api/admin/code" && req.method === "POST") {
    const body = await readBody(req, 1e5).catch(() => ({}));
    const p = store.byCode(body.code);
    if (!p) return sendJson(res, 404, { error: "unknown_code" });
    const key = Number(body.n) + ":" + String(body.anchor || "").slice(0, 10);
    const coding = Object.assign({}, p.coding);
    if (!body.outcome && !body.note) delete coding[key];
    else coding[key] = { outcome: study.OUTCOMES.includes(body.outcome) ? body.outcome : null, note: String(body.note || "").slice(0, 2000), by: me, at: new Date().toISOString() };
    store.update(p.code, { coding });
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/admin/baseline" && req.method === "GET") {
    const b = baseline.get();
    if (!b) return sendJson(res, 200, { baseline: null });
    const values = {};   // distinct call-type values, so they can be matched to the customers
    if (b.mapping.type != null) b.rows.forEach((r) => { const v = String(r[b.mapping.type] || "").trim(); if (v) values[v] = (values[v] || 0) + 1; });
    return sendJson(res, 200, {
      baseline: { name: b.name, uploadedAt: b.uploadedAt, by: b.by, headers: b.headers, rowCount: b.rows.length, sample: b.rows.slice(0, 5), mapping: b.mapping,
        typeValues: Object.keys(values).sort((x, y) => values[y] - values[x]).slice(0, 60).map((v) => ({ value: v, count: values[v] })) },
      compare: compareBaseline(b, summaries()),
    });
  }
  if (pathname === "/api/admin/baseline" && req.method === "POST") {
    const body = await readBody(req, 25e6).catch((e) => ({ __err: e.message }));
    if (body.__err) return sendJson(res, 413, { error: "file_too_large" });
    try {
      if (body.csv != null) { baseline.upload(body.name, body.csv, me); console.log(`${me} uploaded a baseline (${body.name})`); }
      else if (body.mapping) baseline.setMapping(body.mapping);
      else if (body.clear) baseline.clear();
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === "/api/admin/export.csv" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="participants-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    return res.end(metrics.csvRows(summaries(), { panelCurrent: PANEL_CURRENT }));
  }
  if (pathname === "/api/admin/export.json" && req.method === "GET") {
    const all = store.all().map((p) => ({ participant: p, events: store.readEvents(p.code) }));
    res.writeHead(200, {
      "Content-Type": MIME[".json"], "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="study-data-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    return res.end(JSON.stringify(all, null, 2));
  }
  return sendJson(res, 404, { error: "not_found" });
}

/* ---------------- legacy session logs ---------------- */

async function saveSession(req, res) {
  const log = await readBody(req, 5e6).catch(() => null);
  if (!log) return sendJson(res, 400, { error: "invalid_json" });
  const safe = (s) => String(s || "").replace(/[^\w.-]+/g, "_").slice(0, 60);
  const name = `${safe(log.participantId) || "anon"}_${safe(log.sessionId)}.json`;
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFile(path.join(SESSIONS_DIR, name), JSON.stringify(log, null, 2), (err) => {
    if (err) return sendJson(res, 500, { error: "write_failed" });
    sendJson(res, 200, { saved: `sessions/${name}` });
  });
}

function listSessions(req, res) {
  const key = new URL(req.url, "http://x").searchParams.get("key") || "";
  const ok = auth.who(req) || (RESEARCHER_KEY && key.length === RESEARCHER_KEY.length &&
    crypto.timingSafeEqual(Buffer.from(key), Buffer.from(RESEARCHER_KEY)));
  if (!ok) return sendJson(res, 403, { error: "forbidden" });
  fs.readdir(SESSIONS_DIR, (err, names) => {
    const logs = (err ? [] : names.filter((n) => n.endsWith(".json") && n !== "participants.json" && n !== "baseline.json").sort())
      .map((n) => { try { return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, n), "utf8")); } catch { return null; } })
      .filter(Boolean);
    res.writeHead(200, {
      "Content-Type": MIME[".json"], "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="sessions-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.end(JSON.stringify(logs, null, 2));
  });
}

/* ---------------- static files ---------------- */

function serveStatic(req, res, pathname) {
  if (pathname === "/admin") { res.writeHead(302, { Location: "/admin/" }); return res.end(); }
  const urlPath = decodeURIComponent(pathname);
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
    const headers = { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" };
    if (urlPath.startsWith("/admin")) Object.assign(headers, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    res.writeHead(200, headers);
    res.end(data);
  });
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const pathname = url.pathname;
      if (pathname === "/api/config" && req.method === "GET") {
        return sendJson(res, 200, { tokenAuth: Boolean(API_KEY), label: SIM_LABEL });
      }
      if (pathname === "/api/conversation-token" && req.method === "GET") return conversationToken(req, res);
      if (pathname.startsWith("/api/participant") || pathname === "/api/events" || pathname.startsWith("/api/survey") || pathname === "/api/panel") return await participantApi(req, res, pathname, url.searchParams);
      if (pathname.startsWith("/api/admin/")) return await adminApi(req, res, pathname, url.searchParams);
      if (pathname === "/api/sessions" && req.method === "POST") return saveSession(req, res);
      if (pathname === "/api/sessions" && req.method === "GET") return listSessions(req, res);
      if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, pathname);
      res.writeHead(405);
      res.end();
    } catch (err) {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: "server_error" });
    }
  })
  .listen(PORT, () => {
    console.log(`Call center simulator running at http://localhost:${PORT}`);
    console.log(API_KEY ? "Agents connect with WebRTC tokens (API key set)" : "No API key set: agents must be public");
    console.log(auth.enabled ? "Researcher dashboard at /admin" : "Dashboard disabled: set RESEARCHERS=\"name:password, …\" to enable /admin");
  });
