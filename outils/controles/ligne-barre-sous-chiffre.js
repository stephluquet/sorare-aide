// Captures de l'équipe du Solo (et des autres choix) sur téléphone et sur PC, pour un fichier donné. Barres collantes masquées.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const dir = process.argv[2], fichier = process.argv[3], prefixe = process.argv[4];
const srv = http.createServer((q, r) => { const f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }); r.end(/\.html$/.test(f) ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' + d : d); }); }).listen(0, async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
  for (const [w, h] of [[390, 844], [320, 700], [1440, 1000]]) for (const sport of ['football', 'nba']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.clock.install({ time: new Date('2026-11-14T18:00:00Z') });
    await p.goto(`http://localhost:${srv.address().port}/${fichier}#${sport}/solo`);
    for (let i = 0; i < 16; i++) { await p.clock.runFor(500); await new Promise((r) => setTimeout(r, 150)); }
    await p.addStyleTag({ content: '#haut, #bas, #toast { visibility: hidden !important; }' });
    const eq = await p.$('#vue-solo .solo-grille .tableau'); await eq.screenshot({ path: path.join(__dirname, `${prefixe}-equipe-${sport}-${w}.png`) });
    const m = await eq.evaluate((e) => { const R = (x) => x.getBoundingClientRect(); const L = [...e.querySelectorAll('.ligne')]; const hs = L.map((l) => Math.round(R(l).height));
      const ecarts = L.map((l) => { const sc = l.querySelector('.c-s .sc'), bs = l.querySelector('.c-s svg'), pv = l.querySelector('.c-p .pv'), bp = l.querySelector('.c-p svg'); const col = getComputedStyle(l).gridTemplateColumns.split(' ').length >= 6;
        return [sc && bs ? Math.round(R(bs).left - R(sc).left) : null, pv && bp ? Math.round(col ? R(bp).left - R(pv).left : R(bp).right - R(pv).right) : null].join(','); });
      return { total: Math.round(R(e).height), lignes: hs.join('/'), ecartsBarreChiffre: [...new Set(ecarts)].join(' | ') }; });
    if (w !== 320 && sport === 'football') { const a = await p.$('#vue-solo #autres-choix .tableau'); if (a) await a.screenshot({ path: path.join(__dirname, `${prefixe}-autres-${w}.png`) }); const q = await p.$('#vue-solo .empilee'); if (q) { const bx = await q.evaluateHandle((e) => e.parentElement.parentElement); await bx.asElement().screenshot({ path: path.join(__dirname, `${prefixe}-quiporte-${w}.png`) }); } }
    console.log(prefixe, w, sport, JSON.stringify(m), 'erreurs', errs.length, 'débordement', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    await ctx.close();
  }
  await b.close(); srv.close();
});
