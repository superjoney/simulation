/* Call center simulator.
   A session plays several calls back to back. For each call it loads that client's prototype build in a
   same-origin iframe and starts the client's ElevenLabs agent (the caller). The first call starts when the
   participant clicks the prototype's start button; later calls start on their own after a short break,
   which the participant can pause. Everything is kept in a session log (transcripts, clicks, timings)
   that is saved to the server after each call. */
(function () {
  "use strict";

  var CFG = window.SIM_CONFIG || {};
  var VERSION = "2026-10-08.8"; // shown under Study settings, to confirm which copy is running
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
  if (params.get("order") && orders.indexOf(params.get("order")) >= 0) $("order").value = params.get("order");
  if (params.get("participant")) $("participant").value = params.get("participant");

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
  if (fromFile) {
    $("setup-error").textContent = "This page was opened as a file. In the project folder run “npm start”, then open http://localhost:3000.";
    $("setup-error").hidden = false;
    $("start-btn").disabled = true;
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
    .then(studyInfo);

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

  $("setup-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("setup-error");
    if (fromFile) return;
    err.hidden = true;
    if (!CLIENTS.length) { err.textContent = "No callers are set up yet. Ask the researcher to add an agent ID."; err.hidden = false; return; }
    if ($("audio-devices").hidden) { err.textContent = "Allow your microphone first."; err.hidden = false; return; }
    readDevices();
    stopMeter();
    unlockAudio();
    openMic().catch(function () {});
    startSession($("participant").value.trim(), $("order").value.split(","));
  });

  /* ---------------- the session ---------------- */

  function startSession(participantId, order) {
    window.SIM_REP_NAME = participantId; // the prototypes' greeting reads this ("This is <name>")
    queue = order.map(function (id) { return BY_ID[id]; });
    log = {
      sessionId: new Date().toISOString().replace(/[:.]/g, "-"),
      participantId: participantId,
      order: order,
      devices: { input: devices.inputLabel, output: devices.outputLabel },
      sessionStartedAt: new Date().toISOString(),
      sessionEndedAt: null,
      calls: [],
      events: [],
    };
    history.replaceState(null, "", "?participant=" + encodeURIComponent(participantId) + "&order=" + encodeURIComponent(order.join(",")) + (params.get("debug") ? "&debug=1" : ""));
    $("setup").hidden = true;
    $("stage").hidden = false;
    if (params.get("debug") === "1") showLog(true);
    loadCall(0, false);
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

    doc.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target : null;
      if (!el) return;
      if (el.closest(sel)) { unlockAudio(); startCall(); return; }
      if (el.closest(".shv-logo")) { goHome(); return; }
      var ctl = el.closest("button, a, [role=button], [role=tab], [role=option], [role=menuitem], label, summary, input, select");
      if (!ctl) return;
      var label = (ctl.getAttribute("aria-label") || ctl.getAttribute("title") || ctl.textContent || ctl.getAttribute("placeholder") || ctl.name || "")
        .replace(/\s+/g, " ").trim().slice(0, 80);
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

  // The rocket logo in the prototype: end the session and go back to the start page.
  function goHome() {
    if ((callState === "connecting" || callState === "connected") &&
        !window.confirm("End this call and go back to the start page?")) return;
    event("session", "Left via the logo");
    var conv = conversation;
    if (conv) { finishCall("participant_left"); conv.endSession(); }
    clearTimeout(breakTimer);
    saveLog();
    if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
    location.href = location.pathname + "?order=" + encodeURIComponent(log.order.join(","));
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
    // Transfer from the call controls' second line: the customer leaves this call
    transfer: function (to) {
      var conv = conversation;
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
        setCallState("connected");
      };
      opts.onMessage = function (m) {
        var role = m.role || (m.source === "ai" ? "agent" : "user");
        mine.transcript.push({ at: new Date().toISOString(), role: role, text: m.message });
        renderLog();
      };
      opts.onModeChange = function (m) { $("call").classList.toggle("is-speaking", m.mode === "speaking"); };
      opts.onError = function (message) { event("error", String(message)); };
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

  window.addEventListener("pagehide", function () { if (conversation) conversation.endSession(); });

  /* ---------------- between calls ---------------- */

  function afterCall() {
    if (callIdx + 1 >= queue.length) {
      log.sessionEndedAt = new Date().toISOString();
      event("session", "All calls complete");
      showBreak("All calls complete", "Thank you. Please let the researcher know you’re done.", true);
      saveLog();
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
    breakPaused = false;
    breakLeft = 0;
    breakTick();
  });

  $("break-pause").addEventListener("click", function () {
    breakPaused = !breakPaused;
    event("session", breakPaused ? "Next call paused" : "Next call resumed");
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
      ["Participant", log.participantId || "—"],
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
    location.href = location.pathname + "?order=" + encodeURIComponent(log ? log.order.join(",") : $("order").value);
  });
})();
