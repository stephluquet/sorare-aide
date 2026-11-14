// Récupération d'un manager (cartes, joueurs, historique incrémental, prochains matchs, paliers),
// commune à Node (index.js, archive sur disque) et au navigateur (version web, archive dans
// IndexedDB). Aucun accès disque ni réseau direct : tout passe par les dépendances fournies.
//
// dépendances :
//   appel(query, variables) → data       (creerAppel, appel.js ; appel.compteur.requetes)
//   magasin.lire(sport, joueurId) → archive | null      (async)
//   magasin.ecrire(sport, joueurId, matchs, { complet }) (async)
//   P            paramètres de methode.md (compositions_officielles.horizon_heures)
//   tableBonus   bonus de collection de regles/bonus-collections.json (contrôle seulement)
//   lireEspn()   → liste des blessures NBA d'ESPN (facultatif)
//   suivi({ sport, etape, fait, total, texte })   progression (facultatif)
import { CARTES, COMPOSITIONS, HISTORIQUE, PALIERS } from './requetes.js';
import { matchHistorique, normaliserCarte, normaliserCompositions, normaliserJoueur, normaliserMatch, normaliserPaliers } from './normaliser.js';
import { rapprocherBlessures } from './espn.js';
import { besoinHistoriqueComplet, fusionner, trou } from './fusion.js';

export const TAILLE_PAGE = 50;
export const NB_MATCHS_HISTORIQUE = 40;
export const FORMAT_DONNEES = 1;

export async function recupererSport(slug, sport, deps, { sansHistorique = false, refaireHistorique = false, anomalies = [] } = {}) {
  const { appel, magasin, P, tableBonus = {}, lireEspn = null } = deps;
  const suivi = deps.suivi ?? (() => {});
  const SPORT = sport.toUpperCase();
  const tag = `[${sport}]`;

  // 1. Paliers Arcade
  const paliers = normaliserPaliers((await appel(PALIERS, { slug, sport: SPORT })).user?.setBoard, sport);
  suivi({ sport, etape: 'paliers', fait: 1, total: 1, texte: 'Paliers lus' });

  // 2. Cartes, page par page
  const cartesBrutes = [];
  let apres = null, total = null, page = 0;
  do {
    const d = await appel(CARTES, { slug, sport: SPORT, first: TAILLE_PAGE, after: apres });
    const c = d.user.cards;
    total = c.totalCount;
    cartesBrutes.push(...c.nodes);
    page++;
    suivi({ sport, etape: 'cartes', fait: page, total: Math.max(1, Math.ceil(total / TAILLE_PAGE)), texte: `Cartes : page ${page} sur ${Math.max(1, Math.ceil(total / TAILLE_PAGE))}` });
    apres = c.pageInfo.hasNextPage ? c.pageInfo.endCursor : null;
  } while (apres);
  if (cartesBrutes.length !== total) anomalies.push(`${tag} ${cartesBrutes.length} cartes reçues pour ${total} annoncées`);

  const bonus = { Standard: 0, ...tableBonus };
  const cartes = cartesBrutes.map((c) => normaliserCarte(c, sport));
  for (const c of cartes) {
    if (c.bonusPct == null) anomalies.push(`${tag} bonus absent : ${c.slug}`);
    else if (c.collection in bonus && bonus[c.collection] !== c.bonusPct) {
      anomalies.push(`${tag} bonus ${c.collection} : API ${c.bonusPct} %, table ${bonus[c.collection]} % (${c.slug})`);
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

  // 3 bis. Compositions officielles des matchs de football proches (publiées vers H-1)
  if (sport === 'football') {
    const horizon = Date.now() + P.compositions_officielles.horizon_heures * 3600_000;
    const proches = [...matchs.values()].filter((m) => Date.parse(m.debutUTC) > Date.now() - 2 * 3600_000 && Date.parse(m.debutUTC) <= horizon);
    let publiees = 0, i = 0;
    for (const m of proches) {
      try {
        const d = await appel(COMPOSITIONS, { id: m.id.replace(/^Game:/, '') });
        m.compositionsOfficielles = normaliserCompositions(d.football?.game, new Date().toISOString());
        if (Object.values(m.compositionsOfficielles?.equipes ?? {}).some(Boolean)) publiees++;
      } catch (e) {
        anomalies.push(`${tag} compositions illisibles pour ${m.id} : ${e.message}`);
      }
      suivi({ sport, etape: 'compositions', fait: ++i, total: proches.length, texte: `Compositions officielles : ${i} sur ${proches.length}` });
    }
    suivi({ sport, etape: 'compositions', fait: proches.length, total: proches.length, texte: `Compositions officielles : ${publiees} publiées sur ${proches.length} matchs proches` });
  }

  // 4. Historique incrémental
  const aCompleter = [];
  const recusParJoueur = new Map();
  const archives = new Map();
  for (const p of joueursBruts.values()) {
    const recus = (p.playerGameScores ?? []).filter(Boolean).map((g) => matchHistorique(g, sport)).filter((m) => m.matchId);
    recusParJoueur.set(p.slug, recus);
    const archive = await magasin.lire(sport, p.slug);
    archives.set(p.slug, archive);
    // Une archive créée sans historique complet (--sans-historique) ne compte pas.
    if (!refaireHistorique && !besoinHistoriqueComplet(archive, recus)) continue;
    if (refaireHistorique || !archive?.dernierHistoriqueComplet) aCompleter.push(p.slug);
    else if (trou(archive.matchs, recus)) { aCompleter.push(p.slug); anomalies.push(`${tag} trou dans l'historique, 40 matchs refaits : ${p.slug}`); }
  }
  // Chaque joueur complété est enregistré tout de suite : une récupération interrompue reprend là où elle s'est arrêtée.
  const enregistrer = async (j, complet) => {
    const archive = archives.get(j.id)?.matchs ?? [];
    const matchsJoueur = fusionner(fusionner(archive, complet ?? []), recusParJoueur.get(j.id) ?? []);
    await magasin.ecrire(sport, j.id, matchsJoueur, { complet: Boolean(complet) });
    j.historique = matchsJoueur.slice(0, NB_MATCHS_HISTORIQUE);
  };
  const parId = new Map(joueurs.map((j) => [j.id, j]));
  const faits = new Set();
  if (sansHistorique) {
    if (aCompleter.length) suivi({ sport, etape: 'historique', fait: 0, total: 0, texte: `Historique complet sauté pour ${aCompleter.length} joueurs` });
  } else {
    let i = 0;
    for (const s of aCompleter) {
      let complet = null;
      try {
        const d = await appel(HISTORIQUE, { slug: s, first: NB_MATCHS_HISTORIQUE });
        complet = (d.anyPlayer?.allPlayerGameScores?.nodes ?? []).filter(Boolean).map((g) => matchHistorique(g, sport)).filter((m) => m.matchId);
      } catch (e) {
        if (deps.signal?.aborted) throw e;
        anomalies.push(`${tag} historique complet impossible pour ${s} : ${e.message}`);
      }
      if (complet) { await enregistrer(parId.get(s), complet); faits.add(s); }
      i++;
      suivi({ sport, etape: 'historique', fait: i, total: aCompleter.length, texte: `Historique des joueurs : ${i} sur ${aCompleter.length}` });
    }
  }
  for (const j of joueurs) if (!faits.has(j.id)) await enregistrer(j, null);

  // Blessures annoncées par ESPN (NBA, methode.md section 9) : une requête, hors API Sorare.
  if (sport === 'nba' && lireEspn) {
    try {
      const r = rapprocherBlessures(await lireEspn(), joueurs);
      suivi({ sport, etape: 'espn', fait: 1, total: 1, texte: `ESPN : ${r.listes} blessés listés, ${r.rapproches} parmi tes joueurs` });
      for (const x of r.ignores) anomalies.push(`${tag} ESPN : même nom, autre équipe : ${x}`);
    } catch (e) {
      anomalies.push(`${tag} blessures ESPN illisibles : ${e.message}`);
    }
  }

  return { cartes, joueurs, matchs: [...matchs.values()], paliers, totalCartes: total };
}

/**
 * Tous les sports demandés, puis fusion avec la récupération précédente pour les sports non repris.
 * @param precedent données de la récupération précédente (ou null)
 * @returns { meta, cartes, joueurs, matchs, paliers }
 */
export async function recupererTout(slug, sports, deps, options = {}, precedent = null) {
  const debut = new Date();
  const anomalies = [];
  const tout = { cartes: [], joueurs: [], matchs: [], paliers: [] };
  for (const sport of sports) {
    const r = await recupererSport(slug, sport, deps, { ...options, anomalies });
    for (const k of Object.keys(tout)) tout[k].push(...r[k]);
  }
  // Un sport non récupéré cette fois-ci est repris tel quel de la récupération précédente (même manager).
  const recupereParSport = Object.fromEntries(sports.map((s) => [s, debut.toISOString()]));
  if (precedent && precedent.meta?.slug === slug) {
    for (const s of ['football', 'nba'].filter((x) => !sports.includes(x))) {
      if (!precedent.cartes?.some((c) => c.sport === s)) continue;
      for (const k of Object.keys(tout)) tout[k].push(...precedent[k].filter((x) => x.sport === s));
      recupereParSport[s] = precedent.meta.recupereParSport?.[s] ?? precedent.meta.recupereA;
    }
  }
  const meta = {
    format: FORMAT_DONNEES,
    recupereParSport,
    slug,
    sports,
    recupereA: debut.toISOString(),
    dureeS: Math.round((Date.now() - debut) / 100) / 10,
    nbRequetes: deps.appel.compteur?.requetes ?? null,
    source: 'https://api.sorare.com/graphql',
    nb: Object.fromEntries(Object.entries(tout).map(([k, v]) => [k, v.length])),
    anomalies,
  };
  return { meta, ...tout };
}
