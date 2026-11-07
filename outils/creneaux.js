// Créneau unique et Squad du jour sur les vraies données (contrôle, pas utilisé par l'appli).
// Usage : node outils/creneaux.js [football|nba]
import { chargerEntrees, projeterTout } from '../src/moteur/node.js';
import { proposerParCreneau, squadDuJour, joursAVenir } from '../src/moteur/compositions.js';
const sport = process.argv[2] ?? 'football';
const e = chargerEntrees();
const L = projeterTout(e).filter((x) => x.carte.sport === sport);
const palier = e.donnees.paliers.filter((p) => p.sport === sport && !['CLAIMED', 'CLAIMABLE'].includes(p.etat)).sort((a, b) => a.niveau - b.niveau)[0];
const o = { sport, cible: palier.cible, regle: e.regles[sport], seuil: e.P.seuil_jouer, jouees: new Set(), maintenant: Date.now() };
const nom = (id) => L.find((l) => l.carte.id === id).joueur.nom;
let t0 = performance.now();
const cr = proposerParCreneau(L, e.P, o);
console.log(`${sport} palier ${palier.cible} — créneau unique (${(performance.now() - t0).toFixed(0)} ms) :`);
for (const c of cr) console.log(`  ${c.creneau} : passer ${(c.equilibree.pPasser * 100).toFixed(0)} %, les 5 jouent ${(c.equilibree.pComplete * 100).toFixed(0)} %, compositions ${c.compositionsPubliees}/${c.matchs} | ${c.equilibree.cartes.map(nom).join(', ')}`);
t0 = performance.now();
for (const jour of joursAVenir(L, Date.now()).slice(0, 3)) {
  const s = squadDuJour(L, e.P, { ...o, jour });
  console.log(`Squad ${jour} : ${s.equipe ? `espérance ${s.equipe.esperance.toFixed(0)}, les 5 jouent ${(s.equipe.pComplete * 100).toFixed(0)} % | ${s.equipe.cartes.map(nom).join(', ')}` : s.message}`);
}
console.log(`(Squad : ${(performance.now() - t0).toFixed(0)} ms)`);
