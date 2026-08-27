mod model;
mod storage;

use model::CampaignState;
use tauri::AppHandle;

#[tauri::command]
fn load_campaign(app: AppHandle) -> Result<CampaignState, String> {
    storage::load_state(&app)
}

#[tauri::command]
fn save_campaign(app: AppHandle, state: CampaignState) -> Result<(), String> {
    storage::save_state(&app, &state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_campaign, save_campaign])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
