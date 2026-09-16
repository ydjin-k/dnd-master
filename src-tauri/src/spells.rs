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
/// что и для rules.json).
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

    // ── Сверка с эталоном SRD 5.1 ───────────────────────────────────────────
    //
    // Эталон — `src-tauri/reference/srd-5.1-spell-lists.json`, выдержка списков заклинаний
    // по классам из SRD 5.1 издания 2023 года под CC-BY-4.0 (см. `reference/ATTRIBUTION.md`:
    // там и дословная атрибуция, и команда, которой выдержка извлекается из PDF).
    //
    // До этого пофамильная сверка была только у паладина и следопыта, и ожидаемый состав был
    // вбит константой прямо в пробе — с чьих-то слов. Опечатка при наборе попадала и в
    // данные, и в константу одинаково, проба оставалась зелёной, а список был неверен. Теперь
    // источник правды лежит вне файла и вне пробы, и сверка идёт по всем восьми классам.
    //
    // Строгость — **только правильность**: заклинание, которое есть в `spells.json`, обязано
    // иметь круг и набор классов ровно как в эталоне. Заклинания SRD, которых у нас нет,
    // здесь не краснят — полноты данных эта проба не требует.

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SrdReference {
        /// Наш собственный контент: заклинания, которых в SRD нет и не должно быть. Пропуск
        /// идёт поимённо — правило «чего нет в эталоне, то сойдёт» было бы дырой шире прежней.
        project_original: Vec<SrdWhitelisted>,
        spells: Vec<SrdSpell>,
    }

    #[derive(Deserialize)]
    struct SrdWhitelisted {
        id: String,
        name: String,
    }

    #[derive(Deserialize)]
    struct SrdSpell {
        name: String,
        id: String,
        level: u8,
        classes: Vec<String>,
    }

    fn load_srd_reference() -> SrdReference {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("reference")
            .join("srd-5.1-spell-lists.json");
        let raw = std::fs::read_to_string(&path).expect("прочитать reference/srd-5.1-spell-lists.json");
        serde_json::from_str(&raw).expect("распарсить эталон SRD")
    }

    #[test]
    fn every_bundled_spell_matches_the_srd_reference() {
        let reference = load_srd_reference();
        let srd: std::collections::BTreeMap<&str, &SrdSpell> =
            reference.spells.iter().map(|s| (s.id.as_str(), s)).collect();
        let whitelist: std::collections::BTreeSet<&str> = reference
            .project_original
            .iter()
            .map(|s| s.id.as_str())
            .collect();

        let mut problems: Vec<String> = Vec::new();
        for spell in load_bundled() {
            if whitelist.contains(spell.id.as_str()) {
                continue;
            }
            let Some(expected) = srd.get(spell.id.as_str()) else {
                problems.push(format!(
                    "{} ({}) — нет ни в SRD 5.1, ни в белом списке нашего контента",
                    spell.id, spell.name
                ));
                continue;
            };
            if spell.level != expected.level {
                problems.push(format!(
                    "{} ({}) — круг {}, в SRD {} круг",
                    spell.id, expected.name, spell.level, expected.level
                ));
            }
            let mut actual: Vec<&str> = spell.classes.iter().map(|c| c.as_str()).collect();
            actual.sort_unstable();
            let mut wanted: Vec<&str> = expected.classes.iter().map(|c| c.as_str()).collect();
            wanted.sort_unstable();
            if actual != wanted {
                problems.push(format!(
                    "{} ({}) — классы {:?}, в SRD {:?}",
                    spell.id, expected.name, actual, wanted
                ));
            }
        }

        assert!(
            problems.is_empty(),
            "spells.json разошёлся с эталоном SRD 5.1 ({} шт.):
  {}",
            problems.len(),
            problems.join("
  ")
        );
    }

    #[test]
    fn project_original_spells_are_whitelisted_by_name_and_really_ours() {
        let reference = load_srd_reference();
        let bundled: std::collections::BTreeMap<String, Spell> =
            load_bundled().into_iter().map(|s| (s.id.clone(), s)).collect();
        let srd: std::collections::BTreeSet<&str> =
            reference.spells.iter().map(|s| s.id.as_str()).collect();

        assert!(
            !reference.project_original.is_empty(),
            "белый список нашего контента пуст — тогда сверка пропускает всё подряд"
        );
        for own in &reference.project_original {
            let spell = bundled.get(&own.id).unwrap_or_else(|| {
                panic!(
                    "{} ({}) числится нашим контентом в эталоне, но в spells.json его нет",
                    own.id, own.name
                )
            });
            assert_eq!(
                spell.name, own.name,
                "имя {} в белом списке разошлось с spells.json",
                own.id
            );
            assert!(
                !srd.contains(own.id.as_str()),
                "{} ({}) числится нашим контентом, но такое заклинание есть в SRD — оно должно сверяться, а не пропускаться",
                own.id,
                own.name
            );
        }
    }

    #[test]
    fn srd_reference_covers_all_eight_spellcasting_classes() {
        let reference = load_srd_reference();
        let mut in_reference: Vec<&str> = reference
            .spells
            .iter()
            .flat_map(|s| s.classes.iter().map(|c| c.as_str()))
            .collect();
        in_reference.sort_unstable();
        in_reference.dedup();

        let mut known = KNOWN_SPELLCASTING_CLASSES.to_vec();
        known.sort_unstable();
        assert_eq!(
            in_reference, known,
            "сверка обязана покрывать все восемь классов-заклинателей, а не два"
        );

        // Класс, которого нет ни у одного нашего заклинания, сверкой не покрыт: эталон его
        // знает, а краснеть на нём нечему.
        for class_id in KNOWN_SPELLCASTING_CLASSES {
            assert!(
                load_bundled()
                    .iter()
                    .any(|s| s.classes.iter().any(|c| c == class_id)),
                "у класса {class_id} в spells.json нет ни одного заклинания"
            );
        }
    }
}
