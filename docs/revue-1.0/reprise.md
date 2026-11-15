# Plan de reprise après la version 1.1 (écrit le 2026-11-15)

À lire au début d'une nouvelle conversation, avec `CLAUDE.md` (mémoire du projet, qui fait foi) et `NOTES-DE-VERSION.md`.

## Où on en est

- **Version 1.1** sur `main` (commit `c1ba9e9`, poussé le 2026-11-15) : `main` met en ligne https://sorare-aide.pages.dev/ (Cloudflare). La mise en ligne n'a pas été vue depuis la session (hôte non joignable) : à confirmer par l'utilisateur.
- La revue critique de la 1.0 (rapport : https://claude.ai/artifact/9VVxJfD4jgqGfUbyxRPKGz) a donné trois lots. **Lot 1 fait.** Les maquettes 1 à 5 de la revue sont faites ou remplacées (voir `CLAUDE.md`, sections datées du 2026-11-15). **Lot 2 à faire** (prochaine session). **Lot 3 plus tard.**
- **Pas à jour** : l'artifact Claude (https://claude.ai/artifact/WtE8i2L9EovFqyvfnkfM8R, encore en 1.0, se met à jour au prochain « actualise ») et le dépôt GitLab public (à republier par `bash outils/publier-gitlab.sh`, seulement si l'utilisateur le demande).

## Façon de travailler (demandée par l'utilisateur)

- Corrections **une à une**, validées par l'utilisateur avant de passer à la suivante. Pour tout changement d'affichage : **un prototype réel avec images avant / après**, il valide ou corrige, puis passage au dépôt.
- **Les images doivent être lisibles** : captures à la taille de l'écran (un téléphone = un écran de 390 px, pas une page entière de 2 000 px réduite), avant et après côte à côte.
- « Le PC doit être le plus complet, le téléphone le plus lisible. » Très exigeant sur les alignements : chaque barre sous son chiffre, calée sur le même bord ; mêmes polices pour les chiffres de même rang ; **la même ligne joueur partout**.
- Travailler sur la branche de session ; **rien sur `main` sans son accord** ; pas de PR sans demande ; `CLAUDE.md` mis à jour dans le même commit ; tout commiter et pousser avant la fin d'un tour.
- Clé API jamais affichée ; appels réels à l'API Sorare limités à quelques requêtes de mesure, sauf « actualise » ; aucune écriture sur l'API ; GitLab seulement par `outils/publier-gitlab.sh`.

## Pour vérifier l'interface dans une nouvelle session

1. `data/dernier.json` et `data/vignettes/` ne sont pas versionnés : `npm run recuperer` (actualisation incrémentale, une vingtaine de requêtes : à lancer seulement avec l'accord de l'utilisateur, ou quand il écrit « actualise »), puis `npm run app` → `sorties/app/sorare-aide.html`.
2. Scripts de contrôle Playwright, **rangés tels quels dans `outils/controles/`** (sortis du brouillon de la session du 2026-11-15, à nettoyer au lot 2). Usage : `node outils/controles/<script>.js sorties/app [fichier] […]`. Ils servent la page en local, règlent l'horloge de la page au 2026-11-14 18:00Z (date des données d'alors : **à adapter aux données du jour**) et écrivent leurs captures à côté d'eux (ignorées par git).
   - `alignements.js` : bords gauche et droit constants d'une ligne à l'autre, dans chaque liste (320 à 1 920 px).
   - `polices-et-barres.js` : même police pour chances ou minutes et score, chiffres et barres à la même hauteur, par liste.
   - `ligne-barre-sous-chiffre.js` : écart entre chaque barre et son chiffre, hauteur des lignes.
   - `colonnes-et-textes-coupes.js` : lignes en colonnes ou empilées, textes coupés, chevauchements.
   - `cibles-tactiles.js` : commandes de moins de 44 px sous 1 024 px.
   - `menus-mes-cartes.js`, `mes-cartes-telephone.js` : menus « Filtres » et « Tri ».
   - `solo-carte-proposition.js`, `solo-rangee-telephone.js`, `solo-squad-pc.js` : Solo sur téléphone et sur PC, onglets de la colonne de droite.
3. Pour les états rares (coup d'envoi proche, Squad sans équipe, libération des cartes) : avancer l'horloge de la page (`page.clock.install`, puis `clock.runFor(500)` en boucle). Chromium : `proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }` pour les vignettes.

## Lot 2 · Rationalisation (prochaine session)

Sans effet visible ; à faire d'un bloc pour que les tests restent verts (81 tests le 2026-11-15). Détail de chaque constat, avec preuve et correction proposée : `docs/revue-1.0/constats-lots-2-3.md` (chiffres de la 1.0, **à revérifier**).

1. **Retirer l'ancienne chaîne** (`src/recuperation.js`, `src/projection.js`, `src/page.js`, `src/releve-compositions.js`), `R/`, les maquettes A et B, les tests v1, **en gardant le test des bonus** (A3-02 à A3-05).
2. **Alléger la requête des cartes** en gardant `tier` : 23 pages de 60 cartes au lieu de 28 pages de 50 (A4-02, A3-06). Quelques requêtes de mesure à prévoir.
3. **Fusionner `autresChoix` et `autresChoixSquad`**, une seule formule du score projeté (A3-09, A3-11).
4. **Paramètres, champs, styles et restes de variantes inutilisés** (A3-08, A3-10, A3-12, A3-13), dont, depuis la 1.1 : styles de l'ancienne vue Tableau (`table.dense`, `.cellule-*`, `.defile-x`), `details.filtres` et `.filtres-corps`, `.tete-propositions` si inutile, clé `sorare-aide-affichage-cartes`, tris qui ne servaient qu'au tableau.
5. **« Tester la clé » avec une requête légère ; barème NBA en cache ; une seule écriture par récupération** (A4-09, A4-10, A4-16).
6. **Identifiants du compte hors du dépôt public ; chiffre de complexité dans `CLAUDE.md`** (C-03, C-04 : constats du contradicteur, texte dans le rapport).
7. **Contrôle de cohérence** (gardé dans le lot 2 à la demande de l'utilisateur, ancienne maquette 6) :
   - nettoyer les scripts de `outils/controles/` (un lanceur, captures dans `sorties/`, horloge calée sur les données), et les décrire dans `CLAUDE.md` ;
   - écart de 1 px entre le chiffre du score et celui des chances (ou minutes) dans la ligne empilée (téléphone, autres choix) ;
   - cibles de moins de 44 px signalées dans la barre de Mes cartes à 390 px (non identifiées) ;
   - en-têtes et chiffres clés identiques entre Solo et Squad ; alerte du palier affichée une seule fois ; fiche au clavier depuis les listes ; « Score projeté » dans tous les libellés NBA.

## Lot 3 · Évolutions (une autre session)

- **Échelle typographique sur PC** (+1 px : `--t1` 13, `--t2` 14, `--t3` 16 à partir de 1 024 px), validée sur prototype le 2026-11-15, reportée : à appliquer en fin de `app/style.css`, en revérifiant tous les alignements et le zoom à 200 %.
- Créneau unique élargi à 30 min (A5-02) ; historiques du football par lots de joueurs (A4-01) ; rétro-test avec la vraie sélection puis recalage NBA (A5-10, A5-07) ; calculs dans un Web Worker (A2-06, mise de côté par l'utilisateur) ; anomalies montrées dans l'appli (A5-06) ; « 3 échecs » au palier 360 (A2-14, jamais tranché).
- Déjà traités autrement : équipe posée et alerte (A5-01, A5-04 → bandeau du coup d'envoi) ; bouton « Vérifier les compositions » (A5-03, abandonné) ; filtres de Mes cartes sur téléphone (A2-02) ; équipe en tête du Solo (A1-02, A2-05) ; place de la fiche sur PC (A1-17, A2-11) ; âge des données par sport (A5-05, abandonné).

## Questions ouvertes

- Football : la ligne affiche le score **s'il est titulaire**, la barre de fourchette porte sur le **score projeté** (nuance acceptée pour l'instant).
- Hauteur de la ligne sur téléphone (environ 170 px par joueur), acceptée pour la lisibilité.
- La version 1.1 n'a été vue ni sur un vrai iPhone ni dans le visualiseur d'artifact.
