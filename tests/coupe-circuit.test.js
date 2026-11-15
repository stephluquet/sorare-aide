// Coupe-circuit de l'historique (src/recuperation/coeur.js) : quand Sorare ne répond plus, la boucle des
// joueurs s'arrête au lieu d'échouer un par un ; ce qui est chargé est gardé, le reste est signalé.
// Fausse API : aucune requête réelle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECHECS_DE_SUITE_MAX, recupererTout } from '../src/recuperation/coeur.js';
import { CARTES, HISTORIQUE, PALIERS, BAREME_NBA } from '../src/recuperation/requetes.js';

const P = { compositions_officielles: { horizon_heures: 6 } };
const NB = 12;
const slugJoueur = (i) => `joueur-${String(i).padStart(2, '0')}`;
const carte = (i) => ({
  slug: `carte-${i}`, rarityTyped: 'common', seasonYear: 2026, anyPositions: ['Defender'], skinEdition: { skinName: 'Standard', bonus: 1 },
  anyPlayer: { slug: slugJoueur(i), displayName: `Joueur ${i}`, anyPositions: ['Defender'], activeClub: null, activeInjuries: [], activeSuspensions: [], playerGameScores: [], nextGame: null },
});
const match = (n) => ({ score: 50, scoreStatus: 'FINAL', anyGame: { id: `Game:${n}`, date: '2026-11-01T15:00:00Z' }, anyPlayerGameStats: { onGameSheet: true, playedInGame: true, gameStarted: 1, fieldStatus: 'ON_FIELD', minsPlayed: 90 } });

// panne(i, slug) → erreur à lever pour le i-ième appel d'historique, ou null
function fausseApi(panne) {
  const journal = { historique: [], bareme: 0 };
  const appel = async (query, variables) => {
    if (query === PALIERS) return { user: { setBoard: null } };
    if (query === CARTES) return { user: { cards: { totalCount: NB, nodes: Array.from({ length: NB }, (_, i) => carte(i)), pageInfo: { hasNextPage: false, endCursor: null } } } };
    if (query === BAREME_NBA) { journal.bareme++; return { anyPlayer: null }; }
    if (query === HISTORIQUE) {
      journal.historique.push(variables.slug);
      const e = panne(journal.historique.length, variables.slug);
      if (e) throw e;
      return { anyPlayer: { allPlayerGameScores: { nodes: [match(`${variables.slug}-a`), match(`${variables.slug}-b`)] } } };
    }
    throw new Error('requête inattendue');
  };
  appel.compteur = { requetes: 0 };
  const ecrits = new Map();
  const magasin = { lire: async () => null, ecrire: async (sport, id, matchs, o) => { ecrits.set(id, { n: matchs.length, complet: o.complet }); } };
  const suivis = [];
  return { deps: { appel, magasin, P, suivi: (ev) => suivis.push(ev) }, journal, ecrits, suivis };
}
const reseau = () => Object.assign(new Error('Réseau : fetch failed'), { reseau: true });
const http = (status) => Object.assign(new Error(`API Sorare : HTTP ${status}`), { status });

test('sans panne : tous les joueurs sont chargés, rien n’est signalé', async () => {
  const f = fausseApi(() => null);
  const d = await recupererTout('essai', ['football'], f.deps);
  assert.equal(f.journal.historique.length, NB);
  assert.equal(d.meta.historiqueIncomplet, undefined);
  assert.equal([...f.ecrits.values()].filter((x) => x.complet).length, NB);
});

test('panne durable : arrêt après 3 échecs de suite, le reste est gardé et signalé', async () => {
  const f = fausseApi((i) => (i > 4 ? reseau() : null)); // 4 joueurs chargés, puis plus rien
  const d = await recupererTout('essai', ['football'], f.deps);
  assert.equal(f.journal.historique.length, 4 + ECHECS_DE_SUITE_MAX, 'pas un appel de plus après le coupe-circuit');
  assert.deepEqual(d.meta.historiqueIncomplet.football, { restants: NB - 4, total: NB, raison: 'Sorare ne répond plus', detail: 'Réseau : fetch failed' });
  // Les données sont rendues quand même : toutes les cartes, tous les joueurs, enregistrés (4 complets, 8 partiels).
  assert.equal(d.cartes.length, NB);
  assert.equal(d.joueurs.length, NB);
  assert.equal(f.ecrits.size, NB);
  assert.equal([...f.ecrits.values()].filter((x) => x.complet).length, 4);
  assert.equal(d.joueurs.find((j) => j.id === slugJoueur(0)).historique.length, 2);
  assert.ok(d.meta.anomalies.some((a) => a.includes('historique interrompu') && a.includes('4 joueurs sur 12')));
  assert.ok(f.suivis.at(-1).interrompu, 'le dernier message de progression dit l’interruption');
});

test('clé refusée (401 ou 403) : arrêt dès le premier refus', async () => {
  for (const status of [401, 403]) {
    const f = fausseApi((i) => (i > 2 ? http(status) : null));
    const d = await recupererTout('essai', ['football'], f.deps);
    assert.equal(f.journal.historique.length, 3);
    assert.equal(d.meta.historiqueIncomplet.football.raison, 'Sorare refuse la clé API');
    assert.equal(d.meta.historiqueIncomplet.football.restants, NB - 2);
  }
});

test('échecs isolés : la boucle continue, le compteur repart à zéro après un succès', async () => {
  const f = fausseApi((i) => (i % 3 === 0 ? http(500) : null)); // un échec sur trois, jamais trois de suite
  const d = await recupererTout('essai', ['football'], f.deps);
  assert.equal(f.journal.historique.length, NB);
  assert.equal(d.meta.historiqueIncomplet, undefined);
  assert.equal([...f.ecrits.values()].filter((x) => x.complet).length, NB - 4);
});

test('NBA : après l’interruption, le barème n’est pas redemandé ; l’état du sport non repris est conservé', async () => {
  const f = fausseApi((i) => (i > 1 ? http(429) : null));
  const d = await recupererTout('essai', ['nba'], f.deps);
  assert.equal(f.journal.bareme, 0);
  assert.ok(d.meta.historiqueIncomplet.nba);
  // Récupération suivante, football seul : l'alerte NBA de la fois précédente reste attachée aux données NBA reprises.
  const g = fausseApi(() => null);
  const suite = await recupererTout('essai', ['football'], g.deps, {}, d);
  assert.ok(suite.meta.historiqueIncomplet.nba);
  assert.equal(suite.meta.historiqueIncomplet.football, undefined);
});
