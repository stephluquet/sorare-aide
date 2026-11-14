// Serveur local de la version web : sert sorties/web/ et relaie POST /graphql vers Sorare
// (functions/graphql.js, le même relais que sur Cloudflare). Pour l'utiliser sur son PC, sans hébergement.
// Usage : npm run web && npm run serveur-web   → http://localhost:8787
//   --port N         autre port
//   --reseau         écoute aussi sur le réseau local (pour un téléphone sur le même Wi-Fi) : ATTENTION,
//                    en http simple, la clé circule alors en clair sur ce réseau.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayer } from '../functions/graphql.js';
import { relancerViaProxySiBesoin } from '../src/recuperation/api.js';

await relancerViaProxySiBesoin(); // session cloud : le fetch de Node doit passer par le proxy
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'sorties', 'web');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 8787;
const hote = args.includes('--reseau') ? '0.0.0.0' : '127.0.0.1';
if (!existsSync(join(RACINE, 'index.html'))) { console.error('sorties/web/ absent : lance d’abord « npm run web ».'); process.exit(1); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css' };
const entetes = Object.fromEntries(readFileSync(join(RACINE, '_headers'), 'utf8').split('\n').slice(1).filter(Boolean).map((l) => {
  const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/graphql') {
      const morceaux = [];
      for await (const m of req) morceaux.push(m);
      const request = new Request(url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(morceaux) : undefined });
      const r = await relayer(request);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let chemin = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (chemin.endsWith('/')) chemin += 'index.html';
    const f = join(RACINE, chemin);
    if (!f.startsWith(RACINE) || !existsSync(f) || !statSync(f).isFile() || f.endsWith('_headers')) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, { ...entetes, 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(readFileSync(f));
  } catch (e) {
    res.writeHead(500); res.end(`Erreur : ${e.message}`);
  }
}).listen(port, hote, () => console.error(`Sorare aide : http://localhost:${port} (relais /graphql en lecture seule)${hote === '0.0.0.0' ? ' — ouvert sur le réseau local' : ''}`));
