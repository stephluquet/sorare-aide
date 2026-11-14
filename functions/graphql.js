// Relais en lecture seule vers l'API GraphQL de Sorare (docs/version-independante-cloudflare.md).
// Le navigateur ne peut pas appeler api.sorare.com directement (CORS réservé à sorare.com) : la page
// envoie ses requêtes ici, sur sa propre adresse, avec la clé de l'utilisateur dans X-Sorare-Cle.
// Cloudflare Pages en fait la route POST /graphql ; outils/serveur-web.js l'utilise en local.
// La clé n'est ni gardée ni journalisée. Toute écriture (mutation, abonnement) est refusée ici,
// quoi que fasse la page : l'outil ne fait que lire.

export const SORARE = 'https://api.sorare.com/graphql';
export const ENTETE_CLE = 'X-Sorare-Cle';
const TAILLE_MAX = 20_000;

const refus = (status, message) => new Response(JSON.stringify({ errors: [{ message, extensions: { code: 'RELAIS' } }] }),
  { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function relayer(request, { fetch: envoyer = fetch } = {}) {
  if (request.method !== 'POST') return refus(405, 'POST seulement');
  // Seulement depuis notre propre page (un navigateur envoie toujours Origin sur un POST).
  if (request.headers.get('Origin') !== new URL(request.url).origin) return refus(403, 'Origine refusée');
  const cle = request.headers.get(ENTETE_CLE);
  if (!cle || cle.length > 200) return refus(401, 'Clé API Sorare manquante');
  const corps = await request.text();
  if (corps.length > TAILLE_MAX) return refus(413, 'Requête trop longue');
  let requete;
  try { requete = JSON.parse(corps).query; } catch { return refus(400, 'JSON invalide'); }
  if (typeof requete !== 'string' || /\b(mutation|subscription)\b/i.test(requete)) return refus(403, 'Lecture seule : mutation refusée');
  const rep = await envoyer(SORARE, { method: 'POST', headers: { 'content-type': 'application/json', APIKEY: cle }, body: corps });
  return new Response(rep.body, { status: rep.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

// Cloudflare Pages Functions : POST /graphql
export const onRequestPost = ({ request }) => relayer(request);
