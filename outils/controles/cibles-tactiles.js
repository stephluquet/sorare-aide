// Cibles tactiles : commandes visibles de moins de 44 px de haut ou de large, par écran, à 390 et 320 px.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const dir = process.argv[2];
const srv = http.createServer((q, r) => {
  const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
    r.end(f.endsWith('sorare-aide.html') ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' + d : d);
  });
}).listen(0, async () => {
  const b = await chromium.launch(); const base = `http://localhost:${srv.address().port}/sorare-aide.html`;
  let total = 0;
  for (const w of [390, 320]) for (const h of ['accueil', 'football/solo', 'football/squad', 'football/cartes', 'nba/solo', 'nba/cartes']) {
    const p = await b.newPage({ viewport: { width: w, height: 844 }, hasTouch: true, isMobile: true }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${base}#${h}`); await p.waitForTimeout(4200);
    if (h.endsWith('solo')) { await p.evaluate(() => { const u = document.querySelector('[data-act="mode"][data-v="unique"]'); if (u) u.click(); }); await p.waitForTimeout(3500); await p.evaluate(() => { const u = document.querySelector('[data-act="mode"][data-v="plusieurs"]'); if (u) u.click(); }); await p.waitForTimeout(3000); }
    if (h.endsWith('cartes')) { await p.evaluate(() => { const d = [...document.querySelectorAll('details.filtres')].find((e) => e.offsetParent); if (d && !d.open) d.querySelector('summary').click(); }); await p.waitForTimeout(500); }
    const r = await p.evaluate(() => {
      const vis = (e) => e.offsetParent && e.getBoundingClientRect().width > 0;
      const petits = new Map();
      for (const e of [...document.querySelectorAll('button, a[href], select, summary, [role="button"], label.case')].filter(vis)) {
        if (e.closest('.ligne') && e.matches('.ligne *')) continue; // la ligne entière est la cible
        const x = e.getBoundingClientRect(); if (x.height >= 43.5 && x.width >= 43.5) continue;
        const cle = `${e.tagName.toLowerCase()}${e.dataset.act ? `[${e.dataset.act}]` : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''} « ${(e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 22)} » ${Math.round(x.width)} × ${Math.round(x.height)}`;
        const fam = cle.replace(/« .* »/, '').replace(/\d+ × /, '× ');
        if (!petits.has(fam)) petits.set(fam, { ex: cle, n: 0 }); petits.get(fam).n++;
      }
      const haut = document.getElementById('haut').getBoundingClientRect().height, bf = document.querySelector('#vue-cartes .barre-filtres');
      return { petits: [...petits.values()].map((v) => `${v.ex}${v.n > 1 ? ` (${v.n} fois)` : ''}`), haut: Math.round(haut), filtres: bf && bf.offsetParent ? Math.round(bf.getBoundingClientRect().height) : null, debord: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    total += r.petits.length;
    console.log(`${w} ${h} : barre haute ${r.haut} px${r.filtres ? `, filtres ouverts ${r.filtres} px` : ''}, débordement ${r.debord}, erreurs ${errs.length}${r.petits.length ? '\n    ' + r.petits.join('\n    ') : ' · aucune cible trop petite'}`);
    if (process.argv[3] && w === 390 && h === 'football/cartes') await p.screenshot({ path: path.join(__dirname, `c12-${process.argv[3]}.jpg`), quality: 70 });
    await p.close();
  }
  console.log(`\n${total} familles de cibles sous 44 px`);
  await b.close(); srv.close();
});
