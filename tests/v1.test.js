// Rejoue les situations figées de tests/cas-v1/ (méthode v1, ancienne chaîne) : chaque cas embarque ses propres
// paramètres pour rester valable si methode.md évolue (mettre alors les cas à jour).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projeterCarte, lireParametres, lireTableBonus } from '../src/projection.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER = join(ICI, 'cas-v1');
const proche = (obtenu, attendu, champ) => {
  if (attendu == null) return assert.equal(obtenu, null, champ);
  assert.ok(Math.abs(obtenu - attendu) < 0.051, `${champ} : obtenu ${obtenu}, attendu ${attendu}`);
};

for (const f of readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).sort()) {
  const cas = JSON.parse(readFileSync(join(DOSSIER, f), 'utf8'));
  test(`${cas.id} — ${cas.description}`, () => {
    const table = Object.fromEntries(Object.entries(cas.bonus_collections_pct).map(([k, v]) => [k, 1 + v / 100]));
    const r = projeterCarte(cas.carte, cas.parametres, table);
    for (const champ of ['m', 'p', 'si_joue', 'projection', 'sigma']) proche(r[champ], cas.attendu[champ], champ);
    assert.equal(r.alertes.length, cas.attendu.nb_alertes, `alertes : ${JSON.stringify(r.alertes)}`);
    for (const morceau of cas.attendu.alertes_contiennent) {
      assert.ok(r.alertes.some((a) => a.includes(morceau)), `alerte « ${morceau} » absente : ${JSON.stringify(r.alertes)}`);
    }
  });
}

test('les paramètres de docs/methode-v1.md se lisent et ont la forme attendue', () => {
  const P = lireParametres();
  for (const k of ['poids_l5', 'poids_jeu_recent']) assert.ok(P[k] >= 0 && P[k] <= 1, k);
  assert.ok(Array.isArray(P.statuts_joues) && Array.isArray(P.statuts_comptes));
});

test('la table de repli des bonus (regles/) se lit', () => {
  const t = lireTableBonus();
  assert.equal(t.Shiny, 1.05);
  assert.equal(t.Eclipse, 1.2);
});
