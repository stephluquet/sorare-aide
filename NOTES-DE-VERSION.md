# Notes de version

## 1.0 (14 novembre 2026)

Première version complète, utilisée au quotidien en football et en NBA, en ligne et en local.

### Modes de jeu
- **Solo (Arcade)** : l'équipe qui a le plus de chances de franchir le palier en cours.
  - Trois propositions dans un sélecteur : prudente (les joueurs les plus sûrs de jouer), équilibrée (la meilleure chance), ambitieuse (accepte des joueurs moins sûrs).
  - Mode **créneau unique** : les 5 matchs commencent à la même heure, pour composer juste après les compositions officielles.
  - Règles respectées : postes et capitaine en football (+50 %, cumulé par addition avec le bonus de carte) ; plafond de 16 étoiles inclus en NBA ; compétitions autorisées (dont la Ligue des nations) ; un joueur une seule fois ; cartes déjà jouées au palier écartées.
- **Squad** : la meilleure équipe des **matchs du jour**, au sens du score projeté. Les cartes jouées en Solo sont autorisées.
- **Autres choix**, en Solo comme en Squad : en football, un groupe par joueur de l'équipe, dans l'ordre de l'équipe ; en NBA, un groupe par nombre d'étoiles. Chaque carte montre le score projeté de l'équipe avant → après. En Solo, une mention signale une carte qui monte le score sans améliorer les chances de passer.
- **Mes cartes** :
  - filtres par poste (celui de la carte), étoiles, type de carte, journée Sorare, chances de jouer (football) et minutes projetées (NBA) ;
  - tris variés ; vue **liste avec fiche épinglée** ou vue **tableau** aux colonnes fixes ;
  - marquage des cartes jouées, partagé entre appareils dans l'artifact, gardé dans le navigateur sur le site.

### Calcul (voir `methode.md`)
- **Chances de jouer** :
  - estimées sur l'historique, pondéré vers les matchs récents, puis calibrées par tranches ;
  - blessures et suspensions de Sorare, et blessures ESPN en NBA ;
  - 2e soir de suite en NBA ;
  - en football, les **compositions officielles** l'emportent sur tout : titulaire confirmé = 100 %, remplaçant = sa chance d'entrer, absent = exclu.
- **Score projeté** :
  - football : mélange titulaire / entré en jeu, rapproché de la moyenne du poste, et décalé selon la cote de victoire ;
  - NBA : minutes projetées × points par minute, avec une fourchette de minutes et un signal « en hausse ».
- **Chances de passer** : simulation de 5 000 tirages à graine fixe, puis calibrage final sur des rétro-tests au niveau de l'équipe.
- Seuils de Solo et de Squad fixes : 80 % de chances de jouer, et 20 minutes projetées en NBA.

### Interface
- Navigation par sport (Football / NBA) puis par mode (Solo, Squad, Mes cartes), sur l'accueil et dans le menu.
- **PC** : barre latérale, fiche en volet, fiche épinglée en 3e colonne à partir de 1 800 px (1 024 px dans Mes cartes).
- **Téléphone** : barre en haut et onglets en bas.
- Accueil animé (three.js) avec les chances de passer de chaque sport ; thèmes clair et sombre.
- Une seule ligne joueur partout :
  - football : chances de jouer, puis le score de titulaire en grand, et dessous « toujours titulaire » ou « s'il entre » ;
  - NBA : minutes projetées et score projeté.
- **Dataviz** : distribution du score de l'équipe face à la cible, « qui porte l'équipe », cases d'étoiles, cote V/N/D, historique des 15 derniers matchs, forme du joueur et de son équipe, profil NBA en points Sorare.
- Nom et logo **Sorar'help**, écran de démarrage, image d'aperçu des liens partagés.

### Données et déploiement
- **Site autonome** sur Cloudflare Pages :
  - clé API de l'utilisateur gardée dans son navigateur ;
  - relais en lecture seule ;
  - historique dans IndexedDB, initialisation qui reprend après une coupure ;
  - mise à jour incrémentale ;
  - sauvegarde et restauration dans un fichier.
- **Page unique** (artifact Claude ou fichier local) construite par `npm run app`.
- **Récupération** :
  - partagée entre Node et le navigateur ;
  - au plus 150 requêtes par minute ;
  - historique de 40 matchs par joueur, mis à jour de façon incrémentale ;
  - barème NBA lu dans l'API, jamais recopié.

### Corrections notables avant la 1.0
- Joueurs en sélection nationale classés à tort « douteux ».
- Le poste retenu est celui de la carte, pas celui du joueur (ex. Oscar Bobb).
- Seuil de 90 % qui excluait tout le monde.
- Doublons dans le Squad.
- Débordements d'affichage sur PC.
- Fiche épinglée vide après un changement d'écran.
