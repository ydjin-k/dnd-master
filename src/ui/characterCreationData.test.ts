import { describe, it, expect } from "vitest";
import {
  carryingCapacityLb,
  catalogWeightLb,
  CLASS_SUBCLASSES,
  coinsWeightLb,
  inventoryWeightLb,
  parseItemWeightLb,
} from "./characterCreationData";
import { emptyCoins } from "../state/types";

/**
 * characters-original-subclasses: каждый класс должен предлагать ровно 3
 * архетипа (1 SRD + 2 оригинальных). Пока карточка выполняется по классам
 * инкрементально, список ниже растёт вместе с CLASS_SUBCLASSES — не
 * добавляй сюда класс раньше, чем допишешь его архетипы.
 */
const CLASSES_WITH_THREE_SUBCLASSES = [
  "classes-cleric",
  "classes-warlock",
  "classes-sorcerer",
  "classes-wizard",
  "classes-druid",
  "classes-bard",
  "classes-barbarian",
  "classes-fighter",
];

describe("CLASS_SUBCLASSES (characters-original-subclasses)", () => {
  it.each(CLASSES_WITH_THREE_SUBCLASSES)("%s has exactly 3 subclasses, all with distinct non-empty names", (classId) => {
    const info = CLASS_SUBCLASSES[classId];
    expect(info.subclasses).toHaveLength(3);
    const names = info.subclasses.map((s) => s.name);
    expect(new Set(names).size).toBe(3);
    for (const name of names) expect(name.trim().length).toBeGreaterThan(0);
  });

  it("the 2 original subclasses of each finished class carry a description and at least one feature at chosenAtLevel", () => {
    for (const classId of CLASSES_WITH_THREE_SUBCLASSES) {
      const info = CLASS_SUBCLASSES[classId];
      for (const original of info.subclasses.slice(1)) {
        expect(original.description).toBeTruthy();
        expect(original.featuresByLevel[info.chosenAtLevel]?.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("parseItemWeightLb", () => {
  it("parses a whole-number weight string", () => {
    expect(parseItemWeightLb("10 фнт.")).toBe(10);
  });

  it("parses a fractional weight string", () => {
    expect(parseItemWeightLb("1/4 фнт.")).toBe(0.25);
  });

  it("treats a dash (no weight in SRD) as 0", () => {
    expect(parseItemWeightLb("—")).toBe(0);
  });
});

describe("catalogWeightLb", () => {
  it("finds the weight of a known catalog item by name", () => {
    expect(catalogWeightLb("Кольчуга")).toBe(55); // ARMOR, rules.json → equipment-armor
  });

  it("returns 0 for a name not in the catalog (freely typed item)", () => {
    expect(catalogWeightLb("Выдуманный артефакт")).toBe(0);
  });
});

describe("carryingCapacityLb", () => {
  it("is Сила × 15 (SRD 5.1 base rule, rules.json → gameplay-abilities)", () => {
    expect(carryingCapacityLb(10)).toBe(150);
  });
});

describe("inventoryWeightLb + coinsWeightLb (characters-carrying-capacity acceptance criteria)", () => {
  it("sums weight × quantity across the inventory", () => {
    const inventory = [
      { weightLb: 55, quantity: 1 }, // Кольчуга
      { weightLb: 1, quantity: 5 }, // 5 факелов
    ];
    expect(inventoryWeightLb(inventory)).toBe(60);
  });

  it("100 медных монет весят 2 фунта (курс 50 монет/фунт)", () => {
    expect(coinsWeightLb({ ...emptyCoins(), copper: 100 })).toBe(2);
  });

  it("combined item + coin weight matches a known total", () => {
    const inventory = [{ weightLb: 55, quantity: 1 }];
    const coins = { ...emptyCoins(), copper: 100 };
    expect(inventoryWeightLb(inventory) + coinsWeightLb(coins)).toBe(57);
  });
});
