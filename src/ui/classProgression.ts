import { abilityMod, type AbilityKey } from "./characterCreationData";
import type { AbilityScores } from "../state/types";

/** Потолок уровня приложения — вся таблица ниже заполнена только до него (см. MAX_LEVEL в CharactersPage.tsx). */
export const PROGRESSION_MAX_LEVEL = 5;

/** Круги заклинаний, которые вообще достижимы на уровнях 1-5 (полный заклинатель добирается до 3-го). */
export const SPELL_CIRCLES = 5;

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
  /** Ячейки заклинаний по кругам 1..5 — индекс 0 это 1 круг. */
  spellSlots: number[];
  cantripsKnown: number;
  /** Известные заклинания — только у `spellsKnownKind: "known"`, у остальных 0. */
  spellsKnown: number;
  resources: ClassResource[];
  scaling: ClassScalingValue[];
}

export interface ClassProgression {
  spellsKnownKind: SpellsKnownKind;
  byLevel: Record<number, ClassLevelProgression>;
}

const NO_SLOTS = [0, 0, 0, 0, 0];

/** Таблица ячеек полного заклинателя (Бард/Жрец/Друид/Чародей/Волшебник), уровни 1-5. */
const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1: [2, 0, 0, 0, 0],
  2: [3, 0, 0, 0, 0],
  3: [4, 2, 0, 0, 0],
  4: [4, 3, 0, 0, 0],
  5: [4, 3, 2, 0, 0],
};

/** Таблица ячеек полузаклинателя (Паладин/Следопыт) — заклинания только со 2 уровня. */
const HALF_CASTER_SLOTS: Record<number, number[]> = {
  1: NO_SLOTS,
  2: [2, 0, 0, 0, 0],
  3: [3, 0, 0, 0, 0],
  4: [3, 0, 0, 0, 0],
  5: [4, 2, 0, 0, 0],
};

/**
 * Магия договора Колдуна — отдельная таблица SRD: мало ячеек, но все они
 * сразу высшего доступного круга (столбцы «Ячейки заклинаний» и «Уровень
 * ячеек»), и восстанавливаются на коротком отдыхе.
 */
const PACT_MAGIC_SLOTS: Record<number, number[]> = {
  1: [1, 0, 0, 0, 0],
  2: [2, 0, 0, 0, 0],
  3: [0, 2, 0, 0, 0],
  4: [0, 2, 0, 0, 0],
  5: [0, 0, 2, 0, 0],
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

const BARDIC_INSPIRATION: ClassResource = {
  id: "bardic-inspiration",
  name: "Вдохновение барда",
  maxFrom: { ability: "charisma", plus: 0, min: 1 },
  recharge: "long",
  unit: "использование",
};

/**
 * Прогрессия всех 12 базовых классов на уровнях 1-5 — числа сняты построчно с
 * таблиц прогрессии классов в `src-tauri/rules/rules.json` (SRD 5.1, уже
 * переведённый), тексты самих особенностей живут отдельно и здесь не
 * дублируются (см. `CLASS_LEVEL_FEATURES` в characterCreationData.ts —
 * единственный владелец описаний особенностей).
 */
export const CLASS_PROGRESSION: Record<string, ClassProgression> = {
  "classes-bard": {
    spellsKnownKind: "known",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: level >= 4 ? 3 : 2,
      spellsKnown: 3 + level,
      resources: [
        // «Источник вдохновения» с 5 уровня переводит восстановление на короткий отдых.
        { ...BARDIC_INSPIRATION, recharge: level >= 5 ? "short" : "long" },
      ],
      scaling: [{ name: "Кость Вдохновения барда", value: level >= 5 ? "к8" : "к6" }],
    })),
  },
  "classes-barbarian": {
    spellsKnownKind: "none",
    byLevel: levels((level) => ({
      spellSlots: NO_SLOTS,
      cantripsKnown: 0,
      spellsKnown: 0,
      resources: [
        { id: "rage", name: "Ярость", max: level >= 3 ? 3 : 2, recharge: "long", unit: "использование" },
      ],
      scaling: [{ name: "Урон ярости", value: "+2" }],
    })),
  },
  "classes-fighter": {
    spellsKnownKind: "none",
    byLevel: levels((level) => ({
      spellSlots: NO_SLOTS,
      cantripsKnown: 0,
      spellsKnown: 0,
      resources: [
        { id: "second-wind", name: "Второе дыхание", max: 1, recharge: "short", unit: "использование" },
        ...(level >= 2
          ? [{ id: "action-surge", name: "Всплеск действий", max: 1, recharge: "short", unit: "использование" } as ClassResource]
          : []),
      ],
    })),
  },
  "classes-wizard": {
    spellsKnownKind: "prepared",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: level >= 4 ? 4 : 3,
      spellsKnown: 0,
      resources: [
        { id: "arcane-recovery", name: "Магическое восстановление", max: 1, recharge: "long", unit: "использование" },
      ],
    })),
  },
  "classes-druid": {
    spellsKnownKind: "prepared",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: level >= 4 ? 3 : 2,
      spellsKnown: 0,
      resources:
        level >= 2
          ? [{ id: "wild-shape", name: "Дикий облик", max: 2, recharge: "short", unit: "использование" }]
          : [],
      scaling: level >= 2 ? [{ name: "Макс. УО зверя Дикого облика", value: level >= 4 ? "1/2" : "1/4" }] : [],
    })),
  },
  "classes-cleric": {
    spellsKnownKind: "prepared",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: level >= 4 ? 4 : 3,
      spellsKnown: 0,
      resources:
        level >= 2
          ? [{ id: "channel-divinity", name: "Проведение энергии", max: 1, recharge: "short", unit: "использование" }]
          : [],
      scaling: level >= 5 ? [{ name: "Уничтожение нежити", value: "УО 1/2 или ниже" }] : [],
    })),
  },
  "classes-warlock": {
    spellsKnownKind: "known",
    byLevel: levels((level) => ({
      spellSlots: PACT_MAGIC_SLOTS[level],
      cantripsKnown: level >= 4 ? 3 : 2,
      spellsKnown: 1 + level,
      scaling: [
        ...(level >= 2 ? [{ name: "Известные воззвания", value: level >= 5 ? "3" : "2" }] : []),
        { name: "Ячейки Магии договора", value: "восстанавливаются после короткого отдыха" },
      ],
    })),
  },
  "classes-monk": {
    spellsKnownKind: "none",
    byLevel: levels((level) => ({
      spellSlots: NO_SLOTS,
      cantripsKnown: 0,
      spellsKnown: 0,
      resources: level >= 2 ? [{ id: "ki", name: "Ци", max: level, recharge: "short", unit: "очко" }] : [],
      scaling: [
        { name: "Боевые искусства", value: level >= 5 ? "1к6" : "1к4" },
        ...(level >= 2 ? [{ name: "Перемещение без доспеха", value: "+10 футов" }] : []),
      ],
    })),
  },
  "classes-paladin": {
    spellsKnownKind: "prepared",
    byLevel: levels((level) => ({
      spellSlots: HALF_CASTER_SLOTS[level],
      cantripsKnown: 0,
      spellsKnown: 0,
      resources: [
        { id: "lay-on-hands", name: "Наложение рук", max: level * 5, recharge: "long", unit: "хит" },
        {
          id: "divine-sense",
          name: "Божественное чувство",
          maxFrom: { ability: "charisma", plus: 1, min: 1 },
          recharge: "long",
          unit: "использование",
        },
      ],
    })),
  },
  "classes-rogue": {
    spellsKnownKind: "none",
    byLevel: levels((level) => ({
      spellSlots: NO_SLOTS,
      cantripsKnown: 0,
      spellsKnown: 0,
      scaling: [{ name: "Скрытая атака", value: `${Math.ceil(level / 2)}к6` }],
    })),
  },
  "classes-ranger": {
    spellsKnownKind: "known",
    byLevel: levels((level) => ({
      spellSlots: HALF_CASTER_SLOTS[level],
      cantripsKnown: 0,
      spellsKnown: [0, 0, 2, 3, 3, 4][level],
    })),
  },
  "classes-sorcerer": {
    spellsKnownKind: "known",
    byLevel: levels((level) => ({
      spellSlots: FULL_CASTER_SLOTS[level],
      cantripsKnown: level >= 4 ? 5 : 4,
      spellsKnown: 1 + level,
      resources:
        level >= 2
          ? [{ id: "sorcery-points", name: "Очки чар", max: level, recharge: "long", unit: "очко" }]
          : [],
    })),
  },
};

/** Строка таблицы прогрессии класса на уровне `level`; `undefined` для неизвестного класса или уровня вне 1-5. */
export function progressionAt(classId: string | null | undefined, level: number): ClassLevelProgression | undefined {
  if (!classId) return undefined;
  return CLASS_PROGRESSION[classId]?.byLevel[level];
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
 * Ячейки заклинаний по кругам 1..5 на этом уровне — нули для не-заклинателя,
 * чтобы у вызывающего всегда был массив нужной длины. Всегда новая копия:
 * результат уходит прямо в состояние персонажа, таблица править себя не даёт.
 */
export function spellSlotsForLevel(classId: string | null | undefined, level: number): number[] {
  return [...(progressionAt(classId, level)?.spellSlots ?? NO_SLOTS)];
}

/**
 * Наивысший круг заклинаний, доступный классу на этом уровне (1..5), или 0 —
 * если ячеек нет вовсе. Нужен и для выбора нового заклинания на левел-апе, и
 * для Колдуна, у которого ячейки только одного круга.
 */
export function highestSpellCircle(classId: string | null | undefined, level: number): number {
  const slots = spellSlotsForLevel(classId, level);
  for (let circle = slots.length; circle >= 1; circle--) {
    if (slots[circle - 1] > 0) return circle;
  }
  return 0;
}

