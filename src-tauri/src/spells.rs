use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Spell {
    pub id: String,
    pub name: String,
    pub level: u8,
    pub school: String,
    pub casting_time: String,
    pub range: String,
    pub components: String,
    pub duration: String,
    pub concentration: bool,
    pub ritual: bool,
    pub classes: Vec<String>,
    pub description: String,
    pub damage_dice: Option<String>,
    pub damage_type: Option<String>,
    pub attack_roll: bool,
    pub saving_throw: Option<String>,
}

/// Заклинания — из bundle.resources в сборке, из src-tauri/rules в dev (тот же приём,
/// что и для rules.json/моделей OCR).
fn spells_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("rules")
            .join("spells.json"));
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("не найден каталог ресурсов приложения: {e}"))?;
    Ok(resource_dir.join("rules").join("spells.json"))
}

pub fn load_spells(app: &AppHandle) -> Result<Vec<Spell>, String> {
    let path = spells_path(app)?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("не удалось прочитать {path:?}: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("повреждён {path:?}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const KNOWN_SPELLCASTING_CLASSES: [&str; 6] = [
        "classes-bard",
        "classes-cleric",
        "classes-druid",
        "classes-sorcerer",
        "classes-warlock",
        "classes-wizard",
    ];

    fn load_bundled() -> Vec<Spell> {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("rules")
            .join("spells.json");
        let raw = std::fs::read_to_string(&path).expect("прочитать rules/spells.json");
        serde_json::from_str(&raw).expect("распарсить spells.json")
    }

    #[test]
    fn bundled_spells_json_parses_and_is_not_empty() {
        let spells = load_bundled();
        assert!(!spells.is_empty(), "spells.json не должен быть пустым");
        assert!(
            spells.len() >= 60,
            "ожидал заговоры и заклинания 1 уровня шести классов (60-90 записей), получил {}",
            spells.len()
        );
    }

    #[test]
    fn every_spell_class_is_a_known_spellcasting_class() {
        for spell in load_bundled() {
            assert!(!spell.classes.is_empty(), "у заклинания {} нет классов", spell.id);
            for class_id in &spell.classes {
                assert!(
                    KNOWN_SPELLCASTING_CLASSES.contains(&class_id.as_str()),
                    "заклинание {} ссылается на неизвестный класс {}",
                    spell.id,
                    class_id
                );
            }
        }
    }

    #[test]
    fn every_spell_level_is_within_the_currently_bundled_range() {
        // Круги 6-9 ещё не добавлены (см. карточку `rules-spells-data-level-6-9`) —
        // уровень выше 5 здесь почти наверняка означает опечатку в данных, а не
        // осознанное новое заклинание.
        for spell in load_bundled() {
            assert!(
                spell.level <= 5,
                "заклинание {} имеет уровень {} — круги 6-9 в spells.json ещё не добавлены",
                spell.id,
                spell.level
            );
        }
    }
}
