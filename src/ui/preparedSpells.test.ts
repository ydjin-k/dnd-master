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
   * Калитка лесенки из четырёх карточек: сошлись все четыре — Жрец, Друид,
   * Паладин и Волшебник. Проба сторожит состав: класс попадает в калитку
   * только своей карточкой, и другого способа его включить нет.
   */
  it("на листе подготовку ведут все четыре подготовленных заклинателя", () => {
    for (const classId of ["classes-cleric", "classes-druid", "classes-paladin", "classes-wizard"]) {
      expect(preparesSpells(classId), classId).toBe(true);
    }
    // Класс с известным списком в калитку не попадает.
    expect(preparesSpells("classes-bard")).toBe(false);
    expect([...PREPARED_ON_SHEET]).toEqual([
      "classes-cleric",
      "classes-druid",
      "classes-paladin",
      "classes-wizard",
    ]);  });

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

  /**
   * Источник паладина — тот же полный список класса, отбор общий. Круг режется
   * ячейками: на 2 уровне только 1 круг, с 5-го — 2, с 9-го — 3.
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
     * rules-paladin-third-circle-spell-list. Раньше здесь стояло «на 12 уровне
     * список тот же, что и на 5-м»: ячейки 3 круга паладин получал с 9-го, а
     * заклинаний 3 круга у него в spells.json не было ни одного. Проба
     * фиксировала состояние данных, а не правило, и с появлением меток
     * закономерно покраснела (19 → 25) — переписана, а не подогнана.
     *
     * На 8 уровне 3 круга ещё нет: ячейки приходят на 9-м, и режет список
     * `highestSpellCircle`, а не наличие заклинаний в файле.
     */
    const level8 = preparableSpells(SPELLS, { classId: "classes-paladin", level: 8, alreadyPrepared: [] });
    expect(level8).toHaveLength(19);
    expect(level8.every((sp) => sp.level <= 2)).toBe(true);
  });

  /**
   * rules-paladin-third-circle-spell-list. Состав 3 круга паладина по списку
   * SRD 5.1 («Paladin Spells», 3rd Level) — шесть заклинаний, все уже лежали в
   * файле под другими классами. Отрицательная проба: сними `classes-paladin`
   * хотя бы у одного из шести — краснеет именно состав, а не общий счёт
   * заклинаний в файле.
   */
  it("с 9 уровня паладин готовит 3 круг, а 1 и 2 круги не сдвинулись", () => {
    const level9 = preparableSpells(SPELLS, { classId: "classes-paladin", level: 9, alreadyPrepared: [] });
    expect(level9.filter((sp) => sp.level === 3).map((sp) => sp.id).sort()).toEqual([
      "create-food-and-water",
      "daylight",
      "dispel-magic",
      "magic-circle",
      "remove-curse",
      "revivify",
    ]);
    // Круги 1 и 2 остались ровно теми же списками SRD: 11 и 8, итого 25.
    expect(level9.filter((sp) => sp.level === 1)).toHaveLength(11);
    expect(level9.filter((sp) => sp.level === 2)).toHaveLength(8);
    expect(level9).toHaveLength(25);

    // На 12 уровне список тот же: 4 круг паладину открывается за нынешним потолком.
    const level12 = preparableSpells(SPELLS, { classId: "classes-paladin", level: 12, alreadyPrepared: [] });
    expect(level12).toHaveLength(25);
    expect(level12.every((sp) => sp.level <= 3)).toBe(true);
  });
});
