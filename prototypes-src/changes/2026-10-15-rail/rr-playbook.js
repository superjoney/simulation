/* Escrow refund issue · playbook (layout A) — portable module, Oct 15, 2026.
   Self-contained: renders into #pg-body-rr1 when the e11 playbook is open, puts
   "View escrow analysis" in #pg-title-act next to the page title, and owns its own
   click handling (data-rr / data-ea / .rrv). Nothing here touches other playbooks.
   Hook: call window.rrRender(key) at the end of pgRender(key). If that call is missing,
   the module also watches #pg-title and renders when the title is "Escrow refund issue".
   Needs: the Nova sprite (#verified_user, #check, #arrow_forward, #lightbulb, #chat, #sparkle,
   #lock, #expand_more, #document, #close) and the base pg-act / pg-e11-acc / pg-ka / nova-chip /
   nova-tag / nova-button styles from the AI Desktop template. All figures are synthetic. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function clock() { return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function ico(n) { return '<svg class="nova-icon" aria-hidden="true"><use href="#' + n + '"></use></svg>'; }
  function KA(id) { return '<a class="pg-ka" href="https://hoot.sagentapps.com/knowledgebase/article/' + id + '" target="_blank" rel="noopener" title="' + id + '">' + id + '</a>'; }
  var UNV = '<span class="rz-unv" title="Not in the CR training or HOOT articles reviewed. Confirm with an SME.">Needs SME</span>';

  function rt(v, tip, cls) {
    var o = typeof tip === 'object' ? tip : null, hov = o ? (o.hover || o.t) : tip;
    return '<button type="button" class="rrv' + (cls ? ' ' + cls : '') + '" data-tip="' + esc(hov) + '" aria-haspopup="dialog" aria-expanded="false"' +
      (o ? ' data-pop="' + esc(JSON.stringify(o)) + '"' : '') + '>' + v + '</button>';
  }
  /* string tips → a details object: source-like parts go behind Show source; "a + b = c" parts become math rows */
  var SRC_RE = /iAssist|→|Transaction History|Escrow Analysis|Dynamics|[A-Z]{3,}_[A-Z_]+|mapped|cushion line/;
  function popFromString(t) {
    var parts = String(t).split(' · '), src = [], body = [], math = [];
    parts.forEach(function (x) {
      if (!math.length && /=/.test(x) && /\$|\d/.test(x)) {
        var lr = x.split(/\s=\s/); if (lr.length === 2) {
          var terms = lr[0].split(/\s([+−×÷-])\s/), tot = lr[1];
          var cell = function (raw, op) { var m = raw.match(/[-+]?\$?[\d,]+(\.\d+)?(\/\w+)?/), val = m ? m[0] : raw, lab = m ? raw.replace(m[0], '').trim() : '';
            return [(op ? op + ' ' : '') + lab, val, op ? 1 : 0]; };
          math.push(cell(terms[0]));
          for (var i = 1; i < terms.length; i += 2) math.push(cell(terms[i + 1], terms[i]));
          var tm = tot.match(/[-+]?\$?[\d,]+(\.\d+)?(\/\w+)?/); math.push(['= ' + (tm ? tot.replace(tm[0], '').trim() || 'Total' : 'Total'), tm ? tm[0] : tot, 2]);
          math.forEach(function (r) { r[0] = r[0].replace(/^([+−×÷-]) $/, '$1 '); });
          return;
        }
      }
      (SRC_RE.test(x) ? src : body).push(x);
    });
    return { math: math, note: body.join(' · '), src: src.join(' · ') };
  }
  var POP = null, POPFOR = null;
  function popClose(refocus) { if (!POP || POP.hidden) return; POP.hidden = true; if (POPFOR) { POPFOR.setAttribute('aria-expanded', 'false'); if (refocus) POPFOR.focus(); } POPFOR = null; }
  function popOpen(el) {
    if (POPFOR === el) { popClose(); return; }
    popClose();
    if (!POP) { POP = document.createElement('div'); POP.className = 'rrp-pop'; POP.setAttribute('role', 'dialog'); POP.hidden = true; document.body.appendChild(POP); }
    var raw = el.getAttribute('data-pop'), o = raw ? JSON.parse(raw) : popFromString(el.getAttribute('data-tip') || '');
    var title = o.t || '';
    POP.innerHTML = (title ? '<div class="rrp-pop-t">' + esc(title) + '</div>' : '') +
      (o.math && o.math.length ? '<div class="rrp-pop-math">' + o.math.map(function (r) { var c = r[2] === 1 ? ' class="op"' : r[2] === 2 ? ' class="tot"' : ''; return '<span' + c + '>' + esc(r[0]) + '</span><span' + (r[2] === 2 ? ' class="tot"' : '') + '>' + esc(r[1]) + '</span>'; }).join('') + '</div>' : '') +
      (o.note ? '<p class="rrp-pop-n">' + esc(o.note) + '</p>' : '') +
      (o.src ? (o.note || (o.math && o.math.length) ? '<div class="rrp-pop-s"><button type="button" class="rrp-pop-sb">Show source</button><div class="rrp-pop-sv" hidden><span>Source</span>' + esc(o.src) + '</div></div>'
        : '<div class="rrp-pop-sv"><span>Source</span>' + esc(o.src) + '</div>') : '');
    POP.setAttribute('aria-label', title || 'Details'); POP.hidden = false; POPFOR = el; el.setAttribute('aria-expanded', 'true');
    var r = el.getBoundingClientRect(), w = POP.offsetWidth || 320, h = POP.offsetHeight || 200, vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    POP.style.left = Math.min(Math.max(12, r.left), vw - w - 12) + 'px';
    POP.style.top = (r.bottom + 8 + h > vh - 8 && r.top - 8 - h > 8 ? r.top - 8 - h : r.bottom + 8) + 'px';
  }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var sb = t.closest('.rrp-pop-sb'); if (sb) { var v = sb.nextSibling; v.hidden = false; sb.remove(); return; }
    var el = t.closest('.rrv[data-tip]');
    if (el) { popOpen(el); return; }
    if (POP && !POP.contains(t)) popClose();
  });
  /* v35 · one floating Nova tooltip for every underlined value. Fixed-position so the rounded cards
     (overflow:hidden) never clip it; flips below near the top and stays inside the viewport. */

  function toRail(line, codes) {
    codes = codes || [];
    if (window.aiqxLog) window.aiqxLog(line);
    else { var cs = $('aiqx-call-summary'); if (cs) cs.insertAdjacentHTML('beforeend', '<div class="rrp-log">' + esc(line) + '</div>'); }
    codes.forEach(function (c) { if (window.aiqxAddCode) window.aiqxAddCode(c); });
    if (window.pgToast) window.pgToast(codes.length ? codes.join(' + ') + ' added · logged to Call summary' : 'Logged to Call summary');
  }

  /* ---------- building blocks ---------- */
  function btn(label, act, kind, data) {
    var cls = 'pg-act' + (kind === 'primary' ? ' pg-act--primary' : kind === 'ghost' ? ' rz-btn--ghost' : '');
    return '<button type="button" class="' + cls + '" data-rr="' + act + '"' + (data ? ' data-v="' + esc(data) + '"' : '') + '>' + esc(label) + '</button>';
  }
  function seg(act, opts, val, label) {
    return '<div class="rz-seg" role="group" aria-label="' + esc(label) + '">' + opts.map(function (o) {
      return '<button type="button" data-rr="' + act + '" data-v="' + o[0] + '" aria-pressed="' + (o[0] === val) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function running(t) { return '<div class="rz-running" role="status">' + esc(t) + '</div>'; }
  /* step: {title, opt, sys, status: locked|current|done, locked, body, done} */

  function acc(title, rows) {
    return '<details class="pg-e11-acc"><summary class="pg-e11-sum"><span>' + title + '</span><svg class="nova-icon pg-e11-chev"><use href="#expand_more"></use></svg></summary><div class="pg-e11-acc-body">' +
      rows.map(function (r) { return '<div class="pg-e11-scn"><div class="pg-e11-scn-h">' + r[0] + '</div><p class="pg-e11-scn-p">' + r[1] + '</p></div>'; }).join('') + '</div></details>';
  }

  function ctlbar(inner) { return '<div class="pg-e11-brandbar" title="Design control — not in the TM interface">' + inner + '</div>'; }
  function ctl(label, act, on, data) {
    return '<button type="button" class="pg-e11-bseg' + (on ? ' pg-e11-bseg--on' : '') + '" data-rr="' + act + '"' + (data ? ' data-v="' + data + '"' : '') + ' title="Design control — not in the TM interface">' + label + '</button>';
  }
  var SEP = '<span class="pg-e11-bsep">·</span>';

  var ADDR0 = { street: '428 Maple Ave', unit: '', city: 'Boulder', state: 'CO', zip: '90301' };
  function aLine1(a) { return a.street + (a.unit ? ', ' + a.unit : ''); }
  function aShort(a) { return aLine1(a) + ', ' + a.city + ', ' + a.state; }
  function aFull(a) { return aShort(a) + ' ' + a.zip; }

  var A_FIELDS = [
    ['street', 'Street address', 'rz-f-full', 'address-line1', ''],
    ['unit', 'Apt, suite or unit · optional', 'rz-f-full', 'address-line2', ''],
    ['city', 'City', 'rz-f-city', 'address-level2', ''],
    ['state', 'State', 'rz-f-st', 'address-level1', ' maxlength="2"'],
    ['zip', 'ZIP code', 'rz-f-zip', 'postal-code', ' inputmode="numeric" maxlength="10"']
  ];
  function addrForm(d, errs) {
    return '<div class="rz-form rrp-form" role="group" aria-label="New mailing address">' + A_FIELDS.map(function (f) {
      var id = 'rr-a-' + f[0], err = errs[f[0]];
      return '<div class="rz-f ' + f[2] + '"><label for="' + id + '">' + f[1] + '</label>' +
        '<input class="rz-field" id="' + id + '" type="text" autocomplete="' + f[3] + '" value="' + esc(d[f[0]] || '') + '"' + f[4] +
        (err ? ' aria-invalid="true" aria-describedby="' + id + '-err"' : '') + '>' +
        (err ? '<span class="rz-err" id="' + id + '-err">' + err + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function readDraft() {
    var d = {};
    A_FIELDS.forEach(function (f) { var el = $('rr-a-' + f[0]); d[f[0]] = el ? String(el.value || '').trim() : ''; });
    d.state = d.state.toUpperCase();
    return d;
  }
  function checkDraft(d) {
    var e = {};
    if (!d.street) e.street = 'Enter the street address.';
    if (!d.city) e.city = 'Enter the city.';
    if (!/^[A-Z]{2}$/.test(d.state)) e.state = 'Use the 2-letter state code.';
    if (!/^\d{5}(-\d{4})?$/.test(d.zip)) e.zip = 'Use 5 digits, or ZIP+4.';
    return e;
  }

  function rrFresh() { return { addr: null, adr: Object.assign({}, ADDR0), draft: null, errs: {}, deliv: 'mail', act: 'ready', coach: true, crit: false, told: false, note: false, open: {}, show: { say: true, tip: true, ai: true } }; }
  var rr = rrFresh();
  var RR_DELIV = {
    mail:  { label: 'Standard mail', note: 'Standard postage · no fee', time: '5 business days, plus mail time', say: 'Standard mail usually takes 5 business days plus mail time.' },
    fedex: { label: 'FedEx', note: 'About $7, varies by address ' + UNV, time: '5 business days, plus FedEx transit', say: 'FedEx gets it to you faster once it’s processed. There’s a fee of about $7.' },
    wire:  { label: 'Wire', note: 'Fee and eligibility ' + UNV, time: UNV, say: 'I can check whether a wire is available for this refund.' }
  };
  function rrLayer(kind, html) {
    var m = { tip: ['lightbulb', 'Tip'], say: ['chat', 'Talking points'], ai: ['sparkle', 'Assist'] }[kind];
    return '<div class="rr-layer rr-layer--' + kind + '"><div class="rr-layer-h">' + ico(m[0]) + '<span>' + m[1] + '</span>' + (kind === 'ai' ? '<span class="rr-ai-tag">AI · verify before acting</span>' : '') + '</div><div class="rr-layer-b">' + html + '</div></div>';
  }
  /* v36 · Assist gives the recommendation only. No case-note draft: each step writes itself to the Call summary. */
  function rrAssist() {
    return rrLayer('ai', '<p>Standard mail fits: the address is confirmed and nothing is time-sensitive. Offer FedEx only if the client needs it sooner.</p>');
  }
  function rrCoach(html) { return rr.coach ? html : ''; }
  function rrShow(kind, html) { return rr.coach && rr.show[kind] ? html : ''; }
  function rrToggle() { return '<button type="button" class="rr-tog" data-rr="rrcoach" aria-pressed="' + rr.coach + '"><span class="rr-sw" aria-hidden="true"></span>Talking points &amp; tips</button>'; }
  function rrEq(labelsBelow) {
    function term(l, v, cls) { return '<div class="rr-term' + (cls ? ' ' + cls : '') + '">' + (labelsBelow ? '' : '<span class="rr-tl">' + l + '</span>') + '<span class="rr-tv">' + v + '</span>' + (labelsBelow ? '<span class="rr-tl">' + l + '</span>' : '') + '</div>'; }
    return '<div class="rr-eq">' + term('Balance at analysis', rt('$1,491.00', 'Escrow balance at the Jul 28, 2026 analysis · synthetic, confirm the source')) + '<span class="rr-op">−</span>' +
      term('Kept as cushion', rt('$206.40', 'Cushion kept for next year · Escrow Analysis · cushion line')) + '<span class="rr-op">=</span>' +
      term('Refund · check 0041887', rt('$1,284.60', '$1,491.00 − $206.40 · surplus over $50 and account current, so it was refunded (KA-01215)'), 'rr-res') + '</div>';
  }
  var RR_CHECKS = ['Not cashed', 'Account current', 'No prior stop-pay on file'];
  /* v32 · closed steps can be expanded (review) and, where it still makes sense, modified.
     Order inside an open step: header → tips, talking points, Assist → the work (fields, rows, confirm). */
  /* v36 · "Modify" while the step can still change; "View" once it's locked (step 1 after the reissue, step 2 always once placed). */
  function rrCanEdit(n) { return n === 1 && rr.act !== 'done'; }
  function rrToggleBtn(n) { var o = !!rr.open[n]; return '<button type="button" class="rr-expand" data-rr="rropen" data-v="' + n + '" aria-expanded="' + o + '">' + (o ? 'Hide' : rrCanEdit(n) ? 'Modify' : 'View') + ico('expand_more') + '</button>'; }
  function rrStep1(card) {
    var A = rr.adr, ok = rr.addr === 'ok' || rr.addr === 'updated', placed = rr.act === 'done';
    var title = '<span class="rr-st-t">Confirm the mailing address</span>';
    if (ok && !rr.open[1]) return { done: true, html: title + (card === 'a' ? '<span class="rr-st-r">' + esc(aFull(A)) + '</span>' : '') + rrToggleBtn(1) +
      (card === 'a' ? '' : '<div class="rr-done">' + ico('check') + (rr.addr === 'updated' ? 'Address updated · ' : 'Confirmed with client · ') + esc(aFull(A)) + '</div>') };
    var layers = ok && rr.addr !== 'edit' ? '' : rrShow('say', rrLayer('say', '“I have your mailing address as ' + esc(aLine1(A)) + ', ' + esc(A.city) + '. Is that still the best place to send it?”'));
    var work;
    if (rr.addr === 'edit') work = addrForm(rr.draft || A, rr.errs) + (Object.keys(rr.errs).length ? '<p class="rz-err" role="alert" style="margin:0">Fix the highlighted fields, then save.</p>' : '') +
      '<div class="rz-acts">' + btn('Save new address', 'rrsave', 'primary') + btn('Cancel', 'rrcancel', 'ghost') + '<span class="rz-hint">Nothing is saved until you confirm.</span></div>';
    else if (rr.addr === 'saving') work = running('Saving the address…');
    else if (ok && placed) work = '<div class="rr-addr">' + esc(aLine1(A)) + '<br>' + esc(A.city + ', ' + A.state + ' ' + A.zip) + '<span class="rz-hint">' + (rr.addr === 'updated' ? 'Updated on this call.' : 'Confirmed with the client.') + '</span></div>' +
      '<p class="rr-lock">' + ico('lock') + 'The new check is already requested to this address. To change it now, escalate to Escrow research.</p>';
    else if (ok) work = '<div class="rr-addr">' + esc(aLine1(A)) + '<br>' + esc(A.city + ', ' + A.state + ' ' + A.zip) + '<span class="rz-hint">' + (rr.addr === 'updated' ? 'Updated on this call.' : 'Confirmed with the client.') + '</span></div>' +
      '<div class="rz-acts">' + btn('It’s changed', 'rraddr', 'ghost', 'edit') + '</div>';
    else work = '<div class="rr-addr">' + esc(aLine1(A)) + '<br>' + esc(A.city + ', ' + A.state + ' ' + A.zip) + '<span class="rz-hint">On file. Read it back to the client.</span></div>' +
      '<div class="rz-acts">' + btn('Client confirmed', 'rraddr', 'primary', 'ok') + btn('It’s changed', 'rraddr', 'ghost', 'edit') + '</div>';
    return { done: ok, open: ok, html: title + (ok ? rrToggleBtn(1) : '') + '<div class="rr-st-b">' + (layers ? '<div class="rr-layers">' + layers + '</div>' : '') + work + '</div>' };
  }
  function rrRows(d, A) {
    return '<dl class="rr-rows">' +
      '<div><dt>Stop</dt><dd>Check ' + rt('0041887', 'iAssist → Transaction History → Type: Escrow → overage disbursement · Ref = check no. · Payee = JOHNSON') + ' · ' + rt('$1,284.60', 'REFUND_CHECK_AMOUNT') + '</dd></div>' +
      '<div><dt>Reissue to</dt><dd>' + esc(aFull(A)) + '<span class="rr-note">' + (rr.addr === 'updated' ? 'Updated with the client in step 1' : 'Confirmed with the client in step 1') + '</span></dd></div>' +
      '<div><dt>Delivery</dt><dd>' + esc(d.label) + '<span class="rr-note">' + d.note + '</span></dd></div>' +
      '<div><dt>Processing</dt><dd>' + d.time + '</dd></div>' +
      (rr.act === 'done' ? '<div><dt>Reference</dt><dd>RI-48213<span class="rr-note">Stop placed ' + (rr.actAt || '') + ' · logged to the Call summary</span></dd></div>' : '') + '</dl>';
  }
  function rrStep2() {
    var d = RR_DELIV[rr.deliv], A = rr.adr, title = '<span class="rr-st-t">Stop payment and reissue</span>';
    if (rr.act === 'done' && !rr.open[2]) return { done: true, html: title + rrToggleBtn(2) + '<div class="rr-done">' + ico('check') + 'Stop placed on 0041887 · new check by ' + esc(d.label.toLowerCase()) + ' · ref RI-48213 <span class="rz-meta">· ' + (rr.actAt || '') + '</span></div>' };
    if (rr.act === 'done') return { done: true, open: true, html: title + rrToggleBtn(2) + '<div class="rr-st-b">' + rrRows(d, A) +
      '<p class="rr-lock">' + ico('lock') + 'The stop is placed and the reissue is requested, so delivery can’t be changed here. To change it, escalate to Escrow research. ' + UNV + '</p></div>' };
    var layers = rrShow('tip', rrLayer('tip', 'Once the stop is placed the original check can’t be cashed. Make sure the client doesn’t still have it. ' + KA('KA-01804'))) +
      rrShow('say', rrLayer('say', '“I can stop the old check and send you a new one today. ' + d.say + '”')) + (rr.show.ai ? rrAssist() : '');
    return { done: false, html: title + '<div class="rr-st-b"><div class="rr-layers">' + layers + '</div>' +
      seg('rrdeliv', [['mail', 'Standard mail'], ['fedex', 'FedEx'], ['wire', 'Wire']], rr.deliv, 'Delivery') + rrRows(d, A) +
      (rr.act === 'running' ? running('Placing the stop…') : '<div class="rz-acts">' + btn('Stop payment and reissue', 'rract', 'primary') + '<span class="rz-hint">Nothing is sent until you confirm.</span></div>') + '</div>' };
  }
  function rrCard(n, st, cls) {
    if (st.open) cls = cls.replace('rr-card--done', 'rr-card--done rr-card--open');
    return '<li class="rr-card ' + cls + '"' + (cls.indexOf('rr-card--now') >= 0 ? ' aria-current="step"' : '') + '><span class="rr-dot' + (st.done ? ' rr-dot--done' : cls.indexOf('rr-card--next') >= 0 ? ' rr-dot--todo' : '') + '">' + (st.done ? ico('check') : n) + '</span><div class="rr-card-b">' + st.html + '</div></li>';
  }
  function rrLocked() { return '<li class="rr-card rr-card--next"><span class="rr-dot rr-dot--todo">2</span><div class="rr-card-b"><span class="rr-st-t">Stop payment and reissue</span><span class="rr-st-r">Confirm the address first</span></div></li>'; }
  function rrAccs() {
    return acc('Nuanced scenarios', [['Check cashed after all?', 'A stop can’t be placed on a cashed check. Send it to research instead.'], ['Client moved?', 'Update the address first (step 1, “It’s changed”), then reissue.']]) +
      acc('If they ask', [['“Why did I get a refund?”', 'The analysis found more in escrow than next year needs, and anything over $50 is refunded. ' + KA('KA-01215')], ['“Can I just deposit the old one?”', 'Not after the stop. Wait for the new check.']]) +
      acc('Edge cases', [['Before day 30', 'Ask the client to wait. Reissue isn’t available yet. ' + KA('KA-01804')], ['After day 180', 'The funds are back in escrow. A new analysis is needed for a fresh figure. ' + KA('KA-01215')]]) +
      acc('Escalate', [['Stop fails or amount disputed', 'Open a Dynamics case for Escrow research.']]);
  }
  function rrCtl() { return ctlbar('<span class="pg-e11-bseg pg-e11-bseg--on" style="cursor:default">RKT · iAssist loan</span>' + SEP + ctl('Reset flow', 'rrreset')); }
  /* ---------- v41 · Escrow analysis (exploration variant 5) in a dialog, opened from the refund reissue playbook ----------
     Synthetic surplus analysis that agrees with the refund: low point $1,491.00 − cushion $206.40 = $1,284.60 surplus,
     refunded by check 0041887 on Aug 4. Payment $1,459.00 matches the overview. */
  var EA = {
    pay:  { pi: [1355.80, 1355.80], base: [103.20, 117.20], spread: [0, 0], disc: [0, 0], round: [0, 0], total: [1459.00, 1473.00] },
    esc:  { tax: [842.40, 1010.40], ins: [396.00, 396.00], mi: [0, 0], other: [0, 0], total: [1238.40, 1406.40] },
    cush: { low: [1491.00, 234.40], cushion: [206.40, 234.40], surplus: [1284.60, 0], shortage: [0, 0] },
    same: {}
  };
  var EA_M = {
    total: { t: 'Total payment', hover: '$1,355.80 P&I + $103.20 base escrow = $1,459.00', math: [['Principal & interest', '$1,355.80', 0], ['+ Base escrow', '$103.20', 1], ['+ Shortage spread', '$0.00', 1], ['= Total payment', '$1,459.00', 2]], note: 'Effective Sep 1, 2026. Discretionary items and rounding are $0.', src: 'iAssist · Escrow Analysis tab · Total Payment Details' },
    base: { t: 'Base escrow payment', hover: '$1,238.40 ÷ 12 = $103.20', math: [['Escrow bills for the year', '$1,238.40', 0], ['÷ Payment frequency', '12', 1], ['= Base escrow', '$103.20', 2]], note: 'Down $14.00 a month because the tax bill dropped $168.00 a year.', src: 'iAssist · Escrow Analysis tab · Base Escrow Payment' },
    change: { t: 'Payment change', hover: '$1,459.00 − $1,473.00 = −$14.00', math: [['New payment', '$1,459.00', 0], ['− Last year', '$1,473.00', 1], ['= Change', '−$14.00', 2]], note: 'All of it is the lower base escrow. P&I is unchanged.', src: 'iAssist · Escrow Analysis tab · Comparison column' },
    tax: { t: 'Tax', hover: 'County tax bill for the year', math: [['This year', '$842.40', 0], ['− Last year', '$1,010.40', 1], ['= Change', '−$168.00', 2]], note: 'Lower county assessment.', src: 'iAssist · Escrow Analysis tab · Disbursements · Tax' },
    bills: { t: 'Escrow bills for the year', hover: '$842.40 tax + $396.00 insurance = $1,238.40', math: [['Tax', '$842.40', 0], ['+ Insurance', '$396.00', 1], ['+ Mortgage insurance', '$0.00', 1], ['+ Other', '$0.00', 1], ['= Total', '$1,238.40', 2]], note: 'Tax down $168.00. Insurance unchanged.', src: 'iAssist · Escrow Analysis tab · Anticipated Disbursements' },
    low: { t: 'Estimated low point', hover: 'Lowest projected balance in the next 12 months', note: 'Lowest projected escrow balance over the next 12 months, before the refund.', src: 'iAssist · Escrow Analysis tab · Projections · low point' },
    cushion: { t: 'Cushion · 2 months', hover: '$103.20 × 2 = $206.40', math: [['Base escrow', '$103.20', 0], ['× Months kept', '2', 1], ['= Cushion', '$206.40', 2]], note: 'RESPA allows up to 2 months of escrow as a cushion.', src: 'iAssist · Escrow Analysis tab · Cushion' },
    surplus: { t: 'Total surplus', hover: '$1,491.00 − $206.40 = $1,284.60', math: [['Est. low point', '$1,491.00', 0], ['− Cushion', '$206.40', 1], ['= Surplus', '$1,284.60', 2]], note: 'Over $50 and the account is current, so it was refunded by check 0041887 on Aug 4, 2026 (KA-01215).', src: 'iAssist · Escrow Analysis tab · Surplus/Shortage' }
  };
  function eaMoney(x) { return (x < 0 ? '−' : '') + '$' + Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function eaDl(x, goodUp) {
    if (!x) return '<span class="ea-dlt ea-dlt--same">—</span>';
    var up = x > 0, good = goodUp ? up : !up;
    return '<span class="ea-dlt ' + (good ? 'ea-dlt--down' : 'ea-dlt--up') + '">' + (up ? '+' : '−') + eaMoney(Math.abs(x)) + '</span>';
  }
  function eaGrp(id, title, summary, rows, hidden) {
    var open = !!EA.same[id];
    var tr = function (label, pr, o) {
      o = o || {}; var x = Math.round((pr[0] - pr[1]) * 100) / 100; if (!x && !open && !o.always) return '';
      return '<tr' + (o.total ? ' class="t"' : '') + '><td>' + label + '</td><td>' + (o.k ? rt(eaMoney(pr[0]), EA_M[o.k]) : eaMoney(pr[0])) + '</td><td class="prior">' + eaMoney(pr[1]) + '</td><td>' + eaDl(x, o.goodUp) + '</td></tr>';
    };
    return '<div class="ea-g"><div class="ea-g-h"><h3>' + title + '</h3><span class="ea-sum">' + summary + '</span></div>' +
      '<table class="ea-tbl"><thead><tr><th scope="col"><span class="ea-sr">Item</span></th><th scope="col">Current</th><th scope="col">Last year</th><th scope="col">Change</th></tr></thead><tbody>' + rows(tr) + '</tbody></table>' +
      (hidden ? '<button type="button" class="ea-link" data-ea="same" data-v="' + id + '" aria-expanded="' + open + '">' + (open ? 'Hide unchanged' : 'Show ' + hidden + ' unchanged') + '</button>' : '') + '</div>';
  }
  function eaBody() {
    var P = EA.pay, E = EA.esc, C = EA.cush;
    return '<div class="ea-hd"><div class="ea-hd-r"><h2 class="ea-answer" id="ea-title">The $1,284.60 surplus was refunded. The payment goes down $14.00 a month from Sep 1.</h2>' +
        '<span class="ea-total">' + rt('$1,459.00', EA_M.total) + ' <span class="ea-dlt ea-dlt--down">−$14.00</span></span></div>' +
        '<div class="ea-meta">Analysis 07/28/2026 · seq 1 · effective Sep 1, 2026 · vs 07/30/2025 · seq 2 · Annual</div></div>' +
      eaGrp('pay', 'Monthly payment', rt('−$14.00', EA_M.change) + ' a month · P&amp;I unchanged', function (tr) { return tr('Principal &amp; interest', P.pi) + tr('Base escrow', P.base, { k: 'base' }) + tr('Shortage spread', P.spread) + tr('Discretionary items', P.disc) + tr('Rounding', P.round) + tr('Total payment', P.total, { total: true, always: true, k: 'total' }); }, 4) +
      eaGrp('esc', 'Escrow bills · year', 'Tax down $168.00 · insurance unchanged', function (tr) { return tr('Tax', E.tax, { k: 'tax' }) + tr('Insurance', E.ins) + tr('Mortgage insurance', E.mi) + tr('Other', E.other) + tr('Total ÷ 12 = base escrow', E.total, { total: true, always: true, k: 'bills' }); }, 3) +
      eaGrp('cush', 'Cushion &amp; surplus', 'Surplus $1,284.60 · over $50, refunded by check · no shortage', function (tr) { return tr('Est. low point', C.low, { k: 'low', goodUp: true }) + tr('Cushion · 2 months', C.cushion, { k: 'cushion' }) + tr('Total shortage', C.shortage) + tr('Total surplus', C.surplus, { total: true, always: true, k: 'surplus', goodUp: true }); }, 1) +
      '<div class="ea-foot">Red costs the client more · green costs less · underlined numbers open their math</div>';
  }
  var EADLG = null, EAFROM = null;
  function eaRender() { if (EADLG) EADLG.querySelector('.ea-scroll').innerHTML = eaBody(); }
  function eaOpen(from) {
    EAFROM = from || null; popClose();
    if (!EADLG) {
      EADLG = document.createElement('div'); EADLG.className = 'ea-ov'; EADLG.hidden = true;
      EADLG.innerHTML = '<div class="ea-dlg" role="dialog" aria-modal="true" aria-labelledby="ea-title"><div class="ea-bar"><span class="ea-bar-t">' + ico('document') + 'Escrow analysis · Jul 28, 2026</span>' +
        '<button type="button" class="ea-x" data-ea="close" aria-label="Close escrow analysis">' + ico('close') + '</button></div><div class="ea-scroll"></div></div>';
      document.body.appendChild(EADLG);
    }
    eaRender(); EADLG.hidden = false; document.body.classList.add('ea-lock');
    var x = EADLG.querySelector('.ea-x'); if (x && x.focus) x.focus();
  }
  function eaClose() { if (!EADLG || EADLG.hidden) return; popClose(); EADLG.hidden = true; document.body.classList.remove('ea-lock'); if (EAFROM && EAFROM.focus) EAFROM.focus(); EAFROM = null; }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var b = t.closest('[data-ea]');
    if (b) { var a = b.getAttribute('data-ea');
      if (a === 'open') { eaOpen(b); return; }
      if (a === 'close') { eaClose(); return; }
      if (a === 'same') { var id = b.getAttribute('data-v'); EA.same[id] = !EA.same[id]; eaRender(); var nb = EADLG.querySelector('[data-ea="same"][data-v="' + id + '"]'); if (nb && nb.focus) nb.focus(); return; } }
    if (EADLG && !EADLG.hidden && t === EADLG) eaClose();
  });
  document.addEventListener('keydown', function (e) {
    if (!EADLG || EADLG.hidden) return;
    if (e.key === 'Escape') { if (POP && !POP.hidden) return; eaClose(); return; }
    if (e.key === 'Tab') { var f = [].slice.call(EADLG.querySelectorAll('button')); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });
  /* v43 · a compact Nova secondary button (32px) so the analysis is easy to find */
  function rrEaLink(cls) { return '<button type="button" class="nova-button nova-button--secondary ea-open' + (cls ? ' ' + cls : '') + '" data-ea="open" aria-haspopup="dialog">' + ico('document') + 'View escrow analysis</button>'; }
  var RR_POP = {"AMT": {"t": "Refund check", "hover": "$1,491.00 − $206.40 cushion = $1,284.60", "math": [["Est. low point", "$1,491.00", 0], ["− Kept as cushion", "$206.40", 1], ["= Refunded", "$1,284.60", 2]], "note": "Surplus over $50 and the account is current, so it was refunded (KA-01215). Escrow balance is now $206.40.", "src": "iAssist · Escrow Analysis tab · Jul 28, 2026 analysis"}, "CHK": {"t": "Check number", "hover": "Ref 0041887 · Payee JOHNSON", "note": "Overage refund check, payee JOHNSON.", "src": "iAssist → Transaction History → Type: Escrow → Ref 0041887"}, "DAYS": {"t": "Days since disbursed", "hover": "Today − Aug 4, 2026 = 40 days", "math": [["Today", "Sep 13, 2026", 0], ["− Disbursed", "Aug 4, 2026", 1], ["= Days since", "40", 2]], "note": "A reissue opens at day 30 (KA-01804).", "src": "iAssist · Transaction History · overage disbursement date"}, "DISB": {"t": "Disbursed", "hover": "Overage refund mailed Aug 4, 2026", "note": "Date the overage refund check was mailed.", "src": "iAssist · Transaction History · overage disbursement date"}, "BACK": {"t": "Funds post back", "hover": "Aug 4, 2026 + 180 days = Jan 31, 2027", "math": [["Disbursed", "Aug 4, 2026", 0], ["+ Uncashed window", "180 days", 1], ["= Posts back to escrow", "Jan 31, 2027", 2]], "note": "If the check is never cashed, the funds go back to escrow (KA-01215).", "src": "KA-01215 · Escrow refunds"}, "LEFT": {"t": "Days left", "hover": "Day 180 − day 40 = 140 days", "math": [["Uncashed window", "Day 180", 0], ["− Today", "Day 40", 1], ["= Days left", "140", 2]], "note": "Reissue before Jan 31, 2027, or the funds post back to escrow.", "src": "KA-01215 · Escrow refunds"}};
  function renderRRA() {
    var host = $('pg-body-rr1'); if (!host) return;
    var s1 = rrStep1('a'), s2 = (s1.done ? rrStep2() : null), placed = rr.act === 'done';
    var cards = rrCard(1, s1, s1.done ? 'rr-card--done' : 'rr-card--now') +
      (s2 ? rrCard(2, s2, s2.done ? 'rr-card--done' : 'rr-card--now') : rrLocked()) +
      '<li class="rr-card ' + (placed && !rr.told ? 'rr-card--now' : rr.told ? 'rr-card--done' : 'rr-card--next') + '"><span class="rr-dot' + (rr.told ? ' rr-dot--done' : placed ? '' : ' rr-dot--todo') + '">' + (rr.told ? ico('check') : '3') + '</span><div class="rr-card-b"><span class="rr-st-t">Tell the client what happens next</span><span class="rr-st-r">Optional · after step 2</span>' +
        (placed && !rr.told ? '<div class="rr-st-b">' + rrLayer('say', '“The old check is stopped, so it can’t be cashed. ' + RR_DELIV[rr.deliv].say + ' If anything changes, call us and reference RI-48213.”') + '<div class="rz-acts">' + btn('Done', 'rrtold', 'ghost') + '</div></div>' : '') + '</div></li>';
  
  /* v34 · header A: one-sentence answer → eligibility + the three checks → three tiles (How much · Disbursed · By when)
       → Resolve row with Display chips (Talking points · Tips · Assist). Math and sources stay on the underlined values. */
    var chip = function (k, l) { return '<button type="button" class="nova-chip nova-chip--outline rr-dchip' + (rr.show[k] ? ' nova-chip--selected' : '') + '" data-rr="rrshow" data-v="' + k + '" aria-pressed="' + rr.show[k] + '">' + (rr.show[k] ? ico('check') : '') + l + '</button>'; };
    var tile = function (k, v, sub, cls) { return '<div class="rr-tile' + (cls ? ' ' + cls : '') + '"><span class="rr-tile-k">' + k + '</span><span class="rr-tile-v">' + v + '</span><span class="rr-tile-s">' + sub + '</span></div>'; };
    host.innerHTML = '<div class="rrp">' + rrCtl() + '<div class="rr rr--a">' +
      '<div class="rr-sec rr-hdr"><h3 class="rr-answer rr-answer--lg">' + (placed ? 'Stopped and reissued. The new check is on its way to Marcus.' : 'Marcus is eligible for a check reissue since the 30-day gate has passed.') + '</h3>' +
        '<div class="rr-elig"><span class="nova-tag nova-tag--success nova-tag--medium rr-elig-s">' + ico('verified_user') + (placed ? 'Reissued' : 'Eligible to reissue') + '</span>' +
          '<ul class="rr-checks rr-checks--row">' + RR_CHECKS.map(function (c) { return '<li>' + ico('check') + c + '</li>'; }).join('') + '</ul></div>' +
        '<div class="rr-tiles">' +
          tile('How much', rt('$1,284.60', RR_POP.AMT),
            'Check no. <b>0041887</b>') +
          tile('Disbursed', rt('40', RR_POP.DAYS) + ' <small>days ago</small>',
            '<b>Aug 4, 2026</b>', 'rr-tile--ok') +
          tile('Reissue until', placed ? '—' : rt('Jan 31, 2027', RR_POP.BACK),
            placed ? 'Day 180 no longer applies' : 'Funds post back in <b>140 days</b>') +
        '</div></div>' +
      '<div class="rr-sec rr-sec--flush"><div class="rr-resolve-h"><div class="rr-eyebrow rr-eyebrow--arrow">' + ico('arrow_forward') + 'Resolve on this call</div>' +
        '<div class="rr-display" role="group" aria-label="Display guidance"><span>Display:</span>' + chip('say', 'Talking points') + chip('tip', 'Tips') + chip('ai', 'Assist') + '</div></div>' +
        '<ol class="rr-cards">' + cards + '</ol></div>' +
      '<div class="rr-accs">' + rrAccs() + '</div></div></div>';
  }

  /* ---------- actions ---------- */
  function later(fn, ms) { setTimeout(function () { fn(); rerender(); }, ms || 900); }
  var ACT = {
    rraddr: function (v) {
      if (v === 'edit') { rr.prevAddr = (rr.addr === 'ok' || rr.addr === 'updated') ? rr.addr : null; rr.addr = 'edit'; rr.draft = Object.assign({}, rr.adr); rr.errs = {}; return; }
      rr.addr = 'ok'; rr.open[1] = false; toRail('Mailing address confirmed with the client for the refund check reissue: ' + aFull(rr.adr) + '.');
    },
    rrsave: function () {
      var d = readDraft(), errs = checkDraft(d);
      rr.draft = d; rr.errs = errs;
      if (Object.keys(errs).length) return;
      var was = aFull(rr.adr); rr.addr = 'saving';
      later(function () { rr.adr = d; rr.draft = null; rr.addr = 'updated'; rr.prevAddr = null; rr.open[1] = false; toRail('Mailing address updated for the refund check reissue: ' + aFull(d) + ' (was ' + was + ').'); }, 700);
    },
    rrcancel: function () { rr.addr = rr.prevAddr || null; rr.prevAddr = null; rr.draft = null; rr.errs = {}; },
    rropen: function (v) { rr.open[v] = !rr.open[v]; },
    rrdeliv: function (v) { rr.deliv = v; },
    rrcoach: function () { rr.coach = !rr.coach; },
    rrshow: function (v) { rr.show[v] = !rr.show[v]; },
    rrtold: function () { rr.told = true; toRail('Told the client what happens next: old check stopped, new check by ' + RR_DELIV[rr.deliv].label.toLowerCase() + ', ref RI-48213.'); },
    rract: function () {
      rr.act = 'running';
      later(function () { rr.act = 'done'; rr.actAt = clock(); toRail('Refund check 0041887 ($1,284.60, mailed Aug 4) not received; not cashed at day 40. Stop placed and reissue requested by ' + RR_DELIV[rr.deliv].label.toLowerCase() + ', ref RI-48213.'); });
    },
    rrreset: function () { rr = rrFresh(); },
  };
  var on = false;
  function rerender() { if (on) renderRRA(); }
  var RR_LABELS = ['Escrow refund issue', 'Escrow refund reissue'];
  function host() {
    var h = $('pg-body-rr1');
    if (!h) { var e11 = $('pg-body-e11'); if (!e11 || !e11.parentNode) return null; h = document.createElement('div'); h.id = 'pg-body-rr1'; e11.parentNode.insertBefore(h, e11); }
    return h;
  }
  function slot() {
    var s = $('pg-title-act');
    if (!s) { var t = $('pg-title'); if (!t || !t.parentNode) return null; s = document.createElement('div'); s.id = 'pg-title-act'; t.parentNode.appendChild(s); }
    return s;
  }
  window.rrRender = function (key) {
    var h = host(), s = slot();
    on = key === 'e11';
    if (document.body && document.body.classList) document.body.classList.toggle('rr-on', on);
    if (h) h.style.display = on ? 'block' : 'none';
    if (s) s.innerHTML = on ? rrEaLink('ea-open--title') : '';
    if (on) renderRRA(); else { popClose(); eaClose(); }
  };
  /* fallback when pgRender has no rrRender hook: follow the page title */
  function watchTitle() {
    var t = $('pg-title'); if (!t || t.__rrWatch || typeof MutationObserver === 'undefined') return;
    t.__rrWatch = true;
    new MutationObserver(function () {
      var isRR = RR_LABELS.indexOf((t.textContent || '').trim()) >= 0;
      if (isRR !== on) window.rrRender(isRR ? 'e11' : null);
    }).observe(t, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchTitle); else watchTitle();
  setTimeout(watchTitle, 1500);

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-rr]') : null;
    if (!el) return;
    var fn = ACT[el.getAttribute('data-rr')];
    if (!fn) return;
    e.preventDefault();
    fn(el.getAttribute('data-v'));
    rerender();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && POP && !POP.hidden) { popClose(true); return; }
    if (e.key !== 'Enter' || !on || !e.target || !e.target.closest || !e.target.closest('.rrp-form')) return;
    e.preventDefault();
    ACT.rrsave(); rerender();
    var first = document.querySelector('.rrp-form [aria-invalid="true"]'); if (first) first.focus();
  });
  document.addEventListener('scroll', function (e) { if (POP && !(e.target && POP.contains && POP.contains(e.target))) popClose(); }, true);
})();
