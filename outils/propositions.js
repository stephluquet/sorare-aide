// Propositions Arcade sur les vraies données (contrôle du moteur, pas utilisé par l'appli).
// Usage : node outils/propositions.js [football|nba] [seuil]
import { chargerEntrees, projeterTout } from '../src/moteur/node.js';
import { proposer } from '../src/moteur/compositions.js';

const sport = process.argv[2] ?? 'football';
const entrees = chargerEntrees();
const seuil = Number(process.argv[3] ?? entrees.P.seuil_jouer);
const lignes = projeterTout(entrees).filter((x) => x.carte.sport === sport);
const palier = entrees.donnees.paliers.filter((p) => p.sport === sport && !['CLAIMED', 'CLAIMABLE'].includes(p.etat)).sort((a, b) => a.niveau - b.niveau)[0];
const t0 = performance.now();
const r = proposer(lignes, entrees.P, { sport, cible: palier.cible, regle: entrees.regles[sport], seuil, jouees: new Set(), maintenant: Date.now() });
const ms = performance.now() - t0;
const parId = new Map(lignes.map((l) => [l.carte.id, l]));
console.log(`${sport} palier ${palier.cible} : ${r.admissibles} cartes admissibles, ${r.nbEquipes} équipes évaluées, ${ms.toFixed(0)} ms`);
console.log('  écartées :', JSON.stringify(r.ecartees));
for (const nom of ['prudente', 'equilibree', 'ambitieuse']) {
  const e = r[nom]; if (!e) { console.log(`  ${nom} : —`); continue; }
  console.log(`  ${nom} : passer ${(e.pPasser * 100).toFixed(1)} % | équipe complète ${(e.pComplete * 100).toFixed(1)} % | score moyen ${e.scoreMoyen.toFixed(0)} | verrouillage ${e.verrouillage}${sport === 'nba' ? ` | ${e.etoiles} ★` : ''}`);
  for (const id of e.cartes) { const l = parId.get(id); console.log(`     ${id === e.capitaine ? 'C ' : '  '}${l.joueur.nom.padEnd(24)} ${l.joueur.postes.join('/').padEnd(5)} p ${l.projection.p.toFixed(2)} s'il joue ${l.projection.siJoue.toFixed(0)} | ${l.match.debutUTC.slice(5, 16)} ${l.match.competition}${sport === 'nba' ? ` | ${l.joueur.etoiles}★` : ''}`); }
}
