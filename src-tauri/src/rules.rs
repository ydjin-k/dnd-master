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
/// установщика там не собраны — тот же приём, что и для моделей OCR).
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

        assert!(topics.len() >= 10, "ожидал десяток с лишним тем, получил {}", topics.len());
        assert!(topics.iter().any(|t| t.id == "appendices-conditions"));

        let conditions = topics.iter().find(|t| t.id == "appendices-conditions").unwrap();
        let has_deafened_heading = conditions.blocks.iter().any(|b| {
            matches!(b, RuleBlock::Heading { text, .. } if text == "Оглохшее")
        });
        assert!(has_deafened_heading, "не нашёл состояние «Оглохшее» в разобранных блоках");

        for topic in &topics {
            assert!(!topic.blocks.is_empty(), "тема {} осталась без блоков", topic.id);
        }
    }
}
