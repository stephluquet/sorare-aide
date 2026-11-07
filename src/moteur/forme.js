// Forme des équipes et des joueurs (methode.md, section 9 bis). AFFICHAGE SEULEMENT :
// le rétro-test du 2026-11-07 n'a trouvé aucun gain de prédiction à la forme de l'équipe
// une fois la cote du match connue ; ces chiffres ne servent pas au calcul.
// JavaScript pur, sans accès réseau ni disque.

const JOUE = new Set(['titulaire', 'entre', 'joue']);
const TERMINES = new Set(['FINAL', 'REVIEWING', 'DID_NOT_PLAY']);
const moyenne = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Résultat d'un match du point de vue de l'équipe : V, N ou D (null si le score manque).
export function resultat(m) {
  if (m.pour == null || m.contre == null) return null;
  return m.pour > m.contre ? 'V' : m.pour < m.contre ? 'D' : 'N';
}

/**
 * Matchs terminés de chaque équipe, reconstitués à partir des historiques des joueurs
 * qui y jouaient ce jour-là (champ `equipe` de l'historique), dédoublonnés par match.
 * @returns Map slug d'équipe → [{ matchId, date, adversaire, domicile, pour, contre, competition }] du plus récent au plus ancien
 */
export function matchsParEquipe(joueurs) {
  const parEquipe = new Map();
  for (const j of joueurs) {
    for (const m of j.historique ?? []) {
      if (!m.equipe || !m.matchId || !TERMINES.has(m.statut) || resultat(m) == null) continue;
      let e = parEquipe.get(m.equipe);
      if (!e) parEquipe.set(m.equipe, (e = new Map()));
      if (!e.has(m.matchId)) {
        e.set(m.matchId, { matchId: m.matchId, date: m.date, adversaire: m.adversaire, domicile: m.domicile, pour: m.pour, contre: m.contre, competition: m.competition });
      }
    }
  }
  return new Map([...parEquipe].map(([k, v]) => [k, [...v.values()].sort((a, b) => b.date.localeCompare(a.date))]));
}

/**
 * Forme d'une équipe sur ses derniers matchs (toutes compétitions).
 * @param matchs matchs de l'équipe, du plus récent au plus ancien
 * @param F paramètres `forme` de methode.md
 */
export function statsEquipe(matchs, F) {
  if (!matchs?.length) return null;
  const res = matchs.map(resultat);
  const fenetre = matchs.slice(0, F.fenetre_victoires);
  const r = res.slice(0, fenetre.length);
  const compte = (x) => r.filter((y) => y === x).length;
  const suite = (pred) => { let k = 0; while (k < res.length && pred(res[k])) k++; return k; };
  return {
    derniers: matchs.slice(0, F.matchs_affiches).map((m, i) => ({ ...m, res: res[i] })),
    nb: fenetre.length,
    victoires: compte('V'), nuls: compte('N'), defaites: compte('D'),
    pctVictoires: compte('V') / fenetre.length,
    serie: { type: res[0], longueur: suite((x) => x === res[0]) },
    sansDefaite: suite((x) => x !== 'D'),
    sansVictoire: suite((x) => x !== 'V'),
    pourMoyen: moyenne(fenetre.map((m) => m.pour)),
    contreMoyen: moyenne(fenetre.map((m) => m.contre)),
  };
}

// La série la plus parlante, en mots (null si rien de notable).
export function serieEnMots(s, F) {
  if (!s) return null;
  const n = F.serie_notable;
  if (s.serie.type === 'V' && s.serie.longueur >= 2) return `${s.serie.longueur} victoires de suite`;
  if (s.serie.type === 'D' && s.serie.longueur >= 2) return `${s.serie.longueur} défaites de suite`;
  if (s.sansDefaite >= n) return `${s.sansDefaite} matchs sans défaite`;
  if (s.sansVictoire >= n) return `${s.sansVictoire} matchs sans victoire`;
  return null;
}

/**
 * Forme du joueur : moyenne de ses derniers matchs joués comparée à sa moyenne de référence,
 * et sa présence sur les derniers matchs de l'équipe.
 */
export function formeJoueur(joueur, F) {
  const hist = (joueur.historique ?? []).filter((m) => TERMINES.has(m.statut) && m.situation && m.situation !== 'inconnu');
  const joues = hist.filter((m) => JOUE.has(m.situation) && m.statut !== 'DID_NOT_PLAY' && m.score != null);
  const recents = joues.slice(0, F.joueur_recent), reference = joues.slice(0, F.joueur_reference);
  const equipe = hist.slice(0, F.matchs_affiches);
  const base = {
    derniers: equipe.map((m) => ({ date: m.date, situation: m.situation, score: JOUE.has(m.situation) ? m.score : null, minutes: m.minutes })),
    titulaire: equipe.filter((m) => m.situation === 'titulaire').length,
    joue: equipe.filter((m) => JOUE.has(m.situation)).length,
    sur: equipe.length,
  };
  if (recents.length < F.joueur_recent || reference.length < F.joueur_reference_min) return { ...base, tendance: null };
  const moyRecente = moyenne(recents.map((m) => m.score)), moyReference = moyenne(reference.map((m) => m.score));
  const ecart = moyReference > 0 ? moyRecente / moyReference - 1 : null;
  const avecMin = (xs) => xs.filter((m) => m.minutes != null);
  return {
    ...base,
    moyRecente, moyReference, ecart,
    tendance: ecart == null ? null : ecart >= F.seuil_tendance ? 'hausse' : ecart <= -F.seuil_tendance ? 'baisse' : 'stable',
    minutesRecentes: moyenne(avecMin(recents).map((m) => m.minutes)),
    minutesReference: moyenne(avecMin(reference).map((m) => m.minutes)),
  };
}
