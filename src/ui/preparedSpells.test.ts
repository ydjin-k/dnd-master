import { describe, it, expect } from "vitest";
import bundledSpells from "../../src-tauri/rules/spells.json";
import { PREPARED_ON_SHEET, preparableSpells, preparedSpells, preparedSpellsMax, preparesSpells } from "./preparedSpells";
import type { AbilityScores, Spell } from "../state/types";

const SPELLS = bundledSpells as unknown as Spell[];

function abilities(wisdom: number): AbilityScores {
  return { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom, charisma: 10 };
}

describe("подготовка заклинаний", () => {
  it("число подготовленных — модификатор характеристики плюс уровень, минимум одно", () => {
    // Мудрость 16 (+3): на 1 уровне 4, на 12 — 15.
    expect(preparedSpellsMax("classes-cleric", abilities(16), 1)).toBe(4);
    expect(preparedSpellsMax("classes-cleric", abilities(16), 12)).toBe(15);
    // Мудрость 8 (−1) на 1 уровне дала бы ноль — SRD держит минимум в одно заклинание.
    expect(preparedSpellsMax("classes-cleric", abilities(8), 1)).toBe(1);
  });

  it("не готовит тот, у кого известный список или магии нет вовсе", () => {
    expect(preparedSpellsMax("classes-bard", abilities(16), 5)).toBe(0);
    expect(preparedSpellsMax("classes-fighter", abilities(16), 5)).toBe(0);
    expect(preparedSpellsMax(null, abilities(16), 5)).toBe(0);
  });

  /**
   * Паладин — тоже `prepared`, но заклинательной характеристики у него в
   * приложении ещё нет (её карта заведена для классов с магией на 1 уровне),
   * и ячеек на 1 уровне тоже. Пока его карточка не сделана, число равно нулю,
   * а не считается по чужой формуле.
   */
  it("у полузаклинателя без ячеек на этом уровне нормы нет", () => {
    expect(preparedSpellsMax("classes-paladin", abilities(16), 1)).toBe(0);
  });

  /**
   * Калитка лесенки из четырёх карточек: сделаны Жрец и Друид, Волшебник с
   * Паладином ждут своих воркеров. Проба сторожит именно это — чтобы чужой
   * класс не включился молча вместе с общим кодом.
   */
  it("на листе подготовку ведут Жрец и Друид — Волшебник с Паладином ждут своих карточек", () => {
    expect(preparesSpells("classes-cleric")).toBe(true);
    expect(preparesSpells("classes-druid")).toBe(true);
    for (const classId of ["classes-wizard", "classes-paladin"]) {
      expect(preparesSpells(classId), classId).toBe(false);
    }
    expect([...PREPARED_ON_SHEET]).toEqual(["classes-cleric", "classes-druid"]);
  });

  it("заклинания архетипа не занимают места в норме и остаются сверх неё", () => {
    const status = preparedSpells({
      classId: "classes-cleric",
      abilities: abilities(16),
      level: 1,
      knownSpells: ["healing-word", "shield-of-faith", "sanctuary", "command", "bless", "cure-wounds"],
      alwaysPrepared: ["bless", "cure-wounds"],
    });
    expect(status.max).toBe(4);
    expect(status.prepared).toEqual(["healing-word", "shield-of-faith", "sanctuary", "command"]);
    expect(status.alwaysPrepared).toEqual(["bless", "cure-wounds"]);
    expect(status.free).toBe(0);
    expect(status.overflow).toBe(0);
  });

  it("упавшая характеристика оставляет перебор видимым числом, а не молча срезает список", () => {
    const status = preparedSpells({
      classId: "classes-cleric",
      abilities: abilities(10), // модификатор 0 → норма на 1 уровне всего одно
      level: 1,
      knownSpells: ["healing-word", "shield-of-faith", "sanctuary", "bless"],
      alwaysPrepared: ["bless"],
    });
    expect(status.max).toBe(1);
    expect(status.prepared).toHaveLength(3);
    expect(status.overflow).toBe(2);
    expect(status.free).toBe(0);
  });

  it("к выбору идёт весь список класса до доступного круга, кроме уже подготовленного", () => {
    const level12 = preparableSpells(SPELLS, {
      classId: "classes-cleric",
      level: 12,
      alreadyPrepared: ["bless"],
    });
    // На 12 уровне жрецу доступен 6 круг: 81 заклинание списка минус подготовленное.
    expect(level12).toHaveLength(80);
    expect(level12.every((sp) => sp.level >= 1 && sp.level <= 6)).toBe(true);
    expect(level12.some((sp) => sp.id === "bless")).toBe(false);

    // На 1 уровне — только 1 круг, и это 15 заклинаний жреца из spells.json.
    const level1 = preparableSpells(SPELLS, { classId: "classes-cleric", level: 1, alreadyPrepared: [] });
    expect(level1).toHaveLength(15);
    expect(level1.every((sp) => sp.level === 1)).toBe(true);
  });

  /**
   * characters-druid-prepared-spells. Форма у Друида жрецовская, а числа свои:
   * список класса в spells.json другой и короче, поэтому проба считает их, а
   * не повторяет жрецовские.
   */
  describe("друид", () => {
    it("норма друида — модификатор Мудрости плюс уровень друида, минимум одно", () => {
      // Мудрость 16 (+3): на 12 уровне 15, на 1 — 4.
      expect(preparedSpellsMax("classes-druid", abilities(16), 12)).toBe(15);
      expect(preparedSpellsMax("classes-druid", abilities(16), 1)).toBe(4);
      // Мудрость 18 (+4) — норма на том же уровне ровно на единицу больше.
      expect(preparedSpellsMax("classes-druid", abilities(18), 12)).toBe(16);
      // Мудрость 8 (−1) на 1 уровне дала бы ноль — SRD держит минимум в одно.
      expect(preparedSpellsMax("classes-druid", abilities(8), 1)).toBe(1);
    });

    it("к выбору идёт весь список друида до доступного круга", () => {
      // На 12 уровне друиду доступен 6 круг: 82 заклинания списка минус подготовленное.
      const level12 = preparableSpells(SPELLS, {
        classId: "classes-druid",
        level: 12,
        alreadyPrepared: ["goodberry"],
      });
      expect(level12).toHaveLength(81);
      expect(level12.every((sp) => sp.level >= 1 && sp.level <= 6)).toBe(true);
      expect(level12.some((sp) => sp.id === "goodberry")).toBe(false);
      // Список именно друидский: жрецовское «Направляющий луч» в него не попадает.
      expect(level12.some((sp) => sp.id === "guiding-bolt")).toBe(false);

      // На 1 уровне — только 1 круг, и это 16 заклинаний друида из spells.json.
      const level1 = preparableSpells(SPELLS, { classId: "classes-druid", level: 1, alreadyPrepared: [] });
      expect(level1).toHaveLength(16);
      expect(level1.every((sp) => sp.level === 1)).toBe(true);
    });

    /**
     * Заклинания круга земли — не из списка друида (Отражения и Туманный шаг
     * принадлежат волшебнику), и норму они всё равно не занимают: разбор
     * ведётся по `alwaysPrepared`, а не по принадлежности к списку класса.
     */
    it("заклинания круга идут сверх нормы и снять их нельзя", () => {
      const status = preparedSpells({
        classId: "classes-druid",
        abilities: abilities(16),
        level: 3,
        knownSpells: ["entangle", "goodberry", "barkskin", "spider-climb"],
        alwaysPrepared: ["barkskin", "spider-climb"],
      });
      expect(status.max).toBe(6);
      expect(status.prepared).toEqual(["entangle", "goodberry"]);
      expect(status.alwaysPrepared).toEqual(["barkskin", "spider-climb"]);
      expect(status.free).toBe(4);
      expect(status.overflow).toBe(0);
    });
  });
});
