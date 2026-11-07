// Interface : Accueil, Propositions (football, NBA) et Mes cartes (maquette A retenue le 2026-11-07).
// Fonctionne dans l'artifact (données intégrées dans #donnees) et hors artifact
// (données lues dans donnees-app.json à côté de la page). Le moteur v2 tourne ici,
// dans le navigateur ; méthode et règles viennent des données (methode.md, regles/).
//
// État de l'utilisateur (cartes jouées au palier en cours, seuil) : capacité `db`
// de l'artifact (document privé data/users/<id>/etat, partagé entre appareils),
// sinon stockage du navigateur.

import { projeterCarte } from '../src/moteur/projection.js';
import { proposer } from '../src/moteur/compositions.js';

// ---------- Données ----------
const STATUTS_CODES = { F: 'FINAL', R: 'REVIEWING', D: 'DID_NOT_PLAY' };
const SITUATIONS_CODES = { t: 'titulaire', e: 'entre', j: 'joue', b: 'banc', a: 'absent', i: 'inconnu' };

async function chargerDonnees() {
  const integre = JSON.parse(document.getElementById('donnees').textContent);
  if (integre) return integre;
  const rep = await fetch('donnees-app.json');
  if (!rep.ok) throw new Error(`Données introuvables (${rep.status})`);
  return rep.json();
}

// Historique compact [date, statut, situation, score, minutes] → objets attendus par le moteur.
function deplier(joueur) {
  return {
    ...joueur,
    historique: joueur.h.map(([date, st, si, score, minutes]) => ({
      date, statut: STATUTS_CODES[st], situation: SITUATIONS_CODES[si], score, minutes,
    })),
  };
}

// ---------- Mise en forme ----------
const SPORTS = { football: 'Football', nba: 'NBA' };
const POSTES = { football: ['GK', 'DF', 'MD', 'FW'], nba: ['G', 'F', 'C'] };
const LIBELLES = { probable: 'Probable', incertain: 'Incertain', douteux: 'Douteux', exclu: 'Exclu' };
const SIT = { titulaire: 'titulaire', entre: 'entré', joue: 'joué', banc: 'banc', absent: 'absent', inconnu: '?' };
const tz = { timeZone: 'Europe/Paris' };
const fJour = new Intl.DateTimeFormat('fr-FR', { ...tz, weekday: 'short', day: 'numeric', month: 'short' });
const fHeure = new Intl.DateTimeFormat('fr-FR', { ...tz, hour: '2-digit', minute: '2-digit' });
const fCle = new Intl.DateTimeFormat('fr-FR', { ...tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nb = (x, d = 0) => (x == null ? '–' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const quand = (d) => `${fJour.format(new Date(d))} ${fHeure.format(new Date(d))}`;
const $ = (id) => document.getElementById(id);

// ---------- État de l'utilisateur ----------
const CLE_LOCALE = 'sorare-aide-etat';
const etatVide = () => ({ seuil: null, football: { cible: null, jouees: [] }, nba: { cible: null, jouees: [] } });

function creerStockage() {
  let doc = null, mode = 'navigateur', ecriture = Promise.resolve();
  const lireLocal = () => { try { return JSON.parse(localStorage.getItem(CLE_LOCALE) || 'null'); } catch (e) { return null; } };
  const ecrireLocal = (v) => { try { localStorage.setItem(CLE_LOCALE, JSON.stringify(v)); } catch (e) { /* stockage refusé : on garde l'état en mémoire */ } };
  return {
    get mode() { return mode; },
    // Branche la base de l'artifact si elle est disponible ; appelle `recevoir` à chaque changement.
    async brancher(recevoir) {
      recevoir(lireLocal() ?? etatVide());
      const claude = window.claude;
      if (!claude?.use) return;
      const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      const id = db && user ? await user.id() : null;
      if (!db || !id) return;
      doc = db.doc(`data/users/${id}/etat`);
      mode = 'compte';
      doc.onSnapshot(
        (snap) => { if (snap.exists) { const v = snap.data(); ecrireLocal(v); recevoir(v); } },
        () => { doc = null; mode = 'navigateur'; },
      );
    },
    // Une écriture à la fois, seulement sur une action de l'utilisateur.
    enregistrer(v) {
      ecrireLocal(v);
      if (!doc) return;
      ecriture = ecriture.then(() => doc.set(structuredClone(v))).catch(() => { doc = null; mode = 'navigateur'; afficherStockage(); });
    },
  };
}

// ---------- Application ----------
const D = await chargerDonnees().catch((e) => { $('age').textContent = `Impossible de charger les données : ${e.message}`; throw e; });
const joueurs = new Map(D.joueurs.map((j) => [j.id, deplier(j)]));
const matchs = new Map(D.matchs.map((m) => [m.id, m]));
const stockage = creerStockage();
let etatUtilisateur = etatVide();

// Palier en cours d'un sport : le plus bas qui n'est pas passé.
const palierEnCours = (sport) => D.paliers.filter((p) => p.sport === sport && !['CLAIMED', 'CLAIMABLE'].includes(p.etat))
  .sort((a, b) => a.niveau - b.niveau)[0] ?? null;

// Cartes jouées valables pour le palier en cours (libérées dès que le palier change).
function jouees(sport) {
  const e = etatUtilisateur[sport], p = palierEnCours(sport);
  return new Set(e && p && e.cible === p.cible ? e.jouees : []);
}

function seuil() { return etatUtilisateur.seuil ?? D.P.seuil_jouer; }

// Projection de toutes les cartes (une fois ; le seuil n'intervient qu'à l'affichage).
const lignes = D.cartes.map((c) => {
  const j = joueurs.get(c.joueurId);
  const m = matchs.get(j?.prochainMatchId) ?? null;
  const pr = projeterCarte(c, j, m, D.P, D.regles[c.sport]);
  const club = j.club?.slug;
  const lieu = m ? (m.domicile?.slug === club ? 'dom' : m.exterieur?.slug === club ? 'ext' : null) : null;
  return { c, j, m, pr, lieu, adv: m ? (lieu === 'dom' ? m.exterieur?.nom : lieu === 'ext' ? m.domicile?.nom : `${m.domicile?.nom} – ${m.exterieur?.nom}`) : null,
    cotes: m?.cotes ? (lieu === 'dom' ? m.cotes.domicile : lieu === 'ext' ? m.cotes.exterieur : null) : null };
});

function statut(l) {
  if (l.pr.statut !== 'ok') return l.pr.statut;
  return l.pr.p != null && l.pr.p >= seuil() ? 'probable' : 'incertain';
}
const disponible = (l) => statut(l) === 'probable' && l.pr.eligibleArcade && l.pr.siJoue != null && !jouees(l.c.sport).has(l.c.id);

const vue = { sport: 'football', poste: null, creneau: '', tri: 'e', dispo: true };

// ---------- Propositions (calculées dans le navigateur, mises en cache) ----------
const cache = new Map();
function propositions(sport) {
  const palier = palierEnCours(sport); if (!palier) return null;
  const J = jouees(sport);
  const cle = [sport, palier.cible, seuil(), [...J].sort().join(','), Math.floor(Date.now() / 60000)].join('|');
  if (!cache.has(cle)) {
    const t0 = performance.now();
    const L = lignes.filter((l) => l.c.sport === sport).map((l) => ({ carte: l.c, joueur: l.j, match: l.m, projection: l.pr }));
    const r = proposer(L, D.P, { sport, cible: palier.cible, regle: D.regles[sport], seuil: seuil(), jouees: J, maintenant: Date.now() });
    r.dureeMs = performance.now() - t0;
    cache.set(cle, r);
  }
  return cache.get(cle);
}
// Calcul différé : attend que la page soit réellement affichée (deux images), puis
// enchaîne les calculs un par un pour ne jamais bloquer l'affichage longtemps.
let file = Promise.resolve();
const apresAffichage = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0))));
const plusTard = (f) => (file = file.then(apresAffichage).then(f));
const cleCreneau = (d) => fCle.format(new Date(d));

function afficherAge() {
  const t = new Date(D.meta.recupereA), min = Math.round((Date.now() - t) / 60000);
  const txt = min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  $('age').textContent = `Données Sorare de ${fHeure.format(t)} le ${fJour.format(t)} · ${txt} · méthode v${D.P.version}`;
  $('bandeau').hidden = min < 180;
  $('bandeau').textContent = 'Données de plus de 3 h : écris « actualise » à Claude avant de composer.';
}

function afficherPaliers() {
  $('paliers').innerHTML = ['football', 'nba'].map((s) => {
    const p = palierEnCours(s); if (!p) return '';
    const n = jouees(s).size;
    return `<div class="palier">${SPORTS[s]} · palier <b>${p.cible}</b> · ${p.etat === 'LINEUP_SET' ? 'composition posée' : 'à jouer'}` +
      `${p.echecs ? ` · ${p.echecs} échec${p.echecs > 1 ? 's' : ''}` : ''}${n ? ` · ${n} carte${n > 1 ? 's' : ''} jouée${n > 1 ? 's' : ''}` : ''}</div>`;
  }).join('');
  const liberees = ['football', 'nba'].filter((s) => { const e = etatUtilisateur[s], p = palierEnCours(s); return e?.jouees?.length && p && e.cible !== p.cible; });
  $('note-palier').hidden = !liberees.length;
  $('note-palier').textContent = liberees.length ? `Palier passé en ${liberees.map((s) => SPORTS[s]).join(' et ')} : les cartes jouées sont de nouveau disponibles.` : '';
}

function afficherStockage() {
  $('stockage').textContent = stockage.mode === 'compte'
    ? 'Cartes jouées et seuil enregistrés sur ton compte (iPhone et PC).'
    : 'Cartes jouées et seuil enregistrés dans ce navigateur seulement.';
}

function commandes() {
  $('sports').innerHTML = Object.entries(SPORTS).map(([k, v]) =>
    `<button type="button" data-sport="${k}" aria-pressed="${k === vue.sport}">${v}</button>`).join('');
  $('postes').innerHTML = [null, ...POSTES[vue.sport]].map((p) =>
    `<button type="button" class="puce" data-poste="${p ?? ''}" aria-pressed="${p === vue.poste}">${p ?? 'Tous postes'}</button>`).join('');
  const creneaux = new Map();
  for (const l of lignes) if (l.c.sport === vue.sport && l.m && disponible(l)) {
    const k = cleCreneau(l.m.debutUTC); creneaux.set(k, [l.m.debutUTC, (creneaux.get(k)?.[1] ?? 0) + 1]);
  }
  if (vue.creneau && !creneaux.has(vue.creneau)) vue.creneau = '';
  $('creneau').innerHTML = '<option value="">Tous les créneaux</option>' + [...creneaux.entries()].sort((a, b) => a[1][0].localeCompare(b[1][0]))
    .map(([k, [d, n]]) => `<option value="${k}" ${k === vue.creneau ? 'selected' : ''}>${quand(d)} (${n})</option>`).join('');
  $('seuil').value = String(seuil());
}

function vignette(l) {
  const img = D.vignettes[l.c.id];
  return img ? `<img class="vig" src="${img}" alt="" loading="lazy">`
    : `<div class="vig" aria-hidden="true">${esc(l.j.nom.split(' ').map((x) => x[0]).slice(0, 2).join(''))}</div>`;
}

function jauge(p) {
  const r = 9, c = 2 * Math.PI * r, v = p ?? 0;
  const coul = p == null ? 'var(--vide)' : v >= seuil() ? 'var(--ok)' : v >= 0.5 ? 'var(--attention)' : 'var(--stop)';
  return `<span class="jauge"><svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="${r}" fill="none" stroke="var(--trait)" stroke-width="3"/>` +
    `<circle cx="11" cy="11" r="${r}" fill="none" stroke="${coul}" stroke-width="3" stroke-dasharray="${c * v} ${c}"/></svg>${p == null ? '?' : Math.round(v * 100) + ' %'}</span>`;
}

function liste() {
  const J = jouees(vue.sport);
  const L = lignes.filter((l) => l.c.sport === vue.sport && (!vue.poste || l.j.postes.includes(vue.poste)) &&
    (!vue.dispo || disponible(l)) && (!vue.creneau || (l.m && cleCreneau(l.m.debutUTC) === vue.creneau)));
  const tri = { e: (a, b) => (b.pr.esperance ?? -1) - (a.pr.esperance ?? -1), p: (a, b) => (b.pr.p ?? -1) - (a.pr.p ?? -1),
    d: (a, b) => (a.m?.debutUTC ?? '9').localeCompare(b.m?.debutUTC ?? '9') }[vue.tri];
  L.sort(tri);
  $('compte').textContent = `${L.length} carte${L.length > 1 ? 's' : ''}`;
  if (!L.length) { $('liste').innerHTML = '<div class="vide-liste">Aucune carte ne correspond. Décoche « disponibles seulement » pour tout voir.</div>'; return; }
  $('liste').innerHTML = L.slice(0, 200).map((l) => {
    const st = statut(l), m = l.m, c = l.c;
    const match = m ? `${quand(m.debutUTC)} · ${l.lieu === 'ext' ? '@ ' : l.lieu === 'dom' ? 'vs ' : ''}${esc(l.adv ?? '?')}` : 'pas de match connu';
    return `<button type="button" class="ligne${J.has(c.id) ? ' bloquee' : ''}" data-id="${esc(c.id)}">
      ${vignette(l)}
      <div style="min-width:0">
        <div class="nom">${esc(l.j.nom)}</div>
        <div class="meta"><span>${esc(l.j.postes.join('/'))} · ${esc(l.j.club?.nom ?? '?')}</span><span>${match}</span></div>
        <div class="puces">
          <span class="etiq ${st}">${LIBELLES[st]}</span>
          ${c.bonusPct ? `<span class="etiq bonus">${esc(c.collection)} +${nb(c.bonusPct)} %</span>` : ''}
          ${!l.pr.eligibleArcade && m ? '<span class="etiq exclu">hors Arcade</span>' : ''}
          ${J.has(c.id) ? '<span class="etiq neutre">jouée à ce palier</span>' : ''}
        </div>
      </div>
      <div class="chiffres">
        <div class="esp">${nb(l.pr.esperance)}<small>espérance</small></div>
        ${jauge(l.pr.p)}
      </div>
    </button>`;
  }).join('');
}

function histogramme(l) {
  const h = l.j.historique.slice(0, 15).reverse();
  if (!h.length) return '<p class="sous">Pas d’historique.</p>';
  const W = 320, H = 120, pas = W / h.length, max = Math.max(80, ...h.map((x) => x.score ?? 0));
  const barres = h.map((x, i) => {
    const bx = i * pas + 2, w = pas - 4;
    if (!['titulaire', 'entre', 'joue'].includes(x.situation) || x.statut === 'DID_NOT_PLAY') {
      return `<rect x="${bx}" y="${H - 4}" width="${w}" height="3" fill="var(--vide)"/><text x="${bx + w / 2}" y="${H - 8}" text-anchor="middle" font-size="9" fill="var(--doux)">${x.situation === 'banc' ? 'B' : 'A'}</text>`;
    }
    const hh = Math.max(2, (x.score / max) * (H - 16));
    return `<rect x="${bx}" y="${H - hh}" width="${w}" height="${hh}" rx="2" fill="${x.situation === 'entre' ? 'var(--entre)' : 'var(--titulaire)'}">` +
      `<title>${x.date.slice(0, 10)} : ${Math.round(x.score)} pts${x.minutes != null ? `, ${x.minutes} min` : ''} (${SIT[x.situation]})</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scores des ${h.length} derniers matchs, du plus ancien au plus récent">${barres}` +
    `<line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="var(--trait)"/></svg>`;
}

function fiche(id) {
  const l = lignes.find((x) => x.c.id === id); if (!l) return;
  const { c, j, m, pr } = l, s = pr.score, st = statut(l), J = jouees(c.sport), palier = palierEnCours(c.sport);
  const cotes = l.cotes ? `${Math.round(l.cotes.victoire * 100)} / ${Math.round(l.cotes.nul * 100)} / ${Math.round(l.cotes.defaite * 100)} %` : '–';
  const v = $('voile');
  v.innerHTML = `<div class="volet" role="dialog" aria-modal="true" aria-label="${esc(j.nom)}">
    <div class="volet-tete">${vignette(l)}<div style="min-width:0">
      <h2>${esc(j.nom)}</h2>
      <div class="sous">${esc(j.postes.join('/'))} · ${esc(j.club?.nom ?? '?')} · ${esc((j.tier ?? '').replace('_PLUS', '+'))}${j.etoiles != null ? ` · ${nb(j.etoiles, 1)} ★` : ''}</div>
      <div class="puces" style="margin-top:6px"><span class="etiq ${st}">${LIBELLES[st]}</span>${c.bonusPct ? `<span class="etiq bonus">${esc(c.collection)} +${nb(c.bonusPct)} %</span>` : ''}${j.statutSorare ? `<span class="etiq neutre">Sorare : ${esc(j.statutSorare)}</span>` : ''}</div>
      <div class="sous" style="margin-top:8px">${m ? `${quand(m.debutUTC)} · ${esc(m.competition ?? '')} · ${l.lieu === 'ext' ? 'à l’extérieur contre' : l.lieu === 'dom' ? 'à domicile contre' : ''} ${esc(l.adv ?? '?')}` : 'Pas de match connu'}</div>
    </div></div>
    <div class="grille">
      <div class="case-chiffre"><span>Espérance</span><b>${nb(pr.esperance, 1)}</b></div>
      <div class="case-chiffre"><span>Chances de jouer</span><b>${pr.p == null ? '?' : Math.round(pr.p * 100) + ' %'}</b></div>
      <div class="case-chiffre"><span>S'il joue</span><b>${nb(pr.siJoue)} ± ${nb(s.sigma == null ? null : s.sigma * pr.bonus)}</b></div>
      ${c.sport === 'football' ? `<div class="case-chiffre"><span>Titulaire quand il joue</span><b>${s.q == null ? '–' : Math.round(s.q * 100) + ' %'}</b></div>`
        : `<div class="case-chiffre"><span>Minutes récentes</span><b>${nb(s.minutes)}</b></div>`}
      ${c.sport === 'football' ? `<div class="case-chiffre"><span>Victoire / nul / défaite</span><b style="font-size:1.05rem">${cotes}</b></div>` : ''}
    </div>
    <div class="histo"><div class="sous" style="margin-bottom:4px">Derniers matchs de l'équipe (du plus ancien au plus récent)</div>${histogramme(l)}
      <div class="legende"><span><i style="background:var(--titulaire)"></i>${c.sport === 'nba' ? 'joué' : 'titulaire'}</span>${c.sport === 'football' ? '<span><i style="background:var(--entre)"></i>entré en jeu</span>' : ''}<span>B banc · A absent</span></div></div>
    ${pr.raisons.length ? `<ul class="raisons">${pr.raisons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="actions">
      ${palier ? `<button type="button" class="bouton principal" id="basculer">${J.has(c.id) ? 'Remettre disponible' : `Jouée au palier ${palier.cible}`}</button>` : ''}
      <button type="button" class="bouton" id="fermer">Fermer</button>
    </div></div>`;
  v.hidden = false;
  v.querySelector('#fermer').focus();
  v.querySelector('#fermer').onclick = () => { v.hidden = true; };
  const b = v.querySelector('#basculer');
  if (b) b.onclick = () => { basculer(c.sport, c.id); v.hidden = true; };
  v.onclick = (e) => { if (e.target === v) v.hidden = true; };
}

function basculer(sport, id) {
  const p = palierEnCours(sport); if (!p) return;
  const ensemble = jouees(sport);
  ensemble.has(id) ? ensemble.delete(id) : ensemble.add(id);
  etatUtilisateur = { ...etatUtilisateur, [sport]: { cible: p.cible, jouees: [...ensemble], misAJour: new Date().toISOString() } };
  stockage.enregistrer(etatUtilisateur);
  tout();
}

// ---------- Accueil ----------
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)} %`);
const ETATS = { LINEUP_SET: 'composition posée', PLAYABLE: 'à jouer', LIVE: 'en cours', FAILED: 'échoué', LOCKED: 'verrouillé' };

function afficherAccueil() {
  $('blocs').innerHTML = ['football', 'nba'].map((s) => {
    const p = palierEnCours(s), n = jouees(s).size;
    if (!p) return `<div class="bloc"><h2>${SPORTS[s]}</h2><div class="resume">Tous les paliers de ce plateau sont passés.</div></div>`;
    return `<div class="bloc">
      <h2>${SPORTS[s]}<span class="sous">palier ${p.niveau + 1} sur ${D.paliers.filter((x) => x.sport === s).length}</span></h2>
      <div><span class="cible">${p.cible}</span> <span class="sous">points à atteindre</span></div>
      <div class="resume">${ETATS[p.etat] ?? esc(p.etat)}${p.echecs ? ` · ${p.echecs} échec${p.echecs > 1 ? 's' : ''}` : ''} · ${n ? `${n} carte${n > 1 ? 's' : ''} déjà jouée${n > 1 ? 's' : ''}` : 'aucune carte marquée jouée'}</div>
      <div class="resume" id="resume-${s}">Calcul de la meilleure équipe…</div>
      <a class="bouton principal lien" href="#propositions-${s}">Voir les propositions</a>
    </div>`;
  }).join('');
  for (const s of ['football', 'nba']) {
    if (!palierEnCours(s)) continue;
    plusTard(() => propositions(s)).then((r) => {
      const el = $(`resume-${s}`); if (!el) return;
      const e = r?.prudente;
      el.innerHTML = e ? `Prudente : <b>${pct(e.pPasser)}</b> de chances de passer · équipe complète <b>${pct(e.pComplete)}</b> · verrouillée ${esc(quand(e.verrouillage))}`
        : esc(r?.message ?? 'Pas de proposition.');
    });
  }
}

// ---------- Propositions ----------
const TITRES = {
  prudente: ['Prudente', 'Presque aussi bonne que la meilleure, avec le plus de chances que les 5 jouent.'],
  equilibree: ['Équilibrée', 'La plus grande chance de franchir le palier.'],
  ambitieuse: ['Ambitieuse', 'Encore plus de chances de passer, en acceptant des joueurs moins sûrs de jouer.'],
};

function carteProposition(nom, e, sport, principale) {
  const [titre, pourquoi] = TITRES[nom];
  const parId = new Map(lignes.map((l) => [l.c.id, l]));
  const membres = e.cartes.map((id) => parId.get(id)).sort((a, b) => (a.m?.debutUTC ?? '').localeCompare(b.m?.debutUTC ?? ''));
  const dernier = membres.map((l) => l.m.debutUTC).sort().at(-1);
  return `<article class="proposition${principale ? ' principale' : ''}">
    <div><h2>${titre}</h2><div class="pourquoi">${pourquoi}</div></div>
    <div class="chiffres-cle">
      <div class="case-chiffre fort"><span>Chances de passer</span><b>${pct(e.pPasser)}</b></div>
      <div class="case-chiffre"><span>Les 5 jouent</span><b>${pct(e.pComplete)}</b></div>
      <div class="case-chiffre"><span>Score moyen</span><b>${nb(e.scoreMoyen)}</b></div>
      <div class="case-chiffre"><span>Verrouillage</span><b style="font-size:1.05rem">${esc(quand(e.verrouillage))}</b></div>
    </div>
    <div class="joueurs">${membres.map((l) => {
      const st = statut(l);
      return `<div class="joueur">${vignette(l)}<div style="min-width:0">
          <div class="nom">${esc(l.j.nom)}${e.capitaine === l.c.id ? '<span class="capitaine">C</span>' : ''}</div>
          <div class="meta"><span>${esc(l.j.postes.join('/'))}${sport === 'nba' && l.j.etoiles != null ? ` · ${nb(l.j.etoiles, 1)} ★` : ''}</span><span>${esc(quand(l.m.debutUTC))} · ${l.lieu === 'ext' ? '@ ' : l.lieu === 'dom' ? 'vs ' : ''}${esc(l.adv ?? '?')}</span></div>
          <div class="puces"><span class="etiq ${st}">${LIBELLES[st]}</span>${l.c.bonusPct ? `<span class="etiq bonus">${esc(l.c.collection)} +${nb(l.c.bonusPct)} %</span>` : ''}</div>
        </div>
        <div class="droite"><b>${pct(l.pr.p)}</b>joue · ${nb(l.pr.siJoue)} pts</div></div>`;
    }).join('')}</div>
    <div class="sous">${sport === 'nba' ? `${nb(e.etoiles, 1)} étoiles sur 16 · ` : ''}Résultat connu après le dernier match (${esc(quand(dernier))}).</div>
    <div class="actions"><button type="button" class="bouton" data-jouer="${esc(e.cartes.join(','))}" data-sport="${sport}">J'ai joué cette équipe</button></div>
  </article>`;
}

function afficherPropositions(sport) {
  const p = palierEnCours(sport);
  $('titre-propositions').textContent = `${SPORTS[sport]} · palier ${p ? p.cible : '—'}`;
  if (!p) { $('contexte-propositions').textContent = ''; $('propositions').innerHTML = '<p class="attente">Tous les paliers de ce plateau sont passés.</p>'; return; }
  const n = jouees(sport).size;
  $('contexte-propositions').textContent = (p.etat === 'LINEUP_SET' ? 'Une composition est déjà posée : ces propositions servent à la tentative suivante si elle échoue. Pense à marquer ses cartes comme jouées. · ' : '') +
    `Seuil de chances de jouer : ${Math.round(seuil() * 100)} % (réglable dans Mes cartes) · ${n ? `${n} carte${n > 1 ? 's' : ''} déjà jouée${n > 1 ? 's' : ''} à ce palier` : 'aucune carte marquée jouée à ce palier'}.`;
  $('propositions').innerHTML = '<p class="attente">Simulation des meilleures équipes…</p>';
  plusTard(() => propositions(sport)).then((r) => {
    if (vueCourante() !== `propositions-${sport}`) return;
    if (!r.equilibree) { $('propositions').innerHTML = `<p class="attente">${esc(r.message)}</p>`; return; }
    const memes = r.prudente.cartes.join() === r.equilibree.cartes.join() && r.prudente.capitaine === r.equilibree.capitaine;
    const ecartees = Object.entries(r.ecartees).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>${v} ${esc(k)}</li>`).join('');
    $('propositions').innerHTML =
      carteProposition('prudente', r.prudente, sport, true) +
      (memes ? '<p class="sous">L’équipe équilibrée est la même que la prudente.</p>' : carteProposition('equilibree', r.equilibree, sport, false)) +
      (r.ambitieuse ? carteProposition('ambitieuse', r.ambitieuse, sport, false) : '<p class="sous">Pas de proposition ambitieuse : accepter des joueurs moins sûrs ne fait pas mieux.</p>') +
      `<details class="ecartees"><summary>${r.admissibles} cartes retenues, ${r.nbEquipes} équipes comparées en ${(r.dureeMs / 1000).toFixed(1)} s</summary><ul>${ecartees}</ul>` +
      `<p>Chances calculées par ${D.P.simulation.tirages} tirages (méthode v${D.P.version}). Les joueurs sont tirés indépendamment : deux coéquipiers ont en réalité des scores liés.</p></details>`;
  });
}

function jouerEquipe(sport, ids) {
  const p = palierEnCours(sport); if (!p) return;
  const ensemble = jouees(sport);
  for (const id of ids) ensemble.add(id);
  etatUtilisateur = { ...etatUtilisateur, [sport]: { cible: p.cible, jouees: [...ensemble], misAJour: new Date().toISOString() } };
  stockage.enregistrer(etatUtilisateur);
  tout();
}

// ---------- Navigation ----------
const VUES = ['accueil', 'propositions-football', 'propositions-nba', 'cartes'];
const vueCourante = () => (VUES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'accueil');

function tout() {
  const v = vueCourante();
  $('vue-accueil').hidden = v !== 'accueil';
  $('vue-propositions').hidden = !v.startsWith('propositions-');
  $('vue-cartes').hidden = v !== 'cartes';
  document.querySelectorAll('#onglets a').forEach((a) => (a.dataset.vue === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  afficherPaliers(); afficherStockage();
  if (v === 'accueil') afficherAccueil();
  else if (v === 'cartes') { commandes(); liste(); }
  else afficherPropositions(v.split('-')[1]);
}

$('sports').onclick = (e) => { const s = e.target.closest('button')?.dataset.sport; if (s) { vue.sport = s; vue.poste = null; vue.creneau = ''; tout(); } };
$('postes').onclick = (e) => { const b = e.target.closest('button'); if (b) { vue.poste = b.dataset.poste || null; tout(); } };
$('creneau').onchange = (e) => { vue.creneau = e.target.value; liste(); };
$('tri').onchange = (e) => { vue.tri = e.target.value; liste(); };
$('dispo').onchange = (e) => { vue.dispo = e.target.checked; commandes(); liste(); };
$('seuil').onchange = (e) => { etatUtilisateur = { ...etatUtilisateur, seuil: Number(e.target.value) }; stockage.enregistrer(etatUtilisateur); tout(); };
$('liste').onclick = (e) => { const b = e.target.closest('.ligne'); if (b) fiche(b.dataset.id); };
$('propositions').onclick = (e) => {
  const b = e.target.closest('[data-jouer]'); if (!b) return;
  jouerEquipe(b.dataset.sport, b.dataset.jouer.split(','));
};
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); tout(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('voile').hidden = true; });

afficherAge();
setInterval(afficherAge, 60000);
stockage.brancher((v) => { etatUtilisateur = { ...etatVide(), ...v }; tout(); });
