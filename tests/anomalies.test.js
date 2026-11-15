// Anomalies de la récupération : un joueur dont le club n'est pas dans son prochain match n'est signalé que si
// le moteur ne retrouve pas non plus son équipe dans son historique (match de sélection reconnu = pas d'alerte).
// Fausse API : aucune requête réelle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recupererTout } from '../src/recuperation/coeur.js';
import { CARTES, HISTORIQUE, PALIERS } from '../src/recuperation/requetes.js';

const eq = (slug) => ({ slug, name: slug[0].toUpperCase() + slug.slice(1) });
const match = (id, dom, ext) => ({ id: `Game:${id}`, date: '2026-11-20T19:45:00Z', statusTyped: 'scheduled', competition: { name: 'UEFA Nations League' }, homeTeam: eq(dom), awayTeam: eq(ext) });
const joue = (id, dom, ext, equipe) => ({ score: 50, scoreStatus: 'FINAL', anyGame: { ...match(id, dom, ext), date: '2026-10-10T19:45:00Z' },
  anyPlayerGameStats: { onGameSheet: true, playedInGame: true, gameStarted: 1, fieldStatus: 'ON_FIELD', minsPlayed: 90, anyTeam: { slug: equipe } } });
const carte = (slug, nextGame, playerGameScores = []) => ({
  slug: `carte-${slug}`, rarityTyped: 'common', seasonYear: 2026, anyPositions: ['Defender'], skinEdition: { skinName: 'Standard', bonus: 1 },
  anyPlayer: { slug, displayName: slug, anyPositions: ['Defender'], activeClub: eq('hull'), activeInjuries: [], activeSuspensions: [], playerGameScores, nextGame },
});

test('club absent du prochain match : seul le joueur sans passé avec une des deux équipes est signalé', async () => {
  const cartes = [
    carte('en-club', match('1', 'hull', 'leeds')),                                              // match de son club
    carte('international', match('2', 'greece', 'serbia'), [joue('9', 'greece', 'finland', 'greece')]), // sélection déjà vue
    carte('nouveau', match('3', 'spain', 'england'), [joue('8', 'hull', 'leeds', 'hull')]),      // sélection jamais vue
    carte('sans-match', null),
  ];
  const appel = async (query) => {
    if (query === PALIERS) return { user: { setBoard: null } };
    if (query === CARTES) return { user: { cards: { totalCount: cartes.length, nodes: cartes, pageInfo: { hasNextPage: false, endCursor: null } } } };
    if (query === HISTORIQUE) return { anyPlayer: { allPlayerGameScores: { nodes: [] } } };
    throw new Error('requête inattendue');
  };
  appel.compteur = { requetes: 0 };
  const deps = { appel, magasin: { lire: async () => null, ecrire: async () => {} }, P: { compositions_officielles: { horizon_heures: 0 } } };
  const d = await recupererTout('essai', ['football'], deps);
  const a = d.meta.anomalies;
  assert.equal(a.filter((x) => x.includes('introuvable dans son prochain match')).length, 1);
  assert.ok(a.some((x) => x.includes('introuvable dans son prochain match') && x.includes('nouveau') && x.includes('Spain – England')));
  assert.ok(!a.some((x) => x.includes('international')), 'la sélection reconnue par l’historique n’est pas une anomalie');
  assert.ok(a.some((x) => x.includes('pas de prochain match connu') && x.includes('sans-match')), 'les autres anomalies sont gardées');
});
