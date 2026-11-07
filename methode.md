# Méthode de projection (étape 1)

Version 1 (2026-11-07). Ce document **fait foi** : `src/projection.js` lit les
paramètres dans le bloc JSON ci-dessous et applique les formules décrites ici,
sans les recopier. Toute modification de la méthode passe par ce fichier, et
les cas de `tests/cas/` doivent être mis à jour en conséquence.

But : estimer, pour chaque carte, le **score attendu au prochain match** du
joueur, de façon simple et vérifiable à la main. Pas de modèle opaque.

## Paramètres

<!-- parametres:debut -->
```json
{
  "version": 1,
  "poids_l5": 0.4,
  "poids_jeu_recent": 0.5,
  "statuts_joues": ["FINAL", "REVIEWING"],
  "statuts_comptes": ["FINAL", "REVIEWING", "DID_NOT_PLAY"],
  "min_scores_dispersion": 3
}
```
<!-- parametres:fin -->

`poids_l5` et `poids_jeu_recent` sont des **choix initiaux, non calibrés** :
ils donnent un peu plus de poids à la tendance longue (L15) qu'à la forme
récente (L5), et autant de poids aux 5 derniers matchs qu'aux 15 derniers pour
la régularité de jeu. À calibrer quand on aura accumulé des données.

## Données utilisées (par carte)

Toutes viennent de l'API Sorare (voir `CLAUDE.md`) :

- `L5`, `L15` : moyennes Sorare. **Elles ne comptent que les matchs joués** :
  c'est la moyenne des scores des matchs effectivement joués parmi les 5 (ou
  15) derniers matchs de l'équipe ; les matchs non joués (DNP) sont exclus,
  pas comptés comme des 0. Règle déduite et vérifiée sur 48 cartes sur 50
  (2026-11-07). Elles mesurent donc le niveau **quand le joueur joue**, pas sa
  probabilité de jouer.
- les 15 derniers matchs de l'équipe, du plus récent au plus ancien, avec
  pour chacun le score et le statut (`FINAL` joué, `REVIEWING` joué et en cours
  de vérification, `DID_NOT_PLAY` non joué) ;
- blessures et suspensions actives ;
- prochain match : date, adversaire, domicile ou extérieur, cotes de l'équipe
  (football) ;
- multiplicateur de bonus de collection de la carte (`skinEdition.bonus`).

## Formule

Notations : `M` = derniers matchs comptés (statut dans `statuts_comptes`), du
plus récent au plus ancien ; `J₅` et `J₁₅` = nombre de matchs joués (statut
dans `statuts_joues`) parmi les 5 et les 15 premiers de `M` ; `n₅` et `n₁₅` =
nombre de matchs comptés dans ces fenêtres (au plus 5 et 15).

### 1. Niveau quand il joue : `m`

```
si J₁₅ = 0 ou L15 = 0 : m inconnu (« aucun score sur 15 matchs »)
si J₅ = 0             : m = L15                      (L5 vaut 0 faute de match joué, pas faute de niveau)
sinon                 : m = poids_l5 × L5 + (1 − poids_l5) × L15
```

### 2. Probabilité de jouer : `p`

Régularité récente, mesurée sur les matchs de l'équipe :

```
t₅  = J₅ / n₅        t₁₅ = J₁₅ / n₁₅
p   = poids_jeu_recent × t₅ + (1 − poids_jeu_recent) × t₁₅
```

Puis le statut l'emporte :

- **blessure active** sans date de retour, ou avec un retour prévu **après**
  le prochain match → `p = 0`, alerte « blessé » ;
- blessure active avec un retour prévu **avant** le prochain match → `p`
  inchangé, alerte « retour de blessure : à vérifier » ;
- **suspension active** dans la compétition du prochain match (ou dont la
  compétition n'est pas précisée) → `p = 0`, alerte « suspendu : à vérifier » ;
- suspension active dans **une autre** compétition → `p` inchangé, alerte ;
- pas de prochain match connu → projection inconnue, alerte.

### 3. Bonus de collection : `b`

`b` = multiplicateur lu sur la carte (1,0 Standard, 1,05 Shiny…). S'il manque :
`b = 1` et alerte.

### 4. Projection

```
score si joue  = m × b
projection     = p × m × b        (espérance : un joueur qui ne joue pas marque 0)
```

### 5. Dispersion (pour l'étape 2)

`σ` = écart-type (population) des scores des matchs joués parmi les 15
derniers, calculé seulement s'il y en a au moins `min_scores_dispersion`.
Affiché, non utilisé dans la projection. Il servira à estimer la probabilité
de franchir un palier : à moyenne égale, un joueur régulier est plus sûr.

## Ce qui est affiché sans entrer dans la formule

- **Contexte du match** : domicile ou extérieur, cotes de victoire, nul et
  défaite de l'équipe (football). Aucun coefficient n'est appliqué : un
  ajustement inventé serait pire qu'aucun. À calibrer plus tard sur l'historique.
- **Données Sorare au calcul non publié** : statut de jeu (`STARTER`,
  `REGULAR`, `SUBSTITUTE`, `SUPER_SUBSTITUTE`, `NOT_PLAYING`) et projection
  Sorare du prochain match, montrés pour comparaison. Les probabilités de
  titularisation existent dans le schéma mais reviennent vides avec notre clé.

## Limites connues

- Le niveau `m` ne tient pas compte de l'adversaire ni du lieu.
- `p` repose sur le passé : un nouveau titulaire, un retour de blessure ou un
  changement d'entraîneur sont mal captés. L'étape 3 (vérification des
  compositions probables, sources citées) doit corriger ces cas à la main.
- `p` traite chaque match comme joué ou non, sans distinguer 10 et 90 minutes.
- Les matchs de sélection nationale : l'équipe du joueur n'apparaît pas dans
  le match, donc domicile ou extérieur et cotes sont inconnus (alerte).
- Les poids n'ont pas été calibrés.
