// Version web autonome (docs/version-independante-cloudflare.md) : tout se passe dans le navigateur.
// 1. Paramètres : clé API Sorare et nom de manager, gardés dans CE navigateur (localStorage).
// 2. Initialisation : cartes, joueurs et 40 derniers matchs de chaque joueur, par le relais
//    en lecture seule /graphql (functions/graphql.js) ; chaque joueur est enregistré tout de suite
//    dans IndexedDB : une initialisation interrompue reprend là où elle s'est arrêtée.
// 3. L'appli habituelle (app/app.js) lit les données préparées ici ; ↻ relance une actualisation
//    incrémentale (une vingtaine de requêtes).
// Historique : IndexedDB (stockage « persistant » demandé au navigateur) + sauvegarde / restauration
// dans un fichier, pour changer d'appareil ou se prémunir d'un effacement (Safari : 7 jours sans visite).
import { creerAppel } from '../src/recuperation/appel.js';
import { recupererTout } from '../src/recuperation/coeur.js';
import { lireBlessuresNba } from '../src/recuperation/espn.js';
import { CARTES } from '../src/recuperation/requetes.js';
import { parametresDepuisMethode } from '../src/moteur/parametres.js';
import { preparerDonneesApp, reglesDuMoteur } from '../src/app-donnees.js';

const CLE_PARAMS = 'sorare-aide-web-parametres';
const CLE_ETAT_APP = 'sorare-aide-etat'; // cartes jouées et seuil (app/app.js)
const RELAIS = new URL('graphql', document.baseURI).href;
const SPORTS = ['football', 'nba'];
const NOMS = { football: 'Football', nba: 'NBA' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nbsp = ' ';

// ---------- Paramètres ----------
const lireParams = () => { try { return JSON.parse(localStorage.getItem(CLE_PARAMS) || 'null'); } catch { return null; } };
const ecrireParams = (p) => localStorage.setItem(CLE_PARAMS, JSON.stringify(p));

// ---------- IndexedDB ----------
// archives : clé « sport/joueurId » → { joueurId, misAJour, dernierHistoriqueComplet, matchs }
// donnees  : clé « dernier » → dernière récupération complète { meta, cartes, joueurs, matchs, paliers }
let base = null;
function ouvrirBase() {
  if (base) return base;
  base = new Promise((ok, ko) => {
    const r = indexedDB.open('sorare-aide', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('archives'); r.result.createObjectStore('donnees'); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(new Error(`Stockage du navigateur indisponible (${r.error?.message ?? 'IndexedDB'})`));
  });
  return base;
}
async function operation(store, mode, faire) {
  const db = await ouvrirBase();
  return new Promise((ok, ko) => {
    const t = db.transaction(store, mode);
    const r = faire(t.objectStore(store));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error ?? new Error('Écriture annulée (espace de stockage plein ?)'));
  });
}
const lireCle = (store, cle) => operation(store, 'readonly', (s) => s.get(cle));
const ecrireCle = (store, cle, v) => operation(store, 'readwrite', (s) => s.put(v, cle));
const toutLire = async (store) => {
  const [cles, valeurs] = await Promise.all([operation(store, 'readonly', (s) => s.getAllKeys()), operation(store, 'readonly', (s) => s.getAll())]);
  return cles.map((k, i) => [k, valeurs[i]]);
};
const vider = (store) => operation(store, 'readwrite', (s) => s.clear());

const magasin = {
  lire: async (sport, id) => (await lireCle('archives', `${sport}/${id}`)) ?? null,
  async ecrire(sport, id, matchs, { complet = false } = {}) {
    const ancien = await magasin.lire(sport, id);
    if (ancien && !complet && JSON.stringify(ancien.matchs) === JSON.stringify(matchs)) return false;
    const maintenant = new Date().toISOString();
    await ecrireCle('archives', `${sport}/${id}`, { joueurId: id, misAJour: maintenant, dernierHistoriqueComplet: complet ? maintenant : ancien?.dernierHistoriqueComplet ?? null, matchs });
    return true;
  },
};

// ---------- Méthode et règles (fichiers du site, jamais recopiées) ----------
let entrees = null;
async function chargerEntrees() {
  if (entrees) return entrees;
  const texte = async (f) => { const r = await fetch(f); if (!r.ok) throw new Error(`${f} introuvable (${r.status})`); return r.text(); };
  const json = async (f) => JSON.parse(await texte(f));
  const [methode, football, nba, bonus, squad] = await Promise.all([texte('methode.md'), json('regles/football-arcade-solo.json'),
    json('regles/nba-arcade-solo.json'), json('regles/bonus-collections.json'), json('regles/squad.json')]);
  entrees = { P: parametresDepuisMethode(methode), regles: reglesDuMoteur(football, nba), tableBonus: bonus.bonus_pct, journees: squad.journee_de_jeu };
  return entrees;
}

// ---------- Récupération ----------
const appelAvec = (cle, signal) => creerAppel({ url: RELAIS, entetes: { 'X-Sorare-Cle': cle }, signal });

// Message clair pour les erreurs connues.
function messageErreur(e, slug) {
  const m = e?.message ?? String(e);
  if (/max complexity|Using an APIKEY|Clé API Sorare manquante/i.test(m) || e?.status === 401) return 'clé API refusée par Sorare : vérifie-la dans les paramètres.';
  if (/not found/i.test(m) && /User/i.test(m)) return `manager « ${slug} » introuvable sur Sorare.`;
  if (e?.status === 429) return 'Sorare limite le nombre de requêtes : réessaie dans quelques minutes.';
  if (/Réseau|Failed to fetch|NetworkError|Load failed/i.test(m)) return 'pas de réponse (connexion internet ou relais indisponible).';
  if (/Origine refusée/.test(m)) return 'le relais refuse cette page (adresse différente du site).';
  return m;
}

// Avancement global : chaque sport pèse pareil ; dans un sport, cartes 15 %, historique 80 %, le reste 5 %.
function suiviGlobal(sports, rappel) {
  const debut = Date.now();
  return (ev) => {
    const i = sports.indexOf(ev.sport);
    const part = ev.total ? ev.fait / ev.total : 1;
    const dans = { paliers: 0.01, cartes: 0.01 + 0.14 * part, compositions: 0.15 + 0.03 * part, historique: 0.18 + 0.8 * part, espn: 0.99 }[ev.etape] ?? 0;
    const pourcent = Math.min(99, ((i + dans) / sports.length) * 100);
    let reste = null;
    if (ev.etape === 'historique' && ev.total - ev.fait > 20) reste = Math.ceil(((ev.total - ev.fait) * 0.4 + (sports.length - 1 - i) * 30) / 60);
    rappel({ pourcent, texte: `${NOMS[ev.sport]} · ${ev.texte}`, reste, ecouleS: (Date.now() - debut) / 1000, ev });
  };
}

let enCours = null;
async function recuperer({ sports, rappel, signal }) {
  if (enCours) throw new Error('une récupération est déjà en cours');
  const p = lireParams();
  if (!p?.cle || !p?.slug) throw new Error('paramètres incomplets');
  const { P, tableBonus } = await chargerEntrees();
  const precedent = (await lireCle('donnees', 'dernier')) ?? null;
  const appel = appelAvec(p.cle, signal);
  enCours = (async () => {
    let verrou = null;
    try { verrou = await navigator.wakeLock?.request('screen'); } catch { /* écran : pas de verrou possible */ }
    try {
      const d = await recupererTout(p.slug, sports, { appel, magasin, P, tableBonus, lireEspn: lireBlessuresNba, suivi: suiviGlobal(sports, rappel), signal }, {}, precedent);
      await ecrireCle('donnees', 'dernier', d);
      return d;
    } catch (e) {
      throw new Error(messageErreur(e, p.slug));
    } finally {
      verrou?.release?.().catch(() => {});
      enCours = null;
    }
  })();
  return enCours;
}

// ---------- Sauvegarde et restauration ----------
async function sauvegarder() {
  const contenu = { type: 'sorare-aide-sauvegarde', version: 1, creeeA: new Date().toISOString(),
    slug: lireParams()?.slug ?? null, donnees: await lireCle('donnees', 'dernier'), archives: await toutLire('archives'),
    etat: (() => { try { return JSON.parse(localStorage.getItem(CLE_ETAT_APP) || 'null'); } catch { return null; } })() };
  let blob = new Blob([JSON.stringify(contenu)], { type: 'application/json' });
  let nom = `sorare-aide-${contenu.slug ?? 'sauvegarde'}-${contenu.creeeA.slice(0, 10)}.json`;
  if (typeof CompressionStream === 'function') {
    blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    nom += '.gz';
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return { nom, octets: blob.size, joueurs: contenu.archives.length };
}

async function restaurer(fichier) {
  let flux = fichier.stream();
  const tete = new Uint8Array(await fichier.slice(0, 2).arrayBuffer());
  if (tete[0] === 0x1f && tete[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') throw new Error('ce navigateur ne sait pas lire un fichier compressé');
    flux = flux.pipeThrough(new DecompressionStream('gzip'));
  }
  const c = JSON.parse(await new Response(flux).text());
  if (c?.type !== 'sorare-aide-sauvegarde' || !Array.isArray(c.archives)) throw new Error("ce fichier n'est pas une sauvegarde de Sorar'help");
  await vider('archives');
  const db = await ouvrirBase();
  await new Promise((ok, ko) => {
    const t = db.transaction('archives', 'readwrite');
    const s = t.objectStore('archives');
    for (const [k, v] of c.archives) s.put(v, k);
    t.oncomplete = ok; t.onerror = () => ko(t.error); t.onabort = () => ko(t.error ?? new Error('restauration annulée'));
  });
  if (c.donnees) await ecrireCle('donnees', 'dernier', c.donnees);
  if (c.etat) localStorage.setItem(CLE_ETAT_APP, JSON.stringify(c.etat));
  const p = lireParams();
  if (c.slug && (!p || !p.slug)) ecrireParams({ ...(p ?? {}), slug: c.slug });
  return { joueurs: c.archives.length, slug: c.slug, du: c.creeeA };
}

async function infosStockage() {
  const n = (await operation('archives', 'readonly', (s) => s.count())) ?? 0;
  const d = await lireCle('donnees', 'dernier');
  let persistant = null, utilise = null;
  try { persistant = await navigator.storage?.persisted?.(); utilise = (await navigator.storage?.estimate?.())?.usage ?? null; } catch { /* inconnu */ }
  return { joueurs: n, donneesDe: d?.meta?.recupereA ?? null, slug: d?.meta?.slug ?? null, persistant, utilise };
}

// ---------- Écrans (paramètres, initialisation) : maquette « Projecteur » retenue le 2026-11-14 ----------
// Téléphone : bandeau nuit en haut, carte dessous (sans chevauchement). PC (≥ 1 024 px) : deux colonnes.
const LOGO_GRAND = (taille) => `<svg class="w-logo" width="${taille}" height="${taille}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#e7ebef"/><path d="M11 50V42H21V34H31V26H41V50Z" fill="#0d1115"/><rect x="43" y="14" width="10" height="36" rx="1.5" fill="#c99a1e"/></svg>`;
const NOM = 'Sorar<span class="w-apo">\'</span>help';
const style = document.createElement('style');
style.textContent = `
.web-ecran { position: fixed; inset: 0; z-index: 60; overflow: auto; background: var(--fond); color: var(--encre); font: 400 15px/1.45 var(--f-texte); }
.web-ecran[hidden] { display: none; }
.w-cadre { min-height: 100%; display: flex; flex-direction: column; }
.w-heros { position: relative; background: radial-gradient(ellipse 60% 85% at 50% 0%, rgb(229 194 90 / .30), rgb(13 17 21 / 0) 70%), #0d1115; color: #e7ebef;
  display: flex; flex-direction: column; align-items: center; justify-content: flex-end; text-align: center; gap: 12px;
  padding: max(48px, env(safe-area-inset-top)) 24px 28px; min-height: 260px; box-sizing: border-box; }
.w-nom { font: 800 34px/1 var(--f-titre); letter-spacing: -.02em; color: #e7ebef; }
.w-apo { color: #e5c25a; }
.w-slogan { margin: 0; font-size: 15px; line-height: 1.45; color: #a1acb8; max-width: 520px; }
.w-marque { position: absolute; top: max(16px, env(safe-area-inset-top)); left: 16px; display: flex; align-items: center; gap: 8px; font: 800 17px/1 var(--f-titre); }
.w-pct { font: 800 76px/1 var(--f-titre); letter-spacing: -.03em; color: #fff; }
.w-pct small { font-size: .47em; }
.w-reste { margin: 0; font-weight: 600; color: #e5c25a; min-height: 1.4em; }
.w-barre { width: min(240px, 80%); height: 6px; border-radius: 99px; background: #29313a; overflow: hidden; margin-top: 8px; }
.w-barre i { display: block; height: 100%; width: 0; background: #e5c25a; transition: width .4s; }
.w-panneau { flex: 1; display: flex; justify-content: center; padding: 16px 16px 32px; box-sizing: border-box; }
.w-colonne { width: 100%; max-width: 460px; display: grid; gap: 16px; align-content: start; }
.w-bloc { background: var(--surface); border: 1px solid var(--trait); border-radius: 8px; padding: 20px; display: grid; gap: 14px; box-shadow: var(--ombre); }
.w-bloc.plat { box-shadow: none; }
.w-bloc h1 { margin: 0; font: 800 20px/1.2 var(--f-titre); }
.w-bloc h2 { margin: 0; font: 700 17px/1.2 var(--f-titre); }
.w-bloc p { margin: 0; }
.w-champ { display: grid; gap: 6px; }
.w-champ label, .w-champ legend { font-weight: 600; font-size: 14px; }
.w-champ input[type=text], .w-champ input[type=password] { font: 400 16px/1.2 var(--f-texte); padding: 12px; border: 1px solid var(--trait-fort); border-radius: 8px;
  background: var(--surface); color: var(--encre); width: 100%; box-sizing: border-box; }
.w-champ input:focus-visible { outline: 2px solid var(--encre); outline-offset: 1px; }
.w-doux { color: var(--doux); font-size: 13px; line-height: 1.4; }
.w-puces { display: flex; gap: 8px; flex-wrap: wrap; }
.w-puce { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 99px; border: 1px solid var(--trait-fort); font-weight: 600; cursor: pointer; color: var(--doux); }
.w-puce input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.w-puce svg { width: 18px; height: 18px; }
.w-puce:has(input:checked) { border-color: currentColor; }
.w-puce.foot:has(input:checked) { color: var(--foot); }
.w-puce.nba:has(input:checked) { color: var(--nba); }
.w-puce .coche { visibility: hidden; }
.w-puce:has(input:checked) .coche { visibility: visible; }
.w-puce:has(input:focus-visible) { outline: 2px solid var(--encre); outline-offset: 2px; }
.w-large { width: 100%; justify-content: center; padding: 15px 16px; font-size: 16px; font-weight: 700; }
.w-lien { background: none; border: 0; padding: 4px; font: 600 14px/1.2 var(--f-texte); color: var(--info); cursor: pointer; justify-self: center; text-decoration: underline; text-underline-offset: 3px; }
.w-ligne { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.w-msg { padding: 10px 12px; border-radius: 8px; font-size: 14px; }
.w-msg:empty { display: none; }
.w-msg.ok { background: var(--ok-doux); } .w-msg.erreur { background: var(--stop-doux); } .w-msg.info { background: var(--info-doux); color: var(--info); }
.w-pied { margin: 0; text-align: center; color: var(--doux); font-size: 13px; }
.w-etapes { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.w-etapes li { display: flex; gap: 12px; align-items: flex-start; }
.w-pt { width: 22px; height: 22px; border-radius: 99px; flex: none; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font: 700 12px/1 var(--f-texte); margin-top: 1px; }
.w-pt.e-fait { background: var(--ok-doux); color: var(--ok); }
.w-pt.e-cours { border: 3px solid var(--encre); }
.w-pt.e-attente { border: 2px solid var(--trait-fort); }
.w-etapes li.e-attente .w-et-nom { color: var(--doux); }
.w-et-det { color: var(--doux); font-size: 13px; }
.w-et-barre { height: 4px; border-radius: 99px; background: var(--trait); overflow: hidden; margin-top: 6px; }
.w-et-barre i { display: block; height: 100%; background: var(--sport, var(--encre)); transition: width .4s; }
@media (min-width: 1024px) {
  .w-cadre { flex-direction: row; height: 100%; }
  .w-heros { flex: 1.15; justify-content: center; align-items: flex-start; text-align: left; padding: 0 96px; gap: 22px; }
  .w-heros.centre { align-items: center; text-align: center; }
  .w-marque { top: 32px; left: 40px; font-size: 22px; }
  .w-nom { font-size: 72px; letter-spacing: -.03em; }
  .w-slogan { font-size: 21px; }
  .w-pct { font-size: 168px; letter-spacing: -.04em; }
  .w-reste { font-size: 20px; }
  .w-barre { width: 420px; height: 8px; }
  .w-panneau { flex: 1; align-items: center; overflow: auto; padding: 48px; }
  .w-bloc { padding: 32px; }
  .w-bloc h1 { font-size: 26px; }
}
`;
document.head.append(style);
const ecran = Object.assign(document.createElement('div'), { className: 'web-ecran', hidden: true });
ecran.setAttribute('role', 'dialog');
ecran.setAttribute('aria-modal', 'true');
ecran.setAttribute('aria-label', "Sorar'help");
document.body.append(ecran);
const montrer = (heros, panneau, { centre = false } = {}) => {
  ecran.innerHTML = `<div class="w-cadre"><section class="w-heros${centre ? ' centre' : ''}">${heros}</section><section class="w-panneau"><div class="w-colonne">${panneau}</div></section></div>`;
  ecran.hidden = false; ecran.scrollTop = 0;
};
const cacher = () => { ecran.hidden = true; ecran.innerHTML = ''; };
const date = (iso) => (iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—');
const mo = (n) => (n == null ? '?' : `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1).replace('.', ',')}${nbsp}Mo`);
const BALLON = {
  football: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M12 8L8.3 10.8 9.7 15.2h4.6l1.4-4.4z"/></svg>',
  nba: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20M5 5.2C7.2 7 8.2 9.4 8.2 12S7.2 17 5 18.8M19 5.2C16.8 7 15.8 9.4 15.8 12S16.8 17 19 18.8"/></g></svg>',
};
const herosAccueil = (sousTitre) => `${LOGO_GRAND(76)}<div class="w-nom">${NOM}</div>
  <p class="w-slogan">${sousTitre ?? 'L’équipe à jouer pour passer ton palier Arcade, et la meilleure équipe Squad du jour. Football et NBA.'}</p>`;

/** Écran des paramètres. @param premier vrai à la première visite (bienvenue, pas de bouton Fermer). */
async function ecranParametres({ premier = false, message = null } = {}) {
  const p = lireParams() ?? { sports: SPORTS };
  const info = await infosStockage().catch(() => null);
  montrer(herosAccueil(premier ? null : 'Paramètres : ton compte, tes sports, tes données.'), `
    ${message ? `<p class="w-msg ${message.classe}">${esc(message.texte)}</p>` : ''}
    <form class="w-bloc" id="web-form">
      <h1>Ton compte Sorare</h1>
      <div class="w-champ"><label for="web-slug">Nom de manager</label>
        <input type="text" id="web-slug" autocomplete="username" autocapitalize="off" spellcheck="false" required value="${esc(p.slug ?? '')}" placeholder="ex. yapapir">
        <span class="w-doux">Celui de l’adresse de ton profil : sorare.com/…/my-club/<b>nom</b>.</span></div>
      <div class="w-champ"><label for="web-cle">Clé API</label>
        <input type="password" id="web-cle" autocomplete="off" spellcheck="false" required value="${esc(p.cle ?? '')}">
        <span class="w-doux">Réglages Sorare › API Keys › Créer une API key. Elle reste sur cet appareil et ne fait que traverser le relais du site.</span></div>
      <fieldset class="w-champ" style="border:0;padding:0;margin:0"><legend>Sports</legend>
        <div class="w-puces">${SPORTS.map((s) => `<label class="w-puce ${s === 'football' ? 'foot' : 'nba'}"><input type="checkbox" name="sport" value="${s}" ${(p.sports ?? SPORTS).includes(s) ? 'checked' : ''}>${BALLON[s]}${NOMS[s]}<span class="coche" aria-hidden="true">✓</span></label>`).join('')}</div></fieldset>
      <p id="web-test" class="w-msg" role="status"></p>
      <button type="submit" class="btn principal w-large">${premier ? 'Charger mes cartes' : 'Enregistrer'}</button>
      <div class="w-ligne" style="justify-content:center">
        <button type="button" class="w-lien" id="web-tester">Tester la clé</button>
        ${premier ? '<label class="w-lien" for="web-fichier">J’ai déjà une sauvegarde</label>' : '<button type="button" class="w-lien" id="web-fermer">Fermer</button>'}
      </div>
    </form>
    <div class="w-bloc plat" ${premier ? 'hidden' : ''}>
      <h2>Tes données</h2>
      <p>${info?.joueurs ? `Historique de <b>${info.joueurs}</b> joueurs${info.slug ? ` (manager ${esc(info.slug)})` : ''}, données du ${date(info.donneesDe)}${info.utilise ? `, ${mo(info.utilise)} utilisés` : ''}.` : 'Aucune donnée pour l’instant.'}</p>
      <p class="w-doux">${info?.persistant ? 'Stockage persistant accordé par le navigateur.' : 'Le navigateur peut effacer ces données (Safari : après 7 jours sans visite, sauf si le site est ajouté à l’écran d’accueil). Garde une sauvegarde.'}</p>
      <div class="w-ligne">
        <button type="button" class="btn" id="web-sauver" ${info?.joueurs ? '' : 'disabled'}>Sauvegarder dans un fichier</button>
        <label class="btn" for="web-fichier" style="cursor:pointer">Restaurer une sauvegarde</label>
      </div>
    </div>
    <input type="file" id="web-fichier" accept=".json,.gz,application/json,application/gzip" hidden>
    <p id="web-donnees-msg" class="w-msg" role="status"></p>
    ${premier ? '' : `<div class="w-bloc plat"><h2>Oublier</h2>
      <p class="w-doux">Efface la clé, ou bien la clé et toutes les données de ce navigateur.</p>
      <div class="w-ligne"><button type="button" class="btn" id="web-oublier-cle">Oublier ma clé</button>
      <button type="button" class="btn" id="web-tout-effacer">Tout effacer</button></div></div>`}
    <p class="w-pied">Lecture seule : aucune action sur le marché.</p>
  `);
  const lireForm = () => ({ slug: ecran.querySelector('#web-slug').value.trim(), cle: ecran.querySelector('#web-cle').value.trim(),
    sports: [...ecran.querySelectorAll('input[name=sport]:checked')].map((x) => x.value) });
  const test = ecran.querySelector('#web-test');
  const dire = (el, classe, texte) => { el.className = `w-msg ${classe}`; el.textContent = texte; };
  ecran.querySelector('#web-tester').onclick = async () => {
    const f = lireForm();
    if (!f.slug || !f.cle) { dire(test, 'erreur', 'Renseigne le nom de manager et la clé.'); return; }
    dire(test, 'info', 'Test en cours…');
    try {
      const appel = appelAvec(f.cle);
      const res = [];
      for (const s of f.sports.length ? f.sports : SPORTS) {
        const d = await appel(CARTES, { slug: f.slug, sport: s.toUpperCase(), first: 50, after: null });
        res.push(`${d.user.cards.totalCount} cartes ${NOMS[s]}`);
      }
      dire(test, 'ok', `Clé et manager reconnus : ${res.join(', ')}.`);
    } catch (e) { dire(test, 'erreur', `Échec : ${messageErreur(e, f.slug)}`); }
  };
  ecran.querySelector('#web-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = lireForm();
    if (!f.sports.length) { dire(test, 'erreur', 'Choisis au moins un sport.'); return; }
    const ancien = lireParams();
    ecrireParams(f);
    const d = await lireCle('donnees', 'dernier').catch(() => null);
    const aRefaire = !d || d.meta?.slug !== f.slug || f.sports.some((s) => !d.meta?.recupereParSport?.[s]);
    if (aRefaire) { await ecranInitialisation(); return; }
    if (ancien?.slug === f.slug && !premier) { cacher(); if (window.SORARE_WEB) location.reload(); return; }
    await demarrerAppli();
  };
  ecran.querySelector('#web-fermer')?.addEventListener('click', cacher);
  const msg = ecran.querySelector('#web-donnees-msg');
  ecran.querySelector('#web-sauver').onclick = async () => {
    dire(msg, 'info', 'Préparation du fichier…');
    try { const r = await sauvegarder(); dire(msg, 'ok', `Fichier ${r.nom} (${mo(r.octets)}, ${r.joueurs} joueurs) enregistré dans tes téléchargements.`); }
    catch (e) { dire(msg, 'erreur', `Sauvegarde impossible : ${e.message}`); }
  };
  ecran.querySelector('#web-fichier').onchange = async (ev) => {
    const f = ev.target.files?.[0]; if (!f) return;
    dire(msg, 'info', 'Restauration…');
    try {
      const r = await restaurer(f);
      dire(msg, 'ok', `Restauré : ${r.joueurs} joueurs${r.slug ? ` (manager ${r.slug})` : ''}, sauvegarde du ${date(r.du)}. Saisis ta clé puis valide.`);
      if (r.slug) ecran.querySelector('#web-slug').value = r.slug;
      ecran.querySelector('#web-cle').focus();
    } catch (e) { dire(msg, 'erreur', `Restauration impossible : ${e.message}`); }
  };
  ecran.querySelector('#web-oublier-cle')?.addEventListener('click', () => {
    ecrireParams({ ...(lireParams() ?? {}), cle: '' });
    ecran.querySelector('#web-cle').value = '';
    dire(test, 'ok', 'Clé effacée de ce navigateur.');
  });
  ecran.querySelector('#web-tout-effacer')?.addEventListener('click', async () => {
    if (!confirm('Effacer la clé, l’historique des joueurs et les cartes jouées de ce navigateur ?')) return;
    localStorage.removeItem(CLE_PARAMS); localStorage.removeItem(CLE_ETAT_APP);
    await vider('archives'); await vider('donnees');
    location.reload();
  });
  (ecran.querySelector('#web-slug').value ? ecran.querySelector('#web-cle') : ecran.querySelector('#web-slug')).focus({ preventScroll: true });
}

/** Initialisation (ou reprise) : récupération complète des sports choisis, avec la liste des étapes. */
async function ecranInitialisation() {
  const p = lireParams();
  const info = await infosStockage().catch(() => null);
  const reprise = info?.joueurs > 0;
  const etapes = [];
  for (const s of p.sports) {
    etapes.push({ id: `${s}-cartes`, nom: `Paliers et cartes ${NOMS[s]}`, sport: s });
    etapes.push({ id: `${s}-historique`, nom: `Historique des joueurs ${NOMS[s]}`, sport: s, barre: true });
    if (s === 'nba') etapes.push({ id: 'nba-espn', nom: 'Blessures annoncées (ESPN)', sport: s });
  }
  montrer(`<div class="w-marque">${LOGO_GRAND(28)}<span>${NOM}</span></div>
      <div class="w-pct" id="web-pct">0<small>${nbsp}%</small></div>
      <p class="w-reste" id="web-reste">Démarrage…</p>
      <div class="w-barre" aria-hidden="true"><i id="web-barre"></i></div>`, `
    <div class="w-bloc">
      <h1>${reprise ? 'Mise à jour de tes cartes' : 'Chargement de tes cartes'}</h1>
      <p class="w-doux">Manager ${esc(p.slug)}. ${reprise ? `${info.joueurs} joueurs déjà enregistrés : seuls les manquants sont chargés.` : 'Une seule fois : ensuite, une mise à jour prend moins d’une minute.'}</p>
      <ol class="w-etapes" id="web-etapes">${etapes.map((e) => `<li id="et-${e.id}" class="e-attente" data-sport="${e.sport}"><span class="w-pt e-attente"></span><div style="flex:1"><div class="w-et-nom">${e.nom}</div><div class="w-et-det"></div>${e.barre ? '<div class="w-et-barre" hidden><i style="width:0"></i></div>' : ''}</div></li>`).join('')}</ol>
    </div>
    <p class="w-msg info" id="web-etape" role="status">Garde l’écran allumé. Si la page se ferme, le chargement reprendra là où il s’est arrêté.</p>
    <div class="w-ligne" style="justify-content:center"><button type="button" class="btn" id="web-arreter">Interrompre</button>
      <button type="button" class="w-lien" id="web-params">Paramètres</button></div>`, { centre: true });
  try { await navigator.storage?.persist?.(); } catch { /* refusé : sauvegarde conseillée */ }
  const ctrl = new AbortController();
  ecran.querySelector('#web-arreter').onclick = () => ctrl.abort();
  ecran.querySelector('#web-params').onclick = () => { ctrl.abort(); ecranParametres({ premier: !info?.donneesDe }); };
  const pct = ecran.querySelector('#web-pct'), barre = ecran.querySelector('#web-barre'), reste = ecran.querySelector('#web-reste'), etape = ecran.querySelector('#web-etape');
  const ordre = etapes.map((e) => e.id);
  const marquer = (id, etat, detail, part) => {
    const li = ecran.querySelector(`#et-${id}`); if (!li) return;
    // les étapes précédentes sont faites
    for (const autre of ordre.slice(0, ordre.indexOf(id))) {
      const l = ecran.querySelector(`#et-${autre}`);
      if (l && l.className !== 'e-fait') { l.className = 'e-fait'; l.querySelector('.w-pt').className = 'w-pt e-fait'; l.querySelector('.w-pt').textContent = '✓'; l.querySelector('.w-et-barre')?.setAttribute('hidden', ''); }
    }
    li.className = `e-${etat}`; const pt = li.querySelector('.w-pt'); pt.className = `w-pt e-${etat}`; pt.textContent = etat === 'fait' ? '✓' : '';
    if (detail != null) li.querySelector('.w-et-det').textContent = detail;
    const b = li.querySelector('.w-et-barre');
    if (b && part != null) { b.hidden = etat === 'fait'; b.firstElementChild.style.width = `${Math.round(part * 100)}%`; }
  };
  try {
    await recuperer({ sports: p.sports, signal: ctrl.signal, rappel: ({ pourcent, reste: min, ev }) => {
      pct.innerHTML = `${Math.floor(pourcent)}<small>${nbsp}%</small>`; barre.style.width = `${pourcent}%`;
      reste.textContent = min ? `encore environ ${min}${nbsp}min` : 'calcul du temps restant…';
      if (!ev) return;
      if (ev.etape === 'paliers' || ev.etape === 'cartes' || ev.etape === 'compositions') marquer(`${ev.sport}-cartes`, 'cours', ev.etape === 'cartes' ? `page ${ev.fait} sur ${ev.total}` : ev.etape === 'compositions' ? 'compositions officielles des matchs proches' : 'paliers lus');
      else if (ev.etape === 'historique') marquer(`${ev.sport}-historique`, ev.total && ev.fait >= ev.total ? 'fait' : 'cours', ev.total ? `${ev.fait} sur ${ev.total} joueurs à compléter` : 'déjà à jour', ev.total ? ev.fait / ev.total : 1);
      else if (ev.etape === 'espn') marquer('nba-espn', 'fait', ev.texte.replace(/^ESPN : /, ''));
    } });
    for (const id of ordre) marquer(id, 'fait');
    pct.innerHTML = `100<small>${nbsp}%</small>`; barre.style.width = '100%'; reste.textContent = 'terminé';
    await demarrerAppli();
  } catch (e) {
    const relancer = (texte) => { const b = ecran.querySelector('#web-arreter'); b.textContent = texte; b.onclick = ecranInitialisation; };
    if (ctrl.signal.aborted) {
      if (!ecran.querySelector('#web-form')) { etape.className = 'w-msg info'; etape.textContent = 'Interrompu. Ce qui a été chargé est gardé : reprends quand tu veux.'; reste.textContent = 'en pause'; relancer('Reprendre'); }
      return;
    }
    etape.className = 'w-msg erreur';
    etape.textContent = `Échec : ${e.message} Ce qui a été chargé est gardé.`;
    reste.textContent = 'arrêté';
    relancer('Réessayer');
  }
}

// ---------- Appli ----------
async function demarrerAppli() {
  const [d, { P, regles, journees }] = await Promise.all([lireCle('donnees', 'dernier'), chargerEntrees()]);
  if (window.SORARE_WEB) { location.reload(); return; } // l'appli tourne déjà : on recharge avec les nouvelles données
  window.SORARE_WEB = {
    donnees: preparerDonneesApp({ donnees: d, P, regles, journees, visuels: true }),
    // ↻ : actualisation incrémentale ; renvoie la date des nouvelles données (l'appli propose de recharger).
    async actualiser(rappel) { const n = await recuperer({ sports: lireParams().sports, rappel }); return n.meta.recupereA; },
    ouvrirParametres: () => ecranParametres(),
  };
  cacher();
  await import('../app/app.js');
}

async function demarrer() {
  try {
    const p = lireParams();
    if (!p?.cle || !p?.slug) { await ecranParametres({ premier: true }); return; }
    const d = await lireCle('donnees', 'dernier');
    if (!d || d.meta?.slug !== p.slug || p.sports.some((s) => !d.meta?.recupereParSport?.[s])) { await ecranInitialisation(); return; }
    await demarrerAppli();
  } catch (e) {
    montrer(herosAccueil(), `<p class="w-msg erreur">Démarrage impossible : ${esc(e.message)}</p>`);
  }
}
demarrer();
