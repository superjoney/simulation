// Researcher logins for the dashboard.
// RESEARCHERS="jenn:secret1, alex:secret2" — one name:password pair per researcher.
// A login sets a signed, HttpOnly cookie; changing RESEARCHERS signs everyone out.

const crypto = require("crypto");

const COOKIE = "sim_admin";
const TTL_MS = 8 * 60 * 60 * 1000;

function createAuth(spec) {
  const users = {};
  String(spec || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((pair) => {
    const i = pair.indexOf(":");
    if (i > 0) users[pair.slice(0, i).trim().toLowerCase()] = pair.slice(i + 1).trim();
  });
  const secret = crypto.createHash("sha256").update("sim-admin|" + JSON.stringify(users) + "|" + (process.env.SESSION_SECRET || "")).digest();
  const sign = (v) => crypto.createHmac("sha256", secret).update(v).digest("base64url");
  const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  function check(name, password) {
    const n = String(name || "").trim().toLowerCase();
    const want = users[n];
    return want != null && same(String(password || ""), want) ? n : null;
  }

  function cookieFor(name, secure) {
    const v = name + "." + (Date.now() + TTL_MS);
    return `${COOKIE}=${encodeURIComponent(v + "." + sign(v))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}` + (secure ? "; Secure" : "");
  }
  function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`; }

  // returns the researcher's name, or null
  function who(req) {
    const m = (req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
    if (!m) return null;
    const parts = decodeURIComponent(m[1]).split(".");
    if (parts.length !== 3) return null;
    const [name, exp, sig] = parts;
    if (!users[name] || Number(exp) < Date.now() || !same(sig, sign(name + "." + exp))) return null;
    return name;
  }

  return { enabled: Object.keys(users).length > 0, check, cookieFor, clearCookie, who };
}

module.exports = { createAuth };
