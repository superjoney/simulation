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
      '<div class="cx-recap cx-recap--b"><button type="button" class="cx-recap-h" data-shv="cxt" data-v="cx-recap" aria-expanded="false" aria-controls="cx-recap">' +
        '<span class="cx-recap-ic">' + h.ic('sparkle') + '</span><span>Recap</span><span class="cx-recap-s"></span>' + chev + '</button>' +
        '<div class="cx-recap-b" id="cx-recap" hidden>' +
          '<div class="cx-elig"><div class="cx-lbl">' + h.ic('check_circle') + 'Eligible for</div><p>' + C.elig + '</p></div>' +
          '<div class="cx-tp"><div class="cx-lbl">' + h.ic('chat') + 'Talking points</div><ol>' + C.points.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ol></div>' +
        '</div></div>' +
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

  window.SIM_CLIENT = { id: DATA.id, playbook: DATA.playbook, summary: DATA.summary, context: context };
})();
