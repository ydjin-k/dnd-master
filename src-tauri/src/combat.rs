use serde::{Deserialize, Serialize};

use crate::dice;
use crate::model::{AbilityScores, Character, CombatState, Combatant};
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

/// Спасбросок из шапки стат-блока: «Спасброски Лов +5». Характеристика — ключ
/// `AbilityScores` (`dexterity`), а не русская подпись: подпись живёт одним
/// местом во фронте (`ABILITY_LABELS`), и второй копии в данных ей не надо.
/// Значение ключа стережёт проба `saving_throw_abilities_are_known_keys`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterSavingThrow {
    pub ability: String,
    pub bonus: i32,
}

/// Навык из шапки: «Навыки Восприятие +3». Имя навыка — русское, из того же
/// списка `ALL_SKILLS`, которым пользуется лист персонажа; сверяет проба
/// `bestiary.data.test.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterSkill {
    pub skill: String,
    pub bonus: i32,
}

/// Чувство с дальностью: «тёмное зрение 60 футов». Дальность отдельным числом,
/// а не внутри строки, — чтобы показ склеивал её сам и одинаково у всех.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterSense {
    pub name: String,
    pub range_feet: i32,
}

/// Чей это контент — и, следовательно, какой подписью он подписывается.
///
/// **Происхождение НЕ читается из записи.** Оно проставляется загрузчиком по
/// тому, из какого файла запись приехала (`load_bestiary`), и потому
/// `skip_deserializing`: `"origin"`, вписанный в JSON руками, молча
/// игнорируется. Причина — правило одного владельца факта. Полем в записи
/// происхождением владела бы аккуратность заполняющего: забытое поле у нового
/// существа тихо подписало бы его переводом SRD, то есть соврало бы игроку об
/// источнике ровно там, где врать нельзя. Файлом же владеет загрузчик, и
/// соврать запись не может: в `bestiary.json` лежит только SRD 5.1 под CC BY,
/// в `own-creatures.json` — только наше, и это граница, проверяемая `git
/// diff`, а не памятью.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MonsterOrigin {
    /// Перевод System Reference Document 5.1, CC BY 4.0.
    #[default]
    Srd,
    /// Наше собственное существо: числа взяты из книги владельца, текст и имя
    /// написаны нами.
    Own,
}

/// Запись существа — полный стат-блок.
///
/// **Необязательные поля отсутствуют, а не пусты.** У волка нет ни языков, ни
/// легендарных действий, и `null`/`[]` в их клетках показались бы игроку
/// потерянными данными. Отсюда `Option<...>` со `skip_serializing_if`: чего у
/// существа нет, того нет и в JSON, и во фронт оно не доедет. Тот же приём,
/// что у `monsterIds`/`spellIds` в строках таблиц событий
/// (`src/ui/eventTables/types.ts`).
///
/// `abilities` и `passive_perception` обязательны: они стоят в КАЖДОМ
/// стат-блоке SRD (проверено по всем 315 блокам издания CC BY 4.0), и
/// отсутствие их означало бы не «существу не положено», а незаполненную запись.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterTemplate {
    pub id: String,
    pub name: String,
    /// Проставляется загрузчиком по файлу-источнику, см. `MonsterOrigin`.
    #[serde(skip_deserializing)]
    pub origin: MonsterOrigin,
    pub max_hp: i32,
    /// Кости хитов из той же строки стат-блока, что и `max_hp`:
    /// «Hit Points 58 (9d8 + 18)» — «9d8+18». Запись та же, что у
    /// `damage_dice`: латинская `d`, без пробелов.
    ///
    /// Обязательное, по тому же признаку, что `abilities` и
    /// `passive_perception`: кости стоят в КАЖДОМ из 317 стат-блоков SRD 5.1,
    /// у которых есть опасность. Единственное место во всём документе, где их
    /// нет, — «Avatar of Death» (хиты равны половине максимума призвавшего), и
    /// у него нет опасности, то есть записью существа он и не является.
    ///
    /// Среднее по костям обязано сходиться с `max_hp` — стережёт проба
    /// `hit_dice_average_matches_max_hp`.
    pub hit_dice: String,
    pub armor_class: i32,
    pub speed_feet: i32,
    /// Атака есть не у всех: у Визгуна, Лягушки и Морского конька стат-блок
    /// SRD 5.1 не содержит ни одной атаки («A frog has no effective attacks»).
    /// Ставить им +0 и «1к1» значило бы вписать в данные два выдуманных числа,
    /// поэтому поля необязательные — и отсутствуют, как и прочие
    /// необязательные. Отказ от броска выносит `resolve_attack`, а не показ.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attack_bonus: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_dice: Option<String>,
    pub challenge_rating: String,
    pub creature_type: String,
    pub size: String,
    pub description: String,
    pub abilities: AbilityScores,
    pub passive_perception: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saving_throws: Option<Vec<MonsterSavingThrow>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills: Option<Vec<MonsterSkill>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_vulnerabilities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_resistances: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_immunities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub condition_immunities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub senses: Option<Vec<MonsterSense>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub languages: Option<Vec<String>>,
    pub traits: Vec<String>,
    pub actions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reactions: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub legendary_actions: Option<Vec<String>>,
    pub image_asset: Option<String>,
}

/// Файл с переводом SRD 5.1. Лежит под CC BY 4.0 и содержит ТОЛЬКО SRD —
/// именно на этом держится подпись вкладки «Бестиарий».
pub const SRD_BESTIARY_FILE: &str = "bestiary.json";

/// Файл наших собственных существ: числа взяты из книги владельца, имена и
/// текст написаны нами. Отдельным файлом, а не полем в общем, по той же
/// причине, по какой «Эльф бездны» не лежит в `rules.json` (`abyssElfRace.ts`):
/// граница «всё, что приехало из `bestiary.json`, — это SRD» должна
/// проверяться содержимым файла, а не памятью того, кто дописывал запись.
///
/// Почему при этом второй ФАЙЛ, а не второй модуль во фронте, как у расы:
/// существо, в отличие от расы, нужно и Rust-стороне — `start_combat` ищет
/// `monster_ids` в том, что вернул `load_bestiary`, и по id же на существ
/// ссылаются таблицы событий. Живущее только во фронте существо было бы видно
/// в бестиарии и невозможно в бою.
pub const OWN_BESTIARY_FILE: &str = "own-creatures.json";

/// Каталог данных бестиария — из bundle.resources в сборке, из
/// src-tauri/bestiary в dev (тот же приём, что и для rules.json/spells.json).
fn bestiary_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    if cfg!(debug_assertions) {
        return Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bestiary"));
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("не найден каталог ресурсов приложения: {e}"))?;
    Ok(resource_dir.join("bestiary"))
}

/// Разбирает содержимое файла существ и ставит КАЖДОЙ записи происхождение
/// этого файла. Единственное место во всём приложении, где происхождение
/// назначается, — и оно не смотрит в запись.
pub fn parse_monsters(raw: &str, origin: MonsterOrigin) -> Result<Vec<MonsterTemplate>, String> {
    let mut monsters: Vec<MonsterTemplate> =
        serde_json::from_str(raw).map_err(|e| format!("повреждены данные существ: {e}"))?;
    for monster in &mut monsters {
        monster.origin = origin;
    }
    Ok(monsters)
}

pub fn read_monster_file(
    path: &std::path::Path,
    origin: MonsterOrigin,
) -> Result<Vec<MonsterTemplate>, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("не удалось прочитать {path:?}: {e}"))?;
    parse_monsters(&raw, origin).map_err(|e| format!("{path:?}: {e}"))
}

pub fn load_bestiary(app: &tauri::AppHandle) -> Result<Vec<MonsterTemplate>, String> {
    let dir = bestiary_dir(app)?;
    let mut monsters = read_monster_file(&dir.join(SRD_BESTIARY_FILE), MonsterOrigin::Srd)?;
    monsters.extend(read_monster_file(
        &dir.join(OWN_BESTIARY_FILE),
        MonsterOrigin::Own,
    )?);
    Ok(monsters)
}

/// Каталог картинок существ — забандлен рядом с bestiary.json (см.
/// `bestiary_path`), не отдаётся напрямую через asset-протокол (у проекта
/// его нигде нет), а читается и кодируется в data-URL: команда получает путь,
/// отдаёт готовые для <img src> байты.
fn bestiary_images_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(bestiary_dir(app)?.join("images"))
}

/// Ядро без Tauri — так уменьшение можно проверить юнит-тестом на реальном
/// файле без запуска приложения. Оригиналы картинок бестиария — ~1122×1402px, 1.5-3.3 МБ
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
/// быть недоступен на запись), не рядом с оригиналами.
///
/// Раньше здесь было записано «инвалидация не нужна — картинки бестиария
/// статичны и бандлятся с приложением». Это предположение сломалось
/// 17.09.2026, когда владелец перепаковал весь каталог арта (коммит
/// `d54b378`): каталог кэша переживает подмену оригиналов, имя файла при
/// перепаковке не меняется, и приложение сутки показывало превью от 10
/// сентября — 67 файлов кэша из 75 оказались старше своего исходника,
/// затронуты все 50 существ. Кэш здесь живёт дольше картинок, поэтому
/// годность записи проверяется на каждый запрос — см.
/// `discard_stale_cache_entry`.
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

/// Путь к отпечатку исходника, по которому посчитана лежащая рядом запись
/// кэша: `quipper-480.jpg` → `quipper-480.src`. Расширение, а не суффикс имени,
/// — чтобы отпечаток всегда ходил парой со своим превью и удалялся тем же
/// ключом.
fn cache_stamp_path(cache_path: &std::path::Path) -> std::path::PathBuf {
    cache_path.with_extension("src")
}

/// Отпечаток исходника: время правки (в наносекундах от эпохи) и размер в
/// байтах. `None` — если файла нет или файловая система не хранит время правки.
///
/// Почему не хэш содержимого: он закрыл бы и подмену байт при совпадении обоих
/// полей, но стоил бы чтения полутора-трёх мегабайт оригинала на каждое
/// превью — ровно та работа, ради ухода от которой кэш и заведён.
fn source_stamp(source_path: &std::path::Path) -> Option<String> {
    let meta = std::fs::metadata(source_path).ok()?;
    let modified = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?;
    Some(format!("{} {}", modified.as_nanos(), meta.len()))
}

/// Единственный владелец вопроса «годится ли лежащая в кэше запись под
/// нынешний исходник». Ответ — «да» только если исходник СОВПАДАЕТ с тем, по
/// которому запись посчитана: рядом с превью лежит отпечаток (время правки +
/// размер), и сравнивается он на РАВЕНСТВО. Не совпало или отпечатка нет —
/// запись и отпечаток удаляются, и `load_cached_or_compute` ниже посчитает
/// превью заново под тем же именем.
///
/// **Почему не «оригинал новее».** Ровно так здесь и было до 25.09.2026, и в
/// этой же шапке стояло, что случай «подмена файлом с БОЛЕЕ старым временем
/// правки» недостижим, потому что «перепаковка, пересохранение и любой
/// `git checkout` ставят время „сейчас“». Довод оказался неверен для того
/// способа, которым мы сами чиним картинки: 23.09.2026 двум файлам поменяли
/// содержимое, сохранив времена правки (`fef61a3`), у `quipper.jpg` осталось
/// 17.09 00:37 — старше обеих записей кэша, и `source_at > cached_at` не
/// сработало ни разу. Владелец увидел под Квиппером ездовую лошадь дважды, и
/// второй раз запись кэша пришлось удалять руками. Сравнение на несовпадение
/// ловит и более старое время, и одинаковое время при другом размере.
///
/// **Цена.** Те же два `stat` на запрос плюс чтение отпечатка — десятки байт.
/// Каталог кэша мусора не копит: у отпечатка тот же ключ, что у превью, и
/// свежий ложится поверх прежнего. Вписать отпечаток в само ИМЯ файла кэша
/// нельзя по той же причине, что и раньше: `stat` это не отменяет (ключ без
/// него не построить), зато оставило бы в `%APPDATA%` по файлу на каждую
/// прошлую редакцию картинки, которые удалять уже некому.
///
/// **Что ловится теперь и что по-прежнему нет.** Ловится любое расхождение
/// времени правки (в обе стороны) и любое расхождение размера. Не ловится
/// подмена байт, при которой И время правки, И размер совпали до наносекунды
/// — это закрыл бы только хэш содержимого, см. `source_stamp`.
///
/// **Записи, сделанные до этой правки, отпечатка не имеют и считаются
/// негодными** — доказать, что они посчитаны по нынешнему исходнику, нечем.
/// Каждая из них пересчитается ОДИН раз, когда её впервые попросят, и получит
/// отпечаток. Это не чистка кэша на старте (её карточка запрещает: 509 записей
/// разом — те самые зависания вкладки), а разовый промах, размазанный по тому,
/// что владелец действительно открывает, и ограниченный тем же семафором.
fn discard_stale_cache_entry(cache_path: &std::path::Path, source_path: &std::path::Path) {
    if !cache_path.exists() {
        // Обычный промах кэша — инвалидировать нечего.
        return;
    }
    let Some(current) = source_stamp(source_path) else {
        // Нет оригинала (об этом скажет сам ресайз внятной ошибкой) или ФС без
        // времени правки — оставляем кэш как есть: отдать старое превью лучше,
        // чем пересчитывать всё на каждый показ.
        return;
    };

    let recorded = std::fs::read_to_string(cache_stamp_path(cache_path));
    if recorded.as_deref().map(str::trim).ok() == Some(current.as_str()) {
        return;
    }

    let _ = std::fs::remove_file(cache_path);
    let _ = std::fs::remove_file(cache_stamp_path(cache_path));
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

/// Полный путь запроса превью: сперва выбросить протухшую запись, потом
/// обычный кэш+семафор. Отдельной функцией, а не двумя строками в
/// `load_bestiary_image`, чтобы проба на подмену оригинала звала ровно то же,
/// что и приложение, — иначе проверялся бы её собственный порядок вызовов, а
/// не production-путь.
///
/// Отпечаток снимается ДО `compute` и пишется после него — намеренно в таком
/// порядке. Если исходник подменят ровно в это окно, записанным окажется
/// отпечаток прежнего файла, и следующий запрос сочтёт запись негодной и
/// пересчитает её. Ошибка в сторону лишнего пересчёта, а не в сторону показа
/// чужой картинки, — а дороже ошибаться можно только во второй.
fn load_cached_or_compute_for_source(
    cache_path: &std::path::Path,
    source_path: &std::path::Path,
    semaphore: &ResizeSemaphore,
    compute: impl FnOnce() -> Result<Vec<u8>, String>,
) -> Result<String, String> {
    discard_stale_cache_entry(cache_path, source_path);
    let stamp = source_stamp(source_path);
    load_cached_or_compute(cache_path, semaphore, || {
        let bytes = compute()?;
        // Запись отпечатка — best effort, как и запись самого превью: сбой
        // диска не должен ронять уже посчитанное. Без отпечатка запись просто
        // окажется негодной на следующем запросе и пересчитается.
        if let Some(stamp) = stamp {
            let _ = std::fs::write(cache_stamp_path(cache_path), stamp);
        }
        Ok(bytes)
    })
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

    load_cached_or_compute_for_source(&cache_path, &source_path, semaphore, || {
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
            attack_bonus: Some(PLAYER_ATTACK_BONUS_PLACEHOLDER),
            damage_dice: Some(PLAYER_DAMAGE_DICE_PLACEHOLDER.into()),
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

/// Записать строку в журнал боя и проверить, не кончился ли бой. Вынесено,
/// чтобы попадание без урона уходило в журнал ТЕМ ЖЕ путём, что и обычное, —
/// иначе у строки журнала завелось бы два владельца.
fn log_line(state: &mut CombatState, message: String) -> String {
    state.log.push(message.clone());
    check_side_defeated(state);
    message
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
    // Две РАЗНЫЕ вещи, и путать их нельзя. Атаки нет вовсе — у Визгуна,
    // Лягушки и Морского конька, и тогда бросать нечего. Атака есть, а урона
    // при попадании нет — «Душащий ковёр»: единственный такой блок во всём
    // SRD 5.1 («Hit: The creature is grappled»), его 2к6+3 капают в начале
    // хода схваченной жертвы, а не от попадания. Ковёр обязан бросать и
    // попадать; вписать ему урон атаки значило бы соврать про правило.
    let Some(attack_bonus) = attack_bonus else {
        return Err(format!("у {attacker_name} нет атаки в стат-блоке — бросать нечего"));
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
        let Some(damage_dice) = &damage_dice else {
            return Ok(log_line(
                state,
                format!(
                    "{attacker_name} атакует {target_name}: бросок {to_hit} против КД {target_ac} — попадание, урона при попадании нет."
                ),
            ));
        };
        let dmg = dice::roll_expression(damage_dice)?;
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

    Ok(log_line(state, message))
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

/// Схема записи существа живёт в двух местах — здесь и в
/// `src/state/types.ts`. Разъехаться им нельзя: фронт читает то, что отдал
/// Rust, и молча потерянное поле выглядит как «у существа этого нет», а не как
/// дефект. Эти пробы сверяют набор полей и стерегут значения, которые show
/// и будущий добор бестиария принимают на веру.
#[cfg(test)]
mod bestiary_schema_tests {
    use super::{MonsterSavingThrow, MonsterSense, MonsterSkill, MonsterTemplate};
    use crate::model::AbilityScores;

    /// Образец, у которого ЗАПОЛНЕНЫ все необязательные поля: со
    /// `skip_serializing_if` пустое поле не попало бы в JSON, и сверка ниже
    /// проглядела бы его отсутствие во фронте.
    fn fully_populated() -> MonsterTemplate {
        MonsterTemplate {
            id: "sample".into(),
            name: "Образец".into(),
            origin: super::MonsterOrigin::Srd,
            max_hp: 1,
            hit_dice: "1d1".into(),
            armor_class: 1,
            speed_feet: 1,
            attack_bonus: Some(1),
            damage_dice: Some("1d1".into()),
            challenge_rating: "0".into(),
            creature_type: "зверь".into(),
            size: "Средний".into(),
            description: String::new(),
            abilities: AbilityScores::default(),
            passive_perception: 10,
            saving_throws: Some(vec![MonsterSavingThrow {
                ability: "dexterity".into(),
                bonus: 1,
            }]),
            skills: Some(vec![MonsterSkill {
                skill: "Восприятие".into(),
                bonus: 1,
            }]),
            damage_vulnerabilities: Some(vec!["огонь".into()]),
            damage_resistances: Some(vec!["холод".into()]),
            damage_immunities: Some(vec!["яд".into()]),
            condition_immunities: Some(vec!["Отравленное".into()]),
            senses: Some(vec![MonsterSense {
                name: "тёмное зрение".into(),
                range_feet: 60,
            }]),
            languages: Some(vec!["Общий".into()]),
            traits: vec![],
            actions: vec![],
            reactions: Some(vec![]),
            legendary_actions: Some(vec![]),
            image_asset: Some("images/sample.jpg".into()),
        }
    }

    /// Поля `export interface MonsterTemplate` из типов фронта.
    fn frontend_fields() -> Vec<String> {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("src")
            .join("state")
            .join("types.ts");
        let src = std::fs::read_to_string(&path).expect("прочитать src/state/types.ts");
        let start = src
            .find("export interface MonsterTemplate {")
            .expect("в types.ts нет interface MonsterTemplate");
        let body = &src[start..];
        let end = body.find("\n}").expect("не закрыт interface MonsterTemplate");

        body[..end]
            .lines()
            .skip(1)
            .filter_map(|line| {
                let line = line.trim();
                // Строки комментариев внутри интерфейса тоже содержат двоеточие.
                if line.starts_with('*') || line.starts_with("//") || line.starts_with('/') {
                    return None;
                }
                let name = line.split(':').next()?.trim();
                let name = name.strip_suffix('?').unwrap_or(name);
                if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric()) {
                    return None;
                }
                Some(name.to_string())
            })
            .collect()
    }

    #[test]
    fn monster_template_matches_frontend_type() {
        let json = serde_json::to_value(fully_populated()).expect("сериализовать образец");
        let mut rust: Vec<String> = json
            .as_object()
            .expect("объект")
            .keys()
            .map(|k| k.to_string())
            .collect();
        let mut front = frontend_fields();
        rust.sort();
        front.sort();

        let only_rust: Vec<&String> = rust.iter().filter(|k| !front.contains(k)).collect();
        let only_front: Vec<&String> = front.iter().filter(|k| !rust.contains(k)).collect();

        assert!(
            only_rust.is_empty() && only_front.is_empty(),
            "схема существа разъехалась: только в Rust {only_rust:?}, \
             только в src/state/types.ts {only_front:?}"
        );
    }
}

#[cfg(test)]
mod bestiary_data_tests {
    use super::{MonsterOrigin, MonsterTemplate, OWN_BESTIARY_FILE, SRD_BESTIARY_FILE};

    fn bestiary_dir() -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bestiary")
    }

    /// Оба файла существ вместе — ровно то, что увидит игрок. Сторожа ниже
    /// ходят по этому списку, а не по одному SRD: наши существа приезжают в ту
    /// же вкладку и в тот же бой, и поблажки на «это не SRD» у них нет.
    fn load_bundled() -> Vec<MonsterTemplate> {
        let dir = bestiary_dir();
        let mut all = super::read_monster_file(&dir.join(SRD_BESTIARY_FILE), MonsterOrigin::Srd)
            .expect("прочитать bestiary/bestiary.json");
        all.extend(
            super::read_monster_file(&dir.join(OWN_BESTIARY_FILE), MonsterOrigin::Own)
                .expect("прочитать bestiary/own-creatures.json"),
        );
        all
    }

    #[test]
    fn bundled_bestiary_json_parses_and_is_not_empty() {
        let bestiary = load_bundled();
        assert!(!bestiary.is_empty(), "bestiary.json не должен быть пустым");
    }

    /// Происхождение записи — факт ЗАГРУЗЧИКА, а не данных, и проба ставит это
    /// ребром: обе записи ниже сами объявляют себе происхождение, и обе обязаны
    /// получить то, которое назначено их файлу.
    ///
    /// Краснеет на снятии любой из двух половин починки: уберите цикл в
    /// `parse_monsters` — самозванец, назвавшийся SRD, подпишется переводом
    /// SRD; уберите `skip_deserializing` — своё происхождение доедет до поля в
    /// обход загрузчика.
    #[test]
    fn origin_comes_from_the_file_not_from_the_record() {
        fn liar(id: &str, claimed: &str) -> String {
            format!(
                r#"{{
                "id": "{id}", "name": "Самозванец {id}", "origin": "{claimed}",
                "maxHp": 4, "hitDice": "1d8", "armorClass": 10, "speedFeet": 30,
                "challengeRating": "0", "creatureType": "зверь", "size": "Средний",
                "description": "", "passivePerception": 10,
                "abilities": {{"strength": 10, "dexterity": 10, "constitution": 10,
                               "intelligence": 10, "wisdom": 10, "charisma": 10}},
                "traits": [], "actions": [], "imageAsset": null
            }}"#
            )
        }
        let liars = format!("[{}, {}]", liar("a", "own"), liar("b", "srd"));

        for origin in [MonsterOrigin::Srd, MonsterOrigin::Own] {
            for m in super::parse_monsters(&liars, origin).expect("разобрать") {
                assert_eq!(
                    m.origin, origin,
                    "{} перебил происхождение своего файла — подпись вкладки \
                     перестала быть проверяемой",
                    m.name
                );
            }
        }

        // И в обход загрузчика — тоже: происхождение не разбирается из JSON
        // вовсе, «own» в записи не даёт записи ничего, кроме умолчания.
        let bypassed: Vec<MonsterTemplate> = serde_json::from_str(&liars).expect("разобрать");
        assert!(
            bypassed.iter().all(|m| m.origin == MonsterOrigin::Srd),
            "происхождение приехало из самой записи, минуя загрузчика"
        );

        let dir = bestiary_dir();
        let own = super::read_monster_file(&dir.join(OWN_BESTIARY_FILE), MonsterOrigin::Own)
            .expect("прочитать own-creatures.json");
        assert!(!own.is_empty(), "own-creatures.json не должен быть пустым");
        assert!(own.iter().all(|m| m.origin == MonsterOrigin::Own));

        let srd = super::read_monster_file(&dir.join(SRD_BESTIARY_FILE), MonsterOrigin::Srd)
            .expect("прочитать bestiary.json");
        assert!(srd.iter().all(|m| m.origin == MonsterOrigin::Srd));
    }

    /// У нашего существа картинка ОБЯЗАТЕЛЬНА, в отличие от существа SRD.
    /// Причина простая: наши существа заведены под уже нарисованный арт — он и
    /// есть повод их завести, — и запись без картинки означает не «этому не
    /// положено», а потерянный файл или опечатку в имени. Соседняя проба
    /// `every_monster_with_an_image_has_a_downloadable_file_on_disk` стережёт
    /// обратное: что названный файл есть на диске.
    ///
    /// **Исключение, и оно поимённое.** У тринадцати существ карточки
    /// `bestiary-thirteen-kin` холст на диске есть, но показывать его нельзя:
    /// в картинку вшита ПОДПИСЬ с чужим именем — «СИНИЙ СЛААД», «ОТРОДЬЕ
    /// ЮАНЬ-ТИ», «ВЕРХОВНЫЙ ЖРЕЦ КУО-ТОА», «Злобоглаз зомби», «Тиран смерти»
    /// и так все тринадцать (проверено чтением подписи с каждого холста,
    /// 25.09.2026). Пока холсты не перевыпущены (отдельная карточка роли
    /// `ui-developer`, решение владельца от 24.09.2026), запись живёт без
    /// `imageAsset` и показывается без картинки — так и задумано, см.
    /// `bestiary/images/README.md`. Сослаться на будущий файл авансом нельзя:
    /// соседняя проба про файл на диске покраснеет, и правильно сделает.
    ///
    /// Те же грабли уже были у пятерых существ Подземья (карточка
    /// `bestiary-underdark-six`); их холсты перевыпущены, имена вычеркнуты, и
    /// список опустел до нуля — ровно как обещано абзацем ниже.
    ///
    /// **Трое пачки J** (`bestiary-pack-beast-folk`) — тот же случай и та же
    /// причина: подпись на холсте прочитана глазами 30.09.2026 и оказалась
    /// книжной — «Кенку» (в кавычках), «Кваггот», «ТРИ-КРИН». Двое соседей по
    /// той же карточке подписаны нашим словом («Жаболюд», «КРЫЛАТЫЙ КОБОЛЬД»),
    /// и они сюда НЕ попадают: холсты переименованы под `id`, `imageAsset`
    /// проставлен.
    ///
    /// **Пятеро пачки I** (`bestiary-pack-yugoloths-and-floaters`) — тот же
    /// случай, но целой пачкой сразу: подпись прочитана глазами с каждого из
    /// пяти холстов 30.09.2026 и у всех пяти оказалась КНИЖНОЙ — «МЕЗЗОЛОТ»,
    /// «НИКАЛОТ», «УЛЬТРОЛОТ», «ФЛАМФ», «Ааракокра». Исключений в этой пачке
    /// нет ни одного, и это противоположность соседней пачке C, где нашей
    /// оказалась подпись всех семи холстов и в список не попал никто.
    ///
    /// **Шестеро спорной пачки** (`bestiary-pack-contested-seven`) — тот же
    /// случай, прочитано глазами 01.10.2026: «Шипастый дьявол», «Вождь
    /// медвежатников», «Полуогр (огриллон)», «Орог», «Нотик», «Демилич».
    ///
    /// Один холст этой пачки — Падшей души — в список НЕ попадает, и это не
    /// послабление, а отсутствие причины: подписи на нём нет вовсе, значит
    /// чужого слова на холсте нет, файл переименован под `id` и `imageAsset`
    /// проставлен.
    ///
    /// Подпись «Шипастый дьявол» тут острее прочих, и перевыпускать её надо
    /// зная почему: это ИМЯ ЧУЖОЙ ЗАПИСИ SRD (`barbed-devil` «Шипастый
    /// дьявол»), поставленное на холст СОВСЕМ ДРУГОГО существа, которого в
    /// SRD нет вовсе. То есть холст не просто подписан книжным словом — он
    /// подписан неверно, и перевыпуск чинит обе беды разом.
    ///
    /// **Восемь имён пачек J и I отсюда УЖЕ вычеркнуты** карточкой
    /// `art-bestiary-relettering-eight-canvases` (01.10.2026): холсты
    /// перелетованы, переименованы под `id`, `imageAsset` проставлен. Абзацы
    /// про них оставлены нарочно — они объясняют, ПОЧЕМУ имя сюда попадало, и
    /// служат образцом разбора для следующей пачки. Список же держит ровно
    /// тех, у кого краска на холсте ещё чужая.
    ///
    /// Список именно поимённый, а не «можно без картинки кому угодно»: забытый
    /// `imageAsset` у сорокового существа обязан краснеть по-прежнему.
    /// Перевыпустили холст — вычеркнуть имя отсюда вместе с постановкой
    /// `imageAsset`, и проба сама проследит, что вычеркнули не зря.
    #[test]
    fn every_own_creature_has_an_image() {
        const AWAITING_REDRAWN_ART: [&str; 0] = [];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        let without: Vec<&str> = own
            .iter()
            .filter(|m| m.image_asset.is_none())
            .map(|m| m.name.as_str())
            .filter(|name| !AWAITING_REDRAWN_ART.contains(name))
            .collect();
        assert!(
            without.is_empty(),
            "у наших существ картинка обязательна, а её нет у: {without:?}"
        );
        let redrawn: Vec<&str> = own
            .iter()
            .filter(|m| m.image_asset.is_some())
            .map(|m| m.name.as_str())
            .filter(|name| AWAITING_REDRAWN_ART.contains(name))
            .collect();
        assert!(
            redrawn.is_empty(),
            "у {redrawn:?} картинка появилась — вычеркни имя из AWAITING_REDRAWN_ART, \
             иначе исключение переживёт свою причину"
        );
    }

    /// Шестеро существ Подземья заведены одной карточкой и одним источником, и
    /// у всех шести стат-блок обязан быть ПОЛНЫМ — иначе запись доедет до
    /// карточки существа с пустыми графами. Отдельной пробой, а не общей по
    /// файлу, потому что часть полей необязательна у соседей по делу (у Валуна
    /// нет языков, у Визгуна нет атак), а у этих шести есть в книге все.
    #[test]
    fn underdark_six_have_a_full_stat_block() {
        const SIX: [&str; 6] = [
            "zloy-glaz",
            "smotryashchiy",
            "svezhevatel",
            "rybolyud",
            "bury-zhuk",
            "troglodit",
        ];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in SIX {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(m.max_hp > 0 && m.armor_class > 0, "{id}: хиты или КД не заполнены");
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: у всех шести в книге есть атака — бонус и кости обязаны стоять"
            );
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: все шестеро — жители тьмы, чувства обязаны стоять"
            );
            assert!(
                m.languages.as_ref().is_some_and(|l| !l.is_empty()),
                "{id}: в книге у всех шести есть язык"
            );
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
        }
    }

    /// Тринадцать родичей карточки `bestiary-thirteen-kin` — та же проба, что у
    /// шестёрки Подземья, и по той же причине: записи заведены одной пачкой из
    /// одного источника, и пустая графа у любой из них доедет до карточки
    /// существа. Отдельной пробой, а не общей по файлу, потому что часть полей
    /// законно отсутствует у соседей (у Валуна нет языков, у Визгуна нет атак),
    /// а у этих тринадцати в книге есть всё перечисленное.
    ///
    /// Картинки среди обязательного НЕТ: у всех тринадцати холст несёт чужую
    /// подпись, и `imageAsset` им не ставится — за это отвечает поимённое
    /// исключение в `every_own_creature_has_an_image`.
    #[test]
    fn thirteen_kin_have_a_full_stat_block() {
        const THIRTEEN: [&str; 13] = [
            "siniy-graber",
            "krasny-graber",
            "zelyony-graber",
            "sery-graber",
            "graber-smerti",
            "golovastik-grabera",
            "chistokrovny-serpent",
            "polukrovny-serpent",
            "otrodye-serpenta",
            "verhovny-zhrets-rybolyudov",
            "bich-rybolyudov",
            "zombi-zlogo-glaza",
            "glaz-tiran",
        ];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in THIRTEEN {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(m.max_hp > 0 && m.armor_class > 0, "{id}: хиты или КД не заполнены");
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: у всех тринадцати в книге есть атака — бонус и кости обязаны стоять"
            );
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: у всех тринадцати в книге есть чувства"
            );
            assert!(
                m.languages.as_ref().is_some_and(|l| !l.is_empty()),
                "{id}: в книге у всех тринадцати есть язык"
            );
            assert!(!m.traits.is_empty(), "{id}: пустые особенности");
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
        }
    }

    /// Шестеро пачки A (`bestiary-pack-dinosaurs-and-beasts`) — та же проба,
    /// что у шестёрки Подземья и тринадцати родичей, и по той же причине:
    /// записи заведены одной пачкой из одного источника, и пустая графа у
    /// любой доедет до карточки существа.
    ///
    /// Обязательное здесь КОРОЧЕ, чем у двух соседних пачек, и это факт книги,
    /// а не послабление. У трёх динозавров и Ускользающего зверя в стат-блоке
    /// стоит «Языки —», то есть языка нет; у трёх динозавров нет ни одного
    /// особого чувства, кроме пассивной Внимательности, которая живёт
    /// отдельным полем; а у Анкилозавра в книге нет ни одной особенности —
    /// только действие хвостом. Требовать от них `languages`, `senses` и
    /// `traits` значило бы требовать выдумать три графы из четырёх.
    ///
    /// Картинка среди обязательного ЕСТЬ, в отличие от тринадцати родичей: у
    /// всех шести холстов подпись либо наша собственная («Йети», «ШАКАЛЬНИК»,
    /// «Ускользающий зверь»), либо её нет вовсе (три динозавра) — проверено
    /// чтением каждого холста, а не ожиданием. Поэтому все шесть переименованы
    /// под `id`, `imageAsset` проставлен, и в `AWAITING_REDRAWN_ART` эта пачка
    /// не вносит никого.
    #[test]
    fn pack_a_dinosaurs_and_beasts_have_a_full_stat_block() {
        const SIX: [&str; 6] = [
            "allozavr",
            "ankilozavr",
            "pteranodon",
            "yeti",
            "shakalnik",
            "uskolzayushchiy-zver",
        ];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in SIX {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(m.speed_feet > 0, "{id}: не заполнена скорость");
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: у всех шести в книге есть атака — бонус и кости обязаны стоять"
            );
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: имя файла картинки обязано совпадать с id — у всех шести \
                 холст подписан нашим словом или не подписан вовсе, \
                 см. bestiary/images/README.md; сейчас стоит {:?}",
                m.image_asset
            );
        }
    }

    /// Шестеро пачки B (`bestiary-pack-dungeon-vermin`) — та же проба, что у
    /// трёх соседних пачек, и по той же причине: записи заведены одной
    /// карточкой из одного источника, и пустая графа у любой доедет до
    /// карточки существа.
    ///
    /// Обязательное здесь ШИРЕ, чем у пачки A: в книге у всех шести есть и
    /// чувства, и хотя бы одна особенность, так что `senses` и `traits`
    /// требуются наравне с остальным. А `languages` не требуются: у
    /// Ползающего падальщика и Пронзателя в стат-блоке стоит «Языки —», и
    /// спрашивать с них язык значило бы требовать его выдумать.
    ///
    /// Скорость среди обязательного НЕТ, и это тоже факт книги, а не
    /// послабление: у Водной аномалии «Скорость 0 фт., плавая 60 фт.» —
    /// элементаль привязан к своему сосуду и по суше не ходит вовсе. Такая же
    /// нулевая скорость уже стоит у Спорогнили. Требовать `speed_feet > 0`,
    /// как требует проба пачки A, значило бы покрасить верную запись.
    ///
    /// Картинка среди обязательного ЕСТЬ, как у пачки A: подпись на всех
    /// шести холстах прочитана глазами и оказалась нашей — «Ползающий
    /// падальщик», «ПРОНЗАТЕЛЬ», «Крюкастый ужас», «Ползающая рука»,
    /// «ШЛЕМОНОСНЫЙ УЖАС», «Водная аномалия». Поэтому все шесть переименованы
    /// под `id`, `imageAsset` проставлен, и в `AWAITING_REDRAWN_ART` пачка не
    /// вносит никого — список как был пустым, так и остался.
    #[test]
    fn pack_b_dungeon_vermin_have_a_full_stat_block() {
        const SIX: [&str; 6] = [
            "polzayushchiy-padalshchik",
            "pronzatel",
            "kryukasty-uzhas",
            "polzayushchaya-ruka",
            "shlemonosny-uzhas",
            "vodnaya-anomaliya",
        ];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in SIX {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: у всех шести в книге есть атака — бонус и кости обязаны стоять"
            );
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: все шестеро — жители подземелья, чувства обязаны стоять"
            );
            assert!(!m.traits.is_empty(), "{id}: пустые особенности");
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: имя файла картинки обязано совпадать с id — все шесть холстов \
                 подписаны нашим словом, см. bestiary/images/README.md; сейчас стоит {:?}",
                m.image_asset
            );
        }
    }

    /// Пятеро пачки J (`bestiary-pack-beast-folk`, «Звериные гуманоиды») — та
    /// же проба, что у соседних пачек, и по той же причине: записи заведены
    /// одной карточкой из одного источника, и пустая графа у любой доедет до
    /// карточки существа.
    ///
    /// Обязательное здесь — как у пачки A, со скоростью: у всех пятерых в
    /// книге ненулевая наземная скорость (от 20 футов у Жаболюда), так что
    /// послабления пачки B (Водная аномалия со «Скорость 0 фт.») не нужно.
    ///
    /// А вот `senses` и `languages` в обязательное НЕ входят, и это факт
    /// книги, а не поблажка. Чувств нет у двоих: в стат-блоке Жаболюда и
    /// Пересмешника стоит только пассивная Внимательность, тёмного зрения ни у
    /// того, ни у другого нет — спрашивать с них чувство значило бы требовать
    /// его выдумать. Языки же есть у всех пятерых, но требовать их отдельной
    /// строкой смысла нет: `traits` и `actions` ниже и так непусты у всех.
    ///
    /// Подпись прочитана с каждого из пяти холстов глазами (30.09.2026), а
    /// книжные подписи Пересмешника, Квугота и Мантиса перелетованы
    /// (01.10.2026). Теперь все пять картинок обязаны называться по `id`.
    #[test]
    fn pack_j_beast_folk_have_a_full_stat_block() {
        const FIVE: [&str; 5] = [
            "zhabolyud",
            "krylaty-kobold",
            "peresmeshnik",
            "kvugot",
            "mantis",
        ];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in FIVE {
            let m = own
                .iter()
                .find(|m| &m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(m.speed_feet > 0, "{id}: не заполнена скорость");
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: у всех пятерых в книге есть атака — бонус и кости обязаны стоять"
            );
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(!m.traits.is_empty(), "{id}: пустые особенности");
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
        }
        for id in FIVE {
            let m = own.iter().find(|m| m.id == id).expect("найдена выше");
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: холст подписан нашим словом, значит имя файла обязано совпадать \
                 с id, см. bestiary/images/README.md; сейчас стоит {:?}",
                m.image_asset
            );
        }
    }

    /// Семеро пачки C (`bestiary-pack-blights-and-lesser-undead`) — та же
    /// проба, что у соседних пачек, и по той же причине: записи заведены одной
    /// карточкой из одного источника, и пустая графа у любой доедет до карточки
    /// существа.
    ///
    /// **Три заразы стерегутся ещё и порознь, отдельной пробой
    /// `pack_c_three_blights_are_three_different_stat_blocks`.** Общей проверки
    /// «графа непуста» тут мало: три блока стоят в книге на одной странице, у
    /// них одинаковая форма и разные числа, и самая дешёвая ошибка — переписать
    /// один блок в три. Непустые графы такую подмену переживут молча.
    ///
    /// Обязательное здесь — как у пачки B, и послабления те же самые, только по
    /// другим существам:
    ///
    /// - `speed_feet > 0` НЕ требуется: у Пылающего черепа и Баньши в книге
    ///   «Скорость 0 фт., летая 40 фт. (парит)» — по земле ни тот, ни другая не
    ///   ходят вовсе. Ровно случай Водной аномалии из пачки B.
    /// - `traits` НЕ требуются: в стат-блоке Игольчатой заразы нет ни одной
    ///   особенности, только два действия. Спрашивать с неё особенность значило
    ///   бы требовать её выдумать — как у Анкилозавра в пачке A.
    ///
    /// А `senses` и `languages` требуются со всех семерых, и это факт книги: у
    /// трёх зараз слепое зрение 60 футов, у остальных четверых тёмное зрение 60
    /// футов; язык назван у всех семи, пусть у двух зараз и Пугала — строкой
    /// «понимает, но не говорит».
    ///
    /// Картинка требуется со всех семи. Подпись прочитана с каждого холста
    /// глазами (30.09.2026) и у всех семи оказалась НАШЕЙ: «Ветвистая зараза»,
    /// «Игольчатая зараза», «Вьющаяся зараза», «Пылающий череп», «Пугало»,
    /// «Ревенант», «Баньши». Поэтому все семь переименованы под `id`,
    /// `imageAsset` проставлен, и в `AWAITING_REDRAWN_ART` эта пачка не вносит
    /// никого — список остаётся тем же, каким его оставила пачка J.
    #[test]
    fn pack_c_blights_and_lesser_undead_have_a_full_stat_block() {
        const SEVEN: [&str; 7] = [
            "vetvistaya-zaraza",
            "igolchataya-zaraza",
            "vyushchayasya-zaraza",
            "pylayushchiy-cherep",
            "pugalo",
            "revenant",
            "banshi",
        ];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in SEVEN {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: у всех семерых в книге есть атака — бонус и кости обязаны стоять"
            );
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: у всех семерых в книге есть чувство — слепое или тёмное зрение"
            );
            assert!(
                m.languages.as_ref().is_some_and(|l| !l.is_empty()),
                "{id}: в книге у всех семерых назван язык"
            );
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: холст подписан НАШИМ словом, значит имя файла обязано совпадать \
                 с id, см. bestiary/images/README.md; сейчас стоит {:?}",
                m.image_asset
            );
        }
    }

    /// Три заразы — три РАЗНЫХ стат-блока, а не один с перекрашенными числами.
    ///
    /// Проба заведена на названную ловушку, а не на строчки. Блоки стоят в
    /// книге на одной странице (157 по счёту `pdfplumber`, «155» в колонтитуле),
    /// написаны по одному шаблону и отличаются числами: кости хитов 1к6+1 /
    /// 2к8+2 / 4к8+8, опасность 1/8 / 1/4 / 1/2, действия — когти / когти и
    /// иглы / сжимание и опутывающие растения. Скопировать блок ветвистой в
    /// остальные два — самая дешёвая ошибка этой пачки, и соседняя проба
    /// `pack_c_blights_and_lesser_undead_have_a_full_stat_block` её не увидит:
    /// у копии все графы непусты.
    ///
    /// Сверять с книгой проба не может и не пытается — книги в git нет. Она
    /// держит ровно то, что проверяемо без неё: что тройка ПОПАРНО различна по
    /// каждому числу, которое в книге различается, и что число хитов сходится с
    /// костями у каждой (это же независимо стережёт `hit_dice_average_matches_max_hp`
    /// по всему бестиарию сразу).
    #[test]
    fn pack_c_three_blights_are_three_different_stat_blocks() {
        const BLIGHTS: [&str; 3] = [
            "vetvistaya-zaraza",
            "igolchataya-zaraza",
            "vyushchayasya-zaraza",
        ];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        let three: Vec<&MonsterTemplate> = BLIGHTS
            .iter()
            .map(|id| {
                own.iter()
                    .find(|m| &m.id == id)
                    .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"))
            })
            .collect();

        for (i, a) in three.iter().enumerate() {
            for b in &three[i + 1..] {
                assert_ne!(a.hit_dice, b.hit_dice, "{} и {}: одни кости хитов", a.id, b.id);
                assert_ne!(a.max_hp, b.max_hp, "{} и {}: одни хиты", a.id, b.id);
                assert_ne!(
                    a.challenge_rating, b.challenge_rating,
                    "{} и {}: одна опасность",
                    a.id, b.id
                );
                assert_ne!(a.speed_feet, b.speed_feet, "{} и {}: одна скорость", a.id, b.id);
                assert_ne!(
                    a.damage_dice, b.damage_dice,
                    "{} и {}: одни кости урона",
                    a.id, b.id
                );
                assert_ne!(a.actions, b.actions, "{} и {}: одни действия", a.id, b.id);
                assert_ne!(
                    a.abilities.strength, b.abilities.strength,
                    "{} и {}: одна Сила",
                    a.id, b.id
                );
            }
        }

        // Числа действий берутся из текста самого действия, а не из шапки:
        // иглы игольчатой и опутывание вьющейся в шапку не попадают вовсе.
        let by_id = |id: &str| -> &MonsterTemplate {
            three.iter().find(|m| m.id == id).expect("найдена выше")
        };
        assert_eq!(by_id("vetvistaya-zaraza").actions.len(), 1, "у ветвистой одно действие");
        assert!(
            by_id("igolchataya-zaraza")
                .actions
                .iter()
                .any(|a| a.starts_with("Иглы.")),
            "игольчатая обязана стрелять иглами — это её единственное отличие от ветвистой \
             в списке действий"
        );
        assert!(
            by_id("vyushchayasya-zaraza")
                .actions
                .iter()
                .any(|a| a.starts_with("Опутывающие растения")),
            "у вьющейся в книге есть второе действие с перезарядкой"
        );
    }

    /// Пятеро пачки I (`bestiary-pack-yugoloths-and-floaters`) — та же проба,
    /// что у соседних пачек, и по той же причине: записи заведены одной
    /// карточкой из одного раздела книги, и пустая графа у любой доедет до
    /// карточки существа.
    ///
    /// Книжные подписи всех пяти холстов перелетованы (01.10.2026), поэтому у
    /// каждой записи картинка обязана стоять и называться по `id`.
    ///
    /// Послабления названы поимённо, и каждое — факт книги, а не поблажка:
    ///
    /// - `traits` НЕ требуются: у Аровинга в стат-блоке одна особенность, а
    ///   вот спрашивать их с каждого пришлось бы выдумывать — случай
    ///   Игольчатой заразы из пачки C. Требуются они со всех, кроме него, —
    ///   и он их как раз имеет, так что проверка стоит общей.
    /// - `languages` требуются со всех пяти, и это тоже факт книги: у троицы
    ///   исчадий два языка и телепатия, у Флафа — строка «понимает, но не
    ///   говорит» плюс телепатия, у Аровинга — два языка.
    /// - `senses` НЕ требуются с Аровинга: у него в книге нет ни одного
    ///   чувства с дальностью, только пассивная Внимательность 15. Ставить
    ///   ему тёмное зрение «как у соседей» значило бы вписать выдуманное
    ///   число — запрет карточки.
    #[test]
    fn pack_i_yugoloth_kin_and_floaters_have_a_full_stat_block() {
        const FIVE: [&str; 5] = ["monolot", "duolot", "feylot", "flaf", "aroving"];
        /// У кого чувство с дальностью в книге есть. Аровинга тут нет — см.
        /// разбор послаблений над пробой.
        const WITH_SENSES: [&str; 4] = ["monolot", "duolot", "feylot", "flaf"];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in FIVE {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(m.speed_feet > 0, "{id}: не заполнена скорость");
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: у всех пятерых в книге есть атака — бонус и кости обязаны стоять"
            );
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(!m.traits.is_empty(), "{id}: пустые особенности");
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
            assert!(
                m.languages.as_ref().is_some_and(|l| !l.is_empty()),
                "{id}: язык назван в книге у всех пятерых"
            );
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: перелетованный холст обязан называться по id; сейчас стоит {:?}",
                m.image_asset
            );
        }
        for id in WITH_SENSES {
            let m = own.iter().find(|m| m.id == id).expect("найдена выше");
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: чувство с дальностью стоит в книге и обязано стоять в записи"
            );
        }
    }

    /// Пятеро пачки D — те же требования к полноте блока, что у соседних
    /// пачек, и по той же причине: записи заведены одной карточкой из одного
    /// раздела книги, и пустая графа у любой доедет до карточки существа.
    ///
    /// **Картинка требуется со ВСЕХ пяти, и это ровно случай пачки C, а не
    /// пачки I.** Подпись прочитана глазами с каждого холста (30.09.2026) и у
    /// всех пяти оказалась НАШЕЙ: «ЦИКЛОП», «ФОМОР», «ЭМПИРЕЙ», «Пикси»,
    /// «Камбион». Первые три набраны прописными, две последние капителью; на
    /// правило это не влияет — важно, ЧЬЁ слово стоит на холсте, а не каким
    /// кеглем оно набрано. Поэтому все пять переименованы под `id`,
    /// `imageAsset` проставлен, и в `AWAITING_REDRAWN_ART` эта пачка не вносит
    /// никого — после перелетовки пачек I и J список остаётся пустым.
    ///
    /// Слова эти законны по той же причине, по какой законны «Ревенант» и
    /// «Баньши» пачки C: все пять старше D&D на века — греч. Κύκλωψ, ирл.
    /// *Fomoire*, греч. ἔμπυρος через лат. *empyreus*, корнуолльское «пикси»,
    /// средневековое лат. *cambion*. Ни одна основа в `FORBIDDEN_STEMS` от этой
    /// пачки не добавлена, и это счёт, а не осторожность: список остаётся
    /// двадцативосьмёркой.
    ///
    /// Послабления названы поимённо, и каждое — факт книги, а не поблажка:
    ///
    /// - **атака НЕ требуется с Пикси.** В её блоке нет ни одной атаки вовсе:
    ///   единственное действие — «Превосходная невидимость». Тот же случай,
    ///   что у Визгуна, Лягушки и Морского конька в SRD (см. `attack_bonus`),
    ///   и приписать ей бонус с костями значило бы вписать два выдуманных
    ///   числа. С остальных четверых атака требуется.
    /// - **`senses` требуются только с троих.** Чувство с дальностью стоит в
    ///   книге у Фомора (тёмное зрение 120 футов), Эмпирея (истинное зрение
    ///   120 футов) и Камбиона (тёмное зрение 60 футов). У Циклопа и Пикси в
    ///   строке «Чувства» нет ничего, кроме пассивной Внимательности, — 8 и 14
    ///   соответственно. Дать им «тёмное зрение как у соседей» — ровно тот
    ///   подбор по соседям, который карточка запрещает.
    /// - **`traits` НЕ требуются.** У Фомора в блоке нет ни одной особенности:
    ///   всё, чем он страшен, записано действиями («Дурной глаз», «Проклятье
    ///   дурного глаза»). Случай Игольчатой заразы из пачки C; спрашивать
    ///   особенность с каждого значило бы её выдумать. У остальных четверых
    ///   особенности есть.
    /// - **`languages` требуются со всех пяти**, и это тоже факт книги:
    ///   Великаний у Циклопа, Великаний и Подземный у Фомора, «все» у
    ///   Эмпирея, Сильван у Пикси, языки Бездны, Инфернальный и Общий у
    ///   Камбиона.
    #[test]
    fn pack_d_giants_fey_and_celestials_have_a_full_stat_block() {
        const FIVE: [&str; 5] = ["tsiklop", "fomor", "empirey", "piksi", "kambion"];
        /// У кого в книге есть атака. Пикси тут нет — см. разбор послаблений
        /// над пробой.
        const WITH_ATTACK: [&str; 4] = ["tsiklop", "fomor", "empirey", "kambion"];
        /// У кого в книге есть чувство с дальностью. Циклопа и Пикси тут нет —
        /// там же.
        const WITH_SENSES: [&str; 3] = ["fomor", "empirey", "kambion"];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in FIVE {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(m.speed_feet > 0, "{id}: не заполнена скорость");
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
            assert!(
                m.languages.as_ref().is_some_and(|l| !l.is_empty()),
                "{id}: язык назван в книге у всех пятерых"
            );
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: холст подписан НАШИМ словом, значит имя файла обязано совпадать \
                 с id, см. bestiary/images/README.md; сейчас стоит {:?}",
                m.image_asset
            );
        }
        for id in WITH_ATTACK {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: атака стоит в книге — бонус и кости обязаны стоять"
            );
        }
        let piksi = own.iter().find(|m| m.id == "piksi").expect("найдена выше");
        assert!(
            piksi.attack_bonus.is_none() && piksi.damage_dice.is_none(),
            "у Пикси в книге нет ни одной атаки — приписанные бонус и кости это \
             выдуманные числа, а не недосмотр: сейчас стоит {:?}/{:?}",
            piksi.attack_bonus,
            piksi.damage_dice
        );
        for id in WITH_SENSES {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: чувство с дальностью стоит в книге и обязано стоять в записи"
            );
        }
    }

    /// Семеро спорной пачки (`bestiary-pack-contested-seven`) — последние
    /// сироты бестиария, и у всех семи стат-блок обязан быть ПОЛНЫМ.
    ///
    /// Отдельной пробой, а не общей по файлу, по той же причине, что у пачек
    /// выше: часть полей необязательна у соседей по файлу, а у этих семи
    /// книга даёт их все — кроме послаблений, названных ниже поимённо.
    ///
    /// Все семь холстов теперь подключены по `id`: у Падшей души подписи не
    /// было, а остальные шесть прошли отдельную перелетовку. Проба держит
    /// завершённое состояние и не даёт снова потерять любой `imageAsset`.
    #[test]
    fn pack_contested_seven_have_a_full_stat_block() {
        const SEVEN: [&str; 7] = [
            "padshaya-dusha",
            "kolyuchiy-demon",
            "vozhd-bagbirov",
            "poluogr",
            "podzemny-ork",
            "gniloglaz",
            "polulich",
        ];
        /// У кого в книге есть атака с броском. Полулича тут нет: его «Вой» и
        /// «Вытягивание жизни» — спасброски, а не атаки, и приписанные ему
        /// бонус с костями были бы выдуманными числами.
        const WITH_ATTACK: [&str; 6] = [
            "padshaya-dusha",
            "kolyuchiy-demon",
            "vozhd-bagbirov",
            "poluogr",
            "podzemny-ork",
            "gniloglaz",
        ];
        /// У кого в книге названы языки. Полулича тут нет: у него в книге
        /// стоит прочерк, и пустой список доехал бы до карточки подписью без
        /// значения.
        const WITH_LANGUAGES: [&str; 6] = WITH_ATTACK;
        /// У кого ненулевая наземная скорость. Полулич парит и по земле не
        /// ходит вовсе — «Скорость 0 фт., летая 30 фт.».
        const WITH_GROUND_SPEED: [&str; 6] = WITH_ATTACK;
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in SEVEN {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: чувство с дальностью стоит в книге у всех семи"
            );
        }
        for id in WITH_GROUND_SPEED {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(m.speed_feet > 0, "{id}: не заполнена скорость");
        }
        let polulich = own
            .iter()
            .find(|m| m.id == "polulich")
            .expect("найден выше");
        assert_eq!(
            polulich.speed_feet, 0,
            "у Полулича в книге «Скорость 0 фт., летая 30 фт.» — наземной \
             скорости у него нет, и приписанная это выдуманное число"
        );
        for id in WITH_ATTACK {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: атака стоит в книге — бонус и кости обязаны стоять"
            );
        }
        assert!(
            polulich.attack_bonus.is_none() && polulich.damage_dice.is_none(),
            "у Полулича в книге нет ни одной атаки с броском — приписанные \
             бонус и кости это выдуманные числа, а не недосмотр: сейчас стоит \
             {:?}/{:?}",
            polulich.attack_bonus,
            polulich.damage_dice
        );
        for id in WITH_LANGUAGES {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.languages.as_ref().is_some_and(|l| !l.is_empty()),
                "{id}: язык назван в книге"
            );
        }
        assert!(
            polulich.languages.is_none(),
            "у Полулича в книге на месте языков прочерк — пустой список или \
             выдуманный язык доедут до карточки; сейчас стоит {:?}",
            polulich.languages
        );
        for id in SEVEN {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: принятый холст обязан быть подключён по id; сейчас {:?}",
                m.image_asset
            );
        }
    }

    /// Шестеро пачки G (`bestiary-pack-drow-lizardfolk-and-sea-elders`) — те же
    /// требования к полноте блока, что у соседних пачек, и по той же причине:
    /// записи заведены одной карточкой из одного источника, и пустая графа у
    /// любой доедет до карточки существа.
    ///
    /// Страницы книги, с которых сняты числа (печатный номер — по колонтитулу,
    /// счёт — по `pdfplumber`, разница ровно два):
    ///
    /// - печатная 305 / счёт 307 — Дроу Жрица;
    /// - печатная 306 / счёт 308 — Маг дроу и Элитный воитель дроу;
    /// - печатная 196 / счёт 198 — Людоящер шаман и Король ящеров;
    /// - печатная 256 / счёт 258 — Жрица сахуагинов.
    ///
    /// Блоки найдены не по русскому слову из карточки, а по двуязычному
    /// указателю книги (счёт 353–355, колонки `English Русский`) по английским
    /// именам с холстов — приём записи 169, ровно после того как поиск по
    /// карточному слову один раз дал ноль страниц, а другой раз увёл на чужой
    /// стат-блок. Номера подтверждены вторым источником: алфавитный указатель
    /// блоков статистик (счёт 362–363) называет те же печатные номера.
    ///
    /// **Картинка требуется со всех шести.** Пять холстов несут НАШЕ слово
    /// подписью («Элитный воитель дроу», «Маг дроу», «Людоящер шаман», «Жрица
    /// Сахуагинов», «КОРОЛЬ/КОРОЛЕВА ЯЩЕРОВ»), шестой — `drou-zhritsa.jpg` —
    /// перелетован отдельной карточкой `art-bestiary-relettering-fourteen-canvases`,
    /// и имя богини с него снято. Поэтому все шесть переименованы под `id`,
    /// `imageAsset` проставлен, и в `AWAITING_REDRAWN_ART` эта пачка не вносит
    /// никого — список как был пуст, так и остался.
    ///
    /// Послабление здесь ровно одно, и это факт книги, а не поблажка:
    ///
    /// - **`senses` требуются с пятерых, а не с шести.** У Людоящера шамана в
    ///   строке «Чувства» нет ничего, кроме пассивной Внимательности 14, —
    ///   тогда как у Короля ящеров рядом на той же странице стоит тёмное
    ///   зрение 60 футов. Дать шаману «тёмное зрение как у соседа по странице»
    ///   значило бы подобрать число по соседям, что карточка прямо запрещает,
    ///   поэтому отсутствие проверяется отдельным утверждением, а не молчанием.
    ///
    /// Остальное требуется со всех шести и в книге есть у всех шести: атака с
    /// броском, язык, наземная скорость, особенности и действия.
    #[test]
    fn pack_g_drow_lizardfolk_and_sea_elders_have_a_full_stat_block() {
        const SIX: [&str; 6] = [
            "elitny-voitel-drou",
            "mag-drou",
            "drou-zhritsa",
            "lyudoyashcher-shaman",
            "korol-yashcherov",
            "zhritsa-sahuaginov",
        ];
        /// У кого в книге названо чувство с дальностью. Людоящера шамана тут
        /// нет — см. разбор послабления над пробой.
        const WITH_SENSES: [&str; 5] = [
            "elitny-voitel-drou",
            "mag-drou",
            "drou-zhritsa",
            "korol-yashcherov",
            "zhritsa-sahuaginov",
        ];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in SIX {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(m.speed_feet > 0, "{id}: не заполнена скорость");
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: атака с броском стоит в книге у всех шести — бонус и \
                 кости обязаны стоять"
            );
            assert!(
                m.languages.as_ref().is_some_and(|l| !l.is_empty()),
                "{id}: язык назван в книге у всех шести"
            );
            assert!(!m.traits.is_empty(), "{id}: пустые особенности");
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: холст принят и переименован под id, значит и подключён \
                 обязан быть по id; сейчас стоит {:?}",
                m.image_asset
            );
        }
        for id in WITH_SENSES {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: чувство с дальностью стоит в книге и обязано стоять в записи"
            );
        }
        let shaman = own
            .iter()
            .find(|m| m.id == "lyudoyashcher-shaman")
            .expect("найден выше");
        assert!(
            shaman.senses.is_none(),
            "у Людоящера шамана в книге в строке «Чувства» стоит только \
             пассивная Внимательность 14 — особое чувство тут можно лишь \
             подобрать по соседу по странице, а это карточка запрещает; \
             сейчас стоит {:?}",
            shaman.senses
        );
    }

    /// Пятеро пачки H (`bestiary-pack-modrons`) — Монобот, Дибот, Трибот,
    /// Тетработ и Пентабот — заполнены целиком.
    ///
    /// Книжные блоки стоят на печатных страницах 210–212 (счёт `pdfplumber`
    /// 212–214) и найдены через указатели книги по английским именам, а не по
    /// русскому слову: англо-русский указатель (печатные 351–353, счёт
    /// 353–355) и алфавитный указатель блоков статистик (печатные 360–361,
    /// счёт 362–363).
    ///
    /// Послабления названы поимённо, и каждое — факт книги, а не поблажка:
    ///
    /// - **Мультиатака НЕ требуется с Монобота.** В его блоке её нет вовсе:
    ///   два действия, кинжал и метательное копьё, по одному броску каждое.
    ///   С остальных четверых мультиатака требуется, и у каждого она своя —
    ///   две, три, две-или-четыре и пять атак.
    /// - **`skills` требуются только с двоих.** Строка «Навыки» стоит в книге
    ///   у Тетработа (Внимательность +2) и Пентабота (Внимательность +4). У
    ///   Монобота, Дибота и Трибота её нет вовсе — пассивная Внимательность 10
    ///   и ничего больше. Дать им навык «как у старших» — ровно тот подбор по
    ///   соседям, который карточка запрещает, и проба держит отсутствие
    ///   навыка так же строго, как присутствие.
    /// - **`senses`, `languages`, `traits` и атака требуются со всех пяти**, и
    ///   это тоже факт книги: истинное зрение 120 футов у каждого, язык назван
    ///   у каждого, у каждого обе особенности — «Негибкий рассудок» и
    ///   «Осыпание» нашими словами, — и у каждого есть бросок атаки.
    /// - **Иммунитетов к урону и состояниям проба НЕ требует, и их нет в
    ///   данных.** В книжных блоках этих строк нет ни у одного из пятерых,
    ///   хотя все пятеро — конструкты. Взять их у наших же `shlemonosny-uzhas`
    ///   или `pugalo` значило бы подобрать по соседу целых три графы.
    #[test]
    fn pack_h_modrons_have_a_full_stat_block() {
        const FIVE: [&str; 5] = ["monobot", "dibot", "tribot", "tetrabot", "pentabot"];
        /// У кого в книге есть мультиатака. Монобота тут нет — см. разбор
        /// послаблений над пробой.
        const WITH_MULTIATTACK: [&str; 4] = ["dibot", "tribot", "tetrabot", "pentabot"];
        /// У кого в книге есть строка «Навыки». Трёх младших тут нет — там же.
        const WITH_SKILLS: [&str; 2] = ["tetrabot", "pentabot"];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in FIVE {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(m.speed_feet > 0, "{id}: не заполнена скорость");
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: атака с броском стоит в книге у всех пяти — бонус и \
                 кости обязаны стоять"
            );
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: истинное зрение 120 футов стоит в книге у всех пяти"
            );
            assert!(
                m.languages.as_ref().is_some_and(|l| !l.is_empty()),
                "{id}: язык назван в книге у всех пяти"
            );
            assert!(!m.traits.is_empty(), "{id}: пустые особенности");
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: холст перелетован и переименован под id, значит и \
                 подключён обязан быть по id; сейчас стоит {:?}",
                m.image_asset
            );
        }
        for id in WITH_MULTIATTACK {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.actions.iter().any(|a| a.starts_with("Мультиатака.")),
                "{id}: мультиатака стоит в книге и обязана стоять в записи"
            );
        }
        let monobot = own
            .iter()
            .find(|m| m.id == "monobot")
            .expect("найден выше");
        assert!(
            !monobot.actions.iter().any(|a| a.starts_with("Мультиатака.")),
            "у Монобота в книге мультиатаки нет вовсе — её тут можно лишь \
             подобрать у старшего по странице, а это карточка запрещает"
        );
        for id in WITH_SKILLS {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.skills.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: строка «Навыки» стоит в книге и обязана стоять в записи"
            );
        }
        for id in ["monobot", "dibot", "tribot"] {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.skills.is_none(),
                "у {id} в книге строки «Навыки» нет — навык тут можно лишь \
                 подобрать у старшего по странице, а это карточка запрещает; \
                 сейчас стоит {:?}",
                m.skills
            );
        }
    }

    /// Пятеро пачки H — ПЯТЬ разных стат-блоков, а не один, размноженный с
    /// подставленным именем.
    ///
    /// Проба заведена на названную ловушку, а не на строчки, и ловушка тут
    /// плотнее, чем у Мага дроу с Воителем: эти пятеро стоят в книге подряд на
    /// трёх страницах одного раздела, и сверху у них совпадает почти всё. Все
    /// пятеро — конструкты законно-нейтрального мировоззрения; у всех пятерых
    /// истинное зрение 120 футов и один и тот же язык; у всех пятерых обе
    /// особенности с одинаковыми заголовками; КД у трёх младших 15 и у двух
    /// старших 16; у трёх из пяти первое действие после мультиатаки — «Кулак»
    /// с одними и теми же +3 и 3 (1к4+1).
    ///
    /// Списать один блок в пять записей, поправив имя, — самая дешёвая ошибка
    /// этой пачки, и соседняя проба `pack_h_modrons_have_a_full_stat_block`
    /// её не увидит: у копии все графы непусты.
    ///
    /// Сверять с книгой проба не может и не пытается — книги в git нет. Она
    /// держит ровно то, чем блоки расходятся и чем ценна вся пачка: ряд растёт
    /// по ступеням. Хиты, кости хитов и опасность строго возрастают от младшего
    /// к старшему, а шестёрки характеристик различны. Что хиты сходятся с
    /// костями, независимо стережёт `hit_dice_average_matches_max_hp` по всему
    /// бестиарию сразу.
    #[test]
    fn pack_h_five_modrons_are_five_different_stat_blocks() {
        const LADDER: [&str; 5] = ["monobot", "dibot", "tribot", "tetrabot", "pentabot"];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        let five: Vec<&MonsterTemplate> = LADDER
            .iter()
            .map(|id| {
                own.iter()
                    .find(|m| &m.id == id)
                    .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"))
            })
            .collect();

        // Хиты книги: 5, 11, 16, 22, 32 — строго возрастают.
        let hp: Vec<i32> = five.iter().map(|m| m.max_hp).collect();
        assert_eq!(
            hp,
            vec![5, 11, 16, 22, 32],
            "хиты в книге растут по ступеням: 5, 11, 16, 22, 32"
        );
        // Кости хитов книги: число костей растёт на одну со ступенью, а у
        // старшего меняется и грань — к10 вместо к8, потому что он Большой.
        let dice: Vec<&str> = five.iter().map(|m| m.hit_dice.as_str()).collect();
        assert_eq!(
            dice,
            vec!["1d8+1", "2d8+2", "3d8+3", "4d8+4", "5d10+5"],
            "кости хитов в книге: по одной на ступень, у старшего к10, а не к8"
        );
        // Опасность книги: 1/8, 1/4, 1/2, 1, 2.
        let cr: Vec<&str> = five.iter().map(|m| m.challenge_rating.as_str()).collect();
        assert_eq!(
            cr,
            vec!["1/8", "1/4", "1/2", "1", "2"],
            "опасность в книге удваивается со ступенью: 1/8, 1/4, 1/2, 1, 2"
        );
        // Размер: четверо Средних, старший Большой.
        assert_eq!(
            five[4].size, "Большой",
            "Пентабот в книге Большой, остальные четверо Средние"
        );
        for m in &five[..4] {
            assert_eq!(
                m.size, "Средний",
                "{} в книге Средний, Большой тут только старший",
                m.name
            );
        }
        // `AbilityScores` не выводит `PartialEq`, и выводить его ради одной
        // пробы — трогать модель из-за прибора. Шестёрки сравниваются напрямую.
        let scores = |a: &crate::model::AbilityScores| {
            (
                a.strength,
                a.dexterity,
                a.constitution,
                a.intelligence,
                a.wisdom,
                a.charisma,
            )
        };
        let all: Vec<_> = five.iter().map(|m| scores(&m.abilities)).collect();
        for i in 0..all.len() {
            for j in (i + 1)..all.len() {
                assert_ne!(
                    all[i], all[j],
                    "у {} и {} совпали все шесть характеристик — в книге \
                     расходится каждая пара",
                    five[i].name, five[j].name
                );
            }
        }
        // Интеллект книги — мерка ступени: 4, 6, 9, 10, 10.
        let int: Vec<i32> = five.iter().map(|m| m.abilities.intelligence).collect();
        assert_eq!(
            int,
            vec![4, 6, 9, 10, 10],
            "Интеллект в книге растёт со ступенью: 4, 6, 9, 10, 10"
        );
    }

    /// Семеро пачки F (`bestiary-pack-goblinoid-and-orc-elders`) — Вожак стаи
    /// гноллов, Гнолл Клык, Босс гоблинов, Капитан хобгоблинов, Хобгоблин
    /// военачальник, Боевой вождь орков и Око Ярого — заполнены целиком.
    ///
    /// Книжные блоки стоят на печатных страницах 59, 62, 227, 228, 292 и 293
    /// (счёт `pdfplumber` 61, 64, 229, 230, 294 и 295) и найдены через
    /// указатели книги по английским именам, а не по русскому слову:
    /// англо-русский указатель (печатные 351–353, счёт 353–355) и алфавитный
    /// указатель блоков статистик (печатные 359–361, счёт 361–363).
    ///
    /// Послабления названы поимённо, и каждое — факт книги, а не поблажка:
    ///
    /// - **Мультиатака НЕ требуется с Ока Ярого.** В его блоке её нет вовсе:
    ///   единственное действие — удар копьём, всё остальное у него в
    ///   особенностях (заклинания жреца). С остальных шестерых мультиатака
    ///   требуется.
    /// - **`skills` требуются только с троих.** Строка «Навыки» стоит в книге
    ///   у Босса гоблинов (Скрытность +6), Боевого вождя орков (Запугивание
    ///   +5) и Ока Ярого (Запугивание +3, Религия +1). У двух гноллов и двух
    ///   хобгоблинов её нет вовсе. Дать им навык «как у старшего по странице» —
    ///   ровно тот подбор по соседям, который карточка запрещает, и проба
    ///   держит отсутствие навыка так же строго, как присутствие.
    /// - **`savingThrows` требуются только с троих** — у Гнолла Клыка (Тел,
    ///   Мдр, Хар), Хобгоблина военачальника (Инт, Мдр, Хар) и Боевого вождя
    ///   орков (Сил, Тел, Мдр). У младших в паре строки спасбросков в книге
    ///   нет, и это ровно то, чем старший от младшего отличается.
    /// - **`reactions` требуются только с двоих** — «Перенаправление атаки» у
    ///   Босса гоблинов и «Парирование» у Хобгоблина военачальника. У
    ///   остальных пятерых раздела «Реакции» в книге нет.
    /// - **`senses`, `languages`, `traits` и атака требуются со всех семи**, и
    ///   это тоже факт книги: тёмное зрение 60 футов у каждого, языки названы
    ///   у каждого, у каждого есть хотя бы одна особенность и хотя бы один
    ///   бросок атаки.
    #[test]
    fn pack_f_goblinoid_and_orc_elders_have_a_full_stat_block() {
        const SEVEN: [&str; 7] = [
            "vozhak-stai-gnollov",
            "gnoll-klyk",
            "boss-goblinov",
            "kapitan-hobgoblinov",
            "hobgoblin-voenachalnik",
            "boevoy-vozhd-orkov",
            "oko-yarogo",
        ];
        /// У кого в книге есть мультиатака. Ока Ярого тут нет — см. разбор
        /// послаблений над пробой.
        const WITH_MULTIATTACK: [&str; 6] = [
            "vozhak-stai-gnollov",
            "gnoll-klyk",
            "boss-goblinov",
            "kapitan-hobgoblinov",
            "hobgoblin-voenachalnik",
            "boevoy-vozhd-orkov",
        ];
        /// У кого в книге есть строка «Навыки». Двух гноллов и двух
        /// хобгоблинов тут нет — там же.
        const WITH_SKILLS: [&str; 3] =
            ["boss-goblinov", "boevoy-vozhd-orkov", "oko-yarogo"];
        /// У кого в книге есть строка «Спасброски».
        const WITH_SAVES: [&str; 3] = [
            "gnoll-klyk",
            "hobgoblin-voenachalnik",
            "boevoy-vozhd-orkov",
        ];
        /// У кого в книге есть раздел «Реакции».
        const WITH_REACTIONS: [&str; 2] = ["boss-goblinov", "hobgoblin-voenachalnik"];
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        for id in SEVEN {
            let m = own
                .iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"));
            assert!(!m.name.is_empty(), "{id}: пустое имя");
            assert!(!m.description.is_empty(), "{id}: пустое описание");
            assert!(!m.creature_type.is_empty(), "{id}: пустой тип");
            assert!(!m.size.is_empty(), "{id}: пустой размер");
            assert!(!m.challenge_rating.is_empty(), "{id}: пустая опасность");
            assert!(
                m.max_hp > 0 && m.armor_class > 0,
                "{id}: хиты или КД не заполнены"
            );
            assert!(!m.hit_dice.is_empty(), "{id}: пустые кости хитов");
            assert!(m.speed_feet > 0, "{id}: не заполнена скорость");
            for (label, score) in [
                ("Сила", m.abilities.strength),
                ("Ловкость", m.abilities.dexterity),
                ("Телосложение", m.abilities.constitution),
                ("Интеллект", m.abilities.intelligence),
                ("Мудрость", m.abilities.wisdom),
                ("Харизма", m.abilities.charisma),
            ] {
                assert!(score > 0, "{id}: не заполнена характеристика {label}");
            }
            assert!(
                m.attack_bonus.is_some() && m.damage_dice.is_some(),
                "{id}: атака с броском стоит в книге у всех семи — бонус и \
                 кости обязаны стоять"
            );
            assert!(
                m.senses.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: тёмное зрение 60 футов стоит в книге у всех семи"
            );
            assert!(
                m.languages.as_ref().is_some_and(|l| !l.is_empty()),
                "{id}: языки названы в книге у всех семи"
            );
            assert!(!m.traits.is_empty(), "{id}: пустые особенности");
            assert!(!m.actions.is_empty(), "{id}: пустые действия");
            assert!(
                m.image_asset.as_deref() == Some(&format!("images/{id}.jpg")[..]),
                "{id}: холст переименован под id, значит и подключён обязан \
                 быть по id; сейчас стоит {:?}",
                m.image_asset
            );
        }
        for id in WITH_MULTIATTACK {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.actions.iter().any(|a| a.starts_with("Мультиатака.")),
                "{id}: мультиатака стоит в книге и обязана стоять в записи"
            );
        }
        let oko = own.iter().find(|m| m.id == "oko-yarogo").expect("найден выше");
        assert!(
            !oko.actions.iter().any(|a| a.starts_with("Мультиатака.")),
            "у Ока Ярого в книге мультиатаки нет вовсе — её тут можно лишь \
             подобрать у соседа по странице, а это карточка запрещает"
        );
        for id in WITH_SKILLS {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.skills.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: строка «Навыки» стоит в книге и обязана стоять в записи"
            );
        }
        for id in WITH_SAVES {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.saving_throws.as_ref().is_some_and(|s| !s.is_empty()),
                "{id}: строка «Спасброски» стоит в книге и обязана стоять в записи"
            );
        }
        for id in WITH_REACTIONS {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            assert!(
                m.reactions.as_ref().is_some_and(|r| !r.is_empty()),
                "{id}: раздел «Реакции» стоит в книге и обязан стоять в записи"
            );
        }
        for id in SEVEN {
            let m = own.iter().find(|m| m.id == id).expect("найден выше");
            if !WITH_SKILLS.contains(&id) {
                assert!(
                    m.skills.is_none(),
                    "у {id} в книге строки «Навыки» нет — навык тут можно лишь \
                     подобрать у соседа, а это карточка запрещает; сейчас \
                     стоит {:?}",
                    m.skills
                );
            }
            if !WITH_SAVES.contains(&id) {
                assert!(
                    m.saving_throws.is_none(),
                    "у {id} в книге строки «Спасброски» нет — её тут можно лишь \
                     подобрать у старшего по паре, а это карточка запрещает; \
                     сейчас стоит {:?}",
                    m.saving_throws
                );
            }
            if !WITH_REACTIONS.contains(&id) {
                assert!(
                    m.reactions.is_none(),
                    "у {id} в книге раздела «Реакции» нет — его тут можно лишь \
                     подобрать у соседа, а это карточка запрещает; сейчас \
                     стоит {:?}",
                    m.reactions
                );
            }
        }
    }

    /// Семеро пачки F — СЕМЬ разных стат-блоков, а не один-два, размноженных с
    /// подставленным именем.
    ///
    /// Проба заведена на названную ловушку, а не на строчки. Ловушка тут та
    /// же, что у Мага дроу с Воителем, только втрое: пачка состоит из ТРЁХ пар
    /// «младший и старший одного рода», и внутри каждой пары сверху совпадает
    /// почти всё. У двух гноллов — одна и та же особенность «Буйство» слово в
    /// слово и один язык; у двух хобгоблинов — одинаковые заголовки
    /// «Воинское превосходство» и «Лидерство», один тип, одно мировоззрение,
    /// одни языки; у двух орков — одинаковые «Агрессивный» и «Ярость Ярого»,
    /// один тип и один КД 16 на обоих. Все семеро вдобавок Среднего размера,
    /// кроме Босса гоблинов, все со скоростью 30 футов и тёмным зрением 60.
    ///
    /// Списать блок соседа и поправить имя — самая дешёвая ошибка этой пачки,
    /// и соседняя проба `pack_f_goblinoid_and_orc_elders_have_a_full_stat_block`
    /// её не увидит: у копии все графы непусты.
    ///
    /// Сверять с книгой проба не может и не пытается — книги в git нет. Она
    /// держит ровно то, чем блоки расходятся: ни у одной пары из семи не
    /// совпадают разом хиты, кости хитов и опасность, а шестёрки характеристик
    /// различны у всех семи попарно. Внутри каждой из трёх пар сверх того
    /// названы числами хиты и опасность: это и есть ступень, ради которой
    /// старший заводится рядом с родовой записью SRD. Что хиты сходятся с
    /// костями, независимо стережёт `hit_dice_average_matches_max_hp` по всему
    /// бестиарию сразу.
    #[test]
    fn pack_f_seven_elders_are_seven_different_stat_blocks() {
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        let find = |id: &str| {
            own.iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"))
        };
        let seven: Vec<_> = [
            "vozhak-stai-gnollov",
            "gnoll-klyk",
            "boss-goblinov",
            "kapitan-hobgoblinov",
            "hobgoblin-voenachalnik",
            "boevoy-vozhd-orkov",
            "oko-yarogo",
        ]
        .iter()
        .map(|id| find(id))
        .collect();

        // `AbilityScores` не выводит `PartialEq`, и выводить его ради одной
        // пробы — трогать модель из-за прибора. Шестёрки сравниваются напрямую.
        let scores = |a: &crate::model::AbilityScores| {
            (
                a.strength,
                a.dexterity,
                a.constitution,
                a.intelligence,
                a.wisdom,
                a.charisma,
            )
        };
        let all: Vec<_> = seven.iter().map(|m| scores(&m.abilities)).collect();
        for i in 0..all.len() {
            for j in (i + 1)..all.len() {
                assert_ne!(
                    all[i], all[j],
                    "у {} и {} совпали все шесть характеристик — в книге \
                     расходится каждая пара",
                    seven[i].name, seven[j].name
                );
            }
        }
        let body: Vec<_> = seven
            .iter()
            .map(|m| (m.max_hp, m.hit_dice.as_str(), m.challenge_rating.as_str()))
            .collect();
        for i in 0..body.len() {
            for j in (i + 1)..body.len() {
                assert_ne!(
                    body[i], body[j],
                    "у {} и {} совпали разом хиты, кости хитов и опасность — \
                     это копия блока соседа, а не второй блок",
                    seven[i].name, seven[j].name
                );
            }
        }

        // Три пары «младший и старший одного рода»: числа книги, названные
        // явно. Старший в каждой паре не просто «другой» — он дороже.
        for (younger, older) in [
            ("vozhak-stai-gnollov", "gnoll-klyk"),
            ("kapitan-hobgoblinov", "hobgoblin-voenachalnik"),
            ("oko-yarogo", "boevoy-vozhd-orkov"),
        ] {
            let (y, o) = (find(younger), find(older));
            assert!(
                o.max_hp > y.max_hp,
                "{older} в книге крепче, чем {younger}: {} против {}",
                o.max_hp,
                y.max_hp
            );
            assert_ne!(
                o.challenge_rating, y.challenge_rating,
                "{older} и {younger} в книге расходятся опасностью, а тут она одна"
            );
        }
        assert_eq!(
            [
                find("vozhak-stai-gnollov").max_hp,
                find("gnoll-klyk").max_hp,
                find("boss-goblinov").max_hp,
                find("kapitan-hobgoblinov").max_hp,
                find("hobgoblin-voenachalnik").max_hp,
                find("boevoy-vozhd-orkov").max_hp,
                find("oko-yarogo").max_hp,
            ],
            [49, 65, 21, 39, 97, 93, 45],
            "хиты семерых — числа книги, а не подбор по соседям"
        );
        assert_eq!(
            [
                find("vozhak-stai-gnollov").challenge_rating.as_str(),
                find("gnoll-klyk").challenge_rating.as_str(),
                find("boss-goblinov").challenge_rating.as_str(),
                find("kapitan-hobgoblinov").challenge_rating.as_str(),
                find("hobgoblin-voenachalnik").challenge_rating.as_str(),
                find("boevoy-vozhd-orkov").challenge_rating.as_str(),
                find("oko-yarogo").challenge_rating.as_str(),
            ],
            ["2", "4", "1", "3", "6", "4", "2"],
            "опасность семерых — числа книги, а не подбор по соседям"
        );
    }

    /// Маг дроу и Элитный воитель дроу — ДВА разных стат-блока, а не один с
    /// перекрашенными числами.
    ///
    /// Проба заведена на названную ловушку, а не на строчки, и ловушка тут
    /// такая же, как у Циклопа с Фомором, только ближе: эти двое стоят в книге
    /// не в сотне страниц друг от друга, а в двух колонках ОДНОЙ страницы
    /// (печатная 306, счёт 308). Совпадает у них всё, что видно сверху: оба
    /// «Средний гуманоид (эльф), нейтрально-злой», у обоих скорость 30 футов,
    /// тёмное зрение 120 футов, языки Подземный и Эльфийский, и три
    /// особенности подряд с одинаковыми заголовками — «Наследие фей»,
    /// «Врождённое колдовство», «Чувствительность к солнечному свету».
    ///
    /// Списать одну колонку в обе записи, поправив имя, — самая дешёвая ошибка
    /// этой пачки, и соседняя проба
    /// `pack_g_drow_lizardfolk_and_sea_elders_have_a_full_stat_block` её не
    /// увидит: у копии все графы непусты.
    ///
    /// Поэтому проба держит ровно то, чем колонки расходятся: КД, хиты, кости
    /// хитов, опасность, бонус атаки и все шесть характеристик.
    #[test]
    fn drow_mage_and_elite_warrior_are_two_different_stat_blocks() {
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        let find = |id: &str| {
            own.iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"))
                .clone()
        };
        let mage = find("mag-drou");
        let warrior = find("elitny-voitel-drou");

        assert_eq!((mage.armor_class, warrior.armor_class), (12, 18),
            "КД в книге: у мага 12 (15 с доспехами мага), у воителя 18 (проклёпанная кожа, щит)");
        assert_eq!((mage.max_hp, warrior.max_hp), (45, 71),
            "хиты в книге: у мага 45, у воителя 71");
        assert_eq!(
            (mage.hit_dice.as_str(), warrior.hit_dice.as_str()),
            ("10d8", "11d8+22"),
            "кости хитов в книге: у мага 10к8 без прибавки, у воителя 11к8 + 22"
        );
        assert_eq!(
            (mage.challenge_rating.as_str(), warrior.challenge_rating.as_str()),
            ("7", "5"),
            "опасность в книге: у мага 7 (2900 опыта), у воителя 5 (1800 опыта) — \
             и она выше у того, кто слабее в рукопашной"
        );
        assert_eq!((mage.attack_bonus, warrior.attack_bonus), (Some(2), Some(7)),
            "бонус атаки в книге: посох мага +2, короткий меч воителя +7");
        // `AbilityScores` не выводит `PartialEq`, и выводить его ради одной
        // пробы — трогать модель из-за прибора. Шестёрка чисел сравнивается
        // напрямую.
        let scores = |a: &crate::model::AbilityScores| {
            (
                a.strength,
                a.dexterity,
                a.constitution,
                a.intelligence,
                a.wisdom,
                a.charisma,
            )
        };
        assert_ne!(
            scores(&mage.abilities),
            scores(&warrior.abilities),
            "характеристики расходятся по всем шести: у мага 9/14/10/17/13/12, \
             у воителя 13/18/14/11/13/12"
        );
        assert_eq!(
            (mage.abilities.strength, mage.abilities.intelligence),
            (9, 17),
            "у мага в книге Сила 9 и Интеллект 17"
        );
        assert_eq!(
            (warrior.abilities.strength, warrior.abilities.dexterity),
            (13, 18),
            "у воителя в книге Сила 13 и Ловкость 18"
        );
    }

    /// Циклоп и Фомор — ДВА разных стат-блока, а не один с перекрашенными
    /// числами.
    ///
    /// Проба заведена на названную ловушку, а не на строчки, и ловушка тут
    /// острее, чем у трёх зараз пачки C. Совпадает у этих двоих почти всё, что
    /// видно с первого взгляда: оба «Огромный великан», у обоих КД 14
    /// (природный доспех), скорость 30 футов, бонус атаки +9 и кости урона
    /// 3к8+6, и у обоих первое действие называется «Палица». Блоки при этом
    /// стоят в книге в сотне страниц друг от друга (291 и 296 по счёту
    /// `pdfplumber`, «289» и «294» в колонтитулах) и расходятся по каждому
    /// числу, которое не видно с первого взгляда.
    ///
    /// Скопировать блок Циклопа в Фомора, поправив имя, — самая дешёвая ошибка
    /// этой пачки, и соседняя проба
    /// `pack_d_giants_fey_and_celestials_have_a_full_stat_block` её не увидит:
    /// у копии все графы непусты.
    ///
    /// Сверять с книгой проба не может и не пытается — книги в git нет. Она
    /// держит ровно то, что проверяемо без неё: что пара различна по каждому
    /// числу, которое в книге различается, и что чувства со скрытностью есть
    /// ровно у одного из двух. Число хитов сходится с костями у обоих — это
    /// независимо стережёт `hit_dice_average_matches_max_hp` по всему
    /// бестиарию сразу.
    #[test]
    fn pack_d_two_giants_are_two_different_stat_blocks() {
        let own = super::read_monster_file(
            &bestiary_dir().join(OWN_BESTIARY_FILE),
            MonsterOrigin::Own,
        )
        .expect("прочитать own-creatures.json");
        let find = |id: &str| {
            own.iter()
                .find(|m| m.id == id)
                .unwrap_or_else(|| panic!("{id} нет в own-creatures.json"))
                .clone()
        };
        let tsiklop = find("tsiklop");
        let fomor = find("fomor");

        assert_ne!(
            tsiklop.max_hp, fomor.max_hp,
            "у Циклопа и Фомора в книге разные хиты (138 и 149) — совпавшие значат \
             скопированный блок"
        );
        assert_ne!(
            tsiklop.hit_dice, fomor.hit_dice,
            "у Циклопа и Фомора в книге разные кости хитов (12к12+60 и 13к12+65)"
        );
        assert_ne!(
            tsiklop.challenge_rating, fomor.challenge_rating,
            "у Циклопа и Фомора в книге разная опасность (6 и 8)"
        );
        assert_ne!(
            tsiklop.abilities.wisdom, fomor.abilities.wisdom,
            "у Циклопа Мудрость 6, у Фомора 14 — на этом и держится разница в \
             пассивной Внимательности (8 против 18)"
        );
        assert_ne!(
            tsiklop.passive_perception, fomor.passive_perception,
            "пассивная Внимательность у них расходится вдвое с лишним"
        );

        // Чутьё — то единственное, чем изуродованный Фомор лучше родни: тёмное
        // зрение и навыки стоят у него и отсутствуют у Циклопа, которому один
        // глаз портит даже дневное зрение.
        assert!(
            fomor.senses.as_ref().is_some_and(|s| !s.is_empty()),
            "у Фомора в книге тёмное зрение 120 футов"
        );
        assert!(
            tsiklop.senses.is_none(),
            "у Циклопа в книге нет ни одного чувства с дальностью — приписанное \
             взято у соседа: сейчас стоит {:?}",
            tsiklop.senses
        );
        assert!(
            fomor.skills.as_ref().is_some_and(|s| !s.is_empty()),
            "у Фомора в книге названы Восприятие и Скрытность"
        );
        assert!(
            tsiklop.skills.is_none(),
            "у Циклопа в книге нет строки «Навыки» — приписанные взяты у соседа: \
             сейчас стоит {:?}",
            tsiklop.skills
        );

        // Вторые действия у них разные: Циклоп швыряет камень, Фомор камня не
        // швыряет вовсе (тело не то) и вместо этого бьёт взглядом.
        let has = |m: &super::MonsterTemplate, word: &str| {
            m.actions.iter().any(|a| a.contains(word))
        };
        assert!(has(&tsiklop, "Камень"), "у Циклопа в книге есть бросок камня");
        assert!(
            !has(&fomor, "Камень"),
            "Фомор камней не швыряет — это прямо сказано в книге и отличает его от родни"
        );
        assert!(has(&fomor, "Дурной глаз"), "у Фомора в книге есть Дурной глаз");
        assert!(
            !has(&tsiklop, "Дурной глаз"),
            "Дурной глаз — Фоморов, у Циклопа его нет"
        );
    }

    /// Граница лицензии в одну строку: в файле SRD не должно оказаться наших
    /// существ. Id наших существ — транслитерация русского имени, id SRD —
    /// от английского; пересечение означало бы, что кто-то дописал своё
    /// существо туда, где подпись обещает перевод SRD.
    #[test]
    fn own_creatures_do_not_live_in_the_srd_file() {
        let dir = bestiary_dir();
        let srd = super::read_monster_file(&dir.join(SRD_BESTIARY_FILE), MonsterOrigin::Srd)
            .expect("прочитать bestiary.json");
        let own = super::read_monster_file(&dir.join(OWN_BESTIARY_FILE), MonsterOrigin::Own)
            .expect("прочитать own-creatures.json");
        for m in &own {
            assert!(
                !srd.iter().any(|s| s.id == m.id || s.name == m.name),
                "{} есть и в bestiary.json — там лежит только SRD 5.1",
                m.name
            );
        }
    }

    /// Вторая граница лицензии, и она не про файлы, а про СЛОВА: часть имён
    /// книги владельца в SRD 5.1 отсутствует ВОВСЕ — эти существа в него не
    /// вошли, и имя остаётся за Wizards, как бы ни был написан текст вокруг.
    /// Поэтому наши существа и переименованы все до одного.
    ///
    /// Оговорка про издание: запрет держится на отсутствии имени в SRD, а НЕ
    /// на разделе Product Identity — у издания 2023 года под CC BY, которое мы
    /// и вендорим, такого раздела нет вовсе (см. `reference/ATTRIBUTION.md`,
    /// там же причина, почему взято оно, а не издание 2016 года под OGL).
    /// Проверено по данным: ни одной из основ ниже нет среди имён 317 записей
    /// `bestiary.json`.
    ///
    /// Стережётся именно это, а не «имя не совпадает с SRD»: соседняя проба
    /// `own_creatures_do_not_live_in_the_srd_file` ловит пересечение с нашим же
    /// файлом SRD, а запрещённого имени в SRD как раз и НЕТ — оно приезжает из
    /// книги, мимо всех прежних сторожей. Ловушку уже ловили трижды вручную
    /// (иллитид, газовая спора, гористро): слово встречается в прозе SRD, а
    /// стат-блока нет, и поиск подстрокой на этом обманывается.
    ///
    /// Проба смотрит СЫРОЙ файл, а не разобранные записи: запрещённое имя
    /// одинаково нельзя и в `name`, и в `id`, и в описании, и в тексте
    /// действия, и в поле, которого у схемы ещё нет.
    #[test]
    fn own_creatures_never_use_product_identity_names() {
        /// **ОГОВОРКА, БЕЗ КОТОРОЙ СПИСОК ЧИТАЕТСЯ НЕВЕРНО: две основы из
        /// тридцати трёх держатся НЕ на отсутствии имени в SRD.**
        ///
        /// Обоснование этого сторожа, записанное над пробой, звучит так:
        /// имени нет в SRD 5.1 вовсе, поэтому оно остаётся за Wizards. Для
        /// тридцати одной основы это верно. Для **«юголот»** и **«ультролот»**
        /// — НЕТ: оба слова в SRD 5.1 есть, и лежат они у нас же, в
        /// `src-tauri/rules/rules.json`, в двух местах (проверено счётом
        /// 30.09.2026 — «юголот» 2 вхождения, «ультролот» 1):
        ///
        /// - раздел про планы: «Исчадия, такие как демоны, дьяволы и юголоты,
        ///   обитают на Нижних планах»;
        /// - покровитель колдуна «Исчадие»: «…наиболее могущественных исчадий
        ///   преисподней и балоров; ультролотов и других повелителей
        ///   юголотов» — в одном ряду с Демогоргоном, Оркусом, Асмодеем и
        ///   Мефистофелем.
        ///
        /// **Эти две основы держатся на решении владельца от 25.09.2026 о
        /// собственных именах, а не на лицензии.** Родовое слово нам роздано
        /// по CC BY и запретным словом не является; своими именами трое
        /// названы потому, что так распорядился владелец — Монолот, Дуолот,
        /// Фэйлот, счёт Моно → Дуо → Фэй. Сторож здесь охраняет это решение,
        /// а не границу лицензии.
        ///
        /// **Не «чинить» это снятием основ.** Следующий читающий, сгрепав
        /// `rules.json`, найдёт оба слова, решит, что сторож сломан, и уберёт
        /// их — после чего книжное имя тихо вернётся в наши записи при первой
        /// же дописке. «Юголот» стоит в списке с карточки тринадцати родичей,
        /// «ультролот» добавлена пачкой I; снимать нельзя ни ту, ни другую.
        ///
        /// Оговорка узкая и на остальные тридцать основ не
        /// распространяется: у них обоснование прежнее и проверенное — имени
        /// нет ни среди 317 записей `bestiary.json`, ни в прозе.
        ///
        /// Начала слов: русское имя склоняется («барлгуры», «чазма»,
        /// «греллов»), и сторожить надо основу, а не словоформу.
        ///
        /// Шесть основ («бехолдер» … «слаад») добавлены вместе с шестью
        /// существами Подземья — до них эти имена были недостижимы, потому что
        /// не было записей, куда они могли бы просочиться. «Злобоглаз» тут был
        /// и раньше, дубля ему не заведено. «Халк» проверена перед тем, как
        /// стать основой: слова, начинающегося на неё, в файле нет ни одного,
        /// так что словоформами её расписывать, как «гит», не понадобилось.
        ///
        /// «юань» и «юаньти» в списке БЫЛИ и СНЯТЫ решением владельца
        /// 27.09.2026 («основу юань убираем, используем серпенты, как и
        /// договаривались»). Их завела карточка `bestiary-thirteen-kin` вместе
        /// с тремя серпентами. Снятие ничего не открывает: имя ниши у нас своё
        /// и данное владельцем ещё 23.09.2026 — «Серпенты», — и в
        /// `own-creatures.json` оно уже стоит у всех трёх записей. Сторож
        /// продолжает держать восемнадцать других основ; эта одна перестала
        /// быть запретом, а не перестала быть решённой.
        ///
        /// «граз» добавлена карточкой `bestiary-pack-dinosaurs-and-beasts`
        /// вместе с Шакальником. Страница книги про него — это две трети
        /// рассказа о демоническом повелителе, который шакалов таким сделал, и
        /// его имя (пишется через апостроф, а тот не буква, так что разбивка
        /// ниже даёт кусок «граз») в SRD 5.1 отсутствует вовсе. До этой записи
        /// имя было недостижимо — не было текста, куда ему просочиться; теперь
        /// есть. Русского слова с началом «граз» в файле нет (проверено:
        /// 0 совпадений из 11 187 слов), «грязь» пишется через «я».
        ///
        /// Имени его слуг в списке НЕТ, и это проверка, а не недосмотр: оно
        /// стоит записью `lamia` в самом `bestiary.json`, то есть роздано нам
        /// по CC BY, и основа покрасила бы законное. Та же ловушка, что с
        /// «отродьем» и «тираном» ниже.
        /// «кенку», «кваггот», «трикрин» и «крин» добавлены карточкой
        /// `bestiary-pack-beast-folk` вместе с Пересмешником, Квуготом и
        /// Мантисом. До этих трёх записей имена были недостижимы — не было
        /// текста, куда им просочиться. Проверено по данным перед добавлением
        /// (30.09.2026, 12 553 слова файла): слова, начинающегося с любой из
        /// четырёх, в нём нет ни одного, так что ни одна не красит законное.
        ///
        /// **Чужое имя тут закрыто ДВУМЯ основами, и это не дубль.** Пишется
        /// оно через дефис («три-крин»), а разбивка ниже режет по дефису и
        /// пробелу одинаково: «трикрин» ловит слитное написание, «крин» —
        /// дефисное и любые его словоформы («крина», «кринов», «кринский»).
        /// Ровно та же пара задач, что у «куо-тоа», только там хватило одного
        /// «куо», потому что слитного написания в книге не встречается.
        ///
        /// **Почему «крин» взята, а «три» нет — это счёт по данным, а не
        /// осторожность.** Обе половины имени проверены поимённо 30.09.2026:
        ///
        /// - «крин» — **0 вхождений** во всех трёх живых файлах
        ///   (`own-creatures.json`, `bestiary.json`, `rules.json`), так что
        ///   покрасить ей нечего;
        /// - «три» — **22 вхождения** в `own-creatures.json`, **58** в
        ///   `bestiary.json` и **32** в `rules.json`: это обычное русское
        ///   числительное («три», «трижды», «тридцати»), а в SRD ещё и
        ///   «трицератопс». Основа на неё покрасила бы законное сотней
        ///   совпадений сразу.
        ///
        /// Карточка пачки запрещала брать обе половины. Владелец пересчитал
        /// сам и 30.09.2026 снял запрет с «крин», оставив его на «три»:
        /// запрет держался на данных только во второй половине. Не «чинить»
        /// это обратно и не добавлять «три» — она покраснеет на первой же
        /// живой записи.
        /// «галтиас» добавлена карточкой `bestiary-pack-blights-and-lesser-undead`
        /// вместе с тремя заразами. Тот же случай, что «граз» у Шакальника:
        /// страница книги про зараз — это рассказ о вампире, чей кол пророс
        /// деревом и дал первые семена, и всё происхождение рода названо его
        /// именем. В SRD 5.1 этого имени нет вовсе (зараз там нет ни одной), а
        /// до трёх записей оно было недостижимо — не было текста, куда ему
        /// просочиться; теперь есть, и просочиться оно может именно в
        /// `description`, где происхождение и рассказывается.
        ///
        /// **Взята по счёту, а не по осторожности** (30.09.2026): слова,
        /// начинающегося на «галтиас», нет ни одного ни в `own-creatures.json`
        /// (13 453 слова), ни в `bestiary.json` (57 520), ни в `rules.json`
        /// (63 862), ни в `spells.json` (50 201). Красить ей нечего. Короткая
        /// «галт» дала бы те же нули, но лишний запас тут не нужен: имя не
        /// сокращается, а склоняется («Галтиаса», «Галтиасу»), и основа на
        /// полное имя ловит все словоформы сама.
        ///
        /// Проверена ВПРЫСКОМ, а не снятием: у основы с нулём совпадений снятие
        /// не доказывает ничего — проба останется зелёной и без неё. Урок пачки
        /// J, там же и записан.
        ///
        /// Остальных слов с этих страниц в списке НЕТ, и это проверка, а не
        /// недосмотр. «Зараза», «пугало», «ревенант», «баньши» — либо обычные
        /// русские слова, либо европейский фольклор (фр. *revenant*, ирл. *bean
        /// sídhe*), и все четыре стоят НАШИМИ именами в самих записях: основа на
        /// любое из них покрасила бы собственную запись на первом же прогоне.
        /// Та же логика, что у «Мантиса» и «Серпентов» — своё имя охраняется
        /// тем, что стоит в данных.
        /// «никалот», «ультролот», «ааракокра» и «фламф» добавлены карточкой
        /// `bestiary-pack-yugoloths-and-floaters` вместе с Дуолотом, Фэйлотом,
        /// Аровингом и Флафом.
        ///
        /// **Две из них закрывают НАЙДЕННУЮ ДЫРУ, а не просто добавляют имя.**
        /// Основы «меззолот» и «юголот» стояли здесь и раньше, но родовое слово
        /// начинается не с них: «никалот» и «ультролот» не начинаются ни с
        /// «юголот», ни с «меззолот», и сторож пропустил бы обоих молча. Дыра
        /// открывалась ровно в день, когда этим двоим заводят записи, то есть
        /// сегодня (30.09.2026); разбор сирот назвал её заранее
        /// (`docs/design/bestiary-orphans.md`, п. 4).
        ///
        /// **Проверены ВПРЫСКОМ, а не снятием, и вот почему это здесь
        /// единственный честный способ.** Счёт по трём живым файлам
        /// (30.09.2026, до заведения записей):
        ///
        /// - «никалот» — **0** совпадений в `own-creatures.json` (15 314 слов),
        ///   **0** в `bestiary.json` (57 520), **0** в `rules.json` (63 862);
        /// - «ааракокр» — **0**, **0**, **0** там же;
        /// - «фламф» — **0**, **0**, **0** там же;
        /// - «ультролот» — **0**, **0**, но **1** в `rules.json`: словоформа
        ///   «ультролотов».
        ///
        /// У основы с нулём совпадений снятие не доказывает НИЧЕГО: проба
        /// останется зелёной и с основой, и без неё, и «проверил снятием»
        /// оказалось бы самообманом. Урок пачки J, повторённый пачкой C.
        /// Поэтому каждая из четырёх проверена подстановкой слова с этой
        /// основой в данные: проба обязана упасть списком ровно из одного
        /// слова — тогда сработала именно новая основа, а не соседняя.
        ///
        /// **Единственное совпадение — «ультролотов» в `rules.json` — законно,
        /// и трогать его нельзя.** Это текст SRD 5.1, покровитель колдуна
        /// «Исчадие», и разобран он в оговорке выше: именно из-за него основа
        /// «ультролот» держится на решении владельца об именах, а НЕ на
        /// отсутствии слова в SRD. Ловушкой класса «иллитид / газовая спора /
        /// гористро» этот случай не является, и путать их не надо: там слово
        /// стоит в прозе SRD, но существа в SRD нет вовсе, а здесь нам роздан
        /// по CC BY и сам род. Сторож читает ТОЛЬКО `own-creatures.json`, так
        /// что на эту строку он не смотрит и покраснеть от неё не может — но
        /// знать про неё нужно, иначе следующий читающий примет её за нашу
        /// утечку и пойдёт «чинить» SRD.
        ///
        /// **Основа взята «ааракокр», а НЕ «ааракокра», и это не описка в
        /// карточке, а дефект, пойманный самим впрыском.** Карточка диктовала
        /// «ааракокра» — то есть именительный падеж целиком, вместе с
        /// падежным окончанием «-а». Такая основа ловит «ааракокра» и
        /// «ааракокрами», но проходит мимо «ааракокры», «ааракокр» и
        /// «ааракокрой», а книга пишет именно так («Ааракокры населяют…», «У
        /// ааракокр нет представления…», «Пять ааракокр…»). Впрыск словоформы
        /// «ааракокры» оставил пробу ЗЕЛЁНОЙ — тогда как остальные три основы
        /// на своих словоформах покраснели, — и отсюда взялась короткая
        /// «ааракокр»: она даёт те же 0 совпадений во всех трёх живых файлах и
        /// при этом ловит все словоформы. Снятие этого не показало бы никогда:
        /// проба зелёная и с основой, и без неё.
        ///
        /// Три остальные основы кончаются на согласную и склоняются
        /// приращением («никалота», «ультролотов», «фламфа»), поэтому у них
        /// той же беды нет и удлинять/укорачивать их не нужно.
        ///
        /// Наших имён ни одна из четырёх не ловит, и это счёт, а не обещание:
        /// «монолот», «дуолот», «фэйлот», «флаф», «аровинг» не начинаются ни с
        /// «никалот», ни с «ультролот», ни с «ааракокра», ни с «фламф» —
        /// «флаф» короче «фламф» и расходится с ней на третьей букве. Прогон
        /// по готовому файлу даёт 0 совпадений всеми тридцатью двумя
        /// основами сразу.
        ///
        /// Родового слова этой троицы в списке НЕТ отдельной строкой, потому
        /// что оно уже стоит основой «юголот» с карточки тринадцати. Своего
        /// имени роду владелец не давал, поэтому и в данных его нет: у всех
        /// трёх записей `creatureType` — просто «исчадие», как у Арканулиса,
        /// заведённого раньше из того же раздела книги.
        /// «огриллон», «орог», «нотик» и «демилич» добавлены карточкой
        /// `bestiary-pack-contested-seven` вместе с Полуогром, Подземным
        /// орком, Гнилоглазом и Полуличом. До этих записей имена были
        /// недостижимы — не было текста, куда им просочиться.
        ///
        /// **Проверены ВПРЫСКОМ, а не снятием**, по уроку пачек J, C и I: у
        /// основы с нулём совпадений снятие не доказывает ничего, проба
        /// останется зелёной и без неё. Каждая проверена подстановкой слова с
        /// этой основой в данные по одной за раз — проба обязана упасть
        /// списком ровно из одного слова.
        ///
        /// **«орог» безопасна только потому, что сравнение идёт `starts_with`
        /// по словам.** Разбивка ниже режет строку по всякому небуквенному
        /// символу, и «дорога», «порог», «строго», «пирог» на неё НЕ ловятся:
        /// ни одно из них не НАЧИНАЕТСЯ на «орог». Слова, начинающегося на
        /// «орог», в русском нет. **Если сравнение когда-нибудь сменят на
        /// поиск подстроки — эта основа покраснеет на обычных русских словах,
        /// и снимать надо будет её, а не чинить данные.** Предупреждение
        /// стоит в карточке пачки и повторено здесь, чтобы не потерялось.
        ///
        /// «полуогр» и «полулич» в списке НЕТ, и это проверка, а не
        /// недосмотр: это НАШИ имена, данные владельцем 25.09.2026, и
        /// основа покрасила бы собственные записи на первом же прогоне. То,
        /// что внутрь них попали слова «огр» и «лич», столкновением не
        /// является: оба роздано нам по CC BY записями `ogre` и `lich`.
        ///
        /// Родового слова Гнилоглаза в списке НЕТ отдельной строкой: он родня
        /// Свежевателя, и основа «иллитид» стоит здесь с самого начала.
        // «Лолс» добавлена пачкой G (`bestiary-pack-drow-lizardfolk-and-sea-elders`):
        // заголовок книжного блока читается «Дроу жрица Лолс», и это имя богини
        // Wizards, которого в SRD 5.1 нет вовсе. Счёт 01.10.2026: 0 вхождений в
        // `bestiary.json`, 0 в `rules.json`, 0 в `spells.json`, 0 в
        // `own-creatures.json` — обоснование здесь ровно то же, что у тридцати
        // основ выше, без оговорки «юголот»/«ультролот».
        //
        // Основой, а не словоформой: имя склоняется («Лолс», «Лолс»… а в книге
        // ещё и «Лолт» встречается у переводчиков), и `starts_with` по словам
        // ловит всё сразу. Законного русского слова, начинающегося на «лолс»,
        // нет, так что на обычную прозу она не покраснеет.
        //
        // **Проверена ВПРЫСКОМ, а не снятием** — у основы с нулём совпадений
        // снятие не доказывает ничего (урок записи 169): проба зелёная и с ней,
        // и без неё. Подстановка слова «лолс» в описание Дроу Жрицы роняет
        // пробу списком ровно из одного слова, а снятие ЭТОЙ основы при том же
        // впрыске возвращает зелёное — сработала именно она, а не соседняя.
        //
        // «Йоклол» в список НЕ добавлена: она стоит здесь с карточки тринадцати
        // родичей и уже закрывает демона, которого жрица дроу призывает в
        // книге. Поэтому в записи `drou-zhritsa` призываемая названа
        // описательно — «паучья служанка культа», а не книжным именем.
        //
        // «Дроу» основой НЕ берётся, и это проверка, а не недосмотр: слово
        // законно и роздано нам по CC BY — 4 вхождения в `bestiary.json`,
        // 7 в `rules.json`, 1 в `spells.json` (счёт 01.10.2026). Основа
        // покрасила бы наш же SRD на первом прогоне. Та же ловушка, что
        // «отродье» и «тиран» в разборе ниже.
        //
        // «Модрон» добавлена пачкой H (`bestiary-pack-modrons`): это родовое
        // имя Wizards для пятерых, заведённых нами как Монобот, Дибот, Трибот,
        // Тетработ и Пентабот, и в SRD 5.1 его нет вовсе. Счёт 01.10.2026, до
        // заведения записей: **0** вхождений в `own-creatures.json`, **0** в
        // `bestiary.json`, **0** в `rules.json`, **0** в `spells.json`. До этой
        // пачки имя было недостижимо — не было текста, куда ему просочиться;
        // вместе с записями оно стало достижимым, и потому основа заводится
        // сейчас, а не раньше.
        //
        // Основой «модрон», а не словоформой: имя склоняется («модрона»,
        // «модроном», «модронов», «модроньих»), и `starts_with` по словам
        // ловит все формы сразу. Законного русского слова, начинающегося на
        // «модрон», нет, так что на обычную прозу она не покраснеет.
        //
        // **Основа «дрон» НЕ берётся, и это запрет карточки, а не выбор.** Она
        // поймала бы законное русское слово («дрон», «дроны»), а кроме того —
        // любое наше будущее имя с этим куском внутри. Короткая основа тут
        // ровно та же ловушка, что «гит» против «гитары» в разборе
        // `FORBIDDEN_WORDS` ниже.
        //
        // **Проверена ОБЕИМИ половинами, впрыском и снятием при впрыске** — по
        // уроку пачек J, C и I: у основы с нулём совпадений одно снятие не
        // доказывает ничего, проба зелёная и с основой, и без неё. Впрыск
        // словоформы «модронов» в описание Монобота роняет пробу списком ровно
        // из одного слова; снятие ЭТОЙ основы при том же впрыске возвращает
        // зелёное — значит ловила именно она, а не соседняя. То же проделано
        // словоформой «модроном» с тем же исходом.
        //
        // Названий плана и владыки иерархии в списке НЕТ отдельными основами,
        // и это не недосмотр: оба слова в наши данные не попали ни разу (счёт
        // 01.10.2026 по `own-creatures.json` — 0 и 0), описания пятерых обходят
        // их описательно («шестерёнчатый строй», «шестерёнчатый мир»). Карточка
        // пачки поручает ровно одну основу, и расширять сторожа за её границы
        // Developer не стал — если владелец захочет взять под стражу и эти два
        // имени, это отдельное решение и отдельная строка.
        //
        // «Йеног» и «груумш» добавлены пачкой F
        // (`bestiary-pack-goblinoid-and-orc-elders`). Это личные имена двух
        // божеств Wizards, и в SRD 5.1 их нет вовсе. Счёт 01.10.2026, до
        // заведения записей: **0** вхождений в `own-creatures.json`, **0** в
        // `bestiary.json`, **0** в `rules.json`, **0** в `spells.json` — у
        // обеих основ.
        //
        // Карточка пачки их не поручает, и решение взять их — Developer'а.
        // Довод не «на всякий случай», а достижимость: оба имени стоят в книге
        // ПРЯМО В ЭТИХ стат-блоках. Одно — в книжном имени существа, заведённого
        // у нас как `gnoll-klyk`; второе — и в книжном имени `oko-yarogo`, и в
        // заголовке особенности, которую пришлось переименовать («Ярость
        // Ярого», по имени, которым владелец 25.09.2026 заменил божество на
        // холсте). Семь описаний и три десятка действий переписывались мимо
        // этих двух слов — ровно тот случай, когда имя стало достижимым вместе
        // с записями, как «модрон» выше.
        //
        // **Имя бога гоблиноидов в список НЕ взято, и это проверка, а не
        // недосмотр.** Оно стоит в книге на том же развороте, что Капитан
        // хобгоблинов (печатная 292, счёт 294), но в ПРОЗЕ раздела, а не в
        // стат-блоке кого-либо из семерых: мимо него текст записей не идёт.
        // Это тот же случай, что названия плана и владыки иерархии у пачки H
        // абзацем выше, — отдельное решение владельца и отдельная строка.
        //
        // Основами, а не словоформами: оба имени склоняются («Йеногу»,
        // «Йеногом», «Груумша», «Груумшем»), и `starts_with` по словам ловит
        // все формы сразу. Законного русского слова, начинающегося на «йеног»
        // или «груумш», нет, так что на обычную прозу они не покраснеют.
        //
        // **Проверены ОБЕИМИ половинами, впрыском и снятием при впрыске** — по
        // уроку пачек J, C, I и H: у основы с нулём совпадений одно снятие не
        // доказывает ничего, проба зелёная и с основой, и без неё. Для каждой:
        // впрыск словоформы в описание нашей записи роняет пробу списком ровно
        // из одного слова, а снятие ЭТОЙ основы при том же впрыске возвращает
        // зелёное — значит ловила именно она, а не соседняя.
        const FORBIDDEN_STEMS: [&str; 36] = [
            "гитъянк",
            "гитцера",
            "барлгур",
            "йоклол",
            "чазм",
            "гористро",
            "арканалот",
            "меззолот",
            "юголот",
            "грелл",
            "перитон",
            "злобоглаз",
            "бехолдер",
            "иллитид",
            "куотоа",
            "умбер",
            "халк",
            "слаад",
            "граз",
            "кенку",
            "кваггот",
            "трикрин",
            "крин",
            "галтиас",
            "никалот",
            "ультролот",
            "ааракокр",
            "фламф",
            "огриллон",
            "орог",
            "нотик",
            "демилич",
            "лолс",
            "модрон",
            "йеног",
            "груумш",
        ];
        /// «Гит» основой не берётся — она поймала бы «гитару»; у этого имени
        /// перечислены словоформы целиком.
        ///
        /// «Куо» — по другой причине: имя пишется в два куска («куо-тоа», а в
        /// текстовом слое книги и вовсе «куо тоа»), и разбивка ниже режет его
        /// по дефису и пробелу одинаково, так что основа «куотоа» одна поймала
        /// бы только слитное написание. Слово «куо» целиком — точная ловушка и
        /// на дефис, и на пробел, а законного слова с таким началом в русском
        /// нет, так что рисковать прошедшей основой тут не нужно.
        const FORBIDDEN_WORDS: [&str; 9] = [
            "гит", "гита", "гиту", "гитом", "гите", "гиты", "гитов", "гитский", "куо",
        ];

        // «Отродье», «тиран» и «кнут» в списке НЕТ, и это не недосмотр, а
        // проверка по данным (25.09.2026): все три — общие русские слова, и
        // основа покрасила бы законное, а не чужое. «Отродье» стоит в имени
        // SRD-записи «Отродье вампира», и оно же — в нашем «Отродье
        // серпента»: 1 совпадение в own-creatures.json, 2 словоформы в
        // bestiary.json. «Тиран» ловит наше собственное имя «Глаз-тиран» —
        // 3 словоформы в own-creatures.json («тиран», «тирана», «тираном»), —
        // а в SRD ещё и «тираннозавра». «Кнут» в own-creatures.json сегодня
        // не встречается ни разу, но в SRD это обычное слово («кнут»,
        // «кнутом»), и основа покраснела бы на первом же нашем погонщике.
        // Ловушка того же класса, что «страдание» против Страда: чужое имя
        // здесь — «куо-тоа», и оно уже под стражей выше.

        // «Мантис» в списке НЕТ, и это тоже проверка, а не недосмотр: это
        // НАШЕ имя, данное владельцем 25.09.2026, а сторож ловит возврат
        // чужого слова, а не употребление своего. Основа покрасила бы
        // собственную запись `mantis` на первом же прогоне. Та же логика, что
        // у «Серпентов»: своё имя охраняется тем, что стоит в данных, а не
        // тем, что запрещено.

        // «Троглодит» в списке НЕТ, и это не недосмотр. Имя записи
        // `troglodit` совпадает с чужим написанием сознательно, решением
        // владельца от 24.09.2026: слово собирательное и греческое («живущий в
        // пещере»), Wizards оно не принадлежит, и переименовывать его не во
        // что. Остальные пять существ той же карточки переименованы все до
        // одного. Не «чинить» имя записи обратно и не добавлять сюда основу
        // «троглодит» — она покраснит законную запись.

        let raw = std::fs::read_to_string(bestiary_dir().join(OWN_BESTIARY_FILE))
            .expect("прочитать own-creatures.json")
            .to_lowercase();
        let found: Vec<&str> = raw
            .split(|c: char| !c.is_alphabetic())
            .filter(|w| !w.is_empty())
            .filter(|w| {
                FORBIDDEN_STEMS.iter().any(|s| w.starts_with(s))
                    || FORBIDDEN_WORDS.contains(w)
            })
            .collect();
        assert!(
            found.is_empty(),
            "в наших существах всплыли имена из списка Product Identity: {found:?} — \
             такое имя нельзя взять ни под каким своим текстом"
        );
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

    /// Ключ характеристики в спасбросках — это имя поля `AbilityScores`, по
    /// нему показ берёт русскую подпись. Опечатка в данных не упала бы сама:
    /// поле разбирается как обычная строка, а в карточке вышло бы пустое место.
    #[test]
    fn saving_throw_abilities_are_known_keys() {
        const KEYS: [&str; 6] = [
            "strength",
            "dexterity",
            "constitution",
            "intelligence",
            "wisdom",
            "charisma",
        ];
        for m in load_bundled() {
            for st in m.saving_throws.iter().flatten() {
                assert!(
                    KEYS.contains(&st.ability.as_str()),
                    "у {} спасбросок по неизвестной характеристике {:?}",
                    m.name,
                    st.ability
                );
            }
        }
    }

    /// Пассивная внимательность хранится числом, как её печатает стат-блок, —
    /// и потому у неё есть второй, выводимый источник: 10 + бонус Восприятия
    /// (а без навыка — 10 + модификатор Мудрости). Проба держит их вместе,
    /// чтобы хранимое число не разошлось с характеристиками при добивке
    /// бестиария. Инвариант проверен по всем 315 стат-блокам издания SRD 5.1
    /// CC BY 4.0 — расхождений там нет.
    #[test]
    fn passive_perception_matches_perception_skill() {
        for m in load_bundled() {
            let perception = m
                .skills
                .iter()
                .flatten()
                .find(|s| s.skill == "Восприятие")
                .map(|s| s.bonus)
                .unwrap_or_else(|| (m.abilities.wisdom - 10).div_euclid(2));
            assert_eq!(
                m.passive_perception,
                10 + perception,
                "у {} пассивная внимательность {}, а из Восприятия выходит {}",
                m.name,
                m.passive_perception,
                10 + perception
            );
        }
    }

    /// Кости хитов и `max_hp` — два источника одного факта, и они обязаны
    /// сходиться: среднее по костям это и есть записанное число хитов
    /// (SRD печатает их рядом — «58 (9d8 + 18)»). Проба ловит и опечатку в
    /// костях, и опечатку в хитах, потому что мимо неё не проходит ни одна.
    ///
    /// **Одно послабление, и оно не «у этого существа числа не сошлись», а
    /// «у этого существа правило другое».** У Полулича в книге владельца
    /// стоит «80 (20к4)», тогда как среднее по 20к4 равно 50. Это не опечатка
    /// книги и не наша: у него есть черта «Натура нежити», которая прямым
    /// текстом велит брать на Костях Хитов МАКСИМУМ вместо среднего, и
    /// 20 × 4 = 80 — ровно это. Записать ему 50 значило бы выправить данные
    /// против книги и против его собственной черты; записать «80 (20к4)» и
    /// оставить пробу без оговорки — покрасить её навсегда.
    ///
    /// Послабление держится на ЧЕРТЕ, а не на имени: проба сама проверяет,
    /// что у исключённого существа эта черта в записи есть, и что хиты у него
    /// равны именно максимуму по костям, а не какому угодно числу. Выкинут
    /// черту из записи — послабление перестанет действовать и проба
    /// покраснеет, как и должна. Так что список ниже не «кому можно
    /// разойтись», а «у кого правило максимума», и дописывать в него кого-то
    /// без этой черты нельзя.
    #[test]
    fn hit_dice_average_matches_max_hp() {
        /// Существа, у которых хиты берутся максимумом по костям, а не
        /// средним, — по прямому указанию их собственной черты.
        const MAX_INSTEAD_OF_AVERAGE: [&str; 1] = ["polulich"];
        for m in load_bundled() {
            let (count, rest) = m
                .hit_dice
                .split_once('d')
                .unwrap_or_else(|| panic!("у {} кости хитов {:?} без 'd'", m.name, m.hit_dice));
            let split = rest.find(['+', '-']).unwrap_or(rest.len());
            let (sides, modifier) = rest.split_at(split);
            let count: i32 = count.parse().expect("число костей");
            let sides: i32 = sides.parse().expect("число граней");
            let modifier: i32 = if modifier.is_empty() {
                0
            } else {
                modifier.parse().expect("модификатор")
            };
            if MAX_INSTEAD_OF_AVERAGE.contains(&m.id.as_str()) {
                assert!(
                    m.traits.iter().any(|t| t.starts_with("Натура нежити.")),
                    "у {} снята черта «Натура нежити», на которой держится \
                     послабление — хиты обязаны сойтись со средним по костям, \
                     либо черту надо вернуть",
                    m.name
                );
                assert_eq!(
                    count * sides + modifier,
                    m.max_hp,
                    "у {} хиты берутся максимумом по костям: {} дают {}, \
                     а записано {}",
                    m.name,
                    m.hit_dice,
                    count * sides + modifier,
                    m.max_hp
                );
                continue;
            }
            let average = count * (sides + 1) / 2 + modifier;
            assert_eq!(
                average, m.max_hp,
                "у {} кости {} дают в среднем {average}, а хитов записано {}",
                m.name, m.hit_dice, m.max_hp
            );
        }
    }

    /// Необязательное поле обязано ОТСУТСТВОВАТЬ, а не стоять пустым списком:
    /// пустой массив доедет до карточки и напечатает подпись без значения —
    /// ровно то, что карточка `bestiary-record-full-stat-block` запрещает.
    #[test]
    fn optional_statblock_fields_are_absent_not_empty() {
        let records: Vec<serde_json::Value> = [SRD_BESTIARY_FILE, OWN_BESTIARY_FILE]
            .iter()
            .flat_map(|file| {
                let raw = std::fs::read_to_string(bestiary_dir().join(file))
                    .unwrap_or_else(|e| panic!("прочитать {file}: {e}"));
                serde_json::from_str::<Vec<serde_json::Value>>(&raw).expect("разобрать")
            })
            .collect();
        const OPTIONAL: [&str; 10] = [
            "savingThrows",
            "skills",
            "damageVulnerabilities",
            "damageResistances",
            "damageImmunities",
            "conditionImmunities",
            "senses",
            "languages",
            "reactions",
            "legendaryActions",
        ];
        for rec in records {
            let name = rec["name"].as_str().unwrap_or("?").to_string();
            for key in OPTIONAL {
                match rec.get(key) {
                    None => {}
                    Some(serde_json::Value::Array(items)) if !items.is_empty() => {}
                    Some(other) => panic!(
                        "у {name} поле {key} не отсутствует, а стоит пустым: {other}"
                    ),
                }
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
    /// оригинал целиком на любой запрос — вкладка гоняла все 50 таких через IPC разом.
    ///
    /// **Порог переписан 17.09.2026.** Раньше проба требовала «меньше в 100 раз», и это
    /// работало, пока на диске лежали PNG-мастера по 1.5-3.3 МБ. Теперь картинки бестиария
    /// хранятся ужатыми (JPEG 1024px, ~300 КБ), и отношение к оригиналу схлопнулось до ~36x
    /// не потому, что превью раздулось, а потому что оригинал похудел по нашему же решению.
    /// Отношение к весу исходника — плохая мера: она зависит от того, как сжат мастер.
    /// Сторожим то, что действительно важно: **сколько байт уходит в IPC на одну строку
    /// списка**. Пятьдесят превью по 8 КБ — это 400 КБ на вкладку; отдача оригиналов дала бы
    /// 15 МБ и вернула бы тот самый подвисон.
    #[test]
    fn resized_list_thumbnail_is_orders_of_magnitude_smaller_than_the_original() {
        let images_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("images");
        let path = images_dir.join("giant-octopus.jpg");
        let original_len = std::fs::metadata(&path)
            .expect("giant-octopus.jpg должен быть на диске")
            .len();

        let data_url = super::resize_image_to_data_url(&path, 160).expect("уменьшить картинку");
        let base64_part = data_url
            .strip_prefix("data:image/jpeg;base64,")
            .expect("data URL с ожидаемым префиксом");
        let resized_len = base64_part.len() as u64 * 3 / 4; // грубая оценка байт до base64

        // Абсолютный потолок: столько байт уходит в IPC на одну строку списка.
        assert!(
            resized_len < 32_768,
            "превью списка ({resized_len} байт) должно укладываться в 32 КБ —              пятьдесят таких идут через IPC разом"
        );
        // И оно всё равно обязано быть заметно легче исходника, иначе отдаётся оригинал.
        assert!(
            resized_len * 4 < original_len,
            "превью ({resized_len} байт) слишком близко к оригиналу ({original_len} байт) —              похоже, картинка отдаётся как есть"
        );
    }

    #[test]
    fn resize_preserves_aspect_ratio_and_caps_the_long_side() {
        let images_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bestiary")
            .join("images");
        let path = images_dir.join("giant-octopus.jpg");

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

    use super::{
        cache_file_name, cache_stamp_path, jpeg_bytes_to_data_url, load_cached_or_compute,
        load_cached_or_compute_for_source, resize_image_to_jpeg_bytes, ResizeSemaphore,
    };

    /// Поставить файлу время правки в прошлом. Именно так выглядит подмена,
    /// которую прежний код не ловил: содержимое новое, время — старое. На
    /// Windows для этого файл обязан быть открыт на запись.
    fn set_modified(path: &std::path::Path, when: std::time::SystemTime) {
        let file = std::fs::OpenOptions::new()
            .write(true)
            .open(path)
            .expect("открыть файл на запись, чтобы сдвинуть время правки");
        file.set_times(std::fs::FileTimes::new().set_modified(when))
            .expect("сдвинуть время правки");
    }

    fn modified_at(path: &std::path::Path) -> std::time::SystemTime {
        std::fs::metadata(path)
            .expect("метаданные файла")
            .modified()
            .expect("время правки")
    }

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

    /// Отрицательная проба на дефект карточки
    /// `bug-bestiary-thumbnail-cache-never-invalidates`: владелец 17.09.2026
    /// заменил каталог арта, а приложение показывало превью от 10 сентября —
    /// оборотня чужой работы вместо лежащего в репозитории. Повторяет
    /// сценарий целиком: посчитали превью, подменили исходник, попросили
    /// снова — должны прийти байты НОВОГО.
    ///
    /// Снять починку = убрать `discard_stale_cache_entry` из
    /// `load_cached_or_compute_for_source`; проба краснеет на втором запросе,
    /// возвращая data-URL старых байт.
    #[test]
    fn replacing_the_source_image_invalidates_its_cached_thumbnail() {
        const OLD_THUMB: &[u8] = &[0xFF, 0xD8, 0xFF, b'o', b'l', b'd'];
        const NEW_THUMB: &[u8] = &[0xFF, 0xD8, 0xFF, b'n', b'e', b'w'];

        let dir = unique_temp_dir("stale-source");
        let source_path = dir.join("werewolf.jpg");
        let cache_path = dir.join(cache_file_name(std::ffi::OsStr::new("werewolf.jpg"), 480));
        let semaphore = ResizeSemaphore::new(4);

        std::fs::write(&source_path, b"art of september 10th").expect("записать исходник");
        let first = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            Ok(OLD_THUMB.to_vec())
        })
        .expect("первый запрос должен посчитать превью");
        assert_eq!(first, jpeg_bytes_to_data_url(OLD_THUMB));
        assert!(cache_path.exists(), "первый запрос обязан записать кэш");

        // Тик системных часов Windows — ~15.6 мс; без паузы подмена попадает в
        // то же значение времени правки, что и запись кэша, и проба перестаёт
        // отличать починку от дефекта.
        std::thread::sleep(std::time::Duration::from_millis(50));
        std::fs::write(&source_path, b"repacked art, another creature entirely")
            .expect("подменить исходник");

        let second = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            Ok(NEW_THUMB.to_vec())
        })
        .expect("второй запрос не должен падать");

        assert_eq!(
            second,
            jpeg_bytes_to_data_url(NEW_THUMB),
            "исходник подменён, а пришли байты старого превью — кэш не заметил подмены"
        );

        // И новое превью само стало кэшем: третий запрос за неизменным
        // исходником пересчёта не требует.
        let third = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            panic!("третий запрос за тем же исходником не должен пересчитывать превью")
        })
        .expect("третий запрос должен отдаться из кэша");
        assert_eq!(third, jpeg_bytes_to_data_url(NEW_THUMB));

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Отрицательная проба на долг `debt-thumbnail-cache-ignores-older-source`.
    /// Владелец 23.09.2026 увидел под Квиппером ездовую лошадь, файлы поменяли
    /// содержимым (`fef61a3`) — и 25.09.2026 он увидел её СНОВА. Обмен сохранил
    /// времена правки: у `quipper.jpg` осталось 17.09 00:37, старше обеих
    /// записей кэша, и прежнее условие `source_at > cached_at` не сработало ни
    /// разу.
    ///
    /// Здесь подменяется содержимое ТОЙ ЖЕ ДЛИНЫ, а время правки ставится
    /// заведомо СТАРШЕ записи кэша: размер тут не помощник, ловит подмену
    /// только сравнение времени на несовпадение.
    ///
    /// Снять починку = вернуть в `discard_stale_cache_entry` прежнее
    /// `if source_at > cached_at`; проба краснеет на втором запросе, возвращая
    /// data-URL лошади.
    #[test]
    fn replacing_the_source_with_an_older_modification_time_invalidates_its_cached_thumbnail() {
        const HORSE_THUMB: &[u8] = &[0xFF, 0xD8, 0xFF, b'h', b'o', b'r', b's', b'e'];
        const QUIPPER_THUMB: &[u8] = &[0xFF, 0xD8, 0xFF, b'q', b'u', b'i', b'p', b'p'];
        // Длины намеренно равны — иначе подмену поймал бы размер, и проба
        // перестала бы проверять именно тот случай, из-за которого заведена.
        const HORSE: &[u8] = b"riding horse, 18 september";
        const QUIPPER: &[u8] = b"quipper the fish, 23 sept.";

        assert_eq!(
            HORSE.len(),
            QUIPPER.len(),
            "проба теряет смысл, если длины исходников разошлись"
        );

        let dir = unique_temp_dir("older-source");
        let source_path = dir.join("quipper.jpg");
        let cache_path = dir.join(cache_file_name(std::ffi::OsStr::new("quipper.jpg"), 480));
        let semaphore = ResizeSemaphore::new(4);

        std::fs::write(&source_path, HORSE).expect("записать исходник");
        let first = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            Ok(HORSE_THUMB.to_vec())
        })
        .expect("первый запрос должен посчитать превью");
        assert_eq!(first, jpeg_bytes_to_data_url(HORSE_THUMB));
        assert!(cache_path.exists(), "первый запрос обязан записать кэш");
        assert!(
            cache_stamp_path(&cache_path).exists(),
            "рядом с превью обязан лечь отпечаток исходника"
        );

        // Обмен содержимым С СОХРАНЕНИЕМ ВРЕМЕНИ, как 23.09.2026: время правки
        // отводится на неделю назад, то есть становится старше записи кэша.
        std::fs::write(&source_path, QUIPPER).expect("подменить исходник");
        set_modified(
            &source_path,
            std::time::SystemTime::now() - std::time::Duration::from_secs(7 * 24 * 60 * 60),
        );
        assert!(
            modified_at(&source_path) < modified_at(&cache_path),
            "подготовка пробы: исходник обязан оказаться СТАРШЕ записи кэша"
        );

        let second = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            Ok(QUIPPER_THUMB.to_vec())
        })
        .expect("второй запрос не должен падать");
        assert_eq!(
            second,
            jpeg_bytes_to_data_url(QUIPPER_THUMB),
            "исходник подменён файлом с более СТАРЫМ временем правки, \
             а пришли байты прежнего превью — кэш не заметил подмены"
        );

        // И новое превью само стало кэшем: третий запрос за неизменным
        // исходником пересчёта не требует.
        let third = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            panic!("третий запрос за тем же исходником не должен пересчитывать превью")
        })
        .expect("третий запрос должен отдаться из кэша");
        assert_eq!(third, jpeg_bytes_to_data_url(QUIPPER_THUMB));

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Вторая половина того же долга: время правки не изменилось ВОВСЕ, а
    /// содержимое другое. Такое даёт восстановление из архива, сохраняющего
    /// времена. Ловит это уже не время, а размер — ради него отпечаток и
    /// состоит из двух полей, а не из одного.
    ///
    /// Снять починку = вернуть `if source_at > cached_at`; проба краснеет на
    /// втором запросе.
    #[test]
    fn replacing_the_source_with_a_different_size_at_an_unchanged_time_invalidates_the_thumbnail() {
        const OLD_THUMB: &[u8] = &[0xFF, 0xD8, 0xFF, b'o', b'l', b'd'];
        const NEW_THUMB: &[u8] = &[0xFF, 0xD8, 0xFF, b'n', b'e', b'w'];

        let dir = unique_temp_dir("same-time-other-size");
        let source_path = dir.join("werewolf.jpg");
        let cache_path = dir.join(cache_file_name(std::ffi::OsStr::new("werewolf.jpg"), 160));
        let semaphore = ResizeSemaphore::new(4);

        std::fs::write(&source_path, b"art from the archive").expect("записать исходник");
        let original_time = modified_at(&source_path);

        let first = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            Ok(OLD_THUMB.to_vec())
        })
        .expect("первый запрос должен посчитать превью");
        assert_eq!(first, jpeg_bytes_to_data_url(OLD_THUMB));

        // Другое содержимое другой длины, время правки возвращено прежнее.
        std::fs::write(&source_path, b"another creature entirely, restored from a backup")
            .expect("подменить исходник");
        set_modified(&source_path, original_time);
        assert_eq!(
            modified_at(&source_path),
            original_time,
            "подготовка пробы: время правки обязано остаться прежним"
        );

        let second = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            Ok(NEW_THUMB.to_vec())
        })
        .expect("второй запрос не должен падать");
        assert_eq!(
            second,
            jpeg_bytes_to_data_url(NEW_THUMB),
            "исходник подменён при неизменном времени правки, а пришли байты прежнего превью"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Запись кэша, сделанная до появления отпечатков, доказать свою годность
    /// не может — и считается негодной. Проверяется ровно то, что описано в
    /// шапке `discard_stale_cache_entry`: такая запись пересчитывается ОДИН
    /// раз, получает отпечаток и дальше отдаётся из кэша как обычно.
    #[test]
    fn a_cache_entry_left_without_a_stamp_is_recomputed_once_and_then_reused() {
        const STALE_THUMB: &[u8] = &[0xFF, 0xD8, 0xFF, b'p', b'r', b'e', b'v'];
        const FRESH_THUMB: &[u8] = &[0xFF, 0xD8, 0xFF, b'n', b'o', b'w'];

        let dir = unique_temp_dir("stampless");
        let source_path = dir.join("wolf.jpg");
        let cache_path = dir.join(cache_file_name(std::ffi::OsStr::new("wolf.jpg"), 160));
        let semaphore = ResizeSemaphore::new(4);

        std::fs::write(&source_path, b"wolf art").expect("записать исходник");
        // Запись кэша прежнего формата: превью есть, отпечатка рядом нет.
        std::fs::write(&cache_path, STALE_THUMB).expect("записать запись кэша без отпечатка");
        assert!(!cache_stamp_path(&cache_path).exists());

        let first = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            Ok(FRESH_THUMB.to_vec())
        })
        .expect("первый запрос не должен падать");
        assert_eq!(
            first,
            jpeg_bytes_to_data_url(FRESH_THUMB),
            "запись без отпечатка негодна — её нельзя отдавать как есть"
        );
        assert!(
            cache_stamp_path(&cache_path).exists(),
            "пересчитанная запись обязана получить отпечаток"
        );

        let second = load_cached_or_compute_for_source(&cache_path, &source_path, &semaphore, || {
            panic!("пересчёт обязан быть разовым: второй запрос идёт из кэша")
        })
        .expect("второй запрос должен отдаться из кэша");
        assert_eq!(second, jpeg_bytes_to_data_url(FRESH_THUMB));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cache_file_name_keys_list_and_detail_sizes_separately() {
        let file_name = std::ffi::OsStr::new("giant-octopus.jpg");
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

/// Готовый стат-блок для проб. Живёт на уровне модуля, а не внутри `mod
/// tests`: тем же волком пользуются пробы `lib.rs` — там проверяется, что бой
/// не пишет в лист персонажа, и заводить второй такой же литерал значило бы
/// развести два шаблона, которые обязаны совпадать.
#[cfg(test)]
pub(crate) fn test_monster_template(id: &str) -> MonsterTemplate {
    MonsterTemplate {
        id: id.into(),
        name: id.into(),
        origin: MonsterOrigin::Srd,
        max_hp: 11,
        hit_dice: "2d8+2".into(),
        armor_class: 13,
        speed_feet: 40,
        attack_bonus: Some(4),
        damage_dice: Some("2d4+2".into()),
        challenge_rating: "1/4".into(),
        creature_type: "зверь".into(),
        size: "Средний".into(),
        description: String::new(),
        abilities: AbilityScores {
            strength: 12,
            dexterity: 15,
            constitution: 12,
            intelligence: 3,
            wisdom: 12,
            charisma: 6,
        },
        passive_perception: 13,
        saving_throws: None,
        skills: None,
        damage_vulnerabilities: None,
        damage_resistances: None,
        damage_immunities: None,
        condition_immunities: None,
        senses: None,
        languages: None,
        traits: vec![],
        actions: vec![],
        reactions: None,
        legendary_actions: None,
        image_asset: None,
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
            attack_bonus: Some(5),
            damage_dice: Some("1d6".into()),
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
        let monsters = vec![test_monster_template("wolf")];
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
        assert!(start_combat(&[test_monster_template("wolf")], &[]).is_err());
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

    /// «Душащий ковёр»: бонус атаки есть, костей урона нет. Такая атака обязана
    /// БРОСАТЬСЯ и попадать, но хиты цели не трогать — её 2к6+3 в SRD капают в
    /// начале хода схваченной жертвы, а не от попадания. Проба краснеет и если
    /// снять различение (тогда ковёр вовсе не сможет атаковать), и если
    /// подставить ему чужой урон (тогда у цели убудут хиты).
    #[test]
    fn attack_without_hit_damage_lands_but_leaves_hit_points_alone() {
        let mut landed = 0;
        for _ in 0..60 {
            let mut attacker = combatant("rug", true, 0, 0, 10, 33);
            attacker.damage_dice = None;
            let mut state = state_with(vec![attacker, combatant("target", false, 0, 1, 30, 10)]);

            attack(&mut state, "rug", "target").expect("атака с бонусом обязана бросаться");
            let target = state.combatants.iter().find(|c| c.id == "target").unwrap();
            assert_eq!(
                target.current_hp, target.max_hp,
                "хиты цели не должны меняться: урона при попадании у этой атаки нет"
            );
            let last = state.log.last().expect("строка журнала");
            assert!(last.contains("бросок"), "в журнале должен остаться бросок: {last}");
            if last.contains("попадание") {
                landed += 1;
                assert!(
                    last.contains("урона при попадании нет"),
                    "попадание без урона обязано так и называться: {last}"
                );
            }
        }
        assert!(landed > 0, "за 60 бросков +5 против КД 10 хотя бы одно попадание обязано случиться");
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
