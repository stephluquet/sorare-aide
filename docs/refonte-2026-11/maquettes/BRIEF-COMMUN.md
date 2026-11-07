# Brief commun aux 5 propositions de design — appli « Sorare aide »

Appli personnelle (un seul utilisateur, français, iPhone ET PC) d'aide à la composition d'équipes Sorare (jeu de cartes de football et de NBA).
Modes, par sport : **Solo** (paliers Arcade : 6 niveaux avec un score cible ; l'appli propose l'équipe de 5 cartes qui a le plus de chances de franchir le palier ; football : un capitaine ×1,5 ; NBA : plafond de 16 étoiles), **Squad** (meilleure équipe du jour), **Mes cartes** (toutes ses cartes, filtres, tri). Fiche joueur : chances de jouer, score s'il joue, historique des 15 derniers matchs (titulaire / entré / banc / absent), forme du club (V/N/D, % de victoires sur 10, série, buts), forme du joueur (moyenne 3 derniers vs 15), cote de victoire du match.
Priorité absolue du projet : ne jamais aligner un joueur qui ne joue pas → les **chances de jouer** doivent être très visibles.

Demandes de l'utilisateur pour cette refonte :
- design plus **uniforme** (aujourd'hui : 25 tailles de police, 11 rayons, 4 styles d'état actif, 4 gabarits de ligne joueur, couleurs de sport confondues avec les couleurs d'état) ;
- **page d'accueil plus moderne et spectaculaire** (three.js envisagé, pas imposé) ;
- sur PC, l'appli est **trop étriquée** (cadre de 760 px) : utiliser la place, **barre latérale** et cadre plus large ;
- **dataviz plus moderne** pour les stats.
- Navigation déjà validée par l'utilisateur : choisir le sport (Foot / NBA) en premier, accessible partout ; à l'intérieur : Solo · Squad · Mes cartes ; un bouton Accueil toujours accessible ; mode sombre ; bouton de mise à jour ↻ ; icône d'aide ?.

Lis les trois rapports de revue (ils fondent ta proposition) :
/tmp/claude-0/-home-user-sorare-aide/2962e694-6b8c-50a7-91a2-1a9af5376ff8/scratchpad/revue-multi/R1-coherence.md
/tmp/claude-0/-home-user-sorare-aide/2962e694-6b8c-50a7-91a2-1a9af5376ff8/scratchpad/revue-multi/R2-ergonomie.md
/tmp/claude-0/-home-user-sorare-aide/2962e694-6b8c-50a7-91a2-1a9af5376ff8/scratchpad/revue-multi/R3-dataviz-accueil.md
Captures de l'appli actuelle : /tmp/claude-0/-home-user-sorare-aide/2962e694-6b8c-50a7-91a2-1a9af5376ff8/scratchpad/revue2/*.png (en regarder quelques-unes).
Données réelles d'exemple (à utiliser, ne rien inventer) : /tmp/claude-0/-home-user-sorare-aide/2962e694-6b8c-50a7-91a2-1a9af5376ff8/scratchpad/maquettes/donnees-exemple.json (paliers, proposition prudente football et NBA avec 5 joueurs chacune, 8 meilleures cartes par sport ; chaque joueur : chances de jouer, score s'il joue, espérance, match, cote, forme du club et de l'adversaire, historique 15 matchs, vignette de la carte en data URI WebP 96 px).
Si tu montres une distribution du score de l'équipe face à la cible, calcule-la DANS la page par un petit tirage aléatoire (5 000 tirages : chaque joueur joue avec sa probabilité, son score est tiré dans ses scores passés joués, capitaine ×1,5, bonus de collection) et indique « simulation de la maquette ».

## Livrable
UN fichier HTML autonome : /tmp/claude-0/-home-user-sorare-aide/2962e694-6b8c-50a7-91a2-1a9af5376ff8/scratchpad/maquettes/proposition-<N>.html (N donné dans ta consigne). Ne modifie RIEN dans /home/user/sorare-aide.
C'est une **maquette navigable**, pas l'appli : vues accessibles par l'adresse (`#accueil`, `#solo`, `#fiche`, `#cartes`, noms en lettres et tirets seulement) et par la navigation de la maquette. Montrer au minimum :
1. **Accueil** (le morceau spectaculaire) ;
2. **Solo football** (proposition prudente + chiffres clés + autres propositions/choix esquissés) ;
3. **Fiche joueur** avec la nouvelle dataviz (historique, forme du club et de l'adversaire, chances de jouer, score s'il joue avec incertitude) ;
4. **Mes cartes** (aperçu : tableau dense sur PC, liste compacte sur téléphone).
Le tout responsive : 390 px (iPhone) jusqu'à 1920 px, avec la barre latérale ou l'équivalent sur PC. Un petit bandeau discret « Maquette · Proposition N — <nom> » en haut.

## Règles techniques (page publiée ensuite comme artifact claude.ai — impératif)
- Pas de `<!doctype>`, `<html>`, `<head>`, `<body>` : commence par `<title>` (2 à 4 mots, ex. « Sorare aide · Nocturne »), `<meta name="claude:viewport-fit-sides" content="cover">`, puis `<style>`.
- Couleurs en jetons sur `:root` ; thèmes clair ET sombre (bloc `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` + `:root[data-theme="dark"] {…}`), `body` avec un fond en jeton. Une direction peut choisir délibérément un seul thème (alors couleurs explicites et `color-scheme` posé).
- Marges latérales : `padding-left: max(16px, env(safe-area-inset-left, 0px))` et idem à droite, sur `body` ou le cadre ; jamais de défilement horizontal ; `min-width: 0` sur les enfants flex/grid qui contiennent du texte.
- Scripts externes seulement depuis cdnjs.cloudflare.com, versions exactes. three.js si utilisé : `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>` (global THREE), AVANT ton script ; prévoir un repli si THREE est absent ou WebGL indisponible. Polices : Google Fonts seulement (avec repli). Aucune image externe ni fetch externe : tout est en ligne. Éviter Inter et Space Grotesk ; éviter les clichés « IA » (crème + serif + terracotta ; noir + vert acide ; dégradé violet-bleu ; émojis en marqueurs ; tout centré ; même rayon et ombre partout).
- `prefers-reduced-motion` respecté ; les animations partent d'un état visible ; rien n'est à `opacity:0` en attendant un observateur.
- Poids < 3 Mo (n'embarque que les données utiles).
- Texte en français, phrases simples, chiffres avec virgule décimale (`toLocaleString('fr-FR')`), `font-variant-numeric: tabular-nums` sur les chiffres alignés.

## Vérification (une passe)
Fais des captures avec Playwright (Node : `require('playwright')`, `chromium.launch()` sans option) à 390×844 et 1440×900, en clair et en sombre (`colorScheme`), sur chaque vue. Le réseau de cette machine bloque cdnjs : intercepte l'adresse de three.js avec `page.route('**/three.min.js', r => r.fulfill({ path: '/tmp/claude-0/-home-user-sorare-aide/2962e694-6b8c-50a7-91a2-1a9af5376ff8/scratchpad/three/package/build/three.min.js', contentType: 'application/javascript' }))`. Google Fonts passe. Ouvre la page en `file://`. Regarde les captures (outil Read), corrige une fois (débordement, texte illisible, erreurs console), sans boucler. Range les captures dans /tmp/claude-0/-home-user-sorare-aide/2962e694-6b8c-50a7-91a2-1a9af5376ff8/scratchpad/maquettes/captures-<N>/.

## Réponse attendue (texte, en français, 250 mots au plus)
Chemin du fichier ; nom et idée de la direction en 3 phrases ; ce que montrent accueil, solo, fiche, cartes ; comment elle règle l'uniformité (jetons, composants) ; usage de la largeur sur PC ; three.js utilisé ou non et son coût ; points faibles assumés ; chemins de 2 captures représentatives (une PC, une iPhone).
