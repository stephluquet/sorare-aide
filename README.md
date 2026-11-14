# Sorar'help

Aide à la composition pour **Sorare**, en **football** et en **NBA**, pour les modes **Solo (Arcade)** et **Squad**.
L'outil propose, l'utilisateur décide : il ne joue jamais à sa place et ne fait aucune action sur le marché.

**Version 1.0** du 14 novembre 2026. Les changements sont dans [`NOTES-DE-VERSION.md`](NOTES-DE-VERSION.md).

## Ce que fait l'appli

- **Solo** : propose l'équipe qui a le plus de chances de **franchir le palier en cours**. Elle respecte les règles du mode : postes, capitaine et compétitions autorisées en football ; plafond de 16 étoiles en NBA. Elle écarte aussi les cartes déjà jouées au palier.
  - Trois propositions, au choix dans un sélecteur : prudente, équilibrée, ambitieuse.
  - Mode **créneau unique** : les 5 matchs commencent à la même heure, ce qui permet de composer après les compositions officielles, environ 1 h avant le match.
  - **Autres choix** : en football, un groupe par joueur de l'équipe ; en NBA, un groupe par nombre d'étoiles. Chaque carte affiche l'effet sur le score projeté de l'équipe.
- **Squad** : la meilleure équipe des **matchs du jour**, au sens du score projeté. Les cartes jouées en Solo sont autorisées.
- **Mes cartes** : toutes les cartes, avec filtres (poste, étoiles, type de carte, journée, seuils), tris, et vue liste avec fiche épinglée ou vue tableau. On y marque les cartes jouées.
- **Fiche joueur** : chances de jouer (ou minutes projetées en NBA), score projeté et sa fourchette, cote du match, forme du joueur et de son équipe, 15 derniers matchs. En NBA s'y ajoute le profil en points Sorare (points forts et points faibles, comparés aux joueurs à 20 minutes et plus).
- **Priorité absolue : ne jamais aligner un joueur qui ne joue pas.** Les blessés, les suspendus et les joueurs absents de la composition officielle sont écartés. Les cas douteux sont signalés.

La méthode de calcul (probabilité de jouer, score projeté, simulation, calibrage) est décrite, avec ses limites, dans [`methode.md`](methode.md). Les règles des modes de jeu sont dans [`regles/`](regles/). Ces deux endroits font foi : rien n'est recopié dans le code.

## Deux façons de l'utiliser

### 1. Version web autonome (Cloudflare Pages)

Chacun utilise sa propre clé API Sorare. La clé reste dans son navigateur : aucune donnée n'est stockée sur le serveur.

1. **Créer une clé API Sorare** : sur sorare.com, Réglages du compte, bloc « API Keys », bouton « Créer une API key ».
2. Ouvrir le site, saisir la clé et son nom de manager Sorare, puis choisir les sports.
3. **Première initialisation** : l'historique des joueurs est récupéré, une dizaine de minutes pour les deux sports. Il est gardé dans le navigateur (IndexedDB) et l'initialisation reprend là où elle s'est arrêtée.
4. Ensuite, le bouton ↻ fait une **mise à jour incrémentale** de quelques secondes.
5. Pour changer d'appareil, utiliser **Sauvegarder / Restaurer** dans les paramètres. On obtient un fichier `.json.gz` qui contient l'historique, les données et les cartes jouées.

L'API Sorare refuse les appels venant d'un navigateur hors de sorare.com (CORS). Le site passe donc par un petit relais, `functions/graphql.js` (Cloudflare Pages Functions) :
- il n'accepte que les requêtes de la même origine ;
- il est en lecture seule : mutations et abonnements sont refusés ;
- il transmet la clé sans la garder.

Pour déployer sa propre copie, voir [`docs/version-independante-cloudflare.md`](docs/version-independante-cloudflare.md). En résumé : un projet Cloudflare Pages relié au dépôt, avec la commande de build `npm run web`, le dossier de sortie `sorties/web` et `NODE_VERSION=22`.

### 2. En local (Node 22, sans dépendance)

```bash
npm run serveur-web      # http://localhost:8787 : même site que la version en ligne, relais compris
```

Ou bien, avec la clé dans la variable d'environnement `SORARE_APIKEY` :

```bash
npm run recuperer        # récupère cartes, joueurs, matchs et paliers → data/dernier.json
npm run app              # assemble une page unique → sorties/app/index.html (s'ouvre d'un double-clic)
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run recuperer` | Récupération complète (football et NBA), incrémentale si l'historique existe. Options : `--sport football`, `--sans-historique`, `--refaire-historique`. |
| `npm run app` | Construit l'appli en page unique avec les données (`sorties/app/`). |
| `npm run web` | Construit le site autonome, sans aucune donnée ni clé (`sorties/web/`). |
| `npm run serveur-web` | Sert le site et le relais en local (port 8787). |
| `npm test` | Rejoue les tests du moteur, du relais et des situations figées (`tests/`). |

Les outils de calibrage (`outils/retro-test*.js`) rejouent la méthode sur l'historique des matchs.

## Organisation du code

```
app/              interface (index.html, style.css, app.js), commune à la page unique et au site
web/              démarrage du site autonome : paramètres, initialisation, stockage local
functions/        relais en lecture seule vers l'API Sorare (Cloudflare Pages Functions)
src/moteur/       moteur pur (Node et navigateur) : chances de jouer, projection, simulation, compositions, forme, profil NBA
src/recuperation/ récupération commune Node / navigateur : requêtes GraphQL, débit limité, fusion de l'historique, blessures ESPN (NBA)
regles/           règles des modes de jeu (font foi)
methode.md        méthode de calcul, avec le bloc des paramètres (fait foi)
outils/           construction (app, web), serveur local, rétro-tests de calibrage
tests/            tests (node --test) et situations figées
docs/             plan, besoin, ce que l'API permet, déploiement Cloudflare
```

## Sécurité et limites

- **Lecture seule** : le code refuse toute mutation GraphQL ; aucune enchère, aucun achat, aucune vente.
- **La clé API n'est jamais écrite** dans un fichier du dépôt ni dans une page publiée. Sur le site, elle reste dans le navigateur de l'utilisateur.
- **Débit** : 150 requêtes par minute au plus, sous la limite de 200 par minute de Sorare.
- **Ce que l'API ne donne pas sans connexion à Sorare** : les cartes déjà jouées (à marquer à la main) et les probabilités de titularisation. Les chances de jouer sont donc estimées sur l'historique, puis sur les compositions officielles quand elles sont publiées.
- **Pas d'équivalent des compositions officielles en NBA.** Les minutes projetées reposent sur l'historique ; les blessures viennent de l'API Sorare et d'ESPN.
- Une statistique, un statut ou une règle inconnus sont signalés « à vérifier », jamais inventés.

## Licence

Projet personnel, sans licence publiée. Sorare est une marque de Sorare SAS ; ce projet n'est ni affilié à Sorare ni soutenu par Sorare.
