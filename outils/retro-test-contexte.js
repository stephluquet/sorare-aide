// Rétro-tests du contexte des matchs (cotes, forme, repos) sur l'archive data/historique.
// Pour chaque match, on compare le score réel au niveau habituel du joueur, estimé sur
// ses seuls matchs PLUS ANCIENS (hors échantillon), et on regarde si le contexte explique l'écart.
// Usage : node outils/retro-test-contexte.js football|nba
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const sport = process.argv[2] ?? 'nba';
const JOUE = new Set(['titulaire', 'entre', 'joue']);
const dossier = join(RACINE, 'data/historique', sport);
const archives = readdirSync(dossier).map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')).matchs
  .filter((m) => ['FINAL', 'DID_NOT_PLAY'].includes(m.statut) && m.situation !== 'inconnu'));

const moy = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
function corr(x, y) {
  const mx = moy(x), my = moy(y);
  let n = 0, a = 0, b = 0;
  x.forEach((v, i) => { n += (v - mx) * (y[i] - my); a += (v - mx) ** 2; b += (y[i] - my) ** 2; });
  return n / Math.sqrt(a * b);
}
// Moyenne pondérée des scores joués plus anciens (demi-vie 10 matchs), au moins 5.
function niveau(anciens, champ = 'score') {
  const j = anciens.filter((m) => JOUE.has(m.situation) && m.statut === 'FINAL' && m[champ] != null).slice(0, 30);
  if (j.length < 5) return null;
  let s = 0, d = 0;
  j.forEach((m, i) => { const w = 0.5 ** (i / 10); s += w * m[champ]; d += w; });
  return s / d;
}

// Jours entre deux matchs, sur les dates de New York (NBA) ou de Paris (football).
const fuseau = sport === 'nba' ? 'America/New_York' : 'Europe/Paris';
const jour = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: fuseau }).format(new Date(iso));
const ecartJours = (a, b) => Math.round((Date.parse(jour(a)) - Date.parse(jour(b))) / 86400000);

if (sport === 'nba') {
  // Repos : jours depuis le match précédent de l'équipe (1 = deuxième soir consécutif).
  const parRepos = {};
  for (const ms of archives) for (let k = 0; k + 6 < ms.length; k++) {
    const c = ms[k], prec = ms[k + 1];
    const repos = Math.min(ecartJours(c.date, prec.date), 4);
    const p = parRepos[repos] ??= { n: 0, joue: 0, ecartsScore: [], ecartsMin: [], dejaJoueVeille: 0, nVeille: 0 };
    const nv = niveau(ms.slice(k + 1)), nm = niveau(ms.slice(k + 1), 'minutes');
    if (nv == null) continue;
    // on ne regarde que les joueurs qui jouaient régulièrement (joué au moins 4 des 5 matchs précédents)
    if (ms.slice(k + 1, k + 6).filter((m) => JOUE.has(m.situation)).length < 4) continue;
    p.n++; p.joue += JOUE.has(c.situation);
    if (JOUE.has(c.situation) && c.statut === 'FINAL') { p.ecartsScore.push(c.score - nv); if (c.minutes != null && nm != null) p.ecartsMin.push(c.minutes - nm); }
    if (repos === 1) { p.nVeille++; p.dejaJoueVeille += JOUE.has(prec.situation); }
  }
  console.log('NBA, joueurs réguliers (au moins 4 des 5 derniers matchs joués) — selon les jours de repos de l’équipe :');
  for (const [r, p] of Object.entries(parRepos)) {
    console.log(`  ${r === '4' ? '4 j ou plus' : `${r} j`.padEnd(11)} : ${String(p.n).padStart(5)} matchs | joue ${fmt(100 * p.joue / p.n)} % | score ${fmt(moy(p.ecartsScore), 2)} pts vs habitude | minutes ${fmt(moy(p.ecartsMin), 2)}`);
  }
}

if (sport === 'football') {
  // Postes actuels des joueurs (data/dernier.json) ; joueurs pairs/impairs pour estimer puis vérifier.
  const postes = Object.fromEntries(JSON.parse(readFileSync(join(RACINE, 'data', 'dernier.json'), 'utf8')).joueurs.map((j) => [j.id, j.postes[0]]));
  const fichiers = readdirSync(dossier);
  const lignes = [];
  fichiers.forEach((f, idx) => {
    const ms = archives[idx], poste = postes[f.replace(/\.json$/, '')];
    if (!poste) return;
    for (let k = 0; k + 6 < ms.length; k++) {
      const c = ms[k];
      if (c.situation !== 'titulaire' || c.statut !== 'FINAL' || !c.cotes) continue;
      const nv = niveau(ms.slice(k + 1).filter((m) => m.situation === 'titulaire'));
      if (nv == null) continue;
      const prec = ms.slice(k + 1).filter((m) => m.pour != null && m.contre != null).slice(0, 5);
      const forme = prec.length === 5 ? prec.reduce((s2, m) => s2 + (m.pour > m.contre ? 3 : m.pour === m.contre ? 1 : 0), 0) / 15 : null;
      lignes.push({ poste, moitie: idx % 2, ecart: c.score - nv, v: c.cotes.victoire, cs: c.cotes.coteCleanSheet ? 1 / c.cotes.coteCleanSheet : null, forme });
    }
  });
  console.log(`football : ${lignes.length} matchs comme titulaire avec cotes (${fichiers.length} joueurs)`);
  // Régression simple écart ~ b × (x − x̄) estimée sur une moitié, erreur absolue sur l'autre.
  const pente = (L, cle) => { const xs = L.map((l) => l[cle]), ys = L.map((l) => l.ecart); const mx = moy(xs), my = moy(ys);
    let a = 0, b = 0; xs.forEach((x, i) => { a += (x - mx) * (ys[i] - my); b += (x - mx) ** 2; }); return { b: a / b, mx, my }; };
  for (const poste of ['GK', 'DF', 'MD', 'FW']) {
    const L = lignes.filter((l) => l.poste === poste);
    const res = [`  ${poste} (${L.length})`];
    for (const cle of ['v', 'cs', 'forme']) {
      const LL = L.filter((l) => l[cle] != null);
      const app = LL.filter((l) => l.moitie === 0), val = LL.filter((l) => l.moitie === 1);
      const m = pente(app, cle);
      const sans = moy(val.map((l) => Math.abs(l.ecart - m.my)));
      const avec = moy(val.map((l) => Math.abs(l.ecart - (m.my + m.b * (l[cle] - m.mx)))));
      res.push(`${cle === 'v' ? 'victoire' : cle === 'cs' ? 'clean sheet' : 'forme'} : corr ${fmt(corr(LL.map((l) => l[cle]), LL.map((l) => l.ecart)), 2)}, pente ${fmt(m.b, 1)} pts/unité, erreur ${fmt(sans, 2)} → ${fmt(avec, 2)}`);
    }
    // la forme apporte-t-elle quelque chose une fois la cote connue ? corrélation de la forme avec le résidu après cote
    const LF = L.filter((l) => l.forme != null), mv = pente(LF, 'v');
    const resid = LF.map((l) => l.ecart - (mv.my + mv.b * (l.v - mv.mx)));
    res.push(`forme une fois la cote connue : corr ${fmt(corr(LF.map((l) => l.forme), resid), 2)}`);
    console.log(res.join(' | '));
  }
  // pentes sur tout l'échantillon (pour methode.md)
  for (const poste of ['GK', 'DF', 'MD', 'FW']) {
    const L = lignes.filter((l) => l.poste === poste), m = pente(L, 'v');
    const LC = L.filter((l) => l.cs != null), mc = pente(LC, 'cs');
    console.log(`  pente complète ${poste} : victoire ${fmt(m.b, 2)} (moyenne ${fmt(m.mx, 3)}) | clean sheet ${fmt(mc.b, 2)} (moyenne ${fmt(mc.mx, 3)})`);
  }
}
