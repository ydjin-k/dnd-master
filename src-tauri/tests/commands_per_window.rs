//! Сторож прав по окнам: какая команда какому окну доступна.
//!
//! Проверять это нечем, кроме чтения файлов, и причина не в лени. Права
//! приложения живут в трёх местах разного языка — перечень команд в
//! `build.rs`, обработчик в `lib.rs`, выдача по окнам в `capabilities/*.json`
//! — и ломаются они расхождением, а не поведением: забытая в `default.json`
//! строка не ломает ни одну пробу фронта (там `invoke` замокан) и ни одну
//! пробу Rust (команды зовутся напрямую), а в живом окне мастера кнопка
//! молча получает «not allowed». Поэтому здесь сверяются именно списки.
//!
//! Главное правило пробы: перечень команд НЕ переписан сюда руками. Он
//! читается из `generate_handler!` в `lib.rs` — у факта «какие у приложения
//! команды» один владелец, и проба ему не второй. Скорми пробе свой список —
//! и она зазеленеет на приложении, которое забыло выдать окну мастера
//! половину прав.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// Корень пакета: пробы запускаются из него, но полагаться на текущий каталог
/// незачем — `cargo test` зовут и из корня репозитория.
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{} не читается: {e}", path.display()))
}

/// Кусок текста между двумя вехами. Веха не найдена — это поломка самой
/// пробы, и о ней надо падать громко, а не считать список пустым: пустой
/// список сошёлся бы с пустым и зазеленел на любом приложении.
fn between<'a>(text: &'a str, from: &str, to: &str) -> &'a str {
    let start = text
        .find(from)
        .unwrap_or_else(|| panic!("в тексте нет вехи {from:?} — проба смотрит не туда"));
    let rest = &text[start + from.len()..];
    let end = rest
        .find(to)
        .unwrap_or_else(|| panic!("после {from:?} нет вехи {to:?} — проба смотрит не туда"));
    &rest[..end]
}

/// Команды приложения — из `generate_handler!` в `lib.rs`. Это ЕДИНСТВЕННЫЙ
/// источник перечня для всей пробы.
fn commands_from_lib() -> Vec<String> {
    let src = read(&root().join("src").join("lib.rs"));
    let list = between(&src, "tauri::generate_handler![", "]");
    let commands: Vec<String> = list
        .split(',')
        .map(|item| {
            // В списке остаются переводы строк и могут попасться комментарии —
            // берётся первое слово записи.
            item.lines()
                .map(str::trim)
                .find(|line| !line.is_empty() && !line.starts_with("//"))
                .unwrap_or("")
                .to_string()
        })
        .filter(|name| !name.is_empty())
        .collect();
    assert!(
        commands.len() > 10,
        "из lib.rs прочитано {} команд — столько у приложения не бывает, проба читает не то",
        commands.len()
    );
    for name in &commands {
        assert!(
            name.chars().all(|c| c.is_ascii_lowercase() || c == '_' || c.is_ascii_digit()),
            "{name:?} на имя команды не похоже — проба читает не то"
        );
    }
    commands
}

/// Перечень из `build.rs` — тот, из которого Tauri делает права.
fn commands_from_build() -> Vec<String> {
    let src = read(&root().join("build.rs"));
    let list = between(&src, "const COMMANDS: &[&str] = &[", "];");
    list.split('"')
        .skip(1)
        .step_by(2)
        .map(str::to_string)
        .collect()
}

/// Право, которое Tauri заводит на команду: `allow-` плюс имя через дефисы.
fn allow_of(command: &str) -> String {
    format!("allow-{}", command.replace('_', "-"))
}

/// Права из файла капабилити. Разбор ручной, без `serde_json` в пробе: нужен
/// один массив строк, и зависимость ради него была бы прибором на ровном
/// месте.
fn permissions_of(file: &str) -> Vec<String> {
    let src = read(&root().join("capabilities").join(file));
    let list = between(&src, "\"permissions\"", "]");
    let perms: Vec<String> = list
        .split('"')
        .skip(1)
        .step_by(2)
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .collect();
    assert!(!perms.is_empty(), "{file}: прав не прочитано ни одного");
    perms
}

/// Права на СВОИ команды: у встроенных и плагинных в имени есть двоеточие
/// (`core:event:allow-listen`, `dialog:default`), у своих — нет.
fn own_commands(perms: &[String]) -> BTreeSet<String> {
    perms
        .iter()
        .filter(|p| !p.contains(':'))
        .cloned()
        .collect()
}

/// `build.rs` и `lib.rs` называют одни и те же команды.
///
/// Разойдясь, они дают две разные поломки, и обе тихие: команда, объявленная
/// в `build.rs` и снятая из обработчика, оставляет мёртвое право, а команда из
/// обработчика, забытая в `build.rs`, не получает права вовсе — и выданная
/// окну строка `allow-...` рушит сборку целиком.
#[test]
fn build_manifest_lists_exactly_the_handler_commands() {
    let handler: BTreeSet<String> = commands_from_lib().into_iter().collect();
    let manifest: BTreeSet<String> = commands_from_build().into_iter().collect();
    assert_eq!(
        handler, manifest,
        "перечень команд в build.rs разошёлся с generate_handler! в lib.rs"
    );
}

/// В `permissions/autogenerated` лежат права ровно на те команды, что есть.
///
/// Файлы эти пишет сама сборка и НЕ убирает за собой: переименованная команда
/// оставляет там прежний `allow-...`, и он продолжает существовать как право.
/// Поймано своей рукой при проверке краснения — `roll_dice` переименовали в
/// `build.rs`, а `allow-roll-dice` остался выданным окну мастера, и сборка
/// прошла. Такой файл — заряженное право на команду, которой нет: пока она не
/// вернётся под тем же именем, он безвреден, а вернётся — выдан будет молча.
#[test]
fn autogenerated_permissions_match_the_command_list() {
    let dir = root().join("permissions").join("autogenerated");
    let files: BTreeSet<String> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("{} не читается: {e}", dir.display()))
        .map(|entry| entry.expect("запись каталога").file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".toml"))
        .collect();
    let expected: BTreeSet<String> = commands_from_lib()
        .iter()
        .map(|c| format!("{c}.toml"))
        .collect();
    assert_eq!(
        files, expected,
        "в permissions/autogenerated лежит не то, что в generate_handler!: лишние файлы удалить руками, сборка их не убирает"
    );
}

/// Окно мастера не потеряло НИЧЕГО: каждая команда обработчика ему выдана.
///
/// Это главный риск правки: до неё права на свои команды не существовало, и
/// окно мастера звало всё. Пробы фронта потери не увидят — там `invoke`
/// замокан, — а в живом окне отказ приезжает строкой состояния.
#[test]
fn the_master_window_keeps_every_command() {
    let perms = permissions_of("default.json");
    let granted = own_commands(&perms);
    let missing: Vec<String> = commands_from_lib()
        .iter()
        .map(|c| allow_of(c))
        .filter(|p| !granted.contains(p))
        .collect();
    assert!(
        missing.is_empty(),
        "окну мастера не выдано: {missing:?} — в живом окне это «not allowed» на кнопке"
    );
}

/// Окну мастера не выдано лишнего: права без своей команды в обработчике.
/// Такая строка либо опечатка, либо след снесённой команды, и сборка на ней
/// падает — но падает она у того, кто соберёт следующим, а проба называет её
/// здесь.
#[test]
fn the_master_window_has_no_stray_grants() {
    let known: BTreeSet<String> = commands_from_lib().iter().map(|c| allow_of(c)).collect();
    let stray: Vec<String> = own_commands(&permissions_of("default.json"))
        .into_iter()
        .filter(|p| !known.contains(p))
        .collect();
    assert!(stray.is_empty(), "в default.json права без команды: {stray:?}");
}

/// Окно игроков умеет ровно одно: спросить, что показывать.
///
/// Сверка идёт со ВСЕМ перечнем команд, а не со списком «команд записи»:
/// решать, какая команда пишет, значило бы завести здесь второе мнение о
/// каждой из них, и новая команда записи попала бы в окно игроков молча.
/// Поэтому правило жёстче просьбы карточки: у окна игроков нет ни одной своей
/// команды, кроме `players_map_get`, — ни записи, ни чтения справочников.
#[test]
fn the_players_window_can_only_ask_what_to_show() {
    let allowed = allow_of("players_map_get");
    let granted = own_commands(&permissions_of("players.json"));
    assert_eq!(
        granted,
        BTreeSet::from([allowed.clone()]),
        "у окна игроков своя команда должна быть ровно одна — {allowed}"
    );
    // И эта одна — настоящая команда приложения, а не строка с опечаткой:
    // опечатку сборка заметит, но отказ окну игроков она обеспечит молча.
    assert!(
        commands_from_lib().contains(&"players_map_get".to_string()),
        "players_map_get из обработчика пропала, а право на неё выдано"
    );
}

/// Ни одной команды записи у окна игроков нет — буквально то, о чём просит
/// карточка, и проверяется это перечнем из `lib.rs`, а не глазами.
///
/// «Запись» здесь — всё, что меняет кампанию, файл или окна: эти команды
/// названы по их действию в обработчике, и список собирается из прочитанных
/// имён, а не из своего.
#[test]
fn the_players_window_cannot_write_anything() {
    let granted = own_commands(&permissions_of("players.json"));
    let writers: Vec<String> = commands_from_lib()
        .into_iter()
        .filter(|c| {
            c.starts_with("save_")
                || c.starts_with("create_")
                || c.starts_with("delete_")
                || c.starts_with("switch_")
                || c.starts_with("apply_")
                || c.starts_with("combat_")
                || c.starts_with("end_")
                || c == "players_map_set"
                || c == "players_window_open"
        })
        .collect();
    assert!(
        writers.len() >= 10,
        "команд записи распознано {} — проба читает не то",
        writers.len()
    );
    for command in writers {
        let perm = allow_of(&command);
        assert!(
            !granted.contains(&perm),
            "окну игроков выдана команда записи {command}"
        );
    }
}
