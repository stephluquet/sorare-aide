// Projection du score attendu au prochain match, carte par carte.
// La méthode et ses paramètres sont dans methode.md (qui fait foi) : ce module
// lit le bloc JSON de paramètres et applique les formules qui y sont décrites.
//
// Usage : node src/projection.js [AAAA-MM-JJ]
//   lit data/cartes-{football,nba}-<date>.json (date du jour par défaut)
//   écrit sorties/projections-<date>.html

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

export function lireParametres(chemin = join(RACINE, 'methode.md')) {
  const texte = readFileSync(chemin, 'utf8');
  const m = texte.match(/<!-- parametres:debut -->\s*```json\s*([\s\S]*?)```\s*<!-- parametres:fin -->/);
  if (!m) throw new Error(`Bloc de paramètres introuvable dans ${chemin}`);
  return JSON.parse(m[1]);
}

const arrondi = (x, n = 2) => (x == null ? null : Math.round(x * 10 ** n) / 10 ** n);

function ecartType(xs) {
  const moy = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - moy) ** 2, 0) / xs.length);
}

// Table de repli des bonus (regles/), qui sert de contrôle : multiplicateur attendu par nom.
export function lireTableBonus(chemin = join(RACINE, 'regles', 'bonus-collections.json')) {
  const t = JSON.parse(readFileSync(chemin, 'utf8')).bonus_pct;
  return Object.fromEntries(Object.entries(t).map(([nom, pct]) => [nom, 1 + pct / 100]));
}

export function projeterCarte(carte, P, tableBonus = {}) {
  const j = carte.joueur;
  const alertes = [];
  const comptes = (j.derniers_scores ?? []).filter((s) => P.statuts_comptes.includes(s.statut));
  const joue = (s) => P.statuts_joues.includes(s.statut);
  const f5 = comptes.slice(0, 5), f15 = comptes.slice(0, 15);
  const J5 = f5.filter(joue).length, J15 = f15.filter(joue).length;

  // 1. Niveau quand il joue
  let m = null;
  if (J15 === 0 || !j.l15) alertes.push('aucun score sur 15 matchs : à vérifier');
  else if (J5 === 0) m = j.l15;
  else m = P.poids_l5 * (j.l5 ?? 0) + (1 - P.poids_l5) * j.l15;

  // 2. Probabilité de jouer
  let p = null;
  if (f15.length === 0) alertes.push('aucun match récent connu : à vérifier');
  else {
    const t5 = f5.length ? J5 / f5.length : 0;
    const t15 = J15 / f15.length;
    p = P.poids_jeu_recent * t5 + (1 - P.poids_jeu_recent) * t15;
  }

  const match = j.prochain_match;
  if (!match) alertes.push('pas de prochain match connu');
  else if (match.domicile == null) alertes.push('club absent du prochain match (sélection ?) : à vérifier');

  for (const b of j.blessures ?? []) {
    const retour = b.expectedEndDate;
    if (match && retour && new Date(retour) <= new Date(match.date)) {
      alertes.push(`retour de blessure prévu le ${retour.slice(0, 10)} (${b.kind ?? '?'}) : à vérifier`);
    } else {
      p = 0;
      alertes.push(`blessé (${b.kind ?? '?'}${retour ? `, retour prévu le ${retour.slice(0, 10)}` : ', retour inconnu'})`);
    }
  }
  for (const s of j.suspensions ?? []) {
    if (match && s.competition && match.competition && s.competition !== match.competition) {
      alertes.push(`suspendu en ${s.competition}, pas en ${match.competition} : à vérifier`);
    } else {
      p = 0;
      alertes.push(`suspendu${s.competition ? ` (${s.competition})` : ''} : à vérifier`);
    }
  }

  // 3. Bonus de collection
  let b = carte.bonus_collection?.multiplicateur;
  const nomBonus = carte.bonus_collection?.nom;
  if (b == null) {
    b = tableBonus[nomBonus] ?? 1;
    alertes.push(`bonus de collection absent de l'API : ${b} (repli) à vérifier`);
  } else if (nomBonus in tableBonus && Math.abs(tableBonus[nomBonus] - b) > 1e-9) {
    alertes.push(`bonus ${nomBonus} : API ×${b}, table ×${tableBonus[nomBonus]} — écart à signaler`);
  }

  // 4. Projection
  const siJoue = m == null ? null : m * b;
  const projection = !match || siJoue == null || p == null ? null : p * siJoue;

  // 5. Dispersion
  const joues = f15.filter(joue).map((s) => s.score);
  const sigma = joues.length >= P.min_scores_dispersion ? ecartType(joues) : null;

  return {
    carte: carte.carte,
    image: carte.image ?? null,
    nom: j.nom,
    postes: j.postes,
    club: j.club,
    tier: j.tier,
    etoiles: j.etoiles,
    bonus: carte.bonus_collection?.nom ?? null,
    b,
    l5: j.l5,
    l15: j.l15,
    joues_5: `${J5}/${f5.length}`,
    joues_15: `${J15}/${f15.length}`,
    m: arrondi(m, 1),
    p: arrondi(p, 2),
    si_joue: arrondi(siJoue, 1),
    projection: arrondi(projection, 1),
    sigma: arrondi(sigma, 1),
    match: match && {
      date: match.date, adversaire: match.adversaire, domicile: match.domicile,
      affiche: match.affiche, competition: match.competition, cotes: match.cotes_equipe ?? null,
    },
    sorare: j.sorare ?? null,
    alertes,
  };
}

export function projeter(donnees, P, tableBonus = lireTableBonus()) {
  const lignes = donnees.cartes.map((c) => projeterCarte(c, P, tableBonus));
  lignes.sort((a, b) => (b.projection ?? -1) - (a.projection ?? -1) || (b.si_joue ?? -1) - (a.si_joue ?? -1));
  return lignes;
}

async function principal() {
  const { dateDuJour } = await import('./recuperation.js');
  const { pageProjections } = await import('./page.js');
  const date = process.argv[2] ?? dateDuJour();
  const P = lireParametres();
  const sports = {};
  for (const sport of ['football', 'nba']) {
    const f = join(RACINE, 'data', `cartes-${sport}-${date}.json`);
    if (!existsSync(f)) { console.error(`Absent, ignoré : ${f}`); continue; }
    const d = JSON.parse(readFileSync(f, 'utf8'));
    sports[sport] = { slug: d.slug, recupere_le: d.recupere_le, lignes: projeter(d, P) };
  }
  if (!Object.keys(sports).length) throw new Error(`Aucune donnée pour le ${date} : lancer d'abord src/recuperation.js`);
  const sortie = join(RACINE, 'sorties', `projections-${date}.html`);
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, pageProjections({ date, parametres: P, sports }));
  console.error(`Écrit : ${sortie}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
