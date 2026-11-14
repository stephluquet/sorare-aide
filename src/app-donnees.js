// Données au format de l'interface (app/), à partir d'une récupération complète
// (data/dernier.json côté Node, IndexedDB côté navigateur). Fonction pure, commune à
// outils/construire-app.js et à la version web (web/web.js).
import { matchsParEquipe } from './moteur/forme.js';

export const FORMAT_APP = 1;
const STATUT = { FINAL: 'F', REVIEWING: 'R', DID_NOT_PLAY: 'D' };
const SITUATION = { titulaire: 't', entre: 'e', joue: 'j', banc: 'b', absent: 'a', inconnu: 'i' };

/**
 * @param donnees  { meta, cartes, joueurs, matchs, paliers }
 * @param P        paramètres de methode.md
 * @param regles   { football, nba } (voir src/moteur/node.js)
 * @param journees regles/squad.json → journee_de_jeu
 * @param visuels  vrai : garde l'adresse de l'image Sorare de chaque carte (pages hors artifact)
 */
export function preparerDonneesApp({ donnees, P, regles, journees, visuels = false }) {
  const historiqueCompact = (h) => h
    .filter((m) => P.statuts_comptes.includes(m.statut))
    .slice(0, P.fenetre_matchs)
    .map((m) => [m.date, STATUT[m.statut], SITUATION[m.situation] ?? 'i', m.score == null ? null : Math.round(m.score * 10) / 10, m.minutes]);

  // Forme des équipes (affichage, methode.md 9 bis) : derniers matchs terminés des clubs actuels
  // des joueurs et de leurs prochains adversaires, au format [date, adversaire, domicile 1/0, pour, contre].
  const utiles = new Set();
  for (const j of donnees.joueurs) if (j.club?.slug) utiles.add(j.club.slug);
  for (const m of donnees.matchs) for (const e of [m.domicile, m.exterieur]) if (e?.slug) utiles.add(e.slug);
  const equipes = Object.fromEntries([...matchsParEquipe(donnees.joueurs)].filter(([k]) => utiles.has(k)).map(([k, ms]) =>
    [k, ms.slice(0, P.forme.fenetre_victoires).map((m) => [m.date, m.adversaire, m.domicile ? 1 : 0, m.pour, m.contre])]));

  return {
    format: FORMAT_APP,
    meta: { recupereA: donnees.meta.recupereA, slug: donnees.meta.slug, construitA: new Date().toISOString() },
    P,
    regles,
    paliers: donnees.paliers,
    journees,
    cartes: donnees.cartes.map(({ id, sport, joueurId, rarete, collection, bonusPct, visuelUrl }) =>
      ({ id, sport, joueurId, rarete, collection, bonusPct, ...(visuels ? { visuelUrl: visuelUrl ?? null } : {}) })),
    joueurs: donnees.joueurs.map((j) => ({
      id: j.id, sport: j.sport, nom: j.nom, postes: j.postes, club: j.club, tier: j.tier, etoiles: j.etoiles,
      statutSorare: j.statutSorare, blessures: j.blessures, suspensions: j.suspensions, prochainMatchId: j.prochainMatchId,
      ...(j.espn ? { espn: j.espn } : {}),
      h: historiqueCompact(j.historique ?? []),
    })),
    matchs: donnees.matchs,
    equipes,
    vignettes: {},
  };
}

// Règles complètes de chaque mode, plus la liste des compétitions sous le nom attendu par le moteur.
export function reglesDuMoteur(football, nba) {
  return {
    football: { ...football, competitionsAutorisees: football.competitions_autorisees.noms_api },
    nba: { ...nba, competitionsAutorisees: nba.competitions_autorisees.liste },
  };
}
