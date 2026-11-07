// Relevé exploratoire (test 3 du récap) : les compositions officielles
// apparaissent-elles dans l'API avant le coup d'envoi ? Et les probabilités de
// titularisation se remplissent-elles à l'approche du match ?
//
// Usage : node src/releve-compositions.js <slug-joueur> [<slug-joueur>…]
//   Pour chaque joueur, suit le match du jour (identifiant figé au premier
//   relevé) et ajoute une ligne à data/releves/compositions-AAAA-MM-JJ.jsonl.
// Lecture seule. Environ 1 requête par match + 1 pour les joueurs.

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelGraphql, dateDuJour, relancerViaProxySiBesoin } from './recuperation.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQ_JOUEURS = `
query($slugs: [String!]!) {
  players(slugs: $slugs) {
    slug displayName
    nextGame { id date }
    ... on Player {
      playingStatus
      nextClassicFixturePlayingStatusOdds { starterOddsBasisPoints substituteOddsBasisPoints nonPlayingOddsBasisPoints reliability }
    }
    anyFutureGameStats(first: 1) {
      ... on PlayerGameStats { fieldStatus footballPlayingStatusOdds { starterOddsBasisPoints substituteOddsBasisPoints nonPlayingOddsBasisPoints reliability } }
    }
  }
}`;

const FORMATION = 'startingLineupAvailable startingLineup { slug displayName } bench { slug displayName }';
const REQ_MATCH = `
query($id: ID!) {
  football {
    game(id: $id) {
      id date statusTyped periodType minute
      homeTeam { name } awayTeam { name }
      homeFormation { ${FORMATION} }
      awayFormation { ${FORMATION} }
    }
  }
}`;

const resumeFormation = (f) => ({
  disponible: f.startingLineupAvailable,
  titulaires: f.startingLineup.flat().map((p) => p.displayName),
  banc: f.bench.map((p) => p.displayName),
});

async function principal() {
  relancerViaProxySiBesoin();
  const slugs = process.argv.slice(2);
  if (!slugs.length) throw new Error('Usage : node src/releve-compositions.js <slug-joueur>…');
  const jour = dateDuJour();
  const dossier = join(RACINE, 'data', 'releves');
  const fichierIds = join(dossier, `matchs-suivis-${jour}.json`);
  mkdirSync(dossier, { recursive: true });

  const maintenant = new Date();
  const { players } = await appelGraphql(REQ_JOUEURS, { slugs });

  // Identifiants de match figés au premier relevé : après le coup d'envoi,
  // nextGame pourrait pointer vers le match suivant.
  const suivis = existsSync(fichierIds) ? JSON.parse(readFileSync(fichierIds, 'utf8')) : {};
  for (const p of players) if (!suivis[p.slug] && p.nextGame) suivis[p.slug] = p.nextGame.id;
  writeFileSync(fichierIds, JSON.stringify(suivis, null, 1) + '\n');

  const matchs = {};
  for (const id of new Set(Object.values(suivis))) {
    // football.game attend l'identifiant sans le préfixe « Game: » que renvoie nextGame.id.
    const { football: { game: g } } = await appelGraphql(REQ_MATCH, { id: id.replace(/^Game:/, '') });
    const minutesAvant = Math.round((new Date(g.date) - maintenant) / 60000);
    matchs[id] = {
      affiche: `${g.homeTeam.name} – ${g.awayTeam.name}`,
      coup_envoi: g.date,
      minutes_avant_coup_envoi: minutesAvant,
      statut: g.statusTyped, periode: g.periodType, minute: g.minute,
      domicile: resumeFormation(g.homeFormation),
      exterieur: resumeFormation(g.awayFormation),
    };
  }

  const ligne = {
    releve_le: maintenant.toISOString(),
    joueurs: players.map((p) => ({
      slug: p.slug, nom: p.displayName, match: suivis[p.slug],
      statut_sorare: p.playingStatus ?? null,
      probas_titulaire: p.nextClassicFixturePlayingStatusOdds ?? null,
      probas_titulaire_match: p.anyFutureGameStats?.[0]?.footballPlayingStatusOdds ?? null,
      statut_terrain: p.anyFutureGameStats?.[0]?.fieldStatus ?? null,
    })),
    matchs,
  };
  appendFileSync(join(dossier, `compositions-${jour}.jsonl`), JSON.stringify(ligne) + '\n');

  for (const m of Object.values(matchs)) {
    console.log(`${m.affiche} (H${m.minutes_avant_coup_envoi >= 0 ? '-' : '+'}${Math.abs(m.minutes_avant_coup_envoi)} min, ${m.statut}) : ` +
      `compos ${m.domicile.disponible ? 'OUI' : 'non'}/${m.exterieur.disponible ? 'OUI' : 'non'}, ` +
      `titulaires ${m.domicile.titulaires.length}+${m.exterieur.titulaires.length}, banc ${m.domicile.banc.length}+${m.exterieur.banc.length}`);
  }
  for (const j of ligne.joueurs) {
    console.log(`  ${j.nom} : statut ${j.statut_sorare}, terrain ${j.statut_terrain}, probas ${JSON.stringify(j.probas_titulaire ?? j.probas_titulaire_match)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
