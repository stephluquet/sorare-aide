// Blessures NBA annoncées par ESPN (methode.md, section 9). Lecture seule, sans clé.
// Hôte site.api.espn.com autorisé dans l'environnement le 2026-11-07.
// Forme vérifiée le 2026-11-07 : { injuries: [{ displayName: <équipe>, injuries: [{ status, date,
//   shortComment, athlete: { displayName } }] }] } ; statuts vus : Out, Day-To-Day.

export const URL_BLESSURES_NBA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';

// Nom sans accents, ponctuation ni casse : « Day'Ron Sharpe » → « dayronsharpe ».
export const cleNom = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function lireBlessuresNba() {
  const rep = await fetch(URL_BLESSURES_NBA, { headers: { accept: 'application/json' } });
  if (!rep.ok) throw new Error(`ESPN ${rep.status}`);
  return rep.json();
}

/**
 * Rapproche la liste ESPN des joueurs NBA normalisés (nom ET équipe) et ajoute `espn`
 * { statut, date, commentaire, equipe } à ceux qui y figurent. Fonction pure.
 * @returns { listes, rapproches, ignores: [noms ESPN dont l'équipe ne correspond pas] }
 */
export function rapprocherBlessures(donneesEspn, joueurs) {
  const parNom = new Map();
  for (const j of joueurs) if (j.sport === 'nba') parNom.set(cleNom(j.nom), j);
  let listes = 0, rapproches = 0;
  const ignores = [];
  for (const equipe of donneesEspn?.injuries ?? []) {
    for (const b of equipe.injuries ?? []) {
      listes++;
      const j = parNom.get(cleNom(b.athlete?.displayName));
      if (!j) continue;
      if (cleNom(j.club?.nom) !== cleNom(equipe.displayName)) { ignores.push(`${b.athlete.displayName} (${equipe.displayName} / ${j.club?.nom ?? '?'})`); continue; }
      j.espn = { statut: b.status ?? null, date: b.date ?? null, commentaire: b.shortComment ?? null, equipe: equipe.displayName };
      rapproches++;
    }
  }
  return { listes, rapproches, ignores };
}
