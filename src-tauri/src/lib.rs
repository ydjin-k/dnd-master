mod adventure;
mod dice;
mod model;
mod storage;

use adventure::{demo_adventure, roll_table, Adventure};
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_campaign,
            save_campaign,
            roll_dice,
            get_adventure,
            start_adventure,
            choose_option,
            submit_custom_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
