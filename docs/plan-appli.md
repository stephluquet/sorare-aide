# Appli Sorare — plan de développement

*Version 0.1 du 2026-11-07, à transmettre à la session de développement. S'appuie sur `CLAUDE.md` (consignes), `regles/*.json`, `brief-api-sorare.md` et `RECAP-brief.md`. Les points ❓ sont encore à trancher avec l'utilisateur.*

## 0. Principes non négociables
1. **Ne jamais proposer un joueur qui risque de ne pas jouer** sans le dire en clair : filtre dur, puis probabilité « équipe complète » affichée en tête.
2. **Lecture seule** : aucune action sur le compte, le marché ou les compositions Sorare.
3. **Rien d'inventé** : toute donnée absente s'affiche « à vérifier » ou « inconnu », jamais estimée en silence.
4. **Règles et paramètres à un seul endroit** : `regles/*.json` et le bloc JSON de `methode.md` ; le code les lit, ne les recopie pas.
5. **Tout est daté** : chaque écran affiche l'heure des données utilisées.
6. **Simple d'abord** : pas de framework ni d'étape de compilation ; HTML + JavaScript (modules ES) + CSS ; une dépendance au plus pour l'optimisation.

## 0 bis. Décisions de l'utilisateur (2026-11-07)
- **Support** : l'appli est un **artifact Claude** publié par la session cloud, consulté sur iPhone et PC (privé par défaut).
- **Usage** : un passage **le matin** (faire une équipe au cas où j'oublie) et un **en fin d'après-midi** pour les matchs du soir.
- **Actualisation** : un bouton « Actualiser » avec **barre de progression** (la récupération est volontairement bridée sous le quota de l'API).
- **Risque par défaut** : seuil de 80 % de chances de jouer, proposition prudente en premier.
- **Journal des résultats** : pas pour l'instant (étape 5 reportée).
- **Visuel** : deux maquettes avant de coder les écrans, dont une ultra minimaliste.

### Conséquences techniques (à vérifier en premier par la session de dev)
- Un artifact ne peut ni porter la clé API ni appeler l'API Sorare lui-même (clé exposée, appels bloqués côté navigateur). **Les données doivent donc être intégrées à l'artifact au moment où la session le publie.**
- **« Actualiser » = republier l'artifact avec des données fraîches, à la demande uniquement** (décision du 2026-11-07 : **pas d'actualisation automatique**). L'utilisateur écrit « actualise » à la session.
- **Cible à terme : une appli qui se passe de Claude.** L'artifact est une étape de transition. D'où trois exigences dès maintenant :
  1. le **moteur** (`src/moteur/`) reste en JavaScript pur, sans dépendance à Claude ni à l'artifact ;
  2. la **récupération** (`npm run recuperer`) est un script Node autonome, lançable ailleurs (PC, tâche CI, petit relais serveur) avec la clé en variable d'environnement ;
  3. l'**interface** (`app/`) lit un fichier de données au même format, qu'il soit intégré à l'artifact ou servi par un hébergement.
  Passage ultérieur envisagé : hébergement privé dont la récupération est faite côté serveur (tâche CI planifiée ou relais), la clé n'étant jamais dans la page.
- **Barre de progression** : affichée là où la récupération tourne (session ou routine : « 12/21 requêtes ») ; l'artifact affiche l'heure des données et l'âge (« données de 17 h 02, il y a 25 min »), et un bandeau orange au-delà de 3 h.
- ❓ À vérifier : un artifact peut-il conserver le palier et les cartes jouées entre deux visites et entre deux republications (stockage du navigateur dans le cadre claude.ai, ou stockage de données propre aux artifacts) ? Sinon, la saisie se fait dans la session, qui l'écrit dans `etat.json` du dépôt et l'intègre à l'artifact.
- ❓ À vérifier : un bouton dans l'artifact peut-il déclencher la routine ou demander à Claude (capacités « demander à Claude » des artifacts) ? Si oui, la barre de progression peut s'afficher dans l'artifact lui-même.

## 0 ter. Résultats des tests API (2026-11-07)
1. ✅ Nombre de matchs joués sur 5, 10, 15 et 40, moyennes 10, 40 et saison : disponibles directement → base de la probabilité de jouer.
2. ✅ Situation de chaque match (titulaire, titulaire remplacé, entré en jeu, banc, absent) et minutes jouées. Limite : 15 matchs dans la liste des cartes ; 40 matchs = une requête par joueur (environ 4 min pour tout le football).
   → **Historique incrémental** (règles détaillées) :
   - **Premier lancement** : 40 matchs par joueur (une requête par joueur), archivés dans `data/historique/<joueurId>.json` avec la date de récupération.
   - **Chaque actualisation** : aucune requête supplémentaire ; les 15 derniers matchs fournis par la liste des cartes sont **fusionnés** dans l'archive.
   - **Fusion par identifiant de match** (jamais par date) : pas de doublon, même pour un match reprogrammé.
   - **Les matchs récents font foi** : les 15 reçus remplacent leurs équivalents archivés (un score « en cours de vérification » peut encore changer) ; seuls les plus anciens restent figés.
   - **Nouveau joueur** (paquet ouvert) : 40 matchs récupérés pour lui seul.
   - **Joueur sorti de la collection** : archive conservée.
   - **Trou détecté** (le plus ancien des 15 reçus est postérieur au dernier match archivé) : 40 matchs refaits pour ce joueur.
   - **Changement de saison** : rien n'est supprimé ; la pondération des matchs anciens relève de `methode.md`.
   - Coût attendu après le premier lancement : environ 21 requêtes par actualisation, plus une par nouveau joueur.
3. ⏳ Compositions officielles : vides à H-2/H-4 ; relevés programmés jusqu'au coup d'envoi (Leeds–Tottenham, Mayence–Bayern, Arsenal–Hull). **Décide du mode créneau unique.**
4. ✅ Heure des matchs à la minute → regroupement par créneau possible.
5. ✅ Règles des 6 paliers conformes à `regles/`, avec deux nouveautés tranchées par l'utilisateur le 2026-11-07 :
   - **Football : la règle de compétition porte sur le match joué**, pas sur le club. Comptent les matchs de Bundesliga, Ligue 1, Premier League, Liga, des trois coupes d'Europe et de la Ligue des nations ; **les coupes nationales ne sont pas disponibles**, les matchs internationaux le sont. → Filtrer sur la compétition du prochain match ; un joueur dont le prochain match est une coupe nationale est exclu pour ce créneau.
   - **NBA : 16 étoiles maximum, 16 inclus** (`plafond_inclus: true`).
6. ❌ Minutes projetées NBA vides ; points, rebonds et passes projetés disponibles. → En NBA, probabilité de jouer à partir du statut de blessure, de l'historique de minutes et de la présence d'une projection Sorare.

## 1. Architecture
```
Session Claude (cloud)                     Navigateur (moi)
──────────────────────                     ────────────────
npm run recuperer  ──►  data/AAAA-MM-JJTHHMM/*.json  ──►  app/index.html
 (API Sorare, clé par                       data/dernier.json          ├─ lit les données
  secret réseau)                            (copie du plus récent)     ├─ calcule projections et compositions
                                                                       └─ garde palier + cartes jouées (localStorage)
```
- **Récupération** (`src/recuperation/`, Node) : cartes, joueurs, historique match par match, prochain match et horaire, blessures, suspensions, cotes de match foot, paliers Arcade. Écrit des JSON normalisés et un `meta.json` (heure de récupération, nombre de requêtes, anomalies).
- **Moteur** (`src/moteur/`, JavaScript pur, sans accès réseau, utilisable dans Node pour les tests **et** dans le navigateur) : `projection.js`, `jouer.js` (probabilité de jouer), `simulation.js`, `compositions.js`, `creneaux.js`.
- **Interface** (`app/`) : `index.html`, `app.js`, `style.css` ; lit `data/dernier.json` et `regles/*.json`.
- **Tests** (`tests/`) : `tests/cas/*.json` (situations figées avec résultat attendu) lancés par `npm test` (Node, `node:test`, aucune dépendance).
- ❓ **Accès depuis l'iPhone en attendant la publication** : voir question 1.

## 2. Modèle de données (normalisé, commun foot / NBA)
- `cartes[]` : id, slug, sport, joueurId, rareté, saison, collection, bonusPct, visuelUrl.
- `joueurs[]` : id, nom, postes[], club, tier, étoiles, statutSorare, blessure {type, retourPrévu}, suspension {compétition, motif}, moyennes {L5, L10, L15, L40, pctJoués5, pctJoués10, pctJoués40}, projectionSorare, historique[] {date, adversaire, score, situation: titulaire | entré | banc | absent | inconnu}.
- `matchs[]` : id, sport, débutUTC, compétition, domicile, extérieur, cotes {victoire, nul, défaite, cleanSheet} (foot), compositionsOfficielles (si `homeFormation` / `awayFormation` le permettent).
- `paliers[]` : sport, cible, état (CLAIMED, LINEUP_SET, LOCKED…), tentatives, tentativesRestantes.
- `meta` : récupéréÀ, source, anomalies[].

## 3. Méthode (détail dans `methode.md`, paramètres en JSON)
1. **Probabilité de jouer p** : à partir du statut Sorare, des % de matchs joués (5, 10, 40) et de la situation des derniers matchs ; 0 si blessé ou suspendu ; 1 si présent dans une composition officielle publiée. Paramètres de pondération dans le bloc JSON.
2. **Distribution du score** en mélange : titulaire (scores des matchs titulaires, récents pondérés davantage), entré en jeu (scores comme remplaçant), ne joue pas (0). Bonus de collection appliqué ; capitaine ×1,5 (foot).
3. **Probabilité de franchir le palier** : simulation de Monte-Carlo (5 000 tirages par équipe candidate, graine fixe pour des résultats reproductibles).
4. **Probabilité équipe complète** = produit des p des 5 joueurs.
5. **Recherche des équipes** : présélection (filtre dur, p ≥ seuil, meilleurs candidats par poste ou par étoiles), puis énumération ou recherche locale sur les candidats restants ; contraintes de `regles/` (postes, capitaine, ≤ 16 étoiles, cartes jouées exclues, même jour pour Squad, même créneau en mode créneau unique) ; tri par probabilité de passer, puis par probabilité équipe complète.
6. **Trois propositions** : prudente (p équipe complète maximale au-dessus d'un plancher de chance de passer), équilibrée, ambitieuse ; pour chacune : 5 cartes, capitaine, score attendu, chance de passer, chance équipe complète, horaire du premier coup d'envoi (verrouillage).

## 4. Écrans (mobile d'abord)
1. **Accueil** : foot et NBA côte à côte ; palier actuel (lu dans l'API, modifiable), heure des données, prochain verrouillage, accès aux propositions.
2. **Propositions** : 3 équipes avec visuels des cartes, statut de chaque joueur (confirmé / probable / incertain) et les chiffres clés ; bascule « créneau unique / plusieurs créneaux » ; bouton « J'ai joué cette équipe » qui marque les cartes comme jouées pour ce palier.
3. **Mes cartes** : liste filtrable (sport, poste, créneau, disponible / bloquée), avec probabilité de jouer, projection, dispersion, prochain match ; fiche détaillée avec l'historique en barres.
4. **Squad du jour** : choix du jour, meilleure équipe parmi les joueurs qui jouent ce jour-là.
- Deux directions visuelles à maquetter, dont une ultra minimaliste (préférence de l'utilisateur).

## 5. Étapes, livrables et critères d'acceptation
| # | Étape | Livrable | Terminé quand… | Estimation |
|---|---|---|---|---|
| 1 | Données | `npm run recuperer` complet ; tests API n° 1 à 6 du récap | toutes les cartes foot et NBA normalisées, `meta.json` sans anomalie bloquante, réponses écrites aux 6 tests | 3–5 h |
| 2 | Méthode et projections | `methode.md` + `projection.js`, `jouer.js` ; 5 cas de test ; écran « Mes cartes » | les cas de test passent ; un joueur blessé a p = 0 ; un joueur à 100 % de matchs joués et « titulaire » a p élevée ; écran lisible sur iPhone | 4–6 h |
| 3 | Arcade solo football | `simulation.js`, `compositions.js` ; écrans Accueil et Propositions ; saisie palier et cartes jouées | 3 propositions en moins de 5 s sur iPhone ; contraintes respectées sur 10 situations de test ; probabilités reproductibles | 5–8 h |
| 4 | NBA, Squad et créneaux | contrainte d'étoiles (demi-étoiles), Squad du jour, `creneaux.js` et bascule créneau unique | propositions NBA ≤ 16 étoiles ; Squad = joueurs du jour uniquement ; créneau unique testé un vrai samedi | 4–6 h |
| 5 | ~~Journal et calibrage~~ **reporté** | — | — | — |
| 5 bis | Artifact et actualisation | build qui intègre les données dans un artifact unique ; publication par la session à la demande ; progression affichée pendant la récupération | l'artifact s'ouvre sur iPhone en moins de 3 s, affiche l'heure et l'âge des données ; une actualisation complète passe sous le quota et affiche sa progression ; le même `app/` fonctionne hors artifact avec un fichier de données local | 3–4 h |
| 6 | Conseil avant de jouer (option) | consigne pour Claude : vérifier titulaires et blessures avec des sources datées, à partir des propositions | une vérification prend moins de 2 min et cite ses sources | 1–2 h |

**Plus tard** : publication privée ; plan sur les vies ; OAuth (probabilité de titularisation, cartes bloquées automatiques) ; paquet R pour des collègues.

## 6. Qualité
- `npm test` passe avant chaque commit ; un cas de test par bug corrigé.
- Garde-fous : aucun appel réseau depuis le moteur ; aucune clé dans les fichiers, journaux ou messages ; débit ≤ 150 requêtes/min.
- Les écrans sont vérifiés sur une largeur de 375 px.

## 7. Questions ouvertes
- Les deux nouveautés trouvées dans les règles des paliers.
- Stockage du palier et des cartes jouées dans l'artifact (voir 0 bis).
