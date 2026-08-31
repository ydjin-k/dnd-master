mod adventure;
mod combat;
mod dice;
mod import;
mod model;
mod oracle;
mod rules;
mod spells;
mod storage;

use adventure::{demo_adventure, roll_table, Adventure};
use combat::MonsterTemplate;
use model::{AdventureLogEntry, CampaignState};
use oracle::{LikelihoodOption, Likelihood, OracleResult};
use rules::RuleTopic;
use spells::Spell;
use storage::CampaignSummary;
use tauri::AppHandle;

fn active(app: &AppHandle) -> Result<CampaignState, String> {
    storage::load_active(app)?.ok_or_else(|| "нет активной кампании".to_string())
}

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

#[tauri::command]
fn save_campaign(app: AppHandle, state: CampaignState) -> Result<(), String> {
    storage::save_campaign(&app, &state)
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
fn get_adventure() -> Adventure {
    demo_adventure()
}

#[tauri::command]
fn start_adventure(app: AppHandle) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        if state.current_scene_id.is_none() {
            let adventure = demo_adventure();
            let scene = adventure
                .scene(&adventure.start_scene_id)
                .ok_or("в демо-приключении не найдена стартовая сцена")?;
            state.current_scene_id = Some(adventure.start_scene_id.clone());
            state
                .adventure_log
                .push(AdventureLogEntry::Scene(scene.text.clone()));
        }
        Ok(())
    })
}

#[tauri::command]
fn choose_option(app: AppHandle, option_id: String) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
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
        Ok(())
    })
}

#[tauri::command]
fn submit_custom_action(app: AppHandle, text: String) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        state.adventure_log.push(AdventureLogEntry::Custom(text));
        Ok(())
    })
}

#[tauri::command]
fn get_oracle_likelihoods() -> Vec<LikelihoodOption> {
    oracle::likelihood_options()
}

#[tauri::command]
fn ask_oracle(
    app: AppHandle,
    question: String,
    likelihood: Likelihood,
) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let result: OracleResult = oracle::ask(likelihood, state.chaos_factor as i32);

        let mut text = format!(
            "«{}» ({}) → {} (бросок {})",
            question.trim(),
            likelihood.label(),
            result.answer.label(),
            result.roll
        );
        if let Some(focus) = &result.random_event {
            text.push_str(&format!(". Случайное событие: {focus}"));
        }
        state.adventure_log.push(AdventureLogEntry::Oracle(text));
        Ok(())
    })
}

#[tauri::command]
fn adjust_chaos_factor(app: AppHandle, delta: i32) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let next = (state.chaos_factor as i32 + delta)
            .clamp(oracle::MIN_CHAOS_FACTOR, oracle::MAX_CHAOS_FACTOR);
        state.chaos_factor = next as u8;
        Ok(())
    })
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
        "pdf" => import::extract_text_from_pdf(&app, &path),
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
fn get_rules(app: AppHandle) -> Result<Vec<RuleTopic>, String> {
    rules::load_rules(&app)
}

#[tauri::command]
fn get_spells(app: AppHandle) -> Result<Vec<Spell>, String> {
    spells::load_spells(&app)
}

#[tauri::command]
fn start_combat(
    app: AppHandle,
    monster_ids: Vec<String>,
    character_ids: Vec<String>,
) -> Result<CampaignState, String> {
    let mut state = active(&app)?;

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
    storage::save_campaign(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn move_combatant(app: AppHandle, combatant_id: String, x: i32, y: i32) -> Result<CampaignState, String> {
    let mut state = active(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::move_combatant(combat_state, &combatant_id, x, y)?;
    storage::save_campaign(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn combat_attack(app: AppHandle, attacker_id: String, target_id: String) -> Result<CampaignState, String> {
    let mut state = active(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::attack(combat_state, &attacker_id, &target_id)?;
    storage::save_campaign(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn apply_damage(app: AppHandle, target_id: String, delta: i32) -> Result<CampaignState, String> {
    let mut state = active(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::apply_damage(combat_state, &target_id, delta)?;
    storage::save_campaign(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn end_turn(app: AppHandle) -> Result<CampaignState, String> {
    let mut state = active(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::end_turn(combat_state)?;
    storage::save_campaign(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn monster_auto_turn(app: AppHandle) -> Result<CampaignState, String> {
    let mut state = active(&app)?;
    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::monster_auto_turn(combat_state)?;
    storage::save_campaign(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn end_combat(app: AppHandle) -> Result<CampaignState, String> {
    let mut state = active(&app)?;
    state.combat = None;
    storage::save_campaign(&app, &state)?;
    Ok(state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_active_campaign,
            list_campaigns,
            create_campaign,
            switch_campaign,
            delete_campaign,
            save_campaign,
            roll_dice,
            roll_ability_scores,
            get_adventure,
            start_adventure,
            choose_option,
            submit_custom_action,
            get_oracle_likelihoods,
            ask_oracle,
            adjust_chaos_factor,
            import_character_sheet,
            get_bestiary,
            get_rules,
            get_spells,
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
