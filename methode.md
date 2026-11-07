# Méthode v2 : probabilité de jouer et score attendu

Version 2 (2026-11-07). Ce document **fait foi** : le moteur (`src/moteur/`)
lit les paramètres dans le bloc JSON ci-dessous et applique les formules
décrites ici, sans les recopier. Toute modification de la méthode passe par
ce fichier, et les cas de `tests/cas/` doivent être mis à jour en conséquence.
La méthode v1 (moyenne pondérée L5/L15) est archivée dans `docs/methode-v1.md`.

Principe : **ne jamais aligner un joueur qui ne joue pas**. On estime donc
séparément (1) la probabilité qu'il joue et (2) ce qu'il marque s'il joue,
au lieu de mélanger les deux dans une seule moyenne comme L5/L15, qui
ignorent les matchs non joués.

## Paramètres

<!-- parametres:debut -->
```json
{
  "version": 2,
  "fenetre_matchs": 30,
  "situations_jouees": ["titulaire", "entre", "joue"],
  "statuts_comptes": ["FINAL", "REVIEWING", "DID_NOT_PLAY"],
  "football": {
    "demi_vie_jouer": 2,
    "plancher": 0.08,
    "plafond": 0.93,
    "demi_vie_titulaire": 3,
    "demi_vie_score": 10,
    "min_scores_situation": 3,
    "debut_saison": "2026-07-01"
  },
  "nba": {
    "demi_vie_jouer": 2,
    "plancher": 0.10,
    "plafond": 0.93,
    "demi_vie_minutes": 5,
    "demi_vie_score_par_minute": 10,
    "debut_saison": "2026-10-01"
  },
  "poids_saison_precedente": 0.5,
  "min_matchs_historique": 5,
  "seuil_jouer": 0.80,
  "statuts_sorare_douteux": ["NOT_PLAYING", "RETIRED"]
}
```
<!-- parametres:fin -->

**D'où viennent ces valeurs.** Elles sont tirées d'un rétro-test sur l'archive
`data/historique/` du 2026-11-07 (`node outils/retro-test.js football|nba`) :
pour chaque match passé, on prédit à partir des seuls matchs plus anciens,
puis on compare au réel. Football : 16 935 matchs prédits (585 joueurs) ;
NBA : 6 588 (289 joueurs). Sauf mention contraire, chaque valeur est la
meilleure de celles essayées (score de Brier pour une probabilité, erreur
absolue moyenne pour un score). Exceptions, qui sont des choix :
`fenetre_matchs`, `min_matchs_historique`, `poids_saison_precedente` (demandé
par l'utilisateur, effet non démontré par le rétro-test), `debut_saison`
(dates approximatives des reprises), `seuil_jouer` (décision de l'utilisateur).

## Données utilisées

Pour chaque joueur, l'historique match par match de son équipe (jusqu'à 40
matchs, du plus récent au plus ancien ; voir `CLAUDE.md`) : date, statut du
score, score, **situation** et minutes. Situations : football `titulaire`,
`entre` (entré en jeu), `banc`, `absent` ; NBA `joue`, `banc`, `absent` (l'API
ne dit pas qui débute ; ce sont les minutes qui comptent). S'y ajoutent :
blessures et suspensions en cours, prochain match (date, compétition),
statut Sorare (football), bonus de collection de la carte.

Matchs **comptés** : ceux dont le statut est dans `statuts_comptes` et la
situation connue, parmi les `fenetre_matchs` plus récents. Les matchs à venir
ou sans données sont ignorés.

## 1. Probabilité de jouer `p`

Poids d'un match compté de rang `i` (0 = le plus récent) :

```
w(i) = 0,5^(i / demi_vie_jouer) × (poids_saison_precedente si le match est antérieur à debut_saison, sinon 1)
```

Part pondérée des matchs joués, puis recalibration :

```
p_hist = Σ w(i) × [situation jouée] / Σ w(i)
p      = plancher + (plafond − plancher) × p_hist
```

**Pourquoi la recalibration.** Brute, `p_hist` est trop sûre d'elle aux
extrêmes : un joueur qui a joué tous ses derniers matchs (p_hist ≈ 0,98) n'a
joué le suivant que dans 88 % des cas en football (90 % en NBA), et un joueur
qui ne jouait plus est revenu dans 8 à 10 % des cas. La droite ajustée
améliore le score de Brier (football 0,1480 → 0,1446 ; NBA 0,1515 → 0,1477).
Le rétro-test ignore les blessures connues : pour un joueur sans blessure
déclarée, `p` est donc plutôt prudente.

**Ce qui l'emporte sur l'historique** (dans cet ordre) :

| Situation | Effet |
|---|---|
| Blessure en cours sans date de retour, ou retour prévu après le prochain match | `p = 0`, joueur **exclu** |
| Suspension en cours dans la compétition du prochain match (ou compétition non précisée) | `p = 0`, joueur **exclu** |
| Pas de prochain match connu | `p = 0`, joueur **exclu** |
| Moins de `min_matchs_historique` matchs comptés | `p` inconnue, joueur **exclu** (« à vérifier ») |
| Blessure avec retour prévu avant le prochain match | `p` inchangée, joueur **douteux** |
| Suspension dans une autre compétition | `p` inchangée, alerte |
| Statut Sorare dans `statuts_sorare_douteux` (football) | `p` inchangée, joueur **douteux** (statut cohérent avec l'historique : `NOT_PLAYING` → p_hist médiane 0,02, `STARTER` → 0,98, sur les cartes du 2026-11-07 ; utile pour les quelques joueurs annoncés absents qui jouaient encore) |
| Club du joueur absent du prochain match (match de sélection) | `p` inchangée, joueur **douteux** |
| Composition officielle publiée | *à venir* (test 3 du récap en cours) |

**Filtre dur** : un joueur exclu ou douteux n'est jamais proposé. Seuil :
seuls les joueurs avec `p ≥ seuil_jouer` sont proposés par défaut (réglable
dans l'interface). L'écran « Mes cartes » montre tout le monde, avec la raison.

## 2. Éligibilité Arcade (football)

Le prochain match doit appartenir aux compétitions autorisées
(`regles/football-arcade-solo.json`, `competitions_autorisees.noms_api`) : la
règle porte sur le **match joué**. Sinon (coupe nationale…), la carte est
**non éligible** pour ce créneau, quelle que soit `p`. En NBA, toutes les
rencontres NBA sont éligibles.

## 3. Score s'il joue

### Football : mélange titulaire / entré en jeu

Les titulaires marquent nettement plus : 48,9 en moyenne contre 39,7 pour un
joueur entré en jeu (9 472 et 3 735 matchs de l'archive).

```
q   = part pondérée de « titulaire » parmi les matchs joués, poids 0,5^(i / demi_vie_titulaire)
μ_T = moyenne pondérée des scores comme titulaire, poids 0,5^(i / demi_vie_score) (× saison précédente)
μ_E = idem comme entré en jeu
μ   = q × μ_T + (1 − q) × μ_E
```

Si une des deux situations compte moins de `min_scores_situation` scores, on
prend pour elle la moyenne de tous les matchs joués. `σ` est l'écart-type
pondéré des scores joués autour de leur moyenne de situation.

Le rétro-test montre que pondérer les matchs récents améliore très peu le
score prédit (erreur absolue moyenne 12,9 quelle que soit la demi-vie ; 12,8
en séparant titulaire et entré). **L'erreur reste grande (environ 13 points
par joueur et par match)** : d'où la simulation de l'étape 3, qui raisonne en
probabilité de franchir le palier plutôt qu'en score moyen.

### NBA : minutes × score par minute

En NBA, les minutes expliquent l'essentiel du score (corrélation 0,78 sur
5 887 matchs joués). Sur les matchs joués avec minutes connues :

```
minutes = moyenne pondérée des minutes, poids 0,5^(i / demi_vie_minutes)
taux    = moyenne pondérée du score par minute, poids 0,5^(i / demi_vie_score_par_minute)
μ       = minutes × taux
```

C'est le meilleur prédicteur essayé, de peu (erreur absolue moyenne 8,54
contre 8,56 pour la simple moyenne récente), et il rend visible le levier
principal : une hausse ou une baisse de temps de jeu. `σ` = écart-type des
scores joués récents.

## 4. Bonus et espérance

```
b                 = 1 + bonusPct / 100      (lu sur la carte ; 1 si absent, avec alerte)
score s'il joue   = μ × b
espérance         = p × μ × b               (0 s'il ne joue pas)
```

Le capitaine (×1,5, football) et la probabilité de franchir le palier
relèvent de l'étape 3 (simulation de Monte-Carlo).

## Limites connues

- `p` ne voit ni l'adversaire, ni la rotation annoncée, ni un changement
  d'entraîneur. Les compositions officielles (test 3) et la vérification de
  l'étape « conseil » doivent corriger ces cas.
- Les joueurs qui changent de club gardent l'historique de l'ancien.
- `poids_saison_precedente` et `debut_saison` ne sont pas calibrés.
- Le rétro-test porte sur des joueurs que l'utilisateur possède aujourd'hui
  (biais de sélection possible) et sur une seule archive (2026-11-07).
