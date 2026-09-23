//! Единственный путь записи в `EngineState` (§34, §37).
//!
//! Модули движка не мутируют состояние — они возвращают `Mutation`. Очередь
//! проверяется валидатором и применяется целиком либо никак, и только потом
//! ложится в журнал транзакций.

use serde::{Deserialize, Serialize};

use super::history;
use super::scene::{SceneOutcome, SceneState, SceneStatus, TENSION_MAX, TENSION_MIN};
use super::state::{EngineState, LogEntry};

/// Право записи в `EngineState`.
///
/// Единственный конструктор — приватная `WritePermit::new` ниже, поэтому
/// получить экземпляр можно только внутри этого файла, а зовётся она ровно в
/// одном месте: в `apply`. Пишущие методы `EngineState` требуют ссылку на
/// разрешение, значит запись мимо `apply` не компилируется — её нечем
/// позвать. Это та самая машинная проверка, ради которой ADR выбрал Rust:
/// в TS то же правило держалось бы на ревью.
pub struct WritePermit(());

impl WritePermit {
    fn new() -> Self {
        WritePermit(())
    }
}

/// Изменение состояния — ТИПИЗИРОВАННОЕ, а не строковый путь вида
/// `"actors.pc.states"` из §33: строку нельзя проверить компилятором, и она
/// тянет за собой парсер путей (ADR раздел 9, пункт 6).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Mutation {
    /// Новая сцена. Прежняя (завершённая) заменяется целиком: истории сцен в
    /// v0.1 нет, её место — лог приключения и журнал транзакций.
    SceneCreated(SceneState),
    /// Завершение сцены: статус и напряжение по §7.2.
    SceneEnded { outcome: SceneOutcome, tension: u8 },
    /// Строка лога приключения. Едет той же очередью, что и решение, — иначе
    /// лог разойдётся с состоянием, которое описывает (§29.2).
    Logged(LogEntry),
}

/// Транзакция (§35): что за действие, на каком ходу и чем оно изменило
/// состояние. Откат в этой карточке не делается, но транзакции пишутся с
/// первого дня — иначе откатывать будет нечего.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    id: u64,
    turn: u32,
    action: String,
    mutations: Vec<Mutation>,
}

impl Transaction {
    pub(super) fn new(id: u64, turn: u32, action: &str, mutations: Vec<Mutation>) -> Self {
        Transaction {
            id,
            turn,
            action: action.to_string(),
            mutations,
        }
    }

    pub fn id(&self) -> u64 {
        self.id
    }

    pub fn turn(&self) -> u32 {
        self.turn
    }

    /// `allow(dead_code)`: как и весь `Transaction`, уезжает на фронт
    /// сериализацией; из Rust его читают пока только пробы.
    #[allow(dead_code)]
    pub fn action(&self) -> &str {
        &self.action
    }

    pub fn mutations(&self) -> &[Mutation] {
        &self.mutations
    }
}

/// Проверка перед применением (§37): существует ли то, что меняем, и допустим
/// ли переход. Валидатор — сторож инварианта, а не владелец правила: правило
/// §7.2 считает `scene.rs`, здесь только проверяется, что итог в границах.
pub fn validate(state: &EngineState, mutation: &Mutation) -> Result<(), String> {
    match mutation {
        Mutation::SceneCreated(scene) => {
            if matches!(state.scene().map(|s| s.status), Some(SceneStatus::Active)) {
                return Err("сцена уже идёт — заверши её, прежде чем начинать новую".into());
            }
            if scene.location.trim().is_empty() {
                return Err("у сцены должно быть место (§10.1)".into());
            }
            if scene.objective.trim().is_empty() {
                return Err("у сцены должна быть цель (§10.1)".into());
            }
            check_tension(scene.tension)
        }
        Mutation::SceneEnded { tension, .. } => {
            let Some(scene) = state.scene() else {
                return Err("сцены нет — завершать нечего".into());
            };
            if scene.status == SceneStatus::Resolved {
                return Err("сцена уже завершена".into());
            }
            check_tension(*tension)
        }
        // Строка лога описывает уже принятое решение и своих предусловий не
        // имеет: её содержимое — типизированный `LogLine`, а не свободный
        // текст, проверять в нём нечего.
        Mutation::Logged(_) => Ok(()),
    }
}

fn check_tension(tension: u8) -> Result<(), String> {
    if !(TENSION_MIN..=TENSION_MAX).contains(&tension) {
        return Err(format!(
            "напряжение {tension} вне границ {TENSION_MIN}..{TENSION_MAX} (§7)"
        ));
    }
    Ok(())
}

/// Применить очередь мутаций одной транзакцией.
///
/// **Целиком либо никак.** Очередь применяется к копии состояния, и настоящее
/// состояние заменяется только после того, как прошла последняя мутация: иначе
/// отклонённая третья мутация оставила бы половину записанного действия.
/// Копия нужна ещё и потому, что проверять все мутации заранее нельзя —
/// вторая может зависеть от того, что сделала первая.
pub fn apply(
    state: &mut EngineState,
    action: &str,
    mutations: Vec<Mutation>,
) -> Result<Transaction, String> {
    let permit = WritePermit::new();
    let mut draft = state.clone();

    for mutation in &mutations {
        validate(&draft, mutation)?;
        match mutation {
            Mutation::SceneCreated(scene) => draft.set_scene(&permit, Some(scene.clone())),
            Mutation::SceneEnded { outcome: _, tension } => {
                let scene = draft
                    .scene_mut(&permit)
                    .expect("валидатор уже проверил, что сцена есть");
                scene.status = SceneStatus::Resolved;
                scene.tension = *tension;
            }
            Mutation::Logged(entry) => draft.push_log(&permit, entry.clone()),
        }
    }

    let transaction = Transaction::new(
        history::next_id(&draft),
        draft.turn() + 1,
        action,
        mutations,
    );
    history::append(&mut draft, &permit, transaction.clone());

    *state = draft;
    Ok(transaction)
}

/// Пробы очереди мутаций.
///
/// Чего здесь нет и быть не может: пробы «записать в `EngineState` мимо
/// `apply`». Такая проба не компилируется — у полей нет имени за пределами
/// `state.rs`, а каждый пишущий метод требует `&WritePermit`, конструктор
/// которого приватен для `mutate.rs`. Проверяет это компилятор, и потому
/// строчки на это не тратятся.
#[cfg(test)]
mod tests {
    use super::*;
    use crate::gm::scene::{SceneState, SceneStatus};
    use crate::gm::state::{LogEntry, LogLine};

    fn scene(location: &str, tension: u8) -> SceneState {
        SceneState {
            id: "scene-1".into(),
            status: SceneStatus::Active,
            location: location.into(),
            objective: "Найти выход".into(),
            tension,
            participants: Vec::new(),
            active_threats: Vec::new(),
            scene_tags: Vec::new(),
            started_at_turn: 1,
            resolved_conditions: Vec::new(),
        }
    }

    fn log_line() -> LogEntry {
        LogEntry {
            id: "log-1".into(),
            turn: 1,
            line: LogLine::SceneStarted {
                location: "Зал".into(),
                objective: "Найти выход".into(),
                tension: 3,
            },
        }
    }

    /// Очередь применяется целиком либо никак (§34): отклонённая мутация не
    /// должна оставить за собой половину уже записанного действия.
    ///
    /// Отрицательная проба: применять мутации прямо к `state` вместо копии
    /// (убрать `draft` из `apply`) — краснеют обе строки про «ничего не
    /// записалось»: сцена и строка лога остаются в состоянии, у которого
    /// транзакции нет.
    #[test]
    fn a_queue_with_one_rejected_mutation_leaves_the_engine_exactly_as_it_was() {
        let mut engine = EngineState::default();

        let refused = apply(
            &mut engine,
            "create_scene",
            vec![
                Mutation::SceneCreated(scene("Зал", 3)),
                Mutation::Logged(log_line()),
                // Вторая сцена при активной первой — отказ валидатора.
                Mutation::SceneCreated(scene("Коридор", 3)),
            ],
        );

        assert!(refused.is_err(), "очередь с недопустимой мутацией обязана быть отклонена");
        assert!(engine.scene().is_none(), "ничего не записалось: сцены нет");
        assert!(engine.adventure_log().is_empty(), "ничего не записалось: лог пуст");
        assert!(engine.history().is_empty(), "отклонённое действие — не транзакция");
        assert_eq!(engine.turn(), 0);
    }

    /// Напряжение вне шкалы §7 не проходит валидатор, кто бы его ни прислал.
    #[test]
    fn tension_outside_the_scale_is_refused_by_the_validator() {
        let mut engine = EngineState::default();
        assert!(apply(
            &mut engine,
            "create_scene",
            vec![Mutation::SceneCreated(scene("Зал", 6))]
        )
        .is_err());
        assert!(apply(
            &mut engine,
            "create_scene",
            vec![Mutation::SceneCreated(scene("Зал", 0))]
        )
        .is_err());
    }

    /// Транзакции нумеруются подряд, и ход растёт ровно на одну единицу за
    /// применённую очередь — сколько бы мутаций в ней ни было.
    #[test]
    fn every_applied_queue_is_one_transaction_and_one_turn() {
        let mut engine = EngineState::default();

        let first = apply(
            &mut engine,
            "create_scene",
            vec![
                Mutation::SceneCreated(scene("Зал", 3)),
                Mutation::Logged(log_line()),
            ],
        )
        .unwrap();
        assert_eq!((first.id(), first.turn(), first.action()), (1, 1, "create_scene"));
        assert_eq!(first.mutations().len(), 2);

        let second = apply(
            &mut engine,
            "end_scene",
            vec![Mutation::SceneEnded {
                outcome: SceneOutcome::Worse,
                tension: 4,
            }],
        )
        .unwrap();
        assert_eq!((second.id(), second.turn(), second.action()), (2, 2, "end_scene"));
        assert_eq!(engine.turn(), 2);
        assert_eq!(engine.history().len(), 2);
    }
}
