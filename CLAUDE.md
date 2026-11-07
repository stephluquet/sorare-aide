# sorare-aide

Outils pour analyser les cartes Sorare (football et NBA) du manager **`yapapir`**.
Langue de travail : français. Langage : R (httr2, jsonlite déjà installés par
le script de setup de l'environnement).

## Tenir ce fichier à jour

Ce fichier est la mémoire du projet entre les sessions. **Mettez-le à jour dans
le même commit** chaque fois que vous découvrez quelque chose de durable :
une requête qui marche, un champ qui n'existe pas, une limite de l'API, un
nouveau script. Indiquez ce qui a été **vérifié** et ce qui est **supposé**.
Retirez ce qui devient faux plutôt que de l'empiler.

## Accès à l'API Sorare (vérifié)

- Point d'entrée : `POST https://api.sorare.com/graphql`, corps JSON
  `{"query": ..., "variables": ...}`.
- **Authentification** : le secret réseau de l'environnement injecte l'en-tête
  `APIKEY` pour `api.sorare.com`. Il n'y a rien à fournir : on envoie une valeur
  bidon (`APIKEY: injecte-par-le-proxy`) que le proxy remplace. Ne jamais
  demander la clé dans le chat.
- **Pas de `currentUser`** : cette clé ne représente pas un utilisateur connecté,
  `currentUser` renvoie toujours `null`. On interroge donc **par slug** :
  `user(slug: "yapapir")`. Les cartes d'un manager sont publiques.
- **Introspection désactivée** (`__type` / `__schema` → erreur). On ne peut pas
  explorer le schéma : tester les champs un par un.
- Un slug inexistant renvoie l'erreur `User(slug=...) not found` (code `NOT_FOUND`).

## Requête qui marche (vérifiée en football et en NBA)

```graphql
query Cartes($slug: String!, $sport: Sport!, $after: String, $first: Int!) {
  user(slug: $slug) {
    cards(sport: $sport, first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        slug rarityTyped seasonYear
        anyPlayer {
          displayName slug
          l5:  averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
          l15: averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
        }
      }
    }
  }
}
```

- `$sport` : `FOOTBALL` ou `NBA` (les deux vérifiés).
- **Pagination** par curseur : `first: 50`, puis `after: endCursor` tant que
  `hasNextPage` est vrai. 50 par page passe sans problème : 2 151 cartes en
  environ 15 s, sans erreur 429.
- **Limite : 200 requêtes par minute** (indiquée par l'utilisateur, non vérifiée ;
  les réponses ne renvoient aucun en-tête de quota). Une requête = une page de
  50 cartes. Le catalogue complet de `yapapir` coûte **21 requêtes** (13 pour le
  football, 8 pour la NBA). Sans pause, l'API répond à environ 3 requêtes par
  seconde, soit près de 180 par minute : d'où le plafond du script (voir plus bas).
- Les mêmes champs `averageScore` marchent aussi sur `anyPlayer(slug: ...)`.
- `L5 = 0` avec `L15 > 0` veut dire que le joueur n'a joué aucun des 5 derniers
  matchs (blessé, hors groupe). `L15 = 0` veut dire aucun score sur 15 matchs.

## Script : `R/cartes.R`

```bash
Rscript R/cartes.R <slug> [sortie.csv] [FOOTBALL|NBA]
```

- Le sport vaut `FOOTBALL` par défaut. Colonnes du CSV : `joueur, rarete, saison,
  L5, L15, carte`, triées par L15 puis L5 décroissants.
- La fonction `recuperer_cartes(slug, sport)` peut s'utiliser seule via
  `source("R/cartes.R")`.
- Les relances sur les erreurs 429 et 503 sont gérées par `req_retry`.
- **Plafond de 150 requêtes par minute** (vérifié) : `attendre_son_tour()` impose
  0,4 s entre deux départs de requête (`REQUETES_PAR_MINUTE` en tête du script).
  Toute nouvelle requête doit passer par `appel_graphql()` pour en profiter.
  Le plafond ne vaut que pour un processus R : deux scripts lancés en parallèle
  peuvent ensemble dépasser 150. Ne pas utiliser `req_throttle()` : httr2 est en
  1.0.0 ici, et à partir de la 1.1.0 la fonction autorise une rafale initiale.
  Le catalogue NBA de `yapapir` (8 requêtes) prend environ 4 s.
- Le conteneur tourne en locale C : le script passe en `C.UTF-8`, sinon les
  accents sortent sous la forme `<U+00E9>`. Ne pas remettre
  `fileEncoding = "UTF-8"` dans `write.csv` : cela réintroduit le problème.

## État du compte `yapapir` (au 2026-11-07)

- Football : 635 cartes, toutes `common` de 2026, 585 joueurs différents.
- NBA : 394 cartes, toutes `common` de 2026, 289 joueurs différents.

## Pistes non vérifiées

- Moyenne L10 côté NBA, celle que l'appli met en avant : le nom de l'enum
  `averageScore` n'a pas été testé.
- Postes, clubs, prochains matchs, prix : pas encore explorés.
