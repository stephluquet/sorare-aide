// Contrôle des alignements de la ligne joueur : dans chaque liste visible, chaque élément (nom, match, forme,
// chances, barre, score, mention) doit partager le même bord gauche ou le même bord droit d'une ligne à l'autre ;
// en colonnes, le contenu doit commencer au même bord que son en-tête.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const dir = process.argv[2], fichier = process.argv[3] || 'sorare-aide.html';
const largeurs = (process.argv[4] || '320,390,1024,1280,1440,1920').split(',').map(Number);
const srv = http.createServer((q, r) => {
  const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
    r.end(/(sorare-aide|avant)\.html$/.test(f) ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' + d : d);
  });
}).listen(0, async () => {
  const b = await chromium.launch(); let defauts = 0, listes = 0; const out = [];
  for (const w of largeurs) for (const h of ['football/solo', 'football/squad', 'football/cartes', 'nba/solo', 'nba/squad', 'nba/cartes']) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${srv.address().port}/${fichier}#${h}`); await p.waitForTimeout(4200);
    if (h.endsWith('cartes')) { await p.evaluate(() => { const c = [...document.querySelectorAll('input[data-act="dispo"]')].find((e) => e.offsetParent && e.checked); if (c) c.click(); const t = [...document.querySelectorAll('[data-act="toutes-chances"],[data-act="toutes-minutes"]')].find((e) => e.offsetParent && e.getAttribute('aria-pressed') !== 'true'); if (t) t.click(); }); await p.waitForTimeout(1500); }
    const r = await p.evaluate(() => {
      const vis = (e) => e && e.offsetParent && e.getBoundingClientRect().width > 0; const R = (e) => e.getBoundingClientRect();
      const ELEMS = { nom: '.c-nom b', match: '.c-match .l1', forme: '.c-forme > :first-child', chances: '.c-p .pv, .c-min .pv', barre: '.c-p svg, .c-min svg', score: '.c-s > span:first-child', mention: '.c-s .sous, .c-s svg, .c-s .ppe' };
      const ENTETE = { nom: 1, match: 2, forme: 3, chances: 4, score: 5 };
      const res = [];
      for (const t of [...document.querySelectorAll('.tableau')].filter(vis)) {
        const L = [...t.querySelectorAll(':scope > .ligne, :scope .groupe-alt .ligne, :scope .ligne')].filter(vis); if (L.length < 2) continue;
        const colonnes = getComputedStyle(L[0]).gridTemplateColumns.split(' ').length >= 6;
        const tete = [...t.querySelectorAll('.entete-tab > *')].filter(vis);
        const pb = [];
        for (const [nom, sel] of Object.entries(ELEMS)) {
          const xs = L.map((l) => [...l.querySelectorAll(sel)].find(vis)).filter(Boolean).map(R); if (xs.length < 2) continue;
          const g = new Set(xs.map((x) => Math.round(x.left))), d = new Set(xs.map((x) => Math.round(x.right)));
          if (g.size > 1 && d.size > 1) pb.push(`${nom} : ${g.size} bords gauches (${[...g].sort((a, b2) => a - b2).slice(0, 4).join(', ')}), ${d.size} bords droits`);
          else if (colonnes && tete.length > ENTETE[nom] && g.size === 1) { const e = Math.round(R(tete[ENTETE[nom]]).left); if (Math.abs(e - [...g][0]) > 1) pb.push(`${nom} : décalé de ${[...g][0] - e} px par rapport à son en-tête`); }
        }
        res.push({ mode: colonnes ? 'colonnes' : 'empilée', n: L.length, larg: Math.round(R(t).width), pb });
      }
      return res;
    });
    for (const t of r) { listes++; if (t.pb.length) { defauts++; out.push(`${w} ${h} · ${t.mode} ${t.larg} px, ${t.n} lignes\n    ${t.pb.join('\n    ')}`); } }
    if (errs.length) out.push(`${w} ${h} : ${errs.length} erreurs JS`);
    await p.close();
  }
  console.log(out.join('\n') || 'aucun défaut'); console.log(`\n${listes} listes contrôlées, ${defauts} avec un défaut d'alignement`);
  await b.close(); srv.close();
});
