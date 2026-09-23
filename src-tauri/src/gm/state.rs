//! `EngineState` — состояние движка мастера (§3.3, §4.1).
//!
//! **Все поля приватны, и это не стиль.** Приватность делает правило «писать
//! только через `mutate::apply`» проверяемым компилятором: снаружи этого файла
//! у полей нет имени, а все пишущие методы требуют `&WritePermit`, который
//! умеет создать только `mutate.rs`. `pub`-поле «для удобства» открыло бы
//! класс дефектов записи 136 заново (ADR раздел 8).

use serde::{Deserialize, Serialize};

use super::mutate::{Transaction, WritePermit};
use super::scene::{SceneOutcome, SceneState};

/// Строка лога приключения (§29.2, правка владельца 23.09.2026).
///
/// **Ключ и числа, а не готовая фраза.** Владелец строки — интерфейс
/// (`src/ui/gm/adventureLog.ts`), ровно как у текста события в ADR: движок
/// владеет тем, ЧТО произошло, интерфейс — тем, как это звучит по-русски.
/// Иначе перевод одной и той же фразы жил бы в двух местах.
///
/// `rename_all` у перечисления переименовывает ВАРИАНТЫ, а не поля внутри них:
/// без `rename_all_fields` `tension_before` уехал бы на фронт змеиной змейкой,
/// и экран показал бы «Напряжение undefined → undefined». Поймано живым окном;
/// сторожит теперь `log_line_field_names_match_the_frontend_type`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum LogLine {
    SceneStarted {
        location: String,
        objective: String,
        tension: u8,
    },
    SceneEnded {
        location: String,
        objective: String,
        outcome: SceneOutcome,
        tension_before: u8,
        tension_after: u8,
    },
}

/// Запись лога приключения: строка плюс ход, на котором она родилась.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub turn: u32,
    pub line: LogLine,
}

/// Состояние движка. Лежит полем документа кампании.
///
/// Чего здесь намеренно НЕТ в v0.1: `seed`/`rng_state` (своя карточка пачки),
/// `actors`, `facts`, `locations`, `threats` (следующие карточки),
/// `plot_threads` (§41 их в v0.1 не включает), `schema_version` и `system_id`
/// (сняты владельцем 23.09.2026).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EngineState {
    scene: Option<SceneState>,
    /// Лог приключения — игроку. Дневник кампании (`CampaignState.journal`)
    /// движок не трогает вовсе: решение владельца 23.09.2026.
    adventure_log: Vec<LogEntry>,
    /// Журнал транзакций — движку, ради отката (§34–§35). Наружу не выходит.
    history: Vec<Transaction>,
    /// Ход растёт на единицу за транзакцию действия.
    turn: u32,
}

impl EngineState {
    // ── чтение: кому угодно ─────────────────────────────────────────────────

    pub fn scene(&self) -> Option<&SceneState> {
        self.scene.as_ref()
    }

    /// `allow(dead_code)`: из Rust лог никто не читает — он уезжает на фронт
    /// сериализацией, и компилятор этого пути не видит. Снимать метод нельзя:
    /// без неё лог приключения нечем проверить пробой.
    #[allow(dead_code)]
    pub fn adventure_log(&self) -> &[LogEntry] {
        &self.adventure_log
    }

    pub fn history(&self) -> &[Transaction] {
        &self.history
    }

    pub fn turn(&self) -> u32 {
        self.turn
    }

    // ── запись: только с разрешением, а выдать его умеет один `mutate.rs` ───
    //
    // `&WritePermit` в каждой сигнатуре — это и есть машинная проверка. Чтобы
    // написать сюда в обход `mutate::apply`, нужно сперва получить разрешение,
    // а его конструктор приватен для `mutate.rs` и зовётся в одном месте.

    pub fn set_scene(&mut self, _permit: &WritePermit, scene: Option<SceneState>) {
        self.scene = scene;
    }

    pub fn scene_mut(&mut self, _permit: &WritePermit) -> Option<&mut SceneState> {
        self.scene.as_mut()
    }

    pub fn push_log(&mut self, _permit: &WritePermit, entry: LogEntry) {
        self.adventure_log.push(entry);
    }

    /// Транзакция ложится в журнал, и тем же движением растёт ход: одно
    /// действие — одна транзакция — один ход, и развязаться им негде.
    pub fn push_transaction(&mut self, _permit: &WritePermit, transaction: Transaction) {
        self.history.push(transaction);
        self.turn += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gm::scene::SceneOutcome;

    /// Зеркало `LogLine` в `src/state/types.ts` читает поля ПО ИМЕНИ, и имена
    /// эти — camelCase. `rename_all` у перечисления переименовывает только
    /// варианты, поэтому без `rename_all_fields` `tension_before` уезжал на
    /// фронт как есть, и экран сцены показывал «Напряжение undefined →
    /// undefined». Это поймано живым окном, а сторожит теперь эта проба.
    ///
    /// Отрицательная проба: убрать `rename_all_fields = "camelCase"` у
    /// `LogLine` — краснеет строка `tensionBefore`.
    #[test]
    fn log_line_field_names_match_the_frontend_type() {
        let line = LogLine::SceneEnded {
            location: "Подземный зал".into(),
            objective: "Найти выход".into(),
            outcome: SceneOutcome::Worse,
            tension_before: 3,
            tension_after: 4,
        };
        let json: serde_json::Value = serde_json::to_value(&line).unwrap();

        assert_eq!(json["kind"], "sceneEnded");
        assert_eq!(json["tensionBefore"], 3, "фронт читает tensionBefore");
        assert_eq!(json["tensionAfter"], 4, "фронт читает tensionAfter");
        assert_eq!(json["outcome"], "worse");
        assert!(json.get("tension_before").is_none(), "змеиного имени быть не должно");
    }

    /// То же для самого состояния: экран сцены читает `adventureLog`, а не
    /// `adventure_log`.
    #[test]
    fn engine_state_field_names_match_the_frontend_type() {
        let json = serde_json::to_value(EngineState::default()).unwrap();
        for field in ["scene", "adventureLog", "history", "turn"] {
            assert!(json.get(field).is_some(), "фронт читает {field}");
        }
    }
}
