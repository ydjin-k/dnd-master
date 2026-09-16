use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", rename_all_fields = "camelCase")]
pub enum RuleBlock {
    Heading { level: u8, text: String },
    Paragraph { text: String },
    List { items: Vec<String> },
    Table { rows: Vec<Vec<String>> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleTopic {
    pub id: String,
    pub category: String,
    pub title: String,
    pub source_url: String,
    pub blocks: Vec<RuleBlock>,
}

/// Правила — из bundle.resources в сборке, из src-tauri/rules в dev (ресурсы
/// установщика там не собраны — тот же приём, что и для spells.json).
fn rules_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("rules")
            .join("rules.json"));
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("не найден каталог ресурсов приложения: {e}"))?;
    Ok(resource_dir.join("rules").join("rules.json"))
}

pub fn load_rules(app: &AppHandle) -> Result<Vec<RuleTopic>, String> {
    let path = rules_path(app)?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("не удалось прочитать {path:?}: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("повреждён {path:?}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_rules_json_parses_and_has_expected_topics() {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("rules")
            .join("rules.json");
        let raw = std::fs::read_to_string(&path).expect("прочитать rules/rules.json");
        let topics: Vec<RuleTopic> = serde_json::from_str(&raw).expect("распарсить rules.json");

        assert!(topics.len() >= 50, "ожидал пять десятков с лишним тем, получил {}", topics.len());

        for id in ["appendices-conditions", "races-dwarf", "classes-fighter", "equipment-weapons"] {
            assert!(topics.iter().any(|t| t.id == id), "не нашёл тему {id}");
        }

        // Правила сотворения заклинаний — перевод раздела «Spellcasting» SRD 5.1;
        // категория `spellcasting` делит справочник между вкладками «Правила» и
        // «Заклинания», поэтому опечатка в ней сделала бы темы невидимыми на обеих.
        let spellcasting: Vec<&RuleTopic> =
            topics.iter().filter(|t| t.category == "spellcasting").collect();
        assert_eq!(
            spellcasting.len(),
            4,
            "ожидал четыре темы правил сотворения заклинаний, получил {}",
            spellcasting.len()
        );
        // rules-vendor-srd-spell-lists: четвёртая тема — `spellcasting-attribution`. Лицензия
        // CC-BY-4.0 требует дословного уведомления там, где игрок видит сам материал, и
        // единственное место в приложении, где раздел заклинаний виден целиком, — эта вкладка.
        let attribution = spellcasting
            .iter()
            .find(|t| t.id == "spellcasting-attribution")
            .expect("не нашёл тему spellcasting-attribution");
        let has_verbatim_statement = attribution.blocks.iter().any(|b| matches!(
            b,
            RuleBlock::Paragraph { text }
                if text.contains("This work includes material taken from the System Reference Document 5.1")
                    && text.contains("https://creativecommons.org/licenses/by/4.0/legalcode")
        ));
        assert!(
            has_verbatim_statement,
            "в теме атрибуции нет дословного уведомления CC-BY-4.0 — вендоринг SRD без него нарушает лицензию"
        );
        let casting = spellcasting
            .iter()
            .find(|t| t.id == "spellcasting-casting")
            .expect("не нашёл тему spellcasting-casting");
        let has_concentration_heading = casting
            .blocks
            .iter()
            .any(|b| matches!(b, RuleBlock::Heading { text, .. } if text == "Концентрация"));
        assert!(has_concentration_heading, "не нашёл раздел «Концентрация» в правилах сотворения");

        let conditions = topics.iter().find(|t| t.id == "appendices-conditions").unwrap();
        let has_deafened_heading = conditions.blocks.iter().any(|b| {
            matches!(b, RuleBlock::Heading { text, .. } if text == "Оглохшее")
        });
        assert!(has_deafened_heading, "не нашёл состояние «Оглохшее» в разобранных блоках");

        let weapons = topics.iter().find(|t| t.id == "equipment-weapons").unwrap();
        let has_weapon_table = weapons
            .blocks
            .iter()
            .any(|b| matches!(b, RuleBlock::Table { rows } if rows.len() > 20));
        assert!(has_weapon_table, "не нашёл таблицу оружия ожидаемого размера");

        for topic in &topics {
            assert!(!topic.blocks.is_empty(), "тема {} осталась без блоков", topic.id);
        }
    }
}
