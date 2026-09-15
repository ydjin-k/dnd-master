import { describe, it, expect } from "vitest";
import bundledSpells from "../../src-tauri/rules/spells.json";
import { preparableSpells, preparedSpellsMax } from "./preparedSpells";
import {
  SPELLBOOK_CLASSES,
  hasSpellbook,
  keepSpellbook,
  spellbookAt,
  spellbookMax,
  spellbookOf,
  spellbookSource,
  writableSpells,
} from "./spellbook";
import type { AbilityScores, Character, Spell } from "../state/types";

const SPELLS = bundledSpells as unknown as Spell[];

function intelligence(score: number): AbilityScores {
  return { strength: 10, dexterity: 10, constitution: 10, intelligence: score, wisdom: 10, charisma: 10 };
}

/** Только те поля, которых касается книга; остальной лист персонажа ей не нужен. */
function wizard(spellbook: string[], castableSpells: string[] = []): Character {
  return { spellbook, castableSpells } as Character;
}

describe("книга заклинаний Волшебника", () => {
  it("книгу ведёт только Волшебник", () => {
    expect(hasSpellbook("classes-wizard")).toBe(true);
    for (const classId of ["classes-cleric", "classes-druid", "classes-paladin", "classes-bard", null]) {
      expect(hasSpellbook(classId), String(classId)).toBe(false);
    }
    expect([...SPELLBOOK_CLASSES]).toEqual(["classes-wizard"]);
  });

  /** Числа из тела класса в rules.json: шесть на 1 уровне и по два за уровень. */
  it("объём книги — шесть заклинаний на первом уровне и по два за каждый следующий", () => {
    expect(spellbookMax("classes-wizard", 1)).toBe(6);
    expect(spellbookMax("classes-wizard", 2)).toBe(8);
    expect(spellbookMax("classes-wizard", 12)).toBe(28);
    // У класса без книги её объём — ноль, а не «шесть, которые некуда деть».
    expect(spellbookMax("classes-cleric", 12)).toBe(0);
    expect(spellbookMax(null, 12)).toBe(0);
  });

  it("остаток книги считается от уровня, а не хранится снимком", () => {
    const findl = wizard(["shield", "mage-armor", "magic-missile"]);
    expect(spellbookAt({ classId: "classes-wizard", level: 1, character: findl })).toEqual({
      max: 6,
      spells: ["shield", "mage-armor", "magic-missile"],
      free: 3,
    });
    // Тот же персонаж на 12 уровне: книга та же, места в ней больше.
    expect(spellbookAt({ classId: "classes-wizard", level: 12, character: findl }).free).toBe(25);
  });

  /**
   * Переход старых сохранений: до этой карточки заклинания волшебника лежали в
   * `castableSpells` и значили «выучено». Проба отрицательная — убери запасной
   * путь в `spellbookOf`, и книга такого персонажа окажется пустой, то есть
   * шесть заклинаний Финдла пропадут при первом же показе листа.
   */
  it("у сохранения без книги её роль играет прежний список, и снятие подготовки её не съедает", () => {
    const legacy = wizard([], ["shield", "mage-armor", "magic-missile", "find-familiar"]);
    expect(spellbookOf(legacy, "classes-wizard")).toEqual([
      "shield",
      "mage-armor",
      "magic-missile",
      "find-familiar",
    ]);
    // У класса без книги тот же список книгой не становится.
    expect(spellbookOf(legacy, "classes-cleric")).toEqual([]);

    const kept = keepSpellbook(legacy, "classes-wizard");
    const unprepared = { ...kept, castableSpells: kept.castableSpells.filter((id) => id !== "find-familiar") };
    expect(unprepared.castableSpells).toEqual(["shield", "mage-armor", "magic-missile"]);
    expect(spellbookOf(unprepared, "classes-wizard")).toContain("find-familiar");
  });

  it("записанную книгу keepSpellbook не трогает, у класса без книги не заводит вовсе", () => {
    const withBook = wizard(["shield"], ["mage-armor"]);
    expect(keepSpellbook(withBook, "classes-wizard")).toBe(withBook);
    const cleric = wizard([], ["bless"]);
    expect(keepSpellbook(cleric, "classes-cleric")).toBe(cleric);
  });

  /**
   * Главное отличие Волшебника от сестёр: готовит он из книги, а не из всего
   * списка класса. Проба сравнивает оба источника на одном уровне — 148
   * заклинаний класса против четырёх в книге.
   */
  it("источник подготовки — книга, а не весь список класса", () => {
    const book = ["magic-missile", "shield", "fireball", "fly"];
    const source = spellbookSource(SPELLS, book);
    expect(source.map((sp) => sp.id)).toEqual(book);

    const fromBook = preparableSpells(source, { classId: "classes-wizard", level: 12, alreadyPrepared: ["shield"] });
    expect(fromBook.map((sp) => sp.id)).toEqual(["magic-missile", "fireball", "fly"]);

    const fromWholeList = preparableSpells(SPELLS, {
      classId: "classes-wizard",
      level: 12,
      alreadyPrepared: ["shield"],
    });
    expect(fromWholeList).toHaveLength(147);
  });

  it("вписать можно заклинания волшебника до доступного круга, кроме уже вписанных", () => {
    const level12 = writableSpells(SPELLS, { classId: "classes-wizard", level: 12, book: ["magic-missile"] });
    // Список волшебника до 6 круга — 148 заклинаний, минус одно уже в книге.
    expect(level12).toHaveLength(147);
    expect(level12.every((sp) => sp.level >= 1 && sp.level <= 6)).toBe(true);
    expect(level12.some((sp) => sp.id === "magic-missile")).toBe(false);
    // Круги 7-9 у волшебника в spells.json есть, но ячеек под них на 12 уровне нет.
    expect(level12.some((sp) => sp.level > 6)).toBe(false);

    // На 1 уровне — только 1 круг: 27 заклинаний волшебника из spells.json.
    expect(writableSpells(SPELLS, { classId: "classes-wizard", level: 1, book: [] })).toHaveLength(27);
  });

  /**
   * Число подготовленных — не «сколько влезло в книгу»: владелец формулы
   * прежний (`preparedSpellsMax` в preparedSpells.ts), и у волшебника в неё
   * идёт Интеллект. Проба отрицательная: убери пересчёт от характеристики —
   * и она краснеет, потому что 16 при 8 и 12 при 20 совпадут.
   */
  it("число подготовленных у волшебника считается от Интеллекта и уровня, книга на него не влияет", () => {
    expect(preparedSpellsMax("classes-wizard", intelligence(16), 1)).toBe(4);
    expect(preparedSpellsMax("classes-wizard", intelligence(16), 12)).toBe(15);
    expect(preparedSpellsMax("classes-wizard", intelligence(20), 12)).toBe(17);
    expect(preparedSpellsMax("classes-wizard", intelligence(8), 12)).toBe(11);
    // Норма книги на этих уровнях совсем другая — 6 и 28.
    expect(spellbookMax("classes-wizard", 1)).not.toBe(preparedSpellsMax("classes-wizard", intelligence(16), 1));
  });
});
