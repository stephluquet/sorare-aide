// Mesures : police et position des chiffres et des barres dans chaque liste de joueurs (colonnes et empilée).
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const dir = process.argv[2];
const srv = http.createServer((q, r) => { fs.readFile(path.join(dir, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': q.url.includes('.json') ? 'application/json' : 'text/html; charset=utf-8' }); r.end(/\.html/.test(q.url) ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' + d : d); }); }).listen(0, async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
  for (const w of [1440, 1920, 390]) for (const vue of ['football/cartes', 'nba/cartes', 'football/solo', 'nba/solo', 'football/squad', 'nba/squad']) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.clock.install({ time: new Date('2026-11-14T18:00:00Z') }); await p.goto(`http://localhost:${srv.address().port}/sorare-aide.html#${vue}`);
    for (let i = 0; i < 18; i++) { await p.clock.runFor(500); await new Promise((r) => setTimeout(r, 150)); }
    if (process.argv[3] && w !== 390) await p.screenshot({ path: path.join(__dirname, `${process.argv[3]}-${vue.replace('/', '-')}-${w}.png`) });
    const m = await p.evaluate((ecran) => { const R = (x) => x.getBoundingClientRect(); const out = new Map();
      for (const l of document.querySelectorAll(`#vue-${ecran} .ligne`)) { if (!R(l).width) continue; const pv = l.querySelector('.c-p .pv'), sv = l.querySelector('.c-s .sv'), bp = l.querySelector('.c-p > svg'), bs = l.querySelector('.c-s > svg'); if (!pv || !sv) continue;
        const col = getComputedStyle(l).gridTemplateColumns.split(' ').length;
        const cs = (x) => getComputedStyle(x); const k = [col + ' col', 'police ' + cs(pv).fontSize + '/' + cs(pv).fontWeight + ' vs ' + cs(sv).fontSize + '/' + cs(sv).fontWeight, 'chiffres Δy ' + Math.round(R(pv).top - R(sv).top), bp && bs ? 'barres Δcentre ' + Math.round((R(bp).top + R(bp).height / 2) - (R(bs).top + R(bs).height / 2)) + ' h ' + R(bp).height + '/' + R(bs).height : 'barre absente'].join(' ; ');
        out.set(k, (out.get(k) || 0) + 1); }
      return [...out.entries()].map(([k, n]) => `${n}× ${k}`).join('  ||  '); }, vue.split('/')[1]);
    console.log(w, vue, '→', m, '| erreurs', errs.length, errs[0] || '', '| débordement', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    await p.close(); }
  await b.close(); srv.close(); });
