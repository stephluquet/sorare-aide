// Historique incrémental match par match (docs/plan-appli.md, section 0 ter, point 2).
// Archive par joueur : data/historique/<sport>/<joueurId>.json
//
// Règles :
// - premier passage : 40 matchs par joueur (une requête par joueur) ;
// - ensuite : les 15 derniers matchs fournis par la liste des cartes sont fusionnés,
//   sans requête supplémentaire ;
// - fusion par identifiant de match, jamais par date ;
// - les matchs reçus font foi (un score en vérification peut changer) ;
// - trou détecté (aucun match reçu ne recoupe l'archive et le plus ancien reçu est
//   postérieur au plus récent archivé) : 40 matchs refaits pour ce joueur ;
// - joueur sorti de la collection : archive conservée ; rien n'est jamais supprimé.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export { fusionner, trou, besoinHistoriqueComplet } from './fusion.js';

export function cheminArchive(racine, sport, joueurId) {
  return join(racine, 'data', 'historique', sport, `${joueurId}.json`);
}

export function lireArchive(chemin) {
  if (!existsSync(chemin)) return null;
  return JSON.parse(readFileSync(chemin, 'utf8'));
}

export function ecrireArchive(chemin, joueurId, matchs, { complet = false } = {}) {
  mkdirSync(dirname(chemin), { recursive: true });
  const ancien = lireArchive(chemin);
  // Rien de nouveau : on ne réécrit pas le fichier (évite de modifier 874 fichiers à chaque actualisation).
  if (ancien && !complet && JSON.stringify(ancien.matchs) === JSON.stringify(matchs)) return false;
  const contenu = {
    joueurId,
    misAJour: new Date().toISOString(),
    dernierHistoriqueComplet: complet ? new Date().toISOString() : ancien?.dernierHistoriqueComplet ?? null,
    matchs,
  };
  // Un match par ligne : fichier compact et diff lisibles.
  const tete = JSON.stringify({ ...contenu, matchs: undefined }, null, 1).replace(/\n}$/, '');
  writeFileSync(chemin, `${tete},\n "matchs": [\n${matchs.map((m) => '  ' + JSON.stringify(m)).join(',\n')}\n ]\n}\n`);
  return true;
}
