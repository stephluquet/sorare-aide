const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const dir = process.argv[2];
const srv = http.createServer((q, r) => { fs.readFile(path.join(dir, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': q.url.includes('.json') ? 'application/json' : 'text/html; charset=utf-8' }); r.end(/\.html/.test(q.url) ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' + d : d); }); }).listen(0, async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
  for (const [w, h] of [[1440, 900], [390, 760]]) { const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const pomper = async (n = 8) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await new Promise((r) => setTimeout(r, 150)); } };
    const etat = () => p.evaluate(() => document.getElementById('compte-cartes').textContent + ' | ouvert : ' + [...document.querySelectorAll('details.menu[open]')].map((m) => m.dataset.menu).join() + ' | ' + [...document.querySelectorAll('details.menu summary')].map((x) => x.innerText.replace(/\s+/g, ' ')).join(' / ') + ' | 1re : ' + (document.querySelector('#vue-cartes .ligne .c-nom b') || {}).textContent);
    await p.clock.install({ time: new Date('2026-11-14T18:00:00Z') }); await p.goto(`http://localhost:${srv.address().port}/sorare-aide.html#football/cartes`); await pomper(18);
    await p.screenshot({ path: path.join(__dirname, `menus-${w}-0.png`) });
    await p.click('details.menu[data-menu="filtres"] summary'); await pomper(2); await p.screenshot({ path: path.join(__dirname, `menus-${w}-filtres.png`) });
    await p.click('details.menu[data-menu="filtres"] [data-act="seuil"][data-v="0.7"]'); await pomper(); console.log(w, 'seuil 70 % →', await etat());
    await p.keyboard.press('Escape'); await pomper(2);
    await p.click('details.menu[data-menu="tri"] summary'); await pomper(2); await p.screenshot({ path: path.join(__dirname, `menus-${w}-tri.png`) }); console.log(w, 'ouvre Tri →', await etat());
    await p.click('details.menu[data-menu="tri"] [data-v="d"]'); await pomper(); console.log(w, 'tri coup d’envoi →', await etat());
    await p.click('details.menu[data-menu="filtres"] summary'); await pomper(2); await p.keyboard.press('Escape'); await pomper(2); console.log(w, 'Échap →', await etat());
    console.log(w, 'barre', await p.evaluate(() => Math.round(document.querySelector('.barre-filtres').getBoundingClientRect().height)), 'px | erreurs', errs.length, errs[0] || '', '| débordement', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    await p.close(); }
  await b.close(); srv.close(); });
