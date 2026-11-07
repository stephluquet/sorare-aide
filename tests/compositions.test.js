// Étape 3 : contraintes des compositions sur 10 situations figées (joueurs fictifs),
// plus des contrôles de la simulation. Paramètres : ceux de methode.md, règles de regles/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parametresDepuisMethode } from '../src/moteur/parametres.js';
import { projeterCarte } from '../src/moteur/projection.js';
import { proposer } from '../src/moteur/compositions.js';
import { simulerEquipe } from '../src/moteur/simulation.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = parametresDepuisMethode(readFileSync(join(RACINE, 'methode.md'), 'utf8'));
const lireRegle = (f) => JSON.parse(readFileSync(join(RACINE, 'regles', f), 'utf8'));
const REGLE_FOOT = lireRegle('football-arcade-solo.json');
const REGLE_NBA = lireRegle('nba-arcade-solo.json');
const COMP_FOOT = { competitionsAutorisees: REGLE_FOOT.competitions_autorisees.noms_api };
const COMP_NBA = { competitionsAutorisees: REGLE_NBA.competitions_autorisees.liste };
const MAINTENANT = Date.parse('2026-11-08T10:00:00Z');

// Joueur fictif : 12 matchs titulaire (ou « joue » en NBA) autour de `niveau`.
function ligne(id, { sport = 'football', postes = ['MD'], niveau = 50, etoiles = 2, blessures = [], comp, debut = '2026-11-08T15:00:00Z', joueurId, rarete = 'common' } = {}) {
  const historique = Array.from({ length: 12 }, (_, i) => ({
    matchId: `Game:${id}-${i}`, date: `2026-10-${String(30 - 2 * i).padStart(2, '0')}T18:00:00Z`, competition: sport === 'football' ? 'Bundesliga' : 'NBA',
    statut: 'FINAL', score: niveau + ((i * 7) % 11) - 5, situation: sport === 'football' ? 'titulaire' : 'joue', minutes: sport === 'football' ? 90 : 30,
  }));
  const joueur = { id: joueurId ?? id, sport, nom: id, postes, club: { slug: `club-${id}`, nom: `Club ${id}` }, etoiles, statutSorare: sport === 'football' ? 'STARTER' : null, blessures, suspensions: [], historique };
  const match = { id: `Game:prochain-${id}`, sport, debutUTC: debut, competition: comp ?? (sport === 'football' ? 'Bundesliga' : 'NBA'),
    domicile: { slug: `club-${id}`, nom: `Club ${id}` }, exterieur: { slug: 'adverse', nom: 'Adverse' } };
  const carte = { id: `${id}-carte`, sport, joueurId: joueur.id, rarete, bonusPct: 0 };
  return { carte, joueur, match, projection: projeterCarte(carte, joueur, match, P, sport === 'football' ? COMP_FOOT : COMP_NBA) };
}

// Effectif football de base : 2 GK, 3 DF, 3 MD, 3 FW.
function effectif(extra = []) {
  return [
    ligne('gk1', { postes: ['GK'], niveau: 50 }), ligne('gk2', { postes: ['GK'], niveau: 40 }),
    ligne('df1', { postes: ['DF'], niveau: 55 }), ligne('df2', { postes: ['DF'], niveau: 48 }), ligne('df3', { postes: ['DF'], niveau: 42 }),
    ligne('md1', { postes: ['MD'], niveau: 60 }), ligne('md2', { postes: ['MD'], niveau: 52 }), ligne('md3', { postes: ['MD'], niveau: 45 }),
    ligne('fw1', { postes: ['FW'], niveau: 70 }), ligne('fw2', { postes: ['FW'], niveau: 58 }), ligne('fw3', { postes: ['FW'], niveau: 44 }),
    ...extra,
  ];
}
const optFoot = (o = {}) => ({ sport: 'football', cible: 260, regle: REGLE_FOOT, seuil: P.seuil_jouer, jouees: new Set(), maintenant: MAINTENANT, ...o });
const equipes = (r) => ['prudente', 'equilibree', 'ambitieuse'].map((k) => r[k]).filter(Boolean);
const parId = (lignes) => new Map(lignes.map((l) => [l.carte.id, l]));

function verifierFootball(r, lignes) {
  const L = parId(lignes);
  for (const e of equipes(r)) {
    assert.equal(e.cartes.length, 5);
    const postes = e.cartes.map((id) => L.get(id).joueur.postes[0]);
    for (const p of REGLE_FOOT.postes.obligatoires) assert.ok(postes.includes(p), `poste ${p} manquant : ${postes}`);
    assert.equal(postes.filter((p) => p === 'GK').length, 1, 'un seul gardien');
    assert.ok(e.cartes.includes(e.capitaine), 'capitaine dans l’équipe');
    assert.equal(new Set(e.cartes.map((id) => L.get(id).joueur.id)).size, 5, 'pas de doublon de joueur');
  }
}

test('1. football : postes GK, DF, MD, FW + un joueur de champ, capitaine dans l’équipe', () => {
  const L = effectif();
  const r = proposer(L, P, optFoot());
  assert.ok(r.equilibree && r.prudente);
  verifierFootball(r, L);
  assert.equal(parId(L).get(r.equilibree.capitaine).joueur.id, 'fw1', 'le meilleur joueur est capitaine');
});

test('2. une carte jouée à ce palier n’est jamais proposée', () => {
  const L = effectif();
  const r = proposer(L, P, optFoot({ jouees: new Set(['fw1-carte', 'gk1-carte']) }));
  for (const e of equipes(r)) assert.ok(!e.cartes.includes('fw1-carte') && !e.cartes.includes('gk1-carte'));
  verifierFootball(r, L);
});

test('3. un joueur blessé n’est jamais proposé', () => {
  const L = effectif([ligne('fw-blesse', { postes: ['FW'], niveau: 95, blessures: [{ type: 'Knock', retourPrevu: '2026-11-30T00:00:00Z' }] })]);
  const r = proposer(L, P, optFoot());
  for (const e of equipes(r)) assert.ok(!e.cartes.includes('fw-blesse-carte'));
  assert.ok(r.ecartees['exclues (blessure, suspension…)'] >= 1);
});

test('4. un joueur dont le match a commencé n’est pas proposé', () => {
  const L = effectif([ligne('md-parti', { postes: ['MD'], niveau: 95, debut: '2026-11-08T09:00:00Z' })]);
  const r = proposer(L, P, optFoot());
  for (const e of equipes(r)) assert.ok(!e.cartes.includes('md-parti-carte'));
  assert.equal(r.ecartees['match déjà commencé'], 1);
});

test('5. un joueur dont le prochain match est une coupe nationale n’est pas proposé', () => {
  const L = effectif([ligne('fw-coupe', { postes: ['FW'], niveau: 95, comp: 'DFB Pokal' })]);
  const r = proposer(L, P, optFoot());
  for (const e of equipes(r)) assert.ok(!e.cartes.includes('fw-coupe-carte'));
  assert.equal(r.ecartees['match hors compétitions Arcade'], 1);
});

test('6. deux cartes du même joueur ne sont jamais ensemble', () => {
  const L = effectif([ligne('fw1-bis', { postes: ['FW'], niveau: 70, joueurId: 'fw1' })]);
  const r = proposer(L, P, optFoot());
  verifierFootball(r, L);
  for (const e of equipes(r)) assert.ok(!(e.cartes.includes('fw1-carte') && e.cartes.includes('fw1-bis-carte')));
});

test('7. sans gardien disponible, aucune équipe et un message clair', () => {
  const L = effectif();
  const r = proposer(L, P, optFoot({ jouees: new Set(['gk1-carte', 'gk2-carte']) }));
  assert.equal(r.equilibree, null);
  assert.match(r.message, /Aucune équipe possible/);
});

test('8. NBA : somme des étoiles ≤ 16, un total de 16 pile est accepté', () => {
  // Les 5 meilleurs font 5 + 4 + 3 + 3 + 3 = 18 étoiles : interdit. 16 pile est possible.
  const L = [
    ligne('n1', { sport: 'nba', niveau: 60, etoiles: 5 }), ligne('n2', { sport: 'nba', niveau: 55, etoiles: 4 }),
    ligne('n3', { sport: 'nba', niveau: 45, etoiles: 3 }), ligne('n4', { sport: 'nba', niveau: 44, etoiles: 3 }),
    ligne('n5', { sport: 'nba', niveau: 43, etoiles: 3 }), ligne('n6', { sport: 'nba', niveau: 30, etoiles: 1 }),
    ligne('n7', { sport: 'nba', niveau: 25, etoiles: 1 }),
  ];
  const r = proposer(L, P, { sport: 'nba', cible: 150, regle: REGLE_NBA, seuil: P.seuil_jouer, jouees: new Set(), maintenant: MAINTENANT });
  for (const e of equipes(r)) { assert.ok(e.etoiles <= 16, `${e.etoiles} étoiles`); assert.equal(e.capitaine, null); }
  assert.ok(equipes(r).some((e) => e.etoiles === 16), 'une équipe à 16 étoiles pile est proposée');
});

test('9. NBA : si le plafond n’était pas inclus, 16 serait refusé', () => {
  const L = [5, 4, 3, 2, 2, 1, 1].map((et, i) => ligne(`m${i}`, { sport: 'nba', niveau: 60 - 5 * i, etoiles: et }));
  const regle = { ...REGLE_NBA, plafond_etoiles: { ...REGLE_NBA.plafond_etoiles, plafond_inclus: false } };
  const r = proposer(L, P, { sport: 'nba', cible: 150, regle, seuil: P.seuil_jouer, jouees: new Set(), maintenant: MAINTENANT });
  for (const e of equipes(r)) assert.ok(e.etoiles < 16, `${e.etoiles} étoiles`);
});

test('10. reproductible, et « équipe complète » = produit des probabilités de jouer', () => {
  const L = effectif();
  const a = proposer(L, P, optFoot()), b = proposer(L, P, optFoot());
  assert.deepEqual(a.equilibree, b.equilibree);
  const prod = a.equilibree.cartes.reduce((s, id) => s * parId(L).get(id).projection.p, 1);
  assert.ok(Math.abs(a.equilibree.pComplete - prod) < 1e-12);
});

test('simulation : scores certains → probabilité 0 ou 1, capitaine × 1,5', () => {
  const certain = (score) => ({ p: 1, b: 1, situations: [{ part: 1, e: { scores: [score], cumul: [1] } }], echelle: 1, bruit: 0, max: 100 });
  const d = [certain(50), certain(50), certain(50), certain(50), certain(60)];
  const sim = { tirages: 200, graine: 1 };
  assert.equal(simulerEquipe(d, 4, 1.5, 290, sim).pPasser, 1);   // 200 + 90 = 290
  assert.equal(simulerEquipe(d, 0, 1.5, 290, sim).pPasser, 0);   // 225 + 60 = 285
  assert.equal(simulerEquipe(d, -1, 1.5, 260, sim).scoreMoyen, 260);
});

test('simulation : un joueur à p = 0,5 fait passer une fois sur deux environ', () => {
  const d = [{ p: 0.5, b: 1, situations: [{ part: 1, e: { scores: [100], cumul: [1] } }], echelle: 1, bruit: 0, max: 100 }];
  const r = simulerEquipe(d, -1, 1, 100, { tirages: 5000, graine: 7 });
  assert.ok(Math.abs(r.pPasser - 0.5) < 0.03, `${r.pPasser}`);
});
