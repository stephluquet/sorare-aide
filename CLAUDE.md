# Aide à la composition Sorare

Outil personnel d'aide à la décision pour Sorare (football d'abord, NBA ensuite). L'utilisateur décide toujours : l'outil propose, il ne joue jamais à sa place.

**But** (récap utilisateur du 2026-11-07) : dire quelle équipe jouer pour **franchir le palier Arcade en cours**, en football et en NBA, et quelle est la meilleure équipe **Squad du jour**. **Priorité absolue : ne jamais aligner un joueur qui ne joue pas** (il marque 0, sans remplaçant). Pour l'utilisateur seul, sur téléphone et PC.

Manager : **`yapapir`**. Langue de travail : français. **Le projet est en JavaScript** (Node 22, sans dépendance) ; un paquet R viendra plus tard et réutilisera `regles/`, `methode.md` et `tests/cas/`.

## Tenir ce fichier à jour
Ce fichier est la mémoire du projet entre les sessions. **Mettez-le à jour dans le même commit** chaque fois que vous découvrez quelque chose de durable : une requête qui marche, un champ qui n'existe pas, une limite de l'API, un nouveau script. Indiquez ce qui a été **vérifié** (avec la date) et ce qui est **supposé**. Retirez ce qui devient faux plutôt que de l'empiler.

## Plan et décisions
**`docs/plan-appli.md` (v0.1 du 2026-11-07) fait foi pour le plan de développement** : principes, architecture, modèle de données, méthode, écrans, étapes et critères d'acceptation. `docs/recap-brief.md` résume le besoin. Résumé des décisions de l'utilisateur :
- **Support** : un artifact Claude privé, publié par la session cloud, consulté sur iPhone et PC. **Cible à terme : une appli qui se passe de Claude.** Le moteur (`src/moteur/`) reste du JavaScript pur, la récupération un script Node autonome (clé en variable d'environnement ailleurs), l'interface (`app/`) lit un fichier de données au même format.
- **Actualisation à la demande seulement** : l'utilisateur écrit « actualise », la session récupère les données et republie l'artifact. Les données sont intégrées à l'artifact, qui ne peut pas appeler l'API Sorare lui-même (clé). Pas d'actualisation automatique. L'artifact affiche l'heure et l'âge des données, avec un bandeau orange au-delà de 3 h.
- **Usage** : un passage le matin, un en fin d'après-midi pour les matchs du soir.
- **Risque** : seuil par défaut de 80 % de chances de jouer ; proposition prudente en premier.
- **Pas** de journal des résultats pour l'instant ; deux maquettes (dont une ultra minimaliste) avant de coder les écrans.

**Réponses aux ❓ du plan** (contrat des artifacts lu le 2026-11-07, runtime 0.2.96 ; pas encore essayé en vrai) :
- **Garder le palier et les cartes jouées** : capacité `db` de l'artifact. Documents privés par personne (`data/users/<id>/…`), conservés d'une republication à l'autre, **partagés entre iPhone et PC** (même compte), et **lisibles par la session** (`ArtifactData`), qui peut donc en tenir compte. Le `localStorage` survit aussi aux republications, mais reste propre à chaque navigateur. Il faut être connecté à claude.ai (sinon `db` vaut `null` : prévoir un repli `localStorage`).
- **Bouton qui déclenche l'actualisation** : possible en principe avec la capacité `mcp` et le connecteur « Claude Code Remote ». Le bouton lancerait une tâche programmée (`fire_trigger`) qui récupère les données et republie. La progression peut s'afficher dans l'artifact si la tâche écrit son avancement dans `db` (`onSnapshot`). **Non garanti** : le connecteur peut exposer moins d'outils côté navigateur. À essayer à l'étape 5 bis ; en attendant, « actualise » dans la session. La capacité `sample` (demander à Claude) ne convient pas : elle n'a ni réseau ni outils.

Commandes :

```bash
npm run recuperer                            # plan v0.1 : tout (football + NBA) → data/<AAAA-MM-JJTHHMM>/*.json + data/dernier.json ; historique incrémental
npm run recuperer -- --sport football --sans-historique   # rapide : pas de requête par joueur
# Ancienne chaîne (étape 1 du premier plan), en attendant src/moteur/ et app/ :
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
| Moyennes | `anyPlayer { averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE) }`, `LAST_FIFTEEN_…`, `LAST_TEN_PLAYED_…`, `LAST_FORTY_…`, `SEASON_AVERAGE_SCORE` | L5, L15, L40 : **moyenne des seuls matchs joués** parmi les 5, 15, 40 derniers matchs de l'équipe ; les DNP sont exclus, pas comptés 0 ; 0 si aucun match joué (vérifié sur 48/50 cartes pour L5). `LAST_TEN_PLAYED` = moyenne des **10 derniers matchs joués**, quelle que soit leur ancienneté (16/20). L40 vérifié sur Kane (68 contre 67,8 recalculé). |
| % de matchs joués | `anyPlayer { lastFiveSo5Appearances lastTenSo5Appearances lastFifteenSo5Appearances lastFortySo5Appearances seasonAppearances }` | Nombre de matchs **joués** dans les 5, 10, 15, 40 derniers matchs de l'équipe (vérifié 19/20 pour 5, 10 et 15). Pourcentage = apparitions / taille de la fenêtre. 40 : écart de 2 sur Kane (37 contre 35 recalculé) ; à confirmer. |
| Derniers scores | `anyPlayer { playerGameScores(last: 15) { score scoreStatus anyGame { date } anyPlayerGameStats { onGameSheet } } }` | Du plus récent au plus ancien. `scoreStatus` : `FINAL`, `DID_NOT_PLAY`, `REVIEWING` (joué, en vérification), `NO_GAME`, `PENDING`. **Plafonné à 15 matchs** même avec `last: 40` (idem `anyGameStats(last:)`). |
| Situation match par match | `anyPlayerGameStats { onGameSheet playedInGame ... on PlayerGameStats { fieldStatus gameStarted minsPlayed formationPlace } }` | Football, vérifié : titulaire = `gameStarted: 1` (`fieldStatus` `ON_FIELD` s'il finit le match, `SUBSTITUTED` s'il est remplacé) ; entré en jeu = `ON_FIELD` sans `gameStarted` ; banc = `ON_BENCH` (non joué) ; absent = `NOT_ON_GAME_SHEET`. `minsPlayed` renseigné. NBA : `PlayerGameStatsBasketball { minsPlayed onGameSheet playedInGame }`, **pas d'information « a débuté »** ; situation `joue` / `banc` / `absent`. **En NBA, débuter compte peu, les minutes jouées comptent énormément** (utilisateur, 2026-11-07) : la probabilité de jouer et le score NBA doivent s'appuyer sur les minutes. |
| Historique sur 40 matchs | `anyPlayer(slug:) { allPlayerGameScores(first: 40) { pageInfo { hasNextPage } nodes { … } } }` | Renvoie bien 40 matchs (du plus récent au plus ancien, paginable, filtre `from`/`to`), avec la situation de chaque match. **Refusé dans une liste de cartes** : une requête par joueur (complexité environ 330 ; environ 585 requêtes, soit 4 min, pour tout le football). |
| Coût de `npm run recuperer` | — | **Premier passage : 897 requêtes en 375 s** (585 + 289 historiques complets, environ 143 req/min). **Actualisation incrémentale : 23 requêtes en 21 s** (vérifié le 2026-11-07). Archive `data/historique/` : 9,9 Mo pour 874 joueurs. % joués sur 40 recalculé à partir des 40 matchs ≈ `lastFortySo5Appearances` / 40 pour seulement 532 joueurs sur 805 : les fenêtres diffèrent (sélections, coupes ?) ; **à vérifier** avant de s'appuyer sur l'un ou l'autre. |
| Poste | `anyPlayer { anyPositions }` | Football `Goalkeeper`/`Defender`/`Midfielder`/`Forward` (→ GK/DF/MD/FW) ; NBA `basketball_guard`/`_forward`/`_center` (→ G/F/C). |
| Club | `anyPlayer { activeClub { slug name } }` | OK. |
| Tier et étoiles | `anyPlayer { gameplayTier(gameMode: SET) gameplayTierStars(gameMode: SET) }` | **Donnée du joueur, pas de la carte.** DNP 1, DNP_PLUS 1,5, ROSTER 2, ROSTER_PLUS 2,5, IMPACT 3, STAR 4, GOAT 5 (GOAT et STAR vus sur Kane et Şengün). Correspondance avec les noms du centre d'aide (GOAT ↔ Icon ? DNP ↔ Reserve ?) **à vérifier**. |
| Bonus de collection | `skinEdition { skinName variantName bonus }` | Nom = `variantName` s'il existe (Four Suits, Eclipse), sinon `skinName` (Standard, Shiny, Holo). Multiplicateurs vus : 1 ; 1,05 ; 1,1 ; 1,15 ; 1,2 = conformes à `regles/bonus-collections.json`. |
| Blessure | `anyPlayer { activeInjuries { kind status expectedEndDate } }` | `status` souvent nul ; `expectedEndDate` souvent renseigné. |
| Suspension | `anyPlayer { activeSuspensions { kind reason matches endDate competition { name } } }` | Parfois peu informative (« Unknown suspension reason », `matches: 0`). |
| Prochain match | `anyPlayer { nextGame { id date statusTyped homeTeam { slug name } awayTeam { slug name } competition { name } } }` | `date` = **heure exacte du coup d'envoi** en UTC (ex. `2026-11-07T14:30:00Z`), suffisante pour regrouper par créneau. Domicile/extérieur : comparer `activeClub.slug` aux deux équipes. Pour un match de sélection, le club n'apparaît pas (12 cas en novembre 2026). |
| Un match par identifiant | `football { game(id:) }` (identifiant **sans** le préfixe `Game:`) ou `anyGame(id:)` (identifiant **avec** le préfixe) | Champs utiles : `statusTyped`, `periodType`, `minute`, `homeFormation`/`awayFormation { startingLineupAvailable startingLineup { slug } bench { slug } }`. |
| **Cotes du match (football)** | `nextGame { ... on Game { homeStats { ... on FootballTeamGameStats { winOddsBasisPoints drawOddsBasisPoints loseOddsBasisPoints cleanSheetOdds threeGoalsOdds } } awayStats { … } } }` | Probabilités en points de base (8200 = 82 %) ; clean sheet et 3 buts en cotes décimales. Renseignées quelques jours avant le match (vides pour un match à deux semaines). Pas d'équivalent en NBA. |
| Statut de jeu Sorare (football) | `... on Player { playingStatus }` | Catégorie : `STARTER`, `REGULAR`, `SUBSTITUTE`, `SUPER_SUBSTITUTE`, `NOT_PLAYING`, `RETIRED`. Calcul non publié : affiché, hors formule. |
| Projection Sorare | `... on Player { nextClassicFixtureProjectedScore }`, `... on NBAPlayer { … }` | Football : seulement 27 cartes sur 635. NBA : toutes. Modèle opaque : affiché pour comparaison, hors formule. |
| Projections NBA détaillées | `anyFutureGameStats(first: 1) { ... on PlayerGameStatsBasketball { projectedPoints projectedRebounds projectedAssists projectedMinsPlayed } }` | Points, rebonds, passes projetés : renseignés (49/50). **`projectedMinsPlayed` toujours `null`**, même le jour du match (22 cartes à moins de 24 h, 2026-11-07). Points projetés à 0 : 7 joueurs blessés et 7 non blessés (souvent DNP récents) : indice de non-participation, pas une certitude. |
| Règles officielles des paliers | `setBoard(...) { steps { displayedTypedRules { __typename key descriptions { title items { title } } ... on So5ScarcityRule { rarities } ... on So5CaptainScarcityRule { bonus } ... on So5CompetitionsRule { competitions { name } } ... on So5AppearancesRule { appearances { shortName positions } } } } }` | Lu le 2026-11-07, **identique sur les 6 paliers** : football = common seulement, capitaine +50 %, emplacements GK, DEF, MID, FWD, EX (DEF/MID/FWD), **compétitions autorisées** (Bundesliga, Ligue 1, Premier League, Primera División, Ligue des champions, Ligue Europa, Ligue Conférence, Ligue des nations) ; NBA = common, compétition NBA, 5 emplacements tous postes, « 16 stars cap : Sum of players' stars must remain below 16 ». Reporté dans `regles/`. |
| Probabilité de titularisation | `... on Player { nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints substituteOddsBasisPoints nonPlayingOddsBasisPoints } }`, `PlayerGameStats.footballPlayingStatusOdds` | **Toujours `null` avec notre clé**, testé sur 16 joueurs dont Kane et Mbappé, même pour un match du jour. Probablement réservé aux comptes connectés. |
| Progression Arcade | `user(slug:) { setBoard(mode: CAREER, sport: FOOTBALL) { title steps { level target state ... on CareerStep { maxLineupsCount remainingLineupsCount pendingLineupsCount lockedLineupsCount } displayedTypedRules { __typename } } } }` | **Public.** Paliers et cibles identiques à `regles/` ; `state` : `CLAIMED` (passé), `LINEUP_SET`, `LOCKED`, `PLAYABLE`, `LIVE`, `FAILED`… ; `maxLineupsCount` = 4 (les 4 vies). **`remainingLineupsCount` = tentatives encore disponibles = 4 − tentatives déjà utilisées (réussie, échouée ou en cours)** ; `pendingLineupsCount` = compositions en cours. Échecs = max − restantes − en cours, **moins 1 si le palier est passé** (`CLAIMED`/`CLAIMABLE` : une des tentatives est la réussite) (confirmé par l'utilisateur le 2026-11-07 : palier 300 football, restantes 1, en cours 1 → 2 échecs ; palier 260 passé : restantes 3 → 1 tentative, réussie). Rôle de `lockedLineupsCount` (0 partout) à vérifier. **Refusés sans connexion** (« You should log in ») : `myCurrentStep`, `myLineups` → les cartes bloquées doivent être saisies par l'utilisateur. `setBoard(mode: SQUAD)` revient `null`. |
| Visuels | carte : `pictureUrl` (PNG), `videoUrl` (WebM), `backPictureUrl` (SVG du dos), `cardBackgroundUrl` ; joueur : `squaredPictureUrl`, `avatarPictureUrl`, `fullPictureUrl` ; club : `activeClub { pictureUrl }` | L'API renvoie les adresses (vérifié le 2026-11-07), hébergées sur `assets.sorare.com` et `frontend-assets.sorare.com`. **`assets.sorare.com` est autorisé dans l'environnement depuis le 2026-11-07** : image de carte PNG 771 × 1248 (avec rareté et collection visibles), vidéo WebM, logo de club PNG 500 × 500, téléchargés avec succès. `frontend-assets.sorare.com` (dos de carte seulement) reste refusé. `pictureUrl(derivative: null)` renvoie la même image que le défaut (`tinified`, PNG 771 × 1248, environ 360 Ko) ; `"avatar"` donne un recadrage 668 × 594 (200 Ko) ; `low_res`, `squared`, `thumbnail`, `small` renvoient `null` ; les paramètres d'URL (`?width=`) sont ignorés. La page des projections lie l'image `tinified` avec `loading="lazy"` (seules les vignettes visibles se chargent) ; ne pas intégrer les images en base64 (environ 370 Mo pour tout le catalogue). Pour vérifier une page avec Playwright, lancer Chromium avec `proxy: { server: process.env.HTTPS_PROXY }`, sinon les images ne chargent pas. |
| À ne pas utiliser pour le bonus | `power`, `powerBreakdown` | `power` vaut 1,000 partout : c'est le mode Pro. |
| Bonus « même club » | `powerBreakdown { sameActiveClubBasisPoints }` | Vaut 0 carte par carte (dépend sans doute de la composition) : **à vérifier**. |

**En cours (test 3 du récap)** : `Game.homeFormation / awayFormation` relevés le 2026-11-07 à H-4/H-2, puis H-3, H-1 et au coup d'envoi de Leeds–Tottenham (12:30Z), Mainz–Bayern (14:30Z), Arsenal–Hull (15:00Z) avec `node src/releve-compositions.js <slugs>` → `data/releves/compositions-2026-11-07.jsonl`. Premier relevé : `startingLineupAvailable` faux partout, listes vides, probabilités de titularisation `null`. Conclusion à reporter ici.

### Artifacts (vérifié le 2026-11-07)
- **Un artifact ne peut charger aucune image externe** (CSP : seuls des scripts de quelques CDN et les polices Google sont admis). Les visuels Sorare doivent donc être **intégrés** (data: URI) ou déposés dans le stockage de l'artifact (capacité `assets`). `outils/vignettes.py` fabrique des vignettes WebP de 96 px (environ 4 Ko chacune, 90 vignettes = 349 Ko) depuis `assets.sorare.com` dans `data/vignettes/` (non versionné). Toutes les cartes en vignette ≈ 4 Mo : à éviter ; vignettes seulement pour les cartes utiles (propositions, meilleures espérances).
- Le fichier publié n'a ni `<!doctype>`, ni `<html>`, ni `<head>`, ni `<body>` (ajoutés à la publication) ; `<title>` et `<style>` en tête. Données de la maquette sans images : environ 0,9 Mo pour 1 029 cartes avec 15 matchs d'historique chacune.

## Règles absolues
- Aucune action sur l'argent ou le marché : pas d'enchère, d'achat, de vente, d'offre (l'outil ne fait que lire ; `appelGraphql()` refuse les mutations).
- Ne jamais inventer une statistique, un statut de joueur ou une règle de compétition. Si c'est inconnu : écrire « à vérifier ».
- Les règles de compétition et les formules ne vivent qu'à un seul endroit (`regles/`, `methode.md`), jamais recopiées dans le code. Le moteur lit ses paramètres dans le bloc JSON de `methode.md` (l'ancienne chaîne, dans `docs/methode-v1.md`).

## Structure du dépôt
```
CLAUDE.md        ce document
regles/          une description JSON par mode de jeu (fait foi)
methode.md       méthode v2 (probabilité de jouer, score s'il joue), en mots et en équations, avec ses limites et l'origine de chaque paramètre ; contient le bloc JSON des paramètres (v1 archivée dans docs/methode-v1.md)
tests/cas/       situations figées de la méthode v2 (carte, joueur, match fictifs) + résultat attendu, paramètres inclus ; tests/cas-v1/ : méthode v1
tests/*.test.js  lanceur des cas (node --test)
src/moteur/      plan v0.1 : moteur pur (parametres.js, jouer.js, projection.js) + node.js (chargement côté Node)
outils/          retro-test.js (calibrage de methode.md sur l'historique), projections.js (résumé de contrôle)
src/recuperation/  plan v0.1 : api.js (débit, proxy, lecture seule), requetes.js, normaliser.js (modèle commun), historique.js (fusion incrémentale), index.js (npm run recuperer)
src/             recuperation.js, projection.js, page.js : ancienne chaîne de l'étape 1, à remplacer par src/moteur/ et app/
data/dernier.json   dernière récupération complète (meta, cartes, joueurs avec historique 40 matchs, matchs, paliers), lue par l'interface ; **non versionné** (8 Mo, régénéré en 21 s par `npm run recuperer`). **Trop lourd tel quel pour l'artifact** (objectif : ouverture en moins de 3 s sur iPhone) : à alléger à l'étape 5 bis (clés courtes, joueurs utiles seulement…)
data/historique/<sport>/<joueurId>.json   archive incrémentale match par match (versionnée : c'est elle qui évite de refaire 900 requêtes à chaque session)
data/<AAAA-MM-JJTHHMM>/   instantanés datés (ignorés par git) ; data/cartes-*.json : ancienne chaîne ; data/releves/ : relevés exploratoires
src/releve-compositions.js  relevé exploratoire des compositions officielles et des probabilités de titularisation d'un match
sorties/         pages HTML produites, autonomes, lisibles sur téléphone
docs/            plan-appli.md (plan v0.1, fait foi), recap-brief.md (besoin), brief-api-sorare.md (ce que l'API permet ou non)
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

**Équipe verrouillée au premier coup d'envoi** d'un de ses joueurs (utilisateur). Carte bloquée tant qu'on reste sur le même niveau, mais utilisable en Squad.

**Football solo** : 5 joueurs (GK, DF, MD, FW + 1 joueur de champ au choix) ; un capitaine, score majoré de 50 % ; cartes common ; seuls comptent les **matchs** des compétitions autorisées (liste dans `regles/`, coupes nationales exclues).

**NBA solo** : 5 joueurs, postes libres ; pas de capitaine ; plafond de 16 étoiles par équipe, **16 inclus**, demi-étoiles comptées (4,5 + 4,5 = 9).

**Squad (les deux sports)** : le score du squad est la somme des 3 meilleurs scores des membres, mais les partenaires sont inconnus. L'outil propose donc **la meilleure équipe possible du jour** : uniquement des joueurs qui jouent le jour même, cartes bloquées en solo autorisées ; objectif = score attendu maximal. Mêmes règles de composition que le solo du sport, à confirmer.

**À vérifier (ne pas inventer)**
- ~~champ API des étoiles NBA~~ → `gameplayTierStars`, côté joueur (vérifié le 2026-11-07) ;
- ~~champ API du bonus de collection~~ → `skinEdition.bonus`, nom dans `variantName` ou `skinName` (vérifié pour les cinq collections) ;
- correspondance des tiers API (GOAT, DNP, variantes `_PLUS`) avec ceux du centre d'aide ;
- le bonus « même club » du centre d'aide ;
- d'éventuelles contraintes de tier selon le niveau (aucune dans les règles lues le 2026-11-07, identiques sur les 6 paliers) ;
- ~~plafond NBA~~ → **16 inclus** (décision de l'utilisateur, 2026-11-07), malgré le texte officiel « below 16 » ;
- ~~compétitions autorisées~~ → **la règle porte sur le match joué** (utilisateur, 2026-11-07) : un joueur dont le prochain match est une coupe nationale est exclu pour ce créneau ; les matchs de la Ligue des nations comptent. Comparer `nextGame.competition.name` à `competitions_autorisees.noms_api` dans `regles/`.

**Ce que l'appli fait et ne fait pas** (récap utilisateur du 2026-11-07, remplace le plan initial)
- État (palier en cours, cartes déjà jouées) **saisi à la main et gardé dans le navigateur**. Le palier, son état et les échecs se lisent aussi dans l'API (voir le tableau).
- **Pas** de vies affichées, **pas** de plan sur plusieurs tentatives, pas de conseil d'achat, aucune action sur le marché. On propose **la meilleure équipe pour la tentative en cours**.

**Le moteur (étape 2)**
1. **Filtre dur** : blessés, suspendus, douteux exclus ; seuil réglable de probabilité de jouer.
2. **Probabilité de jouer**, sans connexion : statut Sorare, % de matchs joués sur 5, 10 et 40 matchs, situation match par match (titulaire, entré, banc, absent).
3. **Score en mélange** : titulaire, entré en jeu ou ne joue pas (0), estimé à partir du détail match par match (dispersion, tendance récente, saison précédente moins pondérée), pas des seules moyennes L5/L15 qui ignorent les matchs non joués.
4. **Probabilité de franchir le palier** par simulation ; capitaine (football) choisi pour passer, pas pour le meilleur score.
5. **Probabilité « équipe complète »** (les 5 jouent) affichée en tête.
6. **Mode créneau unique** : équipe dont tous les matchs commencent à la même heure, composée après les compositions officielles ; comparé au mode plusieurs créneaux.
7. **Squad** : meilleure équipe du jour (score attendu maximal), uniquement des joueurs qui jouent ce jour-là ; cartes bloquées en solo autorisées.
- Bonus de collection appliqué carte par carte à partir de l'API.

**Tests du récap** (2026-11-07) : 1 ✅ apparitions et moyennes 10/40 ; 2 ✅ détail sur 40 matchs (joueur par joueur seulement) ; 3 ⏳ compositions officielles (relevés en cours) ; 4 ✅ heure exacte ; 5 ✅ texte des règles ; 6 ❌ minutes NBA toujours vides.

**Plus tard** : OAuth (probabilités de titularisation, cartes bloquées) ; plan sur les vies ; publication privée (GitLab Pages) ; paquet R pour des collègues.

## Étape 1 (faite le 2026-11-07, à affiner) : projections
1. ✅ `src/recuperation.js` : toutes les cartes (football et NBA) avec joueur, poste, club, tier, étoiles, bonus, L5, L15, 15 derniers scores, blessures, suspensions, prochain match (adversaire, lieu, date, cotes en football), statut et projection Sorare.
2. ✅ `methode.md` v1 : niveau = 0,4 × L5 + 0,6 × L15 ; p de jouer = part des matchs joués (5 et 15 derniers), 0 si blessé ou suspendu ; × bonus ; écart-type affiché. Poids non calibrés.
3. ✅ `sorties/projections-2026-11-07.html` : tri par score projeté, filtres par sport et par poste, alertes « à vérifier », vignette de chaque carte (liée depuis Sorare, agrandie au toucher).
4. ✅ 3 cas dans `tests/cas/` (titulaire régulier, blessé Shiny, remplaçant Four Suits suspendu ailleurs).

Pistes : calibrer les poids sur l'historique ; utiliser les cotes du match (aujourd'hui affichées seulement) ; tester `homeFormation` pour les compositions probables.

## Étape 2 du plan v0.1 (en cours, 2026-11-07) : méthode et projections
- ✅ `methode.md` **v2** (la v1 est archivée dans `docs/methode-v1.md`) : probabilité de jouer = part pondérée des matchs joués (demi-vie 2 matchs) **recalibrée** (football 0,08 → 0,93 ; NBA 0,10 → 0,93), filtre dur (blessé, suspendu, sans match → exclu ; retour de blessure, statut Sorare `NOT_PLAYING`, club absent du match → douteux), éligibilité Arcade sur la compétition du match, score s'il joue en mélange titulaire / entré (football) ou minutes × score par minute (NBA), espérance = p × score × bonus.
- **Paramètres choisis par rétro-test** (`node outils/retro-test.js football|nba`, sur `data/historique/`) : 16 935 matchs football, 6 588 NBA. Constats : la probabilité de jouer dépend surtout des 2 ou 3 derniers matchs ; même un titulaire indiscutable ne joue le match suivant que dans 88 % (football) à 90 % (NBA) des cas d'après l'historique seul ; titulaires 48,9 points en moyenne contre 39,7 pour les entrés en jeu ; l'erreur sur le score d'un joueur reste d'environ 13 points (football) et 8,5 (NBA), d'où l'intérêt de la simulation de l'étape 3 ; NBA : corrélation minutes / score 0,78.
- ✅ `src/moteur/` (JavaScript pur, Node et navigateur) : `parametres.js` (lit le bloc JSON de `methode.md` depuis un texte), `jouer.js`, `projection.js` ; `node.js` charge données, méthode et règles côté Node. `node outils/projections.js` résume les projections sur `data/dernier.json`.
- ✅ 5 cas dans `tests/cas/` (méthode v2, valeurs calculées à part en Python) ; anciens cas dans `tests/cas-v1/`.
- Sur les données du 2026-11-07 : football 189 cartes proposables (p ≥ 80 %, ni exclues ni douteuses), NBA 156.
- ⏳ Écran « Mes cartes » : **deux maquettes publiées le 2026-11-07, choix de l'utilisateur attendu** avant de coder `app/` :
  A (riche : vignettes, jauge, fiche en volet avec historique en barres) https://claude.ai/artifact/Ehb1E4gimz47VEJx2urLvw ;
  B (ultra minimaliste : une ligne par carte, détail déplié) https://claude.ai/artifact/TPHUGSmfbybRq7qSqp1FMj.
  Générées par `node outils/maquettes.js` (gabarits `outils/maquettes/a.html` et `b.html`, données du moteur v2 ; pages dans `sorties/maquettes/`, non versionnées). Republier au même chemin de fichier pour garder les adresses.
- Étape 3 ensuite : `simulation.js` (Monte-Carlo, probabilité de franchir le palier, capitaine) et `compositions.js`.

## Étape 3 (à venir) : conseil avant chaque journée
Vérifier titulaires et blessures avec des sources citées et datées, signaler les pièges, proposer 2 ou 3 compositions. L'utilisateur valide dans l'appli Sorare.

## État du compte `yapapir` (au 2026-11-07)
- Football : 635 cartes `common` de 2026 ; 542 Standard, 80 Shiny, 8 Holo, 2 Four Suits, 3 Eclipse ; 78 joueurs blessés, 4 suspendus.
- NBA : 394 cartes `common` de 2026 ; 349 Standard, 37 Shiny, 5 Holo, 1 Four Suits, 2 Eclipse ; 76 joueurs blessés.
