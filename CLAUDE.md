# Aide à la composition Sorare

Outil personnel d'aide à la décision pour Sorare (football d'abord, NBA ensuite). L'utilisateur décide toujours : l'outil propose, il ne joue jamais à sa place.

Manager : **`yapapir`**. Langue de travail : français.

## Tenir ce fichier à jour
Ce fichier est la mémoire du projet entre les sessions. **Mettez-le à jour dans le même commit** chaque fois que vous découvrez quelque chose de durable : une requête qui marche, un champ qui n'existe pas, une limite de l'API, un nouveau script. Indiquez ce qui a été **vérifié** (avec la date) et ce qui est **supposé**. Retirez ce qui devient faux plutôt que de l'empiler.

## Fonctionnement actuel
- Claude, dans une session cloud, appelle l'API Sorare, écrit les fichiers de données et produit des pages HTML autonomes.
- Pas de publication pour l'instant (GitLab Pages privé envisagé plus tard).

## Ce qui marche déjà (ne pas redécouvrir)
- API GraphQL : `POST https://api.sorare.com/graphql`, corps JSON `{"query": ..., "variables": ...}`.
- **Schéma** : `https://api.sorare.com/graphql/schema` renvoie le SDL complet (environ 950 Ko, vérifié le 2026-11-07). L'introspection (`__type`, `__schema`) est en revanche **désactivée**. Vérifier les noms de champs dans ce schéma avant d'écrire une requête.
- La clé API arrive par le secret réseau de l'environnement (en-tête `APIKEY`). Ne jamais l'écrire dans un fichier, un journal ou un message. Le code envoie une valeur bidon (`APIKEY: injecte-par-le-proxy`) que le proxy remplace.
- La clé n'identifie pas de compte : `currentUser` renvoie toujours `null` (vérifié). Récupérer les cartes par slug : `user(slug: …) { cards(sport: $sport, first: 50, after: $cursor) { nodes { … } pageInfo { hasNextPage endCursor } } }`, en paginant tant que `hasNextPage` est vrai (`endCursor` devient alors nul). L'exemple officiel `allCardsFromUser.js` lit à tort `paginatedCards` : le champ s'appelle `cards`. `$sport` vaut `FOOTBALL` ou `NBA` (les deux vérifiés).
- Un slug inexistant renvoie `User(slug=...) not found` (code `NOT_FOUND`).
- Limites : 200 appels/min avec clé ; 150/min fixes pour les champs NBA. Mettre en cache, ne pas boucler sans pause. Une requête = une page de 50 cartes ; le catalogue complet de `yapapir` coûte 21 requêtes (13 football + 8 NBA). Sans pause, l'API répond à environ 3 requêtes/s, d'où le plafond ci-dessous.
- **Plafond appliqué dans le code : 150 requêtes/min**, soit 0,4 s minimum entre deux départs de requête. Faire passer toute requête par une fonction unique qui l'impose. Ne pas utiliser `req_throttle()` de httr2 (version 1.0.0 ici, rafale initiale autorisée à partir de la 1.1.0). Le plafond ne vaut que pour un processus : ne pas lancer deux récupérations en parallèle.
- Environnement : R (httr2, jsonlite) installé par le script de setup ; Node 22 disponible. Le conteneur tourne en locale C : passer en `C.UTF-8` sinon les accents sortent en `<U+00E9>`.

### Champs vérifiés sur les cartes de `yapapir` (2026-11-07)
| Besoin | Champ GraphQL | Constat |
|---|---|---|
| Moyennes | `anyPlayer { averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE) }`, `LAST_FIFTEEN_…` | OK football et NBA. L'enum offre aussi `LAST_TEN_PLAYED_SO5_AVERAGE_SCORE`, `LAST_FORTY_…`, `SEASON_AVERAGE_SCORE` (non testés). |
| Poste | `anyPlayer { anyPositions }` | Football : `Goalkeeper`, `Defender`, `Midfielder`, `Forward`. NBA : `basketball_center`, `basketball_forward`, `basketball_guard`. |
| Club | `anyPlayer { activeClub { name } }` | OK. |
| Tier | `anyPlayer { gameplayTier(gameMode: SET) }` | Enum API : `GOAT`, `STAR`, `IMPACT`, `ROSTER`, `DNP` et variantes `_PLUS`. **Ne correspond pas mot pour mot** aux tiers du centre d'aide (Icon, Star, Impact, Roster, Reserve) : correspondance GOAT ↔ Icon et DNP ↔ Reserve **à vérifier**. Même valeur avec ou sans `gameMode`. |
| Étoiles | `anyPlayer { gameplayTierStars(gameMode: SET) }` | **Donnée du joueur, pas de la carte.** Observé : DNP 1, DNP_PLUS 1,5, ROSTER 2, ROSTER_PLUS 2,5, IMPACT 3. Valeurs de STAR et GOAT non observées. Existe aussi en football. |
| Bonus de collection | `skinEdition { skinName bonus }` | Multiplicateur : Standard `1.0`, Shiny `1.05` (= +5 %). Holo, Four Suits, Eclipse non observés (cartes absentes). `cardEditionName` vaut par exemple `divination_shiny_base`. |
| À ne pas utiliser pour le bonus | `power`, `powerBreakdown` | `power` vaut `1.000` sur toutes les cartes testées : c'est le mode Pro, pas Arcade. |
| Bonus « même club » | `powerBreakdown { sameActiveClubBasisPoints }` | Le champ existe mais vaut 0 carte par carte (il dépend sans doute de la composition) : **à vérifier**. |

Champs repérés dans le schéma, **non testés** : `activeInjuries`, `activeSuspensions`, `nextGame(so5FixtureEligible:)`, `anyFutureGameStats(first:)`, `playerGameScores(last:)`, `rawPlayerGameScores(last:)` (derniers scores), `nextClassicFixtureProjectedScore`, `nextDailyFixtureProjectedScore`.

## Règles absolues
- Aucune action sur l'argent ou le marché : pas d'enchère, d'achat, de vente, d'offre (l'outil ne fait que lire).
- Ne jamais inventer une statistique, un statut de joueur ou une règle de compétition. Si c'est inconnu : écrire « à vérifier ».
- Les règles de compétition et les formules ne vivent qu'à un seul endroit (`regles/`, `methode.md`), jamais recopiées dans le code.

## Structure du dépôt
```
CLAUDE.md        ce document
regles/          une description JSON par mode de jeu (fait foi)
methode.md       formule de projection, en mots et en équations, avec ses limites
tests/cas/       situations figées (cartes et stats fictives) + résultat attendu
src/             moteur JavaScript : recuperation.js, projection.js, compositions.js
data/            données récupérées, datées (cartes-AAAA-MM-JJ.json)
sorties/         pages HTML produites, autonomes, lisibles sur téléphone
R/cartes.R       script R existant : liste des cartes + L5/L15 en CSV (antérieur à ces consignes)
```
Plus tard : un paquet R pour des collègues réutilisera `regles/`, `methode.md` et `tests/cas/` à l'identique.

Usage du script R existant : `Rscript R/cartes.R <slug> [sortie.csv] [FOOTBALL|NBA]`. Il applique déjà le plafond de 150 requêtes/min et la locale UTF-8, et écrit le CSV avant d'afficher.

## Jeu et objectif de l'utilisateur
- Modes joués : **Arcade (Sorare Set) en solo**, et **Squad**, en **football** et en **NBA**.
- Objectif : **franchir le plus de paliers possible**.
- Sources : centre d'aide Sorare « Qu'est-ce que Arcade ? » (lu le 2026-11-07) et précisions de l'utilisateur (2026-11-07).
- Les règles détaillées de chaque mode (taille d'équipe, postes, capitaine, étoiles, paliers, vies, bonus) sont dans `regles/`, qui fait foi. Ce qui suit résume le jeu ; en cas d'écart, `regles/` l'emporte.

**Arcade solo, commun aux deux sports**
- plateau de niveaux, chacun avec un score cible ; score compté dès la fin des matchs réels (figé 5 min après) ; niveau réussi si score ≥ cible, on avance aussitôt ;
- 4 vies par niveau ; échec = 1 vie perdue ; plus de vies = retour au niveau 1 ;
- **une carte jouée est bloquée tant qu'on reste sur le même niveau** : les tentatives d'un même niveau utilisent des cartes toutes différentes ; tout est libéré quand on passe le niveau ;
- tiers de joueurs : Icon, Star, Impact, Roster, Reserve (noms de l'API : voir le tableau des champs vérifiés) ;
- bonus de collection : à lire carte par carte dans l'API (`skinEdition.bonus`) ; `regles/bonus-collections.json` ne sert que de repli et de contrôle. Le centre d'aide mentionne aussi un bonus « jusqu'à +5 % » pour plusieurs joueurs d'un même club : à distinguer et à vérifier.

**Football solo** : 5 joueurs (GK, DF, MD, FW + 1 joueur de champ au choix) ; un capitaine, score majoré de 50 %.

**NBA solo** : 5 joueurs, postes libres ; pas de capitaine ; plafond de 16 étoiles par équipe.

**Squad (les deux sports)** : le score du squad est la somme des 3 meilleurs scores des membres, mais les partenaires sont inconnus. L'outil propose donc **la meilleure équipe possible du jour** : uniquement des joueurs qui jouent le jour même, cartes bloquées en solo autorisées ; objectif = score attendu maximal. Mêmes règles de composition que le solo du sport, à confirmer.

**À vérifier (ne pas inventer)**
- ~~champ API des étoiles NBA~~ → `gameplayTierStars` (vérifié le 2026-11-07) ; valeurs STAR et GOAT non observées ;
- ~~champ API du bonus de collection~~ → `skinEdition.bonus` (vérifié pour Standard et Shiny) ;
- correspondance des tiers API (GOAT, DNP, variantes `_PLUS`) avec ceux du centre d'aide ;
- le bonus « même club » du centre d'aide ;
- d'éventuelles contraintes de tier selon le niveau.

**Conséquences pour le moteur**
- On ne maximise pas le score moyen mais la **probabilité de franchir le palier** : la régularité compte autant que la moyenne.
- Les cartes d'un niveau étant bloquées après usage, on planifie **jusqu'à 4 compositions disjointes** pour le niveau en cours et on maximise la probabilité qu'au moins une passe (1 − Π(1 − pᵢ)), en gardant des cartes pour les tentatives suivantes plutôt que de tout brûler sur la première.
- Le capitaine (football) se choisit pour maximiser la probabilité de passer, pas seulement le score attendu.
- NBA : contrainte d'étoiles (≤ 16) ; aucune contrainte de poste.
- Squad : meilleure équipe du jour (score attendu maximal), uniquement des joueurs qui jouent ce jour-là.
- Bonus de collection appliqué carte par carte à partir de l'API.
- La date des matchs compte : jouer tôt permet de valider vite et d'enchaîner.

## Étape 1 (en cours) : projections
1. Récupérer toutes les cartes de l'utilisateur (football d'abord) avec, par carte : joueur, poste, club, tier, bonus de collection, étoiles (NBA), moyennes L5 et L15, derniers scores, statut (blessure, suspension), prochain match (adversaire, domicile/extérieur, date et heure).
2. Écrire `methode.md` : projection simple et transparente (moyenne pondérée L5/L15, dispersion des derniers scores, statut, contexte du match, bonus). Pas de modèle opaque.
3. Produire `sorties/projections-AAAA-MM-JJ.html` : tableau trié par score projeté, filtrable par poste, avec la date des données et les lignes « à vérifier ».
4. Ajouter 3 cas de test dans `tests/cas/`.

Avancement : la liste des cartes avec L5/L15 existe (`R/cartes.R`) ; les champs poste, club, tier, étoiles et bonus sont identifiés et vérifiés (tableau plus haut). Restent : statut, derniers scores, prochain match, puis `methode.md`, la page HTML et les cas de test.

## Étape 2 (à venir) : compositions
- **Solo** : pour un niveau donné (cible, vies restantes, cartes déjà bloquées), plan de jusqu'à 4 compositions disjointes qui maximise la probabilité de passer le niveau, sous les contraintes de `regles/`. Distribution du score de chaque joueur estimée à partir de ses derniers scores (moyenne et dispersion) ; probabilité de l'équipe par simulation (quelques milliers de tirages) ou approximation normale, documentée dans `methode.md`. Pour la tentative suivante, proposer 2 à 3 variantes (prudente, équilibrée, ambitieuse) avec probabilité estimée, score attendu et horaire des matchs.
- **Squad** : meilleure équipe du jour.
- Optimisation : `javascript-lp-solver` ou recherche exhaustive si le nombre de cartes le permet.

## Étape 3 (à venir) : conseil avant chaque journée
Vérifier titulaires et blessures avec des sources citées et datées, signaler les pièges, proposer 2 ou 3 compositions. L'utilisateur valide dans l'appli Sorare.

## État du compte `yapapir` (au 2026-11-07)
- Football : 635 cartes, toutes `common` de 2026, 585 joueurs différents.
- NBA : 394 cartes, toutes `common` de 2026, 289 joueurs différents.
- Bonus observés (sur 50 cartes par sport) : Standard et Shiny uniquement.
