use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::model::{CampaignState, Character, JournalEntry, TravelState};

/// Поля документа кампании, которыми владеет ФРОНТ, — и весь список сразу.
///
/// Это единственное место, где он записан: добавляешь поле, которым правит
/// интерфейс, — добавляешь сюда, и больше никуда. Всё, чего здесь нет,
/// принадлежит Rust и приезжает с диска, а не из полезной нагрузки.
///
/// Почему список именно такой: эти три поля меняются ТОЛЬКО с фронта и
/// нигде больше — имя кампании правится в шапке (`AppShell`), ростер — на
/// вкладке «Персонажи», дневник — на вкладке «Дневник». `combat` пишет
/// `combat.rs`, `engine` будет писать `gm/mutate.rs`; у фронта нет пути
/// изменить ни то, ни другое, а значит и присылать их незачем.
///
/// **Чужое поле в полезной нагрузке тихо игнорируется, а не даёт ошибку** —
/// и это не снисходительность, а следствие формы типа: serde просто не
/// видит, куда положить `combat`. Ошибку выбрать было нельзя: фронт сегодня
/// шлёт документ ЦЕЛИКОМ (`persist(next)` в `CampaignContext.tsx`), то есть
/// `combat` приезжает в каждом сохранении. Отказ сломал бы каждую запись
/// дневника во время боя. Чужие поля в нагрузке — не требование записать их,
/// а эхо прочитанного снимка, и правильный ответ на эхо — молчание.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontOwnedFields {
    pub campaign_name: String,
    pub characters: Vec<Character>,
    pub journal: Vec<JournalEntry>,
    /// Счётчик пути (`engine-travel-pace`). Фронт им ВЛАДЕЕТ: темп выбирает
    /// мастер, часы и дни двигают его кнопки, и ни одна команда движка этого
    /// поля не касается. Поэтому оно обязано быть здесь — без этой строки
    /// счётчик жил до первой перезагрузки окна и уезжал в `null`, что и поймало
    /// живое окно, а не проба.
    ///
    /// Поле обязательное, как и три выше: фронт, не приславший то, чем владеет,
    /// — это дефект, и честнее отказать записи громко, чем принять её с `null`
    /// и молча стереть пройденный путь.
    pub travel: Option<TravelState>,
}

/// Tauri-команды выполняются на разных потоках, и без этого две почти
/// одновременных загрузки (например, двойной вызов эффекта у React
/// StrictMode в dev) могут обе застать миграцию старого campaign.json
/// незавершённой и разъехаться в гонке за active_campaign.json. Все
/// операции с диском идут под одним замком — для однопользовательского
/// десктоп-приложения сериализация ничего не стоит по производительности.
static STORAGE_LOCK: Mutex<()> = Mutex::new(());

const CAMPAIGNS_DIR: &str = "campaigns";
const ACTIVE_FILE: &str = "active_campaign.json";
/// Формат до мульти-кампании — один файл на всё приложение. Мигрируется
/// один раз в campaigns/<id>.json при первом запуске новой версии.
const LEGACY_FILE: &str = "campaign.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ActivePointer {
    active_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignSummary {
    pub id: String,
    pub name: String,
    pub character_count: usize,
}

/// `pub(crate)` (было приватным) — `combat::thumbnail_cache_dir` переиспользует
/// этот же каталог данных приложения для кэша превью бестиария, см. карточку
/// `bestiary-thumbnail-loading-at-scale`. Логика самой функции не менялась.
pub(crate) fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("не найден каталог данных приложения: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать {dir:?}: {e}"))?;
    Ok(dir)
}

fn campaigns_dir(base: &Path) -> Result<PathBuf, String> {
    let dir = base.join(CAMPAIGNS_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать {dir:?}: {e}"))?;
    Ok(dir)
}

fn campaign_path(base: &Path, id: &str) -> Result<PathBuf, String> {
    Ok(campaigns_dir(base)?.join(format!("{id}.json")))
}

fn read_active_pointer(base: &Path) -> Result<ActivePointer, String> {
    let path = base.join(ACTIVE_FILE);
    if !path.exists() {
        return Ok(ActivePointer::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("не удалось прочитать {path:?}: {e}"))?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

fn write_active_pointer(base: &Path, ptr: &ActivePointer) -> Result<(), String> {
    let path = base.join(ACTIVE_FILE);
    let raw = serde_json::to_string_pretty(ptr).map_err(|e| format!("сериализация: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("не удалось записать {path:?}: {e}"))
}

fn read_campaign_file(path: &Path) -> Result<CampaignState, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("не удалось прочитать {path:?}: {e}"))?;
    let mut state: CampaignState =
        serde_json::from_str(&raw).map_err(|e| format!("повреждён {path:?}: {e}"))?;
    for character in state.characters.iter_mut() {
        character.migrate_legacy_gold();
        character.migrate_legacy_spell_slots();
    }
    migrate_legacy_adventure_log(&mut state, &raw);
    Ok(state)
}

/// Движок приключения снесён целиком (`engine-wipe-adventure-and-oracle`), и
/// вместе с ним из `CampaignState` ушло поле `adventureLog`. Само поле в старых
/// файлах серде просто игнорирует — но две записи из пяти в нём писал ЧЕЛОВЕК:
/// «Своё действие» — текст игрока целиком, и «Оракул» — его вопрос вместе с
/// выпавшим ответом. Они переезжают в дневник, остальные три (сцена, выбор,
/// бросок) — вывод снесённого движка и переезжать им некуда.
///
/// Текст переносится ровно таким, каким игрок видел его на экране, вместе с той
/// же подписью вида: дневник — не то же место, и без подписи вопрос оракула
/// читался бы как чья-то реплика.
///
/// **Времени у записей приключения не было никогда**, и выдумывать его нельзя:
/// `timestamp` остаётся пустым. Дневник сортирует по нему строкой и показывает
/// такие записи последними, подписывая «без даты», — см. `JournalPage`.
///
/// Однократность держится сама, без флага миграции: первое же сохранение
/// кампании пишет состояние уже без `adventureLog`, и переносить становится
/// нечего. Второй раз те же строки в дневник не попадут.
fn migrate_legacy_adventure_log(state: &mut CampaignState, raw: &str) {
    let Ok(document) = serde_json::from_str::<serde_json::Value>(raw) else {
        return;
    };
    let Some(entries) = document.get("adventureLog").and_then(|v| v.as_array()) else {
        return;
    };

    for entry in entries {
        let label = match entry.get("kind").and_then(|k| k.as_str()) {
            Some("custom") => "Своё действие",
            Some("oracle") => "Оракул",
            _ => continue,
        };
        let Some(text) = entry.get("text").and_then(|t| t.as_str()) else {
            continue;
        };
        state.journal.push(JournalEntry {
            id: generate_id(),
            timestamp: String::new(),
            text: format!("{label}: {text}"),
        });
    }
}

pub fn generate_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let suffix: u32 = rand::thread_rng().gen();
    format!("{nanos:x}-{suffix:x}")
}

/// Переносит старый campaign.json (одна кампания на всё приложение) в новую
/// схему ровно один раз. Не трогает ничего, если миграция уже случилась
/// (есть активный указатель) или переносить нечего.
fn migrate_legacy_if_needed(base: &Path) -> Result<(), String> {
    let pointer = read_active_pointer(base)?;
    if pointer.active_id.is_some() {
        return Ok(());
    }
    let legacy_path = base.join(LEGACY_FILE);
    if !legacy_path.exists() {
        return Ok(());
    }

    let mut state = read_campaign_file(&legacy_path)?;
    let id = generate_id();
    state.id = id.clone();
    if state.campaign_name.trim().is_empty() {
        state.campaign_name = "Кампания".into();
    }
    save_campaign_in(base, &state)?;
    write_active_pointer(base, &ActivePointer { active_id: Some(id) })?;
    let _ = fs::rename(&legacy_path, base.join("campaign.json.migrated"));
    Ok(())
}

fn load_active_in(base: &Path) -> Result<Option<CampaignState>, String> {
    migrate_legacy_if_needed(base)?;
    let pointer = read_active_pointer(base)?;
    let Some(id) = pointer.active_id else {
        return Ok(None);
    };
    let path = campaign_path(base, &id)?;
    if !path.exists() {
        // Активная кампания удалена снаружи — не виснуть на битой ссылке.
        write_active_pointer(base, &ActivePointer::default())?;
        return Ok(None);
    }
    Ok(Some(read_campaign_file(&path)?))
}

fn save_campaign_in(base: &Path, state: &CampaignState) -> Result<(), String> {
    let path = campaign_path(base, &state.id)?;
    let raw = serde_json::to_string_pretty(state).map_err(|e| format!("сериализация: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("не удалось записать {path:?}: {e}"))
}

fn list_campaigns_in(base: &Path) -> Result<Vec<CampaignSummary>, String> {
    migrate_legacy_if_needed(base)?;
    let dir = campaigns_dir(base)?;
    let mut summaries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("не удалось прочитать {dir:?}: {e}"))? {
        let entry = entry.map_err(|e| format!("{e}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(state) = read_campaign_file(&path) {
            summaries.push(CampaignSummary {
                id: state.id.clone(),
                name: state.campaign_name.clone(),
                character_count: state.characters.len(),
            });
        }
    }
    Ok(summaries)
}

fn create_campaign_in(base: &Path, name: String) -> Result<CampaignState, String> {
    let mut state = CampaignState::default();
    state.id = generate_id();
    state.campaign_name = name;
    save_campaign_in(base, &state)?;
    write_active_pointer(base, &ActivePointer { active_id: Some(state.id.clone()) })?;
    Ok(state)
}

fn switch_campaign_in(base: &Path, id: String) -> Result<CampaignState, String> {
    let path = campaign_path(base, &id)?;
    if !path.exists() {
        return Err(format!("кампания {id:?} не найдена"));
    }
    let state = read_campaign_file(&path)?;
    write_active_pointer(base, &ActivePointer { active_id: Some(id) })?;
    Ok(state)
}

fn delete_campaign_in(base: &Path, id: &str) -> Result<(), String> {
    let path = campaign_path(base, id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("не удалось удалить {path:?}: {e}"))?;
    }
    let pointer = read_active_pointer(base)?;
    if pointer.active_id.as_deref() == Some(id) {
        write_active_pointer(base, &ActivePointer::default())?;
    }
    Ok(())
}

// ── залоченные операции на явном base_dir — тестируются напрямую потоками ───

fn load_active_locked(base: &Path) -> Result<Option<CampaignState>, String> {
    let _guard = STORAGE_LOCK.lock().unwrap();
    load_active_in(base)
}

fn list_campaigns_locked(base: &Path) -> Result<Vec<CampaignSummary>, String> {
    let _guard = STORAGE_LOCK.lock().unwrap();
    list_campaigns_in(base)
}

fn create_campaign_locked(base: &Path, name: String) -> Result<CampaignState, String> {
    let _guard = STORAGE_LOCK.lock().unwrap();
    create_campaign_in(base, name)
}

fn switch_campaign_locked(base: &Path, id: String) -> Result<CampaignState, String> {
    let _guard = STORAGE_LOCK.lock().unwrap();
    switch_campaign_in(base, id)
}

fn delete_campaign_locked(base: &Path, id: &str) -> Result<(), String> {
    let _guard = STORAGE_LOCK.lock().unwrap();
    delete_campaign_in(base, id)
}

/// Читает активную кампанию, применяет мутацию и сохраняет — всё под одним
/// удержанием `STORAGE_LOCK`, без окна между чтением и записью, в котором
/// два параллельных вызова могли бы затереть мутацию друг друга.
fn with_active_locked_in<F>(base: &Path, mutate: F) -> Result<CampaignState, String>
where
    F: FnOnce(&mut CampaignState) -> Result<(), String>,
{
    let _guard = STORAGE_LOCK.lock().unwrap();
    let mut state = load_active_in(base)?.ok_or_else(|| "нет активной кампании".to_string())?;
    mutate(&mut state)?;
    save_campaign_in(base, &state)?;
    Ok(state)
}

/// Запись с фронта: документ читается с диска, и из присланного берутся
/// ТОЛЬКО поля `FrontOwnedFields`. Всё остальное — `combat`, а с движком и
/// `engine` — остаётся таким, каким лежало на диске.
///
/// Раньше здесь писался целый присланный документ, и любая запись с фронта
/// несла с собой его снимок чужих полей: игрок нажимал «В дневник» со
/// снимком, снятым до начала боя, — и бой пропадал. Это запись 136 в
/// `tasks/DONE.md`, только в масштабе документа, а не одного персонажа.
///
/// Второго пути записи не заводится: это тот же `with_active_locked_in`,
/// которым ходят команды боя.
fn save_front_owned_in(base: &Path, fields: FrontOwnedFields) -> Result<CampaignState, String> {
    with_active_locked_in(base, |state| {
        state.campaign_name = fields.campaign_name;
        state.characters = fields.characters;
        state.journal = fields.journal;
        state.travel = fields.travel;
        Ok(())
    })
}

// ── тонкие обёртки для Tauri-команд ──────────────────────────────────────────

pub fn load_active(app: &AppHandle) -> Result<Option<CampaignState>, String> {
    load_active_locked(&app_data_dir(app)?)
}

// Записи целого документа наружу из `storage` больше нет: обёртки
// `save_campaign` (`AppHandle`) и `save_campaign_locked` сняты вместе с
// последним вызовом — боевые команды ушли на `with_active_locked`. Целый
// документ пишет только `save_campaign_in` внутри этого файла, и только там,
// где терять нечего: миграция старого файла (`migrate_legacy_if_needed`),
// создание новой кампании (`create_campaign_in`) и сам
// `with_active_locked_in` под удержанием замка.

pub fn save_front_owned(app: &AppHandle, fields: FrontOwnedFields) -> Result<(), String> {
    save_front_owned_in(&app_data_dir(app)?, fields).map(|_| ())
}

pub fn list_campaigns(app: &AppHandle) -> Result<Vec<CampaignSummary>, String> {
    list_campaigns_locked(&app_data_dir(app)?)
}

pub fn create_campaign(app: &AppHandle, name: String) -> Result<CampaignState, String> {
    create_campaign_locked(&app_data_dir(app)?, name)
}

pub fn switch_campaign(app: &AppHandle, id: String) -> Result<CampaignState, String> {
    switch_campaign_locked(&app_data_dir(app)?, id)
}

pub fn delete_campaign(app: &AppHandle, id: &str) -> Result<(), String> {
    delete_campaign_locked(&app_data_dir(app)?, id)
}

pub fn with_active_locked<F>(app: &AppHandle, mutate: F) -> Result<CampaignState, String>
where
    F: FnOnce(&mut CampaignState) -> Result<(), String>,
{
    with_active_locked_in(&app_data_dir(app)?, mutate)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Character, CombatState, Combatant};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dnd-master-storage-test-{name}-{}", generate_id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn fresh_install_has_no_active_campaign() {
        let base = temp_dir("fresh");
        assert!(load_active_in(&base).unwrap().is_none());
        assert!(list_campaigns_in(&base).unwrap().is_empty());
    }

    #[test]
    fn create_campaign_becomes_active_and_listed() {
        let base = temp_dir("create");
        let state = create_campaign_in(&base, "Затерянные пещеры".into()).unwrap();
        assert!(!state.id.is_empty());

        let active = load_active_in(&base).unwrap().unwrap();
        assert_eq!(active.id, state.id);
        assert_eq!(active.campaign_name, "Затерянные пещеры");

        let list = list_campaigns_in(&base).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Затерянные пещеры");
    }

    #[test]
    fn two_campaigns_are_independent_and_switchable() {
        let base = temp_dir("switch");
        let a = create_campaign_in(&base, "Кампания А".into()).unwrap();
        let b = create_campaign_in(&base, "Кампания Б".into()).unwrap();

        // create_campaign делает новую активной
        assert_eq!(load_active_in(&base).unwrap().unwrap().id, b.id);

        let switched = switch_campaign_in(&base, a.id.clone()).unwrap();
        assert_eq!(switched.id, a.id);
        assert_eq!(load_active_in(&base).unwrap().unwrap().id, a.id);

        assert_eq!(list_campaigns_in(&base).unwrap().len(), 2);
    }

    #[test]
    fn deleting_active_campaign_clears_pointer() {
        let base = temp_dir("delete-active");
        let a = create_campaign_in(&base, "Ненадолго".into()).unwrap();
        delete_campaign_in(&base, &a.id).unwrap();

        assert!(load_active_in(&base).unwrap().is_none());
        assert!(list_campaigns_in(&base).unwrap().is_empty());
    }

    #[test]
    fn deleting_inactive_campaign_keeps_active_pointer() {
        let base = temp_dir("delete-inactive");
        let a = create_campaign_in(&base, "Активная".into()).unwrap();
        let b = create_campaign_in(&base, "Неактивная".into()).unwrap();
        switch_campaign_in(&base, a.id.clone()).unwrap();

        delete_campaign_in(&base, &b.id).unwrap();

        assert_eq!(load_active_in(&base).unwrap().unwrap().id, a.id);
        assert_eq!(list_campaigns_in(&base).unwrap().len(), 1);
    }

    #[test]
    fn legacy_single_campaign_file_migrates_once() {
        let base = temp_dir("legacy");
        let legacy = CampaignState {
            campaign_name: "Старое сохранение".into(),
            ..Default::default()
        };
        fs::write(
            base.join(LEGACY_FILE),
            serde_json::to_string_pretty(&legacy).unwrap(),
        )
        .unwrap();

        let active = load_active_in(&base).unwrap().unwrap();
        assert_eq!(active.campaign_name, "Старое сохранение");
        assert!(!active.id.is_empty(), "мигрировавшая кампания должна получить id");
        assert!(!base.join(LEGACY_FILE).exists(), "старый файл должен быть убран с дороги");
        assert!(base.join("campaign.json.migrated").exists());

        // Повторная миграция не создаёт вторую кампанию из того же старого файла.
        assert_eq!(list_campaigns_in(&base).unwrap().len(), 1);
    }

    #[test]
    fn corrupted_legacy_file_fails_migration_without_touching_it() {
        let base = temp_dir("legacy-corrupt");
        fs::write(base.join(LEGACY_FILE), "это не json").unwrap();

        let result = load_active_in(&base);
        assert!(
            result.is_err(),
            "повреждённый campaign.json должен вернуть ошибку, а не пустую кампанию"
        );
        assert!(
            base.join(LEGACY_FILE).exists(),
            "оригинальный campaign.json не должен быть тронут при неудачной миграции"
        );
        assert!(!base.join("campaign.json.migrated").exists());
    }

    /// characters-known-spells-honest-name — ГЛАВНАЯ проба карточки, и она
    /// идёт по НАСТОЯЩЕМУ сохранению, а не по собранному в тесте литералу:
    /// `tests/fixtures/legacy-campaign-known-spells.json` — это файл живой
    /// кампании «Vox Machina» (4 персонажа, 15 заклинаний на всех), записанный
    /// приложением ДО переименования поля, скопированный байт в байт.
    ///
    /// Путь тот же, каким кампанию открывает приложение (`load_active_in` →
    /// `read_campaign_file`), а не `serde_json::from_str` в обход: молча
    /// потерять заклинания можно как раз между этими двумя.
    ///
    /// Отрицательная проба: снять `#[serde(alias = "knownSpells")]` с
    /// `Character::castable_spells` — краснеет именно она, а не общий разбор
    /// файла: кампания читается «успешно», просто у всех четверых пусто.
    #[test]
    fn legacy_campaign_with_known_spells_keeps_every_spell_after_rename() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("legacy-campaign-known-spells.json");
        let raw = fs::read_to_string(&fixture).expect("прочитать настоящее старое сохранение");
        assert!(
            raw.contains("\"knownSpells\""),
            "фикстура обязана нести СТАРОЕ имя поля — иначе проба сторожит пустоту"
        );

        let base = temp_dir("legacy-known-spells");
        let id = "18d2261063107fb4-b886b8a7";
        fs::write(campaign_path(&base, id).unwrap(), &raw).unwrap();
        write_active_pointer(&base, &ActivePointer { active_id: Some(id.into()) }).unwrap();

        let state = load_active_in(&base).unwrap().expect("кампания должна открыться");
        assert_eq!(state.campaign_name, "Vox Machina");
        assert_eq!(state.characters.len(), 4);

        // Списки выписаны числом и поимённо: «не пусто» пропустило бы обрезку.
        let expected: [(&str, &[&str]); 4] = [
            (
                "Дарин Светоч",
                &["shield-of-faith", "sanctuary", "command", "bless", "cure-wounds", "protection-from-evil-and-good"],
            ),
            ("Дарнвел", &["protection-from-evil-and-good", "sanctuary"]),
            ("Финдл Шестерёнка", &["shield", "mage-armor", "magic-missile", "detect-magic"]),
            ("Вэйт Данкил", &["healing-word", "entangle", "speak-with-animals", "goodberry"]),
        ];
        for (name, spells) in expected {
            let character = state
                .characters
                .iter()
                .find(|c| c.name == name)
                .unwrap_or_else(|| panic!("персонаж «{name}» пропал из старого сохранения"));
            assert_eq!(
                character.castable_spells, spells,
                "у персонажа «{name}» заклинания потерялись при переименовании поля"
            );
        }

        // Книга волшебника — третья сущность, и своё имя она не меняла:
        // переезд `knownSpells` не имеет права её задеть.
        let wizard = state
            .characters
            .iter()
            .find(|c| c.name == "Финдл Шестерёнка")
            .expect("волшебник");
        assert_eq!(wizard.spellbook.len(), 6, "книга волшебника должна остаться целой");
    }

    /// bestiary-record-full-stat-block — кампания с боем, НАЧАТЫМ ДО
    /// расширения записи существа, обязана открыться без потерь.
    ///
    /// Почему проба нужна, хотя в сохранении нет ни одного нового поля: это и
    /// есть проверяемое утверждение. Боец (`Combatant`) — плоский снимок
    /// (хиты, КД, бонус атаки, кости урона), а не ссылка на `MonsterTemplate`
    /// и не его копия, поэтому расширение стат-блока сохранений не касается.
    /// Проба сторожит именно эту развязку: если кто-нибудь однажды положит
    /// шаблон существа внутрь боя, старые бои перестанут читаться, и красной
    /// станет эта строка, а не жалоба игрока.
    ///
    /// Отрицательная проба: добавить в `Combatant` поле без `#[serde(default)]`
    /// — фикстура перестанет разбираться, и краснеет именно она.
    #[test]
    fn legacy_campaign_with_combat_in_progress_opens_after_stat_block_grew() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("legacy-campaign-combat-in-progress.json");
        let raw = fs::read_to_string(&fixture).expect("прочитать сохранение с боем");

        let base = temp_dir("legacy-combat-in-progress");
        let id = "18d2261063107fb4-b886b8a7";
        fs::write(campaign_path(&base, id).unwrap(), &raw).unwrap();
        write_active_pointer(&base, &ActivePointer { active_id: Some(id.into()) }).unwrap();

        let state = load_active_in(&base).unwrap().expect("кампания должна открыться");
        let combat = state.combat.expect("бой должен уцелеть, а не обнулиться");

        assert_eq!(combat.round, 2);
        assert_eq!(combat.current_turn_index, 1);
        assert_eq!(combat.combatants.len(), 3);
        assert_eq!(combat.turn_order.len(), 3);
        assert_eq!(combat.log.len(), 3);
        assert!(!combat.finished);

        // Раненый волк — именно то, что теряется молча: хиты бойца это
        // состояние боя, а не число из шаблона существа.
        let wounded = combat
            .combatants
            .iter()
            .find(|c| c.id == "monster-wolf-0")
            .expect("раненый волк на месте");
        assert_eq!(wounded.name, "Волк");
        assert!(wounded.is_monster);
        assert_eq!((wounded.current_hp, wounded.max_hp), (4, 11));
        assert_eq!(wounded.armor_class, 13);
        assert_eq!(wounded.damage_dice.as_deref(), Some("2d4+2"));
        assert_eq!(wounded.initiative, 17);
    }

    /// engine-wipe-adventure-and-oracle — ГЛАВНАЯ проба карточки, и она идёт по
    /// тому же НАСТОЯЩЕМУ сохранению «Vox Machina», записанному приложением до
    /// сноса: в файле лежат `currentSceneId`, `adventureLog` из 17 записей и
    /// `chaosFactor` — полей, которых в модели больше нет.
    ///
    /// Спрашивается ровно две вещи, и обе — предмет приёмки карточки:
    /// 1. кампания вообще открывается, а персонажи, деньги и дневник целы;
    /// 2. четыре записи оракула, которые писал игрок, доехали до дневника.
    ///
    /// Отрицательная проба: снять вызов `migrate_legacy_adventure_log` в
    /// `read_campaign_file` — краснеет именно эта проба и именно на записях
    /// оракула; общий снимок состояния (персонажи, дневник, заклинания) при
    /// этом остаётся зелёным, потому что ломается только перенос.
    #[test]
    fn legacy_campaign_with_adventure_fields_opens_and_keeps_what_the_player_wrote() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("legacy-campaign-known-spells.json");
        let raw = fs::read_to_string(&fixture).expect("прочитать настоящее старое сохранение");
        for field in ["\"currentSceneId\"", "\"adventureLog\"", "\"chaosFactor\""] {
            assert!(
                raw.contains(field),
                "фикстура обязана нести снесённое поле {field} — иначе проба сторожит пустоту"
            );
        }

        let base = temp_dir("legacy-adventure-fields");
        let id = "18d2261063107fb4-b886b8a7";
        fs::write(campaign_path(&base, id).unwrap(), &raw).unwrap();
        write_active_pointer(&base, &ActivePointer { active_id: Some(id.into()) }).unwrap();

        let state = load_active_in(&base)
            .expect("старое сохранение обязано открываться, а не падать на лишних полях")
            .expect("кампания должна найтись");

        // Персонажи, деньги и дневник — главный риск карточки.
        assert_eq!(state.campaign_name, "Vox Machina");
        assert_eq!(state.characters.len(), 4);
        assert_eq!(state.characters[0].name, "Дарин Светоч");
        assert!(
            state.characters.iter().any(|c| !c.inventory.is_empty()),
            "инвентарь не должен потеряться вместе с приключением"
        );

        // Пять записей дневника были в файле, четыре приехали из оракула.
        let own: Vec<&str> = state
            .journal
            .iter()
            .filter(|e| !e.timestamp.is_empty())
            .map(|e| e.text.as_str())
            .collect();
        assert_eq!(own, ["Test", "Test", "Test", "Test", "Test"]);

        let migrated: Vec<&str> = state
            .journal
            .iter()
            .filter(|e| e.timestamp.is_empty())
            .map(|e| e.text.as_str())
            .collect();
        assert_eq!(
            migrated,
            [
                "Оракул: «За углом есть ловушка?» (50/50) → Нет (бросок 80)",
                "Оракул: «За углом есть ловушка?» (50/50) → Да (бросок 46)",
                "Оракул: «За углом есть ловушка?» (Почти невозможно) → Да (бросок 22). Случайное событие: Везение — в вашу пользу",
                "Оракул: «За углом есть ловушка?» (Почти наверняка) → Да (бросок 11). Случайное событие: Внимание переключается на NPC",
            ],
            "вопросы оракула писал игрок — они обязаны пережить снос движка"
        );

        // Сцены, выборы и броски — вывод снесённого движка, им в дневнике не место.
        assert!(
            !state.journal.iter().any(|e| e.text.contains("Тропа выводит отряд")),
            "текст сцены — не запись игрока и в дневник не переезжает"
        );
        assert_eq!(state.journal.len(), 9);
    }

    /// Вторая загрузка того же файла не должна удваивать перенесённые записи, а
    /// после сохранения `adventureLog` в файле не остаётся вовсе.
    #[test]
    fn adventure_log_migrates_exactly_once_and_leaves_no_trace_after_save() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("legacy-campaign-known-spells.json");
        let raw = fs::read_to_string(&fixture).unwrap();

        let base = temp_dir("legacy-adventure-once");
        let id = "18d2261063107fb4-b886b8a7";
        fs::write(campaign_path(&base, id).unwrap(), &raw).unwrap();
        write_active_pointer(&base, &ActivePointer { active_id: Some(id.into()) }).unwrap();

        let state = load_active_in(&base).unwrap().unwrap();
        assert_eq!(state.journal.len(), 9);
        save_campaign_in(&base, &state).unwrap();

        let saved_raw = fs::read_to_string(campaign_path(&base, id).unwrap()).unwrap();
        assert!(
            !saved_raw.contains("adventureLog"),
            "сохранение поверх старого файла обязано унести поле приключения совсем"
        );
        assert_eq!(
            load_active_in(&base).unwrap().unwrap().journal.len(),
            9,
            "повторная загрузка не должна перенести те же записи второй раз"
        );
    }

    #[test]
    fn with_active_locked_concurrent_mutations_both_survive() {
        let base = temp_dir("atomic-write");
        create_campaign_in(&base, "Атомарность".into()).unwrap();

        let base_a = base.clone();
        let base_b = base.clone();
        let entry = |text: &str| JournalEntry {
            id: generate_id(),
            timestamp: String::new(),
            text: text.into(),
        };
        let a = std::thread::spawn(move || {
            with_active_locked_in(&base_a, |state| {
                state.journal.push(entry("A"));
                Ok(())
            })
        });
        let b = std::thread::spawn(move || {
            with_active_locked_in(&base_b, |state| {
                state.journal.push(entry("B"));
                Ok(())
            })
        });
        a.join().unwrap().unwrap();
        b.join().unwrap().unwrap();

        let saved = load_active_in(&base).unwrap().unwrap();
        assert_eq!(
            saved.journal.len(),
            2,
            "обе параллельные мутации должны быть сохранены, а не одна затёрта другой"
        );
    }

    #[test]
    fn switching_to_unknown_campaign_fails() {
        let base = temp_dir("unknown");
        assert!(switch_campaign_in(&base, "no-such-id".into()).is_err());
    }

    /// characters-currency-denominations: кампания, сохранённая до появления
    /// номиналов, содержит персонажа со старым `"gold": 250` и без поля
    /// `coins` — загрузка должна перенести это в золотые монеты, не упасть.
    #[test]
    fn loading_campaign_migrates_legacy_character_gold() {
        let base = temp_dir("legacy-gold");
        let path = campaign_path(&base, "legacy").unwrap();
        fs::write(
            &path,
            r#"{
                "id": "legacy",
                "campaignName": "Старая кампания",
                "characters": [{
                    "id": "hero", "name": "Герой", "race": "", "class": "", "level": 1,
                    "abilities": {
                        "strength": 10, "dexterity": 10, "constitution": 10,
                        "intelligence": 10, "wisdom": 10, "charisma": 10
                    },
                    "maxHp": 10, "currentHp": 10, "armorClass": 10,
                    "conditions": [], "inventory": [], "gold": 250
                }]
            }"#,
        )
        .unwrap();

        let state = read_campaign_file(&path).unwrap();
        assert_eq!(state.characters.len(), 1);
        assert_eq!(state.characters[0].coins.gold, 250);
        assert_eq!(state.characters[0].coins.copper, 0);
        assert_eq!(state.characters[0].gold, 0);
    }

    /// Регрессия: React StrictMode в dev вызывает эффект монтирования дважды,
    /// и до общего замка два почти одновременных первых запуска обе видели
    /// "миграции не было" и мигрировали legacy-файл параллельно — вторая
    /// попытка читала уже переименованный (первой) legacy-файл как пустой и
    /// затирала активный указатель на пустую кампанию без персонажей.
    #[test]
    fn concurrent_first_launch_migrates_legacy_exactly_once() {
        let base = temp_dir("race");
        let legacy = CampaignState {
            campaign_name: "Гонка на старте".into(),
            characters: vec![Character {
                id: "hero".into(),
                name: "Единственный герой".into(),
                ..Default::default()
            }],
            ..Default::default()
        };
        fs::write(
            base.join(LEGACY_FILE),
            serde_json::to_string_pretty(&legacy).unwrap(),
        )
        .unwrap();

        let base_a = base.clone();
        let base_b = base.clone();
        let a = std::thread::spawn(move || load_active_locked(&base_a));
        let b = std::thread::spawn(move || load_active_locked(&base_b));
        let result_a = a.join().unwrap().unwrap();
        let result_b = b.join().unwrap().unwrap();

        for result in [result_a, result_b] {
            let state = result.expect("оба потока должны увидеть смигрировавшую кампанию");
            assert_eq!(state.campaign_name, "Гонка на старте");
            assert_eq!(state.characters.len(), 1, "персонаж не должен потеряться в гонке");
        }

        assert_eq!(
            list_campaigns_locked(&base).unwrap().len(),
            1,
            "гонка не должна была породить вторую, пустую кампанию"
        );
    }

    /// Бой в разгаре — ровно то состояние, которым фронт не владеет и о
    /// котором в его снимке может не быть ни слова.
    fn combat_in_progress() -> CombatState {
        CombatState {
            grid_width: 12,
            grid_height: 10,
            turn_order: vec!["monster-wolf-0".into()],
            combatants: vec![Combatant {
                id: "monster-wolf-0".into(),
                name: "Волк".into(),
                is_monster: true,
                current_hp: 4,
                max_hp: 11,
                armor_class: 13,
                initiative: 17,
                ..Default::default()
            }],
            current_turn_index: 0,
            round: 3,
            log: vec!["Волк ранен".into()],
            finished: false,
        }
    }

    /// engine-save-campaign-stops-writing-others — ГЛАВНАЯ проба карточки.
    ///
    /// Сценарий целиком из жизни: бой начат командой бэкенда, игрок уходит на
    /// вкладку «Дневник» и добавляет запись. Фронт шлёт документ, собранный из
    /// снимка своего рендера, и боя в этом снимке нет вовсе.
    ///
    /// Отрицательная проба: вернуть `save_campaign` записью целого присланного
    /// документа (`save_campaign_in(base, &state)` вместо
    /// `save_front_owned_in`) — и строка `бой обязан уцелеть` краснеет:
    /// `state.combat` приходит `None` и ложится на диск поверх живого боя.
    #[test]
    fn front_save_with_a_stale_snapshot_cannot_wipe_the_combat_it_never_owned() {
        let base = temp_dir("front-owned-combat");
        let created = create_campaign_in(&base, "Поход".into()).unwrap();

        let mut with_combat = created.clone();
        with_combat.combat = Some(combat_in_progress());
        save_campaign_in(&base, &with_combat).unwrap();

        // Снимок фронта: имя, персонажи, дневник — и ничего о бое.
        save_front_owned_in(
            &base,
            FrontOwnedFields {
                campaign_name: "Поход".into(),
                characters: vec![Character {
                    id: "hero".into(),
                    name: "Герой".into(),
                    ..Default::default()
                }],
                journal: vec![JournalEntry {
                    id: "note".into(),
                    timestamp: "2026-09-23T10:00:00Z".into(),
                    text: "Записал у костра".into(),
                }],
                travel: None,
            },
        )
        .unwrap();

        let after = load_active_in(&base).unwrap().expect("кампания на месте");
        let combat = after.combat.expect("бой обязан уцелеть: фронт им не владеет");
        assert_eq!(combat.round, 3, "ход боя не должен откатиться");
        assert_eq!(combat.combatants[0].current_hp, 4, "хиты раненого волка не должны воскреснуть");

        // И ровно то, чем фронт владеет, записаться обязано — иначе сужение
        // превратилось бы в отказ от записи.
        assert_eq!(after.journal.len(), 1);
        assert_eq!(after.journal[0].text, "Записал у костра");
        assert_eq!(after.characters.len(), 1);
    }

    /// engine-travel-pace: счётчик пути — поле ФРОНТА, и запись с фронта обязана
    /// его сохранять. Без этой строки в `FrontOwnedFields` счётчик жил только до
    /// перезагрузки окна: живое окно показывало 11 часов и 33 мили, а на диске
    /// лежал `travel: null`. Поймало это окно, а не проба, — поэтому проба
    /// появилась здесь.
    ///
    /// Отрицательная проба: убрать `state.travel = fields.travel` в
    /// `save_front_owned_in` — строка «счётчик обязан уцелеть» краснеет, называя
    /// `None` вместо одиннадцати часов.
    #[test]
    fn front_save_keeps_the_travel_counter_it_owns() {
        let base = temp_dir("front-owned-travel");
        create_campaign_in(&base, "Поход".into()).unwrap();

        save_front_owned_in(
            &base,
            FrontOwnedFields {
                campaign_name: "Поход".into(),
                characters: vec![],
                journal: vec![],
                travel: Some(TravelState {
                    pace: "fast".into(),
                    difficult_terrain: false,
                    hours_today: 11,
                    day_marches: 2,
                    half_day_marches: 1,
                    lost_days: 1,
                }),
            },
        )
        .unwrap();

        let after = load_active_in(&base).unwrap().expect("кампания на месте");
        let travel = after.travel.expect("счётчик обязан уцелеть: фронт им владеет");
        assert_eq!(travel.pace, "fast");
        assert_eq!(travel.hours_today, 11);
        assert_eq!(travel.day_marches, 2);
        assert_eq!(travel.half_day_marches, 1);
        assert_eq!(travel.lost_days, 1);
    }

    /// Обратная сторона: кампания, в которую фронт ещё не ходил, остаётся без
    /// счётчика — `null`, а не нули. Иначе «в путь не выходили» стало бы
    /// неотличимо от «вышли и прошли ноль часов».
    #[test]
    fn front_save_without_travel_keeps_the_campaign_without_a_counter() {
        let base = temp_dir("front-owned-travel-none");
        create_campaign_in(&base, "Поход".into()).unwrap();

        save_front_owned_in(
            &base,
            FrontOwnedFields {
                campaign_name: "Поход".into(),
                characters: vec![],
                journal: vec![],
                travel: None,
            },
        )
        .unwrap();

        assert!(load_active_in(&base).unwrap().unwrap().travel.is_none());
    }

    /// Ответ на вопрос «что будет, если фронт прислал чужое поле»: оно тихо
    /// игнорируется, и это свойство ТИПА, а не проверка в теле команды —
    /// `FrontOwnedFields` некуда положить `combat`, и serde его пропускает.
    #[test]
    fn payload_field_the_front_does_not_own_is_ignored_and_not_an_error() {
        let raw = r#"{
            "id": "campaign-1",
            "campaignName": "Поход",
            "characters": [],
            "journal": [],
            "travel": null,
            "combat": {"gridWidth": 12, "gridHeight": 10, "combatants": [], "turnOrder": [],
                       "currentTurnIndex": 0, "round": 7, "log": [], "finished": false}
        }"#;
        let fields: FrontOwnedFields =
            serde_json::from_str(raw).expect("чужое поле не должно быть ошибкой разбора");
        assert_eq!(fields.campaign_name, "Поход");
    }

    /// Вторая половина DoD карточки `save_campaign`: «когда появится `engine` —
    /// и его». Появился — и запись с фронта его не видит точно так же, как не
    /// видит боя.
    ///
    /// Отрицательная проба та же, что у боя: вернуть запись целого присланного
    /// документа — и строка «движок обязан уцелеть» краснеет.
    #[test]
    fn front_save_with_a_stale_snapshot_cannot_wipe_the_engine_either() {
        let base = temp_dir("front-owned-engine");
        let created = create_campaign_in(&base, "Поход".into()).unwrap();

        let mut with_engine = created.clone();
        crate::gm::scene::create_scene(
            &mut with_engine,
            "Подземный зал".into(),
            "Найти выход".into(),
            vec![],
            vec![],
        )
        .unwrap();
        save_campaign_in(&base, &with_engine).unwrap();

        save_front_owned_in(
            &base,
            FrontOwnedFields {
                campaign_name: "Поход".into(),
                characters: vec![],
                journal: vec![JournalEntry {
                    id: "note".into(),
                    timestamp: "2026-09-23T10:00:00Z".into(),
                    text: "Записал у костра".into(),
                }],
                travel: None,
            },
        )
        .unwrap();

        let after = load_active_in(&base).unwrap().expect("кампания на месте");
        let engine = after.engine.expect("движок обязан уцелеть: фронт им не владеет");
        assert_eq!(engine.scene().expect("сцена на месте").location, "Подземный зал");
        assert_eq!(engine.adventure_log().len(), 1, "лог приключения не должен обнулиться");
        assert_eq!(engine.history().len(), 1);
        assert_eq!(after.journal.len(), 1, "а дневник, которым фронт владеет, записан");
    }

    /// engine-combat-commands-read-write-window — ГЛАВНАЯ проба карточки.
    ///
    /// Сценарий целиком из жизни: в окне идёт бой, мастер параллельно создаёт
    /// сцену движком. Боевая команда успела прочитать документ ДО сцены —
    /// и её запись не имеет права положить свой снимок поверх.
    ///
    /// Проба стоит на уровне `storage`, а не команд: тело команды требует
    /// `AppHandle`, которого в тестах нет, поэтому здесь воспроизведена ровно
    /// та последовательность вызовов, которой ходит команда — сначала прежняя
    /// (два захвата), потом нынешняя (`with_active_locked_in`).
    ///
    /// Отрицательная половина выполняется здесь же, а не описана словами:
    /// первый блок — это прежняя форма боевой команды, и он ТЕРЯЕТ сцену.
    /// Если он однажды перестанет её терять, значит окна нет и в двух захватах
    /// — и проба перестала проверять то, ради чего написана.
    #[test]
    fn engine_write_inside_the_window_is_lost_by_two_locks_and_survives_under_one() {
        let scene = |state: &mut CampaignState| {
            crate::gm::scene::create_scene(
                state,
                "Подземный зал".into(),
                "Найти выход".into(),
                vec![],
                vec![],
            )
            .map(|_| ())
        };

        // ── отрицательная половина: прежняя форма, два захвата с окном ──
        let base = temp_dir("combat-two-locks");
        let created = create_campaign_in(&base, "Поход".into()).unwrap();
        let mut with_combat = created.clone();
        with_combat.combat = Some(combat_in_progress());
        save_campaign_in(&base, &with_combat).unwrap();

        let mut snapshot = load_active_in(&base).unwrap().unwrap(); // ← чтение боя
        with_active_locked_in(&base, scene).unwrap(); //              ← движок в окне
        crate::combat::apply_damage(snapshot.combat.as_mut().unwrap(), "monster-wolf-0", 1).unwrap();
        save_campaign_in(&base, &snapshot).unwrap(); //               ← запись боя целым документом

        let after = load_active_in(&base).unwrap().unwrap();
        assert!(
            after.engine.is_none(),
            "два захвата обязаны терять сцену — иначе эта проба ничего не проверяет"
        );

        // ── нынешняя форма: чтение, мутация и запись под одним удержанием ──
        let base = temp_dir("combat-one-lock");
        let created = create_campaign_in(&base, "Поход".into()).unwrap();
        let mut with_combat = created.clone();
        with_combat.combat = Some(combat_in_progress());
        save_campaign_in(&base, &with_combat).unwrap();

        with_active_locked_in(&base, scene).unwrap();
        with_active_locked_in(&base, |state| {
            let combat = state.combat.as_mut().ok_or("бой не начат")?;
            crate::combat::apply_damage(combat, "monster-wolf-0", 1)
        })
        .unwrap();

        let after = load_active_in(&base).unwrap().unwrap();
        let engine = after.engine.expect("сцена движка обязана уцелеть: бой ей не владеет");
        assert_eq!(engine.scene().expect("сцена на месте").location, "Подземный зал");
        assert_eq!(engine.history().len(), 1, "история движка не должна откатиться");
        // И ровно то, чем владеет бой, записано — иначе окно закрыли отказом
        // от записи.
        let combat = after.combat.expect("бой обязан уцелеть");
        assert_eq!(combat.combatants[0].current_hp, 3, "урон боя должен лечь на диск");
        assert_eq!(combat.round, 3, "ход боя не должен откатиться");
    }

    /// Та же пара, но в двух потоках: наблюдаемое поведение из критериев
    /// тестирования — после хода боя сцена на месте, после создания сцены бой
    /// не откатился, в каком бы порядке замок их ни пропустил.
    #[test]
    fn combat_and_engine_writes_in_parallel_both_survive() {
        let base = temp_dir("combat-engine-parallel");
        let created = create_campaign_in(&base, "Поход".into()).unwrap();
        let mut with_combat = created.clone();
        with_combat.combat = Some(combat_in_progress());
        save_campaign_in(&base, &with_combat).unwrap();

        let base_combat = base.clone();
        let base_engine = base.clone();
        let combat_thread = std::thread::spawn(move || {
            with_active_locked_in(&base_combat, |state| {
                let combat = state.combat.as_mut().ok_or("бой не начат")?;
                crate::combat::apply_damage(combat, "monster-wolf-0", 1)
            })
        });
        let engine_thread = std::thread::spawn(move || {
            with_active_locked_in(&base_engine, |state| {
                crate::gm::scene::create_scene(
                    state,
                    "Подземный зал".into(),
                    "Найти выход".into(),
                    vec![],
                    vec![],
                )
                .map(|_| ())
            })
        });
        combat_thread.join().unwrap().unwrap();
        engine_thread.join().unwrap().unwrap();

        let after = load_active_in(&base).unwrap().unwrap();
        assert_eq!(
            after.engine.expect("сцена обязана уцелеть").scene().unwrap().location,
            "Подземный зал"
        );
        assert_eq!(
            after.combat.expect("бой обязан уцелеть").combatants[0].current_hp,
            3,
            "урон боя не должен быть затёрт записью движка"
        );
    }

}
