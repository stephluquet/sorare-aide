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

// Interpolation linéaire dans une table [[x, y], …] triée sur x ; valeurs extrêmes prolongées.
export function interpoler(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) { const [x0, y0] = table[i - 1], [x1, y1] = table[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return table.at(-1)[1];
}

// Jours entre deux instants, comptés sur les dates d'un fuseau (New York pour la NBA).
const jourDans = (iso, fuseau) => new Intl.DateTimeFormat('sv-SE', { timeZone: fuseau }).format(new Date(iso));
export const ecartJours = (a, b, fuseau) => Math.round((Date.parse(jourDans(a, fuseau)) - Date.parse(jourDans(b, fuseau))) / 86400000);

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
    // Table de calibrage par tranches (methode.md, 1 ter), sinon droite plancher → plafond (section 1).
    p = S.calibration_jouer ? interpoler(S.calibration_jouer, pHist) : S.plancher + (S.plafond - S.plancher) * pHist;
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
  // Contexte (methode.md, section 9) : blessures annoncées par ESPN, deuxième soir consécutif (NBA).
  const K = P.contexte ?? {};
  const contexte = {};
  if (joueur.espn && K.espn_blessures) {
    const effet = K.espn_blessures[joueur.espn.statut];
    contexte.espn = joueur.espn;
    const texte = `ESPN ${dateCourte(joueur.espn.date)} : ${joueur.espn.statut}${joueur.espn.commentaire ? ` — ${joueur.espn.commentaire}` : ''}`;
    if (effet === 'exclu') exclure(texte);
    else if (effet === 'douteux') douter(texte);
    else raisons.push(texte);
  }
  if (sport === 'nba' && match && K.nba_dos_a_dos) {
    const precedent = (joueur.historique ?? []).find((m) => m.date && m.date < match.debutUTC);
    if (precedent && ecartJours(match.debutUTC, precedent.date, K.nba_dos_a_dos.fuseau) === 1) {
      contexte.dosADos = true;
      if (statut !== 'exclu' && p != null) {
        p *= K.nba_dos_a_dos.facteur_jouer;
        raisons.push(`deuxième soir consécutif de l'équipe : chances de jouer × ${String(K.nba_dos_a_dos.facteur_jouer).replace('.', ',')}`);
      }
    }
  }

  if (statut === 'exclu') p = pHist === null ? null : 0;

  // Composition officielle publiée (football) : elle l'emporte sur tout le reste (methode.md, 1 bis).
  let situationConfirmee = null;
  const compo = match?.compositionsOfficielles?.equipes?.[joueur.club?.slug];
  if (compo && P.compositions_officielles) {
    const C = P.compositions_officielles;
    const garder = raisons.filter((r) => !/^(blessé|retour de blessure|statut Sorare|moins de)/.test(r));
    if (compo.titulaires.includes(joueur.id)) {
      situationConfirmee = 'titulaire'; p = C.p_titulaire; statut = 'ok';
      raisons.length = 0; raisons.push(...garder, 'titulaire (composition officielle)');
    } else if (compo.remplacants.includes(joueur.id)) {
      situationConfirmee = 'remplacant'; statut = 'ok';
      const remp = comptes.filter((m) => m.situation === 'entre' || m.situation === 'banc');
      let n = 0, d = 0;
      remp.forEach((m, i) => { const w = 0.5 ** (i / C.demi_vie_remplacant); d += w; n += w * (m.situation === 'entre'); });
      p = (n + C.a_priori_remplacant * C.taux_entree_remplacant) / (d + C.a_priori_remplacant);
      raisons.length = 0; raisons.push(...garder, 'remplaçant (composition officielle)');
    } else {
      situationConfirmee = 'absent'; p = 0; statut = 'exclu';
      raisons.push('absent de la feuille de match (composition officielle)');
    }
  }

  // Éligibilité Arcade : la règle de compétition porte sur le match joué
  let eligibleArcade = Boolean(match);
  if (match && regles.competitionsAutorisees) {
    eligibleArcade = regles.competitionsAutorisees.includes(match.competition);
    if (!eligibleArcade) raisons.push(`prochain match hors compétitions Arcade (${match.competition ?? '?'})`);
  }

  return { p, pHist, nbMatchs: comptes.length, statut, raisons, eligibleArcade, situationConfirmee, contexte };
}
