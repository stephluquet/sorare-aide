// Forme affichée (methode.md 9 bis) : reconstitution des matchs d'une équipe, statistiques,
// série en mots, forme du joueur. Valeurs attendues comptées à la main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parametresDepuisMethode } from '../src/moteur/parametres.js';
import { matchsParEquipe, statsEquipe, serieEnMots, formeJoueur, resultat } from '../src/moteur/forme.js';

const F = parametresDepuisMethode(readFileSync(new URL('../methode.md', import.meta.url), 'utf8')).forme;
const match = (id, jour, pour, contre, extra = {}) => ({ matchId: id, date: `2026-10-${String(jour).padStart(2, '0')}T15:00:00Z`, statut: 'FINAL', situation: 'titulaire', score: 50, equipe: 'a', adversaire: `X${id}`, domicile: true, pour, contre, ...extra });

test('résultat : victoire, nul, défaite, score manquant', () => {
  assert.equal(resultat({ pour: 2, contre: 1 }), 'V');
  assert.equal(resultat({ pour: 1, contre: 1 }), 'N');
  assert.equal(resultat({ pour: 0, contre: 3 }), 'D');
  assert.equal(resultat({ pour: null, contre: 1 }), null);
});

test("matchs d'une équipe : dédoublonnés entre joueurs, séparés par équipe, sans match à venir", () => {
  const j1 = { historique: [match('m3', 20, 2, 0), match('m2', 13, 1, 1), match('m1', 6, 0, 1, { equipe: 'b' })] };
  const j2 = { historique: [match('m3', 20, 2, 0, { situation: 'banc', statut: 'DID_NOT_PLAY' }), match('m4', 27, 3, 1, { statut: 'PENDING' })] };
  const parEquipe = matchsParEquipe([j1, j2]);
  assert.deepEqual(parEquipe.get('a').map((m) => m.matchId), ['m3', 'm2']); // m4 pas terminé, m1 avec l'équipe b
  assert.deepEqual(parEquipe.get('b').map((m) => m.matchId), ['m1']);
});

test('statistiques : 10 derniers, % de victoires, série, buts', () => {
  // du plus récent au plus ancien : V V V N D V D D N V V (11 matchs ; la fenêtre en garde 10)
  const scores = [[2, 0], [3, 1], [1, 0], [1, 1], [0, 2], [2, 1], [0, 1], [1, 3], [2, 2], [1, 0], [4, 0]];
  const ms = scores.map(([p, c], i) => ({ ...match(`m${i}`, 28 - i, p, c) }));
  const s = statsEquipe(ms, F);
  assert.equal(s.nb, 10);
  assert.deepEqual([s.victoires, s.nuls, s.defaites], [5, 2, 3]);
  assert.equal(s.pctVictoires, 0.5);
  assert.deepEqual(s.serie, { type: 'V', longueur: 3 });
  assert.equal(s.sansDefaite, 4);
  assert.equal(s.derniers.length, 5);
  assert.equal(s.pourMoyen, 1.3); // (2+3+1+1+0+2+0+1+2+1) / 10
  assert.equal(s.contreMoyen, 1.1); // (0+1+0+1+2+1+1+3+2+0) / 10
  assert.equal(serieEnMots(s, F), '3 victoires de suite');
});

test('série en mots : défaites, sans défaite, sans victoire, rien', () => {
  const stats = (res) => statsEquipe(res.map((r, i) => match(`m${i}`, 28 - i, r === 'V' ? 1 : 0, r === 'D' ? 1 : 0)), F);
  assert.equal(serieEnMots(stats(['D', 'D', 'V']), F), '2 défaites de suite');
  assert.equal(serieEnMots(stats(['N', 'V', 'N', 'D']), F), '3 matchs sans défaite');
  assert.equal(serieEnMots(stats(['N', 'D', 'N', 'V']), F), '3 matchs sans victoire');
  assert.equal(serieEnMots(stats(['V', 'D', 'V']), F), null);
});

test('forme du joueur : 3 derniers joués contre 15 derniers, présence sur 5 matchs', () => {
  // 15 matchs joués : les 3 plus récents à 70, les 12 autres à 50 ; un banc au milieu des 5 derniers.
  const hist = [];
  for (let i = 0; i < 16; i++) hist.push(match(`m${i}`, 28 - i, 1, 0, { score: i < 3 ? 70 : 50 }));
  hist.splice(3, 0, match('banc', 25, 1, 0, { situation: 'banc', statut: 'DID_NOT_PLAY', score: 0 }));
  hist.sort((a, b) => b.date.localeCompare(a.date));
  const fj = formeJoueur({ historique: hist }, F);
  assert.equal(fj.moyRecente, 70);
  assert.equal(fj.moyReference, (3 * 70 + 12 * 50) / 15); // 54
  assert.ok(Math.abs(fj.ecart - (70 / 54 - 1)) < 1e-9);
  assert.equal(fj.tendance, 'hausse'); // +29,6 % > 15 %
  assert.equal(fj.sur, 5);
  assert.equal(fj.titulaire, 4);
});
