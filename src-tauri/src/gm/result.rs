//! `ResultObject` (§33) — одна форма ответа на все команды движка.
//!
//! Отдельно от состояния: это рассказ об ОДНОМ вызове. В `EngineState` из него
//! не попадает ничего, кроме строки лога, которую решение положило туда само.

use serde::Serialize;

use crate::model::CampaignState;

use super::mutate::Mutation;

/// Один бросок в объяснении ответа (§33). Заполняет его тот, кто бросал:
/// у сцены список пуст, у Оракула — один бросок `1d100`, а у ответа из факта
/// он пуст СНОВА, и это утверждение, а не пропуск (§6.3).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RollTrace {
    pub die: String,
    pub value: i32,
    pub modifier: i32,
    pub total: i32,
    pub target: Option<i32>,
}

/// Ответ модуля движка.
///
/// `trace` (§38) НЕ хранится в состоянии — он живёт один ответ. Заполняет его
/// тот, кто принимает решение, и никто другой: экран не восстанавливает
/// причину по исходу. На пилоте экран догадывался о причине отказа маршруту и
/// 29 мирных объектов из 51 называл «сюда пути нет» — то есть врал игроку.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultObject {
    pub success: bool,
    pub result_type: String,
    /// Ключ строки для игрока; текст по ключу подставляет интерфейс.
    pub summary_key: String,
    pub rolls: Vec<RollTrace>,
    /// Типизированные изменения состояния вместо строковых путей §33.
    pub state_changes: Vec<Mutation>,
    pub generated_events: Vec<String>,
    pub choices: Vec<String>,
    pub trace: Vec<String>,
}

impl ResultObject {
    pub fn success(result_type: &str, summary_key: &str) -> Self {
        ResultObject {
            success: true,
            result_type: result_type.to_string(),
            summary_key: summary_key.to_string(),
            rolls: Vec::new(),
            state_changes: Vec::new(),
            generated_events: Vec::new(),
            choices: Vec::new(),
            trace: Vec::new(),
        }
    }

    pub fn with_changes(mut self, changes: Vec<Mutation>) -> Self {
        self.state_changes = changes;
        self
    }

    /// Броски, которыми объясняется ответ. Пустой список — не «забыли
    /// заполнить», а утверждение: бросков не было (§6.3).
    pub fn with_rolls(mut self, rolls: Vec<RollTrace>) -> Self {
        self.rolls = rolls;
        self
    }

    pub fn with_trace(mut self, trace: Vec<String>) -> Self {
        self.trace = trace;
        self
    }
}

/// Что уезжает на фронт: состояние для показа и ответ для объяснения.
///
/// Состояние возвращается целиком и уже сохранённым — фронт кладёт его
/// существующим `commit` и ничего не вычисляет. Своего снимка у него нет и не
/// появляется: команда получает НАМЕРЕНИЕ, а не состояние.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GmResponse {
    pub state: CampaignState,
    pub result: ResultObject,
}
