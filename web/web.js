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
    rappel({ pourcent, texte: `${NOMS[ev.sport]} · ${ev.texte}`, reste, ecouleS: (Date.now() - debut) / 1000 });
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
  if (c?.type !== 'sorare-aide-sauvegarde' || !Array.isArray(c.archives)) throw new Error('ce fichier n\'est pas une sauvegarde de Sorare aide');
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

// ---------- Écrans (paramètres, initialisation) ----------
const style = document.createElement('style');
style.textContent = `
.web-ecran { position: fixed; inset: 0; z-index: 60; overflow: auto; background: var(--fond); color: var(--encre);
  font-family: var(--f-texte); padding: max(24px, env(safe-area-inset-top)) 16px 32px; }
.web-ecran[hidden] { display: none; }
.web-carte { max-width: 560px; margin: 0 auto; display: grid; gap: 20px; }
.web-carte h1 { font-family: var(--f-titre); font-size: var(--t2, 28px); margin: 0; line-height: 1.15; }
.web-carte h2 { font-family: var(--f-titre); font-size: var(--t4, 18px); margin: 0 0 4px; }
.web-carte p { margin: 0; line-height: 1.5; }
.web-bloc { background: var(--surface); border: 1px solid var(--trait); border-radius: var(--r2, 12px); padding: 16px; display: grid; gap: 12px; }
.web-champ { display: grid; gap: 6px; }
.web-champ label { font-weight: 600; }
.web-champ input[type=text], .web-champ input[type=password] { font: inherit; padding: 10px 12px; border: 1px solid var(--trait-fort); border-radius: var(--r1, 8px);
  background: var(--fond); color: var(--encre); width: 100%; box-sizing: border-box; }
.web-ligne { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.web-cases { display: flex; gap: 16px; flex-wrap: wrap; }
.web-doux { color: var(--doux); font-size: var(--t6, 14px); }
.web-msg { padding: 10px 12px; border-radius: var(--r1, 8px); }
.web-msg.ok { background: var(--ok-doux); } .web-msg.erreur { background: var(--stop-doux); } .web-msg.info { background: var(--info-doux); }
.web-jauge { height: 10px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.web-jauge i { display: block; height: 100%; background: var(--encre); width: 0; transition: width .4s; }
.web-gros { font-family: var(--f-titre); font-size: var(--t1, 40px); font-weight: 800; }
`;
document.head.append(style);
const ecran = Object.assign(document.createElement('div'), { className: 'web-ecran', hidden: true });
ecran.setAttribute('role', 'dialog');
ecran.setAttribute('aria-modal', 'true');
document.body.append(ecran);
const montrer = (html) => { ecran.innerHTML = `<div class="web-carte">${html}</div>`; ecran.hidden = false; ecran.scrollTop = 0; };
const cacher = () => { ecran.hidden = true; ecran.innerHTML = ''; };
const date = (iso) => (iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—');
const mo = (n) => (n == null ? '?' : `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1).replace('.', ',')}${nbsp}Mo`);

/** Écran des paramètres. @param premier vrai à la première visite (pas de bouton Fermer). */
async function ecranParametres({ premier = false, message = null } = {}) {
  const p = lireParams() ?? { sports: SPORTS };
  const info = await infosStockage().catch(() => null);
  montrer(`
    <div><h1>${premier ? 'Bienvenue dans Sorare aide' : 'Paramètres'}</h1>
      ${premier ? '<p class="web-doux">L’outil lit tes cartes et propose des équipes. Il ne joue jamais à ta place et n’agit jamais sur le marché.</p>' : ''}</div>
    ${message ? `<p class="web-msg ${message.classe}">${esc(message.texte)}</p>` : ''}
    <form class="web-bloc" id="web-form">
      <h2>Ton compte Sorare</h2>
      <div class="web-champ"><label for="web-slug">Nom de manager</label>
        <input type="text" id="web-slug" autocomplete="username" autocapitalize="off" spellcheck="false" required value="${esc(p.slug ?? '')}" placeholder="ex. yapapir">
        <span class="web-doux">Celui de l’adresse de ton profil : sorare.com/fr/my-club/<b>nom</b>.</span></div>
      <div class="web-champ"><label for="web-cle">Clé API Sorare</label>
        <input type="password" id="web-cle" autocomplete="off" spellcheck="false" required value="${esc(p.cle ?? '')}">
        <span class="web-doux">Elle reste dans ce navigateur, sur cet appareil. Elle passe par le relais du site pour atteindre Sorare, qui ne la garde pas.
        Une clé se demande à Sorare par un ticket au centre d’aide.</span></div>
      <fieldset class="web-champ" style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:6px">Sports</legend>
        <div class="web-cases">${SPORTS.map((s) => `<label><input type="checkbox" name="sport" value="${s}" ${(p.sports ?? SPORTS).includes(s) ? 'checked' : ''}> ${NOMS[s]}</label>`).join('')}</div></fieldset>
      <p id="web-test" class="web-doux" role="status"></p>
      <div class="web-ligne">
        <button type="submit" class="btn principal">${premier ? 'Enregistrer et continuer' : 'Enregistrer'}</button>
        <button type="button" class="btn" id="web-tester">Tester</button>
        ${premier ? '' : '<button type="button" class="btn discret" id="web-fermer">Fermer</button>'}
      </div>
    </form>
    <div class="web-bloc">
      <h2>Tes données</h2>
      <p>${info?.joueurs ? `Historique de <b>${info.joueurs}</b> joueurs${info.slug ? ` (manager ${esc(info.slug)})` : ''}, données du ${date(info.donneesDe)}${info.utilise ? `, ${mo(info.utilise)} utilisés` : ''}.` : 'Aucune donnée pour l’instant.'}</p>
      <p class="web-doux">${info?.persistant ? 'Stockage persistant accordé par le navigateur.' : 'Le navigateur peut effacer ces données (Safari : après 7 jours sans visite, sauf si le site est ajouté à l’écran d’accueil). Garde une sauvegarde.'}</p>
      <div class="web-ligne">
        <button type="button" class="btn" id="web-sauver" ${info?.joueurs ? '' : 'disabled'}>Sauvegarder dans un fichier</button>
        <label class="btn" for="web-fichier" style="cursor:pointer">Restaurer une sauvegarde</label>
        <input type="file" id="web-fichier" accept=".json,.gz,application/json,application/gzip" hidden>
      </div>
      <p id="web-donnees-msg" role="status"></p>
    </div>
    ${premier ? '' : `<div class="web-bloc"><h2>Oublier</h2>
      <p class="web-doux">Efface la clé, ou bien la clé et toutes les données de ce navigateur.</p>
      <div class="web-ligne"><button type="button" class="btn" id="web-oublier-cle">Oublier ma clé</button>
      <button type="button" class="btn" id="web-tout-effacer">Tout effacer</button></div></div>`}
  `);
  const lireForm = () => ({ slug: ecran.querySelector('#web-slug').value.trim(), cle: ecran.querySelector('#web-cle').value.trim(),
    sports: [...ecran.querySelectorAll('input[name=sport]:checked')].map((x) => x.value) });
  const test = ecran.querySelector('#web-test');
  ecran.querySelector('#web-tester').onclick = async () => {
    const f = lireForm();
    if (!f.slug || !f.cle) { test.textContent = 'Renseigne le nom de manager et la clé.'; return; }
    test.className = 'web-doux'; test.textContent = 'Test en cours…';
    try {
      const appel = appelAvec(f.cle);
      const res = [];
      for (const s of f.sports.length ? f.sports : SPORTS) {
        const d = await appel(CARTES, { slug: f.slug, sport: s.toUpperCase(), first: 50, after: null });
        res.push(`${d.user.cards.totalCount} cartes ${NOMS[s]}`);
      }
      test.className = 'web-msg ok'; test.textContent = `Clé et manager reconnus : ${res.join(', ')}.`;
    } catch (e) { test.className = 'web-msg erreur'; test.textContent = `Échec : ${messageErreur(e, f.slug)}`; }
  };
  ecran.querySelector('#web-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = lireForm();
    if (!f.sports.length) { test.className = 'web-msg erreur'; test.textContent = 'Choisis au moins un sport.'; return; }
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
    msg.className = 'web-doux'; msg.textContent = 'Préparation du fichier…';
    try { const r = await sauvegarder(); msg.className = 'web-msg ok'; msg.textContent = `Fichier ${r.nom} (${mo(r.octets)}, ${r.joueurs} joueurs) enregistré dans tes téléchargements.`; }
    catch (e) { msg.className = 'web-msg erreur'; msg.textContent = `Sauvegarde impossible : ${e.message}`; }
  };
  ecran.querySelector('#web-fichier').onchange = async (ev) => {
    const f = ev.target.files?.[0]; if (!f) return;
    msg.className = 'web-doux'; msg.textContent = 'Restauration…';
    try {
      const r = await restaurer(f);
      msg.className = 'web-msg ok'; msg.textContent = `Restauré : ${r.joueurs} joueurs${r.slug ? ` (manager ${r.slug})` : ''}, sauvegarde du ${date(r.du)}. Vérifie la clé puis enregistre.`;
      if (r.slug) ecran.querySelector('#web-slug').value = r.slug;
    } catch (e) { msg.className = 'web-msg erreur'; msg.textContent = `Restauration impossible : ${e.message}`; }
  };
  ecran.querySelector('#web-oublier-cle')?.addEventListener('click', () => {
    ecrireParams({ ...(lireParams() ?? {}), cle: '' });
    ecran.querySelector('#web-cle').value = '';
    test.className = 'web-msg ok'; test.textContent = 'Clé effacée de ce navigateur.';
  });
  ecran.querySelector('#web-tout-effacer')?.addEventListener('click', async () => {
    if (!confirm('Effacer la clé, l’historique des joueurs et les cartes jouées de ce navigateur ?')) return;
    localStorage.removeItem(CLE_PARAMS); localStorage.removeItem(CLE_ETAT_APP);
    await vider('archives'); await vider('donnees');
    location.reload();
  });
  (ecran.querySelector('#web-slug').value ? ecran.querySelector('#web-cle') : ecran.querySelector('#web-slug')).focus();
}

/** Initialisation (ou reprise) : récupération complète des sports choisis. */
async function ecranInitialisation() {
  const p = lireParams();
  const info = await infosStockage().catch(() => null);
  const reprise = info?.joueurs > 0;
  montrer(`
    <div><h1>${reprise ? 'Mise à jour des données' : 'Chargement de tes cartes'}</h1>
      <p class="web-doux">Manager ${esc(p.slug)} · ${p.sports.map((s) => NOMS[s]).join(' et ')}</p></div>
    <div class="web-bloc">
      <p>${reprise ? `${info.joueurs} joueurs déjà enregistrés : seuls les manquants sont chargés.` : 'La première fois, l’outil charge tes cartes et les 40 derniers matchs de chaque joueur.'}
        Sorare limite à 150 requêtes par minute : <b>comptez environ 6 minutes</b> pour 900 joueurs.
        ${reprise ? '' : 'Si la page est fermée ou l’écran se verrouille, l’initialisation reprendra là où elle s’est arrêtée.'}</p>
      <div class="web-gros" id="web-pct" aria-live="off">0${nbsp}%</div>
      <div class="web-jauge" aria-hidden="true"><i id="web-barre"></i></div>
      <p id="web-etape" role="status">Démarrage…</p>
      <div class="web-ligne"><button type="button" class="btn" id="web-arreter">Interrompre</button>
        <button type="button" class="btn discret" id="web-params">Paramètres</button></div>
    </div>`);
  try { await navigator.storage?.persist?.(); } catch { /* refusé : sauvegarde conseillée */ }
  const ctrl = new AbortController();
  ecran.querySelector('#web-arreter').onclick = () => ctrl.abort();
  ecran.querySelector('#web-params').onclick = () => { ctrl.abort(); ecranParametres({ premier: !info?.donneesDe }); };
  const pct = ecran.querySelector('#web-pct'), barre = ecran.querySelector('#web-barre'), etape = ecran.querySelector('#web-etape');
  try {
    await recuperer({ sports: p.sports, signal: ctrl.signal, rappel: ({ pourcent, texte, reste }) => {
      pct.textContent = `${Math.floor(pourcent)}${nbsp}%`; barre.style.width = `${pourcent}%`;
      etape.textContent = texte + (reste ? ` · encore environ ${reste}${nbsp}min` : '');
    } });
    await demarrerAppli();
  } catch (e) {
    if (ctrl.signal.aborted) {
      if (!ecran.querySelector('#web-form')) {
        etape.className = 'web-msg info';
        etape.textContent = 'Interrompu. Ce qui a été chargé est gardé : relance pour reprendre.';
        ecran.querySelector('#web-arreter').textContent = 'Reprendre';
        ecran.querySelector('#web-arreter').onclick = ecranInitialisation;
      }
      return;
    }
    etape.className = 'web-msg erreur';
    etape.textContent = `Échec : ${e.message} Ce qui a été chargé est gardé.`;
    ecran.querySelector('#web-arreter').textContent = 'Réessayer';
    ecran.querySelector('#web-arreter').onclick = ecranInitialisation;
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
    montrer(`<h1>Sorare aide</h1><p class="web-msg erreur">Démarrage impossible : ${esc(e.message)}</p>`);
  }
}
demarrer();
