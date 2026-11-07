// Transforme les réponses de l'API en modèle normalisé commun football / NBA
// (docs/plan-appli.md, section 2). Fonctions pures, sans accès réseau.

// Postes de l'API → codes utilisés dans regles/.
const POSTES = {
  Goalkeeper: 'GK', Defender: 'DF', Midfielder: 'MD', Forward: 'FW',
  basketball_guard: 'G', basketball_forward: 'F', basketball_center: 'C',
};

const pctOuNull = (n, fenetre) => (n == null ? null : Math.round((n / fenetre) * 1000) / 1000);

// Situation du joueur dans un match.
// Football : titulaire | entre | banc | absent | inconnu (vérifié le 2026-11-07).
// NBA : l'API ne dit pas qui débute, et ça compte peu (utilisateur, 2026-11-07) :
// joue | banc | absent | inconnu ; ce sont les minutes qui comptent.
export function situation(stats, sport) {
  if (!stats) return 'inconnu';
  if (!stats.onGameSheet) return 'absent';
  if (!stats.playedInGame) return 'banc';
  if (sport === 'nba') return 'joue';
  if (stats.gameStarted) return 'titulaire';
  if (stats.fieldStatus === 'ON_FIELD' || stats.fieldStatus === 'SUBSTITUTED') return 'entre';
  return 'inconnu';
}

// Un match de l'historique d'un joueur, du point de vue de son équipe d'alors.
export function matchHistorique(g, sport) {
  const m = g.anyGame ?? {};
  const s = g.anyPlayerGameStats;
  const equipe = s?.anyTeam?.slug ?? null;
  const dom = m.homeTeam, ext = m.awayTeam;
  const aDomicile = equipe && equipe === dom?.slug ? true : equipe && equipe === ext?.slug ? false : null;
  return {
    matchId: m.id ?? null,
    date: m.date ?? null,
    equipe: equipe, // équipe du joueur ce jour-là (slug) : sert à la forme des équipes
    competition: m.competition?.name ?? null,
    domicile: aDomicile,
    adversaire: aDomicile === true ? ext?.name ?? null : aDomicile === false ? dom?.name ?? null : null,
    statut: g.scoreStatus,
    score: g.score,
    situation: situation(s, sport),
    minutes: s?.minsPlayed ?? null,
    // Contexte du match, du point de vue de l'équipe du joueur : buts (ou points) et cotes d'avant-match
    // (football ; les cotes restent lisibles après le match, vérifié le 2026-11-07).
    pour: aDomicile === true ? m.homeScore ?? null : aDomicile === false ? m.awayScore ?? null : null,
    contre: aDomicile === true ? m.awayScore ?? null : aDomicile === false ? m.homeScore ?? null : null,
    cotes: aDomicile === true ? cotes(m.homeStats) : aDomicile === false ? cotes(m.awayStats) : null,
  };
}

function cotes(stats) {
  if (!stats || stats.winOddsBasisPoints == null) return null;
  return {
    victoire: stats.winOddsBasisPoints / 10000,
    nul: stats.drawOddsBasisPoints / 10000,
    defaite: stats.loseOddsBasisPoints / 10000,
    coteCleanSheet: stats.cleanSheetOdds ?? null,
  };
}

export function normaliserMatch(g, sport) {
  if (!g) return null;
  return {
    id: g.id,
    sport,
    debutUTC: g.date,
    statut: g.statusTyped ?? null,
    competition: g.competition?.name ?? null,
    domicile: g.homeTeam ? { slug: g.homeTeam.slug, nom: g.homeTeam.name } : null,
    exterieur: g.awayTeam ? { slug: g.awayTeam.slug, nom: g.awayTeam.name } : null,
    cotes: sport === 'football' ? { domicile: cotes(g.homeStats), exterieur: cotes(g.awayStats) } : null,
    compositionsOfficielles: null, // test 3 du récap en cours
  };
}

// Compositions officielles : par équipe (slug), titulaires et remplaçants (slugs de joueurs).
export function normaliserCompositions(g, releveA) {
  if (!g) return null;
  const cote = (f) => (f?.startingLineupAvailable
    ? { titulaires: (f.startingLineup ?? []).flat().map((p) => p.slug), remplacants: (f.bench ?? []).map((p) => p.slug) }
    : null);
  return {
    releveA,
    equipes: Object.fromEntries([[g.homeTeam?.slug, cote(g.homeFormation)], [g.awayTeam?.slug, cote(g.awayFormation)]].filter(([s]) => s)),
  };
}

export function normaliserCarte(c, sport) {
  const b = c.skinEdition?.bonus;
  return {
    id: c.slug,
    slug: c.slug,
    sport,
    joueurId: c.anyPlayer?.slug ?? null,
    rarete: c.rarityTyped,
    saison: c.seasonYear,
    // Nom de collection : variantName (Four Suits, Eclipse) sinon skinName (Standard, Shiny, Holo).
    collection: c.skinEdition ? c.skinEdition.variantName ?? c.skinEdition.skinName : null,
    bonusPct: b == null ? null : Math.round((b - 1) * 1000) / 10,
    visuelUrl: c.pictureUrl ?? null,
  };
}

// Joueur, sans son historique (fusionné à part, voir historique.js).
export function normaliserJoueur(p, sport) {
  const futur = p.anyFutureGameStats?.[0] ?? null;
  const blessures = (p.activeInjuries ?? []).map((i) => ({
    type: i.kind ?? null, statut: i.status ?? null, retourPrevu: i.expectedEndDate ?? null,
  }));
  const suspensions = (p.activeSuspensions ?? []).map((s) => ({
    competition: s.competition?.name ?? null, motif: s.reason ?? null, type: s.kind ?? null,
    matchs: s.matches ?? null, fin: s.endDate ?? null,
  }));
  return {
    id: p.slug,
    sport,
    nom: p.displayName,
    postes: (p.anyPositions ?? []).map((x) => POSTES[x] ?? x),
    club: p.activeClub ? { slug: p.activeClub.slug, nom: p.activeClub.name } : null,
    tier: p.tier ?? null,
    etoiles: p.etoiles ?? null,
    statutSorare: p.playingStatus ?? null, // football seulement
    blessures,
    suspensions,
    moyennes: {
      L5: p.l5 ?? null, L10: p.l10 ?? null, L15: p.l15 ?? null, L40: p.l40 ?? null, saison: p.saison ?? null,
      pctJoues5: pctOuNull(p.a5, 5), pctJoues10: pctOuNull(p.a10, 10),
      pctJoues15: pctOuNull(p.a15, 15), pctJoues40: pctOuNull(p.a40, 40),
    },
    projectionSorare: {
      score: p.nextClassicFixtureProjectedScore ?? null,
      ...(sport === 'nba' && futur ? {
        points: futur.projectedPoints ?? null, rebonds: futur.projectedRebounds ?? null,
        passes: futur.projectedAssists ?? null, minutes: futur.projectedMinsPlayed ?? null,
      } : {}),
    },
    prochainMatchId: p.nextGame?.id ?? null,
  };
}

export function normaliserPaliers(board, sport) {
  if (!board) return [];
  return board.steps.map((s) => {
    const max = s.maxLineupsCount ?? null, restantes = s.remainingLineupsCount ?? null, enCours = s.pendingLineupsCount ?? null;
    return {
      sport,
      plateau: board.title,
      niveau: s.level,
      cible: s.target,
      etat: s.state,
      tentativesMax: max,
      tentativesRestantes: restantes,
      enCours,
      // Tentatives utilisées = max − restantes (réussie, échouées ou en cours ; confirmé par
      // l'utilisateur le 2026-11-07). Sur un palier passé, l'une d'elles est la réussite.
      echecs: max == null || restantes == null || enCours == null ? null
        : max - restantes - enCours - (['CLAIMED', 'CLAIMABLE'].includes(s.state) ? 1 : 0),
    };
  });
}
