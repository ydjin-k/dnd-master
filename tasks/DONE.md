# Закрытые карточки

Формат строки: `NN. имя-карточки — коммит — одна строка сути.`

1. bug-legacy-migration-error — 53cfd83 — миграция legacy campaign.json возвращает Err на битом файле вместо тихой пустой кампании, файл не переименовывается до успеха.
2. bug-campaign-atomic-write — 81af540 — storage::with_active_locked держит STORAGE_LOCK от чтения до записи одной операцией для start_adventure/choose_option/submit_custom_action/ask_oracle/adjust_chaos_factor.
3. bug-dead-combatant-occupancy — ab671d3 — клик по клетке с поверженным бойцом двигает выбранного бойца туда, а не выбирает труп.
