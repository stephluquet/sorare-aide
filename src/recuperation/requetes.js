// Requêtes GraphQL. Chaque champ a été vérifié dans le schéma et sur les cartes
// de l'utilisateur (voir le tableau de CLAUDE.md).

// Statistiques d'un match pour un joueur, communes aux deux requêtes de scores.
const STATS_MATCH = `
  score
  scoreStatus
  anyGame { id date competition { name } homeTeam { slug name } awayTeam { slug name } }
  anyPlayerGameStats {
    anyTeam { slug }
    onGameSheet
    playedInGame
    ... on PlayerGameStats { fieldStatus gameStarted minsPlayed }
    ... on PlayerGameStatsBasketball { minsPlayed }
  }`;

export const CARTES = `
query Cartes($slug: String!, $sport: Sport!, $first: Int!, $after: String) {
  user(slug: $slug) {
    cards(sport: $sport, first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        slug
        rarityTyped
        seasonYear
        pictureUrl
        skinEdition { skinName variantName bonus }
        anyPlayer {
          slug
          displayName
          anyPositions
          activeClub { slug name }
          tier: gameplayTier(gameMode: SET)
          etoiles: gameplayTierStars(gameMode: SET)
          l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
          l10: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
          l15: averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
          l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
          saison: averageScore(type: SEASON_AVERAGE_SCORE)
          a5: lastFiveSo5Appearances
          a10: lastTenSo5Appearances
          a15: lastFifteenSo5Appearances
          a40: lastFortySo5Appearances
          activeInjuries { kind status expectedEndDate }
          activeSuspensions { kind reason matches endDate competition { name } }
          playerGameScores(last: 15) { ${STATS_MATCH} }
          nextGame {
            id
            date
            statusTyped
            competition { name }
            homeTeam { slug name }
            awayTeam { slug name }
            ... on Game {
              homeStats { ... on FootballTeamGameStats { winOddsBasisPoints drawOddsBasisPoints loseOddsBasisPoints cleanSheetOdds } }
              awayStats { ... on FootballTeamGameStats { winOddsBasisPoints drawOddsBasisPoints loseOddsBasisPoints cleanSheetOdds } }
            }
          }
          ... on Player {
            playingStatus
            nextClassicFixtureProjectedScore
          }
          ... on NBAPlayer {
            nextClassicFixtureProjectedScore
          }
          anyFutureGameStats(first: 1) {
            ... on PlayerGameStatsBasketball { projectedPoints projectedRebounds projectedAssists projectedMinsPlayed }
          }
        }
      }
    }
  }
}`;

// allPlayerGameScores est refusé dans une liste de cartes : une requête par joueur.
export const HISTORIQUE = `
query Historique($slug: String!, $first: Int!) {
  anyPlayer(slug: $slug) {
    slug
    allPlayerGameScores(first: $first) { nodes { ${STATS_MATCH} } }
  }
}`;

export const PALIERS = `
query Paliers($slug: String!, $sport: Sport!) {
  user(slug: $slug) {
    setBoard(mode: CAREER, sport: $sport) {
      title
      steps {
        level
        target
        state
        ... on CareerStep { maxLineupsCount remainingLineupsCount pendingLineupsCount }
      }
    }
  }
}`;
