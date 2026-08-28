use rand::Rng;
use serde::{Deserialize, Serialize};

/// Оригинальная механика «вопрос/ответ» для сольной игры: вместо того чтобы
/// придумывать ответ самому, игрок задаёт да/нет-вопрос, оценивает его
/// вероятность на глаз и бросает кубик — дальше вопрос решает бросок, а не
/// игрок и не языковая модель (см. GAME.md п.1). Числа и формулировки —
/// собственные, идея жанра («оракул с коэффициентом хаоса и случайными
/// событиями на дублях») общая для всего жанра сольных ГМ-эмуляторов, не
/// скопирована из конкретной книги.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Likelihood {
    AlmostNever,
    Unlikely,
    SomeChance,
    Even,
    Likely,
    VeryLikely,
    AlmostSure,
}

pub const ALL_LIKELIHOODS: [Likelihood; 7] = [
    Likelihood::AlmostNever,
    Likelihood::Unlikely,
    Likelihood::SomeChance,
    Likelihood::Even,
    Likelihood::Likely,
    Likelihood::VeryLikely,
    Likelihood::AlmostSure,
];

impl Likelihood {
    /// Базовый порог на д100 (без учёта коэффициента хаоса).
    fn base_threshold(self) -> i32 {
        match self {
            Likelihood::AlmostNever => 5,
            Likelihood::Unlikely => 25,
            Likelihood::SomeChance => 40,
            Likelihood::Even => 50,
            Likelihood::Likely => 60,
            Likelihood::VeryLikely => 75,
            Likelihood::AlmostSure => 95,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Likelihood::AlmostNever => "Почти невозможно",
            Likelihood::Unlikely => "Маловероятно",
            Likelihood::SomeChance => "Есть шанс",
            Likelihood::Even => "50/50",
            Likelihood::Likely => "Вероятно",
            Likelihood::VeryLikely => "Очень вероятно",
            Likelihood::AlmostSure => "Почти наверняка",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OracleAnswer {
    ExceptionalYes,
    Yes,
    No,
    ExceptionalNo,
}

impl OracleAnswer {
    pub fn label(self) -> &'static str {
        match self {
            OracleAnswer::ExceptionalYes => "Да, и притом неожиданно сильно",
            OracleAnswer::Yes => "Да",
            OracleAnswer::No => "Нет",
            OracleAnswer::ExceptionalNo => "Нет, и вдобавок всё усложняется",
        }
    }
}

/// Фокусы случайных событий — короткие подсказки «о чём» это событие, а не
/// готовые сцены: игрок сам додумывает конкретику под текущую ситуацию.
/// Собственный список, не список из какой-либо конкретной книги.
const EVENT_FOCI: [&str; 14] = [
    "Неожиданная угроза",
    "Появляется союзник",
    "Открывается новая цель",
    "Вскрывается тайна",
    "Кто-то предаёт",
    "Находится ресурс",
    "Меняется окружение",
    "Время поджимает",
    "Появляется преграда",
    "Слух или весть извне",
    "Прошлое напоминает о себе",
    "Ситуация обостряется",
    "Внимание переключается на NPC",
    "Везение — в вашу пользу",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OracleResult {
    pub roll: u32,
    pub answer: OracleAnswer,
    /// Задано, если выпали дубли (11, 22, ..., 99) или 100 — намёк, что в
    /// сцену стоит внести случайное осложнение или поворот с этим фокусом.
    pub random_event: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LikelihoodOption {
    pub id: Likelihood,
    pub label: &'static str,
}

pub fn likelihood_options() -> Vec<LikelihoodOption> {
    ALL_LIKELIHOODS
        .iter()
        .map(|&id| LikelihoodOption { id, label: id.label() })
        .collect()
}

pub const MIN_CHAOS_FACTOR: i32 = 1;
pub const MAX_CHAOS_FACTOR: i32 = 9;
const NEUTRAL_CHAOS_FACTOR: i32 = 5;

/// Коэффициент хаоса 1-9 сдвигает порог: выше нейтрального (5) — мир более
/// непредсказуем и склоняется к «да» даже на манёвренных вопросах, ниже —
/// удерживает наиболее вероятный исход. Шаг подобран так, чтобы на крайних
/// значениях (1 и 9) даже «Почти невозможно»/«Почти наверняка» могли качнуться
/// в другую сторону, но редко.
fn effective_threshold(likelihood: Likelihood, chaos_factor: i32) -> i32 {
    let shift = (chaos_factor - NEUTRAL_CHAOS_FACTOR) * 5;
    (likelihood.base_threshold() + shift).clamp(5, 95)
}

fn is_double_or_hundred(roll: u32) -> bool {
    roll == 100 || (roll % 11 == 0)
}

pub fn ask(likelihood: Likelihood, chaos_factor: i32) -> OracleResult {
    let roll = rand::thread_rng().gen_range(1..=100);
    let threshold = effective_threshold(likelihood, chaos_factor);
    let is_yes = roll <= threshold as u32;

    let answer = if is_yes {
        if roll <= 5 {
            OracleAnswer::ExceptionalYes
        } else {
            OracleAnswer::Yes
        }
    } else if roll >= 96 {
        OracleAnswer::ExceptionalNo
    } else {
        OracleAnswer::No
    };

    let random_event = if is_double_or_hundred(roll) {
        let idx = rand::thread_rng().gen_range(0..EVENT_FOCI.len());
        Some(EVENT_FOCI[idx].to_string())
    } else {
        None
    };

    OracleResult { roll, answer, random_event }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn almost_never_at_neutral_chaos_rarely_says_yes() {
        let mut yes_count = 0;
        for _ in 0..2000 {
            if matches!(
                ask(Likelihood::AlmostNever, NEUTRAL_CHAOS_FACTOR).answer,
                OracleAnswer::Yes | OracleAnswer::ExceptionalYes
            ) {
                yes_count += 1;
            }
        }
        // Порог 5% — за 2000 бросков ожидаем около 100 да, даём широкий запас.
        assert!(yes_count < 200, "почти невозможно сказало да {yes_count} раз из 2000");
    }

    #[test]
    fn almost_sure_at_neutral_chaos_rarely_says_no() {
        let mut no_count = 0;
        for _ in 0..2000 {
            if matches!(
                ask(Likelihood::AlmostSure, NEUTRAL_CHAOS_FACTOR).answer,
                OracleAnswer::No | OracleAnswer::ExceptionalNo
            ) {
                no_count += 1;
            }
        }
        assert!(no_count < 200, "почти наверняка сказало нет {no_count} раз из 2000");
    }

    #[test]
    fn high_chaos_factor_pushes_even_toward_yes() {
        // При максимальном хаосе (9) порог для 50/50 сдвигается на +20 → 70,
        // так что "да" должно выпадать заметно чаще half the time.
        let mut yes_count = 0;
        for _ in 0..2000 {
            if matches!(
                ask(Likelihood::Even, MAX_CHAOS_FACTOR).answer,
                OracleAnswer::Yes | OracleAnswer::ExceptionalYes
            ) {
                yes_count += 1;
            }
        }
        assert!(yes_count > 1200, "ожидал сильный сдвиг к да, получил {yes_count} из 2000");
    }

    #[test]
    fn doubles_and_hundred_always_trigger_a_random_event() {
        for roll in [11, 22, 33, 44, 55, 66, 77, 88, 99, 100] {
            assert!(is_double_or_hundred(roll), "{roll} должен считаться дублем");
        }
        for roll in [1, 12, 45, 67, 89, 95] {
            assert!(!is_double_or_hundred(roll), "{roll} не должен считаться дублем");
        }
    }

    #[test]
    fn threshold_is_always_clamped_to_a_valid_percentage() {
        for &likelihood in &ALL_LIKELIHOODS {
            for chaos in MIN_CHAOS_FACTOR..=MAX_CHAOS_FACTOR {
                let t = effective_threshold(likelihood, chaos);
                assert!((5..=95).contains(&t), "порог {t} вне диапазона 5..=95");
            }
        }
    }
}
