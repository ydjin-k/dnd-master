use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SceneOption {
    pub id: String,
    pub label: String,
    /// Куда ведёт выбор напрямую — пусто, если решает бросок по table_id.
    pub next_scene_id: Option<String>,
    /// Если задано — выбор не ведёт напрямую, а бросает по этой таблице,
    /// и уже выпавшая запись определяет следующую сцену.
    pub table_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub text: String,
    pub options: Vec<SceneOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TableEntry {
    pub weight: u32,
    pub text: String,
    pub next_scene_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EncounterTable {
    pub id: String,
    pub name: String,
    pub entries: Vec<TableEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Adventure {
    pub start_scene_id: String,
    pub scenes: Vec<Scene>,
    pub tables: Vec<EncounterTable>,
}

impl Adventure {
    pub fn scene(&self, id: &str) -> Option<&Scene> {
        self.scenes.iter().find(|s| s.id == id)
    }

    pub fn table(&self, id: &str) -> Option<&EncounterTable> {
        self.tables.iter().find(|t| t.id == id)
    }
}

/// Демо-приключение: доказывает, что механизм работает. Настоящий контент
/// (таблицы, ветки, лор) — отдельная задача, не эта пачка (GAME.md, п.1).
pub fn demo_adventure() -> Adventure {
    Adventure {
        start_scene_id: "forest_edge".into(),
        scenes: vec![
            Scene {
                id: "forest_edge".into(),
                text: "Тропа выводит отряд на опушку. Впереди — тёмный лес, откуда доносится \
                       далёкий вой. Что делаете?"
                    .into(),
                options: vec![
                    SceneOption {
                        id: "enter_forest".into(),
                        label: "Войти в лес осторожно".into(),
                        next_scene_id: None,
                        table_id: Some("forest_encounters".into()),
                    },
                    SceneOption {
                        id: "go_around".into(),
                        label: "Обойти лес по тропе вдоль реки".into(),
                        next_scene_id: Some("river_path".into()),
                        table_id: None,
                    },
                ],
            },
            Scene {
                id: "river_path".into(),
                text: "Река выводит к старому каменному мосту. Мост выглядит ненадёжным."
                    .into(),
                options: vec![SceneOption {
                    id: "cross_bridge".into(),
                    label: "Перейти мост".into(),
                    next_scene_id: Some("forest_edge".into()),
                    table_id: None,
                }],
            },
        ],
        tables: vec![EncounterTable {
            id: "forest_encounters".into(),
            name: "Встречи в лесу".into(),
            entries: vec![
                TableEntry {
                    weight: 3,
                    text: "Тихо. Только скрип деревьев и запах прелой листвы.".into(),
                    next_scene_id: Some("forest_edge".into()),
                },
                TableEntry {
                    weight: 2,
                    text: "Одинокий волк перебегает тропу и скрывается в чаще.".into(),
                    next_scene_id: Some("forest_edge".into()),
                },
                TableEntry {
                    weight: 1,
                    text: "Из-за деревьев выходит оборотень и внимательно смотрит на отряд."
                        .into(),
                    next_scene_id: Some("forest_edge".into()),
                },
            ],
        }],
    }
}

pub fn roll_table(table: &EncounterTable) -> Result<TableEntry, String> {
    let total_weight: u32 = table.entries.iter().map(|e| e.weight).sum();
    if total_weight == 0 {
        return Err(format!("в таблице {:?} нет записей с весом", table.name));
    }
    let mut roll = rand::thread_rng().gen_range(0..total_weight);
    for entry in &table.entries {
        if roll < entry.weight {
            return Ok(entry.clone());
        }
        roll -= entry.weight;
    }
    unreachable!("сумма весов посчитана неверно")
}
