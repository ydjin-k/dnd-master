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

Модели OCR и библиотека PDFium не лежат в git (см. `.gitignore`) — без этих скриптов часть
`cargo check`/`cargo test` не соберётся (сборка ресурсов Tauri требует, чтобы файлы уже лежали на
диске). Картинки существ бестиария (`src-tauri/bestiary/images/`) — наоборот, обычный контент в
git: владелец продукта кладёт их туда вручную, см. `src-tauri/bestiary/images/README.md`.
