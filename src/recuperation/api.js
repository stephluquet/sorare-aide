// Accès à l'API GraphQL de Sorare côté Node : lecture seule, débit plafonné, nouvelles tentatives
// (mécanique commune dans appel.js).
//
// La clé API n'est jamais dans le code. Dans la session cloud, le proxy injecte
// l'en-tête APIKEY ; ailleurs (PC, CI), la mettre dans la variable SORARE_APIKEY.
// Ne pas lancer deux récupérations en parallèle : le plafond vaut pour ce processus.
import { creerAppel } from './appel.js';

const appel = creerAppel({
  url: 'https://api.sorare.com/graphql',
  entetes: { APIKEY: process.env.SORARE_APIKEY || 'injecte-par-le-proxy' },
});
export const compteur = appel.compteur;

export async function appelGraphql(query, variables = {}) {
  try {
    return await appel(query, variables);
  } catch (e) {
    if (e.message.includes('Using an APIKEY')) {
      throw new Error(`${e.message}\nLa clé n'a pas été prise en compte : proxy non utilisé (NODE_USE_ENV_PROXY=1 ?) ou SORARE_APIKEY absente.`);
    }
    throw e;
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
