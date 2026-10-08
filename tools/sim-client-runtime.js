/* Injected into each per-client prototype build as window.SIM_CLIENT.
   The prototype's own modules read it: the right panel's Context pane (context), the live call summary
   (summary) and the playbook opened after verification (playbook). DATA is filled in by the build. */
(function () {
  var DATA = __SIM_CLIENT_DATA__;
  var C = DATA.ctx;

  function sig(row) {
    return '<li class="cx-sig"><span class="cx-sig-d" aria-hidden="true"></span><span class="cx-sig-l">' + row[0] +
      (row[3] ? '<span class="cx-sub">' + row[3] + '</span>' : '') + '</span><span class="cx-sig-v cx-num' + (row[2] ? ' cx-acc' : '') + '">' + row[1] + '</span></li>';
  }
  function stat(c) {
    return '<div class="cx-stat cx-stat--b"><span class="cx-stat-l">' + c[0] + '</span><span class="cx-stat-v cx-num">' + c[1] + '</span><span class="cx-stat-s' +
      (c[4] ? ' cx-acc' : '') + '">' + c[2] + '</span><span class="cx-stat-s">' + c[3] + '</span></div>';
  }
  function item(u, extra) {
    return '<li class="cx-tl-i"><span class="cx-tl-m" aria-hidden="true"></span><div class="cx-tl-b"><span class="cx-tl-d cx-num">' + u[0] + '</span>' +
      '<div class="cx-tl-r"><span class="cx-tl-t">' + u[1] + '</span><span class="cx-tl-v cx-num">' + u[2] + '</span></div>' +
      (u[3] ? '<span class="cx-sub">' + u[3] + '</span>' : '') + (extra || '') + '</div></li>';
  }

  /* h = the right panel's own helpers: { ic, dl, disc, share } */
  function context(h) {
    var chev = h.ic('expand_more').replace('class="nova-icon"', 'class="nova-icon cx-chev"');
    var t = C.taxes, ins = C.insurance;
    return '<div class="cx">' +
      '<div class="cx-why"><div class="cx-lbl">' + h.ic('sparkle') + 'Why they’re calling · ' + C.why[0] + '</div>' +
        '<p class="cx-why-t">' + C.why[1] + '</p><span class="cx-sub">' + C.why[2] + '</span></div>' +
      (C.recap ? '<div class="cx-recap cx-recap--b"><button type="button" class="cx-recap-h" data-shv="cxt" data-v="cx-recap" aria-expanded="false" aria-controls="cx-recap">' +
        '<span class="cx-recap-ic">' + h.ic('sparkle') + '</span><span>Recap</span><span class="cx-recap-s"></span>' + chev + '</button>' +
        '<div class="cx-recap-b" id="cx-recap" hidden>' +
          '<div class="cx-elig"><div class="cx-lbl">' + h.ic('check_circle') + C.recap.label + '</div><p>' + C.recap.elig + '</p></div>' +
          '<div class="cx-tp"><div class="cx-lbl">' + h.ic('chat') + 'Talking points</div><ol>' + C.recap.points.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ol></div>' +
          (C.recap.refer ? '<div class="sim-refer-row">' + referHtml() + '</div>' : '') +
        '</div></div>' : '') +
      '<h4 class="cx-sec"><span>Activity</span></h4><ul class="cx-sigs cx-sigs--b">' + C.activity.map(sig).join('') + '</ul>' +
      '<h4 class="cx-sec"><span>Payments</span>' +
        (DATA.autopay ? '<span class="cx-sec-r cx-ok">' + h.ic('check_circle') + 'Autopay <span class="cx-num">····' + DATA.autopay + '</span></span>' : '<span class="cx-sec-r">No autopay</span>') + '</h4>' +
      '<div class="cx-stats cx-stats--b">' + C.stats.map(stat).join('') + '</div>' +
      '<h4 class="cx-sec"><span>Upcoming changes</span></h4><ol class="cx-tl">' +
        C.upcoming.map(function (u, i) { return item(u, i < 2 ? h.share(i ? 'esc' : 'pay', u[1].toLowerCase()) : ''); }).join('') + '</ol>' +
      '<h4 class="cx-sec"><span>Taxes &amp; insurance</span></h4><div class="cx-list">' +
        h.disc('cx-tax', 'Taxes · ' + t[0], 'Next due ' + t[3].replace(/, \d{4}$/, ''), t[2] + '/yr',
          h.dl([['Taxing authority', t[1]], ['Annual', t[2] + (t[2].indexOf('.') < 0 ? '.00' : ''), 1], ['Next due', t[3]], ['Frequency', 'Semi-annual'], ['Last paid', t[4], 1]])) +
        h.disc('cx-ins', 'Insurance · ' + ins[1], 'Renews ' + ins[4].replace(/, \d{4}$/, ''), ins[2] + '/yr',
          h.dl([['Carrier', ins[0]], ['Premium', ins[2] + '.00', 1], ['Policy', ins[3], 1], ['Type', 'Homeowners HO-3'], ['Renewal', ins[4]], ['Last renewed', ins[5], 1]])) +
      '</div>' +
      '<button type="button" class="shv-link cx-link" data-shv="history">' + h.ic('history') + 'View full touchpoint history</button></div>';
  }

  /* ---------- Refer to Home Loan Expert (Marcus's refinance recap) ---------- */
  var lead = null;
  function referHtml() {
    return lead
      ? '<span class="sim-lead" role="status"><svg class="nova-icon" aria-hidden="true"><use href="#check_circle"></use></svg>Lead #' + lead + '</span>'
      : '<button type="button" class="sim-refer" data-sim-refer="hle">Refer to Home Loan Expert</button>';
  }
  function refer(btn) {
    if (lead) return;
    var n = function (d) { var x = ''; while (x.length < d) x += Math.floor(Math.random() * 10); return x; };
    lead = n(5) + '-' + n(2);
    var row = btn.closest('.sim-refer-row'); if (row) row.innerHTML = referHtml();
    var TM = window.TM;
    if (TM && TM.log) TM.log('Referred to a Home Loan Expert for a refinance review · Lead #' + lead);
    if (window.ccCall && window.ccCall.dial && window.ccCall.state() === 'connected') window.ccCall.dial('hle');
    if (TM && TM.toastSuccess) TM.toastSuccess('Lead #' + lead + ' created · dialing a Home Loan Expert');
  }

  /* ---------- page behaviour ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var r = t.closest('[data-sim-refer]');
    if (r) { e.preventDefault(); refer(r); return; }
    // Mini-Miranda: clicking anywhere on the disclosure checks it off
    var disc = t.closest('.cv-disc__item');
    if (disc && !t.closest('#cv-prov')) { var box = document.getElementById('cv-prov'); if (box) box.click(); }
  }, true);
  var css = document.createElement('style');
  css.textContent =
    '.cv-disc__item{cursor:pointer}' +
    '.sim-refer-row{margin:10px 0 4px}' +
    '.sim-refer{display:inline-flex;align-items:center;height:34px;padding:0 16px;border:0;border-radius:100px;background:var(--nova-gray-800,#111);color:#fff;font:inherit;font-size:14px;font-weight:500;cursor:pointer}' +
    '.sim-refer:hover{background:#000}.sim-refer:focus-visible{outline:2px solid var(--nova-gray-800,#111);outline-offset:2px}' +
    '.sim-lead{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:100px;background:var(--nova-green-50,#e9f5ee);color:var(--nova-green-700,#1d6b3d);font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}' +
    '.sim-lead .nova-icon{width:16px;height:16px;--nova-icon-stroke:currentColor}';
  (document.head || document.documentElement).appendChild(css);

  /* ---------- generic playbooks (neutral guidance built from this client's loan) ---------- */
  var GENERIC = [
    ['t04', 'Property tax increase', ['Confirm the new tax bill is on file', 'Explain that escrow collects next year’s taxes ahead of time', 'Offer an escrow analysis copy'],
      [['Why did my payment go up?', 'Taxes went up, so escrow collects more each month to cover next year’s bill.']]],
    ['p05', 'PMI removal', ['Check the loan type and current loan-to-value', 'Explain the removal requirements', 'Start the PMI removal request if eligible'],
      [['When does PMI come off?', 'It depends on the loan type and the loan-to-value. FHA loans usually keep MIP.']]],
    ['e07', 'Escrow analysis copy', ['Confirm which analysis the client wants', 'Confirm the email or mailing address on file', 'Send the copy'],
      [['How long does it take?', 'Email is immediate. Mail takes 7–10 business days.']]],
    ['p02', 'Payment date change', ['Check that the account is current', 'Explain how the new date affects interest and autopay', 'Submit the date change request'],
      [['Will I be charged a late fee?', 'Not if the payment arrives within the grace period.']]],
    ['e09', 'Remove escrow request', ['Check the loan program allows escrow removal', 'Explain the requirements and the waiver fee', 'Submit the request if eligible'],
      [['Can I pay my own taxes?', 'Only if the loan program allows it and the escrow waiver is approved.']]],
    ['g01', 'Make a payment', ['Confirm the amount and the account to pay from', 'Read back the payment date', 'Give the confirmation number'],
      [['Is there a fee?', 'Online and app payments are free. Phone payments with a representative may have a fee.']]],
    ['g02', 'Payoff quote', ['Confirm the payoff date the client needs', 'Generate the payoff statement', 'Send it by email or mail'],
      [['Why is it more than my balance?', 'It includes interest through the payoff date and any fees.']]],
    ['g03', 'Autopay enrollment', ['Confirm the bank account and draft date', 'Set up or update autopay', 'Read back the first draft date'],
      [['When does it start?', 'With the next payment that is at least 3 business days away.']]],
    ['g04', 'Mailing address change', ['Verify the client', 'Update the mailing address', 'Read the new address back'],
      [['Does this change my property address?', 'No. Only where mail is sent.']]],
    ['g05', 'Late fee waiver', ['Check the payment history', 'Explain the waiver policy', 'Submit the waiver if eligible'],
      [['Can you waive it today?', 'If the history qualifies, the waiver can be submitted on this call.']]],
    ['g06', 'Year-end tax statement (1098)', ['Confirm the tax year', 'Send the 1098 by email or mail'],
      [['When is it available?', 'By January 31 each year.']]],
    ['g07', 'Hardship assistance', ['Listen for the hardship and its expected length', 'Explain the assistance options', 'Transfer to the Loss Mitigation team if needed'],
      [['Will this hurt my credit?', 'It depends on the option. Loss Mitigation explains each one.']]],
    ['g08', 'Loan modification inquiry', ['Explain what a modification changes', 'Check basic eligibility', 'Transfer to the Loss Mitigation team'],
      [['How long does it take?', 'Loss Mitigation reviews the full application, which usually takes a few weeks.']]]
  ];
  if (DATA.keepE01) GENERIC = GENERIC.filter(function (g) { return g[0] !== 'e01'; });
  else GENERIC.unshift(['e01', 'Pay escrow shortage', ['Confirm the shortage amount on the analysis', 'Take the payment or explain how to pay', 'Note the payment so escrow can respread'],
    [['Can I pay part of it?', 'Yes, but the payment only adjusts when the full shortage is paid.']]]);

  function guidance(g) {
    return {
      tiles: [
        { icon: 'check', label: 'Loan status', value: 'Current', sub: '' },
        { icon: 'calendar_clock', label: 'Next payment', value: DATA.nextPay.amount, sub: '' },
        { icon: 'attach_money', label: 'Autopay', value: DATA.autopay ? 'On' : 'Off', sub: '' }
      ],
      say: g[2].map(function (t) { return { text: t, ka: '' }; }),
      asks: g[3].map(function (a) { return { q: a[0], a: a[1], ka: '' }; }),
      edges: [{ lead: 'Not sure?', text: 'Check the knowledge base or ask a supervisor before committing to anything.', ka: '' }],
      sources: [],
      actions: [{ label: 'Add a note', toast: 'Note added' }, { label: 'Create a case', toast: 'Case created' }]
    };
  }
  function addPlaybooks(catalog, table) {
    GENERIC.forEach(function (g) {
      if (!catalog.some(function (c) { return c[0] === g[0]; })) catalog.push([g[0], g[1]]);
      table[g[0]] = guidance(g);
    });
  }
  var genericCatalog = GENERIC.filter(function (g) { return g[0].charAt(0) === 'g'; }).map(function (g) { return [g[0], g[1]]; });

  window.SIM_CLIENT = { id: DATA.id, playbook: DATA.playbook, summary: DATA.summary, context: context,
    addPlaybooks: addPlaybooks, genericCatalog: genericCatalog };
})();
