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
import { matchsParEquipe } from '../src/moteur/forme.js';

const NB_VIGNETTES = { football: 120, nba: 60 };
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
  journees: JSON.parse(lire('regles', 'squad.json')).journee_de_jeu,
  cartes: donnees.cartes.map(({ id, sport, joueurId, rarete, collection, bonusPct }) => ({ id, sport, joueurId, rarete, collection, bonusPct })),
  joueurs: donnees.joueurs.map((j) => ({
    id: j.id, sport: j.sport, nom: j.nom, postes: j.postes, club: j.club, tier: j.tier, etoiles: j.etoiles,
    statutSorare: j.statutSorare, blessures: j.blessures, suspensions: j.suspensions, prochainMatchId: j.prochainMatchId,
    ...(j.espn ? { espn: j.espn } : {}),
    h: historiqueCompact(j.historique ?? []),
  })),
  matchs: donnees.matchs,
  equipes: equipesCompactes(),
  vignettes: {},
};

// Forme des équipes (affichage, methode.md 9 bis) : derniers matchs terminés des clubs actuels
// des joueurs et de leurs prochains adversaires, au format [date, adversaire, domicile 1/0, pour, contre].
function equipesCompactes() {
  const utiles = new Set();
  for (const j of donnees.joueurs) if (j.club?.slug) utiles.add(j.club.slug);
  for (const m of donnees.matchs) for (const e of [m.domicile, m.exterieur]) if (e?.slug) utiles.add(e.slug);
  const parEquipe = matchsParEquipe(donnees.joueurs);
  return Object.fromEntries([...parEquipe].filter(([k]) => utiles.has(k)).map(([k, ms]) =>
    [k, ms.slice(0, P.forme.fenetre_victoires).map((m) => [m.date, m.adversaire, m.domicile ? 1 : 0, m.pour, m.contre])]));
}

// ---------- Vignettes des cartes susceptibles d'être proposées ----------
// Cartes ni exclues ni douteuses, éligibles Arcade, au-dessus du seuil de la proposition
// ambitieuse : les meilleures espérances par sport.
const tout = projeterTout(entrees);
const dossierVignettes = join(RACINE, 'data', 'vignettes');
const choisies = [];
for (const sp of ['football', 'nba']) {
  choisies.push(...tout.filter((x) => x.carte.sport === sp && x.carte.visuelUrl && x.projection.statut === 'ok' && x.projection.eligibleArcade &&
      x.projection.esperance != null && x.projection.p >= P.simulation.ambitieuse_seuil_jouer)
    .sort((a, b) => b.projection.esperance - a.projection.esperance).slice(0, NB_VIGNETTES[sp]).map((x) => x.carte));
}
mkdirSync(dossierVignettes, { recursive: true });
// Vignettes de TOUTES les cartes (seules les nouvelles sont téléchargées) : les choisies sont intégrées
// à la page, les autres rangées en lots chargés à la demande (voir plus bas).
writeFileSync(join(dossierVignettes, 'a-faire.json'), JSON.stringify(donnees.cartes.filter((c) => c.visuelUrl).map((c) => ({ id: c.id, url: c.visuelUrl }))));
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
  ['src/moteur/simulation.js', lire('src', 'moteur', 'simulation.js')],
  ['src/moteur/compositions.js', lire('src', 'moteur', 'compositions.js')],
  ['src/moteur/forme.js', lire('src', 'moteur', 'forme.js')],
  ['app/app.js', lire('app', 'app.js')],
].map(([nom, code]) => `// ===== ${nom} =====\n${sansModules(code)}`).join('\n');

const gabarit = lire('app', 'index.html').replace('/*STYLE*/', () => lire('app', 'style.css')).replace('/*SCRIPT*/', () => script);
const dossier = join(RACINE, 'sorties', 'app');
mkdirSync(dossier, { recursive: true });

// ---------- Lots de vignettes chargés à la volée ----------
// Un artifact ne charge aucune image externe : les vignettes des cartes non intégrées sont publiées
// à côté de la page (fichiers vignettes/lot-NN.json, `files` de l'outil Artifact) et lues par fetch
// quand la carte apparaît à l'écran. Lot n = cartes d'indice [n × taille, (n + 1) × taille[ dans app.cartes ;
// chaque lot est un tableau aligné sur ces indices (null : vignette intégrée ou absente).
const TAILLE_LOT = 100;
const dossierLots = join(dossier, 'vignettes');
mkdirSync(dossierLots, { recursive: true });
const nbLots = Math.ceil(app.cartes.length / TAILLE_LOT);
for (let n = 0; n < nbLots; n++) {
  const lot = app.cartes.slice(n * TAILLE_LOT, (n + 1) * TAILLE_LOT).map((c) => {
    const f = join(dossierVignettes, `${c.id}.webp`);
    return app.vignettes[c.id] || !existsSync(f) ? null : `data:image/webp;base64,${readFileSync(f).toString('base64')}`;
  });
  writeFileSync(join(dossierLots, `lot-${String(n).padStart(2, '0')}.json`), JSON.stringify(lot));
}
app.lotsVignettes = { taille: TAILLE_LOT, nombre: nbLots, version: app.meta.construitA };
// (les lots sont écrits avant la page : app.lotsVignettes doit être dans les données)
const json = JSON.stringify(app);
writeFileSync(join(dossier, 'donnees-app.json'), json);
writeFileSync(join(dossier, 'sorare-aide.html'), gabarit.replace('/*DONNEES*/null', () => json.replace(/</g, '\\u003c')));
writeFileSync(join(dossier, 'index.html'), '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head><body>\n' + gabarit + '\n</body></html>\n');

const ko = (f) => (readFileSync(join(dossier, f)).length / 1024).toFixed(0);
console.error(`Écrit : sorties/app/sorare-aide.html (${ko('sorare-aide.html')} Ko), index.html, donnees-app.json (${ko('donnees-app.json')} Ko) ; ` +
  `${app.cartes.length} cartes, ${app.joueurs.length} joueurs, ${Object.keys(app.vignettes).length} vignettes`);
