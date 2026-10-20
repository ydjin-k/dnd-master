import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../../state/types";
import type { DwellerSource } from "./dungeonDwellers";
import { tierForLevel } from "./dungeonDwellers";
import { generateDungeon, MARKER_KINDS, type DungeonPlan } from "./dungeonGenerator";
import { builtTrap } from "./readyTraps";
import { readTrapNumbers, trapDamage, type TrapDanger, type TrapNumbers } from "./trapNumbers";

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
const bestiary = bundledBestiary as DwellerSource[];
const make = (seed: number, partyLevel = 3, danger: TrapDanger = "Опасная") =>
  generateDungeon({ seed, partyLevel, danger, numbers, bestiary });

const floorCells = (plan: DungeonPlan) => {
  const cells = new Set(plan.corridors.map(([x, y]) => `${x},${y}`));
  for (const r of plan.rooms) {
    for (let x = r.x; x < r.x + r.w; x += 1) for (let y = r.y; y < r.y + r.h; y += 1) cells.add(`${x},${y}`);
  }
  return cells;
};

const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 13);

describe("генератор подземелья", () => {
  it("одно семя — одно подземелье", () => {
    expect(make(20261018)).toEqual(make(20261018));
  });

  it("разные семена — разные подземелья", () => {
    const shapes = new Set(SEEDS.slice(0, 20).map((seed) => JSON.stringify(make(seed).rooms)));
    expect(shapes.size).toBe(20);
  });

  // Лестницы здесь нет нарочно: она бывает только у многоэтажного
  // подземелья, и требовать её от одноэтажного значило бы требовать выхода
  // туда, где этажа нет. Парные лестницы проверяет `dungeonFloors.test.ts`.
  it("на каждой схеме отметки всех видов, кроме лестницы", () => {
    for (const seed of SEEDS) {
      const kinds = new Set(make(seed).markers.map((m) => m.kind));
      const wanted = MARKER_KINDS.filter((k) => k !== "stairs");
      expect(wanted.filter((k) => !kinds.has(k)), `семя ${seed}`).toEqual([]);
      expect(kinds.has("stairs"), `семя ${seed}: этаж один`).toBe(false);
    }
  });

  it("отметки стоят на полу, кроме потайного хода, и не друг на друге", () => {
    for (const seed of SEEDS) {
      const plan = make(seed);
      const floor = floorCells(plan);
      const placed = plan.markers.filter((m) => m.kind !== "secret");
      for (const m of placed) expect(floor.has(`${m.x},${m.y}`), `семя ${seed}, ${m.id}`).toBe(true);
      expect(new Set(placed.map((m) => `${m.x},${m.y}`)).size, `семя ${seed}`).toBe(placed.length);
      expect(new Set(plan.markers.map((m) => m.id)).size).toBe(plan.markers.length);
    }
  });

  it("вид комнаты в одном подземелье не повторяется", () => {
    for (const seed of SEEDS) {
      const kinds = make(seed).rooms.map((r) => r.kind.roll);
      expect(new Set(kinds).size, `семя ${seed}`).toBe(kinds.length);
    }
  });

  it("ловушки собраны с уровнем и опасностью этого подземелья", () => {
    for (const [level, danger] of [[2, "Неудобство"], [12, "Смертоносная"]] as const) {
      // Готовые сюда не идут: их числа свои, из справочника, и уровнем отряда
      // с опасностью они не масштабируются (`readyTraps.test.ts`).
      const traps = SEEDS.slice(0, 30).flatMap((seed) =>
        make(seed, level, danger).markers.flatMap((m) => {
          const built = builtTrap(m.trap);
          return built ? [built] : [];
        }),
      );
      expect(traps.length).toBeGreaterThan(0);
      for (const trap of traps) {
        expect([trap.partyLevel, trap.danger]).toEqual([level, danger]);
        const { min, max } = numbers.severity[danger].saveDc;
        expect(trap.saveDc >= min && trap.saveDc <= max).toBe(true);
        if (trap.damage !== null) expect(trap.damage).toBe(trapDamage(numbers, level, danger));
      }
    }
  });

  it("обитатели — только существа ступени отряда", () => {
    for (const level of [1, 7, 14, 19]) {
      const tier = tierForLevel(level);
      for (const seed of SEEDS.slice(0, 30)) {
        for (const room of make(seed, level).rooms) {
          for (const monster of room.dwellers?.monsters ?? []) {
            const raw = bestiary.find((m) => m.id === monster.id)!.challengeRating;
            const [a, b] = raw.split("/").map(Number);
            const cr = b ? a / b : a;
            expect(cr >= tier.minCr && cr <= tier.maxCr, `${monster.id} на ${level}`).toBe(true);
          }
        }
      }
    }
  });
});
