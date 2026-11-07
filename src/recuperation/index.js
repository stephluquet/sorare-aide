// Récupération complète (étape 1 du plan v0.1) : cartes, joueurs, historique
// match par match (incrémental), prochains matchs, paliers Arcade.
//
// Usage : npm run recuperer -- [--sport football|nba|tous] [--slug yapapir] [--sans-historique]
//   écrit data/<AAAA-MM-JJTHHMM>/{cartes,joueurs,matchs,paliers,meta}.json
//   et data/dernier.json (tout en un, lu par l'interface)
//   met à jour data/historique/<sport>/<joueurId>.json
// Lecture seule, au plus 150 requêtes par minute. Progression sur la sortie d'erreur.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelGraphql, compteur, relancerViaProxySiBesoin } from './api.js';
import { CARTES, HISTORIQUE, PALIERS } from './requetes.js';
import { matchHistorique, normaliserCarte, normaliserJoueur, normaliserMatch, normaliserPaliers } from './normaliser.js';
import { cheminArchive, ecrireArchive, fusionner, lireArchive, trou } from './historique.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAILLE_PAGE = 50;
const NB_MATCHS_HISTORIQUE = 40;
const FORMAT = 1;

const progression = (msg) => process.stderr.write(`${msg} (requêtes : ${compteur.requetes})\n`);

function horodatageParis(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}${p.minute}`;
}

function lireTableBonus() {
  const t = JSON.parse(readFileSync(join(RACINE, 'regles', 'bonus-collections.json'), 'utf8')).bonus_pct;
  return { Standard: 0, ...t };
}

async function recupererSport(slug, sport, { sansHistorique, anomalies }) {
  const SPORT = sport.toUpperCase();
  const tag = `[${sport}]`;

  // 1. Paliers Arcade
  const paliers = normaliserPaliers((await appelGraphql(PALIERS, { slug, sport: SPORT })).user?.setBoard, sport);
  progression(`${tag} paliers lus`);

  // 2. Cartes, page par page
  const cartesBrutes = [];
  let apres = null, total = null, page = 0;
  do {
    const d = await appelGraphql(CARTES, { slug, sport: SPORT, first: TAILLE_PAGE, after: apres });
    const c = d.user.cards;
    total = c.totalCount;
    cartesBrutes.push(...c.nodes);
    page++;
    progression(`${tag} cartes ${page}/${Math.ceil(total / TAILLE_PAGE)}`);
    apres = c.pageInfo.hasNextPage ? c.pageInfo.endCursor : null;
  } while (apres);
  if (cartesBrutes.length !== total) anomalies.push(`${tag} ${cartesBrutes.length} cartes reçues pour ${total} annoncées`);

  const tableBonus = lireTableBonus();
  const cartes = cartesBrutes.map((c) => normaliserCarte(c, sport));
  for (const c of cartes) {
    if (c.bonusPct == null) anomalies.push(`${tag} bonus absent : ${c.slug}`);
    else if (c.collection in tableBonus && tableBonus[c.collection] !== c.bonusPct) {
      anomalies.push(`${tag} bonus ${c.collection} : API ${c.bonusPct} %, table ${tableBonus[c.collection]} % (${c.slug})`);
    }
  }

  // 3. Joueurs (uniques) et prochains matchs
  const joueursBruts = new Map();
  for (const c of cartesBrutes) if (c.anyPlayer && !joueursBruts.has(c.anyPlayer.slug)) joueursBruts.set(c.anyPlayer.slug, c.anyPlayer);
  const matchs = new Map();
  const joueurs = [];
  for (const p of joueursBruts.values()) {
    const j = normaliserJoueur(p, sport);
    joueurs.push(j);
    if (p.nextGame && !matchs.has(p.nextGame.id)) matchs.set(p.nextGame.id, normaliserMatch(p.nextGame, sport));
    if (!p.nextGame) anomalies.push(`${tag} pas de prochain match connu : ${j.nom}`);
    else if (j.club && ![p.nextGame.homeTeam?.slug, p.nextGame.awayTeam?.slug].includes(j.club.slug)) {
      anomalies.push(`${tag} club absent du prochain match (sélection ?) : ${j.nom}, ${p.nextGame.homeTeam?.name} – ${p.nextGame.awayTeam?.name}`);
    }
  }

  // 4. Historique incrémental
  const aCompleter = [];
  const recusParJoueur = new Map();
  for (const p of joueursBruts.values()) {
    const recus = (p.playerGameScores ?? []).filter(Boolean).map((g) => matchHistorique(g, sport)).filter((m) => m.matchId);
    recusParJoueur.set(p.slug, recus);
    const archive = lireArchive(cheminArchive(RACINE, sport, p.slug));
    if (!archive) aCompleter.push(p.slug);
    else if (trou(archive.matchs, recus)) { aCompleter.push(p.slug); anomalies.push(`${tag} trou dans l'historique, 40 matchs refaits : ${p.slug}`); }
  }
  const complets = new Map();
  if (sansHistorique) {
    if (aCompleter.length) progression(`${tag} historique complet sauté pour ${aCompleter.length} joueurs (--sans-historique)`);
  } else {
    let i = 0;
    for (const s of aCompleter) {
      try {
        const d = await appelGraphql(HISTORIQUE, { slug: s, first: NB_MATCHS_HISTORIQUE });
        complets.set(s, (d.anyPlayer?.allPlayerGameScores?.nodes ?? []).filter(Boolean).map((g) => matchHistorique(g, sport)).filter((m) => m.matchId));
      } catch (e) {
        anomalies.push(`${tag} historique complet impossible pour ${s} : ${e.message}`);
      }
      i++;
      if (i % 25 === 0 || i === aCompleter.length) progression(`${tag} historique ${i}/${aCompleter.length}`);
    }
  }
  for (const j of joueurs) {
    const chemin = cheminArchive(RACINE, sport, j.id);
    const archive = lireArchive(chemin)?.matchs ?? [];
    const complet = complets.get(j.id);
    const matchsJoueur = fusionner(fusionner(archive, complet ?? []), recusParJoueur.get(j.id) ?? []);
    ecrireArchive(chemin, j.id, matchsJoueur, { complet: Boolean(complet) });
    j.historique = matchsJoueur.slice(0, NB_MATCHS_HISTORIQUE);
  }

  return { cartes, joueurs, matchs: [...matchs.values()], paliers, totalCartes: total };
}

async function principal() {
  await relancerViaProxySiBesoin();
  const args = process.argv.slice(2);
  const val = (nom, defaut) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : defaut; };
  const slug = val('--slug', 'yapapir');
  const choix = val('--sport', 'tous');
  const sports = choix === 'tous' ? ['football', 'nba'] : [choix];
  if (!sports.every((s) => ['football', 'nba'].includes(s))) throw new Error(`Sport inconnu : ${choix}`);

  const debut = new Date();
  const anomalies = [];
  const tout = { cartes: [], joueurs: [], matchs: [], paliers: [] };
  for (const sport of sports) {
    const r = await recupererSport(slug, sport, { sansHistorique: args.includes('--sans-historique'), anomalies });
    for (const k of Object.keys(tout)) tout[k].push(...r[k]);
  }
  const meta = {
    format: FORMAT,
    slug,
    sports,
    recupereA: debut.toISOString(),
    dureeS: Math.round((Date.now() - debut) / 100) / 10,
    nbRequetes: compteur.requetes,
    source: 'https://api.sorare.com/graphql',
    nb: Object.fromEntries(Object.entries(tout).map(([k, v]) => [k, v.length])),
    anomalies,
  };

  const dossier = join(RACINE, 'data', horodatageParis(debut));
  mkdirSync(dossier, { recursive: true });
  for (const [k, v] of Object.entries({ ...tout, meta })) writeFileSync(join(dossier, `${k}.json`), JSON.stringify(v) + '\n');
  writeFileSync(join(RACINE, 'data', 'dernier.json'), JSON.stringify({ meta, ...tout }) + '\n');
  process.stderr.write(`Terminé : ${meta.nb.cartes} cartes, ${meta.nb.joueurs} joueurs, ${meta.nb.matchs} matchs, ` +
    `${meta.nbRequetes} requêtes en ${meta.dureeS} s, ${anomalies.length} anomalies → ${dossier}, data/dernier.json\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
