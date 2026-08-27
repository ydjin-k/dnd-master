use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::model::CampaignState;

const STATE_FILE: &str = "campaign.json";

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("не найден каталог данных приложения: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать {dir:?}: {e}"))?;
    Ok(dir.join(STATE_FILE))
}

pub fn load_state(app: &AppHandle) -> Result<CampaignState, String> {
    let path = state_path(app)?;
    if !path.exists() {
        return Ok(CampaignState::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("не удалось прочитать {path:?}: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("повреждён {path:?}: {e}"))
}

pub fn save_state(app: &AppHandle, state: &CampaignState) -> Result<(), String> {
    let path = state_path(app)?;
    let raw = serde_json::to_string_pretty(state).map_err(|e| format!("сериализация: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("не удалось записать {path:?}: {e}"))
}
