import { describe, expect, it } from "vitest";
import type { DungeonRecord } from "../../state/types";
import type { DungeonPlan } from "./dungeonGenerator";
import { LOOT_RARITIES } from "./dungeonLoot";
import {
  EMPTY_LOOT_CHOICE,
  LOOT_KIND_LABELS,
  LOOT_KINDS,
  isEmptyLootChoice,
  hasLootChoice,
  lootChoiceCount,
  lootChoiceLine,
  lootChoiceOf,
  lootKindHasRarity,
  lootRarityOf,
  suggestLootChoice,
  withLootChoice,
  withLootKindToggled,
  withLootRarity,
  withLootText,
  type LootChoice,
} from "./dungeonLootChoice";
import { seededDice } from "./seededRandom";

/**
 * Выбор мастера в находке: виды, редкости, описание и подсказка.
 *
 * Семян у подсказки много и они не подобраны: вид и редкость она берёт из
 * `dungeonLoot.ts`, и проба требует от неё не чисел (их сторожит
 * `dungeonLoot.test.ts`), а того, что выпавшее легло в ПОЛЯ мастера — вид
 * отмечен, редкость у предмета стоит, суммы ушли в описание.
 */

const dungeon: DungeonRecord = {
  id: "d1",
  name: "Склеп старого рода",
  createdAt: "2026-10-22T10:00:00Z",
  seed: 7,
  partyLevel: 3,
  danger: "Опасная",
  plan: { markers: [] } as unknown as DungeonPlan,
  statuses: {},
};

const choice = (kinds: LootChoice["kinds"], text = ""): LootChoice => ({ kinds, text });

describe("виды лута", () => {
  it("их шесть, и у каждого своя подпись", () => {
    expect(LOOT_KINDS).toEqual(["money", "valuables", "item", "magic", "artifact", "other"]);
    expect(LOOT_KINDS.map((kind) => LOOT_KIND_LABELS[kind])).toEqual([
      "Деньги",
      "Драгоценности",
      "Предмет",
      "Магический предмет",
      "Артефакт",
      "Другое",
    ]);
  });

  it("редкость есть у предмета и магического предмета — и больше ни у кого", () => {
    expect(LOOT_KINDS.filter(lootKindHasRarity)).toEqual(["item", "magic"]);
  });
});

describe("выбор мастера в находке", () => {
  it("у записи без выбора — пустой выбор и ни одной находки", () => {
    expect(lootChoiceOf(dungeon, "loot-1")).toEqual(EMPTY_LOOT_CHOICE);
    expect(isEmptyLootChoice(lootChoiceOf(dungeon, "loot-1"))).toBe(true);
    expect(hasLootChoice(dungeon, "loot-1")).toBe(false);
    expect(lootChoiceCount(dungeon)).toBe(0);
    expect(lootChoiceLine(lootChoiceOf(dungeon, "loot-1"))).toBe("");
  });

  it("выбор пишется и читается, в том числе под ключом нижнего этажа", () => {
    const written = withLootChoice(
      withLootChoice(dungeon, "loot-1", choice(["money"], "40 зм и серебряный кубок")),
      "f2-loot-1",
      withLootRarity(choice(["magic"]), "magic", "редкий"),
    );
    expect(lootChoiceOf(written, "loot-1").text).toBe("40 зм и серебряный кубок");
    expect(lootChoiceOf(written, "loot-1").kinds).toEqual(["money"]);
    expect(lootRarityOf(lootChoiceOf(written, "f2-loot-1"), "magic")).toBe("редкий");
    expect(lootChoiceCount(written)).toBe(2);
    expect(hasLootChoice(written, "f2-loot-1")).toBe(true);
    expect(hasLootChoice(written, "loot-3")).toBe(false);
    // Ключи заметок и статусов не тронуты: выбор лежит своим словарём.
    expect(written.notes).toBeUndefined();
    expect(written.statuses).toEqual({});
  });

  it("пустой выбор удаляется из записи, а соседний остаётся", () => {
    const written = withLootChoice(
      withLootChoice(dungeon, "loot-1", choice(["money"], "40 зм")),
      "loot-2",
      choice(["artifact"]),
    );
    expect(withLootChoice(written, "loot-1", EMPTY_LOOT_CHOICE).loot).toEqual({
      "loot-2": { kinds: ["artifact"], text: "" },
    });
    // Описание из одних пробелов и без видов — тоже пусто.
    expect(withLootChoice(written, "loot-2", choice([], "   \n\t")).loot).toEqual({
      "loot-1": { kinds: ["money"], text: "40 зм" },
    });
    expect(lootChoiceCount(withLootChoice(written, "loot-1", EMPTY_LOOT_CHOICE))).toBe(1);
  });

  it("один вид снятый, другой отмеченный — выбор не пуст, пока есть хоть один", () => {
    const only = withLootChoice(dungeon, "loot-1", choice(["other"]));
    expect(hasLootChoice(only, "loot-1")).toBe(true);
    // Описание без видов — тоже выбор: мастер написал, что нашли.
    const words = withLootChoice(dungeon, "loot-1", choice([], "кольчуга +1"));
    expect(hasLootChoice(words, "loot-1")).toBe(true);
    expect(lootChoiceLine(lootChoiceOf(words, "loot-1"))).toBe("кольчуга +1");
  });

  it("пробелы внутри и по краям описания сохраняются как набраны", () => {
    // Подрезка на каждом нажатии не дала бы поставить пробел между словами.
    const written = withLootChoice(dungeon, "loot-1", choice(["money"], "Два слова "));
    expect(lootChoiceOf(written, "loot-1").text).toBe("Два слова ");
  });

  it("запись не правится на месте", () => {
    const before = withLootChoice(dungeon, "loot-1", choice(["money"], "Было"));
    withLootChoice(before, "loot-1", choice(["money"], "Стало"));
    expect(lootChoiceOf(before, "loot-1").text).toBe("Было");
  });

  it("старая запись с выбором, но без порядка, читается приведённой к порядку", () => {
    // Виды в файле могут лежать в любом порядке и с повтором — показ обязан
    // открыть их один раз и в порядке списка.
    const messy = {
      ...dungeon,
      loot: { "loot-1": { kinds: ["other", "money", "money"], text: "" } as unknown as LootChoice },
    };
    expect(lootChoiceOf(messy, "loot-1").kinds).toEqual(["money", "other"]);
  });
});

describe("отметки видов и редкость", () => {
  it("вид отмечается и снимается, порядок — списка, а не нажатий", () => {
    let c = withLootKindToggled(EMPTY_LOOT_CHOICE, "other");
    c = withLootKindToggled(c, "money");
    expect(c.kinds).toEqual(["money", "other"]);
    c = withLootKindToggled(c, "money");
    expect(c.kinds).toEqual(["other"]);
  });

  it("снятый вид уносит свою редкость, а сосед — нет", () => {
    let c = withLootRarity(withLootKindToggled(EMPTY_LOOT_CHOICE, "item"), "item", "редкий");
    c = withLootRarity(withLootKindToggled(c, "magic"), "magic", "легендарный");
    expect(lootRarityOf(c, "item")).toBe("редкий");
    const off = withLootKindToggled(c, "item");
    expect(lootRarityOf(off, "item")).toBeNull();
    expect(lootRarityOf(off, "magic")).toBe("легендарный");
    // Вид, возвращённый обратно, приходит без редкости: её мастер уже снял.
    expect(lootRarityOf(withLootKindToggled(off, "item"), "item")).toBeNull();
  });

  it("редкость у вида, которому она не положена, в выборе не остаётся", () => {
    const c = withLootRarity(withLootKindToggled(EMPTY_LOOT_CHOICE, "money"), "money", "редкий");
    expect(lootRarityOf(c, "money")).toBeNull();
    expect(c.rarities).toBeUndefined();
  });

  it("редкость снимается обратно в «не выбрана»", () => {
    const c = withLootRarity(withLootKindToggled(EMPTY_LOOT_CHOICE, "item"), "item", "обычный");
    expect(withLootRarity(c, "item", null).rarities).toBeUndefined();
  });

  it("описание меняется, не трогая виды и редкости", () => {
    const c = withLootRarity(withLootKindToggled(EMPTY_LOOT_CHOICE, "magic"), "magic", "редкий");
    const typed = withLootText(c, "кольчуга +1");
    expect(typed.kinds).toEqual(["magic"]);
    expect(lootRarityOf(typed, "magic")).toBe("редкий");
    expect(typed.text).toBe("кольчуга +1");
  });
});

describe("строка выбора", () => {
  it("виды через запятую, редкость в скобках, описание после тире", () => {
    const c = withLootText(
      withLootRarity(choice(["money", "magic"]), "magic", "очень редкий"),
      "40 зм и кольчуга +1",
    );
    expect(lootChoiceLine(c)).toBe("Деньги, Магический предмет (очень редкий) — 40 зм и кольчуга +1");
  });

  it("без описания — одни виды, без видов — одно описание", () => {
    expect(lootChoiceLine(choice(["artifact"]))).toBe("Артефакт");
    expect(lootChoiceLine(choice([], " серебряный кубок "))).toBe("серебряный кубок");
  });

  it("вид без выбранной редкости идёт без скобок", () => {
    expect(lootChoiceLine(choice(["item"]))).toBe("Предмет");
  });
});

describe("подсказка «Предложить»", () => {
  const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 13);
  const suggestions = (partyLevel: number) =>
    SEEDS.map((seed) => suggestLootChoice(seededDice(seed), partyLevel));

  it("подсказка всегда непуста: отмечен хотя бы один вид", () => {
    for (const level of [1, 7, 14, 19]) {
      for (const s of suggestions(level)) {
        expect(s.kinds.length, JSON.stringify(s)).toBeGreaterThan(0);
        expect(isEmptyLootChoice(s)).toBe(false);
        for (const kind of s.kinds) expect(LOOT_KINDS).toContain(kind);
      }
    }
  });

  it("монеты приходят «Деньгами» и суммами в описание, камни — «Драгоценностями»", () => {
    const coins = suggestions(7).filter((s) => s.kinds.includes("money"));
    expect(coins.length).toBeGreaterThan(20);
    for (const s of coins) {
      // Суммы — в описании мастера, а не в отдельной строке приложения.
      expect(s.text, JSON.stringify(s)).toMatch(/\d+ (пм|зм|эм|см|мм)/);
      expect(lootRarityOf(s, "money")).toBeNull();
      // Камень в описании назван ровно тогда, когда отмечены драгоценности.
      const gems = s.text.split(", ").filter((part) => !/^\d/.test(part));
      expect(gems.length > 0, s.text).toBe(s.kinds.includes("valuables"));
    }
    expect(suggestions(7).some((s) => s.kinds.includes("valuables"))).toBe(true);
  });

  it("магический предмет приходит с редкостью и без описания", () => {
    const magic = suggestions(19).filter((s) => s.kinds.includes("magic"));
    expect(magic.length).toBeGreaterThan(10);
    for (const s of magic) {
      expect(s.kinds).toEqual(["magic"]);
      expect(LOOT_RARITIES).toContain(lootRarityOf(s, "magic")!);
      // Какой это предмет, не знает ни бросок, ни приложение.
      expect(s.text).toBe("");
    }
  });

  it("повторное нажатие предлагает заново, а та же кость — то же самое", () => {
    const dice = seededDice(20261022);
    const first = suggestLootChoice(dice, 7);
    expect(suggestLootChoice(seededDice(20261022), 7)).toEqual(first);
    // Подряд из одной кости подсказки разные: иначе «ещё раз» ничего не меняло
    // бы, сколько по кнопке ни бей.
    const again = Array.from({ length: 20 }, () => JSON.stringify(suggestLootChoice(dice, 7)));
    expect(new Set(again).size, `двадцать нажатий дали ${again[0]}`).toBeGreaterThan(5);
    // И разные семена дают разное: кость «Предложить» берёт случайное семя.
    const many = SEEDS.map((seed) => JSON.stringify(suggestLootChoice(seededDice(seed), 7)));
    expect(new Set(many).size, "все семена дали одну подсказку").toBeGreaterThan(50);
  });

  it("подсказку мастер правит как свой выбор — она такая же запись", () => {
    const suggested = suggestLootChoice(seededDice(20261022), 19);
    const edited = withLootText(withLootKindToggled(suggested, "artifact"), "жезл из подсказки");
    const written = withLootChoice(dungeon, "loot-1", edited);
    expect(lootChoiceOf(written, "loot-1").kinds).toContain("artifact");
    expect(lootChoiceOf(written, "loot-1").text).toBe("жезл из подсказки");
  });
});
