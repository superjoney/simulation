// What the dashboard looks for in each call: the callers' anchor lines (spoken word for word, so they
// can be found in the transcript and timed) and the answer flags drawn from each script's canonical
// answers. Flags are auto-detected from the participant's speech and playbook clicks, so treat them as
// pointers to check in the transcript, not verdicts.

// playbook step ids come from the prototype's data-rz buttons (e.g. "e11addr:ok")
const step = (re) => (c) => c.steps.some((s) => re.test(s.action));
const stepBefore = (a, b) => (c) => {
  const i = c.steps.findIndex((s) => a.test(s.action));
  const j = c.steps.findIndex((s) => b.test(s.action));
  return j < 0 ? null : i >= 0 && i < j;                       // null: the later step never happened
};
const said = (re) => (c) => c.transcript.some((t) => t.role !== "agent" && re.test(t.text));
const lastStep = (re) => (c) => {
  const s = c.steps.filter((x) => re.test(x.action)).pop();
  return s ? s.action.split(":")[1] || s.label : null;
};

const CLIENTS = {
  ruth: {
    anchors: [
      { id: "1A", label: "Can it be stopped and reissued today?",
        line: "That refund check never showed up in my mailbox — so what exactly can you do about it today, on this call?",
        action: /^e11act/, actionLabel: "Stop payment and reissue" },
      { id: "1B", label: "Faster delivery: FedEx or bank",
        line: "Could you send the new one faster, like FedEx, or just put it straight into my bank account instead?",
        action: /^e11fod/, actionLabel: "Chose a delivery method" },
    ],
    flags: [
      { id: "addr_first", label: "Confirmed the address before reissuing", good: true, test: stepBefore(/^e11addr:ok/, /^e11act/) },
      { id: "reissued", label: "Stopped payment and reissued", good: true, test: step(/^e11act/) },
      { id: "delivery", label: "Delivery chosen", value: lastStep(/^e11fod/) },
      { id: "fedex_fee", label: "Mentioned the ~$7 FedEx fee", good: true, test: said(/(\$\s?7\b|seven dollars)/i) },
      { id: "wire_reqs", label: "Explained wire needs bank instructions", good: true, test: said(/(wire instructions|voided check|letterhead|bank details|routing)/i) },
      { id: "quoted_time", label: "Quoted an arrival time (not in the playbook)", good: false,
        test: said(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(to\s*\w+\s*)?(business\s*)?(days?|weeks?)\b/i) },
      { id: "nuanced", label: "Opened Nuanced scenarios", good: true, clickLabel: /nuanced scenarios/i },
    ],
  },
  marcus: {
    anchors: [
      { id: "2A", label: "Why is the payment still going up?",
        line: "I paid that shortage off to the penny, so explain to me why my statement still shows the payment going up in December.",
        action: /^e03posted/, actionLabel: "Confirmed the shortage posted" },
      { id: "2B", label: "Take the spread off and give the December number",
        line: "Can you take that spread charge off my payment today, and tell me the exact number my December payment lands on if you do?",
        action: /^e03easp/, actionLabel: "Added EASP" },
    ],
    flags: [
      { id: "easp", label: "Removed the spread (EASP)", good: true, test: step(/^e03easp/) },
      { id: "number", label: "Gave $1,440.95", good: true, test: said(/(1,?440(\.|\s|,)*95|fourteen forty)/i) },
      { id: "stays", label: "Explained the $15.07 that stays", good: true, test: said(/(15\.07|fifteen (dollars )?(and )?(oh )?seven)/i) },
      { id: "old_payment", label: "Mentioned $1,425.88 (check: did they say it goes back?)", good: false, test: said(/(1,?425(\.|\s|,)*88|fourteen twenty[- ]five)/i) },
      { id: "statement", label: "Sent the updated statement", good: true, test: step(/^e03send/) },
      { id: "hle", label: "Referred to a Home Loan Expert", good: true, dial: /home loan/i },
    ],
  },
  dana: {
    anchors: [
      { id: "3A", label: "When does the payment come down?",
        line: "I switched to a cheaper policy starting the first of October — so when does my monthly payment actually come down, or am I stuck waiting for the annual review?",
        action: /^i02match/, actionLabel: "Checked the policy" },
      { id: "3B", label: "Rerun the escrow now and read the new payment",
        line: "Can you rerun the escrow math right now, while I'm on the phone, and read me the new payment?",
        action: /^i02(run|fork:no)/, actionLabel: "Ran or requested the analysis" },
    ],
    flags: [
      { id: "match_first", label: "Checked the policy before running", good: true, test: stepBefore(/^i02match/, /^i02run/) },
      { id: "branch", label: "Run or request", value: lastStep(/^i02fork/) },
      { id: "finalized", label: "Finalized the analysis", good: true, test: step(/^i02final/) },
      { id: "number", label: "Gave $1,661.22", good: true, test: said(/(1,?661(\.|\s|,)*22|sixteen sixty[- ]one)/i) },
      { id: "twentytwo", label: "Said “$22 less” (check: before the analysis ran?)", good: false, test: said(/(\$?\s?22|twenty[- ]two)( dollars)? (a month )?(less|lower|cheaper)/i) },
      { id: "statement", label: "Sent the updated statement", good: true, test: step(/^i02send/) },
    ],
  },
};

const OUTCOMES = ["Answered without hold", "Held then answered", "Gave up or guessed", "Not asked"];

function words(t) {
  return String(t || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
}
// share of the anchor's words found in a caller turn (the agent speaks it verbatim, STT is clean)
function overlap(anchorWords, text) {
  const have = new Set(words(text));
  return anchorWords.filter((w) => have.has(w)).length / anchorWords.length;
}

// public definitions for the dashboard (no functions or regexes)
function definitions() {
  const out = {};
  Object.keys(CLIENTS).forEach((k) => {
    out[k] = {
      anchors: CLIENTS[k].anchors.map((a) => ({ id: a.id, label: a.label, line: a.line, actionLabel: a.actionLabel })),
      flags: CLIENTS[k].flags.map((f) => ({ id: f.id, label: f.label, good: f.good, value: !!f.value })),
    };
  });
  return { clients: out, outcomes: OUTCOMES };
}

module.exports = { CLIENTS, OUTCOMES, words, overlap, definitions };
