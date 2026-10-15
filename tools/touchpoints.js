// Per-customer touchpoint history for the Touchpoints section (prototypes-src/sections/touchpoints/f-tp.js).
// The section's own rows are written for the template's sample client; the build swaps these in for each
// customer (rows → BASE[P], documents → ART, who handled each seeded case → CASE_BY). The section file
// itself is never edited. Each block is JavaScript source in the section's own vocabulary: tp({...}),
// AG.you / AG.sl / AG.tb / AG.ja (synthetic CRs), srv(P) (the servicer), and ART ids in docs[].
// Facts come from each call script and the figures already on that customer's page (tools/clients.js).
// "Today" is the section's TODAY (2026-10-05).

module.exports = {
  /* Ruth Calloway · escrow refund check never arrived (script). Payment $1,612.40 by autopay from Sep 1
     (P&I $1,509.20 + escrow $103.20; it was $1,626.40 with $117.20 escrow). Analysis Jul 28, 2026: surplus
     $1,284.60 refunded by check 0041887, mailed Aug 4, leaving $412.80 in escrow ($619.20 today, Oct 5, after the
     Sep 1 and Oct 1 payments). The new analysis keeps a $206.40 cushion (its projected low point). */
  ruth: {
    rows: `
    tp({ id: 'r01', channel: 'call', direction: 'in', label: 'Refund check not received', date: '2026-10-05', time: '10:02 AM', agent: AG.you, live: true,
      summary: 'With you now. The escrow refund check for $1,284.60 hasn’t arrived.' }),
    tp({ id: 'r02', channel: 'sms', direction: 'out', label: 'Payment confirmation', date: '2026-10-01', time: '6:05 AM', sub: 'Delivered',
      summary: 'Text to (303) 555-0148 confirming the $1,612.40 October payment.', links: ['r03'] }),
    tp({ id: 'r03', channel: 'payment', direction: 'in', label: 'Payment received', date: '2026-10-01', time: '6:00 AM', sub: 'Autopay',
      summary: 'October payment by autopay.', docs: ['d21'], links: ['r02'],
      pay: { amount: '$1,612.40', status: 'Cleared', autopay: true, onTime: true, due: '10/01/26', posted: '10/01/26', cleared: '10/03/26', method: 'Autopay / Checking ····2208',
        alloc: [['Principal & interest', '$1,509.20'], ['Escrow', '$103.20']] } }),
    tp({ id: 'r04', channel: 'call', direction: 'in', label: 'Refund check status', date: '2026-09-22', time: '11:40 AM', agent: AG.sl, duration: '6m 12s',
      summary: 'Asked about the escrow refund check mailed Aug 4. Not cashed. Research case CS-2026-4112 opened to trace check 0041887.', codes: ['TTMR'], links: ['case-CS-2026-4112', 'r08'] }),
    tp({ id: 'r05', channel: 'email', direction: 'out', label: 'Monthly statement available', date: '2026-09-16', time: '5:00 AM', sub: 'Sent',
      summary: 'Statement for the Oct 1, 2026 payment of $1,612.40.', docs: ['d22'],
      thread: [{ dir: 'out', from: srv(P) + ' → Ruth Calloway', date: '09/16/26', subject: 'Your monthly statement is available', snippet: 'Statement for the Oct 1, 2026 payment of $1,612.40.' }] }),
    tp({ id: 'r06', channel: 'payment', direction: 'in', label: 'Payment received', date: '2026-09-01', time: '6:00 AM', sub: 'Autopay',
      summary: 'September payment by autopay, the first at the new amount.',
      pay: { amount: '$1,612.40', status: 'Cleared', autopay: true, onTime: true, due: '09/01/26', posted: '09/01/26', cleared: '09/03/26', method: 'Autopay / Checking ····2208',
        alloc: [['Principal & interest', '$1,509.20'], ['Escrow', '$103.20']] } }),
    tp({ id: 'r07', channel: 'call', direction: 'in', label: 'Escrow analysis copy', date: '2026-08-06', time: '2:20 PM', agent: AG.tb, duration: '4m 30s',
      summary: 'Asked for a copy of the escrow analysis. Sent by email. Case CS-2026-3720 resolved.', codes: ['CDOC'], links: ['case-CS-2026-3720'], docs: ['d23'] }),
    tp({ id: 'r08', channel: 'letter', direction: 'out', label: 'Escrow refund check 0041887', date: '2026-08-04', time: '', sub: 'Mailed',
      summary: 'Escrow surplus refund of $1,284.60 mailed to 428 Maple Ave, Boulder, CO 90301.', docs: ['d11'] }),
    tp({ id: 'r09', channel: 'payment', direction: 'in', label: 'Payment received', date: '2026-08-01', time: '6:00 AM', sub: 'Autopay',
      summary: 'August payment by autopay.',
      pay: { amount: '$1,626.40', status: 'Cleared', autopay: true, onTime: true, due: '08/01/26', posted: '08/01/26', cleared: '08/03/26', method: 'Autopay / Checking ····2208',
        alloc: [['Principal & interest', '$1,509.20'], ['Escrow', '$117.20']] } }),
    tp({ id: 'r10', channel: 'letter', direction: 'out', label: 'Annual escrow analysis statement', date: '2026-07-30', time: '', sub: 'Mailed',
      summary: 'Analysis run Jul 28, 2026. Surplus of $1,284.60 to be refunded by check. Payment $1,612.40 from Sep 1, down $14.00.', docs: ['d23'] }),
    tp({ id: 'r11', channel: 'email', direction: 'out', label: 'Escrow analysis results', date: '2026-07-28', time: '6:00 AM', sub: 'Sent',
      summary: 'Surplus of $1,284.60. The refund check follows by mail.',
      thread: [{ dir: 'out', from: srv(P) + ' → Ruth Calloway', date: '07/28/26', subject: 'Your escrow analysis results', snippet: 'Your analysis found a surplus of $1,284.60. A refund check follows by mail.' }] }),
    tp({ id: 'r12', channel: 'payment', direction: 'out', label: 'Property tax paid from escrow', date: '2026-06-01', time: '', sub: 'Escrow disbursement',
      summary: 'Property tax installment to the Boulder County Treasurer, at last year’s $1,010.40 a year.',
      pay: { amount: '$505.20', status: 'Disbursed', payee: 'Boulder County Treasurer', method: 'Escrow disbursement', posted: '06/01/26', alloc: [['Property tax · installment', '$505.20']] } }),
    tp({ id: 'r13', channel: 'payment', direction: 'out', label: 'Insurance premium paid from escrow', date: '2026-04-02', time: '', sub: 'Escrow disbursement',
      summary: 'Renewal premium to Pinecrest Home Insurance.', docs: ['d24'],
      pay: { amount: '$396.00', status: 'Disbursed', payee: 'Pinecrest Home Insurance', method: 'Escrow disbursement', posted: '04/02/26', alloc: [['Hazard insurance · renewal', '$396.00']] } })`,
    art: `
    d11: { name: 'Escrow refund check 0041887', kind: 'PDF', date: '2026-08-04', rows: [['Check', '0041887'], ['Amount', '$1,284.60'], ['Mailed', '08/04/26'], ['Mailed to', '428 Maple Ave, Boulder, CO 90301']] },
    d21: { name: 'Payment receipt · October', kind: 'Receipt', date: '2026-10-01', rows: [['Payment', '$1,612.40'], ['Received', '10/01/26'], ['Method', 'Autopay · Checking ····2208']] },
    d22: { name: 'Monthly statement · October', kind: 'PDF', date: '2026-09-16', rows: [['Statement for', '10/01/26 payment'], ['Amount due', '$1,612.40'], ['Principal & interest', '$1,509.20'], ['Escrow', '$103.20']] },
    d23: { name: 'Annual escrow analysis statement', kind: 'PDF', date: '2026-07-30', rows: [['Analysis', '07/28/26'], ['Surplus', '$1,284.60', 'Refunded by check 0041887'], ['New payment', '$1,612.40', 'From 09/01/26 · down $14.00'], ['Escrow cushion', '$206.40']] },
    d24: { name: 'Insurance premium disbursement', kind: 'Receipt', date: '2026-04-02', rows: [['Paid to', 'Pinecrest Home Insurance'], ['Amount', '$396.00'], ['Paid from', 'Escrow · 04/02/26']] }`,
    caseBy: "{ 'CS-2026-4112': AG.sl, 'CS-2026-3720': AG.tb, 'CS-2026-2210': AG.ja }",
  },

  /* Marcus Dell · payment still going up after paying the shortage (script). Payment $1,425.88 (P&I $1,060.60
     + escrow $365.28), no autopay; $1,459.00 from Dec 1 (escrow $398.40). Analysis Sep 28: shortage $216.65,
     paid in full online Oct 2. */
  marcus: {
    rows: `
    tp({ id: 'm01', channel: 'call', direction: 'in', label: 'Payment increase after paid shortage', date: '2026-10-05', time: '10:02 AM', agent: AG.you, live: true,
      summary: 'With you now. Paid the $216.65 shortage and asking why the December payment still goes up.' }),
    tp({ id: 'm02', channel: 'payment', direction: 'in', label: 'Escrow shortage payment', date: '2026-10-02', time: '9:31 AM', sub: 'Online payment',
      summary: 'Paid the full shortage online. Applied to escrow; case CS-2026-4107 opened to adjust the payment.', docs: ['d41'], links: ['case-CS-2026-4107'],
      pay: { amount: '$216.65', status: 'Posted', autopay: false, posted: '10/02/26', method: 'Online payment / Checking', alloc: [['Escrow shortage', '$216.65']] } }),
    tp({ id: 'm03', channel: 'payment', direction: 'in', label: 'Payment received', date: '2026-10-01', time: '7:48 AM', sub: 'Online payment',
      summary: 'October payment.',
      pay: { amount: '$1,425.88', status: 'Cleared', autopay: false, onTime: true, due: '10/01/26', posted: '10/01/26', cleared: '10/03/26', method: 'Online payment / Checking',
        alloc: [['Principal & interest', '$1,060.60'], ['Escrow', '$365.28']] } }),
    tp({ id: 'm04', channel: 'letter', direction: 'out', label: 'Annual escrow analysis statement', date: '2026-09-30', time: '', sub: 'Mailed',
      summary: 'Mailed with the shortage payment coupon. New payment $1,459.00 from Dec 1, 2026.', docs: ['d42', 'd43'] }),
    tp({ id: 'm05', channel: 'call', direction: 'in', label: 'Escrow increase complaint', date: '2026-09-29', time: '1:05 PM', agent: AG.tb, duration: '14m 05s',
      summary: 'Disputed the higher payment in the new analysis. Verbal complaint case CS-2026-3861 opened and resolved.', codes: ['TTMR'], links: ['case-CS-2026-3861'] }),
    tp({ id: 'm06', channel: 'web', direction: 'in', label: 'Viewed the escrow analysis in the app', date: '2026-09-28', time: '9:15 PM', sub: 'Self-service',
      summary: 'Opened the new analysis and the shortage options.' }),
    tp({ id: 'm07', channel: 'email', direction: 'out', label: 'Escrow analysis results', date: '2026-09-28', time: '6:00 AM', sub: 'Sent',
      summary: 'Analysis run Sept 28, 2026. Shortage $216.65. Payment $1,425.88 → $1,459.00 from Dec 1.',
      thread: [{ dir: 'out', from: srv(P) + ' → Marcus Dell', date: '09/28/26', subject: 'Your escrow analysis results', snippet: 'Your analysis found a shortage of $216.65. Your payment changes to $1,459.00 from Dec 1.' }] }),
    tp({ id: 'm08', channel: 'email', direction: 'out', label: 'Monthly statement available', date: '2026-09-16', time: '5:00 AM', sub: 'Sent',
      summary: 'Statement for the Oct 1, 2026 payment of $1,425.88.', docs: ['d45'],
      thread: [{ dir: 'out', from: srv(P) + ' → Marcus Dell', date: '09/16/26', subject: 'Your monthly statement is available', snippet: 'Statement for the Oct 1, 2026 payment of $1,425.88.' }] }),
    tp({ id: 'm09', channel: 'payment', direction: 'in', label: 'Payment received', date: '2026-09-01', time: '8:02 AM', sub: 'Online payment',
      summary: 'September payment.',
      pay: { amount: '$1,425.88', status: 'Cleared', autopay: false, onTime: true, due: '09/01/26', posted: '09/01/26', cleared: '09/03/26', method: 'Online payment / Checking',
        alloc: [['Principal & interest', '$1,060.60'], ['Escrow', '$365.28']] } }),
    tp({ id: 'm10', channel: 'payment', direction: 'out', label: 'Insurance premium paid from escrow', date: '2026-08-14', time: '', sub: 'Escrow disbursement',
      summary: 'Renewal premium to Heartland Home Insurance, up $102.00.', docs: ['d44'],
      pay: { amount: '$1,486.00', status: 'Disbursed', payee: 'Heartland Home Insurance', method: 'Escrow disbursement', posted: '08/14/26', alloc: [['Hazard insurance · renewal', '$1,486.00']] } }),
    tp({ id: 'm11', channel: 'payment', direction: 'out', label: 'Property tax paid from escrow', date: '2025-12-01', time: '', sub: 'Escrow disbursement',
      summary: 'Annual property tax to the Cass County Collector.',
      pay: { amount: '$2,868.00', status: 'Disbursed', payee: 'Cass County Collector', method: 'Escrow disbursement', posted: '12/01/25', alloc: [['Property tax · annual', '$2,868.00']] } })`,
    art: `
    d41: { name: 'Shortage payment receipt', kind: 'Receipt', date: '2026-10-02', rows: [['Amount', '$216.65'], ['Posted', '10/02/26'], ['Applied to', 'Escrow shortage']] },
    d42: { name: 'Annual escrow analysis statement', kind: 'PDF', date: '2026-09-30', rows: [['Analysis', '09/28/26'], ['Escrow shortage', '$216.65'], ['New payment', '$1,459.00', 'From 12/01/26 · up $33.12'], ['Monthly escrow', '$398.40']] },
    d43: { name: 'Escrow shortage payment coupon', kind: 'PDF', date: '2026-09-30', rows: [['Shortage', '$216.65'], ['Mailed with', 'Annual escrow analysis statement']] },
    d44: { name: 'Insurance premium disbursement', kind: 'Receipt', date: '2026-08-14', rows: [['Paid to', 'Heartland Home Insurance'], ['Amount', '$1,486.00'], ['Paid from', 'Escrow · 08/14/26']] },
    d45: { name: 'Monthly statement · October', kind: 'PDF', date: '2026-09-16', rows: [['Statement for', '10/01/26 payment'], ['Amount due', '$1,425.88'], ['Principal & interest', '$1,060.60'], ['Escrow', '$365.28']] }`,
    caseBy: "{ 'CS-2026-3861': AG.tb, 'CS-2026-2210': AG.ja }",
  },

  /* Dana Whitcomb · switched to cheaper insurance (script). Summit Home Insurance $1,644.00 → Front Range
     Mutual $1,380.00 from Oct 1, 2026; dec page received Oct 3 (policy FRM-2209-4417). Payment $1,683.22 by
     autopay (P&I $1,281.47 + escrow $401.75). */
  dana: {
    rows: `
    tp({ id: 'w01', channel: 'call', direction: 'in', label: 'Insurance premium change', date: '2026-10-05', time: '10:02 AM', agent: AG.you, live: true,
      summary: 'With you now. Switched to a cheaper homeowners policy and asking when the payment comes down.' }),
    tp({ id: 'w02', channel: 'email', direction: 'in', label: 'Insurance declarations page received', date: '2026-10-03', time: '2:15 PM', sub: 'Received',
      summary: 'Front Range Mutual policy FRM-2209-4417, $1,380.00 a year from Oct 1, 2026. Routed to insurance processing; case CS-2026-4131 opened.', docs: ['d31'], links: ['case-CS-2026-4131'],
      thread: [{ dir: 'in', from: 'Front Range Mutual → ' + srv(P), date: '10/03/26', subject: 'Declarations page · Dana Whitcomb', snippet: 'Declarations page for policy FRM-2209-4417 attached.' }] }),
    tp({ id: 'w03', channel: 'sms', direction: 'out', label: 'Payment confirmation', date: '2026-10-01', time: '6:05 AM', sub: 'Delivered',
      summary: 'Text to (720) 555-0126 confirming the $1,683.22 October payment.', links: ['w04'] }),
    tp({ id: 'w04', channel: 'payment', direction: 'in', label: 'Payment received', date: '2026-10-01', time: '6:00 AM', sub: 'Autopay',
      summary: 'October payment by autopay.', docs: ['d32'], links: ['w03'],
      pay: { amount: '$1,683.22', status: 'Cleared', autopay: true, onTime: true, due: '10/01/26', posted: '10/01/26', cleared: '10/03/26', method: 'Autopay / Checking ····7731',
        alloc: [['Principal & interest', '$1,281.47'], ['Escrow', '$401.75']] } }),
    tp({ id: 'w05', channel: 'letter', direction: 'in', label: 'Policy ended · Summit Home Insurance', date: '2026-10-01', time: '', sub: 'Received',
      summary: 'Notice from Summit Home Insurance that the homeowners policy ended Oct 1, 2026.', docs: ['d33'] }),
    tp({ id: 'w06', channel: 'web', direction: 'in', label: 'Signed in to the app', date: '2026-09-24', time: '8:12 PM', sub: 'Self-service',
      summary: 'Viewed escrow and insurance details.' }),
    tp({ id: 'w07', channel: 'email', direction: 'out', label: 'Monthly statement available', date: '2026-09-16', time: '5:00 AM', sub: 'Sent',
      summary: 'Statement for the Oct 1, 2026 payment of $1,683.22.', docs: ['d34'],
      thread: [{ dir: 'out', from: srv(P) + ' → Dana Whitcomb', date: '09/16/26', subject: 'Your monthly statement is available', snippet: 'Statement for the Oct 1, 2026 payment of $1,683.22.' }] }),
    tp({ id: 'w08', channel: 'payment', direction: 'in', label: 'Payment received', date: '2026-09-01', time: '6:00 AM', sub: 'Autopay',
      summary: 'September payment by autopay.',
      pay: { amount: '$1,683.22', status: 'Cleared', autopay: true, onTime: true, due: '09/01/26', posted: '09/01/26', cleared: '09/03/26', method: 'Autopay / Checking ····7731',
        alloc: [['Principal & interest', '$1,281.47'], ['Escrow', '$401.75']] } }),
    tp({ id: 'w09', channel: 'payment', direction: 'out', label: 'Property tax paid from escrow', date: '2026-06-01', time: '', sub: 'Escrow disbursement',
      summary: 'First-half property tax to the Boulder County Treasurer.',
      pay: { amount: '$1,440.00', status: 'Disbursed', payee: 'Boulder County Treasurer', method: 'Escrow disbursement', posted: '06/01/26', alloc: [['Property tax · first half', '$1,440.00']] } }),
    tp({ id: 'w10', channel: 'payment', direction: 'out', label: 'Insurance premium paid from escrow', date: '2025-10-01', time: '', sub: 'Escrow disbursement',
      summary: 'Annual premium to Summit Home Insurance.', docs: ['d35'],
      pay: { amount: '$1,644.00', status: 'Disbursed', payee: 'Summit Home Insurance', method: 'Escrow disbursement', posted: '10/01/25', alloc: [['Hazard insurance · renewal', '$1,644.00']] } })`,
    art: `
    d31: { name: 'Insurance declarations page', kind: 'PDF', date: '2026-10-03', from: 'Front Range Mutual', rows: [['Carrier', 'Front Range Mutual'], ['Policy', 'FRM-2209-4417'], ['Premium', '$1,380.00 a year'], ['Effective', '10/01/26']] },
    d32: { name: 'Payment receipt · October', kind: 'Receipt', date: '2026-10-01', rows: [['Payment', '$1,683.22'], ['Received', '10/01/26'], ['Method', 'Autopay · Checking ····7731']] },
    d33: { name: 'Summit Home Insurance · policy ended', kind: 'PDF', date: '2026-10-01', from: 'Summit Home Insurance', rows: [['Policy ended', '10/01/26'], ['Last premium', '$1,644.00 a year']] },
    d34: { name: 'Monthly statement · October', kind: 'PDF', date: '2026-09-16', rows: [['Statement for', '10/01/26 payment'], ['Amount due', '$1,683.22'], ['Principal & interest', '$1,281.47'], ['Escrow', '$401.75']] },
    d35: { name: 'Insurance premium disbursement', kind: 'Receipt', date: '2025-10-01', rows: [['Paid to', 'Summit Home Insurance'], ['Amount', '$1,644.00'], ['Paid from', 'Escrow · 10/01/25']] }`,
    caseBy: "{ 'CS-2026-2210': AG.ja }",
  },
};
