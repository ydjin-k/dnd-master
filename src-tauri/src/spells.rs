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

    const KNOWN_SPELLCASTING_CLASSES: [&str; 8] = [
        "classes-bard",
        "classes-cleric",
        "classes-druid",
        "classes-paladin",
        "classes-ranger",
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

    /// Официальные списки SRD 5.1 («Paladin Spells» / «Ranger Spells»). Полузаклинатели
    /// заговоров не получают, а по `HALF_CASTER_SLOTS` до уровня 5 доходят только до 2 круга,
    /// поэтому кругов выше здесь и не ожидается.
    fn assert_class_list(class_id: &str, level: u8, expected: &[&str]) {
        let mut actual: Vec<String> = load_bundled()
            .into_iter()
            .filter(|s| s.level == level && s.classes.iter().any(|c| c == class_id))
            .map(|s| s.id)
            .collect();
        actual.sort();
        let mut expected: Vec<String> = expected.iter().map(|s| s.to_string()).collect();
        expected.sort();
        assert_eq!(actual, expected, "список {class_id} круга {level} разошёлся с SRD");
    }

    #[test]
    fn paladin_spell_list_matches_srd() {
        assert_class_list(
            "classes-paladin",
            1,
            &[
                "bless",
                "command",
                "cure-wounds",
                "detect-evil-and-good",
                "detect-magic",
                "detect-poison-and-disease",
                "divine-favor",
                "heroism",
                "protection-from-evil-and-good",
                "purify-food-and-drink",
                "shield-of-faith",
            ],
        );
        assert_class_list(
            "classes-paladin",
            2,
            &[
                "aid",
                "branding-smite",
                "find-steed",
                "lesser-restoration",
                "locate-object",
                "magic-weapon",
                "protection-from-poison",
                "zone-of-truth",
            ],
        );
    }

    #[test]
    fn ranger_spell_list_matches_srd() {
        assert_class_list(
            "classes-ranger",
            1,
            &[
                "alarm",
                "animal-friendship",
                "cure-wounds",
                "detect-magic",
                "detect-poison-and-disease",
                "fog-cloud",
                "goodberry",
                "hunters-mark",
                "jump",
                "longstrider",
                "speak-with-animals",
            ],
        );
        assert_class_list(
            "classes-ranger",
            2,
            &[
                "animal-messenger",
                "barkskin",
                "darkvision",
                "find-traps",
                "lesser-restoration",
                "locate-animals-or-plants",
                "locate-object",
                "pass-without-trace",
                "protection-from-poison",
                "silence",
                "spike-growth",
            ],
        );
    }
}
