// Rétro-test de la simulation AU NIVEAU DE L'ÉQUIPE (revue du 2026-11-07) : les chances de
// passer annoncées sont-elles justes ? Pour des journées passées, on reconstruit chaque joueur
// avec ses seuls matchs plus anciens, on compose des équipes comme le moteur (cartes au-dessus
// du seuil, postes, capitaine), on simule leur score, puis on compare au score réellement
// obtenu ce jour-là (0 pour un joueur qui n'a pas joué). Une simulation bien calibrée met
// 10 % des scores réels sous son 10e centile, 50 % sous sa médiane, etc. ; et, pour une cible
// donnée, la part d'équipes qui l'ont réellement atteinte égale la chance annoncée.
// Comparé à une simulation « naïve » (chance de jouer = part des 10 derniers matchs joués,
// score tiré uniformément dans les 15 derniers scores joués), celle des maquettes.
// Bonus de collection ignorés (b = 1) des deux côtés : ils sont connus exactement.
// Usage : node outils/retro-test-equipe.js football|nba [nombre de journées]
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parametresDepuisMethode } from '../src/moteur/parametres.js';
import { projeterCarte } from '../src/moteur/projection.js';
import { distribution, tirerTotaux, generateur } from '../src/moteur/simulation.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const sport = process.argv[2] ?? 'football';
const NB_JOURNEES = Number(process.argv[3] ?? 26);
const P = parametresDepuisMethode(readFileSync(join(RACINE, 'methode.md'), 'utf8'));
const SEUIL = P.seuil_jouer;
const sim = { ...P.simulation, tirages: 2000 };
const JOUE = new Set(['titulaire', 'entre', 'joue']);
const TERMINES = new Set(['FINAL', 'REVIEWING', 'DID_NOT_PLAY']);

const postes = Object.fromEntries(JSON.parse(readFileSync(join(RACINE, 'data', 'dernier.json'), 'utf8')).joueurs.map((j) => [j.id, j.postes]));
const dossier = join(RACINE, 'data/historique', sport);
const archives = readdirSync(dossier).map((f) => {
  const id = f.replace(/\.json$/, '');
  return { id, postes: postes[id] ?? [], matchs: JSON.parse(readFileSync(join(dossier, f), 'utf8')).matchs.filter((m) => TERMINES.has(m.statut)) };
}).filter((a) => a.postes.length);

// Journées testées : un jour par semaine (le vendredi), sur les NB_JOURNEES dernières semaines couvertes.
const dates = [...new Set(archives.flatMap((a) => a.matchs.map((m) => m.date.slice(0, 10))))].sort();
const fin = Date.parse(dates.at(-1)), debut = fin - NB_JOURNEES * 7 * 86400000;
const journees = [];
for (let t = debut; t < fin - 4 * 86400000; t += 7 * 86400000) journees.push(new Date(t).toISOString().slice(0, 10) + 'T00:00:00Z');

// Un joueur vu à la date D : historique antérieur, prochain match dans les 4 jours (le match « réel »).
function joueurA(a, D) {
  const historique = a.matchs.filter((m) => m.date < D);
  const reel = a.matchs.filter((m) => m.date >= D && Date.parse(m.date) < Date.parse(D) + 4 * 86400000).at(-1);
  if (!reel || historique.length < P.min_matchs_historique) return null;
  const joueur = { id: a.id, sport, postes: a.postes, club: { slug: 'E' }, blessures: [], suspensions: [], historique };
  const match = { id: reel.matchId, debutUTC: reel.date, competition: reel.competition, domicile: { slug: 'E' }, exterieur: { slug: 'A' },
    cotes: reel.cotes ? { domicile: reel.cotes, exterieur: null } : null };
  const projection = projeterCarte({ id: a.id, bonusPct: 0 }, joueur, match, P, {});
  if (projection.statut !== 'ok' || projection.p == null || projection.p < SEUIL || projection.siJoue == null) return null;
  const d = distribution(joueur, projection, P);
  if (!d) return null;
  // modèle naïf des maquettes
  const derniers = historique.filter((m) => m.situation && m.situation !== 'inconnu').slice(0, 10);
  const scoresJoues = historique.filter((m) => JOUE.has(m.situation) && m.statut !== 'DID_NOT_PLAY' && m.score != null).slice(0, 15).map((m) => m.score);
  const naif = { p: derniers.filter((m) => JOUE.has(m.situation)).length / Math.max(1, derniers.length), scores: scoresJoues };
  const reelScore = JOUE.has(reel.situation) && reel.statut !== 'DID_NOT_PLAY' ? reel.score ?? 0 : 0;
  return { id: a.id, postes: a.postes, projection, d, naif, reel: reelScore };
}

// Équipes : en football GK + DF + MD + FW + un joueur de champ, sinon 5 joueurs ; tirées au hasard
// parmi les meilleures espérances (comme la présélection du moteur), capitaine = meilleur score de base.
const rng = generateur(20261108);
const hasard = (xs) => xs[Math.floor(rng.suivant() * xs.length)];
function equipe(candidats) {
  const top = (filtre, n) => candidats.filter(filtre).sort((x, y) => y.projection.esperance - x.projection.esperance).slice(0, n);
  let membres;
  if (sport === 'football') {
    const par = Object.fromEntries(['GK', 'DF', 'MD', 'FW'].map((po) => [po, top((c) => c.postes.includes(po), 10)]));
    if (Object.values(par).some((l) => !l.length)) return null;
    membres = ['GK', 'DF', 'MD', 'FW'].map((po) => hasard(par[po]));
    const champ = top((c) => !c.postes.includes('GK') && !membres.includes(c), 25);
    if (!champ.length) return null;
    membres.push(hasard(champ));
  } else {
    const pool = top(() => true, 25);
    if (pool.length < 5) return null;
    membres = [];
    while (membres.length < 5) { const c = hasard(pool); if (!membres.includes(c)) membres.push(c); }
  }
  if (new Set(membres.map((m) => m.id)).size < 5) return null;
  return membres;
}

const pitsMoteur = [], pitsNaif = [], paires = [];
let nbEquipes = 0;
for (const D of journees) {
  const candidats = archives.map((a) => joueurA(a, D)).filter(Boolean);
  for (let k = 0; k < 40; k++) {
    const membres = equipe(candidats);
    if (!membres) break;
    const capitaine = sport === 'football' ? membres.reduce((b, m, i) => (m.d.m > membres[b].d.m ? i : b), 0) : -1;
    const reel = membres.reduce((s, m, i) => s + m.reel * (i === capitaine ? 1.5 : 1), 0);
    // moteur
    const totaux = tirerTotaux(membres.map((m) => m.d), capitaine, 1.5, sim, 'addition');
    const sousMoteur = totaux.reduce((n, t) => n + (t < reel ? 1 : 0), 0) / totaux.length;
    // naïf (même nombre de tirages)
    const naifs = new Float64Array(sim.tirages);
    for (let t = 0; t < sim.tirages; t++) {
      let tot = 0;
      membres.forEach((m, i) => { if (m.naif.scores.length && rng.suivant() < m.naif.p) tot += m.naif.scores[Math.floor(rng.suivant() * m.naif.scores.length)] * (i === capitaine ? 1.5 : 1); });
      naifs[t] = tot;
    }
    const sousNaif = naifs.reduce((n, t) => n + (t < reel ? 1 : 0), 0) / naifs.length;
    pitsMoteur.push(sousMoteur); pitsNaif.push(sousNaif);
    // calibration de « chances de passer » : cible = médiane du moteur ± écarts, chance annoncée vs réalisée
    const tri = Float64Array.from(totaux).sort();
    for (const q of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const cible = tri[Math.floor(q * tri.length)];
      paires.push({ annonce: 1 - q, reussi: reel >= cible ? 1 : 0, annonceNaif: naifs.reduce((n, t) => n + (t >= cible ? 1 : 0), 0) / naifs.length });
    }
    nbEquipes++;
  }
}

const part = (xs, c) => xs.filter((x) => x < c).length / xs.length;
const ligne = (nom, pits) => `${nom.padEnd(8)} ${[0.1, 0.25, 0.5, 0.75, 0.9].map((c) => `${Math.round(c * 100)}e : ${(part(pits, c) * 100).toFixed(1)} %`).join(' | ')}`;
console.log(`${sport} : ${nbEquipes} équipes sur ${journees.length} journées (seuil de jouer ${SEUIL}). Part des scores réels d'équipe sous le centile prédit (idéal = centile) :`);
console.log('  ' + ligne('moteur', pitsMoteur));
console.log('  ' + ligne('naïf', pitsNaif));
console.log('  Chances de passer annoncées par le moteur contre réalisées (et ce que dirait le modèle naïf) :');
for (const a of [0.8, 0.65, 0.5, 0.35, 0.2]) {
  const g = paires.filter((p) => Math.abs(p.annonce - a) < 1e-9);
  const reussi = g.reduce((s, p) => s + p.reussi, 0) / g.length, naif = g.reduce((s, p) => s + p.annonceNaif, 0) / g.length;
  console.log(`    annoncé ${Math.round(a * 100)} % → réalisé ${(reussi * 100).toFixed(1)} % (naïf annonçait ${(naif * 100).toFixed(1)} %)`);
}
