// Rétro-test de la projection des minutes NBA (methode.md, section 11).
// Pour chaque match joué d'un joueur qui jouait (au moins 4 des 5 matchs précédents joués), on prédit ses minutes à
// partir de ses seuls matchs joués antérieurs (moyenne pondérée, demi-vie en matchs), puis on compare aux minutes
// réelles. Donne l'erreur moyenne par demi-vie, le biais, les écarts 10 % / 90 % (fourchette affichée), la part des
// soirées écourtées, et la valeur du signal « minutes en hausse ».
// Usage : node outils/retro-test-minutes.js
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(RACINE, 'data', 'historique', 'nba');
const TERMINES = new Set(['FINAL', 'REVIEWING', 'DID_NOT_PLAY']);
const JOUE = (m) => m.situation === 'joue' && m.statut !== 'DID_NOT_PLAY' && m.minutes > 0;
const moyenne = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pond = (xs, hl) => { let s = 0, w = 0; xs.forEach((x, i) => { const k = 0.5 ** (i / hl); s += k * x; w += k; }); return s / w; };
const quantile = (xs, q) => { const t = [...xs].sort((a, b) => a - b); return t[Math.min(t.length - 1, Math.floor(q * t.length))]; };

const DEMI_VIES = [1, 1.5, 2, 3, 5];
const err = Object.fromEntries(DEMI_VIES.map((h) => [h, []]));
const residus = { 2: [], 3: [] };
const hausse = { avec: [], sans: [] };
let n = 0;
for (const f of readdirSync(dossier)) {
  const ms = JSON.parse(readFileSync(join(dossier, f), 'utf8')).matchs
    .filter((m) => TERMINES.has(m.statut) && m.situation && m.situation !== 'inconnu').sort((a, b) => b.date.localeCompare(a.date));
  for (let i = 0; i < ms.length - 8; i++) {
    const suiv = ms[i], passe = ms.slice(i + 1);
    if (!JOUE(suiv) || passe.slice(0, 5).filter(JOUE).length < 4) continue;
    const mins = passe.filter(JOUE).map((m) => m.minutes).slice(0, 20);
    if (mins.length < 6) continue;
    n++;
    for (const h of DEMI_VIES) err[h].push(pond(mins, h) - suiv.minutes);
    for (const h of [2, 3]) residus[h].push(suiv.minutes - pond(mins, h));
    // « minutes en hausse » : moyenne des 2 derniers joués ≥ moyenne des 10 derniers + 6 min
    const hauss = moyenne(mins.slice(0, 2)) >= moyenne(mins.slice(0, 10)) + 6;
    (hauss ? hausse.avec : hausse.sans).push(suiv.minutes - moyenne(mins.slice(0, 10)));
  }
}
console.log(`${n} matchs joués prédits (joueurs ayant joué au moins 4 des 5 matchs précédents)`);
for (const h of DEMI_VIES) {
  const e = err[h];
  console.log(`demi-vie ${String(h).padEnd(3)} : erreur moyenne ${moyenne(e.map(Math.abs)).toFixed(2)} min, biais ${moyenne(e).toFixed(2)}`);
}
for (const h of [2, 3]) {
  const r = residus[h];
  console.log(`demi-vie ${h} : écart réel − prévu : 10 % ${quantile(r, 0.1).toFixed(1)}, 25 % ${quantile(r, 0.25).toFixed(1)}, médiane ${quantile(r, 0.5).toFixed(1)}, 75 % ${quantile(r, 0.75).toFixed(1)}, 90 % ${quantile(r, 0.9).toFixed(1)} ; soirées écourtées (réel < 60 % du prévu) ${(r.filter((x, i) => x < -0.4 * (r[i] + 30)).length / r.length * 100).toFixed(1)} %`);
}
console.log(`« minutes en hausse » (2 derniers ≥ 10 derniers + 6) : ${hausse.avec.length} cas, écart réel moyen à la moyenne des 10 derniers ${moyenne(hausse.avec).toFixed(1)} min (autres : ${moyenne(hausse.sans).toFixed(1)})`);
