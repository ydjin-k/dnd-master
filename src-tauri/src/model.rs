use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

/// Потраченные использования классового ресурса с ограниченным числом раз
/// (Ярость, Ци, Проведение энергии…). Максимум не хранится: его владелец —
/// таблица прогрессии класса на стороне UI (`src/ui/classProgression.ts`),
/// как и веса предметов, — модель хранит только текущий счётчик.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct FeatureUses {
    pub feature_id: String,
    pub uses_current: i32,
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
    /// Черты характера/Идеалы/Привязанности/Слабости (SRD 5.1) — свободный
    /// текст, заполняется на шаге «Итог» мастера персонажа, редактируется и
    /// после создания (см. CharactersPage.tsx).
    pub personality_traits: String,
    pub ideals: String,
    pub bonds: String,
    pub flaws: String,
    pub alignment: String,
    pub gender: String,
    /// Вариант портрета 1–3. Старые сохранения получают 0 через структурный
    /// `#[serde(default)]`, а единый подборщик URL трактует его как вариант 1.
    pub portrait_variant: u8,
    pub age: u32,
    /// Описательные поля листа персонажа — рост/вес/глаза/кожа/волосы,
    /// внешность, предыстория, союзники, сокровища. Модель их только хранит:
    /// ни один расчёт их не читает, показывает и правит карточка персонажа.
    /// `height`/`weight` — строки, потому что на листах единицы пишутся
    /// свободным текстом («168 СМ (5.5 фут)», «3,5 фута», «145»).
    /// Старые сохранения получают "" через структурный `#[serde(default)]`.
    pub height: String,
    pub weight: String,
    pub eyes: String,
    pub skin: String,
    pub hair: String,
    pub appearance: String,
    pub backstory: String,
    pub allies: String,
    pub treasures: String,
    pub languages: Vec<String>,
    /// Избранный враг Следопыта (SRD 5.1, «Любимый враг») — пусто у не-Следопытов.
    /// Отсутствует в старых сохранениях — структурный `#[serde(default)]` даёт "".
    pub favored_enemy: String,
    /// Известная местность Следопыта (SRD 5.1, «Исследователь природы») — пусто у не-Следопытов.
    pub known_terrain: String,
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
    /// Владения доспехами и оружием — снимок таблиц класса и архетипа на
    /// стороне UI (`characterCreationData.ts`), как и владения спасбросками
    /// выше. Доспехи хранятся категориями ("light"/"medium"/"heavy"/"shields"),
    /// оружие — категориями ("simple"/"martial") и отдельными названиями.
    pub armor_proficiencies: Vec<String>,
    pub weapon_proficiencies: Vec<String>,
    /// Владение инструментами по названию набора — снимок таблицы архетипа
    /// (`SubclassGrants.toolProficiencies`), тем же правилом, что и владения выше.
    pub tool_proficiencies: Vec<String>,
    /// Боевой стиль воина, выбранный при создании: входит в расчёт КД
    /// («Оборона» — +1 в доспехе), поэтому должен пережить сохранение.
    pub fighting_style: String,
    pub known_cantrips: Vec<String>,
    /// Что персонаж может творить ячейкой прямо сейчас: у класса с известным
    /// списком (Бард/Колдун/Чародей/Следопыт) это выученное навсегда, у класса
    /// с подготовкой (Жрец/Друид/Волшебник/Паладин) — подготовленное после
    /// последнего отдыха. Разбор и норма живут на стороне UI
    /// (`preparedSpells.ts`), модель хранит только список.
    ///
    /// Не путать с `spellbook`: книга — что ВЫУЧЕНО вообще, и сама по себе
    /// творить не даёт. Заговоры сюда тоже не входят — они в `known_cantrips`,
    /// не тратят ячейку и подготовки не требуют, поэтому «известны» у всех
    /// честно.
    ///
    /// `alias` — это и есть миграция старых сохранений: до переименования поле
    /// звалось `knownSpells` и под этим именем лежит во всех файлах, записанных
    /// раньше. Снять alias — значит молча потерять заклинания у сохранённой
    /// партии: `#[serde(default)]` на структуре подставит пустой список без
    /// единой ошибки. Стережёт это `legacy_campaign_with_known_spells_*` в
    /// storage.rs и `legacy_known_spells_field_reads_into_castable_spells` ниже.
    #[serde(alias = "knownSpells")]
    pub castable_spells: Vec<String>,
    /// Книга заклинаний Волшебника (SRD 5.1) — что выучено вообще, источник
    /// для подготовки. Пуста у остальных классов; кто её ведёт и сколько в неё
    /// входит, знает только UI (`spellbook.ts`) — модель её просто хранит.
    /// Старые сохранения получают пустой список через структурный
    /// `#[serde(default)]`, как и поля, добавленные раньше.
    pub spellbook: Vec<String>,
    /// Устарело — ячейки заклинаний были только 1 круга, до прогрессии по
    /// уровням (см. `spell_slots_max`). Читается только для миграции старых
    /// сохранений (`migrate_legacy_spell_slots`), новые сохранения не пишут.
    #[serde(skip_serializing)]
    pub spell_slots_level1_max: i32,
    #[serde(skip_serializing)]
    pub spell_slots_level1_current: i32,
    /// Ячейки заклинаний по кругам 1..5 — индекс 0 это 1 круг. Длину задаёт
    /// таблица прогрессии на стороне UI; здесь это просто вектор чисел.
    pub spell_slots_max: Vec<i32>,
    pub spell_slots_current: Vec<i32>,
    pub feature_uses: Vec<FeatureUses>,
    /// Выбор игрока внутри архетипа (id выбора → id выбранных вариантов),
    /// напр. «Добыча охотника» Следопыта — снимок держится здесь, а не
    /// пересчитывается: сам выбор существует только на стороне UI
    /// (`SubclassGrants.choices` в characterCreationData.ts). Старые
    /// сохранения получают пустую карту через структурный `#[serde(default)]`,
    /// как и `tool_proficiencies` (см. карточку #73).
    pub subclass_choices: HashMap<String, Vec<String>>,
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

    /// Персонажи, сохранённые до прогрессии ячеек по кругам, хранили только
    /// 1 круг двумя числами. Вызывается на каждой загрузке рядом с
    /// `migrate_legacy_gold` — идемпотентна: после переноса устаревшие поля
    /// обнулены, а непустой `spell_slots_max` второй перенос уже не тронет.
    pub fn migrate_legacy_spell_slots(&mut self) {
        if self.spell_slots_max.is_empty() && self.spell_slots_level1_max > 0 {
            self.spell_slots_max = vec![self.spell_slots_level1_max, 0, 0, 0, 0];
            self.spell_slots_current = vec![self.spell_slots_level1_current, 0, 0, 0, 0];
        }
        self.spell_slots_level1_max = 0;
        self.spell_slots_level1_current = 0;
    }

    /// Индекс наименьшей свободной ячейки круга `circle` или выше — SRD
    /// позволяет творить заклинание ячейкой своего круга и любого старше, а
    /// Колдун вообще получает ячейки только высшего доступного круга.
    pub fn free_spell_slot_index(&self, circle: u8) -> Option<usize> {
        if circle == 0 {
            return None;
        }
        (usize::from(circle) - 1..self.spell_slots_current.len())
            .find(|&i| self.spell_slots_current[i] > 0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: String,
    pub timestamp: String,
    pub text: String,
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
    /// Ничего, если атаки нет вовсе (существо из бестиария без единой атаки в
    /// стат-блоке SRD). Такой боец стоит на поле, ходит и получает урон, но
    /// `attack` по нему честно отказывает вместо броска по выдуманным числам.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attack_bonus: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_dice: Option<String>,
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
    pub combat: Option<CombatState>,
    /// Состояние движка мастера (ADR 0001) — ПОЛЕ этого документа, а не второй
    /// файл: два документа разъезжаются при первой же правке. Сохранения,
    /// записанные до движка, читаются как `None` структурным `#[serde(default)]`
    /// у самого `CampaignState` — тем же приёмом, которым уже пережиты
    /// переименование полей и снос целого движка приключения.
    pub engine: Option<crate::gm::state::EngineState>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Персонажи, сохранённые до появления background/владений (эта пачка),
    /// не должны ломать загрузку — ровно та же ошибка класса, что уже
    /// однажды ловили на CampaignState (missing field journal).
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
        assert_eq!(character.portrait_variant, 0);
        assert_eq!(character.age, 0);
        assert!(character.known_cantrips.is_empty());
        assert!(character.castable_spells.is_empty());
        assert!(character.spell_slots_max.is_empty());
        assert!(character.spell_slots_current.is_empty());
        assert!(character.feature_uses.is_empty());
        assert_eq!(character.experience_points, 0);
        // characters-subclass-features-have-no-mechanical-effect
        assert!(character.armor_proficiencies.is_empty());
        assert!(character.weapon_proficiencies.is_empty());
        assert_eq!(character.fighting_style, "");
    }

    /// characters-class-feature-progression-1-5: сохранение с ячейками только
    /// 1 круга должно стать вектором по кругам, не потеряв потраченные ячейки.
    #[test]
    fn legacy_level1_spell_slots_migrate_into_per_circle_vector() {
        let old_json = r#"{
            "id": "abc", "name": "Бард", "race": "Эльф", "class": "Бард", "level": 3,
            "abilities": {
                "strength": 10, "dexterity": 10, "constitution": 10,
                "intelligence": 10, "wisdom": 10, "charisma": 16
            },
            "maxHp": 20, "currentHp": 20, "armorClass": 12,
            "conditions": [], "inventory": [],
            "spellSlotsLevel1Max": 4, "spellSlotsLevel1Current": 1
        }"#;
        let mut character: Character = serde_json::from_str(old_json).expect("старый персонаж должен читаться");
        assert!(character.spell_slots_max.is_empty(), "до миграции вектор ещё пуст");

        character.migrate_legacy_spell_slots();

        assert_eq!(character.spell_slots_max, vec![4, 0, 0, 0, 0]);
        assert_eq!(character.spell_slots_current, vec![1, 0, 0, 0, 0]);
        assert_eq!(character.spell_slots_level1_max, 0, "после миграции устаревшее поле обнулено");

        // Идемпотентность: повторный вызов не затирает уже перенесённые ячейки.
        character.migrate_legacy_spell_slots();
        assert_eq!(character.spell_slots_current, vec![1, 0, 0, 0, 0]);
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

    /// characters-known-spells-honest-name: поле `knownSpells` переименовано в
    /// `castableSpells`, и все сохранения, записанные до переименования, несут
    /// СТАРОЕ имя. Читать его обязан serde-alias — без него `#[serde(default)]`
    /// молча подставит пустой список, и партия потеряет заклинания без единой
    /// ошибки. Отрицательная проба: убрать `#[serde(alias = "knownSpells")]` в
    /// `Character` — эта проба краснеет на непустом списке.
    #[test]
    fn legacy_known_spells_field_reads_into_castable_spells() {
        let old_json = r#"{
            "id": "abc", "name": "Дарин", "race": "Человек", "class": "Жрец", "level": 1,
            "abilities": {
                "strength": 10, "dexterity": 10, "constitution": 10,
                "intelligence": 10, "wisdom": 16, "charisma": 10
            },
            "maxHp": 10, "currentHp": 10, "armorClass": 10,
            "conditions": [], "inventory": [],
            "knownCantrips": ["guidance"],
            "knownSpells": ["bless", "cure-wounds", "sanctuary"]
        }"#;
        let character: Character =
            serde_json::from_str(old_json).expect("старый персонаж должен читаться");

        assert_eq!(
            character.castable_spells,
            vec!["bless", "cure-wounds", "sanctuary"],
            "заклинания из старого поля knownSpells обязаны попасть в castable_spells"
        );
        assert_eq!(character.known_cantrips, vec!["guidance"], "заговоры своего поля не меняли");
    }

    /// Обратная сторона той же миграции: сохранение, записанное уже новым
    /// именем, читается напрямую — alias не должен требовать старого ключа.
    #[test]
    fn new_castable_spells_field_reads_as_is() {
        let json = r#"{
            "id": "abc", "name": "Кимри", "race": "Полурослик", "class": "Бард", "level": 1,
            "abilities": {
                "strength": 10, "dexterity": 16, "constitution": 10,
                "intelligence": 10, "wisdom": 10, "charisma": 16
            },
            "maxHp": 9, "currentHp": 9, "armorClass": 14,
            "conditions": [], "inventory": [],
            "castableSpells": ["healing-word", "charm-person"]
        }"#;
        let character: Character = serde_json::from_str(json).expect("новый персонаж должен читаться");
        assert_eq!(character.castable_spells, vec!["healing-word", "charm-person"]);
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
