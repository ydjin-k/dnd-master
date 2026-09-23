//! Ядро GM Engine (ADR 0001 `docs/decisions/0001-gm-engine-core-in-rust.md`).
//!
//! Состояние движка — ПОЛЕ документа кампании (`CampaignState.engine`), а не
//! второй файл: два документа разъезжаются при первой же правке. Сохранение и
//! загрузка достаются даром от `storage.rs`, второго пути записи нет.
//!
//! Правило, ради которого ядро вообще написано на Rust: поля `EngineState`
//! приватны, и единственный путь записи — `mutate::apply`. Это проверяет
//! компилятор, а не ревью (ADR раздел 8, пункт 3).

pub mod facts;
pub mod history;
pub mod mutate;
pub mod oracle;
pub mod result;
pub mod rng;
pub mod scene;
pub mod state;

use crate::model::CampaignState;
use state::EngineState;

/// Движок кампании, в которой его ещё не было: `engine` в старых сохранениях
/// читается как `None`, и первая же команда заводит пустое состояние. Отдельной
/// «инициализации кампании» для этого не нужно — иначе появился бы второй
/// момент рождения движка, и они разошлись бы.
pub fn engine_mut(campaign: &mut CampaignState) -> &mut EngineState {
    campaign.engine.get_or_insert_with(EngineState::default)
}
