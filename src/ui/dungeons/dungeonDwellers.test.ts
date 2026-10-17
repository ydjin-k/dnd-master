import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import { findDungeonTable } from "../eventTables/dungeonTables";
import {
  crValue,
  DWELLER_TIERS,
  dwellersForTier,
  rowFitsTier,
  tierForLevel,
  type DwellerSource,
} from "./dungeonDwellers";

const bestiary = bundledBestiary as DwellerSource[];
const dwellers = findDungeonTable("dungeon-dwellers")!;
/** ПО прямо из файла бестиария — своим разбором, не тем, что у кода. */
const crOf = (id: string) => {
  const raw = bestiary.find((m) => m.id === id)!.challengeRating;
  const [a, b] = raw.split("/").map(Number);
  return b ? a / b : a;
};

describe("обитатели по ступеням отряда", () => {
  it("ступени покрывают уровни 1–20 без дыр", () => {
    for (let level = 1; level <= 20; level += 1) {
      const tier = tierForLevel(level);
      expect(level >= tier.fromLevel && level <= tier.toLevel, `уровень ${level}`).toBe(true);
    }
    expect(DWELLER_TIERS.map((t) => [t.fromLevel, t.toLevel])).toEqual([
      [1, 4], [5, 10], [11, 16], [17, 20],
    ]);
  });

  it("каждый выпавший на ступени — с ПО ступени по bestiary.json", () => {
    for (const tier of DWELLER_TIERS) {
      for (const row of dwellers.rows) {
        for (const monster of dwellersForTier(row, tier, bestiary)) {
          const cr = crOf(monster.id);
          expect(cr >= tier.minCr && cr <= tier.maxCr, `${monster.id} (ПО ${cr}) на ${tier.fromLevel}–${tier.toLevel}`).toBe(true);
        }
      }
    }
  });

  it("примеры владельца: ветеран не на 11–16, огр и мимик не на 1–4", () => {
    const names = (level: number) =>
      dwellers.rows.flatMap((row) => dwellersForTier(row, tierForLevel(level), bestiary).map((m) => m.id));
    expect(names(1)).not.toContain("ogre");
    expect(names(1)).not.toContain("mimic");
    expect(names(12)).not.toContain("veteran");
  });

  it("строка без подходящих существ на ступени не выпадает, «пусто» выпадает всегда", () => {
    const goblinoids = dwellers.rows[1];
    const empty = dwellers.rows[9];
    expect(rowFitsTier(goblinoids, tierForLevel(1), bestiary)).toBe(true);
    expect(rowFitsTier(goblinoids, tierForLevel(20), bestiary)).toBe(false);
    for (const tier of DWELLER_TIERS) expect(rowFitsTier(empty, tier, bestiary)).toBe(true);
  });

  it("на каждой ступени выпадает не меньше четырёх строк из десяти", () => {
    for (const tier of DWELLER_TIERS) {
      const fitting = dwellers.rows.filter((row) => rowFitsTier(row, tier, bestiary)).length;
      expect(fitting, `${tier.fromLevel}–${tier.toLevel}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("ПО читается и дробью, и целым", () => {
    expect(crValue("1/8")).toBe(0.125);
    expect(crValue("13")).toBe(13);
    expect(crValue("")).toBeNull();
  });
});
