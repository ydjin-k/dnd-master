//! Оракул — разрешение бинарных неизвестных фактов мира (§6, §27, §29.2).
//!
//! **Главное в модуле — отказ от броска (§6.3).** Перед тем как бросать, Оракул
//! спрашивает Fact Store. Факт найден — ответ возвращается из него, и бросок не
//! делается ВОВСЕ: ни кубик, ни поток ГСЧ не трогаются. Иначе движок
//! противоречил бы игроку — минуту назад дверь была заперта, теперь нет.
//! Порядок §27 соблюдается целиком: жёсткое правило → подтверждённый факт →
//! состояние → Оракул.
//!
//! **Текст вопроса в логике не участвует.** §29.2: вопрос хранится как журнал
//! для человека, и никакого разбора слов, ключевых фраз и угадывания
//! вероятности по формулировке здесь нет. Вопрос адресуется парой «субъект +
//! предикат» — той же самой, которой адресуется факт: вторая система имён для
//! одного и того же вопроса завела бы второго владельца его личности.
//!
//! **Вероятность выбирает мастер (§30 ASSISTED GM).** Считать её по тегам
//! контекста (§31 Confidence, §43 AUTO GM) — это v0.3, и здесь этого нет.

use serde::{Deserialize, Serialize};

use crate::model::CampaignState;
use crate::storage::generate_id;

use super::facts::{self, FactSource};
use super::mutate::{self, Mutation};
use super::result::{ResultObject, RollTrace};
use super::rng::Roller;
use super::state::{LogEntry, LogLine};

/// Шкала вероятности §6.1. Пять категорий, и других не бывает: мастер выбирает
/// из них, а не называет произвольный процент.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Probability {
    AlmostImpossible,
    Unlikely,
    EvenChance,
    Likely,
    AlmostCertain,
}

/// Шкала по порядку — от «почти невозможно» к «почти наверняка». Порядок здесь
/// не оформление: на нём стоит §6.4, где модификатор двигает категорию на шаг.
const SCALE: [Probability; 5] = [
    Probability::AlmostImpossible,
    Probability::Unlikely,
    Probability::EvenChance,
    Probability::Likely,
    Probability::AlmostCertain,
];

impl Probability {
    pub fn percent(self) -> u8 {
        match self {
            Probability::AlmostImpossible => 10,
            Probability::Unlikely => 30,
            Probability::EvenChance => 50,
            Probability::Likely => 70,
            Probability::AlmostCertain => 90,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Probability::AlmostImpossible => "почти невозможно",
            Probability::Unlikely => "маловероятно",
            Probability::EvenChance => "равные шансы",
            Probability::Likely => "вероятно",
            Probability::AlmostCertain => "почти наверняка",
        }
    }

    /// Категория по названному мастером проценту. Процент вне шкалы — отказ, а
    /// не округление к ближайшему: движок не догадывается, что имел в виду
    /// мастер.
    pub fn from_percent(percent: u8) -> Result<Self, String> {
        SCALE
            .iter()
            .copied()
            .find(|category| category.percent() == percent)
            .ok_or_else(|| {
                format!("вероятность {percent} вне шкалы §6.1: 10, 30, 50, 70 или 90")
            })
    }

    /// Модификатор §6.4: **шаг двигает КАТЕГОРИЮ на одну позицию, а не
    /// прибавляет проценты.** Поэтому +1 к «равным шансам» — это 70, а не 51, и
    /// поэтому же +1 и −1 гасят друг друга ровно, как в примере концепта.
    ///
    /// На краях шкала упирается: «почти наверняка» с +2 остаётся 90. Уверенности
    /// крепче шкала не знает, а 110% не бывает.
    pub fn shift(self, steps: i8) -> Probability {
        let at = SCALE
            .iter()
            .position(|&category| category == self)
            .expect("категория всегда из шкалы");
        let moved = (at as i32 + steps as i32).clamp(0, SCALE.len() as i32 - 1);
        SCALE[moved as usize]
    }
}

/// Четыре исхода §6.2.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    StrongYes,
    Yes,
    No,
    StrongNo,
}

impl Outcome {
    /// Утвердительный ли ответ — этим значением создаётся факт.
    pub fn is_yes(self) -> bool {
        matches!(self, Outcome::StrongYes | Outcome::Yes)
    }
}

/// Границы крайних исходов §6.2.
const STRONG_YES_MAX: i32 = 5;
const STRONG_NO_MIN: i32 = 96;
/// Модификатор за пределами шкалы §6.4 — отказ.
const MODIFIER_MIN: i8 = -2;
const MODIFIER_MAX: i8 = 2;
/// Кубик Оракула. Выражение уходит в грамматику `dice.rs`, а числа берутся из
/// ГСЧ кампании — второго разбора выражений в проекте нет.
const ORACLE_DIE: &str = "1d100";

/// Исход по вероятности и броску (§6.2).
///
/// **Крайний исход имеет приоритет, и проверяется он ПЕРВЫМ.** Это явное
/// правило §6.2, и теряется оно чаще прочего: бросок 3 при вероятности 10 — это
/// `STRONG_YES`, а не `YES`; бросок 98 при вероятности 90 — `STRONG_NO`, а не
/// `NO`. Порядок веток ниже и есть это правило.
fn outcome_for(probability: u8, roll: i32) -> Outcome {
    if roll <= STRONG_YES_MAX {
        return Outcome::StrongYes;
    }
    if roll >= STRONG_NO_MIN {
        return Outcome::StrongNo;
    }
    if roll <= probability as i32 {
        Outcome::Yes
    } else {
        Outcome::No
    }
}

/// Спросить Оракула (§6).
///
/// `question` — текст для человека, и он НИГДЕ не участвует в решении: уезжает
/// в строку лога приключения и в трассировку, чтобы мастер потом вспомнил, о
/// чём спрашивал. Решение целиком стоит на паре «субъект + предикат»,
/// вероятности и модификаторе.
pub fn ask(
    campaign: &mut CampaignState,
    question: String,
    subject: String,
    predicate: String,
    probability: u8,
    modifier: i8,
) -> Result<ResultObject, String> {
    if !(MODIFIER_MIN..=MODIFIER_MAX).contains(&modifier) {
        return Err(format!(
            "модификатор {modifier} вне шкалы §6.4: от {MODIFIER_MIN} до {MODIFIER_MAX}"
        ));
    }
    if subject.trim().is_empty() || predicate.trim().is_empty() {
        return Err("у вопроса Оракулу должны быть субъект и предикат (§4.6)".into());
    }
    let base = Probability::from_percent(probability)?;
    let final_probability = base.shift(modifier);

    let engine = super::engine_mut(campaign);
    let turn = engine.turn() + 1;

    let asked = format!(
        "Вопрос → {}.{} («{}» — текст для журнала, в логике не участвует)",
        facts::key(&subject),
        facts::key(&predicate),
        question.trim()
    );

    // ── §6.3: ответ уже есть — бросок не выполняется вовсе ──────────────────
    if let Some(known) = facts::find(engine, &subject, &predicate) {
        let outcome = if known.value { Outcome::Yes } else { Outcome::No };
        let trace = vec![
            "Action Router → ORACLE".into(),
            asked,
            format!(
                "Fact Store → {}.{} = {} (источник {:?}) — ОТВЕТ ИЗ ФАКТА, БРОСОК НЕ ВЫПОЛНЯЛСЯ (§6.3)",
                known.subject,
                known.predicate,
                known.value,
                known.source
            ),
            format!(
                "ГСЧ не тронут: обращений было {} и осталось {}",
                engine.rng_cursor().draws,
                engine.rng_cursor().draws
            ),
            format!("Исход → {outcome:?}"),
        ];
        let entry = LogEntry {
            id: generate_id(),
            turn,
            line: LogLine::OracleAnswered {
                question: question.trim().to_string(),
                subject: known.subject.clone(),
                predicate: known.predicate.clone(),
                probability: final_probability.percent(),
                // `None` — и это единственный признак «броска не было»: второго
                // поля вроде `from_fact` нет, чтобы у одного факта не оказалось
                // двух владельцев, способных разойтись.
                roll: None,
                outcome,
                value: known.value,
            },
        };

        let transaction = mutate::apply(engine, "ask_oracle", vec![Mutation::Logged(entry)])?;

        return Ok(ResultObject::success("ORACLE", "oracle.fromFact")
            .with_changes(transaction.mutations().to_vec())
            .with_trace(trace));
    }

    // ── факта нет: бросок ГСЧ кампании ──────────────────────────────────────
    let mut roller = Roller::of(engine);
    let (rolled, draw_no) = roller.roll(ORACLE_DIE)?;
    let roll = rolled.total;
    let outcome = outcome_for(final_probability.percent(), roll);
    let fact = facts::new_fact(&subject, &predicate, outcome.is_yes(), FactSource::Oracle);

    let trace = vec![
        "Action Router → ORACLE".into(),
        asked,
        format!("Базовая → {} ({})", base.percent(), base.label()),
        format!(
            "Модификатор → {modifier:+} (шаг категории §6.4) → {} ({})",
            final_probability.percent(),
            final_probability.label()
        ),
        format!(
            "Бросок → {roll} ({ORACLE_DIE}, сид {}, обращение №{draw_no})",
            engine.seed()
        ),
        format!("Исход → {outcome:?} ({})", outcome_reason(final_probability.percent(), roll)),
        format!(
            "Факт → создан: {}.{} = {} (источник oracle)",
            fact.subject, fact.predicate, fact.value
        ),
        "Лог → строка добавлена".into(),
    ];

    let entry = LogEntry {
        id: generate_id(),
        turn,
        line: LogLine::OracleAnswered {
            question: question.trim().to_string(),
            subject: fact.subject.clone(),
            predicate: fact.predicate.clone(),
            probability: final_probability.percent(),
            roll: Some(roll as u8),
            outcome,
            value: fact.value,
        },
    };

    let mutations = vec![
        roller
            .advanced()
            .expect("бросок был — поток обязан сдвинуться"),
        Mutation::FactCreated(fact),
        Mutation::Logged(entry),
    ];
    let transaction = mutate::apply(engine, "ask_oracle", mutations)?;

    Ok(ResultObject::success("ORACLE", "oracle.rolled")
        .with_changes(transaction.mutations().to_vec())
        .with_rolls(vec![RollTrace {
            die: ORACLE_DIE.into(),
            value: roll,
            modifier: 0,
            total: roll,
            target: Some(final_probability.percent() as i32),
        }])
        .with_trace(trace))
}

/// Почему именно этот исход — словами, для трассировки §38.
fn outcome_reason(probability: u8, roll: i32) -> String {
    if roll <= STRONG_YES_MAX {
        return format!("{roll} ≤ {STRONG_YES_MAX}, крайний исход имеет приоритет §6.2");
    }
    if roll >= STRONG_NO_MIN {
        return format!("{roll} ≥ {STRONG_NO_MIN}, крайний исход имеет приоритет §6.2");
    }
    if roll <= probability as i32 {
        format!("{roll} ≤ {probability}")
    } else {
        format!("{roll} > {probability}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gm::facts::Fact;

    fn campaign() -> CampaignState {
        CampaignState {
            id: "campaign-1".into(),
            campaign_name: "Проверка".into(),
            ..Default::default()
        }
    }

    fn facts_of(campaign: &CampaignState) -> &[Fact] {
        campaign.engine.as_ref().unwrap().facts()
    }

    fn last_line(campaign: &CampaignState) -> LogLine {
        campaign
            .engine
            .as_ref()
            .unwrap()
            .adventure_log()
            .last()
            .expect("строка лога")
            .line
            .clone()
    }

    /// §6.2 на конкретных числах: все четыре исхода и обе крайние границы, с
    /// пробоем 1–5 и 96–100 по соседним значениям.
    ///
    /// **Приоритет крайнего исхода** — первые четыре пары: при вероятности 10
    /// бросок 3 обязан быть `STRONG_YES`, хотя 3 ≤ 10 и «просто ДА» тоже
    /// подошло бы; при вероятности 90 бросок 98 обязан быть `STRONG_NO`.
    ///
    /// Отрицательная проба: убрать из `outcome_for` две первые ветки (крайние
    /// исходы) — краснеет первая же пара: `STRONG_YES` превращается в `YES`.
    #[test]
    fn every_boundary_of_the_four_outcomes_holds_on_named_numbers() {
        let cases = [
            // вероятность, бросок, исход — приоритет крайнего
            (10, 1, Outcome::StrongYes),
            (10, 3, Outcome::StrongYes),
            (10, 5, Outcome::StrongYes),
            (90, 96, Outcome::StrongNo),
            (90, 98, Outcome::StrongNo),
            (90, 100, Outcome::StrongNo),
            // граница «≤ P» — ДА, и первое число за ней — НЕТ
            (10, 6, Outcome::Yes),
            (10, 10, Outcome::Yes),
            (10, 11, Outcome::No),
            (30, 30, Outcome::Yes),
            (30, 31, Outcome::No),
            (50, 50, Outcome::Yes),
            (50, 51, Outcome::No),
            (70, 70, Outcome::Yes),
            (70, 71, Outcome::No),
            (90, 90, Outcome::Yes),
            (90, 91, Outcome::No),
            // число прямо под крайним НЕТ — это ещё обычное НЕТ, при любой
            // вероятности шкалы
            (90, 95, Outcome::No),
            (50, 95, Outcome::No),
            (50, 96, Outcome::StrongNo),
        ];

        for (probability, roll, expected) in cases {
            assert_eq!(
                outcome_for(probability, roll),
                expected,
                "вероятность {probability}, бросок {roll}"
            );
        }
    }

    /// Пример §6.4 из концепта: базовая «равные шансы», крепость охраняется
    /// (+1), район уже покинут (−1) — итог обязан остаться 50/50.
    ///
    /// Сходится он двумя путями: шагами по одному и суммой модификаторов, —
    /// потому что шаг двигает КАТЕГОРИЮ, а не прибавляет проценты. Если бы
    /// проценты складывались, «+1 −1» тоже дало бы 50, но «+1 +1» дало бы 52
    /// вместо 90 — это и ловит вторая половина пробы.
    #[test]
    fn the_concept_example_where_plus_one_and_minus_one_cancel_out_holds() {
        let base = Probability::EvenChance;

        assert_eq!(base.shift(1).shift(-1), base, "шагами по одному");
        assert_eq!(base.shift(1 - 1), base, "суммой модификаторов");
        assert_eq!(base.shift(0).percent(), 50);

        // Шаг — это категория, а не процент.
        assert_eq!(base.shift(1).percent(), 70);
        assert_eq!(base.shift(2).percent(), 90);
        assert_eq!(base.shift(-1).percent(), 30);
        assert_eq!(base.shift(-2).percent(), 10);
    }

    /// Шкала упирается на краях: 90 с +2 остаётся 90, 10 с −2 остаётся 10.
    #[test]
    fn the_scale_stops_at_its_ends_instead_of_inventing_a_sixth_category() {
        assert_eq!(Probability::AlmostCertain.shift(2), Probability::AlmostCertain);
        assert_eq!(Probability::AlmostImpossible.shift(-2), Probability::AlmostImpossible);
        assert_eq!(Probability::Likely.shift(2), Probability::AlmostCertain);
    }

    #[test]
    fn a_probability_outside_the_scale_and_a_modifier_outside_its_range_are_refused() {
        assert!(Probability::from_percent(55).is_err());
        assert!(Probability::from_percent(0).is_err());
        let mut campaign = campaign();
        assert!(
            ask(&mut campaign, "Заперта?".into(), "d".into(), "l".into(), 50, 3).is_err(),
            "модификатор +3 — не шкала §6.4"
        );
        assert!(
            ask(&mut campaign, "Заперта?".into(), "d".into(), "l".into(), 55, 0).is_err(),
            "вероятность 55 — не шкала §6.1"
        );
    }

    /// Бросок Оракула создаёт факт и строку лога приключения; дневник кампании
    /// не тронут.
    #[test]
    fn a_rolled_answer_creates_a_fact_a_log_line_and_moves_the_rng() {
        let mut campaign = campaign();
        let result = ask(
            &mut campaign,
            "Дверь заперта?".into(),
            "door_03".into(),
            "locked".into(),
            70,
            0,
        )
        .unwrap();

        assert_eq!(result.result_type, "ORACLE");
        assert_eq!(result.rolls.len(), 1, "бросок был и он один");
        assert_eq!(result.rolls[0].die, "1d100");
        assert_eq!(result.rolls[0].target, Some(70));

        let engine = campaign.engine.as_ref().unwrap();
        assert_eq!(facts_of(&campaign).len(), 1, "исход записан фактом");
        assert_eq!(facts_of(&campaign)[0].source, FactSource::Oracle);
        assert_eq!(engine.adventure_log().len(), 1, "и строкой лога приключения");
        assert_eq!(engine.rng_cursor().draws, 1, "поток ГСЧ сдвинулся на одно обращение");
        assert!(campaign.journal.is_empty(), "дневник кампании движок не трогает");

        // Трассировка — вся арифметика, а не только итог.
        let trace = result.trace.join("\n");
        assert!(trace.contains("Базовая → 70"), "{trace}");
        assert!(trace.contains("Бросок →"), "{trace}");
        assert!(trace.contains("обращение №1"), "{trace}");
        assert!(trace.contains("Факт → создан"), "{trace}");
    }

    /// ОТРИЦАТЕЛЬНАЯ ПРОБА §6.3 — главная в карточке: факт есть, значит бросок
    /// НЕ выполняется, а ответ берётся из факта.
    ///
    /// Со снятой починкой (в `ask` ветка `facts::find` перестаёт находить
    /// известный факт, то есть Оракул бросает всегда) проба краснеет на втором
    /// вопросе: вызов возвращает ОШИБКУ и падает на `unwrap`. Так и должно
    /// быть — бросок уже съел число из потока, а созданный по нему факт
    /// отклонил валидатор как дубль; Оракул без §6.3 не просто перебрасывает
    /// решённое, он вообще перестаёт отвечать на уже решённый вопрос. Ниже
    /// сторожат ещё три строки: `rolls` пуст, обращений к ГСЧ столько же,
    /// факт остался один.
    #[test]
    fn a_question_with_a_known_answer_is_answered_from_the_fact_without_rolling() {
        let mut campaign = campaign();
        // Первый раз — бросок.
        ask(&mut campaign, "Дверь заперта?".into(), "door_03".into(), "locked".into(), 70, 0)
            .unwrap();
        let engine = campaign.engine.as_ref().unwrap();
        let known = facts_of(&campaign)[0].value;
        let draws_after_first = engine.rng_cursor().draws;
        assert_eq!(draws_after_first, 1);

        // Тот же вопрос второй раз — ответ из факта.
        let again = ask(
            &mut campaign,
            "Дверь заперта?".into(),
            "door_03".into(),
            "locked".into(),
            70,
            0,
        )
        .unwrap();

        assert!(again.rolls.is_empty(), "бросок не выполнялся (§6.3)");
        let engine = campaign.engine.as_ref().unwrap();
        assert_eq!(
            engine.rng_cursor().draws,
            draws_after_first,
            "поток ГСЧ не тронут: обращений столько же"
        );
        assert_eq!(facts_of(&campaign).len(), 1, "второго факта не завелось");
        assert_eq!(facts_of(&campaign)[0].value, known, "и ответ тот же, что был");

        let trace = again.trace.join("\n");
        assert!(
            trace.contains("ОТВЕТ ИЗ ФАКТА, БРОСОК НЕ ВЫПОЛНЯЛСЯ"),
            "это должно быть видно в trace: {trace}"
        );

        // Исход согласован с фактом, и в строке лога броска нет.
        match last_line(&campaign) {
            LogLine::OracleAnswered { roll, outcome, value, .. } => {
                assert_eq!(roll, None, "в логе тоже видно, что броска не было");
                assert_eq!(value, known);
                assert_eq!(outcome, if known { Outcome::Yes } else { Outcome::No });
            }
            other => panic!("ждали строку Оракула, пришло {other:?}"),
        }
    }

    /// Ответ из факта не зависит от того, что мастер выбрал вероятность
    /// по-другому: факт сильнее (§27, пункт 2 выше пункта 6).
    #[test]
    fn a_known_fact_outranks_any_probability_the_master_picks() {
        let mut campaign = campaign();
        crate::gm::facts::create_fact(
            &mut campaign,
            "door_03".into(),
            "locked".into(),
            true,
            FactSource::Master,
        )
        .unwrap();

        for probability in [10, 30, 50, 70, 90] {
            let answer = ask(
                &mut campaign,
                "Дверь заперта?".into(),
                "door_03".into(),
                "locked".into(),
                probability,
                0,
            )
            .unwrap();
            assert!(answer.rolls.is_empty());
            assert!(matches!(last_line(&campaign), LogLine::OracleAnswered { outcome: Outcome::Yes, .. }));
        }
        assert_eq!(campaign.engine.as_ref().unwrap().rng_cursor().draws, 0, "ни одного броска");
    }

    /// §44 шаг 11 на уровне Оракула: та же кампания с тем же сидом даёт ту же
    /// последовательность ответов. Сравниваются разные вопросы — чтобы факты не
    /// закрывали броски по §6.3.
    #[test]
    fn the_same_seed_gives_the_same_sequence_of_oracle_answers() {
        fn run(seed_donor: &CampaignState) -> Vec<(Option<u8>, Outcome)> {
            let mut campaign = campaign();
            // Кампания-близнец: тот же сид, тот же поток.
            campaign.engine = seed_donor.engine.clone();
            (0..10)
                .map(|i| {
                    ask(
                        &mut campaign,
                        format!("Вопрос {i}?"),
                        format!("door_{i:02}"),
                        "locked".into(),
                        50,
                        0,
                    )
                    .unwrap();
                    match last_line(&campaign) {
                        LogLine::OracleAnswered { roll, outcome, .. } => (roll, outcome),
                        other => panic!("ждали строку Оракула, пришло {other:?}"),
                    }
                })
                .collect()
        }

        let mut origin = campaign();
        super::super::engine_mut(&mut origin);

        let first = run(&origin);
        let second = run(&origin);
        assert_eq!(first, second, "тот же сид — та же последовательность ответов");
        assert!(first.iter().all(|(roll, _)| roll.is_some()), "все десять — броски");

        let mut other_seed = campaign();
        super::super::engine_mut(&mut other_seed);
        assert_ne!(
            run(&other_seed).iter().map(|(roll, _)| *roll).collect::<Vec<_>>(),
            first.iter().map(|(roll, _)| *roll).collect::<Vec<_>>(),
            "другой сид — другая последовательность"
        );
    }

    /// Текст вопроса в решении не участвует НИКАК. Проба задаёт один и тот же
    /// вопрос о разных парах и разный текст об одной паре — решает пара, а
    /// формулировка только хранится.
    #[test]
    fn the_wording_of_the_question_changes_nothing_in_the_decision() {
        let mut campaign = campaign();
        ask(&mut campaign, "Дверь заперта?".into(), "door_03".into(), "locked".into(), 50, 0)
            .unwrap();
        let decided = facts_of(&campaign)[0].value;

        // Другой текст, та же пара — ответ из факта, тот же самый.
        let again = ask(
            &mut campaign,
            "А точно ли эта дверь на замке, ну хоть чуть-чуть?".into(),
            "door_03".into(),
            "locked".into(),
            90,
            2,
        )
        .unwrap();
        assert!(again.rolls.is_empty());
        assert_eq!(facts_of(&campaign)[0].value, decided);

        // Текст сохранён дословно — он журнал для человека.
        match last_line(&campaign) {
            LogLine::OracleAnswered { question, .. } => {
                assert_eq!(question, "А точно ли эта дверь на замке, ну хоть чуть-чуть?");
            }
            other => panic!("ждали строку Оракула, пришло {other:?}"),
        }
    }

    /// Имена полей строки Оракула читает фронт — по ним он рисует лог.
    #[test]
    fn the_oracle_log_line_field_names_match_the_frontend_type() {
        let line = LogLine::OracleAnswered {
            question: "Дверь заперта?".into(),
            subject: "door_03".into(),
            predicate: "locked".into(),
            probability: 70,
            roll: Some(82),
            outcome: Outcome::No,
            value: false,
        };
        let json = serde_json::to_value(&line).unwrap();

        assert_eq!(json["kind"], "oracleAnswered");
        assert_eq!(json["probability"], 70);
        assert_eq!(json["roll"], 82);
        assert_eq!(json["outcome"], "no");
        assert_eq!(json["value"], false);
        assert!(json.get("question").is_some(), "текст вопроса хранится в логе");
    }
}
