// Interface : Accueil, Propositions (football, NBA) et Mes cartes (maquette A retenue le 2026-11-07).
// Fonctionne dans l'artifact (données intégrées dans #donnees) et hors artifact
// (données lues dans donnees-app.json à côté de la page). Le moteur v2 tourne ici,
// dans le navigateur ; méthode et règles viennent des données (methode.md, regles/).
//
// État de l'utilisateur (cartes jouées au palier en cours, seuil) : capacité `db`
// de l'artifact (document privé data/users/<id>/etat, partagé entre appareils),
// sinon stockage du navigateur.

import { projeterCarte } from '../src/moteur/projection.js';
import { proposer, proposerParCreneau, squadDuJour, joursAVenir, jourDeJeu, autresChoix } from '../src/moteur/compositions.js';

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
const LIBELLES = { confirme: 'Titulaire confirmé', remplacant: 'Remplaçant annoncé', probable: 'Probable', incertain: 'Incertain', douteux: 'Douteux', exclu: 'Exclu' };
const SIT = { titulaire: 'titulaire', entre: 'entré', joue: 'joué', banc: 'banc', absent: 'absent', inconnu: '?' };
const tz = { timeZone: 'Europe/Paris' };
const fJour = new Intl.DateTimeFormat('fr-FR', { ...tz, weekday: 'short', day: 'numeric', month: 'short' });
const fHeure = new Intl.DateTimeFormat('fr-FR', { ...tz, hour: '2-digit', minute: '2-digit' });
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

// Étiquettes du contexte du match (methode.md, section 9).
function pucesContexte(l) {
  const k = l.pr.contexte ?? {}, out = [];
  if (l.c.sport === 'football' && l.cotes?.victoire != null) {
    const v = Math.round(l.cotes.victoire * 100);
    out.push(`<span class="etiq neutre" title="Probabilité de victoire de son équipe (cotes Sorare)">${v >= 60 ? 'Favori' : v <= 30 ? 'Outsider' : 'Victoire'} ${v} %</span>`);
  }
  if (k.dosADos) out.push('<span class="etiq incertain" title="Deuxième soir consécutif de son équipe">2e soir de suite</span>');
  if (k.espn) out.push(`<span class="etiq ${l.pr.statut === 'ok' ? 'neutre' : l.pr.statut}" title="${esc(k.espn.commentaire ?? '')}">ESPN : ${esc(k.espn.statut)}</span>`);
  return out.join('');
}

function statut(l) {
  if (l.pr.statut !== 'ok') return l.pr.statut;
  if (l.pr.situationConfirmee === 'titulaire') return 'confirme';
  return l.pr.p != null && l.pr.p >= seuil() ? 'probable' : 'incertain';
}
const disponible = (l) => ['probable', 'confirme'].includes(statut(l)) && l.pr.eligibleArcade && l.pr.siJoue != null && !jouees(l.c.sport).has(l.c.id);

const vue = { sport: 'football', poste: null, etoiles: null, creneau: '', tri: 'e', dispo: true, mode: 'plusieurs', creneauOuvert: null, squadSport: 'football', squadJour: null };

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
const lignesMoteur = (sport) => lignes.filter((l) => l.c.sport === sport).map((l) => ({ carte: l.c, joueur: l.j, match: l.m, projection: l.pr }));
function parCreneau(sport) {
  const palier = palierEnCours(sport); if (!palier) return null;
  const cle = ['creneaux', sport, palier.cible, seuil(), [...jouees(sport)].sort().join(','), Math.floor(Date.now() / 60000)].join('|');
  if (!cache.has(cle)) {
    const t0 = performance.now();
    const r = proposerParCreneau(lignesMoteur(sport), D.P, { sport, cible: palier.cible, regle: D.regles[sport], seuil: seuil(), jouees: jouees(sport), maintenant: Date.now() });
    cache.set(cle, { creneaux: r, dureeMs: performance.now() - t0 });
  }
  return cache.get(cle);
}
function squad(sport, jour) {
  const cle = ['squad', sport, jour, seuil(), Math.floor(Date.now() / 60000)].join('|');
  if (!cache.has(cle)) cache.set(cle, squadDuJour(lignesMoteur(sport), D.P, { sport, jour, fuseau: D.journees[sport].fuseau, regle: D.regles[sport], seuil: seuil(), maintenant: Date.now() }));
  return cache.get(cle);
}

function autres(sport, equipe) {
  const palier = palierEnCours(sport);
  const cle = ['autres', sport, palier.cible, seuil(), [...jouees(sport)].sort().join(','), equipe.cartes.join(','), Math.floor(Date.now() / 60000)].join('|');
  if (!cache.has(cle)) cache.set(cle, autresChoix(lignesMoteur(sport), D.P, { sport, cible: palier.cible, regle: D.regles[sport], seuil: seuil(), jouees: jouees(sport), maintenant: Date.now() }, equipe));
  return cache.get(cle);
}

// Calcul différé : attend que la page soit réellement affichée (deux images), puis
// enchaîne les calculs un par un pour ne jamais bloquer l'affichage longtemps.
let file = Promise.resolve();
const apresAffichage = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 0))));
const plusTard = (f) => (file = file.then(apresAffichage).then(f));
// Journée Sorare d'une carte et son libellé (football : date de Paris ; NBA : date de New York, nuit à Paris).
const journee = (l) => jourDeJeu(l.m.debutUTC, D.journees[l.c.sport].fuseau);
const fLongUTC = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const fJourUTC = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric' });
function libelleJournee(sport, j) {
  const d = new Date(`${j}T12:00:00Z`), decal = D.journees[sport].decalage_etiquette_paris_jours;
  if (!decal) return fLongUTC.format(d);
  const lendemain = new Date(d.getTime() + decal * 86400000);
  return `Nuit du ${fJourUTC.format(d)} au ${fLongUTC.format(lendemain)} (journée Sorare du ${lendemain.getUTCDate()})`;
}

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
  // Filtre par journée Sorare (regles/squad.json : en NBA, date de New York).
  const journees = new Map();
  for (const l of lignes) if (l.c.sport === vue.sport && l.m && (!vue.dispo || disponible(l))) {
    const k = journee(l); journees.set(k, (journees.get(k) ?? 0) + 1);
  }
  if (vue.creneau && !journees.has(vue.creneau)) vue.creneau = '';
  $('creneau').innerHTML = '<option value="">Toutes les journées</option>' + [...journees.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => `<option value="${k}" ${k === vue.creneau ? 'selected' : ''}>${libelleJournee(vue.sport, k)} (${n})</option>`).join('');
  const TRIS = [['e', 'Tri : espérance'], ['p', 'Tri : chances de jouer'], ['d', "Tri : coup d'envoi"]];
  // Filtre par étoiles (NBA) : un bouton par niveau présent, avec le nombre de cartes.
  const filtreEtoiles = $('filtre-etoiles');
  filtreEtoiles.hidden = vue.sport !== 'nba';
  if (vue.sport === 'nba') {
    const parNiveau = new Map();
    for (const l of lignes) if (l.c.sport === 'nba' && l.j.etoiles != null && (!vue.dispo || disponible(l))) parNiveau.set(l.j.etoiles, (parNiveau.get(l.j.etoiles) ?? 0) + 1);
    if (vue.etoiles != null && !parNiveau.has(vue.etoiles)) vue.etoiles = null;
    filtreEtoiles.innerHTML = `<button type="button" class="puce" data-etoiles="" aria-pressed="${vue.etoiles == null}">Toutes ★</button>` +
      [...parNiveau.entries()].sort((a, b) => a[0] - b[0]).map(([e, n]) =>
        `<button type="button" class="puce puce-etoiles" data-etoiles="${e}" aria-pressed="${e === vue.etoiles}">★ ${nb(e, 1)} <small>(${n})</small></button>`).join('');
  } else vue.etoiles = null;
  if (!TRIS.some(([k]) => k === vue.tri)) vue.tri = 'e';
  $('tri').innerHTML = TRIS.map(([k, t]) => `<option value="${k}" ${k === vue.tri ? 'selected' : ''}>${t}</option>`).join('');
  $('seuil').value = String(seuil());
}

// Étoiles du joueur (NBA : plafond de 16 par équipe), bien visibles.
const badgeEtoiles = (l, grand = false) => (l.c.sport === 'nba' && l.j.etoiles != null
  ? `<span class="etoiles${grand ? ' grand' : ''}" title="${nb(l.j.etoiles, 1)} étoile(s)">★ ${nb(l.j.etoiles, 1)}</span>` : '');
const plafondEtoiles = (sport) => D.regles[sport]?.plafond_etoiles?.max ?? null;

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
    (vue.etoiles == null || l.j.etoiles === vue.etoiles) &&
    (!vue.dispo || disponible(l)) && (!vue.creneau || (l.m && journee(l) === vue.creneau)));
  const esp = (l) => l.pr.esperance ?? -1;
  const tri = { e: (a, b) => esp(b) - esp(a), p: (a, b) => (b.pr.p ?? -1) - (a.pr.p ?? -1),
    d: (a, b) => (a.m?.debutUTC ?? '9').localeCompare(b.m?.debutUTC ?? '9') }[vue.tri] ?? ((a, b) => esp(b) - esp(a));
  L.sort(tri);
  $('compte').textContent = `${L.length} carte${L.length > 1 ? 's' : ''}`;
  if (!L.length) { $('liste').innerHTML = '<div class="vide-liste">Aucune carte ne correspond. Décoche « disponibles seulement » pour tout voir.</div>'; return; }
  $('liste').innerHTML = L.slice(0, 200).map((l) => {
    const st = statut(l), m = l.m, c = l.c;
    const match = m ? `${quand(m.debutUTC)} · ${l.lieu === 'ext' ? '@ ' : l.lieu === 'dom' ? 'vs ' : ''}${esc(l.adv ?? '?')}` : 'pas de match connu';
    return `<button type="button" class="ligne${J.has(c.id) ? ' bloquee' : ''}" data-id="${esc(c.id)}">
      ${vignette(l)}
      <div style="min-width:0">
        <div class="nom">${esc(l.j.nom)} ${badgeEtoiles(l)}</div>
        <div class="meta"><span>${esc(l.j.postes.join('/'))} · ${esc(l.j.club?.nom ?? '?')}</span><span>${match}</span></div>
        <div class="puces">
          <span class="etiq ${st}">${LIBELLES[st]}</span>
          ${c.bonusPct ? `<span class="etiq bonus">${esc(c.collection)} +${nb(c.bonusPct)} %</span>` : ''}
          ${!l.pr.eligibleArcade && m ? '<span class="etiq exclu">hors Arcade</span>' : ''}
          ${J.has(c.id) ? '<span class="etiq neutre">jouée à ce palier</span>' : ''}
        </div>
      </div>
      <div class="chiffres">
        <div class="esp">${nb(l.pr.esperance)}<small>${c.sport === 'nba' && l.j.etoiles && l.pr.esperance != null ? `${nb(l.pr.esperance / l.j.etoiles, 1)} pts/★` : 'espérance'}</small></div>
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
      ${c.sport === 'nba' ? `<div style="margin:4px 0">${badgeEtoiles(l, true)}</div>` : ''}
      <div class="sous">${esc(j.postes.join('/'))} · ${esc(j.club?.nom ?? '?')} · ${esc((j.tier ?? '').replace('_PLUS', '+'))}${c.sport !== 'nba' && j.etoiles != null ? ` · ${nb(j.etoiles, 1)} ★` : ''}</div>
      <div class="puces" style="margin-top:6px"><span class="etiq ${st}">${LIBELLES[st]}</span>${c.bonusPct ? `<span class="etiq bonus">${esc(c.collection)} +${nb(c.bonusPct)} %</span>` : ''}${j.statutSorare ? `<span class="etiq neutre">Sorare : ${esc(j.statutSorare)}</span>` : ''}${pucesContexte(l)}</div>
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
  const [titre, pourquoi] = Array.isArray(nom) ? nom : TITRES[nom];
  const parId = new Map(lignes.map((l) => [l.c.id, l]));
  const membres = e.cartes.map((id) => parId.get(id)).sort((a, b) => (a.m?.debutUTC ?? '').localeCompare(b.m?.debutUTC ?? ''));
  const dernier = membres.map((l) => l.m.debutUTC).sort().at(-1);
  return `<article class="proposition${principale ? ' principale' : ''}">
    <div><h2>${titre}</h2><div class="pourquoi">${pourquoi}</div></div>
    <div class="chiffres-cle">
      <div class="case-chiffre fort"><span>Chances de passer</span><b>${pct(e.pPasser)}</b></div>
      <div class="case-chiffre"><span>Les 5 jouent</span><b>${pct(e.pComplete)}</b></div>
      ${sport === 'nba' ? `<div class="case-chiffre etoiles-equipe"><span>Étoiles</span><b>★ ${nb(e.etoiles, 1)} <small>/ ${plafondEtoiles(sport)}</small></b></div>` : ''}
      <div class="case-chiffre"><span>Score moyen</span><b>${nb(e.scoreMoyen)}</b></div>
      <div class="case-chiffre"><span>Verrouillage</span><b style="font-size:1.05rem">${esc(quand(e.verrouillage))}</b></div>
    </div>
    <div class="joueurs">${membres.map((l) => {
      const st = statut(l);
      return `<div class="joueur" data-fiche="${esc(l.c.id)}" role="button" tabindex="0" aria-label="Voir la carte de ${esc(l.j.nom)}">${vignette(l)}<div style="min-width:0">
          <div class="nom">${esc(l.j.nom)}${e.capitaine === l.c.id ? '<span class="capitaine">C</span>' : ''} ${badgeEtoiles(l)}</div>
          <div class="meta"><span>${esc(l.j.postes.join('/'))}</span><span>${esc(quand(l.m.debutUTC))} · ${l.lieu === 'ext' ? '@ ' : l.lieu === 'dom' ? 'vs ' : ''}${esc(l.adv ?? '?')}</span></div>
          <div class="puces"><span class="etiq ${st}">${LIBELLES[st]}</span>${l.c.bonusPct ? `<span class="etiq bonus">${esc(l.c.collection)} +${nb(l.c.bonusPct)} %</span>` : ''}${pucesContexte(l)}</div>
        </div>
        <div class="droite"><b>${pct(l.pr.p)}</b>joue · ${nb(l.pr.siJoue)} pts</div></div>`;
    }).join('')}</div>
    <div class="sous">Résultat connu après le dernier match (${esc(quand(dernier))}).</div>
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
  document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === vue.mode)));
  $('propositions').innerHTML = '<p class="attente">Simulation des meilleures équipes…</p>';
  if (vue.mode === 'unique') { afficherCreneaux(sport); return; }
  plusTard(() => propositions(sport)).then((r) => {
    if (vueCourante() !== `propositions-${sport}`) return;
    if (!r.equilibree) { $('propositions').innerHTML = `<p class="attente">${esc(r.message)}</p>`; return; }
    const memes = r.prudente.cartes.join() === r.equilibree.cartes.join() && r.prudente.capitaine === r.equilibree.capitaine;
    const ecartees = Object.entries(r.ecartees).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>${v} ${esc(k)}</li>`).join('');
    $('propositions').innerHTML =
      carteProposition('prudente', r.prudente, sport, true) +
      '<section class="autres" id="autres-choix"><h2>Autres choix</h2><p class="attente">Recherche des autres joueurs…</p></section>' +
      (memes ? '<p class="sous">L’équipe équilibrée est la même que la prudente.</p>' : carteProposition('equilibree', r.equilibree, sport, false)) +
      (r.ambitieuse ? carteProposition('ambitieuse', r.ambitieuse, sport, false) : '<p class="sous">Pas de proposition ambitieuse : accepter des joueurs moins sûrs ne fait pas mieux.</p>') +
      `<details class="ecartees"><summary>${r.admissibles} cartes retenues, ${r.nbEquipes} équipes comparées en ${(r.dureeMs / 1000).toFixed(1)} s</summary><ul>${ecartees}</ul>` +
      `<p>Chances calculées par ${D.P.simulation.tirages} tirages (méthode v${D.P.version}). Les joueurs sont tirés indépendamment : deux coéquipiers ont en réalité des scores liés.</p></details>`;
    plusTard(() => autres(sport, r.prudente)).then((a) => afficherAutres(sport, r.prudente, a));
  });
}

// Autres choix : par poste, les joueurs qui peuvent aussi performer, et ce que changerait chacun.
const NOMS_POSTES = { GK: 'Gardiens', DF: 'Défenseurs', MD: 'Milieux', FW: 'Attaquants' };
function afficherAutres(sport, equipe, a) {
  const el = $('autres-choix'); if (!el || vueCourante() !== `propositions-${sport}`) return;
  const parId = new Map(lignes.map((l) => [l.c.id, l]));
  const groupes = a.groupes.filter((g) => g.choix.length);
  if (!groupes.length) { el.innerHTML = '<h2>Autres choix</h2><p class="sous">Pas d’autre carte admissible.</p>'; return; }
  el.innerHTML = `<h2>Autres choix</h2><p class="sous">D’autres joueurs qui peuvent performer, si tu préfères ajuster l’équipe prudente (${pct(equipe.pPasser)} de chances de passer). Pour chacun : le joueur qu’il remplace au mieux et la nouvelle chance de passer.</p>` +
    groupes.map((g) => `<div class="groupe">${g.poste ? `<h3>${NOMS_POSTES[g.poste] ?? g.poste}</h3>` : ''}${g.choix.map((c) => {
      const l = parId.get(c.carteId), rem = c.remplace ? parId.get(c.remplace) : null;
      const delta = c.ecart == null ? '' : `<span class="${c.ecart >= 0.005 ? 'plus' : c.ecart <= -0.005 ? 'moins' : 'egal'}">${c.ecart >= 0 ? '+' : '−'}${Math.abs(Math.round(c.ecart * 1000) / 10).toLocaleString('fr-FR')} pt</span>`;
      return `<div class="alt" data-fiche="${esc(l.c.id)}" role="button" tabindex="0" aria-label="Voir la carte de ${esc(l.j.nom)}">${vignette(l)}<div style="min-width:0">
          <div class="nom">${esc(l.j.nom)}${c.capitaine === c.carteId ? '<span class="capitaine">C</span>' : ''} ${badgeEtoiles(l)}</div>
          <div class="meta"><span>${esc(l.j.postes.join('/'))} · ${pct(c.p)} joue · ${nb(c.siJoue)} pts</span><span>${esc(quand(l.m.debutUTC))}</span></div>
        </div>
        <div class="droite">${rem ? `à la place de <b class="nom-remplace">${esc(rem.j.nom)}</b>${pct(c.pPasser)} ${delta}` : '<span class="sous">aucun remplacement possible</span>'}</div></div>`;
    }).join('')}</div>`).join('');
}

// Créneau unique : un créneau par coup d'envoi, avec sa meilleure équipe.
function afficherCreneaux(sport) {
  plusTard(() => parCreneau(sport)).then((r) => {
    if (vueCourante() !== `propositions-${sport}` || vue.mode !== 'unique') return;
    if (!r?.creneaux.length) { $('propositions').innerHTML = '<p class="attente">Aucun créneau ne permet de remplir une équipe avec tes cartes disponibles.</p>'; return; }
    const meilleur = Math.max(...r.creneaux.map((c) => c.equilibree.pPasser));
    $('propositions').innerHTML = `<p class="sous">Les 5 matchs commencent à la même heure : compose juste après la publication des compositions (vers H-1). Meilleure chance : ${pct(meilleur)}.</p>` +
      '<div class="creneaux">' + r.creneaux.map((c) => {
        const ouvert = vue.creneauOuvert === c.creneau;
        return `<button type="button" class="creneau" data-creneau="${esc(c.creneau)}" aria-expanded="${ouvert}">
          <div><div class="heure">${esc(quand(c.creneau))}</div>
            <div class="sous">${c.matchs} match${c.matchs > 1 ? 's' : ''} · compositions ${c.compositionsPubliees ? `publiées (${c.compositionsPubliees}/${c.matchs})` : 'pas encore publiées'} · ${c.admissibles} cartes</div></div>
          <div class="chance">${pct(c.equilibree.pPasser)}<small>chances de passer</small></div></button>` +
          (ouvert ? `<div class="creneau-detail">${carteProposition([`Créneau ${quand(c.creneau)}`, 'La meilleure équipe de ce créneau.'], c.equilibree, sport, true)}</div>` : '');
      }).join('') + '</div>' +
      `<p class="sous">${r.creneaux.length} créneaux comparés en ${(r.dureeMs / 1000).toFixed(1)} s.</p>`;
  });
}

// ---------- Squad du jour ----------
function afficherSquad() {
  $('squad-sports').innerHTML = Object.entries(SPORTS).map(([k, v]) => `<button type="button" data-sport="${k}" aria-pressed="${k === vue.squadSport}">${v}</button>`).join('');
  // Journée de jeu au sens de Sorare (regles/squad.json) : en NBA, date de New York (soirée + nuit à Paris).
  const J = D.journees[vue.squadSport];
  const jours = joursAVenir(lignesMoteur(vue.squadSport), Date.now(), J.fuseau);
  if (!jours.includes(vue.squadJour)) vue.squadJour = jours[0] ?? null;
  $('squad-jour').innerHTML = jours.map((j) => `<option value="${j}" ${j === vue.squadJour ? 'selected' : ''}>${libelleJournee(vue.squadSport, j)}</option>`).join('');
  if (!vue.squadJour) { $('squad').innerHTML = '<p class="attente">Aucun match à venir.</p>'; return; }
  $('squad').innerHTML = '<p class="attente">Recherche de la meilleure équipe…</p>';
  const sport = vue.squadSport, jour = vue.squadJour;
  plusTard(() => squad(sport, jour)).then((r) => {
    if (vueCourante() !== 'squad' || vue.squadSport !== sport || vue.squadJour !== jour) return;
    if (!r.equipe) { $('squad').innerHTML = `<p class="attente">${esc(r.message)}</p>`; return; }
    const e = r.equipe;
    const parId = new Map(lignes.map((l) => [l.c.id, l]));
    const membres = e.cartes.map((id) => parId.get(id)).sort((a, b) => a.m.debutUTC.localeCompare(b.m.debutUTC));
    $('squad').innerHTML = `<article class="proposition principale">
      <div class="chiffres-cle">
        <div class="case-chiffre fort"><span>Score attendu</span><b>${nb(e.esperance)}</b></div>
        <div class="case-chiffre"><span>Les 5 jouent</span><b>${pct(e.pComplete)}</b></div>
      ${sport === 'nba' ? `<div class="case-chiffre etoiles-equipe"><span>Étoiles</span><b>★ ${nb(e.etoiles, 1)} <small>/ ${plafondEtoiles(sport)}</small></b></div>` : ''}
        <div class="case-chiffre"><span>Verrouillage</span><b style="font-size:1.05rem">${esc(quand(e.verrouillage))}</b></div>
      </div>
      <div class="joueurs">${membres.map((l) => `<div class="joueur" data-fiche="${esc(l.c.id)}" role="button" tabindex="0" aria-label="Voir la carte de ${esc(l.j.nom)}">${vignette(l)}<div style="min-width:0">
          <div class="nom">${esc(l.j.nom)}${e.capitaine === l.c.id ? '<span class="capitaine">C</span>' : ''} ${badgeEtoiles(l)}</div>
          <div class="meta"><span>${esc(l.j.postes.join('/'))}</span><span>${esc(quand(l.m.debutUTC))} · ${l.lieu === 'ext' ? '@ ' : l.lieu === 'dom' ? 'vs ' : ''}${esc(l.adv ?? '?')}</span></div>
          <div class="puces"><span class="etiq ${statut(l)}">${LIBELLES[statut(l)]}</span>${jouees(sport).has(l.c.id) ? '<span class="etiq neutre">jouée en Arcade</span>' : ''}${pucesContexte(l)}</div>
        </div><div class="droite"><b>${nb(l.pr.esperance)}</b>espérance</div></div>`).join('')}</div>
      <div class="sous">${r.admissibles} cartes du jour retenues, ${r.nbEquipes} équipes comparées. Règles de composition supposées identiques à l'Arcade (à confirmer).</div>
    </article>`;
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
const VUES = ['accueil', 'propositions-football', 'propositions-nba', 'squad', 'cartes'];
const vueCourante = () => (VUES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'accueil');

function tout() {
  const v = vueCourante();
  $('vue-accueil').hidden = v !== 'accueil';
  $('vue-propositions').hidden = !v.startsWith('propositions-');
  $('vue-cartes').hidden = v !== 'cartes';
  $('vue-squad').hidden = v !== 'squad';
  document.querySelectorAll('#onglets a').forEach((a) => (a.dataset.vue === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  afficherPaliers(); afficherStockage();
  if (v === 'accueil') afficherAccueil();
  else if (v === 'cartes') { commandes(); liste(); }
  else if (v === 'squad') afficherSquad();
  else afficherPropositions(v.split('-')[1]);
}

$('sports').onclick = (e) => { const s = e.target.closest('button')?.dataset.sport; if (s) { vue.sport = s; vue.poste = null; vue.creneau = ''; tout(); } };
$('postes').onclick = (e) => { const b = e.target.closest('button'); if (b) { vue.poste = b.dataset.poste || null; tout(); } };
$('filtre-etoiles').onclick = (e) => { const b = e.target.closest('button'); if (b) { vue.etoiles = b.dataset.etoiles === '' ? null : Number(b.dataset.etoiles); commandes(); liste(); } };
$('creneau').onchange = (e) => { vue.creneau = e.target.value; liste(); };
$('tri').onchange = (e) => { vue.tri = e.target.value; liste(); };
$('dispo').onchange = (e) => { vue.dispo = e.target.checked; commandes(); liste(); };
$('seuil').onchange = (e) => { etatUtilisateur = { ...etatUtilisateur, seuil: Number(e.target.value) }; stockage.enregistrer(etatUtilisateur); tout(); };
$('liste').onclick = (e) => { const b = e.target.closest('.ligne'); if (b) fiche(b.dataset.id); };
// Appui sur un joueur (propositions, autres choix, Squad) : sa fiche, avec la carte.
const ouvrirFiche = (e) => { const j = e.target.closest('[data-fiche]'); if (!j) return false; fiche(j.dataset.fiche); return true; };
for (const id of ['propositions', 'squad']) {
  $(id).addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-fiche]')) { e.preventDefault(); fiche(e.target.dataset.fiche); } });
}
$('squad').onclick = (e) => { ouvrirFiche(e); };
$('propositions').onclick = (e) => {
  if (!e.target.closest('[data-jouer]') && ouvrirFiche(e)) return;
  const c = e.target.closest('[data-creneau]');
  if (c) { vue.creneauOuvert = vue.creneauOuvert === c.dataset.creneau ? null : c.dataset.creneau; afficherCreneaux(vueCourante().split('-')[1]); return; }
  const b = e.target.closest('[data-jouer]'); if (!b) return;
  jouerEquipe(b.dataset.sport, b.dataset.jouer.split(','));
};
$('modes').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) { vue.mode = b.dataset.mode; tout(); } };
$('squad-sports').onclick = (e) => { const b = e.target.closest('[data-sport]'); if (b) { vue.squadSport = b.dataset.sport; afficherSquad(); } };
$('squad-jour').onchange = (e) => { vue.squadJour = e.target.value; afficherSquad(); };
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); tout(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('voile').hidden = true; });

afficherAge();
setInterval(afficherAge, 60000);
stockage.brancher((v) => { etatUtilisateur = { ...etatVide(), ...v }; tout(); });
