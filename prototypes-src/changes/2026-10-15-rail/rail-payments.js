/* Right rail · Payments card (Oct 15, 2026). ic(id) returns a Nova sprite <svg>; cx-num = tabular figures. */
  function ic(id) { return '<svg class="nova-icon" aria-hidden="true"><use href="#' + id + '"></use></svg>'; }
  function payCardHtml() {
    var row = function (date, sub, lab, val, cls) { return '<div class="cx-pay-r' + (cls ? ' ' + cls : '') + '"><div class="cx-pay-l"><span class="cx-pay-d"><b>' + date + '</b></span><span class="cx-pay-s">' + sub + '</span></div>' +
      '<div class="cx-pay-v"><span class="cx-pay-k">' + lab + '</span><span class="cx-pay-a cx-num">' + val + '</span></div></div>'; };
    return '<section class="cx-pay" aria-labelledby="cx-pay-h"><h4 class="cx-pay-h" id="cx-pay-h">' + ic('money') + '<span>Payments</span></h4>' +
      row('Nov 1', 'Autopay <span class="cx-num">····4399</span>', 'Next due', '$1,739.02', 'cx-pay-r--next') +
      row('Sept 1', 'Autopay <span class="cx-num">····4399</span><br>+$120 prin.', 'Last paid', '$1,859.02') +
      '<div class="cx-pay-e"><span>Escrow balance</span><span class="cx-pay-a cx-num">$206.40</span></div></section>';
  }
