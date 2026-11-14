// Profil statistique d'un joueur NBA en POINTS SORARE par match (methode.md, section 10).
// AFFICHAGE SEULEMENT : ne change ni les chances ni la simulation.
// Le barème vient de l'API (baremes.nba.poids, lu à chaque récupération), jamais recopié ici.
// JavaScript pur, sans accès réseau ni disque.

// Statistiques affichées, dans l'ordre ; les noms sont ceux du barème de l'API.
export const STATS_PROFIL = ['points', 'assists', 'rebounds', 'blocks', 'steals', 'three_points_made', 'double_double', 'triple_double', 'turnovers'];

const jouesAvecStats = (joueur) => (joueur.historique ?? [])
  .filter((m) => m.stats && m.minutes > 0 && m.statut !== 'DID_NOT_PLAY');

/**
 * Moyennes par match sur ses derniers matchs joués, et points Sorare qu'elles rapportent.
 * @param poids barème { stat: points } (API)
 * @param F paramètres `profil` de methode.md (fenetre_matchs, min_matchs)
 * @returns null si trop peu de matchs ; sinon { n, minutes, total, stats: { stat: { moyenne, points } } }
 */
export function profilNba(joueur, poids, F) {
  const ms = jouesAvecStats(joueur).slice(0, F.fenetre_matchs);
  if (ms.length < F.min_matchs || !poids) return null;
  const stats = {};
  let total = 0;
  for (const s of STATS_PROFIL) {
    const moyenne = ms.reduce((a, m) => a + (m.stats[s] ?? 0), 0) / ms.length;
    const points = moyenne * (poids[s] ?? 0);
    stats[s] = { moyenne, points };
    total += points;
  }
  return { n: ms.length, minutes: ms.reduce((a, m) => a + m.minutes, 0) / ms.length, total, stats };
}

/**
 * Groupe de comparaison : les joueurs qui jouent au moins F.minutes_reference minutes par match
 * (ceux qu'on alignerait vraiment), tous postes confondus (les postes sont libres en NBA).
 * @returns { n, parStat: { stat: [points triés croissants] }, mediane: { stat: points } }
 */
export function referenceNba(joueurs, poids, F) {
  const profils = joueurs.map((j) => profilNba(j, poids, F)).filter((p) => p && p.minutes >= F.minutes_reference);
  const parStat = {}, mediane = {};
  for (const s of STATS_PROFIL) {
    parStat[s] = profils.map((p) => p.stats[s].points).sort((a, b) => a - b);
    mediane[s] = parStat[s].length ? parStat[s][Math.floor(parStat[s].length / 2)] : 0;
  }
  return { n: profils.length, parStat, mediane };
}

/**
 * Rang d'un apport en points parmi le groupe (1 = le plus gros apport ; pour les balles perdues, la perte la
 * plus faible) et couleur : 'fort' dans le premier quart, 'faible' dans le dernier, sinon 'moyen'.
 * Une statistique qui ne départage pas (triple-double presque toujours 0) reste 'moyen'.
 */
export function rangNba(points, s, ref, F) {
  const xs = ref.parStat[s] ?? [];
  if (!xs.length) return { rang: null, sur: 0, ton: 'moyen' };
  const meilleursQue = xs.filter((x) => x > points + 1e-9).length;
  const rang = meilleursQue + 1;
  const part = (rang - 1) / xs.length;
  const etale = xs[xs.length - 1] - xs[0] > F.ecart_min_points;
  const ton = !etale ? 'moyen' : part < F.quart ? 'fort' : part >= 1 - F.quart ? 'faible' : 'moyen';
  return { rang, sur: xs.length, ton };
}
