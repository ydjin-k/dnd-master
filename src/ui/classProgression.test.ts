import { describe, it, expect } from "vitest";
import {
  CLASS_PROGRESSION,
  PROGRESSION_MAX_LEVEL,
  SPELL_CIRCLES,
  asiLevels,
  characterResources,
  highestSpellCircle,
  isAsiLevel,
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
  it("покрывает все 12 базовых классов на уровнях 1-12", () => {
    expect(Object.keys(CLASS_PROGRESSION).sort()).toEqual([...ALL_CLASS_IDS].sort());
    for (const classId of ALL_CLASS_IDS) {
      for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
        const row = progressionAt(classId, level);
        expect(row, `${classId} ур. ${level}`).toBeDefined();
        expect(row!.spellSlots).toHaveLength(SPELL_CIRCLES);
      }
    }
  });

  it("не выдаёт ячеек выше 6 круга — круги 7-9 требуют 13/15/17 уровня, выше потолка 12", () => {
    for (const classId of ALL_CLASS_IDS) {
      for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
        const slots = progressionAt(classId, level)!.spellSlots;
        expect(slots[6], `${classId} ур. ${level}: 7 круг`).toBe(0);
        expect(slots[7], `${classId} ур. ${level}: 8 круг`).toBe(0);
        expect(slots[8], `${classId} ур. ${level}: 9 круг`).toBe(0);
      }
    }
  });

  it("открывает 6 круг полному заклинателю ровно на 11 уровне — исходная цель потолка 12", () => {
    for (const classId of ["classes-bard", "classes-cleric", "classes-druid", "classes-sorcerer", "classes-wizard"]) {
      expect(highestSpellCircle(classId, 10), `${classId} ур. 10`).toBe(5);
      expect(highestSpellCircle(classId, 11), `${classId} ур. 11`).toBe(6);
      expect(progressionAt(classId, 11)!.spellSlots[5], `${classId} ур. 11: ячеек 6 круга`).toBe(1);
    }
    // Полузаклинатель к 12 уровню поднимается только до 3 круга, Колдун — до 5.
    expect(highestSpellCircle("classes-paladin", 12)).toBe(3);
    expect(highestSpellCircle("classes-ranger", 12)).toBe(3);
    expect(highestSpellCircle("classes-warlock", 12)).toBe(5);
  });

  it("даёт Колдуну официальную таблицу Магии договора на 6-12 уровнях — третья ячейка на 11", () => {
    const rows = [6, 7, 8, 9, 10, 11, 12].map((l) => progressionAt("classes-warlock", l)!.spellSlots);
    expect(rows).toEqual([
      [0, 0, 2, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 2, 0, 0, 0, 0, 0],
      [0, 0, 0, 2, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0],
      [0, 0, 0, 0, 3, 0, 0, 0, 0],
      [0, 0, 0, 0, 3, 0, 0, 0, 0],
    ]);
  });

  it("даёт полузаклинателю официальную таблицу ячеек на 6-12 уровнях", () => {
    const rows = [6, 7, 8, 9, 10, 11, 12].map((l) => progressionAt("classes-paladin", l)!.spellSlots);
    expect(rows).toEqual([
      [4, 2, 0, 0, 0, 0, 0, 0, 0],
      [4, 3, 0, 0, 0, 0, 0, 0, 0],
      [4, 3, 0, 0, 0, 0, 0, 0, 0],
      [4, 3, 2, 0, 0, 0, 0, 0, 0],
      [4, 3, 2, 0, 0, 0, 0, 0, 0],
      [4, 3, 3, 0, 0, 0, 0, 0, 0],
      [4, 3, 3, 0, 0, 0, 0, 0, 0],
    ]);
  });

  it("даёт полному заклинателю официальную таблицу ячеек на 6-12 уровнях", () => {
    const rows = [6, 7, 8, 9, 10, 11, 12].map((l) => progressionAt("classes-wizard", l)!.spellSlots);
    expect(rows).toEqual([
      [4, 3, 3, 0, 0, 0, 0, 0, 0],
      [4, 3, 3, 1, 0, 0, 0, 0, 0],
      [4, 3, 3, 2, 0, 0, 0, 0, 0],
      [4, 3, 3, 3, 1, 0, 0, 0, 0],
      [4, 3, 3, 3, 2, 0, 0, 0, 0],
      [4, 3, 3, 3, 2, 1, 0, 0, 0],
      [4, 3, 3, 3, 2, 1, 0, 0, 0],
    ]);
  });

  it("ведёт столбцы заговоров и известных заклинаний по таблице, а не по формуле, на 6-12 уровнях", () => {
    const at = (id: string, l: number) => progressionAt(id, l)!;
    // Заговоры прибавляются на 10 уровне у всех полных заклинателей.
    expect([9, 10].map((l) => at("classes-bard", l).cantripsKnown)).toEqual([3, 4]);
    expect([9, 10].map((l) => at("classes-wizard", l).cantripsKnown)).toEqual([4, 5]);
    expect([9, 10].map((l) => at("classes-sorcerer", l).cantripsKnown)).toEqual([5, 6]);
    expect([9, 10].map((l) => at("classes-warlock", l).cantripsKnown)).toEqual([3, 4]);
    // Известные заклинания: у Барда на 10 сразу +2 (Магические тайны), на 12 таблица стоит.
    expect([6, 7, 8, 9, 10, 11, 12].map((l) => at("classes-bard", l).spellsKnown)).toEqual([9, 10, 11, 12, 14, 15, 15]);
    expect([6, 7, 8, 9, 10, 11, 12].map((l) => at("classes-sorcerer", l).spellsKnown)).toEqual([7, 8, 9, 10, 11, 12, 12]);
    expect([6, 7, 8, 9, 10, 11, 12].map((l) => at("classes-warlock", l).spellsKnown)).toEqual([7, 8, 9, 10, 10, 11, 11]);
    expect([6, 7, 8, 9, 10, 11, 12].map((l) => at("classes-ranger", l).spellsKnown)).toEqual([4, 5, 5, 6, 6, 7, 7]);
  });

  it("ведёт классовые ресурсы и растущие значения по таблице на 6-12 уровнях", () => {
    const at = (id: string, l: number) => progressionAt(id, l)!;
    const maxOf = (id: string, l: number, resourceId: string) =>
      at(id, l).resources.find((r) => r.id === resourceId)?.max;
    const scalingOf = (id: string, l: number, name: string) =>
      at(id, l).scaling.find((v) => v.name === name)?.value;

    expect([5, 6, 11, 12].map((l) => maxOf("classes-barbarian", l, "rage"))).toEqual([3, 4, 4, 5]);
    expect([8, 9].map((l) => scalingOf("classes-barbarian", l, "Урон ярости"))).toEqual(["+2", "+3"]);
    expect([5, 6].map((l) => maxOf("classes-cleric", l, "channel-divinity"))).toEqual([1, 2]);
    expect([7, 8, 11].map((l) => scalingOf("classes-cleric", l, "Уничтожение нежити"))).toEqual([
      "УО 1/2 или ниже",
      "УО 1 или ниже",
      "УО 2 или ниже",
    ]);
    expect([10, 11].map((l) => scalingOf("classes-monk", l, "Боевые искусства"))).toEqual(["1к6", "1к8"]);
    expect([5, 6, 9, 10].map((l) => scalingOf("classes-monk", l, "Перемещение без доспеха"))).toEqual([
      "+10 футов",
      "+15 футов",
      "+15 футов",
      "+20 футов",
    ]);
    expect([10, 11, 12].map((l) => scalingOf("classes-rogue", l, "Скрытая атака"))).toEqual(["5к6", "6к6", "6к6"]);
    expect([7, 8].map((l) => scalingOf("classes-druid", l, "Макс. УО зверя Дикого облика"))).toEqual(["1/2", "1"]);
    expect([9, 10].map((l) => scalingOf("classes-bard", l, "Кость Вдохновения барда"))).toEqual(["к8", "к10"]);
    expect([6, 7, 8, 9, 10, 11, 12].map((l) => scalingOf("classes-warlock", l, "Известные воззвания"))).toEqual([
      "4",
      "4",
      "4",
      "5",
      "5",
      "5",
      "6",
    ]);
    // Несгибаемый у Воина и Мистический арканум у Колдуна приходят внутри диапазона.
    expect(maxOf("classes-fighter", 8, "indomitable")).toBeUndefined();
    expect(maxOf("classes-fighter", 9, "indomitable")).toBe(1);
    expect(maxOf("classes-warlock", 10, "mystic-arcanum-6")).toBeUndefined();
    expect(maxOf("classes-warlock", 11, "mystic-arcanum-6")).toBe(1);
  });

  it("раздаёт улучшения характеристик по столбцу «Умения» таблиц классов", () => {
    expect(asiLevels("classes-wizard")).toEqual([4, 8, 12]);
    expect(asiLevels("classes-fighter")).toEqual([4, 6, 8, 12]);
    expect(asiLevels("classes-rogue")).toEqual([4, 8, 10, 12]);
    // Вторые дополнительные точки Воина (14) и Плута (16) — выше потолка, их нет.
    expect(asiLevels("classes-fighter")).not.toContain(14);
    expect(asiLevels("classes-rogue")).not.toContain(16);
    expect(isAsiLevel("classes-fighter", 6)).toBe(true);
    expect(isAsiLevel("classes-wizard", 6)).toBe(false);
    expect(isAsiLevel("classes-rogue", 10)).toBe(true);
    expect(isAsiLevel("classes-barbarian", 10)).toBe(false);
  });

  it("даёт Барду официальную таблицу ячеек, заговоров и известных заклинаний", () => {
    const slots = [1, 2, 3, 4, 5].map((l) => progressionAt("classes-bard", l)!.spellSlots);
    expect(slots).toEqual([
      [2, 0, 0, 0, 0, 0, 0, 0, 0],
      [3, 0, 0, 0, 0, 0, 0, 0, 0],
      [4, 2, 0, 0, 0, 0, 0, 0, 0],
      [4, 3, 0, 0, 0, 0, 0, 0, 0],
      [4, 3, 2, 0, 0, 0, 0, 0, 0],
    ]);
    expect([1, 2, 3, 4, 5].map((l) => progressionAt("classes-bard", l)!.cantripsKnown)).toEqual([2, 2, 2, 3, 3]);
    expect([1, 2, 3, 4, 5].map((l) => progressionAt("classes-bard", l)!.spellsKnown)).toEqual([4, 5, 6, 7, 8]);
  });

  it("Колдун идёт по отдельной таблице Магии договора: мало ячеек, но круг выше", () => {
    const slots = [1, 2, 3, 4, 5].map((l) => progressionAt("classes-warlock", l)!.spellSlots);
    expect(slots).toEqual([
      [1, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 2, 0, 0, 0, 0, 0, 0],
    ]);
    expect(highestSpellCircle("classes-warlock", 5)).toBe(3);
    expect(highestSpellCircle("classes-bard", 5)).toBe(3);
  });

  it("Паладин и Следопыт получают ячейки только со 2 уровня", () => {
    for (const classId of ["classes-paladin", "classes-ranger"]) {
      expect(highestSpellCircle(classId, 1), classId).toBe(0);
      expect(progressionAt(classId, 2)!.spellSlots, classId).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(progressionAt(classId, 5)!.spellSlots, classId).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
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
