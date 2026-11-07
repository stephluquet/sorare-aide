// Rétro-test de la distribution du score s'il joue (étape 3) : pour chaque match joué,
// on construit la distribution prédite à partir des seuls matchs plus anciens, puis on
// regarde où tombe le score réel (rang de probabilité, « PIT »). Une distribution bien
// calibrée met 10 % des scores réels sous son 10e centile, 50 % sous sa médiane, etc.
// Compare : rééchantillonnage pondéré des scores passés, contre loi normale (μ, σ).
// Usage : node outils/retro-test-distribution.js [football|nba]
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const sport = process.argv[2] ?? 'football';
const JOUE = new Set(['titulaire', 'entre', 'joue']);
const H = 10;
const archives = readdirSync(join(RACINE, 'data/historique', sport)).map((f) =>
  JSON.parse(readFileSync(join(RACINE, 'data/historique', sport, f), 'utf8')).matchs
    .filter((m) => JOUE.has(m.situation) && m.statut === 'FINAL'));

const phi = (z) => 0.5 * (1 + Math.sign(z) * Math.sqrt(1 - Math.exp(-2 * z * z / Math.PI))); // approximation de la loi normale
const LISSAGES = [0.2, 0.35, 0.5, 0.7];
const cumul = { empirique: [], normale: [], ...Object.fromEntries(LISSAGES.map((h) => [`lissé ${h}`, []])) };
let n = 0;
for (const ms of archives) for (let k = 0; k + 6 < ms.length; k++) {
  const cible = ms[k];
  // même situation (football) si au moins 3 scores, sinon tous les matchs joués
  let anciens = ms.slice(k + 1, k + 31);
  if (sport === 'football') { const meme = anciens.filter((m) => m.situation === cible.situation); if (meme.length >= 3) anciens = meme; }
  const w = anciens.map((_, i) => 0.5 ** (i / H)), W = w.reduce((a, b) => a + b, 0);
  const mu = anciens.reduce((a, m, i) => a + w[i] * m.score, 0) / W;
  const sd = Math.sqrt(anciens.reduce((a, m, i) => a + w[i] * (m.score - mu) ** 2, 0) / W) || 1;
  // PIT empirique (avec demi-poids pour les égalités)
  let sous = 0; anciens.forEach((m, i) => { sous += w[i] * (m.score < cible.score ? 1 : m.score === cible.score ? 0.5 : 0); });
  cumul.empirique.push(sous / W);
  cumul.normale.push(phi((cible.score - mu) / sd));
  // rééchantillonnage lissé : chaque score passé + bruit normal d'écart-type h × σ
  for (const h of LISSAGES) cumul[`lissé ${h}`].push(anciens.reduce((a, m, i) => a + w[i] * phi((cible.score - m.score) / (h * sd)), 0) / W);
  n++;
}
console.log(`${sport} : ${n} matchs joués prédits. Part des scores réels sous le centile prédit (idéal = centile) :`);
for (const [nom, pits] of Object.entries(cumul)) {
  const q = [0.1, 0.25, 0.5, 0.75, 0.9].map((c) => `${Math.round(c * 100)}e : ${(pits.filter((x) => x < c).length / pits.length * 100).toFixed(1)} %`);
  const ecart = [0.1, 0.25, 0.5, 0.75, 0.9].reduce((a, c) => a + Math.abs(pits.filter((x) => x < c).length / pits.length - c), 0);
  console.log(`  ${nom.padEnd(10)} ${q.join(' | ')}  (écart total ${(ecart * 100).toFixed(1)} points)`);
}
