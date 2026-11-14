// Relais en lecture seule (functions/graphql.js) : origine, clé, taille, écritures refusées, transmission.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relayer, SORARE } from '../functions/graphql.js';
import { estEcriture } from '../src/recuperation/appel.js';

const ORIGINE = 'https://sorare-aide.pages.dev';
const demande = (corps, entetes = {}) => new Request(`${ORIGINE}/graphql`, {
  method: 'POST', body: typeof corps === 'string' ? corps : JSON.stringify(corps),
  headers: { Origin: ORIGINE, 'X-Sorare-Cle': 'cle', 'content-type': 'application/json', ...entetes },
});
const faux = () => { const vus = []; return { vus, fetch: async (url, init) => { vus.push({ url, init }); return new Response('{"data":{"ok":1}}', { status: 200 }); } }; };

test('lecture transmise à Sorare avec la clé en APIKEY', async () => {
  const f = faux();
  const r = await relayer(demande({ query: '{ user(slug: "x") { slug } }' }), f);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { data: { ok: 1 } });
  assert.equal(f.vus[0].url, SORARE);
  assert.equal(f.vus[0].init.headers.APIKEY, 'cle');
});

test('refus : autre origine, clé absente, mutation, abonnement, JSON invalide, trop long', async () => {
  const f = faux();
  assert.equal((await relayer(demande({ query: '{ a }' }, { Origin: 'https://ailleurs.example' }), f)).status, 403);
  assert.equal((await relayer(demande({ query: '{ a }' }, { 'X-Sorare-Cle': '' }), f)).status, 401);
  assert.equal((await relayer(demande({ query: 'mutation { bid }' }), f)).status, 403);
  assert.equal((await relayer(demande({ query: 'query A { a } mutation B { bid }' }), f)).status, 403);
  assert.equal((await relayer(demande({ query: 'subscription { a }' }), f)).status, 403);
  assert.equal((await relayer(demande('pas du json'), f)).status, 400);
  assert.equal((await relayer(demande({ query: `{ a } #${'x'.repeat(30000)}` }), f)).status, 413);
  assert.equal(f.vus.length, 0);
});

test('appel.js refuse aussi les écritures côté page', () => {
  assert.ok(estEcriture('mutation { x }'));
  assert.ok(!estEcriture('query { user { cards { nodes { slug } } } }'));
});
