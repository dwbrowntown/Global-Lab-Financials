#!/usr/bin/env node
/* Harness for the Global Lab Budget Tracker.
   Usage: NODE_PATH=<folder with jsdom> node tools/harness.js <dist dir> <raw orders.json>
   Loads dist/index.html with settings.js and data.js inlined, checks that every view reconciles, then mocks the
   in-page Snowflake connector with two result envelopes and checks a live refresh. Last line: errors: [] */
'use strict';
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const [dist, rawOrders] = process.argv.slice(2);
const errors = [], facts = {};
const ok = (cond, msg) => { if (!cond) errors.push(msg); };
const near = (a, b) => Math.abs(a - b) < 0.01;

function load(withClaude) {
  let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  for (const f of ['settings.js', 'data.js']) html = html.replace(`<script src="${f}"></script>`, () => '<script>' + fs.readFileSync(path.join(dist, f), 'utf8') + '</script>');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('page error: ' + (e.message || e)));
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + html + '</body></html>', {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://example.test/',
    beforeParse(w) {
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      if (withClaude) w.claude = withClaude;
    }
  });
  return dom.window;
}
const money = t => { const m = String(t).replace(/[^\d.\-−]/g, '').replace('−', '-'); return +m; };
const click = (w, sel) => { const el = w.document.querySelector(sel); if (!el) { errors.push('missing ' + sel); return; } el.click(); };

(async () => {
  const w = load(null);
  const q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const ev = expr => w.eval(expr);

  facts.currentQuarter = ev('D.CURQ');
  facts.orders = ev('D.orders.length');
  facts.tpLines = ev('D.tp.length');
  ok(facts.currentQuarter === 'FY27Q2', 'current quarter is ' + facts.currentQuarter);

  // 1. order recon in every timing view and quarter, Count = orders only so envelopes are orders
  for (const mode of ['budget', 'gl']) {
    click(w, '#m-' + mode);
    for (const qq of ev('D.QUARTERS')) {
      ev(`drill('${qq}','','all')`);
      const r = q('#recon').textContent;
      if (ev(`D.orders.some(o=>touches(o,'${qq}'))`)) ok(r.includes('✓'), `${mode} ${qq} order recon failed: ${r.slice(0, 120)}`);
    }
  }
  // conservation: total order dollars across quarters are the same in budget and GL timing
  // (per order, not via envelope(): FY25 quarters show stored summary totals instead of order data)
  const tot = m => ev(`(()=>{S.mode='${m}';return D.orders.reduce((s,o)=>s+[...new Set([o.rq,...o.lines.map(l=>l.lq)])].reduce((t,q)=>t+amtIn(o,q),0),0);})()`);
  const tb = tot('budget'), tg = tot('gl');
  ok(near(tb, tg), `budget ${tb} vs GL ${tg} totals differ`);
  facts.orderDollarsAllQuarters = Math.round(tb);
  ev("S.mode='budget'");
  // GL timing moves dollars between quarters for orders that ship across a quarter end
  facts.ordersSpanningQuarters = ev('D.orders.filter(o=>new Set(o.lines.map(l=>l.lq)).size>1).length');

  // 2. Count toggle and envelopes for the current quarter
  click(w, '#m-budget'); ev(`drill('FY27Q2','','all')`);
  const env = () => ev(`(()=>{const a=envelope('FY27Q2','CapEx'),b=envelope('FY27Q2','OpEx');return {capex:a,opex:b};})()`);
  click(w, '#c-none'); const e0 = env();
  click(w, '#c-capex'); const e1 = env();
  click(w, '#c-all'); const e2 = env();
  ok(e0.capex.tp === 0 && e0.opex.tp === 0, 'Orders-only view still counts third-party');
  ok(e1.capex.tp > 0 && e1.opex.tp === 0, '+3P CapEx view should add CapEx third-party only');
  ok(e2.opex.tp >= e1.opex.tp, '+all 3P should add OpEx third-party');
  ok(near(e0.capex.ord, e1.capex.ord), 'order part changes with Count');
  facts.FY27Q2 = { capexOrders: Math.round(e1.capex.ord), capex3P: Math.round(e1.capex.tp), capexTotal: Math.round(e1.capex.tot), opexOrders: Math.round(e1.opex.ord), opex3PifAll: Math.round(e2.opex.tp) };
  click(w, '#c-capex');
  // envelope card shows the same total
  const card = qa('#envelopes article')[0];
  ok(card && money(card.querySelector('.big .v').textContent) === Math.round(e1.capex.tot), 'CapEx card total does not match envelope');
  facts.capexCardText = card && card.querySelector('.env-h').textContent.replace(/\s+/g, ' ').trim();

  // 3. department table sums to the envelopes (orders + counted third-party)
  for (const mode of ['budget', 'gl']) {
    click(w, '#m-' + mode);
    const foot = qa('#dtable tfoot td').map(td => td.textContent);
    const committed = money(foot[foot.length - 3]);
    const e = env();
    ok(Math.abs(committed - Math.round(e.capex.tot + e.opex.tot)) <= 1, `${mode} dept total ${committed} vs envelopes ${e.capex.tot + e.opex.tot}`);
  }
  click(w, '#m-budget');

  // 4. projects: Chennai grouped as one project
  const prjRows = qa('#prjtable tbody tr.g').map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
  const chennai = prjRows.find(t => t.includes('7000400'));
  ok(!!chennai, 'no 7000400 project row');
  facts.chennaiRow = chennai;
  ok(chennai && chennai.includes('Meets'), 'Chennai project should meet the asset test');
  const g = ev("projectGroups().find(g=>g.p==='7000400')");
  facts.chennai = { orders: g.orders.length, tpLines: g.tp.length, tpReqs: [...new Set(g.tp.map(t => t.r))].sort(), capex: Math.round(g.capex), possibleMembers: g.maybe.length };
  ok(g.orders.filter(o => o.proj === '7000400').length === 82, 'Chennai should hold 82 coded orders');
  ok(g.orders.length === 85, 'Chennai should hold 82 coded + 3 reclassed orders, has ' + g.orders.length);
  ok(!g.tp.some(t => t.r === 'PRIN10000235'), 'held requisition counted in project');
  // expand and collapse a project row
  click(w, '#prjtable tbody tr.g'); ok(qa('#prjtable tr.detail').length === 1, 'project row did not expand');

  // 5. watch list facts
  const watch = qa('#watch .w h3').map(h => h.textContent);
  facts.watch = watch;
  for (const must of ['Third-party data is older', 'Requisitions on hold', 'Account code to correct', 'Third-party CapEx in FY27 Q2', 'CapEx orders under', 'Contracts coming up for renewal', 'waiting on your call', 'outside your budget', 'Reclasses you approved', 'Orders left out'])
    ok(watch.some(t => t.includes(must)), 'watch list missing: ' + must);
  ok(!watch.some(t => t.includes('out of date')), 'fresh snapshot flagged as stale');

  // 6. third-party section and contracts
  const tpRows = qa('#tptable tbody tr').length;
  facts.tpRowsFY27Q2 = tpRows;
  ok(tpRows > 0, 'no third-party rows in FY27 Q2');
  ok(q('#tp-sub').textContent.includes('carried'), 'third-party age note missing');
  facts.contracts = qa('#cttable tbody tr').map(tr => [...tr.cells].map(c => c.textContent.trim()).filter((_, i) => [1, 4, 5, 9].includes(i)).join(' | '));
  ok(facts.contracts.length === 12, 'contract rows ' + facts.contracts.length);

  // 6b. build 3 rules (Dan, Nov 13)
  click(w, '#m-budget'); click(w, '#c-all');
  const r3 = ev(`(()=>{const m=v=>Math.round(v);
    const cr=D.orders.filter(o=>o.status==='credit');
    const viavi=D.tp.filter(t=>t.r==='PRUS10002240');
    const maint=D.tp.filter(t=>t.kind==='maint');
    return {
      creditsInClosedQuarter: cr.filter(o=>qKey(o.rq)<qKey(D.CURQ)&&o.nOpen>0).map(o=>o.so),
      fy27q1CapexForecast: m(envelope('FY27Q1','CapEx').fc),
      excluded55170: D.orders.some(o=>o.so==='55170')?'still counted':'excluded',
      overrides: D.orders.filter(o=>o.ov&&o.ov.cat).map(o=>o.so+':'+o.cat),
      viaviCounted: viavi.some(t=>tpCounts(t)),
      maintCapex: maint.filter(t=>t.cat!=='OpEx').length,
      notMineCounted: D.tp.filter(t=>t.owner==='notMine'&&tpCounts(t)).length,
      checkCounted: D.tp.filter(t=>t.owner==='check'&&tpCounts(t)).length,
      owners: D.tp.reduce((a,t)=>(a[t.owner]=(a[t.owner]||0)+1,a),{}),
      maintSpreadKeysight: D.tp.filter(t=>t.r==='PRUS10000003').flatMap(t=>t.sb.map(s=>s.q)).filter((v,i,a)=>a.indexOf(v)===i),
      chennaiQ: Object.fromEntries(['PRIN10000209','PRIN10000210','PRIN10000213'].map(r=>[r,D.tp.find(t=>t.r===r).sb.map(s=>s.q+':'+m(s.usd)).join(' ')])),
      env: Object.fromEntries(['FY27Q1','FY27Q2','FY27Q3','FY27Q4'].map(q=>[q,{capex:m(envelope(q,'CapEx').tot),opex:m(envelope(q,'OpEx').tot)}]))
    };})()`);
  facts.build3 = r3;
  ok(r3.creditsInClosedQuarter.length === 0, 'unreceived credits still in a closed quarter');
  ok(r3.fy27q1CapexForecast === 0, 'closed FY27 Q1 still carries forecast');
  ok(r3.excluded55170 === 'excluded', 'SO 55170 not excluded');
  ok(!r3.viaviCounted, 'rejected PRUS10002240 is counted');
  ok(r3.maintCapex === 0, 'maintenance left in CapEx');
  ok(r3.notMineCounted === 0 && r3.checkCounted === 0, 'third-party not marked yours is counted');
  ok(r3.maintSpreadKeysight.length > 1, 'Keysight maintenance not spread');

  // 7. search still works across quarters
  const fq = q('#f-q'); fq.value = '5520-48T'; fq.dispatchEvent(new w.Event('input'));
  facts.search5520 = q('#f-count').textContent;
  ok(/matches/.test(facts.search5520), 'search did not run');
  fq.value = ''; fq.dispatchEvent(new w.Event('input'));

  // 8. no em dashes or emoji in visible text
  const txt = w.document.body.textContent;
  ok(!/—/.test(txt), 'em dash in page text');

  // 9. live refresh with two connector envelopes; procurement empty keeps the carried rows
  const raw = JSON.parse(fs.readFileSync(rawOrders, 'utf8'));
  const empty = { result_set: { data: [], resultSetMetaData: { rowType: raw.result_set.resultSetMetaData.rowType.slice(0, 1) } } };
  const shapes = {
    content: (sql) => ({ content: [{ type: 'text', text: JSON.stringify(/EDNA_PROCUREMENT/.test(sql) ? empty : raw) }] }),
    bare: (sql) => JSON.stringify(/EDNA_PROCUREMENT/.test(sql) ? empty : raw)
  };
  for (const [name, fn] of Object.entries(shapes)) {
    const mcp = { callTool: async (server, tool, args) => ({ payload: fn(args.sql) }) };
    const w2 = load({ use: async () => mcp });
    await w2.eval('refresh()');
    const st = w2.document.querySelector('#fresh-t').textContent;
    ok(/Live/.test(st), `${name} envelope: refresh did not go live: ${st}`);
    ok(w2.eval('D.orders.length') === facts.orders, `${name} envelope: order count changed`);
    ok(w2.eval('D.tp.length') === facts.tpLines && /carried/.test(st), `${name} envelope: empty procurement should keep carried rows`);
    facts['live_' + name] = st;
  }
  // unreadable answer shows an excerpt
  const w3 = load({ use: async () => ({ callTool: async () => ({ payload: { nothing: 'here' } }) }) });
  await w3.eval('refresh()');
  facts.unreadable = w3.document.querySelector('#fresh-t').textContent;
  ok(/could not read/.test(facts.unreadable), 'unreadable answer not reported');

  console.log(JSON.stringify(facts, null, 1));
  console.log('errors: ' + JSON.stringify(errors));
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.log('errors: ' + JSON.stringify([...errors, 'harness crash: ' + (e.stack || e)])); process.exit(1); });
