// Fusion de l'historique incrémental et situation match par match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusionner, trou } from '../src/recuperation/historique.js';
import { situation } from '../src/recuperation/normaliser.js';

const m = (id, date, score = 50, statut = 'FINAL') => ({ matchId: id, date, score, statut });

test('fusion par identifiant : pas de doublon, tri du plus récent au plus ancien', () => {
  const archive = [m('B', '2026-10-20'), m('A', '2026-10-10')];
  const recus = [m('C', '2026-10-30'), m('B', '2026-10-20')];
  assert.deepEqual(fusionner(archive, recus).map((x) => x.matchId), ['C', 'B', 'A']);
});

test('les matchs reçus font foi (score en vérification corrigé)', () => {
  const archive = [m('B', '2026-10-20', 41.2, 'REVIEWING')];
  const recus = [m('B', '2026-10-20', 43.5, 'FINAL')];
  const r = fusionner(archive, recus);
  assert.equal(r.length, 1);
  assert.equal(r[0].score, 43.5);
  assert.equal(r[0].statut, 'FINAL');
});

test('match reprogrammé : même identifiant, nouvelle date, pas de doublon', () => {
  const r = fusionner([m('B', '2026-10-20')], [m('B', '2026-10-27')]);
  assert.deepEqual(r.map((x) => x.date), ['2026-10-27']);
});

test('trou : aucun recoupement et reçus tous postérieurs à l’archive', () => {
  const archive = [m('A', '2026-09-01')];
  assert.equal(trou(archive, [m('X', '2026-10-01'), m('Y', '2026-10-05')]), true);
  assert.equal(trou(archive, [m('A', '2026-09-01'), m('Y', '2026-10-05')]), false);
  assert.equal(trou([], [m('Y', '2026-10-05')]), false);
});

test('situation football et NBA', () => {
  assert.equal(situation({ onGameSheet: false, playedInGame: false }, 'football'), 'absent');
  assert.equal(situation({ onGameSheet: true, playedInGame: false, fieldStatus: 'ON_BENCH' }, 'football'), 'banc');
  assert.equal(situation({ onGameSheet: true, playedInGame: true, gameStarted: 1, fieldStatus: 'SUBSTITUTED' }, 'football'), 'titulaire');
  assert.equal(situation({ onGameSheet: true, playedInGame: true, fieldStatus: 'ON_FIELD' }, 'football'), 'entre');
  assert.equal(situation({ onGameSheet: true, playedInGame: true, minsPlayed: 24 }, 'nba'), 'joue');
  assert.equal(situation(null, 'nba'), 'inconnu');
});

test('échecs d’un palier : la réussite d’un palier passé n’est pas un échec', async () => {
  const { normaliserPaliers } = await import('../src/recuperation/normaliser.js');
  const board = { title: 'Hot Streaks', steps: [
    { level: 0, target: 150, state: 'CLAIMED', maxLineupsCount: 4, remainingLineupsCount: 1, pendingLineupsCount: 0 },
    { level: 1, target: 180, state: 'LINEUP_SET', maxLineupsCount: 4, remainingLineupsCount: 0, pendingLineupsCount: 1 },
  ] };
  const [p0, p1] = normaliserPaliers(board, 'nba');
  assert.equal(p0.echecs, 2);
  assert.equal(p1.echecs, 3);
});
