mod characters;
mod combat;
mod dice;
mod model;
mod rules;
mod spells;
mod storage;

use combat::MonsterTemplate;
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

#[tauri::command]
fn start_combat(
    app: AppHandle,
    monster_ids: Vec<String>,
    character_ids: Vec<String>,
) -> Result<CampaignState, String> {
    // Бестиарий — ресурс приложения, а не кампании: читается ДО взятия замка,
    // тем же порядком, что заклинания в `combat_cast_spell`. Под замком
    // остаётся только работа с документом кампании.
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

    storage::with_active_locked(&app, |state| {
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
        Ok(())
    })
}

#[tauri::command]
fn move_combatant(app: AppHandle, combatant_id: String, x: i32, y: i32) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
        combat::move_combatant(combat_state, &combatant_id, x, y)
    })
}

#[tauri::command]
fn combat_attack(app: AppHandle, attacker_id: String, target_id: String) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
        combat::attack(combat_state, &attacker_id, &target_id)
    })
}

#[tauri::command]
fn apply_damage(app: AppHandle, target_id: String, delta: i32) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
        combat::apply_damage(combat_state, &target_id, delta)
    })
}

#[tauri::command]
fn end_turn(app: AppHandle) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
        combat::end_turn(combat_state)
    })
}

#[tauri::command]
fn monster_auto_turn(app: AppHandle) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, |state| {
        let combat_state = state.combat.as_mut().ok_or("бой не начат")?;
        combat::monster_auto_turn(combat_state)?;
        Ok(())
    })
}

/// Завершение боя: боевое состояние выбрасывается целиком — и ничего из него
/// НЕ переезжает в листы персонажей.
///
/// `Combatant.current_hp` — рабочая копия на время боя, а владелец
/// `Character.current_hp` один, и это игрок: урон, полученный в бою, он
/// переносит на лист сам, когда сочтёт нужным (решение владельца 24.09.2026,
/// карточка `combat-damage-reaches-character-sheet`). Раньше тут напрашивался
/// автоматический перенос — он отменён, и вернуть его молча нельзя: тело
/// команды вынесено сюда отдельной функцией ровно затем, чтобы проба
/// `combat_damage_never_reaches_the_character_sheet` держала его за руку.
fn end_combat_action(state: &mut CampaignState) -> Result<(), String> {
    state.combat = None;
    Ok(())
}

#[tauri::command]
fn end_combat(app: AppHandle) -> Result<CampaignState, String> {
    storage::with_active_locked(&app, end_combat_action)
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
            attack_bonus: Some(3),
            damage_dice: Some("1d6".into()),
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

    /// ОТРИЦАТЕЛЬНАЯ проба: бой ранил персонажа и кончился — на листе те же
    /// хиты, с какими персонаж в бой вошёл.
    ///
    /// Это ожидаемый исход, а не дефект: владелец 24.09.2026 решил, что хиты
    /// на листе уменьшает сам игрок, вручную (карточка
    /// `combat-damage-reaches-character-sheet`). Проба стоит сторожем на этом
    /// решении — она обязана покраснеть, если кто-нибудь когда-нибудь вернёт
    /// автоматический перенос хитов из боя в лист.
    #[test]
    fn combat_damage_never_reaches_the_character_sheet() {
        let mut state = CampaignState {
            characters: vec![model::Character {
                id: "pc".into(),
                name: "Герой".into(),
                max_hp: 12,
                current_hp: 12,
                ..Default::default()
            }],
            ..Default::default()
        };
        let monsters = vec![combat::test_monster_template("wolf")];

        state.combat = Some(combat::start_combat(&monsters, &state.characters).unwrap());
        combat::apply_damage(state.combat.as_mut().unwrap(), "pc", 7).unwrap();

        // В бою урон дошёл — рабочая копия бойца его получила.
        let in_combat = state
            .combat
            .as_ref()
            .unwrap()
            .combatants
            .iter()
            .find(|c| c.id == "pc")
            .unwrap();
        assert_eq!(in_combat.current_hp, 5, "боец в бою обязан получить урон");

        end_combat_action(&mut state).unwrap();

        assert!(state.combat.is_none(), "бой закончился — боевого состояния нет");
        assert_eq!(
            state.characters[0].current_hp, 12,
            "лист персонажа бой НЕ правит: хиты уменьшает сам игрок, вручную"
        );
        assert_eq!(state.characters[0].max_hp, 12);
    }

    /// Обратное направление той же границы: урон, нанесённый монстру, боя не
    /// переживает, а шаблон бестиария не трогается вовсе — монстр в бестиарии
    /// запись-образец, а не существо со своей судьбой.
    #[test]
    fn monster_damage_dies_with_the_combat_and_never_touches_the_bestiary_template() {
        let mut state = CampaignState {
            characters: vec![model::Character {
                id: "pc".into(),
                name: "Герой".into(),
                max_hp: 12,
                current_hp: 12,
                ..Default::default()
            }],
            ..Default::default()
        };
        let monsters = vec![combat::test_monster_template("wolf")];
        let template_hp_before = monsters[0].max_hp;

        state.combat = Some(combat::start_combat(&monsters, &state.characters).unwrap());
        let monster_id = state
            .combat
            .as_ref()
            .unwrap()
            .combatants
            .iter()
            .find(|c| c.is_monster)
            .unwrap()
            .id
            .clone();
        combat::apply_damage(state.combat.as_mut().unwrap(), &monster_id, 4).unwrap();

        end_combat_action(&mut state).unwrap();

        assert!(state.combat.is_none(), "раненого волка после боя больше нет нигде");
        assert_eq!(
            monsters[0].max_hp, template_hp_before,
            "шаблон бестиария урон не запоминает"
        );
    }
}
