// Captures de la carte de proposition du Solo : node capt.js <dossier> <fichier> <prefixe>
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const dir = process.argv[2], fichier = process.argv[3], prefixe = process.argv[4];
const srv = http.createServer((q, r) => { const f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }); r.end(/\.html$/.test(f) ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' + d : d); }); }).listen(0, async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
  for (const [w, h] of [[390, 844], [320, 700], [1440, 1000], [1023, 900]]) for (const sport of ['football', 'nba']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.clock.install({ time: new Date('2026-11-14T18:00:00Z') });
    await p.goto(`http://localhost:${srv.address().port}/${fichier}#${sport}/solo`);
    for (let i = 0; i < 16; i++) { await p.clock.runFor(500); await new Promise((r) => setTimeout(r, 150)); }
    await p.addStyleTag({ content: '#haut, #bas, #toast { visibility: hidden !important; }' });
    const el = await p.$('#vue-solo .proposition');
    const f = path.join(__dirname, `${prefixe}-${sport}-${w}.png`); await el.screenshot({ path: f });
    if (w === 390) { await p.evaluate(() => scrollTo(0, 0)); await p.addStyleTag({ content: '#haut, #bas { visibility: visible !important; }' }); await p.screenshot({ path: path.join(__dirname, `${prefixe}-ecran-${sport}.png`) }); }
    const m = await p.evaluate(() => { const R = (x) => x.getBoundingClientRect(); const pr = document.querySelector('#vue-solo .proposition'); const t = pr.querySelector('.tableau'), bt = pr.querySelector('[data-act="jouer"]');
      const coupes = [...pr.querySelectorAll('.kpi .v, .kpi .libelle, .kpi .s')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent.slice(0, 30));
      return { hauteur: Math.round(R(pr).height), equipeA: Math.round(R(t).top - R(pr).top), boutonA: Math.round(R(bt).top - R(pr).top), tuiles: [...pr.querySelectorAll('.tuiles.trois .tuile')].map((x) => Math.round(R(x).width) + '×' + Math.round(R(x).height)).join(' '), coupes }; });
    console.log(prefixe, w, sport, JSON.stringify(m), 'md5', crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex').slice(0, 8), 'erreurs', errs.length, errs[0] || '', 'débordement', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    await ctx.close();
  }
  await b.close(); srv.close();
});
