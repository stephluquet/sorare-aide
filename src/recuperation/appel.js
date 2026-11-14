// Appel de l'API GraphQL de Sorare, commun à Node et au navigateur : lecture seule, débit plafonné,
// nouvelles tentatives. Aucun accès disque, aucune variable d'environnement : l'adresse et les
// en-têtes sont fournis par l'appelant (Node : API directe + clé ; navigateur : relais + clé de
// l'utilisateur, voir docs/version-independante-cloudflare.md).

// Plafond : 150 requêtes par minute (l'API en autorise 200, et 150 pour les champs NBA).
export const REQUETES_PAR_MINUTE = 150;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Vrai si le document GraphQL contient une opération d'écriture (mutation ou abonnement).
export const estEcriture = (query) => /\b(mutation|subscription)\b/i.test(String(query));

/**
 * @param url     adresse du point d'accès GraphQL
 * @param entetes en-têtes ajoutés (ex. { APIKEY: … } ou { 'X-Sorare-Cle': … })
 * @returns appel(query, variables) → data ; appel.compteur.requetes
 */
export function creerAppel({ url, entetes = {}, essais = 4, parMinute = REQUETES_PAR_MINUTE, signal } = {}) {
  const ecart = 60_000 / parMinute;
  let dernierDepart = -Infinity;
  const compteur = { requetes: 0 };
  async function appel(query, variables = {}) {
    if (estEcriture(query)) throw new Error('Lecture seule : mutation refusée.');
    for (let essai = 1; ; essai++) {
      const attente = dernierDepart + ecart - Date.now();
      if (attente > 0) await pause(attente);
      if (signal?.aborted) throw new Error('Récupération interrompue.');
      dernierDepart = Date.now();
      compteur.requetes++;
      let rep;
      try {
        rep = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...entetes }, body: JSON.stringify({ query, variables }), signal });
      } catch (e) {
        if (essai < essais && !signal?.aborted) { await pause(2000 * 2 ** (essai - 1)); continue; }
        throw new Error(`Réseau : ${e.message}`);
      }
      if ((rep.status === 429 || rep.status >= 500) && essai < essais) { await pause(2000 * 2 ** (essai - 1)); continue; }
      if (!rep.ok) {
        const texte = await rep.text().catch(() => '');
        const err = new Error(`API Sorare : HTTP ${rep.status}${texte && texte.length < 200 ? ` (${texte})` : ''}`);
        err.status = rep.status;
        throw err;
      }
      const json = await rep.json();
      if (json.errors?.length) {
        const err = new Error(json.errors.map((e) => e.message).join(' ; '));
        err.codes = json.errors.map((e) => e.extensions?.code).filter(Boolean);
        throw err;
      }
      return json.data;
    }
  }
  appel.compteur = compteur;
  return appel;
}
