#!/usr/bin/env bash
# Нативная библиотека PDFium (bblanchon/pdfium-binaries) не лежит в git — качается
# один раз при установке и дальше грузится офлайн через pdfium-render (см.
# src-tauri/src/import.rs). Идемпотентно: то, что уже скачано, не трогается.
#
# Только Windows x64 — среда разработки этого проекта сейчас только Windows.
# Под Mac/Linux сборку нужно будет добавить соответствующие ассеты отдельно
# (pdfium-mac-*.tgz / pdfium-linux-*.tgz с той же страницы релизов) — не сделано
# сейчас, потому что непроверяемо без такой машины.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Зафиксированный релиз (не "latest") — воспроизводимо, и GitHub не удаляет
# старые ассеты релизов.
RELEASE_TAG="chromium%2F8021"
ASSET="pdfium-win-x64.tgz"

if [ -f "$DIR/pdfium.dll" ]; then
  exit 0
fi

echo "скачиваю $ASSET..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fL -o "$TMP/$ASSET" "https://github.com/bblanchon/pdfium-binaries/releases/download/$RELEASE_TAG/$ASSET"
tar xzf "$TMP/$ASSET" -C "$TMP" bin/pdfium.dll LICENSE
mv "$TMP/bin/pdfium.dll" "$DIR/pdfium.dll"
mv "$TMP/LICENSE" "$DIR/PDFIUM-LICENSE"
