# Notes de version

## 1.1 (15 novembre 2026)

Suite de la revue critique de la version 1.0 : corrections, puis refonte des écrans les plus utilisés. Le calcul ne change pas.

### Cartes « déjà utilisées » (remplace le marquage des cartes jouées)
- Règle corrigée : une carte jouée redevient disponible **au même palier** dès que sa composition est terminée.
- Un bouton **« Déjà utilisée »** sur chaque joueur de l'équipe proposée, des autres choix et dans la fiche : la carte est écartée du Solo jusqu'à la fin estimée de son match, puis revient toute seule.
- **« J'ai joué cette équipe »** écarte les cinq cartes jusqu'à la fin du dernier de leurs matchs.
- Un bloc « Déjà utilisées » liste les cartes écartées, avec « Remettre ».

### Solo
- **Bandeau du coup d'envoi** : orange à moins de 90 min du verrouillage ; rouge, à toute heure, si un joueur de l'équipe est remplaçant annoncé, absent de la feuille de match ou blessé. Rouge aussi sur l'accueil.
- **Sélecteur d'équipe** : « Prudente · Équilibrée · Créneau unique » au même endroit, avec les chances de passer sous chaque nom (dont la meilleure chance d'un créneau unique).
- **Téléphone, l'équipe d'abord** : palier sur une ligne, trois tuiles (chances, score, verrou), l'équipe, le bouton, puis le détail (autres chiffres et graphiques).
- **PC, de 1 420 à 1 899 px** : la fiche du joueur s'ouvre dans la colonne de droite (onglets « Autres choix » / « Fiche joueur »), l'équipe reste visible. Pareil en Squad.
- Le mode et le créneau choisis sont gardés après une mise à jour.
- Équipes NBA triées par score projeté.

### Ligne joueur, la même partout
- **Téléphone** : une rangée par information (nom ; poste, étoiles, type de carte ; date et adversaire ; score et chances de jouer ou minutes ; forme de l'équipe).
- **PC** : quatre colonnes ; la forme de l'équipe passe en petites pastilles sous le match.
- Même police pour les chances de jouer (ou les minutes) et le score ; chaque barre sous son chiffre, de même largeur ; barre de fourchette du score aussi en football.
- Forme du joueur (« en forme », « en baisse ») à côté de son score ; capitaine sur le coin de la vignette ; type de carte après les étoiles.
- « Qui porte l'équipe » : la part des bonus (capitaine, type de carte) est hachurée.

### Fiche joueur
- **Quatre tuiles**, aux mêmes places en football et en NBA : chances de jouer, score de titulaire, score projeté, cote du match (minutes, disponibilité, score projeté, points par étoile en NBA).
- La cote du match dit son effet sur le score ; la victoire est en vert.
- Pendant une trêve internationale, la forme affichée est celle de la **sélection** du joueur.

### Mes cartes
- **Un seul affichage** : la liste, avec la fiche à droite sur PC. La vue Tableau disparaît ; on trie d'un clic sur un en-tête de colonne.
- **Une seule ligne de commandes** : sur PC, postes, étoiles, puis deux menus, « Filtres » (journée, type de carte, seuil, disponibles) et « Tri ». Sur téléphone, deux boutons, « Filtres » (tout y est) et « Tri ».

### Squad
- Quand aucune équipe n'est possible, l'écran dit pourquoi (poste sans joueur, pas assez de joueurs, plafond d'étoiles) et montre le compte par poste.

### Corrections
- Barre rouge sous le seuil de nouveau visible ; plus de défilement de côté en NBA sur téléphone ; adversaire affiché en entier.
- Colonnes des listes resserrées sur PC ; score aligné d'une ligne à l'autre.
- Contrastes, repère du seuil, focus au clavier ; commandes d'au moins 44 px sur téléphone.
- Récupération : coupe-circuit si l'historique échoue plusieurs fois de suite (les données sont rendues quand même, avec un avertissement) ; fin des fausses alertes pour les matchs de sélection.
- Publication GitLab : le dossier des données est exclu en entier.

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
