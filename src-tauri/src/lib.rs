mod bestiary;
mod characters;
mod combat;
mod dice;
mod model;
mod players;
mod pngfile;
mod rules;
mod spells;
mod storage;

use bestiary::MonsterTemplate;
use model::{CampaignState, Character};
use rules::RuleTopic;
use spells::Spell;
use storage::CampaignSummary;
use tauri::AppHandle;

#[tauri::command]
fn load_active_campaign(app: AppHandle) -> Result<Option<CampaignState>, String> {
    storage::load_active(&app)
}

#[tauri::command]
fn list_campaigns(app: AppHandle) -> Result<Vec<CampaignSummary>, String> {
    storage::list_campaigns(&app)
}

#[tauri::command]
fn create_campaign(app: AppHandle, name: String) -> Result<CampaignState, String> {
    storage::create_campaign(&app, name)
}

#[tauri::command]
fn switch_campaign(app: AppHandle, id: String) -> Result<CampaignState, String> {
    storage::switch_campaign(&app, id)
}

#[tauri::command]
fn delete_campaign(app: AppHandle, id: String) -> Result<(), String> {
    storage::delete_campaign(&app, &id)
}

/// Запись с фронта — и только тех полей, которыми фронт владеет.
///
/// Аргумент назван `state` и не переименован специально: фронт шлёт документ
/// целиком (`persist(next)`), и ломать вызов ради имени незачем. Важно
/// другое — тип аргумента больше не `CampaignState`: `FrontOwnedFields`
/// физически некуда положить `combat`, поэтому устаревший снимок
/// чужого поля не доезжает до диска даже теоретически. Список владений и
/// обоснование — в `storage::FrontOwnedFields`.
#[tauri::command]
fn save_campaign(app: AppHandle, state: storage::FrontOwnedFields) -> Result<(), String> {
    storage::save_front_owned(&app, state)
}

#[tauri::command]
fn roll_dice(expression: String) -> Result<dice::RollResult, String> {
    dice::roll_expression(&expression)
}

#[tauri::command]
fn roll_ability_scores() -> Vec<dice::AbilityScoreRoll> {
    dice::roll_ability_scores()
}

#[tauri::command]
fn get_bestiary(app: AppHandle) -> Result<Vec<MonsterTemplate>, String> {
    bestiary::load_bestiary(&app)
}

#[tauri::command]
fn get_bestiary_image(
    app: AppHandle,
    semaphore: tauri::State<bestiary::ResizeSemaphore>,
    image_asset: String,
    max_size: u32,
) -> Result<String, String> {
    bestiary::load_bestiary_image(&app, &image_asset, max_size, &semaphore)
}

#[tauri::command]
fn get_rules(app: AppHandle) -> Result<Vec<RuleTopic>, String> {
    rules::load_rules(&app)
}

#[tauri::command]
fn get_spells(app: AppHandle) -> Result<Vec<Spell>, String> {
    spells::load_spells(&app)
}

/// Пресеты готовых персонажей: обычные `Character`, которые UI копирует в
/// ростер с новым `id`. Никакого признака «откуда взялся персонаж» в ростере
/// не появляется — прогрессия дальше не различает пресет и мастера.
#[tauri::command]
fn get_character_presets(app: AppHandle) -> Result<Vec<Character>, String> {
    characters::load_character_presets(&app)
}

// ── боевые команды ───────────────────────────────────────────────────────────
//
// Владелец записи боевого состояния — сама боевая команда, и тело каждой из
// них ходит ОДНИМ вызовом `storage::with_active_locked`: чтение с диска,
// мутация и запись под одним удержанием замка.
//
// Раньше здесь было два захвата — `active(&app)` на чтение и
// `storage::save_campaign(&app, &state)` на запись целого документа, — и между
// ними оставалось окно: чужая команда, попавшая внутрь, записывала своё поле,
// а идущая за ней запись боя ложилась поверх снимком, снятым ДО неё, и чужая
// работа исчезала. Это тот же класс, что запись 136 в `tasks/DONE.md` и
// карточка 138, только последний путь, где он оставался. Поймано это было на
// снесённом движке мастера, но причина в захватах, а не в том, кто писал
// второе поле, — поэтому один замок здесь остаётся.

/// Добавить участников: существ по `id` шаблона (повтор `id` — ещё один боец
/// того же вида, так приходят «пять волков») и персонажей кампании. Боя нет —
/// он заводится первым добавлением.
///
/// Этой же командой поднимает бой генератор событий («Поднять бой» на строке с
/// `monsterIds`): твари строки и все персонажи кампании; уже стоящие в бою
/// персонажи вторично не встают.
fn add_to_combat_action(
    state: &mut CampaignState,
    monsters: &[MonsterTemplate],
    character_ids: &[String],
) -> Result<(), String> {
    let characters: Vec<Character> = character_ids
        .iter()
        .map(|id| {
            state
                .characters
                .iter()
                .find(|c| &c.id == id)
                .cloned()
                .ok_or_else(|| format!("персонаж {id:?} не найден"))
        })
        .collect::<Result<_, String>>()?;

    let combat_state = state.combat.get_or_insert_with(combat::new_combat);
    for m in monsters {
        combat::add_monsters(combat_state, m, 1)?;
    }
    combat::add_characters(combat_state, &characters);
    Ok(())
}

#[tauri::command]
fn combat_add(
    app: AppHandle,
    monster_ids: Vec<String>,
    character_ids: Vec<String>,
) -> Result<CampaignState, String> {
    // Бестиарий — ресурс приложения, а не кампании: читается ДО взятия замка.
    // Под замком остаётся только работа с документом кампании.
    let bestiary = bestiary::load_bestiary(&app)?;
    let monsters: Vec<MonsterTemplate> = monster_ids
        .iter()
        .map(|id| {
            bestiary
                .iter()
                .find(|m| &m.id == id)
                .cloned()
                .ok_or_else(|| format!("существо {id:?} не найдено в бестиарии"))
        })
        .collect::<Result<_, String>>()?;

    storage::with_active_locked(&app, |state| {
        add_to_combat_action(state, &monsters, &character_ids)
    })
}

#[tauri::command]
fn combat_roll_initiative(
    app: AppHandle,
    dex_modifiers: std::collections::HashMap<String, i32>,
) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("боя нет")?;
        combat::roll_initiative(combat_state, &dex_modifiers)
    })
}

#[tauri::command]
fn combat_next_turn(app: AppHandle, fallen: Vec<bool>) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("боя нет")?;
        combat::next_turn(combat_state, &fallen)
    })
}

#[tauri::command]
fn combat_set_player_rules(app: AppHandle, target_id: String, on: bool) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("боя нет")?;
        combat::set_player_rules(combat_state, &target_id, on)
    })
}

#[tauri::command]
fn combat_set_death_saves(
    app: AppHandle,
    target_id: String,
    successes: u32,
    failures: u32,
) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("боя нет")?;
        combat::set_death_saves(combat_state, &target_id, successes, failures)
    })
}

#[tauri::command]
fn apply_damage(app: AppHandle, target_id: String, delta: i32) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("боя нет")?;
        combat::apply_damage(combat_state, &target_id, delta)
    })
}

/// Убрать участника. Если в линии никого не осталось, боя больше нет —
/// как и до первого добавления.
fn remove_combatant_action(
    state: &mut CampaignState,
    target_id: &str,
    position: usize,
) -> Result<(), String> {
    let combat_state = state.combat.as_mut().ok_or("боя нет")?;
    combat::remove_combatant(combat_state, target_id, position)?;
    if combat_state.combatants.is_empty() {
        state.combat = None;
    }
    Ok(())
}

#[tauri::command]
fn combat_remove(app: AppHandle, target_id: String, position: usize) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        remove_combatant_action(state, &target_id, position)
    })
}

/// Перенос боевых хитов в листы — ТОЛЬКО по нажатию, отдельной командой.
/// Бой при этом продолжается. Обратная сторона той же границы —
/// `end_combat_action` ниже: сам по себе бой лист не правит.
fn transfer_hp_action(state: &mut CampaignState) -> Result<(), String> {
    let combat_state = state.combat.as_ref().ok_or("боя нет")?;
    combat::transfer_hp_to_sheets(combat_state, &mut state.characters);
    Ok(())
}

#[tauri::command]
fn combat_transfer_hp_to_sheets(app: AppHandle) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, transfer_hp_action)
}

/// Завершение боя: боевое состояние выбрасывается целиком — и ничего из него
/// НЕ переезжает в листы персонажей.
///
/// `Combatant.current_hp` — рабочая копия на время боя, а владелец
/// `Character.current_hp` один, и это игрок: урон, полученный в бою, на лист
/// переносит человек — вручную на листе или кнопкой «Перенести хиты в листы»
/// (`transfer_hp_action`), когда сочтёт нужным (решение владельца 24.09.2026,
/// карточка `combat-damage-reaches-character-sheet`, уточнено 09.10.2026
/// карточкой `combat-reduce-to-tracker`). Автоматический перенос отменён, и
/// вернуть его молча нельзя: тело команды вынесено сюда отдельной функцией
/// ровно затем, чтобы проба `combat_damage_never_reaches_the_character_sheet`
/// держала его за руку.
fn end_combat_action(state: &mut CampaignState) -> Result<(), String> {
    state.combat = None;
    Ok(())
}

#[tauri::command]
fn end_combat(app: AppHandle) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, end_combat_action)
}

// ── окно «для игроков» ───────────────────────────────────────────────────────
//
// Три команды и ни одной лишней: открыть окно, отдать ему схему, спросить
// текущую. Правило «что видно игрокам» живёт на фронте
// (`src/ui/dungeons/mapAudience.ts`), и схема приходит сюда уже
// отредактированной — Rust её не читает и не правит. Почему схема идёт через
// Rust, а не из окна в окно, — в `players.rs`.

/// `async` — не украшение: окно создаётся не на главном потоке.
///
/// Обычная (не-`async`) команда Tauri выполняется НА ГЛАВНОМ потоке, а
/// `WebviewWindowBuilder::build()` оттуда ждёт шаг цикла событий, который
/// крутится на том же потоке, — и приложение встаёт насмерть. Это проверено
/// руками: окно появлялось пустым (`about:blank`), а главное окно перестало
/// отвечать на вызовы вовсе. С `async` команда уходит в асинхронный
/// исполнитель, создание окна отдаётся циклу событий, и тот его выполняет.
/// Кнопка «Выйти»: приложение запускается на весь экран, как игра, и
/// крестика заголовка у него нет (владелец 22.10.2026). Выход — всего
/// приложения, а не окна мастера: иначе открытое окно игроков держало бы
/// процесс живым без единого окна, из которого им управлять. Сохранять перед
/// выходом нечего — кампания пишется на диск при каждой правке.
#[tauri::command]
fn app_exit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn players_window_open(app: AppHandle) -> Result<(), String> {
    players::open(&app)
}

#[tauri::command]
fn players_map_set(
    app: AppHandle,
    state: tauri::State<players::PlayersMap>,
    view: Option<serde_json::Value>,
) -> Result<(), String> {
    players::publish(&app, &state, view)
}

#[tauri::command]
fn players_map_get(state: tauri::State<players::PlayersMap>) -> Result<Option<serde_json::Value>, String> {
    players::get(&state)
}

/// Положить картинку схемы подземелья в файл, выбранный в диалоге «Сохранить
/// как». Правила записи и причина, по которой это своя команда, а не плагин
/// `fs`, — в `pngfile::write_png`.
#[tauri::command]
fn save_png_file(path: String, bytes_base64: String) -> Result<(), String> {
    pngfile::write_png(&path, &bytes_base64)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(bestiary::ResizeSemaphore::new(bestiary::default_resize_concurrency()))
        .manage(players::PlayersMap::new())
        .invoke_handler(tauri::generate_handler![
            load_active_campaign,
            list_campaigns,
            create_campaign,
            switch_campaign,
            delete_campaign,
            save_campaign,
            roll_dice,
            roll_ability_scores,
            get_bestiary,
            get_bestiary_image,
            get_rules,
            get_spells,
            get_character_presets,
            combat_add,
            combat_roll_initiative,
            combat_next_turn,
            combat_set_player_rules,
            combat_set_death_saves,
            apply_damage,
            combat_remove,
            combat_transfer_hp_to_sheets,
            end_combat,
            save_png_file,
            players_window_open,
            players_map_set,
            players_map_get,
            app_exit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn campaign_with_hero() -> CampaignState {
        CampaignState {
            characters: vec![model::Character {
                id: "pc".into(),
                name: "Герой".into(),
                max_hp: 12,
                current_hp: 12,
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    fn combatant_hp(state: &CampaignState, id: &str) -> i32 {
        state
            .combat
            .as_ref()
            .unwrap()
            .combatants
            .iter()
            .find(|c| c.id == id)
            .unwrap()
            .current_hp
    }

    /// ОТРИЦАТЕЛЬНАЯ проба: бой ранил персонажа и кончился — на листе те же
    /// хиты, с какими персонаж в бой вошёл.
    ///
    /// Это ожидаемый исход, а не дефект: владелец 24.09.2026 решил, что хиты
    /// на листе сами не уменьшаются (карточка
    /// `combat-damage-reaches-character-sheet`), а 09.10.2026 уточнил: переносит
    /// человек, кнопкой (`transfer_hp_action`). Проба стоит сторожем на этом
    /// решении — она обязана покраснеть, если кто-нибудь когда-нибудь вернёт
    /// автоматический перенос хитов из боя в лист.
    #[test]
    fn combat_damage_never_reaches_the_character_sheet() {
        let mut state = campaign_with_hero();
        let monsters = vec![bestiary::test_monster_template("wolf")];

        add_to_combat_action(&mut state, &monsters, &["pc".into()]).unwrap();
        combat::apply_damage(state.combat.as_mut().unwrap(), "pc", 7).unwrap();

        // В бою урон дошёл — рабочая копия бойца его получила.
        assert_eq!(combatant_hp(&state, "pc"), 5, "боец в бою обязан получить урон");
        assert_eq!(state.characters[0].current_hp, 12, "пока бой идёт, лист тоже не тронут");

        end_combat_action(&mut state).unwrap();

        assert!(state.combat.is_none(), "бой закончился — боевого состояния нет");
        assert_eq!(
            state.characters[0].current_hp, 12,
            "лист персонажа бой НЕ правит: хиты переносит человек"
        );
        assert_eq!(state.characters[0].max_hp, 12);
    }

    /// Обратная проба к предыдущей: кнопка переноса — и только она — кладёт
    /// боевые хиты на лист каждому персонажу-участнику. Существа переноса не
    /// касаются, бой после переноса продолжается.
    ///
    /// Отрицательная проба: оставить `transfer_hp_to_sheets` пустой — краснеет
    /// строка про лист героя.
    #[test]
    fn transfer_button_puts_combat_hit_points_on_every_character_sheet() {
        let mut state = campaign_with_hero();
        state.characters.push(model::Character {
            id: "bard".into(),
            name: "Бард".into(),
            max_hp: 9,
            current_hp: 9,
            ..Default::default()
        });
        state.characters.push(model::Character {
            id: "away".into(),
            name: "Не в бою".into(),
            max_hp: 8,
            current_hp: 8,
            ..Default::default()
        });
        let monsters = vec![bestiary::test_monster_template("wolf")];
        add_to_combat_action(&mut state, &monsters, &["pc".into(), "bard".into()]).unwrap();
        let combat_state = state.combat.as_mut().unwrap();
        combat::apply_damage(combat_state, "pc", 5).unwrap();
        combat::apply_damage(combat_state, "bard", 9).unwrap();
        combat::apply_damage(combat_state, "monster-wolf-1", 4).unwrap();

        transfer_hp_action(&mut state).unwrap();

        assert_eq!(state.characters[0].current_hp, 7, "лист героя получил боевые хиты");
        assert_eq!(state.characters[1].current_hp, 0, "и лист барда — тоже, ноль тоже число");
        assert_eq!(state.characters[2].current_hp, 8, "кто не в бою — того перенос не касается");
        assert_eq!(state.characters[0].max_hp, 12, "максимум переносом не трогается");
        assert_eq!(combatant_hp(&state, "monster-wolf-1"), 7, "бой продолжается как был");
    }

    /// Обратное направление той же границы: урон, нанесённый монстру, боя не
    /// переживает, а шаблон бестиария не трогается вовсе — монстр в бестиарии
    /// запись-образец, а не существо со своей судьбой. Перенос в листы его
    /// тоже не трогает.
    #[test]
    fn monster_damage_dies_with_the_combat_and_never_touches_the_bestiary_template() {
        let mut state = campaign_with_hero();
        let monsters = vec![bestiary::test_monster_template("wolf")];
        let template_hp_before = monsters[0].max_hp;

        add_to_combat_action(&mut state, &monsters, &["pc".into()]).unwrap();
        combat::apply_damage(state.combat.as_mut().unwrap(), "monster-wolf-1", 4).unwrap();
        transfer_hp_action(&mut state).unwrap();

        end_combat_action(&mut state).unwrap();

        assert!(state.combat.is_none(), "раненого волка после боя больше нет нигде");
        assert_eq!(
            monsters[0].max_hp, template_hp_before,
            "шаблон бестиария урон не запоминает"
        );
    }

    #[test]
    fn removing_the_last_combatant_ends_the_combat_and_leaves_the_sheet_alone() {
        let mut state = campaign_with_hero();
        let monsters = vec![bestiary::test_monster_template("wolf")];
        add_to_combat_action(&mut state, &monsters, &["pc".into()]).unwrap();
        combat::apply_damage(state.combat.as_mut().unwrap(), "pc", 7).unwrap();

        remove_combatant_action(&mut state, "pc", 1).unwrap();
        assert_eq!(state.combat.as_ref().unwrap().combatants.len(), 1, "волк остался");
        assert_eq!(state.characters[0].current_hp, 12, "убранный персонаж хиты в лист не несёт");

        remove_combatant_action(&mut state, "monster-wolf-1", 0).unwrap();
        assert!(state.combat.is_none(), "в линии никого — боя нет");
    }
}
