// Fusion incrémentale de l'historique match par match : fonctions pures, sans disque,
// utilisées par Node (historique.js) et par le navigateur (version web). Règles : voir historique.js.

// Format de l'archive : 2 = statistiques détaillées des matchs NBA (2026-11-14). Une archive NBA plus
// ancienne est rechargée une fois en entier pour les obtenir.
export const FORMAT_ARCHIVE = 2;

const parDateDecroissante = (a, b) => (b.date ?? '').localeCompare(a.date ?? '');

// Fusion pure : renvoie la nouvelle liste (du plus récent au plus ancien).
export function fusionner(archive, recus) {
  const parId = new Map();
  for (const m of archive) if (m.matchId) parId.set(m.matchId, m);
  for (const m of recus) if (m.matchId) parId.set(m.matchId, m); // les reçus font foi
  return [...parId.values()].sort(parDateDecroissante);
}

// Vrai si la liste reçue ne se raccorde pas à l'archive.
export function trou(archive, recus) {
  if (!archive.length || !recus.length) return false;
  const ids = new Set(archive.map((m) => m.matchId));
  if (recus.some((m) => ids.has(m.matchId))) return false;
  const plusAncienRecu = recus.map((m) => m.date).sort()[0];
  const plusRecentArchive = archive.map((m) => m.date).sort().at(-1);
  return plusAncienRecu > plusRecentArchive;
}

// Faut-il récupérer les 40 matchs de ce joueur ? Oui s'il n'a jamais eu
// d'historique complet (archive absente ou créée avec --sans-historique) ou si
// les matchs reçus ne se raccordent pas à l'archive.
export function besoinHistoriqueComplet(archive, recus) {
  return !archive?.dernierHistoriqueComplet || trou(archive.matchs, recus);
}

// Archive à recharger en entier pour passer au format courant (NBA seulement).
export function archivePerimee(archive, sport) {
  return sport === 'nba' && Boolean(archive) && (archive.format ?? 1) < FORMAT_ARCHIVE;
}
