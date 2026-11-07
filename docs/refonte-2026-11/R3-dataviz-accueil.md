# R3 : visualisation des statistiques et page d'accueil

Lu : `app/app.js` (jauge, histogramme, pastilles, blocFormeEquipe, blocFormeJoueur, afficherAccueil, carteProposition), `src/moteur/simulation.js`, captures `revue2/` (accueil, fiche, fiche-forme, solo, iPhone et PC, clair et sombre).

## 1. Critique de l'existant

- **Accueil : la hiérarchie est inversée.** Le plus gros chiffre est la cible (300), qui ne demande aucune décision. Le chiffre qui compte, « 54 % de chances de passer », est en corps de texte, sur la même ligne que deux autres valeurs. L'encadré orange occupe plus de place que l'état du palier. « Palier 2 sur 6 » est écrit en petites capitales grises, sans représentation de la progression. En NBA, la proposition (26 %) reste affichée alors que l'alerte juste au-dessus dit qu'elle ne sert à rien : il faut la griser ou la masquer.
- **Anneau des chances de jouer (22 px).** On lit mal un angle sur un anneau aussi petit, et 91 % se distingue à peine de 95 %. Surtout, le moteur plafonne vers 93 % avant les compositions : dans la capture Solo, **les 5 joueurs et presque tous les autres choix affichent 93 %**. L'anneau répète donc 200 fois la même information. Sa couleur dépend du seuil, mais le seuil lui-même n'apparaît nulle part sur l'anneau.
- **Tuiles de la proposition** (chances de passer, les 5 jouent, score attendu, verrouillage) : quatre nombres de même poids, sans échelle. « 306 » contre 300 ne dit pas si la marge est confortable. Or 54 % signifie justement que la cible est au milieu de la distribution du score de l'équipe : c'est le message à faire voir.
- **« 63 ± 19 »** : l'incertitude, qui est l'information la plus utile pour choisir entre deux joueurs, n'existe qu'en texte, et seulement dans la fiche. Dans les listes, deux joueurs à 57 points semblent équivalents même si l'un est bien plus régulier que l'autre.
- **Historique (barres SVG).** C'est la meilleure visualisation actuelle : une valeur par barre, couleurs titulaire et entré en jeu, B et A au pied. Quatre défauts :
  1. l'échelle `max(80, score max)` change d'un joueur à l'autre, donc les fiches ne se comparent pas ;
  2. il n'y a aucune ligne de référence (score projeté, moyenne) ;
  3. les matchs non joués sont des traits de 3 px avec une lettre en 9 px, presque invisibles alors que c'est le risque n° 1 du projet ;
  4. il n'y a pas d'axe du temps, donc deux semaines sans match ne se voient pas.
- **Bloc « Le joueur »** : les pastilles T, T, T, T, T avec leurs scores répètent les 5 dernières barres de l'historique, placé juste en dessous. Cela fait doublon.
- **Pastilles V/N/D** : le codage est bon (lettre et couleur, donc lisible sans les couleurs). Dans la fiche, en revanche, les noms des adversaires sont tronqués (« @ Rayo Val… ») et « 40 % sur 10 » renvoie à 10 matchs dont 5 seulement sont visibles.
- **Cote 45 / 29 / 26 %** : trois nombres collés qu'on doit décoder.

## 2. Forme recommandée pour chaque chiffre

| Chiffre | Forme | Où l'afficher |
|---|---|---|
| Chances de passer et score attendu contre la cible | **Distribution du score de l'équipe** (histogramme de 30 à 40 classes tiré des 5 000 tirages), une ligne verticale à la cible, l'aire à droite de la cible remplie (= les 54 %), la moyenne repérée. On voit d'un coup la marge et le risque. | Haut de la carte Prudente ; version réduite sur l'accueil |
| Les 5 jouent | Nombre conservé, plus **5 segments** (un par joueur, largeur proportionnelle à p) et mention du maillon faible ; une phrase signale le plafond de 0,93⁵ ≈ 70 % avant les compositions | Carte de proposition |
| Contribution de chaque joueur | **Barre empilée horizontale** des espérances (capitaine compris) avec un repère à la cible : on voit qui porte l'équipe | Carte de proposition, sous la distribution |
| Chances de jouer | **Barre horizontale courte avec un repère au seuil** (une longueur se lit mieux qu'un angle). N'appuyer la couleur qu'en cas d'écart : « confirmé 99 % », « douteux », sous le seuil | Ligne joueur, à la place de l'anneau |
| Score s'il joue | **Point et intervalle 10-90 %** sur une **échelle commune au sport** (0-100 football, 0-80 NBA, par exemple) | Ligne joueur (sparkline de 60 px), fiche |
| Historique sur 15 matchs | Barres conservées, **échelle fixe par sport**, bande horizontale 10-90 % et ligne du score projeté, matchs non joués en **cases vides contournées** sur toute la hauteur, espacement proportionnel aux dates | Fiche |
| Forme du joueur | Fusionnée dans l'historique : les 3 dernières barres surlignées, et deux segments horizontaux (moyenne des 3 derniers, des 15 derniers). Retirer les pastilles T/T/T | Fiche |
| Forme du club | Pastilles conservées ; **10 pastilles** au lieu de 5 (cohérent avec le « % sur 10 ») ; adversaires en entier dans l'infobulle ou au toucher, pas tronqués ; buts marqués et encaissés en petite barre divergente | Liste (5 pastilles), fiche (10) |
| Cote du match | **Barre à 3 segments** V/N/D, étiquetée | Fiche ; « 45 % de victoire » en texte suffit dans la liste |
| Étoiles NBA | **Barre de 16 cases** (32 demi-cases), une couleur par joueur, la case de dépassement en rouge | Carte de proposition NBA, remplacements possibles |
| Paliers | **Chemin de 6 jalons** avec leurs cibles, le palier en cours mis en avant ; l'état de la tentative en texte. Pas de pastilles de « vies » : l'utilisateur a écarté l'affichage des vies, à lui redemander | Accueil |
| Coups d'envoi | **Mini-frise** des 5 matchs de l'équipe (verrouillage, dernier résultat connu) | Carte de proposition |

À écarter :
- **le radar** : la surface trompe, les axes ne sont pas commensurables, et il n'y a que 2 ou 3 dimensions utiles ;
- **la carte thermique de 40 matchs dans la liste** : c'est un gadget, la fiche suffit.

**Prérequis côté moteur** : `simulerEquipe` ne renvoie aujourd'hui que `pPasser`, `scoreMoyen` et `pComplete`. Il faut qu'elle renvoie aussi un histogramme (40 entiers) et les quantiles 10, 50 et 90 : coût négligeable. Les quantiles par joueur se tirent de `distribution()`.

## 3. Page d'accueil : trois concepts

**A. « Le seuil » (SVG, sans WebGL) : ma recommandation.**
- **Ce qui est animé** : par sport, une grande carte où la distribution du score de l'équipe se dessine en 600 ms, la zone au-delà de la cible se remplit, et le pourcentage compte de 0 à 54. Au-dessus, le chemin des 6 paliers, le jalon en cours qui pulse une fois.
- **Ce qu'elle apprend en un coup d'œil** : où je suis, et si la meilleure équipe passe la cible largement ou de justesse.
- **Coût** : environ 5 Ko de code, Web Animations API ou transitions CSS, fluide sur iPhone.
- **Repli en mouvement réduit** : état final directement.
- **Point d'attention** : le calcul (1 à 2 s) tourne sur le fil principal et ferait saccader toute animation lancée pendant ce temps. Il faut d'abord le déplacer dans un **Web Worker** (Blob, sans fichier externe). C'est le vrai gain de fluidité.

**B. « La main » (CSS 3D, sans bibliothèque).**
- **Ce qui est animé** : les 5 cartes proposées en éventail (`perspective`, `rotateY`), qui se distribuent à l'ouverture, le capitaine au centre, une légère inclinaison suivant le doigt ou la souris, et sous chaque carte sa barre de chances de jouer.
- **Ce qu'elle apprend** : qui jouer aujourd'hui.
- **Coût** : 0 Ko de bibliothèque, animations composées sur le GPU.
- **Limites** :
  - les vignettes font 96 px et seront floues en grand, donc il faudrait des images de 240 à 300 px pour les 10 cartes affichées (environ 150 Ko) ;
  - pas de gyroscope, qui exige une autorisation sur iOS.
- **Repli** : cartes à plat, sans transition.

**C. « Le plateau » (three.js).**
- **Ce qui est animé** : un escalier 3D de 6 marches (hauteur selon la cible), la marche en cours éclairée, un ballon (foot ou basket) qui rebondit dessus, et une caméra qui orbite lentement. Des particules dont la densité suit les chances de passer.
- **Ce qu'elle apprend** : la progression, et c'est à peu près tout : l'information est déjà dans le chemin des jalons de A.
- **Coût** :
  - poids : three.js r128 pèse environ 600 Ko minifié (environ 150 Ko compressé, chargé hors de la page publiée) ;
  - analyse du script : 100 à 250 ms sur iPhone ;
  - affichage : contexte WebGL, chauffe et batterie si l'animation tourne en boucle.
- **Conditions de mise en œuvre** :
  - charger le script après le premier affichage, et seulement sur l'accueil ;
  - rendre une image uniquement à la demande ;
  - mettre en pause sur `visibilitychange` ;
  - relire les couleurs `--ok`, `--fond`… au changement de thème.
- **Repli** (pas de WebGL, mouvement réduit, échec du CDN) : le chemin SVG de A.

**Avis franc** : three.js ne vaut pas son coût ici. Un seul utilisateur, deux passages par jour, sur iPhone, dans un outil dont la règle est d'aller vite au bon choix. L'escalier 3D n'apprend rien de plus qu'une frise SVG, ajoute 600 Ko et une seconde fragile (CDN, WebGL), et entre en concurrence avec le calcul. Le « spectaculaire » utile vient de A (le chiffre qui compte, rendu visible et animé) combiné avec B pour le côté cartes à collectionner. Si l'envie de 3D persiste, on peut ajouter C plus tard comme option chargée à la demande, sans que rien n'en dépende.

## 4. Bibliothèques

**Pas de bibliothèque de graphiques.**
- Les graphiques sont minuscules, insérés dans des chaînes HTML, répétés jusqu'à 200 fois par liste, et doivent suivre les variables CSS des deux thèmes. Le SVG fait main le fait déjà bien.
- **Chart.js 4** (environ 200 Ko minifié) dessine sur canvas : il faut le redessiner à chaque changement de thème, et il est lourd pour des sparklines.
- **D3 complet** (environ 280 Ko) n'est pas justifié ; `d3-scale` et `d3-shape` (environ 40 Ko) n'apportent rien ici qu'une règle de trois ne fasse.
- **uPlot** (environ 45 Ko) vise les longues séries temporelles : hors sujet.

**Recommandation** : un petit module `app/graphes.js` (3 à 5 Ko), qui renvoie des chaînes SVG avec `var(--…)`, un `<title>` et un `aria-label` :
- `barreProba(p, seuil)` ;
- `intervalle(q10, q50, q90, echelle)` ;
- `distribution(classes, cible)` ;
- `empilee(parts, cible)` ;
- `cases(16, joueurs)` ;
- `tripleCote(v, n, d)` ;
- `historique(matchs, echelle, bande)`.

**Ordre conseillé** :
1. Worker pour le calcul ;
2. distribution face à la cible (moteur et accueil) ;
3. barre de chances avec seuil et intervalle sur échelle commune dans les listes ;
4. historique refait (fusion avec la forme du joueur) ;
5. éventail CSS 3D ;
6. three.js seulement si l'utilisateur, après avoir vu 1 à 5, le demande encore.
