// Simulation de Monte-Carlo d'une équipe (methode.md, section 5).
// JavaScript pur, sans accès réseau ni disque ; générateur à graine fixe pour
// des probabilités reproductibles.

import { matchsComptes, poids, interpoler } from './jouer.js';

// Générateur pseudo-aléatoire mulberry32 : rapide, déterministe, suffisant ici.
export function generateur(graine) {
  let a = graine >>> 0;
  const suivant = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let reserve = null;
  const normal = () => { // Box-Muller
    if (reserve !== null) { const r = reserve; reserve = null; return r; }
    const u = 1 - suivant(), v = suivant(), rr = Math.sqrt(-2 * Math.log(u));
    reserve = rr * Math.sin(2 * Math.PI * v);
    return rr * Math.cos(2 * Math.PI * v);
  };
  return { suivant, normal };
}

// Échantillon pondéré : scores et poids cumulés normalisés.
function echantillon(scores, ws) {
  const total = ws.reduce((a, b) => a + b, 0);
  let c = 0;
  const cumul = ws.map((w) => (c += w / total));
  const moyenne = scores.reduce((a, s, i) => a + s * ws[i], 0) / total;
  const variance = scores.reduce((a, s, i) => a + ws[i] * (s - moyenne) ** 2, 0) / total;
  return { scores, cumul, moyenne, variance };
}

function tirerDans(e, u) {
  let lo = 0, hi = e.cumul.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (e.cumul[mid] < u) lo = mid + 1; else hi = mid; }
  return e.scores[lo];
}

/**
 * Distribution du score d'une carte, prête à tirer et à résumer.
 * @param joueur joueur normalisé (historique)
 * @param projection résultat de projeterCarte (p, score, bonus)
 * @param P paramètres de methode.md
 * @returns null si pas de score exploitable, sinon { p, b, situations: [{part, e}], echelle, bruit, max, m, v }
 *   où m et v sont la moyenne et la variance du score s'il joue, SANS bonus (lissage compris) ;
 *   le multiplicateur de la carte (bonus, capitaine) s'applique ensuite (multiplicateurCarte).
 */
export function distribution(joueur, projection, P) {
  const sport = joueur.sport, S = P[sport], sim = P.simulation;
  const s = projection.score;
  if (projection.p == null || s.mu == null) return null;
  const joues = matchsComptes(joueur, P).filter((m) => P.situations_jouees.includes(m.situation) && m.statut !== 'DID_NOT_PLAY');
  if (!joues.length) return null;
  const ws = joues.map((m, i) => poids(i, S.demi_vie_score ?? S.demi_vie_score_par_minute, m.date, P, sport));
  const tous = echantillon(joues.map((m) => m.score), ws);
  let situations, echelle = 1;
  if (sport === 'football') {
    const parSit = (sit) => {
      const idx = joues.map((m, i) => (m.situation === sit ? i : -1)).filter((i) => i >= 0);
      return idx.length < S.min_scores_situation ? tous : echantillon(idx.map((i) => joues[i].score), idx.map((i) => ws[i]));
    };
    // décalages : cotes du match (section 9) et retrait vers la moyenne du poste (section 3 bis)
    situations = [{ part: s.q, e: parSit('titulaire'), decalage: (s.decalageTitulaire ?? 0) + (s.retraitTitulaire ?? 0) },
      { part: 1 - s.q, e: parSit('entre'), decalage: s.retraitEntre ?? 0 }];
  } else {
    situations = [{ part: 1, e: tous }];
    echelle = tous.moyenne > 0 ? s.mu / tous.moyenne : 1; // remise à l'échelle de μ = minutes × taux
  }
  const bruit = sim.lissage[sport] * (s.sigma ?? 0);
  const b = projection.bonus;
  // Moments du score s'il joue (avant bornage), bonus inclus
  let m1 = 0, m2 = 0;
  for (const { part, e, decalage = 0 } of situations) {
    const mu = e.moyenne * echelle + decalage, va = e.variance * echelle ** 2 + bruit ** 2;
    m1 += part * mu; m2 += part * (va + mu * mu);
  }
  return {
    p: projection.p, b, situations, echelle, bruit, max: sim.score_max[sport],
    m: m1, v: Math.max(0, m2 - m1 * m1),
  };
}

function tirerScore(d, rng) {
  if (rng.suivant() >= d.p) return 0;
  let u = rng.suivant(), sit = d.situations[0];
  for (const x of d.situations) { if (u < x.part) { sit = x; break; } u -= x.part; }
  let score = tirerDans(sit.e, rng.suivant()) * d.echelle + (sit.decalage ?? 0) + d.bruit * rng.normal();
  if (score < 0) score = 0;
  if (d.max != null && score > d.max) score = d.max;
  return score;
}

/**
 * Multiplicateur d'une carte : 1 + bonus de la carte (+ bonus de capitaine).
 * Cumul par addition (regles/, cumul_bonus) : 1 + 0,2 + 0,5 = 1,7 pour un capitaine Eclipse ;
 * en mode « multiplication » ce serait 1,2 × 1,5 = 1,8.
 */
export function multiplicateurCarte(d, capitaine, multCapitaine, mode = 'addition') {
  if (!capitaine) return d.b;
  return mode === 'multiplication' ? d.b * multCapitaine : d.b + (multCapitaine - 1);
}

/**
 * Simule une équipe.
 * @param distributions les 5 distributions
 * @param capitaine indice du capitaine dans `distributions`, ou -1 (NBA)
 * @param multiplicateur multiplicateur du capitaine (1,5 en football)
 * @param mode cumul des bonus : 'addition' (vérifié) ou 'multiplication'
 * @param cible score à atteindre
 * @param sim P.simulation (tirages, graine)
 * @returns { pPasser, scoreMoyen, pComplete }
 */
export function simulerEquipe(distributions, capitaine, multiplicateur, cible, sim, mode = 'addition') {
  const totaux = tirerTotaux(distributions, capitaine, multiplicateur, sim, mode);
  let passes = 0, somme = 0;
  for (const total of totaux) { somme += total; if (total >= cible) passes++; }
  const brut = passes / totaux.length;
  return {
    // chances calibrées sur le rétro-test des équipes (methode.md, 5 bis) ; brut = part des tirages au-dessus de la cible
    pPasser: sim.calibration ? interpoler(sim.calibration, brut) : brut,
    pPasserBrut: brut,
    scoreMoyen: somme / totaux.length,
    pComplete: distributions.reduce((a, d) => a * d.p, 1),
  };
}

/**
 * La même équipe si les 5 jouent à coup sûr (methode.md, 5 quater) : chances de passer
 * (calibrées comme pPasser) et score habituel (médiane des tirages). Sert à séparer les deux
 * causes d'échec : les absences possibles, et l'écart entre le score habituel et la cible.
 * @returns { pPasser, pPasserBrut, mediane }
 */
export function siLes5Jouent(distributions, capitaine, multiplicateur, cible, sim, mode = 'addition') {
  const totaux = tirerTotaux(distributions.map((d) => ({ ...d, p: 1 })), capitaine, multiplicateur, sim, mode);
  let passes = 0;
  for (const t of totaux) if (t >= cible) passes++;
  const brut = passes / totaux.length;
  const tri = Float64Array.from(totaux).sort();
  return { pPasser: sim.calibration ? interpoler(sim.calibration, brut) : brut, pPasserBrut: brut, mediane: tri[Math.floor(tri.length / 2)] };
}

/**
 * Les totaux simulés d'une équipe (sim.tirages valeurs, graine fixe) : base de simulerEquipe,
 * du rétro-test de l'équipe et de la distribution affichée face à la cible.
 */
export function tirerTotaux(distributions, capitaine, multiplicateur, sim, mode = 'addition') {
  const rng = generateur(sim.graine);
  const facteurs = distributions.map((d, i) => multiplicateurCarte(d, i === capitaine, multiplicateur, mode));
  const totaux = new Float64Array(sim.tirages);
  for (let t = 0; t < sim.tirages; t++) {
    let total = 0;
    for (let i = 0; i < distributions.length; i++) total += tirerScore(distributions[i], rng) * facteurs[i];
    totaux[t] = total;
  }
  return totaux;
}

// ---------- Résumés pour l'affichage (methode.md, section 5 ter) ----------

// Quantile d'un tableau TRIÉ par interpolation linéaire entre rangs (type 7 de R).
function quantileTrie(tries, q) {
  if (!tries.length) return null;
  const i = (tries.length - 1) * q, a = Math.floor(i), b = Math.ceil(i);
  return tries[a] + (tries[b] - tries[a]) * (i - a);
}

/**
 * Résumé des tirages d'une équipe pour l'affichage : histogramme, quantiles 10/50/90,
 * moyenne et part des tirages au-dessus de la cible (= pPasserBrut de simulerEquipe pour
 * les mêmes tirages). N'intervient dans aucun calcul de chances.
 * @param totaux totaux simulés (tirerTotaux)
 * @param cible score à atteindre
 * @param o { classes: nombre de classes (40), arrondi: pas d'arrondi des bornes (10) }
 * @returns null si aucun tirage, sinon { min, max, largeur, classes: [effectifs], q10, q50, q90, moyenne, partAuDessus, n }
 *   bornes : quantiles 0,5 % et 99,5 % élargis à la cible, plus 5 % de marge, arrondis au pas ;
 *   un tirage hors bornes compte dans la classe extrême.
 */
export function resumerTirages(totaux, cible, o = {}) {
  const n = totaux.length;
  if (!n) return null;
  const nbClasses = o.classes ?? 40, arrondi = o.arrondi ?? 10;
  const tries = Float64Array.from(totaux).sort();
  let min = Math.min(quantileTrie(tries, 0.005), cible), max = Math.max(quantileTrie(tries, 0.995), cible);
  const marge = (max - min) * 0.05 || arrondi;
  min = Math.max(0, Math.floor((min - marge) / arrondi) * arrondi);
  max = Math.ceil((max + marge) / arrondi) * arrondi;
  const largeur = (max - min) / nbClasses;
  const classes = new Array(nbClasses).fill(0);
  let somme = 0, auDessus = 0;
  for (const t of totaux) {
    somme += t;
    if (t >= cible) auDessus++;
    classes[Math.min(nbClasses - 1, Math.max(0, Math.floor((t - min) / largeur)))]++;
  }
  return {
    min, max, largeur, classes,
    q10: quantileTrie(tries, 0.1), q50: quantileTrie(tries, 0.5), q90: quantileTrie(tries, 0.9),
    moyenne: somme / n, partAuDessus: auDessus / n, n,
  };
}

/**
 * Quantiles 10/50/90 du score d'une carte S'IL JOUE : tirages conditionnels (il joue à coup sûr)
 * dans sa distribution, multiplicateur de la carte compris (bonus ; capitaine si `facteur` le dit).
 * @param d distribution (distribution())
 * @param sim P.simulation (graine)
 * @param o { tirages: 2000, facteur: d.b }
 * @returns { q10, q50, q90 }
 */
export function quantilesSiJoue(d, sim, o = {}) {
  const n = o.tirages ?? 2000, facteur = o.facteur ?? d.b;
  const rng = generateur(sim.graine);
  const certain = { ...d, p: 1 };
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = tirerScore(certain, rng) * facteur;
  v.sort();
  return { q10: quantileTrie(v, 0.1), q50: quantileTrie(v, 0.5), q90: quantileTrie(v, 0.9) };
}

// Approximation normale de la probabilité de passer (présélection, methode.md section 6).
const phi = (z) => { // fonction de répartition de la loi normale (Abramowitz et Stegun 7.1.26)
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
};

// facteur = multiplicateur de la carte (multiplicateurCarte).
export function moments(d, facteur = d.b) {
  const m = d.m * facteur, v = d.v * facteur * facteur;
  return { moyenne: d.p * m, variance: d.p * (v + m * m) - (d.p * m) ** 2 };
}

export function pPasserApprox(momentsEquipe, cible) {
  let mu = 0, va = 0;
  for (const x of momentsEquipe) { mu += x.moyenne; va += x.variance; }
  return va > 0 ? 1 - phi((cible - mu) / Math.sqrt(va)) : (mu >= cible ? 1 : 0);
}
