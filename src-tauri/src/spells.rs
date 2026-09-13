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
        // Круги 0-9 — вся официальная шкала SRD (см. карточку `rules-spells-data-level-6-9`,
        // закрыта) — уровень выше 9 здесь почти наверняка означает опечатку в данных, а не
        // осознанное новое заклинание.
        for spell in load_bundled() {
            assert!(
                spell.level <= 9,
                "заклинание {} имеет уровень {} — кругов выше 9 в SRD не существует",
                spell.id,
                spell.level
            );
        }
    }

    /// Официальные списки SRD 5.1 («Paladin Spells» / «Ranger Spells»). Полузаклинатели
    /// заговоров не получают; по `HALF_CASTER_SLOTS` 2 круг приходит на 5 уровне, 3 — на 9-м,
    /// а 4 и 5 круги лежат за нынешним потолком 12 и в файле не размечены.
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
        // rules-paladin-third-circle-spell-list: ячейки 3 круга приходят на 9 уровне, и с
        // подъёмом потолка до 12 список перестал быть мёртвым. Снятая метка у любого из
        // шести краснит именно этот состав, а не общий счёт заклинаний в файле.
        assert_class_list(
            "classes-paladin",
            3,
            &[
                "create-food-and-water",
                "daylight",
                "dispel-magic",
                "magic-circle",
                "remove-curse",
                "revivify",
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
