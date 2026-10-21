//! Окно «для игроков»: его мастер выводит на второй монитор или телевизор у
//! стола. Здесь живёт ВСЁ, что о нём знает Rust: как оно открывается и как до
//! него доезжает схема.
//!
//! Схема идёт через Rust, а не из окна в окно напрямую, по одной причине: окно
//! игроков открывается и закрывается когда угодно, и у фронта нет места,
//! которое переживёт его закрытие. Последняя отданная схема лежит здесь
//! (`PlayersMap`), поэтому открывшееся окно СРАЗУ спрашивает, что показывать
//! (`players_map_get`), а дальше получает каждую правку событием. Иначе окно,
//! открытое после смены статуса, стояло бы пустым до следующего щелчка
//! мастера, а свою копию схемы пришлось бы держать и ему.
//!
//! Запись и рассылка — одним вызовом (`publish`), а не двумя командами: разведи
//! их, и позвавший однажды забыл бы вторую, после чего окно показывало бы одно,
//! а ящик помнил другое.
//!
//! Что именно в схеме видно, Rust не решает и не читает: правило живёт в
//! `src/ui/dungeons/mapAudience.ts`, и фронт присылает УЖЕ отредактированную
//! копию. Поэтому здесь `Value` — ящик, а не разбор записи: второй владелец
//! правила «что видно игрокам» на стороне Rust был бы ровно тем же дублем,
//! от которого карточка просит воздержаться.

use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Ярлык окна. Та же строка, что `PLAYERS_WINDOW_LABEL` в `playersMap.ts`.
pub const WINDOW_LABEL: &str = "players";

/// Имя события, которым схема доезжает до окна. Одна строка на весь проект:
/// фронт берёт её из `playersMap.ts`, и разойтись им нечем — опечатка в одной
/// из двух копий молча оставила бы окно без обновлений.
pub const MAP_EVENT: &str = "players-map";

/// Последняя схема, отданная игрокам, или `None` — схема закрыта, и окно
/// показывает заставку.
pub struct PlayersMap(Mutex<Option<Value>>);

impl PlayersMap {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Открыть окно игроков или вывести на передний план уже открытое.
///
/// Окно создаётся здесь, а не из фронта: правом «создавать окна» пришлось бы
/// наделить весь фронт главного окна, а нужно ровно одно окно с одним
/// содержимым. Прав самому окну выдаётся столько же мало — см.
/// `capabilities/players.json`.
///
/// Зовётся ТОЛЬКО из асинхронной команды (`players_window_open` в `lib.rs`):
/// с главного потока `build()` ждёт цикл событий, который на том же потоке и
/// крутится. Причина и то, как это выглядит снаружи, — там же.
pub fn open(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        // Уже открыто: второго такого окна не бывает, его просто видно.
        window.unminimize().ok();
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("D&D Master — для игроков")
        .inner_size(1100.0, 760.0)
        .resizable(true)
        .maximizable(true)
        .build()
        .map_err(|e| format!("Окно для игроков не открылось: {e}"))?;
    Ok(())
}

/// Положить схему в ящик. `None` — схема закрыта.
fn store(state: &PlayersMap, view: Option<Value>) -> Result<Option<Value>, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    *slot = view;
    Ok(slot.clone())
}

/// Что показывать сейчас. Этим окно игроков начинает работу.
pub fn get(state: &PlayersMap) -> Result<Option<Value>, String> {
    state.0.lock().map_err(|e| e.to_string()).map(|s| s.clone())
}

/// Отдать схему игрокам: положить в ящик и разослать окну. Окна нет — и
/// рассылать некому: это не ошибка, мастер мог его ещё не открыть или уже
/// закрыть, а в ящике схема дождётся следующего.
pub fn publish(app: &AppHandle, state: &PlayersMap, view: Option<Value>) -> Result<(), String> {
    let kept = store(state, view)?;
    app.emit_to(WINDOW_LABEL, MAP_EVENT, kept)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Ящик помнит последнюю схему — на этом держится окно, открытое ПОСЛЕ
    /// того, как мастер сменил статус: оно спрашивает `get` и получает то же,
    /// что ушло событием.
    #[test]
    fn the_box_keeps_the_last_map_for_a_window_opened_later() {
        let box_ = PlayersMap::new();
        assert_eq!(get(&box_).unwrap(), None, "до первой схемы в ящике ничего");

        let first = json!({ "title": "Склеп", "dungeon": { "id": "d1" } });
        assert_eq!(store(&box_, Some(first.clone())).unwrap(), Some(first.clone()));
        assert_eq!(get(&box_).unwrap(), Some(first), "ящик отдаёт то, что положили");

        let second = json!({ "title": "Склеп · Этаж 2", "dungeon": { "id": "d1" } });
        store(&box_, Some(second.clone())).unwrap();
        assert_eq!(get(&box_).unwrap(), Some(second), "новая схема вытеснила прежнюю");
    }

    /// Мастер закрыл схему — в ящике ПУСТО, а не прежняя схема: окно игроков
    /// обязано показать заставку, и показать ему больше нечего.
    #[test]
    fn closing_the_map_empties_the_box() {
        let box_ = PlayersMap::new();
        store(&box_, Some(json!({ "title": "Склеп" }))).unwrap();

        assert_eq!(store(&box_, None).unwrap(), None);
        assert_eq!(get(&box_).unwrap(), None, "последняя схема в ящике не задерживается");
    }
}
