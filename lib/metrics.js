// Turns a participant's raw event log into the numbers the dashboard shows.

const STAGES = ["Invited", "Opened link", "Consented", "Audio ready", "Briefed"]; // then per call: started, done; then Completed

function ms(a, b) { return a && b ? Math.max(0, Date.parse(b) - Date.parse(a)) : null; }
function median(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

function summarize(p, events) {
  const s = {
    code: p.code, email: p.email, firstName: p.firstName || "", listed: !!p.listed, createdAt: p.createdAt,
    firstSeen: null, lastSeen: null, order: null, totalCalls: null,
    opened: false, consented: false, audioReady: false, briefed: false, done: false,
    calls: [], pauses: 0, pauseMs: 0, earlyStarts: 0, clicks: 0, errors: 0, sessions: 0, device: null,
  };
  const attempts = {}; // n -> list of attempts
  let cur = null, pauseAt = null;

  function attempt(n) {
    const list = attempts[n] || (attempts[n] = []);
    return list[list.length - 1] || null;
  }

  for (const e of events) {
    const at = e.at || e.rt;
    if (!s.firstSeen || at < s.firstSeen) s.firstSeen = at;
    if (!s.lastSeen || at > s.lastSeen) s.lastSeen = at;
    switch (e.type) {
      case "opened": s.opened = true; break;
      case "consent": s.consented = true; s.opened = true; break;
      case "device": s.audioReady = true; s.device = { mic: e.mic || "", speaker: e.speaker || "" }; break;
      case "briefed": s.briefed = true; break;
      case "call_load": if (pauseAt) { s.pauseMs += ms(pauseAt, at); pauseAt = null; } break;
      case "session_start": s.sessions++; if (e.order) { s.order = e.order; s.totalCalls = e.order.length; } break;
      case "call_start": {
        cur = { n: e.n, client: e.client, startedAt: at, connectedAt: null, verifiedAt: null, endedAt: null, endReason: null,
          conversationId: null, holds: 0, holdMs: 0, holdOn: null, mutes: 0, dials: [], transfer: null, steps: [], clicks: 0, transcript: [] };
        (attempts[e.n] || (attempts[e.n] = [])).push(cur);
        break;
      }
      case "call_connected": { const c = attempt(e.n); if (c) { c.connectedAt = at; c.conversationId = e.conversationId || null; } break; }
      case "verified": { const c = attempt(e.n); if (c && !c.verifiedAt) c.verifiedAt = at; break; }
      case "hold": {
        const c = attempt(e.n); if (!c) break;
        if (e.on) { c.holds++; c.holdOn = at; } else if (c.holdOn) { c.holdMs += ms(c.holdOn, at); c.holdOn = null; }
        break;
      }
      case "mute": { const c = attempt(e.n); if (c && e.on) c.mutes++; break; }
      case "dial": { const c = attempt(e.n); if (c) c.dials.push(e.to); break; }
      case "transfer": { const c = attempt(e.n); if (c) c.transfer = e.to; break; }
      case "step": { const c = attempt(e.n); if (c) c.steps.push({ at, action: e.action, label: e.label }); break; }
      case "click": { s.clicks++; const c = attempt(e.n); if (c) c.clicks++; break; }
      case "transcript": { const c = attempt(e.n); if (c) c.transcript.push({ at, role: e.role, text: e.text }); break; }
      case "call_end": {
        const c = attempt(e.n); if (!c) break;
        c.endedAt = at; c.endReason = e.reason || "";
        if (c.holdOn) { c.holdMs += ms(c.holdOn, at); c.holdOn = null; }
        break;
      }
      case "break_pause": s.pauses++; pauseAt = at; break;
      case "break_resume": if (pauseAt) { s.pauseMs += ms(pauseAt, at); pauseAt = null; } break;
      case "break_skip": s.earlyStarts++; break;
      case "done": s.done = true; break;
      case "error": s.errors++; break;
    }
  }

  // per call: the last attempt that connected, else the last attempt
  Object.keys(attempts).map(Number).sort((a, b) => a - b).forEach((n) => {
    const list = attempts[n];
    const c = list.filter((a) => a.connectedAt).pop() || list[list.length - 1];
    const completed = !!(c.connectedAt && c.endedAt && !/^error/.test(c.endReason || ""));
    s.calls.push({
      n, client: c.client, attempts: list.length, completed,
      startedAt: c.startedAt, connectedAt: c.connectedAt, endedAt: c.endedAt, endReason: c.endReason, conversationId: c.conversationId,
      ringMs: ms(c.startedAt, c.connectedAt),
      ahtMs: ms(c.connectedAt, c.endedAt),
      verifyMs: ms(c.connectedAt, c.verifiedAt),
      holds: c.holds, holdMs: c.holdMs, mutes: c.mutes, dials: c.dials, transfer: c.transfer,
      steps: c.steps.map((x) => ({ action: x.action, label: x.label, afterMs: ms(c.connectedAt, x.at) })),
      clicks: c.clicks, transcript: c.transcript,
    });
  });

  const total = s.totalCalls || 2;
  const doneCalls = s.calls.filter((c) => c.completed).length;
  // funnel rank: 0 Invited … 4 Briefed, then 5 + 2(k-1) = call k started, +1 = call k done, then completed
  let rank = 0;
  if (s.opened) rank = 1;
  if (s.consented) rank = 2;
  if (s.audioReady) rank = 3;
  if (s.briefed) rank = 4;
  s.calls.forEach((c) => { rank = Math.max(rank, 5 + 2 * (c.n - 1) + (c.completed ? 1 : 0)); });
  if (s.done) rank = 5 + 2 * total;
  s.rank = rank;
  s.callsCompleted = doneCalls;
  s.stage = s.done ? "Completed"
    : rank >= 5 ? "Call " + (Math.floor((rank - 5) / 2) + 1) + ((rank - 5) % 2 ? " done" : " in progress")
    : STAGES[rank];
  return s;
}

function funnel(summaries, totalCalls) {
  const steps = STAGES.slice();
  for (let k = 1; k <= totalCalls; k++) steps.push("Call " + k + " started", "Call " + k + " done");
  steps.push("Completed");
  return steps.map((label, i) => ({ label, count: summaries.filter((s) => s.rank >= i).length }));
}

function overview(summaries) {
  const totalCalls = Math.max(2, ...summaries.map((s) => s.totalCalls || 0));
  const byClient = {};
  summaries.forEach((s) => s.calls.filter((c) => c.completed).forEach((c) => {
    const b = byClient[c.client] || (byClient[c.client] = { client: c.client, calls: 0, aht: [], verify: [], holds: [], holdMs: [], transfers: 0 });
    b.calls++; b.aht.push(c.ahtMs); b.verify.push(c.verifyMs); b.holds.push(c.holds); b.holdMs.push(c.holdMs);
    if (c.transfer) b.transfers++;
  }));
  const invited = summaries.filter((s) => s.listed).length;
  const started = summaries.filter((s) => s.opened).length;
  const completed = summaries.filter((s) => s.done).length;
  return {
    totals: {
      invited, notListed: summaries.filter((s) => !s.listed).length, started, completed,
      completionRate: started ? completed / started : null,
      pausedNext: summaries.filter((s) => s.pauses > 0).length,
      medianPauseMs: median(summaries.filter((s) => s.pauseMs).map((s) => s.pauseMs)),
    },
    funnel: funnel(summaries, totalCalls),
    clients: Object.values(byClient).map((b) => ({
      client: b.client, calls: b.calls, medianAhtMs: median(b.aht), medianVerifyMs: median(b.verify),
      medianHolds: median(b.holds), medianHoldMs: median(b.holdMs), transfers: b.transfers,
    })),
  };
}

function csvRows(summaries) {
  const maxCalls = Math.max(2, ...summaries.map((s) => s.calls.length));
  const head = ["code", "email", "first_name", "on_invite_list", "stage", "first_seen", "last_seen", "calls_completed"];
  for (let k = 1; k <= maxCalls; k++) {
    head.push(`call${k}_customer`, `call${k}_completed`, `call${k}_handle_s`, `call${k}_verify_s`, `call${k}_ring_s`,
      `call${k}_holds`, `call${k}_hold_s`, `call${k}_transfer`, `call${k}_end_reason`, `call${k}_attempts`);
  }
  head.push("paused_next_call", "pause_s", "started_next_early", "clicks", "errors", "microphone");
  const sec = (x) => (x == null ? "" : Math.round(x / 1000));
  const rows = summaries.map((s) => {
    const r = [s.code, s.email, s.firstName, s.listed ? "yes" : "no", s.stage, s.firstSeen || "", s.lastSeen || "", s.callsCompleted];
    for (let k = 1; k <= maxCalls; k++) {
      const c = s.calls.find((x) => x.n === k);
      if (!c) { r.push("", "", "", "", "", "", "", "", "", ""); continue; }
      r.push(c.client, c.completed ? "yes" : "no", sec(c.ahtMs), sec(c.verifyMs), sec(c.ringMs), c.holds, sec(c.holdMs), c.transfer || "", c.endReason || "", c.attempts);
    }
    r.push(s.pauses, sec(s.pauseMs), s.earlyStarts, s.clicks, s.errors, s.device ? s.device.mic : "");
    return r;
  });
  const q = (v) => { const t = String(v == null ? "" : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return [head].concat(rows).map((r) => r.map(q).join(",")).join("\n") + "\n";
}

module.exports = { summarize, overview, csvRows, median };
