//! `EngineState` — состояние движка мастера (§3.3, §4.1).
//!
//! **Все поля приватны, и это не стиль.** Приватность делает правило «писать
//! только через `mutate::apply`» проверяемым компилятором: снаружи этого файла
//! у полей нет имени, а все пишущие методы требуют `&WritePermit`, который
//! умеет создать только `mutate.rs`. `pub`-поле «для удобства» открыло бы
//! класс дефектов записи 136 заново (ADR раздел 8).

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use super::mutate::{Transaction, WritePermit};
use super::rng::{self, RngCursor};
use super::scene::{SceneOutcome, SceneState};

/// `u64` уезжает на фронт и на диск СТРОКОЙ, а не числом.
///
/// Причина не в красоте: число в JSON читается в JavaScript как `f64`, и всё
/// за 2^53 теряет младшие разряды. Состояние ГСЧ — полный `u64`, поэтому
/// отладочный экран показывал бы округлённое состояние, то есть врал бы ровно
/// в том месте, ради которого он существует («тот же сид — тот же результат»).
/// Строка доезжает разряд в разряд.
pub(super) mod u64_text {
    use super::*;

    pub fn serialize<S: Serializer>(value: &u64, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u64, D::Error> {
        let text = String::deserialize(deserializer)?;
        text.parse().map_err(serde::de::Error::custom)
    }
}

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
/// Чего здесь намеренно НЕТ в v0.1: `actors`, `locations`, `threats`
/// (следующие карточки), `plot_threads` (§41 их в v0.1 не включает),
/// `schema_version` и `system_id` (сняты владельцем 23.09.2026).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    /// Сид кампании (§22). Ставится один раз в `Default` ниже и НЕ меняется
    /// ничем: сеттера у него нет вовсе, и это проверяет компилятор.
    #[serde(with = "u64_text")]
    seed: u64,
    /// Состояние потока ГСЧ (§22). Меняет только `rng::advance` через
    /// `Mutation::RngAdvanced` — сохранение его лишь перевозит.
    #[serde(with = "u64_text")]
    rng_state: u64,
    /// Сколько обращений к ГСЧ уже сделано. Без этого числа «сид 481922,
    /// обращение №14» на отладочном экране написать нечем.
    #[serde(with = "u64_text")]
    rng_draws: u64,
}

/// **Единственный момент рождения движка — и значит сида.**
///
/// `engine_mut` (`gm/mod.rs`) заводит состояние первой же командой движка, и
/// другого места, где `EngineState` появляется, в проекте нет. Поэтому сид
/// рождается ровно здесь: второй точки рождения не существует, и разойтись им
/// негде. Случайность в `Default` выглядит необычно и написана намеренно —
/// именно она делает «сид ставится один раз» свойством типа, а не обещанием
/// вызывающего.
impl Default for EngineState {
    fn default() -> Self {
        let seed = rng::new_campaign_seed();
        EngineState {
            scene: None,
            adventure_log: Vec::new(),
            history: Vec::new(),
            turn: 0,
            seed,
            rng_state: seed,
            rng_draws: 0,
        }
    }
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

    /// Сид кампании. Только чтение — и парного сеттера здесь нет НИ ОДНОГО,
    /// даже с разрешением: «не меняется никем» из §22 держит не комментарий, а
    /// отсутствие пути записи.
    pub fn seed(&self) -> u64 {
        self.seed
    }

    /// Курсор потока ГСЧ значением: решающий модуль бросает по копии и отдаёт
    /// продвижение мутацией, а не правит состояние на ходу.
    pub fn rng_cursor(&self) -> RngCursor {
        RngCursor {
            state: self.rng_state,
            draws: self.rng_draws,
        }
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

    /// Продвинуть поток ГСЧ. Сид этим не трогается — у него и поле другое:
    /// `seed` остаётся тем, чем был при рождении кампании.
    pub fn advance_rng(&mut self, _permit: &WritePermit, cursor: RngCursor) {
        self.rng_state = cursor.state;
        self.rng_draws = cursor.draws;
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
        for field in [
            "scene",
            "adventureLog",
            "history",
            "turn",
            "seed",
            "rngState",
            "rngDraws",
        ] {
            assert!(json.get(field).is_some(), "фронт читает {field}");
        }
    }

    /// Сид и состояние ГСЧ уезжают строкой — иначе JavaScript округлил бы их
    /// до `f64`, и отладочный экран показал бы не то число, с которым бросал
    /// движок. Проба берёт значение за 2^53 и сверяет разряды.
    ///
    /// Отрицательная проба: убрать `#[serde(with = "u64_text")]` у `rng_state`
    /// — краснеет строка «состояние ГСЧ доезжает разряд в разряд»: в JSON
    /// оказывается число, а не строка.
    #[test]
    fn the_seed_and_the_rng_state_travel_as_text_not_as_a_javascript_number() {
        let huge = u64::MAX - 1; // 18446744073709551614, далеко за 2^53
        let mut engine = EngineState::default();
        crate::gm::mutate::apply(
            &mut engine,
            "roll",
            vec![crate::gm::mutate::Mutation::RngAdvanced(
                crate::gm::rng::RngCursor { state: huge, draws: 1 },
            )],
        )
        .expect("продвижение потока — обычная мутация");

        let json = serde_json::to_value(&engine).unwrap();
        assert_eq!(
            json["rngState"], "18446744073709551614",
            "состояние ГСЧ доезжает разряд в разряд"
        );
        assert!(json["seed"].is_string(), "и сид тоже строкой");

        let back: EngineState = serde_json::from_value(json).unwrap();
        assert_eq!(back.rng_cursor().state, huge, "и читается обратно тем же числом");
        assert_eq!(back.seed(), engine.seed());
    }
}
