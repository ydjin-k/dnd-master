use serde::{Deserialize, Serialize};

use crate::dice;
use crate::model::{Character, CombatState, Combatant};
use crate::spells::Spell;

const GRID_WIDTH: i32 = 12;
const GRID_HEIGHT: i32 = 10;
const PLAYER_ATTACK_BONUS_PLACEHOLDER: i32 = 3;
const PLAYER_DAMAGE_DICE_PLACEHOLDER: &str = "1d6";
/// Как и PLAYER_ATTACK_BONUS_PLACEHOLDER выше — грубая заглушка вместо расчёта
/// от заклинательной характеристики и бонуса мастерства; полноценный расчёт
/// появится вместе с починкой боевых бонусов, не в этой карточке.
const PLAYER_SPELL_ATTACK_BONUS_PLACEHOLDER: i32 = 5;
const PLAYER_SPELL_SAVE_DC_PLACEHOLDER: i32 = 13;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterTemplate {
    pub id: String,
    pub name: String,
    pub max_hp: i32,
    pub armor_class: i32,
    pub speed_feet: i32,
    pub attack_bonus: i32,
    pub damage_dice: String,
    pub challenge_rating: String,
    pub creature_type: String,
    pub size: String,
    pub description: String,
    pub traits: Vec<String>,
    pub actions: Vec<String>,
    pub image_asset: Option<String>,
}

/// Бестиарий — из bundle.resources в сборке, из src-tauri/bestiary в dev
/// (тот же приём, что и для rules.json/spells.json). Наполнение —
/// `bestiary-full-database-and-tab`, содержимое переведено с официального
/// SRD 5.1 PDF (см. rules/RulesPage для атрибуции источника).
fn bestiary_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    if cfg!(debug_assertions) {
        return Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("bestiary.json"));
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("не найден каталог ресурсов приложения: {e}"))?;
    Ok(resource_dir.join("bestiary").join("bestiary.json"))
}

pub fn load_bestiary(app: &tauri::AppHandle) -> Result<Vec<MonsterTemplate>, String> {
    let path = bestiary_path(app)?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("не удалось прочитать {path:?}: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("повреждён {path:?}: {e}"))
}

/// Каталог картинок существ — забандлен рядом с bestiary.json (см.
/// `bestiary_path`), не отдаётся напрямую через asset-протокол (у проекта
/// его нигде нет), а читается и кодируется в data-URL тем же приёмом, что и
/// импорт файлов персонажа в `import.rs` — команда получает путь, отдаёт
/// готовые для <img src> байты.
fn bestiary_images_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    if cfg!(debug_assertions) {
        return Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("images"));
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("не найден каталог ресурсов приложения: {e}"))?;
    Ok(resource_dir.join("bestiary").join("images"))
}

/// Ядро без Tauri — так уменьшение можно проверить юнит-тестом на реальном
/// файле без запуска приложения (тот же приём, что и `extract_text_from_image_with_models`
/// в `import.rs`). Оригиналы картинок бестиария — ~1122×1402px, 1.5-3.3 МБ
/// каждый (см. отчёт карточки `bestiary-image-loading-hang`), а показываются
/// мелкой иконкой в списке и один раз крупно в деталях — отдавать оригинал на
/// оба случая было избыточно на два порядка и вешало вкладку на 50
/// одновременных IPC-вызовах. `max_size` — желаемая длинная сторона превью в
/// пикселях; вызывающая сторона просит маленький размер для списка и больший
/// для выбранной твари.
pub fn resize_image_to_jpeg_bytes(path: &std::path::Path, max_size: u32) -> Result<Vec<u8>, String> {
    let img = image::open(path).map_err(|e| format!("не удалось прочитать {path:?}: {e}"))?;
    // JPEG вместо PNG — это картины (плотный градиентный арт), на них PNG после
    // уменьшения всё ещё десятки КБ (не два порядка меньше оригинала), а JPEG
    // с качеством 85 — единицы КБ; прозрачность существам бестиария не нужна.
    let resized = img.thumbnail(max_size, max_size).to_rgb8();

    let mut jpeg_bytes = std::io::Cursor::new(Vec::new());
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_bytes, 85);
    encoder
        .encode_image(&resized)
        .map_err(|e| format!("не удалось закодировать превью {path:?}: {e}"))?;
    Ok(jpeg_bytes.into_inner())
}

fn jpeg_bytes_to_data_url(bytes: &[u8]) -> String {
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:image/jpeg;base64,{encoded}")
}

/// Оставлена для существующих тестов уменьшения (`resized_list_thumbnail_...`,
/// `resize_preserves_aspect_ratio_...`) — считает превью напрямую, в обход
/// дискового кэша и семафора ниже (те покрыты своими тестами отдельно).
/// `#[cfg(test)]` — с переходом `load_bestiary_image` на кэш+семафор
/// production-код её больше не вызывает.
#[cfg(test)]
pub fn resize_image_to_data_url(path: &std::path::Path, max_size: u32) -> Result<String, String> {
    resize_image_to_jpeg_bytes(path, max_size).map(|bytes| jpeg_bytes_to_data_url(&bytes))
}

/// Ограничивает число одновременных CPU-тяжёлых ресайзов картинок бестиария,
/// общий на все вызовы `get_bestiary_image` через `tauri::State`. Без этого
/// 50 (а в перспективе 200-300, см. карточку `bestiary-thumbnail-loading-at-scale`)
/// одновременных IPC-вызовов от фронтенда синхронно ресайзят все картинки
/// разом и на десятки секунд забирают все ядра под фоновый пул — владелец
/// продукта воспроизвёл это живьём (`Get-Process` ловил `Responding=False`).
/// Простой блокирующий счётчик на `Mutex`+`Condvar` — без добавления tokio как
/// прямой зависимости: команды здесь синхронные, а ждать в них можно и без
/// async-рантайма.
pub struct ResizeSemaphore {
    state: std::sync::Mutex<usize>,
    cvar: std::sync::Condvar,
    max: usize,
}

pub struct ResizePermit<'a> {
    sem: &'a ResizeSemaphore,
}

impl<'a> Drop for ResizePermit<'a> {
    fn drop(&mut self) {
        let mut count = self.sem.state.lock().unwrap();
        *count -= 1;
        self.sem.cvar.notify_one();
    }
}

impl ResizeSemaphore {
    pub fn new(max: usize) -> Self {
        Self {
            state: std::sync::Mutex::new(0),
            cvar: std::sync::Condvar::new(),
            max: max.max(1),
        }
    }

    pub fn acquire(&self) -> ResizePermit<'_> {
        let mut count = self.state.lock().unwrap();
        while *count >= self.max {
            count = self.cvar.wait(count).unwrap();
        }
        *count += 1;
        ResizePermit { sem: self }
    }
}

/// Несколько единиц, не все ядра целиком (см. находку карточки
/// `bestiary-thumbnail-loading-at-scale`) — оставляет основной поток и
/// остальные Tauri-команды отзывчивыми, даже когда фронтенд просит разом
/// сотни превью.
pub fn default_resize_concurrency() -> usize {
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    (cores / 3).clamp(2, 4)
}

/// Каталог кэша сгенерированных превью — в `app_data_dir` (пишем всегда, в
/// отличие от `resource_dir` бандла, который в собранном приложении может
/// быть недоступен на запись), не рядом с оригиналами. Инвалидация не
/// нужна — картинки бестиария статичны и бандлятся с приложением.
fn thumbnail_cache_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = crate::storage::app_data_dir(app)?.join("bestiary-thumbnails");
    std::fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать {dir:?}: {e}"))?;
    Ok(dir)
}

/// Ключ кэша — имя файла картинки (уже уникально на тварь, это же имя
/// используется, чтобы найти оригинал) + желаемый размер, так что список
/// (160px) и деталь (480px) кэшируются отдельными файлами на тварь.
fn cache_file_name(source_file_name: &std::ffi::OsStr, max_size: u32) -> String {
    let stem = std::path::Path::new(source_file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("thumb");
    format!("{stem}-{max_size}.jpg")
}

/// Ядро кэш+семафор без Tauri/файловой системы оригиналов — так его можно
/// проверить юнит-тестом с поддельным `compute` (счётчик вызовов) и временным
/// каталогом кэша, без реального декодирования картинок.
fn load_cached_or_compute(
    cache_path: &std::path::Path,
    semaphore: &ResizeSemaphore,
    compute: impl FnOnce() -> Result<Vec<u8>, String>,
) -> Result<String, String> {
    if let Ok(cached) = std::fs::read(cache_path) {
        return Ok(jpeg_bytes_to_data_url(&cached));
    }

    let _permit = semaphore.acquire();
    // Перепроверяем после ожидания семафора — пока эта задача ждала, кэш мог
    // уже дописать другой одновременный запрос той же картинки/размера.
    if let Ok(cached) = std::fs::read(cache_path) {
        return Ok(jpeg_bytes_to_data_url(&cached));
    }

    let bytes = compute()?;
    // Запись кэша — best effort: сбой диска не должен ронять уже посчитанное превью.
    let _ = std::fs::write(cache_path, &bytes);
    Ok(jpeg_bytes_to_data_url(&bytes))
}

pub fn load_bestiary_image(
    app: &tauri::AppHandle,
    image_asset: &str,
    max_size: u32,
    semaphore: &ResizeSemaphore,
) -> Result<String, String> {
    let images_dir = bestiary_images_dir(app)?;
    let file_name = std::path::Path::new(image_asset)
        .file_name()
        .ok_or("некорректный путь к картинке")?;
    let source_path = images_dir.join(file_name);

    let cache_path = thumbnail_cache_dir(app)?.join(cache_file_name(file_name, max_size));

    load_cached_or_compute(&cache_path, semaphore, || {
        resize_image_to_jpeg_bytes(&source_path, max_size)
    })
}

fn chebyshev_feet(a: (i32, i32), b: (i32, i32)) -> i32 {
    (a.0 - b.0).abs().max((a.1 - b.1).abs()) * 5
}

fn is_occupied(state: &CombatState, x: i32, y: i32, exclude_id: &str) -> bool {
    state
        .combatants
        .iter()
        .any(|c| c.id != exclude_id && c.current_hp > 0 && c.x == x && c.y == y)
}

/// Бой заканчивается, когда повержена целиком одна сторона — а не когда
/// повержены абсолютно все (это было бы одновременной ничьей, которая
/// на практике не случается и раньше не давало `finished` выставиться).
fn check_side_defeated(state: &mut CombatState) {
    if state.finished {
        return;
    }
    let monsters_alive = state.combatants.iter().any(|c| c.is_monster && c.current_hp > 0);
    let players_alive = state.combatants.iter().any(|c| !c.is_monster && c.current_hp > 0);
    if !monsters_alive {
        state.finished = true;
        state
            .log
            .push("Все монстры повержены — бой окончен, победа персонажей.".into());
    } else if !players_alive {
        state.finished = true;
        state.log.push("Все персонажи повержены — бой окончен.".into());
    }
}

fn next_alive_index(state: &CombatState, from: usize) -> Option<usize> {
    let n = state.turn_order.len();
    if n == 0 {
        return None;
    }
    for step in 1..=n {
        let idx = (from + step) % n;
        let id = &state.turn_order[idx];
        if state
            .combatants
            .iter()
            .any(|c| &c.id == id && c.current_hp > 0)
        {
            return Some(idx);
        }
    }
    None
}

pub fn start_combat(
    monsters: &[MonsterTemplate],
    characters: &[Character],
) -> Result<CombatState, String> {
    if monsters.is_empty() {
        return Err("бой без противников не начать — выбери хотя бы одного монстра".into());
    }
    if characters.is_empty() {
        return Err("бой без персонажей не начать — выбери хотя бы одного".into());
    }

    let mut combatants = Vec::new();
    for (i, m) in monsters.iter().enumerate() {
        let initiative = dice::roll_expression("1d20")?.total;
        combatants.push(Combatant {
            id: format!("monster-{}-{i}", m.id),
            name: m.name.clone(),
            is_monster: true,
            x: GRID_WIDTH - 1,
            y: (i as i32 * 2) % GRID_HEIGHT,
            speed_feet: m.speed_feet,
            max_hp: m.max_hp,
            current_hp: m.max_hp,
            armor_class: m.armor_class,
            attack_bonus: m.attack_bonus,
            damage_dice: m.damage_dice.clone(),
            initiative,
            feet_moved_this_turn: 0,
        });
    }
    for (i, ch) in characters.iter().enumerate() {
        let initiative = dice::roll_expression("1d20")?.total;
        combatants.push(Combatant {
            id: ch.id.clone(),
            name: ch.name.clone(),
            is_monster: false,
            x: 0,
            y: (i as i32 * 2) % GRID_HEIGHT,
            speed_feet: 30,
            max_hp: ch.max_hp,
            current_hp: ch.current_hp,
            armor_class: ch.armor_class,
            attack_bonus: PLAYER_ATTACK_BONUS_PLACEHOLDER,
            damage_dice: PLAYER_DAMAGE_DICE_PLACEHOLDER.into(),
            initiative,
            feet_moved_this_turn: 0,
        });
    }

    let mut turn_order: Vec<String> = combatants.iter().map(|c| c.id.clone()).collect();
    turn_order.sort_by_key(|id| {
        let c = combatants.iter().find(|c| &c.id == id).unwrap();
        std::cmp::Reverse(c.initiative)
    });

    let order_summary = turn_order
        .iter()
        .map(|id| {
            let c = combatants.iter().find(|c| &c.id == id).unwrap();
            format!("{} ({})", c.name, c.initiative)
        })
        .collect::<Vec<_>>()
        .join(", ");

    Ok(CombatState {
        grid_width: GRID_WIDTH,
        grid_height: GRID_HEIGHT,
        combatants,
        turn_order,
        current_turn_index: 0,
        round: 1,
        log: vec![format!("Бой начался. Порядок хода: {order_summary}.")],
        finished: false,
    })
}

pub fn move_combatant(state: &mut CombatState, id: &str, x: i32, y: i32) -> Result<(), String> {
    require_ongoing(state)?;
    if x < 0 || x >= state.grid_width || y < 0 || y >= state.grid_height {
        return Err("клетка вне поля".into());
    }
    if is_occupied(state, x, y, id) {
        return Err("клетка занята".into());
    }
    let c = state
        .combatants
        .iter()
        .find(|c| c.id == id)
        .ok_or("боец не найден")?;
    if c.current_hp <= 0 {
        return Err("боец повержен и не может двигаться".into());
    }
    let distance = chebyshev_feet((c.x, c.y), (x, y));
    let remaining = c.speed_feet - c.feet_moved_this_turn;
    if distance > remaining {
        return Err(format!(
            "не хватает скорости: нужно {distance} футов, осталось {remaining}"
        ));
    }
    let name = c.name.clone();
    let c = state.combatants.iter_mut().find(|c| c.id == id).unwrap();
    c.x = x;
    c.y = y;
    c.feet_moved_this_turn += distance;
    state
        .log
        .push(format!("{name} перемещается на {distance} футов."));
    Ok(())
}

fn resolve_attack(
    state: &mut CombatState,
    attacker_id: &str,
    target_id: &str,
) -> Result<String, String> {
    let (attacker_name, attack_bonus, damage_dice) = {
        let a = state
            .combatants
            .iter()
            .find(|c| c.id == attacker_id)
            .ok_or("атакующий не найден")?;
        if a.current_hp <= 0 {
            return Err("атакующий повержен".into());
        }
        (a.name.clone(), a.attack_bonus, a.damage_dice.clone())
    };
    let (target_name, target_ac) = {
        let t = state
            .combatants
            .iter()
            .find(|c| c.id == target_id)
            .ok_or("цель не найдена")?;
        (t.name.clone(), t.armor_class)
    };

    let to_hit = dice::roll_expression("1d20")?.total + attack_bonus;
    let message = if to_hit >= target_ac {
        let dmg = dice::roll_expression(&damage_dice)?;
        let target = state
            .combatants
            .iter_mut()
            .find(|c| c.id == target_id)
            .unwrap();
        target.current_hp = (target.current_hp - dmg.total).max(0);
        let defeated = target.current_hp == 0;
        let mut msg = format!(
            "{attacker_name} атакует {target_name}: бросок {to_hit} против КД {target_ac} — попадание, урон {}.",
            dmg.total
        );
        if defeated {
            msg.push_str(&format!(" {target_name} повержен(а)."));
        }
        msg
    } else {
        format!(
            "{attacker_name} атакует {target_name}: бросок {to_hit} против КД {target_ac} — промах."
        )
    };

    state.log.push(message.clone());
    check_side_defeated(state);
    Ok(message)
}

fn require_ongoing(state: &CombatState) -> Result<(), String> {
    if state.finished {
        return Err("бой уже завершён".into());
    }
    Ok(())
}

pub fn attack(state: &mut CombatState, attacker_id: &str, target_id: &str) -> Result<(), String> {
    require_ongoing(state)?;
    resolve_attack(state, attacker_id, target_id)?;
    Ok(())
}

pub fn apply_damage(state: &mut CombatState, target_id: &str, delta: i32) -> Result<(), String> {
    require_ongoing(state)?;
    let c = state
        .combatants
        .iter_mut()
        .find(|c| c.id == target_id)
        .ok_or("боец не найден")?;
    c.current_hp = (c.current_hp - delta).clamp(0, c.max_hp);
    let name = c.name.clone();
    let hp = c.current_hp;
    let word = if delta >= 0 { "получает урон" } else { "восстанавливает HP" };
    state
        .log
        .push(format!("{name} {word} {}: сейчас {hp} HP.", delta.abs()));
    check_side_defeated(state);
    Ok(())
}

fn apply_spell_damage(state: &mut CombatState, target_id: &str, amount: i32) -> bool {
    let target = state
        .combatants
        .iter_mut()
        .find(|c| c.id == target_id)
        .unwrap();
    target.current_hp = (target.current_hp - amount).max(0);
    target.current_hp == 0
}

/// Резолвит эффект заклинания в бою — не знает о `Character` и ячейках заклинаний:
/// это ресурс персонажа между боями, а не боевого состояния, поэтому списание
/// ячейки — забота стороны, вызывающей эту функцию (см. `cast_spell_action` в `lib.rs`).
pub fn cast_spell(
    state: &mut CombatState,
    caster_id: &str,
    spell: &Spell,
    target_id: Option<&str>,
) -> Result<(), String> {
    require_ongoing(state)?;
    let caster_name = {
        let caster = state
            .combatants
            .iter()
            .find(|c| c.id == caster_id)
            .ok_or("заклинатель не найден")?;
        if caster.current_hp <= 0 {
            return Err("заклинатель повержен".into());
        }
        caster.name.clone()
    };

    // Утилитарное заклинание без урона: без бросков и без цели, просто факт применения.
    if spell.damage_dice.is_none() && !spell.attack_roll && spell.saving_throw.is_none() {
        state
            .log
            .push(format!("{caster_name} сотворяет «{}».", spell.name));
        return Ok(());
    }

    let target_id = target_id.ok_or("это заклинание требует цель")?;
    let (target_name, target_ac) = {
        let t = state
            .combatants
            .iter()
            .find(|c| c.id == target_id)
            .ok_or("цель не найдена")?;
        (t.name.clone(), t.armor_class)
    };
    let damage_type = spell.damage_type.as_deref().unwrap_or("магический");

    let message = if spell.attack_roll {
        let to_hit = dice::roll_expression("1d20")?.total + PLAYER_SPELL_ATTACK_BONUS_PLACEHOLDER;
        if to_hit >= target_ac {
            let dmg = dice::roll_expression(spell.damage_dice.as_deref().unwrap_or("1d4"))?.total;
            let defeated = apply_spell_damage(state, target_id, dmg);
            let mut msg = format!(
                "{caster_name} сотворяет «{}» на {target_name}: бросок {to_hit} против КД {target_ac} — попадание, урон {dmg} ({damage_type}).",
                spell.name
            );
            if defeated {
                msg.push_str(&format!(" {target_name} повержен(а)."));
            }
            msg
        } else {
            format!(
                "{caster_name} сотворяет «{}» на {target_name}: бросок {to_hit} против КД {target_ac} — промах.",
                spell.name
            )
        }
    } else if let Some(ability) = &spell.saving_throw {
        let roll = dice::roll_expression("1d20")?.total;
        let dc = PLAYER_SPELL_SAVE_DC_PLACEHOLDER;
        let success = roll >= dc;
        let outcome = if success { "успех" } else { "провал" };
        match &spell.damage_dice {
            Some(expr) => {
                let full = dice::roll_expression(expr)?.total;
                let dealt = if success { full / 2 } else { full };
                let defeated = apply_spell_damage(state, target_id, dealt);
                let mut msg = format!(
                    "{caster_name} сотворяет «{}» на {target_name}: спасбросок {ability} {roll} против СЛ {dc} — {outcome}, урон {dealt} ({damage_type}).",
                    spell.name
                );
                if defeated {
                    msg.push_str(&format!(" {target_name} повержен(а)."));
                }
                msg
            }
            None => format!(
                "{caster_name} сотворяет «{}» на {target_name}: спасбросок {ability} {roll} против СЛ {dc} — {outcome}.",
                spell.name
            ),
        }
    } else {
        // Ни броска атаки, ни спасброска — автоматическое попадание (например, «Волшебная стрела»).
        let expr = spell
            .damage_dice
            .as_deref()
            .ok_or("заклинанию не задан урон")?;
        let dmg = dice::roll_expression(expr)?.total;
        let defeated = apply_spell_damage(state, target_id, dmg);
        let mut msg = format!(
            "{caster_name} сотворяет «{}» на {target_name}: автоматическое попадание, урон {dmg} ({damage_type}).",
            spell.name
        );
        if defeated {
            msg.push_str(&format!(" {target_name} повержен(а)."));
        }
        msg
    };

    state.log.push(message);
    check_side_defeated(state);
    Ok(())
}

pub fn end_turn(state: &mut CombatState) -> Result<(), String> {
    require_ongoing(state)?;
    let next = next_alive_index(state, state.current_turn_index);
    match next {
        None => {
            state.finished = true;
            state.log.push("Все на одной стороне повержены — бой окончен.".into());
        }
        Some(idx) => {
            let wrapped = idx <= state.current_turn_index;
            state.current_turn_index = idx;
            if wrapped {
                state.round += 1;
                state.log.push(format!("— Раунд {} —", state.round));
            }
            let id = state.turn_order[idx].clone();
            if let Some(c) = state.combatants.iter_mut().find(|c| c.id == id) {
                c.feet_moved_this_turn = 0;
                let name = c.name.clone();
                state.log.push(format!("Ход переходит к {name}."));
            }
        }
    }
    Ok(())
}

pub fn monster_auto_turn(state: &mut CombatState) -> Result<String, String> {
    require_ongoing(state)?;
    let current_id = state
        .turn_order
        .get(state.current_turn_index)
        .cloned()
        .ok_or("нет текущего хода")?;

    let (mover_pos, remaining, name) = {
        let c = state
            .combatants
            .iter()
            .find(|c| c.id == current_id)
            .ok_or("боец не найден")?;
        if !c.is_monster {
            return Err("сейчас ход не существа".into());
        }
        ((c.x, c.y), c.speed_feet - c.feet_moved_this_turn, c.name.clone())
    };

    let target = state
        .combatants
        .iter()
        .filter(|c| !c.is_monster && c.current_hp > 0)
        .min_by_key(|c| chebyshev_feet(mover_pos, (c.x, c.y)))
        .cloned();

    let Some(target) = target else {
        let msg = format!("{name} не находит цель.");
        state.log.push(msg.clone());
        return Ok(msg);
    };

    let mut pos = mover_pos;
    let mut feet_spent = 0;
    let max_steps = remaining / 5;
    for _ in 0..max_steps {
        if chebyshev_feet(pos, (target.x, target.y)) <= 5 {
            break;
        }
        let dx = (target.x - pos.0).signum();
        let dy = (target.y - pos.1).signum();
        let next = (
            (pos.0 + dx).clamp(0, state.grid_width - 1),
            (pos.1 + dy).clamp(0, state.grid_height - 1),
        );
        if next == pos || is_occupied(state, next.0, next.1, &current_id) {
            break;
        }
        pos = next;
        feet_spent += 5;
    }

    if let Some(c) = state.combatants.iter_mut().find(|c| c.id == current_id) {
        c.x = pos.0;
        c.y = pos.1;
        c.feet_moved_this_turn += feet_spent;
    }

    let adjacent = chebyshev_feet(pos, (target.x, target.y)) <= 5;
    let move_message = if feet_spent > 0 {
        format!("{name} идёт на {feet_spent} футов к {}.", target.name)
    } else {
        format!("{name} остаётся на месте.")
    };
    state.log.push(move_message.clone());

    let message = if adjacent {
        let attack_msg = resolve_attack(state, &current_id, &target.id)?;
        format!("{move_message} {attack_msg}")
    } else {
        let not_reach = format!("Не дотягивается до {} в этот ход.", target.name);
        state.log.push(not_reach.clone());
        format!("{move_message} {not_reach}")
    };

    Ok(message)
}

#[cfg(test)]
mod bestiary_data_tests {
    use super::MonsterTemplate;

    fn load_bundled() -> Vec<MonsterTemplate> {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("bestiary.json");
        let raw = std::fs::read_to_string(&path).expect("прочитать bestiary/bestiary.json");
        serde_json::from_str(&raw).expect("распарсить bestiary.json")
    }

    #[test]
    fn bundled_bestiary_json_parses_and_is_not_empty() {
        let bestiary = load_bundled();
        assert!(!bestiary.is_empty(), "bestiary.json не должен быть пустым");
    }

    #[test]
    fn every_monster_with_an_image_has_a_downloadable_file_on_disk() {
        let images_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("images");
        for m in load_bundled() {
            if let Some(asset) = &m.image_asset {
                let file_name = std::path::Path::new(asset).file_name().unwrap();
                let path = images_dir.join(file_name);
                assert!(
                    path.exists(),
                    "у {} указана картинка {asset:?}, но файла нет на диске — прогони fetch-images.sh",
                    m.name
                );
            }
        }
    }

    #[test]
    fn every_monster_id_is_unique() {
        let bestiary = load_bundled();
        let mut ids: Vec<&str> = bestiary.iter().map(|m| m.id.as_str()).collect();
        ids.sort_unstable();
        let mut deduped = ids.clone();
        deduped.dedup();
        assert_eq!(ids.len(), deduped.len(), "в bestiary.json есть повторяющиеся id");
    }

    /// Не гейт (время зависит от машины) — разовый замер для отчёта карточки
    /// `bestiary-image-loading-hang`, сколько реально стоит пересчёт превью
    /// "на лету" вместо кэширования. Запуск: `cargo test --lib -- --ignored
    /// --nocapture bestiary_resize_all_50_originals_timing`.
    #[test]
    #[ignore]
    fn bestiary_resize_all_50_originals_timing() {
        let images_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("images");
        let bestiary = load_bundled();
        let mut total_original_bytes: u64 = 0;
        let mut total_list_bytes: u64 = 0;

        let start = std::time::Instant::now();
        for m in &bestiary {
            let Some(asset) = &m.image_asset else { continue };
            let file_name = std::path::Path::new(asset).file_name().unwrap();
            let path = images_dir.join(file_name);
            total_original_bytes += std::fs::metadata(&path).unwrap().len();
            let data_url = super::resize_image_to_data_url(&path, 160).unwrap();
            total_list_bytes += data_url.len() as u64;
        }
        let list_elapsed = start.elapsed();

        let mut total_detail_bytes: u64 = 0;
        let mut single_detail_bytes: u64 = 0;
        let start = std::time::Instant::now();
        for m in &bestiary {
            let Some(asset) = &m.image_asset else { continue };
            let file_name = std::path::Path::new(asset).file_name().unwrap();
            let path = images_dir.join(file_name);
            let data_url = super::resize_image_to_data_url(&path, 480).unwrap();
            total_detail_bytes += data_url.len() as u64;
            if single_detail_bytes == 0 {
                single_detail_bytes = data_url.len() as u64;
            }
        }
        let detail_elapsed = start.elapsed();

        println!(
            "50 картинок: оригиналы {:.1} МБ -> превью-160 {:.1} МБ (данные для списка, все 50) за {:?}; \
             превью-480 (все 50, для сравнения) {:.1} МБ за {:?}; одна детальная картинка ~{:.1} КБ",
            total_original_bytes as f64 / 1_000_000.0,
            total_list_bytes as f64 / 1_000_000.0,
            list_elapsed,
            total_detail_bytes as f64 / 1_000_000.0,
            detail_elapsed,
            single_detail_bytes as f64 / 1_000.0,
        );
    }

    /// Регресс на карточку `bestiary-image-loading-hang`: раньше команда отдавала
    /// оригинал целиком (~1.5-3.3 МБ на файл) на любой запрос — вкладка гоняла все
    /// 50 таких через IPC разом. Уменьшенное превью должно быть меньше на порядки,
    /// не «визуально компактнее».
    #[test]
    fn resized_list_thumbnail_is_orders_of_magnitude_smaller_than_the_original() {
        let images_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("images");
        let path = images_dir.join("giant-octopus.png");
        let original_len = std::fs::metadata(&path)
            .expect("giant-octopus.png должен быть на диске")
            .len();

        let data_url = super::resize_image_to_data_url(&path, 160).expect("уменьшить картинку");
        let base64_part = data_url
            .strip_prefix("data:image/jpeg;base64,")
            .expect("data URL с ожидаемым префиксом");
        let resized_len = base64_part.len() as u64 * 3 / 4; // грубая оценка байт до base64

        assert!(
            resized_len * 100 < original_len,
            "превью ({resized_len} байт) должно быть минимум на два порядка меньше оригинала ({original_len} байт)"
        );
    }

    #[test]
    fn resize_preserves_aspect_ratio_and_caps_the_long_side() {
        let images_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("images");
        let path = images_dir.join("giant-octopus.png");

        let data_url = super::resize_image_to_data_url(&path, 160).expect("уменьшить картинку");
        let base64_part = data_url.strip_prefix("data:image/jpeg;base64,").unwrap();
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_part)
            .expect("валидный base64");
        let decoded = image::load_from_memory(&bytes).expect("валидный JPEG");
        assert!(decoded.width() <= 160 && decoded.height() <= 160);
        assert!(decoded.width() == 160 || decoded.height() == 160);
    }
}

/// Тесты кэша на диске и семафора параллелизма — карточка
/// `bestiary-thumbnail-loading-at-scale`. Работают через `load_cached_or_compute`
/// напрямую (без `AppHandle`/запущенного Tauri), с поддельным `compute`, чтобы
/// считать вызовы вместо настоящего декодирования картинки — тот же приём, что
/// «mock/spy» в критериях тестирования карточки.
#[cfg(test)]
mod bestiary_cache_tests {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use super::{cache_file_name, load_cached_or_compute, resize_image_to_jpeg_bytes, ResizeSemaphore};

    fn unique_temp_dir(tag: &str) -> PathBuf {
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "dnd-master-bestiary-test-{tag}-{}-{n}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn repeated_request_for_the_same_cached_thumbnail_does_not_recompute() {
        let dir = unique_temp_dir("cache-hit");
        let cache_path = dir.join("wolf-160.jpg");
        let semaphore = ResizeSemaphore::new(4);
        let calls = Arc::new(AtomicUsize::new(0));

        for _ in 0..5 {
            let calls = Arc::clone(&calls);
            load_cached_or_compute(&cache_path, &semaphore, || {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok(vec![0xFF, 0xD8, 0xFF]) // заглушка вместо настоящих JPEG-байт
            })
            .expect("не должно падать");
        }

        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "после первой записи в кэш `compute` не должен вызываться повторно"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cache_file_name_keys_list_and_detail_sizes_separately() {
        let file_name = std::ffi::OsStr::new("giant-octopus.png");
        assert_eq!(cache_file_name(file_name, 160), "giant-octopus-160.jpg");
        assert_eq!(cache_file_name(file_name, 480), "giant-octopus-480.jpg");
    }

    /// Раньше запрос не ограничивал параллелизм вовсе — эта проба красная без
    /// семафора (можно проверить, вызвав `compute` напрямую из N потоков без
    /// прохода через `load_cached_or_compute`/семафор: наблюдаемый максимум
    /// одновременных обгонит `LIMIT`).
    #[test]
    fn concurrent_requests_never_exceed_the_configured_resize_limit() {
        const LIMIT: usize = 3;
        const REQUESTS: usize = 20;

        let semaphore = Arc::new(ResizeSemaphore::new(LIMIT));
        let current = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));

        let handles: Vec<_> = (0..REQUESTS)
            .map(|i| {
                let semaphore = Arc::clone(&semaphore);
                let current = Arc::clone(&current);
                let peak = Arc::clone(&peak);
                let dir = unique_temp_dir(&format!("concurrency-{i}"));
                std::thread::spawn(move || {
                    let cache_path = dir.join("thumb.jpg");
                    load_cached_or_compute(&cache_path, &semaphore, || {
                        let now = current.fetch_add(1, Ordering::SeqCst) + 1;
                        peak.fetch_max(now, Ordering::SeqCst);
                        std::thread::sleep(std::time::Duration::from_millis(15));
                        current.fetch_sub(1, Ordering::SeqCst);
                        Ok(vec![0xFF, 0xD8, 0xFF])
                    })
                    .unwrap();
                    let _ = std::fs::remove_dir_all(&dir);
                })
            })
            .collect();

        for h in handles {
            h.join().unwrap();
        }

        let observed_peak = peak.load(Ordering::SeqCst);
        assert!(
            observed_peak <= LIMIT,
            "одновременно ресайзилось {observed_peak} картинок, лимит {LIMIT}"
        );
        assert!(
            observed_peak >= 1,
            "проба должна была реально пронаблюдать хотя бы одно одновременное выполнение"
        );
    }

    /// Стресс-проверка на масштаб из карточки: дублирует существующие 50
    /// оригиналов бестиария под ~300 синтетическими именами во временный
    /// каталог (не коммитится, удаляется в конце теста) и прогоняет тот же
    /// путь, что и `get_bestiary_image` (кэш + семафор + реальный ресайз), с
    /// 300 одновременных запросов, как при открытии вкладки с полным
    /// бестиарием будущего. Не гейт (время зависит от машины) — по образцу
    /// `bestiary_resize_all_50_originals_timing`. Запуск: `cargo test --lib --
    /// --ignored --nocapture bestiary_300_synthetic_thumbnails_stress`.
    #[test]
    #[ignore]
    fn bestiary_300_synthetic_thumbnails_stress() {
        const TARGET_COUNT: usize = 300;

        let originals_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("images");
        let originals: Vec<PathBuf> = std::fs::read_dir(&originals_dir)
            .expect("прочитать bestiary/images")
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && matches!(
                        p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(),
                        Some("png" | "jpg" | "jpeg" | "webp")
                    )
            })
            .collect();
        assert!(!originals.is_empty(), "нет исходных картинок для дублирования");

        let synthetic_originals_dir = unique_temp_dir("stress-originals");
        let cache_dir = unique_temp_dir("stress-cache");
        let mut synthetic_paths = Vec::with_capacity(TARGET_COUNT);
        for i in 0..TARGET_COUNT {
            let source = &originals[i % originals.len()];
            let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("png");
            let dest = synthetic_originals_dir.join(format!("synthetic-{i}.{ext}"));
            std::fs::copy(source, &dest).expect("скопировать во временный синтетический каталог");
            synthetic_paths.push(dest);
        }

        let semaphore = Arc::new(ResizeSemaphore::new(super::default_resize_concurrency()));
        let start = std::time::Instant::now();
        let handles: Vec<_> = synthetic_paths
            .into_iter()
            .enumerate()
            .map(|(i, source_path)| {
                let semaphore = Arc::clone(&semaphore);
                let cache_path = cache_dir.join(format!("synthetic-{i}-160.jpg"));
                std::thread::spawn(move || {
                    load_cached_or_compute(&cache_path, &semaphore, || {
                        resize_image_to_jpeg_bytes(&source_path, 160)
                    })
                    .expect("ресайз синтетической копии не должен падать")
                })
            })
            .collect();

        for h in handles {
            h.join().unwrap();
        }
        let elapsed = start.elapsed();

        println!(
            "стресс {TARGET_COUNT} превью (лимит параллелизма {}): {:?} суммарно",
            super::default_resize_concurrency(),
            elapsed
        );
        assert!(
            elapsed < std::time::Duration::from_secs(60),
            "300 превью через кэш+семафор заняли {elapsed:?} — это уже похоже на зависание вкладки"
        );

        let _ = std::fs::remove_dir_all(&synthetic_originals_dir);
        let _ = std::fs::remove_dir_all(&cache_dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Character;

    fn character(id: &str, hp: i32, ac: i32) -> Character {
        Character {
            id: id.into(),
            name: format!("Игрок-{id}"),
            max_hp: hp,
            current_hp: hp,
            armor_class: ac,
            ..Default::default()
        }
    }

    fn monster_template(id: &str) -> MonsterTemplate {
        MonsterTemplate {
            id: id.into(),
            name: id.into(),
            max_hp: 11,
            armor_class: 13,
            speed_feet: 40,
            attack_bonus: 4,
            damage_dice: "2d4+2".into(),
            challenge_rating: "1/4".into(),
            creature_type: "зверь".into(),
            size: "Средний".into(),
            description: String::new(),
            traits: vec![],
            actions: vec![],
            image_asset: None,
        }
    }

    fn combatant(id: &str, is_monster: bool, x: i32, y: i32, speed: i32, hp: i32) -> Combatant {
        Combatant {
            id: id.into(),
            name: id.into(),
            is_monster,
            x,
            y,
            speed_feet: speed,
            max_hp: hp,
            current_hp: hp,
            armor_class: 10,
            attack_bonus: 5,
            damage_dice: "1d6".into(),
            initiative: 0,
            feet_moved_this_turn: 0,
        }
    }

    fn test_spell(
        level: u8,
        damage_dice: Option<&str>,
        damage_type: Option<&str>,
        attack_roll: bool,
        saving_throw: Option<&str>,
    ) -> Spell {
        Spell {
            id: "test-spell".into(),
            name: "Тестовое заклинание".into(),
            level,
            school: "Testing".into(),
            casting_time: "1 действие".into(),
            range: "60 футов".into(),
            components: "В, С".into(),
            duration: "Мгновенная".into(),
            concentration: false,
            ritual: false,
            classes: vec![],
            description: String::new(),
            damage_dice: damage_dice.map(|s| s.to_string()),
            damage_type: damage_type.map(|s| s.to_string()),
            attack_roll,
            saving_throw: saving_throw.map(|s| s.to_string()),
        }
    }

    fn state_with(combatants: Vec<Combatant>) -> CombatState {
        let turn_order = combatants.iter().map(|c| c.id.clone()).collect();
        CombatState {
            grid_width: GRID_WIDTH,
            grid_height: GRID_HEIGHT,
            combatants,
            turn_order,
            current_turn_index: 0,
            round: 1,
            log: Vec::new(),
            finished: false,
        }
    }

    #[test]
    fn start_combat_rolls_initiative_for_everyone() {
        let monsters = vec![monster_template("wolf")];
        let characters = vec![character("pc1", 20, 15)];

        let state = start_combat(&monsters, &characters).unwrap();

        assert_eq!(state.combatants.len(), 2);
        assert_eq!(state.turn_order.len(), 2);
        assert_eq!(state.round, 1);
        assert!(!state.log.is_empty());
    }

    #[test]
    fn start_combat_requires_both_sides() {
        assert!(start_combat(&[], &[character("pc1", 10, 10)]).is_err());
        assert!(start_combat(&[monster_template("wolf")], &[]).is_err());
    }

    #[test]
    fn move_within_speed_succeeds_and_tracks_feet_spent() {
        let mut state = state_with(vec![combatant("a", false, 0, 0, 30, 10)]);
        move_combatant(&mut state, "a", 2, 0).unwrap(); // 10 футов из 30
        let a = state.combatants.iter().find(|c| c.id == "a").unwrap();
        assert_eq!((a.x, a.y), (2, 0));
        assert_eq!(a.feet_moved_this_turn, 10);
    }

    #[test]
    fn move_beyond_speed_fails() {
        let mut state = state_with(vec![combatant("a", false, 0, 0, 30, 10)]);
        // 30 футов = 6 клеток по прямой, семь клеток уже дальше скорости
        let err = move_combatant(&mut state, "a", 7, 0).unwrap_err();
        assert!(err.contains("скорости"));
    }

    #[test]
    fn move_onto_occupied_cell_fails() {
        let mut state = state_with(vec![
            combatant("a", false, 0, 0, 30, 10),
            combatant("b", true, 1, 0, 30, 10),
        ]);
        assert!(move_combatant(&mut state, "a", 1, 0).is_err());
    }

    #[test]
    fn attack_keeps_hp_within_bounds() {
        // Много попыток — исход броска случаен, но границы HP нарушаться не должны.
        for _ in 0..30 {
            let mut state = state_with(vec![
                combatant("attacker", true, 0, 0, 30, 20),
                combatant("target", false, 0, 1, 30, 10),
            ]);
            attack(&mut state, "attacker", "target").unwrap();
            let target = state.combatants.iter().find(|c| c.id == "target").unwrap();
            assert!(target.current_hp >= 0 && target.current_hp <= target.max_hp);
            assert!(!state.log.is_empty());
        }
    }

    #[test]
    fn apply_damage_clamps_and_ends_combat_when_a_side_is_wiped() {
        let mut state = state_with(vec![
            combatant("monster", true, 0, 0, 30, 15),
            combatant("pc", false, 0, 1, 30, 10),
        ]);

        apply_damage(&mut state, "monster", 999).unwrap();
        let monster = state.combatants.iter().find(|c| c.id == "monster").unwrap();
        assert_eq!(monster.current_hp, 0);
        assert!(state.finished, "бой должен закончиться, когда монстров не осталось");

        // После конца боя действия отклоняются.
        assert!(attack(&mut state, "pc", "monster").is_err());
    }

    #[test]
    fn cast_spell_with_attack_roll_keeps_hp_within_bounds() {
        for _ in 0..30 {
            let mut state = state_with(vec![
                combatant("caster", false, 0, 0, 30, 20),
                combatant("target", true, 0, 1, 30, 10),
            ]);
            let s = test_spell(0, Some("1d10"), Some("огонь"), true, None);
            cast_spell(&mut state, "caster", &s, Some("target")).unwrap();
            let target = state.combatants.iter().find(|c| c.id == "target").unwrap();
            assert!(target.current_hp >= 0 && target.current_hp <= target.max_hp);
            assert!(!state.log.is_empty());
        }
    }

    #[test]
    fn cast_spell_with_saving_throw_deals_half_damage_on_success() {
        // 2d1 всегда даёт 2 — детерминированный урон, чтобы проверить именно
        // округление половины вниз, а не саму случайность броска.
        let mut saw_success = false;
        let mut saw_failure = false;
        for _ in 0..60 {
            let mut state = state_with(vec![
                combatant("caster", false, 0, 0, 30, 20),
                combatant("target", true, 0, 1, 30, 100),
            ]);
            let s = test_spell(0, Some("2d1"), Some("яд"), false, Some("Телосложение"));
            cast_spell(&mut state, "caster", &s, Some("target")).unwrap();
            let target = state.combatants.iter().find(|c| c.id == "target").unwrap();
            let dealt = 100 - target.current_hp;
            let message = state.log.last().unwrap().clone();
            if message.contains("успех") {
                assert_eq!(dealt, 1, "успешный спасбросок должен наносить половину урона (округление вниз)");
                saw_success = true;
            } else {
                assert!(message.contains("провал"));
                assert_eq!(dealt, 2, "провал спасброска должен наносить полный урон");
                saw_failure = true;
            }
        }
        assert!(saw_success && saw_failure, "за 60 попыток должны встретиться оба исхода");
    }

    #[test]
    fn cast_spell_without_damage_dice_is_utility_and_touches_no_hp() {
        let mut state = state_with(vec![combatant("caster", false, 0, 0, 30, 20)]);
        let s = test_spell(0, None, None, false, None);
        cast_spell(&mut state, "caster", &s, None).unwrap();
        let caster = state.combatants.iter().find(|c| c.id == "caster").unwrap();
        assert_eq!(caster.current_hp, caster.max_hp);
        assert!(state.log.last().unwrap().contains("Тестовое заклинание"));
    }

    #[test]
    fn cast_spell_requires_target_when_it_has_an_attack_roll() {
        let mut state = state_with(vec![combatant("caster", false, 0, 0, 30, 20)]);
        let s = test_spell(0, Some("1d10"), Some("огонь"), true, None);
        let err = cast_spell(&mut state, "caster", &s, None).unwrap_err();
        assert!(err.contains("цель"));
    }

    #[test]
    fn end_turn_skips_defeated_and_advances_round_on_wrap() {
        let mut state = state_with(vec![
            combatant("a", true, 0, 0, 30, 10),
            combatant("b", false, 0, 1, 30, 10),
        ]);
        assert_eq!(state.current_turn_index, 0);

        end_turn(&mut state).unwrap();
        assert_eq!(state.current_turn_index, 1);
        assert_eq!(state.round, 1);

        end_turn(&mut state).unwrap();
        assert_eq!(state.current_turn_index, 0);
        assert_eq!(state.round, 2, "ход вернулся к первому — начался новый раунд");
    }

    #[test]
    fn monster_auto_turn_closes_distance_and_attacks_when_adjacent() {
        // 3 клетки = 15 футов, монстр со скоростью 30 футов их полностью покрывает.
        let mut state = state_with(vec![
            combatant("monster", true, 0, 0, 30, 20),
            combatant("pc", false, 3, 0, 30, 10),
        ]);

        let message = monster_auto_turn(&mut state).unwrap();

        let monster = state.combatants.iter().find(|c| c.id == "monster").unwrap();
        assert_eq!((monster.x, monster.y), (2, 0), "должен встать вплотную к цели");
        assert!(message.contains("атакует"));
    }

    #[test]
    fn monster_auto_turn_only_moves_when_out_of_reach() {
        let mut state = state_with(vec![
            combatant("monster", true, 0, 0, 30, 20),
            combatant("pc", false, 9, 0, 30, 10),
        ]);

        let message = monster_auto_turn(&mut state).unwrap();

        let monster = state.combatants.iter().find(|c| c.id == "monster").unwrap();
        assert_eq!((monster.x, monster.y), (6, 0), "проходит все 30 футов");
        assert!(message.contains("Не дотягивается"));
    }
}
