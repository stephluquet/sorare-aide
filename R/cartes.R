# Récupère les cartes Sorare d'un manager (football ou NBA) et les moyennes
# L5 / L15 de chaque joueur.
#
# Usage :
#   Rscript R/cartes.R <slug-du-manager> [fichier_sortie.csv] [FOOTBALL|NBA]
#
# Le sport vaut FOOTBALL par défaut.
# Le slug est la fin de l'URL du profil : https://sorare.com/football/my-club/<slug>
# L'en-tête APIKEY est injecté par le proxy de l'environnement ; la valeur
# envoyée ici n'est qu'un espace réservé.

suppressPackageStartupMessages({
  library(httr2)
  library(jsonlite)
})

# Sans locale UTF-8, les accents sortent en <U+00E9> à l'affichage et dans le CSV.
if (!l10n_info()$`UTF-8`) invisible(Sys.setlocale("LC_CTYPE", "C.UTF-8"))

API_URL <- "https://api.sorare.com/graphql"
TAILLE_PAGE <- 50L

requete_cartes <- '
query Cartes($slug: String!, $sport: Sport!, $after: String, $first: Int!) {
  user(slug: $slug) {
    slug
    nickname
    cards(sport: $sport, first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        slug
        rarityTyped
        seasonYear
        anyPlayer {
          displayName
          slug
          l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
          l15: averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
        }
      }
    }
  }
}'

appel_graphql <- function(query, variables) {
  rep <- request(API_URL) |>
    req_headers(APIKEY = "injecte-par-le-proxy") |>
    req_body_json(list(query = query, variables = variables), auto_unbox = TRUE) |>
    req_retry(max_tries = 4, is_transient = \(r) resp_status(r) %in% c(429, 503)) |>
    req_perform() |>
    resp_body_json(simplifyVector = FALSE)
  if (!is.null(rep$errors)) {
    stop(paste(vapply(rep$errors, `[[`, "", "message"), collapse = " ; "))
  }
  rep$data
}

na_si_null <- function(x) if (is.null(x)) NA else x

recuperer_cartes <- function(slug, sport = "FOOTBALL") {
  lignes <- list()
  curseur <- NULL
  repeat {
    vars <- list(slug = slug, sport = sport, first = TAILLE_PAGE)
    if (!is.null(curseur)) vars$after <- curseur
    cartes <- appel_graphql(requete_cartes, vars)$user$cards
    for (c in cartes$nodes) {
      j <- c$anyPlayer
      lignes[[length(lignes) + 1L]] <- data.frame(
        joueur = na_si_null(j$displayName),
        rarete = na_si_null(c$rarityTyped),
        saison = na_si_null(c$seasonYear),
        L5 = na_si_null(j$l5),
        L15 = na_si_null(j$l15),
        carte = c$slug,
        stringsAsFactors = FALSE
      )
    }
    message(sprintf("%d / %d cartes", length(lignes), cartes$totalCount))
    if (!isTRUE(cartes$pageInfo$hasNextPage)) break
    curseur <- cartes$pageInfo$endCursor
  }
  res <- do.call(rbind, lignes)
  if (is.null(res)) return(data.frame())
  res[order(-res$L15, -res$L5), , drop = FALSE]
}

if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) < 1L) stop("Usage : Rscript R/cartes.R <slug> [sortie.csv] [FOOTBALL|NBA]")
  sport <- if (length(args) >= 3L) toupper(args[3]) else "FOOTBALL"
  cartes <- recuperer_cartes(args[1], sport)
  rownames(cartes) <- NULL
  print(cartes[, c("joueur", "rarete", "saison", "L5", "L15")], row.names = FALSE)
  if (length(args) >= 2L && nzchar(args[2])) {
    write.csv(cartes, args[2], row.names = FALSE)
    message("Écrit : ", args[2])
  }
}
