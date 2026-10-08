// Baseline: an export of call stats from the current system, uploaded as CSV on the dashboard, so the
// prototype's numbers can be compared against today's. Columns differ by system, so the researcher maps
// them once (which column is handle time, call type, ...). Stored as baseline.json in the data folder.

const fs = require("fs");
const path = require("path");

const MAX_ROWS = 200000;

// RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes; tabs if there are no commas
function parseCsv(text) {
  text = String(text || "").replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const sep = firstLine.indexOf(",") < 0 && firstLine.indexOf("\t") >= 0 ? "\t" : firstLine.indexOf(",") < 0 && firstLine.indexOf(";") >= 0 ? ";" : ",";
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > MAX_ROWS) break;
    } else field += ch;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

// "245", "245.5", "4:05", "0:04:05", "4m 5s" -> seconds (unit applies to plain numbers only)
function toSeconds(v, unit) {
  const t = String(v == null ? "" : v).trim();
  if (!t) return null;
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(t)) return t.split(":").reduce((n, x) => n * 60 + Number(x), 0);
  const m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec)?)?$/i);
  if (m && (m[1] || m[2] || m[3])) return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  const n = Number(t.replace(/,/g, ""));
  if (!isFinite(n)) return null;
  return unit === "minutes" ? n * 60 : unit === "ms" ? n / 1000 : n;
}

function createBaseline(dataDir) {
  const file = path.join(dataDir, "baseline.json");
  let data = null;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { data = null; }

  function save() {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }

  return {
    get: () => data,
    upload(name, csv, by) {
      const rows = parseCsv(csv);
      if (rows.length < 2) throw new Error("The file needs a header row and at least one data row.");
      const headers = rows[0].map((h, i) => h.trim() || "Column " + (i + 1));
      data = { name: String(name || "baseline.csv").slice(0, 200), uploadedAt: new Date().toISOString(), by,
        headers, rows: rows.slice(1, MAX_ROWS + 1), mapping: guessMapping(headers) };
      save();
      return data;
    },
    setMapping(mapping) {
      if (!data) return null;
      data.mapping = mapping || {};
      save();
      return data;
    },
    clear() { data = null; try { fs.unlinkSync(file); } catch {} },
  };
}

// a first guess from common header names; the researcher can change it
function guessMapping(headers) {
  const find = (re) => { const i = headers.findIndex((h) => re.test(h)); return i < 0 ? null : i; };
  return {
    type: find(/(call ?type|reason|disposition|category|queue|intent|playbook|topic)/i),
    aht: find(/(aht|handle ?time|handling|talk ?time|duration)/i),
    verify: find(/(verif|authenticat|\bid&v\b|idv)/i),
    holds: find(/(hold ?count|holds|# ?of ?holds|number of holds)/i),
    hold: find(/(hold ?time|hold ?dur|time on hold|hold ?sec)/i),
    transfer: find(/(transfer|escalat)/i),
    units: {}, types: {},
  };
}

const METRICS = [
  { key: "aht", label: "Handle time", kind: "time" },
  { key: "verify", label: "Time to verify", kind: "time" },
  { key: "holds", label: "Holds per call", kind: "count" },
  { key: "hold", label: "Time on hold", kind: "time" },
  { key: "transfer", label: "Transferred", kind: "rate" },
];

function stats(xs, kind) {
  const v = xs.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, median: null, mean: null };
  const m = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return kind === "rate" ? { n: v.length, median: null, mean } : { n: v.length, median, mean };
}

const truthy = (x) => {
  const t = String(x == null ? "" : x).trim().toLowerCase();
  if (!t) return null;
  if (/^(y|yes|true|1|transferred|t)$/.test(t)) return 1;
  if (/^(n|no|false|0|f|none|-)$/.test(t)) return 0;
  return isFinite(Number(t)) ? (Number(t) > 0 ? 1 : 0) : 1;
};

// baseline vs prototype for every mapped metric, overall and per customer scenario
function compare(data, summaries) {
  const calls = [];
  summaries.forEach((s) => s.calls.filter((c) => c.completed).forEach((c) => calls.push(c)));
  const proto = (key, list) => list.map((c) =>
    key === "aht" ? c.ahtMs / 1000 : key === "verify" ? (c.verifyMs == null ? null : c.verifyMs / 1000)
    : key === "holds" ? c.holds : key === "hold" ? c.holdMs / 1000 : c.transfer ? 1 : 0);

  const map = (data && data.mapping) || {};
  const units = map.units || {};
  const rows = (data && data.rows) || [];
  const col = (key, list) => {
    const i = map[key];
    if (i == null || i === "") return [];
    return list.map((r) => key === "transfer" ? truthy(r[i]) : key === "holds" ? (r[i] === "" || r[i] == null ? null : Number(String(r[i]).replace(/,/g, ""))) : toSeconds(r[i], units[key] || "seconds"));
  };
  const scopes = [{ id: "all", base: rows, proto: calls }];
  const types = map.types || {};
  const clients = Array.from(new Set(Object.values(types).filter(Boolean)));
  clients.forEach((cl) => scopes.push({
    id: cl,
    base: map.type == null ? [] : rows.filter((r) => types[String(r[map.type] || "").trim()] === cl),
    proto: calls.filter((c) => c.client === cl),
  }));
  return scopes.map((sc) => ({
    scope: sc.id,
    metrics: METRICS.map((m) => ({ key: m.key, label: m.label, kind: m.kind,
      mapped: map[m.key] != null && map[m.key] !== "",
      baseline: stats(col(m.key, sc.base), m.kind), prototype: stats(proto(m.key, sc.proto), m.kind) })),
  }));
}

module.exports = { createBaseline, parseCsv, toSeconds, compare, METRICS };
