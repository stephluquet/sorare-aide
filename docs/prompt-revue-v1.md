# Prompt : revue critique de Sorar'help 1.0 (multi-agents)

À coller dans une nouvelle session Claude Code ouverte sur ce dépôt (branche `main`). La première phrase déclenche l'orchestration multi-agents.

---

Use a workflow (multi-agents, 8 agents au plus) pour une **revue critique de Sorar'help 1.0**. Tu ne modifies aucun fichier du dépôt : tu produis un rapport.

## Contexte
- Sorar'help est une aide à la composition Sorare (football et NBA, modes Solo / Arcade et Squad). L'utilisateur l'utilise seul, sur iPhone et sur PC, un passage le matin et un en fin d'après-midi.
- Lis d'abord `CLAUDE.md` (mémoire du projet, décisions de l'utilisateur, champs API vérifiés), `README.md`, `NOTES-DE-VERSION.md` et `methode.md`.
- Code :
  - `app/` (interface : `app.js` d'environ 1 900 lignes, `style.css` d'environ 700) ;
  - `web/web.js` (démarrage du site autonome) ;
  - `src/moteur/` (calcul) ;
  - `src/recuperation/` (requêtes GraphQL) ;
  - `functions/graphql.js` (relais).
- Pour voir l'appli :
  - `npm run app` construit `sorties/app/` (page unique, il faut `data/dernier.json`, régénéré par `npm run recuperer`) ;
  - `npm run serveur-web` sert le site autonome.
- Chromium et Playwright sont installés : lancer Chromium avec `proxy: { server: process.env.HTTPS_PROXY }` pour les images. Un débordement horizontal se détecte en comparant `scrollWidth` à `clientWidth`.
- Les décisions déjà prises par l'utilisateur et notées dans `CLAUDE.md` ne se remettent pas en cause sans raison forte, à signaler comme telle. Par exemple : score projeté plutôt qu'espérance, autres choix par étoiles en NBA, seuils fixes en Solo et Squad, une ligne par carte dans Mes cartes.

## Règles
- **Lecture seule** : aucune modification du dépôt, aucun commit, aucun push. Aucune requête qui écrit sur l'API Sorare.
- **Ne jamais afficher, copier ni journaliser la clé API.** Elle arrive par le proxy de l'environnement.
- Limiter les appels réels à l'API Sorare : quelques requêtes de mesure au plus, jamais une récupération complète. Préférer la lecture du code et le schéma (`https://api.sorare.com/graphql/schema`).
- Chaque constat cite le fichier et la ligne, ou une capture, avec la largeur d'écran et le thème. Pas de constat non vérifié présenté comme sûr : écrire « à vérifier ».

## Les axes (un ou deux agents par axe)
1. **Interface et UX, PC large (1 920 et 1 440 px)** : cohérence entre Solo, Squad et Mes cartes, hiérarchie de l'information, densité, lisibilité des chiffres clés, fiche épinglée, dataviz (justesse des échelles, légendes), thèmes clair et sombre, accessibilité (contraste, focus clavier, libellés).
2. **Interface et UX, PC étroit (1 024 à 1 360 px) et mobile (390 et 320 px, émulation iPhone)** : débordements, cibles tactiles, ce qui disparaît ou se replie, temps d'affichage (mesuré, processeur ralenti 4 fois), parcours type « le matin je compose mon Solo, le soir je vérifie les compositions officielles ».
3. **Rationalisation du code** :
   - fonctions, classes CSS, jetons, paramètres de `methode.md` et options inutilisés ou en double ;
   - code mort laissé par les évolutions successives (anciennes variantes, ancienne chaîne `src/recuperation.js`, `src/projection.js`, `src/page.js`, `R/`) ;
   - duplication entre `app.js`, `web.js` et `src/` ;
   - pour chaque suppression proposée, la preuve qu'elle est inutilisée (recherche dans tout le dépôt) et le risque.
4. **Requêtes API et coût** :
   - inventaire des requêtes de `src/recuperation/` : complexité, nombre par récupération initiale, incrémentale et pour chaque sport ;
   - champs demandés mais jamais utilisés par le moteur ou l'interface ;
   - requêtes regroupables, cache possible, fréquence de l'historique, rechargement NBA au format 2 ;
   - estimation chiffrée du gain (requêtes, secondes, complexité). Repères du `CLAUDE.md` : premier passage environ 900 requêtes en 6 min ; incrémental environ 23 requêtes en 21 s ; plafond appliqué 150 / min.
5. **Améliorations possibles** : fonctionnelles (ce qui aiderait à franchir plus de paliers sans jamais aligner un joueur qui ne joue pas), méthode (calibrage, limites listées dans `methode.md`), robustesse (erreurs réseau, données manquantes, IndexedDB), performance. Chacune avec bénéfice, coût et risque.

## Vérification
Un agent contradicteur relit chaque constat des axes 1 à 4. Il le confirme (preuve rejouée), le nuance ou l'écarte. Seuls les constats confirmés ou nuancés vont dans le rapport, les écartés sont listés à part en une ligne.

## Livrable
Un rapport en français, publié comme artifact privé :
- résumé en 10 lignes ;
- puis, par axe, les constats classés par gravité (bloquant, important, mineur, confort), avec preuve, proposition de correction et effort estimé (S, M, L) ;
- un plan d'action en trois lots : corrections rapides, rationalisation, évolutions ;
- les captures utiles intégrées (vignettes), le reste en annexe.
