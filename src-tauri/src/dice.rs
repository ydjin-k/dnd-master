use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RollResult {
    pub expression: String,
    pub rolls: Vec<i32>,
    pub modifier: i32,
    pub total: i32,
    /// Отброшенный набор при adv/dis — для показа "могло быть иначе".
    pub dropped: Option<Vec<i32>>,
}

#[derive(Clone, Copy)]
enum RollMode {
    Normal,
    Advantage,
    Disadvantage,
}

struct ParsedExpr {
    count: i32,
    sides: i32,
    modifier: i32,
    mode: RollMode,
}

fn parse(expr: &str) -> Result<ParsedExpr, String> {
    let raw = expr.trim().to_lowercase();
    if raw.is_empty() {
        return Err("пустое выражение".into());
    }

    let mut mode = RollMode::Normal;
    let mut body = raw.as_str();
    if let Some(stripped) = body.strip_suffix("adv") {
        mode = RollMode::Advantage;
        body = stripped;
    } else if let Some(stripped) = body.strip_suffix("dis") {
        mode = RollMode::Disadvantage;
        body = stripped;
    }

    let (dice_part, modifier) = match body.rfind(['+', '-']) {
        Some(idx) if idx > 0 => {
            let (d, m) = body.split_at(idx);
            let modifier: i32 = m
                .parse()
                .map_err(|_| format!("не могу разобрать модификатор {m:?}"))?;
            (d, modifier)
        }
        _ => (body, 0),
    };

    let d_idx = dice_part
        .find('d')
        .ok_or_else(|| format!("не могу разобрать {dice_part:?}: ожидался вид NdM, например 2d6"))?;
    let (count_str, sides_str) = dice_part.split_at(d_idx);
    let sides_str = &sides_str[1..];

    let count: i32 = if count_str.is_empty() {
        1
    } else {
        count_str
            .parse()
            .map_err(|_| format!("не могу разобрать количество кубиков {count_str:?}"))?
    };
    let sides: i32 = sides_str
        .parse()
        .map_err(|_| format!("не могу разобрать число граней {sides_str:?}"))?;

    if !(1..=100).contains(&count) {
        return Err("количество кубиков должно быть от 1 до 100".into());
    }
    if !(1..=1000).contains(&sides) {
        return Err("число граней должно быть от 1 до 1000".into());
    }

    Ok(ParsedExpr {
        count,
        sides,
        modifier,
        mode,
    })
}

/// Набор кубиков с ВНЕШНИМ источником случайности.
///
/// Разведение появилось ради §22: движку мастера нужен ГСЧ кампании
/// (`gm/rng.rs`), а грамматика выражения обязана остаться одна и живёт здесь.
/// Поэтому наружу вынесен не разбор, а сам источник: владелец грамматики —
/// по-прежнему этот файл, владелец случайности — тот, кто передал `rng`.
fn roll_set_with<R: Rng + ?Sized>(count: i32, sides: i32, rng: &mut R) -> Vec<i32> {
    (0..count).map(|_| rng.gen_range(1..=sides)).collect()
}

/// Броски приложения — вкладка «Кубики», характеристики, бой — как и раньше на
/// `thread_rng`. На ГСЧ кампании они НЕ переводятся: граница названа в ADR 0001
/// (раздел 6, «про размер карточки 3»), и следствие признано честно — «тот же
/// сид — тот же результат» не покрывает боевую часть.
fn roll_set(count: i32, sides: i32) -> Vec<i32> {
    roll_set_with(count, sides, &mut rand::thread_rng())
}

/// Классический метод генерации характеристик: 4к6, отбросить наименьший
/// кубик, сложить оставшиеся три. Показываем все 4 кубика и какой отброшен,
/// чтобы бросок был прозрачным, а не «просто число».
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbilityScoreRoll {
    pub dice: Vec<i32>,
    pub dropped_index: usize,
    pub total: i32,
}

pub fn roll_ability_score() -> AbilityScoreRoll {
    let dice = roll_set(4, 6);
    let dropped_index = dice
        .iter()
        .enumerate()
        .min_by_key(|&(_, &v)| v)
        .map(|(i, _)| i)
        .expect("roll_set(4, 6) всегда возвращает 4 значения");
    let total = dice
        .iter()
        .enumerate()
        .filter(|&(i, _)| i != dropped_index)
        .map(|(_, &v)| v)
        .sum();
    AbilityScoreRoll { dice, dropped_index, total }
}

pub fn roll_ability_scores() -> Vec<AbilityScoreRoll> {
    (0..6).map(|_| roll_ability_score()).collect()
}

pub fn roll_expression(expr: &str) -> Result<RollResult, String> {
    roll_expression_with(expr, &mut rand::thread_rng())
}

/// То же выражение и тот же разбор, но случайность приходит снаружи.
///
/// Это единственная дверь, через которую бросает движок мастера (`gm/rng.rs`):
/// второй грамматики выражения в проекте нет и быть не должно — `parse`
/// остаётся приватной, а `roll_expression` выше зовёт ровно это тело со своим
/// `thread_rng`. Владельцев два, и они разные: грамматика — здесь, случайность —
/// у вызывающего.
pub fn roll_expression_with<R: Rng + ?Sized>(
    expr: &str,
    rng: &mut R,
) -> Result<RollResult, String> {
    let parsed = parse(expr)?;

    let (rolls, dropped) = match parsed.mode {
        RollMode::Normal => (roll_set_with(parsed.count, parsed.sides, rng), None),
        RollMode::Advantage | RollMode::Disadvantage => {
            let a = roll_set_with(parsed.count, parsed.sides, rng);
            let b = roll_set_with(parsed.count, parsed.sides, rng);
            let sum_a: i32 = a.iter().sum();
            let sum_b: i32 = b.iter().sum();
            let take_a = match parsed.mode {
                RollMode::Advantage => sum_a >= sum_b,
                _ => sum_a <= sum_b,
            };
            if take_a {
                (a, Some(b))
            } else {
                (b, Some(a))
            }
        }
    };

    let total = rolls.iter().sum::<i32>() + parsed.modifier;
    Ok(RollResult {
        expression: expr.to_string(),
        rolls,
        modifier: parsed.modifier,
        total,
        dropped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ability_score_roll_drops_exactly_the_lowest_of_four_d6() {
        for _ in 0..500 {
            let roll = roll_ability_score();
            assert_eq!(roll.dice.len(), 4);
            assert!(roll.dice.iter().all(|&d| (1..=6).contains(&d)));

            let min = *roll.dice.iter().min().unwrap();
            assert_eq!(
                roll.dice[roll.dropped_index], min,
                "отброшенный индекс должен указывать на наименьшее значение"
            );

            let expected_total: i32 = roll
                .dice
                .iter()
                .enumerate()
                .filter(|&(i, _)| i != roll.dropped_index)
                .map(|(_, &v)| v)
                .sum();
            assert_eq!(roll.total, expected_total);
            assert!((3..=18).contains(&roll.total));
        }
    }

    #[test]
    fn ability_score_rolls_generates_six_scores() {
        assert_eq!(roll_ability_scores().len(), 6);
    }
}
