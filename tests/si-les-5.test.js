// « Si les 5 jouent » (methode.md, section 5 quater) : la même équipe, chances de jouer forcées à 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siLes5Jouent, simulerEquipe } from '../src/moteur/simulation.js';

const SIM = { tirages: 5000, graine: 20261114 };
function loi(scores, { p = 1, b = 1, bruit = 0, max = null } = {}) {
  const cumul = scores.map((_, i) => (i + 1) / scores.length);
  return { p, b, situations: [{ part: 1, e: { scores, cumul } }], echelle: 1, bruit, max };
}
const equipe = [loi([40, 60], { p: 0.9 }), loi([50, 70], { p: 0.8 }), loi([45, 55], { p: 0.9 }), loi([60], { p: 0.7 }), loi([30, 50], { p: 0.9 })];

test('si les 5 jouent = simulation de la même équipe avec p = 1', () => {
  const r = siLes5Jouent(equipe, 1, 1.5, 270, SIM);
  const ref = simulerEquipe(equipe.map((d) => ({ ...d, p: 1 })), 1, 1.5, 270, SIM);
  assert.equal(r.pPasserBrut, ref.pPasserBrut);
  assert.equal(r.pPasser, r.pPasserBrut, 'sans table de calibrage, chances brutes');
});

test('si les 5 jouent : jamais moins de chances, médiane du score sans absence', () => {
  const normal = simulerEquipe(equipe, 1, 1.5, 270, SIM);
  const si5 = siLes5Jouent(equipe, 1, 1.5, 270, SIM);
  assert.ok(si5.pPasserBrut >= normal.pPasserBrut);
  // Scores possibles : (40|60) + 1,5 × (50|70) + (45|55) + 60 + (30|50) : médiane entre 250 et 290.
  assert.ok(si5.mediane >= 250 && si5.mediane <= 290, `médiane ${si5.mediane}`);
});

test('si les 5 jouent : la table de calibrage s’applique comme pour pPasser', () => {
  const sim = { ...SIM, calibration: [[0, 0], [1, 0.5]] };
  const r = siLes5Jouent(equipe, 1, 1.5, 270, sim);
  assert.ok(Math.abs(r.pPasser - r.pPasserBrut / 2) < 1e-12);
});
