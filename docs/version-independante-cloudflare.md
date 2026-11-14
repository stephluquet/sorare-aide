# Version indépendante : hébergement sur Cloudflare (proposition, 2026-11-08)

> Statut (2026-11-14) : **codé et essayé en local** (`npm run web`, `npm run serveur-web`). Pas encore mis en ligne.
> Fichiers : `web/web.js` (paramètres, initialisation, stockage, sauvegarde), `functions/graphql.js` (relais),
> `src/recuperation/coeur.js`, `appel.js`, `fusion.js` (récupération commune à Node et au navigateur),
> `src/app-donnees.js` (données de l'interface), `outils/construire-web.js`, `outils/serveur-web.js`.
> Ce qui est vérifié porte une date ; ce qui ne l'est pas est marqué « à vérifier ».

## 1. Le besoin

Une appli qui se passe de Claude, que l'on peut **partager facilement** :

- une **page de paramètres** : chacun saisit **sa** clé API Sorare et son nom de manager ; ils restent dans son navigateur ;
- une **étape d'initialisation** qui charge ses cartes et l'historique de ses joueurs ;
- ensuite, la même appli qu'aujourd'hui (Solo, Squad, Mes cartes, football et NBA), en HTML et JavaScript.

## 2. Pourquoi il faut un relais

L'API Sorare **refuse les appels venant d'un navigateur sur un autre site que sorare.com** (vérifié le 2026-11-07 : la
pré-requête CORS ne renvoie l'autorisation que pour `https://sorare.com`). Une page posée sur n'importe quel hébergement
de pages fixes (GitHub Pages, GitLab Pages, Cloudflare Pages…) ne peut donc pas interroger Sorare elle-même.

La règle ne vaut que pour les navigateurs : un **serveur** peut appeler l'API sans restriction. Il suffit d'un tout petit
programme côté serveur, le **relais**, qui reçoit la requête de la page et la transmet à Sorare. Cloudflare permet
d'héberger la page **et** ce relais au même endroit, gratuitement, sans serveur à administrer.

## 3. L'architecture

```
 Navigateur (iPhone, PC)                       Cloudflare Pages (gratuit)                 Sorare
┌───────────────────────────────┐           ┌──────────────────────────────┐        ┌──────────────────┐
│ Page de l'appli (HTML + JS)   │  GET /    │ fichiers fixes : la page,    │        │                  │
│  · Paramètres : clé, manager  │ ────────► │ le moteur, regles/, méthode  │        │                  │
│  · Initialisation (barre)     │           │                              │        │                  │
│  · Moteur (déjà en JS pur)    │ POST      │ relais : functions/graphql.js│  POST  │ api.sorare.com   │
│  · Stockage local (IndexedDB) │ /graphql  │  · lecture seule             │ ─────► │   /graphql       │
│                               │ ────────► │  · clé de l'utilisateur      │        │                  │
│                               │           │    transmise, jamais gardée  │        │                  │
│  ESPN (blessures NBA) ────────┼───────────┼──── appel direct, autorisé ──┼────────┼─► site.api.espn  │
│  Images des cartes ───────────┼───────────┼──── chargées directement ────┼────────┼─► assets.sorare  │
└───────────────────────────────┘           └──────────────────────────────┘        └──────────────────┘
```

- **Même adresse pour la page et le relais** (`https://<projet>.pages.dev/` et `https://<projet>.pages.dev/graphql`) :
  pas de question de CORS entre les deux.
- **ESPN** accepte les appels de n'importe quel site (`Access-Control-Allow-Origin: *`, vérifié le 2026-11-07) : pas
  besoin de relais.
- **Images des cartes** : une balise `<img>` n'est pas soumise au CORS ; la page autonome actuelle charge déjà les images
  depuis `assets.sorare.com` (vérifié le 2026-11-07). Plus besoin des lots de vignettes de l'artifact.
- **Le code se déploie tout seul** : Cloudflare Pages se branche sur le dépôt GitHub `stephluquet/sorare-aide` et
  republie à chaque `git push` sur la branche choisie.

## 4. Le relais

Un fichier `functions/graphql.js` à la racine du dépôt. Cloudflare Pages en fait automatiquement la route `/graphql`
(« Pages Functions »). Esquisse :

```js
// Relais en lecture seule vers l'API Sorare. La clé vient de l'utilisateur, n'est ni gardée ni journalisée.
export async function onRequestPost({ request }) {
  // 1. Seulement depuis notre propre page (un navigateur envoie toujours Origin sur un POST)
  if (request.headers.get('Origin') !== new URL(request.url).origin) return new Response('Origine refusée', { status: 403 });
  // 2. Chacun sa clé
  const cle = request.headers.get('X-Sorare-Cle');
  if (!cle) return new Response('Clé manquante', { status: 401 });
  // 3. Lecture seule, taille raisonnable
  const corps = await request.text();
  if (corps.length > 20_000) return new Response('Requête trop longue', { status: 413 });
  let requete;
  try { requete = JSON.parse(corps).query; } catch { return new Response('JSON invalide', { status: 400 }); }
  if (typeof requete !== 'string' || /\b(mutation|subscription)\b/i.test(requete)) {
    return new Response('Lecture seule : mutation refusée', { status: 403 });
  }
  // 4. Transmission à Sorare, réponse renvoyée telle quelle
  const rep = await fetch('https://api.sorare.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', APIKEY: cle },
    body: corps,
  });
  return new Response(rep.body, { status: rep.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
```

Il reprend la règle absolue du projet (aucune action sur l'argent ou le marché) : toute mutation est refusée, **côté
serveur**, quoi que fasse la page. Il se teste en Node 22 sans dépendance (`Request` et `Response` y existent).

## 5. Ce que vit l'utilisateur

1. **Première visite** → écran **Paramètres** : clé API Sorare, nom de manager (`yapapir`…), sports (football, NBA).
   Bouton « Tester » : une petite requête (les paliers du manager) confirme que la clé et le nom sont bons.
2. **Initialisation** : barre de progression (« 312 joueurs sur 874… »). Premier passage **environ 6 minutes**
   pour un catalogue comme celui de `yapapir` (897 requêtes, plafond de 150 requêtes par minute, mesuré le 2026-11-07).
   **Reprise automatique** si l'iPhone se verrouille ou si l'onglet est fermé : chaque joueur chargé est enregistré tout
   de suite, on repart de là.
3. **Ensuite** : l'appli habituelle. Le bouton ↻ relance une **actualisation incrémentale** (environ 20 secondes,
   23 requêtes mesurées le 2026-11-07), directement dans le navigateur, avec la barre de chargement.
4. **Partager** : envoyer l'adresse. Chaque personne saisit sa propre clé et voit ses propres cartes.

## 6. Sécurité et confidentialité

| Point | Ce qui se passe | Parade |
|---|---|---|
| Clé dans le navigateur | Stockée dans le `localStorage` de ce site, sur cet appareil. Lisible par tout script de la page. | La page ne charge aucun script tiers en dehors de three.js (cdnjs) ; on peut l'intégrer à la page pour supprimer cette exception. Bouton « Oublier ma clé ». |
| Clé en transit | Elle passe chiffrée (HTTPS) jusqu'à Cloudflare, puis de Cloudflare à Sorare. Le relais la voit, comme tout relais. | Le relais ne l'écrit nulle part. **Laisser désactivés les journaux du projet** (« observability » / Workers Logs) : à vérifier qu'ils n'enregistrent pas les en-têtes s'ils sont activés. |
| Relais utilisé par d'autres | Toute personne qui connaît l'adresse et possède une clé Sorare pourrait s'en servir, en consommant le quota gratuit. | Contrôle de l'origine ; option **Cloudflare Access** (section 8) pour réserver le site à une liste d'adresses e-mail. |
| Actions sur le compte | Une clé Sorare pourrait servir à autre chose que lire. | Mutations refusées par le relais (section 4) et par `appelGraphql()`. |

## 7. Limites et coûts (offre gratuite de Cloudflare)

D'après la documentation de Cloudflare (consultée le 2026-11-08, voir les sources) :

- **pages fixes : gratuites et illimitées** (les requêtes qui n'appellent pas le relais ne comptent pas) ;
- **relais : 100 000 requêtes par jour**, quota partagé avec les éventuels Workers du compte ; au-delà, le relais
  s'arrête jusqu'à minuit UTC (les pages restent servies). À titre d'ordre de grandeur : une initialisation ≈ 900
  requêtes, une actualisation ≈ 25 ; dix utilisateurs qui actualisent dix fois par jour ≈ 2 500 requêtes ;
- **10 ms de temps de calcul par requête** : le relais ne calcule presque rien ; l'attente de la réponse de Sorare ne
  compte pas.

Côté Sorare : 200 appels par minute avec une clé (150 pour les champs NBA). La page garde le plafond actuel de 150 par
minute, **par navigateur**. **À vérifier** : si Sorare compte les appels par adresse IP plutôt que par clé, les
utilisateurs passant par le même relais Cloudflare pourraient se gêner (erreurs 429). L'API Sorare est servie par
CloudFront (Amazon), pas par Cloudflare (en-têtes lus le 2026-11-08) : pas de restriction connue entre les deux.

**Obtenir une clé API Sorare** : elle se crée soi-même dans les réglages du compte Sorare, bloc « API Keys », bouton
« Créer une API key » (vu sur une capture de l'utilisateur le 2026-11-14 ; une ancienne page d'aide parlait d'un ticket).
La clé indique son débit (« 200 demandes/minute ») ; la page annonce « jusqu'à 600 requêtes/minute » sans dire comment
l'obtenir (à vérifier). L'appli se limite de toute façon à 150 par minute (plafond fixe des champs NBA).

## 8. Option : site réservé à quelques personnes (Cloudflare Access)

Cloudflare Zero Trust (offre gratuite, **jusqu'à 50 utilisateurs, à vérifier**) peut placer une page de connexion devant
le site : on saisit son e-mail, on reçoit un code. Seules les adresses de la liste entrent. Utile si l'on veut éviter que
le relais serve à des inconnus. Facultatif : le site fonctionne sans.

## 9. Stockage dans le navigateur

- **IndexedDB** (et non `localStorage`, limité à environ 5 Mo) : catalogue, historique des joueurs (≈ 10 Mo pour
  874 joueurs), paliers, cartes jouées, seuil.
- **Safari (iPhone)** efface les données d'un site après **7 jours sans visite**, sauf s'il est **ajouté à l'écran
  d'accueil** (règle de WebKit pour le stockage écrit par les scripts). Conséquences : conseiller l'ajout à l'écran
  d'accueil ; si les données ont disparu, l'appli le dit et relance l'initialisation (la clé, elle, est à ressaisir).
- **Pas de partage entre l'iPhone et le PC** : chaque appareil a sa propre copie et ses propres cartes jouées. Plus tard :
  export / import d'un petit fichier, ou synchronisation (Cloudflare KV ou D1) à étudier.

## 10. Le travail de développement

Le moteur (`src/moteur/`) tourne déjà dans le navigateur. Le gros morceau est la **récupération**, aujourd'hui un script
Node qui écrit sur le disque.

| Étape | Contenu | Critère d'acceptation |
|---|---|---|
| 1. Récupération portable | `api.js` : adresse et clé injectées (Node : API directe + `SORARE_APIKEY` ; navigateur : `/graphql` + clé de l'utilisateur). Orchestration de `index.js` séparée du disque par un petit « magasin » (Node : fichiers ; navigateur : IndexedDB). `requetes.js`, `normaliser.js`, la fusion de `historique.js` et `espn.js` sont déjà sans disque. | `npm run recuperer` et `npm test` inchangés ; mêmes données produites par les deux magasins sur un échantillon. |
| 2. Préparation des données de l'appli | Ce que fait `outils/construire-app.js` (projections, équipes, compactage) dans un module partagé, appelé par Node et par le navigateur. | La page Node et la page web affichent les mêmes propositions sur les mêmes données. |
| 3. Relais | `functions/graphql.js` + tests (origine, clé absente, mutation refusée, transmission). | Tests verts en Node 22, sans dépendance. |
| 4. Écrans | Paramètres (clé, manager, sports, tester, oublier), Initialisation (barre, reprise, erreurs claires : clé refusée, manager inconnu, quota), bouton ↻ local. Même design que l'appli actuelle. | Parcours complet dans Chromium (format iPhone et PC) sur un faux relais ; interruption puis reprise de l'initialisation. |
| 5. Construction | `npm run web` → `sorties/web/` (page, moteur, `regles/`, paramètres de `methode.md` ; aucune donnée personnelle, aucune clé). | Le dossier ne contient ni clé ni donnée de `yapapir`. |
| 6. Mise en ligne | Par l'utilisateur, section 11. | Initialisation réelle réussie sur iPhone et sur PC. |

L'artifact Claude et la chaîne actuelle (`npm run recuperer`, `npm run app`) continuent de fonctionner en parallèle.

## 11. Utilisation et mise en ligne

**Sur son PC, sans hébergement** (Node 22) :

```bash
npm run web
```

```bash
npm run serveur-web
```

puis ouvrir http://localhost:8787. Le relais tourne sur le PC. `npm run serveur-web -- --reseau` ouvre le site aux
appareils du même Wi-Fi (en http simple : la clé circule alors en clair sur ce réseau).

**Hébergé sur Cloudflare Pages** (à faire par l'utilisateur, environ 15 minutes ; libellés de l'interface à vérifier) :

1. Créer un compte gratuit sur `dash.cloudflare.com`.
2. **Workers & Pages** → **Créer** → onglet **Pages** → **Se connecter à Git** → autoriser Cloudflare sur le dépôt
   GitHub `stephluquet/sorare-aide` (il peut rester **privé** : Cloudflare ne publie que le dossier de sortie, sans
   `data/`).
3. Réglages de construction : branche de production (celle qui porte la version web) ; préréglage : aucun ;
   commande : `npm run web` ; dossier de sortie : `sorties/web` ; variable `NODE_VERSION` = `22`.
4. **Enregistrer et déployer** → `https://<nom-du-projet>.pages.dev`. Le relais `functions/graphql.js` est pris
   automatiquement (route `/graphql`).
5. Laisser désactivés les journaux du projet (section 6). Facultatif : Cloudflare Access (section 8).

**GitHub Pages ou GitLab Pages seuls ne suffisent pas** : ce sont des hébergements de pages fixes, sans relais ; or
Sorare refuse les appels venant d'un navigateur. Il faut un relais (Cloudflare, un serveur, ou son PC).

## 12. Comparaison rapide avec les autres pistes

| | Cloudflare Pages + relais | Serveur OVH | GitLab CI + GitLab Pages |
|---|---|---|---|
| Clé saisie dans la page | oui | oui | non (dans GitLab, une seule clé) |
| Partage avec d'autres managers | oui, chacun sa clé | oui, chacun sa clé | non (une seule clé, un seul manager) |
| Serveur à administrer | non | oui (PHP ou Node) | non |
| Coût | gratuit | l'offre existante | gratuit |
| Mise à jour du code | automatique au `git push` | dépôt manuel des fichiers (ou script) | automatique |

## Sources

- Cloudflare, tarifs de Pages Functions : https://developers.cloudflare.com/pages/functions/pricing
- Cloudflare, tarifs et limites des Workers : https://developers.cloudflare.com/workers/platform/pricing/
- Sorare, « How can I get access to Sorare's API? » : https://sorare.com/help/a/10873240230941/how-can-i-get-access-to-sorare-s-api
- Sorare, dépôt officiel de l'API : https://github.com/sorare/api
