// Score s'il joue (mélange titulaire / entré en jeu en football ; minutes × score
// par minute en NBA), bonus et espérance (methode.md, sections 3 et 4).
// JavaScript pur, sans accès réseau ni disque.

import { equipeDuMatch, matchsComptes, poids, probabiliteJouer } from './jouer.js';

function moyennePonderee(valeurs, ws) {
  let s = 0, d = 0;
  valeurs.forEach((v, i) => { s += ws[i] * v; d += ws[i]; });
  return d ? s / d : null;
}

function ecartTypePondere(ecarts, ws) {
  let s = 0, d = 0;
  ecarts.forEach((e, i) => { s += ws[i] * e * e; d += ws[i]; });
  return d ? Math.sqrt(s / d) : null;
}

// Matchs joués avec un score définitif ou en vérification, du plus récent au plus ancien.
function matchsJoues(joueur, P) {
  return matchsComptes(joueur, P).filter((m) => P.situations_jouees.includes(m.situation) && m.statut !== 'DID_NOT_PLAY');
}

export function scoreSiJoue(joueur, P, { situationConfirmee = null, victoire = null } = {}) {
  const sport = joueur.sport, S = P[sport];
  const joues = matchsJoues(joueur, P);
  if (!joues.length) return { mu: null, sigma: null, nbScores: 0 };

  if (sport === 'football') {
    // Part de titulaire parmi les matchs joués
    const wq = joues.map((m, i) => poids(i, S.demi_vie_titulaire, m.date, P, sport));
    // Composition officielle : titulaire → q = 1 ; remplaçant → q = 0 (methode.md, 1 bis)
    const q = situationConfirmee === 'titulaire' ? 1 : situationConfirmee === 'remplacant' ? 0
      : moyennePonderee(joues.map((m) => (m.situation === 'titulaire' ? 1 : 0)), wq);
    // Moyenne par situation, avec repli sur tous les matchs joués si trop peu de scores
    const ws = joues.map((m, i) => poids(i, S.demi_vie_score, m.date, P, sport));
    const tous = moyennePonderee(joues.map((m) => m.score), ws);
    const parSituation = (sit) => {
      const idx = joues.map((m, i) => (m.situation === sit ? i : -1)).filter((i) => i >= 0);
      if (idx.length < S.min_scores_situation) return { mu: tous, n: idx.length, repli: true };
      return { mu: moyennePonderee(idx.map((i) => joues[i].score), idx.map((i) => ws[i])), n: idx.length, repli: false };
    };
    const T = parSituation('titulaire'), E = parSituation('entre');
    const sigma = ecartTypePondere(joues.map((m) => m.score - (m.situation === 'titulaire' ? T.mu : E.mu)), ws);
    const poste = joueur.postes?.[0];
    // Retrait vers la moyenne du poste (methode.md, section 3 bis) : corrige l'effet de sélection.
    const Rf = P.retrait?.football, aPoste = Rf?.moyennes?.[poste];
    const retirer = (mu, n, a) => (a == null ? mu : a + (mu - a) * n / (n + Rf.k));
    const muT = retirer(T.mu, T.n, aPoste?.titulaire), muE = retirer(E.mu, E.n, aPoste?.entre);
    // Cotes du match (methode.md, section 9) : décalage du score de titulaire selon la chance de victoire.
    const C = P.contexte?.football_cotes;
    const decalageTitulaire = C && victoire != null && C.pente[poste] != null
      ? C.pente[poste] * (victoire - C.victoire_moyenne[poste]) : 0;
    const muTitulaire = Math.max(0, muT + decalageTitulaire);
    const mu = q * muTitulaire + (1 - q) * muE;
    return { mu, sigma, q, muTitulaire, muEntre: muE, decalageTitulaire, retraitTitulaire: muT - T.mu, retraitEntre: muE - E.mu,
      nbTitulaire: T.n, nbEntre: E.n, nbScores: joues.length };
  }

  // NBA : minutes × score par minute
  const avecMinutes = joues.filter((m) => m.minutes > 0);
  if (!avecMinutes.length) return { mu: null, sigma: null, nbScores: joues.length };
  const wm = avecMinutes.map((m, i) => poids(i, S.demi_vie_minutes, m.date, P, sport));
  const wt = avecMinutes.map((m, i) => poids(i, S.demi_vie_score_par_minute, m.date, P, sport));
  const minutes = moyennePonderee(avecMinutes.map((m) => m.minutes), wm);
  const tauxBrut = moyennePonderee(avecMinutes.map((m) => m.score / m.minutes), wt);
  // Retrait vers le score par minute de la ligue (methode.md, section 3 bis).
  const Rn = P.retrait?.nba;
  const taux = Rn ? Rn.taux_moyen + (tauxBrut - Rn.taux_moyen) * avecMinutes.length / (avecMinutes.length + Rn.k) : tauxBrut;
  const mu = minutes * taux;
  const sigma = ecartTypePondere(avecMinutes.map((m) => m.score - mu), wt);
  return { mu, sigma, minutes, taux, tauxBrut, nbScores: avecMinutes.length };
}

/**
 * Projection d'une carte : probabilité de jouer, score s'il joue, espérance.
 * @param carte  carte normalisée (bonusPct…)
 * @param joueur joueur normalisé, avec historique
 * @param match  prochain match normalisé, ou null
 * @param P      paramètres de methode.md
 * @param regles { competitionsAutorisees } pour le sport de la carte
 */
export function projeterCarte(carte, joueur, match, P, regles = {}) {
  const jouer = probabiliteJouer(joueur, match, P, regles);
  const club = equipeDuMatch(joueur, match); // club ou sélection
  const cotes = match?.cotes ? (match.domicile?.slug === club ? match.cotes.domicile : match.exterieur?.slug === club ? match.cotes.exterieur : null) : null;
  const score = scoreSiJoue(joueur, P, { situationConfirmee: jouer.situationConfirmee, victoire: cotes?.victoire ?? null });
  const raisons = [...jouer.raisons];
  if (score.decalageTitulaire) {
    const d = score.decalageTitulaire;
    raisons.push(`équipe à ${Math.round(cotes.victoire * 100)} % de chances de gagner : ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1).replace('.', ',')} pts s'il est titulaire`);
  }
  let b = 1;
  if (carte.bonusPct == null) raisons.push('bonus de collection inconnu : 0 % par défaut');
  else b = 1 + carte.bonusPct / 100;
  if (score.mu == null && jouer.statut !== 'exclu') raisons.push('aucun score récent : à vérifier');
  const siJoue = score.mu == null ? null : score.mu * b;
  const esperance = siJoue == null || jouer.p == null ? null : jouer.p * siJoue;
  const propose = jouer.statut === 'ok' && jouer.p != null && jouer.p >= P.seuil_jouer && siJoue != null;
  return {
    carteId: carte.id,
    joueurId: joueur.id,
    sport: joueur.sport,
    ...jouer,
    raisons,
    score,
    bonus: b,
    siJoue,
    esperance,
    // Proposable par défaut (filtre dur et seuil) ; l'éligibilité Arcade est à part.
    proposable: propose,
  };
}
