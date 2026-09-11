import type { AbilityScores, Coins, RuleTopic } from "../state/types";
// Только тип: ресурсы архетипа считаются тем же механизмом, что и классовые
// (classProgression.ts владеет и типом, и таблицей классов). Импорт типа
// стирается сборкой, так что встречного цикла с classProgression.ts нет.
import type { ClassResource } from "./classProgression";

export type AbilityKey = keyof AbilityScores;

/** Характеристика → её русская подпись, в порядке блока «Характеристики» на шаге «Итог». */
export const ABILITY_LABELS: [AbilityKey, string][] = [
  ["strength", "Сила"],
  ["dexterity", "Ловкость"],
  ["constitution", "Телосложение"],
  ["intelligence", "Интеллект"],
  ["wisdom", "Мудрость"],
  ["charisma", "Харизма"],
];

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Модификатор со знаком, например «+3» или «-1». */
export function fmtMod(mod: number): string {
  return (mod >= 0 ? "+" : "") + mod;
}

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

/**
 * Навык → характеристика, которой он проверяется по умолчанию — сверено с
 * текстом каждого навыка в rules.json → gameplay-abilities (формулировки вида
 * «проверка X (навыка)», например «Ваша проверка ловкости (акробатики)»),
 * не по памяти о D&D.
 */
export const SKILL_ABILITY: Record<string, AbilityKey> = {
  "Акробатика": "dexterity",
  "Обращение с животными": "wisdom",
  "Атлетика": "strength",
  "Обман": "charisma",
  "История": "intelligence",
  "Проницательность": "wisdom",
  "Запугивание": "charisma",
  "Расследование": "intelligence",
  "Медицина": "wisdom",
  "Магия": "intelligence",
  "Природа": "intelligence",
  "Восприятие": "wisdom",
  "Выступление": "charisma",
  "Убеждение": "charisma",
  "Религия": "intelligence",
  "Ловкость рук": "dexterity",
  "Скрытность": "dexterity",
  "Выживание": "wisdom",
};

/** Категории доспехов SRD 5.1 — этими id хранится владение (`Character.armorProficiencies`). */
export type ArmorProficiency = "light" | "medium" | "heavy" | "shields";

export const ARMOR_PROFICIENCY_LABELS: Record<ArmorProficiency, string> = {
  light: "лёгкие доспехи",
  medium: "средние доспехи",
  heavy: "тяжёлые доспехи",
  shields: "щиты",
};

/**
 * Категории оружия SRD 5.1. Владение оружием (`Character.weaponProficiencies`)
 * хранится списком строк: либо эти id категорий, либо название отдельного вида
 * оружия из `WEAPONS` (Бард/Плут владеют четырьмя воинскими видами поимённо).
 */
export type WeaponProficiencyCategory = "simple" | "martial";

export const WEAPON_PROFICIENCY_LABELS: Record<WeaponProficiencyCategory, string> = {
  simple: "простое оружие",
  martial: "воинское оружие",
};

export interface ClassProficiencies {
  savingThrows: AbilityKey[];
  savingThrowLabels: string[];
  skillCount: number;
  skillOptions: string[];
  /** Доспехи, которыми класс владеет с 1 уровня (SRD 5.1, раздел «Владения» тела класса). */
  armor: ArmorProficiency[];
  /** Категории оружия класса; отдельные виды — в `weapons`. */
  weaponCategories: WeaponProficiencyCategory[];
  /** Отдельные виды оружия сверх категорий — названия строк таблицы `WEAPONS`. */
  weapons: string[];
}

export const CLASS_PROFICIENCIES: Record<string, ClassProficiencies> = {
  "classes-bard": {
    savingThrows: ["dexterity", "charisma"],
    savingThrowLabels: ["Ловкость", "Харизма"],
    skillCount: 3,
    skillOptions: ALL_SKILLS,
    armor: ["light"],
    weaponCategories: ["simple"],
    weapons: ["Арбалет, ручной", "Длинный меч", "Рапира", "Короткий меч"],
  },
  "classes-barbarian": {
    savingThrows: ["strength", "constitution"],
    savingThrowLabels: ["Сила", "Телосложение"],
    skillCount: 2,
    skillOptions: ["Атлетика", "Восприятие", "Выживание", "Запугивание", "Природа", "Обращение с животными"],
    armor: ["light", "medium", "shields"],
    weaponCategories: ["simple", "martial"],
    weapons: [],
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
    armor: ["light", "medium", "heavy", "shields"],
    weaponCategories: ["simple", "martial"],
    weapons: [],
  },
  "classes-wizard": {
    savingThrows: ["intelligence", "wisdom"],
    savingThrowLabels: ["Интеллект", "Мудрость"],
    skillCount: 2,
    skillOptions: ["Магия", "История", "Проницательность", "Расследование", "Медицина", "Религия"],
    armor: [],
    weaponCategories: [],
    weapons: ["Кинжал", "Дротик", "Праща", "Боевой посох", "Арбалет, лёгкий"],
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
    armor: ["light", "medium", "shields"],
    weaponCategories: [],
    // Друид SRD не берёт в руки металлические доспехи и владеет узким списком оружия.
    weapons: [
      "Дубинка",
      "Кинжал",
      "Дротик",
      "Метательное копьё",
      "Булава",
      "Боевой посох",
      "Скимитар",
      "Серп",
      "Праща",
      "Копье",
    ],
  },
  "classes-cleric": {
    savingThrows: ["wisdom", "charisma"],
    savingThrowLabels: ["Мудрость", "Харизма"],
    skillCount: 2,
    skillOptions: ["История", "Медицина", "Проницательность", "Религия", "Убеждение"],
    armor: ["light", "medium", "shields"],
    weaponCategories: ["simple"],
    weapons: [],
  },
  "classes-warlock": {
    savingThrows: ["wisdom", "charisma"],
    savingThrowLabels: ["Мудрость", "Харизма"],
    skillCount: 2,
    skillOptions: ["Магия", "Обман", "История", "Запугивание", "Расследование", "Природа", "Религия"],
    armor: ["light"],
    weaponCategories: ["simple"],
    weapons: [],
  },
  "classes-monk": {
    savingThrows: ["strength", "dexterity"],
    savingThrowLabels: ["Сила", "Ловкость"],
    skillCount: 2,
    skillOptions: ["Акробатика", "Атлетика", "История", "Проницательность", "Религия", "Скрытность"],
    armor: [],
    weaponCategories: ["simple"],
    weapons: ["Короткий меч"],
  },
  "classes-paladin": {
    savingThrows: ["wisdom", "charisma"],
    savingThrowLabels: ["Мудрость", "Харизма"],
    skillCount: 2,
    skillOptions: ["Атлетика", "Запугивание", "Медицина", "Проницательность", "Религия", "Убеждение"],
    armor: ["light", "medium", "heavy", "shields"],
    weaponCategories: ["simple", "martial"],
    weapons: [],
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
    armor: ["light"],
    weaponCategories: ["simple"],
    weapons: ["Арбалет, ручной", "Длинный меч", "Рапира", "Короткий меч"],
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
    armor: ["light", "medium", "shields"],
    weaponCategories: ["simple", "martial"],
    weapons: [],
  },
  "classes-sorcerer": {
    savingThrows: ["constitution", "charisma"],
    savingThrowLabels: ["Телосложение", "Харизма"],
    skillCount: 2,
    skillOptions: ["Запугивание", "Магия", "Обман", "Проницательность", "Религия", "Убеждение"],
    armor: [],
    weaponCategories: [],
    weapons: ["Кинжал", "Дротик", "Праща", "Боевой посох", "Арбалет, лёгкий"],
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
    slot(["Лютня", ["Лютня"]], ["Любой другой музыкальный инструмент", ["Музыкальный инструмент (на выбор)"]]),
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
    slot(["Лёгкий арбалет и 20 болтов", ["Лёгкий арбалет", "Арбалетные болты ×20"]], ["Два ручных топора", ["Ручной топор", "Ручной топор"]]),
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
      ["Чешуйчатый доспех", ["Чешуйчатый доспех"]],
      ["Кожаный доспех", ["Кожаный доспех"]],
      ["Кольчуга (при владении)", ["Кольчуга"]],
    ),
    slot(["Лёгкий арбалет и 20 болтов", ["Лёгкий арбалет", "Арбалетные болты ×20"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
    slot(["Набор священника", ["Набор священника"]], ["Набор путешественника", ["Набор путешественника"]]),
    slot(["Щит и священный символ", ["Щит", "Священный символ"]]),
  ],
  "classes-warlock": [
    slot(["Лёгкий арбалет и 20 болтов", ["Лёгкий арбалет", "Арбалетные болты ×20"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
    slot(["Мешочек с компонентами", ["Мешочек с компонентами"]], ["Магический фокус", ["Магический фокус"]]),
    slot(["Набор учёного", ["Набор учёного"]], ["Набор исследователя подземелий", ["Набор исследователя подземелий"]]),
    slot(["Кожаный доспех, простое оружие и два кинжала", ["Кожаный доспех", "Простое оружие (на выбор)", "Кинжал ×2"]]),
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
    slot(["Кожаный доспех, два кинжала и воровские инструменты", ["Кожаный доспех", "Кинжал ×2", "Воровские инструменты"]]),
  ],
  "classes-ranger": [
    slot(["Чешуйчатый доспех", ["Чешуйчатый доспех"]], ["Кожаный доспех", ["Кожаный доспех"]]),
    slot(["Два коротких меча", ["Короткий меч", "Короткий меч"]], ["Два простых оружия ближнего боя", ["Простое оружие ближнего боя ×2"]]),
    slot(["Набор исследователя подземелий", ["Набор исследователя подземелий"]], ["Набор путешественника", ["Набор путешественника"]]),
    slot(["Длинный лук и колчан с 20 стрелами", ["Длинный лук", "Стрелы ×20", "Колчан"]]),
  ],
  "classes-sorcerer": [
    slot(["Лёгкий арбалет и 20 болтов", ["Лёгкий арбалет", "Арбалетные болты ×20"]], ["Любое простое оружие", ["Простое оружие (на выбор)"]]),
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
 * SRD 5.1 включает только одну предысторию целиком — Послушник (не тронута).
 * Остальные архетипы ниже — НЕ пересказ платной Книги игрока: только названия
 * архетипов взяты из её оглавления (родовые обозначения профессий вроде
 * «Солдат» или «Отшельник», не защищаемые как текст), а владения навыками,
 * снаряжение, золото и особенность придуманы самостоятельно от общего
 * жанрового образа архетипа, без подглядывания в механическую сборку книги
 * для конкретной предыстории — по той же логике, что уже применена для
 * `NAME_SUGGESTIONS` (см. комментарий над той константой).
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
  {
    id: "charlatan",
    title: "Шарлатан",
    skillProficiencies: ["Обман", "Убеждение"],
    equipment: [
      "Комплект приличной одежды под чужим именем",
      "Набор для подделки печатей и подписей",
      "Горстка поддельных драгоценностей",
      "Мешочек с гримом",
      "Кошелёк",
    ],
    gold: 15,
    feature:
      "Смена личины: у вас заготовлен запасной комплект документов и одежды на другое имя — раз за сессию вы можете выдать себя за это альтер эго перед людьми, не знающими вас лично, без проверки навыка.",
  },
  {
    id: "criminal",
    title: "Преступник",
    skillProficiencies: ["Расследование", "Скрытность"],
    equipment: [
      "Тёмный плащ с глубоким капюшоном",
      "Отмычки",
      "Мешочек с крадеными мелочами на продажу",
      "Поддельная печать одной из городских гильдий",
      "Кошелёк",
    ],
    gold: 15,
    feature:
      "Тайный связной: у вас есть контакт в преступном мире, который передаёт вести и укрывает вас от посторонних глаз — не бесплатно, но с гарантией молчания.",
  },
  {
    id: "entertainer",
    title: "Артист",
    skillProficiencies: ["Выступление", "Убеждение"],
    equipment: [
      "Музыкальный инструмент или реквизит на выбор",
      "Пёстрый сценический костюм",
      "Гримировальный набор",
      "Пачка писем от поклонников",
      "Комплект дорожной одежды",
    ],
    gold: 12,
    feature:
      "Слава трактиров: в любом достаточно крупном поселении найдётся хоть кто-то, слышавший о вас — это обеспечивает бесплатный ночлег в обмен на выступление перед постояльцами.",
  },
  {
    id: "folk-hero",
    title: "Народный герой",
    skillProficiencies: ["Атлетика", "Обращение с животными"],
    equipment: [
      "Набор рабочих инструментов родного ремесла",
      "Лопата",
      "Комплект простой одежды",
      "Фляга",
      "Мешочек с землёй родной деревни",
    ],
    gold: 10,
    feature:
      "Свой среди простых людей: обычные жители готовы бесплатно приютить и накормить вас, если это не подвергает их опасности — молва о вашем поступке разносится быстро.",
  },
  {
    id: "guild-artisan",
    title: "Гильдейский ремесленник",
    skillProficiencies: ["Расследование", "Убеждение"],
    equipment: [
      "Набор ремесленных инструментов одного ремесла",
      "Рекомендательное письмо от гильдии",
      "Комплект дорожной одежды",
      "Кошелёк",
    ],
    gold: 20,
    feature:
      "Гильдейская порука: гильдия оплачивает вам жильё и стол в любом городе, где у неё есть представительство, и помогает уладить мелкие конфликты с местными властями.",
  },
  {
    id: "hermit",
    title: "Отшельник",
    skillProficiencies: ["Природа", "Медицина"],
    equipment: [
      "Дневник наблюдений за много лет уединения",
      "Дорожный посох",
      "Тёплое одеяло",
      "Набор для розжига костра",
      "Скудный запас сухого пайка",
    ],
    gold: 12,
    feature:
      "Откровение уединения: за годы отшельничества вы пришли к необычному прозрению о мире — важной тайне, легенде или предзнаменовании, известном только вам одному.",
  },
  {
    id: "noble",
    title: "Дворянин",
    skillProficiencies: ["Проницательность", "Запугивание"],
    equipment: [
      "Фамильный перстень-печатка",
      "Комплект дорогой одежды",
      "Свиток с родословной семьи",
      "Флакон дорогих благовоний",
      "Кошелёк",
    ],
    gold: 25,
    feature:
      "Право голоса: в присутствии знати и чиновников к вам обращаются с уважением, подобающим титулу — вас принимают без очереди и выслушивают на аудиенциях.",
  },
  {
    id: "outlander",
    title: "Чужеземец",
    skillProficiencies: ["Выживание", "Природа"],
    equipment: [
      "Дорожный посох",
      "Ловчие силки",
      "Мешочек с сушёными травами и кореньями",
      "Шкура убитого зверя",
      "Фляга",
    ],
    gold: 10,
    feature:
      "Странник троп: вы никогда не теряетесь в дикой местности и можете вести спутников по неторным путям, находя воду и укрытие быстрее обычного путника.",
  },
  {
    id: "sage",
    title: "Мудрец",
    skillProficiencies: ["Расследование", "Магия"],
    equipment: [
      "Бутылочка чернил и перо",
      "Небольшой нож для правки свитков",
      "Письмо от покойного наставника с нерешённым вопросом",
      "Комплект простой одежды",
    ],
    gold: 10,
    feature:
      "Доступ к архивам: вы знаете, где искать редкие сведения — библиотеки, архивы и учёные сообщества почти всегда соглашаются пустить вас к своим фондам.",
  },
  {
    id: "sailor",
    title: "Моряк",
    skillProficiencies: ["Атлетика", "Природа"],
    equipment: [
      "Моток прочной верёвки",
      "Кортик",
      "Талисман на удачу",
      "Комплект рабочей одежды",
      "Кошелёк",
    ],
    gold: 12,
    feature:
      "Морское братство: в любом портовом городе вы находите бывших сослуживцев по палубе, готовых помочь с ночлегом или свести с попутным судном.",
  },
  {
    id: "soldier",
    title: "Солдат",
    skillProficiencies: ["Запугивание", "Восприятие"],
    equipment: [
      "Знак воинского отличия",
      "Игральные кости или карты",
      "Комплект обычной одежды",
      "Фляга",
      "Точильный камень",
    ],
    gold: 10,
    feature:
      "Воинское братство: бывшие сослуживцы узнают вас с первого взгляда и готовы одолжить снаряжение или замолвить слово перед местным командованием.",
  },
  {
    id: "urchin",
    title: "Беспризорник",
    skillProficiencies: ["Скрытность", "Восприятие"],
    equipment: [
      "Самодельный нож",
      "Потрёпанная карта знакомых переулков",
      "Мешочек с мелкими монетами",
      "Комплект простой одежды",
      "Памятная безделушка из детства",
    ],
    gold: 10,
    feature:
      "Городское дно: вы знаете все проходные дворы и закоулки города — можете провести спутников кратчайшим, но опасным путём, минуя стражу и толпу.",
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
  { name: "Метательное копьё", category: "simple-melee", cost: "5 см", damage: "1к6 колющий", weight: "2 фнт.", properties: "Метательное (дистанция 30/120)" },
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

export interface InstrumentData {
  name: string;
  cost: string;
  weight: string;
}

/** Музыкальные инструменты из таблицы «Инструменты» SRD 5.1 (rules.json → equipment-tools). */
export const INSTRUMENTS: InstrumentData[] = [
  { name: "Волынка", cost: "30 зм", weight: "6 фнт." },
  { name: "Барабан", cost: "6 зм", weight: "3 фнт." },
  { name: "Цимбалы", cost: "25 зм", weight: "10 фнт." },
  { name: "Флейта", cost: "2 зм", weight: "1 фнт." },
  { name: "Лютня", cost: "35 зм", weight: "2 фнт." },
  { name: "Лира", cost: "30 зм", weight: "2 фнт." },
  { name: "Рожок", cost: "3 зм", weight: "2 фнт." },
  { name: "Свирель", cost: "12 зм", weight: "2 фнт." },
  { name: "Шалмей", cost: "2 зм", weight: "1 фнт." },
  { name: "Виола", cost: "30 зм", weight: "1 фнт." },
];

export interface EquipmentChoiceOption {
  name: string;
  detail: string;
}

export interface EquipmentChoice {
  count: number;
  options: EquipmentChoiceOption[];
}

/**
 * Единая точка входа для плейсхолдеров вида «Любое ... (на выбор)» /
 * «Другой ...» в CLASS_EQUIPMENT — оружие и музыкальные инструменты решаются
 * общим механизмом в мастере персонажа вместо голого текста без вариантов.
 */
export function equipmentChoiceFor(item: string): EquipmentChoice | undefined {
  const weaponChoice = weaponChoiceFor(item);
  if (weaponChoice) {
    return {
      count: weaponChoice.count,
      options: weaponsInCategory(weaponChoice.categories).map((w) => ({
        name: w.name,
        detail: `${w.damage}${w.properties && w.properties !== "—" ? `, ${w.properties}` : ""}`,
      })),
    };
  }
  if (item === "Музыкальный инструмент (на выбор)") {
    return {
      count: 1,
      options: INSTRUMENTS.map((i) => ({ name: i.name, detail: `${i.cost}, ${i.weight}` })),
    };
  }
  return undefined;
}

export interface GearData {
  name: string;
  cost: string;
  weight: string;
}

/** Снаряжение искателя приключений из SRD 5.1 (rules.json → equipment-adventuring-gear). */
export const ADVENTURING_GEAR: GearData[] = [
  { name: "Алхимический огонь (фляга)", cost: "50 зм", weight: "1 фнт." },
  { name: "Блок и лебёдка", cost: "1 зм", weight: "5 фнт." },
  { name: "Арбалетные болты (20)", cost: "1 зм", weight: "1,5 фнт." },
  { name: "Иглы для духовой трубки (50)", cost: "1 зм", weight: "1 фнт." },
  { name: "Снаряды для пращи (20)", cost: "4 мм", weight: "1,5 фнт." },
  { name: "Стрелы (20)", cost: "1 зм", weight: "1 фнт." },
  { name: "Бочка", cost: "2 зм", weight: "70 фнт." },
  { name: "Бумага (один лист)", cost: "2 см", weight: "—" },
  { name: "Бурдюк", cost: "2 см", weight: "5 фнт. (полный)" },
  { name: "Бутылка, стеклянная", cost: "2 зм", weight: "2 фнт." },
  { name: "Ведро", cost: "5 мм", weight: "2 фнт." },
  { name: "Верёвка, пеньковая (50 футов)", cost: "1 зм", weight: "10 фнт." },
  { name: "Верёвка, шёлковая (50 футов)", cost: "10 зм", weight: "5 фнт." },
  { name: "Весы, купеческие", cost: "5 зм", weight: "3 фнт." },
  { name: "Гвозди, железные (10)", cost: "1 зм", weight: "5 фнт." },
  { name: "Горшок, железный", cost: "2 зм", weight: "10 фнт." },
  { name: "Духи (флакон)", cost: "5 зм", weight: "—" },
  { name: "Замок", cost: "10 зм", weight: "1 фнт." },
  { name: "Зелье лечения", cost: "50 зм", weight: "1/2 фнт." },
  { name: "Зеркало, стальное", cost: "5 зм", weight: "1/2 фнт." },
  { name: "Кандалы", cost: "2 зм", weight: "6 фнт." },
  { name: "Кирка, горняцкая", cost: "2 зм", weight: "10 фнт." },
  { name: "Кислота (флакон)", cost: "25 зм", weight: "1 фнт." },
  { name: "Книга", cost: "25 зм", weight: "5 фнт." },
  { name: "Книга заклинаний", cost: "50 зм", weight: "3 фнт." },
  { name: "Колокольчик", cost: "1 зм", weight: "—" },
  { name: "Колчан", cost: "1 зм", weight: "1 фнт." },
  { name: "Кольцо-печатка", cost: "5 зм", weight: "—" },
  { name: "Комплект для рыбалки", cost: "1 зм", weight: "4 фнт." },
  { name: "Контейнер для арбалетных болтов", cost: "1 зм", weight: "1 фнт." },
  { name: "Контейнер для карт и свитков", cost: "1 зм", weight: "1 фнт." },
  { name: "Корзина", cost: "4 см", weight: "2 фнт." },
  { name: "Кошель", cost: "5 см", weight: "1 фнт." },
  { name: "Крюк-кошка", cost: "2 зм", weight: "4 фнт." },
  { name: "Кувшин или графин", cost: "2 мм", weight: "4 фнт." },
  { name: "Лампа", cost: "5 см", weight: "1 фнт." },
  { name: "Лестница (10 футов)", cost: "1 см", weight: "25 фнт." },
  { name: "Ломик", cost: "2 зм", weight: "5 фнт." },
  { name: "Лопата", cost: "2 зм", weight: "5 фнт." },
  { name: "Жезл", cost: "10 зм", weight: "2 фнт." },
  { name: "Кристалл", cost: "10 зм", weight: "1 фнт." },
  { name: "Палочка", cost: "10 зм", weight: "1 фнт." },
  { name: "Посох", cost: "5 зм", weight: "4 фнт." },
  { name: "Шар", cost: "20 зм", weight: "3 фнт." },
  { name: "Масло (колба)", cost: "1 см", weight: "1 фнт." },
  { name: "Мел (1 кусочек)", cost: "1 мм", weight: "—" },
  { name: "Металлические шарики (1 000 шт. в сумке)", cost: "1 зм", weight: "2 фнт." },
  { name: "Мешок", cost: "1 мм", weight: "1/2 фнт." },
  { name: "Мешочек с компонентами", cost: "25 зм", weight: "2 фнт." },
  { name: "Молот, кузнечный", cost: "2 зм", weight: "10 фнт." },
  { name: "Молоток", cost: "1 зм", weight: "3 фнт." },
  { name: "Мыло", cost: "2 мм", weight: "—" },
  { name: "Набор альпиниста", cost: "25 зм", weight: "12 фнт." },
  { name: "Набор целителя", cost: "5 зм", weight: "3 фнт." },
  { name: "Одежда, дорожная", cost: "2 зм", weight: "4 фнт." },
  { name: "Одежда, костюм", cost: "5 зм", weight: "4 фнт." },
  { name: "Одежда, обычная", cost: "5 см", weight: "3 фнт." },
  { name: "Одежда, отличная", cost: "15 зм", weight: "6 фнт." },
  { name: "Одеяло", cost: "5 см", weight: "3 фнт." },
  { name: "Охотничий капкан", cost: "5 зм", weight: "25 фнт." },
  { name: "Палатка, двухместная", cost: "2 зм", weight: "20 фнт." },
  { name: "Пергамент (один лист)", cost: "1 см", weight: "—" },
  { name: "Песочные часы", cost: "25 зм", weight: "1 фнт." },
  { name: "Писчее перо", cost: "2 мм", weight: "—" },
  { name: "Подзорная труба", cost: "1,000 зм", weight: "1 фнт." },
  { name: "Противоядие (флакон)", cost: "50 зм", weight: "—" },
  { name: "Рационы (1 день)", cost: "5 см", weight: "2 фнт." },
  { name: "Роба", cost: "1 зм", weight: "4 фнт." },
  { name: "Рюкзак", cost: "2 зм", weight: "5 фнт." },
  { name: "Свеча", cost: "1 мм", weight: "—" },
  { name: "Святая вода (фляга)", cost: "25 зм", weight: "1 фнт." },
  { name: "Амулет", cost: "5 зм", weight: "1 фнт." },
  { name: "Ковчег", cost: "5 зм", weight: "2 фнт." },
  { name: "Эмблема", cost: "5 зм", weight: "—" },
  { name: "Сигнальный свисток", cost: "5 мм", weight: "—" },
  { name: "Спальник", cost: "1 зм", weight: "7 фнт." },
  { name: "Столовый набор", cost: "2 см", weight: "1 фнт." },
  { name: "Сундук", cost: "5 зм", weight: "25 фнт." },
  { name: "Сургуч", cost: "5 см", weight: "—" },
  { name: "Счеты", cost: "2 зм", weight: "2 фнт." },
  { name: "Таран, портативный", cost: "4 зм", weight: "35 фнт." },
  { name: "Точильный камень", cost: "1 мм", weight: "1 фнт." },
  { name: "Трутница", cost: "5 см", weight: "1 фнт." },
  { name: "Увеличительное стекло", cost: "100 зм", weight: "—" },
  { name: "Факел", cost: "1 мм", weight: "1 фнт." },
  { name: "Флакон", cost: "1 зм", weight: "—" },
  { name: "Фляжка или кружка", cost: "2 мм", weight: "1 фнт." },
  { name: "Веточка омелы", cost: "1 зм", weight: "—" },
  { name: "Деревянный посох", cost: "5 зм", weight: "4 фнт." },
  { name: "Тисовая палочка", cost: "10 зм", weight: "1 фнт." },
  { name: "Тотем", cost: "1 зм", weight: "—" },
  { name: "Фонарь, «Бычий глаз»", cost: "10 зм", weight: "2 фнт." },
  { name: "Фонарь, закрытый", cost: "5 зм", weight: "2 фнт." },
  { name: "Цепь (10 футов)", cost: "5 зм", weight: "10 фнт." },
  { name: "Чернила (бутылочка 30 грамм)", cost: "10 зм", weight: "—" },
  { name: "Чеснок (шипы) (20 штук в сумке)", cost: "1 зм", weight: "2 фнт." },
  { name: "Шест (10 футов)", cost: "5 мм", weight: "7 фнт." },
  { name: "Шлямбур", cost: "5 мм", weight: "1/4 фнт." },
  { name: "Яд, базовый (флакон)", cost: "100 зм", weight: "—" },
];

/** Доспехи из SRD 5.1 (rules.json → equipment-armor, таблица «Доспехи»). */
export const ARMOR: GearData[] = [
  { name: "Стёганый доспех", cost: "5 зм", weight: "8 фнт." },
  { name: "Кожаный доспех", cost: "10 зм", weight: "10 фнт." },
  { name: "Проклёпанная кожа", cost: "45 зм", weight: "13 фнт." },
  { name: "Доспех из шкур", cost: "10 зм", weight: "12 фнт." },
  { name: "Кольчужная рубаха", cost: "50 зм", weight: "20 фнт." },
  { name: "Чешуйчатый доспех", cost: "50 зм", weight: "45 фнт." },
  { name: "Кираса", cost: "400 зм", weight: "20 фнт." },
  { name: "Полулаты", cost: "750 зм", weight: "40 фнт." },
  { name: "Колечный доспех", cost: "30 зм", weight: "40 фнт." },
  { name: "Кольчуга", cost: "75 зм", weight: "55 фнт." },
  { name: "Наборной доспех", cost: "200 зм", weight: "60 фнт." },
  { name: "Латы", cost: "1500 зм", weight: "65 фнт." },
  { name: "Щит", cost: "10 зм", weight: "6 фнт." },
];

interface ArmorStats {
  baseAc: number;
  category: "light" | "medium" | "heavy";
}

/** КД по номиналу доспеха (SRD 5.1, таблица «Доспехи») — ключи совпадают с `ARMOR`/`CLASS_EQUIPMENT`. */
export const ARMOR_STATS: Record<string, ArmorStats> = {
  "Стёганый доспех": { baseAc: 11, category: "light" },
  "Кожаный доспех": { baseAc: 11, category: "light" },
  "Проклёпанная кожа": { baseAc: 12, category: "light" },
  "Доспех из шкур": { baseAc: 12, category: "medium" },
  "Кольчужная рубаха": { baseAc: 13, category: "medium" },
  "Чешуйчатый доспех": { baseAc: 14, category: "medium" },
  "Кираса": { baseAc: 14, category: "medium" },
  "Полулаты": { baseAc: 15, category: "medium" },
  "Колечный доспех": { baseAc: 14, category: "heavy" },
  "Кольчуга": { baseAc: 16, category: "heavy" },
  "Наборной доспех": { baseAc: 17, category: "heavy" },
  "Латы": { baseAc: 18, category: "heavy" },
};

const SHIELD_ITEM_NAMES = new Set(["Щит", "Деревянный щит"]);

/**
 * КД персонажа по SRD 5.1: базовое значение доспеха (лёгкий — полный модификатор
 * Ловкости, средний — не больше +2, тяжёлый — без Ловкости) плюс щит (+2), либо,
 * если доспех не надет, безоспешная защита варвара/монаха или безоспешная защита
 * архетипа (`SubclassGrants.unarmoredAc`, например «Драконья устойчивость»), плюс
 * боевой стиль «Оборона» бойца (+1, только в доспехе). Расы в SRD 5.1 не дают
 * бонусов к КД напрямую.
 *
 * Владение доспехом на КД по SRD не влияет вовсе — надетый не по владению доспех
 * даёт свою КД полностью, а расплата идёт помехой и запретом творить заклинания
 * (см. `unproficientArmorIssue`). Единственный владелец формулы КД — эта функция.
 */
export function computeArmorClass({
  classId,
  subclassName,
  abilities,
  inventoryItemNames,
  fightingStyle,
}: {
  classId: string;
  subclassName?: string;
  abilities: AbilityScores;
  inventoryItemNames: string[];
  fightingStyle?: string;
}): number {
  const dexMod = abilityMod(abilities.dexterity);
  const wornArmor = inventoryItemNames.map((n) => ARMOR_STATS[n]).find((a): a is ArmorStats => !!a);
  const hasShield = inventoryItemNames.some((n) => SHIELD_ITEM_NAMES.has(n));
  const unarmoredAc = subclassGrants(classId, subclassName)?.unarmoredAc;

  let base: number;
  if (wornArmor) {
    const dexBonus = wornArmor.category === "heavy" ? 0 : wornArmor.category === "medium" ? Math.min(dexMod, 2) : dexMod;
    base = wornArmor.baseAc + dexBonus;
    if (classId === "classes-fighter" && fightingStyle === "Оборона") base += 1;
  } else if (classId === "classes-barbarian") {
    base = 10 + dexMod + abilityMod(abilities.constitution);
  } else if (classId === "classes-monk" && !hasShield) {
    base = 10 + dexMod + abilityMod(abilities.wisdom);
  } else if (unarmoredAc) {
    base = unarmoredAc.base + dexMod;
  } else {
    base = 10 + dexMod;
  }

  return base + (hasShield ? 2 : 0);
}

/** Доспех/щит в инвентаре, на который у персонажа нет владения, — или `null`, если всё по владению. */
export function unproficientArmorIssue(
  inventoryItemNames: string[],
  armorProficiencies: string[],
): { items: string[] } | null {
  const items: string[] = [];
  for (const name of inventoryItemNames) {
    const stats = ARMOR_STATS[name];
    if (stats && !armorProficiencies.includes(stats.category)) items.push(name);
    if (SHIELD_ITEM_NAMES.has(name) && !armorProficiencies.includes("shields")) items.push(name);
  }
  return items.length > 0 ? { items: [...new Set(items)] } : null;
}

/** Расплата за доспех/щит не по владению — дословное правило SRD 5.1 (rules.json → equipment-armor). */
export const UNPROFICIENT_ARMOR_HINT =
  "Доспех или щит не по владению: помеха на проверки, спасброски и броски атаки, использующие Силу или Ловкость, и невозможно творить заклинания.";

/** Владеет ли персонаж этим оружием: по категории («простое»/«воинское») или поимённо. */
export function isProficientWithWeapon(weapon: WeaponData, weaponProficiencies: string[]): boolean {
  const category: WeaponProficiencyCategory = weapon.category.startsWith("martial") ? "martial" : "simple";
  return weaponProficiencies.includes(category) || weaponProficiencies.includes(weapon.name);
}

/**
 * Характеристика броска атаки и урона по свойствам оружия (SRD 5.1): дальнобойное —
 * Ловкость, фехтовальное — что выше из Силы и Ловкости, остальное — Сила.
 */
function weaponAttackAbility(weapon: WeaponData, abilities: AbilityScores): AbilityKey {
  if (weapon.category.endsWith("ranged")) return "dexterity";
  if (/фехтовальное/i.test(weapon.properties)) {
    return abilityMod(abilities.strength) >= abilityMod(abilities.dexterity) ? "strength" : "dexterity";
  }
  return "strength";
}

export interface WeaponAttack {
  weapon: WeaponData;
  ability: AbilityKey;
  proficient: boolean;
  attackBonus: number;
  /** Кость урона оружия и модификатор характеристики, например «1к8 рубящий +3». */
  damage: string;
}

/**
 * Бросок атаки оружием: модификатор характеристики плюс бонус мастерства, если
 * персонаж этим оружием владеет. Именно здесь владение оружием (в том числе
 * данное архетипом) превращается в число — SRD 5.1, «Броски атаки».
 */
export function weaponAttackFor(
  weapon: WeaponData,
  abilities: AbilityScores,
  level: number,
  weaponProficiencies: string[],
): WeaponAttack {
  const ability = weaponAttackAbility(weapon, abilities);
  const mod = abilityMod(abilities[ability]);
  const proficient = isProficientWithWeapon(weapon, weaponProficiencies);
  return {
    weapon,
    ability,
    proficient,
    attackBonus: mod + (proficient ? proficiencyBonusForLevel(level) : 0),
    damage: `${weapon.damage} ${fmtMod(mod)}`,
  };
}

/** Оружие из инвентаря, узнанное по названию строки таблицы `WEAPONS`. */
export function weaponsInInventory(inventoryItemNames: string[]): WeaponData[] {
  const seen = new Set<string>();
  const found: WeaponData[] = [];
  for (const name of inventoryItemNames) {
    const weapon = WEAPONS.find((w) => w.name === name);
    if (weapon && !seen.has(weapon.name)) {
      seen.add(weapon.name);
      found.push(weapon);
    }
  }
  return found;
}

/** Ограничение на число предметов своей предыстории — примерно как у Послушника (5). */
export const CUSTOM_BACKGROUND_EQUIPMENT_LIMIT = 7;

/** Видимый игроку предел возраста в мастере персонажа — произвольная защита от «бесконечных чисел». */
export const AGE_LIMIT = 500;

/** Видимый игроку предел золота своей предыстории — тот же потолок, что уже клампится в обработчике. */
export const CUSTOM_BACKGROUND_GOLD_LIMIT = 30;

/** Бонус мастерства на 1 уровне (SRD 5.1) — используется мастером персонажа (всегда создаёт 1 уровень). */
export const PROFICIENCY_BONUS_LEVEL_1 = 2;

/** Текст-подсказка про бонус мастерства, переиспользуется в мастере персонажа и в карточке. */
export const PROFICIENCY_BONUS_HINT = `Владение навыком или спасброском даёт +${PROFICIENCY_BONUS_LEVEL_1} (бонус мастерства) к проверкам/спасброскам`;

/**
 * Бонус мастерства по уровню персонажа — сверено по rules.json →
 * character-beyond-1-level («Развитие персонажа», таблица): уровни 1-4 → +2,
 * 5-8 → +3, 9-12 → +4. Диапазон 1-20 из SRD не нужен целиком — приложение
 * ограничивает левелинг уровнями 1-12 (см. MAX_LEVEL в CharactersPage.tsx и
 * tasks/open/characters-leveling-6-12.md); выше 12 таблица продолжается +5 и
 * +6, но эти строки здесь намеренно не заведены.
 */
export function proficiencyBonusForLevel(level: number): number {
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

/** Та же подсказка, что PROFICIENCY_BONUS_HINT, но с бонусом текущего уровня персонажа. */
export function proficiencyBonusHint(level: number): string {
  return `Владение навыком или спасброском даёт +${proficiencyBonusForLevel(level)} (бонус мастерства) к проверкам/спасброскам`;
}

/**
 * Опыт, необходимый для достижения уровня (индекс = уровень) — сверено по
 * rules.json → character-beyond-1-level, таблица «Развитие персонажа».
 * Табличные значения SRD, не формула — левелинг ограничен уровнями 1-12,
 * см. characters-leveling-6-12. Порог следующего уровня гейтит кнопку
 * «Повысить уровень» (canLevelUp), поэтому таблица обязана доходить ровно до
 * MAX_LEVEL: оборвись она раньше — кнопка замолчала бы до потолка.
 */
export const XP_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 300,
  3: 900,
  4: 2700,
  5: 6500,
  6: 14000,
  7: 23000,
  8: 34000,
  9: 48000,
  10: 64000,
  11: 85000,
  12: 100000,
};

/** Опыт, нужный для следующего уровня — null на максимальном/неизвестном уровне (нет порога дальше). */
export function xpNeededForNextLevel(level: number): number | null {
  return XP_THRESHOLDS[level + 1] ?? null;
}

/** Достаточно ли накопленного опыта, чтобы повысить уровень — гейтинг кнопки «Повысить уровень». */
export function canLevelUp(level: number, experiencePoints: number): boolean {
  const needed = xpNeededForNextLevel(level);
  return needed !== null && experiencePoints >= needed;
}

/**
 * Курс обмена номиналов SRD 5.1 (rules.json → equipment-coins), в медных
 * монетах: мм=1, см=10, эм=50, зм=100, пм=1000. Единственный владелец курса —
 * мастер персонажа и карточка берут значения отсюда, не задваивают.
 */
export const COIN_DENOMINATIONS: {
  key: keyof Coins;
  label: string;
  fullName: string;
  copperValue: number;
  icon: { fill: string; rim: string; shape: "round" | "square" | "scalloped" | "diamond" | "octagonal" };
}[] = [
  { key: "gold", label: "зм", fullName: "Золотые монеты", copperValue: 100, icon: { fill: "#d6a62e", rim: "#ffe17a", shape: "diamond" } },
  { key: "silver", label: "см", fullName: "Серебряные монеты", copperValue: 10, icon: { fill: "#aeb9c7", rim: "#edf5ff", shape: "square" } },
  { key: "copper", label: "мм", fullName: "Медные монеты", copperValue: 1, icon: { fill: "#b66a42", rim: "#efad75", shape: "round" } },
  { key: "platinum", label: "пм", fullName: "Платиновые монеты", copperValue: 1000, icon: { fill: "#80bad0", rim: "#ddf8ff", shape: "octagonal" } },
  { key: "electrum", label: "эм", fullName: "Электрумовые монеты", copperValue: 50, icon: { fill: "#b6b88b", rim: "#f1f0b5", shape: "scalloped" } },
];

/** Суммарная стоимость монет всех номиналов в золотых эквивалентах. */
export function coinsTotalGold(coins: Coins): number {
  const totalCopper = COIN_DENOMINATIONS.reduce((sum, d) => sum + coins[d.key] * d.copperValue, 0);
  return totalCopper / 100;
}

/** Общее число монет всех номиналов — вход для веса монет (50 монет = 1 фунт, см. characters-carrying-capacity). */
export function coinsTotalCount(coins: Coins): number {
  return COIN_DENOMINATIONS.reduce((sum, d) => sum + coins[d.key], 0);
}

/** 50 монет любого номинала весят 1 фунт (rules.json → equipment-coins, «пятьдесят любых монет весят... 1 фунт»). */
const COINS_PER_POUND = 50;

/** Вес монет персонажа в фунтах — общее число монет всех номиналов, делённое на курс выше. */
export function coinsWeightLb(coins: Coins): number {
  return coinsTotalCount(coins) / COINS_PER_POUND;
}

/**
 * Разбирает строку веса предмета каталога (вида «10 фнт.», «1/4 фнт.», «—») в
 * число фунтов. Единственное место, где это делается, — используется и
 * мастером персонажа (стартовое снаряжение), и карточкой (добавление в
 * инвентарь), чтобы не задваивать парсинг.
 */
export function parseItemWeightLb(weight: string): number {
  const fraction = weight.match(/(\d+)\s*\/\s*(\d+)/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const whole = weight.match(/\d+(\.\d+)?/);
  return whole ? Number(whole[0]) : 0;
}

/**
 * Вес предмета по имени из общего каталога (`ALL_ITEMS_WITH_COST`) — 0 для
 * полностью произвольного (не из каталога) названия, честное текущее
 * ограничение (не пытаемся угадать вес выдуманного предмета).
 *
 * Стартовое снаряжение мастера персонажа даёт часть предметов пачками вида
 * «Стрелы ×20» (см. `CLASS_EQUIPMENT`) — в каталоге под таким именем записи
 * нет ни у пачки («Стрелы (20)»), ни у поштучного веса без суффикса. Ищем
 * сначала пачку целиком, иначе берём вес одной штуки × количество.
 */
export function catalogWeightLb(itemName: string): number {
  const exact = ALL_ITEMS_WITH_COST.find((item) => item.name === itemName);
  if (exact) return parseItemWeightLb(exact.weight);

  const stacked = itemName.match(/^(.+) ×(\d+)$/);
  if (!stacked) return 0;
  const [, baseName, countStr] = stacked;
  const count = Number(countStr);

  const bundle = ALL_ITEMS_WITH_COST.find((item) => item.name === `${baseName} (${count})`);
  if (bundle) return parseItemWeightLb(bundle.weight);

  const unit = ALL_ITEMS_WITH_COST.find((item) => item.name === baseName);
  return unit ? parseItemWeightLb(unit.weight) * count : 0;
}

/** Грузоподъёмность SRD 5.1 (rules.json → gameplay-abilities): Сила × 15 фунтов, базовое (не вариативное) правило. */
export function carryingCapacityLb(strength: number): number {
  return strength * 15;
}

export type EncumbranceLevel = "normal" | "encumbered" | "heavily-encumbered";

/** Доля грузоподъёмности, с которой начинается «Нагружен» — правило приложения, см. encumbranceLevel. */
const ENCUMBERED_CAPACITY_SHARE = 0.9;

/**
 * Пороги нагрузки — ПРАВИЛО ПРИЛОЖЕНИЯ, а не книжное, и со справочником
 * оно расходится намеренно.
 *
 * Считается от грузоподъёмности (carryingCapacityLb, Сила × 15 — у множителя
 * один владелец): вес ≥ 90 % грузоподъёмности — «Нагружен», вес строго больше
 * грузоподъёмности — «Сильно нагружен». Ровно на потолке персонаж ещё
 * нагружен, но не сильно; грузоподъёмность при этом мягкая — перевес разрешён
 * и даёт статус, а не запрет (см. CharactersPage, wouldExceedCapacity).
 *
 * Почему не как в книге. В rules.json → gameplay-abilities лежит вариативное
 * правило «Нагрузка» с порогами Сила×5 и Сила×10; текст справочника дословный
 * и не правится (SRD-граница), поэтому расхождение видно глазами — это
 * ожидаемо, а не рассинхрон. Книжные пороги штрафовали персонажа за
 * нормальное снаряжение с его же листа: при Силе 15 грузоподъёмность 225 фнт,
 * а «Нагружен» наступал уже с 75 фнт — готовый жрец дварф получал плашку и
 * −10 футов на 42 % занятой грузоподъёмности, ещё ничего не сделав. Решение
 * владельца от 10 сентября 2026, карточка
 * characters-encumbrance-own-thresholds.
 *
 * Не «чинить» обратно по справочнику. Сами штрафы (−10 / −20 и помеха) не
 * менялись — они лишь переехали на эти пороги, чтобы плашка и штраф всегда
 * наступали вместе (encumbranceSpeedPenaltyFeet).
 */
export function encumbranceLevel(totalWeightLb: number, strength: number): EncumbranceLevel {
  const capacity = carryingCapacityLb(strength);
  if (totalWeightLb > capacity) return "heavily-encumbered";
  if (totalWeightLb >= capacity * ENCUMBERED_CAPACITY_SHARE) return "encumbered";
  return "normal";
}

/** Штраф к скорости в футах для уровня нагрузки (0 для обычного). */
export function encumbranceSpeedPenaltyFeet(level: EncumbranceLevel): number {
  if (level === "heavily-encumbered") return 20;
  if (level === "encumbered") return 10;
  return 0;
}

export const ENCUMBRANCE_LABELS: Record<EncumbranceLevel, string> = {
  normal: "",
  encumbered: "Нагружен",
  "heavily-encumbered": "Сильно нагружен",
};

/**
 * Предупреждение о перевесе рядом с добавлением предмета. Не запрет: потолок
 * мягкий, перевес разрешён и превращается в «Сильно нагружен» (encumbranceLevel).
 */
export const OVERLOAD_WARNING = "Перевес: станет «Сильно нагружен»";

/** Дословно из rules.json → gameplay-abilities, часть про «сильно нагружен». */
export const HEAVILY_ENCUMBERED_DISADVANTAGE_HINT =
  "Помеха на проверки характеристик, броски атаки и спасброски, использующие Силу, Ловкость или Телосложение.";

/** Суммарный вес инвентаря (без монет) — сумма веса единицы × количество по всем предметам. */
export function inventoryWeightLb(inventory: { weightLb: number; quantity: number }[]): number {
  return inventory.reduce((sum, item) => sum + item.weightLb * item.quantity, 0);
}

/**
 * Кость хитов класса (макс. значение, «1кN») — из абзаца «Кость хитов» в
 * теле класса (rules.json). Общая функция для мастера персонажа (стартовые
 * хиты 1 уровня) и левел-апа в карточке персонажа (хиты новых уровней).
 */
export function parseHitDie(classTopic: RuleTopic | undefined): number | null {
  if (!classTopic) return null;
  for (const b of classTopic.blocks) {
    if (b.type === "paragraph" && b.text.includes("Кость хитов")) {
      const m = b.text.match(/1к(\d+)/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

/**
 * Фиксированное среднее кости хитов («1кN (или M)») для левел-апа — из абзаца
 * «Хиты на следующих уровнях» в теле класса (rules.json). Берём готовое число
 * «или M» текстом класса, а не округляем вручную (см. «Контекст» в карточке
 * характерс-левелинг-1-5 — числа отличаются по кости хитов класса).
 */
export function parseHitDieAverage(classTopic: RuleTopic | undefined): number | null {
  if (!classTopic) return null;
  for (const b of classTopic.blocks) {
    if (b.type === "paragraph" && b.text.includes("Хиты на следующих уровнях")) {
      const m = b.text.match(/\(или (\d+)\)/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

/**
 * Полная формула макс. хитов персонажа на заданном уровне — стартовые хиты
 * 1 уровня (макс. кость + мод. Телосложения + расовый бонус) плюс среднее
 * кости хитов + мод. Телосложения за каждый уровень после первого.
 * Пересчитывается полностью при каждом левел-апе/изменении характеристик,
 * не хранится по кусочкам (см. «Архитектурное решение» в карточке).
 */
export function maxHpForLevel(
  hitDieMax: number,
  hitDieAverage: number,
  conMod: number,
  raceHpBonus: number,
  level: number,
): number {
  return Math.max(1, hitDieMax + conMod + raceHpBonus + (level - 1) * (hitDieAverage + conMod));
}

export interface ClassLevelFeature {
  name: string;
  description: string;
}

/**
 * Классовые особенности уровней 2-5 по каждому классу — сверено по таблице
 * прогрессии и тексту особенностей в rules.json (SRD 5.1, тело каждого
 * класса, `category: "classes"`). Уровень 1 не включён (уже показывается
 * через существующие расовые/классовые свойства на «Итоге» мастера — не
 * трогать, см. карточку characters-leveling-1-5). Улучшение характеристик
 * (ASI, 4 уровень) и название архетипа/подкласса на уровне его выбора сюда
 * намеренно НЕ включены — это отдельные механики (см. `confirmAsi` в
 * CharactersPage.tsx и CLASS_SUBCLASSES ниже).
 */
export const CLASS_LEVEL_FEATURES: Record<string, Record<number, ClassLevelFeature[]>> = {
  "classes-bard": {
    2: [
      {
        name: "Мастер на все руки",
        description:
          "Начиная со 2 уровня вы можете добавлять половину бонуса владения, округлённую в меньшую сторону, ко всем проверкам характеристик, куда этот бонус ещё не включён.",
      },
      {
        name: "Песнь отдыха",
        description:
          "Начиная со 2 уровня успокаивающей музыкой или речью вы помогаете раненым союзникам восстановить силы во время короткого отдыха: каждый, кто тратит Кость Хитов и слышит выступление, восстанавливает дополнительно 1к6 хитов.",
      },
    ],
    3: [
      {
        name: "Экспертиза",
        description:
          "На 3 уровне выберите два навыка, которыми вы владеете — бонус владения удваивается для всех проверок характеристик, использующих любое из этих владений.",
      },
    ],
    4: [],
    5: [
      {
        name: "Источник вдохновения",
        description:
          "Начиная с 5 уровня вы восстанавливаете все потраченные использования Вдохновения барда после короткого или длинного отдыха.",
      },
      {
        name: "Вдохновение барда (к8)",
        description: "Кость бардовского вдохновения становится к8 на 5 уровне (была к6).",
      },
    ],
  },
  "classes-barbarian": {
    2: [
      {
        name: "Безрассудная атака",
        description:
          "Начиная со 2 уровня вы можете атаковать безрассудно: рукопашные атаки Силой в этом ходу совершаются с преимуществом, но и все атаки по вам до вашего следующего хода — тоже с преимуществом.",
      },
      {
        name: "Чувство опасности",
        description:
          "На 2 уровне вы совершаете с преимуществом спасброски Ловкости от видимых эффектов (ловушки, заклинания), если не ослеплены, не оглохли и не недееспособны.",
      },
    ],
    3: [],
    4: [],
    5: [
      {
        name: "Дополнительная атака",
        description: "Начиная с 5 уровня, совершая действие «Атака», вы можете атаковать дважды вместо одного раза.",
      },
      {
        name: "Быстрое передвижение",
        description: "Начиная с 5 уровня ваша скорость увеличивается на 10 футов, если вы не носите тяжёлые доспехи.",
      },
    ],
  },
  "classes-fighter": {
    2: [
      {
        name: "Всплеск действий",
        description:
          "Начиная со 2 уровня вы можете совершить ещё одно действие в свой ход, помимо обычного действия и бонусного; после использования нужен короткий или длинный отдых для восстановления.",
      },
    ],
    3: [],
    4: [],
    5: [
      {
        name: "Дополнительная атака",
        description: "Начиная с 5 уровня, совершая действие «Атака», вы можете атаковать дважды вместо одного раза.",
      },
    ],
  },
  // По таблице прогрессии волшебника особенности на 2-5 уровнях ограничены
  // только подклассом (2 ур., «Магическая традиция») и ASI (4 ур.) — таблица
  // явно даёт «—» на 3 и 5 уровнях, это не пропуск в данных.
  "classes-wizard": {
    2: [],
    3: [],
    4: [],
    5: [],
  },
  "classes-druid": {
    2: [
      {
        name: "Дикий облик",
        description:
          "Начиная со 2 уровня вы можете действием принять облик виденного зверя с УО 1/4 или ниже, без скорости полёта или плавания. Умение доступно дважды, восстанавливается после короткого или длинного отдыха.",
      },
    ],
    3: [],
    4: [
      {
        name: "Улучшение дикой формы",
        description:
          "С 4 уровня максимальный УО зверя для Дикого облика повышается до 1/2, снимается ограничение на скорость плавания (полёт всё ещё недоступен) — например, крокодил.",
      },
    ],
    5: [],
  },
  "classes-cleric": {
    // «Умение божественного домена» на 2 уровне — доменно-специфичная
    // особенность (у Домена жизни, единственного в SRD) — намеренно не здесь,
    // это часть данных подкласса, см. CLASS_SUBCLASSES.
    2: [
      {
        name: "Проведение энергии",
        description:
          "На 2 уровне вы получаете возможность проводить божественную энергию: изначально доступны Изгнание нежити и эффект вашего домена. После использования нужен короткий или длинный отдых для восстановления.",
      },
    ],
    3: [],
    4: [],
    5: [
      {
        name: "Уничтожение нежити",
        description:
          "Начиная с 5 уровня нежить, провалившая спасбросок от Изгнания нежити с УО 1/2 или ниже, мгновенно уничтожается вместо изгнания.",
      },
    ],
  },
  "classes-warlock": {
    2: [
      {
        name: "Таинственные воззвания",
        description:
          "На 2 уровне вы получаете два тайных воззвания на выбор из списка в конце описания класса; при получении новых уровней колдуна можно менять известные воззвания.",
      },
    ],
    3: [
      {
        name: "Предмет договора",
        description:
          "На 3 уровне покровитель дарует один из даров на выбор: Договор клинка (призываемое оружие договора), Договор цепи (необычный фамильяр) или Договор гримуара (книга теней с тремя дополнительными заговорами).",
      },
    ],
    4: [],
    5: [],
  },
  "classes-monk": {
    2: [
      {
        name: "Перемещение без доспеха",
        description:
          "Начиная со 2 уровня ваша скорость увеличивается на 10 футов, если вы не носите доспехов и щит; бонус растёт на более высоких уровнях монаха.",
      },
      {
        name: "Ци",
        description:
          "Начиная со 2 уровня вы получаете очки ци и три умения ци: Поступь ветра, Терпеливая оборона и Шквал ударов; очки восстанавливаются после короткого или длинного отдыха.",
      },
    ],
    3: [
      {
        name: "Отражение снарядов",
        description:
          "Начиная с 3 уровня реакцией вы можете отразить или поймать снаряд дальнобойной атаки, снизив урон на 1к10 + модификатор Ловкости + уровень монаха.",
      },
    ],
    4: [
      {
        name: "Медленное падение",
        description:
          "Начиная с 4 уровня реакцией вы можете уменьшить урон от падения на значение, равное вашему уровню монаха, умноженному на пять.",
      },
    ],
    5: [
      {
        name: "Дополнительная атака",
        description: "Начиная с 5 уровня, совершая действие «Атака», вы можете атаковать дважды вместо одного раза.",
      },
      {
        name: "Ошеломляющий удар",
        description:
          "Начиная с 5 уровня, попав по существу атакой ближнего боя, вы можете потратить 1 очко ци: цель совершает спасбросок Телосложения или становится ошеломлённой до конца вашего следующего хода.",
      },
    ],
  },
  "classes-paladin": {
    2: [
      {
        name: "Боевой стиль",
        description:
          "На 2 уровне вы выбираете один боевой стиль (Стрельба из лука, Оборона, Дуэлянт, Сражение большим оружием или Защита), соответствующий вашей специализации.",
      },
      {
        name: "Сотворение заклинаний",
        description:
          "Получая 2 уровень, вы учитесь творить божественные заклинания подобно жрецу, используя Харизму как заклинательную характеристику.",
      },
      {
        name: "Божественная кара",
        description:
          "Начиная со 2 уровня, попав по существу рукопашной атакой оружием, вы можете потратить ячейку заклинания, чтобы причинить дополнительный лучистый урон 2к8 за ячейку 1 уровня (+1к8 за каждый уровень ячейки выше, максимум 5к8; +1к8 против нежити/исчадий).",
      },
    ],
    3: [
      {
        name: "Божественное здоровье",
        description: "Начиная с 3 уровня божественная магия даёт вам иммунитет к болезням.",
      },
    ],
    4: [],
    5: [
      {
        name: "Дополнительная атака",
        description: "Начиная с 5 уровня, совершая действие «Атака», вы можете атаковать дважды вместо одного раза.",
      },
    ],
  },
  "classes-rogue": {
    2: [
      {
        name: "Хитрое действие",
        description:
          "Начиная со 2 уровня вы можете каждый ход боя совершать бонусное действие — только для Рывка, Отхода или Засады.",
      },
    ],
    3: [],
    4: [],
    5: [
      {
        name: "Невероятное уклонение",
        description:
          "Начиная с 5 уровня, когда видимый вами нападающий попадает по вам атакой, вы можете реакцией уменьшить урон от неё вдвое.",
      },
    ],
  },
  "classes-ranger": {
    2: [
      {
        name: "Боевой стиль",
        description:
          "На 2 уровне вы выбираете один боевой стиль (Стрельба из лука, Оборона, Дуэлянт или Сражение двумя оружиями), соответствующий вашей специализации.",
      },
      {
        name: "Сотворение заклинаний",
        description:
          "Получив 2 уровень, вы обучаетесь творить заклинания природы подобно друиду, используя Мудрость как заклинательную характеристику; на 2 уровне знаете два заклинания 1 круга.",
      },
    ],
    3: [
      {
        name: "Первозданная осведомлённость",
        description:
          "Начиная с 3 уровня действием и ячейкой заклинаний вы можете на время ощутить присутствие аберраций, драконов, исчадий, небожителей, нежити, фей и элементалей в пределах 1 мили (6 миль в избранной местности), без раскрытия их точного положения.",
      },
    ],
    4: [],
    5: [
      {
        name: "Дополнительная атака",
        description: "Начиная с 5 уровня, совершая действие «Атака», вы можете атаковать дважды вместо одного раза.",
      },
    ],
  },
  "classes-sorcerer": {
    2: [
      {
        name: "Источник магии",
        description:
          "На 2 уровне вы получаете очки чар (2 на этом уровне, больше — на высоких уровнях): ими можно создавать дополнительные ячейки заклинаний или, наоборот, превращать ячейки в очки чар; восстанавливаются после длинного отдыха.",
      },
    ],
    3: [
      {
        name: "Метамагия",
        description:
          "На 3 уровне вы выбираете два варианта метамагии из списка в конце описания класса, позволяющих подстраивать заклинания под свои нужды (обычно не более одного варианта за сотворение).",
      },
    ],
    4: [],
    5: [],
  },
};

/**
 * Что именно делает применение варианта архетипа. Разбор — в
 * `subclassEffectValue`: каждый вид считает своё число от уровня и
 * характеристик, словесное описание живёт в тексте особенности и здесь не
 * дублируется.
 */
export type SubclassEffect =
  /** Запас хитов на распределение (Сохранение жизни: 5 × уровень). */
  | { kind: "healing-pool"; perLevel: number }
  /** Временные хиты союзникам (Боевой клич: уровень жреца). */
  | { kind: "temp-hp-allies"; perLevel: number }
  /** Спасбросок против СЛ заклинаний персонажа (Обманный след). */
  | { kind: "saving-throw"; against: AbilityKey }
  /** Бонус к броскам атаки от характеристики, не ниже `min` (Священное оружие). */
  | { kind: "attack-bonus"; ability: AbilityKey; min: number }
  /** Временные хиты самому персонажу: `perLevel` × уровень плюс модификатор характеристики (Благословение темнейшего, Крепкая форма). */
  | { kind: "temp-hp-self"; perLevel: number; ability?: AbilityKey; min?: number }
  /** Кость, бросок которой прибавляется к чужому или своему броску (кость превосходства, Благословение созвездия). */
  | { kind: "bonus-dice"; count: number; die: number }
  /** Дополнительный урон костями (Стихийный всплеск — 1к6, Заряженный клинок — 1к8). */
  | { kind: "bonus-damage-dice"; count: number; die: number }
  /** Дополнительный урон плоским числом от уровня или бонуса мастерства (Первый и последний удар, Сокрушительный напор). */
  | { kind: "bonus-damage-flat"; per: "level" | "proficiency" }
  /** Число существ/целей от круга заклинания: круг + `plus` (Лепка заклинаний — 1 + круг). */
  | { kind: "spell-circle-plus"; plus: number }
  /** Половина круга заклинания с округлением вверх (Живучая плоть). */
  | { kind: "spell-circle-half" }
  /** Половина уровня персонажа с округлением вверх (Естественное восстановление). */
  | { kind: "half-level" }
  /** Максимум хитов звериного спутника: `perLevel` × уровень. */
  | { kind: "companion-hp"; perLevel: number }
  /** Восстановление потраченной ячейки заклинаний указанного круга — единственный эффект, который реально меняет ячейки. */
  | { kind: "restore-slot"; circle: number }
  /** Эффект без числа — целиком описан текстом особенности (сопротивление, преимущество союзнику). */
  | { kind: "descriptive" };

/**
 * Применение архетипа, тратящее использование уже существующего ресурса
 * (`resourceId` — id из таблицы `classProgression.ts`, например
 * `channel-divinity`). Счётчик один на все варианты: SRD тратит одно
 * использование Проведения энергии, каким бы вариантом ни воспользовались.
 */
export interface SubclassResourceOption {
  id: string;
  resourceId: string;
  name: string;
  minLevel: number;
  effect: SubclassEffect;
  /** Сколько использований ресурса тратит применение; по умолчанию одно (Тень между вздохов — 2 очка ци). */
  cost?: number;
}

/**
 * Число архетипа, которое действует всегда и ничего не тратит, — аналог
 * `ClassScalingValue` класса, но считается от уровня и характеристик тем же
 * `subclassEffectValue`, что и варианты с кнопкой. Владелец числа один, текст
 * особенности остаётся в `featuresByLevel`.
 */
export interface SubclassScalingValue {
  name: string;
  minLevel: number;
  effect: SubclassEffect;
}

/**
 * Один вариант выбора внутри архетипа (`SubclassChoice.options`) — фрагмент
 * `SubclassGrants`, который подмешивается к грантам архетипа, если игрок его
 * выбрал (см. `effectiveSubclassGrants`). Не заводит отдельной системы: Круг
 * земли, например, просто кладёт местную таблицу заклинаний в `grants.
 * spellsByLevel` этого варианта — она пойдёт через уже существующий
 * `subclassSpellsUpToLevel`.
 */
export interface SubclassChoiceOption {
  id: string;
  label: string;
  grants: SubclassGrants;
}

/**
 * Выбор игрока внутри архетипа — «одно/N из списка», а не то, что даётся
 * безусловно (Добыча охотника Следопыта, Дополнительные навыки барда, Круг
 * земли друида). Персонаж хранит сделанный выбор в `Character.
 * subclassChoices` по `id`; левел-ап открывает панель выбора, если на новом
 * уровне появляется ещё не сделанный `choice` (см. `requestLevelUp` в
 * CharactersPage.tsx).
 */
export interface SubclassChoice {
  /** Стабильный id выбора, напр. "hunter-prey" — ключ в `Character.subclassChoices`. */
  id: string;
  /** Название особенности для панели/карточки. */
  name: string;
  minLevel: number;
  /** Сколько вариантов выбрать (1 — радиокнопки, больше одного — чекбоксы с потолком). */
  pick: number;
  options: SubclassChoiceOption[];
}

/**
 * Механическая часть архетипа — то, что читает движок. Текст особенностей
 * остаётся в `featuresByLevel` и здесь не повторяется: у каждого факта один
 * владелец, здесь живут только числа и владения.
 */
export interface SubclassGrants {
  armor?: ArmorProficiency[];
  weaponCategories?: WeaponProficiencyCategory[];
  weapons?: string[];
  skills?: string[];
  /** Владение инструментами по названию набора (воровские инструменты, набор для отравления). */
  toolProficiencies?: string[];
  /** Сопротивление видам урона, действующее постоянно (Дитя шторма — электричество и гром). */
  damageResistances?: string[];
  /** Заговоры сверх нормы класса: сколько и из чьего списка (Мистический ловкач — два заговора волшебника). */
  bonusCantrips?: { count: number; fromClassId?: string };
  /** Наименьший результат кости атаки, считающийся критическим попаданием (Воитель — 19 вместо 20). */
  critRange?: number;
  /** Числа архетипа, действующие всегда и ничего не тратящие. */
  scaling?: SubclassScalingValue[];
  /** Безоспешная защита архетипа: КД = `base` + модификатор Ловкости (Драконья устойчивость — 13). */
  unarmoredAc?: { base: number };
  /** Собственный ресурс архетипа сверх классовых — тот же тип, что у класса. */
  resources?: ClassResource[];
  /** Варианты траты уже существующего классового ресурса. */
  resourceOptions?: SubclassResourceOption[];
  /** Заклинания домена/архетипа по уровню персонажа: всегда подготовлены, сверх обычного списка. */
  spellsByLevel?: Record<number, string[]>;
  /** Прибавка к лечению заклинанием: `flat` + круг заклинания (Защитник жизни — 2 + круг). */
  healingBonus?: { flat: number };
  /** Выбор игрока, открывающий этот фрагмент грантов при отметке варианта — см. `SubclassChoice`. */
  choices?: SubclassChoice[];
}

export interface ClassSubclass {
  name: string;
  /**
   * Только у оригинальных архетипов карточки characters-original-subclasses
   * (см. ORIGINAL_SUBCLASS_NAMES ниже) — 2-3 предложения авторского текста
   * для UI выбора. У исходного SRD-архетипа каждого класса не заполнено:
   * его описание — сам список особенностей, дублировать нечем.
   */
  description?: string;
  featuresByLevel: Record<number, ClassLevelFeature[]>;
  /**
   * Механический эффект архетипа. Пусто у архетипов, чьи особенности пока
   * только текст, — см. отчёт карточки
   * characters-subclass-features-have-no-mechanical-effect.
   */
  grants?: SubclassGrants;
}

export interface ClassSubclassInfo {
  /** Уровень, на котором класс выбирает архетип/подкласс — см. таблицу в карточке characters-leveling-1-5. */
  chosenAtLevel: number;
  /**
   * SRD 5.1 в rules.json даёт РОВНО ОДИН полностью описанный архетип на
   * каждый класс (сверено при чтении файла для этой карточки) — это всегда
   * subclasses[0]. Карточка characters-original-subclasses добавила по два
   * оригинальных архетипа поверх него (subclasses[1], subclasses[2]) — тема
   * имени сверена по личной PHB владельца продукта (см. srd-only-content-
   * boundary), особенности написаны 100% оригинальным текстом. Три и более
   * варианта — реальный UI-выбор (не автоподстановка первого), см.
   * `level1Subclass`/`chosenSubclassIndex` в CharacterWizard.tsx и
   * `subclassPanelOpen` в CharactersPage.tsx.
   */
  subclasses: ClassSubclass[];
}

/**
 * Проведение энергии паладина — ресурс, которого нет в таблице класса: его даёт
 * сама клятва (архетип), поэтому он живёт в грантах, а не в
 * `CLASS_PROGRESSION`. Счётчик один на обе способности клятвы, как и у жреца.
 */
const PALADIN_CHANNEL_DIVINITY: ClassResource = {
  id: "channel-divinity",
  name: "Проведение энергии",
  max: 1,
  recharge: "short",
  unit: "использование",
};

/**
 * Архетипы/подклассы по классам — subclasses[0] каждого класса из тела
 * класса в rules.json (SRD 5.1), заголовок архетипа, затем его особенности
 * по уровням. Уровень выбора — см. CLASS_SUBCLASSES[id].chosenAtLevel (для
 * Жреца/Колдуна/Чародея это 1 уровень — уже на «Итоге» мастера, см.
 * CharacterWizard.tsx `finish()`; для остальных 9 классов — левел-ап в
 * CharactersPage.tsx `applyLevelUp`). subclasses[1] и subclasses[2] —
 * оригинальные архетипы (см. ClassSubclassInfo.subclasses выше).
 */
export const CLASS_SUBCLASSES: Record<string, ClassSubclassInfo> = {
  "classes-cleric": {
    chosenAtLevel: 1,
    subclasses: [
      {
        name: "Домен жизни",
        grants: {
          armor: ["heavy"],
          healingBonus: { flat: 2 },
          resourceOptions: [
            {
              id: "preserve-life",
              resourceId: "channel-divinity",
              name: "Сохранение жизни",
              minLevel: 2,
              effect: { kind: "healing-pool", perLevel: 5 },
            },
          ],
          // Заклинания домена SRD 5.1 (rules.json → тело класса Жрец, Домен жизни).
          spellsByLevel: {
            1: ["bless", "cure-wounds"],
            3: ["lesser-restoration", "spiritual-weapon"],
            5: ["beacon-of-hope", "revivify"],
          },
        },
        featuresByLevel: {
          1: [
            {
              name: "Дополнительное владение навыками",
              description: "Когда вы выбираете этот домен на 1 уровне, вы получаете владение тяжёлыми доспехами.",
            },
            {
              name: "Защитник жизни",
              description:
                "Начиная с 1 уровня ваши исцеляющие заклинания эффективнее: каждый раз, когда вы используете заклинание 1 круга или выше, восстанавливающее хиты, существо восстанавливает дополнительно 2 + круг заклинания хитов.",
            },
          ],
          2: [
            {
              name: "Проведение энергии: Сохранение жизни",
              description:
                "Начиная со 2 уровня действием вы призываете жизненную энергию, исцеляющую количество хитов, равное пятикратному уровню жреца, распределяя их между существами в пределах 30 футов. Не может поднять существо выше половины его максимума хитов; не действует на нежить и конструктов.",
            },
          ],
        },
      },
      // Оригинальные архетипы карточки characters-original-subclasses — тема
      // имени сверена по личной PHB владельца продукта (домены жизни/войны/
      // обмана существуют и там), особенности написаны 100% оригинальным
      // текстом, не копируют книжную комбинацию.
      {
        name: "Домен войны",
        description:
          "Домен войны служит богам сражения и стойкости — его жрецы не просто исцеляют раненых, а вдохновляют дружину не отступать перед лицом смерти.",
        grants: {
          armor: ["heavy"],
          weaponCategories: ["martial"],
          resourceOptions: [
            {
              id: "voice-of-battle",
              resourceId: "channel-divinity",
              name: "Голос сражения",
              minLevel: 1,
              effect: { kind: "descriptive" },
            },
            {
              id: "battle-cry",
              resourceId: "channel-divinity",
              name: "Боевой клич",
              minLevel: 2,
              effect: { kind: "temp-hp-allies", perLevel: 1 },
            },
          ],
          // Заклинания домена оригинального архетипа — подобраны из уже
          // имеющегося списка жреца в spells.json, не скопированы из книги.
          spellsByLevel: {
            1: ["guiding-bolt", "shield-of-faith"],
            3: ["spiritual-weapon", "enhance-ability"],
            5: ["spirit-guardians", "protection-from-energy"],
          },
        },
        featuresByLevel: {
          1: [
            {
              name: "Дополнительное владение оружием",
              description: "Когда вы выбираете этот домен на 1 уровне, вы получаете владение воинским оружием и тяжёлыми доспехами.",
            },
            {
              name: "Голос сражения",
              description:
                "Начиная с 1 уровня, когда союзник в пределах 30 футов совершает бросок атаки, вы можете реакцией потратить одно использование Проведения энергии, чтобы дать ему преимущество на этот бросок.",
            },
          ],
          2: [
            {
              name: "Проведение энергии: Боевой клич",
              description:
                "Начиная со 2 уровня действием вы издаёте боевой клич: все союзники в пределах 30 футов, слышащие вас, получают временные хиты, равные вашему уровню жреца, до конца следующего боя или короткого отдыха.",
            },
          ],
        },
      },
      {
        name: "Домен обмана",
        description:
          "Домен обмана служит покровителям хитрости и притворства — божественная сила здесь проявляется не молнией с небес, а точным словом в нужный миг.",
        grants: {
          skills: ["Обман"],
          resourceOptions: [
            {
              id: "deceptive-trail",
              resourceId: "channel-divinity",
              name: "Обманный след",
              minLevel: 2,
              effect: { kind: "saving-throw", against: "wisdom" },
            },
          ],
          spellsByLevel: {
            1: ["sanctuary", "bane"],
            3: ["blindness-deafness", "silence"],
            5: ["dispel-magic", "clairvoyance"],
          },
        },
        featuresByLevel: {
          1: [
            {
              name: "Дополнительное владение навыком",
              description: "Когда вы выбираете этот домен на 1 уровне, вы получаете владение навыком Обман.",
            },
            {
              name: "Благословенная маска",
              description:
                "Начиная с 1 уровня заклинания, поддерживающие иллюзию или маскировку, длятся вдвое дольше, если их цель — вы сами.",
            },
          ],
          2: [
            {
              name: "Проведение энергии: Обманный след",
              description:
                "Начиная со 2 уровня действием вы призываете божественную энергию: одно существо в пределах 30 футов, которое видит вас, должно спастись Мудростью или в течение 1 минуты видеть вас стоящим в другом месте (в пределах 10 футов от настоящего вас), что даёт вам преимущество на первую атаку по нему в этот срок.",
            },
          ],
        },
      },
      // Четвёртый домен Жреца — оригинальный, карточка
      // characters-preset-pool-remaining-11. Заведён потому, что лист
      // «Селиэн Ардвен» несёт домен Знаний (PHB, вне SRD): переносить его
      // текст и механику нельзя, поэтому дыра закрыта своим доменом близкой
      // темы — узнавание скрытого. Тема взята как настроение, особенности и
      // числа написаны здесь и в книгу не заглядывают.
      {
        name: "Домен прозрения",
        description:
          "Домен прозрения служит богам предвидения и записанного слова. Его жрецы верят, что молитва должна не заслонять мир, а показывать его таким, каков он есть, и потому узнают первыми то, о чём остальные ещё только догадываются.",
        grants: {
          skills: ["Магия", "Религия"],
          scaling: [{ name: "Чтение по мелочам", minLevel: 1, effect: { kind: "bonus-dice", count: 1, die: 4 } }],
          resourceOptions: [
            {
              id: "revealing-word",
              resourceId: "channel-divinity",
              name: "Раскрывающее слово",
              minLevel: 2,
              effect: { kind: "saving-throw", against: "charisma" },
            },
          ],
          // Заклинания домена подобраны из уже имеющегося списка жреца в
          // spells.json по теме узнавания скрытого — домен оригинальный,
          // книжного списка у него нет.
          spellsByLevel: {
            1: ["identify", "detect-magic"],
            3: ["augury", "locate-object"],
            5: ["clairvoyance", "speak-with-dead"],
          },
        },
        featuresByLevel: {
          1: [
            {
              name: "Наследие писцов",
              description: "Когда вы выбираете этот домен на 1 уровне, вы получаете владение навыками Магия и Религия.",
            },
            {
              name: "Чтение по мелочам",
              description:
                "Начиная с 1 уровня вы замечаете в обстановке то, что другим кажется случайным. Один раз между продолжительными отдыхами вы можете бросить к4 и прибавить результат к проверке Интеллекта или Мудрости — объявив это после броска кости, но прежде чем Мастер назовёт исход проверки.",
            },
          ],
          2: [
            {
              name: "Проведение энергии: Раскрывающее слово",
              description:
                "Начиная со 2 уровня действием вы называете вслух то, что существо в пределах 30 футов старается скрыть. Оно совершает спасбросок Харизмы; при провале в течение 1 минуты его маскировка, иллюзорный облик и ложь о себе не действуют ни на вас, ни на тех, кто слышал ваше слово, и раньше срока эта минута не кончается.",
            },
          ],
        },
      },
    ],
  },
  "classes-warlock": {
    chosenAtLevel: 1,
    subclasses: [
      {
        // SRD текстом упоминает три покровителя (Архифея, Исчадие, Великий Древний), но только «Исчадие» расписано полностью в rules.json.
        name: "Исчадие",
        grants: {
          // Расширенный список Исчадия SRD 5.1 по кругам договора: 1-2 уровни —
          // 1 круг, 3-4 — 2 круг, 5 — 3 круг (PACT_MAGIC_SLOTS в classProgression.ts).
          spellsByLevel: {
            1: ["burning-hands", "command"],
            3: ["blindness-deafness", "scorching-ray"],
            5: ["fireball", "stinking-cloud"],
          },
          scaling: [
            { name: "Благословение темнейшего", minLevel: 1, effect: { kind: "temp-hp-self", perLevel: 1, ability: "charisma", min: 1 } },
          ],
        },
        featuresByLevel: {
          1: [
            {
              name: "Расширенный список заклинаний",
              description:
                "Исчадие добавляет в ваш список заклинаний колдуна дополнительные заклинания по кругам (1 круг: огненные ладони, приказ; 2 круг: слепота/глухота, палящий луч; 3 круг: огненный шар, зловонное облако).",
            },
            {
              name: "Благословение темнейшего",
              description:
                "Начиная с 1 уровня, когда вы опускаете хиты враждебного существа до 0, вы получаете временные хиты, равные модификатору Харизмы + уровень колдуна (минимум 1).",
            },
          ],
        },
      },
      // Оригинальные покровители карточки characters-original-subclasses —
      // имена сверены по личной PHB владельца продукта (Архифея и Великий
      // Древний там есть), особенности написаны оригинальным текстом.
      {
        name: "Покровитель-Архифея",
        description:
          "Ваш покровитель — существо из Страны Фей, обещающее не силу разрушения, а тайное знание и благосклонность природы, взамен на услуги в её вечных играх.",
        grants: {
          // Список подобран из заклинаний spells.json по теме очарования и
          // иллюзии — покровитель оригинальный, книжного списка у него нет.
          spellsByLevel: {
            1: ["charm-person", "faerie-fire"],
            3: ["calm-emotions", "invisibility"],
            5: ["blink", "plant-growth"],
          },
        },
        featuresByLevel: {
          1: [
            {
              name: "Расширенный список заклинаний",
              description:
                "Архифея добавляет в ваш список заклинаний колдуна дополнительные заклинания по кругам (1 круг: очарование личности, огонь фей; 2 круг: успокоение эмоций, невидимость; 3 круг: мерцание, рост растений).",
            },
            {
              name: "Обманчивый шаг",
              description:
                "Начиная с 1 уровня, когда существо промахивается по вам атакой, вы можете реакцией переместиться на 5 футов, не провоцируя атак.",
            },
          ],
        },
      },
      {
        name: "Покровитель-Древний Ужас",
        description:
          "Ваш покровитель — разум, дремлющий за гранью звёзд; его дары пугающе действенны, а цена — эхо его чуждых мыслей, изредка проступающее в вашей голове.",
        grants: {
          // Список подобран из заклинаний spells.json по теме разума и страха —
          // покровитель оригинальный, книжного списка у него нет.
          spellsByLevel: {
            1: ["hideous-laughter", "false-life"],
            3: ["detect-thoughts", "hold-person"],
            5: ["fear", "hypnotic-pattern"],
          },
          scaling: [{ name: "Шёпот безумия", minLevel: 1, effect: { kind: "saving-throw", against: "wisdom" } }],
        },
        featuresByLevel: {
          1: [
            {
              name: "Расширенный список заклинаний",
              description:
                "Древний Ужас добавляет в ваш список заклинаний колдуна дополнительные заклинания по кругам (1 круг: жуткий хохот, ложная жизнь; 2 круг: обнаружение мыслей, удержание личности; 3 круг: страх, гипнотический узор).",
            },
            {
              name: "Шёпот безумия",
              description:
                "Начиная с 1 уровня, когда вы опускаете хиты враждебного существа до 0, одно другое существо в пределах 30 футов, видевшее это, совершает спасбросок Мудрости или получает помеху на следующий бросок до начала вашего следующего хода.",
            },
          ],
        },
      },
    ],
  },
  "classes-sorcerer": {
    chosenAtLevel: 1,
    subclasses: [
      {
        // Текст упоминает «дикую магию» как вторую категорию происхождения, но детально расписано только «Наследие драконьей крови».
        name: "Наследие драконьей крови",
        // «Драконья устойчивость»: КД 13 + Ловкость без доспеха.
        grants: { unarmoredAc: { base: 13 } },
        featuresByLevel: {
          1: [
            {
              name: "Драконий предок",
              description:
                "На 1 уровне вы выбираете вид дракона-предка (Чёрный/Синий/Латунный/Бронзовый/Медный/Золотой/Зелёный/Красный/Серебряный/Белый) — связанный с ним вид урона используется в ваших умениях. Вы также говорите, читаете и пишете на Драконьем, и бонус мастерства удваивается при проверках Харизмы с драконами.",
            },
            {
              name: "Драконья устойчивость",
              description:
                "Максимум хитов увеличивается на 1 на 1 уровне и ещё на 1 за каждый уровень чародея. Без доспехов ваш КД равен 13 + модификатор Ловкости.",
            },
          ],
        },
      },
      // Оригинальные происхождения карточки characters-original-subclasses —
      // имена сверены по личной PHB владельца продукта (Дикая магия и
      // Происхождение от бури там есть), особенности написаны оригинальным
      // текстом.
      {
        name: "Дикая магия",
        description:
          "Ваша магия чародея пришла не от предка и не от осознанной сделки — она хлынула в вас случайно, и по сей день порой выплёскивается непредсказуемо, стоит вам напрячь волю сильнее обычного.",
        grants: {
          // «Дикий всплеск» числом не выражается: это бросок Мастера, а не
          // ресурс персонажа, — остаётся текстом особенности.
          resourceOptions: [
            {
              id: "saving-magic",
              resourceId: "sorcery-points",
              name: "Спасительная магия",
              minLevel: 2,
              effect: { kind: "bonus-dice", count: 1, die: 6 },
            },
          ],
        },
        featuresByLevel: {
          1: [
            {
              name: "Дикий всплеск",
              description:
                "Начиная с 1 уровня, после того как вы накладываете заклинание чародея 1 круга или выше, Мастер может (не чаще раза за ход) объявить дикий всплеск: бросьте к20 — на результате 1 происходит небольшой случайный магический эффект по своему выбору, не влияющий на исход самого заклинания.",
            },
            {
              name: "Спасительная магия",
              description:
                "Начиная с 1 уровня, когда вы проваливаете спасбросок, вы можете потратить одно очко чар, чтобы бросить к6 и прибавить результат к спасброску, потенциально превратив провал в успех.",
            },
          ],
        },
      },
      {
        name: "Происхождение от бури",
        description: "Кровь бури течёт в ваших жилах — гроза не пугает вас, потому что часть её силы всегда была вашей.",
        grants: {
          damageResistances: ["Электричество", "Гром"],
          // Ресурс самой бури, а не классовые Очки чар: он есть уже на 1 уровне,
          // когда очков чар у чародея ещё нет.
          resources: [
            {
              id: "storm-wind",
              name: "Ветер потомка бури",
              maxFrom: { ability: "charisma", plus: 0, min: 1 },
              recharge: "long",
              unit: "использование",
            },
          ],
          resourceOptions: [
            {
              id: "storm-wind-push",
              resourceId: "storm-wind",
              name: "Порыв ветра",
              minLevel: 1,
              effect: { kind: "saving-throw", against: "strength" },
            },
          ],
        },
        featuresByLevel: {
          1: [
            {
              name: "Дитя шторма",
              description:
                "На 1 уровне вы получаете сопротивление урону электричеством и урону громом, а также не получаете вреда от естественного падения с высоты.",
            },
            {
              name: "Ветер потомка бури",
              description:
                "Начиная с 1 уровня вы можете бонусным действием (число раз, равное модификатору Харизмы, минимум раз, за длинный отдых) создать порыв ветра: одно существо в пределах 20 футов отталкивается на 10 футов и совершает спасбросок Силы или падает ничком.",
            },
          ],
        },
      },
    ],
  },
  "classes-wizard": {
    chosenAtLevel: 2,
    subclasses: [
      {
        name: "Школа эвокации",
        grants: {
          scaling: [{ name: "Лепка заклинаний", minLevel: 2, effect: { kind: "spell-circle-plus", plus: 1 } }],
        },
        featuresByLevel: {
          2: [
            {
              name: "Знаток эвокации",
              description:
                "Начиная со 2 уровня золото и время на копирование заклинания школы Воплощения в книгу заклинаний уменьшаются вдвое.",
            },
            {
              name: "Лепка заклинаний",
              description:
                "Начиная со 2 уровня, накладывая разрушительное заклинание Воплощения, вы можете выбрать количество существ (1 + уровень заклинания), которые автоматически преуспевают в спасброске и не получают урона вовсе.",
            },
          ],
        },
      },
      // Оригинальные школы карточки characters-original-subclasses — имена
      // сверены по личной PHB владельца продукта (Иллюзия и Некромантия там
      // есть), особенности написаны оригинальным текстом.
      {
        name: "Школа иллюзий",
        description:
          "Иллюзионисты плетут ложь настолько плотную, что она обманывает не только зрение, но и инстинкты — их сила не в разрушении, а в подмене реальности перед глазами противника.",
        grants: {
          // Число «Иллюзорной точности» — та самая СЛ спасброска волшебника,
          // против которой существо разгадывает иллюзию; своего числа у
          // особенности нет, поэтому она показывает общее, а не заводит второе.
          scaling: [{ name: "Иллюзорная точность", minLevel: 2, effect: { kind: "saving-throw", against: "intelligence" } }],
        },
        featuresByLevel: {
          2: [
            {
              name: "Иллюзорная точность",
              description:
                "Начиная со 2 уровня спасбросок против ваших заклинаний школы Иллюзии, определяющих, реальна ли иллюзия, совершается с помехой, если существо не взаимодействовало с ней напрямую в этот ход.",
            },
            {
              name: "Мимолётный образ",
              description:
                "Начиная со 2 уровня, накладывая заклинание школы Иллюзии 1 круга или выше, вы можете бонусным действием создать неподвижный беззвучный образ себя в пределах 30 футов на 1 минуту — атака по этому образу автоматически промахивается, а иллюзия рассеивается.",
            },
          ],
        },
      },
      {
        name: "Школа некромантии",
        description:
          "Некроманты Волшебника изучают грань между жизнью и смертью не из порочности, а из любопытства исследователя — их знание крепнет с каждым разрушенным и восстановленным телом.",
        grants: {
          scaling: [{ name: "Живучая плоть", minLevel: 2, effect: { kind: "spell-circle-half" } }],
        },
        featuresByLevel: {
          2: [
            {
              name: "Хватка могилы",
              description: "Начиная со 2 уровня золото и время на копирование заклинания школы Некромантии в книгу заклинаний уменьшаются вдвое.",
            },
            {
              name: "Живучая плоть",
              description:
                "Начиная со 2 уровня, накладывая заклинание Некромантии, причиняющее урон, вы восстанавливаете хиты, равные половине круга заклинания (округляя вверх), если хотя бы одна цель получила урон.",
            },
          ],
        },
      },
    ],
  },
  "classes-druid": {
    chosenAtLevel: 2,
    subclasses: [
      {
        name: "Круг земли",
        grants: {
          bonusCantrips: { count: 1 },
          resources: [
            { id: "natural-recovery", name: "Естественное восстановление", max: 1, recharge: "long", unit: "использование" },
          ],
          resourceOptions: [
            {
              id: "natural-recovery-slots",
              resourceId: "natural-recovery",
              name: "Естественное восстановление",
              minLevel: 2,
              effect: { kind: "half-level" },
            },
          ],
          // Местность выбирается при посвящении в круг (тот же уровень, что и
          // сам архетип, minLevel: 2) — SRD: «Выберите эту землю... где он был
          // посвящён». Заклинания местности приходят на 3 и 5 уровнях (2-3
          // круг); 7 и 9 уровней не смоделированы — как и у всех остальных
          // архетипов в этом файле (см. `spellsByLevel` доменов жреца выше),
          // таблица обрезана по потолку `MAX_LEVEL = 5` (characters-leveling-
          // 1-5), а часть заклинаний этих уровней (Наблюдение/Провидение) к
          // тому же отсутствует в spells.json — заводить их ради недостижимого
          // уровня не имеет смысла. rules.json называет заклинания местным
          // переводом, отличным от spells.json (например «Рост шипов» —
          // «Шипастые заросли» в spells.json, тот же spike-growth) — id ниже
          // сверены по значению, а не по строке.
          choices: [
            {
              id: "circle-of-the-land-terrain",
              name: "Заклинания круга",
              minLevel: 2,
              pick: 1,
              options: [
                {
                  id: "arctic",
                  label: "Арктика",
                  grants: { spellsByLevel: { 3: ["hold-person", "spike-growth"], 5: ["slow", "sleet-storm"] } },
                },
                {
                  id: "coast",
                  label: "Побережье",
                  grants: { spellsByLevel: { 3: ["mirror-image", "misty-step"], 5: ["water-breathing", "water-walk"] } },
                },
                {
                  id: "desert",
                  label: "Пустыня",
                  grants: {
                    spellsByLevel: { 3: ["blur", "silence"], 5: ["protection-from-energy", "create-food-and-water"] },
                  },
                },
                {
                  id: "forest",
                  label: "Лес",
                  grants: { spellsByLevel: { 3: ["barkskin", "spider-climb"], 5: ["call-lightning", "plant-growth"] } },
                },
                {
                  id: "grassland",
                  label: "Пастбища",
                  grants: { spellsByLevel: { 3: ["pass-without-trace", "invisibility"], 5: ["daylight", "haste"] } },
                },
                {
                  id: "mountain",
                  label: "Горы",
                  grants: { spellsByLevel: { 3: ["spider-climb", "spike-growth"], 5: ["lightning-bolt", "meld-into-stone"] } },
                },
                {
                  id: "swamp",
                  label: "Болото",
                  grants: { spellsByLevel: { 3: ["acid-arrow", "darkness"], 5: ["stinking-cloud", "water-walk"] } },
                },
              ],
            },
          ],
        },
        featuresByLevel: {
          2: [
            {
              name: "Дополнительный заговор",
              description: "Выбрав круг Земли на 2 уровне, вы осваиваете один дополнительный заговор друида на свой выбор.",
            },
            {
              name: "Естественное восстановление",
              description:
                "Начиная со 2 уровня, во время короткого отдыха вы можете восстановить потраченные ячейки заклинаний суммарным уровнем не выше половины уровня друида (округляя вверх), ни одна не выше 5 круга — раз за длинный отдых.",
            },
          ],
          3: [
            {
              name: "Заклинания круга",
              description:
                "На 3, 5, 7 и 9 уровнях друид получает доступ к заклинаниям по выбранной при посвящении местности (Арктика, Побережье, Пустыня, Лес, Пастбища, Горы или Болото) — эти заклинания всегда подготовлены и не учитываются в лимите подготовленных заклинаний.",
            },
          ],
        },
      },
      // Оригинальные круги карточки characters-original-subclasses — имена
      // сверены по личной PHB владельца продукта (Луна и Звёзды там есть),
      // особенности написаны оригинальным текстом, тот же объём, что у Круга
      // земли (2 особенности на 2 уровне + 1 на 3).
      {
        name: "Круг луны",
        description:
          "Друиды круга Луны видят в Диком облике не вспомогательный инструмент, а главное оружие — они бросаются в звериную форму первыми и покидают её последними.",
        grants: {
          // «Боевой облик» (превращение бонусным действием) и «Расширенный
          // облик» (потолок УО зверя) остаются текстом: ни экономики действий,
          // ни списка форм Дикого облика в приложении пока нет.
          scaling: [{ name: "Крепкая форма", minLevel: 2, effect: { kind: "temp-hp-self", perLevel: 2 } }],
        },
        featuresByLevel: {
          2: [
            {
              name: "Боевой облик",
              description: "Выбрав круг Луны на 2 уровне, вы можете превращаться в Дикий облик бонусным действием вместо действия.",
            },
            {
              name: "Крепкая форма",
              description:
                "Начиная со 2 уровня, находясь в Дикой форме, вы получаете дополнительный запас временных хитов, равный удвоенному уровню друида, при каждом превращении.",
            },
          ],
          3: [
            {
              name: "Расширенный облик",
              description:
                "Начиная с 3 уровня максимальный УО зверя для Дикого облика в бою повышается на 1/4 сверх обычного предела вашего уровня.",
            },
          ],
        },
      },
      {
        name: "Круг звёзд",
        description:
          "Друиды этого круга не сражаются сами — они читают предзнаменования в узорах ночного неба, направляя решения группы задолго до того, как прольётся кровь.",
        grants: {
          bonusCantrips: { count: 1 },
          resources: [{ id: "star-omen", name: "Звёздное знамение", max: 1, recharge: "short", unit: "использование" }],
          resourceOptions: [
            {
              id: "star-omen-read",
              resourceId: "star-omen",
              name: "Прочесть знамение",
              minLevel: 2,
              effect: { kind: "descriptive" },
            },
          ],
          scaling: [{ name: "Благословение созвездия", minLevel: 2, effect: { kind: "bonus-dice", count: 1, die: 4 } }],
        },
        featuresByLevel: {
          2: [
            {
              name: "Звёздное знамение",
              description:
                "Выбрав круг Звёзд на 2 уровне, вы осваиваете один дополнительный заговор друида, а раз за короткий отдых можете действием прочесть по звёздам ответ на один вопрос о ближайшем часе (опасность, направление, погода) — Мастер отвечает одним предложением.",
            },
            {
              name: "Благословение созвездия",
              description:
                "Начиная со 2 уровня, когда союзник в пределах 30 футов совершает спасбросок, вы реакцией можете прибавить к результату 1к4.",
            },
          ],
          3: [
            {
              name: "Чтение судьбы",
              description:
                "Начиная с 3 уровня действие Благословения созвездия распространяется и на броски атаки союзника, а дальность увеличивается до 60 футов.",
            },
          ],
        },
      },
    ],
  },
  "classes-bard": {
    chosenAtLevel: 3,
    subclasses: [
      {
        name: "Коллегия знаний",
        grants: {
          // Кость Острых слов не дублируется: её владелец — `scaling` класса
          // («Кость Вдохновения барда» в classProgression.ts).
          resourceOptions: [
            {
              id: "cutting-words",
              resourceId: "bardic-inspiration",
              name: "Острые слова",
              minLevel: 3,
              effect: { kind: "descriptive" },
            },
          ],
          // «Дополнительные навыки» — выбор трёх навыков из полного списка
          // навыков SRD (не маленький фиксированный список). id варианта — само
          // название навыка: в приложении навыки везде идентифицируются им же
          // (см. SKILL_ABILITY), заводить отдельные слаги незачем.
          choices: [
            {
              id: "college-of-lore-skills",
              name: "Дополнительные навыки",
              minLevel: 3,
              pick: 3,
              options: ALL_SKILLS.map((skill) => ({ id: skill, label: skill, grants: { skills: [skill] } })),
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Дополнительные навыки",
              description: "Когда вы присоединяетесь к коллегии знаний на 3 уровне, вы овладеваете тремя навыками на свой выбор.",
            },
            {
              name: "Острые слова",
              description:
                "На 3 уровне, если существо в пределах 60 футов совершает бросок атаки, проверку характеристики или урона, вы реакцией можете потратить Вдохновение барда, бросить его кость и вычесть результат из броска существа.",
            },
          ],
        },
      },
      // Оригинальные коллегии карточки characters-original-subclasses — имена
      // сверены по личной PHB владельца продукта (Доблесть и Шёпот там есть),
      // особенности написаны оригинальным текстом, тот же объём (2 особенности
      // на 3 уровне), что у Коллегии знаний.
      {
        name: "Коллегия доблести",
        description:
          "Барды этой коллегии закаляют голос и тело в передовой линии боя, вплетая ритм сражения в собственные песни. Их музыка воодушевляет союзников идти в атаку, а не только исцеляет после неё.",
        // «Боевая выправка»: средние доспехи, щиты и воинское оружие с 3 уровня.
        grants: { armor: ["medium", "shields"], weaponCategories: ["martial"] },
        featuresByLevel: {
          3: [
            {
              name: "Боевая выправка",
              description: "Начиная с 3 уровня вы получаете владение средними доспехами, щитами и воинским оружием.",
            },
            {
              name: "Клич атаки",
              description:
                "Начиная с 3 уровня бонусным действием вы можете потратить кость Вдохновения барда: до конца следующего хода одно существо, слышащее вас, добавляет бросок этой кости к своему следующему броску урона.",
            },
          ],
        },
      },
      {
        name: "Коллегия шёпота",
        description:
          "Барды коллегии шёпота выступают в тавернах и на улицах, но истинное ремесло ведут в тени: сплетни, компромат и тихое запугивание — их инструменты не хуже лютни.",
        grants: { toolProficiencies: ["Воровские инструменты"] },
        featuresByLevel: {
          3: [
            {
              name: "Слово во тьме",
              description:
                "Начиная с 3 уровня вы владеете инструментами вора и можете действием прошептать проклятие существу, слышавшему вас в последнюю минуту: до конца вашего следующего хода первая атака по нему совершается с преимуществом.",
            },
            {
              name: "Шёпот за спиной",
              description:
                "Начиная с 3 уровня вы получаете преимущество на проверки Обмана и Запугивания против существ, которые не видели, как вы наложили на них Слово во тьме.",
            },
          ],
        },
      },
    ],
  },
  "classes-barbarian": {
    chosenAtLevel: 3,
    subclasses: [
      {
        name: "Путь Берсерка",
        // Неистовство объявляется той же яростью, в которую варвар входит, —
        // поэтому кнопка тратит использование Ярости, а не заводит второй счётчик.
        grants: {
          resourceOptions: [
            { id: "frenzy", resourceId: "rage", name: "Неистовство", minLevel: 3, effect: { kind: "descriptive" } },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Неистовство",
              description:
                "Начиная с 3 уровня, находясь в ярости, вы можете впасть в неистовство: пока ярость не кончилась, каждый ход совершаете бонусным действием одну рукопашную атаку оружием. После окончания ярости получаете уровень истощения.",
            },
          ],
        },
      },
      // Оригинальные пути карточки characters-original-subclasses — имена
      // сверены по личной PHB владельца продукта (Тотемный воин там есть),
      // особенности написаны оригинальным текстом, тот же объём (1 особенность
      // на 3 уровне), что у Пути Берсерка.
      {
        name: "Путь Тотемного воина",
        description:
          "Берсерк-тотемист чувствует дух зверя-покровителя ещё до посвящения в путь и просит его защиты и силы в бою, а не просто впадает в слепую ярость.",
        // Дух выбирается на текущую ярость, поэтому это три варианта одной и той
        // же траты Ярости, а не постоянное сопротивление урону.
        grants: {
          resourceOptions: [
            { id: "totem-bear", resourceId: "rage", name: "Дух зверя: Медведь", minLevel: 3, effect: { kind: "descriptive" } },
            { id: "totem-eagle", resourceId: "rage", name: "Дух зверя: Орёл", minLevel: 3, effect: { kind: "descriptive" } },
            { id: "totem-wolf", resourceId: "rage", name: "Дух зверя: Волк", minLevel: 3, effect: { kind: "descriptive" } },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Дух зверя",
              description:
                "Начиная с 3 уровня, находясь в ярости, вы выбираете дух зверя (Медведь, Орёл или Волк) на текущую ярость: Медведь даёт сопротивление всему урону кроме психического, Орёл — доп. 10 футов скорости при рывке, Волк — преимущество на атаки союзникам рядом с выбранной вами целью.",
            },
          ],
        },
      },
      {
        name: "Путь Штурмовика",
        description:
          "Штурмовик превращает ярость в чистый напор: вместо звериных духов он полагается на инерцию собственного тела, вкладывая всю массу в один сокрушительный рывок.",
        grants: {
          scaling: [{ name: "Сокрушительный напор", minLevel: 3, effect: { kind: "bonus-damage-flat", per: "proficiency" } }],
        },
        featuresByLevel: {
          3: [
            {
              name: "Сокрушительный напор",
              description:
                "Начиная с 3 уровня, если в свой ход вы переместились не менее 10 футов по прямой перед рукопашной атакой в ярости, первая атака этого хода наносит дополнительный урон, равный вашему бонусу мастерства.",
            },
          ],
        },
      },
    ],
  },
  "classes-fighter": {
    chosenAtLevel: 3,
    subclasses: [
      {
        name: "Воитель",
        grants: { critRange: 19 },
        featuresByLevel: {
          // В rules.json у этой особенности написано «Если вы выбрали этот
          // архетип на 19 уровне» — явная ошибка исходного текста (архетип
          // выбирается на 3 уровне у всех классов, RAW-эквивалент «Улучшенная
          // критическая атака» у Чемпиона тоже даётся на 3 уровне). Текст ниже
          // исправлен на «3 уровне», исходная опечатка не пересказана игроку.
          3: [
            {
              name: "Улучшенные критические попадания",
              description: "Начиная с 3 уровня ваши атаки оружием совершают критическое попадание при выпадении «19» или «20» на кости атаки.",
            },
          ],
        },
      },
      // Оригинальные архетипы карточки characters-original-subclasses — имена
      // сверены по личной PHB владельца продукта (Мастер боевых искусств и
      // Мистический рыцарь там есть), особенности написаны оригинальным
      // текстом, тот же объём (1 особенность на 3 уровне), что у Воителя.
      {
        name: "Мастер боя",
        description: "Мастер боя изучает поле сражения как шахматную доску: побеждает не только силой удара, но выбором момента и позиции.",
        grants: {
          resources: [{ id: "superiority-dice", name: "Кости превосходства", max: 4, recharge: "long", unit: "кость" }],
          resourceOptions: [
            {
              id: "maneuver-distracting",
              resourceId: "superiority-dice",
              name: "Манёвр: Отвлекающий удар",
              minLevel: 3,
              effect: { kind: "descriptive" },
            },
            {
              id: "maneuver-rally",
              resourceId: "superiority-dice",
              name: "Манёвр: Ободряющий рывок",
              minLevel: 3,
              effect: { kind: "bonus-dice", count: 1, die: 8 },
            },
            {
              id: "maneuver-precision",
              resourceId: "superiority-dice",
              name: "Манёвр: Точный выпад",
              minLevel: 3,
              effect: { kind: "bonus-dice", count: 1, die: 8 },
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Боевое превосходство",
              description:
                "Начиная с 3 уровня вы получаете 4 кости превосходства (к8) на длинный отдых; истратив кость на манёвр (Отвлекающий удар — цель получает помеху на следующую атаку по вам, Ободряющий рывок — союзник получает временные хиты, равные броску кости, или Точный выпад — добавить кость к своему броску атаки после его объявления, до знания результата), вы прибавляете результат кости к эффекту.",
            },
          ],
        },
      },
      {
        name: "Мистический рыцарь",
        description:
          "Мистический рыцарь вплетает в удары клинка отголоски чужой магии — не становясь чародеем, он бесстрашно прожигает резерв воли ради решающего момента боя.",
        grants: {
          resources: [
            { id: "arcane-charge", name: "Очки мистической энергии", max: 2, recharge: "long", unit: "очко" },
          ],
          resourceOptions: [
            {
              id: "charged-blade",
              resourceId: "arcane-charge",
              name: "Заряженный клинок",
              minLevel: 3,
              effect: { kind: "bonus-damage-dice", count: 1, die: 8 },
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Заряженный клинок",
              description:
                "Начиная с 3 уровня вы получаете 2 очка мистической энергии на длинный отдых; потратив очко сразу после попадания рукопашной атакой оружием, вы причиняете дополнительно 1к8 урона силовым полем.",
            },
          ],
        },
      },
    ],
  },
  "classes-monk": {
    chosenAtLevel: 3,
    subclasses: [
      {
        name: "Путь открытой ладони",
        // Эффект накладывается попаданием Шквала ударов, а Шквал стоит очко ци —
        // поэтому все три варианта тратят тот же классовый ресурс.
        grants: {
          resourceOptions: [
            {
              id: "open-hand-prone",
              resourceId: "ki",
              name: "Открытая ладонь: сбить с ног",
              minLevel: 3,
              effect: { kind: "saving-throw", against: "dexterity" },
            },
            {
              id: "open-hand-push",
              resourceId: "ki",
              name: "Открытая ладонь: оттолкнуть",
              minLevel: 3,
              effect: { kind: "saving-throw", against: "strength" },
            },
            {
              id: "open-hand-no-reactions",
              resourceId: "ki",
              name: "Открытая ладонь: лишить реакций",
              minLevel: 3,
              effect: { kind: "descriptive" },
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Техники открытой ладони",
              description:
                "При выборе традиции на 3 уровне, если вы попадаете одной из атак Шквала ударов, можете наложить на цель один эффект на выбор: сбить с ног (спасбросок Ловкости), оттолкнуть до 15 футов (спасбросок Силы) или лишить реакций до конца вашего следующего хода.",
            },
          ],
        },
      },
      // Оригинальные традиции карточки characters-original-subclasses — темы
      // (скрытность, стихийная энергия) сверены по личной PHB владельца
      // продукта, но имена намеренно не совпадают ни с одной книжной
      // традицией: «Путь открытой ладони» из карточки уже занят SRD-архетипом
      // выше (subclasses[0]), поэтому вместо него взяты Путь тени и Путь
      // четырёх стихий — обе реальные PHB-темы, не пересекающиеся с SRD.
      // Особенности написаны оригинальным текстом.
      {
        name: "Путь тени",
        description:
          "Монахи Пути тени тренируются как лазутчики и охотники: тишина и внезапность разят вернее прямого удара, потому что противник узнаёт о битве, когда она уже окончена.",
        grants: {
          resourceOptions: [
            {
              id: "shadow-step",
              resourceId: "ki",
              name: "Тень между вздохов",
              minLevel: 3,
              cost: 2,
              effect: { kind: "descriptive" },
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Тень между вздохов",
              description:
                "Начиная с 3 уровня вы можете действием потратить 2 очка ци, чтобы стать невидимым до конца своего следующего хода или пока не совершите атаку или не сотворите заклинание; кроме того, вы получаете преимущество на проверки Скрытности, пока находитесь в тусклом свете или темноте.",
            },
          ],
        },
      },
      {
        name: "Путь четырёх стихий",
        description:
          "Монахи этого пути направляют ци не только в тело, но и вовне — в короткие всплески огня, льда и ветра, служащие продолжением их ударов, а не отдельной магией.",
        grants: {
          resourceOptions: [
            {
              id: "elemental-burst",
              resourceId: "ki",
              name: "Стихийный всплеск",
              minLevel: 3,
              effect: { kind: "bonus-damage-dice", count: 1, die: 6 },
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Стихийный всплеск",
              description:
                "Начиная с 3 уровня вы можете потратить 1 очко ци сразу после попадания рукопашной атакой без оружия, чтобы причинить дополнительно 1к6 урона одним из трёх видов на выбор (огонь, холод или дробящий силой ветра).",
            },
          ],
        },
      },
    ],
  },
  "classes-paladin": {
    chosenAtLevel: 3,
    subclasses: [
      {
        name: "Клятва преданности",
        grants: {
          resources: [PALADIN_CHANNEL_DIVINITY],
          resourceOptions: [
            {
              id: "sacred-weapon",
              resourceId: "channel-divinity",
              name: "Священное оружие",
              minLevel: 3,
              effect: { kind: "attack-bonus", ability: "charisma", min: 1 },
            },
            {
              id: "turn-the-unholy",
              resourceId: "channel-divinity",
              name: "Изгнать нечистого",
              minLevel: 3,
              effect: { kind: "saving-throw", against: "wisdom" },
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Проведение энергии",
              description:
                "Давая эту клятву на 3 уровне, вы получаете два варианта Проведения энергии: «Священное Оружие» (на 1 минуту оружие получает бонус атаки от Харизмы, минимум +1, и светится) или «Изгнать нечистого» (исчадия и нежить в 30 футах совершают спасбросок Мудрости или изгоняются на 1 минуту).",
            },
          ],
        },
      },
      // Оригинальные клятвы карточки characters-original-subclasses — имена
      // сверены по личной PHB владельца продукта (Древние и Месть там есть),
      // особенности написаны оригинальным текстом, тот же объём (1 особенность
      // на 3 уровне), что у Клятвы преданности.
      {
        name: "Клятва древних",
        description:
          "Паладины Клятвы древних служат свету и жизни в самом первозданном смысле — они защищают красоту мира и связаны словом с духами леса не меньше, чем с богами.",
        grants: {
          resources: [PALADIN_CHANNEL_DIVINITY],
          resourceOptions: [
            {
              id: "veil-of-nature",
              resourceId: "channel-divinity",
              name: "Пелена природы",
              minLevel: 3,
              effect: { kind: "descriptive" },
            },
            {
              id: "wrath-of-the-wood",
              resourceId: "channel-divinity",
              name: "Гнев леса",
              minLevel: 3,
              effect: { kind: "saving-throw", against: "dexterity" },
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Дар природы",
              description:
                "Давая эту клятву на 3 уровне, вы получаете два варианта Проведения энергии: «Пелена природы» (на 1 минуту вы и союзники в пределах 10 футов получаете сопротивление урону от заклинаний) или «Гнев леса» (существа по вашему выбору в пределах 15 футов совершают спасбросок Ловкости или получают помеху на атаки против вас до конца вашего следующего хода).",
            },
          ],
        },
      },
      {
        name: "Клятва мести",
        description: "Паладины Клятвы мести не ищут справедливости для всех — они выслеживают одного конкретного виновника и не останавливаются, пока не покарают его.",
        grants: {
          resources: [PALADIN_CHANNEL_DIVINITY],
          resourceOptions: [
            {
              id: "tormentors-threat",
              resourceId: "channel-divinity",
              name: "Угроза мучителя",
              minLevel: 3,
              effect: { kind: "saving-throw", against: "wisdom" },
            },
            {
              id: "vow-of-pursuit",
              resourceId: "channel-divinity",
              name: "Обет преследования",
              minLevel: 3,
              effect: { kind: "descriptive" },
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Дар мести",
              description:
                "Давая эту клятву на 3 уровне, вы получаете два варианта Проведения энергии: «Угроза мучителя» (одно видимое существо в пределах 30 футов совершает спасбросок Мудрости или получает испуг перед вами до конца вашего следующего хода) или «Обет преследования» (до конца следующего боя ваша скорость не снижается при преследовании выбранной цели, и она не получает преимущества от укрытия против ваших атак дальнобойным оружием).",
            },
          ],
        },
      },
    ],
  },
  "classes-rogue": {
    chosenAtLevel: 3,
    subclasses: [
      {
        name: "Вор",
        // «Форточник» (лазание и прыжок) числом не выражается: скорости лазания
        // и дальности прыжка на листе персонажа пока нет.
        grants: { toolProficiencies: ["Воровские инструменты"] },
        featuresByLevel: {
          3: [
            {
              name: "Быстрые пальцы",
              description:
                "Начиная с 3 уровня, бонусным действием от Хитрого действия можно совершить проверку Ловкости (Ловкость рук) воровскими инструментами (обезвредить ловушку, вскрыть замок) или действие Использование предмета.",
            },
            {
              name: "Форточник",
              description: "С 3 уровня лазание не стоит дополнительного движения, а дальность прыжка с разбега увеличивается на модификатор Ловкости.",
            },
          ],
        },
      },
      // Оригинальные архетипы карточки characters-original-subclasses — имена
      // сверены по личной PHB владельца продукта (Убийца и Мистический
      // ловкач там есть), особенности написаны оригинальным текстом (не
      // копируют книжный «авто-крит по застигнутой врасплох цели»), тот же
      // объём (2 особенности на 3 уровне), что у Вора.
      {
        name: "Убийца",
        description:
          "Убийцы превращают ремесло плута в точную науку смерти: они изучают жертву заранее и наносят один-единственный решающий удар, пока никто не готов.",
        grants: {
          toolProficiencies: ["Набор для отравления", "Маскировочный набор"],
          scaling: [{ name: "Первый и последний удар", minLevel: 3, effect: { kind: "bonus-damage-flat", per: "level" } }],
        },
        featuresByLevel: {
          3: [
            {
              name: "Смертоносное ремесло",
              description: "Начиная с 3 уровня вы получаете владение набором для отравления и маскировочным набором.",
            },
            {
              name: "Первый и последний удар",
              description:
                "Начиная с 3 уровня, если в первом раунде боя вы атакуете существо, которое ещё не действовало в этом бою, ваша атака при попадании причиняет дополнительный урон, равный вашему уровню плута.",
            },
          ],
        },
      },
      {
        name: "Мистический ловкач",
        description:
          "Мистические ловкачи подсматривают магию у чародеев и волшебников ровно настолько, чтобы обвести вокруг пальца — не ради разрушительной силы, а ради ещё одного трюка в рукаве.",
        grants: { bonusCantrips: { count: 2, fromClassId: "classes-wizard" } },
        featuresByLevel: {
          3: [
            {
              name: "Магическая хитрость",
              description: "Начиная с 3 уровня вы узнаёте два заговора волшебника; Интеллект — ваша заклинательная характеристика для них.",
            },
            {
              name: "Заговор из засады",
              description:
                "Начиная с 3 уровня, если вы получаете Скрытую атаку атакой заговора, вы можете применить бонус Скрытой атаки к её урону так же, как к атаке оружием.",
            },
          ],
        },
      },
    ],
  },
  "classes-ranger": {
    chosenAtLevel: 3,
    subclasses: [
      {
        // Текст называет два классических архетипа («Охотник» и «Хозяин Зверей»), но детально расписан только «Охотник» — единственный вариант в этом файле.
        name: "Охотник",
        grants: {
          choices: [
            {
              id: "hunter-prey",
              name: "Добыча охотника",
              minLevel: 3,
              pick: 1,
              options: [
                {
                  id: "colossus-slayer",
                  label: "Убийца Колоссов",
                  grants: {
                    scaling: [
                      { name: "Убийца Колоссов", minLevel: 3, effect: { kind: "bonus-damage-dice", count: 1, die: 8 } },
                    ],
                  },
                },
                {
                  id: "giant-killer",
                  label: "Убийца великанов",
                  grants: { scaling: [{ name: "Убийца великанов", minLevel: 3, effect: { kind: "descriptive" } }] },
                },
                {
                  id: "horde-breaker",
                  label: "Сокрушитель орд",
                  grants: { scaling: [{ name: "Сокрушитель орд", minLevel: 3, effect: { kind: "descriptive" } }] },
                },
              ],
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Добыча охотника",
              description:
                "На 3 уровне выберите одно умение: «Убийца Колоссов» (+1к8 урона существу не на полных хитах, раз за ход), «Убийца великанов» (реакция-атака в ответ на попадание/промах Большого+ существа) или «Сокрушитель орд» (доп. атака по другой цели рядом при атаке оружием).",
            },
          ],
        },
      },
      // Оригинальные архетипы карточки characters-original-subclasses — имена
      // сверены по личной PHB владельца продукта (Хозяин зверей и Странник
      // там есть), особенности написаны оригинальным текстом, тот же объём
      // (1 особенность на 3 уровне), что у Охотника.
      {
        name: "Укротитель зверей",
        description: "Укротители зверей следопыта делят путь с диким спутником — тот сражается и выслеживает добычу рядом с хозяином, а не остаётся в лагере.",
        grants: {
          scaling: [{ name: "Звериный спутник", minLevel: 3, effect: { kind: "companion-hp", perLevel: 4 } }],
        },
        featuresByLevel: {
          3: [
            {
              name: "Звериный спутник",
              description:
                "На 3 уровне вы приручаете зверя с УО 1/4 или ниже (согласовать с Мастером), который следует за вами и подчиняется вашим командам; в бою он действует в свой ход по вашему указанию бонусным действием, а его максимум хитов равен учетверённому вашему уровню следопыта.",
            },
          ],
        },
      },
      {
        name: "Странник",
        description: "Странники следопыта не привязаны ни к одному покровителю или зверю — их сила в чистой выносливости человека, идущего в одиночку туда, куда другие не решаются.",
        grants: {
          resources: [{ id: "tireless-step", name: "Неутомимый шаг", max: 1, recharge: "long", unit: "использование" }],
          resourceOptions: [
            {
              id: "tireless-step-slot",
              resourceId: "tireless-step",
              name: "Вернуть ячейку 1 круга",
              minLevel: 3,
              effect: { kind: "restore-slot", circle: 1 },
            },
          ],
        },
        featuresByLevel: {
          3: [
            {
              name: "Неутомимый шаг",
              description:
                "На 3 уровне вы получаете сопротивление урону от истощения (не снижаете скорость и не получаете помех от голода, жажды или недостатка сна на один уровень истощения), а во время короткого отдыха можете восстановить одну потраченную ячейку заклинания 1 круга, если не делали этого с последнего длинного отдыха.",
            },
          ],
        },
      },
    ],
  },
};

/** Механика выбранного архетипа, или `undefined` — если архетип не выбран либо пока только текст. */
export function subclassGrants(classId: string | null | undefined, subclassName: string | null | undefined) {
  if (!classId || !subclassName) return undefined;
  return CLASS_SUBCLASSES[classId]?.subclasses.find((s) => s.name === subclassName)?.grants;
}

function mergeStringArrays<T extends string>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!a && !b) return undefined;
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

/** Заклинания варианта по уровню подмешиваются в таблицу архетипа, круг за кругом. */
function mergeSpellsByLevel(
  a: Record<number, string[]> | undefined,
  b: Record<number, string[]> | undefined,
): Record<number, string[]> | undefined {
  if (!a && !b) return undefined;
  const merged: Record<number, string[]> = { ...a };
  for (const [at, spellIds] of Object.entries(b ?? {})) {
    const level = Number(at);
    merged[level] = [...new Set([...(merged[level] ?? []), ...spellIds])];
  }
  return merged;
}

/**
 * Гранты архетипа с грантами выбранного варианта `SubclassChoice`, подмешанными
 * поверх. Списки (владения, навыки, сопротивления, `scaling`/`resources`/
 * `resourceOptions`, `spellsByLevel`) объединяются; одиночные значения
 * (`unarmoredAc`, `critRange`, `bonusCantrips`, `healingBonus`) вариант
 * перекрывает, если задаёт своё. `choices` не трогается — это список
 * определений выбора, а не то, что выбор меняет.
 */
function mergeSubclassGrants(base: SubclassGrants, extra: SubclassGrants): SubclassGrants {
  return {
    ...base,
    ...extra,
    armor: mergeStringArrays(base.armor, extra.armor),
    weaponCategories: mergeStringArrays(base.weaponCategories, extra.weaponCategories),
    weapons: mergeStringArrays(base.weapons, extra.weapons),
    skills: mergeStringArrays(base.skills, extra.skills),
    toolProficiencies: mergeStringArrays(base.toolProficiencies, extra.toolProficiencies),
    damageResistances: mergeStringArrays(base.damageResistances, extra.damageResistances),
    scaling: base.scaling || extra.scaling ? [...(base.scaling ?? []), ...(extra.scaling ?? [])] : undefined,
    resources: base.resources || extra.resources ? [...(base.resources ?? []), ...(extra.resources ?? [])] : undefined,
    resourceOptions:
      base.resourceOptions || extra.resourceOptions
        ? [...(base.resourceOptions ?? []), ...(extra.resourceOptions ?? [])]
        : undefined,
    spellsByLevel: mergeSpellsByLevel(base.spellsByLevel, extra.spellsByLevel),
    choices: base.choices,
  };
}

/**
 * Гранты архетипа, домешивающие эффект уже сделанных `subclassChoices`
 * персонажа (id выбора → id выбранных вариантов). Без сделанного выбора равна
 * `subclassGrants` — существующие вызовы без третьего аргумента не меняют
 * поведения. Параллельная функция, а не замена `subclassGrants`: часть
 * вызовов (например, список самих `choices` для панели левел-апа) не должна
 * видеть уже подмешанный результат.
 */
export function effectiveSubclassGrants(
  classId: string | null | undefined,
  subclassName: string | null | undefined,
  subclassChoices?: Record<string, string[]>,
): SubclassGrants | undefined {
  const base = subclassGrants(classId, subclassName);
  if (!base?.choices?.length || !subclassChoices) return base;
  let merged = base;
  for (const choice of base.choices) {
    for (const optionId of subclassChoices[choice.id] ?? []) {
      const option = choice.options.find((o) => o.id === optionId);
      if (option) merged = mergeSubclassGrants(merged, option.grants);
    }
  }
  return merged;
}

/**
 * Переключение id в списке выбранных вариантов с потолком `pick` — общий
 * приём выбора N вариантов (мастер персонажа — фон и его N навыков, левел-ап —
 * выбор внутри архетипа). `pick === 1` заменяет выбор целиком, как радиокнопка.
 */
export function toggleChoiceSelection(selected: string[], id: string, pick: number): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  if (pick === 1) return [id];
  if (selected.length >= pick) return selected;
  return [...selected, id];
}

/**
 * Владения доспехами класса плюс данные архетипом (и выбранным вариантом, если
 * передан `subclassChoices`). Единственный владелец правила — таблицы
 * `CLASS_PROFICIENCIES`/`CLASS_SUBCLASSES`; персонаж хранит снимок этого
 * списка (как и владения спасбросками), а не считает его заново.
 */
export function armorProficienciesFor(
  classId: string | null | undefined,
  subclassName: string | null | undefined,
  subclassChoices?: Record<string, string[]>,
): ArmorProficiency[] {
  const base = (classId ? CLASS_PROFICIENCIES[classId]?.armor : undefined) ?? [];
  return [...new Set([...base, ...(effectiveSubclassGrants(classId, subclassName, subclassChoices)?.armor ?? [])])];
}

/** Владения оружием класса плюс данные архетипом: категории и отдельные виды в одном списке. */
export function weaponProficienciesFor(
  classId: string | null | undefined,
  subclassName: string | null | undefined,
  subclassChoices?: Record<string, string[]>,
): string[] {
  const prof = classId ? CLASS_PROFICIENCIES[classId] : undefined;
  const grants = effectiveSubclassGrants(classId, subclassName, subclassChoices);
  return [
    ...new Set([
      ...(prof?.weaponCategories ?? []),
      ...(prof?.weapons ?? []),
      ...(grants?.weaponCategories ?? []),
      ...(grants?.weapons ?? []),
    ]),
  ];
}

/**
 * Владение инструментами, данное архетипом. Таблицы владения инструментами у
 * самих классов пока нет — когда появится, она встанет сюда первым слагаемым,
 * как `CLASS_PROFICIENCIES` у оружия и доспехов выше.
 */
export function toolProficienciesFor(
  classId: string | null | undefined,
  subclassName: string | null | undefined,
  subclassChoices?: Record<string, string[]>,
): string[] {
  return [...new Set(effectiveSubclassGrants(classId, subclassName, subclassChoices)?.toolProficiencies ?? [])];
}

/** Заклинания домена/архетипа, открытые к этому уровню персонажа (всегда подготовлены). */
export function subclassSpellsUpToLevel(
  classId: string | null | undefined,
  subclassName: string | null | undefined,
  level: number,
  subclassChoices?: Record<string, string[]>,
): string[] {
  const byLevel = effectiveSubclassGrants(classId, subclassName, subclassChoices)?.spellsByLevel;
  if (!byLevel) return [];
  const ids: string[] = [];
  for (const [at, spellIds] of Object.entries(byLevel)) {
    if (Number(at) <= level) ids.push(...spellIds);
  }
  return [...new Set(ids)];
}

/** Варианты траты классового ресурса, открытые архетипом к этому уровню. */
export function subclassResourceOptionsAt(
  classId: string | null | undefined,
  subclassName: string | null | undefined,
  level: number,
  subclassChoices?: Record<string, string[]>,
): SubclassResourceOption[] {
  return (effectiveSubclassGrants(classId, subclassName, subclassChoices)?.resourceOptions ?? []).filter(
    (o) => o.minLevel <= level,
  );
}

/** Постоянные числа архетипа, открытые к этому уровню персонажа. */
export function subclassScalingAt(
  classId: string | null | undefined,
  subclassName: string | null | undefined,
  level: number,
  subclassChoices?: Record<string, string[]>,
): SubclassScalingValue[] {
  return (effectiveSubclassGrants(classId, subclassName, subclassChoices)?.scaling ?? []).filter(
    (s) => s.minLevel <= level,
  );
}

/**
 * СЛ спасброска от заклинаний персонажа (SRD 5.1): 8 + бонус мастерства +
 * модификатор базовой характеристики класса.
 */
export function spellSaveDc(classId: string | null | undefined, abilities: AbilityScores, level: number): number | null {
  const key = classId ? CLASS_SPELLCASTING_ABILITY_KEY[classId] : undefined;
  if (!key) return null;
  return 8 + proficiencyBonusForLevel(level) + abilityMod(abilities[key]);
}

/**
 * Величина, которую даёт применение варианта архетипа, — или `null` у вариантов
 * без числа (преимущество союзнику). Само описание эффекта словами живёт в
 * тексте особенности (`featuresByLevel`) и здесь не повторяется. Значение бывает
 * и строкой («1к8»): кость — такая же величина эффекта, как число, и второго
 * владельца ей заводить незачем.
 *
 * `spellCircle` — наивысший доступный круг заклинаний; его владелец
 * `highestSpellCircle` в classProgression.ts, поэтому число приходит параметром,
 * а не считается здесь заново.
 */
export function subclassEffectValue(
  effect: SubclassEffect,
  {
    classId,
    abilities,
    level,
    spellCircle = 0,
  }: { classId: string; abilities: AbilityScores; level: number; spellCircle?: number },
): { label: string; value: number | string } | null {
  switch (effect.kind) {
    case "healing-pool":
      return { label: "хитов на распределение", value: effect.perLevel * level };
    case "temp-hp-allies":
      return { label: "временных хитов союзникам", value: effect.perLevel * level };
    case "saving-throw": {
      const dc = spellSaveDc(classId, abilities, level);
      return dc === null ? null : { label: `СЛ спасброска (${ABILITY_LABELS.find(([k]) => k === effect.against)?.[1]})`, value: dc };
    }
    case "attack-bonus":
      return { label: "к броскам атаки", value: Math.max(effect.min, abilityMod(abilities[effect.ability])) };
    case "temp-hp-self": {
      const fromAbility = effect.ability ? abilityMod(abilities[effect.ability]) : 0;
      return { label: "временных хитов", value: Math.max(effect.min ?? 0, effect.perLevel * level + fromAbility) };
    }
    case "bonus-dice":
      return { label: "к броску", value: `${effect.count}к${effect.die}` };
    case "bonus-damage-dice":
      return { label: "дополнительного урона", value: `${effect.count}к${effect.die}` };
    case "bonus-damage-flat":
      return {
        label: "дополнительного урона",
        value: effect.per === "level" ? level : proficiencyBonusForLevel(level),
      };
    case "spell-circle-plus":
      return { label: "целей не задеты заклинанием", value: spellCircle + effect.plus };
    case "spell-circle-half":
      return { label: "восстановленных хитов", value: Math.ceil(spellCircle / 2) };
    case "half-level":
      return { label: "суммарных кругов ячеек", value: Math.ceil(level / 2) };
    case "companion-hp":
      return { label: "хитов у звериного спутника", value: effect.perLevel * level };
    case "restore-slot":
      return { label: `восстановленная ячейка ${effect.circle} круга`, value: 1 };
    case "descriptive":
      return null;
  }
}

/**
 * Сколько хитов на самом деле восстановит запас лечения «Сохранение жизни»
 * самому жрецу: SRD-оговорка не поднимает существо выше половины его максимума
 * хитов, так что выше половины запас не даёт ничего.
 */
export function healingPoolSelfHeal(pool: number, currentHp: number, maxHp: number): number {
  const cap = Math.floor(maxHp / 2);
  return Math.max(0, Math.min(currentHp + pool, cap) - currentHp);
}

/** Девять мировоззрений SRD 5.1 (rules.json → character-alignment). */
export const ALIGNMENTS = [
  "Законно-добрый",
  "Нейтрально-добрый",
  "Хаотично-добрый",
  "Законно-нейтральный",
  "Нейтральный",
  "Хаотично-нейтральный",
  "Законно-злой",
  "Нейтрально-злой",
  "Хаотично-злой",
];

/** Краткая суть каждого мировоззрения — сжато из абзацев SRD 5.1 (rules.json → character-alignment). */
export const ALIGNMENT_DESCRIPTIONS: Record<string, string> = {
  "Законно-добрый": "Поступает так, как общество считает правильным, и держит слово.",
  "Нейтрально-добрый": "Делает всё возможное, чтобы помочь другим, не привязываясь к порядку или хаосу.",
  "Хаотично-добрый": "Следует велению совести, не оглядываясь на мнение остальных.",
  "Законно-нейтральный": "Действует согласно закону, традиции или личному кодексу.",
  Нейтральный: "Сторонится вопросов морали, решает по ситуации, не выбирая сторону.",
  "Хаотично-нейтральный": "Следует своим прихотям, свобода для него важнее всего.",
  "Законно-злой": "Методично берёт своё, прикрываясь традицией, верностью или порядком.",
  "Нейтрально-злой": "Делает всё, что сойдёт с рук, без сострадания и угрызений совести.",
  "Хаотично-злой": "Действует со спонтанной жестокостью — из жадности, ненависти или жажды крови.",
};

/** Стандартные + экзотические языки SRD 5.1 (rules.json → character-languages). */
export const ALL_LANGUAGES = [
  "Великаний",
  "Гномий",
  "Гоблинский",
  "Дварфский",
  "Общий",
  "Орочий",
  "Полуросликов",
  "Эльфийский",
  "Бездны",
  "Глубинная Речь",
  "Драконий",
  "Инфернальный",
  "Небесный",
  "Первичный",
  "Подземный",
  "Сильван",
];

export interface RaceLanguages {
  fixed: string[];
  /** Кол-во дополнительных языков на выбор игрока (Человек, Полуэльф). */
  choiceCount?: number;
}

/**
 * Языки — сверены вручную с абзацем «Языки.» в тексте каждой расы (rules.json).
 * Только Человек и Полуэльф дают язык «по вашему выбору» — у остальных рас
 * список полностью фиксирован.
 */
export const RACE_LANGUAGES: Record<string, RaceLanguages> = {
  "races-dwarf": { fixed: ["Общий", "Дварфский"] },
  "races-halfling": { fixed: ["Общий", "Полуросликов"] },
  "races-human": { fixed: ["Общий"], choiceCount: 1 },
  // Высший эльф даёт «Дополнительный язык» отдельным абзацем (не начинается
  // с «Языки.», этот выбор чуть не пропустили при первом проходе).
  "races-elf": { fixed: ["Общий", "Эльфийский"], choiceCount: 1 },
  "races-gnome": { fixed: ["Общий", "Гномий"] },
  "races-dragonborn": { fixed: ["Общий", "Драконий"] },
  "races-half-orc": { fixed: ["Общий", "Орочий"] },
  "races-half-elf": { fixed: ["Общий", "Эльфийский"], choiceCount: 1 },
  "races-tiefling": { fixed: ["Общий", "Инфернальный"] },
};

/**
 * Сколько дополнительных языков на выбор даёт предыстория, сверх тех, что
 * дала раса — сверено с купленной владельцем Книгой игрока (см. правило в
 * задаче про этот файл, .gitignore, не коммитить сам PDF): только факт
 * «эта предыстория даёт язык(и) на выбор» и их число, ничего из текста
 * особенности предыстории отсюда не взято (`BACKGROUNDS` в этом файле —
 * оригинальные владения/снаряжение/особенность, не из книги). `acolyte`
 * (Послушник) и `sage` (Мудрец) дают по два; `guild-artisan` (Гильдейский
 * ремесленник), `hermit` (Отшельник), `noble` (Дворянин — «Благородный» в
 * переводе купленной книги) и `outlander` (Чужеземец) — по одному. У
 * предыстории, которой нет в этом списке, языкового выбора не
 * предусмотрено (проверено по книге для всех 13, не только для Дворянина
 * и Мудреца, которые упомянул владелец).
 */
export const BACKGROUND_LANGUAGES: Record<string, number> = {
  acolyte: 2,
  "guild-artisan": 1,
  hermit: 1,
  noble: 1,
  outlander: 1,
  sage: 2,
};

/**
 * Механические бонусы рас за пределами характеристик — сверены вручную с
 * текстом расы (rules.json), тот же принцип, что и RACE_ABILITY_BONUSES:
 * одна запись = базовая раса + единственный доступный в SRD подвид.
 *
 * Не включено сознательно: заговор тавматургия у тифлинга (Дьявольское
 * наследие) — в приложении пока вообще нет системы заклинаний (см. решение
 * отложить заклинания), тащить один изолированный заговор без остальной
 * системы бессмысленно. Ситуативные преимущества без числового значения
 * (Гномья хитрость, Удачливый у полурослика, дыхание дракона и т.п.) —
 * остаются только текстом расы, для них в листе персонажа нет числового
 * поля, которое можно было бы посчитать.
 */

/** Холмовой дварф: «Дварфская выдержка» — макс. хиты +1 на 1 уровне. */
export const RACE_HP_BONUS: Record<string, number> = {
  "races-dwarf": 1,
};

/** Навыки, которые раса даёт автоматически (не выбор игрока). */
export const RACE_FIXED_SKILLS: Record<string, string[]> = {
  "races-elf": ["Восприятие"], // Обострённые чувства
  "races-half-orc": ["Запугивание"], // Угрожающий
};

/** Полуэльф: «Гибкость навыков» — 2 навыка по выбору игрока. */
export const RACE_SKILL_CHOICE_COUNT: Record<string, number> = {
  "races-half-elf": 2,
};

export interface RaceTrait {
  name: string;
  description: string;
}

/**
 * Особенности рас без числового поля в листе персонажа (сжато из абзацев
 * SRD 5.1, своими словами) — сила/скорость/языки уже показаны отдельно
 * строками выше, здесь только остальное. Где особенность уже учтена
 * механически в другом месте листа (хиты, навык, языки), помечено явно,
 * чтобы не выглядело как повтор без причины.
 *
 * Заклинания в этих особенностях (Заговор высшего эльфа, Дьявольское
 * наследие тифлинга) описаны только текстом — в приложении ещё нет системы
 * заклинаний вообще (см. решение отложить заклинания), поэтому выбор и учёт
 * такого заклинания — на игроке, по бумажной книге.
 */
export const RACE_TRAITS: Record<string, RaceTrait[]> = {
  "races-dwarf": [
    { name: "Тёмное зрение", description: "Видишь в темноте и при тусклом свете на 60 футов (в темноте — только оттенки серого)." },
    { name: "Дварфская стойкость", description: "Преимущество на спасброски от яда и сопротивление урону ядом." },
    { name: "Дварфская выдержка", description: "Уже учтено в максимуме хитов выше (+1)." },
    { name: "Дварфийская боевая тренировка", description: "Владение боевым топором, ручным топором, лёгким молотом и боевым молотом." },
    { name: "Владение инструментами", description: "На выбор: инструменты кузнеца, пивовара или каменщика (впиши сам)." },
    { name: "Знание камня", description: "Двойной бонус мастерства в проверках Истории про происхождение каменной кладки." },
  ],
  "races-halfling": [
    { name: "Удачливый", description: "Выпала «1» на атаке, проверке или спасброске — можно перебросить кубик." },
    { name: "Храбрый", description: "Преимущество на спасброски от испуга." },
    { name: "Проворство полуросликов", description: "Можешь проходить через клетку существа, которое крупнее тебя." },
    { name: "Естественная скрытность", description: "Можешь прятаться, даже если тебя заслоняет существо лишь немного крупнее." },
  ],
  "races-human": [],
  "races-elf": [
    { name: "Тёмное зрение", description: "Видишь в темноте и при тусклом свете на 60 футов (в темноте — только оттенки серого)." },
    { name: "Обострённые чувства", description: "Уже учтено в навыках выше (владение Восприятием)." },
    { name: "Наследие фей", description: "Преимущество на спасброски от очарования, тебя нельзя усыпить магией." },
    { name: "Транс", description: "Вместо сна медитируешь 4 часа — этого достаточно для полноценного отдыха." },
    { name: "Владение эльфийским оружием", description: "Владение длинным мечом, коротким мечом, коротким луком и длинным луком." },
    {
      name: "Заговор высшего эльфа",
      description:
        "Знаешь один заговор волшебника на выбор (характеристика — Интеллект). Списка заклинаний в приложении пока нет — выбери и запиши сам.",
    },
    { name: "Дополнительный язык", description: "Уже учтён в списке языков выше." },
  ],
  "races-gnome": [
    { name: "Тёмное зрение", description: "Видишь в темноте и при тусклом свете на 60 футов (в темноте — только оттенки серого)." },
    { name: "Гномья хитрость", description: "Преимущество на спасброски Интеллекта, Мудрости и Харизмы против магии." },
    { name: "Ремесленные знания", description: "Двойной бонус мастерства в проверках Истории про магические, алхимические или технологические предметы." },
    {
      name: "Механик",
      description:
        "Владение инструментами жестянщика: за час работы и 10 зм материалов собираешь крошечное устройство (часовой шмель, заводная игрушка или поджигатель).",
    },
  ],
  "races-dragonborn": [
    {
      name: "Наследие драконов",
      description: "Выбираешь вид дракона — определяет урон дыхания и сопротивление (таблицы в приложении пока нет, выбери и запиши сам).",
    },
    { name: "Оружие дыхания", description: "Действием выдыхаешь энергию по области; спасбросок УС = 8 + мод. Телосложения + бонус мастерства, 2к6 урона при провале (на 1 уровне)." },
    { name: "Сопротивление урону", description: "Сопротивление виду урона твоего наследия драконов." },
  ],
  "races-half-orc": [
    { name: "Тёмное зрение", description: "Видишь в темноте и при тусклом свете на 60 футов (в темноте — только оттенки серого)." },
    { name: "Угрожающий", description: "Уже учтено в навыках выше (владение Запугиванием)." },
    { name: "Непоколебимая стойкость", description: "Хиты падают до 0, но ты не убит мгновенно — остаёшься на 1 хите (раз за длинный отдых)." },
    { name: "Свирепые атаки", description: "Критическое попадание рукопашным оружием добавляет ещё одну кость урона оружия." },
  ],
  "races-half-elf": [
    { name: "Тёмное зрение", description: "Видишь в темноте и при тусклом свете на 60 футов (в темноте — только оттенки серого)." },
    { name: "Наследие фей", description: "Преимущество на спасброски от очарования, тебя нельзя усыпить магией." },
    { name: "Гибкость навыков", description: "Уже учтено в навыках выше (2 навыка на выбор)." },
  ],
  "races-tiefling": [
    { name: "Тёмное зрение", description: "Видишь в темноте и при тусклом свете на 60 футов (в темноте — только оттенки серого)." },
    { name: "Адское сопротивление", description: "Сопротивление урону огнём." },
    {
      name: "Дьявольское наследие",
      description:
        "Знаешь заговор тавматургия; с 3 уровня раз в день можешь сотворить адское возмездие как заклинание 2 уровня. Списка заклинаний в приложении пока нет — веди сам по книге.",
    },
  ],
};

/** Заклинательная характеристика — только классы, у которых заклинания есть уже на 1 уровне. */
export const CLASS_SPELLCASTING_ABILITY: Record<string, string> = {
  "classes-bard": "Харизма",
  "classes-cleric": "Мудрость",
  "classes-druid": "Мудрость",
  "classes-sorcerer": "Харизма",
  "classes-warlock": "Харизма",
  "classes-wizard": "Интеллект",
};

/** То же самое, но ключом характеристики модели персонажа, а не текстовой меткой — нужно для расчёта модификатора. */
export const CLASS_SPELLCASTING_ABILITY_KEY: Record<string, AbilityKey> = {
  "classes-bard": "charisma",
  "classes-cleric": "wisdom",
  "classes-druid": "wisdom",
  "classes-sorcerer": "charisma",
  "classes-warlock": "charisma",
  "classes-wizard": "intelligence",
};

/**
 * Дварф: «Владение инструментами. Вы владеете ремесленными инструментами по
 * вашему выбору: инструментами кузнеца, пивовара или каменщика.» — цена/вес
 * из таблицы «Инструменты» SRD (rules.json → equipment-tools).
 */
export const DWARF_TOOL_CHOICES: GearData[] = [
  { name: "Инструменты кузнеца", cost: "20 зм", weight: "8 фнт." },
  { name: "Инструменты пивовара", cost: "20 зм", weight: "9 фнт." },
  { name: "Инструменты каменщика", cost: "10 зм", weight: "8 фнт." },
];

/**
 * Полный список наборов «Инструменты ремесленников» из таблицы «Инструменты»
 * SRD 5.1 (rules.json → equipment-tools) — не ограничен тремя вариантами
 * дварфа (`DWARF_TOOL_CHOICES`), это отдельный, более широкий выбор (нужен,
 * например, Монаху: «один вид инструмента ремесленника — любой»).
 */
export const ARTISAN_TOOLS: GearData[] = [
  { name: "Инструменты алхимика", cost: "50 зм", weight: "8 фнт." },
  { name: "Инструменты пивовара", cost: "20 зм", weight: "9 фнт." },
  { name: "Инструменты каллиграфа", cost: "10 зм", weight: "5 фнт." },
  { name: "Инструменты плотника", cost: "8 зм", weight: "6 фнт." },
  { name: "Инструменты картографа", cost: "15 зм", weight: "6 фнт." },
  { name: "Инструменты сапожника", cost: "5 зм", weight: "5 фнт." },
  { name: "Инструменты повара", cost: "1 зм", weight: "8 фнт." },
  { name: "Инструменты стеклодува", cost: "30 зм", weight: "5 фнт." },
  { name: "Ювелирные инструменты", cost: "25 зм", weight: "2 фнт." },
  { name: "Инструменты кожевника", cost: "5 зм", weight: "5 фнт." },
  { name: "Инструменты каменщика", cost: "10 зм", weight: "8 фнт." },
  { name: "Инструменты художника", cost: "10 зм", weight: "5 фнт." },
  { name: "Инструменты гончара", cost: "10 зм", weight: "3 фнт." },
  { name: "Инструменты кузнеца", cost: "20 зм", weight: "8 фнт." },
  { name: "Инструменты жестянщика", cost: "50 зм", weight: "10 фнт." },
  { name: "Инструменты ткача", cost: "1 зм", weight: "5 фнт." },
  { name: "Инструменты резчика по дереву", cost: "1 зм", weight: "5 фнт." },
];

export interface FightingStyle {
  name: string;
  description: string;
}

/** Боевые стили Воина на 1 уровне (rules.json → classes-fighter, раздел «Боевой стиль»). */
export const FIGHTER_FIGHTING_STYLES: FightingStyle[] = [
  { name: "Стрельба из лука", description: "Бонус +2 к броску атаки дальнобойным оружием." },
  { name: "Оборона", description: "Пока ты в доспехах — бонус +1 к КД." },
  { name: "Дуэлянт", description: "Держишь оружие ближнего боя в одной руке, без другого оружия в другой — бонус +2 к урону этим оружием." },
  {
    name: "Сражение большим оружием",
    description:
      "Выпало «1» или «2» на кости урона двуручного/универсального оружия ближнего боя — можно перебросить, новый результат обязателен.",
  },
  {
    name: "Защита",
    description: "Существо атакует не тебя, а союзника рядом — реакцией даёшь помеху этой атаке (нужен щит).",
  },
  { name: "Сражение двумя оружиями", description: "К урону от второй атаки при бое двумя оружиями добавляется модификатор характеристики." },
];

/** Следопыт, «Избранный враг» — 13 видов существ + вариант «два вида гуманоидов» (rules.json → classes-ranger). */
export const RANGER_FAVORED_ENEMIES = [
  "Аберрации",
  "Великаны",
  "Драконы",
  "Звери",
  "Исчадия",
  "Конструкты",
  "Монстры",
  "Небожители",
  "Нежить",
  "Растения",
  "Слизи",
  "Феи",
  "Элементали",
  "Два вида гуманоидов (впиши какие)",
];

/** Следопыт, «Естественный исследователь» — вид местности (rules.json → classes-ranger). */
export const RANGER_TERRAIN_TYPES = ["Арктика", "Болота", "Горы", "Леса", "Луга", "Побережье", "Пустыня"];

/**
 * Подсказки имён для кнопки «Предложить имя» на шаге «Итог» — это НЕ раздел
 * SRD 5.1: в открытом документе списков примеров имён по расам нет вовсе
 * (только в платной Книге игрока), поэтому здесь придуманные fantasy-звучащие
 * имена в стиле расы, не выверенные ни по какому источнику и не выдаваемые
 * за официальные. `general` — нейтральный список для случая, когда раса ещё
 * не выбрана. Список разбит по полу (см. `GENDERS` в `CharacterWizard.tsx`) —
 * кнопка подставляет имя, соответствующее уже выбранному на шаге «Итог» полу.
 */
export const NAME_SUGGESTIONS: Record<string, { male: string[]; female: string[] }> = {
  "races-human": {
    male: [
      "Дарнвел", "Кориан", "Альдрет", "Брамвик", "Фендрал", "Роскар", "Талвин", "Эдрик Вороново",
      "Гарвен", "Осмунд", "Керриган", "Валдор", "Лориан", "Морвен", "Тарквин", "Эйден Серп",
      "Брендис", "Кастеллан", "Ивальд", "Ренфорд",
    ],
    female: [
      "Аларин", "Селвина", "Тамриэль", "Идриэль", "Морвенна", "Кэлиста", "Фэлия", "Вэлдрия",
      "Осалин", "Бренвен", "Тариэль", "Ленора Ясень", "Дариэль", "Иверна", "Кассандрин", "Мирелла",
      "Эленора Свет", "Ротвен", "Сэлинда", "Виндариэль",
    ],
  },
  "races-dwarf": {
    male: [
      "Торбин", "Бримгард", "Далин Огнебород", "Хротгар", "Барви", "Ундрим", "Грундар", "Кильгар",
      "Оддвар", "Торгрим", "Балдрик", "Ронгвир", "Свенбьорн", "Хальдор", "Бофрин", "Дюрин Стальнобород",
      "Гимбар", "Носрик", "Вильдрам", "Магнибор",
    ],
    female: [
      "Гронда", "Сигрун", "Дагна", "Тордис", "Хельга", "Бримхильда", "Асгерд", "Ронгвейг",
      "Ундра", "Гердис", "Вигдис", "Торгунна", "Ильва", "Скади", "Ранхильда", "Бирна",
      "Фрея Каменотёс", "Аудра", "Гримхильда", "Свангерд",
    ],
  },
  "races-halfling": {
    male: [
      "Тодди Норкинс", "Мерфи Тихокрад", "Долдер Клюковка", "Хэмфри Свечка", "Барни Подкроватс",
      "Вилли Пряничкинс", "Освин Норкинс", "Перри Толстопят", "Фродри Ватрушкинс", "Линдо Пуховкинс",
      "Джолли Огуречкинс", "Тоби Клубничкинс", "Уилбур Мохноступ", "Кубби Норкинс", "Гарри Пышкинс",
      "Момо Уголёк", "Дигби Пирожкинс", "Отис Кладовкинс", "Финдер Подполкинс", "Расти Медовик",
    ],
    female: [
      "Розалин Пышкинс", "Бинси Пампкинс", "Фенна Светлобрюх", "Пэтси Мохноног", "Дейзи Клюковкинс",
      "Мирта Пряничкинс", "Толли Норкинс", "Виола Пирожкинс", "Прим Уголёк", "Люси Толстопят",
      "Белла Ватрушкинс", "Сорри Огуречкинс", "Мэри Кладовкинс", "Флосси Подполкинс", "Пенни Медовик",
      "Руби Пуховкинс", "Нетти Норкинс", "Хлоя Клубничкинс", "Иви Подкроватс", "Тесса Мохноступ",
    ],
  },
  "races-elf": {
    male: [
      "Эленвир", "Талассион", "Кальдир", "Тэлмар", "Ллиндор", "Сильван", "Аранор", "Файлдор",
      "Миртан", "Вэлдрин", "Кэлеборн", "Эрендил", "Талиор", "Гиландир", "Ортанис", "Ниндор",
      "Файриэн", "Кэлдрин", "Талверн", "Ландориэль",
    ],
    female: [
      "Сильвара", "Ниэлла", "Аранвен", "Файлиэль", "Ллирэн", "Миртэль", "Талиэна", "Кэледвен",
      "Эриэль", "Ванимэ", "Гилрэн", "Ситиэль", "Ортвен", "Ниндрэль", "Сарэнвен", "Тэлория",
      "Файлэна", "Аэрвен", "Ландориэн", "Кэльвэн",
    ],
  },
  "races-gnome": {
    male: [
      "Финдл", "Кроцель", "Заголь", "Виквик", "Бодкин", "Физзл", "Гиззмо", "Крамбл",
      "Тинкер", "Вобблс", "Дингл", "Спрокет", "Никель", "Гоготун", "Брюм", "Плинк",
      "Скрип", "Тумблер", "Вихрок", "Клинк",
    ],
    female: [
      "Тритти", "Бумбл", "Пиввик", "Мерцель", "Физзи", "Гигглс", "Спарки", "Твинкл",
      "Динки", "Розочка Шестерёнка", "Виви", "Мими Искоркина", "Труди", "Пикси", "Нолли", "Заззи",
      "Крикки", "Флика", "Хлопушка", "Тинси",
    ],
  },
  "races-dragonborn": {
    male: [
      "Кризалт", "Тарнак", "Вермидекс", "Драгвин", "Балкорат", "Химракс", "Норвейд", "Сскарнат",
      "Тордракс", "Вирмалор", "Гортекс", "Кайдрат", "Ксандрел", "Мордракс", "Тираннис", "Вельдрак",
      "Аркорат", "Пиррагон", "Скорвейд", "Дракобал",
    ],
    female: [
      "Ораксис", "Шандрал", "Пирривас", "Иссара", "Кайринда", "Вермилла", "Тордиса", "Ксантрия",
      "Ниррасса", "Дракийра", "Скарисса", "Тиранна", "Вельдрисса", "Аркессия", "Химерра", "Норайда",
      "Сскарина", "Пиррания", "Балкира", "Виррана",
    ],
  },
  "races-half-orc": {
    male: [
      "Груш", "Ротгар", "Задрок", "Врунк", "Огрим", "Крагул", "Морзук", "Дрогбар",
      "Хрунт", "Гаргаш", "Рокдал", "Тхорг", "Уззак", "Балгор", "Кровнак", "Мугдар",
      "Скарнок", "Грендул", "Вардак", "Наггур",
    ],
    female: [
      "Мурга", "Хурга", "Скальга", "Гродна", "Уззара", "Ротка", "Драгна", "Гарма",
      "Крагда", "Ворха", "Наггара", "Тхорга", "Скарма", "Балгра", "Мугра", "Вардана",
      "Грендла", "Рокда", "Уграна", "Хрунда",
    ],
  },
  "races-half-elf": {
    male: [
      "Каэлин", "Соримир", "Лориэн-Дар", "Норвель", "Эландир", "Кэйдан", "Ситрам", "Вэлориан",
      "Финдар", "Орландир", "Тэлмор", "Аэдан", "Сильвион", "Марквель", "Дориан Полуэльф", "Ленвар",
      "Кастиэль", "Родерик", "Айвендил", "Тарквин",
    ],
    female: [
      "Мирандель", "Ветрана", "Айрис", "Тэссарин", "Лориэль", "Кэйдра", "Ситара", "Вэлория",
      "Финдра", "Орланда", "Тэлмира", "Аэдана", "Сильвия Полуэльфийка", "Марквен", "Дорианна", "Ленвара",
      "Кастиэлла", "Роксана", "Айвендра", "Тарквина",
    ],
  },
  "races-tiefling": {
    male: [
      "Кринай", "Вексий", "Забракс", "Нокс", "Морокс", "Ксилтан", "Древорат", "Вальтрис",
      "Скорнак", "Пирокс", "Гнилрат", "Тенебрис", "Кальдракс", "Вирулон", "Мракотар", "Сумракс",
      "Оскверн", "Хаосрат", "Тьмагор", "Инферон",
    ],
    female: [
      "Мораста", "Асморель", "Инферис", "Селестрин", "Ксилла", "Вексина", "Морвенна", "Тенебра",
      "Пирокса", "Скорна", "Древорра", "Кальдресса", "Вирулла", "Мракайя", "Сумракса", "Оскверна",
      "Хаосра", "Тьмагора", "Инферна", "Забрия",
    ],
  },
  general: {
    male: [
      "Алекс", "Сандер", "Тавин", "Рен", "Кай", "Джордан", "Морис", "Лео",
      "Финн", "Гаррет", "Ноа", "Стеллан", "Эрик", "Дэвин", "Роан", "Тэйлор",
      "Кэмерон", "Брин", "Овен", "Джейс",
    ],
    female: [
      "Морган", "Ким", "Ория", "Лисса", "Эйвери", "Скайлар", "Рован", "Тэлис",
      "Джун", "Нова", "Кайра", "Эшли", "Одри", "Марли", "Сирень", "Ивлин",
      "Тория", "Ленора", "Фиона", "Джессика",
    ],
  },
};

/**
 * 14 состояний + 6 отдельных уровней истощения из SRD 5.1
 * (rules.json → appendices-conditions). Истощение хранится как 6 разных
 * выбираемых значений, а не одно «Истощение», т.к. эффект накопительный и
 * зависит от конкретного уровня (см. EXHAUSTION_LEVEL_EFFECTS в CharactersPage.tsx).
 */
export const CONDITIONS = [
  "Ослеплённое",
  "Заворожённое",
  "Оглохшее",
  "Испуганное",
  "Схваченное",
  "Недееспособное",
  "Невидимое",
  "Парализованное",
  "Окаменевшее",
  "Отравленное",
  "Сбитый с ног",
  "Опутанный",
  "Оглушенное",
  "Бессознательный",
  "Истощение (ур. 1)",
  "Истощение (ур. 2)",
  "Истощение (ур. 3)",
  "Истощение (ур. 4)",
  "Истощение (ур. 5)",
  "Истощение (ур. 6)",
];

/**
 * Промысловые товары из SRD 5.1 (rules.json → equipment-trade-goods). Таблица
 * источника даёт цену и товар совместно (иногда «или» между двумя товарами
 * одной цены) — здесь она разложена на отдельные позиции по одной на товар
 * (тот же товар/цена, просто раздельными строками ради каталога).
 */
export const TRADE_GOODS: GearData[] = [
  { name: "Пшеница (1 фунт.)", cost: "1 мм", weight: "1 фнт." },
  { name: "Мука (1 фунт.)", cost: "2 мм", weight: "1 фнт." },
  { name: "Цыплёнок", cost: "2 мм", weight: "—" },
  { name: "Соль (1 фунт.)", cost: "5 мм", weight: "1 фнт." },
  { name: "Железо (1 фунт.)", cost: "1 см", weight: "1 фнт." },
  { name: "Холст (1 кв. ярд.)", cost: "1 см", weight: "—" },
  { name: "Медь (1 фунт.)", cost: "5 см", weight: "1 фнт." },
  { name: "Хлопковая ткань (1 кв. ярд.)", cost: "5 см", weight: "—" },
  { name: "Имбирь (1 фунт.)", cost: "1 зм", weight: "1 фнт." },
  { name: "Коза", cost: "1 зм", weight: "—" },
  { name: "Корица или перец (1 фунт.)", cost: "2 зм", weight: "1 фнт." },
  { name: "Овца", cost: "2 зм", weight: "—" },
  { name: "Гвоздика (1 фунт.)", cost: "3 зм", weight: "1 фнт." },
  { name: "Свинья", cost: "3 зм", weight: "—" },
  { name: "Серебро (1 фунт.)", cost: "5 зм", weight: "1 фнт." },
  { name: "Льняная ткань (1 кв. ярд.)", cost: "5 зм", weight: "—" },
  { name: "Шёлк (1 кв. ярд.)", cost: "10 зм", weight: "—" },
  { name: "Корова", cost: "10 зм", weight: "—" },
  { name: "Шафран (1 фунт.)", cost: "15 зм", weight: "1 фнт." },
  { name: "Бык", cost: "15 зм", weight: "—" },
  { name: "Золото (1 фунт.)", cost: "50 зм", weight: "1 фнт." },
  { name: "Платина (1 фунт.)", cost: "500 зм", weight: "1 фнт." },
];

/**
 * Верховые животные и транспорт из SRD 5.1
 * (rules.json → equipment-mounts-and-vehicles, три таблицы источника:
 * «Верховые и другие животные», «Сёдла, упряжь и транспорт», «Водный
 * транспорт»). Для животных и водного транспорта источник не даёт веса
 * (только скорость/грузоподъёмность, которых у GearData нет поля) — вес
 * «—». Строка «Бардинг» (×4 цены/×2 веса доспеха) и заголовочная строка
 * «Седло» пропущены — это не отдельные покупаемые предметы, а модификатор и
 * заголовок группы; сами 4 вида сёдел включены под явными именами.
 */
export const MOUNTS_AND_VEHICLES: GearData[] = [
  { name: "Верблюд", cost: "50 зм", weight: "—" },
  { name: "Осёл или мул", cost: "8 зм", weight: "—" },
  { name: "Слон", cost: "200 зм", weight: "—" },
  { name: "Лошадь, тягловая", cost: "50 зм", weight: "—" },
  { name: "Лошадь, ездовая", cost: "75 зм", weight: "—" },
  { name: "Мастиф", cost: "25 зм", weight: "—" },
  { name: "Пони", cost: "30 зм", weight: "—" },
  { name: "Боевой конь", cost: "400 зм", weight: "—" },
  { name: "Упряжь и уздечка", cost: "2 зм", weight: "1 фнт." },
  { name: "Повозка", cost: "100 зм", weight: "600 фнт." },
  { name: "Тележка", cost: "15 зм", weight: "200 фнт." },
  { name: "Колесница", cost: "250 зм", weight: "100 фнт." },
  { name: "Корм (в день)", cost: "5 мм", weight: "10 фнт." },
  { name: "Седло экзотическое", cost: "60 зм", weight: "40 фнт." },
  { name: "Седло военное", cost: "20 зм", weight: "30 фнт." },
  { name: "Седло грузовое", cost: "5 зм", weight: "15 фнт." },
  { name: "Седло ездовое", cost: "10 зм", weight: "25 фнт." },
  { name: "Седельные сумки", cost: "4 зм", weight: "8 фнт." },
  { name: "Сани", cost: "20 зм", weight: "300 фнт." },
  { name: "Конюшня (в день)", cost: "5 см", weight: "—" },
  { name: "Вагон", cost: "35 зм", weight: "400 фнт." },
  { name: "Галера", cost: "30,000 зм", weight: "—" },
  { name: "Баркас", cost: "3,000 зм", weight: "—" },
  { name: "Драккар", cost: "10,000 зм", weight: "—" },
  { name: "Шлюпка", cost: "50 зм", weight: "—" },
  { name: "Парусный корабль", cost: "10,000 зм", weight: "—" },
  { name: "Военный корабль", cost: "25,000 зм", weight: "—" },
];

export interface HealingPotionData {
  name: string;
  /** Кости лечения в нотации проекта, например «2к4+2». */
  healingDice: string;
  rarity: string;
  description: string;
}

/**
 * Зелья лечения — таблица «Potions of Healing» из официального SRD 5.1 PDF
 * (media.wizards.com/2016/downloads/DND/SRD-OGL_V5.1.pdf, раздел Magic
 * Items → Potion of Healing), сверено по тексту PDF в этой сессии.
 * `rules.json` (перевод longstoryshort.app) раздела о магических предметах
 * не содержит вообще, поэтому источник — сам PDF, не rules.json.
 * Официальная цена в gp для зелий лечения в SRD не указана (по редкости, не
 * по фиксированной цене) — `cost` оставлен «—», как и у прочих предметов без
 * заданного значения в этом файле.
 */
export const HEALING_POTIONS: HealingPotionData[] = [
  {
    name: "Зелье лечения",
    healingDice: "2к4+2",
    rarity: "обычная",
    description: "Магическая красная жидкость. При выпивании восстанавливает 2к4+2 хитов.",
  },
  {
    name: "Зелье большого лечения",
    healingDice: "4к4+4",
    rarity: "необычная",
    description: "При выпивании восстанавливает 4к4+4 хитов.",
  },
  {
    name: "Зелье превосходного лечения",
    healingDice: "8к4+8",
    rarity: "редкая",
    description: "При выпивании восстанавливает 8к4+8 хитов.",
  },
  {
    name: "Зелье наивысшего лечения",
    healingDice: "10к4+20",
    rarity: "очень редкая",
    description: "При выпивании восстанавливает 10к4+20 хитов.",
  },
];

/**
 * Полный каталог имён предметов для подсказок инвентаря — оружие, доспехи,
 * снаряжение авантюриста, музыкальные инструменты, инструменты ремесленника,
 * промысловые товары, верховые животные/транспорт и зелья лечения,
 * объединённые и без дублей по name.
 */
export const ALL_ITEM_NAMES: string[] = [
  ...new Set([
    ...WEAPONS.map((w) => w.name),
    ...ARMOR.map((a) => a.name),
    ...ADVENTURING_GEAR.map((g) => g.name),
    ...INSTRUMENTS.map((i) => i.name),
    ...ARTISAN_TOOLS.map((t) => t.name),
    ...DWARF_TOOL_CHOICES.map((t) => t.name),
    ...TRADE_GOODS.map((g) => g.name),
    ...MOUNTS_AND_VEHICLES.map((v) => v.name),
    ...HEALING_POTIONS.map((p) => p.name),
  ]),
];

/**
 * Полный каталог предметов с ценой/весом — та же объединённая коллекция, что
 * и `ALL_ITEM_NAMES`, но полными объектами `{name, cost, weight}` вместо
 * голых имён (нужно там, где в опции показывается цена/вес). Дубли по name
 * убраны — при совпадении между списками побеждает первое вхождение в
 * порядке перечисления ниже.
 */
export const ALL_ITEMS_WITH_COST: GearData[] = (() => {
  const seen = new Set<string>();
  const items: GearData[] = [];
  for (const item of [
    ...WEAPONS,
    ...ARMOR,
    ...ADVENTURING_GEAR,
    ...INSTRUMENTS,
    ...ARTISAN_TOOLS,
    ...DWARF_TOOL_CHOICES,
    ...TRADE_GOODS,
    ...MOUNTS_AND_VEHICLES,
    // Зелья лечения — цена в SRD не задана числом (по редкости, не по gp), «—» как и у прочих
    // предметов этого файла без известного значения.
    ...HEALING_POTIONS.map((p) => ({ name: p.name, cost: "—", weight: "—" })),
  ]) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    items.push({ name: item.name, cost: item.cost, weight: item.weight });
  }
  return items;
})();
