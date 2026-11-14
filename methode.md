# Méthode v3 : probabilité de jouer, score attendu et compositions

Version 3 (2026-11-07) : la v2 (probabilité de jouer, score s'il joue) complétée
de la simulation et du choix des compositions (sections 5 et 6), puis du
contexte du match (section 9 : cotes en football, dos-à-dos et blessures ESPN en NBA). Ce document **fait foi** : le moteur (`src/moteur/`)
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
    "calibration_jouer": [[0.016, 0.078], [0.174, 0.215], [0.326, 0.415], [0.48, 0.515], [0.635, 0.647], [0.751, 0.781], [0.855, 0.827], [0.928, 0.859], [0.967, 0.863], [0.997, 0.896]],
    "demi_vie_titulaire": 3,
    "demi_vie_score": 10,
    "min_scores_situation": 3,
    "debut_saison": "2026-07-01"
  },
  "nba": {
    "demi_vie_jouer": 2,
    "plancher": 0.10,
    "plafond": 0.93,
    "calibration_jouer": [[0.018, 0.101], [0.175, 0.24], [0.326, 0.412], [0.479, 0.571], [0.636, 0.643], [0.751, 0.768], [0.855, 0.822], [0.947, 0.872], [0.998, 0.916]],
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
    "alternatives_par_poste": 4,
    "alternatives_nba": 8,
    "ambitieuse_seuil_jouer": 0.6,
    "calibration_passer": {
      "football": [[0, 0], [0.2, 0.178], [0.35, 0.332], [0.5, 0.48], [0.65, 0.642], [0.8, 0.782], [1, 1]],
      "nba": [[0, 0], [0.2, 0.118], [0.35, 0.261], [0.5, 0.398], [0.65, 0.527], [0.8, 0.655], [1, 1]]
    }
  },
  "contexte": {
    "football_cotes": {
      "pente": { "GK": 12.9, "DF": 22.9, "MD": 19.0, "FW": 11.4 },
      "victoire_moyenne": { "GK": 0.372, "DF": 0.380, "MD": 0.383, "FW": 0.398 }
    },
    "nba_dos_a_dos": { "fuseau": "America/New_York", "facteur_jouer": 0.925 },
    "espn_blessures": { "Out": "exclu", "Doubtful": "exclu", "Questionable": "douteux", "Day-To-Day": "douteux" }
  },
  "retrait": {
    "football": { "k": 20, "moyennes": { "GK": { "titulaire": 48, "entre": 37.7 }, "DF": { "titulaire": 48.7, "entre": 37.9 }, "MD": { "titulaire": 49.2, "entre": 40 }, "FW": { "titulaire": 49.4, "entre": 40.4 } } },
    "nba": { "k": 8, "taux_moyen": 0.898 }
  },
  "forme": {
    "matchs_affiches": 5,
    "fenetre_victoires": 10,
    "serie_notable": 3,
    "joueur_recent": 3,
    "joueur_reference": 15,
    "joueur_reference_min": 5,
    "seuil_tendance": 0.15
  },
  "profil": {
    "fenetre_matchs": 10,
    "min_matchs": 5,
    "minutes_reference": 20,
    "quart": 0.25,
    "ecart_min_points": 0.5
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
| Équipe du joueur introuvable dans le prochain match : ni son club, ni une équipe avec laquelle il a joué dans son historique (sa sélection) | `p` inchangée, joueur **douteux**. **Depuis le 2026-11-14**, un match de sélection (Ligue des nations, jouable en Arcade) n'est plus douteux : l'équipe du joueur est sa sélection, retrouvée dans son historique (`equipeDuMatch`), et les cotes et compositions sont lues pour elle. Limite : ses chances de jouer reposent sur tout son historique, club et sélection mêlés. |
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
contribution      0 s'il ne joue pas, sinon score × (b + 0,5 pour le capitaine)
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

**Cumul des bonus : addition** (`regles/`, `cumul_bonus`). Le score d'une
carte vaut score du joueur × (1 + bonus de la carte + 0,5 s'il est capitaine) :
un capitaine Eclipse (+20 %) compte × 1,7, pas × 1,8. Vérifié le 2026-11-07
sur des classements classiques publics (le bonus de capitaine s'ajoute aux
bonus de collection et d'expérience) ; pour le bonus d'édition en Arcade,
déduit de l'API, non vérifié directement. Conséquence : le brassard rapporte
50 % du score **de base** ; il revient au joueur qui marque le plus, pas à la
carte la plus bonifiée.

## 5 bis. Calibrage final des chances de passer (2026-11-08)

Après le retrait (3 bis) et le calibrage des chances de jouer (1 ter), le rétro-test des équipes
(`node outils/retro-test-equipe.js`) donne, chances simulées → part d'équipes qui ont réellement
atteint la cible : football 20 % → 17,8 % ; 35 % → 33,2 % ; 50 % → 48,0 % ; 65 % → 64,2 % ;
80 % → 78,2 % (1 000 équipes, 26 journées) ; NBA 20 % → 11,8 % ; 35 % → 26,1 % ; 50 % → 39,8 % ;
65 % → 52,7 % ; 80 % → 65,5 % (440 équipes). En NBA il reste un optimisme d'une dizaine de points
qu'un retrait plus fort ne corrige pas (essayé k = 12, 16, 24). Les chances de passer affichées
passent donc par la table `simulation.calibration_passer` du sport (interpolation linéaire,
0 → 0 et 1 → 1 aux bouts) : la valeur simulée reste disponible (`pPasserBrut`) et l'ordre des
équipes ne change pas (table croissante). Limite : tables estimées sur 26 journées ; à refaire
quand l'archive grandit (même commande).

## 5 ter. Résumés pour l'affichage (2026-11-08)

Ces résumés servent seulement à **dessiner** ; ils ne changent aucune chance ni aucun choix.

- **Distribution du score de l'équipe** (`resumerTirages`) : les `tirages` totaux de la simulation
  de la section 5 (même graine, même ordre des cartes, donc les mêmes tirages que la proposition)
  rangés en 40 classes de même largeur. Bornes : quantiles 0,5 % et 99,5 % des totaux, élargis
  pour contenir la cible, plus 5 % de marge, arrondis à 10 points. On en tire aussi la moyenne,
  les quantiles 10, 50 et 90 % et la **part des tirages au-dessus de la cible**, qui est
  exactement `pPasserBrut`. L'appli affiche les deux honnêtement : la part brute sous
  l'histogramme et, à côté, les chances corrigées par la table de la section 5 bis (`pPasser`).
- **Fourchette du score s'il joue** (`quantilesSiJoue`) : 2 000 tirages de la distribution de la
  carte (section 5) **en supposant qu'il joue** (on ne tire pas `p`), multipliés par le bonus de
  la carte ; quantiles 10 et 90 % (80 % des scores attendus entre les deux), avec la même graine.
  Comme le score tiré, la fourchette tient compte du lissage, du bornage et des décalages
  (cotes, retrait vers la moyenne du poste).


## 5 quater. Si les 5 jouent (2026-11-14)

Deux causes font échouer une équipe : un joueur ne joue pas (il marque 0), ou les cinq jouent mais leur
total reste sous la cible. L'appli les sépare (demande de l'utilisateur du 2026-11-14, qui lisait « Les 5
jouent » comme des chances de passer) :

- **Chances que les 5 jouent** = produit des chances de jouer, p₁ × … × p₅ (inchangé, ancien libellé « Les 5 jouent ») ;
- **Si les 5 jouent** : la même simulation (mêmes tirages, même graine, même capitaine) avec pᵢ = 1 pour les cinq ;
  chances de passer, corrigées par la même table que `pPasser` (5 bis), et **score habituel** = médiane des totaux.

Exemple (données du 2026-11-14, football, palier 360, proposition prudente) : chances de passer 8 %, chances que
les 5 jouent 58 %, si les 5 jouent 14 %, score habituel 303 : l'écart à la cible (−57) pèse plus que les absences.
Calculé seulement pour les équipes proposées (`siLes5Jouent`, `src/moteur/simulation.js`), pas pour les 60 équipes simulées.
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
   `v` sont la moyenne et la variance du score s'il joue multipliées par le
   multiplicateur de la carte (bonus et capitaine, par addition ; lissage
   inclus) ; probabilité ≈ `1 − Φ((cible − Σ moyennes) / √Σ variances)`.
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

## 6 bis. Autres choix

L'outil propose, mais l'utilisateur garde la main : sous l'équipe proposée,
il montre d'autres joueurs qui peuvent performer. Pour chaque poste
(football : GK, DF, MD, FW) les `alternatives_par_poste` meilleures
espérances parmi les cartes admissibles (section 6) hors de l'équipe ; en
NBA, les `alternatives_nba` meilleures. Pour chacune, on simule (section 5)
l'équipe où elle remplace un joueur, en essayant chaque remplacement
permis (postes, joueur unique, étoiles ≤ 16), et on affiche le meilleur :
le joueur remplacé et la nouvelle chance de passer. Si le capitaine est
remplacé, le brassard passe au joueur de plus grand p × μ.

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
espérances, plus en football le gain du brassard : 50 % du score de base
attendu, p × μ ; capitaine = le joueur de plus grand p × μ, bonus de carte
non compris, voir le cumul des bonus en section 5). Cartes admissibles comme en section 6, sauf
que les cartes **jouées en Arcade sont autorisées** et que tous les matchs
doivent appartenir à **la journée de jeu choisie**, au sens de Sorare
(`regles/squad.json`, `journee_de_jeu`) : en football, la date du coup
d'envoi à Paris ; **en NBA, la date du coup d'envoi à New York**, si bien
que la soirée américaine et la nuit qui suit à Paris forment une seule
journée (affichée par Sorare, vue de Paris, à la date du lendemain).
Vérifié sur un mois de calendrier (voir `CLAUDE.md`). Mêmes règles de
composition que l'Arcade du sport (à confirmer dans le jeu). Recherche
exhaustive sur les candidats présélectionnés de la section 6.

## 9. Contexte du match

Rétro-tests du 2026-11-07 (`node outils/retro-test-contexte.js football|nba`)
sur l'archive complétée avec les cotes et les résultats. On compare le score
réel au niveau habituel du joueur, estimé sur ses seuls matchs plus anciens.

**Football : cotes du match.** Pour un **titulaire**, l'écart au score
habituel suit la probabilité de victoire de son équipe (cote d'avant-match de
Sorare, `winOddsBasisPoints`). Sur 6 700 matchs comme titulaire, la pente
estimée sur une moitié des joueurs réduit l'erreur sur l'autre moitié :
défenseurs 14,91 → 14,80, milieux 12,31 → 12,11, gardiens 15,57 → 15,33,
attaquants 14,32 → 14,24 (corrélations 0,20 ; 0,19 ; 0,11 ; 0,11). Gain
modeste mais constant. Quand les cotes du prochain match sont connues :

  décalage = pente[poste] × (P(victoire) − victoire_moyenne[poste])

ajouté au score **de titulaire** (μ titulaire et, dans la simulation, chaque
tirage de la situation titulaire), pas à celui d'un entré en jeu (non
mesuré). Pentes et moyennes sur tout l'échantillon (`contexte.football_cotes`) ;
exemple : un défenseur dont l'équipe a 75 % de chances de gagner prend
22,9 × (0,75 − 0,38) ≈ +8,5 points s'il est titulaire ; à 20 %, −4,1. Le poste
est le premier poste du joueur. La chance de clean sheet (1 / cote) donne à
peu près la même chose et n'est pas ajoutée (les deux sont très liées).
**La forme de l'équipe** (points pris sur les 5 derniers matchs) **n'apporte
rien** une fois la cote connue (corrélation partielle −0,07 à −0,10) : non utilisée.

**NBA : deuxième soir consécutif (dos-à-dos).** Joueurs qui jouaient
régulièrement (au moins 4 des 5 matchs précédents), selon les jours depuis le
match précédent de l'équipe (dates de New York) : 1 jour → joue 81,3 % (551
matchs) ; 2 jours → 87,6 % ; 3 jours → 89,3 % ; 4 jours ou plus → 59,4 %
(surtout des retours de blessure, déjà signalés par ailleurs). Le score s'il
joue ne baisse pas. Si le prochain match a lieu le lendemain (New York) du
dernier match de l'équipe connu dans l'historique :

  p ← p × facteur_jouer, avec facteur_jouer = 0,813 / 0,879 ≈ 0,925

(0,879 = taux des matchs à 2 ou 3 jours de repos). Ne s'applique pas à un
joueur exclu. Le dernier match de l'équipe est le plus récent de
l'historique du joueur antérieur au prochain match (l'historique compte les
matchs de l'équipe où il n'a pas joué).

**NBA : blessures annoncées par ESPN.** `site.api.espn.com`, liste des
blessures de la ligue (statut, commentaire en anglais, date). Rapprochement
par nom (sans accents ni ponctuation) **et** équipe. Effet
(`contexte.espn_blessures`) : `Out` et `Doubtful` → exclu, `Questionable` et
`Day-To-Day` → douteux ; le commentaire court est affiché avec sa date. Une
composition officielle (football seulement) l'emporterait. Le 2026-11-07, sur
92 joueurs listés, 53 sont dans le catalogue ; Sorare signalait déjà une
blessure pour 50 d'entre eux : ESPN ajoute surtout les incertains du jour et
le texte du commentaire.

**NBA : cotes ESPN (écart prévu, total de points).** Sur 169 matchs passés
(910 matchs de joueurs réguliers), **aucun effet** mesurable sur le score ou
les minutes (corrélations −0,03 à 0,07, y compris pour les matchs très
déséquilibrés) : non utilisées.

## 1 ter. Calibrage par tranches des chances de jouer (2026-11-08)

La droite plancher → plafond de la section 1 était un peu trop confiante en haut de l'échelle
(football : 92,9 % annoncés, 89,7 % réalisés dans la tranche la plus haute). Elle est remplacée
par une **table de calibrage** (`calibration_jouer`, couples [part pondérée des matchs joués,
part réellement jouée au match suivant], interpolation linéaire entre les points, valeurs
extrêmes prolongées) estimée par tranches sur toute l'archive (football 20 142 matchs, NBA
9 030 ; tranches voisines fusionnées quand l'ordre n'était pas respecté). Validée sur une
moitié des joueurs estimée sur l'autre : Brier 0,1393 → 0,1387 (football), inchangé en NBA
(0,1484 → 0,1487). Un joueur qui a tout joué récemment est à 90 % (football) et 92 % (NBA).
`plancher` et `plafond` restent le repli si la table manque.

## 3 bis. Retrait vers la moyenne du poste (effet de sélection)

**Constat** (rétro-test au niveau de l'équipe, `node outils/retro-test-equipe.js`, 2026-11-08 :
1 000 équipes composées comme le moteur sur 26 journées passées, chaque joueur reconstruit
avec ses seuls matchs antérieurs) : **le moteur était trop optimiste**. Annoncé 50 % de chances
de passer → réalisé 32 % ; annoncé 80 % → 66 % ; 68 % des scores réels d'équipe sous la
médiane annoncée. Cause principale : en retenant les meilleures moyennes récentes, le moteur
retient aussi celles que la chance a gonflées. Pour les 10 % de joueurs à la meilleure
espérance, le score s'il joue annoncé valait 60,3 contre 52,5 réalisés (football) et 32,4
contre 26,0 (NBA). Les chances de jouer, elles, sont à peu près justes (92,9 % annoncés pour
89,7 % réalisés dans la tranche la plus haute en football ; le plafond optimal reste 0,93).

**Correction** : la moyenne du joueur est rapprochée de celle de son poste, d'autant plus qu'il
a peu de matchs (retrait bayésien empirique) :

  μ' = a + (μ − a) × n / (n + k)

- football : séparément pour la moyenne de titulaire et celle d'entré en jeu, `a` = moyenne du
  poste dans cette situation sur toute l'archive (`retrait.football.moyennes`), n = nombre de
  scores du joueur dans cette situation, **k = 20** ; le décalage des cotes (section 9)
  s'ajoute ensuite ;
- NBA : sur le score par minute, `a` = score par minute de la ligue (0,898), n = nombre de
  matchs avec minutes, **k = 8** ; μ = minutes × taux retiré.

La simulation (section 5) décale chaque tirage d'autant (football) ou remet à l'échelle de μ'
(NBA). Choix de k par `node outils/retro-test-retrait.js football|nba` (11 607 et 5 907 matchs
joués prédits) : l'erreur quadratique baisse un peu (football 16,65 → 16,01 ; NBA 10,70 →
10,58) et le biais des 10 % meilleurs tombe de +6,9 à +0,5 point (football, k = 20) et de +2,8
à +0,6 (NBA, k = 8).

### 9 bis. Forme affichée (équipe, adversaire, joueur) : hors calcul

À la demande de l'utilisateur (2026-11-07), l'appli met en avant la forme. Ces
chiffres sont **affichés seulement** : la forme de l'équipe n'améliore pas la
prédiction une fois la cote connue (section 9), et la forme récente du joueur
est déjà dans la pondération de son score (demi-vie de 10 matchs, section 3).
Définitions (`src/moteur/forme.js`, paramètres `forme`) :

- **Matchs d'une équipe** : reconstitués à partir de l'historique des joueurs
  du catalogue qui y jouaient ce jour-là (équipe enregistrée match par match),
  toutes compétitions, dédoublonnés par match. Une équipe sans aucun joueur
  du catalogue n'a pas de forme connue (fréquent pour l'adversaire).
- **Résultat** : victoire, nul ou défaite d'après le score final.
- **Derniers matchs** : les `matchs_affiches` plus récents (5).
- **% de victoires** : sur les `fenetre_victoires` derniers matchs (10), avec
  les buts (ou points) marqués et encaissés en moyenne.
- **Série** : victoires ou défaites d'affilée (à partir de 2), sinon matchs
  sans défaite ou sans victoire (à partir de `serie_notable` = 3).
- **Forme du joueur** : moyenne de ses `joueur_recent` (3) derniers matchs
  joués comparée à celle de ses `joueur_reference` (15) derniers ; « en forme »
  au-delà de +15 % (`seuil_tendance`), « en baisse » en deçà de −15 %. S'y
  ajoutent ses titularisations (football) ou ses minutes (NBA) sur les 5
  derniers matchs de l'équipe.

## Limites connues

- **Les joueurs sont tirés indépendamment** : deux joueurs du même club (ou
  du même match) ont en réalité des scores liés (un match à sens unique
  profite à tous les attaquants d'une équipe). Les probabilités de passer
  d'une équipe groupée sont donc un peu trop optimistes ou pessimistes selon
  le cas. Non mesuré pour l'instant.
- La présélection peut écarter un joueur utile à une équipe particulière ;
  la recherche n'est pas exhaustive.

- `p` ne voit ni l'adversaire (sauf les cotes de la section 9, et sur le score seulement), ni la rotation annoncée, ni un changement
  d'entraîneur. Les compositions officielles (test 3) et la vérification de
  l'étape « conseil » doivent corriger ces cas.
- Les joueurs qui changent de club gardent l'historique de l'ancien.
- `poids_saison_precedente` et `debut_saison` ne sont pas calibrés.
- Le rétro-test porte sur des joueurs que l'utilisateur possède aujourd'hui
  (biais de sélection possible) et sur une seule archive (2026-11-07).

## 10. Profil NBA en points Sorare (2026-11-14, affichage seulement)

Demande de l'utilisateur : voir d'où viennent les points d'un joueur, et repérer ses points faibles (il écarte
les joueurs qui perdent beaucoup de ballons). **Affichage seulement** : le profil ne change ni les chances ni la
simulation.

- **Données** : statistiques de chaque match NBA (`stats` de l'historique) et **barème lu dans l'API**
  (`baremes.nba.poids` : point 1, rebond 1,2, passe 1,5, contre 3, interception 3, balle perdue −2, panier à
  3 points 1, double-double 1, triple-double 1 au 2026-11-14 ; jamais recopié dans le code).
- **Profil** : moyenne **par match** de chaque statistique sur les `fenetre_matchs` derniers matchs joués
  (au moins `min_matchs`), et les **points Sorare** qu'elle rapporte (moyenne × barème). Pas de ramenage à
  36 minutes (décision de l'utilisateur : seul compte ce que le joueur marque dans le match).
- **Comparaison** : à tous les joueurs du catalogue (les postes sont libres en NBA) qui jouent au moins
  `minutes_reference` minutes par match en moyenne sur la même fenêtre. Rang de l'apport en points (1 = le plus
  gros ; pour les balles perdues, la perte la plus faible). **Point fort** dans le premier `quart` du groupe,
  **point faible** dans le dernier ; une statistique dont les apports s'étalent sur moins de `ecart_min_points`
  point ne départage pas (« moyen »).
- **Affichage** : barres de part et d'autre d'une ligne zéro (le négatif à gauche), repère de l'apport médian
  du groupe, rang ; barre « d'où viennent ses points ». Mes cartes : tri par balles perdues.

