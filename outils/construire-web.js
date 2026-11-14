// Construit la version web autonome (docs/version-independante-cloudflare.md) dans sorties/web/ :
// la page, l'interface, le moteur, la récupération (modules ES, mêmes chemins relatifs que dans le
// dépôt), methode.md et regles/. AUCUNE donnée personnelle, AUCUNE clé : chaque utilisateur saisit
// la sienne et charge ses cartes dans son navigateur.
// Usage : npm run web   (puis npm run serveur-web pour l'essayer sur ce PC)
// Cloudflare Pages : commande de construction « npm run web », dossier de sortie « sorties/web » ;
// le relais functions/graphql.js est pris à la racine du dépôt.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'sorties', 'web');
// Adresse publique du site (aperçus de lien : l'image doit avoir une adresse absolue).
const SITE = process.env.SORARHELP_URL ?? 'https://sorare-aide.pages.dev';
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const FICHIERS = [
  'app/app.js',
  ...['parametres', 'jouer', 'projection', 'simulation', 'compositions', 'forme', 'profil'].map((f) => `src/moteur/${f}.js`),
  'src/app-donnees.js',
  ...['appel', 'coeur', 'requetes', 'normaliser', 'espn', 'fusion'].map((f) => `src/recuperation/${f}.js`),
  'web/web.js',
  'web/icones/icone.svg',
  'web/icones/apple-touch-icon.png',
  'web/icones/partage.png',
  'methode.md',
  ...readdirSync(join(RACINE, 'regles')).filter((f) => f.endsWith('.json')).map((f) => `regles/${f}`),
];

rmSync(SORTIE, { recursive: true, force: true });
for (const f of FICHIERS) {
  mkdirSync(dirname(join(SORTIE, f)), { recursive: true });
  cpSync(join(RACINE, f), join(SORTIE, f));
}
// Contrôle : aucun module copié n'importe Node (disque, processus).
for (const f of FICHIERS.filter((x) => x.endsWith('.js'))) {
  if (/from 'node:|process\.env/.test(lire(f))) throw new Error(`${f} dépend de Node : il ne tournera pas dans le navigateur`);
}

const gabarit = lire('app', 'index.html')
  .replace('/*STYLE*/', () => lire('app', 'style.css'))
  .replace(/<script type="module">\s*\/\*SCRIPT\*\/\s*<\/script>/, '<script type="module" src="web/web.js"></script>');
writeFileSync(join(SORTIE, 'index.html'), `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0d1115">
<link rel="icon" type="image/svg+xml" href="web/icones/icone.svg">
<link rel="apple-touch-icon" href="web/icones/apple-touch-icon.png">
<meta name="apple-mobile-web-app-title" content="Sorar'help">
<meta name="description" content="L'équipe à jouer pour passer ton palier Arcade, et la meilleure équipe Squad du jour. Football et NBA. Lecture seule.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sorar'help">
<meta property="og:title" content="Sorar'help">
<meta property="og:description" content="L'équipe à jouer pour passer ton palier Arcade, et la meilleure équipe Squad du jour. Football et NBA. Lecture seule.">
<meta property="og:url" content="${SITE}/">
<meta property="og:image" content="${SITE}/web/icones/partage.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Logo Sorar'help : un escalier dont la dernière marche est dorée, sur fond nuit">
<meta name="twitter:card" content="summary_large_image">
</head><body>
${gabarit}
</body></html>
`);

// En-têtes de sécurité (Cloudflare Pages lit _headers ; le serveur local aussi). La politique de contenu
// limite ce que la page peut charger ou contacter : elle protège la clé gardée dans le navigateur.
export const ENTETES = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self' https://cdnjs.cloudflare.com", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data: blob: https://assets.sorare.com https://frontend-assets.sorare.com",
    "connect-src 'self' https://site.api.espn.com", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '),
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
writeFileSync(join(SORTIE, '_headers'), `/*\n${Object.entries(ENTETES).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`);
console.error(`Écrit : sorties/web/ (${FICHIERS.length + 2} fichiers, sans donnée personnelle)`);
