// Chargement côté Node (disque) des entrées du moteur : données, méthode, règles.
// Le moteur lui-même (jouer.js, projection.js) reste pur ; ce fichier n'est pas utilisé par le navigateur.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parametresDepuisMethode } from './parametres.js';
import { projeterCarte } from './projection.js';
import { reglesDuMoteur } from '../app-donnees.js';

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lireJson = (...p) => JSON.parse(readFileSync(join(RACINE, ...p), 'utf8'));

export function chargerEntrees(fichierDonnees = join(RACINE, 'data', 'dernier.json')) {
  return {
    donnees: JSON.parse(readFileSync(fichierDonnees, 'utf8')),
    P: parametresDepuisMethode(readFileSync(join(RACINE, 'methode.md'), 'utf8')),
    regles: reglesDuMoteur(lireJson('regles', 'football-arcade-solo.json'), lireJson('regles', 'nba-arcade-solo.json')),
  };
}

// Projette toutes les cartes des données.
export function projeterTout({ donnees, P, regles }) {
  const joueurs = new Map(donnees.joueurs.map((j) => [j.id, j]));
  const matchs = new Map(donnees.matchs.map((m) => [m.id, m]));
  return donnees.cartes.map((c) => {
    const j = joueurs.get(c.joueurId);
    return { carte: c, joueur: j, match: matchs.get(j?.prochainMatchId) ?? null,
      projection: projeterCarte(c, j, matchs.get(j?.prochainMatchId) ?? null, P, regles[c.sport]) };
  });
}
