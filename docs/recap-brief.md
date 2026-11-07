# Appli Sorare — récap du brief et des tests (7 novembre 2026)

## L'appli
- **But** : me dire quelle équipe jouer pour **franchir mon palier Arcade**, en football et en NBA, et quelle est la meilleure équipe **Squad du jour**.
- **Priorité absolue** : **ne jamais aligner un joueur qui ne joue pas** (il marque 0, sans remplaçant).
- **Pour moi seul**, sur téléphone et PC ; état (palier actuel, cartes déjà jouées) **saisi à la main et gardé dans le navigateur**.
- **Pas** de vies affichées, de plan sur plusieurs tentatives, de conseil d'achat, ni d'action sur le marché.
- Fonctionnement actuel : Claude (session cloud) appelle l'API et produit les fichiers ; publication privée et paquet R pour des collègues plus tard.

## Règles du jeu retenues
- Arcade foot : 5 joueurs (GK, DF, MD, FW + 1 de champ), capitaine +50 %, paliers 260 / 300 / 360 / 400 / 440 / 480.
- Arcade NBA : 5 joueurs sans contrainte de poste, pas de capitaine, ≤ 16 étoiles (demi-étoiles comptées : 4,5 + 4,5 = 9), paliers 150 / 180 / 210 / 240 / 270 / 290.
- Équipe **verrouillée au premier coup d'envoi** d'un de ses joueurs ; carte bloquée tant qu'on reste sur le même niveau (utilisable en Squad).
- Squad : meilleure équipe du jour, joueurs qui jouent tous ce jour-là.
- Bonus de collection lu carte par carte dans l'API (Shiny 5 %, Holo 10 %, Four Suits 15 %, Eclipse 20 %…).

## Le moteur
1. **Filtre dur** : blessés, suspendus, douteux exclus ; seuil réglable de probabilité de jouer.
2. **Probabilité de jouer** estimée sans OAuth : statut Sorare (titulaire, remplaçant…), **% de matchs joués sur 5, 10, 40 matchs**, situation match par match (titulaire, entré, banc, absent).
3. **Score en mélange** : titulaire / entré en jeu / ne joue pas (0), à partir du **détail match par match** (dispersion, tendance récente, saison précédente moins pondérée), pas des seules moyennes L5/L15 qui ignorent les matchs non joués.
4. **Probabilité de franchir le palier** par simulation ; capitaine choisi pour passer, pas pour le meilleur score.
5. **Probabilité « équipe complète »** (les 5 jouent) affichée en tête.
6. **Mode créneau unique** : équipe dont tous les matchs commencent à la même heure, composée après les compositions officielles ; comparé au mode plusieurs créneaux.

## Ce qu'on a déjà (vérifié par la session de dev)
Cartes foot et NBA, bonus, tier et étoiles, L5/L15, 15 derniers matchs de l'équipe, blessures et suspensions, prochain match, cotes de match foot, paliers Arcade et leur état, statut Sorare, projection Sorare (toutes les cartes NBA, 27 cartes foot).

## Ce qu'il manque
- Probabilité de titularisation (vide sans connexion ; visible dans l'appli, ex. « 80 % ») → **OAuth reporté**, remplacé par l'historique.
- Cartes bloquées → saisie manuelle.
- Cotes NBA → absentes de l'API.

## Tests à faire (dans l'ordre)
1. **Pourcentage de matchs joués** sur 5, 10 et 40 matchs, et **moyennes 10 et 40** : trouver les champs dans l'API.
2. **Détail match par match sur 40 matchs** si possible : date, adversaire, score, situation (titulaire, entré, banc, absent).
3. **`homeFormation` / `awayFormation`** sur 2 ou 3 de mes matchs du week-end, relevés à **H-3, H-1 et au coup d'envoi** : les compositions officielles y apparaissent-elles ? (Décisif pour le mode créneau unique.)
4. **Heure exacte de chaque match**, pour regrouper les joueurs par créneau.
5. **Texte des règles de chaque palier**, à comparer aux fichiers `regles/`.
6. **Minutes projetées NBA** (vides au premier essai) : réessayer un jour de match.

## Plus tard
OAuth ; plan sur les vies ; publication privée (GitLab Pages) ; paquet R pour les collègues.
