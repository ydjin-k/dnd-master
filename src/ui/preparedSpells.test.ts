import { describe, it, expect } from "vitest";
import bundledSpells from "../../src-tauri/rules/spells.json";
import {
  PREPARED_ON_SHEET,
  preparableSpells,
  preparedSpells,
  preparedSpellsFormulaLabel,
  preparedSpellsMax,
  preparesSpells,
} from "./preparedSpells";
import type { AbilityScores, Spell } from "../state/types";

const SPELLS = bundledSpells as unknown as Spell[];

function abilities(wisdom: number): AbilityScores {
  return { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom, charisma: 10 };
}

/** Паладин считает норму от Харизмы — Мудрость у него в формулу не идёт вовсе. */
function paladinAbilities(charisma: number): AbilityScores {
  return { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 16, charisma };
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
   * Паладин — полузаклинатель: магия приходит только со 2 уровня, и «ещё не
   * колдует» спрашивается у `highestSpellCircle`, а не у номера уровня.
   */
  it("у полузаклинателя на 1 уровне нормы нет вовсе", () => {
    expect(preparedSpellsMax("classes-paladin", paladinAbilities(16), 1)).toBe(0);
    // Мудрость 16 у паладина стоит в фикстуре нарочно: если формула возьмёт
    // чужую характеристику, числа ниже совпадут с жреческими и проба смолчит.
    expect(preparedSpellsMax("classes-paladin", paladinAbilities(10), 1)).toBe(0);
  });

  /**
   * Отрицательная проба на формулу: верни `+ level` вместо половины — и числа
   * 2/5/12 уровней станут 4/6/9 → 5/6/15, проба краснеет на каждом.
   * Числа по телу класса в `rules.json`: «модификатор Харизмы + половина
   * уровня паладина, округлённая вниз (минимум одно заклинание)».
   */
  it("у паладина в формулу идёт половина уровня, округляя вниз", () => {
    // Харизма 16 (+3): 2 уровень → 3+1=4, 5 → 3+2=5, 11 → 3+5=8, 12 → 3+6=9.
    expect(preparedSpellsMax("classes-paladin", paladinAbilities(16), 2)).toBe(4);
    expect(preparedSpellsMax("classes-paladin", paladinAbilities(16), 5)).toBe(5);
    expect(preparedSpellsMax("classes-paladin", paladinAbilities(16), 11)).toBe(8);
    expect(preparedSpellsMax("classes-paladin", paladinAbilities(16), 12)).toBe(9);
    // Нечётный уровень округляется вниз, а не вверх: 5 и 4 дают одно и то же.
    expect(preparedSpellsMax("classes-paladin", paladinAbilities(16), 4)).toBe(5);
    // Харизма 8 (−1) на 2 уровне дала бы ноль — минимум в одно заклинание держится и здесь.
    expect(preparedSpellsMax("classes-paladin", paladinAbilities(8), 2)).toBe(1);
    // Та же характеристика и уровень у полного заклинателя — другое число.
    expect(preparedSpellsMax("classes-cleric", abilities(16), 12)).toBe(15);
  });

  it("подпись под числом называет ту же формулу, что и само число", () => {
    expect(preparedSpellsFormulaLabel("classes-paladin", 5)).toBe(
      "модификатор заклинательной характеристики + половина уровня 5, округляя вниз",
    );
    expect(preparedSpellsFormulaLabel("classes-cleric", 5)).toBe("модификатор заклинательной характеристики + уровень 5");
  });

  /**
   * Калитка лесенки из четырёх карточек: сделаны Жрец и Паладин, Друид и
   * Волшебник ждут своих воркеров. Проба сторожит именно это — чтобы чужой
   * класс не включился молча вместе с общим кодом.
   */
  it("на листе подготовку ведут Жрец и Паладин — Друид и Волшебник ждут своих карточек", () => {
    for (const classId of ["classes-cleric", "classes-paladin"]) {
      expect(preparesSpells(classId), classId).toBe(true);
    }
    for (const classId of ["classes-druid", "classes-wizard"]) {
      expect(preparesSpells(classId), classId).toBe(false);
    }
    expect([...PREPARED_ON_SHEET]).toEqual(["classes-cleric", "classes-paladin"]);
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
   * Источник паладина — тот же полный список класса, отбор общий. Круг режется
   * ячейками: на 2 уровне только 1 круг, с 5-го — 2.
   */
  it("паладину к выбору идёт список паладина по доступному кругу", () => {
    const level2 = preparableSpells(SPELLS, { classId: "classes-paladin", level: 2, alreadyPrepared: [] });
    expect(level2).toHaveLength(11);
    expect(level2.every((sp) => sp.level === 1)).toBe(true);

    const level5 = preparableSpells(SPELLS, { classId: "classes-paladin", level: 5, alreadyPrepared: ["bless"] });
    expect(level5).toHaveLength(18);
    expect(level5.every((sp) => sp.level <= 2)).toBe(true);
    expect(level5.some((sp) => sp.id === "bless")).toBe(false);

    /*
     * На 12 уровне паладину доступен 3 круг, но заклинаний 3 круга у него в
     * spells.json нет ни одного — список тот же, что и на 5-м. Это состояние
     * данных, а не потолок механики: появятся — попадут сюда сами.
     */
    const level12 = preparableSpells(SPELLS, { classId: "classes-paladin", level: 12, alreadyPrepared: [] });
    expect(level12).toHaveLength(19);
    expect(level12.filter((sp) => sp.level === 3)).toEqual([]);
  });
});
