# Revue 1.0 : constats des lots 2 et 3

Extrait des données de la revue critique multi-agents du 2026-11-15 (rapport complet : https://claude.ai/artifact/9VVxJfD4jgqGfUbyxRPKGz). Les chiffres et les numéros de ligne datent de la version 1.0 : **à revérifier avant d'agir**, le code a beaucoup changé en 1.1.

## Lot 2 · Rationalisation

### A3-02 · Ancienne chaîne de l'étape 1 encore versionnée (environ 750 lignes de code, 2,9 Mo de données et de pages)

- **Gravité** : important · **effort** : S
- **Constat** : src/recuperation.js (274 lignes), src/projection.js (153), src/page.js (212) et leurs produits (data/cartes-*-2026-11-07.json 2,1 Mo, sorties/projections-2026-11-07.html 780 Ko) ne servent plus : CLAUDE.md les gardait « en attendant src/moteur/ et app/ », qui existent. Aucun module vivant ne les importe ; seuls tests/v1.test.js et src/releve-compositions.js (relevé exploratoire du test 3, terminé le 2026-11-07) en dépendent. Ils dupliquent appelGraphql, le relancement par le proxy et la projection.
- **Preuve** : `grep -rn "recuperation\.js\|projection\.js\|page\.js" --include=*.js --include=*.json . | grep -v 'moteur/projection\|^./sorties\|^./docs'` → seulement src/projection.js:133-134 (s'importe lui-même), src/releve-compositions.js:13, tests/v1.test.js:8, package.json:9. Aucune mention dans README.md ni NOTES-DE-VERSION.md.
- **Correction proposée** : Supprimer src/recuperation.js, src/projection.js, src/page.js, data/cartes-*-2026-11-07.json, sorties/projections-2026-11-07.html ; supprimer src/releve-compositions.js (109 lignes) ou le rebrancher sur src/recuperation/api.js ; mettre à jour les sections « Commandes » et « Structure du dépôt » de CLAUDE.md. Risque : on perd la page de projections v1 (remplacée par l'appli) ; git garde l'historique.

### A3-03 · `npm run projeter` est cassé

- **Gravité** : mineur · **effort** : S
- **Constat** : Le script npm « projeter » lance src/projection.js (méthode v1), qui lit data/cartes-<sport>-<date du jour>.json, fichier que seule l'ancienne récupération produit. Il échoue donc tous les jours sauf le 2026-11-07.
- **Preuve** : package.json:9. Sur la copie : `node src/projection.js` → « Aucune donnée pour le 2026-11-14 : lancer d'abord src/recuperation.js ».
- **Correction proposée** : Retirer la ligne « projeter » de package.json, avec A3-02. `node outils/projections.js` donne déjà le résumé v3.

### A3-04 · Tests et documents de la méthode v1 : 4 tests sur 69 n'éprouvent que du code mort

- **Gravité** : mineur · **effort** : S
- **Constat** : tests/v1.test.js (40 lignes) et tests/cas-v1/ (3 fichiers, 519 lignes) ne testent que src/projection.js. docs/methode-v1.md (124 lignes) n'est lu que par ce module. Tant qu'ils existent, `npm test` empêche de supprimer l'ancienne chaîne.
- **Preuve** : `grep -rn "cas-v1\|methode-v1" --include=*.js .` → tests/v1.test.js:11,30 et src/projection.js:2,15 seulement. tests/v1.test.js:8 importe projeterCarte, lireParametres, lireTableBonus de ../src/projection.js.
- **Correction proposée** : Supprimer tests/v1.test.js et tests/cas-v1/ avec A3-02. Garder docs/methode-v1.md comme archive si souhaité (aucun coût), sinon le supprimer aussi. Risque nul pour le moteur v3 : tests/cas/ et les autres tests ne changent pas (65 tests).

### A3-05 · R/cartes.R et outils/maquettes* : vestiges sans appelant

- **Gravité** : mineur · **effort** : S
- **Constat** : R/cartes.R (117 lignes, « antérieur au projet JS ») n'est référencé nulle part. outils/maquettes.js (77 lignes) et ses gabarits a.html (277) et b.html (128) régénèrent les maquettes A/B de l'écran Mes cartes, tranchées le 2026-11-07 puis remplacées par la refonte du 8 ; le script tourne encore mais sa sortie n'est lue par rien.
- **Preuve** : `grep -rn "cartes\.R\|outils/maquettes\|maquettes\.js" --include=*.js --include=*.json --include=*.sh .` → seulement les auto-références (R/cartes.R:5,107 ; outils/maquettes.js:3,72) ; aucun script npm. Sur la copie : `node outils/maquettes.js` → 2 pages (1 764 et 1 278 Ko).
- **Correction proposée** : Supprimer R/cartes.R, outils/maquettes.js, outils/maquettes/ et la ligne sorties/maquettes/ de .gitignore. Risque : les deux artifacts de maquette (liens de CLAUDE.md) ne pourront plus être régénérés ; ils restent consultables. Le futur paquet R repartira de regles/, methode.md et tests/cas/, pas de ce script.

### A4-02 · Environ 10 % de la complexité de chaque page de cartes sert à des champs jamais lus

- **Gravité** : important · **effort** : S
- **Constat** : La requête CARTES demande pour chaque carte : 5 moyennes (l5, l10, l15, l40, saison), 4 compteurs d'apparitions (a5 à a40), tier, seasonYear, nextClassicFixtureProjectedScore (deux fragments) et anyFutureGameStats (4 projections NBA). Ils sont normalisés (moyennes, projectionSorare, tier, saison) mais ni le moteur, ni src/app-donnees.js, ni app/app.js, ni web/web.js ne les lisent : `moyennes` n'apparaît que dans outils/projections.js:18 (L15 dans un outil de contrôle), `projectionSorare` nulle part, `tier` est copié dans les données de l'appli sans être affiché, projectedMinsPlayed vaut null pour 364 joueurs NBA sur 364. Mesuré : 51 906 → 46 606 de complexité pour 100 cartes, soit −53 par carte (−10,2 %). Sont aussi inutilisés, sans mesure séparée : activeInjuries.status, activeSuspensions kind / reason / matches / endDate (seule la compétition est lue, jouer.js:85-89), nextGame.statusTyped, setBoard.title.
- **Preuve** : src/recuperation/requetes.js:32,41,43-51,69,72,74-76 ; src/recuperation/normaliser.js:139-150 ; recherche : grep -rnE "moyennes\.|pctJoues|projectionSorare" src/moteur app web src/app-donnees.js → aucun résultat ; mesures r1.json / r2.json (rep1.json, rep2.json)
- **Correction proposée** : Retirer ces champs de CARTES (et de normaliserJoueur), ou les garder derrière une option pour les outils de contrôle. Avec 452 de complexité par carte, passer TAILLE_PAGE de 50 à 60 (environ 28 500, sous 30 000) : football 17 → 14 pages, NBA 11 → 9, soit −5 requêtes et environ −5 s par actualisation (−14 %), et une réponse plus légère. CLAUDE.md décrit la projection Sorare comme « affichée pour comparaison » : elle ne l'est plus dans l'appli 1.0 ; à confirmer avec l'utilisateur avant de la retirer.

### A3-06 · La requête des cartes demande 13 champs par joueur que plus rien ne lit

- **Gravité** : important · **effort** : S
- **Constat** : CARTES demande 5 moyennes (l5, l10, l15, l40, saison), 4 nombres d'apparitions (a5 à a40), nextClassicFixtureProjectedScore (deux fois) et anyFutureGameStats (4 projections NBA). normaliser.js les range dans joueur.moyennes et joueur.projectionSorare ; ni le moteur, ni src/app-donnees.js, ni l'appli ne les lisent (seul outils/projections.js imprime L15). Or cette requête pèse 26 656 de complexité pour un plafond de 30 000 (CLAUDE.md) : ces champs mangent une marge qui a déjà manqué pour detailedScore. Ils pèsent aussi environ 200 Ko dans data/dernier.json. Idem, en plus petit, pour carte.saison (seasonYear) et carte.slug (doublon de id). Gain de complexité à vérifier par un appel réel.
- **Preuve** : src/recuperation/requetes.js:43-51 et 68-76 ; src/recuperation/normaliser.js:139-149. `grep -rn "projectionSorare\|pctJoues\|\.moyennes\b" src app web outils tests --include=*.js` → normaliser.js (production), outils/projections.js:18 (L15), et src/moteur/projection.js:47 + tests/contexte.test.js:91 qui visent un autre objet (P.retrait.football.moyennes).
- **Correction proposée** : Retirer ces champs de CARTES et de normaliserJoueur (environ 25 lignes), adapter outils/projections.js:18 ; mesurer la complexité avant et après et la noter dans CLAUDE.md. Risque : la projection Sorare et le statut de jeu étaient prévus « affichés pour comparaison » ; aujourd'hui seul statutSorare l'est (app/app.js:1247), à garder.

### A3-09 · autresChoix et autresChoixSquad : même squelette recopié, commentaires périmés

- **Gravité** : mineur · **effort** : M
- **Constat** : Les deux fonctions partagent environ 20 lignes identiques (cartes admissibles, équipe, cartes libres, groupes par poste ou par étoiles, boucle des remplacements avec contrôle joueur unique / postes / étoiles, meilleur + options) ; seule l'évaluation diffère (simulation contre scoreSquad). Leurs commentaires décrivent l'ancien comportement (« ou en tout en NBA », champs de retour sans options).
- **Preuve** : src/moteur/compositions.js:274-306 et 344-381 ; lignes identiques 283-285 / 353-355 et 290-295 / 362-365. Commentaires : compositions.js:265-271 et 339-342.
- **Correction proposée** : Extraire une fonction interne `remplacements(lignes, P, o, equipe, evaluer)` qui prend la fonction d'évaluation ; environ 25 lignes en moins et un seul endroit pour la règle « un groupe par poste / par étoiles ». Les tests de tests/compositions.test.js (lignes 225-240 et 305-316) couvrent les deux chemins.

### A3-11 · Formule du score projeté d'équipe écrite deux fois (moteur et appli)

- **Gravité** : mineur · **effort** : S
- **Constat** : scoreProjete (appli) et scoreSquad (moteur) calculent tous deux la somme des scores s'il joue avec bonus de carte et brassard, selon le mode de cumul de regles/. Le Squad est choisi par le moteur avec l'une et affiché par l'appli avec l'autre ; les autres choix du Squad sont classés par l'appli avec scoreProjete alors que le moteur a déjà rendu esperanceEquipe. Aujourd'hui les deux coïncident en mode addition ; une évolution d'un seul côté donnerait un avant → après incohérent avec l'équipe choisie.
- **Preuve** : app/app.js:646-649 ; src/moteur/compositions.js:258-265 (scoreSquad) ; app/app.js:955 (`valeur` recalculée au lieu de lire esperanceEquipe).
- **Correction proposée** : Exporter du moteur une fonction `scoreProjeteEquipe(lignes, capitaine, regle)` utilisée par scoreSquad et par l'appli ; l'ajouter à un test.

### A3-08 · Deux paramètres de methode.md inutilisés ou incohérents avec le code

- **Gravité** : mineur · **effort** : S
- **Constat** : `simulation.alternatives_nba` (8) n'est lu nulle part depuis le passage aux autres choix par étoiles (`alternatives_par_etoile`), mais la section 6 bis le cite encore comme règle en vigueur. À l'inverse, les seuils de chances de jouer 70 / 80 / 85 % sont codés en dur dans l'appli alors que leur pendant NBA (`nba.minutes.seuils`) est dans methode.md : entorse à « les paramètres ne vivent qu'à un seul endroit ».
- **Preuve** : methode.md:73 et 389 ; `grep -rn alternatives_nba --include=*.js .` → aucun résultat. app/app.js:173 (`const SEUILS = [0.7, 0.8, 0.85]`) contre app/app.js:179 (`D.P.nba?.minutes?.seuils`).
- **Correction proposée** : Retirer alternatives_nba du bloc JSON et corriger la phrase de la section 6 bis ; ajouter `seuils_jouer: [0.7, 0.8, 0.85]` au bloc JSON et le lire dans app.js. Les deux `?? 4` et `?? [15, 20, 25]` de repli (compositions.js:242, app.js:179) recopient aussi des valeurs de methode.md : à retirer.

### A3-10 · Champs rendus par le moteur que l'appli ne lit plus

- **Gravité** : confort · **effort** : S
- **Constat** : Depuis que l'appli affiche le score projeté recalculé par scoreProjete, plusieurs champs des résultats du moteur ne sont lus par aucun écran : `approx` des équipes simulées (lu nulle part), `esperanceEquipe` et `ecart` des autres choix du Squad, `ecart`, `esperance`, `p`, `siJoue` des autres choix du Solo (lus seulement par les tests), `pPasserBrut` côté appli, `format` (FORMAT_APP, FORMAT_DONNEES jamais contrôlés à la lecture) et `meta.slug` des données de l'appli.
- **Preuve** : `grep -c "\.approx\b\|esperanceEquipe\|pPasserBrut\|D\.format\|meta\.slug" app/app.js web/web.js` → 0 et 0. Définitions : src/moteur/compositions.js:127, 298-302, 375-376 ; src/app-donnees.js:36-37 ; src/recuperation/coeur.js:20,188.
- **Correction proposée** : Retirer `approx` ; garder les champs testés mais les marquer « contrôle » dans le commentaire, ou les supprimer avec leurs assertions. Pour `format` : soit le vérifier au chargement (utile à la version web quand les données IndexedDB changent de forme), soit le retirer. Gain : environ 10 lignes.

### A3-12 · Restes de variantes dans afficherAutres (app/app.js)

- **Gravité** : confort · **effort** : S
- **Constat** : Après le passage de « 81 % → 83 % » au score projeté, il reste : `const unite = ''` interpolée quatre fois, `const quoi` constante, deux ternaires `sport === 'nba' ? ', 16 étoiles' : ''` dans des branches où sport ne peut plus valoir 'nba' (la première branche de `explication` le traite), deux textes d'explication identiques à « du jour » près, et un commentaire d'en-tête qui parle encore de « la chance de passer avant → après ».
- **Preuve** : app/app.js:946-948 (commentaire), 985, 990, 1001, 1004-1007.
- **Correction proposée** : Supprimer unite et quoi, retirer les deux ternaires morts, fusionner les deux textes ; environ 6 lignes en moins.

### A3-13 · CSS : 7 lignes mortes et un jeton inutilisé

- **Gravité** : confort · **effort** : S
- **Constat** : Sur 254 classes de app/style.css, cinq n'ont plus d'émetteur : .sr, .ico, .variante (2 règles, variantes repliées remplacées par le sélecteur Prudente / Équilibrée / Ambitieuse), .squad-grille (2 règles, ancienne mise en page du Squad). Le jeton --faible est défini quatre fois et jamais utilisé. Les classes construites par concaténation ont été contrôlées à la main et sont bien utilisées (pf-${ton}, jalon ${etat}, delta ${classe}, zone-maj ${classe}, V/N/D, tit/ent, e-${etat}). Tous les autres jetons sont utilisés et aucun var(--x) n'est indéfini.
- **Preuve** : app/style.css:86, 91, 521-522, 536-537 ; --faible : 19, 35, 50, 360. `grep -n 'class="sr\b\|squad-grille\|variante\|class="ico\|var(--faible' app/app.js app/index.html web/web.js app/style.css` → seulement deux commentaires (app.js:704, 923). Scripts : /tmp/claude-0/-home-user-sorare-aide/fb1537cc-4549-5f8a-93af-f10f0ac88595/scratchpad/axe3/css.mjs et css2.mjs.
- **Correction proposée** : Supprimer ces 7 règles et les 4 déclarations de --faible. Risque : .sr est une classe d'accessibilité classique ; si un texte réservé aux lecteurs d'écran est prévu, la garder.

### A4-09 · « Tester la clé » lance deux requêtes complètes de 26 000 de complexité pour lire un total

- **Gravité** : mineur · **effort** : S
- **Constat** : Le bouton « Tester la clé » de la version web envoie la requête CARTES entière (50 cartes, 15 matchs chacune, environ 26 656 de complexité et plusieurs centaines de Ko à travers le relais) pour chaque sport, puis n'en lit que totalCount.
- **Preuve** : web/web.js:346-349
- **Correction proposée** : Une requête dédiée : `user(slug:) { cards(sport:, first: 1) { totalCount } }` (complexité estimée sous 600 avec les champs actuels, bien moins sans le joueur). Gain : environ 52 000 de complexité et 1 à 2 s par test.

### A4-10 · Barème NBA relu à chaque récupération alors qu'il est gardé d'une fois sur l'autre

- **Gravité** : confort · **effort** : S
- **Constat** : Chaque récupération NBA fait une requête BAREME_NBA (3 matchs détaillés d'un joueur témoin). Le barème précédent est déjà conservé (`precedent.baremes`, avec `version` et `luA`) mais ne sert que de repli quand la lecture échoue.
- **Preuve** : src/recuperation/coeur.js:144-157 et 177 ; src/recuperation/requetes.js:94-99
- **Correction proposée** : Ne relire que si le barème précédent a plus de 24 h (ou est absent). Gain : 1 requête et environ 1 s par actualisation NBA. La règle « lire le barème dans l'API, ne pas le recopier » reste respectée.

### A4-16 · Chaque récupération écrit 33 Mo sur disque (dernier.json + instantané daté identique)

- **Gravité** : confort · **effort** : S
- **Constat** : npm run recuperer écrit data/dernier.json (16,7 Mo, dont 16,0 Mo d'historique de 40 matchs en clés longues, alors que le moteur n'en lit que 30 : fenetre_matchs) et, en plus, un instantané daté complet de 16 Mo dans data/<date>/. Deux actualisations par jour ajoutent environ 1 Go par mois dans la session cloud (dossiers ignorés par git, jamais purgés). Coût en temps faible (0,3 s de sérialisation), coût API nul.
- **Preuve** : src/recuperation/index.js:63-66 ; mesure : du -sh copie/data/2026-11-14T1846 → 16 Mo ; ls -la copie/data/dernier.json → 16 669 807 octets ; methode.md:22 (fenetre_matchs 30)
- **Correction proposée** : Dans l'instantané daté, ne garder que meta, cartes, matchs, paliers et les joueurs sans leur historique (déjà dans data/historique/) : environ 0,7 Mo au lieu de 16 ; ou ne conserver que les 5 derniers instantanés.

### C-03

(texte non retrouvé dans les données de la revue : voir le rapport)

### C-04

(texte non retrouvé dans les données de la revue : voir le rapport)

## Lot 3 · Évolutions (restes)

### A5-02 · Créneau unique élargi à une fenêtre de 30 minutes de coups d'envoi

- **Gravité** : important · **effort** : M
- **Constat** : Bénéfice : le créneau unique exige aujourd'hui une heure de coup d'envoi strictement identique. Les compositions sortent entre H-1 h 52 et H-44 min (relevés du 7 novembre) : pour des matchs décalés de 15 à 30 min, elles sont en pratique toutes publiées avant le premier coup d'envoi. Élargir multiplie les joueurs confirmés disponibles : sur les 29 créneaux à venir, 7 fenêtres de 30 min réunissent 2 ou 3 créneaux (19:30/19:45/20:00, 14:30/15:00…). Le 7 novembre, le créneau confirmé donnait 79 % contre 63-64 % avant compositions. Risque : pour le match le plus tardif de la fenêtre, la composition peut manquer au moment de composer ; il faut n'admettre que les titulaires confirmés pour les matchs postérieurs au premier, ou le signaler clairement.
- **Preuve** : src/moteur/compositions.js:29 (`l.match.debutUTC === o.creneau`) et 181-199 ; mesure : scratchpad/axe5/m3.mjs (29 créneaux → 21 fenêtres, 7 multi-créneaux) ; CLAUDE.md (79 % contre 63-64 %)
- **Correction proposée** : Ajouter un paramètre `creneau_fenetre_min` (30) dans methode.md section 7 ; `proposerParCreneau` regroupe les coups d'envoi dont l'écart au premier est ≤ fenêtre ; `cartesAdmissibles` accepte `o.creneaux` (ensemble). Afficher « 14:30 – 15:00 » et l'état des compositions par match. Un test dans tests/compositions.test.js.

### A4-01 · Historiques de football regroupables par alias : 756 requêtes d'initialisation réductibles à une quarantaine

- **Gravité** : important · **effort** : M
- **Constat** : L'initialisation fait une requête HISTORIQUE par joueur (756 en football, 364 en NBA), soit 97 % des requêtes et 6 à 10 min. CLAUDE.md note que allPlayerGameScores est refusé dans une liste ; c'est vrai pour players(slugs:) (revérifié aujourd'hui), mais pas pour des alias sous le champ football : `football { c0: card(slug: "…") { anyPlayer { slug allPlayerGameScores(first: 40) {…} } } c1: … }` a renvoyé 3 joueurs × 40 matchs en une seule requête de 0,82 s (88 Ko). La complexité par alias n'a pas été mesurée (environ 330 d'après CLAUDE.md, donc un plafond théorique vers 80 joueurs par requête : à vérifier). Pas d'équivalent trouvé pour la NBA (pas de racine nba dans le schéma ; anyCard est un champ racine, non répétable) : à vérifier.
- **Preuve** : src/recuperation/coeur.js:116-119 (une requête par joueur) ; src/recuperation/requetes.js:84-90 ; mesure rejouable : curl --data @/tmp/claude-0/-home-user-sorare-aide/fb1537cc-4549-5f8a-93af-f10f0ac88595/scratchpad/axe4/r6.json (réponse rep6.json : 3 joueurs, 40 matchs chacun) ; refus de players(slugs:) : rep5.json
- **Correction proposée** : Dans coeur.js, compléter les joueurs de football par lots de 20 (alias cN sur un slug de carte du joueur, corps commun dans un fragment pour rester sous les 20 000 caractères du relais), enregistrer chaque joueur du lot aussitôt (la reprise est conservée), retomber sur la requête unitaire si le lot échoue. Gain estimé : football 756 → 38 requêtes ; durée 5 à 7 min → 2 à 3 min (0,27 s par joueur mesuré en lot de 3, contre 0,42 s en Node et 0,55 s par le relais ; à confirmer sur des lots de 20). Mesurer d'abord la complexité d'un lot.

### A5-10 · Rétro-test d'équipe : tester la vraie sélection du moteur et hors échantillon

- **Gravité** : important · **effort** : M
- **Constat** : Bénéfice : outils/retro-test-equipe.js compose des équipes au hasard parmi les meilleures espérances et prend pour cible des quantiles de la simulation ; il ne teste ni le choix réel (`proposer`, maximum de 60 équipes simulées, donc biais de sélection possible au niveau de l'équipe), ni des cibles fixes de paliers. De plus les tables (jouer, retrait, passer) sont estimées sur les 26 mêmes journées (limite écrite dans methode.md). Un essai avec `proposer` donne : football cible 300, annoncé 34-36 % contre réalisé 40-45 % (83 journées, compatible à ±5 points) ; cible 360, 8-9 % contre 6-10 % ; NBA cible 180, annoncé 13-15 % contre réalisé 9-11 % (35 journées), cible 210 annoncé 4 %, réalisé 0 sur 35. Rien d'alarmant, mais c'est ce test-là qui répond à « franchir plus de paliers ». Risque : nul (outil de contrôle) ; 51 s de calcul en football.
- **Preuve** : outils/retro-test-equipe.js:68-86 (équipes au hasard) et 109-114 (cibles = quantiles) ; methode.md:313 ; mesure : scratchpad/axe5/retro-argmax.mjs
- **Correction proposée** : Ajouter outils/retro-test-proposer.js (base : le script de mesure cité) : pour chaque journée, `proposer` à cibles fixes des paliers, comparaison annoncé / réalisé pour passer, « les 5 jouent » et part des joueurs alignés qui ont joué ; option de validation croisée (tables estimées sur les journées paires, vérifiées sur les impaires). Reporter les chiffres datés dans methode.md 5 bis.

### A5-07 · NBA : chances de jouer sous-estimées pour les joueurs à 20 minutes et plus

- **Gravité** : important · **effort** : M
- **Constat** : Bénéfice : avec la vraie sélection du moteur (filtre 20 min compris), les joueurs NBA alignés ont une chance annoncée moyenne de 90,9 % et ont joué 94,9 % du temps ; « les 5 jouent » annoncé 62 %, réalisé 80 % (prudente, 35 journées ; équilibrée : 58,5 % contre 68,6 %). La table de calibrage NBA plafonne à 91,6 % quel que soit le temps de jeu, alors que les joueurs à gros temps de jeu sont plus sûrs. Recaler p selon les minutes projetées rendrait le seuil de 80 % plus discriminant et la simulation plus juste (aujourd'hui l'erreur est compensée globalement par la table finale 50 → 40,5 %). Risque : échantillon petit (35 journées, ±7 points) ; le rétro-test ignore les blessures connues ; à refaire avec plus de journées avant de changer les tables. À vérifier sur un échantillon plus large.
- **Preuve** : methode.md:39 (calibration_jouer NBA, maximum 0,916) ; src/moteur/jouer.js:73 ; mesure : node scratchpad/axe5/retro-argmax.mjs nba 180,210 2
- **Correction proposée** : Dans outils/retro-test.js, estimer la table de calibrage NBA par tranche de minutes projetées (< 20, 20-28, > 28) ; si l'écart se confirme, ajouter `calibration_jouer_minutes` à methode.md (1 ter) et recaler ensuite `calibration_passer.nba` avec outils/retro-test-equipe.js.

### A2-06 · Calculs sur le fil principal : 3 s de blocage par tâche sur un appareil lent, dont une part inutile sur téléphone

- **Gravité** : important · **effort** : M
- **Constat** : Processeur ralenti 4 fois (390 px), chaque écran n'est entièrement prêt qu'après 7,1 à 9,3 s, avec des tâches bloquantes de 3,1 à 3,4 s pendant lesquelles appuis et défilement ne répondent pas (cumul 6,6 à 8,7 s). Hors accueil, la page calcule les propositions Solo des deux sports pour afficher « Palier 360 · 13 % » dans la barre latérale, y compris sur téléphone où cette barre est masquée et où rien d'autre n'affiche ce chiffre. Sur Squad et Mes cartes, c'est l'essentiel du blocage (environ 1,3 s à vitesse normale, 6,5 s ralenti). Ces deux calculs passent en plus avant les Autres choix du Squad dans la file : équipe du Squad visible à 0,5 s, Autres choix à 1,6–1,8 s (7,2 s ralenti). Le plan de refonte prévoyait un Web Worker (CLAUDE.md : « Pas de Web Worker »).
- **Preuve** : app/app.js:1655 (propositions des deux sports pour la barre latérale, sans condition de largeur) ; app/app.js:316-320 (plusTard : file unique sur le fil principal) ; app/style.css:146 (.laterale masquée sous 1 024 px) ; mesures rejouables : node /tmp/claude-0/-home-user-sorare-aide/fb1537cc-4549-5f8a-93af-f10f0ac88595/scratchpad/axe2/t5.js 4 390
- **Correction proposée** : Court terme : ne lancer le calcul de la ligne 1655 que si la barre latérale est affichée (≥ 1 024 px), et le mettre après les Autres choix. Moyen terme : déplacer propositions, créneaux, Squad et Autres choix dans un Web Worker (le moteur est du JavaScript pur), ou découper la simulation en tranches de moins de 50 ms.

### A5-06 · Anomalies de la récupération : 96 % de bruit, et jamais montrées à l'utilisateur

- **Gravité** : important · **effort** : S
- **Constat** : Bénéfice : les 100 anomalies du jour sont 96 « club absent du prochain match (sélection ?) » et 4 « pas de prochain match ». Le test de la récupération n'utilise pas `equipeDuMatch` : 94 de ces 96 joueurs sont pourtant reconnus par le moteur depuis la correction du 14 novembre. Ce bruit noie les anomalies qui comptent pour ne pas aligner un absent : compositions illisibles pour un match, blessures ESPN illisibles, historique complet impossible, barème NBA non lu. Aucune n'atteint l'interface (`meta.anomalies` n'est pas transmis ; la console n'affiche qu'un nombre). Si ESPN échoue, les blessés NBA non signalés par Sorare restent proposables sans aucun signe. Risque : nul.
- **Preuve** : src/recuperation/coeur.js:64-67 (test sans equipeDuMatch), 81, 123, 139, 156 (anomalies utiles) ; src/app-donnees.js:37 (anomalies non transmises) ; src/recuperation/index.js:68 (nombre seul) ; mesure : scratchpad/axe5/mesures.mjs (96 signalés, 2 non reconnus)
- **Correction proposée** : 1) Dans coeur.js, ne signaler la sélection que si l'historique ne contient aucune des deux équipes du match (même règle que jouer.js:10-16). 2) Typer les anomalies `{gravite: 'info'|'alerte', sport, texte}` ; « alerte » pour compositions illisibles, ESPN illisible, historique impossible, cartes manquantes. 3) Transmettre les alertes dans `meta` et les afficher : bandeau « Blessures ESPN non lues à 18:46 : vérifie les blessés NBA » dans Solo/Squad NBA, « composition illisible pour A–B » sur les joueurs concernés.

### A2-14 · État du palier football ambigu : « composition posée » et « 3 échecs », 15 cartes bloquées

- **Gravité** : mineur · **effort** : S
- **Constat** : Pour le palier 360, les données donnent : état LINEUP_SET, tentatives restantes 1, en cours 0, échecs 3. L'appli affiche « composition posée, matchs à venir · 3 échecs » et « 3 tentatives déjà jouées : 15 cartes sont bloquées ». Si une composition est posée et qu'il reste une tentative sur 4, la lecture naturelle est 2 échecs + 1 composition posée ; l'appli compte la composition posée comme un échec, parce que le nombre de compositions en cours vaut 0. En NBA le même jour (restantes 2, en cours 1, 1 échec), l'affichage est cohérent. À vérifier avec l'utilisateur dans Sorare : nombre réel d'échecs au palier 360, et comportement du compteur « en cours » quand la composition n'a pas encore de match commencé.
- **Preuve** : data/dernier.json de la copie (paliers : football niveau 2, etat LINEUP_SET, tentativesRestantes 1, enCours 0, echecs 3) ; app/app.js:335-341 (libellés et etatPalier) ; capture /tmp/claude-0/-home-user-sorare-aide/fb1537cc-4549-5f8a-93af-f10f0ac88595/scratchpad/axe2/m-390-light-_football_solo.jpg (390 px, clair)
- **Correction proposée** : À vérifier d'abord. Si la composition posée n'est pas comptée dans « en cours » avant le premier coup d'envoi : avec l'état LINEUP_SET et en cours = 0, afficher « 2 échecs + 1 composition posée ». Le total de cartes bloquées reste 15.

### A5-01 · Garder l'équipe posée et alerter quand une composition officielle (ou une blessure) la contredit

- **Gravité** : bloquant · **effort** : M
- **Constat** : Bénéfice : c'est le levier le plus direct sur la priorité absolue. Mesure : sans composition, un joueur aligné par le moteur ne joue que 87-88 % du temps en football, et les 5 jouent dans 51 à 57 % des équipes (83 journées rejouées). Or « J'ai joué cette équipe » ne retient qu'une liste d'identifiants de cartes par palier : ni l'équipe, ni le capitaine, ni l'heure de verrouillage. Après un « actualise », rien ne dit que X, posé ce matin, est absent de la feuille de match ou passé « Out » chez ESPN alors que l'équipe n'est pas encore verrouillée (premier coup d'envoi). Risque : faible ; l'équipe réellement posée dans Sorare peut différer de celle marquée (saisie à la main), l'alerte doit donc rester une invitation à vérifier. Ne touche pas aux décisions écartées (pas de plan sur les vies).
- **Preuve** : app/app.js:1362-1368 (jouerEquipe ne garde que les ids) ; app/app.js:114 et 166-169 (forme de l'état : cible + jouees) ; mesure : scratchpad/axe5/retro-argmax.mjs (football : a joué 87,7 % ; les 5 jouent 54,2 %)
- **Correction proposée** : Enregistrer dans l'état, en plus de `jouees`, la tentative posée : `{cartes, capitaine, poseeA, verrouillage}` (dernière tentative par sport). À chaque chargement de données, tant que `verrouillage` est dans le futur, recalculer le statut de ses 5 cartes : si l'une devient exclue, douteuse, « absent de la feuille » ou « remplaçant annoncé », afficher en tête de l'accueil et du Solo une alerte rouge « Ton équipe posée : X ne joue pas. Remplace-le avant HH:MM », avec les meilleurs remplaçants (autresChoix existe déjà). Après le verrouillage : simple information.

### A5-03 · Version web : bouton « Vérifier les compositions » (quelques requêtes au lieu d'une actualisation complète)

- **Gravité** : important · **effort** : M
- **Constat** : Bénéfice : entre H-1 h et le coup d'envoi, l'utilisateur doit relire les compositions ; le ↻ refait tout pour tous les sports (36 requêtes, 38 s le 14 novembre ; plus long à travers le relais et sur téléphone). La lecture des compositions est déjà une étape isolée (une requête par match proche) : pour l'équipe proposée ou posée, 1 à 5 requêtes suffisent, soit 2 à 3 s. Parcours du soir plus court, donc plus de chances qu'il soit fait. Risque : les données deviennent hétérogènes (compositions plus fraîches que le reste) ; il faut dater la lecture (`releveA` existe) et ne pas changer l'âge global. Dans l'artifact, la même idée demande une seconde tâche programmée « compositions seulement » : à vérifier.
- **Preuve** : src/recuperation/coeur.js:70-86 (étape compositions, une requête par match) ; web/web.js:472 (↻ = récupération de tous les sports) ; data/dernier.json meta : nbRequetes 36, dureeS 38
- **Correction proposée** : Extraire de coeur.js une fonction `relireCompositions(matchs, deps)` ; dans web.js exposer `SORARE_WEB.verifierCompositions(ids de matchs)` qui met à jour `match.compositionsOfficielles` dans IndexedDB puis recharge ; bouton dans le Solo (plusieurs créneaux et créneau unique) visible quand un match de l'équipe commence dans moins de 2 h.

### A5-04 · Rappel d'actualisation calé sur le coup d'envoi, en plus du bandeau des 3 h

- **Gravité** : important · **effort** : S
- **Constat** : Bénéfice : le bandeau orange ne dépend que de l'âge (≥ 180 min). Des données de 1 h 30 relevées à H-2 h paraissent « fraîches » alors qu'elles ne contiennent aucune composition et que le match commence dans 30 min ; l'équipe affiche seulement « plafond … avant les compos ». Un message ciblé (« Coup d'envoi de ton équipe dans 40 min, compositions non lues : actualise ») traite exactement le cas qui fait aligner un absent. Risque : faible ; complète la décision des 3 h sans la changer.
- **Preuve** : app/app.js:724-728 (vieux = min ≥ 180) et 776-781 (bandeau) ; app/app.js:656 et 668 (seule mention : « plafond … avant les compos ») ; methode.md:57 (horizon 6 h)
- **Correction proposée** : Dans kpisEquipe et à l'accueil : si le premier coup d'envoi de l'équipe proposée (ou posée, A5-01) est à moins de 75 min et que la composition d'un de ses matchs de football n'est pas publiée dans les données (ou que `releveA` date d'avant H-60 min), afficher une alerte avec le bouton ↻. En NBA : même alerte si la lecture ESPN date de plus de 2 h avant le premier match.
