// Solo et Squad sur PC : captures d'écran avant / après, et après un clic sur un joueur.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const dir = process.argv[2];
const srv = http.createServer((q, r) => { fs.readFile(path.join(dir, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': q.url.includes('.json') ? 'application/json' : 'text/html; charset=utf-8' }); r.end(/\.html/.test(q.url) ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' + d : d); }); }).listen(0, async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
  const pomper = async (p, n = 16) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await new Promise((r) => setTimeout(r, 150)); } };
  for (const v of ['avant', 'sorare-aide']) for (const [w, vue] of [[1600, 'football/solo'], [1600, 'nba/squad'], [1280, 'football/solo'], [1920, 'football/solo'], [1024, 'nba/solo']]) {
    const p = await b.newPage({ viewport: { width: w, height: 950 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.clock.install({ time: new Date('2026-11-14T18:00:00Z') }); await p.goto(`http://localhost:${srv.address().port}/${v}.html#${vue}`); await pomper(p);
    const nom = `pc-${v === 'avant' ? 'avant' : 'apres'}-${vue.replace('/', '-')}-${w}`;
    await p.screenshot({ path: path.join(__dirname, nom + '.png') });
    const ecran = vue.split('/')[1];
    await p.evaluate((ecran) => { const l = document.querySelectorAll(`#vue-${ecran} .tableau .ligne`)[3]; l.click(); }, ecran); await pomper(p, 6);
    await p.screenshot({ path: path.join(__dirname, nom + '-clic.png') });
    const m = await p.evaluate((ecran) => { const c = document.querySelector(`#vue-${ecran} .col-droite`), f = document.querySelector(`#vue-${ecran} #col-fiche`), v = document.getElementById('volet'); const R = (x) => x.getBoundingClientRect();
      return { onglet: c ? c.dataset.onglet + '/' + getComputedStyle(c).display : '-', ficheColonne: f && R(f).width > 0 ? Math.round(R(f).width) + ' px, ' + ((f.querySelector('h2') || {}).textContent || 'vide') : 'non', volet: v && !v.hidden ? 'ouvert' : 'fermé', rangee: [...document.querySelectorAll('#rangee-solo button')].map((x) => x.innerText.replace(/\s+/g, ' ')).join(' | '), colonnes: getComputedStyle(document.querySelector(`#vue-${ecran} .solo-grille`)).gridTemplateColumns }; }, ecran);
    console.log(nom, JSON.stringify(m), 'erreurs', errs.length, errs[0] || '', 'débordement', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    await p.close(); }
  await b.close(); srv.close(); });
