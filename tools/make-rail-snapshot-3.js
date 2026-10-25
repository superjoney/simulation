// Builds prototypes-src/rail-snapshot-3.html from rail-snapshot-2.html (never modified):
//   1 · right rail Payments card (rail-payments.js/.css)
//   2 · playbook search label and placeholder (search-bar.css)
//   3 · Escrow refund issue playbook (rr-playbook.js/.css), e11 renamed
// plus the later tweaks marked v53/v54. The change files from Oct 15 are kept as handed over in
// prototypes-src/changes/2026-10-15-rail/. Run: node tools/make-rail-snapshot-3.js
// then re-bundle the sections: node tools/bundle-sections.js prototypes-src/rail-snapshot-3.html prototypes-src/rail-snapshot-4.html
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const CHANGES = path.join(ROOT, "prototypes-src", "changes", "2026-10-15-rail");
const SRC = path.join(ROOT, "prototypes-src", "rail-snapshot-2.html");
const OUT = path.join(ROOT, "prototypes-src", "rail-snapshot-3.html");
const read = (f) => fs.readFileSync(path.join(CHANGES, f), "utf8");

const RE = /(<script type="__bundler\/template">)([\s\S]*?)(<\/script>)/;
const src = fs.readFileSync(SRC, "utf8");
const m = src.match(RE);
let t = JSON.parse(m[2]);

function rep(find, repl, n = 1) {
  const c = t.split(find).length - 1;
  if (c !== n) throw new Error(`expected ${n}, found ${c}: ${find.slice(0, 100)}`);
  t = t.split(find).join(repl);
}
const trimEnd = (s) => s.replace(/\s+$/, "");

/* ---- 1 · Right rail: Payments card ---- */
// rail-payments.js as-is, minus its ic() helper (the rail already has an identical one).
// The prototype's next due date is Oct 1 (the file says Nov 1), so that one value keeps the prototype's date.
let pay = read("rail-payments.js").split("\n")
  .filter((l) => !/^\s*function ic\(id\)/.test(l)).join("\n");
const payN = pay.split("row('Nov 1',").length - 1;
if (payN !== 1) throw new Error("Nov 1 row not found");
pay = pay.replace("row('Nov 1',", "row('Oct 1',");
rep("  /* v20 · Activity uses the Signals layout: one dot colour, smaller dots, single-line labels */",
  trimEnd(pay) + "\n  /* v20 · Activity uses the Signals layout: one dot colour, smaller dots, single-line labels */");
rep("        h += '<h4 class=\"cx-sec\"><span>Payments</span><span class=\"cx-sec-r cx-ok\">' + ic('check_circle') + 'Autopay <span class=\"cx-num\">····4399</span></span></h4>' + statsHtml(true) +",
  "        h += payCardHtml() +");
// rail-payments.css at the end of the rail's styles (shell-versions-styles)
{
  const a = t.indexOf('<style id="shell-versions-styles">');
  const b = t.indexOf("</style>", a);
  if (a < 0 || b < 0) throw new Error("shell-versions-styles not found");
  t = t.slice(0, b) + trimEnd(read("rail-payments.css")) + "\n" +
    "/* v53 · payment amounts a bit smaller */\n.cx-pay-a{font-size:15px}\n" + t.slice(b);
}

/* ---- 2 · Playbook search bar and label ---- */
rep('        <div class="pg-ta-wrap">\n          <div class="pg-ta-pill">',
  '        <div class="pg-ta-wrap">\n          <label class="pg-ta-lbl" for="pg-ta">Need something else?</label>\n          <div class="pg-ta-pill">');
rep('<input id="pg-ta" placeholder="Something else…" autocomplete="off">',
  '<input id="pg-ta" placeholder="Search playbooks" autocomplete="off">');
{
  const a = t.indexOf('<style id="pg-styles">');
  const b = t.indexOf("</style>", a);
  if (a < 0 || b < 0) throw new Error("pg-styles not found");
  t = t.slice(0, b) + trimEnd(read("search-bar.css")) + "\n" + t.slice(b);
}

/* ---- 3 · Escrow refund issue playbook ---- */
rep("    if (window.rzRender) window.rzRender(key);\n    var ta = $('pg-ta');\n    if (ta) ta.value = '';\n  }",
  "    if (window.rzRender) window.rzRender(key);\n    var ta = $('pg-ta');\n    if (ta) ta.value = '';\n    if (window.rrRender) window.rrRender(key);\n  }");
rep("    ['e11', 'Escrow refund reissue']\n  ];", "    ['e11', 'Escrow refund issue']\n  ];");
rep("'Remove escrow request', 'Escrow refund reissue'];", "'Remove escrow request', 'Escrow refund issue'];");
// follow-up: the rest of the old name (rail playbook list, guidance title, two comments)
rep("[\'e09\', \'Remove escrow request\'], [\'e11\', \'Escrow refund reissue\']\n  ];".replace(/\\'/g, "'"), "['e09', 'Remove escrow request'], ['e11', 'Escrow refund issue']\n  ];");
rep("      title: 'Escrow refund reissue',", "      title: 'Escrow refund issue',");
rep("/* ---- e11 Escrow refund reissue custom body ---- */", "/* ---- e11 Escrow refund issue custom body ---- */");
rep("     e11 · Escrow refund reissue  (S2 · find one thing)", "     e11 · Escrow refund issue  (S2 · find one thing)");
let js = read("rr-playbook.js");
const css = read("rr-playbook.css");
// v54 · "View escrow analysis" as a Nova tertiary button (was secondary with a drawn outline)
{
  const from = "'<button type=\"button\" class=\"nova-button nova-button--secondary ea-open'";
  if (js.split(from).length !== 2) throw new Error("escrow analysis button not found");
  js = js.replace(from, "'<button type=\"button\" class=\"nova-button nova-button--tertiary ea-open'");
}
if (/<\/script|<!--/i.test(js) || /<\/style/i.test(css)) throw new Error("forbidden sequence in rr files");
rep("</body></html>",
  '<style id="rr-playbook-styles">\n' + trimEnd(css) + "\n/* v53 · hide the RKT · iAssist loan · Reset flow design control */\n.rrp .pg-e11-brandbar{display:none}\n" +
  "/* v54 · View escrow analysis: tertiary, no drawn outline */\n.nova-button.ea-open,.nova-button.ea-open:focus-visible{box-shadow:none}\n</style>\n" +
  '<script id="rr-playbook-script">\n' + trimEnd(js) + "\n</script>\n</body></html>");

const enc = JSON.stringify(t).replace(/\//g, "\\u002F");
fs.writeFileSync(OUT, src.replace(RE, (_, a, __, b) => a + enc + b));
console.log("wrote", OUT, fs.statSync(OUT).size, "bytes");
