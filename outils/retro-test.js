// Rétro-test sur l'historique archivé (data/historique) : pour chaque match passé,
// on prédit à partir des matchs plus anciens seulement, puis on compare au réel.
// Sert à choisir les paramètres de methode.md (pas utilisé par l'appli).
// Usage : node outils/retro-test.js [football|nba]
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const sport = process.argv[2] ?? 'football';
const JOUE = new Set(['titulaire', 'entre', 'joue']);
const MIN_ANCIENS = 10, FENETRE = 30;

const archives = readdirSync(join(RACINE, 'data/historique', sport)).map((f) =>
  JSON.parse(readFileSync(join(RACINE, 'data/historique', sport, f), 'utf8')).matchs
    .filter((m) => m.situation !== 'inconnu' && ['FINAL', 'DID_NOT_PLAY'].includes(m.statut)));

// Échantillons : (match cible, matchs plus anciens)
const echantillons = [];
for (const ms of archives) for (let k = 0; k + MIN_ANCIENS < ms.length; k++) echantillons.push([ms[k], ms.slice(k + 1, k + 1 + FENETRE)]);

const poids = (i, demiVie) => (demiVie === Infinity ? 1 : 0.5 ** (i / demiVie));
function pJouer(anciens, demiVie, prior = 0, a = 0) {
  let n = 0, d = 0;
  anciens.forEach((m, i) => { const w = poids(i, demiVie); d += w; n += w * JOUE.has(m.situation); });
  return (n + a * prior) / (d + a);
}
const brier = (f) => echantillons.reduce((s, [c, an]) => s + (f(an) - JOUE.has(c.situation)) ** 2, 0) / echantillons.length;

console.log(`${sport} : ${archives.length} joueurs, ${echantillons.length} matchs prédits ; taux de jeu réel ${(echantillons.filter(([c]) => JOUE.has(c.situation)).length / echantillons.length).toFixed(3)}`);
console.log('\nProbabilité de jouer — score de Brier (plus bas = mieux) selon la demi-vie (en matchs) :');
for (const h of [1, 2, 3, 5, 8, 12, 20, Infinity]) console.log(`  demi-vie ${String(h).padStart(8)} : ${brier((an) => pJouer(an, h)).toFixed(4)}`);
console.log(`  dernier match seul      : ${brier((an) => +JOUE.has(an[0].situation)).toFixed(4)}`);
console.log(`  5 derniers (part)       : ${brier((an) => an.slice(0, 5).filter((m) => JOUE.has(m.situation)).length / 5).toFixed(4)}`);

// Calibration de la meilleure demi-vie
const meilleure = [1, 2, 3, 5, 8, 12, 20, Infinity].map((h) => [h, brier((an) => pJouer(an, h))]).sort((x, y) => x[1] - y[1])[0][0];
console.log(`\nCalibration (demi-vie ${meilleure}) : prédit → observé (effectif)`);
const bins = Array.from({ length: 10 }, () => [0, 0, 0]);
for (const [c, an] of echantillons) { const p = pJouer(an, meilleure); const b = Math.min(9, Math.floor(p * 10)); bins[b][0] += p; bins[b][1] += JOUE.has(c.situation); bins[b][2]++; }
bins.forEach(([sp, so, n], i) => n && console.log(`  [${i / 10}–${(i + 1) / 10}[ : ${(sp / n).toFixed(2)} → ${(so / n).toFixed(2)} (${n})`));

// Effet de la situation au dernier match, à p comparable
console.log('\nSituation au dernier match, parmi les joueurs à p ≥ 0,8 :');
const parDernier = {};
for (const [c, an] of echantillons) { if (pJouer(an, meilleure) < 0.8) continue; const k = an[0].situation; parDernier[k] ??= [0, 0]; parDernier[k][0]++; parDernier[k][1] += JOUE.has(c.situation); }
for (const [k, [n, j]] of Object.entries(parDernier)) console.log(`  dernier match ${k.padEnd(9)} : joue ensuite ${(j / n).toFixed(2)} (${n})`);

// Score quand il joue : erreur absolue moyenne selon la façon de prédire
console.log('\nScore quand il joue — erreur absolue moyenne :');
const joues = echantillons.filter(([c]) => JOUE.has(c.situation) && c.statut === 'FINAL');
const moyPond = (xs, h) => { let s = 0, d = 0; xs.forEach((x, i) => { const w = poids(i, h); s += w * x; d += w; }); return d ? s / d : null; };
for (const h of [2, 5, 10, 20, Infinity]) {
  let e = 0, n = 0;
  for (const [c, an] of joues) { const xs = an.filter((m) => JOUE.has(m.situation) && m.statut === 'FINAL').map((m) => m.score); const p = moyPond(xs, h); if (p == null) continue; e += Math.abs(p - c.score); n++; }
  console.log(`  moyenne des matchs joués, demi-vie ${String(h).padStart(8)} : ${(e / n).toFixed(2)} (${n})`);
}
if (sport === 'football') {
  let e = 0, n = 0, eT = 0, nT = 0;
  for (const [c, an] of joues) {
    const meme = an.filter((m) => m.situation === c.situation && m.statut === 'FINAL').map((m) => m.score);
    if (meme.length < 3) continue; const p = moyPond(meme, 5); e += Math.abs(p - c.score); n++;
  }
  console.log(`  moyenne des matchs de même situation (titulaire / entré), demi-vie 5 : ${(e / n).toFixed(2)} (${n})`);
  const parSit = {}; for (const ms of archives) for (const m of ms) if (JOUE.has(m.situation) && m.statut === 'FINAL') { parSit[m.situation] ??= []; parSit[m.situation].push(m.score); }
  for (const [k, xs] of Object.entries(parSit)) console.log(`  score moyen ${k} : ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)} (${xs.length} matchs)`);
}
if (sport === 'nba') {
  // Les minutes récentes prédisent-elles le score ?
  let e = 0, n = 0;
  for (const [c, an] of joues) {
    const j = an.filter((m) => JOUE.has(m.situation) && m.statut === 'FINAL' && m.minutes > 0);
    if (j.length < 3) continue;
    const minutes = moyPond(j.map((m) => m.minutes), 5), parMin = moyPond(j.map((m) => m.score / m.minutes), 10);
    e += Math.abs(minutes * parMin - c.score); n++;
  }
  console.log(`  minutes récentes (demi-vie 5) × score par minute (demi-vie 10) : ${(e / n).toFixed(2)} (${n})`);
  const pts = []; for (const ms of archives) for (const m of ms) if (JOUE.has(m.situation) && m.statut === 'FINAL' && m.minutes != null) pts.push([m.minutes, m.score]);
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const cov = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), vx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0), vy = pts.reduce((a, p) => a + (p[1] - my) ** 2, 0);
  console.log(`  corrélation minutes / score sur ${pts.length} matchs joués : ${(cov / Math.sqrt(vx * vy)).toFixed(2)}`);
}

// Recalibration linéaire p' = plancher + (plafond − plancher) × p, ajustée sur une grille (Brier minimal).
{
  let best = [Infinity];
  for (let lo = 0; lo <= 0.2001; lo += 0.01) for (let hi = 0.8; hi <= 1.0001; hi += 0.01) {
    const b = brier((an) => lo + (hi - lo) * pJouer(an, meilleure));
    if (b < best[0]) best = [b, lo, hi];
  }
  console.log(`\nRecalibration (demi-vie ${meilleure}) : plancher ${best[1].toFixed(2)}, plafond ${best[2].toFixed(2)} → Brier ${best[0].toFixed(4)} (au lieu de ${brier((an) => pJouer(an, meilleure)).toFixed(4)})`);
}
// Part de titulaire parmi les matchs joués (football) : demi-vie de q
if (sport === 'football') {
  const ech = echantillons.filter(([c]) => c.situation === 'titulaire' || c.situation === 'entre');
  for (const h of [2, 3, 5, 10, Infinity]) {
    let s = 0, n = 0;
    for (const [c, an] of ech) { const j = an.filter((m) => m.situation === 'titulaire' || m.situation === 'entre'); if (!j.length) continue;
      let t = 0, d = 0; j.forEach((m, i) => { const w = poids(i, h); d += w; t += w * (m.situation === 'titulaire'); }); s += (t / d - (c.situation === 'titulaire')) ** 2; n++; }
    console.log(`  part de titulaire quand il joue, demi-vie ${String(h).padStart(8)} : Brier ${(s / n).toFixed(4)}`);
  }
}

// Remplaçant annoncé (sur la feuille, pas titulaire) : chance d'entrer en jeu (étape 4).
// p = (Σ w × entré + a × taux global) / (Σ w + a), sur ses matchs passés comme remplaçant (entré ou banc).
if (sport === 'football') {
  const ech = echantillons.filter(([c]) => c.situation === 'entre' || c.situation === 'banc');
  const taux = ech.filter(([c]) => c.situation === 'entre').length / ech.length;
  console.log(`\nRemplaçant annoncé : ${ech.length} matchs, entrée en jeu ${(taux * 100).toFixed(1)} %`);
  for (const h of [3, 5, 10, Infinity]) for (const a of [0, 2, 4, 8]) {
    let s = 0;
    for (const [c, an] of ech) {
      const remp = an.filter((m) => m.situation === 'entre' || m.situation === 'banc');
      let n = 0, d = 0; remp.forEach((m, i) => { const w = poids(i, h); d += w; n += w * (m.situation === 'entre'); });
      const p = (n + a * taux) / (d + a || 1);
      s += (p - (c.situation === 'entre')) ** 2;
    }
    console.log(`  demi-vie ${String(h).padStart(8)}, a priori ${a} : Brier ${(s / ech.length).toFixed(4)}`);
  }
}
