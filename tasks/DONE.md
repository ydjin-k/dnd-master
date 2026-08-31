# Закрытые карточки

Формат строки: `NN. имя-карточки — коммит — одна строка сути.`

1. bug-legacy-migration-error — 53cfd83 — миграция legacy campaign.json возвращает Err на битом файле вместо тихой пустой кампании, файл не переименовывается до успеха.
2. bug-campaign-atomic-write — 81af540 — storage::with_active_locked держит STORAGE_LOCK от чтения до записи одной операцией для start_adventure/choose_option/submit_custom_action/ask_oracle/adjust_chaos_factor.
3. bug-dead-combatant-occupancy — ab671d3 — клик по клетке с поверженным бойцом двигает выбранного бойца туда, а не выбирает труп.
4. characters-name-suggestions — 60057c5 — кнопка «🎲 Предложить имя» на шаге «Итог» мастера персонажа, `NAME_SUGGESTIONS` по расам + общий список, реролл без повтора.
5. characters-gender-and-age — 5c5e5a9 — поля `gender`/`age` в `Character` (TS + Rust), выбор на шаге «Итог», дефолт при импорте, показ в карточке персонажа.
6. bug-characters-dwarf-tool-horizontal-scroll (находка) — 54e5ee4 — QA нашла двойную горизонтальную прокрутку на выборе набора дварфа.
7. bug-characters-dwarf-tool-horizontal-scroll (починка) — `.wizard__pick-detail` получил `min-width: 0` + `overflow-x: hidden`, `.wizard__hint select` — `max-width: 100%`: гибкий контейнер больше не раздвигается длинным `<option>` (flexbug #1).
8. rules-spells-data — тип `Spell` (TS + Rust), `src-tauri/rules/spells.json` (24 заговора + 47 заклинаний 1 круга шести классов, официальный SRD 5.1 от WotC, CC BY 4.0 — раздел заклинаний на longstoryshort.app по-прежнему пуст), команда `get_spells`, просмотр заклинаний в разделе «Правила».
