import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { DungeonRecord, RuleTopic } from "../../state/types";
import type { DwellerSource } from "./dungeonDwellers";
import { rebuildLosses } from "./dungeonEdit";
import { generateDungeon, READY_TRAP_SHARE } from "./dungeonGenerator";
import { builtTrap, isReadyTrap, readyTrapPick, type PlacedTrap } from "./readyTraps";
import { freeFloorCells, withTrapPlaced } from "./trapPlacement";
import { readTrapNumbers, type TrapNumbers } from "./trapNumbers";
import oldMarkers from "./__fixtures__/oldMarkers.20261018.json";

/**
 * Готовые ловушки на схеме подземелья: доля, пороги уровня и старые записи.
 *
 * Семян много и они не подобраны: порог обязан держаться на любом, а не на
 * одном удачном. Там, где проверяется «не выпадает», рядом проверяется и
 * «выпадает» — иначе проба зеленела бы на пустоте, не поставив ни одной
 * готовой ловушки вовсе.
 */

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
const bestiary = bundledBestiary as DwellerSource[];
const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 13);

/** Ловушки всех схем этого уровня, большим размером — их там больше. */
function trapsAt(partyLevel: number): PlacedTrap[] {
  return SEEDS.flatMap((seed) =>
    generateDungeon({
      seed,
      partyLevel,
      danger: "Опасная",
      numbers,
      bestiary,
      size: "Большое",
    }).markers.flatMap((m) => (m.trap ? [m.trap] : [])),
  );
}

const readyNamesAt = (level: number) =>
  trapsAt(level).flatMap((trap) => (isReadyTrap(trap) ? [trap.name] : []));

describe("готовые ловушки в схеме подземелья", () => {
  it("часть ловушек схемы — готовые, остальные собраны из слоёв", () => {
    const traps = trapsAt(7);
    const ready = traps.filter(isReadyTrap).length;
    expect(traps.length).toBeGreaterThan(400);
    expect(ready).toBeGreaterThan(0);
    expect(ready).toBeLessThan(traps.length);
    // Доля — одна из трёх, с запасом на разброс кости.
    const share = ready / traps.length;
    expect(share, `вышло ${ready} из ${traps.length}`).toBeGreaterThan(READY_TRAP_SHARE - 0.08);
    expect(share, `вышло ${ready} из ${traps.length}`).toBeLessThan(READY_TRAP_SHARE + 0.08);
    // У готовой отметки в записи лежит ТОЛЬКО имя: текст живёт в справочнике.
    const first = traps.find(isReadyTrap)!;
    expect(Object.keys(first).sort()).toEqual(["name", "ready"]);
    expect(numbers.ready.map((t) => t.name)).toContain(first.name);
  });

  it("сфера аннигиляции не выпадает отряду ниже 11 уровня", () => {
    for (const level of [1, 3, 5, 7, 10]) {
      const names = readyNamesAt(level);
      expect(names.length, `уровень ${level}: готовых ловушек не выпало вовсе`).toBeGreaterThan(0);
      expect(names, `уровень ${level}`).not.toContain("Сфера аннигиляции");
    }
    // С 11 уровня она выпадает: порог отсекает именно по уровню, а не всегда.
    for (const level of [11, 16, 20]) {
      expect(readyNamesAt(level), `уровень ${level}`).toContain("Сфера аннигиляции");
    }
  });

  it("катящаяся сфера не выпадает отряду ниже 5 уровня", () => {
    for (const level of [1, 2, 4]) {
      expect(readyNamesAt(level), `уровень ${level}`).not.toContain("Катящаяся Сфера");
    }
    for (const level of [5, 9]) {
      expect(readyNamesAt(level), `уровень ${level}`).toContain("Катящаяся Сфера");
    }
  });

  it("остальные готовые ловушки достаются отряду любого уровня", () => {
    const low = new Set(readyNamesAt(1));
    const high = new Set(readyNamesAt(20));
    expect(high.size).toBe(11);
    expect([...high].filter((name) => !low.has(name)).sort()).toEqual([
      "Катящаяся Сфера",
      "Сфера аннигиляции",
    ]);
  });

  it("то же семя даёт те же ловушки, и готовые в том же порядке", () => {
    const params = { partyLevel: 12, danger: "Опасная", numbers, bestiary, size: "Большое" } as const;
    const once = generateDungeon({ seed: 20261019, ...params }).markers;
    const twice = generateDungeon({ seed: 20261019, ...params }).markers;
    expect(twice).toEqual(once);
  });

  it("запись, сделанная до готовых ловушек, читается как собранная", () => {
    // Отметки взяты из схемы, записанной СТАРЫМ генератором (семя 20261018):
    // поля `ready` в них нет вовсе, и признак вида от этого не ломается.
    const { trap, door } = oldMarkers as unknown as {
      trap: { trap: PlacedTrap };
      door: { trap: PlacedTrap | null };
    };
    expect("ready" in (trap.trap as object)).toBe(false);
    expect(isReadyTrap(trap.trap)).toBe(false);
    const built = builtTrap(trap.trap)!;
    expect(built).toBe(trap.trap);
    expect(built.layers).toHaveLength(5);
    expect(built.saveDc).toBeGreaterThan(0);
    // У двери ловушки нет вовсе — и `builtTrap` этого не выдумывает.
    expect(builtTrap(door.trap)).toBeNull();
  });
  it("готовая ловушка, поставленная руками, считается при пересборке", () => {
    const plan = generateDungeon({
      seed: 4242,
      partyLevel: 12,
      danger: "Опасная",
      numbers,
      bestiary,
      size: "Среднее",
    });
    const dungeon: DungeonRecord = {
      id: "d-ready",
      name: "Проба потерь",
      createdAt: "2026-10-19T10:00:00Z",
      seed: 4242,
      partyLevel: 12,
      danger: "Опасная",
      size: "Среднее",
      plan,
      statuses: {},
    };
    // Ловушки самой схемы потерей не считаются — их пересборка бросает заново.
    expect(rebuildLosses(dungeon)).toEqual([]);

    const [x, y] = freeFloorCells(plan)[0];
    const placed = withTrapPlaced(dungeon, readyTrapPick("Отравленная игла"), x, y, 1)!;
    // Ручную считает `isMasterPlaced`, а не вид ловушки: готовая — тоже потеря.
    expect(rebuildLosses(placed)).toEqual(["ловушек, поставленных руками: 1"]);
  });
});
