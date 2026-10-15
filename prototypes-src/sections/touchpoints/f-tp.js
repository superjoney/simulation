/* ═══ sections/touchpoints · f-tp · Touchpoint history (tab:touchpoints) ═══
   Owned by the Touchpoints section chat. Renders only into #tm-panel-touchpoints (el). Read only: no system writes.
   Ported from reference/v9-sections/f-tp.js and re-laid-out to the Oct 15, 2026 screenshots:
   - Title "Touchpoint history · <client>".
   - Single-select Nova filter chips: All · Calls · Email · Letter · Payment · Cases. "Calls" holds inbound + outbound
     calls, IVR, chat and texts; each row says IB / OB in its title.
   - Search is a Nova typeahead select (combobox + listbox). Typing never re-renders the input. Picking a result
     jumps to that touchpoint: the list switches to All if needed, pages to it and expands it.
   - Nova table: DATE (sortable) · TOUCHPOINT · AGENT / SYSTEM. Rows carry no icons; icons stay on artifact cards only.
   - Expanded row: handled by, summary, payment tags / fund allocation / payment details, case details, email thread,
     comment codes, linked communications, artifacts.
   - An artifact opens inline in place of the list, with a breadcrumb back to the list (state, expanded row and
     position are kept).
   All data is synthetic. No DOB / SSN. Figures reuse the page's (03-conventions.md); invented ones carry TM.UNV. */
(function () {
  var W = window, D = document, TM = W.TM;
  if (!TM) return;
  var esc = TM.esc;
  var TODAY = '2026-10-05';
  var PAGE = 15;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

  /* ---------- small helpers ---------- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function mmdd(iso) { var p = String(iso).split('-'); return p[1] + '/' + p[2] + (p[0] !== TODAY.slice(0, 4) ? '/' + p[0].slice(2) : ''); }
  function mmddyy(iso) { var p = String(iso).split('-'); return p[1] + '/' + p[2] + '/' + p[0].slice(2); }
  function parseHuman(s) { /* "Sept 30, 2026" → "2026-09-30" */
    var m = String(s || '').match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/); if (!m) return TODAY;
    var i = -1; for (var k = 0; k < MON.length; k++) if (MON[k].slice(0, 3).toLowerCase() === m[1].slice(0, 3).toLowerCase()) { i = k; break; }
    return i < 0 ? TODAY : m[3] + '-' + p2(i + 1) + '-' + p2(+m[2]);
  }
  function mins(t) { var m = String(t || '').match(/(\d{1,2}):(\d{2})\s*([ap]m)/i); if (!m) return -1; return (+m[1] % 12 + (/p/i.test(m[3]) ? 12 : 0)) * 60 + (+m[2]); }
  function ico(n, cls) { return '<svg class="nova-icon tp-ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + n + '"></use></svg>'; }
  function initials(name) { return String(name || '').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function short(name) { var p = String(name || '').split(/\s+/); return p.length > 1 ? p[0].charAt(0) + '. ' + p.slice(1).join(' ') : name; }
  function plural(n, a, b) { return n === 1 ? a : b; }

  /* ---------- vocab ---------- */
  /* filter chips (single select). Calls = phone calls (IB/OB), IVR, chat and texts. */
  var CHIPS = [['all', 'All'], ['calls', 'Calls'], ['email', 'Email'], ['letter', 'Letter'], ['payment', 'Payment'], ['case', 'Cases']];
  var GROUP = { call: 'calls', ivr: 'calls', chat: 'calls', sms: 'calls', email: 'email', letter: 'letter', payment: 'payment', 'case': 'case', web: 'web' };
  var CODES = {
    TTMR: 'Talked to Mr.', LMTC: 'Left message to call', TTOT: 'Talked to other party', '3PAR': 'Talked to 3rd party',
    CDOC: 'Client requested document'
  };
  var AG = { you: 'You', sl: 'Sam Lee', tb: 'Tanya Burton', ja: 'Jordan Anderson' }; /* synthetic CRs */
  function srv(n) { var l = TM.LOANS[n]; return l ? l.servicer : 'Servicing'; }

  /* ---------- data model ----------
     { id, channel: 'call'|'ivr'|'chat'|'sms'|'email'|'letter'|'payment'|'case'|'web', direction: 'in'|'out'|'none',
       label (what it was about), date 'YYYY-MM-DD', time, agent (CR full name) | null, duration, sub (second line),
       summary, codes[], docs[] (ART ids), thread[{dir, from, date, subject, snippet}], links[] (row ids),
       pay{amount, status, autopay, onTime, due, posted, cleared, method, payee, code, alloc[[label, amount]]},
       kase{no, status, open, opened, dept, group, rt, res}, live, fresh } */
  function tp(o) {
    o.direction = o.direction || 'none';
    o.group = GROUP[o.channel] || 'web';
    o.codes = o.codes || []; o.docs = o.docs || []; o.thread = o.thread || []; o.links = o.links || [];
    return o;
  }
  function prefix(r) {
    var io = r.direction === 'out' ? 'OB ' : r.direction === 'in' ? 'IB ' : '';
    switch (r.channel) {
      case 'call': return io + 'Call';
      case 'sms': return io + 'SMS';
      case 'chat': return 'Chat';
      case 'ivr': return 'IVR';
      case 'email': return 'Email';
      case 'letter': return 'Letter';
      case 'payment': return 'Payment';
      case 'case': return 'Case';
      default: return 'Web & app';
    }
  }
  function title(r) { return prefix(r) + ' · ' + r.label; }

  /* ---------- 456123789 (primary): the v9 rows, re-titled; detail added where the screenshots call for it ---------- */
  var P = '456123789';
  var BASE = {};
  BASE[P] = [
    tp({ id: 'p01', channel: 'call', direction: 'in', label: 'Escrow shortage and payment increase', date: '2026-10-05', time: '10:02 AM', agent: AG.you, live: true,
      summary: 'With you now. Asking why the payment went up after the escrow analysis.' }),
    tp({ id: 'p02', channel: 'web', direction: 'in', label: 'Locked out of online account', date: '2026-10-04', time: '8:47 PM', sub: 'Self-service',
      summary: 'Three failed web sign-ins; account locked. Offer a password reset.' }),
    tp({ id: 'p03', channel: 'email', direction: 'in', label: 'Insurance declarations page received', date: '2026-10-03', time: '2:15 PM', sub: 'Received',
      summary: 'Routed to insurance processing.', docs: ['d01'],
      thread: [{ dir: 'in', from: 'Marcus Johnson → ' + srv(P), date: '10/03/26', subject: 'Insurance declarations page', snippet: 'Declarations page attached.' }] }),
    tp({ id: 'p04', channel: 'payment', direction: 'in', label: 'Escrow shortage payment', date: '2026-10-02', time: '9:31 AM', sub: 'Phone payment',
      summary: 'Applied to the escrow shortage.', docs: ['d02'], links: ['p05'],
      pay: { amount: '$216.65', status: 'Posted', autopay: false, posted: '10/02/26', method: 'Phone payment', alloc: [['Escrow shortage', '$216.65']] } }),
    tp({ id: 'p05', channel: 'call', direction: 'in', label: 'Shortage payment', date: '2026-10-02', time: '9:12 AM', agent: AG.sl, duration: '8m 41s',
      summary: 'Paid the shortage by phone. Move Money case CS-2026-4107 opened.', codes: ['TTMR'], docs: ['d02'], links: ['p04', 'case-CS-2026-4107'] }),
    tp({ id: 'p06', channel: 'web', direction: 'in', label: 'Escrow removal request submitted', date: '2026-09-30', time: '7:40 PM', sub: 'Self-service',
      summary: 'Requested in the app. Escrow Removal case CS-2026-3998 auto-resolved as ineligible (FHA, incurable).', links: ['case-CS-2026-3998'] }),
    tp({ id: 'p07', channel: 'call', direction: 'in', label: 'Escrow increase complaint', date: '2026-09-29', time: '1:05 PM', agent: AG.tb, duration: '14m 05s',
      summary: 'Disputed the higher escrow payment. Verbal complaint case CS-2026-3861 opened and resolved.', codes: ['TTMR'], links: ['case-CS-2026-3861'] }),
    tp({ id: 'p08', channel: 'email', direction: 'out', label: 'Escrow analysis results', date: '2026-09-28', time: '6:00 AM', sub: 'Sent',
      summary: 'Analysis run Sept 28, 2026. Monthly escrow $442.31, up $33.12 from $409.19.',
      thread: [{ dir: 'out', from: srv(P) + ' → Marcus Johnson', date: '09/28/26', subject: 'Your escrow analysis results', snippet: 'Analysis run Sept 28, 2026. Monthly escrow $442.31, up $33.12 from $409.19.' }] }),
    tp({ id: 'p09', channel: 'payment', direction: 'in', label: 'Scheduled autopay', date: '2026-09-23', time: '11:20 AM', sub: 'Autopay',
      summary: 'October payment scheduled from account ····4399.',
      pay: { amount: '$1,739.02', status: 'Scheduled', autopay: true, due: '10/01/26', method: 'Autopay / Checking ····4399', alloc: [['Principal & interest', '$1,296.71'], ['Escrow', '$442.31']] } }),
    tp({ id: 'p10', channel: 'email', direction: 'out', label: 'Monthly statement available', date: '2026-09-16', time: '5:00 AM', sub: 'Sent',
      summary: 'Statement for the Oct 1, 2026 payment of $1,739.02.', docs: ['d04'],
      thread: [{ dir: 'out', from: srv(P) + ' → Marcus Johnson', date: '09/16/26', subject: 'Your monthly statement is available', snippet: 'Statement for the Oct 1, 2026 payment of $1,739.02.' }] }),
    tp({ id: 'p11', channel: 'web', direction: 'in', label: 'Signed in to the app', date: '2026-09-12', time: '8:14 PM', sub: 'Self-service', summary: 'Viewed payments and escrow.' }),
    tp({ id: 'p12', channel: 'letter', direction: 'out', label: 'Escrow analysis statement', date: '2026-09-05', time: '', sub: 'Mailed',
      summary: 'Annual escrow analysis statement mailed with the shortage payment coupon. Includes the new payment effective 11/01/26 and shortage options.', docs: ['d05', 'd07'] }),
    tp({ id: 'p13', channel: 'payment', direction: 'in', label: 'Payment received', date: '2026-09-01', time: '7:02 AM', sub: 'ACH',
      summary: 'September payment, including $120.00 extra principal.', docs: ['d08'], links: ['p13s'],
      pay: { amount: '$1,859.02', status: 'Cleared', autopay: true, onTime: true, due: '09/01/26', posted: '09/01/26', cleared: '09/03/26', method: 'ACH / Checking ····4399', code: 'PYMT-001',
        alloc: [['Principal & interest', '$1,296.71'], ['Escrow', '$442.31'], ['Extra principal', '$120.00']] } }),
    tp({ id: 'p13s', channel: 'sms', direction: 'out', label: 'Payment confirmation', date: '2026-09-01', time: '7:05 AM', sub: 'Delivered', unv: true,
      summary: 'Text to (444) 222-8888 confirming the $1,859.02 September payment.', links: ['p13'] }),
    tp({ id: 'p14', channel: 'letter', direction: 'out', label: 'RESPA escrow disclosure', date: '2026-08-28', time: '', sub: 'Mailed', summary: 'Escrow account disclosure under RESPA.', docs: ['d06'] }),
    tp({ id: 'p15', channel: 'ivr', direction: 'in', label: 'Balance and next payment', date: '2026-08-20', time: '6:48 PM', sub: 'Self-service', summary: 'Self-service; did not ask for a CR.' }),
    tp({ id: 'p16', channel: 'payment', direction: 'out', label: 'Insurance premium paid from escrow', date: '2026-08-14', time: '', sub: 'Escrow disbursement',
      summary: 'Renewal premium to Acme P&C.', docs: ['d10'],
      pay: { amount: '$1,684.00', status: 'Disbursed', payee: 'Acme P&C', method: 'Escrow disbursement', posted: '08/14/26', alloc: [['Hazard insurance · renewal', '$1,684.00']] } }),
    tp({ id: 'p17', channel: 'letter', direction: 'out', label: 'Escrow refund check 0041887', date: '2026-08-04', time: '', sub: 'Mailed', summary: 'Escrow surplus refund of $1,284.60 mailed to 428 Maple Ave.', docs: ['d11'] })
  ];
  /* other household loans: v9 rows, re-titled */
  BASE['312004417'] = [
    tp({ id: 'a01', channel: 'call', direction: 'in', label: 'Rate review follow-up', date: '2026-10-05', time: '9:10 AM', agent: AG.ja, duration: '9m 14s',
      summary: 'Client called to follow up on the rate review request submitted Sept 15. No decision yet. Estimated 30-day window communicated.', codes: ['TTMR'], links: ['case-CS-2026-2210'] }),
    tp({ id: 'a02', channel: 'email', direction: 'out', label: 'Rate review request received', date: '2026-09-15', time: '', sub: 'Sent',
      summary: 'Email confirming rate review request CS-2026-2210 was received and is under review.',
      thread: [{ dir: 'out', from: srv('312004417') + ' → Marcus Johnson', date: '09/15/26', subject: 'We received your rate review request', snippet: 'Your rate review request CS-2026-2210 was received and is under review.' }] }),
    tp({ id: 'a03', channel: 'payment', direction: 'in', label: 'Scheduled autopay', date: '2026-09-01', time: '', sub: 'ACH', summary: 'Automated ACH payment processed successfully.',
      pay: { amount: '$2,115.00', status: 'Cleared', autopay: true, onTime: true, due: '09/01/26', posted: '09/01/26', cleared: '09/03/26', method: 'ACH / Checking ····4491', alloc: [['Principal', '$1,490.22'], ['Interest', '$544.00'], ['Escrow', '$80.78']] } }),
    tp({ id: 'a04', channel: 'payment', direction: 'in', label: 'Scheduled autopay', date: '2026-08-01', time: '', sub: 'ACH', summary: 'Automated ACH payment processed successfully.',
      pay: { amount: '$2,115.00', status: 'Cleared', autopay: true, onTime: true, due: '08/01/26', posted: '08/01/26', cleared: '08/03/26', method: 'ACH / Checking ····4491', alloc: [['Principal', '$1,490.22'], ['Interest', '$544.00'], ['Escrow', '$80.78']] } })
  ];
  BASE['789341002'] = [
    tp({ id: 'b01', channel: 'call', direction: 'in', label: 'Escrow overage question', date: '2026-10-05', time: '10:00 AM', agent: AG.ja, duration: '7m 45s',
      summary: 'Client called asking about the escrow overage notice. Explained what the notice means.', codes: ['TTMR'] }),
    tp({ id: 'b02', channel: 'payment', direction: 'in', label: 'Scheduled autopay', date: '2026-09-01', time: '', sub: 'ACH', summary: 'Automated ACH payment processed successfully.',
      pay: { amount: '$1,702.00', status: 'Cleared', autopay: true, onTime: true, due: '09/01/26', posted: '09/01/26', cleared: '09/03/26', method: 'ACH / Checking ····4491', alloc: [['Principal', '$812.44'], ['Interest', '$762.56'], ['Escrow', '$127.00']] } }),
    tp({ id: 'b03', channel: 'letter', direction: 'out', label: 'Escrow overage notice', date: '2026-08-20', time: '', sub: 'Mailed', summary: 'Annual escrow overage notice mailed to client.' })
  ];
  BASE['100298834'] = [
    tp({ id: 'c01', channel: 'letter', direction: 'out', label: 'Loan payoff confirmation', date: '2021-03-15', time: '', sub: 'Mailed', summary: 'Confirmation letter mailed to client confirming loan payoff and release of lien.' }),
    tp({ id: 'c02', channel: 'call', direction: 'in', label: 'Payoff inquiry', date: '2021-03-10', time: '', agent: AG.ja, duration: '5m 02s',
      summary: 'Client called to confirm the payoff amount and process. Final payoff confirmed. Loan closed Mar 15, 2021.', codes: ['TTMR'] })
  ];
  BASE['574839201'] = [
    tp({ id: 'e01', channel: 'call', direction: 'out', label: 'Delinquency outreach', date: '2026-10-05', time: '8:45 AM', agent: AG.tb, duration: '1m 12s',
      summary: 'Outbound call about the missed September payment. No answer. Voicemail left advising of the late fee and requesting a callback.', codes: ['LMTC'] }),
    tp({ id: 'e02', channel: 'letter', direction: 'out', label: 'Delinquency notice', date: '2026-09-15', time: '', sub: 'Mailed', summary: 'Delinquency notice mailed per regulatory requirement. Includes total amount due and payment instructions.', links: ['case-CS-2026-1741'] }),
    tp({ id: 'e03', channel: 'payment', direction: 'in', label: 'Payment received', date: '2026-08-01', time: '', sub: 'ACH', summary: 'ACH payment processed successfully.',
      pay: { amount: '$2,340.00', status: 'Cleared', autopay: false, onTime: true, due: '08/01/26', posted: '08/01/26', cleared: '08/03/26', method: 'ACH / Checking ····8821', alloc: [['Principal', '$1,652.10'], ['Interest', '$577.40'], ['Escrow', '$110.50']] } })
  ];

  /* who handled each seeded case (matches the call rows above) */
  var CASE_BY = { 'CS-2026-4107': AG.sl, 'CS-2026-3861': AG.tb, 'CS-2026-2210': AG.ja };

  /* ---------- artifacts (inline viewer). Figures are the ones already on the page. ---------- */
  var ART = {
    d01: { name: 'Insurance declarations page', kind: 'PDF', date: '2026-10-03', from: 'Client upload', rows: [['Received', '10/03/26'], ['Routed to', 'Insurance processing'], ['Carrier', 'Acme P&C']] },
    d02: { name: 'Shortage payment receipt', kind: 'Receipt', date: '2026-10-02', rows: [['Amount', '$216.65'], ['Posted', '10/02/26'], ['Applied to', 'Escrow shortage']] },
    d04: { name: 'Monthly statement · October', kind: 'PDF', date: '2026-09-16', rows: [['Statement for', '10/01/26 payment'], ['Amount due', '$1,739.02'], ['Principal & interest', '$1,296.71'], ['Escrow', '$442.31']] },
    d05: { name: 'Annual escrow analysis statement', kind: 'PDF', date: '2026-09-05', rows: [['Monthly escrow', '$442.31', 'Up $33.12 from $409.19'], ['Escrow shortage', '$216.65'], ['Mailed with', 'Escrow shortage payment coupon']] },
    d06: { name: 'RESPA escrow disclosure', kind: 'PDF', date: '2026-08-28', rows: [['Covers', 'Escrow account disclosure under RESPA']] },
    d07: { name: 'Escrow shortage payment coupon', kind: 'PDF', date: '2026-09-05', rows: [['Shortage', '$216.65'], ['Mailed with', 'Annual escrow analysis statement']] },
    d08: { name: 'Payment receipt · September', kind: 'Receipt', date: '2026-09-01', rows: [['Payment', '$1,859.02', 'Includes $120.00 extra principal'], ['Received', '09/01/26']] },
    d10: { name: 'Insurance premium disbursement', kind: 'Receipt', date: '2026-08-14', rows: [['Paid to', 'Acme P&C'], ['Amount', '$1,684.00'], ['Paid from', 'Escrow · 08/14/26']] },
    d11: { name: 'Escrow refund check 0041887', kind: 'PDF', date: '2026-08-04', rows: [['Check', '0041887'], ['Amount', '$1,284.60'], ['Mailed', '08/04/26'], ['Mailed to', '428 Maple Ave, Boulder, CO 90301']] }
  };
  function caseArt(k) {
    var id = 'cs:' + k.no;
    if (!ART[id]) {
      var rows = [['Case', k.no], ['Status', k.status], ['Opened', mmddyy(parseHuman(k.opened))]];
      if (k.dept) rows.push(['Department', k.dept]);
      if (k.group) rows.push(['Group', k.group]);
      if (k.rt) rows.push(['Request type', k.rt]);
      if (k.res) rows.push(['Resolution', k.res]);
      ART[id] = { name: 'Case ' + k.no + ' summary', kind: 'Dynamics 365 · Case', date: parseHuman(k.opened), rows: rows, icon: 'folder_copy' };
    }
    return id;
  }
  function art(id) { return ART[id] || null; }

  /* ---------- rows added on this call (TM 'send' / TM 'case') ---------- */
  var EXTRA = {}, seq = 0, CASE_AT = {};
  function caseRows(l) {
    return (l && l.cases || []).map(function (c, i) {
      var open = !/resolved|closed/i.test(c.status || '');
      var k = { no: c.no, status: c.status || 'Open', open: open, opened: c.opened, dept: c.dept, group: c.group, rt: c.rt, res: c.res };
      return tp({ id: 'case-' + c.no, channel: 'case', direction: 'none', label: c.name || c.rt, date: parseHuman(c.opened), time: c.fresh ? (CASE_AT[c.no] || '') : '',
        agent: c.fresh ? AG.you : (CASE_BY[c.no] || null), sub: k.status,
        summary: c.no + ' — ' + [c.dept, c.group, c.rt].filter(Boolean).join(' › ') + (c.res ? '. ' + c.res + '.' : '.'),
        kase: k, docs: [caseArt(k)], fresh: !!c.fresh, freshSeq: c.fresh ? (CASE_AT[c.no + '#'] || 0) : 0, ci: i });
    });
  }
  function rowsFor(n) {
    var l = TM.LOANS[n];
    var all = (EXTRA[n] || []).concat(BASE[n] || []).concat(caseRows(l));
    all.forEach(function (r, i) { r.idx = i; });
    return all;
  }
  function findRow(n, id) { var x = null; rowsFor(n).forEach(function (r) { if (r.id === id) x = r; }); return x; }

  /* ---------- state (module level, per loan, so a tab or loan switch restores it) ---------- */
  var ST = {};
  function st(n) { return ST[n] || (ST[n] = { chip: 'all', dir: 'desc', expanded: {}, page: 1, art: null, pick: null, q: '' }); }
  var MOUNT = { el: null, ctx: null, n: null };
  var TA = { open: false, items: [], active: -1 }; /* typeahead (never persisted) */

  /* ---------- filter + sort ---------- */
  function passes(r, s) { return s.chip === 'all' || r.group === s.chip; }
  function dateKey(r) {
    var t = r.fresh ? 100000 + (r.freshSeq || 0) : r.live ? 99999 : Math.max(mins(r.time), 0);
    return r.date + ':' + ('000000' + t).slice(-6);
  }
  function sortRows(rows, s) {
    var dir = s.dir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var c = dateKey(a) < dateKey(b) ? -1 : dateKey(a) > dateKey(b) ? 1 : 0;
      return c !== 0 ? c * dir : a.idx - b.idx;
    });
  }
  function view(n) {
    var s = st(n), all = rowsFor(n), list = sortRows(all.filter(function (r) { return passes(r, s); }), s);
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (s.page > pages) s.page = pages;
    if (s.page < 1) s.page = 1;
    return { all: all, list: list, pages: pages, shown: list.slice((s.page - 1) * PAGE, s.page * PAGE) };
  }
  function pageOf(n, id) { var v = view(n); for (var i = 0; i < v.list.length; i++) if (v.list[i].id === id) return Math.floor(i / PAGE) + 1; return 0; }

  /* right column: AGENT / SYSTEM */
  function agentText(r) {
    if (r.kase) return r.kase.status;
    if (r.pay) return r.pay.amount;
    if (r.agent) return r.agent === AG.you ? 'You' : short(r.agent);
    if (r.channel === 'web' || r.channel === 'ivr') return 'Self-service';
    if (r.channel === 'letter') return 'System gen';
    if (r.direction === 'in') return 'Client';
    return 'System';
  }
  function subText(r) {
    if (r.live) return 'In progress';
    if (r.duration) return r.duration;
    return r.sub || '';
  }

  /* ---------- typeahead search ---------- */
  function terms(q) { return String(q || '').toLowerCase().split(/\s+/).filter(Boolean); }
  function hay(r) {
    return [title(r), r.summary, r.agent || '', subText(r), agentText(r), mmdd(r.date), r.codes.join(' '), r.kase ? r.kase.no : '',
      r.docs.map(function (id) { var a = art(id); return a ? a.name : ''; }).join(' ')].join(' ').toLowerCase();
  }
  function matches(n, q) {
    var ts = terms(q); if (!ts.length) return [];
    return sortRows(rowsFor(n).filter(function (r) { var h = hay(r); for (var i = 0; i < ts.length; i++) if (h.indexOf(ts[i]) < 0) return false; return true; }), { dir: 'desc' }).slice(0, 8);
  }

  /* ---------- render: list view ---------- */
  function chipsHtml(n) {
    var s = st(n);
    return '<div class="tp-chips" role="group" aria-label="Filter touchpoints">' + CHIPS.map(function (c) {
      var on = s.chip === c[0];
      return '<button type="button" class="nova-chip' + (on ? ' nova-chip--selected' : ' nova-chip--outline') + ' tp-chip" data-tp="chip" data-v="' + c[0] + '" data-tp-key="chip:' + c[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(c[1]) + '</button>';
    }).join('') + '</div>';
  }
  function searchHtml(n) {
    var s = st(n);
    return '<div class="nova-form-field nova-form-field--outline tp-search">' +
      '<div class="nova-form-field__input-group tp-search-g">' + ico('search', 'tp-search-ico') +
      '<label class="tp-sr" for="tp-q">Search touchpoints</label>' +
      '<input id="tp-q" class="nova-form-field__control tp-q" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="tp-dd" autocomplete="off" spellcheck="false" placeholder="Search touchpoints" data-tp-input="q" data-tp-key="q" value="' + esc(s.q) + '">' +
      '<button type="button" class="nova-icon-button nova-icon-button--small tp-q-x" data-tp="qclear" data-tp-key="qclear" aria-label="Clear search"' + (s.q ? '' : ' hidden') + '>' + ico('close') + '</button>' +
      '</div>' +
      '<div class="nova-menu tp-dd" id="tp-dd" role="listbox" aria-label="Matching touchpoints"></div></div>';
  }
  function ddHtml() {
    if (!TA.items.length) return '<div class="nova-menu__item nova-menu__item--disabled tp-dd-none" role="option" aria-disabled="true" id="tp-opt-none"><span class="nova-menu__item-content"><span class="nova-menu__item-text">No matching touchpoints</span></span></div>';
    return TA.items.map(function (r, i) {
      return '<div class="nova-menu__item tp-opt' + (i === TA.active ? ' nova-menu__item--selected' : '') + '" role="option" id="tp-opt-' + i + '" aria-selected="' + (i === TA.active ? 'true' : 'false') + '" data-tp="pick" data-v="' + esc(r.id) + '">' +
        '<span class="nova-menu__item-content"><span class="nova-menu__item-text">' + esc(title(r)) + '</span>' +
        '<span class="nova-menu__item-caption">' + esc([mmdd(r.date), agentText(r)].filter(Boolean).join(' · ')) + '</span></span></div>';
    }).join('');
  }
  function dateCell(r) {
    if (r.date === TODAY) return '<span class="tp-d">Today</span>' + (r.time ? '<span class="tp-d2">' + esc(r.time) + '</span>' : '');
    return '<span class="tp-d">' + esc(mmdd(r.date)) + '</span>';
  }
  function agentCell(r) {
    if (r.kase) return '<span class="nova-tag nova-tag--small' + (r.kase.open ? ' nova-tag--info' : '') + ' tp-tag">' + esc(r.kase.status) + '</span>';
    if (r.live) return '<span class="nova-tag nova-tag--small nova-tag--success tp-tag">You · Live</span>';
    if (r.pay) return '<span class="tp-amt">' + esc(r.pay.amount) + '</span>';
    return '<span class="tp-ag">' + esc(agentText(r)) + '</span>';
  }
  function secHtml(label, inner, id) {
    return '<div class="tp-x-sec"><div class="tp-x-l"' + (id ? ' id="' + id + '"' : '') + '>' + esc(label) + '</div>' + inner + '</div>';
  }
  function handledHtml(r) {
    if (!r.agent || r.agent === AG.you) return '';
    return '<div class="tp-handled"><span class="tm-avatar tp-av" aria-hidden="true">' + esc(initials(r.agent)) + '</span>Handled by <strong>' + esc(r.agent) + '</strong></div>';
  }
  function gridHtml(rows) {
    return '<dl class="tp-grid">' + rows.map(function (x) {
      return '<div class="tp-gi' + (x[2] ? ' ' + x[2] : '') + '"><dt>' + esc(x[0]) + '</dt><dd>' + (x[3] ? x[1] : esc(x[1])) + '</dd></div>';
    }).join('') + '</dl>';
  }
  function payHtml(r) {
    var p = r.pay, tags = [];
    if (p.autopay === true) tags.push('<span class="nova-tag nova-tag--small nova-tag--info tp-ptag">' + ico('sync') + 'Autopay</span>');
    if (p.onTime === true) tags.push('<span class="nova-tag nova-tag--small nova-tag--success tp-ptag">' + ico('check_circle') + 'On time</span>');
    else if (p.onTime === false) tags.push('<span class="nova-tag nova-tag--small nova-tag--warning tp-ptag">Late</span>');
    if (!tags.length) tags.push('<span class="nova-tag nova-tag--small tp-ptag">' + esc(p.status) + '</span>');
    var alloc = p.alloc && p.alloc.length ? secHtml('Fund allocation',
      '<table class="nova-table tp-alloc" aria-labelledby="tp-al-' + esc(r.id) + '"><tbody>' +
      p.alloc.map(function (a) { return '<tr><td>' + esc(a[0]) + '</td><td class="tp-num">' + esc(a[1]) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="tp-num">' + esc(p.amount) + '</td></tr></tfoot></table>', 'tp-al-' + esc(r.id)) : '';
    var d = [[p.status === 'Disbursed' ? 'Amount' : 'Amount due', p.amount]];
    if (p.due) d.push(['Due date', p.due]);
    if (p.posted) d.push(['Posted', p.posted]);
    if (p.cleared) d.push(['Cleared', p.cleared, 'tp-gi--ok']);
    if (p.status && !p.cleared && !p.posted) d.push(['Status', p.status]);
    if (p.method) d.push(['Method', p.method]);
    if (p.payee) d.push(['Paid to', p.payee]);
    if (p.code) d.push(['Comment code', esc(p.code) + ' ' + TM.UNV, '', true]);
    return '<div class="tp-ptags">' + tags.join('') + '</div><div class="tp-pay2">' + alloc + secHtml('Payment details', gridHtml(d)) + '</div>';
  }
  function caseHtml(r) {
    var k = r.kase, rows = [['Case', k.no], ['Opened', mmddyy(parseHuman(k.opened))]];
    if (k.dept) rows.push(['Department', k.dept]);
    if (k.group) rows.push(['Group', k.group]);
    if (k.rt) rows.push(['Request type', k.rt]);
    if (k.res) rows.push(['Resolution', k.res]);
    return secHtml('Case details', gridHtml(rows));
  }
  function threadHtml(r) {
    if (!r.thread.length) return '';
    return secHtml('Email thread', '<ol class="tp-thread">' + r.thread.map(function (m) {
      return '<li class="tp-msg"><div class="tp-msg-h"><span class="tp-msg-dir">' + (m.dir === 'out' ? 'To client' : 'From client') + '</span>' +
        '<span>' + esc(m.from) + '</span><span class="tp-msg-date">' + esc(m.date) + '</span></div>' +
        '<div class="tp-msg-s">' + esc(m.subject) + '</div><p class="tp-msg-b">' + esc(m.snippet) + '</p></li>';
    }).join('') + '</ol>');
  }
  function codesHtml(r) {
    if (!r.codes.length) return '';
    return secHtml('Comment codes', '<div class="tp-codes">' + r.codes.map(function (c) {
      return '<span class="nova-tag nova-tag--small tp-code">' + esc(c) + '</span>' + (CODES[c] ? '<span class="tp-code-d">' + esc(CODES[c]) + '</span>' : '');
    }).join('') + '</div>');
  }
  function linkIco(x) { return x.channel === 'case' ? 'folder_copy' : x.channel === 'payment' ? 'credit_card' : x.channel === 'email' ? 'mail' : x.channel === 'letter' ? 'description' : x.channel === 'sms' || x.channel === 'chat' ? 'chat' : 'phone'; }
  function linksHtml(r, n) {
    var xs = r.links.map(function (id) { return findRow(n, id); }).filter(Boolean);
    if (!xs.length) return '';
    return secHtml(r.pay ? 'Linked communications' : 'Linked touchpoints', '<ul class="tp-cards">' + xs.map(function (x) {
      return '<li><button type="button" class="tp-card" data-tp="jump" data-v="' + esc(x.id) + '" data-tp-key="jump:' + esc(r.id) + ':' + esc(x.id) + '">' +
        '<span class="tp-card-i">' + ico(linkIco(x)) + '</span><span class="tp-card-n tp-card-n--sm">' + esc(title(x)) + '</span>' +
        '<span class="tp-card-m">' + esc(mmdd(x.date)) + '</span></button></li>';
    }).join('') + '</ul>');
  }
  function artsHtml(r) {
    var ds = r.docs.filter(art);
    if (!ds.length) return '';
    return secHtml('Artifacts', '<ul class="tp-cards">' + ds.map(function (id) {
      var a = art(id);
      return '<li><button type="button" class="tp-card" data-tp="art" data-v="' + esc(r.id + '|' + id) + '" data-tp-key="art:' + esc(r.id) + ':' + esc(id) + '">' +
        '<span class="tp-card-i">' + ico(a.icon || 'description') + '</span><span class="tp-card-n">' + esc(a.name) + '</span>' + ico('arrow_right', 'tp-card-go') + '</button></li>';
    }).join('') + '</ul>');
  }
  function expandHtml(r, n) {
    return handledHtml(r) + (r.summary ? '<p class="tp-sum">' + esc(r.summary) + (r.unv ? ' ' + TM.UNV : '') + '</p>' : '') +
      (r.pay ? payHtml(r) : '') + (r.kase ? caseHtml(r) : '') + threadHtml(r) + codesHtml(r) + linksHtml(r, n) + artsHtml(r);
  }
  function rowHtml(r, n) {
    var s = st(n), open = !!s.expanded[r.id], picked = s.pick === r.id;
    return '<tr class="tp-row' + (open ? ' tp-row--open' : '') + (picked ? ' tp-row--picked' : '') + '" data-tp-row="' + esc(r.id) + '" data-tp="toggle" data-v="' + esc(r.id) + '">' +
      '<td class="tp-c-date">' + dateCell(r) + '</td>' +
      '<td class="tp-c-tp"><button type="button" class="tp-exp" data-tp="toggle" data-v="' + esc(r.id) + '" data-tp-key="row:' + esc(r.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '"' + (open ? ' aria-controls="tp-x-' + esc(r.id) + '"' : '') + '>' +
        '<span class="tp-t">' + esc(title(r)) + '</span>' + (subText(r) ? '<span class="tp-s">' + esc(subText(r)) + '</span>' : '') + '</button></td>' +
      '<td class="tp-c-ag">' + agentCell(r) + '</td>' +
      '<td class="tp-c-chev">' + ico(open ? 'expand_less' : 'expand_more', 'tp-chev') + '</td></tr>' +
      (open ? '<tr class="tp-xrow" id="tp-x-' + esc(r.id) + '"><td colspan="4"><div class="tp-x">' + expandHtml(r, n) + '</div></td></tr>' : '');
  }
  function resultsHtml(n) {
    var s = st(n), v = view(n);
    var status = '<div class="tp-sr" role="status">' + v.list.length + ' ' + plural(v.list.length, 'touchpoint', 'touchpoints') + '</div>';
    var dirW = s.dir === 'asc' ? 'ascending' : 'descending';
    var head = '<thead><tr><th scope="col" class="tp-c-date" aria-sort="' + dirW + '"><button type="button" class="nova-table__sort tp-sort" data-tp="sort" data-tp-key="sort">Date' +
      ico('expand_more', 'tp-sort-ico' + (s.dir === 'asc' ? ' tp-sort-ico--asc' : '')) + '<span class="tp-sr">, sorted ' + (s.dir === 'asc' ? 'oldest first' : 'newest first') + '</span></button></th>' +
      '<th scope="col" class="tp-c-tp">Touchpoint</th><th scope="col" class="tp-c-ag">Agent / System</th><th scope="col" class="tp-c-chev"><span class="tp-sr">Expand</span></th></tr></thead>';
    if (!v.list.length) {
      return status + '<div class="tp-tblw"><table class="nova-table tp-tbl" aria-label="Touchpoint history">' + head + '</table></div>' +
        '<div class="tp-empty"><p class="tp-empty-t">No touchpoints in this filter</p>' +
        '<button type="button" class="nova-button nova-button--tertiary nova-button--x-small" data-tp="chip" data-v="all" data-tp-key="empty-all">Show all touchpoints</button></div>';
    }
    var from = (s.page - 1) * PAGE + 1, to = Math.min(s.page * PAGE, v.list.length);
    return status + '<div class="tp-tblw"><table class="nova-table tp-tbl" aria-label="Touchpoint history">' + head +
      '<tbody>' + v.shown.map(function (r) { return rowHtml(r, n); }).join('') + '</tbody></table></div>' +
      (v.pages > 1 ? '<nav class="tp-pg" aria-label="Touchpoint pages"><span class="tp-pg-t">' + from + '–' + to + ' of ' + v.list.length + '</span>' +
        '<button type="button" class="nova-icon-button nova-icon-button--small" data-tp="page" data-v="' + (s.page - 1) + '" data-tp-key="pg:prev" aria-label="Previous page"' + (s.page <= 1 ? ' disabled' : '') + '>' + ico('navigate_before') + '</button>' +
        '<span class="tp-pg-t">Page ' + s.page + ' of ' + v.pages + '</span>' +
        '<button type="button" class="nova-icon-button nova-icon-button--small" data-tp="page" data-v="' + (s.page + 1) + '" data-tp-key="pg:next" aria-label="Next page"' + (s.page >= v.pages ? ' disabled' : '') + '>' + ico('navigate_next') + '</button></nav>' : '');
  }
  function clientName(n) { var l = TM.LOANS[n]; return l ? l.client : ''; }
  function headHtml(n) { return '<div class="tp-head"><h2 class="tp-h" id="tp-h" tabindex="-1">Touchpoint history · ' + esc(clientName(n)) + '</h2></div>'; }
  function listHtml(n) {
    return '<section class="tp" aria-labelledby="tp-h" data-tp-loan="' + esc(n) + '" data-tp-view="list">' + headHtml(n) +
      '<div class="tp-bar">' + searchHtml(n) + '<div id="tp-chips" class="tp-bar-chips">' + chipsHtml(n) + '</div></div>' +
      '<div id="tp-results" class="tp-results">' + resultsHtml(n) + '</div></section>';
  }

  /* ---------- render: inline artifact view ---------- */
  function artViewHtml(n) {
    var s = st(n), r = findRow(n, s.art.row), a = art(s.art.doc), l = TM.LOANS[n];
    if (!r || !a) { s.art = null; return listHtml(n); }
    var to = l && l.primary ? l.primary : { name: clientName(n), mailingAddress: '' };
    return '<section class="tp tp--art" aria-labelledby="tp-art-h" data-tp-loan="' + esc(n) + '" data-tp-view="art">' +
      '<nav class="tp-crumb" aria-label="Breadcrumb"><ol>' +
        '<li><button type="button" class="tp-crumb-b" data-tp="crumbList" data-tp-key="crumb:list">Touchpoint history</button></li>' +
        '<li><button type="button" class="tp-crumb-b" data-tp="crumbRow" data-tp-key="crumb:row">' + esc(title(r)) + '</button></li>' +
        '<li aria-current="page">' + esc(a.name) + '</li></ol></nav>' +
      '<div class="tp-art-h"><span class="tp-card-i tp-card-i--lg">' + ico(a.icon || 'description') + '</span>' +
        '<div><h2 class="tp-h" id="tp-art-h" tabindex="-1">' + esc(a.name) + '</h2>' +
        '<p class="tp-art-s">' + esc([a.kind, mmddyy(a.date), prefix(r)].join(' · ')) + '</p></div></div>' +
      '<article class="tp-doc" aria-label="' + esc(a.name) + ' preview">' +
        '<div class="tp-doc-top"><span class="tp-doc-from">' + esc(a.from || srv(n)) + '</span><span class="tp-doc-date">' + esc(mmddyy(a.date)) + '</span></div>' +
        (a.from ? '' : '<div class="tp-doc-to"><span>' + esc(to.name) + '</span>' + (to.mailingAddress ? '<span>' + esc(to.mailingAddress) + '</span>' : '') + '<span>Loan ' + esc(n) + '</span></div>') +
        '<h3 class="tp-doc-t">' + esc(a.name) + '</h3>' +
        '<dl class="tp-doc-rows">' + a.rows.map(function (x) {
          return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + (x[2] ? '<span class="tp-doc-n">' + esc(x[2]) + '</span>' : '') + '</dd></div>';
        }).join('') + '</dl>' +
        '<p class="tp-doc-foot">Preview · synthetic content for the prototype</p></article>' +
      '<div class="tp-art-f"><button type="button" class="nova-button nova-button--secondary nova-button--small" data-tp="crumbRow" data-tp-key="art:back">' + ico('arrow_back') + 'Back to touchpoint</button></div></section>';
  }

  /* ---------- paint ---------- */
  function hostOk() { var el = MOUNT.el; if (!el) return false; if (D.body && D.body.contains && !D.body.contains(el)) return false; return true; }
  function q(sel) { return MOUNT.el && MOUNT.el.querySelector ? MOUNT.el.querySelector(sel) : null; }
  function activeKey() { var a = D.activeElement; return a && a.getAttribute && MOUNT.el && MOUNT.el.contains && MOUNT.el.contains(a) ? a.getAttribute('data-tp-key') : null; }
  function focusKey(k) { var el = k ? q('[data-tp-key="' + k + '"]') : null; if (el && el.focus) el.focus(); return !!el; }
  function scrollTo(k) { var el = k ? q('[data-tp-key="' + k + '"]') : null; if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { el.scrollIntoView(); } } }
  function paint(part, refocus) {
    if (!hostOk()) return;
    var k = refocus || activeKey(), n = MOUNT.n, s = st(n);
    if (s.art) { MOUNT.el.innerHTML = artViewHtml(n); closeDD(); return; }
    var res = D.getElementById('tp-results');
    if (part === 'results' && res && q('[data-tp-view="list"]')) res.innerHTML = resultsHtml(n);
    else if (part === 'filters' && res && q('[data-tp-view="list"]')) { var c = D.getElementById('tp-chips'); if (c) c.innerHTML = chipsHtml(n); res.innerHTML = resultsHtml(n); }
    else MOUNT.el.innerHTML = listHtml(n);
    if (k && k !== 'q') focusKey(k);
  }

  /* typeahead: only the listbox and the input's ARIA change; the input itself is never re-rendered */
  function inputEl() { return D.getElementById('tp-q'); }
  function ddEl() { return D.getElementById('tp-dd'); }
  function setX(on) { var x = q('.tp-q-x'); if (!x) return; if (on) x.removeAttribute('hidden'); else x.setAttribute('hidden', ''); }
  function openDD(text) {
    TA.items = matches(MOUNT.n, text); TA.active = TA.items.length ? 0 : -1; TA.open = !!terms(text).length;
    var dd = ddEl(), i = inputEl(); if (!dd || !i) return;
    dd.innerHTML = TA.open ? ddHtml() : '';
    if (dd.classList) dd.classList[TA.open ? 'add' : 'remove']('nova-menu--open');
    i.setAttribute('aria-expanded', TA.open ? 'true' : 'false');
    if (TA.active >= 0) i.setAttribute('aria-activedescendant', 'tp-opt-' + TA.active); else i.removeAttribute('aria-activedescendant');
  }
  function closeDD() {
    TA.open = false; TA.items = []; TA.active = -1;
    var dd = ddEl(), i = inputEl();
    if (dd) { dd.innerHTML = ''; if (dd.classList) dd.classList.remove('nova-menu--open'); }
    if (i) { i.setAttribute('aria-expanded', 'false'); i.removeAttribute('aria-activedescendant'); }
  }
  function moveActive(d) {
    if (!TA.open || !TA.items.length) return;
    TA.active = (TA.active + d + TA.items.length) % TA.items.length;
    var dd = ddEl(), i = inputEl(); if (dd) dd.innerHTML = ddHtml();
    if (i) i.setAttribute('aria-activedescendant', 'tp-opt-' + TA.active);
    var o = D.getElementById('tp-opt-' + TA.active); if (o && o.scrollIntoView) { try { o.scrollIntoView({ block: 'nearest' }); } catch (e) { /* stub */ } }
  }

  /* ---------- actions (also exposed for tests as window.tpAct) ---------- */
  var ACT = {
    chip: function (v) {
      var s = st(MOUNT.n); if (!CHIPS.some(function (c) { return c[0] === v; })) v = 'all';
      s.chip = v; s.page = 1; paint('filters', 'chip:' + v);
    },
    sort: function () { var s = st(MOUNT.n); s.dir = s.dir === 'asc' ? 'desc' : 'asc'; s.page = 1; paint('results', 'sort'); },
    page: function (v) { var s = st(MOUNT.n); s.page = +v || 1; paint('results', 'row:' + ((view(MOUNT.n).shown[0] || {}).id || '')); },
    toggle: function (id) {
      var s = st(MOUNT.n);
      if (s.expanded[id]) delete s.expanded[id]; else s.expanded[id] = true;
      paint('results', 'row:' + id);
    },
    /* show a touchpoint: switch to All if the chip hides it, page to it, expand it */
    reveal: function (id, keepFocus) {
      var n = MOUNT.n, s = st(n); if (!findRow(n, id)) return false;
      s.expanded[id] = true;
      var p = pageOf(n, id);
      if (!p) { s.chip = 'all'; p = pageOf(n, id); }
      s.page = p || 1; paint('filters', keepFocus ? 'q' : 'row:' + id); scrollTo('row:' + id);
      return true;
    },
    jump: function (id) { ACT.reveal(id); },
    typed: function (text) { var s = st(MOUNT.n); s.q = String(text || ''); s.pick = null; setX(!!s.q); openDD(s.q); },
    pick: function (id) {
      var n = MOUNT.n, s = st(n), r = findRow(n, id); if (!r) return;
      s.pick = id; s.q = title(r);
      var i = inputEl(); if (i) i.value = s.q; setX(true); closeDD();
      ACT.reveal(id, false);
    },
    qclear: function () {
      var s = st(MOUNT.n), had = s.pick; s.q = ''; s.pick = null;
      var i = inputEl(); if (i) i.value = ''; setX(false); closeDD();
      if (had) paint('results', 'q');
      i = inputEl(); if (i && i.focus) i.focus();
    },
    art: function (v) {
      var p = String(v).split('|'), s = st(MOUNT.n);
      if (!findRow(MOUNT.n, p[0]) || !art(p[1])) return;
      s.expanded[p[0]] = true; s.art = { row: p[0], doc: p[1] };
      paint('all'); var h = D.getElementById('tp-art-h'); if (h && h.focus) h.focus();
      if (MOUNT.el && MOUNT.el.scrollIntoView) { try { MOUNT.el.scrollIntoView({ block: 'start' }); } catch (e) { /* stub */ } }
    },
    crumbRow: function () {
      var s = st(MOUNT.n), a = s.art; if (!a) return;
      s.art = null; s.expanded[a.row] = true; paint('all', 'art:' + a.row + ':' + a.doc); scrollTo('row:' + a.row);
    },
    crumbList: function () {
      var s = st(MOUNT.n), a = s.art; if (!a) return;
      s.art = null; paint('all', 'row:' + a.row); scrollTo('row:' + a.row);
    }
  };

  /* ---------- events (delegated on document; only [data-tp] inside the mounted host) ---------- */
  function inHost(el) { return MOUNT.el && MOUNT.el.contains && MOUNT.el.contains(el); }
  D.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (TA.open && !(t.closest('.tp-search'))) closeDD();
    var el = t.closest('[data-tp]'); if (!el || !inHost(el)) return;
    if (el.hasAttribute && el.hasAttribute('disabled')) return;
    var fn = ACT[el.getAttribute('data-tp')]; if (!fn) return;
    /* a click on a button inside an expanded row's detail must not also toggle the row */
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
    fn(el.getAttribute('data-v'));
  });
  D.addEventListener('mousedown', function (e) { /* keep focus in the input while picking an option */
    var t = e.target; if (t && t.closest && t.closest('.tp-opt') && inHost(t) && e.preventDefault) e.preventDefault();
  });
  D.addEventListener('input', function (e) {
    var t = e.target; if (!t || !t.getAttribute || t.getAttribute('data-tp-input') !== 'q' || !inHost(t)) return;
    ACT.typed(t.value);
  });
  D.addEventListener('focusin', function (e) {
    var t = e.target; if (!t || !t.getAttribute || t.getAttribute('data-tp-input') !== 'q' || !inHost(t)) return;
    if (t.value && !st(MOUNT.n).pick) openDD(t.value);
  });
  D.addEventListener('keydown', function (e) {
    var t = e.target; if (!t || !t.closest || !inHost(t)) return;
    if (t.getAttribute && t.getAttribute('data-tp-input') === 'q') {
      if (e.key === 'ArrowDown') { if (e.preventDefault) e.preventDefault(); if (!TA.open && t.value) openDD(t.value); else moveActive(1); return; }
      if (e.key === 'ArrowUp') { if (e.preventDefault) e.preventDefault(); moveActive(-1); return; }
      if (e.key === 'Enter') { if (TA.open && TA.active >= 0) { if (e.preventDefault) e.preventDefault(); ACT.pick(TA.items[TA.active].id); } return; }
      if (e.key === 'Escape') { if (e.preventDefault) e.preventDefault(); if (TA.open) closeDD(); else if (t.value) ACT.qclear(); return; }
      if (e.key === 'Tab') { closeDD(); return; }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && t.classList && t.classList.contains('tp-exp')) {
      if (e.preventDefault) e.preventDefault(); ACT.toggle(t.getAttribute('data-v')); return;
    }
    if (e.key === 'Escape' && st(MOUNT.n).art) { if (e.preventDefault) e.preventDefault(); ACT.crumbRow(); }
  });

  /* ---------- new rows from this call ---------- */
  TM.on('send', function (rec) {
    if (!rec || !rec.doc) return;
    var n = rec.loan || TM.currentLoanNumber, names = (rec.recipients || []).map(function (r) { return r.name; });
    var who = names.length > 2 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : names.join(' & ');
    var at = rec.at || (TM.clock ? TM.clock() : ''), list = EXTRA[n] = EXTRA[n] || [];
    (rec.methods || []).forEach(function (m) {
      var base = { date: TODAY, time: at, agent: AG.you, codes: ['CDOC'], fresh: true, freshSeq: ++seq, label: (rec.doc.name || 'Document') + ' sent',
        summary: 'Sent on this call to ' + (who || 'the client') + '. CDOC logged.' };
      var o = m === 'email' ? Object.assign(base, { id: 'snd' + seq, channel: 'email', direction: 'out', sub: 'Sent' })
        : m === 'text' ? Object.assign(base, { id: 'snd' + seq, channel: 'sms', direction: 'out', sub: 'Delivered' })
          : Object.assign(base, { id: 'snd' + seq, channel: 'letter', direction: 'out', sub: 'Mailed' });
      list.unshift(tp(o));
    });
    if (MOUNT.n === n && !st(n).art) paint('results');
  });
  TM.on('case', function (rec, l) {
    if (rec && rec.id) { CASE_AT[rec.id] = TM.clock ? TM.clock() : ''; CASE_AT[rec.id + '#'] = ++seq; }
    if (l && MOUNT.n === l.number && !st(l.number).art) paint('results');
  });

  /* ---------- contract ---------- */
  TM.feature('tab:touchpoints', {
    mount: function (el, ctx) {
      ctx = ctx || {};
      var n = ctx.loan && ctx.loan.number ? ctx.loan.number : TM.currentLoanNumber;
      MOUNT = { el: el, ctx: ctx, n: n }; TA.open = false; TA.items = []; TA.active = -1;
      el.innerHTML = st(n).art ? artViewHtml(n) : listHtml(n);
      return { loan: n };
    },
    onShow: function () { if (MOUNT.el && !st(MOUNT.n).art) paint('results'); }
  });

  /* test hooks */
  W.tpState = { get loan() { return MOUNT.n; }, state: function (n) { return st(n || MOUNT.n); }, rows: function (n) { return rowsFor(n || MOUNT.n); },
    view: function (n) { return view(n || MOUNT.n); }, title: title, agentText: agentText, matches: function (t) { return matches(MOUNT.n, t); }, TA: TA, PAGE: PAGE, ART: ART };
  W.tpAct = ACT;
})();
