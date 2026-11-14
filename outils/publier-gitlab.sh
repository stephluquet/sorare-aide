#!/usr/bin/env bash
# Publie le code sur le dépôt GitLab PUBLIC https://gitlab.com/steph.luquet/sorarhelp, sans aucune donnée personnelle.
# On n'y pousse jamais l'historique Git du dépôt GitHub (données de joueurs dans les anciens commits, adresse e-mail) :
# chaque publication est un instantané de l'état courant, moins les chemins exclus ci-dessous, posé à la suite du
# dernier instantané GitLab (historique GitLab linéaire et propre).
# Aucune clé : l'authentification git vient du secret réseau de l'environnement (gitlab.com), jamais d'un fichier
# (identifiants bidon dans l'adresse : git envoie alors un en-tête que le proxy remplace par le vrai jeton).
# Usage : bash outils/publier-gitlab.sh ["message"]
set -euo pipefail
cd "$(dirname "$0")/.."

DEPOT=https://oauth2:injecte-par-le-proxy@gitlab.com/steph.luquet/sorarhelp.git
BRANCHE=main
# Chemins jamais publiés (motifs de git ls-files, relatifs à la racine)
EXCLUS=(
  'data/historique/*'                       # historique match par match des joueurs du compte
  'data/releves/*'                          # relevés exploratoires
  'sorties/*'                               # pages produites avec les cartes du compte
  'docs/refonte-2026-11/maquettes/*.html'   # maquettes construites sur les vraies données
)
GARDES=('docs/refonte-2026-11/maquettes/icones.html')  # étude d'icônes, sans donnée

MESSAGE=${1:-"Instantané du $(date -u +%Y-%m-%dT%H:%MZ) (dépôt de travail : $(git rev-parse --short HEAD))"}
INDEX=$(mktemp); trap 'rm -f "$INDEX"' EXIT
export GIT_INDEX_FILE=$INDEX
git read-tree HEAD
for motif in "${EXCLUS[@]}"; do git rm -r -q --cached --ignore-unmatch -- "$motif" >/dev/null; done
for f in "${GARDES[@]}"; do git update-index --add --cacheinfo "$(git ls-tree HEAD -- "$f" | awk '{print $1","$3","$4}')"; done

# Dernier contrôle : rien qui ressemble à une clé ou à une adresse e-mail personnelle
if git ls-files -z | xargs -0 git grep --cached -nIE 'glpat-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|@insee\.fr|@gmail\.com' -- 2>/dev/null; then
  echo "Refusé : contenu sensible ci-dessus." >&2; exit 1
fi
ARBRE=$(git write-tree)
unset GIT_INDEX_FILE

PARENT=$(git ls-remote "$DEPOT" "refs/heads/$BRANCHE" | cut -f1)
if [ -n "$PARENT" ]; then
  git fetch -q "$DEPOT" "$BRANCHE"
  if [ "$(git rev-parse "$PARENT^{tree}")" = "$ARBRE" ]; then echo "GitLab déjà à jour."; exit 0; fi
  ARGS=(-p "$PARENT")
else
  ARGS=()
fi
export GIT_AUTHOR_NAME=Claude GIT_AUTHOR_EMAIL=noreply@anthropic.com GIT_COMMITTER_NAME=Claude GIT_COMMITTER_EMAIL=noreply@anthropic.com
COMMIT=$(git commit-tree "$ARBRE" "${ARGS[@]}" -m "$MESSAGE")
git push -q "$DEPOT" "$COMMIT:refs/heads/$BRANCHE"
echo "Publié sur GitLab : $COMMIT ($(git ls-tree -r --name-only "$ARBRE" | wc -l) fichiers)"
