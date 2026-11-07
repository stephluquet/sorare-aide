// Interface (maquette A retenue le 2026-11-07). Navigation demandée par l'utilisateur le 2026-11-07 :
// un sélecteur Football / NBA toujours en haut (et sur l'accueil), puis, dans chaque sport,
// Solo (Arcade), Squad et Mes cartes. Adresse : #<sport>/<mode>.
// Fonctionne dans l'artifact (données intégrées dans #donnees) et hors artifact
// (données lues dans donnees-app.json à côté de la page). Le moteur v2 tourne ici,
// dans le navigateur ; méthode et règles viennent des données (methode.md, regles/).
//
// État de l'utilisateur (cartes jouées au palier en cours, seuil) : capacité `db`
// de l'artifact (document privé data/users/<id>/etat, partagé entre appareils),
// sinon stockage du navigateur.

import { projeterCarte } from '../src/moteur/projection.js';
import { proposer, proposerParCreneau, squadDuJour, joursAVenir, jourDeJeu, autresChoix } from '../src/moteur/compositions.js';
import { statsEquipe, serieEnMots, formeJoueur } from '../src/moteur/forme.js';

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
const SPORTS_COURTS = { football: 'Foot', nba: 'NBA' };
// Icônes dessinées pour l'appli (ballon de foot, ballon de basket, lune, soleil), en trait, couleur du texte.
const trait = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ICONES = {
  football: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" ${trait}/><path d="M12 8.8l3.04 2.21-1.16 3.58h-3.76l-1.16-3.58z" fill="currentColor"/><path d="M12 8.8V2.6M15.04 11.01l5.9-1.9M13.88 14.59l3.65 5.03M10.12 14.59l-3.65 5.03M8.96 11.01l-5.9-1.9" ${trait}/></svg>`,
  nba: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" ${trait}/><path d="M12 2.5v19M2.5 12h19M6 4.4c2.4 2.1 3.7 4.7 3.7 7.6s-1.3 5.5-3.7 7.6M18 4.4c-2.4 2.1-3.7 4.7-3.7 7.6s1.3 5.5 3.7 7.6" ${trait}/></svg>`,
  lune: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" ${trait}/></svg>`,
  maj: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14.2 5M4 12a8 8 0 0 1 14.2-5" ${trait}/><path d="M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2" ${trait}/></svg>`,
  aide: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" ${trait}/><path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 4" ${trait}/><circle cx="12" cy="17.4" r="1.1" fill="currentColor"/></svg>`,
  soleil: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" ${trait}/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" ${trait}/></svg>`,
};
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

// Contexte du match (methode.md, section 9). La cote de victoire (football) va dans la ligne du match ;
// seules les alertes (2e soir de suite, blessure ESPN) restent des étiquettes.
function pucesContexte(l) {
  const k = l.pr.contexte ?? {}, out = [];
  if (k.dosADos) out.push('<span class="etiq incertain" title="Deuxième soir consécutif de son équipe">2e soir de suite</span>');
  if (k.espn) out.push(`<span class="etiq ${l.pr.statut === 'ok' ? 'neutre' : l.pr.statut}" title="${esc(k.espn.commentaire ?? '')}">ESPN : ${esc(k.espn.statut)}</span>`);
  return out.join('');
}

// Ligne du match, la même partout : « sam. 7 nov. 15:30 · vs Eintracht Frankfurt · 33 % de victoire ».
function ligneMatch(l) {
  if (!l.m) return 'pas de match connu';
  const v = l.c.sport === 'football' && l.cotes?.victoire != null ? ` · <span title="Probabilité de victoire de son équipe (cotes Sorare)">${Math.round(l.cotes.victoire * 100)} % de victoire</span>` : '';
  return `${esc(quand(l.m.debutUTC))} · ${l.lieu === 'ext' ? '@ ' : l.lieu === 'dom' ? 'vs ' : ''}${esc(l.adv ?? '?')}${v}`;
}

// ---------- Forme (methode.md 9 bis : affichée, hors calcul) ----------
const F = D.P.forme;
const cacheEquipes = new Map();
function formeEquipe(slug) {
  if (!slug) return null;
  if (!cacheEquipes.has(slug)) {
    const ms = (D.equipes?.[slug] ?? []).map(([date, adversaire, dom, pour, contre]) => ({ date, adversaire, domicile: dom === 1, pour, contre }));
    cacheEquipes.set(slug, statsEquipe(ms, F));
  }
  return cacheEquipes.get(slug);
}
const cacheJoueurs = new Map();
const formeDe = (j) => { if (!cacheJoueurs.has(j.id)) cacheJoueurs.set(j.id, formeJoueur(j, F)); return cacheJoueurs.get(j.id); };
const slugAdversaire = (l) => (!l.m ? null : l.lieu === 'dom' ? l.m.exterieur?.slug : l.lieu === 'ext' ? l.m.domicile?.slug : null);
const MOTS_RES = { V: 'victoire', N: 'nul', D: 'défaite' };

// Pastilles des derniers matchs (du plus ancien au plus récent, le dernier à droite).
function pastilles(s, grand = false) {
  if (!s) return '';
  const ms = [...s.derniers].reverse();
  const titre = `${ms.length} derniers matchs : ${ms.map((m) => `${MOTS_RES[m.res]} ${m.pour}-${m.contre}${m.adversaire ? ` contre ${m.adversaire}` : ''}`).join(', ')}`;
  return `<span class="pastilles${grand ? ' grand' : ''}" title="${esc(titre)}" aria-label="${esc(titre)}">${ms.map((m) => `<i class="res-${m.res}">${m.res}</i>`).join('')}</span>`;
}

// Ligne « forme » des listes : l'équipe (pastilles + série) et la tendance du joueur.
function ligneForme(l) {
  const s = formeEquipe(l.j.club?.slug), fj = formeDe(l.j), serie = serieEnMots(s, F);
  const tend = fj?.tendance === 'hausse' ? '<span class="tendance hausse" title="Moyenne de ses 3 derniers matchs nettement au-dessus de ses 15 derniers">▲ en forme</span>'
    : fj?.tendance === 'baisse' ? '<span class="tendance baisse" title="Moyenne de ses 3 derniers matchs nettement en dessous de ses 15 derniers">▼ en baisse</span>' : '';
  if (!s && !tend) return '';
  return `<div class="forme-ligne">${s ? `<span class="libelle-forme">Équipe</span>${pastilles(s)}${serie ? `<span class="serie serie-${s.serie.type === 'D' || /sans victoire/.test(serie) ? 'mauvaise' : 'bonne'}">${esc(serie)}</span>` : ''}` : ''}${tend}</div>`;
}

// Bloc « Forme » de la fiche : son équipe, l'adversaire, le joueur.
function blocFormeEquipe(titre, nom, s, sport) {
  if (!s) return `<div class="carte-forme"><h3>${titre} <span class="sous">${esc(nom ?? '')}</span></h3><p class="sous">Forme inconnue : aucune de tes cartes ne joue dans cette équipe.</p></div>`;
  const serie = serieEnMots(s, F);
  const butOuPoint = sport === 'nba' ? 'points' : 'buts';
  return `<div class="carte-forme"><h3>${titre} <span class="sous">${esc(nom ?? '')}</span></h3>
    <div class="forme-resultats">${[...s.derniers].reverse().map((m) => `<div class="res-match"><i class="res-${m.res}">${m.res}</i><b>${m.pour}-${m.contre}</b><span>${m.domicile ? 'vs' : '@'} ${esc((m.adversaire ?? '?').replace(/^(FC|AFC|SC|1\. FC|1\. FSV|RC|CF|SV|VfB|VfL|TSG|RCD|CA|AS|OGC|LOSC|Stade) /, '').slice(0, 12))}</span></div>`).join('')}</div>
    <p class="chiffres-forme"><b>${Math.round(s.pctVictoires * 100)} %</b> de victoires sur ${s.nb} matchs (${s.victoires} V${s.nuls ? `, ${s.nuls} N` : ''}, ${s.defaites} D)${serie ? ` · <b>${esc(serie)}</b>` : ''}<br>${nb(s.pourMoyen, 1)} ${butOuPoint} marqués et ${nb(s.contreMoyen, 1)} encaissés par match</p></div>`;
}
function blocFormeJoueur(l) {
  const fj = formeDe(l.j); if (!fj) return '';
  const SITU = { titulaire: 'T', entre: 'E', joue: 'J', banc: 'B', absent: 'A' };
  const tend = fj.tendance === 'hausse' ? '<span class="tendance hausse">▲ en forme</span>' : fj.tendance === 'baisse' ? '<span class="tendance baisse">▼ en baisse</span>' : fj.tendance === 'stable' ? '<span class="tendance">= stable</span>' : '';
  const pres = l.c.sport === 'football'
    ? `titulaire ${fj.titulaire} fois${fj.joue > fj.titulaire ? `, entré en jeu ${fj.joue - fj.titulaire} fois` : ''} sur les ${fj.sur} derniers matchs de l'équipe`
    : `a joué ${fj.joue} des ${fj.sur} derniers matchs${fj.minutesRecentes != null ? ` · ${nb(fj.minutesRecentes)} min sur ses 3 derniers (${nb(fj.minutesReference)} habituellement)` : ''}`;
  return `<div class="carte-forme"><h3>Le joueur ${tend}</h3>
    <div class="forme-resultats">${[...fj.derniers].reverse().map((m) => `<div class="res-match"><i class="sit-${m.situation}">${SITU[m.situation] ?? '?'}</i><b>${m.score == null ? '–' : Math.round(m.score)}</b></div>`).join('')}</div>
    <p class="chiffres-forme">${fj.moyRecente != null ? `<b>${nb(fj.moyRecente)}</b> pts en moyenne sur ses 3 derniers matchs joués, contre ${nb(fj.moyReference)} sur ses 15 derniers (${fj.ecart >= 0 ? '+' : '−'}${Math.abs(Math.round(fj.ecart * 100))} %)<br>` : ''}${pres}</p></div>`;
}

// Colonne de droite, la même partout : score s'il joue (bonus compris) et jauge des chances de jouer.
// L'espérance (chances × score) est dans la fiche.
function chiffresJoueur(l) {
  const parEtoile = l.c.sport === 'nba' && l.j.etoiles && l.pr.siJoue != null ? `<small class="par-etoile">${nb(l.pr.siJoue / l.j.etoiles, 1)} pts/★</small>` : '';
  return `<div class="chiffres"><div class="esp">${nb(l.pr.siJoue)}<small>pts s'il joue</small></div>${jauge(l.pr.p)}${parEtoile}</div>`;
}

function statut(l) {
  if (l.pr.statut !== 'ok') return l.pr.statut;
  if (l.pr.situationConfirmee === 'titulaire') return 'confirme';
  return l.pr.p != null && l.pr.p >= seuil() ? 'probable' : 'incertain';
}
// Disponible : jouable, éligible Arcade, non marquée jouée, et match pas encore commencé.
const disponible = (l) => ['probable', 'confirme'].includes(statut(l)) && l.pr.eligibleArcade && l.pr.siJoue != null && !jouees(l.c.sport).has(l.c.id) && Date.parse(l.m?.debutUTC) > Date.now();

const vue = { sport: 'football', poste: null, etoiles: null, creneau: '', tri: 'e', dispo: true, mode: 'plusieurs', creneauOuvert: null, squadJour: null };

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
  $('age').textContent = `Données Sorare de ${fHeure.format(t)} le ${fJour.format(t)} (${txt})`;
  $('bandeau').hidden = min < 180;
  $('bandeau').textContent = 'Données de plus de 3 h : écris « actualise » à Claude avant de composer.';
}

// Tentatives déjà jouées au palier en cours : 5 cartes chacune, bloquées tant qu'on reste sur ce palier.
function etatPalier(p) {
  const utilisees = (p.echecs ?? 0) + (p.enCours ?? 0);
  return { utilisees, enCours: (p.enCours ?? 0) > 0, derniere: (p.enCours ?? 0) > 0 && p.tentativesRestantes === 0 };
}
const pluriel = (n, mot, pl = `${mot}s`) => `${n} ${n > 1 ? pl : mot}`;

// Alerte du palier : dernière tentative en cours, ou cartes jouées non marquées (les propositions peuvent les contenir).
function alertePalier(sport) {
  const p = palierEnCours(sport); if (!p) return '';
  const { utilisees, derniere } = etatPalier(p);
  if (derniere) {
    return `<div class="alerte" role="status"><p><b>Dernière tentative en cours à ce palier.</b> Si elle passe, tu montes au palier suivant ; sinon, retour au palier 1. Dans les deux cas, toutes tes cartes seront libérées : ces propositions ne servent pas pour l'instant.</p></div>`;
  }
  const n = jouees(sport).size, attendues = 5 * utilisees;
  if (n >= attendues) return '';
  return `<div class="alerte" role="status"><p><b>${pluriel(utilisees, 'tentative déjà jouée', 'tentatives déjà jouées')} à ce palier : ${attendues} cartes sont bloquées, ${n ? `${n} seulement marquée${n > 1 ? 's' : ''}` : 'aucune n’est marquée'}.</b> Les propositions peuvent contenir des cartes que tu ne peux plus jouer.</p>` +
    `<button type="button" class="bouton principal" data-marquer="${sport}">Marquer les cartes jouées</button></div>`;
}

function afficherPaliers() {
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
  const TRIS = [['e', 'Tri : les plus utiles (chances × score)'], ['s', "Tri : score s'il joue"], ['p', 'Tri : chances de jouer'], ['f', 'Tri : joueur en forme'], ['q', 'Tri : équipe en forme'], ['d', "Tri : coup d'envoi"]];
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
  // Résumé des filtres repliés : ce qui est réglé, en une ligne.
  $('resume-filtres').textContent = `Filtres : ${vue.creneau ? libelleJournee(vue.sport, vue.creneau) : 'toutes les journées'} · ${TRIS.find(([k]) => k === vue.tri)[1].replace('Tri : ', 'tri ')} · ${Math.round(seuil() * 100)} %${vue.dispo ? ' · disponibles' : ''}`;
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
  const tri = { e: (a, b) => esp(b) - esp(a), s: (a, b) => (b.pr.siJoue ?? -1) - (a.pr.siJoue ?? -1), p: (a, b) => (b.pr.p ?? -1) - (a.pr.p ?? -1),
    f: (a, b) => (formeDe(b.j)?.ecart ?? -9) - (formeDe(a.j)?.ecart ?? -9),
    q: (a, b) => (formeEquipe(b.j.club?.slug)?.pctVictoires ?? -1) - (formeEquipe(a.j.club?.slug)?.pctVictoires ?? -1) || esp(b) - esp(a),
    d: (a, b) => (a.m?.debutUTC ?? '9').localeCompare(b.m?.debutUTC ?? '9') }[vue.tri] ?? ((a, b) => esp(b) - esp(a));
  L.sort(tri);
  $('compte').textContent = `${L.length} carte${L.length > 1 ? 's' : ''}`;
  if (!L.length) { $('liste').innerHTML = '<div class="vide-liste">Aucune carte ne correspond. Décoche « disponibles seulement » pour tout voir.</div>'; return; }
  $('liste').innerHTML = L.slice(0, 200).map((l) => {
    const st = statut(l), c = l.c;
    return `<button type="button" class="ligne${J.has(c.id) ? ' bloquee' : ''}" data-id="${esc(c.id)}">
      ${vignette(l)}
      <div style="min-width:0">
        <div class="nom">${esc(l.j.nom)} ${badgeEtoiles(l)}</div>
        <div class="meta"><span>${esc(l.j.postes.join('/'))} · ${esc(l.j.club?.nom ?? '?')}</span><span>${ligneMatch(l)}</span></div>
        <div class="puces">
          <span class="etiq ${st}">${LIBELLES[st]}</span>
          ${c.bonusPct ? `<span class="etiq bonus">${esc(c.collection)} +${nb(c.bonusPct)} %</span>` : ''}
          ${!l.pr.eligibleArcade && l.m ? '<span class="etiq exclu" title="Compétition non autorisée en solo">hors solo</span>' : ''}
          ${J.has(c.id) ? '<span class="etiq neutre">jouée à ce palier</span>' : ''}
          ${pucesContexte(l)}
        </div>
        ${ligneForme(l)}
      </div>
      ${chiffresJoueur(l)}
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
      `<title>${x.date.slice(0, 10)} : ${Math.round(x.score)} pts${x.minutes != null ? `, ${x.minutes} min` : ''} (${SIT[x.situation]})</title></rect>` +
      `<text x="${bx + w / 2}" y="${H - hh - 3}" text-anchor="middle" font-size="9" fill="var(--doux)">${Math.round(x.score)}</text>`;
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
    <section class="forme-fiche"><h3 class="titre-forme">Forme</h3>
      <div class="grille-forme">${blocFormeEquipe('Son équipe', j.club?.nom, formeEquipe(j.club?.slug), c.sport)}${l.m ? blocFormeEquipe('Adversaire', l.adv, formeEquipe(slugAdversaire(l)), c.sport) : ''}${blocFormeJoueur(l)}</div>
      <p class="sous">Affiché pour information : la forme de l'équipe ne change pas les chances calculées (elle n'apportait rien de plus que la cote du match sur ton historique).</p></section>
    <div class="histo"><div class="sous" style="margin-bottom:4px">Derniers matchs de l'équipe (du plus ancien au plus récent)</div>${histogramme(l)}
      <div class="legende"><span><i style="background:var(--titulaire)"></i>${c.sport === 'nba' ? 'joué' : 'titulaire'}</span>${c.sport === 'football' ? '<span><i style="background:var(--entre)"></i>entré en jeu</span>' : ''}<span>B banc · A absent</span></div></div>
    ${pr.raisons.length ? `<ul class="raisons">${pr.raisons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="actions">
      ${palier ? `<button type="button" class="bouton principal" id="basculer">${J.has(c.id) ? 'Remettre disponible' : `Marquer comme jouée (palier ${palier.cible})`}</button>` : ''}
      <button type="button" class="bouton" id="fermer">Fermer</button>
    </div></div>`;
  v.hidden = false;
  ouvrirVolet(v);
  v.querySelector('#fermer').onclick = () => { v.hidden = true; };
  const b = v.querySelector('#basculer');
  if (b) b.onclick = () => { basculer(c.sport, c.id); v.hidden = true; };
  v.onclick = (e) => { if (e.target === v) v.hidden = true; };
}

// Le volet s'ouvre en haut (nom et carte visibles) : le focus va au volet lui-même, sans défilement.
function ouvrirVolet(v) {
  const volet = v.querySelector('.volet');
  volet.setAttribute('tabindex', '-1');
  volet.scrollTop = 0;
  volet.focus({ preventScroll: true });
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
const ETATS = { LINEUP_SET: 'composition posée, matchs à venir', PLAYABLE: 'à jouer', LIVE: 'tentative en cours', FAILED: 'échoué', LOCKED: 'verrouillé' };

function afficherAccueil() {
  $('blocs').innerHTML = ['football', 'nba'].map((s) => {
    const p = palierEnCours(s), n = jouees(s).size;
    const liens = `<div class="modes-sport"><a class="bouton principal lien" href="#${s}/solo">Solo</a><a class="bouton lien" href="#${s}/squad">Squad</a><a class="bouton lien" href="#${s}/cartes">Mes cartes</a></div>`;
    if (!p) return `<div class="bloc" data-sport="${s}"><h2><a href="#${s}/solo" class="nom-sport">${ICONES[s]}${SPORTS[s]}</a></h2><div class="resume">Tous les paliers de ce plateau sont passés.</div>${liens}</div>`;
    return `<div class="bloc" data-sport="${s}">
      <h2><a href="#${s}/solo" class="nom-sport">${ICONES[s]}${SPORTS[s]}</a><span class="sous">solo · palier ${p.niveau + 1} sur ${D.paliers.filter((x) => x.sport === s).length}</span></h2>
      <div><span class="cible">${p.cible}</span> <span class="sous">points à atteindre</span></div>
      <div class="resume">${ETATS[p.etat] ?? esc(p.etat)}${p.echecs ? ` · ${p.echecs} échec${p.echecs > 1 ? 's' : ''}` : ''}${n ? ` · ${n} carte${n > 1 ? 's' : ''} marquée${n > 1 ? 's' : ''} jouée${n > 1 ? 's' : ''}` : ''}</div>
      ${alertePalier(s)}
      <div class="resume" id="resume-${s}">Calcul de la meilleure équipe…</div>
      ${liens}
    </div>`;
  }).join('');
  for (const s of ['football', 'nba']) {
    if (!palierEnCours(s)) continue;
    plusTard(() => propositions(s)).then((r) => {
      const el = $(`resume-${s}`); if (!el) return;
      const e = r?.prudente;
      el.innerHTML = e ? `Prudente : <b>${pct(e.pPasser)}</b> de chances de passer · les 5 jouent <b>${pct(e.pComplete)}</b> · verrouillée ${esc(quand(e.verrouillage))}`
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
      <div class="case-chiffre"><span>Score attendu</span><b>${nb(e.scoreMoyen)}</b></div>
      <div class="case-chiffre"><span>Verrouillage</span><b style="font-size:1.05rem">${esc(quand(e.verrouillage))}</b></div>
    </div>
    <div class="joueurs">${membres.map((l) => {
      const st = statut(l);
      return `<div class="joueur" data-fiche="${esc(l.c.id)}" role="button" tabindex="0" aria-label="Voir la carte de ${esc(l.j.nom)}">${vignette(l)}<div style="min-width:0">
          <div class="nom">${esc(l.j.nom)}${e.capitaine === l.c.id ? '<span class="capitaine">C</span>' : ''} ${badgeEtoiles(l)}</div>
          <div class="meta"><span>${esc(l.j.postes.join('/'))}</span><span>${ligneMatch(l)}</span></div>
          <div class="puces"><span class="etiq ${st}">${LIBELLES[st]}</span>${l.c.bonusPct ? `<span class="etiq bonus">${esc(l.c.collection)} +${nb(l.c.bonusPct)} %</span>` : ''}${pucesContexte(l)}</div>
          ${ligneForme(l)}
        </div>
        ${chiffresJoueur(l)}</div>`;
    }).join('')}</div>
    <div class="sous">Résultat connu après le dernier match (${esc(quand(dernier))}).</div>
    <div class="actions"><button type="button" class="bouton" data-jouer="${esc(e.cartes.join(','))}" data-sport="${sport}">J'ai joué cette équipe</button></div>
  </article>`;
}

function afficherPropositions(sport) {
  const p = palierEnCours(sport);
  $('titre-propositions').textContent = `Solo · palier ${p ? p.cible : '—'}`;
  $('alerte-solo').innerHTML = alertePalier(sport);
  if (!p) { $('contexte-propositions').textContent = ''; $('propositions').innerHTML = '<p class="attente">Tous les paliers de ce plateau sont passés.</p>'; return; }
  const n = jouees(sport).size;
  const ep = etatPalier(p);
  // Le nombre de cartes marquées n'est rappelé que s'il y en a (l'alerte du palier dit le reste).
  $('contexte-propositions').textContent = [ep.enCours && !ep.derniere ? 'Une tentative est en cours : ces propositions servent à la suivante si elle échoue.' : '',
    n ? `${n} carte${n > 1 ? 's' : ''} marquée${n > 1 ? 's' : ''} jouée${n > 1 ? 's' : ''} à ce palier, écartée${n > 1 ? 's' : ''} des propositions.` : ''].filter(Boolean).join(' ');
  document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === vue.mode)));
  $('seuil-solo').value = String(seuil());
  $('propositions').innerHTML = '<p class="attente">Simulation des meilleures équipes…</p>';
  if (vue.mode === 'unique') { afficherCreneaux(sport); return; }
  plusTard(() => propositions(sport)).then((r) => {
    if (!surSolo(sport)) return;
    if (!r.equilibree) { $('propositions').innerHTML = `<p class="attente">${esc(r.message)}</p>`; return; }
    const memes = r.prudente.cartes.join() === r.equilibree.cartes.join() && r.prudente.capitaine === r.equilibree.capitaine;
    const ecartees = Object.entries(r.ecartees).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>${v} ${esc(k)}</li>`).join('');
    // Les variantes (équilibrée, ambitieuse) sont repliées : une ligne de résumé, la composition au toucher.
    const variante = (nom, e) => `<details class="variante"><summary><span class="titre-variante">${TITRES[nom][0]}</span>` +
      `<span><b>${pct(e.pPasser)}</b> de chances de passer · les 5 jouent ${pct(e.pComplete)}</span></summary>${carteProposition(nom, e, sport, false)}</details>`;
    const variantes = [
      memes ? '' : variante('equilibree', r.equilibree),
      r.ambitieuse ? variante('ambitieuse', r.ambitieuse) : '',
    ].join('');
    $('propositions').innerHTML =
      carteProposition('prudente', r.prudente, sport, true) +
      (variantes ? `<h2 class="sous-titre">Autres propositions</h2>${variantes}` : '<p class="sous">Pas d’autre proposition : l’équipe prudente est aussi la plus forte.</p>') +
      '<section class="autres" id="autres-choix"><h2>Autres choix</h2><p class="attente">Recherche des autres joueurs…</p></section>' +
      `<details class="ecartees"><summary>${r.admissibles} cartes retenues, ${r.nbEquipes} équipes comparées en ${nb(r.dureeMs / 1000, 1)} s</summary><ul>${ecartees}</ul>` +
      `<p>Chances calculées par ${D.P.simulation.tirages} tirages (méthode v${D.P.version}). Les joueurs sont tirés indépendamment : deux coéquipiers ont en réalité des scores liés.</p></details>`;
    plusTard(() => autres(sport, r.prudente)).then((a) => afficherAutres(sport, r.prudente, a));
  });
}

// Autres choix : regroupés par joueur remplacé, un seul par joueur (sa meilleure carte),
// avec la chance de passer avant → après. Un match bien plus tard que l'équipe est signalé.
const AUTRES_PAR_GROUPE = 5;
function afficherAutres(sport, equipe, a) {
  const el = $('autres-choix'); if (!el || !surSolo(sport)) return;
  const parId = new Map(lignes.map((l) => [l.c.id, l]));
  const dernier = Math.max(...equipe.cartes.map((id) => Date.parse(parId.get(id).m.debutUTC)));
  const vus = new Set(), parRemplace = new Map();
  const tous = a.groupes.flatMap((g) => g.choix).filter((c) => c.remplace && c.pPasser != null).sort((x, y) => y.pPasser - x.pPasser);
  for (const c of tous) {
    const l = parId.get(c.carteId); if (!l || vus.has(l.j.id)) continue;
    vus.add(l.j.id);
    if (!parRemplace.has(c.remplace)) parRemplace.set(c.remplace, []);
    parRemplace.get(c.remplace).push(c);
  }
  if (!parRemplace.size) { el.innerHTML = '<h2>Autres choix</h2><p class="sous">Pas d’autre carte admissible.</p>'; return; }
  el.innerHTML = `<h2>Autres choix</h2><p class="sous">D’autres joueurs qui peuvent performer, si tu préfères ajuster l’équipe prudente. Pour chacun : la chance de passer avant → après le changement.</p>` +
    [...parRemplace.entries()].map(([rem, choix]) => {
      const r = parId.get(rem);
      return `<div class="groupe"><h3>À la place de ${esc(r.j.nom)} <span class="sous">(${esc(r.j.postes.join('/'))})</span></h3>${choix.slice(0, AUTRES_PAR_GROUPE).map((c) => {
        const l = parId.get(c.carteId);
        const classe = c.ecart >= 0.005 ? 'plus' : c.ecart <= -0.005 ? 'moins' : 'egal';
        const tard = Date.parse(l.m.debutUTC) - dernier > 36 * 3600000 ? `<span class="etiq incertain">résultat le ${esc(fJour.format(new Date(l.m.debutUTC)))}</span>` : '';
        return `<div class="alt" data-fiche="${esc(l.c.id)}" role="button" tabindex="0" aria-label="Voir la carte de ${esc(l.j.nom)}">${vignette(l)}<div style="min-width:0">
          <div class="nom">${esc(l.j.nom)}${c.capitaine === c.carteId ? '<span class="capitaine">C</span>' : ''} ${badgeEtoiles(l)}</div>
          <div class="meta"><span>${esc(l.j.postes.join('/'))} · joue à ${pct(c.p)} · ${nb(c.siJoue)} pts s'il joue</span><span>${ligneMatch(l)}</span></div>
          ${tard || pucesContexte(l) ? `<div class="puces">${tard}${pucesContexte(l)}</div>` : ''}
          ${ligneForme(l)}
        </div>
        <div class="droite"><span class="avant-apres">${pct(equipe.pPasser)} → <b class="${classe}">${pct(c.pPasser)}</b></span><small>chances de passer</small></div></div>`;
      }).join('')}</div>`;
    }).join('');
}

// Créneau unique : un créneau par coup d'envoi, avec sa meilleure équipe.
function afficherCreneaux(sport) {
  plusTard(() => parCreneau(sport)).then((r) => {
    if (!surSolo(sport) || vue.mode !== 'unique') return;
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
      `<p class="sous">${r.creneaux.length} créneaux comparés en ${nb(r.dureeMs / 1000, 1)} s.</p>`;
  });
}

// ---------- Squad du jour ----------
function afficherSquad() {
  // Journée de jeu au sens de Sorare (regles/squad.json) : en NBA, date de New York (soirée + nuit à Paris).
  const J = D.journees[vue.sport];
  const jours = joursAVenir(lignesMoteur(vue.sport), Date.now(), J.fuseau);
  if (!jours.includes(vue.squadJour)) vue.squadJour = jours[0] ?? null;
  $('squad-jour').innerHTML = jours.map((j) => `<option value="${j}" ${j === vue.squadJour ? 'selected' : ''}>${libelleJournee(vue.sport, j)}</option>`).join('');
  if (!vue.squadJour) { $('squad').innerHTML = '<p class="attente">Aucun match à venir.</p>'; return; }
  $('squad').innerHTML = '<p class="attente">Recherche de la meilleure équipe…</p>';
  const sport = vue.sport, jour = vue.squadJour;
  plusTard(() => squad(sport, jour)).then((r) => {
    if (vueCourante() !== 'squad' || vue.sport !== sport || vue.squadJour !== jour) return;
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
          <div class="meta"><span>${esc(l.j.postes.join('/'))}</span><span>${ligneMatch(l)}</span></div>
          <div class="puces"><span class="etiq ${statut(l)}">${LIBELLES[statut(l)]}</span>${l.c.bonusPct ? `<span class="etiq bonus">${esc(l.c.collection)} +${nb(l.c.bonusPct)} %</span>` : ''}${jouees(sport).has(l.c.id) ? '<span class="etiq neutre">jouée en solo</span>' : ''}${pucesContexte(l)}</div>
          ${ligneForme(l)}
        </div>${chiffresJoueur(l)}</div>`).join('')}</div>
      <div class="sous">${r.admissibles} cartes du jour retenues, ${r.nbEquipes} équipes comparées. Règles de composition supposées identiques au solo (à confirmer).</div>
    </article>`;
  });
}

// ---------- Marquage rapide des cartes jouées ----------
// Recherche par nom ; un appui coche ou décoche. Les propositions ne sont recalculées qu'à la fermeture.
const sansAccents = (x) => (x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function ouvrirMarquage(sport) {
  const p = palierEnCours(sport); if (!p) return;
  const attendues = 5 * etatPalier(p).utilisees;
  const v = $('voile');
  v.innerHTML = `<div class="volet" role="dialog" aria-modal="true" aria-labelledby="titre-marquage">
    <h2 id="titre-marquage">Cartes jouées · ${SPORTS[sport]} · palier ${p.cible}</h2>
    <p class="sous" id="compte-marquage"></p>
    <input type="search" class="recherche" id="recherche-marquage" placeholder="Chercher un joueur" autocomplete="off" aria-label="Chercher un joueur">
    <div class="liste-marquage" id="liste-marquage"></div>
    <div class="actions"><button type="button" class="bouton principal" id="fermer">Terminé</button></div></div>`;
  const cartes = lignes.filter((l) => l.c.sport === sport);
  const dessiner = () => {
    const J = jouees(sport), q = sansAccents($('recherche-marquage').value.trim());
    $('compte-marquage').textContent = `${J.size} marquée${J.size > 1 ? 's' : ''}${attendues ? ` sur ${attendues} jouées à ce palier (${etatPalier(p).utilisees} × 5)` : ''}. Les cartes cochées ne seront plus proposées en solo.`;
    const L = cartes.filter((l) => !q || sansAccents(l.j.nom).includes(q))
      .sort((a, b) => (J.has(b.c.id) - J.has(a.c.id)) || ((b.pr.esperance ?? -1) - (a.pr.esperance ?? -1)));
    $('liste-marquage').innerHTML = L.slice(0, 40).map((l) => `<button type="button" class="marque" data-carte="${esc(l.c.id)}" aria-pressed="${J.has(l.c.id)}">
        <span class="case-a-cocher" aria-hidden="true">${J.has(l.c.id) ? '✓' : ''}</span>
        <span style="min-width:0"><span class="nom">${esc(l.j.nom)}</span> ${badgeEtoiles(l)}<br><span class="sous">${esc(l.j.postes.join('/'))} · ${esc(l.j.club?.nom ?? '?')} · ${esc(l.c.collection ?? '')}${l.c.bonusPct ? ` +${nb(l.c.bonusPct)} %` : ''}</span></span>
        <span class="sous">${nb(l.pr.esperance)}</span></button>`).join('') +
      (L.length > 40 ? `<p class="sous">${L.length - 40} autres cartes : affine la recherche.</p>` : '') +
      (!L.length ? '<p class="sous">Aucune carte à ce nom.</p>' : '');
  };
  v.hidden = false;
  dessiner();
  ouvrirVolet(v);
  $('recherche-marquage').oninput = dessiner;
  $('liste-marquage').onclick = (e) => {
    const b = e.target.closest('[data-carte]'); if (!b) return;
    const ensemble = jouees(sport), id = b.dataset.carte;
    ensemble.has(id) ? ensemble.delete(id) : ensemble.add(id);
    etatUtilisateur = { ...etatUtilisateur, [sport]: { cible: p.cible, jouees: [...ensemble], misAJour: new Date().toISOString() } };
    stockage.enregistrer(etatUtilisateur);
    dessiner();
  };
  const fermer = () => { v.hidden = true; tout(); };
  $('fermer').onclick = fermer;
  v.onclick = (e) => { if (e.target === v) fermer(); };
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
// Adresse : #<sport>/<mode> (#football/solo, #nba/cartes…) ou #accueil.
// Anciennes adresses acceptées : #arcade-nba, #propositions-nba, #squad-football, #cartes…
const MODES = ['solo', 'squad', 'cartes'];
function lireAdresse() {
  const h = location.hash.slice(1);
  let m = h.match(/^(football|nba)\/(solo|squad|cartes)$/);
  if (m) return { ecran: m[2], sport: m[1] };
  m = h.match(/^(arcade|propositions|squad|cartes)(?:-(football|nba))?$/);
  if (m) return { ecran: ['arcade', 'propositions'].includes(m[1]) ? 'solo' : m[1], sport: m[2] ?? null };
  return { ecran: 'accueil', sport: null };
}
const vueCourante = () => lireAdresse().ecran;
const surSolo = (sport) => vueCourante() === 'solo' && vue.sport === sport;

function changerSport(s) {
  if (s === vue.sport) return;
  vue.sport = s; vue.poste = null; vue.creneau = ''; vue.etoiles = null; vue.creneauOuvert = null;
}

function tout() {
  const { ecran, sport } = lireAdresse();
  if (sport) changerSport(sport);
  const accueil = ecran === 'accueil';
  $('vue-accueil').hidden = !accueil;
  $('vue-propositions').hidden = ecran !== 'solo';
  $('vue-cartes').hidden = ecran !== 'cartes';
  $('vue-squad').hidden = ecran !== 'squad';
  document.body.dataset.sport = accueil ? '' : vue.sport; // couleur du sport en cours
  accueil ? $('lien-accueil').setAttribute('aria-current', 'page') : $('lien-accueil').removeAttribute('aria-current');
  // Sélecteur de sport, toujours visible : sur l'accueil, aucun n'est choisi ; ailleurs, on garde le mode.
  $('sport-global').innerHTML = Object.entries(SPORTS).map(([k, v]) =>
    `<a href="#${k}/${accueil ? 'solo' : ecran}" data-sport="${k}" aria-label="${v}" aria-current="${!accueil && k === vue.sport ? 'true' : 'false'}">${ICONES[k]}<span>${SPORTS_COURTS[k]}</span></a>`).join('');
  // Modes du sport en cours (masqués sur l'accueil).
  $('onglets').hidden = accueil;
  $('onglets').parentElement.hidden = accueil; // pas de ligne vide sur l'accueil
  document.querySelectorAll('#onglets a').forEach((a) => {
    a.href = `#${vue.sport}/${a.dataset.vue}`;
    a.dataset.vue === ecran ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  afficherPaliers(); afficherStockage();
  if (accueil) afficherAccueil();
  else if (ecran === 'cartes') { $('titre-cartes').textContent = 'Mes cartes'; $('alerte-cartes').innerHTML = alertePalier(vue.sport); commandes(); liste(); }
  else if (ecran === 'squad') afficherSquad();
  else afficherPropositions(vue.sport);
}

// Bouton « Marquer les cartes jouées » (Accueil, Solo, Mes cartes).
document.addEventListener('click', (e) => { const b = e.target.closest('[data-marquer]'); if (b) ouvrirMarquage(b.dataset.marquer); });

$('postes').onclick = (e) => { const b = e.target.closest('button'); if (b) { vue.poste = b.dataset.poste || null; tout(); } };
$('filtre-etoiles').onclick = (e) => { const b = e.target.closest('button'); if (b) { vue.etoiles = b.dataset.etoiles === '' ? null : Number(b.dataset.etoiles); commandes(); liste(); } };
$('creneau').onchange = (e) => { vue.creneau = e.target.value; commandes(); liste(); };
$('tri').onchange = (e) => { vue.tri = e.target.value; commandes(); liste(); };
$('dispo').onchange = (e) => { vue.dispo = e.target.checked; commandes(); liste(); };
// Seuil de chances de jouer : un seul réglage, modifiable depuis Solo et depuis Mes cartes.
for (const id of ['seuil', 'seuil-solo']) $(id).onchange = (e) => { etatUtilisateur = { ...etatUtilisateur, seuil: Number(e.target.value) }; stockage.enregistrer(etatUtilisateur); tout(); };
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
  if (c) { vue.creneauOuvert = vue.creneauOuvert === c.dataset.creneau ? null : c.dataset.creneau; afficherCreneaux(vue.sport); return; }
  const b = e.target.closest('[data-jouer]'); if (!b) return;
  jouerEquipe(b.dataset.sport, b.dataset.jouer.split(','));
};
$('modes').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) { vue.mode = b.dataset.mode; tout(); } };
$('squad-jour').onchange = (e) => { vue.squadJour = e.target.value; afficherSquad(); };
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); tout(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('voile').hidden) { $('voile').hidden = true; tout(); } });

// ---------- Mise à jour manuelle ----------
// Le bouton ↻ lance, par le connecteur « Claude Code Remote » (capacité mcp), la tâche programmée qui
// récupère les données, reconstruit et republie l'appli. La session écrit son avancement dans le
// document partagé actualisation/etat (db) : la barre suit ce document. Voir CLAUDE.md.
const MAJ = { serveur: 'Claude Code Remote', outil: 'fire_trigger', tache: 'trig_01BXGayHMVXjJruFWEyV6TPN', dureeEstimeeS: 120, bloqueeApresMin: 15 };
let etatMaj = null;          // dernier état lu dans db (null : pas de db ou pas encore lu)
let demandeMaj = null;       // { t, message } : appui fait ici, en attente de la session
let messageMaj = null;       // message d'erreur ou d'information hors db
let majIndisponible = null;  // raison si le bouton ne peut pas marcher dans cette vue
const plusRecent = (a, b) => (a && b ? Date.parse(a) > Date.parse(b) + 1000 : false);

function afficherMaj() {
  const e = etatMaj, maintenant = Date.now();
  const enCours = e?.statut === 'en_cours' && (!e.debut || maintenant - Date.parse(e.debut) < MAJ.bloqueeApresMin * 60000);
  const bloquee = e?.statut === 'en_cours' && !enCours;
  const finie = e?.statut === 'termine' && plusRecent(e.donneesDe, D.meta.recupereA);
  const erreurRecente = e?.statut === 'erreur' && demandeMaj && Date.parse(e.fin) > demandeMaj.t - 60000;
  if (demandeMaj && (enCours || finie || erreurRecente)) demandeMaj = enCours ? demandeMaj : null;
  let pourcent = null, texte = '', classe = '';
  if (enCours) { pourcent = Math.max(5, e.pourcent ?? 5); texte = `${e.etape ?? 'Mise à jour…'} (${pourcent} %)`; }
  else if (demandeMaj) {
    const s = (maintenant - demandeMaj.t) / 1000;
    pourcent = Math.min(8, 2 + s / 10); // en attendant que la session démarre et écrive
    texte = demandeMaj.message ?? 'Demande envoyée : la mise à jour démarre (environ 2 min)…';
  } else if (finie) { pourcent = 100; texte = `Nouvelles données publiées (${fHeure.format(new Date(e.donneesDe))}).`; classe = 'ok'; }
  else if (erreurRecente || (e?.statut === 'erreur' && !demandeMaj && maintenant - Date.parse(e.fin) < 30 * 60000)) { texte = `La mise à jour a échoué : ${e.erreur ?? 'raison inconnue'}.`; classe = 'erreur'; }
  else if (bloquee) { texte = 'La dernière mise à jour semble bloquée. Tu peux la relancer.'; classe = 'erreur'; }
  if (messageMaj && !enCours) { texte = messageMaj; classe = 'erreur'; pourcent = null; }
  const visible = Boolean(texte);
  $('progression').hidden = !visible;
  $('progression').className = `progression ${classe}`;
  $('prog-remplie').style.width = `${pourcent ?? 0}%`;
  $('progression').querySelector('.jauge-maj').hidden = pourcent == null;
  $('prog-texte').textContent = texte;
  $('prog-recharger').hidden = !finie;
  const occupe = enCours || Boolean(demandeMaj);
  $('maj').disabled = occupe || Boolean(majIndisponible);
  $('maj').classList.toggle('tourne', occupe);
  $('maj').title = majIndisponible ?? (occupe ? 'Mise à jour en cours' : 'Mettre à jour les données');
}

// Messages selon le code d'erreur du connecteur (jamais un seul message pour tout).
function messageErreurMaj(err) {
  switch (err?.code) {
    case 'approval_required': case 'not_in_manifest': case 'consent_required':
      return 'La mise à jour a besoin de ton accord pour le connecteur Claude Code Remote. Réappuie sur ↻ et accepte, ou écris « actualise » à Claude.';
    case 'server_not_connected': case 'server_not_found':
      return 'Connecteur Claude Code Remote introuvable : ajoute-le dans claude.ai (Réglages, Connecteurs), ou écris « actualise » à Claude.';
    case 'needs_reauth': return 'Connecteur Claude Code Remote à reconnecter (claude.ai, Réglages, Connecteurs).';
    case 'selection_required': return 'Choisis quel connecteur Claude Code Remote utiliser quand claude.ai te le demande, puis réappuie sur ↻.';
    case 'blocked_by_policy': return 'Ton organisation bloque ce lancement : écris « actualise » à Claude.';
    case 'tool_error': return `La tâche n'a pas pu être lancée : ${err.message ?? 'erreur'}.`;
    case 'server_unavailable': case 'upstream_error': case 'cancelled':
      return 'Pas de réponse nette : la mise à jour est peut-être partie. Attends une minute avant de réessayer.';
    default: return `La mise à jour n'a pas pu être lancée (${err?.code ?? 'erreur inconnue'}). Écris « actualise » à Claude.`;
  }
}

async function lancerMaj() {
  messageMaj = null;
  const mcp = await window.claude?.use?.('mcp');
  if (!mcp) { messageMaj = 'Mise à jour impossible depuis cette vue : écris « actualise » à Claude.'; afficherMaj(); return; }
  demandeMaj = { t: Date.now() };
  afficherMaj();
  try {
    await mcp.callTool(MAJ.serveur, MAJ.outil, { trigger_id: MAJ.tache });
    demandeMaj.message = etatMaj ? null : 'Mise à jour lancée : l’appli sera republiée dans 2 minutes environ. Recharge la page ensuite.';
  } catch (err) {
    const ambigu = ['server_unavailable', 'upstream_error', 'cancelled'].includes(err?.code);
    if (!ambigu) demandeMaj = null;
    messageMaj = messageErreurMaj(err);
  }
  afficherMaj();
}

async function brancherMaj() {
  $('maj').innerHTML = ICONES.maj; $('aide').innerHTML = ICONES.aide;
  $('maj').onclick = lancerMaj;
  $('prog-recharger').onclick = () => location.reload();
  afficherMaj();
  setInterval(afficherMaj, 2000);
  const [mcp, db] = await Promise.all([window.claude?.use?.('mcp') ?? null, window.claude?.use?.('db') ?? null]);
  if (!mcp) { majIndisponible = 'Mise à jour indisponible ici : écris « actualise » à Claude.'; afficherMaj(); }
  else {
    // L'outil peut manquer à ce visiteur : on vérifie sans rien demander (listTools ne demande jamais).
    mcp.listTools(MAJ.serveur).then((r) => {
      const srv = r.servers.find((x) => x.server === MAJ.serveur);
      if (srv && srv.authStatus !== 'unknown' && !srv.tools.some((t) => t.name === MAJ.outil)) {
        majIndisponible = 'Ton connecteur Claude Code Remote ne permet pas de lancer la tâche : écris « actualise » à Claude.'; afficherMaj();
      }
    }).catch(() => {});
  }
  if (db) db.doc('actualisation/etat').onSnapshot((snap) => { etatMaj = snap.exists ? snap.data() : null; afficherMaj(); }, () => {});
}

// ---------- Aide (à venir) ----------
$('aide').onclick = () => {
  const v = $('voile');
  v.innerHTML = `<div class="volet" role="dialog" aria-modal="true" aria-labelledby="titre-aide">
    <h2 id="titre-aide">Aide</h2>
    <p class="sous">L’aide de l’appli arrive bientôt.</p>
    <div class="actions"><button type="button" class="bouton principal" id="fermer">Fermer</button></div></div>`;
  v.hidden = false; ouvrirVolet(v);
  $('fermer').onclick = () => { v.hidden = true; };
  v.onclick = (e) => { if (e.target === v) v.hidden = true; };
};

brancherMaj();

// ---------- Mode sombre ----------
// Par défaut, celui du système ; le bouton force clair ou sombre, retenu dans ce navigateur (simple confort).
const CLE_THEME = 'sorare-aide-theme';
const themeActuel = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function afficherBoutonTheme() {
  const sombre = themeActuel() === 'dark', b = $('theme');
  b.setAttribute('aria-pressed', String(sombre));
  b.setAttribute('aria-label', sombre ? 'Passer en mode clair' : 'Passer en mode sombre');
  b.title = b.getAttribute('aria-label');
  b.innerHTML = sombre ? ICONES.soleil : ICONES.lune;
}
try { const t = localStorage.getItem(CLE_THEME); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { /* stockage refusé */ }
$('theme').onclick = () => {
  const t = themeActuel() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(CLE_THEME, t); } catch (e) { /* stockage refusé : le choix vaut pour cette visite */ }
  afficherBoutonTheme();
};
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', afficherBoutonTheme);
afficherBoutonTheme();

afficherAge();
setInterval(afficherAge, 60000);
stockage.brancher((v) => { etatUtilisateur = { ...etatVide(), ...v }; tout(); });
