// Builds one prototype per client from the original export.
//   node tools/build-prototypes.js
// Reads prototypes-src/rail-snapshot-2.html (never modified) and writes public/prototypes/<client>.html.
// Every edit is an exact find-and-replace that must match the expected number of times, so a new
// export that changes the code fails loudly here instead of silently showing the wrong data.

const fs = require("fs");
const path = require("path");
const CLIENTS = require("./clients");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "prototypes-src", "rail-snapshot-2.html");
const OUT_DIR = path.join(ROOT, "public", "prototypes");
const RUNTIME = fs.readFileSync(path.join(__dirname, "sim-client-runtime.js"), "utf8");

const TEMPLATE_RE = /(<script type="__bundler\/template">)([\s\S]*?)(<\/script>)/;

function replace(t, find, repl, expected = 1) {
  const n = t.split(find).length - 1;
  if (expected === "any" ? n < 1 : n !== expected) {
    throw new Error(`Expected ${expected} match(es), found ${n}: ${find.slice(0, 120)}`);
  }
  return t.split(find).join(repl);
}

function between(t, start, end, repl) {
  const i = t.indexOf(start);
  const j = i < 0 ? -1 : t.indexOf(end, i + start.length);
  if (i < 0 || j < 0) throw new Error(`Block not found: ${start.slice(0, 80)}`);
  return t.slice(0, i + start.length) + repl + t.slice(j);
}

const q = (s) => JSON.stringify(s).slice(1, -1).replace(/'/g, "\\'"); // safe inside a '…' JS string

/* ---------- fixes shared by every build ---------- */
function common(t) {
  // Right panel: on laptop-width screens the shell auto-collapsed the panel and its own toggle
  // re-collapsed it straight away. Keep it open when the CR opens it, and make room for it by
  // shifting the center card left instead of centering it under the panel.
  t = replace(t,
    "var fits = railFits(vw);",
    "var centered = railFits(vw), fits = centered || vw >= CW_MIN + RAIL_W + 3 * GAP + 40;");
  t = replace(t,
    "if (!fits && !rail.classList.contains('aiqx-rail--collapsed')) { rail.classList.add('aiqx-rail--collapsed'); auto.collapsed = true; }",
    "if (!fits && !auto.userOpened && !rail.classList.contains('aiqx-rail--collapsed')) { rail.classList.add('aiqx-rail--collapsed'); auto.collapsed = true; }");
  t = replace(t,
    "var cw = open ? Math.max(CW_MIN, Math.min(CW, vw - 2 * (RAIL_W + GAP))) : CW;",
    "var tight = open && !centered;\n    if (D.body) D.body.classList.toggle('shv-tight', tight);\n" +
    "    var cw = !open ? CW : tight ? Math.max(CW_MIN, Math.min(CW, vw - RAIL_W - 3 * GAP - 40)) : Math.max(CW_MIN, Math.min(CW, vw - 2 * (RAIL_W + GAP)));");
  t = replace(t,
    "auto.userClosed = !!closed; auto.collapsed = false;",
    "auto.userClosed = !!closed; auto.userOpened = !closed; auto.collapsed = false;");
  t = replace(t,
    "</style>\n<script id=\"shell-versions-shell\">",
    "/* simulator build · panel open on a laptop: center card sits left of it */\n" +
    "body.shv-rc.shv-tight div:has(> .dv-card){padding-right:" + (371 + 13 + 22) + "px!important}\n" +
    "</style>\n<script id=\"shell-versions-shell\">");

  // Hooks that read the injected client profile (window.SIM_CLIENT)
  t = replace(t,
    "function contextHtml(withLoan, refined) {",
    "function contextHtml(withLoan, refined) {\n" +
    "    if (W.SIM_CLIENT && W.SIM_CLIENT.context) return W.SIM_CLIENT.context({ ic: ic, dl: dl, disc: disc, share: function (k, what) { return '<label class=\"cx-share\"><input type=\"checkbox\" data-shv-share=\"' + k + '\"' + (SHARE[k] ? ' checked' : '') + ' aria-label=\"Share with client: ' + what + '\"><span>Share with client</span></label>'; } });");
  t = replace(t,
    "var CHUNKS = [",
    "var CHUNKS = (window.SIM_CLIENT && window.SIM_CLIENT.summary) || [");
  t = replace(t,
    "if (typeof W.pgCommit === 'function') W.pgCommit('e03');",
    "if (typeof W.pgCommit === 'function') W.pgCommit((W.SIM_CLIENT && W.SIM_CLIENT.playbook) || 'e03');");
  return t;
}

/* ---------- client data ---------- */
function forClient(t, id, c) {
  const A = c.addr, S = CLIENTS.ADDR_SRC;
  const first = (n) => n.split(" ")[0];
  const emailOf = (n) => n.toLowerCase().split(" ").join(".") + "@example.com";

  // inject the client profile first thing in <head>
  const data = {
    id, playbook: c.playbook, autopay: c.autopay, summary: c.summary, ctx: c.ctx,
  };
  t = replace(t, "<html><head>", "<html><head>\n<script id=\"sim-client\">" +
    RUNTIME.replace("__SIM_CLIENT_DATA__", JSON.stringify(data)) + "</script>");

  // identity check module
  t = between(t, "var CLIENT = {", "\n  var DISCLOSURE",
    ` first: '${q(c.first)}', full: '${q(c.legal)}', ssn4: '${c.ssn4}', lastPay: { amount: '${c.lastPay.amount}', date: '${c.lastPay.date}' },\n` +
    `    zip: '${A.zip}', phone: '${q(c.phone)}', address: '${q(`${A.street}, ${A.city}, ${A.state} ${A.zip}`)}', email: '${c.email}' };\n` +
    `  var COCLIENT = { first: '${q(first(c.household.priya))}', full: '${q(c.household.priya)}', ssn4: '8830' };\n` +
    `  var AUTH3P = { first: '${q(c.auth3p.first)}', full: '${q(c.auth3p.full)}', relationship: '${q(c.auth3p.relationship)}', by: '${q(c.full)}', date: 'Jun 12, 2026', method: 'Verbal', length: '12 months', expires: 'Jun 12, 2027' };`);

  // primary loan record: payments and seeded cases
  t = replace(t,
    "lastPayment: '$1,859.02', lastPaymentSub: 'Received Sept 1', nextPayment: '$1,739.02', nextPaymentSub: 'Due Oct 1 · scheduled Sept 23', autopay: true, fees: ''",
    `lastPayment: '${c.lastPay.amount}', lastPaymentSub: 'Received ${c.lastPay.short}', nextPayment: '${c.nextPay.amount}', nextPaymentSub: 'Due ${c.nextPay.short}${c.autopay ? " · autopay" : ""}', autopay: ${!!c.autopay}, fees: ''`);
  t = between(t, "/* seeded \"Open and recent cases\" (tabs.js renders these) */\n      cases: [", "\n      ],\n      full:",
    "\n" + c.cases.map((k) => `        { no: '${k[0]}', name: '${q(k[1])}', dept: '${q(k[2])}', group: '${q(k[3])}', rt: '${q(k[4])}', status: '${k[5]}', opened: '${k[6]}' }`).join(",\n"));

  // address (longest forms first)
  const line = `${A.street}, ${A.city}, ${A.state}`;
  t = replace(t, `{ street: '${S.street}', unit: '', city: '${S.city}', state: '${S.state}', zip: '${S.zip}' }`,
    `{ street: '${q(A.street)}', unit: '', city: '${q(A.city)}', state: '${A.state}', zip: '${A.zip}' }`);
  t = replace(t, `${S.street}, ${S.city}, ${S.state}, ${S.zip}`, `${line}, ${A.zip}`, "any");
  t = replace(t, `${S.street}, ${S.city}, ${S.state} ${S.zip}`, `${line} ${A.zip}`, "any");
  t = replace(t, `${S.street}, ${S.city}, ${S.state}`, line, "any");
  t = replace(t, S.street, A.street, "any");

  // household and contact details
  t = replace(t, "'Angela Johnson'", `'${q(c.household.angela)}'`, "any");
  t = replace(t, "'Derek Johnson'", `'${q(c.household.derek)}'`, "any");
  t = replace(t, "'Priya Nair'", `'${q(c.household.priya)}'`, "any");
  t = replace(t, "angela.j@example.com", emailOf(c.household.angela), "any");
  t = replace(t, "priya.n@example.com", emailOf(c.household.priya), "any");
  t = replace(t, "marcus.j@example.com", c.email, "any");
  t = replace(t, "m•••@example.com", c.email[0] + "•••@example.com", "any");
  t = replace(t, "(444) 222 – 8888", c.phone, "any");
  t = replace(t, "456123789", c.loan, "any");
  t = replace(t, "Marcus Johnson", c.full, "any");
  if (c.first !== "Marcus") t = replace(t, "Marcus", c.first, "any");

  for (const [find, repl] of c.i02 || []) t = replace(t, find, repl);
  return t;
}

function check(t, id, c) {
  const leftovers = ["Johnson", "Priya", "Dana Reyes", "4471", "(444) 222", "456123789"]
    .concat(c.first === "Marcus" ? [] : ["Marcus"]);
  // classic/snapshot-only markup that rail-snapshot-2 hides is allowed to keep the old copy
  const visible = t.replace(/<x-dc[\s\S]*?<\/x-dc>/g, "");
  const found = leftovers.filter((k) => visible.includes(k));
  if (found.length) console.warn(`  ${id}: still contains ${found.join(", ")}`);
}

function encode(t) {
  return JSON.stringify(t).replace(/<\//g, "<\\u002F").replace(/<!--/g, "<\\u0021--");
}

const src = fs.readFileSync(SRC, "utf8");
const m = src.match(TEMPLATE_RE);
if (!m) throw new Error("Bundled template not found in " + SRC);
const base = common(JSON.parse(m[2]));

for (const id of Object.keys(CLIENTS).filter((k) => k !== "ADDR_SRC")) {
  const c = CLIENTS[id];
  const t = forClient(base, id, c);
  check(t, id, c);
  let html = src.replace(TEMPLATE_RE, (_, a, __, b) => a + encode(t) + b);
  html = replace(html, "<title>Client Overview — Marcus Johnson</title>", `<title>Client Overview — ${c.full}</title>`);
  fs.writeFileSync(path.join(OUT_DIR, `${id}.html`), html);
  console.log(`built public/prototypes/${id}.html · ${c.full} · ${c.title}`);
}
