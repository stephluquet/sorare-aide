// Rejoue les situations figées de tests/cas/ (méthode v2). Chaque cas embarque ses
// paramètres et ses règles pour rester valable si methode.md évolue (mettre alors
// les cas à jour). Valeurs attendues calculées à part, pas avec le moteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projeterCarte } from '../src/moteur/projection.js';
import { parametresDepuisMethode } from '../src/moteur/parametres.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER = join(ICI, 'cas');
const proche = (obtenu, attendu, champ, tol = 0.051) => {
  if (attendu == null) return assert.equal(obtenu ?? null, null, champ);
  assert.ok(obtenu != null && Math.abs(obtenu - attendu) < tol, `${champ} : obtenu ${obtenu}, attendu ${attendu}`);
};

for (const f of readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).sort()) {
  const cas = JSON.parse(readFileSync(join(DOSSIER, f), 'utf8'));
  test(`${cas.id} — ${cas.description}`, () => {
    const r = projeterCarte(cas.carte, cas.joueur, cas.match, cas.parametres, { competitionsAutorisees: cas.competitions_autorisees });
    const a = cas.attendu;
    assert.equal(r.statut, a.statut, `statut (${JSON.stringify(r.raisons)})`);
    assert.equal(r.eligibleArcade, a.eligibleArcade, 'eligibleArcade');
    assert.equal(r.proposable, a.proposable, 'proposable');
    proche(r.p, a.p, 'p', 0.0006);
    proche(r.score.mu, a.mu, 'mu');
    proche(r.siJoue, a.siJoue, 'siJoue');
    proche(r.esperance, a.esperance, 'esperance');
    if ('q' in a) proche(r.score.q, a.q, 'q', 0.0006);
    if ('sigma' in a) proche(r.score.sigma, a.sigma, 'sigma');
    if ('minutes' in a) proche(r.score.minutes, a.minutes, 'minutes');
    if ('taux' in a) proche(r.score.taux, a.taux, 'taux', 0.0006);
    assert.equal(r.raisons.length, a.nb_raisons, `raisons : ${JSON.stringify(r.raisons)}`);
    for (const morceau of a.raisons_contiennent) assert.ok(r.raisons.some((x) => x.includes(morceau)), `raison « ${morceau} » absente : ${JSON.stringify(r.raisons)}`);
  });
}

test('methode.md v2 : le bloc de paramètres se lit', () => {
  const P = parametresDepuisMethode(readFileSync(join(ICI, '..', 'methode.md'), 'utf8'));
  assert.equal(P.version, 2);
  assert.ok(P.seuil_jouer > 0 && P.seuil_jouer < 1);
  for (const s of ['football', 'nba']) assert.ok(P[s].plancher < P[s].plafond);
});
