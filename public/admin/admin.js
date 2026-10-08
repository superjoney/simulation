/* Study dashboard: sign in, overview, participants, invites. Data comes from /api/admin/*. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var CFG = window.SIM_CONFIG || {};
  var NAMES = {};
  (CFG.clients || []).forEach(function (c) { NAMES[c.id] = c.name; });
  var data = null, filter = "all", query = "", refreshTimer = 0;
  var STUDY = { clients: {}, outcomes: [] }, bClient = null, blScope = "all", base = null;

  /* ---------------- helpers ---------------- */

  function api(path, opts) {
    return fetch("/api/admin/" + path, Object.assign({ credentials: "same-origin", headers: { "Content-Type": "application/json" } }, opts || {}))
      .then(function (r) {
        if (r.status === 401) { showLogin(); throw new Error("signed out"); }
        return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || r.status); return b; });
      });
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k != null) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); });
    return e;
  }
  function dur(ms) {
    if (ms == null) return "—";
    var neg = ms < 0, s = Math.round(Math.abs(ms) / 1000);
    return (neg ? "−" : "") + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function when(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function pct(x) { return x == null ? "—" : Math.round(x * 100) + "%"; }
  function who(c) { return NAMES[c] || c || "—"; }
  function linkFor(code) { return location.origin + "/?p=" + code; }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(t._t); t._t = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg || "Copied"); }, function () {
      var ta = el("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast(msg || "Copied");
    });
  }
  function stagePill(s) {
    var cls = s.done ? "ok" : s.rank === 0 ? "" : s.rank >= 5 ? "warn" : "";
    return el("span", { class: "pill " + cls, text: s.stage });
  }
  function download(name, text, type) {
    var a = el("a", { href: URL.createObjectURL(new Blob([text], { type: type })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------- sign in ---------------- */

  function showLogin() { $("app").hidden = true; $("login").hidden = false; clearInterval(refreshTimer); }
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    $("login-error").hidden = true;
    fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: $("login-name").value, password: $("login-pass").value }) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (x) {
        if (!x.ok) {
          $("login-error").textContent = x.b.error === "no_researchers_configured"
            ? "No researcher logins are set up. Add RESEARCHERS to the server’s variables."
            : "Wrong name or password.";
          $("login-error").hidden = false;
          return;
        }
        $("login-pass").value = "";
        start(x.b.name);
      });
  });
  $("logout").addEventListener("click", function () { fetch("/api/admin/logout", { method: "POST" }).then(showLogin); });

  function start(name) {
    $("login").hidden = true; $("app").hidden = false;
    $("me").textContent = name;
    api("study").then(function (d) { STUDY = d; if (data) renderBehaviour(); }).catch(function () {});
    load();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(load, 30000);
  }

  fetch("/api/admin/me", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (m) {
    if (m.label) { $("env").textContent = m.label; $("env").hidden = false; document.title = m.label + " · " + document.title; }
    if (m.name) start(m.name); else showLogin();
  }).catch(showLogin);

  /* ---------------- tabs ---------------- */

  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".tabs button").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
      ["overview", "behaviour", "survey", "baseline", "participants", "invites"].forEach(function (t) { $("tab-" + t).hidden = t !== b.getAttribute("data-tab"); });
      if (b.getAttribute("data-tab") === "baseline") loadBaseline();
    });
  });
  $("refresh").addEventListener("click", load);

  /* ---------------- data ---------------- */

  function load() {
    return api("overview").then(function (d) {
      data = d;
      $("updated").textContent = "Updated " + new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
      renderOverview(); renderBehaviour(); renderSurvey(); renderPeople(); renderInvites();
      if (!$("tab-baseline").hidden) loadBaseline();
    }).catch(function () {});
  }

  /* ---------------- overview ---------------- */

  function renderOverview() {
    var t = data.overview.totals;
    var tiles = [
      ["Invited", t.invited, t.notListed ? t.notListed + " more not on the list" : ""],
      ["Started", t.started, t.invited ? pct(t.started / t.invited) + " of invited" : ""],
      ["Completed", t.completed, "both calls and the survey"],
      ["Completion rate", pct(t.completionRate), "of those who started"],
      ["Paused before a call", t.pausedNext, t.medianPauseMs ? "median pause " + dur(t.medianPauseMs) : ""],
    ];
    $("kpis").innerHTML = "";
    tiles.forEach(function (x) {
      $("kpis").appendChild(el("div", { class: "kpi" }, [el("div", { class: "kpi-l", text: x[0] }), el("div", { class: "kpi-v", text: String(x[1]) }), el("div", { class: "kpi-s", text: x[2] })]));
    });

    var f = data.overview.funnel, base = f[0] ? f[0].count : 0;
    $("funnel").innerHTML = "";
    f.forEach(function (row) {
      var w = base ? Math.round((row.count / base) * 100) : 0;
      $("funnel").appendChild(el("div", { class: "fn" }, [
        el("span", { text: row.label }),
        el("div", { class: "fn-bar", role: "img", "aria-label": row.label + ": " + row.count }, [el("i", { style: "width:" + w + "%" })]),
        el("span", { class: "fn-n" }, [el("b", { text: String(row.count) }), base ? " · " + w + "%" : ""]),
      ]));
    });

    var t2 = $("clients"); t2.innerHTML = "";
    t2.appendChild(el("thead", {}, [el("tr", {}, ["Customer", "Calls", "Handle time", "Time to verify", "Holds", "Time on hold", "Transfers"].map(function (h, i) {
      return el("th", { class: i ? "r" : "", text: h });
    }))]));
    var tb = el("tbody");
    var rows = data.overview.clients;
    if (!rows.length) tb.appendChild(el("tr", {}, [el("td", { class: "empty", colspan: "7", text: "No completed calls yet." })]));
    rows.forEach(function (c) {
      tb.appendChild(el("tr", {}, [
        el("td", { text: who(c.client) }), el("td", { class: "r", text: String(c.calls) }),
        el("td", { class: "r", text: dur(c.medianAhtMs) }), el("td", { class: "r", text: dur(c.medianVerifyMs) }),
        el("td", { class: "r", text: c.medianHolds == null ? "—" : String(c.medianHolds) }), el("td", { class: "r", text: dur(c.medianHoldMs) }),
        el("td", { class: "r", text: String(c.transfers) }),
      ]));
    });
    t2.appendChild(tb);
  }

  /* ---------------- behaviour ---------------- */

  function stat(label, value, sub) {
    return el("div", {}, [el("dt", { text: label }), el("dd", {}, [value, sub ? el("small", { text: " " + sub }) : null])]);
  }
  function outcomeBar(outcomes, total) {
    var names = STUDY.outcomes.length ? STUDY.outcomes : Object.keys(outcomes);
    return el("div", {}, [
      el("div", { class: "stack", role: "img", "aria-label": names.map(function (o) { return o + ": " + (outcomes[o] || 0); }).join(", ") },
        names.map(function (o, i) { return outcomes[o] ? el("i", { class: "o" + i, style: "width:" + (100 * outcomes[o] / total) + "%" }) : null; })),
      el("div", { class: "legend", style: "margin-top:6px" }, names.map(function (o, i) {
        return el("span", {}, [el("i", { class: "o" + i }), o + " · " + (outcomes[o] || 0)]);
      })),
    ]);
  }
  function renderBehaviour() {
    var list = (data.overview.behaviour || []);
    var ids = list.map(function (b) { return b.client; });
    if (!bClient || ids.indexOf(bClient) < 0) bClient = ids[0] || null;
    var chips = $("b-clients"); chips.innerHTML = "";
    list.forEach(function (b) {
      chips.appendChild(el("button", { type: "button", "aria-pressed": String(b.client === bClient), text: who(b.client) + " · " + b.calls,
        onclick: function () { bClient = b.client; renderBehaviour(); } }));
    });
    var b = list.filter(function (x) { return x.client === bClient; })[0];
    ["b-anchors", "b-flags", "b-clicks", "b-features"].forEach(function (id) { $(id).innerHTML = ""; });
    $("b-areas").textContent = ""; $("b-count").textContent = "";
    if (!b) { $("b-anchors").appendChild(el("p", { class: "muted", text: "No connected calls yet." })); return; }
    $("b-count").textContent = b.calls + " connected call" + (b.calls === 1 ? "" : "s") + " · " + b.people + " participant" + (b.people === 1 ? "" : "s");
    var defs = (STUDY.clients[b.client] || {}).anchors || [];

    b.anchors.forEach(function (a) {
      var d = defs.filter(function (x) { return x.id === a.id; })[0] || {};
      $("b-anchors").appendChild(el("div", { class: "anchor" }, [
        el("div", { class: "anchor-h" }, [el("span", { class: "anchor-id", text: a.id }), el("h2", { text: a.label })]),
        d.line ? el("p", { class: "anchor-line", text: "“" + d.line + "”" }) : null,
        el("dl", { class: "stats" }, [
          stat("Asked", a.asked + " of " + a.calls, "calls"),
          stat("First reply", dur(a.medianReplyMs), "median"),
          stat("Put on hold", a.asked ? pct(a.held / a.asked) : "—", a.held ? "median " + dur(a.medianHoldMs) : ""),
          stat("Playbook action", dur(a.medianActionMs), d.actionLabel ? d.actionLabel.toLowerCase() : ""),
        ]),
        outcomeBar(a.outcomes, a.calls),
      ]));
    });

    var ft = $("b-flags");
    ft.appendChild(el("thead", {}, [el("tr", {}, [el("th", { text: "Check" }), el("th", { text: "Calls" })])]));
    var ftb = el("tbody");
    b.flags.forEach(function (f) {
      var cell;
      if (Object.keys(f.values).length) {
        cell = el("td", { text: Object.keys(f.values).map(function (k) { return k + " " + f.values[k]; }).join(" · ") });
      } else {
        var w = f.n ? Math.round(100 * f.yes / f.n) : 0;
        cell = el("td", {}, [el("div", { class: "barcell" }, [el("div", { class: "fn-bar" }, [el("i", { style: "width:" + w + "%;" + (f.good === false ? "background:var(--warn)" : "") })]),
          el("span", { text: f.n ? f.yes + " of " + f.n : "—" })])]);
      }
      ftb.appendChild(el("tr", {}, [el("td", { text: f.label }), cell]));
    });
    ft.appendChild(ftb);

    var c = $("b-clicks");
    c.appendChild(el("div", { class: "mini" }, [
      el("div", {}, [el("b", { text: String(b.rage.bursts) }), el("span", { text: "rage clicks · " + b.rage.people + " of " + b.people + " people" })]),
      el("div", {}, [el("b", { text: String(b.dead.clicks) }), el("span", { text: "dead clicks" })]),
    ]));
    function top(title, rows) {
      if (!rows.length) return;
      c.appendChild(el("div", { class: "h3", text: title }));
      c.appendChild(el("ul", { class: "toplist" }, rows.map(function (r) { return el("li", {}, [el("span", { text: r.target }), el("span", { text: String(r.count) })]); })));
    }
    top("Where people rage clicked", b.rage.top);
    top("Where clicks did nothing", b.dead.top);

    var areas = b.areas, totalA = Object.keys(areas).reduce(function (n, k) { return n + areas[k]; }, 0);
    $("b-areas").textContent = Object.keys(areas).sort(function (x, y) { return areas[y] - areas[x]; })
      .map(function (k) { return k + " " + pct(areas[k] / totalA); }).join(" · ");
    var t = $("b-features");
    t.appendChild(el("thead", {}, [el("tr", {}, ["Control", "Area", "People who used it", "Clicks", "First used"].map(function (h, i) { return el("th", { class: i > 2 ? "r" : "", text: h }); }))]));
    var tb = el("tbody");
    if (!b.features.length) tb.appendChild(el("tr", {}, [el("td", { class: "empty", colspan: "5", text: "No clicks yet." })]));
    b.features.slice(0, 40).forEach(function (f) {
      var w = b.people ? Math.round(100 * f.people / b.people) : 0;
      tb.appendChild(el("tr", {}, [
        el("td", { text: f.label }), el("td", { class: "muted", text: f.area }),
        el("td", {}, [el("div", { class: "barcell" }, [el("div", { class: "fn-bar" }, [el("i", { style: "width:" + w + "%" })]), el("span", { text: w + "%" })])]),
        el("td", { class: "r", text: String(f.clicks) }), el("td", { class: "r", text: dur(f.medianFirstMs) }),
      ]));
    });
    t.appendChild(tb);
    if (b.features.length > 40) t.appendChild(el("caption", { class: "note", style: "caption-side:bottom;text-align:left", text: "Top 40 of " + b.features.length + ". The JSON export has every click." }));
  }

  /* ---------------- survey ---------------- */

  var SURVEY = CFG.survey || { questions: [] }, svQuery = "";
  function audioUrl(code, file) { return "/api/admin/audio?code=" + encodeURIComponent(code) + "&file=" + encodeURIComponent(file); }
  function howTag(a) {
    var spoken = a.dictated || a.recordings.length;
    return spoken && a.typed ? "spoken + edited" : spoken ? "spoken" : "typed";
  }
  function players(code, a) {
    if (!a.recordings.length) return null;
    return el("div", { class: "sv-audio" }, a.recordings.map(function (f, i) {
      // the audio loads only when asked for
      var b = el("button", { class: "btn btn-secondary", type: "button", text: a.recordings.length > 1 ? "Play recording " + (i + 1) : "Play recording" });
      b.addEventListener("click", function () {
        var au = el("audio", { controls: "", preload: "auto", src: audioUrl(code, f) });
        b.replaceWith(au); au.play().catch(function () {});
      });
      return b;
    }).concat([el("a", { class: "btn btn-ghost", href: audioUrl(code, a.recordings[0]), download: "", text: "Download" })]));
  }
  function renderSurvey() {
    var box = $("sv-questions"); box.innerHTML = "";
    var people = data.participants.filter(function (s) { return s.survey && s.survey.answers; });
    var submitted = people.filter(function (s) { return s.survey.submittedAt; }).length;
    $("sv-count").textContent = submitted + " submitted" + (people.length > submitted ? " · " + (people.length - submitted) + " in progress" : "");
    var q = svQuery.toLowerCase();
    if (!SURVEY.questions.length) { box.appendChild(el("div", { class: "card" }, [el("p", { class: "muted", text: "No survey questions are set up (public/config.js)." })])); return; }
    SURVEY.questions.forEach(function (qq, i) {
      var rows = people.map(function (s) { return { s: s, a: s.survey.answers[qq.id] }; })
        .filter(function (r) { return r.a && (r.a.value != null || (r.a.text || "").trim() || r.a.recordings.length); });
      var card = el("div", { class: "card" }, [el("div", { class: "card-h" }, [el("h2", { text: (i + 1) + ". " + qq.text }), el("span", { class: "muted", text: rows.length + " answer" + (rows.length === 1 ? "" : "s") })])]);
      if (qq.type === "scale" || qq.type === "choice") {
        var opts = qq.type === "scale" ? [] : qq.options.slice();
        if (qq.type === "scale") for (var v = qq.min || 1; v <= (qq.max || 5); v++) opts.push(String(v));
        var counts = {}; rows.forEach(function (r) { counts[String(r.a.value)] = (counts[String(r.a.value)] || 0) + 1; });
        var max = Math.max.apply(null, opts.map(function (o) { return counts[o] || 0; }).concat([1]));
        card.appendChild(el("div", { class: "sv-dist" }, opts.map(function (o, k) {
          var lbl = o + (qq.type === "scale" && qq.labels ? (k === 0 ? " · " + qq.labels[0] : k === opts.length - 1 ? " · " + qq.labels[1] : "") : "");
          return el("div", { class: "sv-row" }, [el("span", { text: lbl }), el("div", { class: "fn-bar" }, [el("i", { style: "width:" + (100 * (counts[o] || 0) / max) + "%" })]),
            el("span", { class: "fn-n", text: (counts[o] || 0) + (rows.length ? " · " + Math.round(100 * (counts[o] || 0) / rows.length) + "%" : "") })]);
        })));
        if (qq.type === "scale" && rows.length) {
          var mean = rows.reduce(function (n, r) { return n + Number(r.a.value); }, 0) / rows.length;
          card.appendChild(el("p", { class: "note", text: "Average " + (Math.round(mean * 10) / 10) + " of " + (qq.max || 5) }));
        }
      } else {
        var shown = rows.filter(function (r) { return !q || ((r.a.text || "") + " " + r.s.email + " " + r.s.firstName).toLowerCase().indexOf(q) >= 0; });
        var spoken = rows.filter(function (r) { return r.a.dictated || r.a.recordings.length; }).length;
        if (rows.length) card.appendChild(el("p", { class: "note", style: "margin:-6px 0 12px", text: spoken + " of " + rows.length + " spoken" }));
        card.appendChild(el("ul", { class: "sv-answers" }, shown.length ? shown.map(function (r) {
          return el("li", {}, [
            el("div", { class: "sv-who" }, [el("a", { href: "#", text: r.s.firstName ? r.s.firstName + " · " + r.s.email : r.s.email,
              onclick: function (e) { e.preventDefault(); openDetail(r.s.code); } }), el("span", { class: "pill", text: howTag(r.a) })]),
            r.a.text ? el("div", { class: "sv-text", text: r.a.text }) : el("div", { class: "sv-text muted", text: "(no text: listen to the recording)" }),
            players(r.s.code, r.a),
          ]);
        }) : [el("li", { class: "muted", text: rows.length ? "No answers match." : "No answers yet." })]));
      }
      box.appendChild(card);
    });
  }
  $("sv-search").addEventListener("input", function () { svQuery = this.value; renderSurvey(); });

  /* ---------------- baseline ---------------- */

  function loadBaseline() {
    return api("baseline").then(function (d) { base = d; renderBaseline(); }).catch(function () {});
  }
  $("bl-file").addEventListener("change", function () {
    var f = this.files[0]; this.value = "";
    if (!f) return;
    if (f.size > 20e6) { $("bl-msg").textContent = "That file is over 20 MB. Export fewer columns or a shorter date range."; return; }
    $("bl-msg").textContent = "Uploading " + f.name + "…";
    f.text().then(function (text) {
      return api("baseline", { method: "POST", body: JSON.stringify({ name: f.name, csv: text }) });
    }).then(function () { $("bl-msg").textContent = "Uploaded. Check the column mapping below."; return loadBaseline(); })
      .catch(function (e) { $("bl-msg").textContent = "Couldn’t upload: " + e.message; });
  });
  $("bl-clear").addEventListener("click", function () {
    if (!confirm("Remove the baseline file? You can upload it again later.")) return;
    api("baseline", { method: "POST", body: JSON.stringify({ clear: true }) }).then(function () { $("bl-msg").textContent = "Removed."; loadBaseline(); });
  });

  var BL_FIELDS = [
    ["aht", "Handle time", true], ["verify", "Time to verify", true], ["holds", "Number of holds", false],
    ["hold", "Time on hold", true], ["transfer", "Transferred (yes/no)", false], ["type", "Call type or reason", false],
  ];
  function renderBaseline() {
    var b = base && base.baseline;
    $("bl-clear").hidden = !b;
    $("bl-file-label").textContent = b ? "Replace CSV" : "Upload CSV";
    $("bl-info").textContent = b ? b.name + " · " + b.rowCount.toLocaleString() + " calls · uploaded " + when(b.uploadedAt) + (b.by ? " by " + b.by : "") : "";
    $("bl-map-card").hidden = !b; $("bl-compare-card").hidden = !b;
    if (!b) return;
    var m = b.mapping || {};
    var map = $("bl-map"); map.innerHTML = "";
    BL_FIELDS.forEach(function (f) {
      var sel = el("select", { "data-key": f[0] }, [el("option", { value: "", text: "Not in this file" })].concat(b.headers.map(function (h, i) {
        var o = el("option", { value: String(i), text: h }); if (m[f[0]] === i) o.selected = true; return o;
      })));
      var kids = [sel];
      if (f[2]) {
        var unit = el("select", { "data-unit": f[0], "aria-label": f[1] + " unit" }, ["seconds", "minutes", "ms"].map(function (u) {
          var o = el("option", { value: u, text: u }); if ((m.units || {})[f[0]] === u) o.selected = true; return o;
        }));
        kids = [el("div", { class: "pair" }, [sel, unit])];
      }
      map.appendChild(el("label", {}, [el("span", { text: f[1] })].concat(kids)));
    });
    var types = $("bl-types"); types.innerHTML = "";
    if (m.type != null && b.typeValues.length) {
      types.appendChild(el("div", { class: "h3", style: "margin-top:16px", text: "Match call types to the study’s scenarios" }));
      types.appendChild(el("div", { class: "types" }, b.typeValues.map(function (tv) {
        var sel = el("select", { "data-type": tv.value }, [el("option", { value: "", text: "Not compared" })].concat((CFG.clients || []).map(function (c) {
          var o = el("option", { value: c.id, text: c.name + " · " + (c.playbook || "") }); if ((m.types || {})[tv.value] === c.id) o.selected = true; return o;
        })));
        return el("label", {}, [el("span", { title: tv.value, text: tv.value + " (" + tv.count + ")" }), sel]);
      })));
      types.appendChild(el("p", { class: "note", text: "Times like 4:05 or 0:04:05 are read automatically; the unit applies to plain numbers." }));
    }
    var st = $("bl-sample"); st.innerHTML = "";
    st.appendChild(el("thead", {}, [el("tr", {}, b.headers.map(function (h) { return el("th", { text: h }); }))]));
    st.appendChild(el("tbody", {}, b.sample.map(function (r) { return el("tr", {}, b.headers.map(function (_, i) { return el("td", { text: r[i] || "" }); })); })));

    // comparison
    var scopes = base.compare.map(function (x) { return x.scope; });
    if (scopes.indexOf(blScope) < 0) blScope = "all";
    var sc = $("bl-scopes"); sc.innerHTML = "";
    scopes.forEach(function (id) {
      sc.appendChild(el("button", { type: "button", "aria-pressed": String(id === blScope), text: id === "all" ? "All calls" : who(id),
        onclick: function () { blScope = id; renderBaseline(); } }));
    });
    var cmp = base.compare.filter(function (x) { return x.scope === blScope; })[0];
    var t = $("bl-compare"); t.innerHTML = "";
    t.appendChild(el("thead", {}, [el("tr", {}, ["Metric", "Current system", "Prototype", "Difference"].map(function (h, i) { return el("th", { class: i ? "r" : "", text: h }); }))]));
    var tb = el("tbody");
    cmp.metrics.forEach(function (x) {
      var fmt = function (v) { return v == null ? "—" : x.kind === "time" ? dur(v * 1000) : x.kind === "rate" ? pct(v) : (Math.round(v * 10) / 10).toString(); };
      var pick = function (st) { return x.kind === "rate" ? st.mean : x.kind === "count" ? st.mean : st.median; };
      var lbl = x.kind === "time" ? "median" : x.kind === "count" ? "average" : "of calls";
      var bv = pick(x.baseline), pv = pick(x.prototype);
      var diff = bv != null && pv != null ? pv - bv : null;
      var dtxt = diff == null ? "—" : x.kind === "time" ? (diff > 0 ? "+" : "") + dur(diff * 1000) + (bv ? " (" + (diff > 0 ? "+" : "") + Math.round(100 * diff / bv) + "%)" : "")
        : x.kind === "rate" ? (diff > 0 ? "+" : "") + Math.round(diff * 100) + " pts" : (diff > 0 ? "+" : "") + (Math.round(diff * 10) / 10);
      tb.appendChild(el("tr", {}, [
        el("td", {}, [x.label, el("span", { class: "sub2", text: lbl })]),
        el("td", { class: "r" }, [x.mapped ? fmt(bv) : "not mapped", el("span", { class: "sub2", text: x.mapped ? "n = " + x.baseline.n.toLocaleString() : "" })]),
        el("td", { class: "r" }, [fmt(pv), el("span", { class: "sub2", text: "n = " + x.prototype.n })]),
        el("td", { class: "r " + (diff == null || diff === 0 ? "" : diff < 0 ? "delta-good" : "delta-bad"), text: dtxt }),
      ]));
    });
    t.appendChild(tb);
  }
  $("bl-save").addEventListener("click", function () {
    var b = base && base.baseline; if (!b) return;
    var m = { units: {}, types: {} };
    document.querySelectorAll("#bl-map [data-key]").forEach(function (s) { m[s.getAttribute("data-key")] = s.value === "" ? null : Number(s.value); });
    document.querySelectorAll("#bl-map [data-unit]").forEach(function (s) { m.units[s.getAttribute("data-unit")] = s.value; });
    document.querySelectorAll("#bl-types [data-type]").forEach(function (s) { if (s.value) m.types[s.getAttribute("data-type")] = s.value; });
    if (m.type === b.mapping.type) Object.keys((b.mapping.types || {})).forEach(function (k) { if (!(k in m.types) && !document.querySelector('#bl-types [data-type="' + CSS.escape(k) + '"]')) m.types[k] = b.mapping.types[k]; });
    api("baseline", { method: "POST", body: JSON.stringify({ mapping: m }) }).then(function () { toast("Mapping saved"); loadBaseline(); });
  });

  /* ---------------- participants ---------------- */

  var FILTERS = [
    ["all", "All", function () { return true; }],
    ["not-started", "Not started", function (s) { return !s.opened; }],
    ["in-progress", "In progress", function (s) { return s.opened && !s.done; }],
    ["completed", "Completed", function (s) { return s.done; }],
    ["unlisted", "Not on invite list", function (s) { return !s.listed; }],
  ];
  function renderPeople() {
    var chips = $("chips"); chips.innerHTML = "";
    FILTERS.forEach(function (f) {
      var n = data.participants.filter(f[2]).length;
      chips.appendChild(el("button", { type: "button", "aria-pressed": String(filter === f[0]), text: f[1] + " · " + n,
        onclick: function () { filter = f[0]; renderPeople(); } }));
    });
    var fn = FILTERS.filter(function (f) { return f[0] === filter; })[0][2];
    var q = query.toLowerCase();
    var list = data.participants.filter(fn).filter(function (s) { return !q || (s.email + " " + s.firstName).toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return (b.lastSeen || b.createdAt || "") < (a.lastSeen || a.createdAt || "") ? -1 : 1; });
    var maxCalls = Math.max(2, Math.max.apply(null, data.participants.map(function (s) { return s.calls.length; }).concat([0])));
    var t = $("people"); t.innerHTML = "";
    var head = ["Participant", "Stage"];
    for (var k = 1; k <= maxCalls; k++) head.push("Call " + k);
    head.push("Holds", "Rage · dead", "Paused", "Last activity");
    t.appendChild(el("thead", {}, [el("tr", {}, head.map(function (h) { return el("th", { text: h }); }))]));
    var tb = el("tbody");
    if (!list.length) tb.appendChild(el("tr", {}, [el("td", { class: "empty", colspan: String(head.length), text: "No participants here yet." })]));
    list.forEach(function (s) {
      var cells = [
        el("td", {}, [s.email, el("span", { class: "sub2", text: (s.firstName || "—") + (s.listed ? "" : " · not on invite list") })]),
        el("td", {}, [stagePill(s)]),
      ];
      for (var k = 1; k <= maxCalls; k++) {
        var c = s.calls.filter(function (x) { return x.n === k; })[0];
        cells.push(el("td", {}, c ? [who(c.client), el("span", { class: "sub2", text: c.completed
          ? dur(c.ahtMs) + " handle · " + dur(c.verifyMs) + " to verify"
          : c.connectedAt ? "in progress" : (c.endReason ? "didn’t connect" : "ringing") })] : ["—"]));
      }
      var holds = s.calls.reduce(function (n, c) { return n + c.holds; }, 0);
      var rage = s.calls.reduce(function (n, c) { return n + (c.rage ? c.rage.length : 0); }, 0);
      var dead = s.calls.reduce(function (n, c) { return n + (c.dead ? c.dead.length : 0); }, 0);
      cells.push(el("td", { text: String(holds) }), el("td", { text: rage + " · " + dead }), el("td", { text: s.pauses ? dur(s.pauseMs) : "—" }), el("td", { text: when(s.lastSeen) }));
      tb.appendChild(el("tr", { tabindex: "0", onclick: function () { openDetail(s.code); }, onkeydown: function (e) { if (e.key === "Enter") openDetail(s.code); } }, cells));
    });
    t.appendChild(tb);
  }
  $("search").addEventListener("input", function () { query = this.value; renderPeople(); });

  /* ---------------- participant detail ---------------- */

  function openDetail(code) {
    $("detail").hidden = false; $("scrim").hidden = false;
    $("d-title").textContent = "Loading…"; $("d-sub").textContent = ""; $("d-body").innerHTML = "";
    api("participant?code=" + encodeURIComponent(code)).then(function (d) { renderDetail(d.summary, d.events); });
  }
  function closeDetail() { $("detail").hidden = true; $("scrim").hidden = true; }
  $("d-close").addEventListener("click", closeDetail);
  $("scrim").addEventListener("click", closeDetail);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDetail(); });

  function facts(pairs) {
    return el("dl", { class: "facts" }, pairs.map(function (p) { return el("div", {}, [el("dt", { text: p[0] }), el("dd", { text: p[1] })]); }));
  }

  function renderDetail(s, events) {
    $("d-title").textContent = s.email;
    $("d-sub").textContent = (s.firstName || "No name yet") + " · " + s.stage + (s.listed ? "" : " · not on invite list");
    var b = $("d-body"); b.innerHTML = "";

    b.appendChild(el("div", { class: "card" }, [
      facts([
        ["Code", s.code], ["First seen", when(s.firstSeen)], ["Last activity", when(s.lastSeen)],
        ["Calls completed", s.callsCompleted + (s.totalCalls ? " of " + s.totalCalls : "")],
        ["Call order", s.order ? s.order.map(who).join(" → ") : "—"],
        ["Paused before a call", s.pauses ? s.pauses + "× · " + dur(s.pauseMs) : "No"],
        ["Clicks", String(s.clicks)], ["Errors", String(s.errors)],
        ["Microphone", s.device ? s.device.mic || "—" : "—"],
      ]),
      el("div", { class: "copyrow", style: "margin-top:12px" }, [el("code", { text: linkFor(s.code) }),
        el("button", { class: "btn btn-secondary", type: "button", text: "Copy link", onclick: function () { copy(linkFor(s.code), "Link copied"); } })]),
    ]));

    if (!s.calls.length) b.appendChild(el("div", { class: "card" }, [el("p", { class: "muted", text: "No calls yet." })]));
    s.calls.forEach(function (c) {
      var card = el("div", { class: "card" }, [
        el("div", { class: "card-h" }, [el("h2", { text: "Call " + c.n + " · " + who(c.client) }),
          el("span", { class: "pill " + (c.completed ? "ok" : c.connectedAt ? "warn" : "bad"), text: c.completed ? "Completed" : c.connectedAt ? "Not finished" : "Didn’t connect" })]),
        facts([
          ["Handle time", dur(c.ahtMs)], ["Time to verify", dur(c.verifyMs)], ["Ring", dur(c.ringMs)],
          ["Holds", c.holds + (c.holds ? " · " + dur(c.holdMs) : "")], ["Mutes", String(c.mutes)],
          ["Second line", c.dials.length ? c.dials.join(", ") : "—"], ["Transferred to", c.transfer || "—"],
          ["Ended", c.endReason ? c.endReason.replace(/_/g, " ") : "—"], ["Attempts", String(c.attempts)],
          ["Conversation", c.conversationId || "—"],
        ]),
      ]);
      if (c.anchors && c.anchors.length && c.connectedAt) {
        card.appendChild(el("div", { class: "card-h", style: "margin:16px 0 0" }, [el("h2", { text: "Anchor questions" }), el("span", { class: "muted", text: "your call overrides the automatic guess" })]));
        c.anchors.forEach(function (a) { card.appendChild(codeRow(s, c, a)); });
      }
      if (c.flags && c.flags.length && c.connectedAt) {
        card.appendChild(el("div", { class: "card-h", style: "margin:14px 0 0" }, [el("h2", { text: "Answer checks" }), el("span", { class: "muted", text: "auto-detected" })]));
        card.appendChild(el("ul", { class: "checks" }, c.flags.map(function (f) {
          var v = f.value, mark = v == null ? "—" : v === true ? "✓" : v === false ? "✗" : "•";
          var cls = v == null ? "na" : typeof v === "string" ? "" : (v === (f.good !== false)) ? "yes" : "no";
          return el("li", {}, [el("b", { class: cls, text: mark }), el("span", { text: f.label + (typeof v === "string" ? ": " + v : "") })]);
        })));
      }
      if ((c.rage && c.rage.length) || (c.dead && c.dead.length)) {
        card.appendChild(el("div", { class: "card-h", style: "margin:14px 0 0" }, [el("h2", { text: "Click trouble" })]));
        // repeated dead clicks on the same thing within a few seconds read as one line
        var deadRows = [];
        (c.dead || []).forEach(function (r) {
          var last = deadRows[deadRows.length - 1];
          if (last && last.target === r.target && r.afterMs - last.lastMs <= 3000) { last.count++; last.lastMs = r.afterMs; }
          else deadRows.push({ target: r.target, afterMs: r.afterMs, lastMs: r.afterMs, count: 1 });
        });
        var rows = (c.rage || []).map(function (r) { return { ms: r.afterMs, text: "Rage click ×" + r.count + " · " + r.target }; })
          .concat(deadRows.map(function (r) { return { ms: r.afterMs, text: "Dead click" + (r.count > 1 ? " ×" + r.count : "") + " · " + r.target }; }))
          .sort(function (x, y) { return (x.ms || 0) - (y.ms || 0); });
        card.appendChild(el("ul", { class: "steps" }, rows.map(function (r) {
          return el("li", {}, [el("span", { class: "t", text: dur(r.ms) }), el("span", { text: r.text })]);
        })));
      }
      if (c.steps.length) {
        card.appendChild(el("div", { class: "card-h", style: "margin:14px 0 0" }, [el("h2", { text: "Playbook actions" }), el("span", { class: "muted", text: "time after connecting" })]));
        card.appendChild(el("ul", { class: "steps" }, c.steps.map(function (x) {
          return el("li", {}, [el("span", { class: "t", text: dur(x.afterMs) }), el("span", { text: x.label || x.action })]);
        })));
      }
      if (c.transcript.length) {
        card.appendChild(el("details", { class: "more" }, [el("summary", { text: "Transcript · " + c.transcript.length + (c.transcript.length === 1 ? " line" : " lines") }),
          el("ul", { class: "transcript" }, c.transcript.map(function (x) {
            return el("li", {}, [el("b", { text: x.role === "agent" ? who(c.client) + " (caller)" : "Participant" }), x.text]);
          }))]));
      }
      b.appendChild(card);
    });

    if (s.survey && s.survey.answers) {
      var sc = el("div", { class: "card" }, [el("div", { class: "card-h" }, [el("h2", { text: "Survey" }),
        el("span", { class: "pill " + (s.survey.submittedAt ? "ok" : "warn"), text: s.survey.submittedAt ? "Submitted " + when(s.survey.submittedAt) : "Not submitted" })])]);
      var list = el("ul", { class: "sv-answers" });
      (SURVEY.questions || []).forEach(function (qq, i) {
        var a = s.survey.answers[qq.id];
        var has = a && (a.value != null || (a.text || "").trim() || a.recordings.length);
        list.appendChild(el("li", {}, [el("div", { class: "sv-who" }, [(i + 1) + ". " + qq.text, has && qq.type === "open" ? el("span", { class: "pill", text: howTag(a) }) : null]),
          el("div", { class: "sv-text" + (has ? "" : " muted"), text: !has ? "No answer" : a.value != null ? String(a.value) : a.text || "(recording only)" }),
          has ? players(s.code, a) : null]));
      });
      sc.appendChild(list);
      b.appendChild(sc);
    }

    var t0 = events.length ? Date.parse(events[0].at || events[0].rt) : 0;
    var shown = events.filter(function (e) { return e.type !== "transcript"; });
    b.appendChild(el("div", { class: "card" }, [
      el("details", { class: "more", style: "margin:0" }, [el("summary", { text: "Event timeline · " + shown.length + " events" }),
        el("ul", { class: "timeline", style: "margin-top:10px" }, shown.map(function (e) {
          var extra = e.type === "click" ? (e.label || "(" + e.tag + ")") + (e.interactive ? "" : " · not a control")
            : e.type === "step" ? e.label || e.action : e.type === "call_end" ? e.reason : e.type === "error" ? e.message
            : e.to || e.client || e.via || "";
          return el("li", {}, [el("span", { class: "t", text: dur(Date.parse(e.at || e.rt) - t0) }),
            el("span", { text: e.type.replace(/_/g, " ") + (e.n ? " · call " + e.n : "") + (extra ? " · " + extra : "") })]);
        }))]),
    ]));

    b.appendChild(el("div", { class: "actions" }, [el("button", { class: "btn btn-danger", type: "button", text: "Remove participant",
      onclick: function () {
        if (!confirm("Remove " + s.email + "? Their link stops working. Their data is kept on the server but hidden from the dashboard.")) return;
        api("remove", { method: "POST", body: JSON.stringify({ code: s.code }) }).then(function () { closeDetail(); toast("Removed"); load(); });
      } })]));
  }

  function codeRow(s, c, a) {
    var line = a.asked
      ? "Asked at " + dur(a.askedMs) + " · first reply " + dur(a.replyMs) + (a.held ? " · on hold " + dur(a.holdMs) : " · no hold") +
        (a.actionMs == null ? " · playbook action not taken" : " · playbook action " + (a.actionMs < 0 ? dur(-a.actionMs) + " before" : dur(a.actionMs) + " after"))
      : "The caller didn’t say this line (or speech-to-text missed it).";
    var sel = el("select", { "aria-label": "Outcome for " + a.id }, [el("option", { value: "", text: "Auto: " + a.auto })].concat(STUDY.outcomes.map(function (o) {
      var op = el("option", { value: o, text: o }); if (a.coded && a.coded.outcome === o) op.selected = true; return op;
    })));
    var note = el("input", { type: "text", placeholder: "Note (optional)", value: a.note || "", "aria-label": "Note for " + a.id });
    var save = function () {
      api("code", { method: "POST", body: JSON.stringify({ code: s.code, n: c.n, anchor: a.id, outcome: sel.value, note: note.value }) })
        .then(function () { toast("Saved"); load(); });
    };
    sel.addEventListener("change", save);
    note.addEventListener("change", save);
    return el("div", { class: "code-row" }, [
      el("div", {}, [el("strong", { text: a.id + " · " + a.label }), el("span", { class: "sub2", text: line }),
        a.coded ? el("span", { class: "sub2", text: "Coded by " + (a.coded.by || "?") + " · " + when(a.coded.at) }) : null]),
      el("div", { class: "code-ctl" }, [sel, note]),
    ]);
  }

  /* ---------------- invites ---------------- */

  $("shared-link").textContent = location.origin + "/";
  document.querySelector('[data-copy="shared"]').addEventListener("click", function () { copy(location.origin + "/", "Shared link copied"); });

  $("invite-add").addEventListener("click", function () {
    var text = $("invite-emails").value;
    if (!text.trim()) return;
    sendInvites(text);
  });
  $("invite-file").addEventListener("change", function () {
    var f = this.files[0]; this.value = "";
    if (f) f.text().then(sendInvites);
  });
  function sendInvites(text) {
    api("invite", { method: "POST", body: JSON.stringify({ emails: text }) }).then(function (r) {
      var named = r.added.filter(function (x) { return x.firstName; }).length;
      var msg = r.added.length + " added" + (r.added.length ? " (" + named + " with a first name)" : "") + (r.updated && r.updated.length ? " · " + r.updated.length + " names updated" : "");
      if (r.skipped.length) msg += " · skipped " + r.skipped.length + ": " + r.skipped.map(function (x) { return x.email + " (" + x.reason + ")"; }).join(", ");
      $("invite-result").textContent = msg;
      $("invite-emails").value = "";
      load();
    }).catch(function (e) { $("invite-result").textContent = "Couldn’t add invites: " + e.message; });
  }

  function linkRows() {
    return data.participants.slice().sort(function (a, b) { return a.email < b.email ? -1 : 1; });
  }
  $("copy-links").addEventListener("click", function () {
    copy(linkRows().filter(function (s) { return s.listed; }).map(function (s) { return s.email + "\t" + linkFor(s.code); }).join("\n"), "All links copied");
  });
  $("download-links").addEventListener("click", function () {
    var q = function (v) { v = String(v || ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = "email,first_name,link,status\n" + linkRows().filter(function (s) { return s.listed; })
      .map(function (s) { return [s.email, s.firstName, linkFor(s.code), s.stage].map(q).join(","); }).join("\n") + "\n";
    download("study-links.csv", csv, "text/csv");
  });

  function renderInvites() {
    var rows = linkRows();
    $("invite-count").textContent = rows.filter(function (s) { return s.listed; }).length + " invited" +
      (rows.some(function (s) { return !s.listed; }) ? " · " + rows.filter(function (s) { return !s.listed; }).length + " not on the list" : "");
    var t = $("links"); t.innerHTML = "";
    t.appendChild(el("thead", {}, [el("tr", {}, ["Email", "First name", "Personal link", "Status", ""].map(function (h) { return el("th", { text: h }); }))]));
    var tb = el("tbody");
    if (!rows.length) tb.appendChild(el("tr", {}, [el("td", { class: "empty", colspan: "5", text: "No participants yet. Add invites above." })]));
    rows.forEach(function (s) {
      tb.appendChild(el("tr", {}, [
        el("td", {}, [s.email, s.listed ? null : el("span", { class: "sub2", text: "not on invite list" })]),
        el("td", { class: s.firstName ? "" : "muted", text: s.firstName || "missing" }),
        el("td", {}, [el("div", { class: "link-cell" }, [el("code", { text: "/?p=" + s.code }),
          el("button", { class: "btn btn-ghost", type: "button", text: "Copy", onclick: function () { copy(linkFor(s.code), "Link copied"); } })])]),
        el("td", {}, [stagePill(s)]),
        el("td", { class: "r" }, [el("button", { class: "btn btn-ghost", type: "button", text: "Details", onclick: function () { openDetail(s.code); } })]),
      ]));
    });
    t.appendChild(tb);
  }
})();
