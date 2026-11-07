// Assemble l'interface (app/) et le moteur (src/moteur/) en pages autonomes.
// Usage : npm run app
//   → sorties/app/sorare-aide.html   page à publier en artifact (données intégrées, sans <html>/<head>/<body>)
//   → sorties/app/index.html         même page hors artifact (lit donnees-app.json à côté)
//   → sorties/app/donnees-app.json   données au format de l'interface
// Les données viennent de data/dernier.json (npm run recuperer), la méthode de methode.md,
// les règles de regles/. Les vignettes (WebP 96 px) sont intégrées car un artifact ne peut
// charger aucune image externe.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { chargerEntrees, projeterTout, RACINE } from '../src/moteur/node.js';

const NB_VIGNETTES = { football: 60, nba: 30 };
const FORMAT = 1;
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const entrees = chargerEntrees();
const { donnees, P, regles } = entrees;

// ---------- Données au format de l'interface ----------
const STATUT = { FINAL: 'F', REVIEWING: 'R', DID_NOT_PLAY: 'D' };
const SITUATION = { titulaire: 't', entre: 'e', joue: 'j', banc: 'b', absent: 'a', inconnu: 'i' };
const historiqueCompact = (h) => h
  .filter((m) => P.statuts_comptes.includes(m.statut))
  .slice(0, P.fenetre_matchs)
  .map((m) => [m.date, STATUT[m.statut], SITUATION[m.situation] ?? 'i', m.score == null ? null : Math.round(m.score * 10) / 10, m.minutes]);

const app = {
  format: FORMAT,
  meta: { recupereA: donnees.meta.recupereA, slug: donnees.meta.slug, construitA: new Date().toISOString() },
  P,
  regles,
  paliers: donnees.paliers,
  cartes: donnees.cartes.map(({ id, sport, joueurId, collection, bonusPct }) => ({ id, sport, joueurId, collection, bonusPct })),
  joueurs: donnees.joueurs.map((j) => ({
    id: j.id, sport: j.sport, nom: j.nom, postes: j.postes, club: j.club, tier: j.tier, etoiles: j.etoiles,
    statutSorare: j.statutSorare, blessures: j.blessures, suspensions: j.suspensions, prochainMatchId: j.prochainMatchId,
    h: historiqueCompact(j.historique ?? []),
  })),
  matchs: donnees.matchs,
  vignettes: {},
};

// ---------- Vignettes des meilleures cartes proposables ----------
const tout = projeterTout(entrees);
const dossierVignettes = join(RACINE, 'data', 'vignettes');
const choisies = [];
for (const sp of ['football', 'nba']) {
  choisies.push(...tout.filter((x) => x.carte.sport === sp && x.carte.visuelUrl && x.projection.proposable)
    .sort((a, b) => b.projection.esperance - a.projection.esperance).slice(0, NB_VIGNETTES[sp]).map((x) => x.carte));
}
mkdirSync(dossierVignettes, { recursive: true });
writeFileSync(join(dossierVignettes, 'a-faire.json'), JSON.stringify(choisies.map((c) => ({ id: c.id, url: c.visuelUrl }))));
execFileSync('python3', ['-I', join(RACINE, 'outils', 'vignettes.py'), dossierVignettes], { stdio: 'inherit' });
for (const c of choisies) {
  const f = join(dossierVignettes, `${c.id}.webp`);
  if (existsSync(f)) app.vignettes[c.id] = `data:image/webp;base64,${readFileSync(f).toString('base64')}`;
}

// ---------- Assemblage du script : moteur + interface en un seul module ----------
// Les modules n'ont que des imports nommés sur une ligne et des noms de premier niveau distincts.
const sansModules = (code) => code.replace(/^import .*? from '.*?';\n/gm, '').replace(/^export (?=(async )?function|const|let)/gm, '');
const script = [
  ['src/moteur/jouer.js', lire('src', 'moteur', 'jouer.js')],
  ['src/moteur/projection.js', lire('src', 'moteur', 'projection.js')],
  ['app/app.js', lire('app', 'app.js')],
].map(([nom, code]) => `// ===== ${nom} =====\n${sansModules(code)}`).join('\n');

const gabarit = lire('app', 'index.html').replace('/*STYLE*/', () => lire('app', 'style.css')).replace('/*SCRIPT*/', () => script);
const json = JSON.stringify(app);
const dossier = join(RACINE, 'sorties', 'app');
mkdirSync(dossier, { recursive: true });
writeFileSync(join(dossier, 'donnees-app.json'), json);
writeFileSync(join(dossier, 'sorare-aide.html'), gabarit.replace('/*DONNEES*/null', () => json.replace(/</g, '\\u003c')));
writeFileSync(join(dossier, 'index.html'), '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head><body>\n' + gabarit + '\n</body></html>\n');

const ko = (f) => (readFileSync(join(dossier, f)).length / 1024).toFixed(0);
console.error(`Écrit : sorties/app/sorare-aide.html (${ko('sorare-aide.html')} Ko), index.html, donnees-app.json (${ko('donnees-app.json')} Ko) ; ` +
  `${app.cartes.length} cartes, ${app.joueurs.length} joueurs, ${Object.keys(app.vignettes).length} vignettes`);
