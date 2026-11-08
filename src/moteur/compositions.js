// Choix des compositions Arcade (methode.md, section 6) : cartes admissibles,
// présélection par approximation normale, simulation des meilleures équipes,
// trois propositions. JavaScript pur, sans accès réseau ni disque.

import { distribution, moments, multiplicateurCarte, pPasserApprox, simulerEquipe } from './simulation.js';

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
      && ((l.match && Date.parse(l.match.debutUTC) > o.maintenant) || ecarter('match déjà commencé'))
      && (!o.creneau || l.match.debutUTC === o.creneau || ecarter('autre créneau'))
      && (!o.jour || jourDeJeu(l.match.debutUTC, o.fuseau) === o.jour || ecarter('autre jour'));
    if (!ok) continue;
    const d = distribution(l.joueur, pr, P);
    if (!d) { ecarter('pas de score exploitable'); continue; }
    admissibles.push({ ...l, d });
  }
  return { admissibles, ecartees };
}

const parEsperance = (a, b) => b.projection.esperance - a.projection.esperance;

// Paramètres de simulation du sport, avec sa table de calibrage final des chances de passer (methode.md, 5 bis).
const simulationDuSport = (P, sport) => ({ ...P.simulation, calibration: P.simulation.calibration_passer?.[sport] ?? null });

// Journée de jeu (AAAA-MM-JJ) d'un coup d'envoi : sa date dans le fuseau du sport
// (regles/squad.json, journee_de_jeu : Paris en football, New York en NBA).
const FORMATS_JOUR = new Map();
export function jourDeJeu(iso, fuseau = 'Europe/Paris') {
  if (!FORMATS_JOUR.has(fuseau)) FORMATS_JOUR.set(fuseau, new Intl.DateTimeFormat('sv-SE', { timeZone: fuseau }));
  return FORMATS_JOUR.get(fuseau).format(new Date(iso));
}

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
      if (equipe.some((x, i) => equipe.indexOf(x) !== i)) continue;
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
      const mts = cap < 0 ? base : base.map((mo, i) => (i === cap ? moments(equipe[i].d, multiplicateurCarte(equipe[i].d, true, mult, regle.cumul_bonus?.mode)) : mo));
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
    const res = simulerEquipe(r.equipe.map((x) => x.d), r.capitaine, mult, cible, sim, regle.cumul_bonus?.mode);
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
  const sim = simulationDuSport(P, o.sport);
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
  if (!o.sansAmbitieuse && sim.ambitieuse_seuil_jouer < o.seuil) {
    const amb = meilleure(passe(sim.ambitieuse_seuil_jouer).simulees, 'pPasser', 'pComplete');
    if (amb && amb.pPasser > res.equilibree.pPasser + 0.005) res.ambitieuse = amb;
  }
  return res;
}

// ---------- Créneau unique (methode.md, section 7) ----------

/**
 * Propositions par créneau : pour chaque coup d'envoi à venir, la meilleure équipe dont
 * les 5 matchs commencent à cette heure-là.
 * @returns [{ creneau, compositionsPubliees, matchs, admissibles, equilibree, prudente }] par heure croissante
 */
export function proposerParCreneau(lignes, P, o) {
  const parCreneau = new Map();
  for (const l of lignes) {
    if (!l.match || Date.parse(l.match.debutUTC) <= o.maintenant) continue;
    const c = l.match.debutUTC;
    if (!parCreneau.has(c)) parCreneau.set(c, { lignes: [], matchs: new Map() });
    parCreneau.get(c).lignes.push(l);
    parCreneau.get(c).matchs.set(l.match.id, l.match);
  }
  const res = [];
  for (const [creneau, { lignes: L, matchs }] of [...parCreneau.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const publiees = [...matchs.values()].filter((m) => Object.values(m.compositionsOfficielles?.equipes ?? {}).some(Boolean)).length;
    if (L.length < 5) continue; // impossible de remplir 5 places
    const r = proposer(L, P, { ...o, creneau, sansAmbitieuse: true });
    if (!r.equilibree) continue;
    res.push({ creneau, compositionsPubliees: publiees, matchs: matchs.size, admissibles: r.admissibles, equilibree: r.equilibree, prudente: r.prudente });
  }
  return res;
}

// ---------- Squad du jour (methode.md, section 8) ----------

/**
 * Meilleure équipe du jour au sens du score attendu (espérance), cartes jouées en Arcade
 * autorisées. Mêmes contraintes de composition que l'Arcade du sport (à confirmer dans le jeu).
 * @param o { sport, jour: 'AAAA-MM-JJ' (journée de jeu), fuseau (journee_de_jeu du sport), regle, seuil, maintenant }
 */
export function squadDuJour(lignes, P, o) {
  const { admissibles, ecartees } = cartesAdmissibles(lignes, P, { ...o, jouees: new Set() });
  const mult = o.regle.capitaine?.multiplicateur ?? 1;
  const generateur = o.sport === 'football' ? equipesFootball(admissibles, o.regle, P.simulation) : equipesNba(admissibles, o.regle, P.simulation);
  let meilleure = null, nbEquipes = 0;
  for (const equipe of generateur) {
    nbEquipes++;
    const esp = equipe.map((x) => x.projection.esperance);
    // Gain du brassard : en addition, + (mult − 1) × score de base ; en multiplication, × mult du score bonifié.
    const gains = equipe.map((x) => (o.regle.cumul_bonus?.mode === 'multiplication' ? (mult - 1) * x.projection.esperance
      : (mult - 1) * x.projection.p * x.projection.score.mu));
    const cap = o.regle.capitaine ? gains.indexOf(Math.max(...gains)) : -1;
    const total = esp.reduce((a, b) => a + b, 0) + (cap >= 0 ? gains[cap] : 0);
    if (!meilleure || total > meilleure.esperance) meilleure = { equipe, cap, esperance: total };
  }
  if (!meilleure) return { equipe: null, admissibles: admissibles.length, ecartees, nbEquipes, message: `Aucune équipe possible ce jour-là : ${admissibles.length} cartes admissibles.` };
  const e = meilleure.equipe;
  return {
    equipe: {
      cartes: e.map((x) => x.carte.id),
      capitaine: meilleure.cap >= 0 ? e[meilleure.cap].carte.id : null,
      esperance: meilleure.esperance,
      pComplete: e.reduce((a, x) => a * x.projection.p, 1),
      verrouillage: e.map((x) => x.match.debutUTC).sort()[0],
      etoiles: e.reduce((s, x) => s + (x.joueur.etoiles ?? 0), 0),
    },
    admissibles: admissibles.length, ecartees, nbEquipes,
  };
}

// Journées de jeu qui ont au moins un match à venir, dans l'ordre.
export function joursAVenir(lignes, maintenant, fuseau = 'Europe/Paris') {
  return [...new Set(lignes.filter((l) => l.match && Date.parse(l.match.debutUTC) > maintenant).map((l) => jourDeJeu(l.match.debutUTC, fuseau)))].sort();
}

// ---------- Autres choix (methode.md, section 6 bis) ----------

// Les 5 cartes peuvent-elles occuper les places du mode (postes obligatoires + place libre) ?
function postesValides(equipe, regle) {
  if (!regle.postes?.obligatoires?.length) return true;
  const places = [...regle.postes.obligatoires.map((p) => [p]), ...Array(regle.postes.libre?.nombre ?? 0).fill(regle.postes.libre.postes_autorises)];
  if (places.length !== equipe.length) return false;
  const pris = new Array(equipe.length).fill(false);
  const placer = (k) => {
    if (k === places.length) return true;
    for (let i = 0; i < equipe.length; i++) {
      if (pris[i] || !equipe[i].joueur.postes.some((p) => places[k].includes(p))) continue;
      pris[i] = true;
      if (placer(k + 1)) return true;
      pris[i] = false;
    }
    return false;
  };
  return placer(0);
}

function etoilesValides(equipe, regle) {
  const max = regle.plafond_etoiles?.max; if (max == null) return true;
  const t = equipe.reduce((s, x) => s + (x.joueur.etoiles ?? 0), 0);
  return regle.plafond_etoiles.plafond_inclus === false ? t < max : t <= max;
}

/**
 * Autres joueurs à considérer pour une équipe proposée.
 * @param equipeProposee résultat de proposer (cartes, capitaine, pPasser)
 * @returns { groupes: [{ poste, choix: [{ carteId, esperance, p, siJoue, remplace, capitaine, pPasser, ecart }] }] }
 */
export function autresChoix(lignes, P, o, equipeProposee) {
  const sim = simulationDuSport(P, o.sport), regle = o.regle, mult = regle.capitaine?.multiplicateur ?? 1;
  const { admissibles } = cartesAdmissibles(lignes, P, o);
  const parId = new Map(admissibles.map((x) => [x.carte.id, x]));
  const equipe = equipeProposee.cartes.map((id) => parId.get(id));
  if (equipe.some((x) => !x)) return { groupes: [] }; // une carte n'est plus admissible (match commencé…)
  const joueursEquipe = new Set(equipe.map((x) => x.joueur.id));
  const libres = admissibles.filter((x) => !joueursEquipe.has(x.joueur.id)).sort(parEsperance);
  const groupes = o.sport === 'football'
    ? regle.postes.obligatoires.map((poste) => ({ poste, candidats: libres.filter((x) => x.joueur.postes.includes(poste)).slice(0, sim.alternatives_par_poste) }))
    : [{ poste: null, candidats: libres.slice(0, sim.alternatives_nba) }];
  const capIndex = equipeProposee.capitaine ? equipe.findIndex((x) => x.carte.id === equipeProposee.capitaine) : -1;
  return {
    groupes: groupes.map(({ poste, candidats }) => ({
      poste,
      choix: candidats.map((c) => {
        let meilleur = null;
        for (let i = 0; i < equipe.length; i++) {
          const essai = equipe.map((x, k) => (k === i ? c : x));
          if (new Set(essai.map((x) => x.joueur.id)).size < essai.length) continue;
          if (!postesValides(essai, regle) || !etoilesValides(essai, regle)) continue;
          let cap = capIndex;
          if (regle.capitaine && cap === i) { // brassard au plus grand p × μ
            const v = essai.map((x) => x.projection.p * x.projection.score.mu);
            cap = v.indexOf(Math.max(...v));
          }
          const r = simulerEquipe(essai.map((x) => x.d), cap, mult, o.cible, sim, regle.cumul_bonus?.mode);
          if (!meilleur || r.pPasser > meilleur.pPasser) meilleur = { remplace: equipe[i].carte.id, capitaine: cap >= 0 ? essai[cap].carte.id : null, pPasser: r.pPasser, pComplete: r.pComplete };
        }
        return { carteId: c.carte.id, esperance: c.projection.esperance, p: c.projection.p, siJoue: c.projection.siJoue,
          ...(meilleur ?? { remplace: null, pPasser: null }), ecart: meilleur ? meilleur.pPasser - equipeProposee.pPasser : null };
      }),
    })),
  };
}
