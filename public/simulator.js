/* Call center simulator.
   A session plays several calls back to back. For each call it loads that client's prototype build in a
   same-origin iframe and starts the client's ElevenLabs agent (the caller). The first call rings as soon as
   the participant leaves the briefing; later calls start on their own after a short break, which the
   participant can pause. After the last call comes a short survey. Everything is kept in a session log
   (transcripts, clicks, timings) that is saved to the server after each call. */
(function () {
  "use strict";

  var CFG = window.SIM_CONFIG || {};
  var VERSION = "2026-10-09.4"; // shown under Study settings, to confirm which copy is running
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

  var server = { available: false, tokenAuth: false };
  var devices = { input: "", output: "", inputLabel: "", outputLabel: "" };
  var log = null;            // the session log
  var queue = [];            // client configs, in call order
  var callIdx = -1;          // index into queue of the current call
  var call = null;           // the current call's log entry
  var conversation = null;
  var callState = "idle";    // idle | connecting | connected | ended | failed
  var muted = false, onHold = false;
  var breakTimer = null, breakLeft = 0, breakPaused = false;

  var me = null;             // the participant: { code, firstName, listed, orderIndex }
  var progress = null;       // what they've already done: { consented, audioReady, briefed, done, completedCalls }
  var orderOverridden = false;

  var CLIENTS = (CFG.clients || []).filter(function (c) { return c.agentId; });
  var BY_ID = {};
  (CFG.clients || []).forEach(function (c) { BY_ID[c.id] = c; });

  /* ---------------- setup: call order (researcher) ---------------- */

  function permutations(list) {
    if (list.length <= 1) return [list];
    var out = [];
    list.forEach(function (x, i) {
      permutations(list.slice(0, i).concat(list.slice(i + 1))).forEach(function (p) { out.push([x].concat(p)); });
    });
    return out;
  }
  var perCall = Math.min(CFG.callsPerSession || 2, CLIENTS.length);
  var orders = [];
  permutations(CLIENTS).forEach(function (p) {
    var key = p.slice(0, perCall).map(function (c) { return c.id; }).join(",");
    if (orders.indexOf(key) < 0) orders.push(key);
  });
  orders.forEach(function (key) {
    var o = document.createElement("option");
    o.value = key;
    o.textContent = key.split(",").map(function (id) { return BY_ID[id].name.split(" ")[0]; }).join(" → ");
    $("order").appendChild(o);
  });
  if (params.get("order") && orders.indexOf(params.get("order")) >= 0) { $("order").value = params.get("order"); orderOverridden = true; }
  $("order").addEventListener("change", function () { orderOverridden = true; });

  var missing = (CFG.clients || []).filter(function (c) { return !c.agentId; }).map(function (c) { return c.name; });
  function studyInfo() {
    $("study-info").textContent = "Version " + VERSION + " · " + perCall + " call" + (perCall === 1 ? "" : "s") + " per session · " + (CFG.breakSeconds || 10) + "s break · " +
      (server.tokenAuth ? "token auth" : "public agents") + (server.available ? "" : " · no server: logs download only") +
      (missing.length ? " · no agent yet for " + missing.join(", ") : "");
  }
  studyInfo();

  // Opened straight from the folder (file://), the browser walls the prototype off from the simulator:
  // the call controls double up and the microphone prompts on every request. It needs the server.
  var fromFile = location.protocol === "file:";

  /* ---------------- who is this: invite link (?p=CODE) or shared link + email ---------------- */

  function show(id) { ["intro", "brief", "survey", "panel", "notice"].forEach(function (x) { $(x).hidden = x !== id; }); }
  function notice(title, body) { $("notice-title").textContent = title; $("notice-body").textContent = body; show("notice"); }

  function boot() {
    if (fromFile) return notice("Open the study through its link", "This page was opened as a file. In the project folder run “npm start”, then open http://localhost:3000.");
    var code = params.get("p");
    if (!code) { $("email-field").hidden = false; $("name-field").hidden = false; show("intro"); return; }
    fetch("api/participant?p=" + encodeURIComponent(code))
      .then(function (r) { return r.status === 404 ? null : r.ok ? r.json() : Promise.reject(); })
      .then(function (d) {
        if (!d) return notice("This link isn’t valid", "Check that you copied the whole link from your invitation, or contact the research team.");
        identified(d, "link", true);
      })
      .catch(function () { notice("Can’t reach the study", "Check your internet connection, then reload this page."); });
  }

  function identified(d, via, route) {
    me = d.participant;
    progress = d.progress;
    history.replaceState(null, "", "?p=" + me.code + (params.get("debug") ? "&debug=1" : "") + (orderOverridden ? "&order=" + encodeURIComponent($("order").value) : ""));
    track("opened", { via: via, listed: me.listed, ua: navigator.userAgent.slice(0, 200), screen: screen.width + "x" + screen.height });
    if (progress.done) return notice("You’ve completed the study", "Thank you for taking part. You can close this tab.");
    if (progress.surveyDone && window.SimPanel && window.SimPanel.enabled()) return window.SimPanel.start(d.panel);
    if (progress.callsDone) return showSurvey(d.survey);
    if (!route) return;
    // first names come from the invite list; ask only when we don't have one
    $("name-field").hidden = !!me.firstName;
    if (progress.consented) {
      $("intro-title").textContent = "Welcome back";
      $("intro-sub").textContent = "Check your audio, then pick up where you left off.";
      $("consent-box").hidden = true;
      $("audio-step").hidden = false;
    }
    show("intro");
  }

  // the audio check appears once they've agreed
  $("consent").addEventListener("change", function () {
    $("audio-step").hidden = !this.checked && !$("consent-box").hidden;
    if (this.checked) { $("intro-error").hidden = true; $("audio-allow").focus(); }
  });

  // Welcome screen: email (shared link only), name (if unknown), audio check and consent in one go
  var plannedOrder = null, startIdx = 0;
  $("intro-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("intro-error");
    err.hidden = true;
    var fail = function (msg) { err.textContent = msg; err.hidden = false; };
    if (!$("email-field").hidden && !$("email").value.trim()) return fail("Enter the email your invitation was sent to.");
    if (!$("name-field").hidden && !$("participant").value.trim()) return fail("Enter your first name.");
    if (!$("consent-box").hidden && !$("consent").checked) return fail("Please tick the box to agree before continuing.");
    if ($("audio-devices").hidden) return fail("Allow your microphone first, so you can talk to the callers.");
    if (!CLIENTS.length) return fail("No callers are set up yet. Ask the research team to add an agent ID.");

    var ready = me ? Promise.resolve(true) : fetch("api/participant/identify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("email").value }),
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(function (d) {
      identified(d, "email", false);
      return !d.progress.done && !d.progress.callsDone;
    });
    ready.then(function (go) {
      if (!go) return;
      if (!progress.consented) { track("consent"); progress.consented = true; }
      readDevices();
      track("device", { mic: devices.inputLabel, speaker: devices.outputLabel });
      var typed = $("name-field").hidden ? "" : $("participant").value.trim();
      // save the name (if they typed one) and get this participant's call order (rotated across participants)
      return fetch("api/participant/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ p: me.code, orders: orders.length }, typed ? { firstName: typed } : {})),
      }).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
        me = d.participant;
      }).catch(function () { if (typed) me.firstName = typed; }).then(briefing);
    }).catch(function (status) {
      fail(status === 400 ? "That doesn’t look like an email address." : "Couldn’t reach the study. Check your connection and try again.");
    });
  });

  function briefing() {
    var idx = me.orderIndex != null ? me.orderIndex % orders.length : 0;
    plannedOrder = (orderOverridden ? $("order").value : orders[idx]).split(",");
    var done = progress.completedCalls || [];
    startIdx = 0;
    while (startIdx < plannedOrder.length && done.indexOf(startIdx + 1) >= 0) startIdx++;
    if (startIdx > 0) {
      $("brief-title").textContent = "Welcome back";
      $("brief-body").innerHTML = "";
      var p = document.createElement("p");
      p.className = "setup-sub";
      p.textContent = "You’ve finished " + startIdx + " of " + plannedOrder.length + " calls. The next customer calls as soon as you press the button.";
      $("brief-body").appendChild(p);
      $("brief-go").textContent = "Start call " + (startIdx + 1);
    }
    show("brief");
  }

  fetch("api/config")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (c) {
      server = { available: true, tokenAuth: !!c.tokenAuth };
      if (c.label) {
        // test copies say so on every screen
        var b = document.createElement("div");
        b.className = "env-badge";
        b.textContent = c.label;
        b.title = "This is not the live simulator";
        document.body.appendChild(b);
        document.title = c.label + " · " + document.title;
      }
    })
    .catch(function () {})
    .then(function () { studyInfo(); boot(); });

  /* ---------------- setup: audio devices ---------------- */

  var meter = null;
  // The chosen microphone stays open for the whole session. Holding it means the browser never asks for
  // permission again between calls (Safari, or Chrome's "Allow this time"), so the next call goes straight in.
  var micStream = null;
  var nativeGUM = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null;
  var VOICE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (nativeGUM) {
    // The ElevenLabs SDK asks for the microphone itself (sometimes twice per call). Hand it a copy of the
    // microphone the participant already allowed, so the browser never prompts again.
    navigator.mediaDevices.getUserMedia = function (c) {
      var t = micStream && micStream.getAudioTracks()[0];
      if (t && t.readyState === "live" && c && c.audio && !c.video) return Promise.resolve(new MediaStream([t.clone()]));
      return nativeGUM(c);
    };
  }
  var canPickSpeaker = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  $("audio-allow").addEventListener("click", function () {
    nativeGUM({ audio: VOICE }).then(function (stream) {
      micStream = stream;
      return listDevices();
    }).then(function () {
      // select the microphone the browser actually opened, so the meter doesn't reopen it
      var id = micStream.getAudioTracks()[0].getSettings().deviceId;
      var opt = id && [].filter.call($("mic-select").options, function (o) { return o.value === id; })[0];
      if (opt) { $("mic-select").value = id; readDevices(); }
      $("audio-allow").hidden = true;
      $("audio-msg").hidden = true;
      $("intro-error").hidden = true;
      $("audio-devices").hidden = false;
      startMeter();
    }).catch(function (err) {
      $("audio-msg").textContent = err && err.name === "NotAllowedError"
        ? "Microphone access is blocked. Allow it in the browser’s address bar, then try again."
        : "Couldn’t open a microphone: " + ((err && err.message) || err);
      $("audio-msg").className = "field-note err";
    });
  });

  function listDevices() {
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      fill($("mic-select"), list.filter(function (d) { return d.kind === "audioinput"; }), "Microphone");
      if (canPickSpeaker) fill($("speaker-select"), list.filter(function (d) { return d.kind === "audiooutput"; }), "Speaker");
      else $("speaker-field").hidden = true;
      readDevices();
    });
  }
  function fill(sel, list, fallback) {
    var keep = sel.value;
    sel.innerHTML = "";
    list.forEach(function (d, i) {
      var o = document.createElement("option");
      o.value = d.deviceId;
      o.textContent = d.label || fallback + " " + (i + 1);
      sel.appendChild(o);
    });
    if (keep) sel.value = keep;
  }
  function readDevices() {
    var mic = $("mic-select"), spk = $("speaker-select");
    devices.input = mic.value || "";
    devices.inputLabel = mic.selectedOptions[0] ? mic.selectedOptions[0].textContent : "";
    devices.output = canPickSpeaker ? spk.value || "" : "";
    devices.outputLabel = canPickSpeaker && spk.selectedOptions[0] ? spk.selectedOptions[0].textContent : "";
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", function () { if (!$("audio-devices").hidden) listDevices(); });
  }
  $("mic-select").addEventListener("change", function () { readDevices(); startMeter(); });
  $("speaker-select").addEventListener("change", readDevices);

  function openMic() {
    var track = micStream && micStream.getAudioTracks()[0];
    if (track && track.readyState === "live" && (!devices.input || (track.getSettings().deviceId || "") === devices.input)) {
      return Promise.resolve(micStream);
    }
    var constraints = { audio: devices.input ? Object.assign({ deviceId: { exact: devices.input } }, VOICE) : VOICE };
    return nativeGUM(constraints).then(function (stream) {
      if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
      micStream = stream;
      return stream;
    });
  }

  function startMeter() {
    stopMeter();
    openMic().then(function (stream) {
      var ctx = new AudioContext();
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      var data = new Uint8Array(analyser.fftSize), heard = false;
      meter = { ctx: ctx, raf: 0 };
      (function tick() {
        analyser.getByteTimeDomainData(data);
        var peak = 0;
        for (var i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
        $("mic-meter").style.width = Math.min(100, peak * 1.6) + "%";
        if (!heard && peak > 12) {
          heard = true;
          $("mic-hint").textContent = "Microphone is working.";
          $("mic-hint").className = "field-note ok";
        }
        meter.raf = requestAnimationFrame(tick);
      })();
    }).catch(function () {
      $("mic-hint").textContent = "Couldn’t open this microphone. Pick another.";
      $("mic-hint").className = "field-note err";
    });
  }
  function stopMeter() {
    if (!meter) return;
    cancelAnimationFrame(meter.raf);
    meter.ctx.close();
    meter = null;
  }

  $("speaker-test").addEventListener("click", function () {
    var ctx = new AudioContext();
    var go = devices.output && ctx.setSinkId ? ctx.setSinkId(devices.output) : Promise.resolve();
    go.catch(function () {}).then(function () {
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.95);
      osc.onended = function () { ctx.close(); };
    });
  });


  $("brief-go").addEventListener("click", function () {
    stopMeter();
    unlockAudio();
    openMic().catch(function () {});
    track("briefed", { resume: startIdx > 0 });
    startSession(me.firstName || "", plannedOrder, startIdx);
  });

  /* ---------------- the session ---------------- */

  function startSession(firstName, order, firstIdx) {
    var participantId = (me && me.email) || firstName;
    window.SIM_REP_NAME = firstName; // the prototypes' greeting reads this ("This is <name>")
    queue = order.map(function (id) { return BY_ID[id]; });
    log = {
      sessionId: new Date().toISOString().replace(/[:.]/g, "-"),
      participantId: participantId,
      code: me && me.code,
      firstName: firstName,
      order: order,
      devices: { input: devices.inputLabel, output: devices.outputLabel },
      sessionStartedAt: new Date().toISOString(),
      sessionEndedAt: null,
      calls: [],
      events: [],
    };
    track("session_start", { order: order, sid: log.sessionId, startAt: (firstIdx || 0) + 1, version: VERSION });
    show(null);
    $("stage").hidden = false;
    if (params.get("debug") === "1") showLog(true);
    // the briefing's button is the go signal: the first call rings straight away
    loadCall(firstIdx || 0, true);
  }

  // Load the prototype for call i. autoStart: start the call without waiting for the participant.
  function loadCall(i, autoStart) {
    callIdx = i;
    var client = queue[i];
    callState = "idle";
    muted = false; onHold = false;
    call = {
      n: i + 1, client: client.id, caller: client.name, playbook: client.playbook, agentId: client.agentId,
      conversationId: null, startedAt: null, connectedAt: null, endedAt: null, endReason: null, transcript: [],
    };
    log.calls.push(call);
    event("session", "Loading call " + call.n + " · " + client.name);
    track("call_load", { n: call.n, client: client.id });

    var stage = $("stage");
    stage.onload = function () { hookPrototype(stage, autoStart); };
    stage.src = "prototypes/" + client.id + ".html";

    var initials = client.name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2);
    $("call-avatar").textContent = initials.toUpperCase();
    $("call-name").textContent = client.name;
    $("call").hidden = true;
  }

  function hookPrototype(stage, autoStart) {
    var doc;
    try { doc = stage.contentDocument; } catch (e) { doc = null; }
    if (!doc) {
      // Cross-origin or file:// — we can't see the prototype's button, so offer our own.
      event("note", "Could not hook into the prototype (open the simulator through the server). Showing a start button instead.");
      showIdleCall();
      return;
    }
    if (doc.__simHooked) return;
    doc.__simHooked = true;
    var sel = CFG.startSelector || "#tm-start";

    var logoStyle = doc.createElement("style");
    logoStyle.textContent = ".shv-logo{cursor:pointer}";
    (doc.head || doc.documentElement).appendChild(logoStyle);

    // Dead-click detection: a click that changes nothing on the page within a second. Parts of the page
    // that change on their own (the call timer, clocks) are learned while the participant is idle and
    // ignored, so only changes that follow the click count.
    var autonomous = new WeakSet(), lastInputAt = 0, freshAt = 0;
    var markInput = function () { lastInputAt = Date.now(); };
    ["pointerdown", "keydown", "wheel"].forEach(function (t) { doc.addEventListener(t, markInput, true); });
    try {
      new doc.defaultView.MutationObserver(function (recs) {
        var now = Date.now(), idle = now - lastInputAt > 1500;
        recs.forEach(function (r) {
          var t = r.type === "characterData" ? r.target.parentNode : r.target;
          if (!t) return;
          if (idle) autonomous.add(t);
          else if (!autonomous.has(t)) freshAt = now;
        });
      }).observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch (err) {}

    doc.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target : null;
      if (!el) return;
      var ctl = el.closest("button, a, [role=button], [role=tab], [role=option], [role=menuitem], [role=checkbox], label, summary, input, select, textarea, [data-rz], [data-cc]");
      var label = ctl ? (ctl.getAttribute("aria-label") || ctl.getAttribute("title") || ctl.textContent || ctl.getAttribute("placeholder") || ctl.name ||
        ctl.getAttribute("data-rz") || ctl.getAttribute("data-cc") || "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
      var w = doc.defaultView;
      var fields = { at: new Date().toISOString(), n: call ? call.n : null, client: call ? call.client : null, label: label, area: areaOf(el),
        tag: el.tagName.toLowerCase(), interactive: !!ctl, x: Math.round(e.clientX), y: Math.round(e.clientY),
        sx: Math.round(w.scrollX), sy: Math.round(w.scrollY), vw: w.innerWidth, vh: w.innerHeight };
      // every click is kept (with position and whether anything happened) for click analysis
      // keyboard-activated or scripted clicks have no position: kept, but left out of rage/dead analysis
      if (!e.isTrusted || e.detail === 0) fields.synthetic = true;
      var t0 = Date.now(), focus0 = doc.activeElement;
      setTimeout(function () {
        var focused = doc.activeElement && doc.activeElement !== focus0 && doc.activeElement !== doc.body;
        fields.effect = freshAt >= t0 || focused || !!el.closest("input, select, textarea, a[href]");
        track("click", fields);
      }, 1000);
      if (el.closest("#cv-finish") && call) track("verified", { n: call.n, client: call.client });
      var rz = el.closest("[data-rz]");
      if (rz && call) track("step", { n: call.n, client: call.client, action: rz.getAttribute("data-rz") + (rz.getAttribute("data-v") ? ":" + rz.getAttribute("data-v") : ""), label: label });
      if (el.closest(sel)) { unlockAudio(); startCall(); return; }
      if (el.closest(".shv-logo")) { goHome(); return; }
      if (!label) return;
      event("click", label);
      if (CFG.sendNavigationContext && callState === "connected" && conversation) {
        conversation.sendContextualUpdate("The representative clicked: " + label);
      }
    }, true);
    doc.addEventListener("keydown", onKey, true);

    if (autoStart) {
      // Press the prototype's own start button once its landing card has settled (it re-adds itself for ~400ms).
      var tries = 0;
      (function press() {
        var b = doc.querySelector(sel);
        if (b && b.__seen && Date.now() - b.__seen > 700) { b.click(); return; }
        if (b && !b.__seen) b.__seen = Date.now();
        if (++tries < 100) setTimeout(press, 100);
        else showIdleCall();
      })();
    }
  }

  // Which part of the screen a click landed in, for feature-use and click analysis
  var AREAS = [
    ["#aiq-callbar, .cc-card, .cc-pop, .cc-menu, [data-cc]", "Phone"],
    ["#aiqx-rail", "Right panel"],
    ["#pg-guidance, #pg-guided-card", "Playbook"],
    ["#tm-head", "Client header"],
    ["#client-content, .dv-card", "Client record"],
  ];
  function areaOf(el) {
    for (var i = 0; i < AREAS.length; i++) {
      var hit = el.closest(AREAS[i][0]);
      if (!hit) continue;
      if (AREAS[i][1] === "Right panel") {
        var pane = el.closest(".shv-pane[id]");
        return "Right panel" + (pane ? " · " + pane.id.replace(/^shv-pane-/, "").replace(/^./, function (c) { return c.toUpperCase(); }) : "");
      }
      return AREAS[i][1];
    }
    return "Other";
  }

  // The rocket logo in the prototype: end the session and go back to the start page.
  function goHome() {
    if ((callState === "connecting" || callState === "connected") &&
        !window.confirm("End this call and go back to the start page?")) return;
    event("session", "Left via the logo");
    track("left", { n: call ? call.n : null });
    var conv = conversation;
    if (conv) { finishCall("participant_left"); conv.endSession(); }
    clearTimeout(breakTimer);
    saveLog();
    if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
    flush(true);
    location.href = location.pathname + "?p=" + encodeURIComponent(me.code);
  }

  /* ---------------- the call ---------------- */

  // The prototype's own call controls (prototypes/cc-controls.js), when it has them.
  function protoControls() {
    try { return $("stage").contentWindow.ccCall || null; } catch (e) { return null; }
  }

  // What the prototype's call controls call back into.
  window.SimBridge = {
    start: function () { startCall(); },
    end: endCall,
    mute: setMuted,
    hold: setHold,
    log: function (text) { event("call", text); },
    track: function (type, fields) { track(type, Object.assign({ n: call ? call.n : null, client: call ? call.client : null }, fields || {})); },
    // Transfer from the call controls' second line: the customer leaves this call
    transfer: function (to) {
      var conv = conversation;
      track("transfer", { n: call.n, client: call.client, to: to });
      finishCall("transferred to " + to);
      if (conv) conv.endSession();
    },
  };

  function showIdleCall() {
    $("call").hidden = false;
    $("call").className = "call is-idle";
    $("call-answer").hidden = false;
    $("call-status").textContent = "Ready";
  }

  /* ---------------- ring tone ----------------
     A phone ring (two short 440+480 Hz bursts, then a pause) from the moment a call comes in until the
     caller connects, on the speaker chosen at setup. */
  // One audio channel for the whole session, opened during the Start click: browsers (Safari especially)
  // keep a channel opened outside a click muted, which is why the ring has to be unlocked up front.
  var audioCtx = null;
  function unlockAudio() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (devices.output && audioCtx.setSinkId) audioCtx.setSinkId(devices.output).catch(function () {});
      // a silent blip inside the click is what actually unlocks playback
      var b = audioCtx.createBufferSource();
      b.buffer = audioCtx.createBuffer(1, 1, 22050);
      b.connect(audioCtx.destination);
      b.start(0);
    }
    if (audioCtx.state !== "running" && audioCtx.resume) audioCtx.resume().catch(function () {});
    return audioCtx;
  }

  var ring = null;
  function startRing() {
    stopRing();
    var ctx = unlockAudio(); if (!ctx) return;
    var env = ctx.createGain(), vol = ctx.createGain();
    env.gain.value = 0;
    vol.gain.value = 0.3;
    env.connect(vol).connect(ctx.destination);
    var oscs = [440, 480].map(function (f) {
      var o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(env);
      o.start();
      return o;
    });
    function burst(at) {
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(1, at + 0.02);
      env.gain.setValueAtTime(1, at + 0.4);
      env.gain.linearRampToValueAtTime(0, at + 0.42);
    }
    // two short bursts every 2.5s, scheduled a few seconds ahead
    var r = ring = { oscs: oscs, out: vol, next: ctx.currentTime + 0.05, timer: 0 };
    (function schedule() {
      if (ring !== r) return;
      while (r.next < ctx.currentTime + 6) { burst(r.next); burst(r.next + 0.6); r.next += 2.5; }
      r.timer = setTimeout(schedule, 2000);
    })();
  }
  function stopRing() {
    if (!ring) return;
    clearTimeout(ring.timer);
    ring.oscs.forEach(function (o) { try { o.stop(); } catch (e) {} });
    ring.out.disconnect();
    ring = null;
  }

  function startCall() {
    if (!call || callState === "connecting" || callState === "connected" || callState === "ended") return;
    var client = queue[callIdx];
    setCallState("connecting");
    call.startedAt = new Date().toISOString();
    event("call", "Call " + call.n + " started · " + client.name);
    track("call_start", { n: call.n, client: client.id });

    var mine = call;
    startRing();
    var minRing = (CFG.ringSeconds == null ? 3 : CFG.ringSeconds) * 1000;
    new Promise(function (r) { setTimeout(r, minRing); }).then(function () {
      return getSessionOptions(client);
    }).then(function (opts) {
      if (mine !== call || callState !== "connecting") return null;
      opts.userId = log.participantId || undefined;
      if (devices.input) opts.inputDeviceId = devices.input;
      if (devices.output) opts.outputDeviceId = devices.output;
      if (CFG.dynamicVariables && Object.keys(CFG.dynamicVariables).length) opts.dynamicVariables = CFG.dynamicVariables;
      opts.onConnect = function (p) {
        if (mine !== call || callState !== "connecting") return;
        stopRing();
        call.conversationId = p && p.conversationId;
        call.connectedAt = new Date().toISOString();
        event("call", "Connected · conversation " + call.conversationId);
        track("call_connected", { n: call.n, client: call.client, conversationId: call.conversationId });
        setCallState("connected");
      };
      opts.onMessage = function (m) {
        var role = m.role || (m.source === "ai" ? "agent" : "user");
        mine.transcript.push({ at: new Date().toISOString(), role: role, text: m.message });
        track("transcript", { n: mine.n, client: mine.client, role: role, text: m.message });
        renderLog();
      };
      opts.onModeChange = function (m) { $("call").classList.toggle("is-speaking", m.mode === "speaking"); };
      opts.onError = function (message) { event("error", String(message)); track("error", { n: mine.n, message: String(message) }); };
      opts.onDisconnect = function (details) {
        if (mine !== call) return;
        finishCall(details && details.reason === "agent" ? "agent_hung_up"
          : details && details.reason === "error" ? "error: " + (details.message || "connection lost")
          : "participant_hung_up");
      };
      return window.ElevenLabsClient.Conversation.startSession(opts);
    }).then(function (conv) {
      if (!conv) return;
      if (mine !== call || (callState !== "connecting" && callState !== "connected")) { conv.endSession(); return; }
      conversation = conv;
      if (muted || onHold) {
        conv.setMicMuted(true);
        if (onHold) conv.setVolume({ volume: 0 });
      }
    }).catch(function (err) {
      if (mine !== call) return;
      stopRing();
      var msg = (err && err.message) || String(err);
      event("error", msg);
      track("error", { n: mine.n, message: msg, connect: true });
      setCallState("failed", /permission|NotAllowed/i.test(msg) ? "Microphone blocked" : "Couldn't connect");
      saveLog();
    });
  }

  function getSessionOptions(client) {
    if (!window.ElevenLabsClient) return Promise.reject(new Error("ElevenLabs client library failed to load"));
    var type = CFG.connectionType || "webrtc";
    if (server.tokenAuth && type === "webrtc") {
      return fetch("api/conversation-token?agent_id=" + encodeURIComponent(client.agentId)).then(function (r) {
        if (!r.ok) throw new Error("Token request failed (" + r.status + ")");
        return r.json();
      }).then(function (b) { return { conversationToken: b.token, connectionType: "webrtc" }; });
    }
    return Promise.resolve({ agentId: client.agentId, connectionType: type });
  }

  function endCall() {
    var conv = conversation;
    finishCall("participant_hung_up");
    if (conv) conv.endSession();
  }

  function finishCall(reason) {
    if (callState !== "connecting" && callState !== "connected") return;
    stopRing();
    call.endedAt = new Date().toISOString();
    call.endReason = reason;
    event("call", "Call " + call.n + " ended (" + reason + ")");
    track("call_end", { n: call.n, client: call.client, reason: reason });
    var failed = reason.indexOf("error") === 0 && !call.connectedAt;
    setCallState(failed ? "failed" : "ended", failed ? "Call dropped" : "");
    conversation = null;
    saveLog();
    if (!failed && reason !== "participant_left") afterCall();
  }

  function setMuted(m) {
    muted = m;
    $("call-mute").setAttribute("aria-pressed", String(muted));
    $("call-mute-label").textContent = muted ? "Unmute" : "Mute";
    if (conversation) conversation.setMicMuted(muted || onHold);
    event("call", muted ? "Muted" : "Unmuted");
    track("mute", { n: call ? call.n : null, on: muted });
  }

  // Hold: the caller can't hear the representative and the representative can't hear the caller.
  function setHold(h) {
    onHold = h;
    if (conversation) {
      conversation.setMicMuted(muted || onHold);
      conversation.setVolume({ volume: onHold ? 0 : 1 });
      conversation.sendContextualUpdate(onHold
        ? "The representative has placed you on hold. You hear hold music and wait."
        : "The representative is back from hold and can hear you again.");
    }
    event("call", onHold ? "Placed on hold" : "Resumed from hold");
    track("hold", { n: call ? call.n : null, on: onHold });
  }

  function setCallState(state, message) {
    callState = state;
    var client = queue[callIdx] || {};
    var cc = protoControls();
    if (cc) cc.update({
      state: state,
      message: state === "failed" ? message || "Call failed" : "",
      caller: client.name,
      phone: client.phone,
      connectedAt: call && call.connectedAt ? Date.parse(call.connectedAt) : undefined,
      endedAt: call && call.endedAt ? Date.parse(call.endedAt) : undefined,
    });
    var el = $("call");
    el.hidden = !!cc;
    el.className = "call is-" + state;
    $("call-answer").hidden = state !== "failed";
    clearInterval(el.__timer);
    if (state === "connecting") $("call-status").textContent = "Connecting…";
    if (state === "connected") { tick(); el.__timer = setInterval(tick, 1000); }
    if (state === "ended") $("call-status").textContent = "Call ended · " + elapsed();
    if (state === "failed") $("call-status").textContent = (message || "Call failed") + " · tap to retry";
    renderLog();
  }

  function tick() { $("call-status").textContent = elapsed(); }

  function elapsed() {
    if (!call || !call.connectedAt) return "00:00";
    var end = call.endedAt ? new Date(call.endedAt) : new Date();
    var s = Math.max(0, Math.round((end - new Date(call.connectedAt)) / 1000));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  $("call-answer").addEventListener("click", function () {
    if (callState === "failed") callState = "idle";
    startCall();
  });
  $("call-end").addEventListener("click", endCall);
  $("call-mute").addEventListener("click", function () { setMuted(!muted); });

  window.addEventListener("pagehide", function () {
    track("page_hide", { n: call ? call.n : null, state: callState });
    flush(true);
    if (conversation) conversation.endSession();
  });

  /* ---------------- between calls ---------------- */

  function afterCall() {
    if (callIdx + 1 >= queue.length) {
      log.sessionEndedAt = new Date().toISOString();
      event("session", "All calls complete");
      track("calls_done");
      saveLog();
      if (hasSurvey()) {
        showBreak("All calls complete", "Next, a few short questions.", true);
        setTimeout(function () { $("break").hidden = true; $("stage").hidden = true; $("stage").src = "about:blank"; showSurvey(null); }, 2500);
        return;
      }
      track("done");
      showBreak("All calls complete", "Thank you for taking part. You can close this tab.", true);
      if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
      return;
    }
    breakLeft = CFG.breakSeconds || 10;
    showBreak("Call complete", breakPaused ? "Next call is paused." : "");
    breakTick();
  }

  function breakTick() {
    clearTimeout(breakTimer);
    if (breakPaused) return;
    if (breakLeft <= 0) {
      $("break").hidden = true;
      loadCall(callIdx + 1, true);
      return;
    }
    $("break-sub").textContent = "Next call in " + breakLeft + "s";
    breakLeft -= 1;
    breakTimer = setTimeout(breakTick, 1000);
  }

  function showBreak(title, sub, done) {
    $("break-title").textContent = title;
    $("break-sub").textContent = sub;
    $("break").className = "break" + (done ? " is-done" : "");
    $("break").hidden = false;
    $("break-pause").textContent = breakPaused ? "Start next call" : "Pause next call";
    $("break-now").hidden = breakPaused;
  }

  $("break-now").addEventListener("click", function () {
    event("session", "Next call started early");
    track("break_skip", { after: call ? call.n : null });
    breakPaused = false;
    breakLeft = 0;
    breakTick();
  });

  $("break-pause").addEventListener("click", function () {
    breakPaused = !breakPaused;
    event("session", breakPaused ? "Next call paused" : "Next call resumed");
    track(breakPaused ? "break_pause" : "break_resume", { after: call ? call.n : null });
    this.textContent = breakPaused ? "Start next call" : "Pause next call";
    $("break-now").hidden = breakPaused;
    if (breakPaused) {
      clearTimeout(breakTimer);
      $("break-sub").textContent = "Next call is paused.";
    } else {
      breakLeft = 0; // the participant asked for it: start now
      breakTick();
    }
  });

  /* ---------------- survey (after the last call) ---------------- */
  // Open questions can be typed or spoken. Speaking records the audio (uploaded to the server when the
  // participant stops) and, where the browser supports it, transcribes live into the text box so they
  // can see and fix what was heard. Answers save as they go, so a refresh or a dropped connection
  // doesn't lose them.

  var SURVEY = CFG.survey || {};
  var answers = {}, saveTimer = 0, rec = null;
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  function hasSurvey() { return !!(SURVEY.questions && SURVEY.questions.length); }

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k != null) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); });
    return e;
  }
  function answer(id) { return answers[id] || (answers[id] = { text: "", value: null, recordings: [], dictated: false, typed: false }); }

  function showSurvey(saved) {
    answers = saved || answers || {};
    $("stage").hidden = true;
    $("survey-title").textContent = SURVEY.title || "A few questions";
    $("survey-intro").textContent = SURVEY.intro || "";
    $("survey-submit").textContent = window.SimPanel && window.SimPanel.enabled() ? "Submit and continue" : "Submit answers";
    var box = $("survey-questions");
    box.innerHTML = "";
    SURVEY.questions.forEach(function (q, i) { box.appendChild(renderQuestion(q, i)); });
    show("survey");
    track("survey_start", { resumed: !!saved });
    window.scrollTo(0, 0);
  }

  function renderQuestion(q, i) {
    var a = answer(q.id);
    var id = "q-" + q.id;
    var head = h("legend", { class: "q-text" }, [(i + 1) + ". " + q.text, q.required ? null : h("span", { class: "q-opt", text: " (optional)" })]);
    var wrap = h("fieldset", { class: "q", id: id }, [head]);

    if (q.type === "scale" || q.type === "choice") {
      var opts = q.type === "scale" ? range(q.min || 1, q.max || 5).map(String) : q.options || [];
      var row = h("div", { class: q.type === "scale" ? "q-scale" : "q-choice" });
      opts.forEach(function (o) {
        var input = h("input", { type: "radio", name: id, value: o });
        if (String(a.value) === o) input.checked = true;
        input.addEventListener("change", function () { a.value = q.type === "scale" ? Number(o) : o; queueSave(); });
        row.appendChild(h("label", { class: "q-opt-btn" }, [input, h("span", { text: o })]));
      });
      wrap.appendChild(row);
      if (q.type === "scale" && q.labels) {
        wrap.appendChild(h("div", { class: "q-ends" }, [h("span", { text: q.labels[0] }), h("span", { text: q.labels[1] })]));
      }
      return wrap;
    }

    // open question: text box + speak
    head.id = id + "-l";
    voiceField(q.id, a, queueSave, { label: id + "-l" }).forEach(function (n) { wrap.appendChild(n); });
    return wrap;
  }

  // A text box with a Speak button: typed, or spoken (recorded, and transcribed live by the browser).
  // key names the recording files; a is the answer object it fills; onChange saves.
  function voiceField(key, a, onChange, opts) {
    opts = opts || {};
    var ta = h("textarea", { rows: String(opts.rows || 3), placeholder: opts.placeholder || "Type here, or press Speak" });
    if (opts.label) ta.setAttribute("aria-labelledby", opts.label);
    if (opts.ariaLabel) ta.setAttribute("aria-label", opts.ariaLabel);
    ta.value = a.text || "";
    ta.addEventListener("input", function () {
      a.text = ta.value;
      if (!rec || rec.key !== key) a.typed = true;
      onChange();
    });
    var btn = h("button", { type: "button", class: "btn btn-secondary q-speak", "aria-pressed": "false" }, [micIcon(), h("span", { text: "Speak" })]);
    var status = h("span", { class: "field-note q-status", role: "status" });
    if (a.recordings.length) status.textContent = recSaved(a);
    btn.addEventListener("click", function () {
      if (rec && rec.key === key) stopRecording();
      else startRecording(key, a, ta, btn, status, onChange);
    });
    return [ta, h("div", { class: "q-tools" }, [btn, status])];
  }

  function range(a, b) { var out = []; for (var x = a; x <= b; x++) out.push(x); return out; }
  function recSaved(a) { return a.recordings.length === 1 ? "Recording saved." : a.recordings.length + " recordings saved."; }
  function micIcon() {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    s.innerHTML = '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>';
    return s;
  }

  function startRecording(key, a, ta, btn, status, onChange) {
    if (rec) stopRecording();
    openMic().then(function (stream) {
      var types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      var type = window.MediaRecorder && MediaRecorder.isTypeSupported ? types.filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] : "";
      var mr = new MediaRecorder(new MediaStream([stream.getAudioTracks()[0].clone()]), type ? { mimeType: type } : undefined);
      var chunks = [];
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec = { key: key, mr: mr, sr: null, started: Date.now(), timer: 0, btn: btn, status: status };
      var me2 = rec;
      mr.onstop = function () {
        mr.stream.getTracks().forEach(function (t) { t.stop(); });
        var blob = new Blob(chunks, { type: mr.mimeType || type || "audio/webm" });
        if (!blob.size) return;
        status.textContent = "Saving recording…";
        upload(key, blob).then(function (file) {
          a.recordings.push(file);
          status.textContent = recSaved(a);
          track("voice_audio", { key: key, ms: Date.now() - me2.started, bytes: blob.size });
          onChange(true);
        }).catch(function () { status.textContent = "Couldn’t save the recording. Your text is still saved."; });
      };
      mr.start(1000);

      // live transcription into the box, after whatever is already typed
      if (Recognition) {
        var base = ta.value ? ta.value.replace(/\s*$/, " ") : "", finals = "";
        var sr = new Recognition();
        sr.continuous = true; sr.interimResults = true; sr.lang = navigator.language || "en-US";
        sr.onresult = function (e) {
          var interim = "";
          for (var i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finals += e.results[i][0].transcript.trim() + " ";
            else interim += e.results[i][0].transcript;
          }
          ta.value = (base + finals + interim).replace(/\s+$/, interim ? "" : " ").trimStart();
          a.text = ta.value.trim(); a.dictated = true;
          onChange();
        };
        // Chrome ends recognition after a pause; keep listening until they press Stop
        sr.onend = function () { if (rec === me2) { try { sr.start(); } catch (err) {} } };
        sr.onerror = function (e) { if (e.error === "not-allowed" || e.error === "service-not-allowed") { me2.sr = null; status.dataset.nodict = "1"; } };
        try { sr.start(); rec.sr = sr; } catch (err) {}
      }
      btn.setAttribute("aria-pressed", "true");
      btn.lastChild.textContent = "Stop";
      (function tick() {
        if (rec !== me2) return;
        var sec = Math.round((Date.now() - me2.started) / 1000);
        status.textContent = "Recording " + Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") +
          (Recognition && !status.dataset.nodict ? " · your words appear above" : " · the recording is saved when you stop");
        if (sec >= 300) return stopRecording();   // 5 minutes per recording
        me2.timer = setTimeout(tick, 500);
      })();
      track("voice_speak", { key: key, dictation: !!Recognition });
    }).catch(function () {
      status.textContent = "Couldn’t open your microphone. Allow it in the address bar, or type your answer.";
    });
  }

  function stopRecording() {
    var r = rec;
    if (!r) return;
    rec = null;
    clearTimeout(r.timer);
    if (r.sr) { r.sr.onend = null; try { r.sr.stop(); } catch (e) {} }
    try { r.mr.stop(); } catch (e) {}
    r.btn.setAttribute("aria-pressed", "false");
    r.btn.lastChild.textContent = "Speak";
  }

  function upload(q, blob) {
    return fetch("api/survey/audio?p=" + encodeURIComponent(me.code) + "&q=" + encodeURIComponent(q), {
      method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob,
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) { return d.file; });
  }

  function queueSave(now) {
    $("survey-error").hidden = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveSurvey(false); }, now ? 0 : 800);
  }
  function saveSurvey(submit) {
    clearTimeout(saveTimer);
    return fetch("api/survey", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p: me.code, answers: answers, submit: !!submit }), keepalive: !submit,
    }).then(function (r) {
      if (!r.ok) throw new Error();
      $("survey-saved").textContent = submit ? "" : "Saved";
    }).catch(function (e) {
      $("survey-saved").textContent = "Not saved yet. Check your connection.";
      if (submit) throw e;
    });
  }

  function finishStudy() {
    track("done");
    flush(true);
    if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
    notice("Thank you", "You’ve completed the study. You can close this tab.");
  }

  // what the Build-your-panel activity (panel-activity.js) uses from here
  window.SimStudy = {
    me: function () { return me; },
    track: track, show: show, h: h, finish: finishStudy,
    voiceField: voiceField, stopRecording: stopRecording,
  };

  $("survey-form").addEventListener("submit", function (e) {
    e.preventDefault();
    stopRecording();
    var err = $("survey-error");
    err.hidden = true;
    var missing = SURVEY.questions.filter(function (q) {
      var a = answers[q.id];
      return q.required && !(a && (a.value != null || (a.text || "").trim() || a.recordings.length));
    });
    if (missing.length) {
      err.textContent = "Please answer question " + missing.map(function (q) { return SURVEY.questions.indexOf(q) + 1; }).join(", ") + ".";
      err.hidden = false;
      $("q-" + missing[0].id).scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    $("survey-submit").disabled = true;
    // give a recording that was just stopped a moment to upload
    setTimeout(function () {
      saveSurvey(true).then(function () {
        track("survey_submit");
        if (window.SimPanel && window.SimPanel.enabled()) return window.SimPanel.start(null);
        finishStudy();
      }).catch(function () {
        $("survey-submit").disabled = false;
        err.textContent = "Couldn’t send your answers. Check your connection and try again.";
        err.hidden = false;
      });
    }, 600);
  });

  /* ---------------- study events (sent to the server for the dashboard) ---------------- */

  var outbox = [], flushTimer = 0;
  function track(type, fields) {
    if (!me) return;
    outbox.push(Object.assign({ type: type, at: new Date().toISOString() }, fields || {}));
    if (!flushTimer) flushTimer = setTimeout(function () { flush(false); }, 3000);
  }
  function flush(leaving) {
    clearTimeout(flushTimer); flushTimer = 0;
    if (!me || !outbox.length || !server.available) return;
    var batch = outbox.splice(0, 500);
    var body = JSON.stringify({ p: me.code, events: batch });
    if (leaving && navigator.sendBeacon && navigator.sendBeacon("api/events", new Blob([body], { type: "application/json" }))) return;
    fetch("api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: body.length < 60000 })
      .then(function (r) { if (!r.ok) throw new Error(); })
      .catch(function () { outbox = batch.concat(outbox); })   // keep them and retry with the next batch
      .then(function () { if (outbox.length && !flushTimer) flushTimer = setTimeout(function () { flush(false); }, 3000); });
  }

  /* ---------------- session log ---------------- */

  function event(type, detail) {
    if (!log) return;
    log.events.push({ at: new Date().toISOString(), call: call ? call.n : null, type: type, detail: detail });
    renderLog();
  }

  function saveLog() {
    try { localStorage.setItem("sim-log-" + log.sessionId, JSON.stringify(log)); } catch (e) {}
    if (!server.available) return;
    fetch("api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(log) })
      .then(function (r) { if (!r.ok) throw new Error(); })
      .catch(function () { event("note", "Could not save to server — use Download JSON"); });
  }

  function onKey(e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
      e.preventDefault();
      showLog($("log").hidden);
    }
  }
  document.addEventListener("keydown", onKey, true);

  function showLog(open) {
    $("log").hidden = !open;
    renderLog();
  }
  $("log-close").addEventListener("click", function () { showLog(false); });

  function renderLog() {
    if (!log || $("log").hidden) return;
    var meta = [
      ["Participant", (me ? me.email + " · " + me.code : log.participantId) || "—"],
      ["Call", call ? call.n + " of " + queue.length + " · " + call.caller : "—"],
      ["State", callState + (call && call.connectedAt ? " · " + elapsed() : "")],
      ["Conversation", (call && call.conversationId) || "—"],
      ["Mic", log.devices.input || "default"],
    ];
    $("log-meta").innerHTML = "";
    meta.forEach(function (m) {
      var dt = document.createElement("dt"); dt.textContent = m[0];
      var dd = document.createElement("dd"); dd.textContent = m[1];
      $("log-meta").append(dt, dd);
    });

    var items = log.events.map(function (x) { return { at: x.at, ev: x.type + ": " + x.detail }; });
    log.calls.forEach(function (c) {
      c.transcript.forEach(function (x) { items.push({ at: x.at, who: x.role === "agent" ? c.caller + " (agent)" : "Participant", text: x.text }); });
    });
    items.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    var ol = $("log-transcript");
    ol.innerHTML = "";
    items.forEach(function (it) {
      var li = document.createElement("li");
      if (it.ev) {
        li.className = "ev";
        li.textContent = it.ev;
      } else {
        var b = document.createElement("b"); b.textContent = it.who;
        li.append(b, document.createTextNode(it.text));
      }
      ol.appendChild(li);
    });
    ol.scrollTop = ol.scrollHeight;
  }

  $("log-download").addEventListener("click", function () {
    if (!log) return;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(log, null, 2)], { type: "application/json" }));
    a.download = (log.participantId || "session") + "_" + log.sessionId + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  $("log-restart").addEventListener("click", function () {
    if (conversation) conversation.endSession();
    location.href = location.pathname + (me ? "?p=" + encodeURIComponent(me.code) : "");
  });
})();
