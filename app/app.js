// Interface de Sorare aide. Refonte « Salle d'analyse + projecteur » validée le 2026-11-08
// (docs/refonte-2026-11 : maquette 6, rapports R1 à R3). Navigation demandée par l'utilisateur :
// un sélecteur Football / NBA toujours accessible (et sur l'accueil), puis, dans chaque sport,
// Solo (Arcade), Squad et Mes cartes. Adresse : #<sport>/<mode> ou #accueil.
// Sur PC (≥ 1 024 px) : barre latérale ; sur téléphone : barre collante en haut et onglets en bas.
// Fonctionne dans l'artifact (données intégrées dans #donnees) et hors artifact
// (données lues dans donnees-app.json à côté de la page). Le moteur tourne ici, dans le
// navigateur ; méthode et règles viennent des données (methode.md, regles/).
//
// État de l'utilisateur (cartes jouées au palier en cours, seuil) : capacité `db`
// de l'artifact (document privé data/users/<id>/etat, partagé entre appareils),
// sinon stockage du navigateur.

import { projeterCarte } from '../src/moteur/projection.js';
import { proposer, proposerParCreneau, squadDuJour, joursAVenir, jourDeJeu, autresChoix } from '../src/moteur/compositions.js';
import { statsEquipe, serieEnMots, formeJoueur, resultat } from '../src/moteur/forme.js';
import { distribution, tirerTotaux, resumerTirages, quantilesSiJoue, multiplicateurCarte } from '../src/moteur/simulation.js';

// ---------- Données ----------
const STATUTS_CODES = { F: 'FINAL', R: 'REVIEWING', D: 'DID_NOT_PLAY' };
const SITUATIONS_CODES = { t: 'titulaire', e: 'entre', j: 'joue', b: 'banc', a: 'absent', i: 'inconnu' };

// Version web autonome (web/web.js) : elle prépare les données dans le navigateur et les fournit ici.
const WEB = window.SORARE_WEB ?? null;

async function chargerDonnees() {
  if (WEB) return WEB.donnees;
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
const AUTRE = { football: 'nba', nba: 'football' };
// Icônes de sport, famille A « trait » (docs/refonte-2026-11/icones) : petit master (grille 24)
// jusqu'à 32 px, grand master (grille 64) au-delà ; couleur du texte.
const BALLONS = {
  football: {
    petit: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M12 8.06L8.25 10.78L9.68 15.2L14.32 15.2L15.75 10.78ZM8.74 4.07L12 5.4L15.26 4.07L14.4 1.6L9.6 1.6ZM3.45 12.65L5.72 9.96L5.47 6.45L2.85 6.5L1.37 11.07ZM9.98 20.33L8.12 17.34L4.7 16.5L3.95 19L7.83 21.82ZM19.3 16.5L15.88 17.34L14.02 20.33L16.17 21.82L20.05 19ZM18.53 6.45L18.28 9.96L20.55 12.65L22.63 11.07L21.15 6.5Z"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M12 8.06L12 5M8.25 10.78L5.34 9.84M9.68 15.19L7.89 17.66M14.32 15.19L16.11 17.66M15.75 10.78L18.66 9.84"/></svg>',
    grand: '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M27.7 16.6A29 15.4 -34.4 0 0 18.2 23.3A29 10.8 67.9 0 0 21.3 34.2A29 2.2 -0.8 0 0 32.8 34.2A29 1.6 -69.6 0 0 36.8 23.3A29 9.7 42 0 0 27.7 16.6ZM59.2 28A29 27 -65.5 0 0 56.1 17.1A29 17.9 -22 0 0 48.7 13.1A29 10 -60.6 0 1 47.3 21.6A29 18.1 41.1 0 1 53.8 30.8A29 4.7 -11.6 0 0 59.2 28ZM34.4 52.5A29 12.4 55.6 0 0 41.7 56.5A29 26.1 -37.5 0 0 51.3 49.7A29 11.4 54.2 0 0 49.8 41.6A29 11.5 2.2 0 1 39.4 43.4A29 10.9 -73.1 0 1 34.4 52.5ZM37.6 60.4A29 28.5 -79.1 0 1 26.5 60.5A29 29 0 0 0 38.7 60.2A29 14.8 76.6 0 1 37.6 60.4ZM10 21.6A29 17.5 54.7 0 1 11.4 13.1A29 13.9 33.7 0 0 7.9 15.9A29 29 0 0 0 3.3 28.1A29 6.4 7.7 0 0 5 30.8A29 22.1 -24.6 0 1 10 21.6ZM18.7 56.5A29 4.3 -59 0 0 22.8 52.5A29 19 69.1 0 1 16.3 43.4A29 10.5 -10.4 0 1 8.1 41.6A29 18.1 -46.5 0 0 9.6 49.7A29 27.2 -10 0 0 18.7 56.5ZM21 6.4A29 16.6 55.1 0 1 29.1 8.1A29 22.2 -43 0 1 39.6 6.4A29 5.6 -78.2 0 0 37.9 3.6A29 28.5 -79.1 0 0 37.5 3.5A29 29 0 0 0 25.3 3.8A29 14.8 76.6 0 0 21 6.4ZM60.7 35.9A29 6.4 7.7 0 1 60.7 36A29 28.7 -1.9 0 1 56.7 46.9A29 13.9 33.7 0 1 56.1 48.1A29 29 0 0 0 60.7 35.9Z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M27.7 16.6A29 15.4 -34.4 0 0 18.2 23.3M18.2 23.3A29 10.8 67.9 0 0 21.3 34.2M21.3 34.2A29 2.2 -0.8 0 0 32.8 34.2M32.8 34.2A29 1.6 -69.6 0 0 36.8 23.3M36.8 23.3A29 9.7 42 0 0 27.7 16.6M59.2 28A29 27 -65.5 0 0 56.1 17.1M56.1 17.1A29 17.9 -22 0 0 48.7 13.1M48.7 13.1A29 10 -60.6 0 1 47.3 21.6M47.3 21.6A29 18.1 41.1 0 1 53.8 30.8M53.8 30.8A29 4.7 -11.6 0 0 59.2 28M34.4 52.5A29 12.4 55.6 0 0 41.7 56.5M41.7 56.5A29 26.1 -37.5 0 0 51.3 49.7M51.3 49.7A29 11.4 54.2 0 0 49.8 41.6M49.8 41.6A29 11.5 2.2 0 1 39.4 43.4M39.4 43.4A29 10.9 -73.1 0 1 34.4 52.5M10 21.6A29 17.5 54.7 0 1 11.4 13.1M11.4 13.1A29 13.9 33.7 0 0 8.9 14.7M3.3 28.8A29 6.4 7.7 0 0 5 30.8M5 30.8A29 22.1 -24.6 0 1 10 21.6M18.7 56.5A29 4.3 -59 0 0 22.8 52.5M22.8 52.5A29 19 69.1 0 1 16.3 43.4M16.3 43.4A29 10.5 -10.4 0 1 8.1 41.6M8.1 41.6A29 18.1 -46.5 0 0 9.6 49.7M9.6 49.7A29 27.2 -10 0 0 18.7 56.5M21 6.4A29 16.6 55.1 0 1 29.1 8.1M29.1 8.1A29 22.2 -43 0 1 39.6 6.4M39.6 6.4A29 5.6 -78.2 0 0 38.4 3.9M23.6 4.4A29 14.8 76.6 0 0 21 6.4M32.8 34.2A29 0.6 54.9 0 0 39.4 43.4M49.8 41.6A29 20.3 -62 0 0 53.8 30.8M47.3 21.6A29 7.2 -16.2 0 0 36.8 23.3M56 16A29 8.1 -35.4 0 1 56.1 17.1M59.2 28A29 19.7 9.4 0 1 60.8 34M18.7 56.5A29 20.3 -78 0 0 23.3 59.5M38 60.2A29 12.2 80.6 0 0 41.7 56.5M34.4 52.5A29 20.6 -10.3 0 1 22.8 52.5M27.7 16.6A29 5 90 0 1 29.1 8.1M21 6.4A29 27.8 -31.1 0 0 11.4 13.1M10 21.6A29 4.1 20 0 1 18.2 23.3M8.1 41.6A29 25.3 46.5 0 1 5 30.8M9 49.4A29 8.1 -35.4 0 0 9.6 49.7M48.7 13.1A29 24.7 62.7 0 0 39.6 6.4M51.3 49.7A29 13.1 28.7 0 0 56.6 47.1M21.3 34.2A29 7.6 -53.4 0 0 16.3 43.4"/><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="2.75"/></svg>',
  },
  nba: {
    petit: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-width="1.75" d="M12 2v20M2 12h20M5 5.2C7.2 7 8.2 9.4 8.2 12S7.2 17 5 18.8M19 5.2C16.8 7 15.8 9.4 15.8 12S16.8 17 19 18.8"/></g></svg>',
    grand: '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M33.1 3C32.9 3.2 32.4 3.3 32 3.8C31.7 4.3 31.3 5.1 30.9 6C30.6 6.9 30.2 8.1 29.9 9.4C29.5 10.8 29.2 12.3 28.9 14C28.6 15.6 28.4 17.5 28.1 19.4C27.9 21.3 27.7 23.4 27.5 25.4C27.3 27.5 27.2 29.7 27.1 31.8C27 33.9 27 36.1 27 38.1C27 40.2 27 42.3 27.1 44.2C27.1 46.1 27.2 48 27.4 49.7C27.5 51.4 27.7 52.9 28 54.3C28.2 55.6 28.4 56.8 28.7 57.8C29 58.8 29.3 59.5 29.6 60.1C29.9 60.6 30.5 60.8 30.7 61M61 32.2C60.8 32.4 60.6 33.2 60.1 33.7C59.6 34.2 58.9 34.7 57.9 35.2C57 35.6 55.8 36.1 54.4 36.4C53.1 36.8 51.5 37.2 49.8 37.5C48.2 37.8 46.3 38.1 44.4 38.3C42.5 38.6 40.4 38.7 38.4 38.8C36.3 39 34.1 39 32 39C29.9 39 27.7 39 25.6 38.8C23.6 38.7 21.5 38.6 19.6 38.3C17.7 38.1 15.8 37.8 14.1 37.5C12.5 37.2 10.9 36.8 9.6 36.4C8.2 36.1 7 35.6 6.1 35.1C5.1 34.7 4.4 34.2 3.9 33.7C3.3 33.2 3.2 32.4 3 32.2M10.7 51.7C11 51.8 11.8 52.4 12.4 52.4C13.1 52.4 13.9 52.2 14.7 51.5C15.5 50.9 16.4 49.9 17.1 48.7C17.8 47.4 18.4 45.8 18.9 44.1C19.3 42.3 19.5 40.3 19.5 38.3C19.5 36.3 19.3 34.1 18.8 32C18.4 30 17.8 27.8 17.1 25.9C16.4 24 15.5 22.2 14.7 20.7C13.9 19.2 13.1 18 12.4 17C11.8 16 11.2 15.4 10.7 14.9C10.3 14.3 10 14.1 10 13.8C9.9 13.5 10.1 13 10.2 12.9M53.5 51.4C53.2 51.6 52.5 52.3 51.7 52.7C50.9 53.1 49.9 53.6 48.7 53.8C47.6 53.9 46.1 54 44.7 53.6C43.4 53.2 41.8 52.5 40.5 51.5C39.2 50.5 37.9 49 37 47.4C36.1 45.8 35.4 43.9 35 41.9C34.7 40 34.7 37.8 35.1 35.7C35.4 33.6 36.2 31.4 37.1 29.5C38 27.5 39.3 25.5 40.6 23.9C41.9 22.2 43.5 20.8 44.9 19.7C46.2 18.5 47.7 17.8 48.8 17.1C50 16.5 51 16.3 51.8 15.9C52.6 15.6 53.2 15.4 53.6 15.1C53.9 14.8 54.1 14.4 54.1 14C54.1 13.6 53.6 12.8 53.5 12.6"/><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="2.75"/></svg>',
  },
};
const ballon = (s, grand = false) => BALLONS[s][grand ? 'grand' : 'petit'];
// Autres icônes, au trait, couleur du texte.
const TRAITS = {
  maison: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  solo: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>',
  squad: '<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 19c1-3.5 3.5-5 6-5s5 1.5 6 5"/><path d="M15.5 15c2.3 0 4 1.2 5 3.5"/>',
  cartes: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.5h16M4 15h16M9.5 9.5V20"/>',
  maj: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
  lune: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  aide: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.5v.7"/><path d="M12 17h.01"/>',
  fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
  haut: '<path d="M6 15l6-6 6 6"/>',
  bas: '<path d="M6 9l6 6 6-6"/>',
  suite: '<path d="M9 6l6 6-6 6"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  epingle: '<path d="M9 3.5h6l-1 6 3 3.5H7l3-3.5z"/><path d="M12 13v7.5"/>',
};
const ico = (n) => (BALLONS[n] ? ballon(n) : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAITS[n]}</svg>`);
const LOGO = '<svg class="logo" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" style="fill:var(--encre)"/><g style="fill:var(--sur-encre)"><rect x="6" y="15" width="3" height="7" rx="1"/><rect x="10.5" y="10" width="3" height="12" rx="1"/><rect x="15" y="6" width="3" height="16" rx="1"/></g><rect x="19.5" y="12" width="3" height="10" rx="1" style="fill:var(--sport)"/></svg>';

const POSTES = { football: ['GK', 'DF', 'MD', 'FW'], nba: ['G', 'F', 'C'] };
const LIBELLES = { confirme: 'Titulaire confirmé', remplacant: 'Remplaçant annoncé', probable: 'Probable', incertain: 'Sous le seuil', douteux: 'Douteux', exclu: 'Exclu' };
const TON_STATUT = { confirme: 'ok', remplacant: 'info', probable: '', incertain: 'attention', douteux: 'attention', exclu: 'stop' };
const SIT = { titulaire: 'titulaire', entre: 'entré en jeu', joue: 'a joué', banc: 'banc', absent: 'absent', inconnu: '?' };
const nbsp = ' ';
const tz = { timeZone: 'Europe/Paris' };
const fJour = new Intl.DateTimeFormat('fr-FR', { ...tz, weekday: 'short', day: 'numeric', month: 'short' });
const fJourLong = new Intl.DateTimeFormat('fr-FR', { ...tz, weekday: 'long', day: 'numeric', month: 'long' });
const fHeure = new Intl.DateTimeFormat('fr-FR', { ...tz, hour: '2-digit', minute: '2-digit' });
const fMois = new Intl.DateTimeFormat('fr-FR', { ...tz, month: 'short' });
const fJourMois = new Intl.DateTimeFormat('fr-FR', { ...tz, day: 'numeric', month: 'short' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nb = (x, d = 0) => (x == null || Number.isNaN(x) ? '–' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}${nbsp}%`);
const quand = (d) => `${fJour.format(new Date(d))} ${fHeure.format(new Date(d))}`;
const quandLong = (d) => `${fJourLong.format(new Date(d))} à ${fHeure.format(new Date(d))}`;
const $ = (id) => document.getElementById(id);
const pluriel = (n, mot, pl = `${mot}s`) => `${n} ${n > 1 ? pl : mot}`;
const nomCourt = (nom) => { const p = nom.split(' '); return p.length > 1 ? p.slice(1).join(' ') : nom; };
const REDUIT = matchMedia('(prefers-reduced-motion: reduce)');
const largePC = () => innerWidth >= 1024;
const tresLarge = () => innerWidth >= 1800;

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
const D = await chargerDonnees().catch((e) => { $('chargement').textContent = `Impossible de charger les données : ${e.message}`; throw e; });
const joueurs = new Map(D.joueurs.map((j) => [j.id, deplier(j)]));
const matchs = new Map(D.matchs.map((m) => [m.id, m]));
const stockage = creerStockage();
let etatUtilisateur = etatVide();

// Paliers du plateau d'un sport, du premier au dernier ; palier en cours : le plus bas qui n'est pas passé.
const paliersDe = (sport) => D.paliers.filter((p) => p.sport === sport).sort((a, b) => a.niveau - b.niveau);
const palierEnCours = (sport) => paliersDe(sport).find((p) => !['CLAIMED', 'CLAIMABLE'].includes(p.etat)) ?? null;

// Cartes jouées valables pour le palier en cours (libérées dès que le palier change).
function jouees(sport) {
  const e = etatUtilisateur[sport], p = palierEnCours(sport);
  return new Set(e && p && e.cible === p.cible ? e.jouees : []);
}

function seuil() { return etatUtilisateur.seuil ?? D.P.seuil_jouer; }
const SEUILS = [0.7, 0.8, 0.9];

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
const parId = new Map(lignes.map((l) => [l.c.id, l]));
const lignesMoteur = (sport) => lignes.filter((l) => l.c.sport === sport).map((l) => ({ carte: l.c, joueur: l.j, match: l.m, projection: l.pr }));

// Échelle commune du score par sport (graphiques) : le plafond de la simulation en football (100) ;
// en NBA (sans plafond), le 99e centile des scores joués du catalogue, arrondi à la dizaine.
const ECHELLE = (() => {
  const e = {};
  for (const s of ['football', 'nba']) {
    if (D.P.simulation.score_max?.[s] != null) { e[s] = D.P.simulation.score_max[s]; continue; }
    const v = [];
    for (const j of joueurs.values()) if (j.sport === s) for (const m of j.historique) if (m.score > 0 && ['titulaire', 'entre', 'joue'].includes(m.situation)) v.push(m.score);
    v.sort((a, b) => a - b);
    e[s] = Math.max(40, Math.ceil((v[Math.floor(0.99 * (v.length - 1))] ?? 60) / 10) * 10);
  }
  return e;
})();

// Fourchette 10–90 % du score s'il joue (bonus compris), tirée de la distribution du moteur (methode.md 5 ter).
const cacheFourchettes = new Map();
function fourchette(l) {
  if (!cacheFourchettes.has(l.c.id)) {
    const d = l.pr.siJoue == null ? null : distribution(l.j, l.pr, D.P);
    cacheFourchettes.set(l.c.id, d ? quantilesSiJoue(d, D.P.simulation, { tirages: 1000 }) : null);
  }
  return cacheFourchettes.get(l.c.id);
}

// ---------- Contexte du match et forme (methode.md 9 et 9 bis : la forme est affichée, hors calcul) ----------
const F = D.P.forme;
const cacheEquipes = new Map();
const matchsEquipe = (slug) => (D.equipes?.[slug] ?? []).map(([date, adversaire, dom, pour, contre]) => ({ date, adversaire, domicile: dom === 1, pour, contre }));
function formeEquipe(slug) {
  if (!slug) return null;
  if (!cacheEquipes.has(slug)) cacheEquipes.set(slug, statsEquipe(matchsEquipe(slug), F));
  return cacheEquipes.get(slug);
}
const cacheJoueurs = new Map();
const formeDe = (j) => { if (!cacheJoueurs.has(j.id)) cacheJoueurs.set(j.id, formeJoueur(j, F)); return cacheJoueurs.get(j.id); };
const slugAdversaire = (l) => (!l.m ? null : l.lieu === 'dom' ? l.m.exterieur?.slug : l.lieu === 'ext' ? l.m.domicile?.slug : null);
const MOTS_RES = { V: 'victoire', N: 'nul', D: 'défaite' };
const victoirePct = (l) => (l.c.sport === 'football' && l.cotes?.victoire != null ? Math.round(l.cotes.victoire * 100) : null);

function statut(l) {
  if (l.pr.statut !== 'ok') return l.pr.statut;
  if (l.pr.situationConfirmee === 'titulaire') return 'confirme';
  if (l.pr.situationConfirmee === 'remplacant') return 'remplacant';
  return l.pr.p != null && l.pr.p >= seuil() ? 'probable' : 'incertain';
}
// Disponible : jouable, éligible Arcade, non marquée jouée, et match pas encore commencé.
const disponible = (l) => ['probable', 'confirme', 'remplacant'].includes(statut(l)) && l.pr.p >= seuil() && l.pr.eligibleArcade && l.pr.siJoue != null &&
  !jouees(l.c.sport).has(l.c.id) && Date.parse(l.m?.debutUTC) > Date.now();

const vue = {
  sport: 'football', heros: null, poste: null, etoiles: null, journee: '', tri: 'e', sens: -1, dispo: true, toutVoir: false,
  mode: 'plusieurs', creneauOuvert: null, squadJour: null, epingle: { football: null, nba: null },
};

// ---------- Calculs (dans le navigateur, mis en cache, différés pour ne pas bloquer l'affichage) ----------
const cache = new Map();
const cleBase = (sport) => { const p = palierEnCours(sport); return [sport, p?.cible, seuil(), [...jouees(sport)].sort().join(','), Math.floor(Date.now() / 60000)].join('|'); };
const dernieresChances = {}; // dernière chance de passer connue par sport (barre latérale)
function propositions(sport) {
  const palier = palierEnCours(sport); if (!palier) return null;
  const cle = `prop|${cleBase(sport)}`;
  if (!cache.has(cle)) {
    const t0 = performance.now();
    const r = proposer(lignesMoteur(sport), D.P, { sport, cible: palier.cible, regle: D.regles[sport], seuil: seuil(), jouees: jouees(sport), maintenant: Date.now() });
    r.dureeMs = performance.now() - t0;
    cache.set(cle, r);
    dernieresChances[sport] = r.prudente ? { p: r.prudente.pPasser, cible: palier.cible } : null;
  }
  return cache.get(cle);
}
function parCreneau(sport) {
  const palier = palierEnCours(sport); if (!palier) return null;
  const cle = `creneaux|${cleBase(sport)}`;
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
  const cle = `autres|${cleBase(sport)}|${equipe.cartes.join(',')}`;
  if (!cache.has(cle)) cache.set(cle, autresChoix(lignesMoteur(sport), D.P, { sport, cible: palier.cible, regle: D.regles[sport], seuil: seuil(), jouees: jouees(sport), maintenant: Date.now() }, equipe));
  return cache.get(cle);
}
// Distribution du score de l'équipe : mêmes tirages que la simulation de la proposition (même graine,
// même ordre des cartes), résumés pour l'affichage (methode.md 5 ter). partAuDessus = pPasserBrut.
const cacheDistrib = new Map();
function distribEquipe(sport, e, cible) {
  const cle = [sport, e.cartes.join(','), e.capitaine, cible].join('|');
  if (!cacheDistrib.has(cle)) {
    const regle = D.regles[sport];
    const ds = e.cartes.map((id) => { const l = parId.get(id); return distribution(l.j, l.pr, D.P); });
    const res = ds.some((d) => !d) ? null : resumerTirages(tirerTotaux(ds, e.capitaine ? e.cartes.indexOf(e.capitaine) : -1, regle.capitaine?.multiplicateur ?? 1, D.P.simulation, regle.cumul_bonus?.mode), cible);
    cacheDistrib.set(cle, res);
  }
  return cacheDistrib.get(cle);
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
const fCourtUTC = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
function libelleJournee(sport, j) {
  const d = new Date(`${j}T12:00:00Z`), decal = D.journees[sport].decalage_etiquette_paris_jours;
  if (!decal) return fLongUTC.format(d);
  const lendemain = new Date(d.getTime() + decal * 86400000);
  return `Nuit du ${fJourUTC.format(d)} au ${fLongUTC.format(lendemain)} (journée Sorare du ${lendemain.getUTCDate()})`;
}
// Libellé court (puces) : la date affichée par Sorare à Paris.
const libelleJourneeCourt = (sport, j) => fCourtUTC.format(new Date(Date.parse(`${j}T12:00:00Z`) + (D.journees[sport].decalage_etiquette_paris_jours ?? 0) * 86400000));

// ---------- Palier ----------
const ETATS = { LINEUP_SET: 'composition posée, matchs à venir', PLAYABLE: 'à jouer', LIVE: 'tentative en cours', FAILED: 'échoué', LOCKED: 'verrouillé' };
// Tentatives déjà jouées au palier en cours : 5 cartes chacune, bloquées tant qu'on reste sur ce palier.
function etatPalier(p) {
  const utilisees = (p.echecs ?? 0) + (p.enCours ?? 0);
  return { utilisees, enCours: (p.enCours ?? 0) > 0, derniere: (p.enCours ?? 0) > 0 && p.tentativesRestantes === 0 };
}
const etatTexte = (p) => [ETATS[p.etat] ?? p.etat, p.echecs ? pluriel(p.echecs, 'échec') : ''].filter(Boolean).join(' · ');
const rangPalier = (p) => paliersDe(p.sport).indexOf(p) + 1;

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
    `<button type="button" class="btn principal" data-act="marquer" data-sport="${sport}">Marquer les cartes jouées</button></div>`;
}

// ---------- Graphiques (SVG fait main, couleurs en jetons) ----------
const G = {
  // Chances de jouer : barre avec repère du seuil (une longueur se lit mieux qu'un angle).
  barreP(p, s, w = 64, h = 8) {
    if (p == null) return `<svg class="gx barre-p" width="${w}" height="14" aria-hidden="true"><rect class="piste" y="3" width="${w}" height="${h}" rx="2"/></svg>`;
    const cls = p >= 0.985 ? 'confirme' : p < s ? 'bas' : '';
    const H = 14, y = (H - h) / 2, xs = (w * s).toFixed(1);
    return `<svg class="gx barre-p ${cls}" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="Chances de jouer ${pct(p)}, seuil ${pct(s)}"><rect class="piste" x="0" y="${y}" width="${w}" height="${h}" rx="2"/><rect class="rempli" x="0" y="${y}" width="${(w * p).toFixed(1)}" height="${h}" rx="2"/><line class="seuil" x1="${xs}" x2="${xs}" y1="0" y2="${H}"/></svg>`;
  },
  // Score s'il joue : point et fourchette 10–90 % sur l'échelle commune du sport.
  ival(l, w = 72, axe = false) {
    const max = ECHELLE[l.c.sport], f = fourchette(l), v = l.pr.siJoue;
    if (v == null) return '';
    const X = (x) => Math.max(2, Math.min(w - 2, (x / max) * w)).toFixed(1);
    const H = axe ? 34 : 14, cy = 7;
    let s = `<svg class="gx ival" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="Score s'il joue ${nb(v)}${f ? `, 80 % des cas entre ${nb(f.q10)} et ${nb(f.q90)}` : ''}">`;
    s += `<rect class="piste" x="0" y="${cy - 1}" width="${w}" height="2" rx="1"/>`;
    if (f) s += `<rect class="bande" x="${X(f.q10)}" y="${cy - 4}" width="${Math.max(2, X(f.q90) - X(f.q10))}" height="8" rx="2"/>`;
    s += `<circle class="pt" cx="${X(v)}" cy="${cy}" r="4"/>`;
    if (axe) s += [0, max / 2, max].map((x, i) => `<text x="${i === 0 ? 0 : i === 2 ? w : w / 2}" y="${H - 2}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}">${x}</text>`).join('');
    return `${s}</svg>`;
  },
  // Cote de victoire dans la ligne : victoire pleine, le reste hachuré.
  coteMini(v, w = 48) {
    if (v == null) return '';
    const xv = (w * v) / 100;
    return `<svg class="gx cote-mini" width="${w}" height="8" viewBox="0 0 ${w} 8" aria-hidden="true"><rect class="vic" x="0" y="0" width="${xv.toFixed(1)}" height="8" rx="1.5"/><rect class="reste" x="${(xv + 1.5).toFixed(1)}" y="0" width="${Math.max(0, w - xv - 1.5).toFixed(1)}" height="8" rx="1.5"/></svg>`;
  },
  // Cote du match en 3 segments (victoire, nul, défaite), étiquetée.
  cote3(c) {
    if (!c || c.victoire == null) return '<span class="s">cote pas encore publiée</span>';
    const v = c.victoire, n = c.nul ?? 0, d = c.defaite ?? 0, t = v + n + d || 1;
    return `<div><div class="cote3" role="img" aria-label="Victoire ${pct(v)}, nul ${pct(n)}, défaite ${pct(d)}"><i class="cv" style="width:${(v / t) * 100}%"></i><i class="cn" style="width:${(n / t) * 100}%"></i><i class="cd" style="width:${(d / t) * 100}%"></i></div>` +
      `<div class="cote3-leg"><span>V ${pct(v)}</span><span>N ${pct(n)}</span><span>D ${pct(d)}</span></div></div>`;
  },
  // Pastilles V/N/D (du plus ancien au plus récent, le dernier à droite).
  pastilles(ms, quoi = 'derniers résultats du club') {
    if (!ms?.length) return '';
    const liste = [...ms].reverse();
    const t = liste.map((m) => `${MOTS_RES[m.res]} ${m.pour}-${m.contre}${m.adversaire ? ` ${m.domicile ? 'contre' : 'chez'} ${m.adversaire}` : ''}`).join(' ; ');
    return `<span class="vnd" role="img" aria-label="${liste.length} ${quoi}, le plus récent à droite : ${esc(t)}" title="${esc(t)}">${liste.map((m) => `<span class="${m.res}">${m.res}</span>`).join('')}</span>`;
  },
  // Les 5 jouent : un segment par joueur, rempli à ses chances de jouer ; le maillon faible en orange.
  cinq(membres) {
    const ps = membres.map((l) => l.pr.p ?? 0), min = Math.min(...ps);
    return `<div class="cinq" role="img" aria-label="Chances de jouer des 5 joueurs : ${membres.map((l) => `${esc(l.j.nom)} ${pct(l.pr.p)}`).join(', ')}">${membres.map((l, i) => `<i class="${ps[i] === min && min < 0.985 ? 'faible' : ''}" title="${esc(l.j.nom)} ${pct(l.pr.p)}"><b style="width:${ps[i] * 100}%"></b></i>`).join('')}</div>`;
  },
  // Étoiles NBA : 16 cases (32 demi-cases), une couleur par joueur ; une case de trop en rouge.
  cases16(membres, plafond = 16) {
    const demi = [];
    membres.forEach((l, k) => { for (let i = 0; i < Math.round((l.j.etoiles ?? 0) * 2); i++) demi.push(k); });
    const n = Math.max(plafond, Math.ceil(demi.length / 2));
    let h = '';
    for (let c = 0; c < n; c++) {
      h += `<i class="${c >= plafond ? 'trop' : ''}">${[demi[c * 2], demi[c * 2 + 1]].map((k) => `<b style="background:${k == null ? 'transparent' : `color-mix(in srgb, var(--sport) ${100 - k * 15}%, var(--surface))`}"></b>`).join('')}</i>`;
    }
    const total = membres.reduce((a, l) => a + (l.j.etoiles ?? 0), 0);
    return `<div class="cases16" role="img" aria-label="${nb(total, 1)} étoiles sur ${plafond}">${h}</div>`;
  },
  // Qui porte l'équipe : espérance de chaque joueur (capitaine compris), avec la cible.
  empilee(membres, e, sport, cible = null) {
    const regle = D.regles[sport], mult = regle.capitaine?.multiplicateur ?? 1;
    const parts = membres.map((l) => ({ l, v: (l.pr.p ?? 0) * (l.pr.score.mu ?? 0) * multiplicateurCarte({ b: l.pr.bonus }, e.capitaine === l.c.id, mult, regle.cumul_bonus?.mode) }))
      .sort((a, b) => b.v - a.v);
    const tot = parts.reduce((a, x) => a + x.v, 0), M = Math.max(tot, cible ?? 0) * 1.04 || 1;
    return `<div class="empilee" role="img" aria-label="Score attendu par joueur (${nb(tot)} au total)${cible ? ` face à la cible ${cible}` : ''} : ${parts.map((x) => `${esc(x.l.j.nom)} ${nb(x.v)}`).join(', ')}">${parts.map((x, i) =>
      `<span style="width:${(x.v / M) * 100}%;background:color-mix(in srgb, var(--sport) ${[100, 82, 64, 46, 32][i] ?? 30}%, var(--surface))" title="${esc(x.l.j.nom)} : ${nb(x.v, 1)}">${esc(nomCourt(x.l.j.nom))} ${nb(x.v)}</span>`).join('')}` +
      `${cible ? `<i class="marque-cible" style="left:${(cible / M) * 100}%"><b>cible ${cible}</b></i>` : ''}</div>`;
  },
  // Distribution du score de l'équipe face à la cible (résumé du moteur : resumerTirages).
  dist(w, r, cible, sport, h = 170) {
    const pl = 2, pr = 2, pt = 28, pb = 30, iw = w - pl - pr, ih = h - pt - pb;
    const n = r.classes.length, mx = Math.max(...r.classes, 1), bw = iw / n;
    const X = (v) => pl + ((Math.min(Math.max(v, r.min), r.max) - r.min) / (r.max - r.min)) * iw, xc = X(cible);
    let s = `<svg class="dist" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Distribution simulée du score de l'équipe : ${pct(r.partAuDessus)} des tirages atteignent la cible ${cible} ; 80 % entre ${nb(r.q10)} et ${nb(r.q90)}">`;
    s += `<rect class="zone" x="${xc.toFixed(1)}" y="${pt - 6}" width="${Math.max(0, pl + iw - xc).toFixed(1)}" height="${ih + 6}"/>`;
    r.classes.forEach((k, i) => {
      const hh = k ? Math.max(1, (k / mx) * ih) : 0, passe = r.min + (i + 0.5) * r.largeur >= cible;
      if (hh) s += `<rect class="b${passe ? ' passe' : ''}" style="--i:${i}" x="${(pl + i * bw + 0.75).toFixed(1)}" y="${(pt + ih - hh).toFixed(1)}" width="${Math.max(1, bw - 1.5).toFixed(1)}" height="${hh.toFixed(1)}" rx="1"/>`;
    });
    s += `<line class="axe" x1="${pl}" x2="${pl + iw}" y1="${pt + ih + 0.5}" y2="${pt + ih + 0.5}"/>`;
    // fourchette 10–90 % et moyenne sous l'axe
    s += `<line class="ival-eq" x1="${X(r.q10).toFixed(1)}" x2="${X(r.q90).toFixed(1)}" y1="${pt + ih + 7}" y2="${pt + ih + 7}"><title>80 % des tirages entre ${nb(r.q10)} et ${nb(r.q90)}</title></line>`;
    const xm = X(r.moyenne);
    s += `<path d="M${(xm - 5).toFixed(1)} ${pt + ih + 13} L${xm.toFixed(1)} ${pt + ih + 4} L${(xm + 5).toFixed(1)} ${pt + ih + 13}Z" style="fill:var(--encre)"><title>Moyenne simulée ${nb(r.moyenne)}</title></path>`;
    const tick = sport === 'football' ? (r.max - r.min > 300 ? 100 : 50) : (r.max - r.min > 200 ? 50 : 25);
    for (let v = Math.ceil(r.min / tick) * tick; v <= r.max; v += tick) s += `<text x="${X(v).toFixed(1)}" y="${h - 2}" text-anchor="middle">${v}</text>`;
    s += `<line class="cible" x1="${xc.toFixed(1)}" x2="${xc.toFixed(1)}" y1="${pt - 12}" y2="${pt + ih}"/>`;
    const gauche = xc > w * 0.55;
    s += `<text class="fort" x="${(gauche ? xc - 6 : xc + 6).toFixed(1)}" y="${pt - 14}" text-anchor="${gauche ? 'end' : 'start'}">cible ${cible}</text>`;
    s += `<text class="sport" x="${gauche ? pl : pl + iw}" y="${pt - 14}" text-anchor="${gauche ? 'start' : 'end'}">${pct(r.partAuDessus)} ≥ cible</text>`;
    return `${s}</svg>`;
  },
  // Historique : échelle fixe par sport, cases vides pour banc et absence, bande 10–90 %,
  // projection, moyennes des 3 et 15 derniers matchs joués ; espacement selon les dates.
  histo(w, l) {
    const max = ECHELLE[l.c.sport], h = 200, pl = 26, pr = 6, pt = 18, pb = 34, iw = w - pl - pr, ih = h - pt - pb;
    const H = l.j.historique.slice(0, 15).reverse(), n = H.length;
    if (!n) return '<p class="petit doux">Pas d’historique.</p>';
    const Y = (v) => pt + ih - (Math.min(Math.max(v, 0), max) / max) * ih;
    const joue = (m) => ['titulaire', 'entre', 'joue'].includes(m.situation) && m.statut !== 'DID_NOT_PLAY';
    const jours = H.map((m) => Date.parse(m.date) / 864e5);
    const u = [0], coupures = [];
    for (let i = 1; i < n; i++) { const g = jours[i] - jours[i - 1] > 21 ? 2 : 1; if (g > 1) coupures.push(i); u.push(u[i - 1] + g); }
    const bw = Math.min(24, (iw / (u[n - 1] + 1)) * 0.72), k = (iw - bw) / Math.max(1, u[n - 1]), X = (i) => pl + bw / 2 + u[i] * k;
    const idxJoues = H.map((m, i) => (joue(m) ? i : -1)).filter((i) => i >= 0), der3 = new Set(idxJoues.slice(-3));
    const f = fourchette(l), b = l.pr.bonus || 1, proj = l.pr.score.mu, fj = formeDe(l.j);
    let s = `<svg class="histo" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Scores des ${n} derniers matchs de ${esc(l.j.nom)}, du plus ancien au plus récent">`;
    for (let v = 0; v <= max; v += max / 4) s += `<line class="grille" x1="${pl}" x2="${pl + iw}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v}</text>`;
    if (f) s += `<rect class="bande" x="${pl}" y="${Y(f.q90 / b).toFixed(1)}" width="${iw}" height="${Math.max(1, Y(f.q10 / b) - Y(f.q90 / b)).toFixed(1)}"><title>80 % des scores attendus s'il joue entre ${nb(f.q10 / b)} et ${nb(f.q90 / b)} (hors bonus)</title></rect>`;
    coupures.forEach((i) => { const x = (X(i) + X(i - 1)) / 2; s += `<path class="coupure" fill="none" d="M${(x - 4).toFixed(1)} ${pt + ih + 4} l4 -8 M${x.toFixed(1)} ${pt + ih + 4} l4 -8"/>`; });
    let moisPrec = '';
    H.forEach((m, i) => {
      const x = X(i);
      const titre = `${fJourMois.format(new Date(m.date))} · ${SIT[m.situation] ?? m.situation}${joue(m) ? ` · ${nb(m.score)} pts` : ''}${m.minutes ? ` · ${m.minutes} min` : ''}`;
      if (joue(m)) {
        const y = Y(m.score), cls = (m.situation === 'entre' ? 'ent' : 'tit') + (der3.has(i) ? '' : ' vieux');
        s += `<rect class="${cls}" x="${(x - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, pt + ih - y).toFixed(1)}" rx="2"><title>${esc(titre)}</title></rect>`;
        if (bw >= 13) s += `<text class="val" x="${x.toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">${Math.round(m.score)}</text>`;
      } else {
        const banc = m.situation === 'banc';
        s += `<rect class="${banc ? 'banc' : 'absent'}" x="${(x - bw / 2 + 0.6).toFixed(1)}" y="${pt + 0.6}" width="${Math.max(1, bw - 1.2).toFixed(1)}" height="${(ih - 1.2).toFixed(1)}" rx="2"><title>${esc(titre)}</title></rect>` +
          `<text class="${banc ? 'bnc' : 'abs'}" x="${x.toFixed(1)}" y="${pt + ih - 6}" text-anchor="middle">${banc ? 'B' : 'A'}</text>`;
      }
      const mo = fMois.format(new Date(m.date));
      if (mo !== moisPrec) { s += `<text x="${x.toFixed(1)}" y="${h - 4}" text-anchor="middle">${mo}</text>`; moisPrec = mo; }
    });
    if (proj != null) s += `<line class="proj" x1="${pl}" x2="${pl + iw}" y1="${Y(proj).toFixed(1)}" y2="${Y(proj).toFixed(1)}"><title>Projection s'il joue, hors bonus : ${nb(proj)}</title></line>`;
    if (fj?.moyReference != null) s += `<line class="m15" x1="${pl}" x2="${pl + iw}" y1="${Y(fj.moyReference).toFixed(1)}" y2="${Y(fj.moyReference).toFixed(1)}" opacity=".55"><title>Moyenne des 15 derniers matchs joués : ${nb(fj.moyReference)}</title></line>`;
    if (fj?.moyRecente != null && idxJoues.length >= 3) {
      const a = idxJoues[idxJoues.length - 3], z = idxJoues[idxJoues.length - 1];
      s += `<line class="m3" x1="${(X(a) - bw / 2 - 3).toFixed(1)}" x2="${(X(z) + bw / 2 + 3).toFixed(1)}" y1="${Y(fj.moyRecente).toFixed(1)}" y2="${Y(fj.moyRecente).toFixed(1)}"><title>Moyenne des 3 derniers matchs joués : ${nb(fj.moyRecente)}</title></line>`;
    }
    return `${s}</svg>`;
  },
};

// Graphiques mesurés : dessinés à la largeur réelle de leur conteneur (et redessinés au redimensionnement).
const graphesEnAttente = new Map(), graphesDessines = new WeakMap();
let numeroGraphe = 0;
const graphe = (fn) => { const id = `g${++numeroGraphe}`; graphesEnAttente.set(id, fn); return `<div class="g" data-gid="${id}"></div>`; };
function dessiner(racine = document) {
  racine.querySelectorAll('[data-gid]').forEach((el) => {
    let fn = graphesDessines.get(el);
    if (!fn) { fn = graphesEnAttente.get(el.dataset.gid); if (!fn) return; graphesEnAttente.delete(el.dataset.gid); graphesDessines.set(el, fn); }
    const w = Math.floor(el.clientWidth);
    if (w > 0) el.innerHTML = fn(Math.max(200, w));
  });
}

// ---------- Composants ----------
// Étoiles du joueur (NBA : plafond de 16 par équipe), bien visibles.
const badgeEtoiles = (l, grand = false) => (l.c.sport === 'nba' && l.j.etoiles != null
  ? `<span class="badge-etoiles${grand ? ' grand' : ''}" title="${nb(l.j.etoiles, 1)} étoile(s)">★${nbsp}${nb(l.j.etoiles, 1)}</span>` : '');
const plafondEtoiles = (sport) => D.regles[sport]?.plafond_etoiles?.max ?? null;

// Hors de claude.ai (page autonome), les images externes sont permises : lien direct vers l'image Sorare.
const horsClaude = !window.claude?.use;
function vignette(l) {
  const img = D.vignettes[l.c.id] ?? (horsClaude ? l.c.visuelUrl : null);
  // Sans vignette intégrée : initiales, remplacées par l'image dès que la carte est à l'écran (lots à la volée).
  return img ? `<img class="vig" src="${img}" alt="" loading="lazy">`
    : `<div class="vig" data-vig="${esc(l.c.id)}" aria-hidden="true">${esc(l.j.nom.split(' ').map((x) => x[0]).slice(0, 2).join(''))}</div>`;
}

// ---------- Vignettes chargées à la volée ----------
// Les vignettes non intégrées sont publiées à côté de la page en lots (vignettes/lot-NN.json, construits par
// npm run app) ; un lot n'est lu qu'une fois, quand une de ses cartes approche de l'écran.
const indexCarte = new Map(D.cartes.map((c, i) => [c.id, i]));
const lotsLus = new Map();
function lireLot(n) {
  if (!lotsLus.has(n)) {
    const nom = `vignettes/lot-${String(n).padStart(2, '0')}.json?v=${encodeURIComponent(D.lotsVignettes?.version ?? '')}`;
    lotsLus.set(n, fetch(nom).then((r) => (r.ok ? r.json() : [])).catch(() => []));
  }
  return lotsLus.get(n);
}
async function remplirVignette(el) {
  const id = el.dataset.vig, i = indexCarte.get(id), T = D.lotsVignettes?.taille;
  if (i == null || !T) return;
  const src = D.vignettes[id] ?? (await lireLot(Math.floor(i / T)))[i % T];
  if (!src || !el.isConnected) return;
  D.vignettes[id] = src; // les rendus suivants l'intègrent directement
  const img = document.createElement('img');
  img.className = el.className; img.src = src; img.alt = '';
  el.replaceWith(img);
}
const observateurVignettes = 'IntersectionObserver' in window
  ? new IntersectionObserver((entrees) => { for (const e of entrees) if (e.isIntersecting) { observateurVignettes.unobserve(e.target); remplirVignette(e.target); } }, { rootMargin: '400px' })
  : null;
const suivreVignettes = (racine) => racine.querySelectorAll?.('.vig[data-vig]').forEach((el) => (observateurVignettes ? observateurVignettes.observe(el) : remplirVignette(el)));
// Toute vignette ajoutée à la page (listes, propositions, fiche…) est suivie, sans toucher aux rendus.
if (D.lotsVignettes) {
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('.vig[data-vig]')) suivreVignettes(n.parentElement); else suivreVignettes(n); } })
    .observe(document.body, { childList: true, subtree: true });
}

// Étiquettes d'une ligne : seulement ce qui sort de l'ordinaire (statut, bonus, contexte, jouée…).
function tagsLigne(l, o = {}) {
  const st = statut(l), out = [];
  if (st !== 'probable') out.push(`<span class="tag ${TON_STATUT[st]}">${LIBELLES[st]}</span>`);
  if (l.c.bonusPct) out.push(`<span class="tag">${esc(l.c.collection)} +${nb(l.c.bonusPct)}${nbsp}%</span>`);
  if (o.horsSolo && !l.pr.eligibleArcade && l.m) out.push('<span class="tag stop" title="Compétition non autorisée en solo">hors solo</span>');
  if (o.jouee) out.push(`<span class="tag">${o.jouee}</span>`);
  out.push(tagsContexte(l));
  if (o.tags) out.push(o.tags);
  return out.join('');
}
// Contexte du match (methode.md 9) : deuxième soir de suite, blessure signalée par ESPN.
function tagsContexte(l) {
  const k = l.pr.contexte ?? {}, out = [];
  if (k.dosADos) out.push('<span class="tag attention" title="Deuxième soir consécutif de son équipe">2e soir de suite</span>');
  if (k.espn) out.push(`<span class="tag ${TON_STATUT[statut(l)] || ''}" title="${esc(k.espn.commentaire ?? '')}">ESPN${nbsp}: ${esc(k.espn.statut)}</span>`);
  return out.join('');
}

// Tendance du joueur (moyenne des 3 derniers matchs joués contre les 15 derniers).
const tendance = (fj) => (fj?.tendance === 'hausse' ? '<span class="tendance hausse" title="Moyenne de ses 3 derniers matchs nettement au-dessus de ses 15 derniers">▲ en forme</span>'
  : fj?.tendance === 'baisse' ? '<span class="tendance baisse" title="Moyenne de ses 3 derniers matchs nettement en dessous de ses 15 derniers">▼ en baisse</span>' : '');

// Ligne joueur, LA MÊME PARTOUT (propositions, autres choix, Squad, Mes cartes sur téléphone) :
// étroite, sur 3 lignes ; large (≥ 640 px de conteneur), une ligne de tableau à colonnes fixes.
function ligne(l, o = {}) {
  const J = jouees(l.c.sport), v = victoirePct(l), cap = o.capitaine === l.c.id;
  const lieu = l.lieu === 'ext' ? '@' : l.lieu === 'dom' ? 'vs' : '';
  const match = l.m ? `<span class="l1">${esc(quand(l.m.debutUTC))} </span><span class="l2">${lieu} ${esc(l.adv ?? '?')}<span class="cote-txt">${v != null ? ` · ${v}${nbsp}% vict.` : ''}</span></span>${v != null ? `<span class="cotebarre" title="Probabilité de victoire de son équipe">${G.coteMini(v)}${v}${nbsp}% vict.</span>` : ''}` : '<span class="l1">pas de match connu</span>';
  const ppe = l.c.sport === 'nba' && l.j.etoiles && l.pr.siJoue != null ? `<span class="ppe">${nb(l.pr.siJoue / l.j.etoiles, 1)} pts/★</span>` : '';
  const tags = tagsLigne(l, { ...o, jouee: o.jouee ?? (J.has(l.c.id) ? 'jouée à ce palier' : '') });
  const choisie = (fiche.ouverte === l.c.id || (o.epinglable && vue.epingle[l.c.sport] === l.c.id && tresLarge())) ? ' choisie' : '';
  return `<div class="ligne${choisie}${o.griser && J.has(l.c.id) ? ' bloquee' : ''}" role="button" tabindex="0" data-fiche="${esc(l.c.id)}" aria-label="Voir la fiche de ${esc(l.j.nom)}">
    <div class="c-img">${vignette(l)}</div>
    <div class="c-nom"><b>${esc(l.j.nom)}</b>${cap ? '<span class="cap" title="Capitaine">C</span>' : ''}<span class="pos">${esc(l.j.postes.join('/'))}</span>${badgeEtoiles(l)}<span class="club">${esc(l.j.club?.nom ?? '?')}</span></div>
    <div class="c-match">${match}</div>
    <div class="c-forme">${G.pastilles(formeEquipe(l.j.club?.slug)?.derniers)}${tendance(formeDe(l.j))}</div>
    <div class="c-p"><span class="pv">${pct(l.pr.p)}</span>${G.barreP(l.pr.p, seuil(), 60)}</div>
    <div class="c-s"><span><span class="sv">${nb(l.pr.siJoue)}</span> pts</span>${G.ival(l, 72)}${ppe}</div>
    ${tags ? `<div class="c-tags">${tags}</div>` : ''}
    ${o.extra ? `<div class="c-extra">${o.extra}</div>` : ''}
  </div>`;
}
const enteteTab = () => '<div class="entete-tab libelle" aria-hidden="true"><span></span><span>Joueur</span><span>Match · victoire</span><span>Club · 5 derniers</span><span>Chances de jouer</span><span>S\'il joue · 10–90 %</span></div>';

// Chemin des paliers du plateau, le palier en cours mis en avant.
function chemin(sport) {
  const ps = paliersDe(sport), p = palierEnCours(sport), k = p ? ps.indexOf(p) : ps.length;
  return `<div class="chemin" role="img" aria-label="${p ? `Palier ${k + 1} sur ${ps.length}, cible ${p.cible}` : 'Tous les paliers sont passés'}">${ps.map((x, i) => {
    const etat = i < k ? 'passe' : i === k ? 'encours' : '';
    return `<div class="jalon ${etat}"><i>${i < k ? '✓' : i + 1}</i><span>${x.cible}</span></div>`;
  }).join('')}</div>`;
}

// Plafond des chances de jouer avant les compositions (plus haute valeur de la table de calibrage).
const plafondJouer = (sport) => { const t = D.P[sport]?.calibration_jouer; return t?.length ? Math.max(...t.map((x) => x[1])) : D.P[sport]?.plafond; };

// Chiffres clés et graphiques d'une équipe proposée.
function kpisEquipe(e, sport, membres, o = {}) {
  const premier = membres.slice().sort((a, b) => a.m.debutUTC.localeCompare(b.m.debutUTC))[0];
  const ecart = o.cible != null ? Math.round(e.scoreMoyen - o.cible) : null;
  const faible = membres.slice().sort((a, b) => (a.pr.p ?? 0) - (b.pr.p ?? 0))[0];
  // Plafond des chances de jouer avant les compositions : rappelé seulement si aucune n'est publiée pour l'équipe.
  const plaf = membres.some((l) => l.pr.situationConfirmee) ? null : plafondJouer(sport);
  const nbaKpi = sport === 'nba' ? `<div class="kpi"><span class="libelle">Étoiles</span><span class="v etoiles">★${nbsp}${nb(e.etoiles, 1)}<small> / ${plafondEtoiles(sport)}</small></span>${G.cases16(membres, plafondEtoiles(sport) ?? 16)}</div>` : '';
  const heros = o.squad
    ? `<div class="kpi heros"><span class="libelle">Score attendu</span><span class="v">${nb(e.esperance)}</span><span class="s">capitaine et bonus compris</span></div>`
    : `<div class="kpi heros"><span class="libelle">Chances de passer</span><span class="v">${pct(e.pPasser)}</span><span class="s">corrigées sur l'historique</span></div>`;
  return `<div class="cq"><div class="kpis${sport === 'nba' && !o.squad ? ' cinq-kpis' : ''}">
    ${heros}
    <div class="kpi"><span class="libelle">Les 5 jouent</span><span class="v">${pct(e.pComplete)}</span>${G.cinq(membres)}<span class="s">maillon faible : ${esc(nomCourt(faible.j.nom))} ${pct(faible.pr.p)}${plaf ? ` · plafond ${pct(plaf ** 5)} avant les compos` : ''}</span></div>
    ${o.squad ? '' : `<div class="kpi"><span class="libelle">Score attendu</span><span class="v">${nb(e.scoreMoyen)}</span><span class="s">cible ${o.cible} · <b class="${ecart >= 0 ? 'ok-txt' : 'stop-txt'}">${ecart >= 0 ? '+' : '−'}${Math.abs(ecart)}</b></span></div>`}
    ${nbaKpi}
    <div class="kpi"><span class="libelle">Verrouillage</span><span class="v long">${esc(quand(e.verrouillage))}</span><span class="s">premier coup d'envoi : ${esc(nomCourt(premier.j.nom))}</span></div>
  </div></div>`;
}

// Lecture honnête de la distribution : part brute des tirages et chances corrigées (methode.md 5 bis).
function legendeDist(r, e, cible) {
  return `<div class="legende-dist">
    <p class="lecture"><b>${pct(r.partAuDessus)}</b> des tirages au-dessus de la cible ; chances corrigées sur l'historique : <b>${pct(e.pPasser)}</b>.</p>
    <p class="legende"><span><i class="sw" style="background:var(--sport)"></i>tirages ≥ ${cible}</span><span><i class="sw" style="background:var(--d-neutre)"></i>sous la cible</span><span>▲ moyenne ${nb(r.moyenne)}</span><span>— 80 % entre ${nb(r.q10)} et ${nb(r.q90)}</span></p>
  </div>`;
}

const TITRES = {
  prudente: ['Proposition prudente', 'Presque aussi bonne que la meilleure, avec le plus de chances que les 5 jouent.'],
  equilibree: ['Équilibrée', 'La plus grande chance de franchir le palier.'],
  ambitieuse: ['Ambitieuse', 'Encore plus de chances de passer, en acceptant des joueurs moins sûrs de jouer.'],
};
const membresDe = (e) => e.cartes.map((id) => parId.get(id)).sort((a, b) => (a.m?.debutUTC ?? '').localeCompare(b.m?.debutUTC ?? ''));

// Carte d'une proposition (Solo, créneau unique, variantes).
function carteProposition(titre, pourquoi, e, sport, cible, o = {}) {
  const membres = membresDe(e);
  const dernier = membres.map((l) => l.m.debutUTC).sort().at(-1);
  const r = distribEquipe(sport, e, cible);
  return `<section class="carte proposition" aria-label="${esc(titre)}">
    <header><h2>${esc(titre)}</h2><span class="doux petit">${esc(pourquoi)}</span></header>
    <div class="corps pile">
      ${kpisEquipe(e, sport, membres, { cible })}
      ${r ? `<div>${graphe((w) => G.dist(w, r, cible, sport, o.hauteur ?? 170))}${legendeDist(r, e, cible)}</div>` : ''}
      <div style="padding-top:var(--e5)"><span class="libelle long">Qui porte l'équipe · score attendu par joueur${e.capitaine ? ', capitaine compris' : ''}</span><div style="margin-top:22px">${G.empilee(membres, e, sport, cible)}</div></div>
    </div>
    <div class="tableau">${enteteTab()}${membres.map((l) => ligne(l, { capitaine: e.capitaine, epinglable: o.epinglable })).join('')}</div>
    <div class="corps" style="padding-top:var(--e4)"><div class="actions"><button type="button" class="btn principal" data-act="jouer" data-sport="${sport}" data-v="${esc(e.cartes.join(','))}">J'ai joué cette équipe</button><span class="mini doux">marque les 5 cartes (annulable) · résultat connu après le dernier match, ${esc(quand(dernier))}</span></div></div>
    ${o.apres ?? ''}
  </section>`;
}

// ---------- Barre latérale (PC), barre haute et onglets bas (téléphone) ----------
function ageDonnees() {
  const t = new Date(D.meta.recupereA), min = Math.max(0, Math.round((Date.now() - t) / 60000));
  const court = min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min < 600 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`;
  return { t, min, court, long: `il y a ${court}`, vieux: min >= 180 };
}

function rendreNav(ecran) {
  const s = vue.sport, accueil = ecran === 'accueil';
  const modes = [['accueil', 'maison', 'Accueil'], ['solo', 'solo', 'Solo'], ['squad', 'squad', 'Squad'], ['cartes', 'cartes', 'Mes cartes']];
  const lien = (m) => (m === 'accueil' ? '#accueil' : `#${s}/${m}`);
  const sports = ['football', 'nba'].map((x) => {
    const p = palierEnCours(x), ch = dernieresChances[x];
    const sous = p ? `Palier ${p.cible}${ch && ch.cible === p.cible ? ` · ${pct(ch.p)}` : ''}` : 'plateau terminé';
    return `<a class="lat-lien lat-sport" data-sport="${x}" href="#${x}/${accueil ? 'solo' : ecran}" ${!accueil && x === s ? 'aria-current="true"' : ''}>${ballon(x)}<span class="txt">${SPORTS[x]}<small>${sous}</small></span></a>`;
  }).join('');
  const nbCartes = lignes.filter((l) => l.c.sport === s).length;
  const p = palierEnCours(s);
  let etat = '';
  if (p) {
    const ep = etatPalier(p), n = jouees(s).size, attendues = 5 * ep.utilisees;
    etat = `<div class="etat-palier" data-sport="${s}">
      <div class="tete-etat"><span class="pts-sport"></span><b>Palier ${p.cible}</b><span class="doux" style="margin-left:auto">${rangPalier(p)} / ${paliersDe(s).length}</span></div>
      <span class="doux">${esc(etatTexte(p))}</span>
      ${ep.derniere ? '<span class="attention-txt">Dernière tentative en cours</span>' : ''}
      ${n < attendues ? `<span class="attention-txt">${n} carte${n > 1 ? 's' : ''} marquée${n > 1 ? 's' : ''} sur ${attendues} déjà jouées</span>` : attendues ? `<span class="ok-txt">${attendues} cartes jouées, toutes marquées</span>` : `<span class="doux">${n ? pluriel(n, 'carte marquée', 'cartes marquées') : 'Aucune carte jouée à ce palier'}</span>`}
      <button type="button" class="btn" data-act="marquer" data-sport="${s}">Marquer les cartes jouées</button></div>`;
  }
  $('laterale').innerHTML = `
    <a class="marque" href="#accueil">${LOGO}<b>Sorare aide</b></a>
    <div class="lat-section"><span class="libelle">Sport</span>${sports}</div>
    <div class="lat-section"><span class="libelle">${SPORTS[s]}</span>${modes.map(([m, i, t]) =>
      `<a class="lat-lien" href="${lien(m)}" ${ecran === m ? 'aria-current="page"' : ''}>${ico(i)}<span>${t}</span>${m === 'cartes' ? `<span class="compte">${nbCartes}</span>` : ''}</a>`).join('')}</div>
    ${etat}
    <div class="lat-pied"><div class="zone-maj" id="zone-maj"></div>
      <div class="ligne-outils"><button type="button" class="btn rond discret btn-maj-rond" data-act="maj" aria-label="Mettre à jour les données">${ico('maj')}</button>${boutonsOutils()}</div></div>`;
  $('laterale').dataset.sport = s;
  $('haut').innerHTML = `
    <div class="seg" role="group" aria-label="Sport">${['football', 'nba'].map((x) => `<a href="#${x}/${accueil ? 'solo' : ecran}" data-sport="${x}" ${!accueil && x === s ? 'aria-current="true"' : ''} aria-label="${SPORTS[x]}">${ballon(x)}<span>${SPORTS_COURTS[x]}</span></a>`).join('')}</div>
    <span class="espace"></span>
    <button type="button" class="btn discret btn-maj" data-act="maj" aria-label="Mettre à jour les données">${ico('maj')}<span class="age"></span></button>
    ${boutonsOutils()}`;
  $('bas').innerHTML = modes.map(([m, i, t]) => `<a href="${lien(m)}" ${ecran === m ? 'aria-current="page"' : ''}>${ico(i)}<span>${m === 'cartes' ? 'Cartes' : t}</span></a>`).join('');
  $('bas').dataset.sport = s;
  afficherMaj();
}
function boutonsOutils() {
  const sombre = themeActuel() === 'dark';
  return `<button type="button" class="btn rond discret" data-act="theme" aria-pressed="${sombre}" aria-label="${sombre ? 'Passer en mode clair' : 'Passer en mode sombre'}" title="${sombre ? 'Passer en mode clair' : 'Passer en mode sombre'}">${ico(sombre ? 'soleil' : 'lune')}</button>` +
    (WEB ? '<button type="button" class="btn rond discret" data-act="parametres" aria-label="Paramètres" title="Paramètres : clé API, manager, sauvegarde">' + ico('reglages') + '</button>' : '') +
    '<button type="button" class="btn rond discret" data-act="aide" aria-label="Aide" title="Aide">' + ico('aide') + '</button>';
}

function afficherAge() {
  const a = ageDonnees();
  $('bandeau').hidden = !a.vieux;
  $('bandeau').textContent = `Données Sorare de plus de 3 h (${fHeure.format(a.t)}) : appuie sur ↻ ou écris « actualise » à Claude avant de composer.`;
  afficherMaj();
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

// Réglage du seuil de chances de jouer : un seul réglage, le même dans Solo et dans Mes cartes.
const segSeuil = () => `<div class="reglage"><span>Chances de jouer d'au moins</span><div class="seg" role="group" aria-label="Seuil de chances de jouer">${SEUILS.map((v) =>
  `<button type="button" data-act="seuil" data-v="${v}" aria-pressed="${Math.abs(seuil() - v) < 1e-9}">${Math.round(v * 100)}${nbsp}%</button>`).join('')}</div></div>`;

// ---------- Accueil ----------
// Bandeau projecteur (scène three.js) : le palier en cours du sport choisi, le grand %, l'équipe.
function contenuHeros(s, r) {
  const p = palierEnCours(s), autre = AUTRE[s], ps = paliersDe(s);
  const surtitre = `<p class="libelle pj-surtitre">${ballon(s)}<span>${SPORTS[s]} · Solo · ${p ? `palier ${rangPalier(p)} sur ${ps.length}` : 'plateau terminé'}</span></p>`;
  const pa = dernieresChances[autre];
  const bascule = `<button class="btn" type="button" data-act="heros-sport" data-v="${autre}" aria-label="Afficher ${SPORTS[autre]} dans le bandeau${pa ? ` : ${pct(pa.p)} de chances` : ''}">${ballon(autre)}${SPORTS[autre]}${pa ? ` : ${pct(pa.p)}` : ''}</button>`;
  if (!p) return `${surtitre}<p class="pj-phrase" style="margin-top:12px">Tous les paliers de ce plateau sont passés.</p><div class="pj-actions"><a class="btn principal" href="#${s}/squad">Squad du jour</a>${bascule}</div><div class="pj-chemin">${chemin(s)}</div>`;
  const e = r?.prudente;
  if (!e) {
    return `${surtitre}<div class="pj-ligne"><p class="pj-chiffre">${r ? '–' : '…'}</p><p class="pj-phrase">${r ? esc(r.message ?? 'Pas de proposition possible.') : 'Calcul de la meilleure équipe…'}<br>palier <b>${p.cible}</b></p></div>
      <div class="pj-actions"><a class="btn principal" href="#${s}/solo">Ouvrir le Solo${ico('suite')}</a>${bascule}</div><div class="pj-chemin">${chemin(s)}</div>`;
  }
  const v = Math.round(e.pPasser * 100), ep = etatPalier(p), fragile = e.pPasser < 1 / 3;
  const sep = '<span aria-hidden="true"> · </span>';
  const noms = membresDe(e).map((l) => `<span class="pj-nom">${esc(nomCourt(l.j.nom))}${e.capitaine === l.c.id ? '<span class="cap" title="Capitaine">C</span>' : ''}</span>`).join(sep);
  const tags = [fragile ? '<span class="tag attention">moins d’une chance sur trois</span>' : '', ep.derniere ? '<span class="tag attention">dernière tentative en cours</span>' : ''].join('');
  return `${surtitre}
    <div class="pj-ligne"><p class="pj-chiffre"><span class="compteur" data-v="${v}">${v}</span><small>${nbsp}%</small></p>
    <p class="pj-phrase">de chances de passer le palier <b>${p.cible}</b><br>avec la proposition prudente</p></div>
    ${tags ? `<p class="pj-alerte">${tags}</p>` : ''}
    <p class="pj-equipe">${noms}${sep}<span class="verrou">verrouillage ${esc(quand(e.verrouillage))}</span></p>
    <div class="pj-actions"><a class="btn principal" href="#${s}/solo">Voir l’équipe${ico('suite')}</a>${bascule}</div>
    <div class="pj-chemin">${chemin(s)}</div>`;
}

function panneauSport(s, r) {
  const p = palierEnCours(s), ps = paliersDe(s), n = jouees(s).size;
  const liens = `<div class="actions"><a class="btn principal" href="#${s}/solo">${ico('solo')}Solo</a><a class="btn" href="#${s}/squad">${ico('squad')}Squad</a><a class="btn" href="#${s}/cartes">${ico('cartes')}Mes cartes</a></div>`;
  const tete = (droite) => `<div class="tete">${ballon(s, true)}<h2>${SPORTS[s]}</h2><span class="doux petit">${p ? `Solo · palier ${rangPalier(p)} sur ${ps.length}` : 'Solo'}</span>${droite}</div>`;
  if (!p) return `<section class="carte panneau-sport" data-sport="${s}" aria-label="${SPORTS[s]}">${tete('')}${chemin(s)}<p>Tous les paliers de ce plateau sont passés.</p>${liens}</section>`;
  const ep = etatPalier(p);
  const etat = `<span class="droite tag ${ep.derniere ? 'attention' : ''}">${esc(etatTexte(p))}${n ? ` · ${pluriel(n, 'carte marquée', 'cartes marquées')}` : ''}</span>`;
  const e = r?.prudente;
  let corps;
  if (!r) corps = '<p class="attente" style="padding:0">Calcul de la meilleure équipe…</p>';
  else if (!e) corps = `<p class="petit doux">${esc(r.message ?? 'Pas de proposition possible.')}</p>`;
  else {
    const fragile = e.pPasser < 1 / 3 || ep.derniere, d = distribEquipe(s, e, p.cible), membres = membresDe(e);
    corps = `<div class="hero${fragile ? ' fragile' : ''}"><span class="valeur"><span class="compteur" data-v="${Math.round(e.pPasser * 100)}">${Math.round(e.pPasser * 100)}</span><small>${nbsp}%</small></span><p class="phrase">de chances de passer le palier <b>${p.cible}</b> avec la proposition prudente</p></div>
      ${fragile ? `<p class="petit attention-txt">${ep.derniere ? 'Dernière tentative en cours : les cartes seront libérées quoi qu’il arrive, cette proposition ne sert pas pour l’instant.' : 'Moins d’une chance sur trois : proposition fragile.'}</p>` : ''}
      ${d ? `<div>${graphe((w) => G.dist(w, d, p.cible, s, 150))}<p class="lecture" style="margin-top:4px"><b>${pct(d.partAuDessus)}</b> des tirages au-dessus de ${p.cible} ; chances corrigées sur l'historique : <b>${pct(e.pPasser)}</b>.</p></div>` : ''}
      <div class="equipe-puces" aria-label="Proposition prudente">${membres.map((l) => `<span class="tag">${e.capitaine === l.c.id ? '<span class="cap">C</span>' : ''}${esc(nomCourt(l.j.nom))} <b>${pct(l.pr.p)}</b></span>`).join('')}</div>
      <div class="faits">
        <div class="fait"><span class="libelle">Score attendu</span><span class="v">${nb(e.scoreMoyen)} <small>/ ${p.cible}</small></span></div>
        <div class="fait"><span class="libelle">Les 5 jouent</span><span class="v">${pct(e.pComplete)}</span></div>
        <div class="fait"><span class="libelle">Verrouillage</span><span class="v">${esc(quand(e.verrouillage))}</span></div>
      </div>`;
  }
  return `<section class="carte panneau-sport" data-sport="${s}" aria-label="${SPORTS[s]}">${tete(etat)}${chemin(s)}${alertePalier(s)}${corps}${liens}</section>`;
}

function afficherAccueil(anime) {
  const h = vue.heros ?? vue.sport;
  const r = (s) => (palierEnCours(s) ? cache.get(`prop|${cleBase(s)}`) : null);
  $('vue-accueil').innerHTML = `<section class="projecteur sans-3d" id="projecteur" data-sport="${h}" aria-label="Palier en cours · ${SPORTS[h]}">
      <div class="scene-3d" id="scene-3d" aria-hidden="true"></div>
      <div class="pj-contenu" id="pj-contenu">${contenuHeros(h, r(h))}</div></section>
    <div class="entete"><div class="titres"><h1>Où j'en suis</h1><p class="doux petit">${esc(fJourLong.format(new Date()))} · données Sorare de ${fHeure.format(new Date(D.meta.recupereA))}</p></div></div>
    <div class="accueil-grille">${['football', 'nba'].map((s) => `<div id="panneau-${s}">${panneauSport(s, r(s))}</div>`).join('')}</div>`;
  $('vue-accueil').classList.toggle('anim', anime && !REDUIT.matches);
  dessiner($('vue-accueil'));
  monterScene(h);
  // Calcul des propositions : le sport du bandeau d'abord.
  for (const s of [h, AUTRE[h]]) {
    if (!palierEnCours(s) || r(s)) continue;
    plusTard(() => propositions(s)).then((res) => {
      if (lireAdresse().ecran !== 'accueil') return;
      const el = $(`panneau-${s}`); if (!el) return;
      el.innerHTML = panneauSport(s, res);
      dessiner(el);
      const hh = $('projecteur')?.dataset.sport;
      if (hh === s || hh === AUTRE[s]) $('pj-contenu').innerHTML = contenuHeros(hh, cache.get(`prop|${cleBase(hh)}`));
      if (hh === s) compter($('pj-contenu').querySelector('.compteur'));
      rendreNav('accueil');
    });
  }
  if (anime) document.querySelectorAll('#vue-accueil .compteur').forEach(compter);
}

function compter(el) {
  if (!el || REDUIT.matches) return;
  const fin = Number(el.dataset.v), t0 = performance.now(), duree = 900;
  const pas = (t) => { const k = Math.min(1, (t - t0) / duree), e = 1 - (1 - k) ** 3; el.textContent = Math.round(fin * e); if (k < 1) requestAnimationFrame(pas); };
  el.textContent = '0'; requestAnimationFrame(pas);
}

function basculerHeros(s) {
  vue.heros = s;
  const sec = $('projecteur'), c = $('pj-contenu');
  if (!sec || !c) return;
  sec.dataset.sport = s;
  sec.setAttribute('aria-label', `Palier en cours · ${SPORTS[s]}`);
  c.innerHTML = contenuHeros(s, palierEnCours(s) ? cache.get(`prop|${cleBase(s)}`) : null);
  Scene.sport(s);
  c.classList.remove('bascule'); void c.offsetWidth; c.classList.add('bascule');
  compter(c.querySelector('.compteur'));
  c.querySelector('[data-act="heros-sport"]')?.focus({ preventScroll: true });
}

// ---------- Solo ----------
function afficherSolo(sport) {
  const p = palierEnCours(sport), el = $('vue-solo');
  const n = jouees(sport).size;
  const ep = p ? etatPalier(p) : null;
  const contexte = p ? [ep.enCours && !ep.derniere ? 'Une tentative est en cours : ces propositions servent à la suivante si elle échoue.' : '',
    n ? `${pluriel(n, 'carte marquée jouée', 'cartes marquées jouées')} à ce palier, écartée${n > 1 ? 's' : ''} des propositions.` : ''].filter(Boolean).join(' ') : '';
  el.innerHTML = `<div class="entete"><div class="titres"><h1>Solo · ${SPORTS[sport]}</h1><p class="doux petit">${p ? `Palier ${p.cible} · ${rangPalier(p)} sur ${paliersDe(sport).length} · ${esc(etatTexte(p))}` : 'Plateau terminé'}</p></div>
      <div class="outils reglages"><div class="seg" role="group" aria-label="Créneaux"><button type="button" data-act="mode" data-v="plusieurs" aria-pressed="${vue.mode === 'plusieurs'}">Plusieurs créneaux</button><button type="button" data-act="mode" data-v="unique" aria-pressed="${vue.mode === 'unique'}">Créneau unique</button></div>${segSeuil()}</div></div>
    <div class="tel-seul">${alertePalier(sport) ? `<div style="margin-bottom:var(--e4)">${alertePalier(sport)}</div>` : ''}</div>
    ${contexte ? `<p class="contexte">${esc(contexte)}</p>` : ''}
    <div id="solo-contenu"><p class="attente">Simulation des meilleures équipes…</p></div>`;
  if (!p) { $('solo-contenu').innerHTML = '<p class="attente">Tous les paliers de ce plateau sont passés.</p>'; return; }
  if (vue.mode === 'unique') { afficherCreneaux(sport); return; }
  plusTard(() => propositions(sport)).then((r) => {
    if (!surSolo(sport) || vue.mode !== 'plusieurs') return;
    rendreNav('solo');
    if (!r.equilibree) { $('solo-contenu').innerHTML = `<p class="attente">${esc(r.message)}</p>`; return; }
    const memes = r.prudente.cartes.join() === r.equilibree.cartes.join() && r.prudente.capitaine === r.equilibree.capitaine;
    const variante = (nom, e) => `<details class="repli"><summary>${TITRES[nom][0]} <span class="doux">${pct(e.pPasser)} de chances de passer · les 5 jouent ${pct(e.pComplete)}</span></summary><div class="variante">${carteProposition(TITRES[nom][0], TITRES[nom][1], e, sport, p.cible, { hauteur: 140 })}</div></details>`;
    const variantes = [memes ? '' : variante('equilibree', r.equilibree), r.ambitieuse ? variante('ambitieuse', r.ambitieuse) : ''].join('');
    const ecartees = Object.entries(r.ecartees).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>${v} ${esc(k)}</li>`).join('');
    const apres = (variantes || '<p class="corps petit doux" style="border-top:1px solid var(--trait);padding-top:var(--e3)">Pas d’autre proposition : l’équipe prudente est aussi la plus forte.</p>') +
      `<details class="repli"><summary>Détail technique <span class="doux">${r.admissibles} cartes retenues, ${r.nbEquipes} équipes comparées en ${nb(r.dureeMs / 1000, 1)} s</span></summary><div class="technique"><ul>${ecartees}</ul>` +
      `<p>Chances calculées par ${D.P.simulation.tirages} tirages (méthode v${D.P.version}), puis corrigées par la table de calibrage du sport (rétro-test des équipes). Les joueurs sont tirés indépendamment : deux coéquipiers ont en réalité des scores liés.</p></div></details>`;
    // Fiche épinglée (≥ 1 800 px) : le dernier joueur choisi, sinon le capitaine.
    if (!parId.has(vue.epingle[sport])) vue.epingle[sport] = r.prudente.capitaine ?? r.prudente.cartes[0];
    $('solo-contenu').innerHTML = `<div class="solo-grille avec-fiche">
        <div class="pile">${carteProposition(TITRES.prudente[0], TITRES.prudente[1], r.prudente, sport, p.cible, { apres, epinglable: true })}</div>
        <section class="carte" id="autres-choix" aria-label="Autres choix"><header><h2>Autres choix</h2><span class="doux petit">si tu préfères ajuster l'équipe prudente</span></header><p class="attente">Recherche des autres joueurs…</p></section>
        <aside class="col-fiche carte" id="col-fiche" aria-label="Fiche épinglée"></aside>
      </div>`;
    afficherColFiche();
    dessiner($('solo-contenu'));
    plusTard(() => autres(sport, r.prudente)).then((a) => afficherAutres(sport, r.prudente, a));
  });
}

// Autres choix : regroupés par joueur remplacé, un seul par joueur (sa meilleure carte), la meilleure
// en ligne et les suivantes repliées, avec la chance de passer avant → après. Un match bien plus tard
// que l'équipe est signalé.
const AUTRES_PAR_GROUPE = 5;
function afficherAutres(sport, equipe, a) {
  const el = $('autres-choix'); if (!el || !surSolo(sport)) return;
  const dernier = Math.max(...equipe.cartes.map((id) => Date.parse(parId.get(id).m.debutUTC)));
  const vus = new Set(), parRemplace = new Map();
  const tous = a.groupes.flatMap((g) => g.choix).filter((c) => c.remplace && c.pPasser != null).sort((x, y) => y.pPasser - x.pPasser);
  for (const c of tous) {
    const l = parId.get(c.carteId); if (!l || vus.has(l.j.id)) continue;
    vus.add(l.j.id);
    if (!parRemplace.has(c.remplace)) parRemplace.set(c.remplace, []);
    parRemplace.get(c.remplace).push(c);
  }
  const tete = '<header><h2>Autres choix</h2><span class="doux petit">si tu préfères ajuster l\'équipe prudente</span></header>';
  if (!parRemplace.size) { el.innerHTML = `${tete}<p class="corps petit doux">Pas d’autre carte admissible.</p>`; return; }
  const avant = Math.round(equipe.pPasser * 100);
  const ligneAlt = (c) => {
    const l = parId.get(c.carteId), apres = Math.round(c.pPasser * 100);
    const classe = apres > avant ? 'mieux' : apres < avant ? 'moins' : 'pareil';
    const tard = Date.parse(l.m.debutUTC) - dernier > 36 * 3600000 ? `<span class="tag attention">résultat le ${esc(fJour.format(new Date(l.m.debutUTC)))}</span>` : '';
    return ligne(l, { capitaine: c.capitaine, epinglable: true, tags: tard, extra: `<span class="delta ${classe}">${avant}${nbsp}% → ${apres}${nbsp}%</span><span class="mini doux">chances de passer${c.capitaine === c.carteId ? ', avec le brassard' : ''}</span>` });
  };
  el.innerHTML = `${tete}<p class="corps petit doux">Pour chaque joueur de l'équipe, la meilleure carte qui peut le remplacer (postes, joueur unique${sport === 'nba' ? ', 16 étoiles' : ''}) et la chance de passer avant → après le changement.</p>
    <div class="tableau">${[...parRemplace.entries()].map(([rem, choix]) => {
      const r = parId.get(rem), suite = choix.slice(1, AUTRES_PAR_GROUPE);
      return `<div class="groupe-alt"><h3>À la place de ${esc(r.j.nom)} (${esc(r.j.postes.join('/'))}${equipe.capitaine === rem ? ', capitaine' : ''})</h3>${ligneAlt(choix[0])}` +
        (suite.length ? `<details><summary>+ ${pluriel(suite.length, 'autre')}</summary>${suite.map(ligneAlt).join('')}</details>` : '') + '</div>';
    }).join('')}</div>`;
  dessiner(el);
}

// Créneau unique : liste des créneaux (maître) et équipe du créneau choisi (détail).
function afficherCreneaux(sport) {
  plusTard(() => parCreneau(sport)).then((r) => {
    if (!surSolo(sport) || vue.mode !== 'unique') return;
    const p = palierEnCours(sport);
    if (!r?.creneaux.length) { $('solo-contenu').innerHTML = '<p class="attente">Aucun créneau ne permet de remplir une équipe avec tes cartes disponibles.</p>'; return; }
    const meilleur = r.creneaux.slice().sort((a, b) => b.equilibree.pPasser - a.equilibree.pPasser)[0];
    if (!r.creneaux.some((c) => c.creneau === vue.creneauOuvert)) vue.creneauOuvert = meilleur.creneau;
    const c = r.creneaux.find((x) => x.creneau === vue.creneauOuvert);
    $('solo-contenu').innerHTML = `<div class="solo-grille creneau-grille">
      <section class="carte" aria-label="Créneaux"><header><h2>Créneaux</h2><span class="doux petit">les 5 matchs commencent à la même heure</span></header>
        <p class="corps petit doux">Compose juste après la publication des compositions officielles (vers H-1), après une mise à jour. Meilleure chance : ${pct(meilleur.equilibree.pPasser)}.</p>
        <div class="creneaux">${r.creneaux.map((x) => `<button type="button" class="creneau" data-act="creneau" data-v="${esc(x.creneau)}" aria-pressed="${x.creneau === vue.creneauOuvert}">
          <span><span class="heure">${esc(quand(x.creneau))}</span><br><span class="mini doux">${pluriel(x.matchs, 'match')} · compositions ${x.compositionsPubliees ? `publiées (${x.compositionsPubliees}/${x.matchs})` : 'pas encore publiées'} · ${x.admissibles} cartes</span></span>
          <span class="chance">${pct(x.equilibree.pPasser)}<small>chances de passer</small></span></button>`).join('')}</div>
        <p class="corps note" style="padding-top:var(--e3)">${pluriel(r.creneaux.length, 'créneau comparé', 'créneaux comparés')} en ${nb(r.dureeMs / 1000, 1)} s.</p></section>
      <div class="pile" id="creneau-detail">${carteProposition(`Créneau ${quand(c.creneau)}`, 'La meilleure équipe de ce créneau.', c.equilibree, sport, p.cible)}</div>
    </div>`;
    dessiner($('solo-contenu'));
  });
}

// ---------- Squad du jour ----------
function afficherSquad() {
  const sport = vue.sport, J = D.journees[sport];
  const jours = joursAVenir(lignesMoteur(sport), Date.now(), J.fuseau);
  if (!jours.includes(vue.squadJour)) vue.squadJour = jours[0] ?? null;
  const jour = vue.squadJour;
  $('vue-squad').innerHTML = `<div class="entete"><div class="titres"><h1>Squad · ${SPORTS[sport]}</h1><p class="doux petit">La meilleure équipe du jour au sens du score attendu. Les cartes jouées en solo restent utilisables.</p></div>
      <div class="outils"><div class="seg" role="group" aria-label="Journée Sorare">${jours.map((j) => `<button type="button" data-act="jour" data-v="${j}" aria-pressed="${j === jour}" title="${esc(libelleJournee(sport, j))}">${esc(libelleJourneeCourt(sport, j))}</button>`).join('')}</div></div></div>
    ${jour ? `<p class="contexte">Journée Sorare : ${esc(libelleJournee(sport, jour))}</p>` : ''}
    <div id="squad-contenu"><p class="attente">${jour ? 'Recherche de la meilleure équipe…' : 'Aucun match à venir.'}</p></div>`;
  if (!jour) return;
  plusTard(() => squad(sport, jour)).then((r) => {
    if (vueCourante() !== 'squad' || vue.sport !== sport || vue.squadJour !== jour) return;
    if (!r.equipe) { $('squad-contenu').innerHTML = `<p class="attente">${esc(r.message)}</p>`; return; }
    const e = r.equipe, membres = membresDe(e), Jo = jouees(sport);
    const dansEquipe = new Set(e.cartes);
    const maintenant = Date.now();
    const meilleures = lignes.filter((l) => l.c.sport === sport && l.m && !dansEquipe.has(l.c.id) && Date.parse(l.m.debutUTC) > maintenant && journee(l) === jour &&
      l.pr.statut === 'ok' && l.pr.p >= seuil() && l.pr.eligibleArcade && l.pr.esperance != null).sort((a, b) => b.pr.esperance - a.pr.esperance).slice(0, 10);
    $('squad-contenu').innerHTML = `<div class="squad-grille">
      <section class="carte" aria-label="Équipe du jour"><header><h2>Équipe du jour</h2><span class="doux petit">score attendu maximal</span></header>
        <div class="corps pile">${kpisEquipe(e, sport, membres, { squad: true })}
          <div style="padding-top:var(--e2)"><span class="libelle long">Qui porte l'équipe · score attendu par joueur${e.capitaine ? ', capitaine compris' : ''}</span><div style="margin-top:8px">${G.empilee(membres, e, sport)}</div></div></div>
        <div class="tableau">${enteteTab()}${membres.map((l) => ligne(l, { capitaine: e.capitaine, jouee: Jo.has(l.c.id) ? 'jouée en solo' : '' })).join('')}</div>
        <p class="corps note" style="padding-top:var(--e3)">${r.admissibles} cartes du jour retenues, ${r.nbEquipes} équipes comparées. Règles de composition supposées identiques au solo (à confirmer).</p></section>
      <section class="carte" aria-label="Autres cartes du jour"><header><h2>Autres cartes du jour</h2><span class="doux petit">les meilleures espérances hors de l'équipe</span></header>
        <div class="tableau">${meilleures.map((l) => ligne(l, { jouee: Jo.has(l.c.id) ? 'jouée en solo' : '' })).join('') || '<p class="corps petit doux">Aucune autre carte ce jour-là.</p>'}</div></section>
    </div>`;
    dessiner($('squad-contenu'));
  });
}

// ---------- Mes cartes ----------
const TRIS = [['e', 'Les plus utiles (chances × score)'], ['s', "Score s'il joue"], ['p', 'Chances de jouer'], ['f', 'Joueur en forme'], ['q', 'Équipe en forme'], ['d', "Coup d'envoi"]];
const CROISSANTS = new Set(['n', 'd', 'x']); // tris croissants par défaut (nom, coup d'envoi, étoiles)
function cartesFiltrees() {
  const s = vue.sport;
  const L = lignes.filter((l) => l.c.sport === s && (!vue.poste || l.j.postes.includes(vue.poste)) &&
    (vue.etoiles == null || l.j.etoiles === vue.etoiles) &&
    (!vue.dispo || disponible(l)) && (!vue.journee || (l.m && journee(l) === vue.journee)));
  const J = jouees(s), esp = (l) => l.pr.esperance ?? -1;
  const cles = {
    e: esp, s: (l) => l.pr.siJoue ?? -1, p: (l) => l.pr.p ?? -1, f: (l) => formeDe(l.j)?.ecart ?? -9,
    q: (l) => formeEquipe(l.j.club?.slug)?.pctVictoires ?? -1, d: (l) => (l.m ? Date.parse(l.m.debutUTC) : 9e15),
    n: (l) => sansAccents(l.j.nom), x: (l) => l.j.etoiles ?? 99, r: (l) => (l.j.etoiles && l.pr.siJoue != null ? l.pr.siJoue / l.j.etoiles : -1),
    b: (l) => l.c.bonusPct ?? 0, j: (l) => (J.has(l.c.id) ? 1 : 0),
  };
  const cle = cles[vue.tri] ?? esp;
  return L.sort((a, b) => { const x = cle(a), y = cle(b); return ((x < y ? -1 : x > y ? 1 : 0) * vue.sens) || (esp(b) - esp(a)); });
}

function afficherCartes() {
  const s = vue.sport, J = jouees(s);
  // Journées présentes (filtre), étoiles présentes (NBA)
  const journees = new Map(), parNiveau = new Map();
  for (const l of lignes) {
    if (l.c.sport !== s || (vue.dispo && !disponible(l))) continue;
    if (l.m) { const k = journee(l); journees.set(k, (journees.get(k) ?? 0) + 1); }
    if (s === 'nba' && l.j.etoiles != null) parNiveau.set(l.j.etoiles, (parNiveau.get(l.j.etoiles) ?? 0) + 1);
  }
  if (vue.journee && !journees.has(vue.journee)) vue.journee = '';
  if (vue.etoiles != null && !parNiveau.has(vue.etoiles)) vue.etoiles = null;
  const p = palierEnCours(s), attendues = p ? 5 * etatPalier(p).utilisees : 0;
  const triNom = TRIS.find(([k]) => k === vue.tri)?.[1] ?? 'colonne';
  const resume = `Filtres : ${vue.journee ? libelleJournee(s, vue.journee) : 'toutes les journées'} · tri ${triNom.toLowerCase()} · ${Math.round(seuil() * 100)}${nbsp}%${vue.dispo ? ' · disponibles' : ''}`;
  const filtresOuverts = $('vue-cartes').querySelector('details.filtres')?.open ?? largePC();
  $('vue-cartes').innerHTML = `<div class="entete"><div class="titres"><h1>Mes cartes · ${SPORTS[s]}</h1><p class="doux petit">${pluriel(lignes.filter((l) => l.c.sport === s).length, 'carte')} · ${J.size} jouée${J.size > 1 ? 's' : ''}${attendues ? ` sur ${attendues}` : ''} à ce palier${largePC() ? ' · coche la colonne « Jouée » pour marquer une carte' : ''}</p></div></div>
    <div class="tel-seul">${alertePalier(s) ? `<div style="margin-bottom:var(--e3)">${alertePalier(s)}</div>` : ''}</div>
    <div class="barre-filtres">
      <div class="seg" role="group" aria-label="Poste">${[null, ...POSTES[s]].map((x) => `<button type="button" data-act="poste" data-v="${x ?? ''}" aria-pressed="${x === vue.poste}">${x ?? 'Tous'}</button>`).join('')}</div>
      ${s === 'nba' ? `<div class="seg" role="group" aria-label="Étoiles"><button type="button" data-act="etoiles" data-v="" aria-pressed="${vue.etoiles == null}">Toutes ★</button>${[...parNiveau.entries()].sort((a, b) => a[0] - b[0]).map(([e, n]) =>
        `<button type="button" data-act="etoiles" data-v="${e}" aria-pressed="${e === vue.etoiles}"><span class="etoiles">★</span>${nb(e, 1)} <small>(${n})</small></button>`).join('')}</div>` : ''}
      <span class="compte" id="compte-cartes"></span>
      <details class="filtres"${filtresOuverts ? ' open' : ''}><summary>${esc(resume)}</summary><div class="filtres-corps">
        <select class="choix" data-act="journee" aria-label="Journée Sorare"><option value="">Toutes les journées</option>${[...journees.entries()].sort((a, b) => a[0].localeCompare(b[0]))
          .map(([k, n]) => `<option value="${k}" ${k === vue.journee ? 'selected' : ''}>${esc(libelleJournee(s, k))} (${n})</option>`).join('')}</select>
        <select class="choix" data-act="tri" aria-label="Trier par">${TRIS.map(([k, t]) => `<option value="${k}" ${k === vue.tri ? 'selected' : ''}>Tri : ${t}</option>`).join('')}${TRIS.some(([k]) => k === vue.tri) ? '' : '<option selected>Tri : colonne du tableau</option>'}</select>
        ${segSeuil()}
        <label class="case"><input type="checkbox" data-act="dispo" ${vue.dispo ? 'checked' : ''}> disponibles seulement</label>
      </div></details>
    </div>
    <div id="cartes-liste"></div>`;
  afficherListeCartes();
}

function afficherListeCartes() {
  const s = vue.sport, L = cartesFiltrees(), J = jouees(s), nba = s === 'nba', max = vue.toutVoir ? Infinity : 300;
  $('compte-cartes').textContent = pluriel(L.length, 'carte');
  const el = $('cartes-liste');
  if (!L.length) { el.innerHTML = '<div class="vide-liste">Aucune carte ne correspond. Décoche « disponibles seulement » pour tout voir.</div>'; return; }
  const plus = L.length > max ? `<div class="plus-de-cartes"><button type="button" class="btn" data-act="tout-voir">Afficher les ${L.length} cartes</button></div>` : '';
  const vis = L.slice(0, max);
  if (!largePC()) {
    el.innerHTML = `<div class="carte tableau">${vis.map((l) => ligne(l, { horsSolo: true, griser: true })).join('')}</div>${plus}`;
    return;
  }
  // PC : tableau dense triable, en-tête collant, colonne « jouée » à cocher.
  const th = (k, t, cls = '') => `<th scope="col" class="${cls}" ${vue.tri === k ? `aria-sort="${vue.sens > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" data-act="tri-col" data-v="${k}">${t}<span class="fl">${vue.tri === k ? (vue.sens > 0 ? '▲' : '▼') : ''}</span></button></th>`;
  const lignesHtml = vis.map((l) => {
    const st = statut(l), v = victoirePct(l), jouee = J.has(l.c.id);
    return `<tr data-fiche="${esc(l.c.id)}" class="${fiche.ouverte === l.c.id ? 'choisie' : ''}${jouee ? ' bloquee' : ''}">
      <td><input type="checkbox" data-act="cocher" data-v="${esc(l.c.id)}" ${jouee ? 'checked' : ''} ${palierEnCours(s) ? '' : 'disabled'} aria-label="${esc(l.j.nom)} jouée à ce palier"></td>
      <td>${vignette(l)}</td>
      <td><span class="nom">${esc(l.j.nom)}</span><span class="sous">${esc(l.j.postes.join('/'))} · ${esc(l.j.club?.nom ?? '?')}</span></td>
      ${nba ? `<td class="r">${badgeEtoiles(l)}</td>` : ''}
      <td>${l.m ? `<span class="nom" style="font-weight:400">${esc(quand(l.m.debutUTC))}</span><span class="sous">${l.lieu === 'ext' ? '@' : l.lieu === 'dom' ? 'vs' : ''} ${esc(l.adv ?? '?')}${v != null ? ` · ${v}${nbsp}% vict.` : ''}</span>` : '<span class="doux">pas de match</span>'}</td>
      <td><div class="cellule-p"><b>${pct(l.pr.p)}</b>${G.barreP(l.pr.p, seuil(), 56)}</div></td>
      <td><div class="cellule-p"><b>${nb(l.pr.siJoue)}</b>${G.ival(l, 64)}</div></td>
      <td class="r"><b>${nb(l.pr.esperance, 1)}</b></td>
      ${nba ? `<td class="r">${l.j.etoiles && l.pr.siJoue != null ? nb(l.pr.siJoue / l.j.etoiles, 1) : '–'}</td>` : ''}
      <td>${G.pastilles(formeEquipe(l.j.club?.slug)?.derniers)}</td>
      <td class="statut">${l.c.bonusPct ? `<span class="tag">${esc(l.c.collection)} +${nb(l.c.bonusPct)}${nbsp}%</span> ` : ''}${st === 'probable' ? '' : `<span class="tag ${TON_STATUT[st]}">${LIBELLES[st]}</span> `}${!l.pr.eligibleArcade && l.m ? '<span class="tag stop">hors solo</span> ' : ''}${tagsContexte(l)}${!l.c.bonusPct && st === 'probable' && l.pr.eligibleArcade ? `<span class="doux">${esc(l.c.collection ?? '')}</span>` : ''}</td></tr>`;
  }).join('');
  el.innerHTML = `<div class="defile-x"><table class="dense"><thead><tr>${th('j', 'Jouée')}<th scope="col"><span class="sr">Carte</span><span aria-hidden="true"></span></th>${th('n', 'Joueur')}${nba ? th('x', '★', 'r') : ''}${th('d', 'Match')}${th('p', 'Chances de jouer')}${th('s', "S'il joue")}${th('e', 'Espérance', 'r')}${nba ? th('r', 'Pts/★', 'r') : ''}${th('q', 'Club')}${th('b', 'Bonus · statut')}</tr></thead><tbody>${lignesHtml}</tbody></table></div>${plus}`;
}

// ---------- Fiche joueur ----------
// Bloc « forme » d'un club : 10 derniers résultats, % de victoires, série, buts ou points.
function blocClub(titre, nom, slug, sport) {
  const ms = matchsEquipe(slug).map((m) => ({ ...m, res: resultat(m) })).filter((m) => m.res);
  if (!ms.length) return `<div class="club-forme"><div><span class="libelle">${titre}</span> <b>${esc(nom ?? '?')}</b></div><p class="petit doux">Forme inconnue : aucune de tes cartes ne joue dans cette équipe.</p></div>`;
  const s = statsEquipe(matchsEquipe(slug), F), serie = serieEnMots(s, F);
  const unite = sport === 'nba' ? 'points' : 'buts';
  const echelleButs = sport === 'nba' ? 140 : 3;
  const buts = sport === 'football'
    ? `<div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center" class="petit"><span>${nb(s.pourMoyen, 1)} marqués</span><div class="divergent" role="img" aria-label="Buts par match : ${nb(s.pourMoyen, 1)} marqués, ${nb(s.contreMoyen, 1)} encaissés"><i class="pour" style="width:${Math.min(100, (s.pourMoyen / echelleButs) * 100)}%"></i><i class="contre" style="width:${Math.min(100, (s.contreMoyen / echelleButs) * 100)}%"></i></div><span>${nb(s.contreMoyen, 1)} encaissés</span></div>`
    : `<p class="petit">${nb(s.pourMoyen, 1)} points marqués, ${nb(s.contreMoyen, 1)} encaissés par match (écart <b>${s.pourMoyen - s.contreMoyen >= 0 ? '+' : '−'}${nb(Math.abs(s.pourMoyen - s.contreMoyen), 1)}</b>)</p>`;
  return `<div class="club-forme">
    <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><span class="libelle">${titre}</span><b>${esc(nom ?? '?')}</b></div>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${G.pastilles(ms, 'derniers résultats')}<span class="petit"><b>${pct(s.pctVictoires)}</b> de victoires sur ${s.nb}</span>${serie ? `<span class="petit doux">${esc(serie)}</span>` : ''}</div>
    <ul class="res-liste" aria-label="5 derniers matchs, du plus récent au plus ancien">${ms.slice(0, 5).map((m) => `<li><span class="vnd"><span class="${m.res}">${m.res}</span></span><span>${m.pour}-${m.contre}</span><span class="adv" title="${esc(m.adversaire ?? '')}">${m.domicile ? 'vs' : '@'} ${esc(m.adversaire ?? '?')}</span><span class="mini doux">${esc(fJourMois.format(new Date(m.date)))}</span></li>`).join('')}</ul>
    ${sport === 'football' ? `<span class="mini doux">${unite} par match sur ${s.nb}</span>` : ''}${buts}
  </div>`;
}

function ficheHtml(l) {
  const { c, j, m, pr } = l, s = pr.score, st = statut(l), J = jouees(c.sport), palier = palierEnCours(c.sport), f = fourchette(l), fj = formeDe(j);
  const H = j.historique.slice(0, 15), joue = (x) => ['titulaire', 'entre', 'joue'].includes(x.situation) && x.statut !== 'DID_NOT_PLAY';
  const nbJ = H.filter(joue).length, nbT = H.filter((x) => x.situation === 'titulaire' && x.statut !== 'DID_NOT_PLAY').length;
  const tend = fj?.tendance === 'hausse' ? '<span class="ok-txt">en hausse</span>' : fj?.tendance === 'baisse' ? '<span class="stop-txt">en baisse</span>' : fj?.tendance === 'stable' ? 'stable' : null;
  const pres = c.sport === 'football'
    ? (fj ? `Titulaire ${fj.titulaire} fois${fj.joue > fj.titulaire ? `, entré en jeu ${fj.joue - fj.titulaire} fois` : ''} sur les ${fj.sur} derniers matchs de l'équipe.` : '')
    : (fj ? `A joué ${fj.joue} des ${fj.sur} derniers matchs${fj.minutesRecentes != null ? ` ; ${nb(fj.minutesRecentes)} min sur ses 3 derniers (${nb(fj.minutesReference)} habituellement)` : ''}.` : '');
  const leg = c.sport === 'football'
    ? '<span><i class="sw" style="background:var(--d-tit)"></i>titulaire</span><span><i class="sw" style="background:var(--d-ent);outline:1.2px solid var(--d-tit)"></i>entré en jeu</span>'
    : '<span><i class="sw" style="background:var(--d-tit)"></i>a joué</span>';
  const tags = [st === 'probable' ? '<span class="tag">Probable</span>' : `<span class="tag ${TON_STATUT[st]}">${LIBELLES[st]}</span>`,
    c.bonusPct ? `<span class="tag">${esc(c.collection)} +${nb(c.bonusPct)}${nbsp}%</span>` : `<span class="tag">${esc(c.collection ?? '')}</span>`,
    j.statutSorare ? `<span class="tag">Sorare${nbsp}: ${esc(j.statutSorare)}</span>` : '',
    !pr.eligibleArcade && m ? '<span class="tag stop">hors solo</span>' : '',
    J.has(c.id) ? '<span class="tag">jouée à ce palier</span>' : '', tagsContexte(l)].join('');
  return `<div class="fiche" data-sport="${c.sport}">
    <div class="fiche-tete">${vignette(l)}
      <div style="min-width:0;display:grid;gap:4px"><h2>${esc(j.nom)}</h2>
        ${c.sport === 'nba' ? `<div>${badgeEtoiles(l, true)}</div>` : ''}
        <p class="meta">${esc(j.postes.join('/'))} · ${esc(j.club?.nom ?? '?')} · ${esc((j.tier ?? '').replace('_PLUS', '+').toLowerCase())}${c.sport !== 'nba' && j.etoiles != null ? ` · <span class="etoiles">★${nbsp}${nb(j.etoiles, 1)}</span>` : ''}</p>
        <p class="meta">${m ? `${esc(quandLong(m.debutUTC))} · ${esc(m.competition ?? '')} · ${l.lieu === 'ext' ? 'à l’extérieur contre' : l.lieu === 'dom' ? 'à domicile contre' : ''} ${esc(l.adv ?? '?')}` : 'Pas de match connu'}</p>
        <div class="tags">${tags}</div></div></div>
    <div class="fiche-grille">
      <div class="pile">
        <div class="bloc cq"><div class="kpis">
          <div class="kpi heros"><span class="libelle">Chances de jouer</span><span class="v">${pct(pr.p)}</span>${G.barreP(pr.p, seuil(), 140, 10)}<span class="s">repère orange : ton seuil de ${pct(seuil())}</span></div>
          <div class="kpi"><span class="libelle">S'il joue</span><span class="v">${nb(pr.siJoue)}</span>${G.ival(l, 140, true)}<span class="s">${f ? `80 % des cas entre ${nb(f.q10)} et ${nb(f.q90)}, bonus compris` : 'pas assez de scores'}</span></div>
          <div class="kpi"><span class="libelle">Espérance</span><span class="v">${nb(pr.esperance, 1)}</span><span class="s">chances × score s'il joue${c.sport === 'nba' && j.etoiles && pr.siJoue != null ? ` · ${nb(pr.siJoue / j.etoiles, 1)} pts/★ s'il joue` : ''}</span></div>
          ${c.sport === 'football'
            ? `<div class="kpi"><span class="libelle">Titulaire quand il joue</span><span class="v">${s.q == null ? '–' : pct(s.q)}</span><span class="s">sur ses matchs joués récents</span></div>
               <div class="kpi" style="grid-column:1/-1"><span class="libelle">Cote du match · victoire, nul, défaite</span>${G.cote3(l.cotes)}</div>`
            : `<div class="kpi"><span class="libelle">Minutes récentes</span><span class="v">${nb(s.minutes)}</span><span class="s">en NBA, les minutes comptent plus que la titularisation</span></div>`}
        </div></div>
        <div class="bloc">
          <header><h3>${H.length} derniers matchs</h3><span class="droite petit doux">joué ${nbJ} sur ${H.length}${c.sport === 'football' ? ` · titulaire ${nbT}` : ''}</span></header>
          ${graphe((w) => G.histo(w, l))}
          <p class="legende">${leg}<span><i class="sw" style="border:1.2px dashed var(--attention)"></i>B banc</span><span><i class="sw" style="border:1.2px dashed var(--stop)"></i>A absent</span><span><i class="sw" style="background:var(--d-bande)"></i>10–90 %</span>${fj?.moyRecente != null ? `<span><i class="sw" style="height:3px;background:var(--sport)"></i>3 derniers : ${nb(fj.moyRecente)}</span>` : ''}${fj?.moyReference != null ? `<span><i class="sw" style="height:2px;background:var(--doux)"></i>15 derniers : ${nb(fj.moyReference)}</span>` : ''}<span><i class="sw" style="height:0;border-top:1.5px dashed var(--encre)"></i>projection hors bonus</span></p>
          <p class="petit">${tend ? `Forme du joueur : ${tend} (${nb(fj.moyRecente)} sur ses 3 derniers matchs joués contre ${nb(fj.moyReference)} sur ses 15 derniers). ` : ''}${esc(pres)}</p>
        </div>
      </div>
      <div class="bloc">
        <header><h3>Forme des clubs</h3><span class="droite mini doux">plus récent à droite</span></header>
        ${blocClub('Son équipe', j.club?.nom, j.club?.slug, c.sport)}
        ${m ? blocClub('Adversaire', l.adv, slugAdversaire(l), c.sport) : ''}
        <p class="note">Affiché pour information : la forme de l'équipe ne change pas les chances calculées (elle n'apportait rien de plus que la cote du match sur ton historique).</p>
      </div>
    </div>
    ${pr.raisons.length ? `<div class="bloc"><h3>Ce que le calcul a retenu</h3><ul class="raisons">${pr.raisons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${palier ? `<div class="actions"><button type="button" class="btn ${J.has(c.id) ? '' : 'principal'}" data-act="basculer" data-sport="${c.sport}" data-v="${esc(c.id)}">${J.has(c.id) ? 'Remettre disponible' : `Marquer comme jouée (palier ${palier.cible})`}</button></div>` : ''}
  </div>`;
}

// Volet de la fiche : à droite sur PC (la page reste visible), plein écran sur téléphone.
// À partir de 1 800 px, dans le Solo, la fiche est une 3e colonne épinglée.
const fiche = { ouverte: null, origine: null };
function marquerChoisies() {
  document.querySelectorAll('#main [data-fiche]').forEach((el) => el.classList.toggle('choisie',
    el.dataset.fiche === fiche.ouverte || (tresLarge() && Boolean(el.closest('#solo-contenu')) && el.dataset.fiche === vue.epingle[vue.sport] && Boolean($('col-fiche')))));
}
function afficherColFiche() {
  const col = $('col-fiche'); if (!col || !tresLarge()) return;
  const l = parId.get(vue.epingle[vue.sport]);
  col.innerHTML = `<div class="volet-tete">${ico('epingle')}<b>Fiche épinglée</b><span class="mini doux">clic sur une ligne pour changer</span></div>${l ? ficheHtml(l) : ''}`;
  dessiner(col);
  marquerChoisies();
}
function ouvrirFiche(id) {
  const l = parId.get(id); if (!l) return;
  if (tresLarge() && $('col-fiche') && vueCourante() === 'solo' && vue.mode === 'plusieurs') {
    vue.epingle[l.c.sport] = id; afficherColFiche(); return;
  }
  if (!fiche.ouverte) fiche.origine = document.activeElement;
  fiche.ouverte = id;
  const v = $('volet');
  v.innerHTML = `<div class="volet-tete"><b>${esc(l.j.nom)}</b><button type="button" class="btn rond discret" data-act="prec" aria-label="Joueur précédent">${ico('haut')}</button><button type="button" class="btn rond discret" data-act="suiv" aria-label="Joueur suivant">${ico('bas')}</button><button type="button" class="btn rond discret" data-act="fermer-fiche" aria-label="Fermer la fiche">${ico('fermer')}</button></div>${ficheHtml(l)}`;
  v.dataset.sport = l.c.sport;
  v.setAttribute('aria-label', `Fiche de ${l.j.nom}`);
  v.setAttribute('aria-modal', String(!largePC()));
  v.hidden = false;
  $('voile-fiche').hidden = largePC();
  v.setAttribute('tabindex', '-1');
  v.scrollTop = 0;
  v.focus({ preventScroll: true });
  dessiner(v);
  marquerChoisies();
}
function fermerFiche() {
  if (!fiche.ouverte) return;
  fiche.ouverte = null;
  $('volet').hidden = true; $('volet').innerHTML = ''; $('voile-fiche').hidden = true;
  marquerChoisies();
  if (fiche.origine?.isConnected) fiche.origine.focus({ preventScroll: true });
  fiche.origine = null;
}
// ↑ ↓ : joueur précédent ou suivant parmi les lignes visibles de la page.
function ficheVoisine(d) {
  const ids = [...new Set([...document.querySelectorAll('#main [data-fiche]')].filter((e) => e.offsetParent).map((e) => e.dataset.fiche))];
  if (!ids.length) return;
  const i = ids.indexOf(fiche.ouverte);
  ouvrirFiche(ids[(i + d + ids.length) % ids.length]);
}

// ---------- Cartes jouées ----------
function enregistrerJouees(sport, ensemble) {
  const p = palierEnCours(sport); if (!p) return;
  etatUtilisateur = { ...etatUtilisateur, [sport]: { cible: p.cible, jouees: [...ensemble], misAJour: new Date().toISOString() } };
  stockage.enregistrer(etatUtilisateur);
}
function basculer(sport, id) {
  const ensemble = jouees(sport);
  ensemble.has(id) ? ensemble.delete(id) : ensemble.add(id);
  enregistrerJouees(sport, ensemble);
}
// « J'ai joué cette équipe » : marque les 5 cartes, annulable pendant 8 s.
function jouerEquipe(sport, ids) {
  const avant = [...jouees(sport)], ensemble = jouees(sport);
  for (const id of ids) ensemble.add(id);
  enregistrerJouees(sport, ensemble);
  tout();
  toast(`${pluriel(ids.length, 'carte marquée jouée', 'cartes marquées jouées')} au palier ${palierEnCours(sport)?.cible}.`, () => { enregistrerJouees(sport, new Set(avant)); tout(); });
}

let minuterieToast = null;
function toast(texte, annuler = null) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(texte)}</span>${annuler ? '<button type="button" class="btn" data-act="annuler-toast">Annuler</button>' : ''}`;
  t.hidden = false;
  toast.annuler = annuler;
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => { t.hidden = true; toast.annuler = null; }, annuler ? 8000 : 3500);
}

// ---------- Fenêtres : marquage rapide des cartes jouées, aide ----------
const sansAccents = (x) => (x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let origineFenetre = null;
function ouvrirFenetre(titre, corps, onFermer = null) {
  const v = $('voile');
  if (v.hidden) origineFenetre = document.activeElement;
  v.innerHTML = `<div class="fenetre" role="dialog" aria-modal="true" aria-labelledby="titre-fenetre" tabindex="-1">
    <div class="volet-tete"><b id="titre-fenetre">${titre}</b><button type="button" class="btn rond discret" data-act="fermer-fenetre" aria-label="Fermer">${ico('fermer')}</button></div>
    <div class="corps">${corps}</div></div>`;
  v.hidden = false;
  fermerFenetre.rappel = onFermer;
  v.querySelector('.fenetre').focus({ preventScroll: true });
}
function fermerFenetre() {
  const v = $('voile'); if (v.hidden) return;
  v.hidden = true; v.innerHTML = '';
  const f = fermerFenetre.rappel; fermerFenetre.rappel = null;
  if (f) f();
  if (origineFenetre?.isConnected) origineFenetre.focus({ preventScroll: true });
}
// Recherche par nom ; une case coche ou décoche. Les propositions ne sont recalculées qu'à la fermeture.
function ouvrirMarquage(sport) {
  const p = palierEnCours(sport); if (!p) return;
  const attendues = 5 * etatPalier(p).utilisees;
  ouvrirFenetre(`Cartes jouées · ${SPORTS[sport]} · palier ${p.cible}`,
    `<p class="petit doux" id="compte-marquage"></p>
     <input type="search" class="recherche" id="recherche-marquage" placeholder="Chercher un joueur" autocomplete="off" aria-label="Chercher un joueur">
     <div class="liste-marquage" id="liste-marquage" data-sport="${sport}"></div>
     <div class="actions"><button type="button" class="btn principal" data-act="fermer-fenetre">Terminé</button></div>`, () => tout());
  const cartes = lignes.filter((l) => l.c.sport === sport);
  const dessinerListe = () => {
    const J = jouees(sport), q = sansAccents($('recherche-marquage').value.trim());
    $('compte-marquage').textContent = `${J.size} marquée${J.size > 1 ? 's' : ''}${attendues ? ` sur ${attendues} jouées à ce palier (${etatPalier(p).utilisees} × 5)` : ''}. Les cartes cochées ne seront plus proposées en solo.`;
    const L = cartes.filter((l) => !q || sansAccents(l.j.nom).includes(q))
      .sort((a, b) => (J.has(b.c.id) - J.has(a.c.id)) || ((b.pr.esperance ?? -1) - (a.pr.esperance ?? -1)));
    $('liste-marquage').innerHTML = L.slice(0, 40).map((l) => `<label class="marque-carte"><input type="checkbox" data-act="marque" data-v="${esc(l.c.id)}" ${J.has(l.c.id) ? 'checked' : ''}>
        <span style="min-width:0"><span class="nom">${esc(l.j.nom)}</span> ${badgeEtoiles(l)}<br><span class="doux">${esc(l.j.postes.join('/'))} · ${esc(l.j.club?.nom ?? '?')} · ${esc(l.c.collection ?? '')}${l.c.bonusPct ? ` +${nb(l.c.bonusPct)}${nbsp}%` : ''}</span></span>
        <span class="doux">${nb(l.pr.esperance)}</span></label>`).join('') +
      (L.length > 40 ? `<p class="petit doux">${L.length - 40} autres cartes : affine la recherche.</p>` : '') +
      (!L.length ? '<p class="petit doux">Aucune carte à ce nom.</p>' : '');
  };
  ouvrirMarquage.dessiner = dessinerListe;
  dessinerListe();
  $('recherche-marquage').oninput = dessinerListe;
}
function ouvrirAide() {
  ouvrirFenetre('Aide', '<p class="doux">L’aide de l’appli arrive bientôt.</p><div class="actions"><button type="button" class="btn principal" data-act="fermer-fenetre">Fermer</button></div>');
}
// Le focus reste dans la fenêtre ouverte (Tab et Maj+Tab bouclent).
function pieger(e, racine) {
  const f = [...racine.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
  if (!f.length) return;
  const premier = f[0], dernier = f.at(-1);
  if (e.shiftKey && (document.activeElement === premier || document.activeElement === racine)) { e.preventDefault(); dernier.focus(); }
  else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
}

// ---------- Bandeau de l'accueil : scène three.js (r128, chargée à la demande, seulement sur l'accueil) ----------
// 6 marches (une par palier), faisceau sur le palier en cours, brume et lignes du terrain. Environ 20 images
// par seconde, en pause hors écran, onglet caché ou hors de l'accueil ; repli en dégradés CSS sans WebGL,
// sans réseau ou avec mouvement réduit.
let promesseThree = null;
function chargerThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!promesseThree) {
    promesseThree = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.async = true;
      s.onload = () => (window.THREE ? ok(window.THREE) : ko(new Error('three.js absent')));
      s.onerror = () => { promesseThree = null; ko(new Error('three.js indisponible')); };
      (document.head ?? document.documentElement).appendChild(s);
    });
  }
  return promesseThree;
}
const webglPossible = () => {
  try { const c = document.createElement('canvas'); return Boolean(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; }
};
function monterScene(s) {
  if (REDUIT.matches || !webglPossible()) return; // le repli CSS (classe sans-3d) reste
  chargerThree().then(() => {
    const el = $('scene-3d'), sec = $('projecteur');
    if (!el || !sec || lireAdresse().ecran !== 'accueil') return;
    Scene.monter(el, sec, sec.dataset.sport ?? s);
  }).catch(() => { /* pas de three.js : le repli CSS reste */ });
}

const Scene = (() => {
  let renderer, scene, camera, groupe, lignesSol, faisceau, halo, piscine, poussiere, spot, raf = 0, actif = false, visible = true, conteneur, section, sportCourant = 'football', derniere = 0, obs, ro;
  const marches = [], t0 = performance.now();
  const lire = (nom, defaut) => (section && getComputedStyle(section).getPropertyValue(nom).trim()) || defaut;
  const couleur = (s) => new THREE.Color(lire(s === 'nba' ? '--nba' : '--foot', s === 'nba' ? '#e6799d' : '#4db2c7'));
  function texRonde() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), d = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    d.addColorStop(0, 'rgba(255,255,255,1)'); d.addColorStop(0.35, 'rgba(255,255,255,.45)'); d.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = d; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  function construire() {
    const T = THREE;
    renderer = new T.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(38, 1, 0.1, 80);
    scene.add(new T.AmbientLight(0x8090b0, 0.35));
    const dir = new T.DirectionalLight(0xc8d4ff, 0.25); dir.position.set(-4, 6, 8); scene.add(dir);
    spot = new T.SpotLight(0xe6eeff, 3.2, 30, 0.32, 0.65, 1.2);
    const sol = new T.Mesh(new T.PlaneGeometry(60, 40), new T.MeshStandardMaterial({ color: 0x0a0f18, roughness: 1, metalness: 0 }));
    sol.rotation.x = -Math.PI / 2; scene.add(sol);
    groupe = new T.Group(); scene.add(groupe); groupe.add(spot); groupe.add(spot.target);
    for (let i = 0; i < 6; i++) { // une marche par palier, de plus en plus haute
      const h = 0.35 + i * 0.34, geo = new T.BoxGeometry(1.25, h, 1.25);
      const m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0x161e2b, roughness: 0.55, metalness: 0.25, emissive: 0x000000 }));
      m.position.set((i - 2.5) * 1.45, h / 2, -i * 0.35);
      const bords = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 }));
      m.add(bords); groupe.add(m); marches.push({ mesh: m, bords, h });
    }
    const hc = 7.5; // faisceau du projecteur : cône additif, plus lumineux près de la lampe
    faisceau = new T.Mesh(new T.ConeGeometry(1.15, hc, 48, 1, true), new T.ShaderMaterial({
      uniforms: { uCouleur: { value: new T.Color(0xdfe9ff) }, uOpacite: { value: 0.22 } },
      vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = position.y / ${hc.toFixed(1)} + 0.5; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'uniform vec3 uCouleur; uniform float uOpacite; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float f = abs(dot(vN, vV)); float a = uOpacite * pow(f, 1.6) * (0.25 + 0.75 * vH); gl_FragColor = vec4(uCouleur, a); }',
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    }));
    faisceau.userData.h = hc; groupe.add(faisceau);
    const tex = texRonde();
    halo = new T.Sprite(new T.SpriteMaterial({ map: tex, color: 0xeef3ff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
    halo.scale.set(1.6, 1.6, 1); groupe.add(halo);
    piscine = new T.Mesh(new T.PlaneGeometry(3.2, 3.2), new T.MeshBasicMaterial({ map: tex, color: 0x9fb4d8, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
    piscine.rotation.x = -Math.PI / 2; groupe.add(piscine);
    [[-9, 7.5, -9], [-4, 8.2, -11], [4, 8.2, -11], [9, 7.5, -9]].forEach((p) => { // projecteurs du stade, au loin
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, color: 0xdfe8ff, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
      s.position.set(p[0], p[1], p[2]); s.scale.set(1.3, 1.3, 1); scene.add(s);
    });
    const N = innerWidth < 700 ? 260 : 520, pos = new Float32Array(N * 3); // brume de particules (graine fixe)
    let a = 7;
    const hasard = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    for (let k = 0; k < N; k++) { pos[k * 3] = (hasard() - 0.5) * 22; pos[k * 3 + 1] = hasard() * 7; pos[k * 3 + 2] = (hasard() - 0.7) * 14; }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
    poussiere = new T.Points(pg, new T.PointsMaterial({ map: tex, size: 0.09, color: 0xdfe8ff, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false }));
    scene.add(poussiere);
    scene.fog = new T.FogExp2(0x000000, 0.045);
  }
  function terrain(sport, c) {
    const pts = [];
    const seg = (a, b, x, y) => pts.push(a, 0.01, b, x, 0.01, y);
    const rect = (x0, z0, x1, z1) => { seg(x0, z0, x1, z0); seg(x1, z0, x1, z1); seg(x1, z1, x0, z1); seg(x0, z1, x0, z0); };
    const arc = (cx, cz, r, a0, a1) => { const n = 40; for (let i = 0; i < n; i++) { const u = a0 + ((a1 - a0) * i) / n, v = a0 + ((a1 - a0) * (i + 1)) / n; seg(cx + r * Math.cos(u), cz + r * Math.sin(u), cx + r * Math.cos(v), cz + r * Math.sin(v)); } };
    if (sport === 'nba') {
      rect(-7, -4, 7, 3.5); seg(0, -4, 0, 3.5); arc(0, -0.25, 0.9, 0, Math.PI * 2);
      rect(-7, -1.2, -4.6, 0.7); rect(4.6, -1.2, 7, 0.7);
      arc(-6.4, -0.25, 3.2, -Math.PI / 2, Math.PI / 2); arc(6.4, -0.25, 3.2, Math.PI / 2, Math.PI * 1.5);
    } else {
      rect(-8, -5, 8, 4); seg(0, -5, 0, 4); arc(0, -0.5, 1.4, 0, Math.PI * 2);
      rect(-8, -2.6, -5.9, 1.6); rect(5.9, -2.6, 8, 1.6); rect(-8, -1.4, -7.2, 0.4); rect(7.2, -1.4, 8, 0.4);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.32 }));
  }
  function appliquer(s) {
    const ps = paliersDe(s), p = palierEnCours(s), k = p ? ps.indexOf(p) : ps.length - 1, acc = couleur(s);
    sportCourant = s;
    const f = new THREE.Color(lire('--nuit-haut', '#1d2a40')); scene.background = f; scene.fog.color = f;
    if (lignesSol) { scene.remove(lignesSol); lignesSol.geometry.dispose(); lignesSol.material.dispose(); }
    lignesSol = terrain(s, acc); scene.add(lignesSol);
    marches.forEach((m, i) => {
      if (i < k || !p) { m.mesh.material.emissive = acc.clone().multiplyScalar(0.18); m.bords.material.color = acc; m.bords.material.opacity = 0.55; }
      else if (i === k) { m.mesh.material.emissive = acc.clone().multiplyScalar(0.45); m.bords.material.color = new THREE.Color(0xffffff); m.bords.material.opacity = 0.95; }
      else { m.mesh.material.emissive = new THREE.Color(0x000000); m.bords.material.color = new THREE.Color(0xffffff); m.bords.material.opacity = 0.16; }
    });
    const cur = marches[Math.max(0, Math.min(5, k))], q = cur.mesh.position, haut = cur.h, hc = faisceau.userData.h;
    faisceau.position.set(q.x, haut + hc / 2, q.z);
    halo.position.set(q.x, haut + hc + 0.05, q.z);
    piscine.position.set(q.x, haut + 0.012, q.z);
    spot.position.set(q.x, haut + hc + 1, q.z);
    spot.target.position.set(q.x, haut, q.z);
    poussiere.material.color = new THREE.Color(0xdfe8ff).lerp(acc, 0.25);
  }
  function cadrer() {
    const w = conteneur.clientWidth, h = conteneur.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const etroit = camera.aspect < 1.1;
    if (etroit) { groupe.scale.setScalar(0.5); groupe.position.set(0.15, 3.2, -1); camera.position.set(0, 4.4, 11.5); }
    else { groupe.scale.setScalar(1); groupe.position.set(Math.min(3, (camera.aspect - 1) * 2.4), 0, 0); camera.position.set(0, 3.4, 10.5); }
    camera.userData.base = camera.position.clone();
    camera.userData.vise = etroit ? new THREE.Vector3(0, 0.9, -1) : new THREE.Vector3(0, 1.3, -1);
    camera.lookAt(camera.userData.vise);
    camera.updateProjectionMatrix();
    appliquer(sportCourant);
    image(performance.now());
  }
  function image(now) {
    const t = (now - t0) / 1000, b = camera.userData.base;
    if (b) {
      camera.position.x = b.x + Math.sin(t * 0.06) * 0.7;
      camera.position.y = b.y + Math.sin(t * 0.045) * 0.15;
      camera.lookAt(camera.userData.vise);
    }
    poussiere.rotation.y = t * 0.012;
    poussiere.position.y = Math.sin(t * 0.2) * 0.12;
    faisceau.material.uniforms.uOpacite.value = 0.2 + Math.sin(t * 0.7) * 0.015;
    renderer.render(scene, camera);
  }
  function boucle(now) {
    raf = 0;
    if (!actif || !visible || document.hidden) return;
    if (now - derniere > 50) { derniere = now; image(now); } // environ 20 images par seconde
    raf = requestAnimationFrame(boucle);
  }
  function relancer() { if (!raf && actif && visible && !document.hidden) raf = requestAnimationFrame(boucle); }
  document.addEventListener('visibilitychange', relancer);
  return {
    monter(el, sec, s) {
      section = sec; sportCourant = s;
      try {
        if (!renderer) construire();
        conteneur = el; el.appendChild(renderer.domElement);
        actif = true;
        sec.classList.remove('sans-3d');
        cadrer();
        if (ro) ro.disconnect();
        ro = new ResizeObserver(cadrer); ro.observe(el);
        if (obs) obs.disconnect();
        obs = new IntersectionObserver((e) => { visible = e[0].isIntersecting; relancer(); }); obs.observe(sec);
        relancer();
      } catch (e) { sec.classList.add('sans-3d'); actif = false; }
    },
    sport(s) { sportCourant = s; if (actif && renderer) { appliquer(s); image(performance.now()); } },
    theme() { if (actif && renderer) { appliquer(sportCourant); image(performance.now()); } },
    arreter() { actif = false; if (raf) cancelAnimationFrame(raf); raf = 0; if (ro) ro.disconnect(); if (obs) obs.disconnect(); },
  };
})();

// ---------- Navigation ----------
// Adresse : #<sport>/<mode> (#football/solo, #nba/cartes…) ou #accueil.
// Anciennes adresses acceptées : #arcade-nba, #propositions-nba, #squad-football, #cartes…
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
  vue.sport = s; vue.poste = null; vue.journee = ''; vue.etoiles = null; vue.creneauOuvert = null; vue.toutVoir = false;
}

function tout(anime = false) {
  const { ecran, sport } = lireAdresse();
  if (sport) changerSport(sport);
  $('chargement').hidden = true;
  for (const v of ['accueil', 'solo', 'squad', 'cartes']) $(`vue-${v}`).hidden = ecran !== v;
  document.body.dataset.sport = vue.sport;
  $('main').dataset.sport = vue.sport;
  if (fiche.ouverte && !parId.has(fiche.ouverte)) fermerFiche();
  rendreNav(ecran);
  afficherPaliers(); afficherStockage();
  if (ecran !== 'accueil') Scene.arreter();
  if (ecran === 'accueil') afficherAccueil(anime);
  else if (ecran === 'cartes') afficherCartes();
  else if (ecran === 'squad') afficherSquad();
  else afficherSolo(vue.sport);
  // Chances de l'autre sport pour la barre latérale (une fois, après le reste).
  for (const s of ['football', 'nba']) if (ecran !== 'accueil' && palierEnCours(s) && !dernieresChances[s]) plusTard(() => propositions(s)).then(() => rendreNav(vueCourante()));
}

// ---------- Événements (délégués) ----------
// Après un nouveau rendu, le focus revient sur la commande équivalente (clavier, lecteur d'écran).
const RERENDUS = new Set(['mode', 'seuil', 'poste', 'etoiles', 'tri-col', 'creneau', 'jour', 'journee', 'tri', 'dispo', 'cocher']);
function refocaliser(a, v) {
  if (!RERENDUS.has(a)) return;
  const sel = v != null ? `#main [data-act="${a}"][data-v="${CSS.escape(v)}"]` : `#main [data-act="${a}"]`;
  plusTard(() => document.querySelector(sel)?.focus({ preventScroll: true }));
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && !b.matches('input, select')) {
    const a = b.dataset.act, v = b.dataset.v;
    if (b.closest('#main')) refocaliser(a, v);
    switch (a) {
      case 'heros-sport': basculerHeros(v); return;
      case 'maj': lancerMaj(); return;
      case 'theme': changerTheme(); return;
      case 'aide': ouvrirAide(); return;
      case 'parametres': WEB?.ouvrirParametres(); return;
      case 'marquer': ouvrirMarquage(b.dataset.sport); return;
      case 'mode': vue.mode = v; afficherSolo(vue.sport); return;
      case 'seuil': etatUtilisateur = { ...etatUtilisateur, seuil: Number(v) }; stockage.enregistrer(etatUtilisateur); tout(); return;
      case 'jouer': jouerEquipe(b.dataset.sport, v.split(',')); return;
      case 'creneau': vue.creneauOuvert = v; afficherCreneaux(vue.sport); return;
      case 'jour': vue.squadJour = v; afficherSquad(); return;
      case 'poste': vue.poste = v || null; afficherCartes(); return;
      case 'etoiles': vue.etoiles = v === '' ? null : Number(v); afficherCartes(); return;
      case 'tri-col': vue.sens = vue.tri === v ? -vue.sens : (CROISSANTS.has(v) ? 1 : -1); vue.tri = v; afficherCartes(); return;
      case 'tout-voir': vue.toutVoir = true; afficherListeCartes(); return;
      case 'fermer-fiche': fermerFiche(); return;
      case 'prec': ficheVoisine(-1); return;
      case 'suiv': ficheVoisine(1); return;
      case 'basculer': basculer(b.dataset.sport, v); fermerFiche(); tout(); return;
      case 'fermer-fenetre': fermerFenetre(); return;
      case 'annuler-toast': { const f = toast.annuler; $('toast').hidden = true; toast.annuler = null; if (f) f(); return; }
      default: break;
    }
  }
  if (e.target === $('voile')) { fermerFenetre(); return; }
  if (e.target === $('voile-fiche')) { fermerFiche(); return; }
  const r = e.target.closest('#main [data-fiche]');
  if (r && !e.target.closest('input, a, button:not([data-fiche])')) ouvrirFiche(r.dataset.fiche);
});
document.addEventListener('change', (e) => {
  const a = e.target.dataset?.act, v = e.target.value;
  if (e.target.closest('#main')) refocaliser(a, e.target.dataset.v);
  if (a === 'journee') { vue.journee = v; afficherCartes(); }
  else if (a === 'tri') { vue.tri = v; vue.sens = CROISSANTS.has(v) ? 1 : -1; afficherCartes(); }
  else if (a === 'dispo') { vue.dispo = e.target.checked; afficherCartes(); }
  else if (a === 'cocher') { basculer(vue.sport, e.target.dataset.v); rendreNav('cartes'); afficherCartes(); }
  else if (a === 'marque') { basculer($('liste-marquage').dataset.sport, e.target.dataset.v); ouvrirMarquage.dessiner?.(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('voile').hidden) { fermerFenetre(); return; }
    if (fiche.ouverte) { fermerFiche(); return; }
  }
  if (e.key === 'Tab' && !$('voile').hidden) { pieger(e, $('voile').querySelector('.fenetre')); return; }
  if (e.key === 'Tab' && fiche.ouverte && !largePC()) { pieger(e, $('volet')); return; }
  const r = e.target.closest?.('[data-fiche][role="button"]');
  if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ouvrirFiche(r.dataset.fiche); return; }
  if (fiche.ouverte && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest?.('#volet')) { e.preventDefault(); ficheVoisine(e.key === 'ArrowDown' ? 1 : -1); }
});
// Un repli qui s'ouvre (variantes, autres choix) : ses graphiques prennent leur largeur.
document.addEventListener('toggle', (e) => { if (e.target.open) dessiner(e.target); }, true);
window.addEventListener('hashchange', () => { fermerFiche(); window.scrollTo(0, 0); tout(lireAdresse().ecran === 'accueil'); });
let largeurPrec = innerWidth, minuterieRedim = null;
window.addEventListener('resize', () => {
  clearTimeout(minuterieRedim);
  minuterieRedim = setTimeout(() => {
    const palier = (w) => (w >= 1800) + (w >= 1024);
    if (palier(innerWidth) !== palier(largeurPrec)) { if (fiche.ouverte) fermerFiche(); tout(); } else dessiner();
    largeurPrec = innerWidth;
  }, 150);
});

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
  if (enCours) { pourcent = Math.max(5, e.pourcent ?? 5); texte = `${e.etape ?? 'Mise à jour…'} (${pourcent}${nbsp}%)`; }
  else if (demandeMaj) {
    const s = (maintenant - demandeMaj.t) / 1000;
    pourcent = Math.min(8, 2 + s / 10); // en attendant que la session démarre et écrive
    texte = demandeMaj.message ?? `Demandé à ${fHeure.format(new Date(demandeMaj.t))} : la mise à jour démarre (environ 2 min)…`;
  } else if (finie) { pourcent = 100; texte = `Nouvelles données publiées (${fHeure.format(new Date(e.donneesDe))}).`; classe = 'ok'; }
  else if (erreurRecente || (e?.statut === 'erreur' && !demandeMaj && maintenant - Date.parse(e.fin) < 30 * 60000)) { texte = `La mise à jour a échoué : ${e.erreur ?? 'raison inconnue'}.`; classe = 'erreur'; }
  else if (bloquee) { texte = 'La dernière mise à jour semble bloquée. Tu peux la relancer.'; classe = 'erreur'; }
  if (messageMaj && !enCours) { texte = messageMaj; classe = 'erreur'; pourcent = null; }
  const occupe = enCours || Boolean(demandeMaj);
  const a = ageDonnees();
  const progression = texte ? `${pourcent != null ? `<div class="jauge-maj" aria-hidden="true"><i style="width:${pourcent}%"></i></div>` : ''}<span class="texte-maj">${esc(texte)}</span>${finie ? '<button type="button" class="btn principal" data-act="recharger">Afficher les nouvelles données</button>' : ''}` : '';
  // Barre latérale (PC) : âge des données, puis progression.
  const zone = $('zone-maj');
  if (zone) {
    const html = `<span class="${a.vieux ? 'attention-txt' : 'doux'}">Données Sorare de ${fHeure.format(a.t)} · ${a.long}</span>${progression}`;
    if (zone.dataset.html !== html) { zone.innerHTML = html; zone.dataset.html = html; }
    zone.className = `zone-maj ${classe}`;
    zone.setAttribute('role', 'status');
  }
  // Téléphone : sous la barre du haut.
  const ph = $('progression-haut');
  ph.hidden = !texte;
  const htmlHaut = `<div class="zone-maj ${classe}">${progression}</div>`;
  if (texte && ph.dataset.html !== htmlHaut) { ph.innerHTML = htmlHaut; ph.dataset.html = htmlHaut; }
  for (const b of document.querySelectorAll('[data-act="maj"]')) {
    b.disabled = occupe || Boolean(majIndisponible);
    b.classList.toggle('tourne', occupe);
    b.title = majIndisponible ?? (occupe ? 'Mise à jour en cours' : `Mettre à jour les données (${a.long})`);
    const age = b.querySelector('.age');
    if (age) { age.textContent = occupe && pourcent != null ? `${Math.round(pourcent)}${nbsp}%` : a.court; age.classList.toggle('vieux', a.vieux); }
  }
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
  if (majIndisponible) { toast(majIndisponible); return; }
  if (WEB) {
    // Version web : la récupération tourne ici, dans le navigateur, par le relais (web/web.js).
    if (etatMaj?.statut === 'en_cours') return;
    etatMaj = { statut: 'en_cours', pourcent: 2, etape: 'Mise à jour…', debut: new Date().toISOString() };
    afficherMaj();
    try {
      const donneesDe = await WEB.actualiser(({ pourcent, texte }) => { etatMaj = { ...etatMaj, pourcent: Math.round(pourcent), etape: texte }; afficherMaj(); });
      etatMaj = { statut: 'termine', donneesDe, fin: new Date().toISOString() };
    } catch (err) {
      etatMaj = { statut: 'erreur', erreur: err.message, fin: new Date().toISOString() };
      messageMaj = `La mise à jour a échoué : ${err.message}`;
    }
    afficherMaj();
    return;
  }
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
  document.addEventListener('click', (e) => { if (e.target.closest('[data-act="recharger"]')) location.reload(); });
  afficherMaj();
  setInterval(afficherMaj, 2000);
  if (WEB) return; // version web : ↻ relance la récupération dans le navigateur
  const [mcp, db] = await Promise.all([window.claude?.use?.('mcp') ?? null, window.claude?.use?.('db') ?? null]);
  if (!mcp) {
    majIndisponible = horsClaude ? 'Page autonome : pour actualiser, relance « npm run recuperer » puis « npm run app ».' : 'Mise à jour indisponible ici : écris « actualise » à Claude.';
    afficherMaj();
  } else {
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

// ---------- Mode sombre ----------
// Par défaut, celui du système ; le bouton force clair ou sombre, retenu dans ce navigateur (simple confort).
const CLE_THEME = 'sorare-aide-theme';
function themeActuel() { return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
function changerTheme() {
  const t = themeActuel() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(CLE_THEME, t); } catch (e) { /* stockage refusé : le choix vaut pour cette visite */ }
  rendreNav(vueCourante());
  Scene.theme();
  // le focus reste sur le bouton thème de la zone visible
  document.querySelector(largePC() ? '#laterale [data-act="theme"]' : '#haut [data-act="theme"]')?.focus({ preventScroll: true });
}
try { const t = localStorage.getItem(CLE_THEME); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { /* stockage refusé */ }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { rendreNav(vueCourante()); Scene.theme(); });

// ---------- Démarrage ----------
brancherMaj();
afficherAge();
setInterval(afficherAge, 60000);
let premier = true;
stockage.brancher((v) => { etatUtilisateur = { ...etatVide(), ...v }; tout(premier && lireAdresse().ecran === 'accueil'); premier = false; });
