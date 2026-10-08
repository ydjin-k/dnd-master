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
    /// Выбранный вариант расы — стихия Дженази и всё, что придёт после неё
    /// (`RACE_VARIANTS` в `src/ui/characterCreationData.ts`). Хранится
    /// идентификатор варианта, а не название. Пусто у рас без вариантов и у
    /// сохранений, записанных до появления поля: структурный
    /// `#[serde(default)]` даёт "" тем же приёмом, что `favored_enemy`.
    pub race_variant: String,
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
    /// Сколько Костей Хитов потрачено. Хранится ПОТРАЧЕНО, а не ОСТАЛОСЬ:
    /// старые сохранения получают 0 через структурный `#[serde(default)]` — тем
    /// же приёмом, что `portrait_variant` и `experience_points` выше, — и ноль
    /// обязан значить «запас полон». «Осталось» сделало бы ноль неотличимым от
    /// пустого запаса, а миграции пришлось бы знать уровень персонажа.
    ///
    /// Максимум здесь не хранится: по SRD костей ровно столько, каков уровень,
    /// и остаток считает UI (`src/ui/hitDice.ts` — единственный владелец
    /// предела), как и максимумы ресурсов из таблицы прогрессии.
    /// Спасброски от смерти: успехи и провалы, каждый 0–3. Модель их только
    /// ХРАНИТ — правило счёта («10» и выше успех, «1» стоит два провала, «20»
    /// возвращает 1 хит, три успеха стабилизируют, три провала убивают) живёт
    /// одним владельцем на стороне UI (`src/ui/deathSaves.ts`), как и предел
    /// Костей Хитов выше. Здесь нет даже обрезки до трёх: заведись она и тут,
    /// у предела стало бы два владельца.
    ///
    /// Старые сохранения этих полей не несут и получают нули через
    /// структурный `#[serde(default)]` — тем же приёмом, что
    /// `portrait_variant` и `hit_dice_spent`. Ноль однозначен: спасбросков
    /// ещё не было.
    pub death_save_successes: u32,
    pub death_save_failures: u32,
    pub hit_dice_spent: u32,
    pub armor_class: i32,
    pub speed_feet: i32,
    pub initiative: i32,
    pub passive_perception: i32,
    pub conditions: Vec<String>,
    /// Полудни без еды (SRD `[3]/blocks[27]`: «Полфунта еды в день считается как
    /// полдня без еды»). Половинками, а не днями, чтобы счёт был целым числом.
    /// Старые сохранения получают 0 структурным `#[serde(default)]` — тем же
    /// приёмом, что `hit_dice_spent`, и ноль однозначен: персонаж сыт.
    /// Истощение от голода модель тут не держит: оно живёт в `conditions`, где и
    /// всякое другое истощение.
    pub half_days_without_food: i32,
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
    /// Выбор игрока внутри самого КЛАССА (id выбора → id выбранных
    /// вариантов) — проклятья крови Кровавого охотника и всё, что придёт
    /// после них. Отдельное поле, а не общая карта с `subclass_choices`
    /// выше: там снимок выбора АРХЕТИПА, и склеенные в одну карту они
    /// разъехались бы на первой же смене архетипа — классовый выбор её
    /// переживает, архетипный нет.
    ///
    /// Модель хранит только id выбранных вариантов: их имена и тексты
    /// живут одним владельцем на стороне UI (`CLASS_CHOICES` в
    /// characterCreationData.ts), и сохранённое имя разошлось бы с ним при
    /// первой правке формулировки — тем же правилом, что у `feats` ниже.
    ///
    /// Старые сохранения поля не несут и получают пустую карту через
    /// структурный `#[serde(default)]`, как и `subclass_choices`.
    pub class_choices: HashMap<String, Vec<String>>,
    /// Взятые черты — id из `src/ui/feats.ts`, не названия: имя черты и её
    /// текст живут одним владельцем на стороне UI, а у SRD-черты «Борец» — и
    /// вовсе в `rules.json`, откуда она читается. Модель хранит только выбор.
    ///
    /// Прибавка к характеристике здесь не хранится: черта применяет её к
    /// `abilities` в момент взятия — тем же путём, которым применяется
    /// Улучшение характеристик, — и второе хранение завело бы второго
    /// владельца значения характеристики.
    ///
    /// Старые сохранения этого поля не несут и получают пустой список через
    /// структурный `#[serde(default)]`, как и `subclass_choices` выше.
    pub feats: Vec<String>,
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

/// Счётчик пути отряда (SRD 5.1, раздел `[2]` «Передвижение»).
///
/// Модель хранит ВРЕМЯ и выбор мастера — темп, местность, часы и дни. Миль
/// здесь нет намеренно: они выводятся из темпа и часов
/// (`travelledMiles` в `src/ui/travelPace.ts`), и второе их хранение означало бы
/// второго владельца пройденного пути.
///
/// Темп — строка, а не перечисление, по той же причине, по которой состояния
/// персонажа лежат строками: словарь значений живёт на стороне показа
/// (`TRAVEL_PACES`), и неизвестное значение там превращается в обычный темп, а
/// не роняет загрузку. `Default` даёт пустую строку — её `paceById` читает как
/// обычный темп.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TravelState {
    pub pace: String,
    pub difficult_terrain: bool,
    pub hours_today: i32,
    pub day_marches: i32,
    pub half_day_marches: i32,
    pub lost_days: i32,
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
    /// Счётчик пути (SRD `[2]`). `None` у кампаний, записанных до него, — тем же
    /// структурным `#[serde(default)]`, которым пережит приход движка; показ
    /// подставляет умолчание сам (`travelOf` в `travelPace.ts`), поэтому
    /// кампания без темпа открывается обычным темпом и нулями, а не падает.
    pub travel: Option<TravelState>,
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
        // characters-hit-dice-and-short-rest: 0 = ничего не потрачено = запас полон.
        assert_eq!(character.hit_dice_spent, 0);
        // characters-death-saves: 0 = спасбросков от смерти ещё не было.
        assert_eq!(character.death_save_successes, 0);
        assert_eq!(character.death_save_failures, 0);
        // characters-subclass-features-have-no-mechanical-effect
        assert!(character.armor_proficiencies.is_empty());
        assert!(character.weapon_proficiencies.is_empty());
        assert_eq!(character.fighting_style, "");
    }

    /// characters-hit-dice-and-short-rest: поле хранит ПОТРАЧЕНО, поэтому
    /// миграции не нужно ничего считать — отсутствие поля и есть полный запас.
    /// Проба сторожит ИМЯ поля в файле сохранения (`hitDiceSpent`, camelCase):
    /// разъехавшееся имя молча прочиталось бы нулём, то есть возвращало бы
    /// игроку все кости при каждой загрузке.
    #[test]
    fn hit_dice_spent_reads_zero_from_old_save_and_keeps_written_value() {
        let old_json = r#"{
            "id": "abc", "name": "Монах", "race": "Человек", "class": "Монах", "level": 5,
            "abilities": {
                "strength": 10, "dexterity": 14, "constitution": 14,
                "intelligence": 10, "wisdom": 16, "charisma": 10
            },
            "maxHp": 35, "currentHp": 20, "armorClass": 15,
            "conditions": [], "inventory": []
        }"#;
        let character: Character = serde_json::from_str(old_json).expect("старый персонаж должен читаться");
        assert_eq!(character.hit_dice_spent, 0, "нет поля — значит ничего не потрачено");

        let saved: Character =
            serde_json::from_str(&old_json.replace(r#""maxHp": 35"#, r#""hitDiceSpent": 3, "maxHp": 35"#))
                .expect("сохранение с полем должно читаться");
        assert_eq!(saved.hit_dice_spent, 3, "записанное число костей должно пережить загрузку");

        let round_trip: Character = serde_json::from_str(&serde_json::to_string(&saved).expect("запись"))
            .expect("свежая запись должна читаться обратно");
        assert_eq!(round_trip.hit_dice_spent, 3);
    }

    /// characters-death-saves: счётчики спасбросков должны появляться нулями у
    /// старого сохранения и переживать перезапуск приложения, если игрок
    /// наставил галочки руками. Проба сторожит ИМЕНА полей в файле
    /// (`deathSaveSuccesses`/`deathSaveFailures`, camelCase): разъехавшееся имя
    /// молча прочиталось бы нулём — то есть стирало бы счёт при каждой загрузке,
    /// и персонаж на нуле хитов не умер бы никогда.
    #[test]
    fn death_saves_read_zero_from_old_save_and_keep_written_values() {
        let old_json = r#"{
            "id": "abc", "name": "Плут", "race": "Полурослик", "class": "Плут", "level": 3,
            "abilities": {
                "strength": 8, "dexterity": 16, "constitution": 12,
                "intelligence": 12, "wisdom": 10, "charisma": 14
            },
            "maxHp": 21, "currentHp": 0, "armorClass": 14,
            "conditions": [], "inventory": []
        }"#;
        let character: Character = serde_json::from_str(old_json).expect("старый персонаж должен читаться");
        assert_eq!(character.death_save_successes, 0, "нет поля — значит спасбросков не было");
        assert_eq!(character.death_save_failures, 0, "нет поля — значит спасбросков не было");

        let saved: Character = serde_json::from_str(&old_json.replace(
            r#""maxHp": 21"#,
            r#""deathSaveSuccesses": 1, "deathSaveFailures": 2, "maxHp": 21"#,
        ))
        .expect("сохранение с полями должно читаться");
        assert_eq!(saved.death_save_successes, 1);
        assert_eq!(saved.death_save_failures, 2);

        let round_trip: Character = serde_json::from_str(&serde_json::to_string(&saved).expect("запись"))
            .expect("свежая запись должна читаться обратно");
        assert_eq!(round_trip.death_save_successes, 1, "галочки должны пережить перезапуск");
        assert_eq!(round_trip.death_save_failures, 2, "галочки должны пережить перезапуск");
    }

    /// characters-feats: у старого сохранения черт нет, и оно обязано
    /// открываться как раньше — пустым списком, а не ошибкой разбора. Проба
    /// сторожит и ИМЯ поля в файле (`feats`, camelCase): разъехавшееся имя
    /// молча прочиталось бы пустотой, то есть стирало бы взятую черту при
    /// каждой загрузке — вместе с прибавкой к характеристике, которую она уже
    /// применила к `abilities` и которая осталась бы без объяснения.
    #[test]
    fn feats_read_empty_from_old_save_and_keep_written_values() {
        let old_json = r#"{
            "id": "abc", "name": "Воин", "race": "Человек", "class": "Воин", "level": 4,
            "abilities": {
                "strength": 16, "dexterity": 12, "constitution": 14,
                "intelligence": 10, "wisdom": 11, "charisma": 10
            },
            "maxHp": 36, "currentHp": 36, "armorClass": 16,
            "conditions": [], "inventory": []
        }"#;
        let character: Character = serde_json::from_str(old_json).expect("старый персонаж должен читаться");
        assert!(character.feats.is_empty(), "нет поля — значит черт нет");

        let saved: Character = serde_json::from_str(&old_json.replace(
            r#""maxHp": 36"#,
            r#""feats": ["feat-cepkiy-glaz", "feat-srd-grappler"], "maxHp": 36"#,
        ))
        .expect("сохранение с полем должно читаться");
        assert_eq!(saved.feats, vec!["feat-cepkiy-glaz", "feat-srd-grappler"]);

        let round_trip: Character = serde_json::from_str(&serde_json::to_string(&saved).expect("запись"))
            .expect("свежая запись должна читаться обратно");
        assert_eq!(
            round_trip.feats,
            vec!["feat-cepkiy-glaz", "feat-srd-grappler"],
            "взятые черты должны пережить перезапуск"
        );
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

    /// engine-travel-pace: кампания, записанная до счётчика пути, обязана
    /// открываться, а не падать на отсутствующем поле. `None` здесь значит «в
    /// путь не выходили», и умолчание темпа подставляет показ (`travelOf`), а
    /// не миграция файла.
    #[test]
    fn campaign_without_travel_deserializes_as_none() {
        let old_json = r#"{
            "id": "camp-1", "campaignName": "Старая кампания",
            "characters": [], "journal": [], "combat": null
        }"#;
        let campaign: CampaignState =
            serde_json::from_str(old_json).expect("кампания без счётчика пути должна читаться");
        assert!(campaign.travel.is_none(), "нет поля — значит в путь не выходили");
        assert!(campaign.engine.is_none());
    }

    /// engine-travel-pace: счётчик пути обязан пережить перезапуск приложения.
    /// Проба сторожит ИМЕНА полей в файле сохранения (camelCase): разъехавшееся
    /// имя молча прочиталось бы нулём, то есть обнуляло бы пройденный путь при
    /// каждой загрузке — ровно та же ошибка, что уже ловили на `hitDiceSpent`.
    #[test]
    fn travel_counter_survives_round_trip_by_field_names() {
        let saved_json = r#"{
            "id": "camp-2", "campaignName": "Поход", "characters": [], "journal": [], "combat": null,
            "travel": {
                "pace": "fast", "difficultTerrain": true,
                "hoursToday": 3, "dayMarches": 2, "halfDayMarches": 1, "lostDays": 1
            }
        }"#;
        let campaign: CampaignState =
            serde_json::from_str(saved_json).expect("кампания со счётчиком должна читаться");
        let travel = campaign.travel.clone().expect("счётчик должен быть прочитан");
        assert_eq!(travel.pace, "fast");
        assert!(travel.difficult_terrain);
        assert_eq!(travel.hours_today, 3);
        assert_eq!(travel.day_marches, 2);
        assert_eq!(travel.half_day_marches, 1);
        assert_eq!(travel.lost_days, 1);

        let round_trip: CampaignState =
            serde_json::from_str(&serde_json::to_string(&campaign).expect("запись")).expect("чтение обратно");
        let again = round_trip.travel.expect("счётчик должен пережить запись и чтение");
        assert_eq!(again.pace, "fast");
        assert_eq!(again.hours_today, 3);
        assert_eq!(again.day_marches, 2);
        assert_eq!(again.half_day_marches, 1);
        assert_eq!(again.lost_days, 1);
        assert!(again.difficult_terrain);
    }

    /// engine-travel-pace: счётчик пути с незнакомым темпом не роняет загрузку —
    /// строка доезжает до показа, и обычным темпом её делает `paceById`, а не
    /// миграция. Вторым владельцем умолчания модель не становится.
    #[test]
    fn travel_counter_keeps_unknown_pace_string() {
        let json = r#"{
            "id": "camp-3", "campaignName": "Поход", "characters": [], "journal": [], "combat": null,
            "travel": { "pace": "galloping" }
        }"#;
        let campaign: CampaignState = serde_json::from_str(json).expect("должна читаться");
        let travel = campaign.travel.expect("счётчик должен быть прочитан");
        assert_eq!(travel.pace, "galloping");
        assert_eq!(travel.hours_today, 0, "отсутствующие счётчики — нули");
        assert_eq!(travel.day_marches, 0);
    }

    /// engine-travel-pace: персонаж, сохранённый до голода и жажды, обязан
    /// читаться сытым. Ноль здесь однозначен — полудней без еды не было.
    #[test]
    fn character_without_hunger_counter_reads_as_fed() {
        let old_json = r#"{
            "id": "abc", "name": "Тест", "race": "Орк", "class": "Плут", "level": 1,
            "abilities": {
                "strength": 10, "dexterity": 10, "constitution": 10,
                "intelligence": 10, "wisdom": 10, "charisma": 10
            },
            "maxHp": 10, "currentHp": 10, "armorClass": 10,
            "conditions": [], "inventory": []
        }"#;
        let character: Character = serde_json::from_str(old_json).expect("старый персонаж должен читаться");
        assert_eq!(character.half_days_without_food, 0);

        let saved: Character = serde_json::from_str(
            &old_json.replace(r#""maxHp": 10"#, r#""halfDaysWithoutFood": 5, "maxHp": 10"#),
        )
        .expect("сохранение с полем должно читаться");
        assert_eq!(saved.half_days_without_food, 5, "счёт голода должен пережить загрузку");

        let round_trip: Character = serde_json::from_str(&serde_json::to_string(&saved).expect("запись"))
            .expect("свежая запись должна читаться обратно");
        assert_eq!(round_trip.half_days_without_food, 5);
    }
}
