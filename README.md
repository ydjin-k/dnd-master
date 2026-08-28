# D&D Master

Приложение-мастер для D&D 5e. Концепт и границы v1 — в [`GAME.md`](./GAME.md).

Процесс разработки (роли, правила, приборы) — в [`gamestudio/`](./gamestudio/README.md).

## Стек

Tauri 2 (Rust) + React/TypeScript.

## Разработка

```sh
npm install
bash src-tauri/models/fetch-models.sh
bash src-tauri/pdfium/fetch-pdfium.sh
npm run tauri dev
```

Модели OCR и библиотека PDFium не лежат в git (см. `.gitignore`) — без этих двух скриптов импорт
листа персонажа (фото/PDF) не заработает, а часть `cargo test` не соберётся.
