// Choix des compositions Arcade (methode.md, section 6) : cartes admissibles,
// présélection par approximation normale, simulation des meilleures équipes,
// trois propositions. JavaScript pur, sans accès réseau ni disque.

import { distribution, moments, pPasserApprox, simulerEquipe } from './simulation.js';

/**
 * Cartes admissibles pour une tentative.
 * @param lignes [{ carte, joueur, match, projection }] d'un sport
 * @param o { seuil, jouees: Set<carteId>, maintenant: ms, regle } ; regle = fichier de regles/ du mode
 * @returns { admissibles: [{ ...ligne, d }], ecartees: { motif: nombre } }
 */
export function cartesAdmissibles(lignes, P, o) {
  const ecartees = {};
  const ecarter = (motif) => { ecartees[motif] = (ecartees[motif] ?? 0) + 1; return false; };
  const raretes = o.regle.rarete_autorisee;
  const admissibles = [];
  for (const l of lignes) {
    const pr = l.projection;
    const ok = (pr.statut === 'ok' || ecarter(pr.statut === 'exclu' ? 'exclues (blessure, suspension…)' : 'douteuses'))
      && ((pr.p != null && pr.p >= o.seuil) || ecarter('chances de jouer sous le seuil'))
      && (pr.eligibleArcade || ecarter('match hors compétitions Arcade'))
      && (!raretes || raretes.includes(l.carte.rarete) || ecarter('rareté non autorisée'))
      && (!o.jouees.has(l.carte.id) || ecarter('déjà jouées à ce palier'))
      && ((l.match && Date.parse(l.match.debutUTC) > o.maintenant) || ecarter('match déjà commencé'));
    if (!ok) continue;
    const d = distribution(l.joueur, pr, P);
    if (!d) { ecarter('pas de score exploitable'); continue; }
    admissibles.push({ ...l, d });
  }
  return { admissibles, ecartees };
}

const parEsperance = (a, b) => b.projection.esperance - a.projection.esperance;

// Équipes candidates (ensembles de 5 cartes) respectant postes, doublons et étoiles.
function* equipesFootball(adm, regle, sim) {
  const K = sim.candidats_par_poste;
  const parPoste = {};
  for (const poste of regle.postes.obligatoires) {
    parPoste[poste] = adm.filter((x) => x.joueur.postes.includes(poste)).sort(parEsperance).slice(0, K[poste] ?? 8);
  }
  const libres = [...new Set(regle.postes.libre.postes_autorises.flatMap((po) => parPoste[po] ?? []))];
  const vues = new Set();
  const [p1, p2, p3, p4] = regle.postes.obligatoires;
  for (const a of parPoste[p1]) for (const b of parPoste[p2]) for (const c of parPoste[p3]) for (const e of parPoste[p4]) {
    for (const f of libres) {
      const equipe = [a, b, c, e, f];
      if (new Set(equipe.map((x) => x.joueur.id)).size < 5) continue; // un joueur une seule fois
      const cle = equipe.map((x) => x.carte.id).sort().join('|');
      if (vues.has(cle)) continue;
      vues.add(cle);
      yield equipe;
    }
  }
}

function* equipesNba(adm, regle, sim) {
  const c = adm.slice().sort(parEsperance).slice(0, sim.candidats_nba);
  const max = regle.plafond_etoiles?.max ?? Infinity;
  const inclus = regle.plafond_etoiles?.plafond_inclus !== false;
  const n = c.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++)
    for (let l = k + 1; l < n; l++) for (let m = l + 1; m < n; m++) {
      const equipe = [c[i], c[j], c[k], c[l], c[m]];
      const etoiles = equipe.reduce((s, x) => s + (x.joueur.etoiles ?? 0), 0);
      if (inclus ? etoiles > max : etoiles >= max) continue;
      if (new Set(equipe.map((x) => x.joueur.id)).size < 5) continue;
      yield equipe;
    }
}

// Présélection : meilleures équipes selon l'approximation normale (capitaine essayé à chaque place).
function preselection(adm, sport, regle, cible, sim) {
  const mult = regle.capitaine?.multiplicateur ?? 1;
  const avecCapitaine = Boolean(regle.capitaine);
  const generateur = sport === 'football' ? equipesFootball(adm, regle, sim) : equipesNba(adm, regle, sim);
  const garde = [];
  let nbEquipes = 0;
  for (const equipe of generateur) {
    nbEquipes++;
    const base = equipe.map((x) => moments(x.d));
    const capitaines = avecCapitaine ? [0, 1, 2, 3, 4] : [-1];
    for (const cap of capitaines) {
      const mts = cap < 0 ? base : base.map((mo, i) => (i === cap ? moments(equipe[i].d, mult) : mo));
      garde.push({ equipe, capitaine: cap, approx: pPasserApprox(mts, cible) });
    }
    if (garde.length > 20 * sim.equipes_simulees) { // garde la mémoire bornée
      garde.sort((a, b) => b.approx - a.approx);
      garde.length = 4 * sim.equipes_simulees;
    }
  }
  garde.sort((a, b) => b.approx - a.approx);
  return { retenues: garde.slice(0, sim.equipes_simulees), nbEquipes };
}

function simuler(retenues, regle, cible, sim) {
  const mult = regle.capitaine?.multiplicateur ?? 1;
  return retenues.map((r) => {
    const res = simulerEquipe(r.equipe.map((x) => x.d), r.capitaine, mult, cible, sim);
    return {
      cartes: r.equipe.map((x) => x.carte.id),
      capitaine: r.capitaine >= 0 ? r.equipe[r.capitaine].carte.id : null,
      ...res,
      verrouillage: r.equipe.map((x) => x.match.debutUTC).sort()[0],
      etoiles: r.equipe.reduce((s, x) => s + (x.joueur.etoiles ?? 0), 0),
      approx: r.approx,
    };
  });
}

const meilleure = (liste, cle, departage) => liste.slice().sort((a, b) => (b[cle] - a[cle]) || (b[departage] - a[departage]))[0] ?? null;

/**
 * Trois propositions pour la tentative en cours.
 * @param lignes [{ carte, joueur, match, projection }] du sport
 * @param o { sport, cible, regle, seuil, jouees: Set, maintenant }
 * @returns { prudente, equilibree, ambitieuse, admissibles, ecartees, nbEquipes, message? }
 */
export function proposer(lignes, P, o) {
  const sim = P.simulation;
  const passe = (seuil) => {
    const { admissibles, ecartees } = cartesAdmissibles(lignes, P, { ...o, seuil });
    const { retenues, nbEquipes } = preselection(admissibles, o.sport, o.regle, o.cible, sim);
    return { simulees: simuler(retenues, o.regle, o.cible, sim), admissibles, ecartees, nbEquipes };
  };
  const principale = passe(o.seuil);
  const res = { admissibles: principale.admissibles.length, ecartees: principale.ecartees, nbEquipes: principale.nbEquipes,
    prudente: null, equilibree: null, ambitieuse: null };
  if (!principale.simulees.length) {
    res.message = `Aucune équipe possible : ${principale.admissibles.length} cartes admissibles ne suffisent pas à remplir les postes.`;
    return res;
  }
  res.equilibree = meilleure(principale.simulees, 'pPasser', 'pComplete');
  const proches = principale.simulees.filter((x) => x.pPasser >= res.equilibree.pPasser - sim.prudente_ecart_max);
  res.prudente = meilleure(proches, 'pComplete', 'pPasser');
  if (sim.ambitieuse_seuil_jouer < o.seuil) {
    const amb = meilleure(passe(sim.ambitieuse_seuil_jouer).simulees, 'pPasser', 'pComplete');
    if (amb && amb.pPasser > res.equilibree.pPasser + 0.005) res.ambitieuse = amb;
  }
  return res;
}
