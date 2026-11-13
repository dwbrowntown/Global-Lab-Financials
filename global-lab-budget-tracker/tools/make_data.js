#!/usr/bin/env node
/* Build src/data.js from saved Snowflake results.
   Usage: node tools/make_data.js <orders.json> <procurement.json|-> <previous data.js> <out data.js> <YYYY-MM-DD>
   orders.json / procurement.json are the raw sales-sql-executor results of sql/orders.sql and sql/procurement.sql.
   When procurement is '-' or returns zero rows, the third-party rows from the previous data.js are kept and dated
   with their original date, so the page shows how old they are instead of showing an empty section. */
'use strict';
const fs = require('fs');
const [ordersPath, procPath, prevPath, outPath, today] = process.argv.slice(2);
if (!ordersPath || !procPath || !prevPath || !outPath || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) {
  console.error('usage: make_data.js <orders.json> <procurement.json|-> <previous data.js> <out data.js> <YYYY-MM-DD>');
  process.exit(2);
}

function rowsOf(path) {
  let p = JSON.parse(fs.readFileSync(path, 'utf8'));
  // accept the bare result, a {content:[{text}]} envelope, or a JSON string
  if (p && Array.isArray(p.content)) p = JSON.parse(p.content.filter(c => c.type === 'text').map(c => c.text).join(''));
  if (typeof p === 'string') p = JSON.parse(p);
  const rs = p.result_set || p.resultSet || p;
  if (!rs || !rs.resultSetMetaData) throw new Error('no result_set in ' + path);
  const names = rs.resultSetMetaData.rowType.map(t => t.name.toUpperCase());
  return (rs.data || []).map(r => Object.fromEntries(names.map((n, i) => [n, r[i]])));
}
const s = v => (v == null ? '' : String(v));
const d10 = v => s(v).slice(0, 10);

/* ---- orders ---- */
const lines = rowsOf(ordersPath);
if (!lines.length) { console.error('orders result is empty, refusing to write data.js'); process.exit(1); }
const bySo = new Map();
for (const r of lines) {
  const so = s(r.SO);
  if (!bySo.has(so)) bySo.set(so, { so, dept: s(r.DEPT), geo: s(r.GEO), shipto: s(r.SHIPTO), acct: s(r.ACCT), proj: s(r.PROJ), od: d10(r.OD), lines: [] });
  const o = bySo.get(so);
  if (s(r.ACCT) > o.acct) o.acct = s(r.ACCT);
  if (s(r.PROJ) && !o.proj) o.proj = s(r.PROJ);
  if (d10(r.OD) && (!o.od || d10(r.OD) < o.od)) o.od = d10(r.OD);
  // line: [part, line status, qty, shipped qty, cost, actual ship, scheduled ship, receipt, return flag]
  o.lines.push([s(r.PN), s(r.LS), +r.Q, +r.SQ, +r.C, d10(r.ASD), d10(r.SSD), d10(r.RCD), +r.RET === 1 ? 1 : 0]);
}
const O = [...bySo.values()].map(o => [o.so, o.dept, o.geo, o.shipto, o.acct, o.od, o.proj, '', '', o.lines]);

/* ---- third party ---- */
global.window = {};
require(require('path').resolve(prevPath));
const prev = global.window.LAB_DATA || {};
let TP, tpDate, tpNote = '';
let procRows = [];
if (procPath !== '-') procRows = rowsOf(procPath);
if (procRows.length) {
  TP = procRows.map(r => [s(r.V), s(r.R), s(r.RQ), s(r.D), s(r.A), s(r.AD), +r.AMT, s(r.CCY), d10(r.DT), +r.NA === 1 ? 1 : 0, s(r.PROJ)]);
  tpDate = today;
} else {
  TP = (prev.TP || []).map(r => (r.length >= 11 ? r : [...r, ...Array(11 - r.length).fill('')]));
  tpDate = prev.tpDate || prev.date || '';
  tpNote = 'Procurement returned no rows on this pull, so third-party rows are carried from ' + tpDate + '.';
}

const out = { date: today, tpDate, tpNote, O, TP };
const js = 'window.LAB_DATA=' + JSON.stringify(out).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + ';\n';
fs.writeFileSync(outPath, js);
console.log(JSON.stringify({ orders: O.length, lines: lines.length, tp: TP.length, tpDate, tpCarried: !procRows.length, bytes: js.length }));
