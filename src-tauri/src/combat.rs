//! Трекер боя: участники, броски инициативы, указатель хода, раунд и хиты.
//!
//! Раздел ведёт учёт, а не правила (решение владельца 09.10.2026, карточка
//! `combat-reduce-to-tracker`): броски атак, урон, заклинания и перемещение
//! разрешает Мастер за столом. Порядок ходов и подписи бойцов здесь не
//! хранятся — их выводит фронт (`src/ui/combatTracker.ts`) из того, что лежит
//! в `CombatState`.

use std::collections::HashMap;

use crate::bestiary::MonsterTemplate;
use crate::dice;
use crate::model::{Character, CombatState, Combatant, CombatantSource, InitiativeRoll};

/// Пустой бой: первый раунд, указатель на первом. Бой заводится, когда в него
/// добавляют первого участника, — отдельной кнопки «начать» у раздела нет.
pub fn new_combat() -> CombatState {
    CombatState {
        combatants: Vec::new(),
        current_turn_index: 0,
        round: 1,
    }
}

/// Добавить персонажей кампании. Персонаж, который уже в бою, пропускается:
/// второй его копии в линии быть не может, а «Поднять бой» из генератора
/// событий зовёт всех персонажей сразу, в том числе уже стоящих.
///
/// Хиты берутся с листа как есть — `current_hp`, а не максимум: в бой входят
/// с теми хитами, с какими подошли.
pub fn add_characters(state: &mut CombatState, characters: &[Character]) {
    for ch in characters {
        let already = state.combatants.iter().any(|c| {
            matches!(&c.source, CombatantSource::Character { character_id } if character_id == &ch.id)
        });
        if already {
            continue;
        }
        state.combatants.push(Combatant {
            id: ch.id.clone(),
            source: CombatantSource::Character {
                character_id: ch.id.clone(),
            },
            max_hp: ch.max_hp,
            current_hp: ch.current_hp,
            initiative_roll: None,
        });
    }
}

/// Добавить `count` существ одного вида. У каждого свои хиты (максимум из
/// шаблона) и свой номер: следующий за старшим уже стоящим этого вида, так что
/// добавленные позже не перенумеровывают тех, кто уже в бою.
///
/// `id` бойца строится из шаблона и номера, а номер внутри вида не повторяется
/// — поэтому второй волк не может затереть первого (проба
/// `five_wolves_in_two_adds_get_five_distinct_ids_and_numbers`).
pub fn add_monsters(
    state: &mut CombatState,
    template: &MonsterTemplate,
    count: u32,
) -> Result<(), String> {
    if count == 0 {
        return Err("добавить ноль существ нельзя — укажи хотя бы одно".into());
    }
    let highest = state
        .combatants
        .iter()
        .filter_map(|c| match &c.source {
            CombatantSource::Monster {
                template_id,
                number,
            } if template_id == &template.id => Some(*number),
            _ => None,
        })
        .max()
        .unwrap_or(0);
    for number in highest + 1..=highest + count {
        state.combatants.push(Combatant {
            id: format!("monster-{}-{number}", template.id),
            source: CombatantSource::Monster {
                template_id: template.id.clone(),
                number,
            },
            max_hp: template.max_hp,
            current_hp: template.max_hp,
            initiative_roll: None,
        });
    }
    Ok(())
}

/// «Рассчитать инициативу»: к20 каждому участнику, с его модификатором
/// Ловкости. Модификаторы приходят от фронта — у него единственный владелец
/// этого числа (`initiativeModifierOf`: персонажу его `Character.initiative`,
/// существу `abilityMod` Ловкости шаблона), и второй раз из Ловкости здесь
/// ничего не считается.
///
/// Повторное нажатие перекидывает всем и начинает бой сначала: первый раунд,
/// указатель на первом, отметок «походил» нет (они выводятся из указателя).
pub fn roll_initiative(
    state: &mut CombatState,
    dex_modifiers: &HashMap<String, i32>,
) -> Result<(), String> {
    if state.combatants.is_empty() {
        return Err("в бою никого нет — бросать инициативу некому".into());
    }
    // Сначала все броски, потом запись: недостающий модификатор не должен
    // оставить линию наполовину перекинутой.
    let mut rolls = Vec::with_capacity(state.combatants.len());
    for c in &state.combatants {
        let dex_modifier = *dex_modifiers
            .get(&c.id)
            .ok_or_else(|| format!("нет модификатора Ловкости для {:?}", c.id))?;
        let d20 = dice::roll_expression("1d20")?.total;
        rolls.push(InitiativeRoll { d20, dex_modifier });
    }
    for (c, roll) in state.combatants.iter_mut().zip(rolls) {
        c.initiative_roll = Some(roll);
    }
    state.current_turn_index = 0;
    state.round = 1;
    Ok(())
}

/// «Следующий»: указатель на следующего по порядку; с последнего — на первого,
/// и раунд растёт. Отметку «походил» ставить отдельно не нужно — её выводит
/// фронт из указателя.
///
/// Повержённых указатель НЕ пропускает, и это решение, а не недоделка: раздел
/// не судит, кто может ходить, — персонаж на нуле хитов кидает спасброски от
/// смерти, и Мастер сам решает, остановиться на нём или идти дальше.
pub fn next_turn(state: &mut CombatState) -> Result<(), String> {
    if state.combatants.is_empty() {
        return Err("в бою никого нет".into());
    }
    let next = state.current_turn_index + 1;
    if next >= state.combatants.len() {
        state.current_turn_index = 0;
        state.round += 1;
    } else {
        state.current_turn_index = next;
    }
    Ok(())
}

/// Отнять (`delta > 0`) или вернуть (`delta < 0`) хиты любым числом. Зажим
/// `0..=max_hp`. Больше ничего: ни журнала, ни «стороны повержены».
pub fn apply_damage(state: &mut CombatState, target_id: &str, delta: i32) -> Result<(), String> {
    let c = state
        .combatants
        .iter_mut()
        .find(|c| c.id == target_id)
        .ok_or("боец не найден")?;
    c.current_hp = c.current_hp.saturating_sub(delta).clamp(0, c.max_hp);
    Ok(())
}

/// Кнопка «Перенести хиты в листы»: каждому персонажу-участнику на лист ложатся
/// его боевые хиты. Существ перенос не касается вовсе — шаблон бестиария урон
/// не запоминает. Бой при этом продолжается: переносить можно когда угодно.
///
/// Сама собой эта функция не зовётся нигде — только командой по нажатию
/// (решение владельца 24.09.2026, уточнённое 09.10.2026).
pub fn transfer_hp_to_sheets(state: &CombatState, characters: &mut [Character]) {
    for c in &state.combatants {
        let CombatantSource::Character { character_id } = &c.source else {
            continue;
        };
        if let Some(ch) = characters.iter_mut().find(|ch| &ch.id == character_id) {
            ch.current_hp = c.current_hp;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bestiary::test_monster_template;

    fn hero(id: &str, current_hp: i32, max_hp: i32) -> Character {
        Character {
            id: id.into(),
            name: id.into(),
            current_hp,
            max_hp,
            ..Default::default()
        }
    }

    fn numbers_of(state: &CombatState, template: &str) -> Vec<u32> {
        state
            .combatants
            .iter()
            .filter_map(|c| match &c.source {
                CombatantSource::Monster {
                    template_id,
                    number,
                } if template_id == template => Some(*number),
                _ => None,
            })
            .collect()
    }

    /// Пять волков двумя добавлениями (3 + 2): пять бойцов, пять разных `id`,
    /// номера 1…5 — уже стоящие не перенумерованы, — и у каждого свой счётчик
    /// хитов. Отрицательная проба: считать номер от нуля в каждом вызове
    /// (`for number in 1..=count`) — и вторая пачка затрёт `id` первой.
    #[test]
    fn five_wolves_in_two_adds_get_five_distinct_ids_and_numbers() {
        let wolf = test_monster_template("wolf");
        let mut state = new_combat();
        add_monsters(&mut state, &wolf, 3).unwrap();
        add_monsters(&mut state, &wolf, 2).unwrap();

        assert_eq!(numbers_of(&state, "wolf"), vec![1, 2, 3, 4, 5]);
        let mut ids: Vec<&str> = state.combatants.iter().map(|c| c.id.as_str()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 5, "повторный id затрёт одного волка другим");

        apply_damage(&mut state, "monster-wolf-2", 7).unwrap();
        let hp: Vec<i32> = state.combatants.iter().map(|c| c.current_hp).collect();
        assert_eq!(hp, vec![11, 4, 11, 11, 11], "хиты у каждого волка свои");
    }

    /// Персонаж, уже стоящий в бою, второй строкой не встаёт — «Поднять бой»
    /// зовёт всех персонажей разом, и без этого отряд в линии удваивался бы.
    #[test]
    fn a_character_already_in_combat_is_not_added_twice() {
        let mut state = new_combat();
        add_characters(&mut state, &[hero("pc", 7, 12)]);
        add_characters(&mut state, &[hero("pc", 7, 12), hero("bard", 9, 9)]);

        assert_eq!(state.combatants.len(), 2);
        let pc = &state.combatants[0];
        assert_eq!((pc.current_hp, pc.max_hp), (7, 12), "в бой входят с хитами листа");
    }

    /// Бросок: грань в 1..=20, модификатор запомнен тот, что прислан; повторный
    /// бросок возвращает бой к первому раунду и первому месту.
    #[test]
    fn rolling_initiative_stores_die_and_modifier_apart_and_restarts_the_line() {
        let mut state = new_combat();
        add_characters(&mut state, &[hero("pc", 10, 10)]);
        add_monsters(&mut state, &test_monster_template("wolf"), 2).unwrap();
        let mods = HashMap::from([
            ("pc".to_string(), -1),
            ("monster-wolf-1".to_string(), 2),
            ("monster-wolf-2".to_string(), 2),
        ]);

        roll_initiative(&mut state, &mods).unwrap();
        next_turn(&mut state).unwrap();
        next_turn(&mut state).unwrap();
        next_turn(&mut state).unwrap();
        assert_eq!((state.round, state.current_turn_index), (2, 0));

        roll_initiative(&mut state, &mods).unwrap();
        assert_eq!((state.round, state.current_turn_index), (1, 0), "перебросок начинает сначала");
        for c in &state.combatants {
            let roll = c.initiative_roll.as_ref().expect("брошено всем");
            assert!((1..=20).contains(&roll.d20));
            assert_eq!(roll.dex_modifier, mods[&c.id]);
        }
    }

    #[test]
    fn a_missing_modifier_leaves_nobody_half_rolled() {
        let mut state = new_combat();
        add_characters(&mut state, &[hero("pc", 10, 10), hero("bard", 9, 9)]);
        let only_pc = HashMap::from([("pc".to_string(), 1)]);

        assert!(roll_initiative(&mut state, &only_pc).is_err());
        assert!(state.combatants.iter().all(|c| c.initiative_roll.is_none()));
    }

    /// «Следующий» с последнего места: раунд++, указатель на первом. Повержённый
    /// не пропускается — указатель встаёт и на бойца с нулём хитов.
    #[test]
    fn next_turn_walks_the_line_wraps_into_a_new_round_and_does_not_skip_the_downed() {
        let mut state = new_combat();
        add_monsters(&mut state, &test_monster_template("wolf"), 3).unwrap();
        apply_damage(&mut state, "monster-wolf-2", 99).unwrap();

        next_turn(&mut state).unwrap();
        assert_eq!(state.current_turn_index, 1, "повержённый волк — тоже ход");
        next_turn(&mut state).unwrap();
        assert_eq!((state.round, state.current_turn_index), (1, 2));
        next_turn(&mut state).unwrap();
        assert_eq!((state.round, state.current_turn_index), (2, 0));
    }

    #[test]
    fn hit_points_move_by_any_number_and_stay_within_zero_and_max() {
        let mut state = new_combat();
        add_characters(&mut state, &[hero("pc", 10, 12)]);

        apply_damage(&mut state, "pc", 7).unwrap();
        assert_eq!(state.combatants[0].current_hp, 3);
        apply_damage(&mut state, "pc", 50).unwrap();
        assert_eq!(state.combatants[0].current_hp, 0, "ниже нуля не уходит");
        apply_damage(&mut state, "pc", -5).unwrap();
        assert_eq!(state.combatants[0].current_hp, 5);
        apply_damage(&mut state, "pc", -50).unwrap();
        assert_eq!(state.combatants[0].current_hp, 12, "выше максимума не поднимается");
    }
}
