import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../../state/types";
import { COIN_DENOMINATIONS } from "../characterCreationData";
import type { DwellerSource } from "./dungeonDwellers";
import { generateDungeon, type DungeonMarker } from "./dungeonGenerator";
import {
  lootContentsLine,
  LOOT_GEMS,
  LOOT_RARITIES,
  LOOT_TIERS,
  type CoinsFind,
  type LootContents,
} from "./dungeonLoot";
import { readTrapNumbers, type TrapNumbers } from "./trapNumbers";
import oldLoot from "./__fixtures__/oldLoot.20261018.json";

/**
 * Содержимое находок подземелья: вид, редкости, суммы монет и строка показа.
 *
 * Семян много и они не подобраны — доля и порог обязаны держаться на любом, а
 * не на одном удачном. Где проверяется «не выпадает», рядом проверяется и
 * «выпадает»: иначе проба зеленела бы на пустоте, не выдав ни одной находки.
 *
 * Суммы монет проба считает САМА, в медных эквивалентах по курсу листа
 * персонажа (`COIN_DENOMINATIONS`), а не по вилкам из `LOOT_TIERS`: число,
 * взятое из той же константы, что у кода, сдвиг в генераторе не поймало бы.
 */

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
const bestiary = bundledBestiary as DwellerSource[];
const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 13);

/** Находки всех схем этого уровня, большим размером — их там больше. */
function findsAt(partyLevel: number): DungeonMarker[] {
  return SEEDS.flatMap((seed) =>
    generateDungeon({
      seed,
      partyLevel,
      danger: "Опасная",
      numbers,
      bestiary,
      size: "Большое",
    }).markers.filter((m) => m.kind === "loot"),
  );
}

const contentsAt = (partyLevel: number): LootContents[] =>
  findsAt(partyLevel).map((m) => {
    expect(m.contents, `находка ${m.id} без содержимого`).toBeDefined();
    return m.contents!;
  });

const coinsOnly = (list: readonly LootContents[]): CoinsFind[] =>
  list.flatMap((c) => (c.kind === "coins" ? [c] : []));

/** Сколько медных стоит находка — курс берётся у листа персонажа. */
function copperValue(find: CoinsFind): number {
  return COIN_DENOMINATIONS.reduce(
    (sum, d) => sum + (find.coins[d.key] ?? 0) * d.copperValue,
    0,
  );
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

describe("содержимое находки подземелья", () => {
  it("у каждой находки новой схемы есть содержимое, и видов его два", () => {
    const list = contentsAt(7);
    expect(list.length).toBeGreaterThan(400);
    const kinds = new Set(list.map((c) => c.kind));
    expect([...kinds].sort()).toEqual(["coins", "magic"]);
    // У отметок других видов содержимого нет вовсе — это находки, а не двери.
    const others = SEEDS.slice(0, 20).flatMap((seed) =>
      generateDungeon({ seed, partyLevel: 7, danger: "Опасная", numbers, bestiary }).markers.filter(
        (m) => m.kind !== "loot",
      ),
    );
    expect(others.length).toBeGreaterThan(0);
    expect(others.filter((m) => m.contents !== undefined)).toEqual([]);
  });

  it("то же семя — то же содержимое, другое семя — другое", () => {
    const params = { partyLevel: 9, danger: "Опасная", numbers, bestiary, size: "Большое" } as const;
    const once = generateDungeon({ seed: 20261020, ...params }).markers;
    expect(generateDungeon({ seed: 20261020, ...params }).markers).toEqual(once);
    const other = generateDungeon({ seed: 20261021, ...params }).markers;
    const inside = (ms: readonly DungeonMarker[]) =>
      JSON.stringify(ms.filter((m) => m.kind === "loot").map((m) => m.contents!));
    // Сравнивать нечего, если содержимого нет вовсе: пустые списки равны.
    expect(inside(once)).toMatch(/"(coins|magic)"/);
    expect(inside(other)).not.toBe(inside(once));
  });

  it("доля магических предметов растёт со ступенью", () => {
    const share = (level: number) => {
      const list = contentsAt(level);
      return list.filter((c) => c.kind === "magic").length / list.length;
    };
    const shares = [1, 7, 14, 19].map(share);
    for (let i = 1; i < shares.length; i += 1) {
      expect(shares[i], `ступени: ${shares.map((s) => s.toFixed(2)).join(" → ")}`).toBeGreaterThan(
        shares[i - 1],
      );
    }
    // Названная доля ступени, с запасом на разброс кости.
    LOOT_TIERS.forEach((tier, i) => {
      expect(shares[i], `ступень с ${tier.fromLevel}: вышло ${shares[i].toFixed(2)}`).toBeGreaterThan(
        tier.magicShare - 0.08,
      );
      expect(shares[i], `ступень с ${tier.fromLevel}: вышло ${shares[i].toFixed(2)}`).toBeLessThan(
        tier.magicShare + 0.08,
      );
    });
  });

  it("легендарный предмет не выпадает ниже 17 уровня, а на 17–20 выпадает", () => {
    for (const level of [1, 4, 5, 10, 11, 16]) {
      const rarities = contentsAt(level).flatMap((c) => (c.kind === "magic" ? [c.rarity] : []));
      expect(rarities.length, `уровень ${level}: магических не выпало вовсе`).toBeGreaterThan(0);
      expect(rarities, `уровень ${level}`).not.toContain("легендарный");
    }
    for (const level of [17, 20]) {
      const rarities = contentsAt(level).flatMap((c) => (c.kind === "magic" ? [c.rarity] : []));
      expect(rarities, `уровень ${level}`).toContain("легендарный");
    }
  });

  it("на 1–4 предмет почти всегда обычный или необычный", () => {
    const rarities = contentsAt(3).flatMap((c) => (c.kind === "magic" ? [c.rarity] : []));
    expect(rarities.length).toBeGreaterThan(20);
    expect(new Set(rarities)).toEqual(new Set(["обычный", "необычный"]));
    // На 11–16 они уже не единственные: распределение именно сдвигается.
    const high = new Set(contentsAt(14).flatMap((c) => (c.kind === "magic" ? [c.rarity] : [])));
    expect(high.has("редкий") || high.has("очень редкий")).toBe(true);
  });

  it("редкость — из пяти названных, и других названий нет", () => {
    const seen = new Set(
      [1, 7, 14, 19].flatMap((level) =>
        contentsAt(level).flatMap((c) => (c.kind === "magic" ? [c.rarity] : [])),
      ),
    );
    expect([...seen].sort()).toEqual([...LOOT_RARITIES].sort());
  });

  it("суммы монет на 1–4 меньше, чем на 17–20", () => {
    const low = coinsOnly(contentsAt(3)).map(copperValue);
    const high = coinsOnly(contentsAt(19)).map(copperValue);
    expect(low.length).toBeGreaterThan(100);
    expect(high.length).toBeGreaterThan(100);
    // «На многих семенах» — на всех: самая богатая находка 1–4 беднее самой
    // скудной на 17–20, и сравнивать медианы уже незачем.
    expect(Math.max(...low)).toBeLessThan(Math.min(...high));
    expect(median(low), `медианы: ${median(low)} против ${median(high)} мм`).toBeLessThan(
      median(high),
    );
    // Ступени между ними тоже по возрастанию — по медиане.
    const medians = [3, 7, 14, 19].map((level) => median(coinsOnly(contentsAt(level)).map(copperValue)));
    for (let i = 1; i < medians.length; i += 1) {
      expect(medians[i], `медианы ступеней: ${medians.join(", ")} мм`).toBeGreaterThan(medians[i - 1]);
    }
  });

  it("на 1–4 монеты — медь и серебро десятками, платины нет; на 17–20 платина есть", () => {
    const low = coinsOnly(contentsAt(3));
    expect(low.some((c) => (c.coins.copper ?? 0) > 0)).toBe(true);
    expect(low.some((c) => (c.coins.silver ?? 0) > 0)).toBe(true);
    expect(low.filter((c) => (c.coins.platinum ?? 0) > 0)).toEqual([]);
    // Десятками, а не сотнями: горсть меди и серебра, золота — единицы.
    for (const find of low) {
      expect(find.coins.copper ?? 0).toBeLessThanOrEqual(40);
      expect(find.coins.silver ?? 0).toBeLessThanOrEqual(25);
      expect(find.coins.gold ?? 0).toBeLessThanOrEqual(8);
    }
    expect(coinsOnly(contentsAt(19)).some((c) => (c.coins.platinum ?? 0) > 0)).toBe(true);
  });

  it("камней от нуля до двух, они из своего списка и не повторяются", () => {
    const finds = [3, 7, 14, 19].flatMap((level) => coinsOnly(contentsAt(level)));
    const counts = new Set(finds.map((c) => c.gems.length));
    expect([...counts].sort()).toEqual([0, 1, 2]);
    for (const find of finds) {
      expect(new Set(find.gems).size, `повтор камня: ${find.gems.join(", ")}`).toBe(find.gems.length);
      for (const gem of find.gems) expect(LOOT_GEMS as readonly string[]).toContain(gem);
    }
    // Список расходуется, а не стоит одним камнем на все находки.
    expect(new Set(finds.flatMap((c) => c.gems)).size).toBe(LOOT_GEMS.length);
  });

  it("строка содержимого — как в образце владельца, без пустых частей", () => {
    const finds = [3, 7, 14, 19].flatMap((level) => contentsAt(level));
    for (const contents of finds) {
      const line = lootContentsLine(contents);
      expect(line, JSON.stringify(contents)).not.toBe("");
      expect(line, JSON.stringify(contents)).not.toMatch(/(^|\s)0\s/);
      if (contents.kind === "magic") {
        expect(line).toBe(`магический предмет, редкость: ${contents.rarity}`);
        continue;
      }
      // Каждая часть — «N зм» своим сокращением листа персонажа либо камень.
      const parts = line.split(", ");
      const labels = COIN_DENOMINATIONS.map((d) => d.label).join("|");
      const coinParts = Object.values(contents.coins).filter((n) => n > 0).length;
      expect(parts).toHaveLength(coinParts + contents.gems.length);
      parts.slice(0, coinParts).forEach((part) => {
        expect(part, line).toMatch(new RegExp(`^[1-9]\\d* (${labels})$`));
      });
      expect(parts.slice(coinParts)).toEqual([...contents.gems]);
    }
    // Образец владельца собирается ровно этой же строкой.
    expect(
      lootContentsLine({ kind: "coins", coins: { gold: 5, silver: 10 }, gems: ["аметист"] }),
    ).toBe("5 зм, 10 см, аметист");
    // Номинала, которого в находке нет, в строке нет: «0 мм» не пишется.
    expect(lootContentsLine({ kind: "coins", coins: { copper: 0, gold: 5 }, gems: [] })).toBe("5 зм");
  });

  it("монеты выписаны от дорогого номинала к дешёвому", () => {
    const line = lootContentsLine({
      kind: "coins",
      coins: { copper: 7, silver: 6, electrum: 5, gold: 4, platinum: 3 },
      gems: ["оникс"],
    });
    expect(line).toBe("3 пм, 4 зм, 5 эм, 6 см, 7 мм, оникс");
  });

  it("находка, записанная до содержимого, читается без него", () => {
    // Отметки взяты из схемы, записанной СТАРЫМ генератором (семя 20261018):
    // поля `contents` в них нет вовсе, и показ обязан открыть такую находку
    // одной строкой таблицы, как раньше.
    const old = oldLoot as unknown as DungeonMarker[];
    expect(old.length).toBeGreaterThan(0);
    for (const marker of old) {
      expect("contents" in (marker as object), marker.id).toBe(false);
      expect(marker.contents).toBeUndefined();
      expect(marker.line?.text ?? "").not.toBe("");
    }
  });
});
