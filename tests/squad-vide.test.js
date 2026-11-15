// Squad sans équipe possible : le moteur dit pourquoi (diagnosticSquad), sans rien deviner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnosticSquad } from '../src/moteur/compositions.js';

const regle = (f) => JSON.parse(readFileSync(new URL(`../regles/${f}.json`, import.meta.url), 'utf8'));
const FOOT = regle('football-arcade-solo'), NBA = regle('nba-arcade-solo');
const o = (r) => ({ regle: r, jour: '2026-11-23', fuseau: 'Europe/Paris', seuil: 0.8, maintenant: 0 });
let n = 0;
const carte = (joueurId, postes, etoiles = 2) => ({ carte: { id: `c${++n}`, postes }, joueur: { id: joueurId, postes, etoiles } });
const diag = (r, adm) => diagnosticSquad([], {}, o(r), adm);

test('football : un poste sans joueur est nommé, avec le compte par poste', () => {
  const v = diag(FOOT, [carte('a', ['DF']), carte('b', ['DF']), carte('c', ['MD']), carte('d', ['FW']), carte('e', ['FW']), carte('f', ['MD'])]);
  assert.deepEqual(v.cause, { code: 'poste', postes: ['GK'] });
  assert.deepEqual(v.parPoste, [{ poste: 'GK', n: 0 }, { poste: 'DF', n: 2 }, { poste: 'MD', n: 2 }, { poste: 'FW', n: 2 }]);
  assert.equal(v.joueurs, 6);
});

test('football : plusieurs postes manquants ; deux cartes du même joueur ne comptent qu’une fois', () => {
  const v = diag(FOOT, [carte('a', ['DF']), carte('a', ['DF']), carte('c', ['MD'])]);
  assert.deepEqual(v.cause, { code: 'poste', postes: ['GK', 'FW'] });
  assert.equal(v.admissibles, 3);
  assert.equal(v.joueurs, 2);
  assert.equal(v.parPoste.find((x) => x.poste === 'DF').n, 1);
});

test('football : tous les postes ont un joueur mais il en manque un cinquième', () => {
  const v = diag(FOOT, [carte('a', ['GK']), carte('b', ['DF']), carte('c', ['MD']), carte('d', ['FW'])]);
  assert.deepEqual(v.cause, { code: 'nombre', joueurs: 4, taille: 5 });
});

test('football : cinq joueurs, mais le cinquième est un second gardien', () => {
  const v = diag(FOOT, [carte('a', ['GK']), carte('b', ['DF']), carte('c', ['MD']), carte('d', ['FW']), carte('e', ['GK'])]);
  assert.deepEqual(v.cause, { code: 'postes' });
});

test('NBA : moins de cinq joueurs, puis plafond d’étoiles dépassé même avec les moins étoilés', () => {
  assert.deepEqual(diag(NBA, [carte('a', ['G'], 3), carte('b', ['F'], 2), carte('c', ['C'], 1)]).cause, { code: 'nombre', joueurs: 3, taille: 5 });
  const v = diag(NBA, ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => carte(id, ['G'], i === 5 ? 5 : 3.5)));
  assert.deepEqual(v.cause, { code: 'etoiles', minimum: 17.5, plafond: 16 });
  assert.equal(v.etoilesMinimum, 17.5);
});

test('aucune carte retenue', () => {
  const v = diag(FOOT, []);
  assert.deepEqual(v.cause, { code: 'aucune' });
  assert.equal(v.joueurs, 0);
});
