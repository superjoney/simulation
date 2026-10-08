/* cc telephony controls — behaviour for the markup in the prototype (#aiq-incoming-banner, #aiq-callbar, #cc-float).
   Rebuilt for the simulator; the original file was not included in the prototype export.

   Inside the simulator, the parent page owns the voice call (window.parent.SimBridge) and pushes state here
   through window.ccCall.update(). Opened on its own, the controls run a silent demo call. */
(function () {
  "use strict";
  var W = window, D = document;
  var $ = function (id) { return D.getElementById(id); };

  var bridge = null;
  try { if (W.parent !== W && W.parent.SimBridge) bridge = W.parent.SimBridge; } catch (e) {}

  var S = { state: "idle", message: "", connectedAt: null, endedAt: null, startClock: "", caller: "", phone: "", muted: false, held: false, consult: null };
  var tickTimer = null, consultTimers = [];

  // Transfer / consult destinations ("+")
  var DESTS = [
    { id: "hle", name: "Home Loan Expert", number: "(800) 555 – 0142", note: "Refinance and new loans" },
    { id: "banking", name: "Banking CO", number: "(800) 555 – 0167", note: "" },
    { id: "insurance", name: "Insurance Team", number: "(800) 555 – 0128", note: "Policies and old-carrier refunds" },
    { id: "escrow", name: "Escrow Dept", number: "(800) 555 – 0135", note: "Analyses and escrow changes" },
    { id: "research", name: "Research Dept", number: "(800) 555 – 0119", note: "Wires, check research" },
    { id: "lossmit", name: "Loss Mitigation", number: "(800) 555 – 0151", note: "Hardship and modifications" }
  ];
  function dest(id) { for (var i = 0; i < DESTS.length; i++) if (DESTS[i].id === id) return DESTS[i]; return null; }
  function note(t) { if (bridge && bridge.log) bridge.log(t); }

  function icon(name) { return '<svg class="nova-icon" aria-hidden="true"><use href="#' + name + '"></use></svg>'; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function callerInfo() {
    if (S.caller) return;
    try {
      var loan = W.TM && W.TM.LOANS && W.TM.LOANS[W.TM.currentLoanNumber || Object.keys(W.TM.LOANS)[0]];
      if (loan) { S.caller = loan.primary ? loan.primary.name : loan.owner; S.phone = loan.phone || ""; }
    } catch (e) {}
    if (!S.caller) S.caller = "Caller";
  }

  function since(t) {
    var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    var p = function (n) { return String(n).padStart(2, "0"); };
    return p(Math.floor(s / 60)) + ":" + p(s % 60);
  }
  function consultStatus() {
    var c = S.consult; if (!c) return "";
    return c.state === "dialing" ? "Dialing…" : c.state === "ringing" ? "Ringing…" : '<span class="cc-ctime">' + since(c.at) + '</span>';
  }

  function duration() {
    if (!S.connectedAt) return "00:00:00";
    var s = Math.max(0, Math.floor(((S.endedAt || Date.now()) - S.connectedAt) / 1000));
    var p = function (n) { return String(n).padStart(2, "0"); };
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor(s / 60) % 60) + ":" + p(s % 60);
  }

  function clock(d) {
    var t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    return t.replace(/\s?(AM|PM)/, function (m, ap) { return ap.toLowerCase(); });
  }

  /* ---------------- render ---------------- */

  function render() {
    var b = D.body; if (!b) return;
    ["cc-on", "cc-connecting", "cc-live", "cc-ended", "cc-failed"].forEach(function (c) { b.classList.remove(c); });
    if (S.state !== "idle") b.classList.add("cc-on");
    if (S.state === "connecting") b.classList.add("cc-connecting");
    if (S.state === "connected") b.classList.add("cc-live");
    if (S.state === "ended") b.classList.add("cc-ended");
    if (S.state === "failed") b.classList.add("cc-failed");

    var text = $("aiq-incoming-banner-text");
    if (text) text.textContent = S.state === "failed" ? (S.message || "Call failed") : "Incoming call · Connecting…";
    var banner = $("aiq-incoming-banner"), retry = D.querySelector(".cc-retry");
    if (S.state === "failed" && banner && !retry) {
      retry = D.createElement("button"); retry.type = "button"; retry.className = "cc-retry"; retry.textContent = "Retry";
      retry.addEventListener("click", function () { if (bridge) bridge.start(); else simulateInboundCall(); });
      banner.appendChild(retry);
    } else if (S.state !== "failed" && retry) retry.remove();

    var host = D.body.classList.contains("cc-floating") ? $("cc-float-body") : $("cc-cluster");
    var other = host && host.id === "cc-cluster" ? $("cc-float-body") : $("cc-cluster");
    if (other) other.innerHTML = "";
    if (!host) return;
    if (S.state !== "connected" && S.state !== "ended") { host.innerHTML = ""; return; }

    callerInfo();
    var live = S.state === "connected";
    var buttons =
        '<button type="button" class="cc-btn" data-cc="mute" aria-pressed="' + S.muted + '" aria-label="' + (S.muted ? "Unmute" : "Mute") + '" title="' + (S.muted ? "Unmute" : "Mute") + '">' + icon(S.muted ? "microphone_mute" : "microphone") + '</button>' +
        '<button type="button" class="cc-btn" data-cc="hold" aria-pressed="' + S.held + '" aria-label="' + (S.held ? "Resume" : "Hold") + '" title="' + (S.held ? "Resume" : "Hold") + '">' + icon("pause-small") + '</button>' +
        '<button type="button" class="cc-btn" data-cc="add" aria-label="Add or transfer" title="Add or transfer">' + icon("add") + '</button>' +
        '<button type="button" class="cc-btn" data-cc="keypad" aria-label="Keypad" title="Keypad">' + icon("keypad") + '</button>';

    // Popped out: caller panel on top, controls underneath
    if (host.id === "cc-float-body") {
      host.innerHTML =
        '<div class="cc-card" role="group" aria-label="Call with ' + esc(S.caller) + '">' +
          '<div class="cc-card__caller' + (live ? '' : ' is-ended') + '">' +
            '<span class="cc-card__name">' + esc(S.caller) + '</span>' +
            '<span class="cc-card__meta">' + (S.phone ? '<span>' + esc(S.phone) + '</span><span class="cc-card__sep" aria-hidden="true">|</span>' : '') +
              (live ? (S.held ? '<span class="cc-held">On hold</span>' : '<span class="cc-time">' + duration() + '</span>') : '<span>Ended</span>') +
            '</span>' +
          '</div>' +
          (live && S.consult ? '<div class="cc-consult cc-consult--card" role="group" aria-label="Second line: ' + esc(S.consult.name) + '">' +
            '<div class="cc-consult__who"><span class="cc-consult__name">' + esc(S.consult.name) + '</span><span class="cc-consult__st">' + esc(S.consult.number) + ' · ' + consultStatus() + '</span></div>' +
            consultBtns() + '</div>' : '') +
          (live ? '<div class="cc-card__row"><div class="cc-card__btns">' + buttons + '</div>' +
                  '<button type="button" class="cc-card__end" data-cc="end" aria-label="End call" title="End call">' + icon("call_end") + '</button></div>' : '') +
        '</div>';
      return;
    }

    host.innerHTML =
      '<div class="cc-pill" role="group" aria-label="Call with ' + esc(S.caller) + '">' +
        '<span class="cc-name">' + esc(S.caller) + '</span>' +
        '<span class="cc-meta">' +
          (S.phone ? '<span class="cc-phone">' + esc(S.phone) + '</span>' : '') +
          (live ? '· <span class="cc-time">' + duration() + '</span> · ' + esc(S.startClock) + (S.held ? ' · <span class="cc-held">On hold</span>' : '')
                : '· Call ended · ' + duration()) +
        '</span>' +
        buttons +
        '<button type="button" class="cc-end" data-cc="end" aria-label="End call">' + icon("call_end") + 'End</button>' +
      '</div>' +
      (live && S.consult ? '<div class="cc-pill cc-pill--consult" role="group" aria-label="Second line: ' + esc(S.consult.name) + '">' +
        '<span class="cc-name">' + esc(S.consult.name) + '</span><span class="cc-meta">' + esc(S.consult.number) + ' · ' + consultStatus() + '</span>' +
        consultBtns() + '</div>' : '');
  }

  function consultBtns() {
    return '<button type="button" class="cc-xfer" data-cc="xfer" aria-label="Transfer the caller to ' + esc(S.consult.name) + '">Transfer</button>' +
      '<button type="button" class="cc-btn cc-drop" data-cc="drop" aria-label="Hang up on ' + esc(S.consult.name) + '" title="Hang up this line">' + icon("call_end") + '</button>';
  }

  /* ---------------- second line: consult and transfer ---------------- */

  function dial(id) {
    var d = dest(id);
    if (!d || S.state !== "connected" || S.consult) return false;
    S.consult = { id: d.id, name: d.name, number: d.number, state: "dialing", at: 0, autoHold: !S.held };
    if (!S.held) { S.held = true; if (bridge) bridge.hold(true); }   // the caller waits on hold while you consult
    note("Dialing " + d.name + " · " + d.number);
    if (bridge && bridge.track) bridge.track("dial", { to: d.name });
    render();
    consultTimers.push(setTimeout(function () { if (S.consult) { S.consult.state = "ringing"; render(); } }, 1400));
    consultTimers.push(setTimeout(function () {
      if (!S.consult) return;
      S.consult.state = "connected"; S.consult.at = Date.now();
      note("Connected to " + S.consult.name);
      render();
    }, 4500));
    return true;
  }
  function dropConsult(silent) {
    consultTimers.forEach(clearTimeout); consultTimers = [];
    var c = S.consult; if (!c) return;
    S.consult = null;
    if (silent) return;
    note("Hung up on " + c.name);
    if (bridge && bridge.track) bridge.track("consult_drop", { to: c.name });
    if (c.autoHold && S.held) { S.held = false; if (bridge) bridge.hold(false); }
    render();
  }
  function transfer() {
    var c = S.consult; if (!c) return;
    dropConsult(true);
    note("Transferred the caller to " + c.name);
    if (bridge && bridge.transfer) bridge.transfer(c.name);
    else update({ state: "ended" });
  }

  function tick() {
    var t = D.querySelectorAll(".cc-time");
    for (var i = 0; i < t.length; i++) t[i].textContent = duration();
    if (S.consult && S.consult.state === "connected") {
      var c = D.querySelectorAll(".cc-ctime");
      for (var j = 0; j < c.length; j++) c[j].textContent = since(S.consult.at);
    }
  }

  function relayout() {
    // the shell re-measures the card top (and the rail follows) on resize
    try { W.dispatchEvent(new Event("resize")); } catch (e) {}
  }

  /* ---------------- state (pushed by the simulator) ---------------- */

  function update(next) {
    var prev = S.state;
    Object.keys(next || {}).forEach(function (k) { if (next[k] !== undefined) S[k] = next[k]; });
    if (S.state === "connected" && prev !== "connected") {
      if (!S.connectedAt) S.connectedAt = Date.now();
      S.endedAt = null;
      S.startClock = clock(new Date(S.connectedAt));
    }
    if (S.state === "ended" && !S.endedAt) S.endedAt = Date.now();
    if (S.state === "connecting") { S.connectedAt = null; S.endedAt = null; S.muted = false; S.held = false; }
    if (S.state !== "connected") { closePop(); dropConsult(true); }
    clearInterval(tickTimer);
    if (S.state === "connected") tickTimer = setInterval(tick, 1000);
    render();
    if ((prev === "idle") !== (S.state === "idle")) relayout();
  }
  W.ccCall = { update: update, state: function () { return S.state; }, dial: dial };

  /* ---------------- actions ---------------- */

  D.addEventListener("click", function (e) {
    var to = e.target.closest && e.target.closest("[data-cc-dial]");
    if (to) { closePop(); dial(to.getAttribute("data-cc-dial")); return; }
    var btn = e.target.closest && e.target.closest("[data-cc]");
    if (!btn) { if (!e.target.closest || !e.target.closest(".cc-pop")) closePop(); return; }
    var act = btn.getAttribute("data-cc");
    if (act === "mute") {
      S.muted = !S.muted;
      if (bridge) bridge.mute(S.muted);
      render();
    } else if (act === "hold") {
      S.held = !S.held;
      if (bridge) bridge.hold(S.held);
      render();
    } else if (act === "end") {
      if (bridge) bridge.end(); else update({ state: "ended" });
    } else if (act === "xfer") {
      transfer();
    } else if (act === "drop") {
      dropConsult();
    } else if (act === "add" || act === "keypad") {
      openPop(btn, act);
    }
  });

  function openPop(btn, kind) {
    var had = D.querySelector('.cc-pop[data-kind="' + kind + '"]');
    closePop();
    if (had) return;
    var p = D.createElement("div");
    p.className = "cc-pop"; p.setAttribute("data-kind", kind); p.setAttribute("role", "dialog");
    if (kind === "keypad") {
      p.setAttribute("aria-label", "Keypad");
      p.innerHTML = '<div class="cc-keys">' + "123456789*0#".split("").map(function (k) { return '<button type="button">' + k + '</button>'; }).join("") + '</div>' +
        '<p class="cc-pop-t" style="margin:0;font-weight:400;color:inherit">Tones aren\'t sent in this simulation.</p>';
    } else {
      p.setAttribute("aria-label", "Transfer or consult");
      p.innerHTML = '<p class="cc-pop-t">Transfer or consult</p>' + (S.consult
        ? '<p style="margin:0">You’re already on a second line with ' + esc(S.consult.name) + '.</p>'
        : '<div class="cc-dests">' + DESTS.map(function (d) {
            return '<button type="button" class="cc-dest" data-cc-dial="' + d.id + '"><span class="cc-dest__n">' + esc(d.name) + '</span>' +
              '<span class="cc-dest__s">' + esc(d.number) + (d.note ? ' · ' + esc(d.note) : '') + '</span></button>';
          }).join("") + '</div><p class="cc-pop-hint">The caller is placed on hold while you dial.</p>');
    }
    D.body.appendChild(p);
    var r = btn.getBoundingClientRect();
    // below the button when it fits, otherwise above it (the popped-out card sits at the bottom)
    var below = r.bottom + 10, above = r.top - 10 - p.offsetHeight;
    p.style.top = Math.round(below + p.offsetHeight <= W.innerHeight - 8 || above < 8 ? Math.min(below, W.innerHeight - p.offsetHeight - 8) : above) + "px";
    p.style.left = Math.round(Math.max(8, Math.min(r.left + r.width / 2 - p.offsetWidth / 2, W.innerWidth - p.offsetWidth - 8))) + "px";
  }
  function closePop() { var p = D.querySelectorAll(".cc-pop"); for (var i = 0; i < p.length; i++) p[i].remove(); }
  D.addEventListener("keydown", function (e) { if (e.key === "Escape") closePop(); });

  /* ---------------- functions the prototype markup calls ---------------- */

  function simulateInboundCall() {
    if (bridge) { bridge.start(); return; }
    update({ state: "connecting" });
    setTimeout(function () { if (S.state === "connecting") update({ state: "connected" }); }, 1500);
  }
  W.simulateInboundCall = simulateInboundCall;

  W.ccPopOut = function () {
    D.body.classList.add("cc-floating");
    $("cc-float").hidden = false;
    $("cc-dock-placeholder").hidden = false;
    render();
  };
  W.ccDock = function () {
    D.body.classList.remove("cc-floating");
    $("cc-float").hidden = true;
    $("cc-dock-placeholder").hidden = true;
    render();
  };
  W.ccDragStart = function (e) {
    if (e.target.closest("button")) return;
    var f = $("cc-float"), r = f.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    var bar = e.currentTarget;
    bar.setPointerCapture && bar.setPointerCapture(e.pointerId);
    function move(ev) {
      f.style.bottom = "auto";
      f.style.left = Math.max(0, Math.min(ev.clientX - dx, W.innerWidth - f.offsetWidth)) + "px";
      f.style.top = Math.max(0, Math.min(ev.clientY - dy, W.innerHeight - f.offsetHeight)) + "px";
    }
    function up() { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); }
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  };

  // Researcher demo menu (hidden in testing builds)
  W.ccDemoMenu = function () { var m = $("cc-demo-menu"); if (m) m.hidden = !m.hidden; };
  W.ccDemoRun = function (fn) { var m = $("cc-demo-menu"); if (m) m.hidden = true; if (typeof fn === "function") fn(); };
  W.ccIncoming = simulateInboundCall;
  W.ccAutoOut = simulateInboundCall;
  W.ccLoadAccount = function () { update({ state: "idle" }); };
  W.ccReset = function () { if (bridge && S.state === "connected") bridge.end(); update({ state: "idle" }); };

  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", render); else render();
})();
