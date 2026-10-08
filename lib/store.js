// Participants and their event logs, kept as plain files in DATA_DIR (a Railway volume when hosted):
//   participants.json        every invited or self-identified participant
//   events/<code>.jsonl      one JSON event per line, appended as the participant goes
// About a hundred participants fits comfortably in memory; writes are atomic (temp file + rename).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createStore(dataDir) {
  const file = path.join(dataDir, "participants.json");
  const eventsDir = path.join(dataDir, "events");
  fs.mkdirSync(eventsDir, { recursive: true });

  let participants = [];
  try { participants = JSON.parse(fs.readFileSync(file, "utf8")); } catch { participants = []; }

  function save() {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(participants, null, 2));
    fs.renameSync(tmp, file);
  }

  function newCode() {
    for (;;) {
      let c = "";
      for (let i = 0; i < 6; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!byCode(c)) return c;
    }
  }

  function byCode(code) {
    const c = String(code || "").toUpperCase();
    return participants.find((p) => p.code === c) || null;
  }

  function byEmail(email) {
    const e = String(email || "").trim().toLowerCase();
    return participants.find((p) => p.email === e) || null;
  }

  // Add invites from pasted text or a CSV: one person per line, "email, first name" in any column
  // order (a header row is skipped). A line with several emails and no name adds each of them.
  // Returns { added: [...], updated: [...], skipped: [...] }
  function parseInvites(text) {
    const people = [];
    let first = true;
    for (const line of String(text || "").split(/\r?\n/)) {
      const header = first && line.trim() && !line.includes("@");
      if (line.trim()) first = false;
      const cells = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, "").trim()).filter(Boolean);
      const emails = cells.flatMap((c) => c.split(/\s+/)).map((w) => w.replace(/^<|>$/g, "")).filter((w) => w.includes("@"));
      if (!emails.length) {
        if (!header) cells.forEach((c) => people.push({ email: c, firstName: "" }));
        continue;
      }
      if (emails.length > 1) { emails.forEach((e) => people.push({ email: e, firstName: "" })); continue; }
      const rest = cells.map((c) => c.replace(emails[0], "").replace(/[<>]/g, "").trim()).filter(Boolean);
      people.push({ email: emails[0], firstName: (rest[0] || "").split(/\s+/)[0].slice(0, 40) });
    }
    return people;
  }

  function invite(text) {
    const added = [], updated = [], skipped = [];
    for (const person of parseInvites(text)) {
      const email = person.email.toLowerCase();
      if (!EMAIL_RE.test(email)) { skipped.push({ email: person.email, reason: "not an email" }); continue; }
      const existing = byEmail(email);
      if (existing) {
        const named = person.firstName && existing.firstName !== person.firstName;
        if (named) existing.firstName = person.firstName;
        if (!existing.listed) { existing.listed = true; added.push(existing); }
        else if (named) updated.push(existing);
        else skipped.push({ email, reason: "already invited" });
        continue;
      }
      const p = { code: newCode(), email, listed: true, firstName: person.firstName, orderIndex: null, createdAt: new Date().toISOString() };
      participants.push(p);
      added.push(p);
    }
    if (added.length || updated.length) save();
    return { added, updated, skipped };
  }

  // Shared link: find the participant by email, or add them flagged as not on the invite list
  function identify(email) {
    const e = String(email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return null;
    let p = byEmail(e);
    if (!p) {
      p = { code: newCode(), email: e, listed: false, firstName: "", orderIndex: null, createdAt: new Date().toISOString() };
      participants.push(p);
      save();
    }
    return p;
  }

  function update(code, fields) {
    const p = byCode(code);
    if (!p) return null;
    Object.assign(p, fields);
    save();
    return p;
  }

  // Counterbalancing: hand out call orders in rotation
  function assignOrder(code, count) {
    const p = byCode(code);
    if (!p) return null;
    if (p.orderIndex == null && count > 0) {
      const used = participants.filter((x) => x.orderIndex != null).length;
      p.orderIndex = used % count;
      save();
    }
    return p.orderIndex;
  }

  function remove(code) {
    const p = byCode(code);
    if (!p) return false;
    participants = participants.filter((x) => x !== p);
    save();
    try { fs.renameSync(eventsPath(p.code), eventsPath(p.code) + ".deleted-" + Date.now()); } catch {}
    return true;
  }

  function eventsPath(code) { return path.join(eventsDir, code + ".jsonl"); }

  function appendEvents(code, events) {
    const now = new Date().toISOString();
    const lines = events.map((e) => JSON.stringify(Object.assign({}, e, { rt: now }))).join("\n") + "\n";
    fs.appendFileSync(eventsPath(code), lines);
  }

  function readEvents(code) {
    let raw = "";
    try { raw = fs.readFileSync(eventsPath(code), "utf8"); } catch { return []; }
    const out = [];
    for (const line of raw.split("\n")) {
      if (!line) continue;
      try { out.push(JSON.parse(line)); } catch {}
    }
    return out.sort((a, b) => (a.at || a.rt) < (b.at || b.rt) ? -1 : 1);
  }

  return {
    all: () => participants.slice(),
    byCode, byEmail, invite, identify, update, assignOrder, remove, appendEvents, readEvents,
  };
}

module.exports = { createStore };
