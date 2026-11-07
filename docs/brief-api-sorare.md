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
| Paliers Arcade, état de chaque palier, nombre de tentatives | Le tableau Squad (revient vide) |
| Statut de jeu Sorare (titulaire, remplaçant…) et projection Sorare (NBA) | Les compositions probables (piste non testée) |

## Ce qu'on récupère (vérifié)

### Tes cartes
- **Liste complète**, football et NBA : 635 et 394 cartes, en environ 15 secondes au total.
- **Rareté et saison** : toutes tes cartes sont `common` de 2026.
- **Bonus de collection, carte par carte**, avec son nom : Standard (+0 %), Shiny (+5 %), Holo (+10 %), Four Suits (+15 %), Eclipse (+20 %). Les cinq ont été vus sur tes cartes, avec des valeurs conformes à la table des règles.

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
- **Le nombre de tentatives par palier** : 4 au maximum, ce qui correspond aux 4 vies. Un compteur de tentatives restantes existe ; au palier 300, il indique 1 restante et 1 en attente. **Son sens exact reste à confirmer avec toi.**
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
| Ton palier en cours, en direct | Même raison. | On le déduit de l'état des paliers, ce qui suffit en pratique. |
| Cotes des matchs NBA | Ces champs n'existent pas pour le basket dans l'API. | Rien de prévu. Le contexte NBA se limite au lieu et à la date. |
| Projection Sorare pour la plupart de tes joueurs de football | Sorare ne la calcule que pour une partie des joueurs (27 sur 635). | Notre projection transparente couvre tous les joueurs qui ont joué. |
| Tableau Squad de ton profil | La requête revient vide. | La « meilleure équipe du jour » n'en a pas besoin : on la calcule à partir des cartes. |
| Tout ce qui touche à ton compte (solde, offres, notifications…) | Réservé à l'utilisateur connecté, et hors du périmètre de l'outil. | Rien : ce n'est pas utile ici. |
| Bonus « même club » du centre d'aide | Le champ existe mais vaut 0 carte par carte. Il dépend sans doute de la composition. | À vérifier. |

## Ce qui reste à tester

- **Compositions probables des matchs de football** (`homeFormation` / `awayFormation`) : potentiellement précieux pour la titularisation.
- **Texte détaillé des règles de chaque palier**, pour contrôler les fichiers de `regles/` contre la source officielle.
- **Minutes projetées en NBA** (champ vide au premier essai).
- **Autres moyennes** : 10 derniers matchs joués, 40 derniers matchs, saison.
- **Sens exact du compteur de tentatives restantes.**

## Contraintes pratiques

- **Débit** : plafond de 150 requêtes par minute dans l'outil, pour une limite Sorare de 200. Récupérer tout ton catalogue coûte 21 requêtes.
- **Taille des requêtes** : une requête ne peut pas dépasser une certaine complexité (30 000 avec la clé). Une page de 50 cartes avec toutes les infos coûte environ 7 000 à 8 000.
- **Schéma** : il se télécharge en entier, mais on ne peut pas l'explorer de façon interactive. Il faut chercher les champs dans le fichier, puis les tester.
- **Fraîcheur** : les cotes et les blessures bougent jusqu'au coup d'envoi. Une récupération le jour même reste la règle.

## Conséquences pour l'outil

1. **La projection repose sur des données solides** : forme, régularité de jeu, blessures, bonus. La probabilité de titularisation fournie par un prestataire manque ; on la remplace par l'historique, et c'est un point faible assumé.
2. **Pour planifier un palier Arcade, il faudra une saisie de ta part** : les cartes déjà jouées au palier en cours. Le reste (cible, état du palier, nombre de tentatives) se lit dans l'API.
3. **Les cotes de match football sont disponibles** : elles sont affichées aujourd'hui, et pourront entrer dans la projection une fois calibrées sur l'historique.
