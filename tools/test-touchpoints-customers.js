// The Touchpoints section test (prototypes-src/sections/touchpoints/test-touchpoints.js), run against each
// customer's built page with that customer's own history (tools/touchpoints.js). Same checks as the
// section's test; only the rows it looks for change. Run after `npm run build:prototypes`:
//   node tools/test-touchpoints-customers.js | tail -1   → CUSTOMER TOUCHPOINTS PROBLEMS 0
const fs = require('fs'), path = require('path');

const CUSTOMERS = {
  ruth: { full: 'Ruth Calloway', live: 'IB Call · Refund check not received', cases: 2, openTag: 'Open', resolved: true,
    caseRow: 'CS-2026-3720', caseBy: 'Tanya Burton', pay: 'r03', total: '$1,612.40', autopay: true, linkedFrom: 'r03', linkedText: 'OB SMS · Payment confirmation', jump: 'r02',
    email: 'r05', codes: 'r04', find: ['refund', 'r08'], agent: ['lee', 'r04'], pick: ['r08', 'Letter · Escrow refund check 0041887'],
    art: ['r10', 'd23', 'Letter · Annual escrow analysis statement', 'Annual escrow analysis statement', [/\$1,284\.60/, /Refunded by check 0041887/]], enter: 'r12' },
  marcus: { full: 'Marcus Dell', live: 'IB Call · Payment increase after paid shortage', cases: 2, openTag: 'In Progress', resolved: true,
    caseRow: 'CS-2026-3861', caseBy: 'Tanya Burton', pay: 'm03', total: '$1,425.88', autopay: false, linkedFrom: 'm02', linkedText: 'Case · Escrow shortage payment', jump: 'm07',
    email: 'm07', codes: 'm05', find: ['shortage', 'm02'], agent: ['burton', 'm05'], pick: ['m04', 'Letter · Annual escrow analysis statement'],
    art: ['m04', 'd42', 'Letter · Annual escrow analysis statement', 'Annual escrow analysis statement', [/\$1,459\.00/, /up \$33\.12/]], enter: 'm11' },
  dana: { full: 'Dana Whitcomb', live: 'IB Call · Insurance premium change', cases: 1, openTag: 'Open', resolved: false,
    caseRow: 'CS-2026-4131', caseBy: null, pay: 'w04', total: '$1,683.22', autopay: true, linkedFrom: 'w04', linkedText: 'OB SMS · Payment confirmation', jump: 'w03',
    email: 'w02', codes: null, find: ['front range', 'w02'], agent: null, pick: ['w05', 'Letter · Policy ended · Summit Home Insurance'],
    art: ['w05', 'd33', 'Letter · Policy ended · Summit Home Insurance', 'Summit Home Insurance · policy ended', [/\$1,644\.00/, /10\/01\/26/]], enter: 'w06' },
};

let TOTAL = 0;
for (const [id, C] of Object.entries(CUSTOMERS)) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'prototypes', id + '.html'), 'utf8');
  const t = JSON.parse(html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]);
  let P = 0; const ok = (c, m) => { if (!c) { P++; console.log(id + ' FAIL', m); } };
  const g = (sid) => (t.match(new RegExp('<script id="' + sid + '">([\\s\\S]*?)</script>')) || [])[1];
  ok(!!g('sec-touchpoints-f-tp'), 'section script bundled');

  // DOM stub, as in the section's test; each customer runs in a fresh global
  const L = {};
  const mk = (eid) => ({ id: eid, attrs: {}, _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = String(v); },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
    contains: () => true, querySelector: () => null, classList: { toggle() {}, add() {}, remove() {}, contains: () => false } });
  global.document = { readyState: 'complete', body: mk('body'), getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
    activeElement: null, addEventListener: (e, f) => (L[e] = L[e] || []).push(f) };
  global.window = global; global.setTimeout = () => 0;
  delete global.TM; delete global.tpAct; delete global.tpState;
  new Function(g('tm-tm-core-script'))();
  new Function(g('sec-touchpoints-f-tp'))();
  const TM = window.TM, A = window.tpAct, S = window.tpState;
  ok(TM.hasFeature('tab:touchpoints'), 'registers tab:touchpoints');

  const el = mk('tm-panel-touchpoints');
  TM.mount('tab:touchpoints', el, { loan: TM.loan(), tab: 'touchpoints' });
  const H = () => el.innerHTML;
  const visible = (h) => h.replace(/<[^>]+>/g, ' ');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function balanced(h, m) {
    const st = []; const re = /<\/?([a-z0-9]+)[^>]*?>/gi; let x; const voids = /^(br|img|input|hr|meta|use|link)$/i;
    while ((x = re.exec(h))) { const tag = x[1].toLowerCase(); if (voids.test(tag) || /\/>$/.test(x[0])) continue; if (x[0][1] === '/') { if (st.pop() !== tag) { ok(false, 'unbalanced </' + tag + '> ' + m); return; } } else st.push(tag); }
    ok(st.length === 0, 'balanced tags ' + m + (st.length ? ' open: ' + st.join(',') : ''));
  }
  function clean(m) {
    const h = H(); balanced(h, m);
    ok(!/undefined|NaN|\[object/.test(h), 'no undefined/NaN ' + m);
    ok(!/\b(customer|borrower)s?\b/i.test(visible(h)), 'no customer/borrower copy ' + m);
    // nothing from the template's sample client
    ok(!/Johnson|Acme|····4399|\$1,739\.02|\$1,859\.02|\$442\.31/.test(visible(h)), 'no sample-client data ' + m);
  }

  // list
  ok(H().includes('Touchpoint history · ' + C.full), 'title with client name');
  const chips = [...H().matchAll(/data-tp="chip" data-v="([a-z]+)"[^>]*>([^<]+)</g)].map((m) => m[2]);
  ok(chips.join('|') === 'All|Calls|Email|Letter|Payment|Cases', 'chips: ' + chips.join('|'));
  ok(/role="combobox"/.test(H()) && /role="listbox"/.test(H()), 'search is a combobox + listbox');
  ok(/aria-sort="descending"/.test(H()), 'date sorted newest first');
  const firstRows = H().split('<tbody>')[1] || '';
  ok(!/#(phone|mail|credit_card|folder_copy|description)"/.test(firstRows), 'no icons in list rows');
  ok(H().includes(C.live), 'live call row: ' + C.live);
  ok(S.view().list[0].live, 'live call first');
  clean('list');
  const v = S.view(); ok(v.pages === Math.ceil(v.list.length / S.PAGE) && v.shown.length === Math.min(S.PAGE, v.list.length), 'paging (' + v.list.length + ' rows)');
  const d0 = S.view().list[0].date; A.sort(); ok(S.state().dir === 'asc' && S.view().list[0].date <= d0, 'sort toggles'); A.sort();

  // chips
  A.chip('calls'); ok(S.view().list.length && S.view().list.every((r) => ['call', 'ivr', 'chat', 'sms'].includes(r.channel)), 'Calls chip');
  A.chip('letter'); ok(S.view().list.length && S.view().list.every((r) => r.channel === 'letter'), 'Letter chip');
  A.chip('payment'); ok(S.view().list.length && S.view().list.every((r) => r.channel === 'payment'), 'Payment chip');
  A.chip('email'); ok(S.view().list.length && S.view().list.every((r) => r.channel === 'email'), 'Email chip');
  A.chip('case'); ok(S.view().list.length === C.cases && S.view().list.every((r) => r.kase), 'Cases chip = ' + C.cases + ' cases');
  ok(new RegExp('nova-tag--info tp-tag">' + C.openTag).test(H()) && (!C.resolved || /nova-tag nova-tag--small tp-tag">Resolved/.test(H())), 'case status tags');
  A.chip('all'); clean('chips');

  // case
  A.chip('case'); A.toggle('case-' + C.caseRow);
  ok(/aria-expanded="true"/.test(H()) && (C.caseBy ? H().includes('Handled by <strong>' + C.caseBy) : !/Handled by/.test(H())), 'case expands' + (C.caseBy ? ' with Handled by ' + C.caseBy : ''));
  ok(/>Artifacts</.test(H()) && H().includes('Case ' + C.caseRow + ' summary'), 'case artifact card');
  clean('case expanded');
  // payment
  A.chip('payment'); A.toggle(C.pay);
  ok((!C.autopay || /Autopay/.test(H())) && /On time/.test(H()) && />Fund allocation</.test(H()) && />Payment details</.test(H()), 'payment detail sections');
  ok(new RegExp('Total<\\/td><td class="tp-num">' + esc(C.total)).test(H()), 'fund allocation total ' + C.total);
  ok(/tp-gi--ok"><dt>Cleared/.test(H()), 'cleared date in green');
  clean('payment expanded');
  A.chip('all'); if (!S.state().expanded[C.linkedFrom]) A.toggle(C.linkedFrom);
  ok(/>Linked communications</.test(H()) && H().includes(C.linkedText), 'linked communication card: ' + C.linkedText);
  S.rows().filter((r) => r.pay && r.pay.alloc).forEach((r) => {
    const sum = r.pay.alloc.reduce((a, x) => a + parseFloat(x[1].replace(/[$,]/g, '')), 0);
    ok(Math.abs(sum - parseFloat(r.pay.amount.replace(/[$,]/g, ''))) < 0.005, 'allocation adds up ' + r.id);
  });
  A.chip('payment'); A.jump(C.jump); ok(S.state().chip === 'all' && S.state().expanded[C.jump], 'linked jump (chip → All, row expanded)');
  A.toggle(C.jump); ok(!S.state().expanded[C.jump], 'collapse'); A.page(1);
  A.jump(C.email); ok(/>Email thread</.test(H()), 'email thread');
  if (C.codes) { A.jump(C.codes); ok(/>Comment codes</.test(H()), 'comment codes'); }
  clean('mixed expanded');

  // typeahead
  ok(S.matches(C.find[0]).some((r) => r.id === C.find[1]), 'typeahead finds ' + C.find[0]);
  ok(S.matches('').length === 0 && S.matches('zzzz-nothing').length === 0, 'empty / no match');
  if (C.agent) ok(S.matches(C.agent[0]).some((r) => r.id === C.agent[1]), 'matches agent name');
  A.chip('payment'); A.page(1); A.pick(C.pick[0]);
  ok(S.state().pick === C.pick[0] && S.state().chip === 'all' && S.state().expanded[C.pick[0]] && /tp-row--picked/.test(H()), 'pick: chip → All, row expanded and marked');
  ok(S.state().q === C.pick[1], 'input shows picked title');
  A.qclear(); ok(!S.state().pick && S.state().q === '', 'clear search');
  const before = H(); A.typed(C.find[0]); ok(H() === before && S.TA.items.length > 0, 'typing updates options only'); A.qclear();

  // inline artifact
  const [row, doc, crumb, name, content] = C.art;
  A.chip('letter'); A.toggle(row); A.art(row + '|' + doc);
  ok(/data-tp-view="art"/.test(H()) && /aria-label="Breadcrumb"/.test(H()), 'artifact opens inline with breadcrumb');
  ok(/>Touchpoint history<\/button>/.test(H()) && H().includes('>' + crumb + '</button>') && H().includes('aria-current="page">' + name), 'breadcrumb trail');
  ok(content.every((re) => re.test(H())), 'artifact preview content');
  clean('artifact');
  A.crumbRow(); ok(/data-tp-view="list"/.test(H()) && S.state().chip === 'letter' && S.state().expanded[row], 'crumb back to touchpoint');
  A.art(row + '|' + doc); TM.mount('tab:touchpoints', el, { loan: TM.loan() }); ok(/data-tp-view="art"/.test(H()), 'artifact view restored on re-mount'); A.crumbList();
  S.rows().forEach((r) => r.docs.forEach((d) => ok(!!S.ART[d], 'artifact exists ' + r.id + ':' + d)));
  S.rows().forEach((r) => r.links.forEach((k) => ok(S.rows().some((x) => x.id === k), 'link target exists ' + r.id + '→' + k)));

  // keyboard
  const exp = { getAttribute: (k) => (k === 'data-v' ? C.enter : null), closest: () => ({}), classList: { contains: (c) => c === 'tp-exp' } };
  A.chip('all'); (L.keydown || []).forEach((f) => f({ key: 'Enter', target: exp, preventDefault() {} })); ok(S.state().expanded[C.enter], 'Enter on a row toggles it');

  // every row expanded renders cleanly
  S.view().list.forEach((r) => { if (!S.state().expanded[r.id]) A.toggle(r.id); }); clean('all rows expanded');
  for (let p = 2; p <= S.view().pages; p++) { A.page(p); clean('page ' + p); }

  console.log(id + ': ' + S.rows().length + ' rows · problems ' + P);
  TOTAL += P;
}
console.log('CUSTOMER TOUCHPOINTS PROBLEMS', TOTAL);
