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
#[serde(rename_all = "camelCase", default)]
pub struct InventoryItem {
    pub id: String,
    pub name: String,
    pub quantity: u32,
    pub notes: String,
    /// Вес одной единицы предмета в фунтах — для расчёта общей переносимой
    /// массы (характеристика Сила × 15, characters-carrying-capacity). Каталог
    /// весов живёт на стороне UI (characterCreationData.ts), здесь только
    /// хранится подставленное значение.
    pub weight_lb: f64,
}

/// Номиналы монет SRD 5.1 (rules.json → equipment-coins). Курс обмена (1мм=1,
/// 1см=10, 1эм=50, 1зм=100, 1пм=1000) и вес (50 монет = 1 фунт) считаются на
/// стороне UI (characterCreationData.ts → COIN_DENOMINATIONS) — там же, где и
/// показываются; здесь модель хранит только сами номиналы.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Coins {
    pub copper: i32,
    pub silver: i32,
    pub electrum: i32,
    pub gold: i32,
    pub platinum: i32,
}

impl Coins {
    pub fn is_empty(&self) -> bool {
        self.copper == 0 && self.silver == 0 && self.electrum == 0 && self.gold == 0 && self.platinum == 0
    }
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
    /// Кумулятивный опыт (SRD 5.1: таблица «Развитие персонажа», см.
    /// `characterCreationData.ts → XP_THRESHOLDS`) — вводится вручную мастером,
    /// движок ничего не начисляет сам. Не тратится/не обнуляется левел-апом.
    /// Отсутствует в старых сохранениях — `#[serde(default)]` на структуре
    /// даёт 0, как и у остальных полей, добавленных позже.
    pub experience_points: i32,
    pub abilities: AbilityScores,
    pub max_hp: i32,
    pub current_hp: i32,
    pub armor_class: i32,
    pub speed_feet: i32,
    pub initiative: i32,
    pub passive_perception: i32,
    pub conditions: Vec<String>,
    pub inventory: Vec<InventoryItem>,
    /// Устарело — деньги в одном золотом числе, до появления номиналов
    /// (см. `coins`). Читается только для миграции старых сохранений
    /// (`migrate_legacy_gold`), новые сохранения это поле не пишут.
    #[serde(skip_serializing)]
    pub gold: i64,
    pub coins: Coins,
    pub saving_throw_proficiencies: Vec<String>,
    pub skill_proficiencies: Vec<String>,
    pub known_cantrips: Vec<String>,
    pub known_spells: Vec<String>,
    pub spell_slots_level1_max: i32,
    pub spell_slots_level1_current: i32,
}

impl Character {
    /// Персонажи, сохранённые до появления номиналов монет, хранили деньги
    /// одним полем `gold` (золотые монеты). Вызывается на каждой загрузке
    /// (см. `storage::read_campaign_file`) — идемпотентна: после первого
    /// переноса `gold` обнулено, второй перенос уже не сработает.
    pub fn migrate_legacy_gold(&mut self) {
        if self.coins.is_empty() && self.gold != 0 {
            self.coins.gold = self.gold as i32;
        }
        self.gold = 0;
    }
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
        assert_eq!(character.experience_points, 0);
    }

    /// characters-currency-denominations: старое сохранение с `gold: number`
    /// (без поля `coins`) должно после миграции стать золотыми монетами,
    /// остальные номиналы — 0.
    #[test]
    fn legacy_gold_number_migrates_into_gold_coins() {
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
            "conditions": [], "inventory": [], "gold": 250
        }"#;
        let mut character: Character = serde_json::from_str(old_json).expect("старый персонаж должен читаться");
        assert_eq!(character.gold, 250);
        assert_eq!(character.coins, Coins::default(), "до миграции номиналы ещё пусты");

        character.migrate_legacy_gold();

        assert_eq!(character.coins, Coins { gold: 250, ..Coins::default() });
        assert_eq!(character.gold, 0, "после миграции устаревшее поле обнулено");

        // Идемпотентность: повторный вызов ничего не меняет.
        character.migrate_legacy_gold();
        assert_eq!(character.coins, Coins { gold: 250, ..Coins::default() });
    }

    /// characters-carrying-capacity: инвентарь, сохранённый до появления
    /// веса предметов, не должен ломать загрузку — вес по умолчанию 0.0.
    #[test]
    fn inventory_item_without_weight_defaults_to_zero() {
        let old_json = r#"{"id": "torch-1", "name": "Факел", "quantity": 5, "notes": ""}"#;
        let item: InventoryItem = serde_json::from_str(old_json).expect("старый предмет должен читаться");
        assert_eq!(item.weight_lb, 0.0);
    }
}
