import type { AbilityScores } from "../state/types";

type AbilityKey = keyof AbilityScores;

/**
 * Спасброски, навыки и стартовое снаряжение — сверены вручную с текстом
 * в rules.json (SRD 5.1), не вытащены регэкспом из прозы: формулировки
 * списков навыков и вариантов снаряжения у разных классов написаны
 * по-разному (где-то «(а)/(б)», где-то через «или», у Воина вообще
 * встречается латинская «a» вместо кириллической «а»), автопарсинг такого
 * ненадёжен. Раз проверено глазами один раз — дальше это обычные данные.
 */

export const ALL_SKILLS = [
  "Акробатика",
  "Обращение с животными",
  "Атлетика",
  "Обман",
  "История",
  "Проницательность",
  "Запугивание",
  "Расследование",
  "Медицина",
  "Магия",
  "Природа",
  "Восприятие",
  "Выступление",
  "Убеждение",
  "Религия",
  "Ловкость рук",
  "Скрытность",
  "Выживание",
];

export interface ClassProficiencies {
  savingThrows: AbilityKey[];
  savingThrowLabels: string[];
  skillCount: number;
  skillOptions: string[];
}

export const CLASS_PROFICIENCIES: Record<string, ClassProficiencies> = {
  "classes-bard": {
    savingThrows: ["dexterity", "charisma"],
    savingThrowLabels: ["Ловкость", "Харизма"],
    skillCount: 3,
    skillOptions: ALL_SKILLS,
  },
  "classes-barbarian": {
    savingThrows: ["strength", "constitution"],
    savingThrowLabels: ["Сила", "Телосложение"],
    skillCount: 2,
    skillOptions: ["Атлетика", "Восприятие", "Выживание", "Запугивание", "Природа", "Обращение с животными"],
  },
  "classes-fighter": {
    savingThrows: ["strength", "constitution"],
    savingThrowLabels: ["Сила", "Телосложение"],
    skillCount: 2,
    skillOptions: [
      "Акробатика",
      "Обращение с животными",
      "Атлетика",
      "История",
      "Проницательность",
      "Запугивание",
      "Восприятие",
      "Выживание",
    ],
  },
  "classes-wizard": {
    savingThrows: ["intelligence", "wisdom"],
    savingThrowLabels: ["Интеллект", "Мудрость"],
    skillCount: 2,
    skillOptions: ["Магия", "История", "Проницательность", "Расследование", "Медицина", "Религия"],
  },
  "classes-druid": {
    savingThrows: ["intelligence", "wisdom"],
    savingThrowLabels: ["Интеллект", "Мудрость"],
    skillCount: 2,
    skillOptions: [
      "Магия",
      "Обращение с животными",
      "Проницательность",
      "Медицина",
      "Природа",
      "Восприятие",
      "Религия",
      "Выживание",
    ],
  },
  "classes-cleric": {
    savingThrows: ["wisdom", "charisma"],
    savingThrowLabels: ["Мудрость", "Харизма"],
    skillCount: 2,
    skillOptions: ["История", "Медицина", "Проницательность", "Религия", "Убеждение"],
  },
  "classes-warlock": {
    savingThrows: ["wisdom", "charisma"],
    savingThrowLabels: ["Мудрость", "Харизма"],
    skillCount: 2,
    skillOptions: ["Магия", "Обман", "История", "Запугивание", "Расследование", "Природа", "Религия"],
  },
  "classes-monk": {
    savingThrows: ["strength", "dexterity"],
    savingThrowLabels: ["Сила", "Ловкость"],
    skillCount: 2,
    skillOptions: ["Акробатика", "Атлетика", "История", "Проницательность", "Религия", "Скрытность"],
  },
  "classes-paladin": {
    savingThrows: ["wisdom", "charisma"],
    savingThrowLabels: ["Мудрость", "Харизма"],
    skillCount: 2,
    skillOptions: ["Атлетика", "Запугивание", "Медицина", "Проницательность", "Религия", "Убеждение"],
  },
  "classes-rogue": {
    savingThrows: ["dexterity", "intelligence"],
    savingThrowLabels: ["Ловкость", "Интеллект"],
    skillCount: 4,
    skillOptions: [
      "Акробатика",
      "Атлетика",
      "Обман",
      "Проницательность",
      "Запугивание",
      "Расследование",
      "Восприятие",
      "Выступление",
      "Убеждение",
      "Ловкость рук",
      "Скрытность",
    ],
  },
  "classes-ranger": {
    savingThrows: ["strength", "dexterity"],
    savingThrowLabels: ["Сила", "Ловкость"],
    skillCount: 3,
    skillOptions: [
      "Обращение с животными",
      "Атлетика",
      "Проницательность",
      "Расследование",
      "Природа",
      "Восприятие",
      "Скрытность",
      "Выживание",
    ],
  },
  "classes-sorcerer": {
    savingThrows: ["constitution", "charisma"],
    savingThrowLabels: ["Телосложение", "Харизма"],
    skillCount: 2,
    skillOptions: ["Запугивание", "Магия", "Обман", "Проницательность", "Религия", "Убеждение"],
  },
};

export interface EquipmentOption {
  label: string;
  items: string[];
}

export interface EquipmentSlot {
  options: EquipmentOption[];
}

const slot = (...options: [string, string[]][]): EquipmentSlot => ({
  options: options.map(([label, items]) => ({ label, items })),
});

export const CLASS_EQUIPMENT: Record<string, EquipmentSlot[]> = {
  "classes-bard": [
    slot(["Рапира", ["Рапира"]], ["Длинный меч", ["Длинный меч"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
    slot(["Набор дипломата", ["Набор дипломата"]], ["Набор артиста", ["Набор артиста"]]),
    slot(["Лютня", ["Лютня"]], ["Другой музыкальный инструмент", ["Музыкальный инструмент (на выбор)"]]),
    slot(["Кожаный доспех и кинжал", ["Кожаный доспех", "Кинжал"]]),
  ],
  "classes-barbarian": [
    slot(["Секира", ["Секира"]], ["Любое воинское оружие ближнего боя", ["Воинское оружие ближнего боя (на выбор)"]]),
    slot(["Два ручных топора", ["Ручной топор", "Ручной топор"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
    slot(["Набор путешественника и четыре метательных копья", ["Набор путешественника", "Метательное копьё ×4"]]),
  ],
  "classes-fighter": [
    slot(["Кольчуга", ["Кольчуга"]], ["Кожаный доспех, длинный лук и 20 стрел", ["Кожаный доспех", "Длинный лук", "Стрелы ×20"]]),
    slot(["Воинское оружие и щит", ["Воинское оружие (на выбор)", "Щит"]], ["Два воинских оружия", ["Воинское оружие (на выбор) ×2"]]),
    slot(["Лёгкий арбалет и 20 болтов", ["Лёгкий арбалет", "Болты ×20"]], ["Два ручных топора", ["Ручной топор", "Ручной топор"]]),
    slot(["Набор исследователя подземелий", ["Набор исследователя подземелий"]], ["Набор путешественника", ["Набор путешественника"]]),
  ],
  "classes-wizard": [
    slot(["Боевой посох", ["Боевой посох"]], ["Кинжал", ["Кинжал"]]),
    slot(["Мешочек с компонентами", ["Мешочек с компонентами"]], ["Заклинательный фокус", ["Заклинательный фокус"]]),
    slot(["Набор учёного", ["Набор учёного"]], ["Набор путешественника", ["Набор путешественника"]]),
    slot(["Книга заклинаний", ["Книга заклинаний"]]),
  ],
  "classes-druid": [
    slot(["Деревянный щит", ["Деревянный щит"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
    slot(["Скимитар", ["Скимитар"]], ["Любое простое оружие ближнего боя", ["Простое оружие ближнего боя (на выбор)"]]),
    slot(["Кожаный доспех, набор путешественника и друидический фокус", ["Кожаный доспех", "Набор путешественника", "Друидический фокус"]]),
  ],
  "classes-cleric": [
    slot(["Булава", ["Булава"]], ["Боевой молот (при владении)", ["Боевой молот"]]),
    slot(
      ["Кольчуга с чешуйками", ["Кольчуга с чешуйками"]],
      ["Кожаные доспехи", ["Кожаные доспехи"]],
      ["Кольчуга (при владении)", ["Кольчуга"]],
    ),
    slot(["Лёгкий арбалет и 20 болтов", ["Лёгкий арбалет", "Болты ×20"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
    slot(["Набор священника", ["Набор священника"]], ["Набор путешественника", ["Набор путешественника"]]),
    slot(["Щит и священный символ", ["Щит", "Священный символ"]]),
  ],
  "classes-warlock": [
    slot(["Лёгкий арбалет и 20 болтов", ["Лёгкий арбалет", "Болты ×20"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
    slot(["Мешочек с компонентами", ["Мешочек с компонентами"]], ["Магический фокус", ["Магический фокус"]]),
    slot(["Набор учёного", ["Набор учёного"]], ["Набор исследователя подземелий", ["Набор исследователя подземелий"]]),
    slot(["Кожаная броня, простое оружие и два кинжала", ["Кожаная броня", "Простое оружие (на выбор)", "Кинжал ×2"]]),
  ],
  "classes-monk": [
    slot(["Короткий меч", ["Короткий меч"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
    slot(["Набор исследователя подземелий", ["Набор исследователя подземелий"]], ["Набор путешественника", ["Набор путешественника"]]),
    slot(["10 дротиков", ["Дротик ×10"]]),
  ],
  "classes-paladin": [
    slot(["Воинское оружие и щит", ["Воинское оружие (на выбор)", "Щит"]], ["Два воинских оружия", ["Воинское оружие (на выбор) ×2"]]),
    slot(["Пять пилумов", ["Пилум ×5"]], ["Любое простое оружие ближнего боя", ["Простое оружие ближнего боя (на выбор)"]]),
    slot(["Набор священника", ["Набор священника"]], ["Набор путешественника", ["Набор путешественника"]]),
    slot(["Кольчуга и священный символ", ["Кольчуга", "Священный символ"]]),
  ],
  "classes-rogue": [
    slot(["Рапира", ["Рапира"]], ["Короткий меч", ["Короткий меч"]]),
    slot(["Короткий лук и колчан с 20 стрелами", ["Короткий лук", "Стрелы ×20", "Колчан"]], ["Короткий меч", ["Короткий меч"]]),
    slot(
      ["Набор взломщика", ["Набор взломщика"]],
      ["Набор исследователя подземелий", ["Набор исследователя подземелий"]],
      ["Набор путешественника", ["Набор путешественника"]],
    ),
    slot(["Кожаные доспехи, два кинжала и воровские инструменты", ["Кожаные доспехи", "Кинжал ×2", "Воровские инструменты"]]),
  ],
  "classes-ranger": [
    slot(["Чешуйчатый доспех", ["Чешуйчатый доспех"]], ["Кожаный доспех", ["Кожаный доспех"]]),
    slot(["Два коротких меча", ["Короткий меч", "Короткий меч"]], ["Два простых оружия ближнего боя", ["Простое оружие ближнего боя ×2"]]),
    slot(["Набор исследователя подземелий", ["Набор исследователя подземелий"]], ["Набор путешественника", ["Набор путешественника"]]),
    slot(["Длинный лук и колчан с 20 стрелами", ["Длинный лук", "Стрелы ×20", "Колчан"]]),
  ],
  "classes-sorcerer": [
    slot(["Лёгкий арбалет и 20 болтов", ["Лёгкий арбалет", "Болты ×20"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
    slot(["Сумка с компонентами", ["Сумка с компонентами"]], ["Магический фокус", ["Магический фокус"]]),
    slot(["Рюкзак исследователя подземелий", ["Набор исследователя подземелий"]], ["Рюкзак исследователя", ["Набор путешественника"]]),
    slot(["Два кинжала", ["Кинжал ×2"]]),
  ],
};

export interface BackgroundData {
  id: string;
  title: string;
  skillProficiencies: string[];
  equipment: string[];
  gold: number;
  feature: string;
}

/**
 * SRD 5.1 включает только одну предысторию целиком — Послушник. Остальные
 * упомянуты в PHB, но не входят в открытый документ.
 */
export const BACKGROUNDS: BackgroundData[] = [
  {
    id: "acolyte",
    title: "Послушник",
    skillProficiencies: ["Проницательность", "Религия"],
    equipment: [
      "Священный символ",
      "Молитвенник или молитвенное колесо",
      "5 палочек ладана",
      "Облачение",
      "Набор обычной одежды",
    ],
    gold: 15,
    feature:
      "Приют для верующих: вы и спутники можете рассчитывать на бесплатное исцеление и уход в храме вашей веры, скромный образ жизни обеспечен.",
  },
];

export type WeaponCategory = "simple-melee" | "simple-ranged" | "martial-melee" | "martial-ranged";

export interface WeaponData {
  name: string;
  category: WeaponCategory;
  cost: string;
  damage: string;
  weight: string;
  properties: string;
}

/**
 * Таблица «Оружие» из SRD 5.1 (rules.json → equipment-weapons) — строки уже
 * были готовыми данными в исходном документе, просто разложены по полям
 * вместо одного текстового блока таблицы.
 */
export const WEAPONS: WeaponData[] = [
  { name: "Боевой посох", category: "simple-melee", cost: "2 см", damage: "1к6 дробящий", weight: "4 фнт.", properties: "Универсальное (1к8)" },
  { name: "Булава", category: "simple-melee", cost: "5 зм", damage: "1к6 дробящий", weight: "4 фнт.", properties: "—" },
  { name: "Дубинка", category: "simple-melee", cost: "1 см", damage: "1к4 дробящее", weight: "2 фнт.", properties: "Лёгкое" },
  { name: "Кинжал", category: "simple-melee", cost: "2 зм", damage: "1к4 колющий", weight: "1 фнт.", properties: "Лёгкое, метательное (дистанция 20/60), фехтовальное" },
  { name: "Копье", category: "simple-melee", cost: "1 зм", damage: "1к6 колющий", weight: "3 фнт.", properties: "Метательное (дистанция 20/60), универсальное (1к8)" },
  { name: "Лёгкий молот", category: "simple-melee", cost: "2 зм", damage: "1к4 дробящее", weight: "2 фнт.", properties: "Лёгкое, метательное (дистанция 20/60)" },
  { name: "Метательное копье", category: "simple-melee", cost: "5 см", damage: "1к6 колющий", weight: "2 фнт.", properties: "Метательное (дистанция 30/120)" },
  { name: "Палица", category: "simple-melee", cost: "2 см", damage: "1к8 дробящий", weight: "10 фнт.", properties: "Двуручное" },
  { name: "Ручной топор", category: "simple-melee", cost: "5 зм", damage: "1к6 рубящий", weight: "2 фнт.", properties: "Лёгкое, метательное (дистанция 20/60)" },
  { name: "Серп", category: "simple-melee", cost: "1 зм", damage: "1к4 рубящий", weight: "2 фнт.", properties: "Лёгкое" },

  { name: "Арбалет, лёгкий", category: "simple-ranged", cost: "25 зм", damage: "1к8 колющий", weight: "5 фнт.", properties: "Боеприпас (дистанция 80/320), двуручное, перезарядка" },
  { name: "Дротик", category: "simple-ranged", cost: "5 мм", damage: "1к4 колющий", weight: "1/4 фнт.", properties: "Метательное (дистанция 20/60), фехтовальное" },
  { name: "Короткий лук", category: "simple-ranged", cost: "25 зм", damage: "1к6 колющий", weight: "2 фнт.", properties: "Боеприпас (дистанция 80/320), двуручное" },
  { name: "Праща", category: "simple-ranged", cost: "1 см", damage: "1к4 дробящее", weight: "—", properties: "Боеприпас (дистанция 30/120)" },

  { name: "Алебарда", category: "martial-melee", cost: "20 зм", damage: "1к10 рубящий", weight: "6 фнт.", properties: "Двуручное, досягаемость, тяжёлое" },
  { name: "Боевая кирка", category: "martial-melee", cost: "5 зм", damage: "1к8 колющий", weight: "2 фнт.", properties: "—" },
  { name: "Боевой молот", category: "martial-melee", cost: "15 зм", damage: "1к8 дробящий", weight: "2 фнт.", properties: "Универсальное (1к10)" },
  { name: "Боевой топор", category: "martial-melee", cost: "10 зм", damage: "1к8 рубящий", weight: "4 фнт.", properties: "Универсальное (1к10)" },
  { name: "Глефа", category: "martial-melee", cost: "20 зм", damage: "1к10 рубящий", weight: "6 фнт.", properties: "Двуручное, досягаемость, тяжёлое" },
  { name: "Двуручный меч", category: "martial-melee", cost: "50 зм", damage: "2к6 рубящий", weight: "6 фнт.", properties: "Двуручное, тяжёлое" },
  { name: "Длинное копьё", category: "martial-melee", cost: "10 зм", damage: "1к12 колющий", weight: "6 фнт.", properties: "Досягаемость, особое" },
  { name: "Длинный меч", category: "martial-melee", cost: "15 зм", damage: "1к8 рубящий", weight: "3 фнт.", properties: "Универсальное (1к10)" },
  { name: "Кнут", category: "martial-melee", cost: "2 зм", damage: "1к4 рубящий", weight: "3 фнт.", properties: "Досягаемость, фехтовальное" },
  { name: "Короткий меч", category: "martial-melee", cost: "10 зм", damage: "1к6 колющий", weight: "2 фнт.", properties: "Лёгкое, фехтовальное" },
  { name: "Кувалда", category: "martial-melee", cost: "10 зм", damage: "2к6 дробящий", weight: "10 фнт.", properties: "Двуручное, тяжёлое" },
  { name: "Моргенштерн", category: "martial-melee", cost: "15 зм", damage: "1к8 колющий", weight: "4 фнт.", properties: "—" },
  { name: "Пика", category: "martial-melee", cost: "5 зм", damage: "1к10 колющий", weight: "18 фнт.", properties: "Двуручное, досягаемость, тяжёлое" },
  { name: "Рапира", category: "martial-melee", cost: "25 зм", damage: "1к8 колющий", weight: "2 фнт.", properties: "Фехтовальное" },
  { name: "Секира", category: "martial-melee", cost: "30 зм", damage: "1к12 рубящий", weight: "7 фнт.", properties: "Двуручное, тяжёлое" },
  { name: "Скимитар", category: "martial-melee", cost: "25 зм", damage: "1к6 рубящий", weight: "3 фнт.", properties: "Лёгкое, фехтовальное" },
  { name: "Трезубец", category: "martial-melee", cost: "5 зм", damage: "1к6 колющий", weight: "4 фнт.", properties: "Метательное (дистанция 20/60), универсальное (1к8)" },
  { name: "Цеп", category: "martial-melee", cost: "10 зм", damage: "1к8 дробящий", weight: "2 фнт.", properties: "—" },

  { name: "Арбалет, ручной", category: "martial-ranged", cost: "75 зм", damage: "1к6 колющий", weight: "3 фнт.", properties: "Боеприпас (дистанция 30/120), лёгкое, перезарядка" },
  { name: "Арбалет, тяжёлый", category: "martial-ranged", cost: "50 зм", damage: "1к10 колющий", weight: "18 фнт.", properties: "Боеприпас (дистанция 100/400), двуручное, перезарядка, тяжёлое" },
  { name: "Длинный лук", category: "martial-ranged", cost: "50 зм", damage: "1к8 колющий", weight: "2 фнт.", properties: "Боеприпас (дистанция 150/600), двуручное, тяжёлое" },
  { name: "Духовая трубка", category: "martial-ranged", cost: "10 зм", damage: "1 колющий", weight: "1 фнт.", properties: "Боеприпас (дистанция 25/100), перезарядка" },
  { name: "Сеть", category: "martial-ranged", cost: "1 зм", damage: "—", weight: "3 фнт.", properties: "Метательное (дистанция 5/15), особое" },
];

interface WeaponChoicePattern {
  pattern: RegExp;
  categories: WeaponCategory[];
  count: number;
}

/**
 * Плейсхолдеры вида «Простое оружие (на выбор)» в CLASS_EQUIPMENT выше —
 * узнаём их по точному тексту (см. список мест использования) и разворачиваем
 * в реальный выбор из WEAPONS нужной категории.
 */
const WEAPON_CHOICE_PATTERNS: WeaponChoicePattern[] = [
  { pattern: /^Воинское оружие ближнего боя \(на выбор\)$/, categories: ["martial-melee"], count: 1 },
  { pattern: /^Воинское оружие \(на выбор\) ×2$/, categories: ["martial-melee", "martial-ranged"], count: 2 },
  { pattern: /^Воинское оружие \(на выбор\)$/, categories: ["martial-melee", "martial-ranged"], count: 1 },
  { pattern: /^Простое оружие ближнего боя \(на выбор\)$/, categories: ["simple-melee"], count: 1 },
  { pattern: /^Простое оружие \(на выбор\)$/, categories: ["simple-melee", "simple-ranged"], count: 1 },
];

export function weaponChoiceFor(item: string): WeaponChoicePattern | undefined {
  return WEAPON_CHOICE_PATTERNS.find((p) => p.pattern.test(item));
}

export function weaponsInCategory(categories: WeaponCategory[]): WeaponData[] {
  return WEAPONS.filter((w) => categories.includes(w.category));
}
