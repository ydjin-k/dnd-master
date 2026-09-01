use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AbilityScores {
    pub strength: i32,
    pub dexterity: i32,
    pub constitution: i32,
    pub intelligence: i32,
    pub wisdom: i32,
    pub charisma: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InventoryItem {
    pub id: String,
    pub name: String,
    pub quantity: u32,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub race: String,
    pub class: String,
    pub subclass: String,
    pub background: String,
    pub alignment: String,
    pub gender: String,
    pub age: u32,
    pub languages: Vec<String>,
    pub level: u32,
    pub abilities: AbilityScores,
    pub max_hp: i32,
    pub current_hp: i32,
    pub armor_class: i32,
    pub speed_feet: i32,
    pub initiative: i32,
    pub passive_perception: i32,
    pub conditions: Vec<String>,
    pub inventory: Vec<InventoryItem>,
    pub gold: i64,
    pub saving_throw_proficiencies: Vec<String>,
    pub skill_proficiencies: Vec<String>,
    pub known_cantrips: Vec<String>,
    pub known_spells: Vec<String>,
    pub spell_slots_level1_max: i32,
    pub spell_slots_level1_current: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: String,
    pub timestamp: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "text")]
pub enum AdventureLogEntry {
    Scene(String),
    Choice(String),
    Roll(String),
    Custom(String),
    Oracle(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Combatant {
    pub id: String,
    pub name: String,
    pub is_monster: bool,
    pub x: i32,
    pub y: i32,
    pub speed_feet: i32,
    pub max_hp: i32,
    pub current_hp: i32,
    pub armor_class: i32,
    /// Плоский бонус атаки и кости урона — для монстров из бестиария; для
    /// игровых персонажей это грубая заглушка (полноценных бонусов от оружия
    /// и владения в модели персонажа пока нет). Игрок может вместо `attack`
    /// бросить свою настоящую атаку на вкладке «Кубики» и применить урон
    /// через apply_damage — движок это не запрещает.
    pub attack_bonus: i32,
    pub damage_dice: String,
    pub initiative: i32,
    pub feet_moved_this_turn: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CombatState {
    pub grid_width: i32,
    pub grid_height: i32,
    pub combatants: Vec<Combatant>,
    pub turn_order: Vec<String>,
    pub current_turn_index: usize,
    pub round: i32,
    pub log: Vec<String>,
    pub finished: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CampaignState {
    pub id: String,
    pub campaign_name: String,
    pub characters: Vec<Character>,
    pub journal: Vec<JournalEntry>,
    pub current_scene_id: Option<String>,
    pub adventure_log: Vec<AdventureLogEntry>,
    pub combat: Option<CombatState>,
    /// 1-9, нейтральное значение 5 — см. oracle.rs. Сериализуемый дефолт
    /// нужен отдельно от общего `default` на структуре: он даёт 0, а не
    /// нейтральные 5, для кампаний, сохранённых до этой пачки.
    #[serde(default = "default_chaos_factor")]
    pub chaos_factor: u8,
}

fn default_chaos_factor() -> u8 {
    5
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Персонажи, сохранённые до появления background/владений (эта пачка),
    /// не должны ломать загрузку — ровно та же ошибка класса, что уже
    /// однажды ловили на CampaignState (missing field adventureLog).
    #[test]
    fn character_without_new_fields_deserializes_with_defaults() {
        let old_json = r#"{
            "id": "abc",
            "name": "Тест",
            "race": "Орк",
            "class": "Плут",
            "level": 1,
            "abilities": {
                "strength": 10, "dexterity": 10, "constitution": 10,
                "intelligence": 10, "wisdom": 10, "charisma": 10
            },
            "maxHp": 10, "currentHp": 10, "armorClass": 10,
            "conditions": [], "inventory": [], "gold": 0
        }"#;
        let character: Character = serde_json::from_str(old_json).expect("старый персонаж должен читаться");
        assert_eq!(character.background, "");
        assert_eq!(character.subclass, "");
        assert!(character.saving_throw_proficiencies.is_empty());
        assert!(character.skill_proficiencies.is_empty());
        assert_eq!(character.gender, "");
        assert_eq!(character.age, 0);
        assert!(character.known_cantrips.is_empty());
        assert!(character.known_spells.is_empty());
        assert_eq!(character.spell_slots_level1_max, 0);
        assert_eq!(character.spell_slots_level1_current, 0);
    }
}
