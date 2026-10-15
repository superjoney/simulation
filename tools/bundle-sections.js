// Bundles the section handbacks in prototypes-src/sections/<name>/ into a prototype export, the way the
// design kit's build.py does: each section's .css files become <style id="sec-<name>-styles"> and each
// .js file (except test-*.js) becomes <script id="sec-<name>-<file>">, placed right after the tab shell.
//   node tools/bundle-sections.js <from.html> <to.html>
// The source export is never modified. Prints the decoded template path for the section tests (TM_TB).
const fs = require("fs");
const path = require("path");

const [from, to] = process.argv.slice(2);
if (!from || !to) throw new Error("usage: node tools/bundle-sections.js <from.html> <to.html>");
if (path.resolve(from) === path.resolve(to)) throw new Error("refusing to overwrite the source export");
const SECTIONS = path.join(__dirname, "..", "prototypes-src", "sections");
const RE = /(<script type="__bundler\/template">)([\s\S]*?)(<\/script>)/;

const src = fs.readFileSync(from, "utf8");
const m = src.match(RE);
if (!m) throw new Error("Bundled template not found in " + from);
let t = JSON.parse(m[2]);

const anchor = '<script id="tm-tm-shell-script">';
const a = t.indexOf(anchor), b = a < 0 ? -1 : t.indexOf("</script>", a);
if (a < 0 || b < 0) throw new Error("tab shell (tm-tm-shell-script) not found");
let block = "";
for (const name of fs.readdirSync(SECTIONS).sort()) {
  const dir = path.join(SECTIONS, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  if (t.includes(`id="sec-${name}-`)) throw new Error(`section ${name} is already in ${from}`);
  const files = fs.readdirSync(dir).sort();
  const css = files.filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/\s+$/, "")).join("\n");
  if (/<\/style/i.test(css)) throw new Error(`${name}: CSS contains </style`);
  if (css) block += `\n<style id="sec-${name}-styles">\n${css}\n</style>`;
  for (const f of files.filter((f) => f.endsWith(".js") && !f.startsWith("test-"))) {
    const js = fs.readFileSync(path.join(dir, f), "utf8").replace(/\s+$/, "");
    if (/<\/script|<!--/i.test(js)) throw new Error(`${name}/${f}: contains </script or <!--`);
    block += `\n<script id="sec-${name}-${f.replace(/\.js$/, "")}">\n${js}\n</script>`;
  }
  console.log("bundled section", name);
}
const end = b + "</script>".length;
t = t.slice(0, end) + block + t.slice(end);

const enc = JSON.stringify(t).replace(/\//g, "\\u002F");
fs.writeFileSync(to, src.replace(RE, (_, x, __, y) => x + enc + y));
const decoded = path.join(require("os").tmpdir(), path.basename(to, ".html") + ".template.html");
fs.writeFileSync(decoded, t);
console.log("wrote", to, "· decoded template for tests:", decoded);
