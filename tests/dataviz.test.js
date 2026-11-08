// Résumés de la simulation pour l'affichage (methode.md, section 5 ter) : histogramme de
// l'équipe face à la cible et quantiles du score s'il joue d'une carte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumerTirages, quantilesSiJoue, tirerTotaux, simulerEquipe } from '../src/moteur/simulation.js';

const SIM = { tirages: 5000, graine: 20261107 };

// Distribution minimale au format de distribution() : un échantillon de scores à poids égaux.
function loi(scores, { p = 1, b = 1, bruit = 0, max = null } = {}) {
  const cumul = scores.map((_, i) => (i + 1) / scores.length);
  return { p, b, situations: [{ part: 1, e: { scores, cumul } }], echelle: 1, bruit, max };
}

test('resumerTirages : effectifs, moyenne, quantiles et part au-dessus de la cible', () => {
  const totaux = Array.from({ length: 1000 }, (_, i) => i); // 0 … 999
  const r = resumerTirages(totaux, 500);
  assert.equal(r.n, 1000);
  assert.equal(r.classes.length, 40);
  assert.equal(r.classes.reduce((a, b) => a + b, 0), 1000, 'chaque tirage dans une classe');
  assert.equal(r.partAuDessus, 0.5);
  assert.equal(r.moyenne, 499.5);
  assert.ok(Math.abs(r.q50 - 499.5) < 1e-9);
  assert.ok(Math.abs(r.q10 - 99.9) < 1e-9 && Math.abs(r.q90 - 899.1) < 1e-9);
  assert.ok(r.min <= 5 && r.max >= 994 && r.min % 10 === 0 && r.max % 10 === 0, 'bornes arrondies à 10');
  assert.ok(Math.abs(r.largeur * 40 - (r.max - r.min)) < 1e-9);
});

test('resumerTirages : la cible hors des tirages élargit les bornes ; aucun tirage → null', () => {
  const r = resumerTirages([100, 110, 120, 130], 300, { classes: 10 });
  assert.ok(r.max >= 300, 'la cible est visible');
  assert.equal(r.partAuDessus, 0);
  assert.equal(r.classes.length, 10);
  assert.equal(resumerTirages([], 300), null);
});

test('resumerTirages : même part au-dessus de la cible que pPasserBrut (mêmes tirages)', () => {
  const equipe = [
    loi([40, 55, 60, 72], { p: 0.9, b: 1.05, bruit: 5, max: 100 }),
    loi([30, 45, 50], { p: 0.85, bruit: 4, max: 100 }),
    loi([60, 65, 80, 35], { p: 0.93, b: 1.2, bruit: 6, max: 100 }),
    loi([20, 48, 52], { p: 0.7, bruit: 3, max: 100 }),
    loi([44, 58], { p: 0.88, b: 1.1, bruit: 5, max: 100 }),
  ];
  const totaux = tirerTotaux(equipe, 2, 1.5, SIM);
  const r = resumerTirages(totaux, 250);
  const s = simulerEquipe(equipe, 2, 1.5, 250, SIM);
  assert.equal(r.partAuDessus, s.pPasserBrut);
  assert.ok(Math.abs(r.moyenne - s.scoreMoyen) < 1e-9);
  assert.ok(r.q10 < r.q50 && r.q50 < r.q90);
});

test('quantilesSiJoue : un seul score possible, sans bruit → les trois quantiles valent ce score × bonus', () => {
  const q = quantilesSiJoue(loi([50], { p: 0.3, b: 1.1 }), SIM);
  for (const k of ['q10', 'q50', 'q90']) assert.ok(Math.abs(q[k] - 55) < 1e-9, `${k} = ${q[k]}`);
});

test('quantilesSiJoue : conditionnel au fait de jouer (aucun zéro), ordonné, facteur appliqué', () => {
  const scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const d = loi(scores, { p: 0.2 });
  const q = quantilesSiJoue(d, SIM);
  assert.ok(q.q10 >= 10 && q.q10 <= 20, `q10 = ${q.q10}`);
  assert.ok(q.q90 >= 90 && q.q90 <= 100, `q90 = ${q.q90}`);
  assert.ok(q.q10 < q.q50 && q.q50 < q.q90);
  const capitaine = quantilesSiJoue(d, SIM, { facteur: 1.5 });
  assert.ok(Math.abs(capitaine.q50 - 1.5 * q.q50) < 1e-9);
});
