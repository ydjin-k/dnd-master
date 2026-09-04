import { describe, it, expect } from "vitest";
import {
  CLASS_PROGRESSION,
  PROGRESSION_MAX_LEVEL,
  SPELL_CIRCLES,
  characterResources,
  highestSpellCircle,
  progressionAt,
  resourceMax,
} from "./classProgression";
import { emptyAbilityScores } from "../state/types";

const ALL_CLASS_IDS = [
  "classes-bard",
  "classes-barbarian",
  "classes-fighter",
  "classes-wizard",
  "classes-druid",
  "classes-cleric",
  "classes-warlock",
  "classes-monk",
  "classes-paladin",
  "classes-rogue",
  "classes-ranger",
  "classes-sorcerer",
];

describe("CLASS_PROGRESSION", () => {
  it("покрывает все 12 базовых классов на уровнях 1-5", () => {
    expect(Object.keys(CLASS_PROGRESSION).sort()).toEqual([...ALL_CLASS_IDS].sort());
    for (const classId of ALL_CLASS_IDS) {
      for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
        const row = progressionAt(classId, level);
        expect(row, `${classId} ур. ${level}`).toBeDefined();
        expect(row!.spellSlots).toHaveLength(SPELL_CIRCLES);
      }
    }
  });

  it("не выдаёт ячеек выше 3 круга — потолок уровня 5 (полный заклинатель добирается только до него)", () => {
    for (const classId of ALL_CLASS_IDS) {
      for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
        const slots = progressionAt(classId, level)!.spellSlots;
        expect(slots[3], `${classId} ур. ${level}: 4 круг`).toBe(0);
        expect(slots[4], `${classId} ур. ${level}: 5 круг`).toBe(0);
      }
    }
  });

  it("даёт Барду официальную таблицу ячеек, заговоров и известных заклинаний", () => {
    const slots = [1, 2, 3, 4, 5].map((l) => progressionAt("classes-bard", l)!.spellSlots);
    expect(slots).toEqual([
      [2, 0, 0, 0, 0],
      [3, 0, 0, 0, 0],
      [4, 2, 0, 0, 0],
      [4, 3, 0, 0, 0],
      [4, 3, 2, 0, 0],
    ]);
    expect([1, 2, 3, 4, 5].map((l) => progressionAt("classes-bard", l)!.cantripsKnown)).toEqual([2, 2, 2, 3, 3]);
    expect([1, 2, 3, 4, 5].map((l) => progressionAt("classes-bard", l)!.spellsKnown)).toEqual([4, 5, 6, 7, 8]);
  });

  it("Колдун идёт по отдельной таблице Магии договора: мало ячеек, но круг выше", () => {
    const slots = [1, 2, 3, 4, 5].map((l) => progressionAt("classes-warlock", l)!.spellSlots);
    expect(slots).toEqual([
      [1, 0, 0, 0, 0],
      [2, 0, 0, 0, 0],
      [0, 2, 0, 0, 0],
      [0, 2, 0, 0, 0],
      [0, 0, 2, 0, 0],
    ]);
    expect(highestSpellCircle("classes-warlock", 5)).toBe(3);
    expect(highestSpellCircle("classes-bard", 5)).toBe(3);
  });

  it("Паладин и Следопыт получают ячейки только со 2 уровня", () => {
    for (const classId of ["classes-paladin", "classes-ranger"]) {
      expect(highestSpellCircle(classId, 1), classId).toBe(0);
      expect(progressionAt(classId, 2)!.spellSlots, classId).toEqual([2, 0, 0, 0, 0]);
      expect(progressionAt(classId, 5)!.spellSlots, classId).toEqual([4, 2, 0, 0, 0]);
    }
  });

  it("не-заклинатели не получают ни ячеек, ни заговоров ни на одном уровне", () => {
    for (const classId of ["classes-barbarian", "classes-fighter", "classes-monk", "classes-rogue"]) {
      for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
        const row = progressionAt(classId, level)!;
        expect(highestSpellCircle(classId, level), `${classId} ур. ${level}`).toBe(0);
        expect(row.cantripsKnown).toBe(0);
      }
    }
  });

  it("Ярость варвара растёт 2→3 на 3 уровне по таблице", () => {
    const rageMax = (level: number) =>
      resourceMax(progressionAt("classes-barbarian", level)!.resources[0], emptyAbilityScores());
    expect([1, 2, 3, 4, 5].map(rageMax)).toEqual([2, 2, 3, 3, 3]);
  });

  it("Очки ци монаха равны его уровню начиная со 2", () => {
    expect(progressionAt("classes-monk", 1)!.resources).toHaveLength(0);
    expect([2, 3, 4, 5].map((l) => resourceMax(progressionAt("classes-monk", l)!.resources[0], emptyAbilityScores()))).toEqual([
      2, 3, 4, 5,
    ]);
  });

  it("Вдохновение барда считается от Харизмы, но не меньше одного использования", () => {
    const inspiration = progressionAt("classes-bard", 1)!.resources[0];
    expect(resourceMax(inspiration, { ...emptyAbilityScores(), charisma: 16 })).toBe(3);
    expect(resourceMax(inspiration, { ...emptyAbilityScores(), charisma: 8 })).toBe(1);
  });

  it("Источник вдохновения на 5 уровне переводит восстановление на короткий отдых", () => {
    expect(progressionAt("classes-bard", 4)!.resources[0].recharge).toBe("long");
    expect(progressionAt("classes-bard", 5)!.resources[0].recharge).toBe("short");
  });

  it("кость Скрытой атаки плута растёт 1к6 → 3к6 к 5 уровню", () => {
    expect([1, 2, 3, 4, 5].map((l) => progressionAt("classes-rogue", l)!.scaling[0].value)).toEqual([
      "1к6",
      "1к6",
      "2к6",
      "2к6",
      "3к6",
    ]);
  });

  it("список известных заклинаний растёт только у классов с фиксированным списком", () => {
    for (const classId of ["classes-bard", "classes-sorcerer", "classes-warlock", "classes-ranger"]) {
      expect(CLASS_PROGRESSION[classId].spellsKnownKind, classId).toBe("known");
      const known = [1, 2, 3, 4, 5].map((l) => progressionAt(classId, l)!.spellsKnown);
      expect(known[4], `${classId}: список должен вырасти к 5 уровню`).toBeGreaterThan(known[0]);
    }
    // Подготавливающим классам открыт весь список класса — числа в таблице нет.
    for (const classId of ["classes-wizard", "classes-cleric", "classes-druid", "classes-paladin"]) {
      expect(CLASS_PROGRESSION[classId].spellsKnownKind, classId).toBe("prepared");
      for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
        expect(progressionAt(classId, level)!.spellsKnown, `${classId} ур. ${level}`).toBe(0);
      }
    }
  });
});

/** characters-subclass-features-have-no-mechanical-effect — ресурсы архетипа тем же механизмом. */
describe("characterResources", () => {
  it("клятва паладина добавляет Проведение энергии, которого нет в таблице класса", () => {
    const withoutOath = characterResources("classes-paladin", null, 3).map((r) => r.id);
    const withOath = characterResources("classes-paladin", "Клятва преданности", 3).map((r) => r.id);
    expect(withoutOath).not.toContain("channel-divinity");
    expect(withOath).toContain("channel-divinity");
  });

  it("архетип не заводит второй счётчик для ресурса, который уже есть у класса", () => {
    const ids = characterResources("classes-cleric", "Домен жизни", 2).map((r) => r.id);
    expect(ids.filter((id) => id === "channel-divinity")).toHaveLength(1);
  });
});
