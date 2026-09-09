use tauri::{AppHandle, Manager};

use crate::model::Character;

/// Пресеты готовых персонажей — из bundle.resources в сборке, из
/// src-tauri/characters в dev (тот же приём, что и для rules.json/spells.json/
/// bestiary.json).
fn presets_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("characters")
            .join("presets.json"));
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("не найден каталог ресурсов приложения: {e}"))?;
    Ok(resource_dir.join("characters").join("presets.json"))
}

/// Пресет — это обычный `Character`, а не своя урезанная структура: он попадает
/// в ростер копированием (новый `id`, см. `characterFromPreset` на стороне UI) и
/// дальше живёт тем же кодом прогрессии, что и персонаж из мастера.
pub fn load_character_presets(app: &AppHandle) -> Result<Vec<Character>, String> {
    let path = presets_path(app)?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("не удалось прочитать {path:?}: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("повреждён {path:?}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_bundled() -> Vec<Character> {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("characters")
            .join("presets.json");
        let raw = std::fs::read_to_string(&path).expect("прочитать characters/presets.json");
        serde_json::from_str(&raw).expect("распарсить presets.json")
    }

    #[test]
    fn bundled_presets_json_parses_and_is_not_empty() {
        let presets = load_bundled();
        assert!(!presets.is_empty(), "presets.json не должен быть пустым");
    }

    #[test]
    fn every_preset_has_a_stable_id_a_name_a_race_and_a_class() {
        for preset in load_bundled() {
            assert!(!preset.id.is_empty(), "у пресета «{}» нет id", preset.name);
            assert!(!preset.name.is_empty(), "у пресета {} нет имени", preset.id);
            assert!(!preset.race.is_empty(), "у пресета {} нет расы", preset.id);
            assert!(!preset.class.is_empty(), "у пресета {} нет класса", preset.id);
        }
    }

    #[test]
    fn halfling_bard_preset_carries_the_numbers_from_the_sheet() {
        let presets = load_bundled();
        let bard = presets
            .iter()
            .find(|p| p.id == "preset-bard-halfling")
            .expect("пресет preset-bard-halfling");

        assert_eq!(bard.race, "Полурослик");
        assert_eq!(bard.class, "Бард");
        assert_eq!(bard.level, 1);
        assert_eq!(bard.max_hp, 9);
        assert_eq!(bard.armor_class, 14);
        assert_eq!(bard.speed_feet, 25);
        assert_eq!(bard.abilities.dexterity, 16);
        assert_eq!(bard.abilities.charisma, 16);
        assert_eq!(bard.spell_slots_max, vec![2, 0, 0, 0, 0, 0, 0, 0, 0]);
    }

    /// Формат обязан нести архетип уровня 1 и сделанный внутри него выбор — у
    /// барда 1 уровня архетипа нет, но следующими идут жрецы (домен на 1
    /// уровне, `CLASS_SUBCLASSES["classes-cleric"].chosenAtLevel == 1`).
    /// Проверяется на самом формате, а не откладывается до появления жреца.
    #[test]
    fn preset_format_carries_a_level_one_subclass_and_its_choices() {
        let raw = r#"[{
            "id": "preset-format-probe",
            "name": "Проба формата",
            "race": "Полуэльф",
            "class": "Жрец",
            "level": 1,
            "subclass": "Домен жизни",
            "subclassChoices": { "circle-of-the-land-terrain": ["forest"] }
        }]"#;
        let presets: Vec<Character> = serde_json::from_str(raw).expect("распарсить пробу формата");
        let probe = &presets[0];

        assert_eq!(probe.subclass, "Домен жизни");
        assert_eq!(
            probe.subclass_choices.get("circle-of-the-land-terrain"),
            Some(&vec!["forest".to_string()]),
            "выбор внутри архетипа не должен теряться при разборе пресета"
        );
        // Пропущенные поля добираются `#[serde(default)]` структуры — пресету не
        // обязательно перечислять всё, чего у персонажа нет.
        assert_eq!(probe.max_hp, 0);
        assert!(probe.inventory.is_empty());
    }
}
