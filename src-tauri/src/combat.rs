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
            player_rules: false,
            death_save_successes: 0,
            death_save_failures: 0,
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
            player_rules: false,
            death_save_successes: 0,
            death_save_failures: 0,
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

/// «Следующий»: указатель на следующего по порядку, кто ходит; с последнего —
/// на первого, и раунд растёт. Отметку «походил» ставить отдельно не нужно —
/// её выводит фронт из указателя.
///
/// **Павших указатель пропускает** — слово владельца 14.10.2026: чудовище на
/// нуле хитов пало (SRD, «Чудовища и смерть»), и «Следующий» через него
/// перешагивает. Персонаж на нуле НЕ пропускается: его ход — спасбросок от
/// смерти, и бросает его Мастер кнопкой в строке. Существо с переключателем
/// «по правилам персонажа» — так же, как персонаж.
///
/// Кто пал, решает не эта функция: `fallen` — флаг на каждое МЕСТО в порядке
/// ходов, его собирает фронт (`isFallen` в `src/ui/combatTracker.ts`) тем же
/// приёмом, что место у `remove_combatant`: Rust порядка не знает, а указатель
/// — это место в том порядке. Здесь только шаг по линии.
///
/// Пали все — ходить некому: ошибка, линия и раунд не трогаются. Шагов не
/// больше, чем мест в линии, поэтому зациклиться обход не может ни при каком
/// `fallen`.
pub fn next_turn(state: &mut CombatState, fallen: &[bool]) -> Result<(), String> {
    let len = state.combatants.len();
    if len == 0 {
        return Err("в бою никого нет".into());
    }
    if fallen.len() != len {
        return Err(format!(
            "флагов павших {} на {len} мест в линии — порядок устарел",
            fallen.len()
        ));
    }
    let mut index = state.current_turn_index;
    let mut wrapped = false;
    for _ in 0..len {
        index += 1;
        if index >= len {
            index = 0;
            wrapped = true;
        }
        if !fallen[index] {
            state.current_turn_index = index;
            if wrapped {
                state.round += 1;
            }
            return Ok(());
        }
    }
    Err("все в бою пали — ходить некому".into())
}

/// Переключатель «по правилам персонажа» у существа (см. `Combatant::player_rules`).
/// Персонажу его ставить не к чему: он на нуле бросает спасброски всегда.
pub fn set_player_rules(state: &mut CombatState, target_id: &str, on: bool) -> Result<(), String> {
    let c = monster_mut(state, target_id)?;
    c.player_rules = on;
    Ok(())
}

/// Записать счёт спасбросков существа. Чем обернулся бросок, решает фронт
/// (`applyDeathSaveRoll` в `src/ui/deathSaves.ts` — единственный владелец
/// правила); здесь число только ложится в бойца. Счёт персонажа сюда не
/// пишется — он живёт на листе.
pub fn set_death_saves(
    state: &mut CombatState,
    target_id: &str,
    successes: u32,
    failures: u32,
) -> Result<(), String> {
    let c = monster_mut(state, target_id)?;
    c.death_save_successes = successes;
    c.death_save_failures = failures;
    Ok(())
}

fn monster_mut<'a>(state: &'a mut CombatState, target_id: &str) -> Result<&'a mut Combatant, String> {
    let c = state
        .combatants
        .iter_mut()
        .find(|c| c.id == target_id)
        .ok_or("боец не найден")?;
    match c.source {
        CombatantSource::Monster { .. } => Ok(c),
        CombatantSource::Character { .. } => {
            Err("у персонажа спасброски живут на листе, а не в бою".into())
        }
    }
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

/// Убрать участника из боя (лишний волк, сбежавший разбойник). `position` —
/// его место в порядке ходов, который выводит фронт (`turnOrder`): Rust порядка
/// не знает, а указатель хода — это именно место в том порядке.
///
/// Указатель остаётся на том же бойце: убрали стоящего выше — указатель
/// сдвигается вверх вместе с линией. Убрали того, чей ход, — ход переходит к
/// следующему, а с последнего — к первому нового раунда, как у «Следующего».
/// Хиты убранного персонажа в лист сами не переносятся.
pub fn remove_combatant(
    state: &mut CombatState,
    target_id: &str,
    position: usize,
) -> Result<(), String> {
    if position >= state.combatants.len() {
        return Err(format!("места {position} в линии нет"));
    }
    let at = state
        .combatants
        .iter()
        .position(|c| c.id == target_id)
        .ok_or("боец не найден")?;
    state.combatants.remove(at);

    if position < state.current_turn_index {
        state.current_turn_index -= 1;
    } else if state.current_turn_index >= state.combatants.len() {
        state.current_turn_index = 0;
        if !state.combatants.is_empty() {
            state.round += 1;
        }
    }
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
        let nobody_fallen = [false; 3];
        next_turn(&mut state, &nobody_fallen).unwrap();
        next_turn(&mut state, &nobody_fallen).unwrap();
        next_turn(&mut state, &nobody_fallen).unwrap();
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

    /// «Следующий» с последнего места: раунд++, указатель на первом. Павшего
    /// указатель перешагивает — слово владельца 14.10.2026 (раньше проба
    /// звалась `..._does_not_skip_the_downed` и держала обратное решение).
    /// Отрицательная проба: снять `if !fallen[index]` — и указатель встанет на
    /// волка 2.
    #[test]
    fn next_turn_walks_the_line_wraps_into_a_new_round_and_skips_the_fallen() {
        let mut state = new_combat();
        add_monsters(&mut state, &test_monster_template("wolf"), 3).unwrap();
        let wolf_2_fallen = [false, true, false];

        next_turn(&mut state, &wolf_2_fallen).unwrap();
        assert_eq!((state.round, state.current_turn_index), (1, 2), "павший волк 2 перешагнут");
        next_turn(&mut state, &wolf_2_fallen).unwrap();
        assert_eq!((state.round, state.current_turn_index), (2, 0));

        // Павший на первом месте: оборот раунда и пропуск — одним нажатием.
        let wolf_1_fallen = [true, false, false];
        state.current_turn_index = 2;
        next_turn(&mut state, &wolf_1_fallen).unwrap();
        assert_eq!((state.round, state.current_turn_index), (3, 1), "раунд вырос, первый перешагнут");
    }

    /// Тот, кто не пал, — ходит, даже если он единственный: «Следующий»
    /// обходит линию целиком и возвращается к нему же новым раундом.
    #[test]
    fn the_last_one_standing_gets_every_turn_in_a_new_round() {
        let mut state = new_combat();
        add_monsters(&mut state, &test_monster_template("wolf"), 3).unwrap();
        state.current_turn_index = 1;

        next_turn(&mut state, &[true, false, true]).unwrap();
        assert_eq!((state.round, state.current_turn_index), (2, 1));
    }

    /// Пали все — ошибка, а не вечный обход: линия и раунд не тронуты. Тот же
    /// исход после «убрать из боя», когда убрали последнего стоящего.
    #[test]
    fn when_everyone_has_fallen_next_turn_refuses_instead_of_looping() {
        let mut state = new_combat();
        add_characters(&mut state, &[hero("pc", 10, 10)]);
        add_monsters(&mut state, &test_monster_template("wolf"), 2).unwrap();

        assert!(next_turn(&mut state, &[true, true, true]).is_err());
        assert_eq!((state.round, state.current_turn_index), (1, 0));

        // Ходит персонаж, оба волка пали; персонажа убрали — указатель ушёл
        // на павшего волка, и «Следующему» идти некуда.
        remove_combatant(&mut state, "pc", 0).unwrap();
        assert_eq!(state.combatants.len(), 2);
        let round = state.round;
        let at = state.current_turn_index;
        assert!(next_turn(&mut state, &[true, true]).is_err());
        assert_eq!((state.round, state.current_turn_index), (round, at), "ошибка линию не трогает");
    }

    /// Флаги павших — по месту в линии, и их ровно столько, сколько мест:
    /// устаревший порядок с фронта не сдвигает указатель наугад.
    #[test]
    fn next_turn_rejects_flags_that_do_not_match_the_line() {
        let mut state = new_combat();
        add_monsters(&mut state, &test_monster_template("wolf"), 3).unwrap();
        assert!(next_turn(&mut state, &[false, false]).is_err());
        assert_eq!((state.round, state.current_turn_index), (1, 0));
    }

    /// Переключатель «по правилам персонажа» и счёт спасбросков ложатся только
    /// в существо: у персонажа счёт на листе, второй его копии в бою не будет.
    #[test]
    fn player_rules_and_death_saves_are_stored_on_monsters_only() {
        let mut state = new_combat();
        add_characters(&mut state, &[hero("pc", 0, 10)]);
        add_monsters(&mut state, &test_monster_template("wolf"), 1).unwrap();

        set_player_rules(&mut state, "monster-wolf-1", true).unwrap();
        set_death_saves(&mut state, "monster-wolf-1", 2, 1).unwrap();
        let wolf = &state.combatants[1];
        assert!(wolf.player_rules);
        assert_eq!((wolf.death_save_successes, wolf.death_save_failures), (2, 1));

        assert!(set_player_rules(&mut state, "pc", true).is_err());
        assert!(set_death_saves(&mut state, "pc", 1, 0).is_err());
        let pc = &state.combatants[0];
        assert!(!pc.player_rules);
        assert_eq!((pc.death_save_successes, pc.death_save_failures), (0, 0));
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

    #[test]
    fn removing_a_combatant_keeps_the_pointer_on_whoever_was_acting() {
        // Без бросков порядок ходов — порядок добавления, так что место в
        // линии совпадает с индексом в массиве.
        let mut state = new_combat();
        add_monsters(&mut state, &test_monster_template("wolf"), 4).unwrap();
        state.current_turn_index = 2; // ходит волк 3

        remove_combatant(&mut state, "monster-wolf-1", 0).unwrap();
        assert_eq!(numbers_of(&state, "wolf"), vec![2, 3, 4]);
        assert_eq!(state.current_turn_index, 1, "убрали стоящего выше — указатель на том же волке 3");
        assert_eq!(state.combatants[state.current_turn_index].id, "monster-wolf-3");

        remove_combatant(&mut state, "monster-wolf-4", 2).unwrap();
        assert_eq!(state.current_turn_index, 1, "убрали стоящего ниже — указатель не двигается");
        assert_eq!(state.round, 1);
    }

    #[test]
    fn removing_the_one_whose_turn_it_is_passes_the_turn_on() {
        let mut state = new_combat();
        add_monsters(&mut state, &test_monster_template("wolf"), 3).unwrap();
        state.current_turn_index = 1;

        remove_combatant(&mut state, "monster-wolf-2", 1).unwrap();
        assert_eq!(state.combatants[state.current_turn_index].id, "monster-wolf-3");
        assert_eq!(state.round, 1);

        remove_combatant(&mut state, "monster-wolf-3", 1).unwrap();
        assert_eq!(
            (state.round, state.current_turn_index),
            (2, 0),
            "убрали последнего в линии, пока он ходил, — новый раунд с первого",
        );

        assert!(remove_combatant(&mut state, "monster-wolf-1", 5).is_err());
        assert!(remove_combatant(&mut state, "нет-такого", 0).is_err());
        assert_eq!(state.combatants.len(), 1, "ошибка не трогает линию");
    }
}
