"""Fabrique des vignettes WebP de 96 px de large à partir des images de cartes Sorare.

Usage : python3 -I outils/vignettes.py <dossier>
Lit <dossier>/a-faire.json ([{id, url}]) et écrit <dossier>/<id>.webp (déjà faites : sautées).
Les images viennent de assets.sorare.com (hôte autorisé dans l'environnement).
"""
import io
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

LARGEUR = 96


def fabriquer(dossier: Path, item: dict) -> bool:
    cible = dossier / f"{item['id']}.webp"
    if cible.exists():
        return False
    try:
        with urllib.request.urlopen(item["url"], timeout=30) as rep:
            image = Image.open(io.BytesIO(rep.read())).convert("RGBA")
    except Exception as erreur:  # noqa: BLE001 - une vignette manquante n'est pas bloquante
        print(f"vignette impossible pour {item['id']} : {erreur}", file=sys.stderr)
        return False
    hauteur = round(image.height * LARGEUR / image.width)
    image.resize((LARGEUR, hauteur), Image.LANCZOS).save(cible, "WEBP", quality=72, method=6)
    return True


def main(dossier: Path) -> None:
    a_faire = json.loads((dossier / "a-faire.json").read_text())
    # 6 téléchargements à la fois : quelques minutes pour tout le catalogue, puis seulement les nouvelles cartes.
    with ThreadPoolExecutor(max_workers=6) as pool:
        faites = sum(pool.map(lambda item: fabriquer(dossier, item), a_faire))
    print(f"{faites} vignettes fabriquées", file=sys.stderr)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
