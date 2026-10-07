/* Call center simulator.
   Loads a prototype in a same-origin iframe and starts an ElevenLabs voice agent (the caller) when the
   participant clicks the prototype's start button. Everything that happens is kept in a session log
   (transcript, clicks, timings) that is saved to the server when the call ends. */
(function () {
  "use strict";

  var CFG = window.SIM_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

  var server = { available: false, agentId: CFG.agentId, tokenAuth: false };
  var conversation = null;
  var callState = "idle"; // idle | connecting | connected | ended | failed
  var timer = null;
  var muted = false;
  var onHold = false;
  var proto = null;
  var log = null;

  /* ---------------- setup screen ---------------- */

  var protoSelect = $("prototype");
  (CFG.prototypes || []).forEach(function (p) {
    var o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.label || p.id;
    protoSelect.appendChild(o);
  });
  if (params.get("prototype")) protoSelect.value = params.get("prototype");
  if (params.get("participant")) $("participant").value = params.get("participant");

  fetch("api/config")
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (c) { server = { available: true, agentId: c.agentId || CFG.agentId, tokenAuth: !!c.tokenAuth }; })
    .catch(function () {})
    .then(function () {
      $("agent-info").textContent = "Agent " + server.agentId + " · " +
        (server.tokenAuth ? "WebRTC token auth" : "public agent") +
        (server.available ? "" : " · logs download only (no server)");
    });

  var micTest = null;
  $("mic-test").addEventListener("click", function () {
    var status = $("mic-status");
    stopMicTest();
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      status.textContent = "Microphone ready";
      status.className = "mic-status ok";
      var ctx = new AudioContext();
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      var data = new Uint8Array(analyser.fftSize);
      micTest = { stream: stream, ctx: ctx, raf: 0 };
      (function tick() {
        analyser.getByteTimeDomainData(data);
        var peak = 0;
        for (var i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
        $("mic-meter").style.width = Math.min(100, peak * 1.6) + "%";
        micTest.raf = requestAnimationFrame(tick);
      })();
    }).catch(function (err) {
      status.textContent = "Blocked: " + (err && err.name === "NotAllowedError" ? "allow microphone access in the browser" : (err && err.message) || err);
      status.className = "mic-status err";
    });
  });

  function stopMicTest() {
    if (!micTest) return;
    cancelAnimationFrame(micTest.raf);
    micTest.stream.getTracks().forEach(function (t) { t.stop(); });
    micTest.ctx.close();
    micTest = null;
  }

  $("setup-form").addEventListener("submit", function (e) {
    e.preventDefault();
    stopMicTest();
    var proto = (CFG.prototypes || []).filter(function (p) { return p.id === protoSelect.value; })[0];
    if (!proto) return;
    startSession($("participant").value.trim(), proto);
  });

  if (params.get("go") === "1" && params.get("participant")) {
    var auto = (CFG.prototypes || []).filter(function (p) { return p.id === protoSelect.value; })[0];
    if (auto) startSession(params.get("participant"), auto);
  }

  /* ---------------- session + prototype ---------------- */

  function startSession(participantId, p) {
    proto = p;
    log = {
      sessionId: new Date().toISOString().replace(/[:.]/g, "-"),
      participantId: participantId,
      prototype: proto.id,
      agentId: server.agentId,
      conversationId: null,
      sessionStartedAt: new Date().toISOString(),
      callStartedAt: null,
      callConnectedAt: null,
      callEndedAt: null,
      endReason: null,
      transcript: [],
      events: [],
    };
    history.replaceState(null, "", "?participant=" + encodeURIComponent(participantId) + "&prototype=" + encodeURIComponent(proto.id) + (params.get("debug") ? "&debug=1" : ""));

    $("setup").hidden = true;
    var stage = $("stage");
    stage.hidden = false;
    stage.addEventListener("load", function () { hookPrototype(stage); });
    stage.src = proto.file;

    var initials = (proto.caller || "Caller").split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2);
    $("call-avatar").textContent = initials.toUpperCase();
    $("call-name").textContent = proto.caller || "Caller";
    if (params.get("debug") === "1") showLog(true);
  }

  function hookPrototype(stage) {
    var doc;
    try { doc = stage.contentDocument; } catch (e) { doc = null; }
    if (!doc) {
      // Cross-origin or file:// — we can't see the prototype's button, so offer our own.
      note("Could not hook into the prototype (open the simulator through the server). Showing a start button instead.");
      showIdleCall();
      return;
    }
    if (doc.__simHooked) return;
    doc.__simHooked = true;

    doc.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target : null;
      if (!el) return;
      if (proto.startSelector && el.closest(proto.startSelector)) {
        startCall();
        return;
      }
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

    if (!proto.startSelector) showIdleCall();
  }

  /* ---------------- the call ---------------- */

  // The prototype's own call controls (prototypes/cc-controls.js), when it has them.
  function protoControls() {
    try { return $("stage").contentWindow.ccCall || null; } catch (e) { return null; }
  }

  // What the prototype's call controls call back into.
  window.SimBridge = {
    start: function () { if (callState === "failed") callState = "idle"; startCall(); },
    end: endCall,
    mute: setMuted,
    hold: setHold,
  };

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

  function showIdleCall() {
    $("call").hidden = false;
    $("call").className = "call is-idle";
    $("call-answer").hidden = false;
    $("call-status").textContent = "Ready";
  }

  function startCall() {
    if (callState === "connecting" || callState === "connected") return;
    setCallState("connecting");
    log.callStartedAt = new Date().toISOString();
    event("call", "Call started");

    getSessionOptions().then(function (opts) {
      if (callState !== "connecting") return null;
      opts.userId = log.participantId || undefined;
      if (CFG.dynamicVariables && Object.keys(CFG.dynamicVariables).length) opts.dynamicVariables = CFG.dynamicVariables;
      opts.onConnect = function (p) {
        if (callState !== "connecting") return;
        log.conversationId = p && p.conversationId;
        log.callConnectedAt = new Date().toISOString();
        event("call", "Connected · conversation " + log.conversationId);
        setCallState("connected");
      };
      opts.onMessage = function (m) {
        var role = m.role || (m.source === "ai" ? "agent" : "user");
        log.transcript.push({ at: new Date().toISOString(), t: elapsed(), role: role, text: m.message });
        renderLog();
      };
      opts.onModeChange = function (m) {
        $("call").classList.toggle("is-speaking", m.mode === "speaking");
      };
      opts.onError = function (message) {
        event("error", String(message));
      };
      opts.onDisconnect = function (details) {
        finishCall(details && details.reason === "agent" ? "agent_hung_up"
          : details && details.reason === "error" ? "error: " + (details.message || "connection lost")
          : "participant_hung_up");
      };
      return window.ElevenLabsClient.Conversation.startSession(opts);
    }).then(function (conv) {
      if (!conv) return;
      conversation = conv;
      if (callState !== "connecting" && callState !== "connected") conv.endSession();
      else if (muted || onHold) {
        conv.setMicMuted(true);
        if (onHold) conv.setVolume({ volume: 0 });
      }
    }).catch(function (err) {
      var msg = (err && err.message) || String(err);
      event("error", msg);
      setCallState("failed", /permission|NotAllowed/i.test(msg) ? "Microphone blocked" : "Couldn't connect");
      saveLog();
    });
  }

  function getSessionOptions() {
    if (!window.ElevenLabsClient) return Promise.reject(new Error("ElevenLabs client library failed to load"));
    var type = CFG.connectionType || "webrtc";
    if (server.tokenAuth && type === "webrtc") {
      return fetch("api/conversation-token").then(function (r) {
        if (!r.ok) throw new Error("Token request failed (" + r.status + ")");
        return r.json();
      }).then(function (b) { return { conversationToken: b.token, connectionType: "webrtc" }; });
    }
    return Promise.resolve({ agentId: server.agentId, connectionType: type });
  }

  function endCall() {
    if (conversation) conversation.endSession();
    finishCall("participant_hung_up");
  }

  function finishCall(reason) {
    if (callState === "ended" || callState === "failed" || callState === "idle") return;
    log.callEndedAt = new Date().toISOString();
    log.endReason = reason;
    event("call", "Call ended (" + reason + ")");
    setCallState(reason.indexOf("error") === 0 && !log.callConnectedAt ? "failed" : "ended");
    conversation = null;
    saveLog();
  }

  function setCallState(state, message) {
    callState = state;
    if (state === "connecting") { muted = false; onHold = false; }
    var cc = protoControls();
    if (cc) cc.update({
      state: state,
      message: state === "failed" ? message || "Call failed" : "",
      caller: proto && proto.caller,
      phone: proto && proto.callerPhone,
      connectedAt: log && log.callConnectedAt ? Date.parse(log.callConnectedAt) : undefined,
      endedAt: log && log.callEndedAt ? Date.parse(log.callEndedAt) : undefined,
    });
    var call = $("call");
    call.hidden = !!cc;
    call.className = "call is-" + state;
    $("call-answer").hidden = state !== "failed";
    clearInterval(timer);
    if (state === "connecting") $("call-status").textContent = "Connecting…";
    if (state === "connected") {
      tick();
      timer = setInterval(tick, 1000);
    }
    if (state === "ended") $("call-status").textContent = "Call ended · " + elapsed();
    if (state === "failed") $("call-status").textContent = (message || "Call failed") + " · tap to retry";
    renderLog();
  }

  function tick() { $("call-status").textContent = elapsed(); }

  function elapsed() {
    if (!log || !log.callConnectedAt) return "00:00";
    var end = log.callEndedAt ? new Date(log.callEndedAt) : new Date();
    var s = Math.max(0, Math.round((end - new Date(log.callConnectedAt)) / 1000));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  $("call-answer").addEventListener("click", function () {
    if (callState === "failed") callState = "idle";
    startCall();
  });
  $("call-end").addEventListener("click", endCall);
  $("call-mute").addEventListener("click", function () { setMuted(!muted); });

  window.addEventListener("pagehide", function () {
    if (conversation) conversation.endSession();
  });

  /* ---------------- session log ---------------- */

  function event(type, detail) {
    if (!log) return;
    log.events.push({ at: new Date().toISOString(), t: log.callConnectedAt ? elapsed() : null, type: type, detail: detail });
    renderLog();
  }

  function note(text) { event("note", text); }

  function saveLog() {
    try { localStorage.setItem("sim-log-" + log.sessionId, JSON.stringify(log)); } catch (e) {}
    if (!server.available) return;
    fetch("api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(log) })
      .then(function (r) { return r.json(); })
      .then(function (b) { if (b.saved) note("Saved to " + b.saved); })
      .catch(function () { note("Could not save to server — use Download JSON"); });
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
      ["Prototype", log.prototype],
      ["Call", callState + (log.callConnectedAt ? " · " + elapsed() : "")],
      ["Conversation", log.conversationId || "—"],
    ];
    $("log-meta").innerHTML = "";
    meta.forEach(function (m) {
      var dt = document.createElement("dt"); dt.textContent = m[0];
      var dd = document.createElement("dd"); dd.textContent = m[1];
      $("log-meta").append(dt, dd);
    });

    var items = log.transcript.map(function (x) { return { at: x.at, html: [x.role === "agent" ? "Caller (agent)" : "Participant", x.text] }; })
      .concat(log.events.map(function (x) { return { at: x.at, ev: x.type + ": " + x.detail }; }))
      .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    var ol = $("log-transcript");
    ol.innerHTML = "";
    items.forEach(function (it) {
      var li = document.createElement("li");
      if (it.ev) {
        li.className = "ev";
        li.textContent = it.ev;
      } else {
        var b = document.createElement("b"); b.textContent = it.html[0];
        li.append(b, document.createTextNode(it.html[1]));
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
    location.href = location.pathname + "?prototype=" + encodeURIComponent(protoSelect.value);
  });
})();
