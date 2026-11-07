// Étape 3 : contraintes des compositions sur 10 situations figées (joueurs fictifs),
// plus des contrôles de la simulation. Paramètres : ceux de methode.md, règles de regles/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parametresDepuisMethode } from '../src/moteur/parametres.js';
import { projeterCarte } from '../src/moteur/projection.js';
import { proposer, proposerParCreneau, squadDuJour, joursAVenir, jourDeJeu, autresChoix } from '../src/moteur/compositions.js';
import { simulerEquipe, multiplicateurCarte } from '../src/moteur/simulation.js';

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

// ---------- Compositions officielles (methode.md, 1 bis) ----------
function avecCompo(l, { titulaires = [], remplacants = [] }) {
  const match = { ...l.match, compositionsOfficielles: { releveA: '2026-11-08T14:00:00Z', equipes: { [l.joueur.club.slug]: { titulaires, remplacants } } } };
  return { ...l, match, projection: projeterCarte(l.carte, l.joueur, match, P, COMP_FOOT) };
}

test('compositions officielles : titulaire annoncé → p = 0,99, q = 1, même s’il était déclaré blessé', () => {
  const l = avecCompo(ligne('x', { blessures: [{ type: 'Knock', retourPrevu: '2026-11-30T00:00:00Z' }] }), { titulaires: ['x'] });
  assert.equal(l.projection.statut, 'ok');
  assert.equal(l.projection.p, P.compositions_officielles.p_titulaire);
  assert.equal(l.projection.score.q, 1);
  assert.ok(l.projection.raisons.some((r) => r.includes('titulaire (composition officielle)')));
});

test('compositions officielles : remplaçant → chance d’entrer, q = 0 ; absent de la feuille → exclu', () => {
  const C = P.compositions_officielles;
  const remp = avecCompo(ligne('y'), { remplacants: ['y'] });
  // historique fictif sans match comme remplaçant : seul l'a priori compte
  assert.ok(Math.abs(remp.projection.p - C.taux_entree_remplacant) < 1e-9);
  assert.equal(remp.projection.score.q, 0);
  const abs = avecCompo(ligne('z'), { titulaires: ['autre'] });
  assert.equal(abs.projection.statut, 'exclu');
  assert.equal(abs.projection.p, 0);
});

// ---------- Créneau unique et Squad du jour (methode.md, sections 7 et 8) ----------

test('créneau unique : les 5 matchs commencent à la même heure', () => {
  // Deux créneaux complets : 15:00 (effectif de base) et 18:00 (un second effectif plus faible)
  const tard = '2026-11-08T18:00:00Z';
  const L = effectif([
    ligne('gk9', { postes: ['GK'], niveau: 45, debut: tard }), ligne('df9', { postes: ['DF'], niveau: 45, debut: tard }),
    ligne('md9', { postes: ['MD'], niveau: 45, debut: tard }), ligne('fw9', { postes: ['FW'], niveau: 45, debut: tard }),
    ligne('fw8', { postes: ['FW'], niveau: 44, debut: tard }),
  ]);
  const res = proposerParCreneau(L, P, optFoot());
  assert.deepEqual(res.map((r) => r.creneau), ['2026-11-08T15:00:00Z', tard]);
  const parIdL = parId(L);
  for (const r of res) for (const e of [r.equilibree, r.prudente]) {
    assert.ok(e.cartes.every((id) => parIdL.get(id).match.debutUTC === r.creneau), `créneau ${r.creneau}`);
  }
});

test('Squad du jour : cartes du jour seulement, cartes jouées en Arcade autorisées, meilleure espérance', () => {
  const autreJour = '2026-11-09T15:00:00Z';
  const L = effectif([ligne('fw-lundi', { postes: ['FW'], niveau: 99, debut: autreJour })]);
  assert.deepEqual(joursAVenir(L, MAINTENANT), ['2026-11-08', '2026-11-09']);
  const r = squadDuJour(L, P, { sport: 'football', jour: '2026-11-08', regle: REGLE_FOOT, seuil: P.seuil_jouer, maintenant: MAINTENANT, jouees: new Set(['fw1-carte']) });
  assert.ok(!r.equipe.cartes.includes('fw-lundi-carte'), 'joueur d’un autre jour exclu');
  assert.ok(r.equipe.cartes.includes('fw1-carte'), 'une carte jouée en Arcade reste utilisable en Squad');
  assert.equal(r.equipe.capitaine, 'fw1-carte');
  // Contrôle par force brute sur les mêmes cartes : aucune équipe valide ne fait mieux.
  const adm = L.filter((l) => l.match.debutUTC.startsWith('2026-11-08'));
  const esp = (ids) => {
    const pr = ids.map((id) => parId(L).get(id).projection);
    return pr.reduce((a, x) => a + x.esperance, 0) + 0.5 * Math.max(...pr.map((x) => x.p * x.score.mu));
  };
  const pos = (po) => adm.filter((l) => l.joueur.postes[0] === po).map((l) => l.carte.id);
  let best = 0;
  for (const g of pos('GK')) for (const d of pos('DF')) for (const m of pos('MD')) for (const f of pos('FW'))
    for (const x of [...pos('DF'), ...pos('MD'), ...pos('FW')]) { if (new Set([d, m, f, x]).size < 4) continue; best = Math.max(best, esp([g, d, m, f, x])); }
  assert.ok(Math.abs(r.equipe.esperance - best) < 1e-9, `${r.equipe.esperance} contre ${best}`);
});

test('cumul des bonus par addition : capitaine Eclipse × 1,7 ; le brassard va au meilleur score de base', () => {
  assert.ok(Math.abs(multiplicateurCarte({ b: 1.2 }, true, 1.5, 'addition') - 1.7) < 1e-12);
  assert.ok(Math.abs(multiplicateurCarte({ b: 1.2 }, true, 1.5, 'multiplication') - 1.8) < 1e-12);
  assert.equal(multiplicateurCarte({ b: 1.2 }, false, 1.5, 'addition'), 1.2);
  // Kane-like : base 70, sans bonus ; carte Eclipse : base 58, +20 %. Squad → capitaine = base 70.
  const fort = ligne('fort', { postes: ['FW'], niveau: 70 });
  const bonifie = ligne('bonifie', { postes: ['DF'], niveau: 58 });
  bonifie.carte.bonusPct = 20;
  bonifie.projection = projeterCarte(bonifie.carte, bonifie.joueur, bonifie.match, P, COMP_FOOT);
  const L = [ligne('g', { postes: ['GK'], niveau: 40 }), bonifie, ligne('m', { postes: ['MD'], niveau: 45 }), fort, ligne('d2', { postes: ['DF'], niveau: 40 })];
  const r = squadDuJour(L, P, { sport: 'football', jour: '2026-11-08', regle: REGLE_FOOT, seuil: P.seuil_jouer, maintenant: MAINTENANT });
  assert.equal(r.equipe.capitaine, 'fort-carte');
});

test('journée de jeu : NBA à la date de New York (soirée + nuit à Paris), football à la date de Paris', () => {
  const J = JSON.parse(readFileSync(join(RACINE, 'regles', 'squad.json'), 'utf8')).journee_de_jeu;
  // Match NBA à 23:00 à Paris le 7 et match à 04:00 à Paris le 8 : même journée (le 7 à New York).
  assert.equal(jourDeJeu('2026-11-07T22:00:00Z', J.nba.fuseau), '2026-11-07');
  assert.equal(jourDeJeu('2026-11-08T03:00:00Z', J.nba.fuseau), '2026-11-07');
  assert.equal(jourDeJeu('2026-11-08T20:30:00Z', J.nba.fuseau), '2026-11-08');
  // Football : un match à 00:30 à Paris le 8 appartient au 8.
  assert.equal(jourDeJeu('2026-11-07T23:30:00Z', J.football.fuseau), '2026-11-08');
  const L = [ligne('a', { sport: 'nba', debut: '2026-11-08T22:00:00Z' }), ligne('b', { sport: 'nba', debut: '2026-11-09T03:00:00Z' })];
  assert.deepEqual(joursAVenir(L, MAINTENANT, J.nba.fuseau), ['2026-11-08']);
});

test('autres choix : par poste, hors équipe, remplacements valides, chance de passer recalculée', () => {
  const L = effectif();
  const o = optFoot();
  const r = proposer(L, P, o);
  const a = autresChoix(L, P, o, r.prudente);
  assert.deepEqual(a.groupes.map((g) => g.poste), ['GK', 'DF', 'MD', 'FW']);
  const Lp = parId(L);
  for (const g of a.groupes) for (const c of g.choix) {
    assert.ok(!r.prudente.cartes.includes(c.carteId), 'hors de l’équipe');
    assert.ok(Lp.get(c.carteId).joueur.postes.includes(g.poste));
    // Remplacement valide : un gardien ne remplace qu'un gardien
    if (g.poste === 'GK') assert.equal(Lp.get(c.remplace).joueur.postes[0], 'GK');
    assert.ok(c.pPasser >= 0 && c.pPasser <= 1);
    assert.ok(Math.abs(c.ecart - (c.pPasser - r.prudente.pPasser)) < 1e-12);
  }
  // le second gardien remplace forcément le premier
  assert.equal(a.groupes[0].choix[0].remplace, r.prudente.cartes.find((id) => Lp.get(id).joueur.postes[0] === 'GK'));
});
