# Méthode v3 : probabilité de jouer, score attendu et compositions

Version 3 (2026-11-07) : la v2 (probabilité de jouer, score s'il joue) complétée
de la simulation et du choix des compositions (sections 5 et 6). Ce document **fait foi** : le moteur (`src/moteur/`)
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
  "version": 3,
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
  "statuts_sorare_douteux": ["NOT_PLAYING", "RETIRED"],
  "compositions_officielles": {
    "horizon_heures": 6,
    "p_titulaire": 0.99,
    "taux_entree_remplacant": 0.466,
    "a_priori_remplacant": 2,
    "demi_vie_remplacant": 5
  },
  "simulation": {
    "tirages": 5000,
    "graine": 20261107,
    "lissage": { "football": 0.35, "nba": 0.5 },
    "score_max": { "football": 100, "nba": null },
    "candidats_par_poste": { "GK": 5, "DF": 8, "MD": 8, "FW": 8 },
    "candidats_nba": 22,
    "equipes_simulees": 60,
    "prudente_ecart_max": 0.05,
    "ambitieuse_seuil_jouer": 0.6
  }
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
| **Composition officielle publiée** (football) | **l'emporte sur tout le reste**, voir 1 bis |

### 1 bis. Compositions officielles (football)

Elles apparaissent dans l'API environ une heure avant le coup d'envoi
(`Game.homeFormation` / `awayFormation`, relevé du 2026-11-07 : rien à H-2,
publiées à H-57 min pour Leeds–Tottenham). La récupération les lit pour les
matchs qui commencent dans les `horizon_heures` prochaines heures. Quand
celle de l'équipe du joueur est publiée, elle remplace l'historique,
les blessures et les statuts douteux :

| Le joueur est… | p | situation (q) | statut |
|---|---|---|---|
| titulaire | `p_titulaire` | titulaire (q = 1) | ok, « confirmé » |
| remplaçant | `(Σ w × entré + a × taux) / (Σ w + a)` | entré en jeu (q = 0) | ok |
| absent de la feuille | 0 | — | exclu |

Pour un remplaçant : `w = 0,5^(i / demi_vie_remplacant)` sur ses matchs passés
comme remplaçant (entré en jeu ou resté sur le banc), `taux` =
`taux_entree_remplacant`, `a` = `a_priori_remplacant`. Rétro-test (5 974 matchs
où le joueur était remplaçant) : 46,6 % d'entrées en jeu en moyenne, mais de
27 % à 75 % selon les joueurs (quartiles) ; la formule retenue fait passer le
score de Brier de 0,249 (taux moyen pour tous) à 0,187. `p_titulaire` (0,99)
est un choix : un titulaire annoncé joue presque toujours.

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

## 5. Simulation d'une équipe

On cherche la **probabilité de franchir le palier**, pas le meilleur score
moyen. Pour une équipe de 5 cartes (et un capitaine en football), on tire
`tirages` fois au sort le score de chaque joueur, avec un générateur à
**graine fixe** (`graine`) : les mêmes données donnent toujours les mêmes
probabilités.

Pour chaque joueur et chaque tirage :

```
joue ?            tirage de Bernoulli de probabilité p (section 1)
situation         football : titulaire avec probabilité q, sinon entré en jeu
score             un de ses scores passés de cette situation, tiré avec les poids de la section 3,
                  plus un bruit normal d'écart-type lissage × σ ; borné à [0, score_max]
                  (NBA : scores passés remis à l'échelle de μ = minutes × taux)
contribution      0 s'il ne joue pas, sinon score × b, × 1,5 pour le capitaine
```

Score de l'équipe = somme des 5 contributions. Probabilité de passer = part
des tirages où ce score atteint la cible du palier. **Probabilité « équipe
complète »** = produit des 5 probabilités de jouer (calcul exact, pas tiré).

**Pourquoi ce tirage.** Rétro-test (`node outils/retro-test-distribution.js
football|nba`, 10 065 et 4 319 matchs joués) : on regarde où tombe le score
réel dans la distribution prédite à partir des seuls matchs plus anciens. Le
rééchantillonnage des scores passés est mieux calibré qu'une loi normale
(écart total aux centiles 13,7 points contre 20,7 en football), mais un peu
trop étroit ; le bruit ajouté corrige les extrêmes. Meilleur lissage : 0,35 en
football (écart 7,8 points), 0,5 en NBA (12,8 points). Reste un léger
optimisme : 53 à 55 % des scores réels tombent sous la médiane prédite.

## 6. Choix des compositions

**Cartes admissibles** : proposables (section 1 : ni exclues ni douteuses,
`p ≥ seuil`), éligibles Arcade (section 2), de la rareté autorisée, **non
jouées à ce palier**, et dont le match **n'a pas commencé**. Un même joueur ne
peut pas figurer deux fois (deux cartes du même joueur : à vérifier dans le
jeu). Contraintes de `regles/` : postes (football : GK, DF, MD, FW + un joueur
de champ ; capitaine obligatoire), plafond d'étoiles (NBA : somme ≤ 16, 16
inclus, demi-étoiles comptées).

**Recherche en deux temps** (pour tenir en quelques secondes sur téléphone) :

1. *Présélection* : les `candidats_par_poste` meilleures espérances par poste
   (football ; le joueur de champ libre est pris parmi les candidats DF, MD,
   FW) ou les `candidats_nba` meilleures (NBA). Toutes les équipes possibles
   sont évaluées par une **approximation normale** : chaque contribution a
   pour moyenne `p × m` et pour variance `p × (v + m²) − (p × m)²`, où `m` et
   `v` sont la moyenne et la variance du score s'il joue (bonus et capitaine
   compris, lissage inclus) ; probabilité ≈ `1 − Φ((cible − Σ moyennes) / √Σ variances)`.
   En football, chaque joueur est essayé comme capitaine.
2. *Simulation* : les `equipes_simulees` meilleures équipes de l'étape 1 sont
   simulées (section 5) ; c'est cette probabilité qui est affichée.

**Trois propositions** :

| Proposition | Règle |
|---|---|
| **Équilibrée** | probabilité de passer maximale |
| **Prudente** (montrée en premier) | parmi les équipes à moins de `prudente_ecart_max` (5 points) de la meilleure probabilité de passer, celle dont la probabilité « équipe complète » est la plus haute |
| **Ambitieuse** | probabilité de passer maximale en acceptant des joueurs plus incertains (seuil abaissé à `ambitieuse_seuil_jouer`) ; montrée seulement si elle fait mieux que l'équilibrée |

Pour chacune : les 5 cartes, le capitaine, le score attendu, la probabilité de
passer, la probabilité « équipe complète » et l'heure du premier coup d'envoi
(l'équipe est verrouillée à ce moment-là).

## 7. Créneau unique

Variante des propositions où **les 5 matchs commencent à la même heure**
(même `debutUTC`). Intérêt : composer juste après la publication des
compositions officielles de ce créneau (vers H-1), quand les titulaires sont
connus (section 1 bis), au lieu de parier sur l'historique. Pour chaque
coup d'envoi à venir, on applique la section 6 aux seules cartes de ce
créneau (sans proposition ambitieuse) ; l'interface affiche les créneaux par
heure, avec leur meilleure chance de passer et l'état des compositions
(publiées ou non), à comparer avec le mode « plusieurs créneaux ».

## 8. Squad du jour

Le score du squad dépend de partenaires inconnus : l'outil propose la
**meilleure équipe du jour au sens du score attendu** (somme des
espérances, + 50 % de l'espérance du capitaine en football, capitaine = le
joueur de meilleure espérance). Cartes admissibles comme en section 6, sauf
que les cartes **jouées en Arcade sont autorisées** et que tous les matchs
doivent avoir lieu **le jour choisi** (heure de Paris). Mêmes règles de
composition que l'Arcade du sport (à confirmer dans le jeu). Recherche
exhaustive sur les candidats présélectionnés de la section 6.

## Limites connues

- **Les joueurs sont tirés indépendamment** : deux joueurs du même club (ou
  du même match) ont en réalité des scores liés (un match à sens unique
  profite à tous les attaquants d'une équipe). Les probabilités de passer
  d'une équipe groupée sont donc un peu trop optimistes ou pessimistes selon
  le cas. Non mesuré pour l'instant.
- La présélection peut écarter un joueur utile à une équipe particulière ;
  la recherche n'est pas exhaustive.

- `p` ne voit ni l'adversaire, ni la rotation annoncée, ni un changement
  d'entraîneur. Les compositions officielles (test 3) et la vérification de
  l'étape « conseil » doivent corriger ces cas.
- Les joueurs qui changent de club gardent l'historique de l'ancien.
- `poids_saison_precedente` et `debut_saison` ne sont pas calibrés.
- Le rétro-test porte sur des joueurs que l'utilisateur possède aujourd'hui
  (biais de sélection possible) et sur une seule archive (2026-11-07).
