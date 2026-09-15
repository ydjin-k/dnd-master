mod adventure;
mod characters;
mod combat;
mod dice;
mod model;
mod oracle;
mod rules;
mod spells;
mod storage;

use adventure::{demo_adventure, roll_table, Adventure};
use combat::MonsterTemplate;
use model::{AdventureLogEntry, CampaignState, Character};
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

#[tauri::command]
fn get_bestiary(app: AppHandle) -> Result<Vec<MonsterTemplate>, String> {
    combat::load_bestiary(&app)
}

#[tauri::command]
fn get_bestiary_image(
    app: AppHandle,
    semaphore: tauri::State<combat::ResizeSemaphore>,
    image_asset: String,
    max_size: u32,
) -> Result<String, String> {
    combat::load_bestiary_image(&app, &image_asset, max_size, &semaphore)
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

#[tauri::command]
fn start_combat(
    app: AppHandle,
    monster_ids: Vec<String>,
    character_ids: Vec<String>,
) -> Result<CampaignState, String> {
    let mut state = active(&app)?;

    let bestiary = combat::load_bestiary(&app)?;
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

/// Владелец списания ячейки заклинания: `combat::cast_spell` не видит `Character`
/// (ячейки — ресурс персонажа между боями, не боевого состояния), поэтому проверка
/// «известно ли заклинание» и списание ячейки 1 круга происходят здесь, на уровне
/// команды. Слот проверяется и тратится вокруг единственного резолва эффекта — если
/// `combat::cast_spell` вернёт ошибку (нет цели, заклинатель повержен и т.п.), ячейка
/// не будет потрачена впустую.
fn cast_spell_action(
    state: &mut CampaignState,
    caster_id: &str,
    spell: &Spell,
    target_id: Option<&str>,
) -> Result<(), String> {
    let character = state
        .characters
        .iter()
        .find(|c| c.id == caster_id)
        .ok_or_else(|| format!("персонаж {caster_id:?} не найден"))?;

    if spell.level == 0 {
        if !character.known_cantrips.contains(&spell.id) {
            return Err(format!("заговор «{}» не изучен персонажем", spell.name));
        }
    } else {
        if !character.castable_spells.contains(&spell.id) {
            return Err(format!("заклинание «{}» не изучено персонажем", spell.name));
        }
        if character.free_spell_slot_index(spell.level).is_none() {
            return Err(format!("нет свободных ячеек {} круга или выше", spell.level));
        }
    }

    let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
    combat::cast_spell(combat_state, caster_id, spell, target_id)?;

    if spell.level > 0 {
        let caster = state
            .characters
            .iter_mut()
            .find(|c| c.id == caster_id)
            .unwrap();
        let slot = caster.free_spell_slot_index(spell.level).unwrap();
        caster.spell_slots_current[slot] -= 1;
    }

    Ok(())
}

#[tauri::command]
fn combat_cast_spell(
    app: AppHandle,
    caster_id: String,
    spell_id: String,
    target_id: Option<String>,
) -> Result<CampaignState, String> {
    let spells = spells::load_spells(&app)?;
    let spell = spells
        .into_iter()
        .find(|s| s.id == spell_id)
        .ok_or_else(|| format!("заклинание {spell_id:?} не найдено"))?;

    storage::with_active_locked(&app, |state| {
        cast_spell_action(state, &caster_id, &spell, target_id.as_deref())
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(combat::ResizeSemaphore::new(combat::default_resize_concurrency()))
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
            get_bestiary,
            get_bestiary_image,
            get_rules,
            get_spells,
            get_character_presets,
            start_combat,
            move_combatant,
            combat_attack,
            combat_cast_spell,
            apply_damage,
            end_turn,
            monster_auto_turn,
            end_combat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use model::{CombatState, Combatant};

    fn combatant(id: &str) -> Combatant {
        Combatant {
            id: id.into(),
            name: id.into(),
            is_monster: false,
            x: 0,
            y: 0,
            speed_feet: 30,
            max_hp: 10,
            current_hp: 10,
            armor_class: 10,
            attack_bonus: 3,
            damage_dice: "1d6".into(),
            initiative: 0,
            feet_moved_this_turn: 0,
        }
    }

    fn combat_state_with(combatant: Combatant) -> CombatState {
        CombatState {
            grid_width: 12,
            grid_height: 10,
            turn_order: vec![combatant.id.clone()],
            combatants: vec![combatant],
            current_turn_index: 0,
            round: 1,
            log: Vec::new(),
            finished: false,
        }
    }

    fn test_spell(level: u8) -> Spell {
        Spell {
            id: "test-spell".into(),
            name: "Тестовое заклинание".into(),
            level,
            school: "Testing".into(),
            casting_time: "1 действие".into(),
            range: "60 футов".into(),
            components: "В, С".into(),
            duration: "Мгновенная".into(),
            concentration: false,
            ritual: false,
            classes: vec![],
            description: String::new(),
            damage_dice: None,
            damage_type: None,
            attack_roll: false,
            saving_throw: None,
        }
    }

    #[test]
    fn cast_spell_action_rejects_unknown_spell() {
        let mut state = CampaignState {
            characters: vec![model::Character {
                id: "pc".into(),
                name: "pc".into(),
                ..Default::default()
            }],
            combat: Some(combat_state_with(combatant("pc"))),
            ..Default::default()
        };
        let spell = test_spell(1);

        let err = cast_spell_action(&mut state, "pc", &spell, None).unwrap_err();
        assert!(err.contains("не изучено"));
    }

    #[test]
    fn cast_spell_action_second_cast_with_no_slots_left_is_rejected_and_slot_stays_at_zero() {
        let mut state = CampaignState {
            characters: vec![model::Character {
                id: "pc".into(),
                name: "pc".into(),
                castable_spells: vec!["test-spell".into()],
                spell_slots_max: vec![1, 0, 0, 0, 0],
                spell_slots_current: vec![1, 0, 0, 0, 0],
                ..Default::default()
            }],
            combat: Some(combat_state_with(combatant("pc"))),
            ..Default::default()
        };
        let spell = test_spell(1);

        cast_spell_action(&mut state, "pc", &spell, None).unwrap();
        assert_eq!(state.characters[0].spell_slots_current[0], 0);

        let err = cast_spell_action(&mut state, "pc", &spell, None).unwrap_err();
        assert!(err.contains("ячеек"));
        assert_eq!(
            state.characters[0].spell_slots_current[0], 0,
            "ячейка не должна уйти в минус"
        );
    }

    #[test]
    fn cast_spell_action_cantrip_never_touches_slots() {
        let mut state = CampaignState {
            characters: vec![model::Character {
                id: "pc".into(),
                name: "pc".into(),
                known_cantrips: vec!["test-spell".into()],
                spell_slots_max: vec![1, 0, 0, 0, 0],
                spell_slots_current: vec![1, 0, 0, 0, 0],
                ..Default::default()
            }],
            combat: Some(combat_state_with(combatant("pc"))),
            ..Default::default()
        };
        let spell = test_spell(0);

        cast_spell_action(&mut state, "pc", &spell, None).unwrap();
        cast_spell_action(&mut state, "pc", &spell, None).unwrap();

        assert_eq!(state.characters[0].spell_slots_current[0], 1);
    }
}
