# R2 — Revue ergonomie et mise en page (2026-11-07)

Sources : `app/style.css`, `app/index.html`, `app/app.js`, captures `revue2/*.png` (iPhone 390 px, PC 1440 px, clair et sombre).

## 1. Diagnostic de l'espace

**PC 1440 px.** Le cadre fait 760 px, soit 53 % de la largeur. Il reste 340 px vides de chaque côté. À 1920 px, il occupe 40 % et laisse 580 px de chaque côté. Mais le vrai gâchis est **dans** le cadre :
- **Ligne joueur.** L'identité (nom, match, puces, forme) occupe environ 330 px à gauche, les chiffres (score, jauge) environ 60 px à droite. Entre les deux, environ 330 px de vide, que l'œil traverse à chaque ligne. Le libellé « pts s'il joue » se répète sur toutes les lignes. On ne peut pas comparer en colonne.
- **Fiche.** C'est un volet bas de 760 × 790 px sur un voile. Il cache toute la proposition et empêche donc de comparer. L'histogramme, limité à 180 px de haut, est centré avec environ 120 px de marge.
- **Squad.** La liste déroulante de la date fait 760 px de large pour afficher « samedi 7 novembre ».
- **Mes cartes.** 108 px par carte : 148 cartes NBA donnent environ 16 000 px de défilement.
- **Haut d'écran.** Entre l'en-tête, la ligne d'âge des données, le titre et l'alerte orange, environ 300 px passent avant le premier joueur. L'alerte se répète sur Solo **et** sur Mes cartes.
- **Accueil.** Deux blocs de 374 px. Le tiers bas de l'écran reste vide.

**iPhone 390 px : trop dense et trop long.**
- Solo football fait **3 452 px**, Mes cartes NBA **22 344 px** (151 px par carte).
- Dans la proposition, chaque joueur passe sur 5 lignes : le poste seul sur sa ligne, le match coupé en deux, la forme sur deux lignes.
- Les autres choix (14 entrées d'environ 110 px) font 1 550 px.
- Le réglage du seuil passe à la ligne tout seul.
- L'en-tête n'est pas collant. Sur 3 000 px, ↻, le changement de sport et les onglets deviennent introuvables.

## 2. Architecture et navigation

| Largeur | Navigation | Contenu |
|---|---|---|
| < 600 (iPhone) | **Barre collante en haut** (48 px) : bascule Foot/NBA à gauche ; ↻ avec l'âge des données (« 49 min ») et le menu « … » (thème, aide) à droite. **Barre d'onglets en bas** (56 px + zone de sécurité) : Accueil · Solo · Squad · Cartes. | 1 colonne, marges de 16 px |
| 600–1023 (768) | Idem | 1 colonne de 720 px au plus ; Mes cartes en grille de 2 |
| 1024–1439 | **Barre latérale de 232 px**, repliable en rail d'icônes de 64 px (choix retenu dans le navigateur) | Fluide, 2 colonnes |
| ≥ 1440 | Barre latérale de 248 px | 1 160 px au plus, 2 colonnes et volet de droite ; à 1 920 px, 3 colonnes |

**Contenu de la barre latérale**, de haut en bas :
1. **Les deux sports comme deux grandes entrées**, chacune avec son palier et ses chances (« Foot · palier 300 · 54 % », « NBA · 180 · 26 % »). Le sport reste ainsi visible et comparé en permanence.
2. **Les trois modes du sport actif** : Solo, Squad, Mes cartes (148).
3. **Une carte « État du palier »** : tentatives (2 échecs, 1 en cours), cartes marquées 0 sur 15, bouton « Marquer ». L'alerte orange y vit une seule fois, au lieu d'être répétée en tête de chaque écran : environ 110 px gagnés partout.
4. **En pied** : âge des données, ↻ avec sa barre de progression, thème, aide.

L'adresse `#sport/mode` reste inchangée. **Mettre la barre latérale sur le téléphone serait une erreur** : un menu repliable ajoute un appui à chaque changement de mode.

## 3. Gabarits sur PC (1440 px, zone utile d'environ 1 130 px)

**Solo.**
- **Colonne gauche de 640 px** : chiffres clés (4 cases), proposition prudente, puis « Autres propositions » repliées.
- **Colonne droite de 460 px, à défilement indépendant** : autres choix groupés par joueur remplacé, plus le bouton Créneau unique.
- **La ligne joueur devient une ligne de tableau** avec des colonnes fixes : vignette 34 · nom et poste 190 · match et % de victoire 210 · forme 110 · chances 64 · s'il joue 56. Les titres de colonnes n'apparaissent qu'une fois.
- **La fiche s'ouvre en volet latéral droit de 440 px** par-dessus la colonne des autres choix, sans voile. La proposition reste visible, et ↑ ↓ font passer d'un joueur à l'autre.
- **À 1 920 px**, la fiche devient une 3e colonne permanente.
- **Créneau unique** : liste maître-détail, les créneaux à gauche (heure, chances, « compos publiées ✓ ») et l'équipe à droite.

**Squad.** À gauche, l'équipe (même tableau). À droite, les 10 meilleures cartes du jour et ce qui recoupe le Solo. Les jours deviennent des puces (« sam. 7 · dim. 8 · lun. 9 ») au lieu d'une liste déroulante de 760 px.

**Mes cartes.** Un **tableau dense triable** :
- lignes de 44 px, en-tête collant, soit environ 6 500 px au lieu de 16 000 pour 148 cartes ;
- colonnes : carte, joueur, poste, ★ (NBA), journée et match, chances, s'il joue, espérance, pts/★, forme de l'équipe, statut, bonus, **jouée (case à cocher)** ;
- filtres dans une bande collante au-dessus ;
- un clic ouvre la fiche à droite.

La grille de cartes n'a pas d'intérêt : les vignettes font 96 px. Une « galerie » optionnelle tout au plus.

**Accueil.** Un tableau de bord sur 2 colonnes, une par sport, avec pour chacune :
- la proposition prudente en 5 noms et l'heure de verrouillage ;
- le prochain créneau et l'état des compositions (« attendues vers 14:30 ») ;
- le score attendu du Squad du jour.

**Téléphone.** La ligne joueur tient sur 3 lignes au lieu de 5 :
- poste dans la ligne du nom, date courte (« sam. 18:30 ») ;
- pastilles de forme sans le mot « Équipe » ;
- la série et la tendance ne restent que dans la fiche.

Mes cartes passe en mode compact par défaut (64 px, soit environ 9 500 px). Dans les autres choix, on montre un seul candidat par joueur remplacé, avec « + 3 autres ».

## 4. Parcours et frictions

1. **Composer avant un créneau.**
   - *Friction* : rien ne dit quand les compositions tombent. « Créneau unique » est rangé dans Solo. L'âge des données est une ligne grise à part.
   - *Correction* : sur l'accueil ou dans la barre latérale, afficher « Prochain créneau 15:30 · compos attendues vers 14:30 · actualise à partir de 14:30 ». Le bouton ↻ porte l'âge des données et passe en orange au-delà de 3 h.
2. **Marquer les cartes jouées.**
   - *Friction* : « J'ai joué cette équipe » marque 5 cartes **sans confirmation ni annulation**, et marque l'équipe *proposée* même si l'utilisateur l'a modifiée avec les autres choix. Dans la fenêtre de marquage, il faut chercher 15 noms un par un (40 résultats triés par espérance).
   - *Correction* :
     - un message « 5 cartes marquées · Annuler » pendant 8 s ;
     - un bouton « Remplacer » dans chaque autre choix, qui modifie l'équipe affichée ; c'est cette équipe-là qui est marquée ;
     - sur PC, la colonne à cocher de Mes cartes, plus un filtre « Jouées (n) ».
3. **Comparer deux joueurs.**
   - *Friction* : impossible aujourd'hui, la fiche couvre tout. Il ne reste que le « 54 % → 55 % » des autres choix.
   - *Correction* : sur PC, le volet latéral avec « épingler » pour afficher deux fiches côte à côte (420 px chacune à 1 920 px). Sur téléphone, cocher 2 lignes, puis une feuille « Comparer » en 2 colonnes (chances, s'il joue, ±σ, forme, match).
4. **Lancer la mise à jour.**
   - *Friction* : le bouton ↻ disparaît au défilement, sa progression vit dans l'en-tête, et un appui lance 2 min 30 de travail sans retour immédiat.
   - *Correction* : barre collante en haut sur téléphone, pied de la barre latérale sur PC. Message immédiat « Demandé à 15:38 » puis pourcentage.
   - Annexe : `hashchange` remet le défilement à zéro, ce qui fait perdre sa place en revenant d'un onglet. Mémoriser la position de défilement par vue.

## 5. Accessibilité

- **Contraste** (rapports calculés) :
  - **Pastille « N » en mode sombre** : blanc sur `#9aa9a0` = **2,45:1, échec**. Mettre le texte sombre, comme V et D.
  - Étiquettes « Probable » (`--ok` sur `--ok-doux`) **4,32:1** et orange (`--attention` sur `--attention-doux`) **4,2:1**, en 11,5 px : sous 4,5:1. Foncer en `#15703f` et `#8a5000`.
  - Barre « entré en jeu » `#8fb0ef` sur blanc : **2,18:1**, sous les 3:1 demandés pour un graphique. Ajouter un contour ou un motif.
  - Bords des cartes et boutons secondaires (`--trait`) : 1,33:1.
- **Cibles tactiles** :
  - Onglets d'environ 28 px, boutons Plusieurs/Créneau unique et puces d'environ 30 px, boutons ronds de 36 px, pastilles de 16 px.
  - C'est au-dessus du minimum WCAG 2.2 (24 px), mais loin des 44 pt d'iOS. Passer à 44 px sur téléphone ; la barre d'onglets en bas en fait 56.
- **Taille du texte** : libellés en 0,68 rem (10,9 px : « ÉQUIPE », pastilles). Sur PC, monter la base à 16 px à partir de 1 024 px.
- **Clavier et lecteur d'écran** :
  - Les lignes sont bien des `role=button` avec Entrée et Espace, et Échap ferme les volets.
  - Mais aucun piège à focus (Tab sort du `aria-modal`), le focus ne revient pas sur la ligne d'origine à la fermeture, et **« Fermer » est en bas d'une fiche d'environ 1 000 px**.
  - Ajouter une croix collante en haut, le glissement vers le bas pour fermer sur téléphone, le retour du focus, et `aria-current` dans la barre latérale.
- **Mouvement réduit** : respecté pour le volet et la rotation de ↻, mais pas pour la transition de 0,6 s de la barre de progression ni pour le futur volet latéral.

**Priorités** : (1) ligne en tableau et volet latéral sur PC ; (2) barre latérale à partir de 1 024 px, barre d'onglets en bas sur téléphone ; (3) annulation et équipe modifiable avant de marquer ; (4) corrections de contraste, rapides à faire.
