// Construit les deux maquettes de l'écran « Mes cartes » (plan v0.1, décision 0 bis)
// à partir des vraies données (data/dernier.json) et du moteur v2.
// Usage : node outils/maquettes.js
//   → sorties/maquettes/mes-cartes-a.html (riche, avec vignettes)
//   → sorties/maquettes/mes-cartes-b.html (ultra minimaliste)
// Les vignettes (WebP 96 px) sont fabriquées par outils/vignettes.py dans
// data/vignettes/ ; un artifact ne peut pas charger d'images depuis Sorare
// (CSP), elles sont donc intégrées en data: URI.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { chargerEntrees, projeterTout, RACINE } from '../src/moteur/node.js';

const NB_VIGNETTES = { football: 60, nba: 30 };
const entrees = chargerEntrees();
const tout = projeterTout(entrees);

const libelleStatut = (pr) => {
  if (pr.statut === 'exclu') return 'exclu';
  if (pr.statut === 'douteux') return 'douteux';
  if (pr.p != null && pr.p >= entrees.P.seuil_jouer) return 'probable';
  return 'incertain';
};

const lignes = tout.map(({ carte: c, joueur: j, match: m, projection: pr }) => {
  const s = pr.score;
  const club = j.club?.slug;
  const adv = m ? (m.domicile?.slug === club ? m.exterieur?.nom : m.exterieur?.slug === club ? m.domicile?.nom : `${m.domicile?.nom} – ${m.exterieur?.nom}`) : null;
  const lieu = m ? (m.domicile?.slug === club ? 'dom' : m.exterieur?.slug === club ? 'ext' : null) : null;
  const cotes = m?.cotes ? (lieu === 'dom' ? m.cotes.domicile : lieu === 'ext' ? m.cotes.exterieur : null) : null;
  return {
    id: c.id, sp: c.sport, n: j.nom, po: j.postes, cl: j.club?.nom ?? null,
    st: libelleStatut(pr), p: pr.p, el: pr.eligibleArcade, e: pr.esperance, sj: pr.siJoue, sg: s.sigma,
    q: s.q ?? null, mi: s.minutes ?? null, b: c.bonusPct, col: c.collection, t: j.tier, et: j.etoiles, ss: j.statutSorare,
    m: m ? { d: m.debutUTC, adv, lieu, comp: m.competition, v: cotes?.victoire ?? null, nul: cotes?.nul ?? null, def: cotes?.defaite ?? null } : null,
    r: pr.raisons,
    h: (j.historique ?? []).filter((x) => ['FINAL', 'REVIEWING', 'DID_NOT_PLAY'].includes(x.statut)).slice(0, 15).reverse()
      .map((x) => [x.situation, Math.round(x.score), x.minutes, x.date.slice(0, 10)]),
    url: c.visuelUrl,
  };
});

// Vignettes : les meilleures espérances parmi les cartes proposables et éligibles
const dossierVignettes = join(RACINE, 'data', 'vignettes');
const choisies = [];
for (const sp of ['football', 'nba']) {
  choisies.push(...lignes.filter((l) => l.sp === sp && l.url && l.e != null).sort((a, b) => b.e - a.e).slice(0, NB_VIGNETTES[sp]));
}
mkdirSync(dossierVignettes, { recursive: true });
writeFileSync(join(dossierVignettes, 'a-faire.json'), JSON.stringify(choisies.map((l) => ({ id: l.id, url: l.url }))));
execFileSync('python3', ['-I', join(RACINE, 'outils', 'vignettes.py'), dossierVignettes], { stdio: 'inherit' });
let poidsVignettes = 0;
for (const l of choisies) {
  const f = join(dossierVignettes, `${l.id}.webp`);
  if (existsSync(f)) { const b = readFileSync(f); poidsVignettes += b.length; l.img = `data:image/webp;base64,${b.toString('base64')}`; }
}
for (const l of lignes) delete l.url;

const donnees = {
  recupereA: entrees.donnees.meta.recupereA,
  seuil: entrees.P.seuil_jouer,
  methode: entrees.P.version,
  paliers: entrees.donnees.paliers.filter((p) => ['LINEUP_SET', 'PLAYABLE', 'LIVE'].includes(p.etat)),
  lignes,
};
const json = JSON.stringify(donnees).replace(/</g, '\\u003c');
const sansImages = JSON.stringify({ ...donnees, lignes: lignes.map(({ img, ...l }) => l) }).replace(/</g, '\\u003c');

mkdirSync(join(RACINE, 'sorties', 'maquettes'), { recursive: true });
for (const [lettre, contenu] of [['a', json], ['b', sansImages]]) {
  const gabarit = readFileSync(join(RACINE, 'outils', 'maquettes', `${lettre}.html`), 'utf8');
  const sortie = join(RACINE, 'sorties', 'maquettes', `mes-cartes-${lettre}.html`);
  writeFileSync(sortie, gabarit.replace('/*DONNEES*/null', () => contenu));
  console.error(`Écrit : ${sortie} (${(readFileSync(sortie).length / 1024).toFixed(0)} Ko)`);
}
console.error(`${lignes.length} cartes, ${choisies.filter((l) => l.img).length} vignettes (${(poidsVignettes / 1024).toFixed(0)} Ko)`);
