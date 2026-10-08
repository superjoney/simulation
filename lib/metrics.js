// Turns a participant's raw event log into the numbers the dashboard shows.

const study = require("./study");

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
    opened: false, consented: false, audioReady: false, briefed: false, callsDone: false, done: false,
    survey: p.survey || null, surveyDone: false, panel: p.panel || null,
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
          conversationId: null, holds: 0, holdMs: 0, holdOn: null, holdLog: [], mutes: 0, dials: [], transfer: null, steps: [], clicks: 0, clickLog: [], transcript: [] };
        (attempts[e.n] || (attempts[e.n] = [])).push(cur);
        break;
      }
      case "call_connected": { const c = attempt(e.n); if (c) { c.connectedAt = at; c.conversationId = e.conversationId || null; } break; }
      case "verified": { const c = attempt(e.n); if (c && !c.verifiedAt) c.verifiedAt = at; break; }
      case "hold": {
        const c = attempt(e.n); if (!c) break;
        if (e.on) { c.holds++; c.holdOn = at; } else if (c.holdOn) { c.holdMs += ms(c.holdOn, at); c.holdLog.push([c.holdOn, at]); c.holdOn = null; }
        break;
      }
      case "mute": { const c = attempt(e.n); if (c && e.on) c.mutes++; break; }
      case "dial": { const c = attempt(e.n); if (c) c.dials.push(e.to); break; }
      case "transfer": { const c = attempt(e.n); if (c) c.transfer = e.to; break; }
      case "step": { const c = attempt(e.n); if (c) c.steps.push({ at, action: e.action, label: e.label }); break; }
      case "click": {
        s.clicks++;
        const c = attempt(e.n);
        if (c) {
          c.clicks++;
          c.clickLog.push({ at, label: e.label || "", area: e.area || "", effect: e.effect, interactive: !!e.interactive, synthetic: !!e.synthetic,
            x: (e.x || 0) + (e.sx || 0), y: (e.y || 0) + (e.sy || 0) });
        }
        break;
      }
      case "transcript": { const c = attempt(e.n); if (c) c.transcript.push({ at, role: e.role, text: e.text }); break; }
      case "call_end": {
        const c = attempt(e.n); if (!c) break;
        c.endedAt = at; c.endReason = e.reason || "";
        if (c.holdOn) { c.holdMs += ms(c.holdOn, at); c.holdLog.push([c.holdOn, at]); c.holdOn = null; }
        break;
      }
      case "break_pause": s.pauses++; pauseAt = at; break;
      case "break_resume": if (pauseAt) { s.pauseMs += ms(pauseAt, at); pauseAt = null; } break;
      case "break_skip": s.earlyStarts++; break;
      case "calls_done": s.callsDone = true; break;
      case "done": s.done = true; s.callsDone = true; break;
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
      ...behaviour(c, p),
    });
  });

  if (s.survey && s.survey.submittedAt) { s.surveyDone = true; s.callsDone = true; }
  if (s.panel && s.panel.submittedAt) { s.done = true; s.surveyDone = true; s.callsDone = true; }
  const total = s.totalCalls || 2;
  const doneCalls = s.calls.filter((c) => c.completed).length;
  // funnel rank: 0 Invited … 4 Briefed, then 5 + 2(k-1) = call k started, +1 = call k done, then completed
  let rank = 0;
  if (s.opened) rank = 1;
  if (s.consented) rank = 2;
  if (s.audioReady) rank = 3;
  if (s.briefed) rank = 4;
  s.calls.forEach((c) => { rank = Math.max(rank, 5 + 2 * (c.n - 1) + (c.completed ? 1 : 0)); });
  if (s.callsDone) rank = Math.max(rank, 4 + 2 * total);
  if (s.surveyDone) rank = Math.max(rank, 5 + 2 * total);
  if (s.done) rank = 6 + 2 * total;
  s.rank = rank;
  s.callsCompleted = doneCalls;
  s.stage = s.done ? "Completed"
    : s.surveyDone ? "Building panel"
    : s.callsDone ? "In survey"
    : rank >= 5 ? "Call " + (Math.floor((rank - 5) / 2) + 1) + ((rank - 5) % 2 ? " done" : " in progress")
    : STAGES[rank];
  return s;
}

/* ---------------- behaviour: clicks, anchors, answer flags ---------------- */

const RAGE_CLICKS = 3, RAGE_MS = 1000, RAGE_PX = 30;

function rageBursts(clicks) {
  const out = [];
  for (let i = 0; i < clicks.length; ) {
    const a = clicks[i], t0 = Date.parse(a.at);
    let j = i + 1;
    while (j < clicks.length && Date.parse(clicks[j].at) - t0 <= RAGE_MS &&
      Math.hypot(clicks[j].x - a.x, clicks[j].y - a.y) <= RAGE_PX) j++;
    if (j - i >= RAGE_CLICKS) { out.push({ at: a.at, label: a.label, area: a.area, count: j - i }); i = j; } else i++;
  }
  return out;
}

const target = (x) => (x.area ? x.area + " › " : "") + (x.label || "empty space");

function behaviour(c, p) {
  const def = study.CLIENTS[c.client] || { anchors: [], flags: [] };
  const from = c.connectedAt;
  const after = (at) => ms(from, at);

  const pointer = c.clickLog.filter((x) => !x.synthetic);
  const rage = rageBursts(pointer).map((r) => ({ target: target(r), count: r.count, afterMs: after(r.at) }));
  const dead = pointer.filter((x) => x.effect === false).map((x) => ({ target: target(x), afterMs: after(x.at) }));
  const features = {};
  c.clickLog.forEach((x) => {
    if (!x.label) return;
    const k = target(x);
    if (!features[k]) features[k] = { target: k, area: x.area, label: x.label, count: 0, firstMs: after(x.at) };
    features[k].count++;
  });

  // anchors: the caller's verbatim line starts the clock
  const callerTurns = c.transcript.filter((t) => t.role === "agent");
  const found = def.anchors.map((a) => {
    const aw = study.words(a.line);
    const hit = callerTurns.find((t) => study.overlap(aw, t.text) >= 0.7);
    return hit ? hit.at : null;
  });
  const anchors = def.anchors.map((a, i) => {
    const askedAt = found[i];
    const coded = (p.coding || {})[c.n + ":" + a.id] || null;
    if (!askedAt) {
      return { id: a.id, label: a.label, asked: false, outcome: coded ? coded.outcome : "Not asked", auto: "Not asked", coded, note: coded ? coded.note : "" };
    }
    const until = found.slice(i + 1).find(Boolean) || c.endedAt;
    const reply = c.transcript.find((t) => t.role !== "agent" && t.at > askedAt);
    const holds = c.holdLog.concat(c.holdOn ? [[c.holdOn, c.endedAt]] : [])
      .filter((h) => h[0] >= askedAt && (!until || h[0] <= until));
    const act = c.steps.find((s) => a.action.test(s.action));
    const auto = holds.length ? "Held then answered" : "Answered without hold";
    return {
      id: a.id, label: a.label, asked: true, askedMs: after(askedAt),
      replyMs: reply ? ms(askedAt, reply.at) : null,
      held: holds.length > 0, holdMs: holds.reduce((n, h) => n + (ms(h[0], h[1]) || 0), 0),
      // negative: the participant took the playbook action before the caller asked
      actionMs: act ? Date.parse(act.at) - Date.parse(askedAt) : null,
      windowMs: ms(askedAt, until),
      auto, outcome: coded ? coded.outcome : auto, coded, note: coded ? coded.note : "",
    };
  });

  const flags = def.flags.map((f) => {
    let v;
    if (f.value) v = f.value(c);
    else if (f.clickLabel) v = c.clickLog.some((x) => f.clickLabel.test(x.label));
    else if (f.dial) v = c.dials.some((d) => f.dial.test(d));
    else v = f.test(c);
    return { id: f.id, label: f.label, good: f.good, value: v == null ? null : v };
  });

  return { rage, dead, features: Object.values(features), anchors, flags };
}

function funnel(summaries, totalCalls) {
  const steps = STAGES.slice();
  for (let k = 1; k <= totalCalls; k++) steps.push("Call " + k + " started", "Call " + k + " done");
  steps.push("Survey done", "Completed");
  return steps.map((label, i) => ({ label, count: summaries.filter((s) => s.rank >= i).length }));
}

function countBy(list, key) {
  const m = {};
  list.forEach((x) => { const k = key(x); m[k] = (m[k] || 0) + 1; });
  return Object.keys(m).map((k) => ({ target: k, count: m[k] })).sort((a, b) => b.count - a.count);
}

// per customer: anchors, flags, click quality and feature use across everyone's connected calls
function behaviourOverview(summaries) {
  const out = {};
  summaries.forEach((s) => s.calls.filter((c) => c.connectedAt).forEach((c) => {
    const b = out[c.client] || (out[c.client] = { client: c.client, calls: 0, people: new Set(), anchors: {}, flags: {},
      rage: [], dead: [], ragePeople: new Set(), features: {}, areas: {} });
    b.calls++; b.people.add(s.code);
    c.anchors.forEach((a) => {
      const x = b.anchors[a.id] || (b.anchors[a.id] = { id: a.id, label: a.label, calls: 0, asked: 0, reply: [], held: 0, holdMs: [], action: [], outcomes: {} });
      x.calls++;
      if (a.asked) {
        x.asked++; x.reply.push(a.replyMs);
        if (a.held) { x.held++; x.holdMs.push(a.holdMs); }
        if (a.actionMs != null) x.action.push(a.actionMs);
      }
      x.outcomes[a.outcome] = (x.outcomes[a.outcome] || 0) + 1;
    });
    c.flags.forEach((f) => {
      const x = b.flags[f.id] || (b.flags[f.id] = { id: f.id, label: f.label, good: f.good, n: 0, yes: 0, values: {} });
      if (f.value == null) return;
      x.n++;
      if (typeof f.value === "string") x.values[f.value] = (x.values[f.value] || 0) + 1;
      else if (f.value) x.yes++;
    });
    b.rage.push(...c.rage); if (c.rage.length) b.ragePeople.add(s.code);
    b.dead.push(...c.dead);
    c.features.forEach((f) => {
      const x = b.features[f.target] || (b.features[f.target] = { target: f.target, area: f.area, label: f.label, people: new Set(), clicks: 0, first: [] });
      x.people.add(s.code); x.clicks += f.count; x.first.push(f.firstMs);
      b.areas[f.area || "Other"] = (b.areas[f.area || "Other"] || 0) + f.count;
    });
  }));
  return Object.values(out).map((b) => ({
    client: b.client, calls: b.calls, people: b.people.size,
    anchors: Object.values(b.anchors).map((x) => ({
      id: x.id, label: x.label, calls: x.calls, asked: x.asked, medianReplyMs: median(x.reply),
      held: x.held, medianHoldMs: median(x.holdMs), medianActionMs: median(x.action), outcomes: x.outcomes,
    })),
    flags: Object.values(b.flags).map((x) => ({ id: x.id, label: x.label, good: x.good, n: x.n, yes: x.yes, values: x.values })),
    rage: { bursts: b.rage.length, people: b.ragePeople.size, top: countBy(b.rage, (r) => r.target).slice(0, 8) },
    dead: { clicks: b.dead.length, top: countBy(b.dead, (r) => r.target).slice(0, 8) },
    features: Object.values(b.features).map((x) => ({ target: x.target, area: x.area, label: x.label, people: x.people.size, clicks: x.clicks, medianFirstMs: median(x.first) }))
      .sort((a, b2) => b2.people - a.people || b2.clicks - a.clicks),
    areas: b.areas,
  }));
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
    behaviour: behaviourOverview(summaries),
    clients: Object.values(byClient).map((b) => ({
      client: b.client, calls: b.calls, medianAhtMs: median(b.aht), medianVerifyMs: median(b.verify),
      medianHolds: median(b.holds), medianHoldMs: median(b.holdMs), transfers: b.transfers,
    })),
  };
}

function csvRows(summaries, opts) {
  const maxCalls = Math.max(2, ...summaries.map((s) => s.calls.length));
  const head = ["code", "email", "first_name", "on_invite_list", "stage", "first_seen", "last_seen", "calls_completed"];
  for (let k = 1; k <= maxCalls; k++) {
    head.push(`call${k}_customer`, `call${k}_completed`, `call${k}_handle_s`, `call${k}_verify_s`, `call${k}_ring_s`,
      `call${k}_holds`, `call${k}_hold_s`, `call${k}_transfer`, `call${k}_end_reason`, `call${k}_attempts`,
      `call${k}_rage_clicks`, `call${k}_dead_clicks`);
    for (let a = 1; a <= 2; a++) head.push(`call${k}_anchor${a}`, `call${k}_anchor${a}_reply_s`, `call${k}_anchor${a}_held`, `call${k}_anchor${a}_action_s`, `call${k}_anchor${a}_outcome`);
    head.push(`call${k}_flags`);
  }
  head.push("paused_next_call", "pause_s", "started_next_early", "clicks", "errors", "microphone");
  const qids = [];
  summaries.forEach((s) => Object.keys((s.survey && s.survey.answers) || {}).forEach((id) => { if (!qids.includes(id)) qids.push(id); }));
  head.push("panel_submitted", "panel_order", "panel_stars", "panel_added", "panel_removed", "panel_own_ideas", "panel_comments");
  head.push("survey_submitted");
  qids.forEach((id) => head.push(`survey_${id}`, `survey_${id}_how`, `survey_${id}_recordings`));
  const sec = (x) => (x == null ? "" : Math.round(x / 1000));
  const rows = summaries.map((s) => {
    const r = [s.code, s.email, s.firstName, s.listed ? "yes" : "no", s.stage, s.firstSeen || "", s.lastSeen || "", s.callsCompleted];
    for (let k = 1; k <= maxCalls; k++) {
      const c = s.calls.find((x) => x.n === k);
      if (!c) { for (let i = 0; i < 12 + 10 + 1; i++) r.push(""); continue; }
      r.push(c.client, c.completed ? "yes" : "no", sec(c.ahtMs), sec(c.verifyMs), sec(c.ringMs), c.holds, sec(c.holdMs), c.transfer || "", c.endReason || "", c.attempts,
        c.rage.length, c.dead.length);
      for (let a = 0; a < 2; a++) {
        const x = c.anchors[a];
        if (!x) { r.push("", "", "", "", ""); continue; }
        r.push(x.id, x.asked ? sec(x.replyMs) : "", x.asked ? (x.held ? "yes" : "no") : "", x.actionMs == null ? "" : sec(x.actionMs), x.outcome);
      }
      r.push(c.flags.map((f) => f.id + "=" + (f.value == null ? "n/a" : f.value === true ? "yes" : f.value === false ? "no" : f.value)).join("; "));
    }
    r.push(s.pauses, sec(s.pauseMs), s.earlyStarts, s.clicks, s.errors, s.device ? s.device.mic : "");
    const ps = (s.panel && s.panel.state) || null;
    if (!ps) r.push("", "", "", "", "", "", "");
    else {
      const cur = (opts && opts.panelCurrent) || [];
      r.push(s.panel.submittedAt || "", ps.order.join(" > "), ps.stars.join(" > "),
        ps.order.filter((id) => !cur.includes(id)).join("; "), cur.filter((id) => !ps.order.includes(id)).join("; "),
        ps.custom.map((c) => c.name + (c.desc ? " (" + c.desc + ")" : "")).join("; "),
        Object.keys(ps.comments).filter((id) => ps.comments[id].text || ps.comments[id].recordings.length)
          .map((id) => id + ": " + (ps.comments[id].text || "[recording]")).join(" | "));
    }
    const ans = (s.survey && s.survey.answers) || {};
    r.push(s.survey && s.survey.submittedAt ? s.survey.submittedAt : "");
    qids.forEach((id) => {
      const a = ans[id];
      if (!a) return r.push("", "", "");
      r.push(a.value != null ? a.value : a.text, a.dictated && a.typed ? "spoken+typed" : a.dictated || a.recordings.length ? "spoken" : a.text ? "typed" : "", a.recordings.length);
    });
    return r;
  });
  const q = (v) => { const t = String(v == null ? "" : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return [head].concat(rows).map((r) => r.map(q).join(",")).join("\n") + "\n";
}

module.exports = { summarize, overview, csvRows, median, rageBursts };
