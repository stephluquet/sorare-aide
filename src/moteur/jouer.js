// Probabilité de jouer, filtre dur et éligibilité Arcade (methode.md, sections 1 et 2).
// JavaScript pur, sans accès réseau ni disque : utilisable dans Node et dans le navigateur.

// Poids d'un match de rang i (0 = le plus récent) : décroissance exponentielle,
// réduite pour un match de la saison précédente.
export function poids(i, demiVie, date, P, sport) {
  const decroissance = demiVie === Infinity ? 1 : 0.5 ** (i / demiVie);
  const anterieur = date && P[sport].debut_saison && date < P[sport].debut_saison;
  return decroissance * (anterieur ? P.poids_saison_precedente : 1);
}

// Matchs comptés : statut retenu, situation connue, du plus récent au plus ancien.
export function matchsComptes(joueur, P) {
  return (joueur.historique ?? [])
    .filter((m) => P.statuts_comptes.includes(m.statut) && m.situation && m.situation !== 'inconnu')
    .slice(0, P.fenetre_matchs);
}

const dateCourte = (d) => (d ? d.slice(0, 10) : '?');

/**
 * @param joueur   joueur normalisé (historique, blessures, suspensions, statutSorare, club…)
 * @param match    prochain match normalisé, ou null
 * @param P        paramètres de methode.md
 * @param regles   { competitionsAutorisees: [noms API] | null } (null : pas de contrainte)
 * @returns { p, pHist, nbMatchs, statut: 'ok'|'douteux'|'exclu', raisons[], eligibleArcade }
 */
export function probabiliteJouer(joueur, match, P, regles = {}) {
  const sport = joueur.sport;
  const S = P[sport];
  const raisons = [];
  let statut = 'ok';
  const exclure = (r) => { statut = 'exclu'; raisons.push(r); };
  const douter = (r) => { if (statut !== 'exclu') statut = 'douteux'; raisons.push(r); };

  // Historique
  const comptes = matchsComptes(joueur, P);
  let pHist = null, p = null;
  if (comptes.length >= P.min_matchs_historique) {
    let n = 0, d = 0;
    comptes.forEach((m, i) => {
      const w = poids(i, S.demi_vie_jouer, m.date, P, sport);
      d += w;
      n += w * P.situations_jouees.includes(m.situation);
    });
    pHist = n / d;
    p = S.plancher + (S.plafond - S.plancher) * pHist;
  }

  // Ce qui l'emporte sur l'historique
  if (!match) exclure('pas de prochain match connu');
  for (const b of joueur.blessures ?? []) {
    if (match && b.retourPrevu && b.retourPrevu <= match.debutUTC) {
      douter(`retour de blessure prévu le ${dateCourte(b.retourPrevu)} (${b.type ?? '?'}) : à vérifier`);
    } else {
      exclure(`blessé (${b.type ?? '?'}${b.retourPrevu ? `, retour prévu le ${dateCourte(b.retourPrevu)}` : ', retour inconnu'})`);
    }
  }
  for (const s of joueur.suspensions ?? []) {
    if (match && s.competition && match.competition && s.competition !== match.competition) {
      raisons.push(`suspendu en ${s.competition}, pas en ${match.competition}`);
    } else {
      exclure(`suspendu${s.competition ? ` (${s.competition})` : ''}`);
    }
  }
  if (pHist === null) exclure(`moins de ${P.min_matchs_historique} matchs connus : à vérifier`);
  if (sport === 'football' && P.statuts_sorare_douteux.includes(joueur.statutSorare)) douter(`statut Sorare ${joueur.statutSorare}`);
  if (match && joueur.club && match.domicile && match.exterieur &&
      ![match.domicile.slug, match.exterieur.slug].includes(joueur.club.slug)) {
    douter('club absent du prochain match (sélection ?) : à vérifier');
  }
  if (statut === 'exclu') p = pHist === null ? null : 0;

  // Éligibilité Arcade : la règle de compétition porte sur le match joué
  let eligibleArcade = Boolean(match);
  if (match && regles.competitionsAutorisees) {
    eligibleArcade = regles.competitionsAutorisees.includes(match.competition);
    if (!eligibleArcade) raisons.push(`prochain match hors compétitions Arcade (${match.competition ?? '?'})`);
  }

  return { p, pHist, nbMatchs: comptes.length, statut, raisons, eligibleArcade };
}
