// Statistiques détaillées NBA (2026-11-14) : normalisation et archive à recharger une fois.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchHistorique } from '../src/recuperation/normaliser.js';
import { archivePerimee, FORMAT_ARCHIVE } from '../src/recuperation/fusion.js';

const brut = (stats) => ({ score: 52.1, scoreStatus: 'FINAL', anyGame: { id: 'Game:1', date: '2026-11-12T02:30:00Z', homeTeam: { slug: 'h' }, awayTeam: { slug: 'a' } },
  anyPlayerGameStats: { anyTeam: { slug: 'h' }, onGameSheet: true, ...stats } });

test('match NBA joué : statistiques aux noms du barème', () => {
  const m = matchHistorique(brut({ playedInGame: true, minsPlayed: 38, points: 19, rebounds: 13, assists: 9, steals: 1, blocks: 1, turnovers: 2, threePointsMade: 1, doubleDouble: 1, tripleDouble: 0 }), 'nba');
  assert.deepEqual(m.stats, { points: 19, rebounds: 13, assists: 9, blocks: 1, steals: 1, turnovers: 2, three_points_made: 1, double_double: 1, triple_double: 0 });
  assert.equal(m.minutes, 38);
});

test('match NBA non joué : stats nulles ; football : pas de stats', () => {
  assert.equal(matchHistorique(brut({ playedInGame: false, minsPlayed: 0, points: 0 }), 'nba').stats, null);
  assert.equal('stats' in matchHistorique(brut({ playedInGame: true, minsPlayed: 90 }), 'football'), false);
});

test('archive NBA sans format courant : à recharger une fois ; football jamais', () => {
  assert.equal(archivePerimee({ matchs: [] }, 'nba'), true);
  assert.equal(archivePerimee({ matchs: [], format: FORMAT_ARCHIVE }, 'nba'), false);
  assert.equal(archivePerimee({ matchs: [] }, 'football'), false);
  assert.equal(archivePerimee(null, 'nba'), false);
});
