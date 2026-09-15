use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::model::CampaignState;

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
    Ok(state)
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
    state.chaos_factor = 5;
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

fn save_campaign_locked(base: &Path, state: &CampaignState) -> Result<(), String> {
    let _guard = STORAGE_LOCK.lock().unwrap();
    save_campaign_in(base, state)
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

// ── тонкие обёртки для Tauri-команд ──────────────────────────────────────────

pub fn load_active(app: &AppHandle) -> Result<Option<CampaignState>, String> {
    load_active_locked(&app_data_dir(app)?)
}

pub fn save_campaign(app: &AppHandle, state: &CampaignState) -> Result<(), String> {
    save_campaign_locked(&app_data_dir(app)?, state)
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
    use crate::model::{AdventureLogEntry, Character};

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

    #[test]
    fn with_active_locked_concurrent_mutations_both_survive() {
        let base = temp_dir("atomic-write");
        create_campaign_in(&base, "Атомарность".into()).unwrap();

        let base_a = base.clone();
        let base_b = base.clone();
        let a = std::thread::spawn(move || {
            with_active_locked_in(&base_a, |state| {
                state
                    .adventure_log
                    .push(AdventureLogEntry::Custom("A".into()));
                Ok(())
            })
        });
        let b = std::thread::spawn(move || {
            with_active_locked_in(&base_b, |state| {
                state
                    .adventure_log
                    .push(AdventureLogEntry::Custom("B".into()));
                Ok(())
            })
        });
        a.join().unwrap().unwrap();
        b.join().unwrap().unwrap();

        let saved = load_active_in(&base).unwrap().unwrap();
        assert_eq!(
            saved.adventure_log.len(),
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
}
