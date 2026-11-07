// Résumé des projections v2 sur data/dernier.json (contrôle, pas utilisé par l'appli).
import { chargerEntrees, projeterTout } from '../src/moteur/node.js';
const entrees = chargerEntrees();
const tout = projeterTout(entrees);
for (const sport of ['football', 'nba']) {
  const L = tout.filter((x) => x.carte.sport === sport);
  const compte = (f) => L.filter(f).length;
  console.log(`\n== ${sport} : ${L.length} cartes ; ok ${compte((x) => x.projection.statut === 'ok')}, douteux ${compte((x) => x.projection.statut === 'douteux')}, exclus ${compte((x) => x.projection.statut === 'exclu')} ; ` +
    `proposables (p ≥ ${entrees.P.seuil_jouer}) ${compte((x) => x.projection.proposable)}, dont éligibles Arcade ${compte((x) => x.projection.proposable && x.projection.eligibleArcade)}`);
  const motifs = {};
  for (const x of L) for (const r of x.projection.raisons) { const k = r.replace(/\(.*?\)|le \S+|en .* pas en .*|\d+/g, '…'); motifs[k] = (motifs[k] ?? 0) + 1; }
  console.log('  raisons :', Object.entries(motifs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${v} × ${k}`).join(' | '));
  const top = L.filter((x) => x.projection.proposable && x.projection.eligibleArcade).sort((a, b) => b.projection.esperance - a.projection.esperance).slice(0, 10);
  for (const { joueur: j, carte: c, projection: p, match: m } of top) {
    const s = p.score;
    console.log(`  ${j.nom.padEnd(24)} ${j.postes.join('/').padEnd(5)} p ${p.p.toFixed(2)} | s'il joue ${p.siJoue.toFixed(1)} ` +
      (sport === 'football' ? `(q ${s.q.toFixed(2)}, T ${s.muTitulaire?.toFixed(0)}, E ${s.muEntre?.toFixed(0)})` : `(${s.minutes.toFixed(0)} min × ${s.taux.toFixed(2)})`) +
      ` σ ${s.sigma?.toFixed(0)} | espérance ${p.esperance.toFixed(1)} | L15 ${j.moyennes.L15} | ${m?.competition} ${m?.debutUTC.slice(5, 16)} | +${c.bonusPct}%`);
  }
}
