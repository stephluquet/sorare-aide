# API Sorare : ce qu'on peut récupérer, et ce qu'on ne peut pas

*Brief du 7 novembre 2026, compte `yapapir`. Tout ce qui est marqué « vérifié » a été testé sur tes vraies cartes ce jour-là.*

## Le cadre d'accès

- On interroge l'API publique de Sorare avec une **clé API**, fournie par l'environnement. Cette clé donne du débit (jusqu'à 200 requêtes par minute), mais **elle ne connecte pas ton compte** : pour Sorare, on est un visiteur anonyme qui consulte le profil public de `yapapir`.
- Tout ce que Sorare réserve à « l'utilisateur connecté » est donc hors de portée. C'est la limite principale.
- L'outil ne fait **que lire** : aucune enchère, aucun achat, aucune composition envoyée.

## En une minute

| On a | On n'a pas |
|---|---|
| Toutes tes cartes, avec rareté, bonus de collection, tier et étoiles | La **probabilité de titularisation** (le champ existe, mais il revient vide) |
| Moyennes L5 et L15, 15 derniers scores match par match | Le **contenu de tes compositions**, donc les **cartes bloquées** en Arcade |
| Blessures et suspensions en cours | Ton **palier en cours** de façon directe (on le déduit de l'état des paliers) |
| Prochain match : date, adversaire, domicile ou extérieur | Les **cotes des matchs NBA** |
| **Cotes du match en football** (victoire, nul, défaite, clean sheet) | Une projection Sorare pour la plupart de tes joueurs de football |
| Paliers Arcade, état de chaque palier, vies restantes et échecs | Le tableau Squad (revient vide) |
| Statut de jeu Sorare (titulaire, remplaçant…) et projection Sorare (NBA) | Les compositions officielles **avant H-1 h** (elles n'apparaissent qu'environ une heure avant le match) |

## Ce qu'on récupère (vérifié)

### Tes cartes
- **Liste complète**, football et NBA : 635 et 394 cartes, en environ 15 secondes au total.
- **Rareté et saison** : toutes tes cartes sont `common` de 2026.
- **Bonus de collection, carte par carte**, avec son nom : Standard (+0 %), Shiny (+5 %), Holo (+10 %), Four Suits (+15 %), Eclipse (+20 %). Les cinq ont été vus sur tes cartes, avec des valeurs conformes à la table des règles.

- **Visuels** : l'API donne l'adresse de l'image de chaque carte (PNG), de sa vidéo animée, du dos de carte, de la photo du joueur et du logo du club.
  - Le serveur d'images (`assets.sorare.com`) est autorisé dans l'environnement depuis le 7 novembre : l'image de carte (PNG 771 × 1 248, rareté et collection visibles), la vidéo et le logo du club se téléchargent.
  - Seul le dos de carte, sur un autre serveur, reste inaccessible : sans importance.

### Le joueur
- **Poste** : gardien, défenseur, milieu, attaquant en football ; meneur, ailier, pivot en NBA. Un joueur peut en avoir plusieurs.
- **Club actuel.**
- **Tier et étoiles** : GOAT 5★, STAR 4★, IMPACT 3★, ROSTER 2★, DNP 1★, plus des variantes « + » à une demi-étoile au-dessus.
  - Ce sont des données **du joueur**, pas de la carte : deux cartes du même joueur ont les mêmes étoiles.
  - Les noms diffèrent de ceux du centre d'aide (Icon, Reserve…) : la correspondance est à confirmer.

### La forme
- **Moyennes L5 et L15.** Attention : elles ne comptent **que les matchs joués**. Un match où le joueur n'a pas joué n'est pas compté comme un 0, il est simplement ignoré. Un L5 élevé ne dit donc rien de sa régularité.
- **Les 15 derniers matchs de l'équipe, un par un** : date, score, et statut (joué, non joué, en cours de vérification). C'est ce qui permet de mesurer la régularité de jeu et la dispersion des scores.
- D'autres moyennes existent mais n'ont pas été testées : 10 derniers matchs joués, 40 derniers matchs, saison.

### La disponibilité
- **Blessures en cours**, avec le type de blessure et souvent une date de retour prévue.
- **Suspensions en cours**, avec la compétition concernée. Les informations sont parfois pauvres, par exemple « raison inconnue ».

### Le prochain match
- Date et heure, compétition, adversaire, domicile ou extérieur.
- **Cotes du match en football** : probabilités de victoire, de nul et de défaite de l'équipe, cote de clean sheet et cote de « 3 buts ou plus ». Exemple : Arsenal–Hull, 82 % / 12 % / 6 %.
  - Elles n'apparaissent que **quelques jours avant** le match : vides pour un match dans deux semaines, présentes pour 553 de tes 635 cartes ce week-end.
- **Limite** : pour un match de sélection nationale, on ne sait pas dire si l'équipe joue à domicile, et on n'a pas ses cotes. Le club du joueur n'apparaît pas dans le match (12 cas en novembre).

### Ta progression Arcade (en partie)
- **Les paliers et leur score cible** : football 260, 300, 360, 400, 440, 480 ; NBA 150, 180, 210, 240, 270, 290. Ils correspondent exactement aux fichiers de règles.
- **L'état de chaque palier** : passé (`CLAIMED`), composition posée (`LINEUP_SET`), verrouillé (`LOCKED`)… Au 7 novembre :
  - en football, tu as passé le palier 260 et une composition est posée pour le 300 ;
  - en NBA, tu as passé le 150 et une composition est posée pour le 180.
- **Les vies, palier par palier** : 4 tentatives au maximum, et deux compteurs qui suffisent à tout reconstituer.
  - « restantes » = 4 − tentatives déjà utilisées (réussies, échouées ou en cours) ;
  - « en cours » = compositions posées et pas encore jouées ;
  - nombre d'échecs = 4 − restantes − en cours.
  - Au palier 300 football : 1 restante et 1 en cours, donc **2 échecs, une composition en cours et une dernière vie ensuite**. Confirmé avec toi le 7 novembre.
- **La liste des règles appliquées à chaque palier** (rareté, capitaine, compétitions, matchs joués). Leur texte détaillé n'a pas encore été lu.

### Les données « maison » de Sorare (calcul non publié)
- **Statut de jeu** (football) : titulaire, régulier, remplaçant, super-remplaçant, ne joue pas. C'est une catégorie, pas une probabilité.
- **Projection Sorare du prochain match** : disponible pour **toutes** tes cartes NBA, mais seulement 27 cartes football sur 635.
- En NBA, on a aussi les points projetés.
- On ne sait pas comment Sorare les calcule. L'outil les **affiche pour comparaison** mais ne les utilise pas dans ses calculs.

## Ce qu'on ne peut pas récupérer

| Information | Pourquoi | Que faire |
|---|---|---|
| Probabilité de titularisation (titulaire, remplaçant, absent) | Le champ existe mais revient vide avec notre clé, même pour Kane ou Mbappé un jour de match. Sans doute réservé aux comptes connectés ou à un abonnement. | On estime la probabilité de jouer à partir des 15 derniers matchs, des blessures et des suspensions. L'étape 3 prévoit une vérification des compositions avec des sources citées. |
| Tes compositions Arcade et les **cartes bloquées** | Réservé à l'utilisateur connecté : refus explicite « You should log in ». | **Tu devras indiquer** les cartes déjà jouées au palier en cours (ou les cocher dans l'outil). |
| Ton palier en cours, en direct | Même raison. | On le déduit de l'état des paliers et des compteurs de tentatives, ce qui suffit en pratique. |
| Cotes des matchs NBA | Ces champs n'existent pas pour le basket dans l'API. | Rien de prévu. Le contexte NBA se limite au lieu et à la date. |
| Projection Sorare pour la plupart de tes joueurs de football | Sorare ne la calcule que pour une partie des joueurs (27 sur 635). | Notre projection transparente couvre tous les joueurs qui ont joué. |
| Tableau Squad de ton profil | La requête revient vide. | La « meilleure équipe du jour » n'en a pas besoin : on la calcule à partir des cartes. |
| Tout ce qui touche à ton compte (solde, offres, notifications…) | Réservé à l'utilisateur connecté, et hors du périmètre de l'outil. | Rien : ce n'est pas utile ici. |
| Bonus « même club » du centre d'aide | Le champ existe mais vaut 0 carte par carte. Il dépend sans doute de la composition. | À vérifier. |

## Testé ensuite (7 novembre, récap)

- **Pourcentage de matchs joués** sur 5, 10, 15 et 40 matchs : disponible directement (nombre de matchs joués dans la fenêtre).
- **Moyennes** sur les 10 derniers matchs joués, sur 40 matchs et sur la saison : disponibles.
- **Situation match par match** : titulaire (et s'il a été remplacé), entré en jeu, resté sur le banc, absent de la feuille, avec les minutes jouées.
- **Historique sur 40 matchs** : possible, mais **joueur par joueur**. Ça fait une requête par joueur, soit environ 4 minutes pour tout ton football. La liste des cartes s'arrête à 15 matchs.
- **Heure exacte de chaque match** : oui, à la minute.
- **Texte officiel des règles de chaque palier** : lu, identique sur les 6 paliers, et conforme à nos fichiers de règles. Il y a deux ajouts :
  - en football, seuls les joueurs de certaines compétitions sont autorisés : Bundesliga, Ligue 1, Premier League, Liga, les trois coupes d'Europe et la Ligue des nations ;
  - en NBA, le texte dit « en dessous de 16 étoiles ». Un total de 16 pile est-il autorisé ? À vérifier.
- **Minutes projetées NBA** : toujours vides, même le jour du match. Les points, rebonds et passes projetés sont disponibles.
- **Compositions officielles des matchs** (`homeFormation` / `awayFormation`), vérifié le 7 novembre sur trois matchs (8 relevés) : relevés des 7 novembre (8 relevés de 10:37Z à 15:00Z, `data/releves/compositions-2026-11-07.jsonl`) : les compositions apparaissent **environ 1 h avant le coup d'envoi**, pour les deux équipes à la fois, avec 11 titulaires et 8 ou 9 remplaçants : Leeds–Tottenham entre H-1 h 52 et H-57 min ; Mainz–Bayern entre H-59 et H-44 min (vue par `npm run recuperer` à 13:46Z, comme les 3 autres matchs de Bundesliga du créneau) ; Arsenal–Hull entre H-1 h 29 et H-59 min. Rien avant (listes vides, `startingLineupAvailable` faux). Elles restent lisibles pendant et après le match. **Les probabilités de titularisation restent `null` du début à la fin** (0 sur 40 lectures, même avec les compositions publiées). **Conséquence pour le mode créneau unique** : composer entre H-1 h et le coup d'envoi, après avoir actualisé ; c'est là que la chance de passer bondit (Bundesliga du 7 novembre : 63-64 % avant, 79 % avec les compositions).

## Contraintes pratiques

- **Débit** : plafond de 150 requêtes par minute dans l'outil, pour une limite Sorare de 200. Récupérer tout ton catalogue coûte 21 requêtes.
- **Taille des requêtes** : une requête ne peut pas dépasser une certaine complexité (30 000 avec la clé). Une page de 50 cartes avec toutes les infos coûte environ 7 000 à 8 000.
- **Schéma** : il se télécharge en entier, mais on ne peut pas l'explorer de façon interactive. Il faut chercher les champs dans le fichier, puis les tester.
- **Fraîcheur** : les cotes et les blessures bougent jusqu'au coup d'envoi. Une récupération le jour même reste la règle.

## Conséquences pour l'outil

1. **La projection repose sur des données solides** : forme, régularité de jeu, blessures, bonus. La probabilité de titularisation fournie par un prestataire manque ; on la remplace par l'historique, et c'est un point faible assumé.
2. **Pour planifier un palier Arcade, il faudra une saisie de ta part** : les cartes déjà jouées au palier en cours. Le reste (cible, état du palier, vies restantes, échecs) se lit dans l'API.
3. **Les cotes de match football sont disponibles** : elles sont affichées aujourd'hui, et pourront entrer dans la projection une fois calibrées sur l'historique.
