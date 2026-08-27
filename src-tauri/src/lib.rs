mod adventure;
mod combat;
mod dice;
mod import;
mod model;
mod storage;

use adventure::{demo_adventure, roll_table, Adventure};
use combat::MonsterTemplate;
use model::{AdventureLogEntry, CampaignState};
use tauri::AppHandle;

#[tauri::command]
fn load_campaign(app: AppHandle) -> Result<CampaignState, String> {
    storage::load_state(&app)
}

#[tauri::command]
fn save_campaign(app: AppHandle, state: CampaignState) -> Result<(), String> {
    storage::save_state(&app, &state)
}

#[tauri::command]
fn roll_dice(expression: String) -> Result<dice::RollResult, String> {
    dice::roll_expression(&expression)
}

#[tauri::command]
fn get_adventure() -> Adventure {
    demo_adventure()
}

#[tauri::command]
fn start_adventure(app: AppHandle) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;
    if state.current_scene_id.is_none() {
        let adventure = demo_adventure();
        let scene = adventure
            .scene(&adventure.start_scene_id)
            .ok_or("в демо-приключении не найдена стартовая сцена")?;
        state.current_scene_id = Some(adventure.start_scene_id.clone());
        state
            .adventure_log
            .push(AdventureLogEntry::Scene(scene.text.clone()));
        storage::save_state(&app, &state)?;
    }
    Ok(state)
}

#[tauri::command]
fn choose_option(app: AppHandle, option_id: String) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;
    let adventure = demo_adventure();

    let current_id = state
        .current_scene_id
        .clone()
        .unwrap_or_else(|| adventure.start_scene_id.clone());
    let scene = adventure
        .scene(&current_id)
        .ok_or_else(|| format!("сцена {current_id:?} не найдена"))?;
    let option = scene
        .options
        .iter()
        .find(|o| o.id == option_id)
        .ok_or_else(|| format!("вариант {option_id:?} не найден в сцене {current_id:?}"))?;

    state
        .adventure_log
        .push(AdventureLogEntry::Choice(option.label.clone()));

    let next_scene_id = if let Some(table_id) = &option.table_id {
        let table = adventure
            .table(table_id)
            .ok_or_else(|| format!("таблица {table_id:?} не найдена"))?;
        let entry = roll_table(table)?;
        state
            .adventure_log
            .push(AdventureLogEntry::Roll(entry.text.clone()));
        entry.next_scene_id.unwrap_or_else(|| current_id.clone())
    } else {
        option
            .next_scene_id
            .clone()
            .unwrap_or_else(|| current_id.clone())
    };

    let next_scene = adventure
        .scene(&next_scene_id)
        .ok_or_else(|| format!("сцена {next_scene_id:?} не найдена"))?;
    state
        .adventure_log
        .push(AdventureLogEntry::Scene(next_scene.text.clone()));
    state.current_scene_id = Some(next_scene_id);

    storage::save_state(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn submit_custom_action(app: AppHandle, text: String) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;
    state.adventure_log.push(AdventureLogEntry::Custom(text));
    storage::save_state(&app, &state)?;
    Ok(state)
}

/// Достаёт текст из PDF/DOCX/TXT или распознаёт его на фото (офлайн-OCR).
/// Выбор способа — по расширению файла.
#[tauri::command]
fn import_character_sheet(app: AppHandle, path: String) -> Result<String, String> {
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "pdf" => import::extract_text_from_pdf(&path),
        "docx" => import::extract_text_from_docx(&path),
        "txt" => import::extract_text_from_txt(&path),
        "png" | "jpg" | "jpeg" | "bmp" | "webp" => import::extract_text_from_image(&app, &path),
        other => Err(format!("формат {other:?} не поддерживается (PDF, DOCX, TXT, PNG/JPG)")),
    }
}

#[tauri::command]
fn get_bestiary() -> Vec<MonsterTemplate> {
    combat::demo_bestiary()
}

#[tauri::command]
fn start_combat(
    app: AppHandle,
    monster_ids: Vec<String>,
    character_ids: Vec<String>,
) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;

    let bestiary = combat::demo_bestiary();
    let monsters: Vec<MonsterTemplate> = monster_ids
        .iter()
        .map(|id| {
            bestiary
                .iter()
                .find(|m| &m.id == id)
                .cloned()
                .ok_or_else(|| format!("монстр {id:?} не найден в бестиарии"))
        })
        .collect::<Result<_, String>>()?;
    let characters: Vec<model::Character> = character_ids
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

    state.combat = Some(combat::start_combat(&monsters, &characters)?);
    storage::save_state(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn move_combatant(app: AppHandle, combatant_id: String, x: i32, y: i32) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::move_combatant(combat_state, &combatant_id, x, y)?;
    storage::save_state(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn combat_attack(app: AppHandle, attacker_id: String, target_id: String) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::attack(combat_state, &attacker_id, &target_id)?;
    storage::save_state(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn apply_damage(app: AppHandle, target_id: String, delta: i32) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::apply_damage(combat_state, &target_id, delta)?;
    storage::save_state(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn end_turn(app: AppHandle) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::end_turn(combat_state)?;
    storage::save_state(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn monster_auto_turn(app: AppHandle) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::monster_auto_turn(combat_state)?;
    storage::save_state(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn end_combat(app: AppHandle) -> Result<CampaignState, String> {
    let mut state = storage::load_state(&app)?;
    state.combat = None;
    storage::save_state(&app, &state)?;
    Ok(state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_campaign,
            save_campaign,
            roll_dice,
            get_adventure,
            start_adventure,
            choose_option,
            submit_custom_action,
            import_character_sheet,
            get_bestiary,
            start_combat,
            move_combatant,
            combat_attack,
            apply_damage,
            end_turn,
            monster_auto_turn,
            end_combat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
