import { abilityMod, subclassGrants, type AbilityKey } from "./characterCreationData";
// Первый наш класс: id и id его счётчиков принадлежат модулю класса, и
// второй копии этих строк здесь быть не должно — по тем же id лист ищет
// `Character.featureUses`. Встречного импорта оттуда нет.
import {
  BLOOD_CURSES_KNOWN_STEPS,
  BLOOD_CURSE_RESOURCE_ID,
  BLOOD_HUNTER_ID,
  BRAND_OF_CASTIGATION_RESOURCE_ID,
} from "./bloodHunterClass";
import type { AbilityScores } from "../state/types";

/** Потолок уровня приложения — вся таблица ниже заполнена только до него (см. MAX_LEVEL в CharactersPage.tsx). */
export const PROGRESSION_MAX_LEVEL = 12;

/**
 * Число кругов заклинаний, под которое заведены таблицы ячеек (1-9, вся
 * официальная шкала SRD) — не путать с тем, сколько из них реально доступно
 * при текущем потолке уровня: полный заклинатель на уровне 12 добирается
 * до 6-го круга (первая ячейка 6 круга — на 11 уровне), а круги 7-9 требуют
 * 13/15/17 уровня и потому остаются нулевыми в таблицах ниже, пока
 * PROGRESSION_MAX_LEVEL не поднимут отдельной задачей.
 */
export const SPELL_CIRCLES = 9;

/**
 * Как класс получает доступ к заклинаниям:
 * - `known` — фиксированный список известных заклинаний, растёт по таблице (Бард/Чародей/Колдун/Следопыт);
 * - `prepared` — доступен весь список класса, игрок готовит подмножество каждый день (Жрец/Друид/Волшебник/Паладин);
 * - `none` — не заклинатель (Варвар/Воин/Монах/Плут).
 */
export type SpellsKnownKind = "known" | "prepared" | "none";

/**
 * Классовый ресурс с ограниченным числом использований — Ярость, Ци, Проведение
 * энергии и т.п. Максимум берётся из таблицы класса (`max`) либо считается от
 * характеристики (`maxFrom`, SRD: Вдохновение барда — модификатор Харизмы,
 * минимум 1; Божественное чувство — 1 + модификатор Харизмы).
 */
export interface ClassResource {
  id: string;
  name: string;
  /**
   * Подпись особенности на листе персонажа — одно предложение: что даёт и чем
   * платится. Единственный владелец ИМЕННО ЭТОГО текста; полное правило живёт
   * в `CLASS_LEVEL_FEATURES`/`featuresByLevel` (characterCreationData.ts) и в
   * `rules.json` и сюда не копируется. Чисел в подписи нет намеренно: максимум
   * уже считает `max`/`maxFrom` и показывает счётчик строки, а кость, дальность
   * и длительность принадлежат тексту особенности — второй копии не заводим.
   */
  description: string;
  max?: number;
  maxFrom?: { ability: AbilityKey; plus: number; min: number };
  /** На каком отдыхе восстанавливается (SRD-текст умения). */
  recharge: "short" | "long";
  /** Единица счёта для показа: «использование», «очко», «хит». */
  unit: string;
}

/** Числовое свойство, растущее с уровнем, но не тратящееся: кость Скрытой атаки, кость Вдохновения барда и т.п. */
export interface ClassScalingValue {
  name: string;
  value: string;
}

export interface ClassLevelProgression {
  /** Ячейки заклинаний по кругам 1..9 (SPELL_CIRCLES) — индекс 0 это 1 круг. */
  spellSlots: number[];
  cantripsKnown: number;
  /** Известные заклинания — только у `spellsKnownKind: "known"`, у остальных 0. */
  spellsKnown: number;
  resources: ClassResource[];
  scaling: ClassScalingValue[];
}

export interface ClassProgression {
  spellsKnownKind: SpellsKnownKind;
  /**
   * На каком отдыхе возвращаются ячейки заклинаний. SRD: ячейки Магии договора
   * Колдуна восстанавливаются после КОРОТКОГО отдыха, у всех прочих
   * заклинателей — только после длинного. Поле обязательное у каждого класса
   * намеренно: новый класс не пройдёт проверку типов, не объявив свой отдых, —
   * тогда как `classId === "classes-warlock"` внутри кнопки отдыха был бы тем
   * же хардкодом, только спрятанным, и молчал бы о забытом классе.
   *
   * У не-заклинателя поле бессмысленно, но безвредно: ячеек у него нет вовсе,
   * и возвращать отдыху нечего.
   */
  slotRecharge: "short" | "long";
  byLevel: Record<number, ClassLevelProgression>;
}

/** Нули на все 9 кругов — строка не-заклинателя и уровней, на которых класс ещё не колдует. */
const NO_SLOTS = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/**
 * Таблица ячеек полного заклинателя (Бард/Жрец/Друид/Чародей/Волшебник), уровни 1-12.
 * Первая ячейка 6 круга приходит на 11 уровне — при потолке 12 это высший
 * достижимый круг. Столбцы кругов 7-9 остаются нулевыми: по официальной
 * таблице SRD они требуют 13/15/17 уровня, то есть недостижимы при нынешнем
 * PROGRESSION_MAX_LEVEL = 12, а не потеряны. Данные заклинаний этих кругов
 * уже есть в spells.json (spellsForLevel их не прячет) — таблица ждёт
 * будущего подъёма потолка уровня.
 */
const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
};

/**
 * Таблица ячеек полузаклинателя (Паладин/Следопыт) — заклинания только со 2
 * уровня, и круг растёт вдвое медленнее: к 12 уровню доступен лишь 3 круг.
 */
const HALF_CASTER_SLOTS: Record<number, number[]> = {
  1: NO_SLOTS,
  2: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  4: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  6: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  8: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  9: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  10: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  11: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  12: [4, 3, 3, 0, 0, 0, 0, 0, 0],
};

/**
 * Магия договора Колдуна — отдельная таблица SRD: мало ячеек, но все они
 * сразу высшего доступного круга (столбцы «Ячейки заклинаний» и «Уровень
 * ячеек»), и восстанавливаются на коротком отдыхе. Круг ячеек растёт быстрее
 * их числа: 5 круг уже на 9 уровне, тогда как третья ячейка — только на 11.
 * Выше 5 круга Магия договора не поднимается вовсе — заклинания 6 круга
 * Колдун получает не ячейкой, а Мистическим арканумом на 11 уровне.
 */
const PACT_MAGIC_SLOTS: Record<number, number[]> = {
  1: [1, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [0, 2, 0, 0, 0, 0, 0, 0, 0],
  4: [0, 2, 0, 0, 0, 0, 0, 0, 0],
  5: [0, 0, 2, 0, 0, 0, 0, 0, 0],
  6: [0, 0, 2, 0, 0, 0, 0, 0, 0],
  7: [0, 0, 0, 2, 0, 0, 0, 0, 0],
  8: [0, 0, 0, 2, 0, 0, 0, 0, 0],
  9: [0, 0, 0, 0, 2, 0, 0, 0, 0],
  10: [0, 0, 0, 0, 2, 0, 0, 0, 0],
  11: [0, 0, 0, 0, 3, 0, 0, 0, 0],
  12: [0, 0, 0, 0, 3, 0, 0, 0, 0],
};

function levels(
  build: (level: number) => Omit<ClassLevelProgression, "resources" | "scaling"> &
    Partial<Pick<ClassLevelProgression, "resources" | "scaling">>,
): Record<number, ClassLevelProgression> {
  const byLevel: Record<number, ClassLevelProgression> = {};
  for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
    const { resources = [], scaling = [], ...rest } = build(level);
    byLevel[level] = { ...rest, resources, scaling };
  }
  return byLevel;
}

/**
 * Значение из таблицы по уровню: `steps` — пары «с какого уровня → значение»,
 * читается сверху вниз, берётся последняя подошедшая. Нужен там, где число
 * растёт не формулой, а ступенями официальной таблицы (заговоры, кость
 * Боевых искусств, число Ярости), — чтобы ступени стояли числами SRD, а не
 * прятались в цепочке тернарных операторов.
 */
function byStep<T>(level: number, steps: [number, T][]): T {
  let value = steps[0][1];
  for (const [from, step] of steps) {
    if (level >= from) value = step;
  }
  return value;
}

/**
 * Столбец таблицы класса, где число задано построчно и формулой не ложится
 * (известные заклинания Барда/Чародея/Колдуна/Следопыта, известные воззвания).
 * Индекс — уровень персонажа, нулевой элемент не используется.
 */
function byLevelRow(level: number, row: number[]): number {
  return row[level] ?? 0;
}

const BARDIC_INSPIRATION: ClassResource = {
  id: "bardic-inspiration",
  name: "Вдохновение барда",
  description: "Бонусным действием отдаёт союзнику кость вдохновения: он прибавит её бросок к одной проверке, атаке или спасброску.",
  maxFrom: { ability: "charisma", plus: 0, min: 1 },
  recharge: "long",
  unit: "использование",
};

/**
 * Прогрессия всех 12 базовых классов на уровнях 1-12 — числа сняты построчно с
 * таблиц прогрессии классов в `src-tauri/rules/rules.json` (SRD 5.1, уже
 * переведённый). ПОЛНЫЕ тексты особенностей живут отдельно и здесь не
 * дублируются (см. `CLASS_LEVEL_FEATURES` в characterCreationData.ts —
 * единственный владелец полных описаний). Здесь у ресурса есть только
 * `description` — однострочная подпись под кнопкой, см. `ClassResource`:
 * это отдельный текст, а не сокращение того; пересказывать им правило
 * целиком не надо, за этим игрок идёт в «Правила».
 */
export const CLASS_PROGRESSION: Record<string, ClassProgression> = {
  "classes-bard": {
    spellsKnownKind: "known",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: byStep(level, [[1, 2], [4, 3], [10, 4]]),
      // Столбец «Известные заклинания»: до 9 уровня это ровно 3 + уровень, но
      // на 10 таблица даёт сразу +2 (Магические тайны), а на 12 не растёт вовсе.
      spellsKnown: byLevelRow(level, [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15]),
      resources: [
        // «Источник вдохновения» с 5 уровня переводит восстановление на короткий отдых.
        { ...BARDIC_INSPIRATION, recharge: level >= 5 ? "short" : "long" },
      ],
      scaling: [
        { name: "Кость Вдохновения барда", value: byStep(level, [[1, "к6"], [5, "к8"], [10, "к10"]]) },
      ],
    })),
  },
  "classes-barbarian": {
    spellsKnownKind: "none",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: NO_SLOTS,
      cantripsKnown: 0,
      spellsKnown: 0,
      resources: [
        {
          id: "rage",
          name: "Ярость",
          description:
            "Бонусным действием даёт преимущество на Силу, сопротивление физическому урону и прибавку к рукопашному урону, но закрыта для носящих тяжёлый доспех.",
          max: byStep(level, [[1, 2], [3, 3], [6, 4], [12, 5]]),
          recharge: "long",
          unit: "использование",
        },
      ],
      scaling: [{ name: "Урон ярости", value: byStep(level, [[1, "+2"], [9, "+3"]]) }],
    })),
  },
  "classes-fighter": {
    spellsKnownKind: "none",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: NO_SLOTS,
      cantripsKnown: 0,
      spellsKnown: 0,
      resources: [
        {
          id: "second-wind",
          name: "Второе дыхание",
          description: "Бонусным действием возвращает себе хиты броском кости с прибавкой за уровень воина.",
          max: 1,
          recharge: "short",
          unit: "использование",
        },
        ...(level >= 2
          ? [
              {
                id: "action-surge",
                name: "Всплеск действий",
                description: "В свой ход даёт второе действие сверх обычного.",
                max: 1,
                recharge: "short",
                unit: "использование",
              } as ClassResource,
            ]
          : []),
        ...(level >= 9
          ? [
              {
                id: "indomitable",
                name: "Неукротимый",
                description: "Позволяет перебросить проваленный спасбросок, и новый результат придётся принять.",
                max: 1,
                recharge: "long",
                unit: "использование",
              } as ClassResource,
            ]
          : []),
      ],
    })),
  },
  "classes-wizard": {
    spellsKnownKind: "prepared",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: byStep(level, [[1, 3], [4, 4], [10, 5]]),
      spellsKnown: 0,
      resources: [
        {
          id: "arcane-recovery",
          name: "Магическое восстановление",
          description: "В коротком отдыхе возвращает часть потраченных ячеек заклинаний невысоких кругов.",
          max: 1,
          recharge: "long",
          unit: "использование",
        },
      ],
    })),
  },
  "classes-druid": {
    spellsKnownKind: "prepared",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: byStep(level, [[1, 2], [4, 3], [10, 4]]),
      spellsKnown: 0,
      resources:
        level >= 2
          ? [
              {
                id: "wild-shape",
                name: "Дикий облик",
                description: "Действием обращает вас в зверя доступного уровня опасности — его облик и характеристики на время заменяют ваши.",
                max: 2,
                recharge: "short",
                unit: "использование",
              },
            ]
          : [],
      scaling:
        level >= 2
          ? [
              {
                name: "Макс. УО зверя Дикого облика",
                value: byStep(level, [[2, "1/4"], [4, "1/2"], [8, "1"]]),
              },
            ]
          : [],
    })),
  },
  "classes-cleric": {
    spellsKnownKind: "prepared",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: byStep(level, [[1, 3], [4, 4], [10, 5]]),
      spellsKnown: 0,
      resources:
        level >= 2
          ? [
              {
                id: "channel-divinity",
                name: "Проведение энергии",
                description: "Запас божественной энергии: одно использование тратит любой вариант, который даёт ваш домен.",
                max: byStep(level, [[2, 1], [6, 2]]),
                recharge: "short",
                unit: "использование",
              },
            ]
          : [],
      scaling:
        level >= 5
          ? [
              {
                name: "Уничтожение нежити",
                value: byStep(level, [[5, "УО 1/2 или ниже"], [8, "УО 1 или ниже"], [11, "УО 2 или ниже"]]),
              },
            ]
          : [],
    })),
  },
  "classes-warlock": {
    spellsKnownKind: "known",
    slotRecharge: "short",
    byLevel: levels((level) => ({
      spellSlots: PACT_MAGIC_SLOTS[level],
      cantripsKnown: byStep(level, [[1, 2], [4, 3], [10, 4]]),
      // Столбец «Известные заклинания»: формула 1 + уровень ломается с 10
      // уровня — таблица там встаёт на месте через уровень.
      spellsKnown: byLevelRow(level, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11]),
      // Таинственный арканум 6 круга (11 уровень) — не ячейка Магии договора, а
      // отдельное заклинание раз в длинный отдых, поэтому это ресурс, а не
      // строка в PACT_MAGIC_SLOTS. Арканумы 7-9 круга требуют 13/15/17 уровня.
      resources:
        level >= 11
          ? [
              {
                id: "mystic-arcanum-6",
                name: "Таинственный арканум (6 круг)",
                description: "Даёт наложить выбранное заклинание этого круга, не тратя ячейку заклинаний.",
                max: 1,
                recharge: "long",
                unit: "использование",
              },
            ]
          : [],
      scaling: [
        ...(level >= 2
          ? [
              {
                name: "Известные воззвания",
                value: String(byLevelRow(level, [0, 0, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6])),
              },
            ]
          : []),
        { name: "Ячейки Магии договора", value: "восстанавливаются после короткого отдыха" },
      ],
    })),
  },
  "classes-monk": {
    spellsKnownKind: "none",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: NO_SLOTS,
      cantripsKnown: 0,
      spellsKnown: 0,
      resources:
        level >= 2
          ? [
              {
                id: "ki",
                name: "Ци",
                description: "Запас внутренней энергии: очки тратят приёмы монаха и умения выбранной традиции.",
                max: level,
                recharge: "short",
                unit: "очко",
              },
            ]
          : [],
      scaling: [
        { name: "Боевые искусства", value: byStep(level, [[1, "1к4"], [5, "1к6"], [11, "1к8"]]) },
        ...(level >= 2
          ? [
              {
                name: "Перемещение без доспеха",
                value: byStep(level, [[2, "+10 футов"], [6, "+15 футов"], [10, "+20 футов"]]),
              },
            ]
          : []),
      ],
    })),
  },
  "classes-paladin": {
    spellsKnownKind: "prepared",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: HALF_CASTER_SLOTS[level],
      cantripsKnown: 0,
      spellsKnown: 0,
      resources: [
        {
          id: "lay-on-hands",
          name: "Наложение рук",
          description: "Прикосновением лечит из общего запаса хитов — столько, сколько решите потратить, — либо снимает болезнь или яд.",
          max: level * 5,
          recharge: "long",
          unit: "хит",
        },
        {
          id: "divine-sense",
          name: "Божественное чувство",
          description: "Действием открывает, где рядом небожитель, исчадие или нежить и есть ли поблизости освящённое или осквернённое место.",
          maxFrom: { ability: "charisma", plus: 1, min: 1 },
          recharge: "long",
          unit: "использование",
        },
      ],
      // Радиус аур — единственное число паладина, растущее по таблице в этом
      // диапазоне (10 футов с 6 уровня, 30 футов только с 18-го, вне потолка).
      scaling: level >= 6 ? [{ name: "Радиус аур", value: "10 футов" }] : [],
    })),
  },
  "classes-rogue": {
    spellsKnownKind: "none",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: NO_SLOTS,
      cantripsKnown: 0,
      spellsKnown: 0,
      // Скрытая атака растёт ровно на кость через уровень — формула совпадает
      // со столбцом таблицы SRD на всём диапазоне 1-12 (6к6 на 11-12).
      scaling: [{ name: "Скрытая атака", value: `${Math.ceil(level / 2)}к6` }],
    })),
  },
  "classes-ranger": {
    spellsKnownKind: "known",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: HALF_CASTER_SLOTS[level],
      cantripsKnown: 0,
      spellsKnown: byLevelRow(level, [0, 0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]),
    })),
  },
  /**
   * Кровавый охотник — наш класс, числа сняты построчно с таблицы на с. 2 PDF
   * владельца (`characters-class-blood-hunter`).
   *
   * НЕ ЗАКЛИНАТЕЛЬ: ни ячеек, ни заговоров, ни известных заклинаний. Поле
   * `slotRecharge` объявлено «длинным» — ячеек у класса нет вовсе, и
   * возвращать отдыху нечего, но поле обязательное намеренно (см.
   * `ClassProgression.slotRecharge`). «Магия договора» Ордена осквернённых
   * душ ячейки даёт, но это архетип, а запаса ячеек у архетипа в приложении
   * нет — см. CLASS_SUBCLASSES.
   *
   * ДВА РАЗНЫХ ЧИСЛА ПРО ПРОКЛЯТЬЯ, и путать их нельзя:
   * - `scaling` «Известные проклятья крови» — столбец таблицы (1 на 1
   *   уровне, 2 на 6, 4-е и 5-е выше потолка). Это длина СПИСКА выученного:
   *   она растёт и не тратится;
   * - ресурс «Проклятая кровь» — запас ПРИМЕНЕНИЙ: одно, со 6 уровня два
   *   (третье на 13, четвёртое на 17 — выше потолка 12). Он тратится и
   *   возвращается коротким или длинным отдыхом.
   * На 6 уровне оба равны двум, поэтому их легко принять за одно число;
   * расходятся они на 10 уровне, где известных проклятий становится три, а
   * применений по-прежнему два.
   *
   * ЧЕГО ЗДЕСЬ НЕТ. Цена умений в хитах (усиление проклятья, совершение
   * обряда) — текст особенности, а не списание: лист урон не пишет (запись
   * 150), и хиты правит игрок.
   */
  [BLOOD_HUNTER_ID]: {
    spellsKnownKind: "none",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: NO_SLOTS,
      cantripsKnown: 0,
      spellsKnown: 0,
      resources: [
        {
          id: BLOOD_CURSE_RESOURCE_ID,
          name: "Проклятая кровь",
          description:
            "Накладывает одно из известных проклятий крови; усиление покупается некротическим уроном себе в одну кость гемокрафта.",
          max: byStep(level, [[1, 1], [6, 2]]),
          recharge: "short",
          unit: "использование",
        },
        ...(level >= 6
          ? [
              {
                id: BRAND_OF_CASTIGATION_RESOURCE_ID,
                name: "Клеймо наказания",
                description:
                  "Выжигает на цели «Алого обряда» клеймо: вы знаете направление до неё, а она получает психический урон за каждый свой удар по вам или соседу.",
                max: 1,
                recharge: "short",
                unit: "использование",
              } as ClassResource,
            ]
          : []),
      ],
      scaling: [
        { name: "Кость гемокрафта", value: byStep(level, [[1, "1к4"], [5, "1к6"], [11, "1к8"]]) },
        // Числа — ступени столбца таблицы класса, у них один владелец (модуль
        // класса), и он же кормит лесенку выбора проклятий в CLASS_CHOICES:
        // написанные здесь отдельно, они разошлись бы с числом выбранного.
        {
          name: "Известные проклятья крови",
          value: String(byStep(level, BLOOD_CURSES_KNOWN_STEPS.map(([from, count]) => [from, count] as [number, number]))),
        },
      ],
    })),
  },
  "classes-sorcerer": {
    spellsKnownKind: "known",
    slotRecharge: "long",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: byStep(level, [[1, 4], [4, 5], [10, 6]]),
      // Формула 1 + уровень держится до 11 уровня, на 12 таблица не растёт.
      spellsKnown: byLevelRow(level, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12]),
      resources:
        level >= 2
          ? [
              {
                id: "sorcery-points",
                name: "Очки чар",
                description: "Запас магии чародея: очки обращаются в ячейки заклинаний и обратно и питают приёмы происхождения.",
                max: level,
                recharge: "long",
                unit: "очко",
              },
            ]
          : [],
    })),
  },
};

/**
 * Уровни, на которых класс получает Улучшение характеристик, — столбец
 * «Умения» таблиц классов SRD. У десяти классов это 4/8/12; Воин получает
 * дополнительную точку на 6 уровне, Плут — на 10. Вторые дополнительные
 * точки (Воин 14, Плут 16) лежат выше PROGRESSION_MAX_LEVEL и потому
 * отфильтрованы, а не забыты: поднимется потолок — они придут сами.
 */
const STANDARD_ASI_LEVELS = [4, 8, 12];

const EXTRA_ASI_LEVELS: Record<string, number[]> = {
  "classes-fighter": [6, 14],
  "classes-rogue": [10, 16],
};

/** Все уровни ASI класса в пределах нынешнего потолка, по возрастанию. */
export function asiLevels(classId: string | null | undefined): number[] {
  const extra = (classId && EXTRA_ASI_LEVELS[classId]) || [];
  return [...STANDARD_ASI_LEVELS, ...extra]
    .filter((level) => level <= PROGRESSION_MAX_LEVEL)
    .sort((a, b) => a - b);
}

/**
 * Даёт ли этот класс Улучшение характеристик на этом уровне. Единственный
 * владелец факта: карточка персонажа спрашивает отсюда, а не сверяет номера
 * уровней у себя (см. requestLevelUp в CharactersPage.tsx).
 */
export function isAsiLevel(classId: string | null | undefined, level: number): boolean {
  return asiLevels(classId).includes(level);
}

/**
 * На каком отдыхе класс возвращает ячейки заклинаний — читается ПОЛЕ данных
 * (`slotRecharge`), а не сверяется id класса. Единственный владелец факта: и
 * кнопка короткого отдыха, и кнопка длинного спрашивают отсюда. Неизвестный
 * класс — «длинный»: это правило всех заклинателей, кроме Колдуна, и ошибиться
 * им безопаснее, чем возвращать ячейки чаще, чем позволяет SRD.
 */
export function slotRechargeOf(classId: string | null | undefined): "short" | "long" {
  return (classId && CLASS_PROGRESSION[classId]?.slotRecharge) || "long";
}

/** Строка таблицы прогрессии класса на уровне `level`; `undefined` для неизвестного класса или уровня вне 1-12. */
export function progressionAt(classId: string | null | undefined, level: number): ClassLevelProgression | undefined {
  if (!classId) return undefined;
  return CLASS_PROGRESSION[classId]?.byLevel[level];
}

/**
 * Все ограниченные ресурсы персонажа на этом уровне: классовые из таблицы выше
 * плюс собственные ресурсы выбранного архетипа. Счётчик у них общий
 * (`Character.featureUses` по `id`), так что вариант архетипа, тратящий уже
 * существующий классовый ресурс, второго счётчика не заводит.
 */
export function characterResources(
  classId: string | null | undefined,
  subclassName: string | null | undefined,
  level: number,
): ClassResource[] {
  const classResources = progressionAt(classId, level)?.resources ?? [];
  const own = subclassGrants(classId, subclassName)?.resources ?? [];
  const extra = own.filter((r) => !classResources.some((c) => c.id === r.id));
  return [...classResources, ...extra];
}

/** Максимум использований ресурса — либо число из таблицы, либо от модификатора характеристики (Вдохновение барда, Божественное чувство). */
export function resourceMax(resource: ClassResource, abilities: AbilityScores): number {
  if (resource.maxFrom) {
    const { ability, plus, min } = resource.maxFrom;
    return Math.max(min, abilityMod(abilities[ability]) + plus);
  }
  return resource.max ?? 0;
}

/**
 * Ячейки заклинаний по кругам 1..9 (SPELL_CIRCLES) на этом уровне — нули для
 * не-заклинателя, чтобы у вызывающего всегда был массив нужной длины. Всегда
 * новая копия: результат уходит прямо в состояние персонажа, таблица править
 * себя не даёт.
 */
export function spellSlotsForLevel(classId: string | null | undefined, level: number): number[] {
  return [...(progressionAt(classId, level)?.spellSlots ?? NO_SLOTS)];
}

/**
 * Наивысший круг заклинаний, доступный классу на этом уровне, или 0 — если
 * ячеек нет вовсе (при нынешнем потолке уровня 5 максимум — 3-й круг, но
 * функция не хардкодит этот предел — она читает длину spellSlots). Нужен и
 * для выбора нового заклинания на левел-апе, и для Колдуна, у которого
 * ячейки только одного круга.
 */
export function highestSpellCircle(classId: string | null | undefined, level: number): number {
  const slots = spellSlotsForLevel(classId, level);
  for (let circle = slots.length; circle >= 1; circle--) {
    if (slots[circle - 1] > 0) return circle;
  }
  return 0;
}

