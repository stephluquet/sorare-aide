# R1 — Cohérence visuelle de l'appli Sorare aide

Sources : `app/style.css`, `app/app.js`, `app/index.html`, 14 captures de `revue2/` (iPhone et PC, clair et sombre).

## 1. Incohérences

**Échelles sans bornes**
- **25 tailles de police** dans `style.css`, de .68 à 2.6rem (.68, .7, .72, .75, .78, .8, .82, .85, .88, .9, .92, .95, 1, 1.05…). S'y ajoutent `style="font-size:1.05rem"` en ligne (app.js:462, 547, 674) et `font-size="9"` dans le SVG de l'historique (app.js:433), qui grossit sur PC.
- **8 tailles de titre** : h1 1.9, volet 1.6, proposition 1.35, bloc 1.3, autres et sous-titre 1.2, variante et forme 1.15, h3 .95 (style.css:32, 77, 129, 120, 156, 219, 225, 305, 157). Tout est en Barlow capitales : la capitale ne hiérarchise plus rien.
- **11 rayons** : 2, 3, 4, 5, 6, 8, 10, 12, 14, 16 et 999 px. L'écran Solo en montre déjà 6 (14, 10, 6, 5, 4 et 999).
- **Environ 25 couples de `padding`** (4px 7px, 5px 8px, 6px 9px, 7px 10px, 9px 14px…), sans grille.

**État « actif » : 4 traitements**
- Pilule noire : `.seg`, `.puce`, `.lien-accueil` (l.44, 101).
- Pilule à la couleur du sport : `.sport-global` (l.105).
- Rectangle de 8 px à la couleur du sport : `.onglets` (l.110-113).
- Pilule ambre : `.puce-etoiles` (l.184).

Sur `pc-light-nba-cartes`, trois de ces traitements se voient en même temps.

**Boutons : 5 familles**
- `.bouton`, rectangle de 10 px.
- `.puce` et `.seg`, pilules.
- Onglets en Barlow capitales.
- `.bouton-rond` et `.bouton-theme`, deux règles identiques.
- Liens de l'accueil.

Le même bouton change de couleur selon l'endroit : « Marquer les cartes jouées » est vert sur l'accueil (règle `.bloc[data-sport] .bouton.principal`, l.240), noir ailleurs, et gris clair en sombre.

Les priorités se contredisent aussi : « J'ai joué cette équipe » est secondaire (app.js:560), alors que « Marquer comme jouée » est principal (app.js:471).

**Étiquettes : environ 12 traitements**
- `.etiq` en 5 couleurs.
- Capitaine noir plein.
- Étoiles ambre, rayon 6 ou 8.
- Pastilles V/N/D pleines de 16, 22 ou 24 px.
- Pastilles T/E/B/A : même forme, autre sens.
- Série et tendance en texte coloré.
- Libellé « ÉQUIPE » en capitales .68rem.

Le « T » est bleu accent, comme l'étiquette « Shiny +5 % ».

**Couleurs qui se confondent**
- `--foot` #1b6e45 et `--ok` #1b7f4a sont presque identiques. En football, l'onglet actif, « Probable », la jauge, les V et « 54 % » ont le même vert.
- `--nba` #b8481a, `--attention` #a76200 et `--stop` #b3261e sont voisins : l'onglet NBA ressemble à une alerte.
- L'ambre sert aux étoiles et aux avertissements.
- Couleurs en dur : `#fff` (l.105, 106, 112, 113, 240, 241, 295), `#0f1512` (l.298-299), `rgba(0,0,0,.45)` (l.72).

**Mode sombre**
- `.res-N` garde un texte blanc sur #9aa9a0 (contraste ≈ 2,4), alors que V et D passent en texte foncé (l.298).
- `.sit-titulaire` : blanc sur #8db0ff, illisible (`iphone-dark-fiche-forme`).

**Ligne joueur : 4 gabarits au lieu d'un**
- Cartes (app.js:406) : carte bordée, vignette de 44 px, club affiché.
- Proposition (551) et Squad (676) : ni bordure ni séparateur, vignette de 34 px, pas de club.
- Autres choix (623) : séparateur, vignette de 28 px, « joue à 93 % · 58 pts » dans la ligne d'infos, « 54 % → 55 % » à droite.

Dans une proposition sur iPhone (`iphone-light-football-squad`), les joueurs s'enchaînent sans séparation. Le nom commence au-dessus de la vignette, qui est centrée verticalement.

**Encadrés**
- Trois manières de marquer l'importance : liseré gauche (`.alerte`), liseré haut (`.bloc`), bordure noire pleine (`.proposition.principale`, `.creneau[aria-expanded]`).
- Les cases imbriquées sont posées sur `--fond` sans bordure, alors que `details.variante` est bordé.

**Icônes** : SVG au trait (maison, thème, ↻, aide, ballons) d'un côté, glyphes texte (▲ ▼ ▾ ★ ✓ →) de l'autre, parfois dans la même ligne.

**Chiffres et alignements**
- `tabular-nums` manque sur `.alt .avant-apres b`.
- Les couleurs contredisent l'arrondi : Szymański « 54 % → 54 % » en ambre, Sano « 54 % → 54 % » en noir (`iphone-light-football-solo`).
- Fiche PC : les libellés sur deux lignes décalent les valeurs (« 80 % » 17 px plus bas que « 63 ± 19 »). L'histogramme est centré, sa légende calée à gauche.
- Accueil PC : le bloc NBA, plus court, est étiré par la grille (`.bloc` sans `align-content:start`). « 180 » tombe 8 px plus bas que « 300 ».

## 2. Hiérarchie par écran

- **Accueil** : l'œil va à « 300 », puis à l'alerte. L'information utile (« Prudente : 54 % ») est noyée dans une phrase en .9rem. C'est elle qui devrait être le chiffre héros.
- **Solo** : vient d'abord l'alerte, puis 4 à 5 cases grises de même poids ; « 54 % » ne se distingue que par sa couleur. Dans chaque ligne, le plus gros chiffre est le **score s'il joue**, alors que les **chances de jouer**, priorité absolue du projet, se réduisent à une jauge de 22 px en .8rem. La hiérarchie est inversée.
- **Squad** : même défaut. Sur iPhone, « Verrouillage » se retrouve seul sur une rangée.
- **Mes cartes** : trois rangées de pilules occupent 120 px avant la première carte ; les filtres pèsent plus que les résultats.
- **Autres choix** : 17 lignes de même poids, 4 à 5 lignes de texte chacune, sur les deux tiers d'une page de 3 452 px.
- **Fiche** : l'ordre est bon, mais les pastilles V/D saturées attirent plus l'œil que l'espérance.

## 3. Système resserré

**Couleurs**
- Neutres : `fond`, `surface`, `surface-2`, `trait`, `encre`, `doux`.
- États : `ok`, `attention`, `stop`, `info`, chacun avec sa variante `-doux`, plus un jeton `sur-plein` pour le texte sur fond plein, recalculé en sombre.
- Sports : `foot` (teal) et `nba` (orange tirant vers le magenta), éloignés des couleurs d'état et réservés à l'indicateur de sport.
- Étoiles : un or distinct de l'ambre d'alerte.

**Typographie** : 6 tailles (12, 13, 15, 18, 24 et 32 px) et 3 graisses (400, 600, 700). Barlow pour les chiffres, h1 et h2 seulement ; Source Sans pour le reste, h3 compris, en casse normale. Capitales réservées aux libellés des chiffres clés.

**Espacements** : grille de 4 (4, 8, 12, 16, 24).

**Rayons** : 6 (étiquettes, pastilles, vignettes), 12 (cartes, cases, boutons, champs) et 999 (pilules, ronds).

**Élévation** :
- 0 : le fond.
- 1 : la surface, bordée d'un trait.
- 2 : le volet, avec ombre et voile en jeton.

**Composants**
1. **Ligne joueur**, une seule fonction :
   - vignette de 40 px alignée en haut ;
   - nom et étoiles ;
   - une ligne d'infos : poste · club · match · cote ;
   - étiquettes ;
   - à droite, en gros, les **chances de jouer**, et dessous le score s'il joue ;
   - une variante compacte, avec un séparateur fin.
2. **Carte de proposition** : un chiffre héros (« chances de passer », 32 px), puis 3 chiffres secondaires en ligne, sans cases.
3. **Chiffre clé** : libellé de 12 px sur une seule ligne, valeur alignée sur la ligne de base.
4. **Étiquette d'état** : une seule forme, 4 couleurs ; le bonus passe en neutre.
5. **Pastilles de forme** : V, N et D seulement. La situation du joueur s'affiche autrement.
6. **Boutons** : principal (plein `encre`, jamais à la couleur du sport), secondaire, discret, rond. 40 px de haut au minimum.
7. **Segmenté** : un seul style actif pour tous les sélecteurs.
8. **Volet** : en-tête fixe avec Fermer.

## 4. Les 5 corrections les plus rentables

1. **Fusionner les 4 lignes joueur** (app.js:406, 551, 623, 676), avec les chances de jouer en gros à droite. Ce chantier règle à la fois l'uniformité et la hiérarchie.
2. **Séparer les couleurs des sports de celles des états**, et retirer la couleur du sport des boutons et des onglets. C'est la première cause de l'effet bariolé.
3. **Passer à 6 tailles et 3 rayons en jetons**, supprimer les `style=` en ligne et ramener les h3 en casse normale.
4. **Un seul style actif et une seule famille de boutons** : onglets, segmenté, postes, étoiles et accueil ; fusionner `.bouton-rond` et `.bouton-theme`.
5. **Corriger le sombre et les alignements** :
   - texte des pastilles en jeton ;
   - `align-content:start` sur `.bloc` ;
   - libellés des chiffres clés sur une ligne ;
   - `tabular-nums` partout ;
   - couleur de l'avant → après calculée sur la valeur affichée.
