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
  rollLootContents,
  type CoinsFind,
  type LootContents,
} from "./dungeonLoot";
import { seededDice } from "./seededRandom";
import { readTrapNumbers, type TrapNumbers } from "./trapNumbers";
import oldLoot from "./__fixtures__/oldLoot.20261018.json";

/**
 * Числа подсказки к находке: вид, редкости, суммы монет и строка показа.
 *
 * С 22.10.2026 эти числа бросает ТОЛЬКО кнопка «Предложить», поэтому проба
 * зовёт `rollLootContents` своей костью, а не вынимает содержимое из схемы:
 * генератор его больше не кладёт, и первая проба здесь сторожит именно это.
 *
 * Семян много и они не подобраны — доля и порог обязаны держаться на любом, а
 * не на одном удачном. Где проверяется «не выпадает», рядом проверяется и
 * «выпадает»: иначе проба зеленела бы на пустоте, не выдав ни одной подсказки.
 *
 * Суммы монет проба считает САМА, в медных эквивалентах по курсу листа
 * персонажа (`COIN_DENOMINATIONS`), а не по вилкам из `LOOT_TIERS`: число,
 * взятое из той же константы, что у кода, сдвиг в генераторе не поймало бы.
 */

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
const bestiary = bundledBestiary as DwellerSource[];
const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 13);

/** Сколько подсказок бросает одно семя: всего их выходит 120 × 8. */
const PER_SEED = 8;

/** Подсказки этой ступени — своей костью, по многим семенам. */
const contentsAt = (partyLevel: number): LootContents[] =>
  SEEDS.flatMap((seed) => {
    const dice = seededDice(seed);
    return Array.from({ length: PER_SEED }, () => rollLootContents(dice, partyLevel));
  });

const coinsOnly = (list: readonly LootContents[]): CoinsFind[] =>
  list.flatMap((c) => (c.kind === "coins" ? [c] : []));

/** Сколько медных стоит подсказка — курс берётся у листа персонажа. */
function copperValue(find: CoinsFind): number {
  return COIN_DENOMINATIONS.reduce(
    (sum, d) => sum + (find.coins[d.key] ?? 0) * d.copperValue,
    0,
  );
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

describe("подсказка к находке подземелья", () => {
  it("генератор не кладёт содержимое ни одной отметке — ни находке, ни двери", () => {
    // Отрицательная проба к решению владельца 22.10.2026: верни генератору
    // бросок содержимого — и она покраснеет на первой же находке.
    const markers = SEEDS.slice(0, 30).flatMap((seed) =>
      [3, 19].flatMap(
        (partyLevel) =>
          generateDungeon({
            seed,
            partyLevel,
            danger: "Опасная",
            numbers,
            bestiary,
            size: "Большое",
          }).markers,
      ),
    );
    const finds = markers.filter((m) => m.kind === "loot");
    expect(finds.length, "находок на 30 семенах не выпало вовсе").toBeGreaterThan(100);
    for (const marker of markers) {
      expect("contents" in (marker as object), `${marker.id} несёт содержимое`).toBe(false);
    }
    // Строка таблицы у находки осталась: она говорит, ГДЕ находка лежит.
    for (const find of finds) expect(find.line?.text ?? "").not.toBe("");
  });

  it("у подсказки два вида, и та же кость даёт ту же подсказку", () => {
    const list = contentsAt(7);
    expect(list.length).toBe(SEEDS.length * PER_SEED);
    const kinds = new Set(list.map((c) => c.kind));
    expect([...kinds].sort()).toEqual(["coins", "magic"]);
    // Чистая функция кости: то же семя — та же подсказка, другое — другая.
    const once = rollLootContents(seededDice(20261022), 7);
    expect(rollLootContents(seededDice(20261022), 7)).toEqual(once);
    const many = SEEDS.map((seed) => JSON.stringify(rollLootContents(seededDice(seed), 7)));
    expect(new Set(many).size, "все семена дали одну и ту же подсказку").toBeGreaterThan(50);
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
    // «На многих семенах» — на всех: самая богатая подсказка 1–4 беднее самой
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
    // Список расходуется, а не стоит одним камнем на все подсказки.
    expect(new Set(finds.flatMap((c) => c.gems)).size).toBe(LOOT_GEMS.length);
  });

  it("строка подсказки — как в образце владельца, без пустых частей", () => {
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
    // Номинала, которого в подсказке нет, в строке нет: «0 мм» не пишется.
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

  it("находка записи, снятой до содержимого, читается одной строкой таблицы", () => {
    // Отметки взяты из схемы, записанной генератором ДО содержимого (семя
    // 20261018): поля `contents` в них нет вовсе — ровно то, что генератор
    // отдаёт и теперь, после его сноса.
    const old = oldLoot as unknown as DungeonMarker[];
    expect(old.length).toBeGreaterThan(0);
    for (const marker of old) {
      expect("contents" in (marker as object), marker.id).toBe(false);
      expect(marker.line?.text ?? "").not.toBe("");
    }
  });
});
