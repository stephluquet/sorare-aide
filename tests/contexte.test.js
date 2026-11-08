// Contexte du match (methode.md, section 9) : cotes en football, dos-à-dos et blessures
// ESPN en NBA. Valeurs attendues calculées à la main à partir des paramètres ci-dessous.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projeterCarte } from '../src/moteur/projection.js';
import { distribution } from '../src/moteur/simulation.js';
import { rapprocherBlessures, cleNom } from '../src/recuperation/espn.js';
import { readFileSync } from 'node:fs';
import { parametresDepuisMethode } from '../src/moteur/parametres.js';

const PM = parametresDepuisMethode(readFileSync(new URL('../methode.md', import.meta.url), 'utf8'));
// Les effets du contexte sont testés isolément, sans le retrait vers la moyenne du poste (testé à part, plus bas).
const P = { ...PM, retrait: null };
const carte = { id: 'c', bonusPct: 0 };

// 10 matchs, tous titulaire, 50 points (football) ; tous joués, 30 min, 40 points (NBA) ; un par semaine / un tous les 2 jours.
function joueurFoot(poste) {
  const historique = Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(30 - 2 * i).padStart(2, '0')}T15:00:00Z`, statut: 'FINAL', situation: 'titulaire', score: 50, minutes: 90 }));
  return { id: 'j', sport: 'football', nom: 'Test', postes: [poste], club: { slug: 'a' }, blessures: [], suspensions: [], statutSorare: 'STARTER', historique };
}
const matchFoot = (victoire) => ({ id: 'm', debutUTC: '2026-11-07T14:30:00Z', competition: 'Bundesliga', domicile: { slug: 'a' }, exterieur: { slug: 'b' },
  cotes: { domicile: victoire == null ? null : { victoire, nul: 0.2, defaite: 0.8 - victoire }, exterieur: null } });

function joueurNba(dernier) {
  const historique = Array.from({ length: 10 }, (_, i) => ({ date: new Date(Date.parse(dernier) - i * 2 * 86400000).toISOString(), statut: 'FINAL', situation: 'joue', score: 40, minutes: 30 }));
  return { id: 'n', sport: 'nba', nom: 'Joueur Test', postes: ['G'], club: { slug: 'x', nom: 'Test Team' }, blessures: [], suspensions: [], historique };
}
// Prochain match : samedi 7 novembre 19:30 à New York (00:30Z le 8).
const matchNba = { id: 'g', debutUTC: '2026-11-08T00:30:00Z', competition: 'NBA', domicile: { slug: 'x' }, exterieur: { slug: 'y' }, cotes: null };

test('football : défenseur favori à 75 % → +22,9 × (0,75 − 0,38) au score de titulaire', () => {
  const r = projeterCarte(carte, joueurFoot('DF'), matchFoot(0.75), P);
  assert.ok(Math.abs(r.score.decalageTitulaire - 8.473) < 0.001, String(r.score.decalageTitulaire));
  assert.ok(Math.abs(r.score.mu - 58.473) < 0.001);
  assert.ok(r.raisons.some((x) => x.includes('75 % de chances de gagner : +8,5 pts')), JSON.stringify(r.raisons));
  // la simulation déplace le score de titulaire d'autant
  const d = distribution(joueurFoot('DF'), r, P);
  assert.ok(Math.abs(d.m - 58.473) < 0.001, String(d.m));
});

test('football : attaquant outsider à 20 % → 11,4 × (0,20 − 0,398) ; sans cotes, aucun décalage', () => {
  const r = projeterCarte(carte, joueurFoot('FW'), matchFoot(0.2), P);
  assert.ok(Math.abs(r.score.decalageTitulaire + 2.2572) < 0.001, String(r.score.decalageTitulaire));
  const s = projeterCarte(carte, joueurFoot('FW'), matchFoot(null), P);
  assert.equal(s.score.decalageTitulaire, 0);
  assert.ok(Math.abs(s.score.mu - 50) < 1e-9);
});

test('NBA : deuxième soir consécutif (dates de New York) → p × 0,925', () => {
  // dernier match vendredi 6 à 22:00 à New York (03:00Z le 7) : la veille du prochain
  const veille = projeterCarte(carte, joueurNba('2026-11-07T03:00:00Z'), matchNba, P);
  const repos = projeterCarte(carte, joueurNba('2026-11-06T00:00:00Z'), matchNba, P); // jeudi 5 au soir
  assert.equal(veille.contexte.dosADos, true);
  assert.ok(!repos.contexte.dosADos);
  assert.ok(Math.abs(veille.p - repos.p * 0.925) < 1e-9, `${veille.p} / ${repos.p}`);
  assert.ok(veille.raisons.some((x) => x.includes('deuxième soir consécutif')));
});

test('NBA : ESPN Out → exclu, Day-To-Day → douteux, commentaire affiché', () => {
  const j = joueurNba('2026-11-05T00:00:00Z');
  const out = projeterCarte(carte, { ...j, espn: { statut: 'Out', date: '2026-11-06T22:06Z', commentaire: 'Test (ankle) is out.' } }, matchNba, P);
  assert.equal(out.statut, 'exclu');
  assert.equal(out.p, 0);
  assert.ok(out.raisons.some((x) => x.includes('ESPN 2026-11-06 : Out — Test (ankle) is out.')), JSON.stringify(out.raisons));
  const dtd = projeterCarte(carte, { ...j, espn: { statut: 'Day-To-Day', date: '2026-11-06T22:06Z', commentaire: null } }, matchNba, P);
  assert.equal(dtd.statut, 'douteux');
  assert.equal(dtd.proposable, false);
});

test('ESPN : rapprochement par nom sans accents ET par équipe', () => {
  assert.equal(cleNom("Day'Ron Sharpe"), 'dayronsharpe');
  assert.equal(cleNom('Vít Krejčí'), 'vitkrejci');
  const joueurs = [
    { sport: 'nba', nom: 'Vít Krejčí', club: { nom: 'Portland Trail Blazers' } },
    { sport: 'nba', nom: 'Jalen Smith', club: { nom: 'Chicago Bulls' } },
  ];
  const espn = { injuries: [
    { displayName: 'Portland Trail Blazers', injuries: [{ status: 'Out', date: 'd', shortComment: 'c', athlete: { displayName: 'Vit Krejci' } }] },
    { displayName: 'Phoenix Suns', injuries: [{ status: 'Out', date: 'd', shortComment: 'c', athlete: { displayName: 'Jalen Smith' } }] },
  ] };
  const r = rapprocherBlessures(espn, joueurs);
  assert.deepEqual([r.listes, r.rapproches, r.ignores.length], [2, 1, 1]);
  assert.equal(joueurs[0].espn.statut, 'Out');
  assert.equal(joueurs[1].espn, undefined);
});

test('retrait vers la moyenne du poste (methode.md 3 bis) : football par situation, NBA sur le score par minute', () => {
  const R = PM.retrait;
  // défenseur : 10 matchs titulaire à 50, sans cotes → a + (50 − a) × 10 / (10 + k)
  const f = projeterCarte(carte, joueurFoot('DF'), matchFoot(null), PM);
  const a = R.football.moyennes.DF.titulaire, attendu = a + (50 - a) * 10 / (10 + R.football.k);
  assert.ok(Math.abs(f.score.mu - attendu) < 1e-9, `${f.score.mu} / ${attendu}`);
  assert.ok(Math.abs(f.score.retraitTitulaire - (attendu - 50)) < 1e-9);
  // la simulation est décalée d'autant
  const d = distribution(joueurFoot('DF'), f, PM);
  assert.ok(Math.abs(d.m - attendu) < 1e-9, String(d.m));
  // NBA : 10 matchs, 30 min, 40 pts → taux 4/3 retiré vers taux_moyen
  const n = projeterCarte(carte, joueurNba('2026-11-05T00:00:00Z'), matchNba, PM);
  const t = R.nba.taux_moyen + (40 / 30 - R.nba.taux_moyen) * 10 / (10 + R.nba.k);
  assert.ok(Math.abs(n.score.mu - 30 * t) < 1e-9, `${n.score.mu} / ${30 * t}`);
});
