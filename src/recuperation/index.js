// Récupération complète (étape 1 du plan v0.1) : cartes, joueurs, historique
// match par match (incrémental), prochains matchs, paliers Arcade.
//
// Usage : npm run recuperer -- [--sport football|nba|tous] [--slug yapapir] [--sans-historique]
//   écrit data/<AAAA-MM-JJTHHMM>/{cartes,joueurs,matchs,paliers,meta}.json
//   et data/dernier.json (tout en un, lu par l'interface)
//   met à jour data/historique/<sport>/<joueurId>.json
// Lecture seule, au plus 150 requêtes par minute. Progression sur la sortie d'erreur.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelGraphql, compteur, relancerViaProxySiBesoin } from './api.js';
import { lireBlessuresNba } from './espn.js';
import { recupererTout } from './coeur.js';
import { cheminArchive, ecrireArchive, lireArchive } from './historique.js';
import { parametresDepuisMethode } from '../moteur/parametres.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function horodatageParis(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}${p.minute}`;
}

// Progression sur la sortie d'erreur : chaque étape, et l'historique tous les 25 joueurs.
function suivi({ sport, etape, fait, total, texte }) {
  if (etape === 'historique' && fait % 25 !== 0 && fait !== total) return;
  if (etape === 'compositions' && fait !== total) return;
  process.stderr.write(`[${sport}] ${texte} (requêtes : ${compteur.requetes})\n`);
}

// Archive sur disque : data/historique/<sport>/<joueurId>.json
const magasinDisque = {
  lire: async (sport, id) => lireArchive(cheminArchive(RACINE, sport, id)),
  ecrire: async (sport, id, matchs, options) => ecrireArchive(cheminArchive(RACINE, sport, id), id, matchs, options),
};

async function principal() {
  await relancerViaProxySiBesoin();
  const args = process.argv.slice(2);
  const val = (nom, defaut) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : defaut; };
  const slug = val('--slug', 'yapapir');
  const choix = val('--sport', 'tous');
  const sports = choix === 'tous' ? ['football', 'nba'] : [choix];
  if (!sports.every((s) => ['football', 'nba'].includes(s))) throw new Error(`Sport inconnu : ${choix}`);

  const precedentFichier = join(RACINE, 'data', 'dernier.json');
  const precedent = existsSync(precedentFichier) ? JSON.parse(readFileSync(precedentFichier, 'utf8')) : null;
  const appel = Object.assign(appelGraphql, { compteur });
  const deps = {
    appel, magasin: magasinDisque, suivi, lireEspn: lireBlessuresNba,
    P: parametresDepuisMethode(readFileSync(join(RACINE, 'methode.md'), 'utf8')),
    tableBonus: JSON.parse(readFileSync(join(RACINE, 'regles', 'bonus-collections.json'), 'utf8')).bonus_pct,
  };
  const options = { sansHistorique: args.includes('--sans-historique'), refaireHistorique: args.includes('--refaire-historique') };
  const { meta, ...tout } = await recupererTout(slug, sports, deps, options, precedent);
  const debut = new Date(meta.recupereA);
  const anomalies = meta.anomalies;

  const dossier = join(RACINE, 'data', horodatageParis(debut));
  mkdirSync(dossier, { recursive: true });
  for (const [k, v] of Object.entries({ ...tout, meta })) writeFileSync(join(dossier, `${k}.json`), JSON.stringify(v) + '\n');
  writeFileSync(join(RACINE, 'data', 'dernier.json'), JSON.stringify({ meta, ...tout }) + '\n');
  process.stderr.write(`Terminé : ${meta.nb.cartes} cartes, ${meta.nb.joueurs} joueurs, ${meta.nb.matchs} matchs, ` +
    `${meta.nbRequetes} requêtes en ${meta.dureeS} s, ${anomalies.length} anomalies → ${dossier}, data/dernier.json\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
