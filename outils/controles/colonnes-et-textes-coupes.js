// Ligne joueur : mise en page (colonnes ou empilée) par écran et par largeur, et captures du Solo.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const dir = process.argv[2], nom = process.argv[3], largeurs = (process.argv[4] || '1360,1366,1399,1400,1440,1536,1600,1680,1799,1800,1879,1880,1920').split(',').map(Number);
const srv = http.createServer((q, r) => {
  const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
    r.end(f.endsWith('sorare-aide.html') ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' + d : d);
  });
}).listen(0, async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined }); const out = [];
  for (const w of largeurs) {
    const lignes = [];
    for (const h of ['football/solo', 'football/squad', 'football/cartes', 'nba/solo']) {
      const p = await b.newPage({ viewport: { width: w, height: w >= 1900 ? 1080 : 900 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(`http://localhost:${srv.address().port}/sorare-aide.html#${h}`); await p.waitForTimeout(3600);
      const r = await p.evaluate(() => {
        const vis = (e) => e.offsetParent; const R = (e) => e.getBoundingClientRect();
        const T = [...document.querySelectorAll('.tableau')].filter(vis); const t = T[0]; const L = [...t.querySelectorAll('.ligne')];
        const coupe = (e) => e && e.scrollWidth > e.clientWidth + 1;
        const colonnes = L.length && getComputedStyle(L[0]).gridTemplateColumns.split(' ').length >= 6;
        const croise = (a, b) => a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        const tous = [...document.querySelectorAll('.ligne')].filter(vis);
        const chev = tous.filter((l) => { const cells = [...l.children].filter((c) => R(c).width).map((c) => [...c.children].map(R).filter((x) => x.width)); for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (cells[i].some((a) => cells[j].some((b2) => croise(a, b2)))) return true; return false; }).length;
        const mc = tous.filter((l) => [...l.querySelectorAll('.c-match, .c-match .l1, .c-match .l2, .c-nom b')].some(coupe)).length;
        const g = document.querySelector('.solo-grille, .squad-grille, .cartes-grille'); const cols = g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;
        const fiche = [...document.querySelectorAll('.col-fiche')].some(vis);
        const hs = L.map((l) => R(l).height);
        return `${colonnes ? 'COLONNES' : 'empilée '} conteneur ${Math.round(R(t).width)} | ${cols} col.${fiche ? ' + fiche' : ''} | lignes ${Math.round(Math.min(...hs))}–${Math.round(Math.max(...hs))} px | 5e joueur à ${L[4] ? Math.round(R(L[4]).bottom) : '?'} px | coupés ${mc} | chevauch. ${chev} | page ${document.documentElement.scrollWidth - document.documentElement.clientWidth}`;
      });
      lignes.push(`  ${h.padEnd(15)} ${r}${errs.length ? ' | ERREURS ' + errs.length : ''}`);
      if (nom && (w === 1440 || w === 1920) && h === 'football/solo') await p.screenshot({ path: path.join(__dirname, `c10-${nom}-${w}.png`) });
      if (nom && w === 1440 && h === 'football/cartes') await p.screenshot({ path: path.join(__dirname, `c10-${nom}-cartes-${w}.png`) });
      await p.close();
    }
    out.push(`${w} px\n${lignes.join('\n')}`);
  }
  console.log(out.join('\n')); await b.close(); srv.close();
});
