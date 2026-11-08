// Calibrage du « retrait vers la moyenne » du score s'il joue (revue du 2026-11-07) : le moteur choisit
// les meilleures moyennes récentes, donc aussi celles que la chance a gonflées (effet de sélection).
// On rapproche la moyenne du joueur de celle de son poste (football : par poste et situation ;
// NBA : score par minute de la ligue) : μ' = a + (μ − a) × n / (n + k), n = nombre de scores utilisés.
// Pour chaque k, erreur quadratique sur tous les matchs joués, et biais sur les 10 % de joueurs à la
// meilleure espérance (ceux que le moteur retient). Usage : node outils/retro-test-retrait.js football|nba
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parametresDepuisMethode } from '../src/moteur/parametres.js';
import { projeterCarte } from '../src/moteur/projection.js';

const R = join(dirname(fileURLToPath(import.meta.url)), '..'), sport = process.argv[2] ?? 'football';
const P0 = parametresDepuisMethode(readFileSync(join(R, 'methode.md'), 'utf8'));
const P = { ...P0, retrait: null }; // on mesure le moteur SANS retrait, puis on applique les k candidats ici
const JOUE = new Set(['titulaire', 'entre', 'joue']), TERM = new Set(['FINAL', 'REVIEWING', 'DID_NOT_PLAY']);
const postes = Object.fromEntries(JSON.parse(readFileSync(join(R, 'data/dernier.json'), 'utf8')).joueurs.map((j) => [j.id, j.postes]));
const dos = join(R, 'data/historique', sport);
const arch = readdirSync(dos).map((f) => ({ id: f.slice(0, -5), postes: postes[f.slice(0, -5)] ?? [], matchs: JSON.parse(readFileSync(join(dos, f), 'utf8')).matchs.filter((m) => TERM.has(m.statut)) })).filter((a) => a.postes.length);
const moy = (x) => x.reduce((a, b) => a + b, 0) / x.length;

// Moyennes de référence (a) sur toute l'archive.
const prior = {};
if (sport === 'football') {
  for (const po of ['GK', 'DF', 'MD', 'FW']) for (const sit of ['titulaire', 'entre']) {
    const xs = arch.filter((a) => a.postes[0] === po).flatMap((a) => a.matchs.filter((m) => m.situation === sit && m.statut === 'FINAL' && m.score != null).map((m) => m.score));
    prior[`${po}.${sit}`] = Math.round(moy(xs) * 10) / 10;
  }
} else {
  let s = 0, mn = 0;
  for (const a of arch) for (const m of a.matchs) if (m.situation === 'joue' && m.statut === 'FINAL' && m.minutes > 0) { s += m.score; mn += m.minutes; }
  prior.taux = Math.round((s / mn) * 1000) / 1000;
}
console.log(`${sport} : moyennes de référence`, JSON.stringify(prior));

// Échantillon : chaque match joué des 30 dernières semaines, prédit avec les seuls matchs antérieurs.
const lignes = [];
for (const a of arch) {
  for (let k = 0; k < a.matchs.length; k++) {
    const r = a.matchs[k];
    if (!JOUE.has(r.situation) || r.statut === 'DID_NOT_PLAY' || r.score == null) continue;
    const h = a.matchs.slice(k + 1);
    if (h.length < 5) continue;
    const j = { id: a.id, sport, postes: a.postes, club: { slug: 'E' }, blessures: [], suspensions: [], historique: h };
    const pr = projeterCarte({ id: a.id, bonusPct: 0 }, j, { debutUTC: r.date, competition: r.competition, domicile: { slug: 'E' }, exterieur: { slug: 'A' }, cotes: r.cotes ? { domicile: r.cotes } : null }, P, {});
    if (pr.siJoue == null || pr.p == null) continue;
    lignes.push({ pr, poste: a.postes[0], reel: r.score });
  }
}
const retraitFoot = (s, poste, k) => {
  const dec = s.decalageTitulaire ?? 0, T = s.muTitulaire - dec, E = s.muEntre;
  const aT = prior[`${poste}.titulaire`], aE = prior[`${poste}.entre`];
  const T2 = aT + (T - aT) * s.nbTitulaire / (s.nbTitulaire + k), E2 = aE + (E - aE) * s.nbEntre / (s.nbEntre + k);
  return s.q * (T2 + dec) + (1 - s.q) * E2;
};
const retraitNba = (s, k) => s.minutes * (prior.taux + (s.taux - prior.taux) * s.nbScores / (s.nbScores + k));
const pred = (l, k) => (k === 0 ? l.pr.siJoue : sport === 'football' ? retraitFoot(l.pr.score, l.poste, k) : retraitNba(l.pr.score, k));
const top = [...lignes].sort((x, y) => y.pr.esperance - x.pr.esperance).slice(0, Math.floor(lignes.length / 10));
console.log(`${lignes.length} matchs joués prédits ; ${top.length} dans les 10 % de meilleure espérance`);
for (const k of [0, 2, 4, 6, 8, 12, 16, 24]) {
  const rmse = Math.sqrt(moy(lignes.map((l) => (pred(l, k) - l.reel) ** 2)));
  const biaisTop = moy(top.map((l) => pred(l, k) - l.reel)), biaisTous = moy(lignes.map((l) => pred(l, k) - l.reel));
  console.log(`  k = ${String(k).padStart(2)} : erreur quadratique ${rmse.toFixed(2)} | biais tous ${biaisTous.toFixed(2)} | biais 10 % meilleurs ${biaisTop.toFixed(2)}`);
}
