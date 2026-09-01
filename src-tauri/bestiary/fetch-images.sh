#!/usr/bin/env bash
# Картинки существ бестиария — не лежат в git (см. .gitignore), качаются один
# раз при установке с Wikimedia Commons и дальше используются офлайн (см.
# src-tauri/src/combat.rs::load_bestiary_image). Тот же приём, что и у
# src-tauri/models/fetch-models.sh и src-tauri/pdfium/fetch-pdfium.sh —
# идемпотентно, файл, который уже скачан, не трогается.
#
# Ширина 480px запрошена у самой Wikimedia (?width=480) — thumbnail рендерится
# на стороне Commons, локально ничего не пережимается. Имя файла напрямую
# соответствует полю imageAsset в bestiary.json, формат (.jpg/.png) — тому,
# что реально отдаёт Commons для исходника (SVG-гравюры рендерятся в PNG).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/images"
mkdir -p "$DIR"

fetch() {
  local name="$1" commons_file="$2"
  if [ -f "$DIR/$name" ]; then
    return
  fi
  echo "скачиваю $name..."
  curl -fsSL -o "$DIR/$name" "https://commons.wikimedia.org/wiki/Special:FilePath/${commons_file}?width=480"
}

fetch wolf.jpg "Grey_wolf_at_the_Hoenderdaell_animal_park_in_Anna_Paulowna.jpg"
fetch werewolf.png "Werewolf_Damnable_Life_of_Stubbe_Peeter.svg"
fetch bandit.jpg "Richard_Turpin_shooting_a_man_near_his_cave_in_Epping_Forrest_Wellcome_L0040856.jpg"
