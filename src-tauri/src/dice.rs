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

fn roll_set(count: i32, sides: i32) -> Vec<i32> {
    let mut rng = rand::thread_rng();
    (0..count).map(|_| rng.gen_range(1..=sides)).collect()
}

pub fn roll_expression(expr: &str) -> Result<RollResult, String> {
    let parsed = parse(expr)?;

    let (rolls, dropped) = match parsed.mode {
        RollMode::Normal => (roll_set(parsed.count, parsed.sides), None),
        RollMode::Advantage | RollMode::Disadvantage => {
            let a = roll_set(parsed.count, parsed.sides);
            let b = roll_set(parsed.count, parsed.sides);
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
