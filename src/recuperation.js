// Récupère toutes les cartes d'un manager Sorare avec les données de l'étape 1
// et les écrit, datées, dans data/cartes-<sport>-AAAA-MM-JJ.json.
//
// Usage : node src/recuperation.js [slug] [football|nba] [--force]
//   slug   : manager Sorare (défaut : yapapir)
//   sport  : football (défaut) ou nba
//   --force: refait l'appel même si le fichier du jour existe déjà (cache)
//
// La clé API est injectée par le proxy de l'environnement (en-tête APIKEY) :
// la valeur envoyée ici n'est qu'un espace réservé. Ne jamais y mettre la vraie clé.
// Lecture seule : ce module n'envoie que des requêtes de lecture (query), jamais de mutation.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_URL = 'https://api.sorare.com/graphql';
const TAILLE_PAGE = 50;
const NB_DERNIERS_MATCHS = 15;

// Plafond : 150 requêtes par minute (l'API en autorise 200, et 150 pour les
// champs NBA). Écart minimal entre deux départs de requête, valable pour ce
// processus : ne pas lancer deux récupérations en parallèle.
const REQUETES_PAR_MINUTE = 150;
const ECART_MIN_MS = 60_000 / REQUETES_PAR_MINUTE;
let dernierDepart = -Infinity;
let nbRequetes = 0;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function attendreSonTour() {
  const attente = dernierDepart + ECART_MIN_MS - Date.now();
  if (attente > 0) await pause(attente);
  dernierDepart = Date.now();
}

export async function appelGraphql(query, variables, { essais = 4 } = {}) {
  if (/^\s*mutation\b/.test(query)) throw new Error('Lecture seule : mutation refusée.');
  for (let essai = 1; ; essai++) {
    await attendreSonTour();
    nbRequetes++;
    const rep = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', APIKEY: 'injecte-par-le-proxy' },
      body: JSON.stringify({ query, variables }),
    });
    if ((rep.status === 429 || rep.status >= 500) && essai < essais) {
      await pause(2000 * 2 ** (essai - 1));
      continue;
    }
    if (!rep.ok) throw new Error(`API Sorare : HTTP ${rep.status}`);
    const json = await rep.json();
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join(' ; ');
      if (msg.includes('Using an APIKEY')) {
        throw new Error(`${msg}\nLa clé n'a pas été injectée : la requête n'est pas passée par le proxy (NODE_USE_ENV_PROXY=1 ?).`);
      }
      throw new Error(msg);
    }
    return json.data;
  }
}

const REQUETE_CARTES = `
query Cartes($slug: String!, $sport: Sport!, $first: Int!, $after: String, $nbMatchs: Int!) {
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
          l15: averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
          activeInjuries { kind status expectedEndDate }
          activeSuspensions { kind reason matches endDate competition { name } }
          playerGameScores(last: $nbMatchs) {
            score
            scoreStatus
            anyGame { date }
            anyPlayerGameStats { onGameSheet }
          }
          nextGame {
            date
            statusTyped
            homeTeam { slug name }
            awayTeam { slug name }
            competition { name }
            ... on Game {
              homeStats { ... on FootballTeamGameStats { winOddsBasisPoints drawOddsBasisPoints loseOddsBasisPoints cleanSheetOdds } }
              awayStats { ... on FootballTeamGameStats { winOddsBasisPoints drawOddsBasisPoints loseOddsBasisPoints cleanSheetOdds } }
            }
          }
          ... on Player {
            playingStatus
            nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints substituteOddsBasisPoints nonPlayingOddsBasisPoints reliability }
            nextClassicFixtureProjectedScore
          }
          ... on NBAPlayer {
            nextClassicFixtureProjectedScore
          }
        }
      }
    }
  }
}`;

// Postes de l'API → codes utilisés dans regles/.
const POSTES = {
  Goalkeeper: 'GK', Defender: 'DF', Midfielder: 'MD', Forward: 'FW',
  basketball_guard: 'G', basketball_forward: 'F', basketball_center: 'C',
};

// Cotes en points de base (8200 = 82 %) ; clean sheet en cote décimale.
function cotes(stats) {
  if (!stats || stats.winOddsBasisPoints == null) return null;
  return {
    victoire: stats.winOddsBasisPoints / 10000,
    nul: stats.drawOddsBasisPoints / 10000,
    defaite: stats.loseOddsBasisPoints / 10000,
    cote_clean_sheet: stats.cleanSheetOdds ?? null,
  };
}

function prochainMatch(match, clubSlug) {
  if (!match) return null;
  const dom = match.homeTeam?.slug, ext = match.awayTeam?.slug;
  const aDomicile = clubSlug && clubSlug === dom ? true : clubSlug && clubSlug === ext ? false : null;
  const adversaire = aDomicile === true ? match.awayTeam?.name
    : aDomicile === false ? match.homeTeam?.name
    : null; // club du joueur absent du match (sélection nationale ?) : à vérifier
  return {
    date: match.date,
    statut: match.statusTyped,
    competition: match.competition?.name ?? null,
    domicile: aDomicile,
    adversaire,
    affiche: `${match.homeTeam?.name ?? '?'} – ${match.awayTeam?.name ?? '?'}`,
    // Cotes du point de vue de l'équipe du joueur (null si inconnues ou trop tôt).
    cotes_equipe: aDomicile === true ? cotes(match.homeStats) : aDomicile === false ? cotes(match.awayStats) : null,
  };
}

export function normaliserCarte(c) {
  const j = c.anyPlayer ?? {};
  return {
    carte: c.slug,
    rarete: c.rarityTyped,
    saison: c.seasonYear,
    // Image de la carte (PNG 771 × 1248, environ 360 Ko) sur assets.sorare.com.
    image: c.pictureUrl ?? null,
    bonus_collection: c.skinEdition
      // Le nom de collection est dans variantName (Four Suits, Eclipse) quand il existe,
      // sinon dans skinName (Standard, Shiny, Holo). Vérifié le 2026-11-07.
      ? { nom: c.skinEdition.variantName ?? c.skinEdition.skinName, multiplicateur: c.skinEdition.bonus }
      : null,
    joueur: {
      slug: j.slug,
      nom: j.displayName,
      postes: (j.anyPositions ?? []).map((p) => POSTES[p] ?? p),
      club: j.activeClub?.name ?? null,
      tier: j.tier ?? null,
      etoiles: j.etoiles ?? null,
      l5: j.l5 ?? null,
      l15: j.l15 ?? null,
      blessures: j.activeInjuries ?? [],
      suspensions: (j.activeSuspensions ?? []).map((s) => ({
        kind: s.kind, reason: s.reason, matches: s.matches, endDate: s.endDate,
        competition: s.competition?.name ?? null,
      })),
      // Du plus récent au plus ancien, comme l'API les renvoie.
      derniers_scores: (j.playerGameScores ?? []).filter(Boolean).map((g) => ({
        date: g.anyGame?.date ?? null,
        score: g.score,
        statut: g.scoreStatus,
        sur_feuille: g.anyPlayerGameStats?.onGameSheet ?? null,
      })),
      prochain_match: prochainMatch(j.nextGame, j.activeClub?.slug),
      // Données Sorare au calcul non publié : affichées pour comparaison, hors formule.
      sorare: {
        statut_jeu: j.playingStatus ?? null,
        probas_titulaire: j.nextClassicFixturePlayingStatusOdds ?? null, // toujours null avec notre clé (2026-11-07)
        projection: j.nextClassicFixtureProjectedScore ?? null,
      },
    },
  };
}

export async function recupererCartes(slug, sport) {
  const cartes = [];
  let apres = null;
  let total = null;
  do {
    const data = await appelGraphql(REQUETE_CARTES, {
      slug, sport: sport.toUpperCase(), first: TAILLE_PAGE, after: apres, nbMatchs: NB_DERNIERS_MATCHS,
    });
    const page = data.user.cards;
    total = page.totalCount;
    cartes.push(...page.nodes.map(normaliserCarte));
    process.stderr.write(`${cartes.length} / ${total} cartes\n`);
    apres = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (apres);
  return { cartes, total };
}

export const dateDuJour = (d = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d); // AAAA-MM-JJ

export const cheminDonnees = (sport, date) => join(RACINE, 'data', `cartes-${sport}-${date}.json`);

// Le fetch de Node ignore HTTPS_PROXY sauf si NODE_USE_ENV_PROXY=1 : sans
// proxy, la connexion part en direct et la clé APIKEY n'est pas injectée
// (vérifié le 2026-11-07). On se relance alors avec la variable positionnée.
export function relancerViaProxySiBesoin() {
  if (!process.env.HTTPS_PROXY || process.env.NODE_USE_ENV_PROXY === '1') return false;
  const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], {
    stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(r.status ?? 1);
}

// Une carte par ligne : fichier compact, et des diff lisibles d'un jour à l'autre.
function enJsonLisible({ cartes, ...entete }) {
  const tete = JSON.stringify(entete, null, 1).replace(/\n}$/, '');
  return `${tete},\n "cartes": [\n${cartes.map((c) => '  ' + JSON.stringify(c)).join(',\n')}\n ]\n}\n`;
}

async function principal() {
  relancerViaProxySiBesoin();
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const [slug = 'yapapir', sport = 'football'] = args.filter((a) => !a.startsWith('--'));
  if (!['football', 'nba'].includes(sport)) throw new Error(`Sport inconnu : ${sport}`);

  const chemin = cheminDonnees(sport, dateDuJour());
  if (existsSync(chemin) && !force) {
    const d = JSON.parse(readFileSync(chemin, 'utf8'));
    if (d.slug === slug) {
      console.error(`Cache : ${chemin} existe déjà (${d.nb_cartes} cartes). --force pour rafraîchir.`);
      return;
    }
  }
  const debut = Date.now();
  const { cartes, total } = await recupererCartes(slug, sport);
  const sortie = {
    slug,
    sport,
    recupere_le: new Date().toISOString(),
    nb_cartes: cartes.length,
    total_annonce: total,
    nb_requetes: nbRequetes,
    source: API_URL,
    cartes,
  };
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, enJsonLisible(sortie));
  console.error(`Écrit : ${chemin} (${cartes.length} cartes, ${nbRequetes} requêtes, ${((Date.now() - debut) / 1000).toFixed(1)} s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
