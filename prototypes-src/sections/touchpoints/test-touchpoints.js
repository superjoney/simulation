// sections/touchpoints test: contract, chips, sort, paging, expand detail, typeahead, inline artifacts, loan switch, copy rules.
// Run from kit/: node sections/touchpoints/test-touchpoints.js | tail -1   → TOUCHPOINTS PROBLEMS 0
const fs = require('fs'), path = require('path');
const t = fs.readFileSync(process.env.TM_TB || path.join(__dirname, '..', '..', 'template_built.html'), 'utf8');
let P = 0; const ok = (c, m) => { if (!c) { P++; console.log('FAIL', m); } };
const g = id => (t.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>')) || [])[1];
ok(!!g('sec-touchpoints-f-tp'), 'section script bundled as sec-touchpoints-f-tp');
ok(/<style id="sec-touchpoints-styles">[\s\S]*\.tp-tbl/.test(t), 'section styles bundled');

// --- tiny DOM stub (as in flows-shell.js) ---
const L = {};
function mk(id) {
  return { id, attrs: {}, _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = String(v); },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
    contains: () => true, querySelector: () => null, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } };
}
global.document = { readyState: 'complete', body: mk('body'), getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
  activeElement: null, addEventListener: (e, f) => (L[e] = L[e] || []).push(f) };
global.window = global; global.setTimeout = () => 0; global.console = console;
new Function(g('tm-tm-core-script'))();
new Function(g('sec-touchpoints-f-tp'))();
const TM = window.TM, A = window.tpAct, S = window.tpState;
ok(TM.hasFeature('tab:touchpoints'), 'registers tab:touchpoints');

const el = mk('tm-panel-touchpoints');
TM.mount('tab:touchpoints', el, { loan: TM.loan(), tab: 'touchpoints' });
const H = () => el.innerHTML;
const visible = h => h.replace(/<[^>]+>/g, ' ');
function balanced(h, m) {
  const st = []; const re = /<\/?([a-z0-9]+)[^>]*?>/gi; let x; const voids = /^(br|img|input|hr|meta|use|link)$/i;
  while ((x = re.exec(h))) { const tag = x[1].toLowerCase(); if (voids.test(tag) || /\/>$/.test(x[0])) continue; if (x[0][1] === '/') { if (st.pop() !== tag) { ok(false, 'unbalanced </' + tag + '> ' + m); return; } } else st.push(tag); }
  ok(st.length === 0, 'balanced tags ' + m + (st.length ? ' open: ' + st.join(',') : ''));
}
function clean(m) {
  const h = H(); balanced(h, m);
  ok(!/undefined|NaN|\[object/.test(h), 'no undefined/NaN ' + m);
  ok(!/\b(customer|borrower)s?\b/i.test(visible(h)), 'no customer/borrower copy ' + m);
}

// --- list view ---
ok(/Touchpoint history · Marcus Johnson/.test(H()), 'title with client name');
const chips = [...H().matchAll(/data-tp="chip" data-v="([a-z]+)"[^>]*>([^<]+)</g)].map(m => m[2]);
ok(chips.join('|') === 'All|Calls|Email|Letter|Payment|Cases', 'chips: ' + chips.join('|'));
ok(!/>Inbound<|>Outbound</.test(H()), 'no Inbound/Outbound chips');
ok(/role="combobox"/.test(H()) && /role="listbox"/.test(H()), 'search is a combobox + listbox');
ok(/>Date<svg/.test(H()) && />Touchpoint</.test(H()) && />Agent \/ System</.test(H()), 'table headers');
ok(/aria-sort="descending"/.test(H()), 'date sorted newest first');
ok(!/class="tp-row[\s\S]*?<\/tr>/.test('') , 'noop');
const firstRows = H().split('<tbody>')[1] || '';
ok(!/tp-card-i/.test(firstRows) && !/#(phone|mail|credit_card|folder_copy|description)"/.test(firstRows), 'no icons in list rows');
ok(/IB Call · Escrow shortage and payment increase/.test(H()), 'IB prefix on inbound call');
clean('list');

// paging: primary has > 10 rows
const v = S.view(); ok(v.list.length > S.PAGE && v.pages === Math.ceil(v.list.length / S.PAGE) && v.shown.length === S.PAGE, 'paged 10 per page (' + v.list.length + ' rows)');
A.page(2); ok(S.state().page === 2 && new RegExp('Page 2 of ' + v.pages).test(H()), 'page 2'); A.page(1);

// sort
const d0 = S.view().list[0].date; A.sort(); ok(S.state().dir === 'asc' && S.view().list[0].date <= d0 && /aria-sort="ascending"/.test(H()), 'sort toggles to oldest first'); A.sort();

// chips (single select)
A.chip('calls'); let L1 = S.view().list;
ok(L1.length && L1.every(r => ['call', 'ivr', 'chat', 'sms'].includes(r.channel)), 'Calls chip = calls, IVR, chat, SMS');
ok(L1.some(r => r.direction === 'in') && L1.some(r => r.channel === 'sms' && r.direction === 'out'), 'Calls holds inbound and outbound');
ok(/OB SMS · Payment confirmation/.test(H()), 'OB prefix shown');
A.chip('letter'); ok(S.view().list.every(r => r.channel === 'letter') && /aria-pressed="true"[^>]*>Letter|data-v="letter"[^>]*aria-pressed="true"/.test(H()), 'Letter chip selected');
A.chip('payment'); ok(S.view().list.every(r => r.channel === 'payment'), 'Payment chip');
A.chip('case'); ok(S.view().list.length === 3 && S.view().list.every(r => r.kase), 'Cases chip = 3 seeded cases');
ok(/nova-tag--info tp-tag">In Progress/.test(H()) && /nova-tag nova-tag--small tp-tag">Resolved/.test(H()), 'case status tags (open = info, resolved = neutral)');
A.chip('email'); ok(S.view().list.every(r => r.channel === 'email'), 'Email chip');
A.chip('all'); ok(S.state().chip === 'all', 'All chip');
clean('chips');

// expand: case
A.chip('case'); A.toggle('case-CS-2026-3861');
ok(/aria-expanded="true"/.test(H()) && /Handled by <strong>Tanya Burton/.test(H()), 'case expands with Handled by');
ok(/>Artifacts</.test(H()) && /Case CS-2026-3861 summary/.test(H()), 'case artifact card');
clean('case expanded');
// expand: payment
A.chip('payment'); A.toggle('p13');
ok(/Autopay/.test(H()) && /On time/.test(H()) && />Fund allocation</.test(H()) && />Payment details</.test(H()), 'payment detail sections');
ok(/Total<\/td><td class="tp-num">\$1,859\.02/.test(H()), 'fund allocation total');
ok(/tp-gi--ok"><dt>Cleared/.test(H()), 'cleared date in green');
ok(/>Linked communications</.test(H()) && /OB SMS · Payment confirmation/.test(H()), 'linked communication card');
ok(/Needs SME/.test(H()), 'invented comment code flagged Needs SME');
clean('payment expanded');
// alloc sums match
S.rows().filter(r => r.pay && r.pay.alloc).forEach(r => {
  const sum = r.pay.alloc.reduce((a, x) => a + parseFloat(x[1].replace(/[$,]/g, '')), 0);
  ok(Math.abs(sum - parseFloat(r.pay.amount.replace(/[$,]/g, ''))) < 0.005, 'allocation adds up ' + r.id);
});
// jump from a linked card to another type switches to All
A.jump('p13s'); ok(S.state().chip === 'all' && S.state().expanded.p13s, 'linked card jumps (chip → All, row expanded)');
// collapse
A.toggle('p13s'); ok(!S.state().expanded.p13s, 'collapse'); A.page(1);
// email thread + codes
A.jump('p08'); ok(/>Email thread</.test(H()), 'email thread');
A.jump('p07'); ok(/>Comment codes</.test(H()) && /TTMR/.test(H()), 'comment codes');
clean('mixed expanded');

// --- typeahead ---
const m1 = S.matches('refund'); ok(m1.length >= 1 && m1.some(r => r.id === 'p17'), 'typeahead finds refund letter');
ok(S.matches('').length === 0, 'empty query has no options');
ok(S.matches('zzzz-nothing').length === 0, 'no match');
ok(S.matches('burton').some(r => r.id === 'p07'), 'matches agent name');
A.chip('payment'); A.page(1); A.pick('p17');
ok(S.state().pick === 'p17' && S.state().chip === 'all' && S.state().expanded.p17 && /tp-row--picked/.test(H()), 'pick: chip → All, row expanded and marked');
ok(S.state().page === Math.floor(S.view().list.findIndex(r => r.id === 'p17') / S.PAGE) + 1, 'pick pages to the row');
ok(S.state().q === 'Letter · Escrow refund check 0041887', 'input shows picked title');
A.qclear(); ok(!S.state().pick && S.state().q === '', 'clear search');
// the input is never re-rendered by typing
const before = H(); A.typed('escrow'); ok(H() === before && S.TA.items.length > 0, 'typing updates options only, never re-renders');
A.qclear();

// --- inline artifact with breadcrumbs ---
A.chip('letter'); A.toggle('p12'); A.art('p12|d05');
ok(/data-tp-view="art"/.test(H()) && /aria-label="Breadcrumb"/.test(H()), 'artifact opens inline with breadcrumb');
ok(/>Touchpoint history<\/button>/.test(H()) && />Letter · Escrow analysis statement<\/button>/.test(H()) && /aria-current="page">Annual escrow analysis statement/.test(H()), 'breadcrumb trail');
ok(/\$442\.31/.test(H()) && /Up \$33\.12/.test(H()), 'artifact preview content');
ok(!/data-tp="send"/.test(H()), 'read only: no send');
clean('artifact');
A.crumbRow(); ok(/data-tp-view="list"/.test(H()) && S.state().chip === 'letter' && S.state().expanded.p12, 'crumb back to touchpoint keeps chip + expanded row');
A.art('p12|d07'); A.crumbList(); ok(/data-tp-view="list"/.test(H()) && !S.state().art, 'crumb back to list');
// artifact view survives a tab re-mount
A.art('p12|d05'); TM.mount('tab:touchpoints', el, { loan: TM.loan() }); ok(/data-tp-view="art"/.test(H()), 'artifact view restored on re-mount'); A.crumbList();
// every artifact id resolves
S.rows().forEach(r => r.docs.forEach(d => ok(!!S.ART[d], 'artifact exists ' + r.id + ':' + d)));

// --- keyboard ---
const kd = (target, key) => L.keydown.forEach(f => f({ key, target, preventDefault() {} }));
const exp = { getAttribute: k => (k === 'data-v' ? 'p14' : null), closest: () => ({}), classList: { contains: c => c === 'tp-exp' } };
A.chip('all'); kd(exp, 'Enter'); ok(S.state().expanded.p14, 'Enter on a row toggles it');

// --- other loans ---
Object.keys(TM.LOANS).forEach(n => {
  if (n === TM.PRIMARY) return;
  TM.selectLoan(n); TM.mount('tab:touchpoints', el, { loan: TM.loan() });
  ok(S.loan === n && S.view().list.length > 0, 'rows for ' + n);
  ok(H().includes('Touchpoint history · ' + TM.loan().client), 'title client for ' + n);
  S.view().list.forEach(r => A.toggle(r.id)); clean('loan ' + n);
});
TM.selectLoan(TM.PRIMARY); TM.mount('tab:touchpoints', el, { loan: TM.loan() });
ok(S.state().chip === 'all', 'state kept per loan');

// --- new case on this call appears ---
TM.loan().cases.unshift({ no: 'CS-2026-5177', name: 'Escrow shortage', dept: 'Account Services', group: 'Escrow', rt: 'Escrow Shortage', status: 'Open', opened: 'Oct 5, 2026', fresh: true });
TM.emit('case', { id: 'CS-2026-5177' }, TM.loan());
A.chip('case'); ok(S.view().list[0].id === 'case-CS-2026-5177', 'case created on this call sorts first');
TM.loan().cases.shift();

// static checks on the source
const src = g('sec-touchpoints-f-tp'), css = (t.match(/<style id="sec-touchpoints-styles">([\s\S]*?)<\/style>/) || [])[1] || '';
ok(!/localStorage/.test(src), 'no localStorage');
ok(!/#[0-9a-f]{3,6}\b(?![^(]*\))/i.test(css.replace(/var\([^)]*\)/g, '')), 'colors only via Nova tokens (fallbacks inside var())');
css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').forEach(rule => { const sel = rule.split('{')[0].trim(); if (!sel || sel.startsWith('@')) return;
  sel.split(',').forEach(s => { s = s.trim(); if (!s || /^(to|from|\d+%)$/.test(s)) return; ok(/\.tp|\.tm-avatar\.tp-av/.test(s) && !/\.tm-tab|#pg-/.test(s), 'scoped selector: ' + s); }); });

console.log('TOUCHPOINTS PROBLEMS', P);
