# Aide à la composition Sorare

Outil personnel d'aide à la décision pour Sorare (football d'abord, NBA ensuite). L'utilisateur décide toujours : l'outil propose, il ne joue jamais à sa place.

Manager : **`yapapir`**. Langue de travail : français. **Le projet est en JavaScript** (Node 22, sans dépendance) ; un paquet R viendra plus tard et réutilisera `regles/`, `methode.md` et `tests/cas/`.

## Tenir ce fichier à jour
Ce fichier est la mémoire du projet entre les sessions. **Mettez-le à jour dans le même commit** chaque fois que vous découvrez quelque chose de durable : une requête qui marche, un champ qui n'existe pas, une limite de l'API, un nouveau script. Indiquez ce qui a été **vérifié** (avec la date) et ce qui est **supposé**. Retirez ce qui devient faux plutôt que de l'empiler.

## Fonctionnement actuel
- Claude, dans une session cloud, appelle l'API Sorare, écrit les fichiers de données et produit des pages HTML autonomes.
- Pas de publication pour l'instant (GitLab Pages privé envisagé plus tard).

```bash
node src/recuperation.js yapapir football    # → data/cartes-football-AAAA-MM-JJ.json (cache du jour ; --force pour rafraîchir)
node src/recuperation.js yapapir nba         # → data/cartes-nba-AAAA-MM-JJ.json
node src/projection.js                       # → sorties/projections-AAAA-MM-JJ.html (football + NBA)
npm test                                     # rejoue tests/cas/
```

## Ce qui marche déjà (ne pas redécouvrir)

### Accès à l'API
- API GraphQL : `POST https://api.sorare.com/graphql`, corps JSON `{"query": ..., "variables": ...}`.
- **Schéma** : `https://api.sorare.com/graphql/schema` renvoie le SDL complet (environ 950 Ko, vérifié le 2026-11-07). L'introspection (`__type`, `__schema`) est **désactivée**. Vérifier les noms de champs dans ce schéma avant d'écrire une requête.
- La clé API arrive par le secret réseau de l'environnement (en-tête `APIKEY`). Ne jamais l'écrire dans un fichier, un journal ou un message. Le code envoie une valeur bidon que le proxy remplace.
- **Node : le `fetch` ignore `HTTPS_PROXY` sauf avec `NODE_USE_ENV_PROXY=1`.** Sans cette variable, la connexion part en direct, la clé n'est pas injectée, et l'API répond « complexity … exceeds max complexity of 500 » (vérifié le 2026-11-07). `src/recuperation.js` se relance tout seul avec la variable. curl et R passent par le proxy sans réglage.
- Complexité maximale d'une requête : 30 000 avec la clé, 500 sans. Une page de 50 cartes avec tous les champs de l'étape 1 coûte environ 7 000 à 8 000.
- La clé n'identifie pas de compte : `currentUser` renvoie toujours `null` (vérifié). Récupérer les cartes par slug : `user(slug: …) { cards(sport: $sport, first: 50, after: $cursor) { nodes { … } pageInfo { hasNextPage endCursor } } }`, en paginant tant que `hasNextPage` est vrai. L'exemple officiel `allCardsFromUser.js` lit à tort `paginatedCards` : le champ s'appelle `cards`. `cards(slugs: [...])` filtre sur des cartes précises.
- Plusieurs joueurs d'un coup : `players(slugs: [...])` à la racine. **Un même champ racine ne peut pas être répété, même avec des alias** (« Duplicated root field »).
- Un slug inexistant renvoie `User(slug=...) not found` (code `NOT_FOUND`).
- Limites : 200 appels/min avec clé ; 150/min fixes pour les champs NBA. **Plafond appliqué dans le code : 150 requêtes/min** (0,4 s minimum entre deux départs, dans `appelGraphql()`). Ne pas lancer deux récupérations en parallèle. Catalogue complet de `yapapir` : 21 requêtes (13 football + 8 NBA), environ 15 s.
- Le conteneur tourne en locale C : en R, passer en `C.UTF-8` sinon les accents sortent en `<U+00E9>`.

### Champs vérifiés sur les cartes de `yapapir` (2026-11-07)
| Besoin | Champ GraphQL | Constat |
|---|---|---|
| Moyennes | `anyPlayer { averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE) }`, `LAST_FIFTEEN_…` | **Moyenne des seuls matchs joués** parmi les 5 (15) derniers matchs de l'équipe ; les DNP sont exclus, pas comptés 0 ; L5 = 0 si aucun match joué. Règle déduite, vérifiée sur 48/50 cartes. Autres types : `LAST_TEN_PLAYED_…`, `LAST_FORTY_…`, `SEASON_AVERAGE_SCORE` (non testés). |
| Derniers scores | `anyPlayer { playerGameScores(last: 15) { score scoreStatus anyGame { date } anyPlayerGameStats { onGameSheet } } }` | Du plus récent au plus ancien. `scoreStatus` : `FINAL`, `DID_NOT_PLAY`, `REVIEWING` (joué, en vérification), `NO_GAME`, `PENDING`. |
| Poste | `anyPlayer { anyPositions }` | Football `Goalkeeper`/`Defender`/`Midfielder`/`Forward` (→ GK/DF/MD/FW) ; NBA `basketball_guard`/`_forward`/`_center` (→ G/F/C). |
| Club | `anyPlayer { activeClub { slug name } }` | OK. |
| Tier et étoiles | `anyPlayer { gameplayTier(gameMode: SET) gameplayTierStars(gameMode: SET) }` | **Donnée du joueur, pas de la carte.** DNP 1, DNP_PLUS 1,5, ROSTER 2, ROSTER_PLUS 2,5, IMPACT 3, STAR 4, GOAT 5 (GOAT et STAR vus sur Kane et Şengün). Correspondance avec les noms du centre d'aide (GOAT ↔ Icon ? DNP ↔ Reserve ?) **à vérifier**. |
| Bonus de collection | `skinEdition { skinName variantName bonus }` | Nom = `variantName` s'il existe (Four Suits, Eclipse), sinon `skinName` (Standard, Shiny, Holo). Multiplicateurs vus : 1 ; 1,05 ; 1,1 ; 1,15 ; 1,2 = conformes à `regles/bonus-collections.json`. |
| Blessure | `anyPlayer { activeInjuries { kind status expectedEndDate } }` | `status` souvent nul ; `expectedEndDate` souvent renseigné. |
| Suspension | `anyPlayer { activeSuspensions { kind reason matches endDate competition { name } } }` | Parfois peu informative (« Unknown suspension reason », `matches: 0`). |
| Prochain match | `anyPlayer { nextGame { date statusTyped homeTeam { slug name } awayTeam { slug name } competition { name } } }` | Domicile/extérieur : comparer `activeClub.slug` aux deux équipes. Pour un match de sélection, le club n'apparaît pas (12 cas en novembre 2026). |
| **Cotes du match (football)** | `nextGame { ... on Game { homeStats { ... on FootballTeamGameStats { winOddsBasisPoints drawOddsBasisPoints loseOddsBasisPoints cleanSheetOdds threeGoalsOdds } } awayStats { … } } }` | Probabilités en points de base (8200 = 82 %) ; clean sheet et 3 buts en cotes décimales. Renseignées quelques jours avant le match (vides pour un match à deux semaines). Pas d'équivalent en NBA. |
| Statut de jeu Sorare (football) | `... on Player { playingStatus }` | Catégorie : `STARTER`, `REGULAR`, `SUBSTITUTE`, `SUPER_SUBSTITUTE`, `NOT_PLAYING`, `RETIRED`. Calcul non publié : affiché, hors formule. |
| Projection Sorare | `... on Player { nextClassicFixtureProjectedScore }`, `... on NBAPlayer { … }` | Football : seulement 27 cartes sur 635. NBA : toutes. Modèle opaque : affiché pour comparaison, hors formule. |
| Probabilité de titularisation | `... on Player { nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints substituteOddsBasisPoints nonPlayingOddsBasisPoints } }`, `PlayerGameStats.footballPlayingStatusOdds` | **Toujours `null` avec notre clé**, testé sur 16 joueurs dont Kane et Mbappé, même pour un match du jour. Probablement réservé aux comptes connectés. |
| Progression Arcade | `user(slug:) { setBoard(mode: CAREER, sport: FOOTBALL) { title steps { level target state ... on CareerStep { maxLineupsCount remainingLineupsCount pendingLineupsCount lockedLineupsCount } displayedTypedRules { __typename } } } }` | **Public.** Paliers et cibles identiques à `regles/` ; `state` : `CLAIMED` (passé), `LINEUP_SET`, `LOCKED`, `PLAYABLE`, `LIVE`, `FAILED`… ; `maxLineupsCount` = 4 (les 4 vies). **`remainingLineupsCount` = tentatives encore disponibles = 4 − tentatives déjà utilisées (réussie, échouée ou en cours)** ; `pendingLineupsCount` = compositions en cours. Échecs = max − restantes − en cours (confirmé par l'utilisateur le 2026-11-07 : palier 300 football, restantes 1, en cours 1 → 2 échecs ; palier 260 passé : restantes 3 → 1 tentative utilisée). Rôle de `lockedLineupsCount` (0 partout) à vérifier. **Refusés sans connexion** (« You should log in ») : `myCurrentStep`, `myLineups` → les cartes bloquées doivent être saisies par l'utilisateur. `setBoard(mode: SQUAD)` revient `null`. |
| À ne pas utiliser pour le bonus | `power`, `powerBreakdown` | `power` vaut 1,000 partout : c'est le mode Pro. |
| Bonus « même club » | `powerBreakdown { sameActiveClubBasisPoints }` | Vaut 0 carte par carte (dépend sans doute de la composition) : **à vérifier**. |

Repérés dans le schéma, **non testés** : `Game.homeFormation / awayFormation { startingLineup startingLineupAvailable }` (compositions ?), `NBAPlayer` → `anyFutureGameStats(first:) { ... on PlayerGameStatsBasketball { projectedPoints projectedMinsPlayed } }` (`projectedMinsPlayed` vide au premier essai).

## Règles absolues
- Aucune action sur l'argent ou le marché : pas d'enchère, d'achat, de vente, d'offre (l'outil ne fait que lire ; `appelGraphql()` refuse les mutations).
- Ne jamais inventer une statistique, un statut de joueur ou une règle de compétition. Si c'est inconnu : écrire « à vérifier ».
- Les règles de compétition et les formules ne vivent qu'à un seul endroit (`regles/`, `methode.md`), jamais recopiées dans le code. `src/projection.js` lit ses paramètres dans le bloc JSON de `methode.md`.

## Structure du dépôt
```
CLAUDE.md        ce document
regles/          une description JSON par mode de jeu (fait foi)
methode.md       formule de projection, en mots et en équations, avec ses limites ; contient le bloc JSON des paramètres
tests/cas/       situations figées (cartes et stats fictives) + résultat attendu, paramètres inclus
tests/*.test.js  lanceur des cas (node --test)
src/             recuperation.js (API), projection.js (méthode), page.js (HTML) ; compositions.js à l'étape 2
data/            données récupérées, datées : cartes-<football|nba>-AAAA-MM-JJ.json (une carte par ligne)
sorties/         pages HTML produites, autonomes, lisibles sur téléphone
docs/            briefs destinés à l'utilisateur (docs/brief-api-sorare.md : ce que l'API permet ou non)
R/cartes.R       ancien script R (liste des cartes + L5/L15 en CSV), antérieur au projet JS
```

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
- bonus de collection : à lire carte par carte dans l'API ; `regles/bonus-collections.json` ne sert que de repli et de contrôle (la projection signale tout écart). Le centre d'aide mentionne aussi un bonus « jusqu'à +5 % » pour plusieurs joueurs d'un même club : à distinguer et à vérifier.

**Football solo** : 5 joueurs (GK, DF, MD, FW + 1 joueur de champ au choix) ; un capitaine, score majoré de 50 %.

**NBA solo** : 5 joueurs, postes libres ; pas de capitaine ; plafond de 16 étoiles par équipe.

**Squad (les deux sports)** : le score du squad est la somme des 3 meilleurs scores des membres, mais les partenaires sont inconnus. L'outil propose donc **la meilleure équipe possible du jour** : uniquement des joueurs qui jouent le jour même, cartes bloquées en solo autorisées ; objectif = score attendu maximal. Mêmes règles de composition que le solo du sport, à confirmer.

**À vérifier (ne pas inventer)**
- ~~champ API des étoiles NBA~~ → `gameplayTierStars`, côté joueur (vérifié le 2026-11-07) ;
- ~~champ API du bonus de collection~~ → `skinEdition.bonus`, nom dans `variantName` ou `skinName` (vérifié pour les cinq collections) ;
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

## Étape 1 (faite le 2026-11-07, à affiner) : projections
1. ✅ `src/recuperation.js` : toutes les cartes (football et NBA) avec joueur, poste, club, tier, étoiles, bonus, L5, L15, 15 derniers scores, blessures, suspensions, prochain match (adversaire, lieu, date, cotes en football), statut et projection Sorare.
2. ✅ `methode.md` v1 : niveau = 0,4 × L5 + 0,6 × L15 ; p de jouer = part des matchs joués (5 et 15 derniers), 0 si blessé ou suspendu ; × bonus ; écart-type affiché. Poids non calibrés.
3. ✅ `sorties/projections-2026-11-07.html` : tri par score projeté, filtres par sport et par poste, alertes « à vérifier ».
4. ✅ 3 cas dans `tests/cas/` (titulaire régulier, blessé Shiny, remplaçant Four Suits suspendu ailleurs).

Pistes : calibrer les poids sur l'historique ; utiliser les cotes du match (aujourd'hui affichées seulement) ; tester `homeFormation` pour les compositions probables.

## Étape 2 (à venir) : compositions
- **Solo** : pour un niveau donné (cible, vies restantes, cartes déjà bloquées), plan de jusqu'à 4 compositions disjointes qui maximise la probabilité de passer le niveau, sous les contraintes de `regles/`. Distribution du score de chaque joueur estimée à partir de ses derniers scores (moyenne et dispersion) ; probabilité de l'équipe par simulation (quelques milliers de tirages) ou approximation normale, documentée dans `methode.md`. Pour la tentative suivante, proposer 2 à 3 variantes (prudente, équilibrée, ambitieuse) avec probabilité estimée, score attendu et horaire des matchs.
- **Squad** : meilleure équipe du jour.
- Optimisation : `javascript-lp-solver` ou recherche exhaustive si le nombre de cartes le permet.

## Étape 3 (à venir) : conseil avant chaque journée
Vérifier titulaires et blessures avec des sources citées et datées, signaler les pièges, proposer 2 ou 3 compositions. L'utilisateur valide dans l'appli Sorare.

## État du compte `yapapir` (au 2026-11-07)
- Football : 635 cartes `common` de 2026 ; 542 Standard, 80 Shiny, 8 Holo, 2 Four Suits, 3 Eclipse ; 78 joueurs blessés, 4 suspendus.
- NBA : 394 cartes `common` de 2026 ; 349 Standard, 37 Shiny, 5 Holo, 1 Four Suits, 2 Eclipse ; 76 joueurs blessés.
