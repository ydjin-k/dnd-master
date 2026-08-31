use serde::{Deserialize, Serialize};

use crate::dice;
use crate::model::{Character, CombatState, Combatant};
use crate::spells::Spell;

const GRID_WIDTH: i32 = 12;
const GRID_HEIGHT: i32 = 10;
const PLAYER_ATTACK_BONUS_PLACEHOLDER: i32 = 3;
const PLAYER_DAMAGE_DICE_PLACEHOLDER: &str = "1d6";
/// Как и PLAYER_ATTACK_BONUS_PLACEHOLDER выше — грубая заглушка вместо расчёта
/// от заклинательной характеристики и бонуса мастерства; полноценный расчёт
/// появится вместе с починкой боевых бонусов, не в этой карточке.
const PLAYER_SPELL_ATTACK_BONUS_PLACEHOLDER: i32 = 5;
const PLAYER_SPELL_SAVE_DC_PLACEHOLDER: i32 = 13;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterTemplate {
    pub id: String,
    pub name: String,
    pub max_hp: i32,
    pub armor_class: i32,
    pub speed_feet: i32,
    pub attack_bonus: i32,
    pub damage_dice: String,
}

/// Упрощённые ориентировочные статы, не точные блоки SRD — доказывают
/// механизм. Настоящий бестиарий — отдельная задача по содержимому,
/// как и демо-сценарий в adventure.rs.
pub fn demo_bestiary() -> Vec<MonsterTemplate> {
    vec![
        MonsterTemplate {
            id: "wolf".into(),
            name: "Волк".into(),
            max_hp: 11,
            armor_class: 13,
            speed_feet: 40,
            attack_bonus: 4,
            damage_dice: "2d4+2".into(),
        },
        MonsterTemplate {
            id: "werewolf".into(),
            name: "Оборотень".into(),
            max_hp: 58,
            armor_class: 11,
            speed_feet: 30,
            attack_bonus: 4,
            damage_dice: "2d4+2".into(),
        },
        MonsterTemplate {
            id: "bandit".into(),
            name: "Разбойник".into(),
            max_hp: 11,
            armor_class: 12,
            speed_feet: 30,
            attack_bonus: 3,
            damage_dice: "1d6+1".into(),
        },
    ]
}

fn chebyshev_feet(a: (i32, i32), b: (i32, i32)) -> i32 {
    (a.0 - b.0).abs().max((a.1 - b.1).abs()) * 5
}

fn is_occupied(state: &CombatState, x: i32, y: i32, exclude_id: &str) -> bool {
    state
        .combatants
        .iter()
        .any(|c| c.id != exclude_id && c.current_hp > 0 && c.x == x && c.y == y)
}

/// Бой заканчивается, когда повержена целиком одна сторона — а не когда
/// повержены абсолютно все (это было бы одновременной ничьей, которая
/// на практике не случается и раньше не давало `finished` выставиться).
fn check_side_defeated(state: &mut CombatState) {
    if state.finished {
        return;
    }
    let monsters_alive = state.combatants.iter().any(|c| c.is_monster && c.current_hp > 0);
    let players_alive = state.combatants.iter().any(|c| !c.is_monster && c.current_hp > 0);
    if !monsters_alive {
        state.finished = true;
        state
            .log
            .push("Все монстры повержены — бой окончен, победа персонажей.".into());
    } else if !players_alive {
        state.finished = true;
        state.log.push("Все персонажи повержены — бой окончен.".into());
    }
}

fn next_alive_index(state: &CombatState, from: usize) -> Option<usize> {
    let n = state.turn_order.len();
    if n == 0 {
        return None;
    }
    for step in 1..=n {
        let idx = (from + step) % n;
        let id = &state.turn_order[idx];
        if state
            .combatants
            .iter()
            .any(|c| &c.id == id && c.current_hp > 0)
        {
            return Some(idx);
        }
    }
    None
}

pub fn start_combat(
    monsters: &[MonsterTemplate],
    characters: &[Character],
) -> Result<CombatState, String> {
    if monsters.is_empty() {
        return Err("бой без противников не начать — выбери хотя бы одного монстра".into());
    }
    if characters.is_empty() {
        return Err("бой без персонажей не начать — выбери хотя бы одного".into());
    }

    let mut combatants = Vec::new();
    for (i, m) in monsters.iter().enumerate() {
        let initiative = dice::roll_expression("1d20")?.total;
        combatants.push(Combatant {
            id: format!("monster-{}-{i}", m.id),
            name: m.name.clone(),
            is_monster: true,
            x: GRID_WIDTH - 1,
            y: (i as i32 * 2) % GRID_HEIGHT,
            speed_feet: m.speed_feet,
            max_hp: m.max_hp,
            current_hp: m.max_hp,
            armor_class: m.armor_class,
            attack_bonus: m.attack_bonus,
            damage_dice: m.damage_dice.clone(),
            initiative,
            feet_moved_this_turn: 0,
        });
    }
    for (i, ch) in characters.iter().enumerate() {
        let initiative = dice::roll_expression("1d20")?.total;
        combatants.push(Combatant {
            id: ch.id.clone(),
            name: ch.name.clone(),
            is_monster: false,
            x: 0,
            y: (i as i32 * 2) % GRID_HEIGHT,
            speed_feet: 30,
            max_hp: ch.max_hp,
            current_hp: ch.current_hp,
            armor_class: ch.armor_class,
            attack_bonus: PLAYER_ATTACK_BONUS_PLACEHOLDER,
            damage_dice: PLAYER_DAMAGE_DICE_PLACEHOLDER.into(),
            initiative,
            feet_moved_this_turn: 0,
        });
    }

    let mut turn_order: Vec<String> = combatants.iter().map(|c| c.id.clone()).collect();
    turn_order.sort_by_key(|id| {
        let c = combatants.iter().find(|c| &c.id == id).unwrap();
        std::cmp::Reverse(c.initiative)
    });

    let order_summary = turn_order
        .iter()
        .map(|id| {
            let c = combatants.iter().find(|c| &c.id == id).unwrap();
            format!("{} ({})", c.name, c.initiative)
        })
        .collect::<Vec<_>>()
        .join(", ");

    Ok(CombatState {
        grid_width: GRID_WIDTH,
        grid_height: GRID_HEIGHT,
        combatants,
        turn_order,
        current_turn_index: 0,
        round: 1,
        log: vec![format!("Бой начался. Порядок хода: {order_summary}.")],
        finished: false,
    })
}

pub fn move_combatant(state: &mut CombatState, id: &str, x: i32, y: i32) -> Result<(), String> {
    require_ongoing(state)?;
    if x < 0 || x >= state.grid_width || y < 0 || y >= state.grid_height {
        return Err("клетка вне поля".into());
    }
    if is_occupied(state, x, y, id) {
        return Err("клетка занята".into());
    }
    let c = state
        .combatants
        .iter()
        .find(|c| c.id == id)
        .ok_or("боец не найден")?;
    if c.current_hp <= 0 {
        return Err("боец повержен и не может двигаться".into());
    }
    let distance = chebyshev_feet((c.x, c.y), (x, y));
    let remaining = c.speed_feet - c.feet_moved_this_turn;
    if distance > remaining {
        return Err(format!(
            "не хватает скорости: нужно {distance} футов, осталось {remaining}"
        ));
    }
    let name = c.name.clone();
    let c = state.combatants.iter_mut().find(|c| c.id == id).unwrap();
    c.x = x;
    c.y = y;
    c.feet_moved_this_turn += distance;
    state
        .log
        .push(format!("{name} перемещается на {distance} футов."));
    Ok(())
}

fn resolve_attack(
    state: &mut CombatState,
    attacker_id: &str,
    target_id: &str,
) -> Result<String, String> {
    let (attacker_name, attack_bonus, damage_dice) = {
        let a = state
            .combatants
            .iter()
            .find(|c| c.id == attacker_id)
            .ok_or("атакующий не найден")?;
        if a.current_hp <= 0 {
            return Err("атакующий повержен".into());
        }
        (a.name.clone(), a.attack_bonus, a.damage_dice.clone())
    };
    let (target_name, target_ac) = {
        let t = state
            .combatants
            .iter()
            .find(|c| c.id == target_id)
            .ok_or("цель не найдена")?;
        (t.name.clone(), t.armor_class)
    };

    let to_hit = dice::roll_expression("1d20")?.total + attack_bonus;
    let message = if to_hit >= target_ac {
        let dmg = dice::roll_expression(&damage_dice)?;
        let target = state
            .combatants
            .iter_mut()
            .find(|c| c.id == target_id)
            .unwrap();
        target.current_hp = (target.current_hp - dmg.total).max(0);
        let defeated = target.current_hp == 0;
        let mut msg = format!(
            "{attacker_name} атакует {target_name}: бросок {to_hit} против КД {target_ac} — попадание, урон {}.",
            dmg.total
        );
        if defeated {
            msg.push_str(&format!(" {target_name} повержен(а)."));
        }
        msg
    } else {
        format!(
            "{attacker_name} атакует {target_name}: бросок {to_hit} против КД {target_ac} — промах."
        )
    };

    state.log.push(message.clone());
    check_side_defeated(state);
    Ok(message)
}

fn require_ongoing(state: &CombatState) -> Result<(), String> {
    if state.finished {
        return Err("бой уже завершён".into());
    }
    Ok(())
}

pub fn attack(state: &mut CombatState, attacker_id: &str, target_id: &str) -> Result<(), String> {
    require_ongoing(state)?;
    resolve_attack(state, attacker_id, target_id)?;
    Ok(())
}

pub fn apply_damage(state: &mut CombatState, target_id: &str, delta: i32) -> Result<(), String> {
    require_ongoing(state)?;
    let c = state
        .combatants
        .iter_mut()
        .find(|c| c.id == target_id)
        .ok_or("боец не найден")?;
    c.current_hp = (c.current_hp - delta).clamp(0, c.max_hp);
    let name = c.name.clone();
    let hp = c.current_hp;
    let word = if delta >= 0 { "получает урон" } else { "восстанавливает HP" };
    state
        .log
        .push(format!("{name} {word} {}: сейчас {hp} HP.", delta.abs()));
    check_side_defeated(state);
    Ok(())
}

fn apply_spell_damage(state: &mut CombatState, target_id: &str, amount: i32) -> bool {
    let target = state
        .combatants
        .iter_mut()
        .find(|c| c.id == target_id)
        .unwrap();
    target.current_hp = (target.current_hp - amount).max(0);
    target.current_hp == 0
}

/// Резолвит эффект заклинания в бою — не знает о `Character` и ячейках заклинаний:
/// это ресурс персонажа между боями, а не боевого состояния, поэтому списание
/// ячейки — забота стороны, вызывающей эту функцию (см. `cast_spell_action` в `lib.rs`).
pub fn cast_spell(
    state: &mut CombatState,
    caster_id: &str,
    spell: &Spell,
    target_id: Option<&str>,
) -> Result<(), String> {
    require_ongoing(state)?;
    let caster_name = {
        let caster = state
            .combatants
            .iter()
            .find(|c| c.id == caster_id)
            .ok_or("заклинатель не найден")?;
        if caster.current_hp <= 0 {
            return Err("заклинатель повержен".into());
        }
        caster.name.clone()
    };

    // Утилитарное заклинание без урона: без бросков и без цели, просто факт применения.
    if spell.damage_dice.is_none() && !spell.attack_roll && spell.saving_throw.is_none() {
        state
            .log
            .push(format!("{caster_name} сотворяет «{}».", spell.name));
        return Ok(());
    }

    let target_id = target_id.ok_or("это заклинание требует цель")?;
    let (target_name, target_ac) = {
        let t = state
            .combatants
            .iter()
            .find(|c| c.id == target_id)
            .ok_or("цель не найдена")?;
        (t.name.clone(), t.armor_class)
    };
    let damage_type = spell.damage_type.as_deref().unwrap_or("магический");

    let message = if spell.attack_roll {
        let to_hit = dice::roll_expression("1d20")?.total + PLAYER_SPELL_ATTACK_BONUS_PLACEHOLDER;
        if to_hit >= target_ac {
            let dmg = dice::roll_expression(spell.damage_dice.as_deref().unwrap_or("1d4"))?.total;
            let defeated = apply_spell_damage(state, target_id, dmg);
            let mut msg = format!(
                "{caster_name} сотворяет «{}» на {target_name}: бросок {to_hit} против КД {target_ac} — попадание, урон {dmg} ({damage_type}).",
                spell.name
            );
            if defeated {
                msg.push_str(&format!(" {target_name} повержен(а)."));
            }
            msg
        } else {
            format!(
                "{caster_name} сотворяет «{}» на {target_name}: бросок {to_hit} против КД {target_ac} — промах.",
                spell.name
            )
        }
    } else if let Some(ability) = &spell.saving_throw {
        let roll = dice::roll_expression("1d20")?.total;
        let dc = PLAYER_SPELL_SAVE_DC_PLACEHOLDER;
        let success = roll >= dc;
        let outcome = if success { "успех" } else { "провал" };
        match &spell.damage_dice {
            Some(expr) => {
                let full = dice::roll_expression(expr)?.total;
                let dealt = if success { full / 2 } else { full };
                let defeated = apply_spell_damage(state, target_id, dealt);
                let mut msg = format!(
                    "{caster_name} сотворяет «{}» на {target_name}: спасбросок {ability} {roll} против СЛ {dc} — {outcome}, урон {dealt} ({damage_type}).",
                    spell.name
                );
                if defeated {
                    msg.push_str(&format!(" {target_name} повержен(а)."));
                }
                msg
            }
            None => format!(
                "{caster_name} сотворяет «{}» на {target_name}: спасбросок {ability} {roll} против СЛ {dc} — {outcome}.",
                spell.name
            ),
        }
    } else {
        // Ни броска атаки, ни спасброска — автоматическое попадание (например, «Волшебная стрела»).
        let expr = spell
            .damage_dice
            .as_deref()
            .ok_or("заклинанию не задан урон")?;
        let dmg = dice::roll_expression(expr)?.total;
        let defeated = apply_spell_damage(state, target_id, dmg);
        let mut msg = format!(
            "{caster_name} сотворяет «{}» на {target_name}: автоматическое попадание, урон {dmg} ({damage_type}).",
            spell.name
        );
        if defeated {
            msg.push_str(&format!(" {target_name} повержен(а)."));
        }
        msg
    };

    state.log.push(message);
    check_side_defeated(state);
    Ok(())
}

pub fn end_turn(state: &mut CombatState) -> Result<(), String> {
    require_ongoing(state)?;
    let next = next_alive_index(state, state.current_turn_index);
    match next {
        None => {
            state.finished = true;
            state.log.push("Все на одной стороне повержены — бой окончен.".into());
        }
        Some(idx) => {
            let wrapped = idx <= state.current_turn_index;
            state.current_turn_index = idx;
            if wrapped {
                state.round += 1;
                state.log.push(format!("— Раунд {} —", state.round));
            }
            let id = state.turn_order[idx].clone();
            if let Some(c) = state.combatants.iter_mut().find(|c| c.id == id) {
                c.feet_moved_this_turn = 0;
                let name = c.name.clone();
                state.log.push(format!("Ход переходит к {name}."));
            }
        }
    }
    Ok(())
}

pub fn monster_auto_turn(state: &mut CombatState) -> Result<String, String> {
    require_ongoing(state)?;
    let current_id = state
        .turn_order
        .get(state.current_turn_index)
        .cloned()
        .ok_or("нет текущего хода")?;

    let (mover_pos, remaining, name) = {
        let c = state
            .combatants
            .iter()
            .find(|c| c.id == current_id)
            .ok_or("боец не найден")?;
        if !c.is_monster {
            return Err("сейчас ход не существа".into());
        }
        ((c.x, c.y), c.speed_feet - c.feet_moved_this_turn, c.name.clone())
    };

    let target = state
        .combatants
        .iter()
        .filter(|c| !c.is_monster && c.current_hp > 0)
        .min_by_key(|c| chebyshev_feet(mover_pos, (c.x, c.y)))
        .cloned();

    let Some(target) = target else {
        let msg = format!("{name} не находит цель.");
        state.log.push(msg.clone());
        return Ok(msg);
    };

    let mut pos = mover_pos;
    let mut feet_spent = 0;
    let max_steps = remaining / 5;
    for _ in 0..max_steps {
        if chebyshev_feet(pos, (target.x, target.y)) <= 5 {
            break;
        }
        let dx = (target.x - pos.0).signum();
        let dy = (target.y - pos.1).signum();
        let next = (
            (pos.0 + dx).clamp(0, state.grid_width - 1),
            (pos.1 + dy).clamp(0, state.grid_height - 1),
        );
        if next == pos || is_occupied(state, next.0, next.1, &current_id) {
            break;
        }
        pos = next;
        feet_spent += 5;
    }

    if let Some(c) = state.combatants.iter_mut().find(|c| c.id == current_id) {
        c.x = pos.0;
        c.y = pos.1;
        c.feet_moved_this_turn += feet_spent;
    }

    let adjacent = chebyshev_feet(pos, (target.x, target.y)) <= 5;
    let move_message = if feet_spent > 0 {
        format!("{name} идёт на {feet_spent} футов к {}.", target.name)
    } else {
        format!("{name} остаётся на месте.")
    };
    state.log.push(move_message.clone());

    let message = if adjacent {
        let attack_msg = resolve_attack(state, &current_id, &target.id)?;
        format!("{move_message} {attack_msg}")
    } else {
        let not_reach = format!("Не дотягивается до {} в этот ход.", target.name);
        state.log.push(not_reach.clone());
        format!("{move_message} {not_reach}")
    };

    Ok(message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Character;

    fn character(id: &str, hp: i32, ac: i32) -> Character {
        Character {
            id: id.into(),
            name: format!("Игрок-{id}"),
            max_hp: hp,
            current_hp: hp,
            armor_class: ac,
            ..Default::default()
        }
    }

    fn combatant(id: &str, is_monster: bool, x: i32, y: i32, speed: i32, hp: i32) -> Combatant {
        Combatant {
            id: id.into(),
            name: id.into(),
            is_monster,
            x,
            y,
            speed_feet: speed,
            max_hp: hp,
            current_hp: hp,
            armor_class: 10,
            attack_bonus: 5,
            damage_dice: "1d6".into(),
            initiative: 0,
            feet_moved_this_turn: 0,
        }
    }

    fn test_spell(
        level: u8,
        damage_dice: Option<&str>,
        damage_type: Option<&str>,
        attack_roll: bool,
        saving_throw: Option<&str>,
    ) -> Spell {
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
            damage_dice: damage_dice.map(|s| s.to_string()),
            damage_type: damage_type.map(|s| s.to_string()),
            attack_roll,
            saving_throw: saving_throw.map(|s| s.to_string()),
        }
    }

    fn state_with(combatants: Vec<Combatant>) -> CombatState {
        let turn_order = combatants.iter().map(|c| c.id.clone()).collect();
        CombatState {
            grid_width: GRID_WIDTH,
            grid_height: GRID_HEIGHT,
            combatants,
            turn_order,
            current_turn_index: 0,
            round: 1,
            log: Vec::new(),
            finished: false,
        }
    }

    #[test]
    fn start_combat_rolls_initiative_for_everyone() {
        let bestiary = demo_bestiary();
        let monsters = vec![bestiary[0].clone()];
        let characters = vec![character("pc1", 20, 15)];

        let state = start_combat(&monsters, &characters).unwrap();

        assert_eq!(state.combatants.len(), 2);
        assert_eq!(state.turn_order.len(), 2);
        assert_eq!(state.round, 1);
        assert!(!state.log.is_empty());
    }

    #[test]
    fn start_combat_requires_both_sides() {
        assert!(start_combat(&[], &[character("pc1", 10, 10)]).is_err());
        assert!(start_combat(&[demo_bestiary()[0].clone()], &[]).is_err());
    }

    #[test]
    fn move_within_speed_succeeds_and_tracks_feet_spent() {
        let mut state = state_with(vec![combatant("a", false, 0, 0, 30, 10)]);
        move_combatant(&mut state, "a", 2, 0).unwrap(); // 10 футов из 30
        let a = state.combatants.iter().find(|c| c.id == "a").unwrap();
        assert_eq!((a.x, a.y), (2, 0));
        assert_eq!(a.feet_moved_this_turn, 10);
    }

    #[test]
    fn move_beyond_speed_fails() {
        let mut state = state_with(vec![combatant("a", false, 0, 0, 30, 10)]);
        // 30 футов = 6 клеток по прямой, семь клеток уже дальше скорости
        let err = move_combatant(&mut state, "a", 7, 0).unwrap_err();
        assert!(err.contains("скорости"));
    }

    #[test]
    fn move_onto_occupied_cell_fails() {
        let mut state = state_with(vec![
            combatant("a", false, 0, 0, 30, 10),
            combatant("b", true, 1, 0, 30, 10),
        ]);
        assert!(move_combatant(&mut state, "a", 1, 0).is_err());
    }

    #[test]
    fn attack_keeps_hp_within_bounds() {
        // Много попыток — исход броска случаен, но границы HP нарушаться не должны.
        for _ in 0..30 {
            let mut state = state_with(vec![
                combatant("attacker", true, 0, 0, 30, 20),
                combatant("target", false, 0, 1, 30, 10),
            ]);
            attack(&mut state, "attacker", "target").unwrap();
            let target = state.combatants.iter().find(|c| c.id == "target").unwrap();
            assert!(target.current_hp >= 0 && target.current_hp <= target.max_hp);
            assert!(!state.log.is_empty());
        }
    }

    #[test]
    fn apply_damage_clamps_and_ends_combat_when_a_side_is_wiped() {
        let mut state = state_with(vec![
            combatant("monster", true, 0, 0, 30, 15),
            combatant("pc", false, 0, 1, 30, 10),
        ]);

        apply_damage(&mut state, "monster", 999).unwrap();
        let monster = state.combatants.iter().find(|c| c.id == "monster").unwrap();
        assert_eq!(monster.current_hp, 0);
        assert!(state.finished, "бой должен закончиться, когда монстров не осталось");

        // После конца боя действия отклоняются.
        assert!(attack(&mut state, "pc", "monster").is_err());
    }

    #[test]
    fn cast_spell_with_attack_roll_keeps_hp_within_bounds() {
        for _ in 0..30 {
            let mut state = state_with(vec![
                combatant("caster", false, 0, 0, 30, 20),
                combatant("target", true, 0, 1, 30, 10),
            ]);
            let s = test_spell(0, Some("1d10"), Some("огонь"), true, None);
            cast_spell(&mut state, "caster", &s, Some("target")).unwrap();
            let target = state.combatants.iter().find(|c| c.id == "target").unwrap();
            assert!(target.current_hp >= 0 && target.current_hp <= target.max_hp);
            assert!(!state.log.is_empty());
        }
    }

    #[test]
    fn cast_spell_with_saving_throw_deals_half_damage_on_success() {
        // 2d1 всегда даёт 2 — детерминированный урон, чтобы проверить именно
        // округление половины вниз, а не саму случайность броска.
        let mut saw_success = false;
        let mut saw_failure = false;
        for _ in 0..60 {
            let mut state = state_with(vec![
                combatant("caster", false, 0, 0, 30, 20),
                combatant("target", true, 0, 1, 30, 100),
            ]);
            let s = test_spell(0, Some("2d1"), Some("яд"), false, Some("Телосложение"));
            cast_spell(&mut state, "caster", &s, Some("target")).unwrap();
            let target = state.combatants.iter().find(|c| c.id == "target").unwrap();
            let dealt = 100 - target.current_hp;
            let message = state.log.last().unwrap().clone();
            if message.contains("успех") {
                assert_eq!(dealt, 1, "успешный спасбросок должен наносить половину урона (округление вниз)");
                saw_success = true;
            } else {
                assert!(message.contains("провал"));
                assert_eq!(dealt, 2, "провал спасброска должен наносить полный урон");
                saw_failure = true;
            }
        }
        assert!(saw_success && saw_failure, "за 60 попыток должны встретиться оба исхода");
    }

    #[test]
    fn cast_spell_without_damage_dice_is_utility_and_touches_no_hp() {
        let mut state = state_with(vec![combatant("caster", false, 0, 0, 30, 20)]);
        let s = test_spell(0, None, None, false, None);
        cast_spell(&mut state, "caster", &s, None).unwrap();
        let caster = state.combatants.iter().find(|c| c.id == "caster").unwrap();
        assert_eq!(caster.current_hp, caster.max_hp);
        assert!(state.log.last().unwrap().contains("Тестовое заклинание"));
    }

    #[test]
    fn cast_spell_requires_target_when_it_has_an_attack_roll() {
        let mut state = state_with(vec![combatant("caster", false, 0, 0, 30, 20)]);
        let s = test_spell(0, Some("1d10"), Some("огонь"), true, None);
        let err = cast_spell(&mut state, "caster", &s, None).unwrap_err();
        assert!(err.contains("цель"));
    }

    #[test]
    fn end_turn_skips_defeated_and_advances_round_on_wrap() {
        let mut state = state_with(vec![
            combatant("a", true, 0, 0, 30, 10),
            combatant("b", false, 0, 1, 30, 10),
        ]);
        assert_eq!(state.current_turn_index, 0);

        end_turn(&mut state).unwrap();
        assert_eq!(state.current_turn_index, 1);
        assert_eq!(state.round, 1);

        end_turn(&mut state).unwrap();
        assert_eq!(state.current_turn_index, 0);
        assert_eq!(state.round, 2, "ход вернулся к первому — начался новый раунд");
    }

    #[test]
    fn monster_auto_turn_closes_distance_and_attacks_when_adjacent() {
        // 3 клетки = 15 футов, монстр со скоростью 30 футов их полностью покрывает.
        let mut state = state_with(vec![
            combatant("monster", true, 0, 0, 30, 20),
            combatant("pc", false, 3, 0, 30, 10),
        ]);

        let message = monster_auto_turn(&mut state).unwrap();

        let monster = state.combatants.iter().find(|c| c.id == "monster").unwrap();
        assert_eq!((monster.x, monster.y), (2, 0), "должен встать вплотную к цели");
        assert!(message.contains("атакует"));
    }

    #[test]
    fn monster_auto_turn_only_moves_when_out_of_reach() {
        let mut state = state_with(vec![
            combatant("monster", true, 0, 0, 30, 20),
            combatant("pc", false, 9, 0, 30, 10),
        ]);

        let message = monster_auto_turn(&mut state).unwrap();

        let monster = state.combatants.iter().find(|c| c.id == "monster").unwrap();
        assert_eq!((monster.x, monster.y), (6, 0), "проходит все 30 футов");
        assert!(message.contains("Не дотягивается"));
    }
}
