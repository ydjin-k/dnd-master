import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../../state/types";
import { findDungeonTable } from "../eventTables/dungeonTables";
import type { DwellerSource } from "./dungeonDwellers";
import {
  dungeonSizeOf,
  generateDungeon,
  lineTitle,
  MARKER_KINDS,
  type MarkerKind,
} from "./dungeonGenerator";
import { readTrapNumbers, type TrapNumbers } from "./trapNumbers";
import mediumPlan from "./__fixtures__/mediumPlan.20261018.json";

/**
 * Размер, назначение и семя подземелья.
 *
 * Главная проба здесь — эталон: схема семени 20261018 лежит в
 * `__fixtures__/mediumPlan.20261018.json` и сравнивается целиком. Числа
 * эталона не выводятся из констант генератора, поэтому сдвиг в броске,
 * порядке бросков или в сетке «Среднего» краснеет здесь, а не остаётся
 * незамеченным.
 *
 * Эталон перезаписывается, только когда вывод генератора меняется НАМЕРЕННО, и
 * отдельным коммитом после правки — чтобы в журнале было видно, что именно в
 * схеме сменилось. Так было трижды: при появлении размеров; 19.10.2026, когда
 * одна ловушка из трёх стала готовой (`readyTraps.ts`) — у «Среднего» семени
 * 20261018 сменились ловушки, лут и точки интереса, а комнаты, проходы, двери,
 * потайной ход, назначение и вход остались прежними; и 20.10.2026, когда у
 * находок появилось содержимое (`dungeonLoot.ts`) — тогда правка эталона вышла
 * ЧИСТО ДОБАВЛЕНИЕМ: у трёх находок прибавилось поле `contents`, и ни один
 * прежний бросок не сдвинулся, потому что содержимое бросается после всех
 * отметок.
 */

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
const bestiary = bundledBestiary as DwellerSource[];
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);

const make = (seed: number, extra: Partial<Parameters<typeof generateDungeon>[0]> = {}) =>
  generateDungeon({ seed, partyLevel: 3, danger: "Опасная", numbers, bestiary, ...extra });

/** Сколько отметок этого вида на схеме. */
const countOf = (seed: number, kind: MarkerKind, extra = {}) =>
  make(seed, extra).markers.filter((m) => m.kind === kind).length;

describe("размер подземелья", () => {
  it("«Среднее» со случайным назначением — схема, равная схеме до правки", () => {
    expect(JSON.parse(JSON.stringify(make(20261018, { size: "Среднее" })))).toEqual(mediumPlan);
    // Размер не назван — тоже «Среднее»: подземелья, созданные до выбора
    // размера, пересобираются теми же.
    expect(JSON.parse(JSON.stringify(make(20261018)))).toEqual(mediumPlan);
  });

  it("в малом комнат меньше, чем в среднем, а в большом больше", () => {
    for (const seed of SEEDS) {
      const small = make(seed, { size: "Малое" }).rooms.length;
      const medium = make(seed, { size: "Среднее" }).rooms.length;
      const large = make(seed, { size: "Большое" }).rooms.length;
      expect(small, `семя ${seed}: малое ${small} против среднего ${medium}`).toBeLessThan(medium);
      expect(large, `семя ${seed}: большое ${large} против среднего ${medium}`).toBeGreaterThan(medium);
      // Границы карточки: малое — около 4–5 комнат, большое — около 12–14.
      expect(small, `семя ${seed}`).toBeGreaterThanOrEqual(4);
      expect(small, `семя ${seed}`).toBeLessThanOrEqual(5);
      expect(large, `семя ${seed}`).toBeGreaterThanOrEqual(12);
      expect(large, `семя ${seed}`).toBeLessThanOrEqual(14);
    }
  });

  it("ловушек, лута и точек интереса с размером становится больше", () => {
    for (const kind of ["trap", "loot", "feature"] as const) {
      const sum = (size: "Малое" | "Среднее" | "Большое") =>
        SEEDS.reduce((total, seed) => total + countOf(seed, kind, { size }), 0);
      const [small, medium, large] = [sum("Малое"), sum("Среднее"), sum("Большое")];
      expect(small, `${kind}: малое ${small} против среднего ${medium}`).toBeLessThan(medium);
      expect(large, `${kind}: большое ${large} против среднего ${medium}`).toBeGreaterThan(medium);
    }
  });

  it("на схеме любого размера есть отметки всех пяти видов", () => {
    for (const size of ["Малое", "Среднее", "Большое"] as const) {
      for (const seed of SEEDS) {
        const kinds = new Set(make(seed, { size }).markers.map((m) => m.kind));
        expect([...MARKER_KINDS].filter((k) => !kinds.has(k)), `${size}, семя ${seed}`).toEqual([]);
      }
    }
  });

  it("сетка схемы — та, что у размера, и комнаты из неё не выходят", () => {
    const expected = { Малое: [26, 18], Среднее: [34, 22], Большое: [48, 30] } as const;
    for (const [size, [width, height]] of Object.entries(expected)) {
      for (const seed of SEEDS) {
        const plan = make(seed, { size: size as keyof typeof expected });
        expect([plan.width, plan.height], `${size}`).toEqual([width, height]);
        for (const r of plan.rooms) {
          expect(r.x + r.w, `${size}, семя ${seed}, комната ${r.number}`).toBeLessThan(width);
          expect(r.y + r.h, `${size}, семя ${seed}, комната ${r.number}`).toBeLessThan(height);
        }
      }
    }
  });

  it("незнакомый и отсутствующий размер записи читаются как «Среднее»", () => {
    expect(dungeonSizeOf("Большое")).toBe("Большое");
    expect(dungeonSizeOf(undefined)).toBe("Среднее");
    expect(dungeonSizeOf(null)).toBe("Среднее");
    expect(dungeonSizeOf("")).toBe("Среднее");
    expect(dungeonSizeOf("Гигантское")).toBe("Среднее");
  });
});

describe("назначение подземелья", () => {
  it("выбранное назначение стоит в plan.purpose и не бросается", () => {
    const table = findDungeonTable("dungeon-purpose")!;
    // Все строки таблицы, а не одна: назначение выбирают из списка целиком.
    for (const row of table.rows) {
      const plan = make(777, { purposeRoll: row.from });
      expect(plan.purpose.roll).toBe(row.from);
      expect(plan.purpose.text).toBe(row.text);
    }
  });

  it("выбранное назначение не зависит от семени, а остальная схема — зависит", () => {
    const first = make(101, { purposeRoll: 7 });
    const second = make(202, { purposeRoll: 7 });
    expect([first.purpose.roll, second.purpose.roll]).toEqual([7, 7]);
    expect(lineTitle(first.purpose.text)).toBe("Мастерская чародея");
    expect(second.rooms).not.toEqual(first.rooms);
  });

  it("со «Случайно» назначение выпадает разным на разных семенах", () => {
    const rolls = new Set(SEEDS.map((seed) => make(seed).purpose.roll));
    expect(rolls.size).toBeGreaterThan(1);
  });
});

describe("семя подземелья", () => {
  it("то же семя при тех же параметрах повторяет схему, другое — меняет", () => {
    const params = { size: "Большое", purposeRoll: 3 } as const;
    expect(make(4242, params)).toEqual(make(4242, params));
    // «Пересобрать» берёт новое семя теми же параметрами — схема другая.
    const again = make(4243, params);
    expect(again.purpose.roll).toBe(3);
    expect(again.rooms).not.toEqual(make(4242, params).rooms);
  });

  it("семя лежит в самой схеме — его есть что показать в шапке", () => {
    expect(make(20261019).seed).toBe(20261019);
  });
});
