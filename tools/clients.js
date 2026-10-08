// Client data for the per-client prototype builds (tools/build-prototypes.js).
// Facts marked "script" come from the TMD call scripts; everything else is invented to fill the
// prototype consistently (household members, phone, email, escrow and tax figures).

const ADDR_SRC = { street: "428 Maple Ave", city: "Boulder", state: "CO", zip: "90301" };

module.exports = {
  ADDR_SRC,

  ruth: {
    title: "Escrow refund reissue",
    playbook: "e11", // script: refund reissue
    first: "Ruth",
    full: "Ruth Calloway",
    legal: "Ruth Ann Calloway", // script
    loan: "6204817733", // script
    ssn4: "5529", // script
    addr: { street: "428 Maple Ave", city: "Boulder", state: "CO", zip: "90301" }, // script
    phone: "(303) 555 – 0148",
    email: "ruth.calloway@example.com",
    lastPay: { amount: "$1,612.40", date: "Oct 1, 2026", short: "Oct 1" }, // script: autopay
    nextPay: { amount: "$1,612.40", short: "Nov 1" },
    autopay: "2208",
    household: { angela: "Harold Calloway", derek: "Thomas Calloway", priya: "Linda Calloway" },
    auth3p: { first: "Ellen", full: "Ellen Pruitt", relationship: "Sister" },
    cases: [
      ["CS-2026-4112", "Refund check not received", "Research", "Escrow Issue", "Escrow Refund", "Open", "Sept 22, 2026"],
      ["CS-2026-3720", "Escrow analysis copy", "Account Services", "Escrow", "Escrow Analysis Copy", "Resolved", "Aug 6, 2026"],
    ],
    ctx: {
      why: ["Escrow", "Refund check for <span class=\"cx-acc cx-num\">$1,284.60</span> hasn’t been cashed", "Mailed Aug 4 · check no. 0041887"],
      recap: null, // recap shows for Marcus only
      activity: [
        ["Refund check mailed · no. 0041887", "Aug 4"],
        ["Escrow analysis · surplus $1,284.60", "Jul 28"],
        ["Payment cleared Oct 1 · autopay", "$1,612.40"],
      ],
      stats: [
        ["Last paid", "$1,612.40", "<b>Oct 1</b>", "Autopay"],
        ["Escrow bal.", "$206.40", "After refund", "No shortage"],
        ["Next due", "$1,612.40", "<b>Nov 1</b>", "Autopay"],
      ],
      upcoming: [
        ["Dec 1", "Taxes due · Boulder Co.", "$3,118/yr", "Semi-annual"],
        ["Jan 31, 2027", "Uncashed check posts back to escrow", "$1,284.60", "Day 180 · KA-01215"],
      ],
      taxes: ["Boulder Co.", "Boulder County Treasurer", "$3,118", "Dec 1, 2026", "Jun 1, 2026 · $1,559.00"],
      insurance: ["Pinecrest Home Insurance", "Pinecrest", "$1,452", "PHI-30418-CO", "Apr 2, 2027", "Apr 2, 2026"],
    },
    summary: [
      "The client called because an escrow refund check for $1,284.60 never arrived.",
      "The CR confirmed check no. 0041887 was mailed Aug 4, 2026 and has not been cashed.",
      "The check is past the 30-day gate, the account is current and there is no prior stop-pay.",
      "The CR read back the mailing address on file, 428 Maple Ave, Boulder, CO 90301, and the client confirmed it.",
      "The CR submitted a stop payment and reissue for the refund check.",
      "The client asked about faster delivery options for the new check.",
      "The client understood the next steps and had no further questions.",
    ],
  },

  marcus: {
    title: "Payment increase after paid shortage",
    playbook: "e03", // script: paid shortage
    first: "Marcus",
    full: "Marcus Dell", // script
    legal: "Marcus Dell",
    loan: "4301299731", // script
    ssn4: "7235", // script
    addr: { street: "1907 Hawthorne Ln", city: "Pleasant Hill", state: "MO", zip: "64080" }, // zip from script
    phone: "(816) 555 – 0173",
    email: "marcus.dell@example.com",
    lastPay: { amount: "$1,425.88", date: "Oct 1, 2026", short: "Oct 1" }, // script
    nextPay: { amount: "$1,425.88", short: "Nov 1" },
    autopay: null,
    household: { angela: "Tanya Dell", derek: "Kevin Dell", priya: "Jasmine Dell" },
    auth3p: { first: "Ray", full: "Ray Dell", relationship: "Brother" },
    cases: [
      ["CS-2026-4107", "Escrow shortage payment", "Account Services", "Adjustments", "Move Money", "In Progress", "Oct 2, 2026"],
      ["CS-2026-3861", "Verbal complaint", "Verbal Complaint", "Escrow", "Escrow Increase", "Resolved", "Sept 29, 2026"],
    ],
    ctx: {
      why: ["Escrow", "Payment still going up after paying a <span class=\"cx-acc cx-num\">$216.65</span> shortage", "Shortage paid Oct 2 · analysis ran Sep 28"],
      // Recap · refinance pitch (Marcus only). Balance, rate and savings are invented estimates.
      recap: {
        label: "Refinance opportunity",
        refer: true, // shows "Refer to Home Loan Expert"
        elig: "An <b>FHA Streamline Refinance</b>. The loan is FHA 30-year fixed at <b class=\"cx-num\">6.58%</b>, current, with on-time payments. At today’s <b class=\"cx-num\">5.875%</b>, principal and interest could drop about <b class=\"cx-num\">$126/mo</b> (est., $152,310 balance).",
        points: [
          "“Before we wrap up, I noticed your rate is 6.58%. Rates are lower right now, so a refinance could bring your monthly payment down.”",
          "“Because your loan is FHA and you’re current, you may qualify for an FHA Streamline. That usually means no appraisal and less paperwork.”",
          "“Would you like me to connect you with a Home Loan Expert for a free review? It only takes a few minutes.”",
        ],
      },
      activity: [
        ["Escrow deposit · shortage paid", "$216.65", false, "Oct 2"],
        ["Payment cleared Oct 1", "$1,425.88"],
        ["Escrow analysis · shortage $216.65", "Sep 28"],
      ],
      stats: [
        ["Last paid", "$1,425.88", "<b>Oct 1</b>", "On time"],
        ["Escrow/mo", "$398.40", "↑ $33.12", "from Dec 1", true],
        ["Next due", "$1,425.88", "<b>Nov 1</b>", "Not scheduled"],
      ],
      upcoming: [
        ["Dec 1", "Payment change", "$1,425.88 → $1,459.00", "Escrow analysis Sep 28 · +$33.12"],
        ["Dec 1", "Taxes due · Cass Co.", "$2,946.84/yr", "Up $78.84/yr"],
      ],
      taxes: ["Cass Co.", "Cass County Collector", "$2,946.84", "Dec 1, 2026", "Dec 1, 2025 · $2,868.00"],
      insurance: ["Heartland Home Insurance", "Heartland", "$1,486", "HHI-55120-MO", "Aug 14, 2027", "Aug 14, 2026 · up $102.00"],
    },
    summary: null, // the prototype's own summary is written for this call
  },

  dana: {
    title: "Insurance premium change",
    playbook: "i02", // script: premium change
    first: "Dana",
    full: "Dana Whitcomb", // script
    legal: "Dana Whitcomb",
    loan: "8812045960", // script
    ssn4: "6190", // script
    addr: { street: "752 Coal Creek Cir", city: "Louisville", state: "CO", zip: "80027" }, // zip from script
    phone: "(720) 555 – 0126",
    email: "dana.whitcomb@example.com",
    lastPay: { amount: "$1,683.22", date: "Oct 1, 2026", short: "Oct 1" }, // script: autopay
    nextPay: { amount: "$1,683.22", short: "Nov 1" },
    autopay: "7731",
    household: { angela: "Sam Whitcomb", derek: "Paul Whitcomb", priya: "Jordan Whitcomb" },
    auth3p: { first: "Kelly", full: "Kelly Whitcomb", relationship: "Sister" },
    cases: [
      ["CS-2026-4131", "Insurance policy change", "Research", "Insurance", "Hazard Insurance Update", "Open", "Oct 3, 2026"],
    ],
    ctx: {
      why: ["Insurance", "Switched to a cheaper homeowners policy · <span class=\"cx-acc cx-num\">−$264/yr</span>", "Dec page received Oct 3 · Front Range Mutual"],
      recap: null, // recap shows for Marcus only
      activity: [
        ["Dec page received · Front Range Mutual", "Oct 3"],
        ["Payment cleared Oct 1 · autopay", "$1,683.22"],
        ["Summit Home Insurance policy ended", "Oct 1"],
      ],
      stats: [
        ["Last paid", "$1,683.22", "<b>Oct 1</b>", "Autopay"],
        ["Escrow/mo", "$401.75", "Ins. $137.00/mo", "on old policy"],
        ["Next due", "$1,683.22", "<b>Nov 1</b>", "Autopay"],
      ],
      upcoming: [
        ["Pending", "Off-cycle escrow analysis", "−$22.00/mo", "Lower premium · Front Range Mutual"],
        ["Dec 1", "Taxes due · Boulder Co.", "$2,880/yr", "Semi-annual"],
      ],
      taxes: ["Boulder Co.", "Boulder County Treasurer", "$2,880", "Dec 1, 2026", "Jun 1, 2026 · $1,440.00"],
      insurance: ["Front Range Mutual", "Front Range Mutual", "$1,380", "FRM-2209-4417", "Oct 1, 2027", "Oct 1, 2026 · was Summit Home Insurance, $1,644.00"],
    },
    summary: [
      "The client called after switching homeowners insurance to a lower premium, effective Oct 1, 2026.",
      "The CR confirmed the Front Range Mutual policy FRM-2209-4417 is on file and matches the dec page received Oct 3.",
      "The premium dropped from $1,644.00 to $1,380.00 a year, which is $22.00 a month less into escrow.",
      "The CR explained that a lower premium allows an off-cycle escrow analysis instead of waiting for the annual review.",
      "The CR ran or requested the off-cycle analysis to set the new monthly payment.",
      "The client asked for the updated escrow statement to be sent.",
      "The client understood the next steps and had no further questions.",
    ],
    // the i02 playbook's payment figures were written for the shortage loan; use Dana's payment
    i02: [
      ["payment $1,459.00 → $1,437.00 from Dec 1, 2026", "payment $1,683.22 → $1,661.22 from Dec 1, 2026"],
      ["New payment $1,437.00 from Dec 1.", "New payment $1,661.22 from Dec 1."],
      ["<td class=\"rz-r\">$1,459.00</td><td class=\"rz-r rz-strong\">$1,437.00</td>", "<td class=\"rz-r\">$1,683.22</td><td class=\"rz-r rz-strong\">$1,661.22</td>"],
      ["Analysis finalized · $1,437.00 from Dec 1, 2026", "Analysis finalized · $1,661.22 from Dec 1, 2026"],
      ["your payment is $1,437.00, which is $22 less than the $1,459.00 you were told.", "your payment is $1,661.22, which is $22 less than it is now."],
    ],
  },
};
