const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const dir = process.argv[2];
const srv = http.createServer((q, r) => { fs.readFile(path.join(dir, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' + d); }); }).listen(0, async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 760 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-14T18:00:00Z') }); await p.goto(`http://localhost:${srv.address().port}/sorare-aide.html#football/solo`);
  const pomper = async (n = 16) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await new Promise((r) => setTimeout(r, 150)); } };
  const rangee = () => p.evaluate(() => [...document.querySelectorAll('#rangee-solo button')].map((x) => x.innerText.replace(/\s+/g, ' ') + (x.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' | '));
  await pomper(); console.log('ouverture :', await rangee());
  await p.click('#rangee-solo [data-v="unique"]'); await pomper(); console.log('créneau unique :', await rangee(), '| carte :', await p.evaluate(() => (document.querySelector('#creneau-detail h2') || {}).textContent));
  await p.click('#rangee-solo [data-v="prudente"]'); await pomper(); console.log('retour :', await rangee(), '| tuiles :', await p.evaluate(() => document.querySelectorAll('.tuiles.trois .tuile').length));
  console.log('erreurs', errs.length, errs[0] || '', 'débordement', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  await b.close(); srv.close(); });
