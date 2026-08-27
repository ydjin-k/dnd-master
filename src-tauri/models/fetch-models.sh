#!/usr/bin/env bash
# Модели OCR (ocrs/rten) не лежат в git — качаются один раз при установке и
# дальше используются офлайн (см. src-tauri/src/import.rs). Идемпотентно:
# файл, который уже скачан, не трогается.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fetch() {
  local name="$1" url="$2"
  if [ -f "$DIR/$name" ]; then
    return
  fi
  echo "скачиваю $name..."
  curl -fL -o "$DIR/$name" "$url"
}

fetch text-detection.rten "https://ocrs-models.s3-accelerate.amazonaws.com/text-detection.rten"
fetch text-recognition.rten "https://ocrs-models.s3-accelerate.amazonaws.com/text-recognition.rten"
