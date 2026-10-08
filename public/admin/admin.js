/* Study dashboard: sign in, overview, participants, invites. Data comes from /api/admin/*. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var CFG = window.SIM_CONFIG || {};
  var NAMES = {};
  (CFG.clients || []).forEach(function (c) { NAMES[c.id] = c.name; });
  var data = null, filter = "all", query = "", refreshTimer = 0;

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
    var s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
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
      ["overview", "participants", "invites"].forEach(function (t) { $("tab-" + t).hidden = t !== b.getAttribute("data-tab"); });
    });
  });
  $("refresh").addEventListener("click", load);

  /* ---------------- data ---------------- */

  function load() {
    return api("overview").then(function (d) {
      data = d;
      $("updated").textContent = "Updated " + new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
      renderOverview(); renderPeople(); renderInvites();
    }).catch(function () {});
  }

  /* ---------------- overview ---------------- */

  function renderOverview() {
    var t = data.overview.totals;
    var tiles = [
      ["Invited", t.invited, t.notListed ? t.notListed + " more not on the list" : ""],
      ["Started", t.started, t.invited ? pct(t.started / t.invited) + " of invited" : ""],
      ["Completed", t.completed, "both calls finished"],
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
    head.push("Holds", "Paused", "Last activity");
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
      cells.push(el("td", { text: String(holds) }), el("td", { text: s.pauses ? dur(s.pauseMs) : "—" }), el("td", { text: when(s.lastSeen) }));
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

  /* ---------------- invites ---------------- */

  $("shared-link").textContent = location.origin + "/";
  document.querySelector('[data-copy="shared"]').addEventListener("click", function () { copy(location.origin + "/", "Shared link copied"); });

  $("invite-add").addEventListener("click", function () {
    var text = $("invite-emails").value;
    if (!text.trim()) return;
    api("invite", { method: "POST", body: JSON.stringify({ emails: text }) }).then(function (r) {
      var msg = r.added.length + " added";
      if (r.skipped.length) msg += " · skipped " + r.skipped.length + ": " + r.skipped.map(function (x) { return x.email + " (" + x.reason + ")"; }).join(", ");
      $("invite-result").textContent = msg;
      $("invite-emails").value = "";
      load();
    }).catch(function (e) { $("invite-result").textContent = "Couldn’t add invites: " + e.message; });
  });

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
    t.appendChild(el("thead", {}, [el("tr", {}, ["Email", "Personal link", "Status", ""].map(function (h) { return el("th", { text: h }); }))]));
    var tb = el("tbody");
    if (!rows.length) tb.appendChild(el("tr", {}, [el("td", { class: "empty", colspan: "4", text: "No participants yet. Add invites above." })]));
    rows.forEach(function (s) {
      tb.appendChild(el("tr", {}, [
        el("td", {}, [s.email, s.listed ? null : el("span", { class: "sub2", text: "not on invite list" })]),
        el("td", {}, [el("div", { class: "link-cell" }, [el("code", { text: "/?p=" + s.code }),
          el("button", { class: "btn btn-ghost", type: "button", text: "Copy", onclick: function () { copy(linkFor(s.code), "Link copied"); } })])]),
        el("td", {}, [stagePill(s)]),
        el("td", { class: "r" }, [el("button", { class: "btn btn-ghost", type: "button", text: "Details", onclick: function () { openDetail(s.code); } })]),
      ]));
    });
    t.appendChild(tb);
  }
})();
