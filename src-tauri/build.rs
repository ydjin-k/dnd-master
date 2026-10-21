//! Сборка приложения. Здесь объявляется перечень СВОИХ команд — тот, из
//! которого Tauri делает права `allow-<команда>`/`deny-<команда>`.
//!
//! Без этого перечня (`tauri_build::build()`, как было до 21.10.2026) у своих
//! команд прав не существует вовсе, и проверять у окна нечего: любое окно
//! приложения зовёт любую команду из `invoke_handler`. Окну игроков, которое
//! мастер выводит на телевизор у стола, это давало `delete_campaign` и
//! `save_png_file` — не потому, что их кто-то выдал, а потому, что запирать
//! было нечем.
//!
//! Перечень обязан совпадать с `generate_handler!` в `lib.rs`, и совпадение
//! это не на честном слове: `tests/commands_per_window.rs` читает оба списка
//! из файлов и краснеет на любом расхождении. Переписать имя команды в пробу
//! было бы третьей копией одного факта.
//!
//! Почему здесь литерал, а не чтение `lib.rs`: `AppManifest::commands` берёт
//! `&'static [&'static str]`, то есть список должен существовать во время
//! компиляции самого `build.rs`. Собрать его чтением файла можно только
//! утечкой в статическую память, и цена — непрозрачная сборка вместо пробы в
//! двадцать строк.

use tauri_build::{AppManifest, Attributes};

/// Команды приложения. Порядок — как в `generate_handler!`, чтобы два списка
/// читались рядом.
const COMMANDS: &[&str] = &[
    "load_active_campaign",
    "list_campaigns",
    "create_campaign",
    "switch_campaign",
    "delete_campaign",
    "save_campaign",
    "roll_dice",
    "roll_ability_scores",
    "get_bestiary",
    "get_bestiary_image",
    "get_rules",
    "get_spells",
    "get_character_presets",
    "combat_add",
    "combat_roll_initiative",
    "combat_next_turn",
    "combat_set_player_rules",
    "combat_set_death_saves",
    "apply_damage",
    "combat_remove",
    "combat_transfer_hp_to_sheets",
    "end_combat",
    "save_png_file",
    "players_window_open",
    "players_map_set",
    "players_map_get",
];

fn main() {
    tauri_build::try_build(
        Attributes::new().app_manifest(AppManifest::new().commands(COMMANDS)),
    )
    .expect("не удалось собрать права приложения из перечня команд");
}
