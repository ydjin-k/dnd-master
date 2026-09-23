//! Сцена и напряжение (§4.2, §7, §10).
//!
//! **Напряжение живёт у сцены, а не у кампании.** В концепте оно объявлено
//! дважды — §4.1 (`CampaignState.tension`) и §4.2 (`SceneState.tension`); это
//! дубль самого концепта, и ADR 0001 решил в пользу сцены. Причина в том, что
//! напряжение описывает нестабильность ТЕКУЩЕЙ ситуации и меняется по правилу
//! завершения сцены (§7.2): у кампании, которая сцену переживает, для него нет
//! ни момента изменения, ни смысла.

use serde::{Deserialize, Serialize};

use crate::model::CampaignState;
use crate::storage::generate_id;

use super::mutate::{self, Mutation};
use super::result::ResultObject;
use super::state::{LogEntry, LogLine};

/// Границы шкалы §7: 1 — спокойствие, 5 — кризис.
pub const TENSION_MIN: u8 = 1;
pub const TENSION_MAX: u8 = 5;
/// Напряжение первой сцены кампании: «неопределённость» по шкале §7.
const TENSION_START: u8 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SceneStatus {
    Active,
    Resolved,
}

/// Как закончилась сцена (§7.2). Исход называет мастер — движку неоткуда его
/// вывести, пока нет Event Engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SceneOutcome {
    /// Ситуация стала контролируемее: −1.
    Calmer,
    /// Существенных изменений нет: 0.
    Unchanged,
    /// Положение ухудшилось: +1.
    Worse,
}

impl SceneOutcome {
    fn delta(self) -> i8 {
        match self {
            SceneOutcome::Calmer => -1,
            SceneOutcome::Unchanged => 0,
            SceneOutcome::Worse => 1,
        }
    }
}

/// Состояние сцены (§4.2).
///
/// `location` — название места строкой, а не ссылка на `Location`: реестра
/// локаций (`gm/world.rs`) в v0.1 ещё нет, и заводить его здесь значило бы
/// сделать половину чужой карточки. Второго владельца это не создаёт именно
/// потому, что второго хранилища мест пока не существует; когда появится
/// `EngineState.locations`, поле станет `location_id`, а название переедет в
/// `Location.name` — одной правкой и в одном месте.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneState {
    pub id: String,
    pub status: SceneStatus,
    pub location: String,
    pub objective: String,
    pub tension: u8,
    pub participants: Vec<String>,
    pub active_threats: Vec<String>,
    pub scene_tags: Vec<String>,
    pub started_at_turn: u32,
    pub resolved_conditions: Vec<String>,
}

/// Создать сцену (§10.2).
///
/// Напряжение новой сцены НАСЛЕДУЕТСЯ у завершённой (§7.2: «при переходе новая
/// сцена берёт значение у закрытой»), а у первой сцены кампании берётся
/// `TENSION_START`. Иначе каждое завершение сцены обнуляло бы то, что правило
/// §7.2 только что посчитало, и шкала не значила бы ничего.
pub fn create_scene(
    campaign: &mut CampaignState,
    location: String,
    objective: String,
    participants: Vec<String>,
    scene_tags: Vec<String>,
) -> Result<ResultObject, String> {
    let engine = super::engine_mut(campaign);
    let turn = engine.turn() + 1;

    let (tension, tension_trace) = match engine.scene() {
        Some(previous) => (
            previous.tension,
            format!(
                "tension → {} (унаследовано у завершённой сцены, §7.2)",
                previous.tension
            ),
        ),
        None => (
            TENSION_START,
            format!("tension → {TENSION_START} (первая сцена кампании, §7)"),
        ),
    };

    let scene = SceneState {
        id: generate_id(),
        status: SceneStatus::Active,
        location: location.trim().to_string(),
        objective: objective.trim().to_string(),
        tension,
        participants,
        active_threats: Vec::new(),
        scene_tags,
        started_at_turn: turn,
        resolved_conditions: Vec::new(),
    };

    let log = LogEntry {
        id: generate_id(),
        turn,
        line: LogLine::SceneStarted {
            location: scene.location.clone(),
            objective: scene.objective.clone(),
            tension,
        },
    };

    let mutations = vec![
        Mutation::SceneCreated(scene),
        Mutation::Logged(log),
    ];
    let transaction = mutate::apply(engine, "create_scene", mutations)?;

    Ok(ResultObject::success("SCENE_CREATED", "scene.started")
        .with_changes(transaction.mutations().to_vec())
        .with_trace(vec![
            "Scene Manager → CREATE_SCENE".into(),
            "Активной сцены нет → создание разрешено".into(),
            tension_trace,
            format!("Transaction {} → turn {}", transaction.id(), transaction.turn()),
        ]))
}

/// Завершить сцену (§10.3) и сдвинуть напряжение по §7.2.
///
/// Второй вызов подряд — отказ, а не второй сдвиг напряжения: завершать
/// нечего, сцена уже `Resolved`. Проверяет это валидатор `mutate::validate`,
/// то есть отказ приходит оттуда же, откуда пришёл бы любой другой
/// недопустимый переход, а не из отдельной проверки на этом пути.
pub fn end_scene(campaign: &mut CampaignState, outcome: SceneOutcome) -> Result<ResultObject, String> {
    let engine = super::engine_mut(campaign);
    let turn = engine.turn() + 1;

    let scene = engine.scene().ok_or("сцены нет — завершать нечего")?;
    let before = scene.tension;
    let after = shift_tension(before, outcome);
    let (location, objective) = (scene.location.clone(), scene.objective.clone());

    let log = LogEntry {
        id: generate_id(),
        turn,
        line: LogLine::SceneEnded {
            location: location.clone(),
            objective: objective.clone(),
            outcome,
            tension_before: before,
            tension_after: after,
        },
    };

    let mutations = vec![
        Mutation::SceneEnded { outcome, tension: after },
        Mutation::Logged(log),
    ];
    let transaction = mutate::apply(engine, "end_scene", mutations)?;

    Ok(ResultObject::success("SCENE_ENDED", "scene.ended")
        .with_changes(transaction.mutations().to_vec())
        .with_trace(vec![
            "Scene Manager → END_SCENE".into(),
            format!("Исход → {}", outcome_trace(outcome)),
            format!(
                "tension §7.2: {before} {:+} → {after} (границы {TENSION_MIN}..{TENSION_MAX})",
                outcome.delta()
            ),
            format!("Transaction {} → turn {}", transaction.id(), transaction.turn()),
        ]))
}

/// Правило §7.2 целиком и в одном месте: −1 / 0 / +1 и упор в границы шкалы.
/// Упор — не ошибка: напряжение 5 при ухудшении остаётся 5, кризиса крепче
/// шкала не знает.
fn shift_tension(tension: u8, outcome: SceneOutcome) -> u8 {
    let shifted = tension as i16 + outcome.delta() as i16;
    shifted.clamp(TENSION_MIN as i16, TENSION_MAX as i16) as u8
}

fn outcome_trace(outcome: SceneOutcome) -> &'static str {
    match outcome {
        SceneOutcome::Calmer => "ситуация стала контролируемее",
        SceneOutcome::Unchanged => "существенных изменений нет",
        SceneOutcome::Worse => "положение ухудшилось",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gm::state::LogLine;

    fn campaign() -> CampaignState {
        CampaignState {
            id: "campaign-1".into(),
            campaign_name: "Проверка".into(),
            ..Default::default()
        }
    }

    fn start(campaign: &mut CampaignState) -> ResultObject {
        create_scene(
            campaign,
            "Подземный зал".into(),
            "Найти выход".into(),
            vec!["pc_vizzerin".into()],
            vec!["dark".into(), "underground".into()],
        )
        .expect("первая сцена должна создаться")
    }

    #[test]
    fn creating_a_scene_fills_the_scene_the_log_and_the_transaction_journal() {
        let mut campaign = campaign();
        let result = start(&mut campaign);

        let engine = campaign.engine.as_ref().expect("движок завёлся первой командой");
        let scene = engine.scene().expect("сцена на месте");
        assert_eq!(scene.location, "Подземный зал");
        assert_eq!(scene.objective, "Найти выход");
        assert_eq!(scene.status, SceneStatus::Active);
        assert_eq!(scene.tension, TENSION_START, "первая сцена кампании начинается с 3");
        assert_eq!(scene.participants, vec!["pc_vizzerin"]);
        assert_eq!(scene.started_at_turn, 1);

        // Лог приключения и журнал транзакций пишутся ОДНОЙ транзакцией с
        // решением — иначе лог разойдётся с состоянием, которое описывает.
        assert_eq!(engine.adventure_log().len(), 1);
        assert_eq!(engine.history().len(), 1);
        assert_eq!(engine.turn(), 1);
        assert_eq!(
            engine.adventure_log()[0].line,
            LogLine::SceneStarted {
                location: "Подземный зал".into(),
                objective: "Найти выход".into(),
                tension: 3,
            }
        );

        assert!(result.success);
        assert_eq!(result.result_type, "SCENE_CREATED");
        assert_eq!(result.state_changes.len(), 2, "сцена и строка лога");
        assert!(!result.trace.is_empty(), "трассировку заполняет тот, кто решает");
    }

    /// ОТРИЦАТЕЛЬНАЯ ПРОБА карточки: второе завершение подряд — отказ, а не
    /// второй сдвиг напряжения.
    ///
    /// Со снятой починкой (убрать из `mutate::validate` проверку
    /// `scene.status == Resolved`) краснеет строка «второе завершение обязано
    /// быть отказом»: вызов проходит, напряжение уезжает с 4 на 5, а в логе
    /// приключения оказываются две строки о конце одной и той же сцены.
    #[test]
    fn ending_a_scene_twice_is_refused_and_tension_moves_only_once() {
        let mut campaign = campaign();
        start(&mut campaign);

        end_scene(&mut campaign, SceneOutcome::Worse).expect("первое завершение проходит");
        let engine = campaign.engine.as_ref().unwrap();
        assert_eq!(engine.scene().unwrap().tension, 4, "3 + 1 по §7.2");
        let (log_len, history_len, turn) =
            (engine.adventure_log().len(), engine.history().len(), engine.turn());

        let second = end_scene(&mut campaign, SceneOutcome::Worse);
        assert!(second.is_err(), "второе завершение обязано быть отказом");

        let engine = campaign.engine.as_ref().unwrap();
        assert_eq!(engine.scene().unwrap().tension, 4, "напряжение не должно сдвинуться снова");
        assert_eq!(engine.adventure_log().len(), log_len, "в лог не должно лечь ничего");
        assert_eq!(engine.history().len(), history_len, "отклонённое действие — не транзакция");
        assert_eq!(engine.turn(), turn, "ход отклонённым действием не растёт");
    }

    #[test]
    fn a_second_scene_while_one_is_active_is_refused() {
        let mut campaign = campaign();
        start(&mut campaign);

        let second = create_scene(
            &mut campaign,
            "Коридор".into(),
            "Уйти тихо".into(),
            vec![],
            vec![],
        );
        assert!(second.is_err(), "пока сцена идёт, вторую начинать нельзя");
        assert_eq!(campaign.engine.as_ref().unwrap().scene().unwrap().location, "Подземный зал");
    }

    #[test]
    fn a_new_scene_inherits_the_tension_of_the_one_that_closed() {
        let mut campaign = campaign();
        start(&mut campaign);
        end_scene(&mut campaign, SceneOutcome::Worse).unwrap();

        create_scene(&mut campaign, "Коридор".into(), "Уйти тихо".into(), vec![], vec![]).unwrap();

        let scene = campaign.engine.as_ref().unwrap().scene().unwrap();
        assert_eq!(scene.location, "Коридор");
        assert_eq!(scene.tension, 4, "напряжение переезжает в новую сцену, а не обнуляется");
        assert_eq!(scene.status, SceneStatus::Active);
    }

    #[test]
    fn tension_never_leaves_the_one_to_five_scale() {
        // Верхний упор: 3 → 4 → 5 → 5.
        let mut campaign = campaign();
        for expected in [4, 5, 5] {
            start_and_end(&mut campaign, SceneOutcome::Worse, expected);
        }

        // Нижний упор: 5 → 4 → 3 → 2 → 1 → 1.
        for expected in [4, 3, 2, 1, 1] {
            start_and_end(&mut campaign, SceneOutcome::Calmer, expected);
        }

        // И «без изменений» никуда не двигает.
        start_and_end(&mut campaign, SceneOutcome::Unchanged, 1);
    }

    fn start_and_end(campaign: &mut CampaignState, outcome: SceneOutcome, expected: u8) {
        create_scene(campaign, "Зал".into(), "Цель".into(), vec![], vec![]).unwrap();
        end_scene(campaign, outcome).unwrap();
        assert_eq!(
            campaign.engine.as_ref().unwrap().scene().unwrap().tension,
            expected,
            "§7.2 с исходом {outcome:?}"
        );
    }

    /// Решение владельца 23.09.2026: движок в дневник кампании не пишет
    /// никак — ни сам, ни по кнопке. Проба сторожит именно это.
    #[test]
    fn the_engine_never_writes_a_line_into_the_campaign_journal() {
        let mut campaign = campaign();
        start(&mut campaign);
        end_scene(&mut campaign, SceneOutcome::Calmer).unwrap();

        assert!(campaign.journal.is_empty(), "дневник кампании движок не трогает");
        assert_eq!(
            campaign.engine.as_ref().unwrap().adventure_log().len(),
            2,
            "зато свой лог приключения у него полон"
        );
    }

    #[test]
    fn ending_a_scene_that_was_never_created_is_refused() {
        let mut campaign = campaign();
        assert!(end_scene(&mut campaign, SceneOutcome::Calmer).is_err());
    }

    #[test]
    fn a_scene_without_a_place_or_an_objective_is_refused() {
        let mut campaign = campaign();
        assert!(create_scene(&mut campaign, "   ".into(), "Цель".into(), vec![], vec![]).is_err());
        assert!(create_scene(&mut campaign, "Зал".into(), "  ".into(), vec![], vec![]).is_err());
        assert!(campaign.engine.as_ref().unwrap().scene().is_none());
    }

    /// §44 шаг 10: движок переживает сохранение и загрузку целиком — вместе с
    /// логом приключения и журналом транзакций, и при приватных полях.
    #[test]
    fn the_engine_survives_a_round_trip_through_the_save_file() {
        let mut campaign = campaign();
        start(&mut campaign);
        end_scene(&mut campaign, SceneOutcome::Worse).unwrap();

        let raw = serde_json::to_string(&campaign).unwrap();
        let read: CampaignState = serde_json::from_str(&raw).unwrap();

        assert_eq!(read.engine, campaign.engine);
        let engine = read.engine.unwrap();
        assert_eq!(engine.scene().unwrap().tension, 4);
        assert_eq!(engine.adventure_log().len(), 2);
        assert_eq!(engine.history().len(), 2);
        assert_eq!(engine.turn(), 2);
    }

    /// Сохранение, записанное до появления движка, обязано открыться: поля
    /// `engine` в нём нет вовсе.
    #[test]
    fn a_campaign_saved_before_the_engine_existed_reads_as_none() {
        let old = r#"{"id": "abc", "campaignName": "Старая", "characters": [], "journal": []}"#;
        let state: CampaignState = serde_json::from_str(old).expect("старое сохранение читается");
        assert!(state.engine.is_none());
        assert!(state.combat.is_none());
    }
}
