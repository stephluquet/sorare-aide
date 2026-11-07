// Page HTML autonome des projections (aucune ressource externe), lisible sur téléphone.
// Les données sont intégrées en JSON ; le tri et les filtres se font dans la page.

const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function pageProjections({ date, parametres, sports }) {
  const donnees = JSON.stringify({ date, parametres, sports }).replace(/</g, '\\u003c');
  const slug = Object.values(sports)[0]?.slug ?? '';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Projections Sorare ${echapper(date)}</title>
<style>
:root {
  --fond: #f7f7f5; --surface: #ffffff; --texte: #1d1d1b; --doux: #6b6b66; --ligne: #e3e2dd;
  --accent: #2f5bd3; --accent-doux: #e6ecfb; --alerte: #a15c00; --alerte-fond: #fff3df;
  --danger: #b3261e; --danger-fond: #fde8e6; --ok: #1d7a46;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --fond: #161615; --surface: #1f1f1d; --texte: #ecebe6; --doux: #a3a29b; --ligne: #34332f;
    --accent: #8fb0ff; --accent-doux: #25304d; --alerte: #f0b35a; --alerte-fond: #3a2c14;
    --danger: #ff8a80; --danger-fond: #3d1d1a; --ok: #6fd39b;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--fond); color: var(--texte);
  font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
header, .filtres, footer { padding: 12px 16px; }
h1 { font-size: 1.2rem; margin: 0 0 4px; }
.meta { color: var(--doux); font-size: .85rem; }
.onglets, .chips { display: flex; gap: 6px; flex-wrap: wrap; }
.onglets { margin-top: 10px; }
button { font: inherit; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte);
  border-radius: 999px; padding: 5px 12px; cursor: pointer; }
button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.filtres { display: grid; gap: 8px; position: sticky; top: 0; z-index: 3; background: var(--fond);
  border-bottom: 1px solid var(--ligne); }
@media (max-width: 640px) { .filtres { position: static; } }
.ligne-filtres { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; font-size: .9rem; }
input[type="search"] { font: inherit; padding: 5px 10px; border: 1px solid var(--ligne); border-radius: 8px;
  background: var(--surface); color: var(--texte); min-width: 0; flex: 1 1 140px; }
.compte { color: var(--doux); font-size: .85rem; }
.tableau { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; background: var(--surface); font-size: .88rem; }
th, td { padding: 7px 8px; border-bottom: 1px solid var(--ligne); text-align: right; white-space: nowrap; vertical-align: top; }
th { position: sticky; top: 0; background: var(--surface); font-weight: 600; cursor: pointer; user-select: none; }
th[data-tri]::after { content: " ▾"; color: var(--doux); }
th.asc::after { content: " ▴"; }
th:first-child, td:first-child { position: sticky; left: 0; background: var(--surface); text-align: left;
  z-index: 1; max-width: 46vw; white-space: normal; min-width: 130px; }
td.g, th.g { text-align: left; }
.nom { font-weight: 600; }
.sous { color: var(--doux); font-size: .8rem; }
.proj { font-weight: 700; color: var(--accent); }
.nul { color: var(--doux); }
.badge { display: inline-block; border-radius: 6px; padding: 1px 6px; margin: 1px 0; font-size: .78rem;
  background: var(--alerte-fond); color: var(--alerte); white-space: normal; text-align: left; }
.badge.danger { background: var(--danger-fond); color: var(--danger); }
.alertes { min-width: 200px; white-space: normal; text-align: left; }
footer { color: var(--doux); font-size: .85rem; max-width: 70ch; }
footer code { font-size: .8rem; }
</style>
</head>
<body>
<header>
  <h1>Projections Sorare · ${echapper(slug)}</h1>
  <div class="meta" id="meta"></div>
  <div class="onglets" id="onglets" role="group" aria-label="Sport"></div>
</header>
<div class="filtres">
  <div class="chips" id="postes" role="group" aria-label="Poste"></div>
  <div class="ligne-filtres">
    <input type="search" id="recherche" placeholder="Joueur ou club…" aria-label="Rechercher">
    <label><input type="checkbox" id="dispo" checked> masquer les indisponibles</label>
    <label><input type="checkbox" id="avecAlertes"> seulement « à vérifier »</label>
    <span class="compte" id="compte"></span>
  </div>
</div>
<div class="tableau">
<table>
  <thead><tr>
    <th class="g" data-col="nom">Joueur</th>
    <th data-col="projection">Proj.</th>
    <th data-col="si_joue">Si joue</th>
    <th data-col="p">p jeu</th>
    <th data-col="l5">L5</th>
    <th data-col="l15">L15</th>
    <th data-col="sigma">σ</th>
    <th data-col="b">Bonus</th>
    <th data-col="etoiles">Tier</th>
    <th class="g" data-col="date">Prochain match</th>
    <th data-col="victoire">V / N / D</th>
    <th data-col="sorare">Sorare</th>
    <th class="g">À vérifier</th>
  </tr></thead>
  <tbody id="corps"></tbody>
</table>
</div>
<footer id="pied"></footer>
<script type="application/json" id="donnees">${donnees}</script>
<script>
(() => {
  const D = JSON.parse(document.getElementById('donnees').textContent);
  const POSTES = { football: ['GK', 'DF', 'MD', 'FW'], nba: ['G', 'F', 'C'] };
  const NOMS = { football: 'Football', nba: 'NBA' };
  const fmtDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtJour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });
  const nb = (x, d = 0) => x == null ? '<span class="nul">–</span>' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const etat = { sport: Object.keys(D.sports)[0], poste: null, tri: 'projection', asc: false };

  const valeur = (l, col) => ({
    nom: l.nom, date: l.match?.date ?? '9999', victoire: l.match?.cotes?.victoire ?? -1,
    sorare: l.sorare?.projection ?? -1,
  })[col] ?? l[col] ?? -1;

  function onglets() {
    const el = document.getElementById('onglets');
    el.innerHTML = Object.keys(D.sports).map((s) =>
      '<button data-sport="' + s + '" aria-pressed="' + (s === etat.sport) + '">' + NOMS[s] + ' (' + D.sports[s].lignes.length + ')</button>').join('');
    el.onclick = (e) => { const s = e.target.dataset.sport; if (s) { etat.sport = s; etat.poste = null; tout(); } };
  }
  function postes() {
    const el = document.getElementById('postes');
    el.innerHTML = [null, ...POSTES[etat.sport]].map((p) =>
      '<button data-poste="' + (p ?? '') + '" aria-pressed="' + (p === etat.poste) + '">' + (p ?? 'Tous postes') + '</button>').join('');
    el.onclick = (e) => { if (e.target.dataset.poste !== undefined) { etat.poste = e.target.dataset.poste || null; postes(); lignes(); } };
  }
  function lignes() {
    const S = D.sports[etat.sport];
    const q = document.getElementById('recherche').value.trim().toLowerCase();
    const dispo = document.getElementById('dispo').checked;
    const avecAlertes = document.getElementById('avecAlertes').checked;
    let L = S.lignes.filter((l) =>
      (!etat.poste || l.postes.includes(etat.poste)) &&
      (!q || (l.nom + ' ' + (l.club ?? '')).toLowerCase().includes(q)) &&
      (!dispo || (l.p !== 0 && l.projection != null)) &&
      (!avecAlertes || l.alertes.length));
    const s = etat.asc ? 1 : -1;
    L.sort((a, b) => { const x = valeur(a, etat.tri), y = valeur(b, etat.tri);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * s; });
    document.getElementById('compte').textContent = L.length + ' cartes';
    document.getElementById('corps').innerHTML = L.map((l) => {
      const m = l.match, c = m?.cotes;
      const lieu = m ? (m.domicile === true ? 'vs ' : m.domicile === false ? '@ ' : '') : '';
      const adv = m ? (m.adversaire ?? m.affiche) : 'aucun connu';
      const tier = (l.tier ?? '–').replace('_PLUS', '+') + (l.etoiles != null ? ' · ' + nb(l.etoiles, 1) + '★' : '');
      const so = l.sorare ? [l.sorare.statut_jeu, l.sorare.projection != null ? nb(l.sorare.projection, 0) : null].filter(Boolean).join(' · ') : '';
      const badges = l.alertes.map((a) => '<span class="badge' + (/^(blessé|suspendu)/.test(a) ? ' danger' : '') + '">' + esc(a) + '</span>').join(' ');
      return '<tr>' +
        '<td><div class="nom">' + esc(l.nom) + '</div><div class="sous">' + esc(l.postes.join('/')) + ' · ' + esc(l.club ?? '?') + '</div></td>' +
        '<td class="proj">' + nb(l.projection, 1) + '</td>' +
        '<td>' + nb(l.si_joue, 1) + '</td>' +
        '<td title="joués : ' + l.joues_5 + ' sur 5, ' + l.joues_15 + ' sur 15">' + (l.p == null ? nb(null) : Math.round(l.p * 100) + ' %') + '<div class="sous">' + l.joues_15 + '</div></td>' +
        '<td>' + nb(l.l5) + '</td><td>' + nb(l.l15) + '</td><td>' + nb(l.sigma, 1) + '</td>' +
        '<td>' + (l.b === 1 ? '<span class="nul">–</span>' : '+' + Math.round((l.b - 1) * 100) + ' %<div class="sous">' + esc(l.bonus) + '</div>') + '</td>' +
        '<td>' + tier + '</td>' +
        '<td class="g">' + (m ? esc(fmtDate.format(new Date(m.date))) : '') + '<div class="sous">' + lieu + esc(adv) + (m?.competition ? ' · ' + esc(m.competition) : '') + '</div></td>' +
        '<td>' + (c ? Math.round(c.victoire * 100) + ' / ' + Math.round(c.nul * 100) + ' / ' + Math.round(c.defaite * 100) : '<span class="nul">–</span>') + '</td>' +
        '<td>' + (so || '<span class="nul">–</span>') + '</td>' +
        '<td class="alertes">' + badges + '</td></tr>';
    }).join('');
    document.querySelectorAll('th[data-col]').forEach((th) => {
      th.toggleAttribute('data-tri', th.dataset.col === etat.tri);
      th.classList.toggle('asc', th.dataset.col === etat.tri && etat.asc);
    });
  }
  function tout() {
    const S = D.sports[etat.sport];
    document.getElementById('meta').textContent =
      'Données Sorare du ' + fmtJour.format(new Date(S.recupere_le)) + ' · méthode v' + D.parametres.version;
    onglets(); postes(); lignes();
  }
  document.querySelector('thead').onclick = (e) => {
    const col = e.target.closest('th')?.dataset.col; if (!col) return;
    if (etat.tri === col) etat.asc = !etat.asc; else { etat.tri = col; etat.asc = col === 'nom' || col === 'date'; }
    lignes();
  };
  ['recherche', 'dispo', 'avecAlertes'].forEach((id) => document.getElementById(id).addEventListener('input', lignes));
  const P = D.parametres;
  document.getElementById('pied').innerHTML =
    '<p><strong>Lecture.</strong> <em>Proj.</em> = p jeu × niveau × bonus : score attendu au prochain match (0 s’il ne joue pas). ' +
    '<em>Si joue</em> = niveau × bonus, avec niveau = ' + P.poids_l5 + ' × L5 + ' + (1 - P.poids_l5).toFixed(1) + ' × L15 (L15 seul si aucun match joué sur les 5 derniers). ' +
    '<em>p jeu</em> = part des matchs joués, ' + P.poids_jeu_recent + ' × (5 derniers) + ' + (1 - P.poids_jeu_recent).toFixed(1) + ' × (15 derniers), mise à 0 si blessé ou suspendu. ' +
    '<em>σ</em> = écart-type des scores joués sur 15 matchs. ' +
    'Cotes V / N / D et colonne <em>Sorare</em> (statut et projection de Sorare) : affichées pour information, hors calcul.</p>' +
    '<p>Méthode complète et limites : <code>methode.md</code>. Poids initiaux non calibrés. L’outil propose, tu décides dans l’appli Sorare.</p>';
  tout();
})();
</script>
</body>
</html>
`;
}
