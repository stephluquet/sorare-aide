// Accès à l'API GraphQL de Sorare : lecture seule, débit plafonné, nouvelles tentatives.
//
// La clé API n'est jamais dans le code. Dans la session cloud, le proxy injecte
// l'en-tête APIKEY ; ailleurs (PC, CI), la mettre dans la variable SORARE_APIKEY.

const API_URL = 'https://api.sorare.com/graphql';

// Plafond : 150 requêtes par minute (l'API en autorise 200, et 150 pour les
// champs NBA). Écart minimal entre deux départs de requête, valable pour ce
// processus : ne pas lancer deux récupérations en parallèle.
const REQUETES_PAR_MINUTE = 150;
const ECART_MIN_MS = 60_000 / REQUETES_PAR_MINUTE;

let dernierDepart = -Infinity;
export const compteur = { requetes: 0 };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function attendreSonTour() {
  const attente = dernierDepart + ECART_MIN_MS - Date.now();
  if (attente > 0) await pause(attente);
  dernierDepart = Date.now();
}

export async function appelGraphql(query, variables = {}, { essais = 4 } = {}) {
  if (/^\s*mutation\b/.test(query)) throw new Error('Lecture seule : mutation refusée.');
  for (let essai = 1; ; essai++) {
    await attendreSonTour();
    compteur.requetes++;
    const rep = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        APIKEY: process.env.SORARE_APIKEY || 'injecte-par-le-proxy',
      },
      body: JSON.stringify({ query, variables }),
    });
    if ((rep.status === 429 || rep.status >= 500) && essai < essais) {
      await pause(2000 * 2 ** (essai - 1));
      continue;
    }
    if (!rep.ok) throw new Error(`API Sorare : HTTP ${rep.status}`);
    const json = await rep.json();
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join(' ; ');
      if (msg.includes('Using an APIKEY')) {
        throw new Error(`${msg}\nLa clé n'a pas été prise en compte : proxy non utilisé (NODE_USE_ENV_PROXY=1 ?) ou SORARE_APIKEY absente.`);
      }
      throw new Error(msg);
    }
    return json.data;
  }
}

// Le fetch de Node ignore HTTPS_PROXY sauf si NODE_USE_ENV_PROXY=1 : sans
// proxy, la connexion part en direct et la clé n'est pas injectée (vérifié le
// 2026-11-07). On se relance alors avec la variable positionnée.
export async function relancerViaProxySiBesoin() {
  if (!process.env.HTTPS_PROXY || process.env.NODE_USE_ENV_PROXY === '1') return;
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], {
    stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(r.status ?? 1);
}
