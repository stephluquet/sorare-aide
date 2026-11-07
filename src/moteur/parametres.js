// Lecture des paramètres de la méthode depuis le texte de methode.md (fait foi).
// Fonction pure : le texte est fourni par l'appelant (Node : fichier ; navigateur :
// texte intégré à la page), pour que le moteur n'accède jamais au disque ni au réseau.

export function parametresDepuisMethode(texte) {
  const m = texte.match(/<!-- parametres:debut -->\s*```json\s*([\s\S]*?)```\s*<!-- parametres:fin -->/);
  if (!m) throw new Error('Bloc de paramètres introuvable dans methode.md');
  return JSON.parse(m[1]);
}
