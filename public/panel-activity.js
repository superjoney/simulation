/* Build your panel: the co-creation activity after the survey.
   Participants start from today's right panel and rearrange it: reorder (drag or arrows), remove, add
   modules from a library or describe their own, star up to three must-haves, and comment on any module
   by typing or speaking. Every change saves to the server, so a refresh picks up where they were. */
(function () {
  "use strict";

  var CFG = (window.SIM_CONFIG || {}).activity || {};
  var MODULES = CFG.modules || [];
  var MAX_STARS = CFG.maxStars || 3;
  var $ = function (id) { return document.getElementById(id); };
  var S = null;           // window.SimStudy, from simulator.js
  var state = null;       // { order, stars, custom, comments, general }
  var openComments = {};  // module id -> comment box open
  var saveTimer = 0, dragId = null, dragFrom = null;

  function byId(id) {
    return MODULES.filter(function (m) { return m.id === id; })[0] ||
      state.custom.filter(function (c) { return c.id === id; })[0] || null;
  }
  function comment(id) { return state.comments[id] || (state.comments[id] = { text: "", value: null, recordings: [], dictated: false, typed: false }); }
  function hasComment(id) { var c = state.comments[id]; return !!(c && ((c.text || "").trim() || c.recordings.length)); }

  /* ---------------- start ---------------- */

  function start(saved) {
    S = window.SimStudy;
    state = saved && saved.order ? saved : {
      order: MODULES.filter(function (m) { return m.current; }).map(function (m) { return m.id; }),
      stars: [], custom: [], comments: {}, general: null,
    };
    state.custom = state.custom || []; state.comments = state.comments || {}; state.stars = state.stars || [];
    state.general = state.general || { text: "", value: null, recordings: [], dictated: false, typed: false };
    $("pa-title").textContent = CFG.title || "Build your ideal panel";
    $("pa-intro").textContent = CFG.intro || "";
    $("pa-general-q").textContent = CFG.generalQuestion || "Anything else?";
    $("pa-general").innerHTML = "";
    S.voiceField("panel-general", state.general, queueSave, { ariaLabel: CFG.generalQuestion || "Anything else", rows: 3 })
      .forEach(function (n) { $("pa-general").appendChild(n); });
    S.show("panel");
    S.track("panel_start", { resumed: !!(saved && saved.order) });
    render();
    window.scrollTo(0, 0);
  }

  /* ---------------- render ---------------- */

  function isCustom(m) { return m.custom || /^custom-/.test(m.id); }

  function render() {
    S.stopRecording();   // the boxes are rebuilt; a recording in progress is saved first
    var list = $("pa-list");
    list.innerHTML = "";
    state.order.forEach(function (id, i) { var m = byId(id); if (m) list.appendChild(panelCard(m, i)); });
    if (!state.order.length) list.appendChild(S.h("li", { class: "pa-empty", text: "Your panel is empty. Add modules from the library." }));

    var lib = $("pa-library");
    lib.innerHTML = "";
    var rest = MODULES.concat(state.custom).filter(function (m) { return state.order.indexOf(m.id) < 0; });
    rest.forEach(function (m) { lib.appendChild(libraryCard(m)); });
    if (!rest.length) lib.appendChild(S.h("p", { class: "field-note", text: "Everything is in your panel." }));

    $("pa-stars").textContent = "★ " + state.stars.length + " of " + MAX_STARS + " starred";
  }

  function preview(m) {
    if (m.preview && m.preview.length) {
      return S.h("dl", { class: "pa-prev", "aria-hidden": "true" }, m.preview.map(function (r) {
        return S.h("div", {}, [S.h("dt", { text: r[0] }), S.h("dd", { text: r[1] })]);
      }));
    }
    return S.h("p", { class: "pa-prev pa-prev-custom", text: m.desc || "Your idea" });
  }

  function iconBtn(label, text, onclick, extra) {
    var b = S.h("button", Object.assign({ type: "button", class: "pa-ib", title: label, "aria-label": label }, extra || {}), [text]);
    b.addEventListener("click", onclick);
    return b;
  }

  function panelCard(m, i) {
    var starRank = state.stars.indexOf(m.id);
    var star = iconBtn(starRank >= 0 ? "Unstar " + m.name : "Star " + m.name + " as a must-have", starRank >= 0 ? "★ " + (starRank + 1) : "☆", function () { toggleStar(m.id); },
      { "aria-pressed": String(starRank >= 0), class: "pa-ib pa-star" + (starRank >= 0 ? " on" : "") });
    var li = S.h("li", { class: "pa-card", draggable: "true", "data-id": m.id }, [
      S.h("div", { class: "pa-card-h" }, [
        S.h("span", { class: "pa-grip", "aria-hidden": "true", text: "⋮⋮" }),
        S.h("strong", { class: "pa-name", text: m.name }),
        isCustom(m) ? S.h("span", { class: "pa-tag", text: "Your idea" }) : (!m.current ? S.h("span", { class: "pa-tag", text: "New" }) : null),
        S.h("span", { class: "pa-tools" }, [
          star,
          iconBtn("Move " + m.name + " up", "↑", function () { move(m.id, i - 1); }, i === 0 ? { disabled: "" } : null),
          iconBtn("Move " + m.name + " down", "↓", function () { move(m.id, i + 1); }, i === state.order.length - 1 ? { disabled: "" } : null),
          iconBtn("Remove " + m.name, "✕", function () { remove(m.id); }),
        ]),
      ]),
      preview(m),
      commentToggle(m),
    ]);
    if (openComments[m.id]) li.appendChild(commentBox(m));
    dragSource(li, m.id, "panel");
    return li;
  }

  function libraryCard(m) {
    var add = S.h("button", { type: "button", class: "btn btn-secondary pa-add", text: "+ Add" });
    add.addEventListener("click", function () { addModule(m.id, state.order.length); });
    var card = S.h("div", { class: "pa-card pa-libcard", draggable: "true", "data-id": m.id }, [
      S.h("div", { class: "pa-card-h" }, [S.h("strong", { class: "pa-name", text: m.name }),
        isCustom(m) ? S.h("span", { class: "pa-tag", text: "Your idea" }) : m.current ? S.h("span", { class: "pa-tag", text: "Removed" }) : null, add]),
      S.h("p", { class: "pa-desc", text: m.desc || "" }),
      commentToggle(m),
    ]);
    if (openComments[m.id]) card.appendChild(commentBox(m));
    dragSource(card, m.id, "library");
    return card;
  }

  function commentToggle(m) {
    var b = S.h("button", { type: "button", class: "pa-comment-btn", "aria-expanded": String(!!openComments[m.id]) },
      [hasComment(m.id) ? "💬 Edit comment" : "💬 Comment"]);
    b.addEventListener("click", function () {
      openComments[m.id] = !openComments[m.id];
      if (!openComments[m.id]) S.stopRecording();
      render();
      if (openComments[m.id]) { var ta = document.querySelector('[data-id="' + m.id + '"] textarea'); if (ta) ta.focus(); }
    });
    return b;
  }

  function commentBox(m) {
    var box = S.h("div", { class: "pa-comment" });
    S.voiceField("panel-" + m.id, comment(m.id), function (now) { queueSave(now); S.track("panel_comment", { id: m.id }); },
      { ariaLabel: "Comment on " + m.name, rows: 2, placeholder: "Why? What would you change? Type, or press Speak" })
      .forEach(function (n) { box.appendChild(n); });
    return box;
  }

  /* ---------------- changes ---------------- */

  function move(id, to) {
    var from = state.order.indexOf(id);
    if (from < 0 || to < 0 || to >= state.order.length || from === to) return;
    state.order.splice(from, 1);
    state.order.splice(to, 0, id);
    S.track("panel_move", { id: id, from: from, to: to });
    changed();
    var b = document.querySelector('#pa-list [data-id="' + id + '"] .pa-name');
    if (b) b.parentNode.parentNode.scrollIntoView({ block: "nearest" });
  }
  function addModule(id, at) {
    if (state.order.indexOf(id) >= 0) return;
    state.order.splice(Math.max(0, Math.min(at, state.order.length)), 0, id);
    S.track("panel_add", { id: id, at: at });
    changed();
  }
  function remove(id) {
    state.order = state.order.filter(function (x) { return x !== id; });
    state.stars = state.stars.filter(function (x) { return x !== id; });
    S.track("panel_remove", { id: id });
    changed();
  }
  function toggleStar(id) {
    var i = state.stars.indexOf(id);
    if (i >= 0) state.stars.splice(i, 1);
    else if (state.stars.length >= MAX_STARS) { flash("You’ve starred " + MAX_STARS + ". Unstar one to pick another."); return; }
    else state.stars.push(id);
    S.track("panel_star", { id: id, on: i < 0, rank: i < 0 ? state.stars.length : null });
    changed();
  }
  function changed() { render(); queueSave(); }

  function flash(msg) { $("pa-saved").textContent = msg; }

  $("pa-custom").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("pa-custom-name").value.trim();
    if (!name) { $("pa-custom-name").focus(); return; }
    var n = state.custom.reduce(function (x, c) { return Math.max(x, Number(c.id.split("-")[1]) || 0); }, 0) + 1;
    var m = { id: "custom-" + n, name: name, desc: $("pa-custom-desc").value.trim(), custom: true };
    state.custom.push(m);
    S.track("panel_custom", { id: m.id, name: name });
    $("pa-custom-name").value = ""; $("pa-custom-desc").value = "";
    addModule(m.id, state.order.length);
  });

  /* ---------------- drag and drop ---------------- */

  function dragSource(el, id, from) {
    el.addEventListener("dragstart", function (e) {
      if (e.target.closest && e.target.closest("textarea, input, button")) { e.preventDefault(); return; }
      dragId = id; dragFrom = from;
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", id); } catch (err) {}
      setTimeout(function () { el.classList.add("dragging"); }, 0);
    });
    el.addEventListener("dragend", function () { el.classList.remove("dragging"); clearMarker(); dragId = null; });
  }

  function insertIndex(y) {
    var cards = [].slice.call(document.querySelectorAll("#pa-list > .pa-card:not(.dragging)"));
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return { i: i, el: cards[i] };
    }
    return { i: cards.length, el: null };
  }
  function clearMarker() {
    var m = document.querySelector(".pa-marker"); if (m) m.remove();
    $("pa-library").classList.remove("drop");
  }

  $("pa-list").addEventListener("dragover", function (e) {
    if (!dragId) return;
    e.preventDefault();
    var at = insertIndex(e.clientY);
    var mk = document.querySelector(".pa-marker") || S.h("li", { class: "pa-marker", "aria-hidden": "true" });
    if (at.el) this.insertBefore(mk, at.el); else this.appendChild(mk);
  });
  $("pa-list").addEventListener("dragleave", function (e) { if (!this.contains(e.relatedTarget)) clearMarker(); });
  $("pa-list").addEventListener("drop", function (e) {
    if (!dragId) return;
    e.preventDefault();
    var at = insertIndex(e.clientY).i;     // index among the other cards
    clearMarker();
    if (dragFrom === "panel") {
      var from = state.order.indexOf(dragId);
      state.order.splice(from, 1);
      state.order.splice(at, 0, dragId);
      if (from !== at) S.track("panel_move", { id: dragId, from: from, to: at, drag: true });
      changed();
    } else addModule(dragId, at);
  });
  $("pa-library").addEventListener("dragover", function (e) {
    if (!dragId || dragFrom !== "panel") return;
    e.preventDefault();
    this.classList.add("drop");
  });
  $("pa-library").addEventListener("dragleave", function (e) { if (!this.contains(e.relatedTarget)) this.classList.remove("drop"); });
  $("pa-library").addEventListener("drop", function (e) {
    if (!dragId || dragFrom !== "panel") return;
    e.preventDefault();
    clearMarker();
    remove(dragId);
  });

  /* ---------------- saving ---------------- */

  function queueSave(now) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { save(false); }, now ? 0 : 700);
  }
  function save(submit) {
    clearTimeout(saveTimer);
    var me = S.me();
    return fetch("api/panel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p: me.code, state: state, submit: !!submit }), keepalive: !submit,
    }).then(function (r) {
      if (!r.ok) throw new Error();
      $("pa-saved").textContent = "Saved";
    }).catch(function (e) {
      $("pa-saved").textContent = "Not saved yet. Check your connection.";
      if (submit) throw e;
    });
  }

  $("pa-finish").addEventListener("click", function () {
    S.stopRecording();
    var btn = this;
    btn.disabled = true;
    setTimeout(function () {   // let a just-stopped recording upload
      save(true).then(function () {
        S.track("panel_submit", { modules: state.order.length, stars: state.stars.length });
        S.finish();
      }).catch(function () { btn.disabled = false; });
    }, 600);
  });

  window.SimPanel = {
    enabled: function () { return MODULES.length > 0; },
    start: start,
  };
})();
