#!/usr/bin/env bash
# Картинки существ бестиария — не лежат в git (см. .gitignore), качаются один
# раз при установке и дальше используются офлайн (см.
# src-tauri/src/combat.rs::load_bestiary_image). Тот же приём, что и у
# src-tauri/models/fetch-models.sh и src-tauri/pdfium/fetch-pdfium.sh —
# идемпотентно, файл, который уже скачан, не трогается.
#
# Источник — OpenGameArt.org (CC0/CC-BY/CC-BY-SA фэнтезийный игровой арт),
# НЕ Wikimedia Commons: реальные фотографии животных из зоопарков смотрятся
# нелепо рядом с фэнтезийным стат-блоком (отклонено владельцем продукта на
# первой попытке с Wikimedia). Ссылки — на конкретный файл на
# opengameart.org/sites/default/files/, стабильный прямой URL без API.
# Атрибуция каждой картинки (автор, лицензия, ссылка на страницу работы) —
# в bestiary.json (imageAttribution), т.к. большинство лицензий (все, кроме
# CC0) требуют атрибуции при использовании.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/images"
mkdir -p "$DIR"

fetch() {
  local name="$1" oga_file="$2"
  if [ -f "$DIR/$name" ]; then
    return
  fi
  echo "скачиваю $name..."
  curl -fsSL -o "$DIR/$name" "https://opengameart.org/sites/default/files/${oga_file}"
}

fetch wolf.png "wolf_small.png"
fetch werewolf.png "werewolf_preview.png"
