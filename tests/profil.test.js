// Profil NBA en points Sorare (methode.md, section 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parametresDepuisMethode } from '../src/moteur/parametres.js';
import { profilNba, referenceNba, rangNba } from '../src/moteur/profil.js';

const F = parametresDepuisMethode(readFileSync(new URL('../methode.md', import.meta.url), 'utf8')).profil;
const POIDS = { points: 1, rebounds: 1.2, assists: 1.5, blocks: 3, steals: 3, turnovers: -2, three_points_made: 1, double_double: 1, triple_double: 1 };
const m = (minutes, st) => ({ statut: 'FINAL', situation: 'joue', minutes, stats: { points: 0, rebounds: 0, assists: 0, blocks: 0, steals: 0, turnovers: 0, three_points_made: 0, double_double: 0, triple_double: 0, ...st } });
const joueur = (minutes, st, n = 6) => ({ historique: Array.from({ length: n }, () => m(minutes, st)) });

test('profil : moyennes par match et points Sorare au barème (le match d’Şengün du 14 novembre)', () => {
  const p = profilNba(joueur(38, { points: 43, rebounds: 12, assists: 5, blocks: 1, steals: 1, turnovers: 1, three_points_made: 1, double_double: 1 }), POIDS, F);
  assert.equal(p.n, 6);
  assert.ok(Math.abs(p.total - 70.9) < 1e-9, `total ${p.total}`); // = son score Sorare
  assert.equal(p.stats.turnovers.points, -2);
  assert.ok(Math.abs(p.stats.rebounds.points - 14.4) < 1e-9);
});

test('profil : trop peu de matchs ou pas de barème → null ; matchs non joués ignorés', () => {
  assert.equal(profilNba(joueur(30, { points: 10 }, 4), POIDS, F), null);
  assert.equal(profilNba(joueur(30, { points: 10 }), null, F), null);
  const j = joueur(30, { points: 10 });
  j.historique.unshift({ statut: 'DID_NOT_PLAY', situation: 'banc', minutes: 0, stats: null });
  assert.equal(profilNba(j, POIDS, F).n, 6);
});

test('référence : seulement les joueurs à 20 min et plus ; rang et couleurs (balles perdues : moins = mieux)', () => {
  const groupe = [joueur(10, { points: 30 }), ...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => joueur(30, { points: 10 + k, turnovers: k / 2 }))];
  const ref = referenceNba(groupe, POIDS, F);
  assert.equal(ref.n, 8, 'le joueur à 10 min est écarté');
  assert.deepEqual(rangNba(18, 'points', ref, F), { rang: 1, sur: 8, ton: 'fort' });
  assert.equal(rangNba(11, 'points', ref, F).ton, 'faible');
  assert.equal(rangNba(-8, 'turnovers', ref, F).ton, 'faible'); // 4 balles perdues : la plus lourde perte
  assert.equal(rangNba(-1, 'turnovers', ref, F).ton, 'fort');
  assert.equal(rangNba(0, 'triple_double', ref, F).ton, 'moyen', 'statistique qui ne départage pas');
});
