import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { DungeonRecord, RuleTopic } from "../../state/types";
import type { DwellerSource } from "./dungeonDwellers";
import {
  floorCount,
  floorFields,
  floorLabel,
  floorPlan,
  floorPrefix,
  floorSeed,
  floorsOf,
  MAX_FLOORS,
  planFloor,
  stairsTarget,
  withFloorPlan,
} from "./dungeonFloors";
import {
  generateDungeon,
  generateFloorPlans,
  markerLabel,
  type DungeonPlan,
} from "./dungeonGenerator";
import { recipeOf, rebuildLosses, withDungeonRebuilt } from "./dungeonEdit";
import { noteOf, withNote } from "./dungeonNotes";
import { markerStatusOf, roomKey, roomStatusOf, withMarkerAdvanced } from "./markerStatus";
import {
  freeFloorCells,
  isMasterPlaced,
  roomNumberAt,
  withMarkerRemoved,
  withTrapPlaced,
} from "./trapPlacement";
import { readyTrapPick } from "./readyTraps";
import { readTrapNumbers, type TrapNumbers } from "./trapNumbers";

/**
 * Этажи подземелья: семя, лестницы, ключи и старые записи.
 *
 * Семена здесь перебираются десятками, а не вписаны одним числом: лестница
 * ставится в свободную клетку комнаты, и на одном удачном семени «обе в
 * комнатах» проверялось бы там, где свободных клеток в избытке.
 */

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
const bestiary = bundledBestiary as DwellerSource[];
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);

const params = (seed: number) =>
  ({ seed, partyLevel: 3, danger: "Опасная", numbers, bestiary }) as const;

const floors = (seed: number, count: number) => generateFloorPlans(params(seed), count);

/** Запись кампании с этими этажами — всё остальное у неё не проверяется. */
function record(plans: readonly DungeonPlan[], seed = 20261018): DungeonRecord {
  return {
    id: "d1",
    name: "Склеп старого рода",
    createdAt: "2026-10-20T10:00:00Z",
    seed,
    partyLevel: 3,
    danger: "Опасная",
    size: "Среднее",
    purposeRoll: null,
    ...floorFields(plans),
    statuses: {},
  };
}

/** Все ключи статусов и заметок подземелья: отметки плюс комнаты. */
function allKeys(dungeon: DungeonRecord): string[] {
  return floorsOf(dungeon).flatMap((plan) => [
    ...plan.markers.map((m) => m.id),
    ...plan.rooms.map((r) => roomKey(r.number, planFloor(plan))),
  ]);
}

describe("этажи подземелья", () => {
  it("этажей от одного до трёх, и число этажей считается по записи", () => {
    expect(MAX_FLOORS).toBe(3);
    for (const count of [1, 2, 3]) {
      const plans = floors(20261018, count);
      expect(plans).toHaveLength(count);
      const dungeon = record(plans);
      expect(floorCount(dungeon)).toBe(count);
      expect(recipeOf(dungeon).floors).toBe(count);
      // Первый этаж лежит в `plan`, остальные — в `lowerFloors`.
      expect(dungeon.plan).toEqual(plans[0]);
      expect(dungeon.lowerFloors).toEqual(plans.slice(1));
    }
  });

  it("то же семя даёт те же этажи, а этажи одного подземелья различаются", () => {
    for (const seed of SEEDS) {
      expect(floors(seed, 3)).toEqual(floors(seed, 3));
      const [first, second, third] = floors(seed, 3);
      // Сравниваются комнаты: отличаться обязана САМА схема, а не поле
      // `floor`, которое у этажей разное по определению.
      expect(second.rooms, `семя ${seed}`).not.toEqual(first.rooms);
      expect(third.rooms, `семя ${seed}`).not.toEqual(second.rooms);
      expect(third.rooms, `семя ${seed}`).not.toEqual(first.rooms);
    }
  });

  it("второй этаж не оказывается первым этажом соседнего семени", () => {
    // Прибавление номера к семени дало бы ровно это: этаж 2 подземелья 100
    // был бы этажом 1 подземелья 102. Смешивание (`floorSeed`) разводит их.
    for (const seed of SEEDS) {
      for (const floor of [2, 3]) {
        expect(floorSeed(seed, floor), `семя ${seed}, этаж ${floor}`).not.toBe(seed + floor);
      }
      expect(floorSeed(seed, 1)).toBe(seed);
    }
    const seeds = new Set(SEEDS.flatMap((seed) => [2, 3].map((f) => floorSeed(seed, f))));
    expect(seeds.size).toBe(SEEDS.length * 2);
  });

  it("на этажах N и N+1 есть парные лестницы, обе в комнатах", () => {
    for (const seed of SEEDS) {
      const plans = floors(seed, 3);
      const stairsOf = (plan: DungeonPlan) => plan.markers.filter((m) => m.kind === "stairs");
      // Верхний: только вниз. Средний: и вверх, и вниз. Нижний: только вверх.
      expect(stairsOf(plans[0]).map((m) => m.stairs), `семя ${seed}`).toEqual(["down"]);
      expect(stairsOf(plans[1]).map((m) => m.stairs), `семя ${seed}`).toEqual(["up", "down"]);
      expect(stairsOf(plans[2]).map((m) => m.stairs), `семя ${seed}`).toEqual(["up"]);
      for (const plan of plans) {
        for (const m of stairsOf(plan)) {
          expect(roomNumberAt(plan, m.x, m.y), `семя ${seed}, ${m.id}`).not.toBeNull();
          // Лестница не садится на чужую отметку.
          expect(plan.markers.filter((o) => o.x === m.x && o.y === m.y)).toHaveLength(1);
          expect(stairsTarget(plan, m)).toBe(planFloor(plan) + (m.stairs === "up" ? -1 : 1));
        }
      }
    }
  });

  it("у одноэтажного подземелья лестницы нет вовсе", () => {
    for (const seed of SEEDS) {
      const [only] = floors(seed, 1);
      expect(only.markers.some((m) => m.kind === "stairs"), `семя ${seed}`).toBe(false);
      expect(only.floor).toBeUndefined();
      // И это ровно та схема, которую генератор отдавал до этажей.
      expect(only).toEqual(generateDungeon(params(seed)));
    }
  });

  it("лестница подписана направлением, а вид её называется «Лестница»", () => {
    const [top, middle] = floors(20261018, 2);
    const down = top.markers.find((m) => m.kind === "stairs")!;
    const up = middle.markers.find((m) => m.kind === "stairs")!;
    expect(markerLabel(down)).toBe("Лестница вниз");
    expect(markerLabel(up)).toBe("Лестница вверх");
    expect(floorLabel(2)).toBe("Этаж 2");
    // У отметки другого вида направления нет, и `stairsTarget` молчит.
    const door = top.markers.find((m) => m.kind === "door")!;
    expect(stairsTarget(top, door)).toBeNull();
  });
});

describe("ключи этажей", () => {
  it("приставка у нижних этажей, у первого — пустая", () => {
    expect(floorPrefix(1)).toBe("");
    expect(floorPrefix(2)).toBe("f2-");
    expect(floorPrefix(3)).toBe("f3-");
    expect(roomKey(3, 1)).toBe("room-3");
    expect(roomKey(3, 2)).toBe("f2-room-3");
  });

  it("ключи уникальны по всему подземелью, а у первого этажа — те же, что у одноэтажного", () => {
    for (const seed of SEEDS) {
      const dungeon = record(floors(seed, 3), seed);
      const keys = allKeys(dungeon);
      expect(new Set(keys).size, `семя ${seed}`).toBe(keys.length);

      // Одноэтажная схема того же семени — отдельным вызовом, без этажей:
      // `id` её отметок обязаны совпасть с `id` первого этажа, иначе
      // сохранённые статусы старых подземелий перестали бы находиться.
      const alone = generateDungeon(params(seed));
      const ids = (plan: DungeonPlan) => plan.markers.filter((m) => m.kind !== "stairs").map((m) => m.id);
      expect(ids(dungeon.plan), `семя ${seed}`).toEqual(ids(alone));
      // Приставки нет ни у одной отметки первого этажа. Проверяется образцом
      // `f<число>-`, а не `startsWith("f")`: с «f» начинается и `feature-1`.
      expect(dungeon.plan.markers.every((m) => !/^f\d+-/.test(m.id))).toBe(true);

      // У нижних — приставка их этажа, у каждой отметки и каждой комнаты.
      floorsOf(dungeon).slice(1).forEach((plan, i) => {
        const prefix = `f${i + 2}-`;
        for (const m of plan.markers) expect(m.id.startsWith(prefix), m.id).toBe(true);
        for (const r of plan.rooms) {
          expect(roomKey(r.number, planFloor(plan))).toBe(`${prefix}room-${r.number}`);
        }
      });
    }
  });

  it("статус и заметка нижнего этажа не трогают одноимённую комнату первого", () => {
    const dungeon = record(floors(20261018, 2));
    const marked = withNote(withMarkerAdvanced(dungeon, roomKey(3, 2)), roomKey(3, 2), "Завал");
    expect(roomStatusOf(marked, 3, 2)).toBe("discovered");
    expect(roomStatusOf(marked, 3, 1)).toBe("unexplored");
    expect(noteOf(marked, roomKey(3, 2))).toBe("Завал");
    expect(noteOf(marked, roomKey(3, 1))).toBe("");
  });
});

describe("одноэтажная запись, созданная до этажей", () => {
  /** Запись БЕЗ поля `lowerFloors` — ровно такая лежит в старых кампаниях. */
  function old(): DungeonRecord {
    const plan = generateDungeon(params(20261018));
    const trap = plan.markers.find((m) => m.kind === "trap")!;
    const made = record([plan]);
    delete made.lowerFloors;
    return {
      ...made,
      statuses: { [trap.id]: "explored", "room-2": "discovered" },
      notes: { "room-2": "Рычаг за гобеленом" },
    };
  }

  it("читается одноэтажной, со статусами и заметками на месте", () => {
    const dungeon = old();
    expect(dungeon.lowerFloors).toBeUndefined();
    expect(floorCount(dungeon)).toBe(1);
    expect(floorsOf(dungeon)).toEqual([dungeon.plan]);
    expect(floorPlan(dungeon, 1)).toBe(dungeon.plan);
    // Номер этажа вне подземелья отдаёт первый, а не падает и не рисует пусто.
    expect(floorPlan(dungeon, 2)).toBe(dungeon.plan);
    expect(planFloor(dungeon.plan)).toBe(1);

    const trap = dungeon.plan.markers.find((m) => m.kind === "trap")!;
    expect(markerStatusOf(dungeon, trap.id)).toBe("explored");
    expect(roomStatusOf(dungeon, 2, 1)).toBe("discovered");
    expect(noteOf(dungeon, roomKey(2, 1))).toBe("Рычаг за гобеленом");
  });

  it("ручная ловушка ложится на первый этаж и убирается с него", () => {
    const dungeon = old();
    const [x, y] = freeFloorCells(dungeon.plan)[0];
    const placed = withTrapPlaced(dungeon, readyTrapPick("Отравленная игла"), x, y, 1)!;
    const mine = placed.plan.markers.filter(isMasterPlaced);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toMatch(/^trap-\d+$/);
    expect(withMarkerRemoved(placed, mine[0].id).plan.markers.filter(isMasterPlaced)).toEqual([]);
  });
});

describe("правка многоэтажного подземелья", () => {
  it("ручная ловушка ставится на названный этаж и убирается с него", () => {
    const dungeon = record(floors(20261018, 3));
    const [x, y] = freeFloorCells(floorPlan(dungeon, 2))[0];
    const placed = withTrapPlaced(dungeon, readyTrapPick("Отравленная игла"), x, y, 2)!;
    // Легла НА ВТОРОЙ: первый и третий не тронуты вовсе.
    expect(floorPlan(placed, 1).markers.filter(isMasterPlaced)).toEqual([]);
    expect(floorPlan(placed, 3).markers.filter(isMasterPlaced)).toEqual([]);
    const mine = floorPlan(placed, 2).markers.filter(isMasterPlaced);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toMatch(/^f2-trap-\d+$/);

    // Убирается по `id`, без указания этажа: этаж находится сам.
    const removed = withMarkerRemoved(placed, mine[0].id);
    expect(floorPlan(removed, 2).markers.filter(isMasterPlaced)).toEqual([]);
    expect(floorCount(removed)).toBe(3);
  });

  it("перечень потерь считает ручные ловушки всех этажей", () => {
    let dungeon = record(floors(20261018, 3));
    expect(rebuildLosses(dungeon)).toEqual([]);
    for (const floor of [1, 2, 3]) {
      const [x, y] = freeFloorCells(floorPlan(dungeon, floor))[0];
      dungeon = withTrapPlaced(dungeon, readyTrapPick("Отравленная игла"), x, y, floor)!;
    }
    expect(rebuildLosses(dungeon)).toEqual(["ловушек, поставленных руками: 3"]);
  });

  it("«Пересобрать» пересобирает все этажи и не меняет их число", () => {
    const before = record(floors(20261018, 3));
    const after = withDungeonRebuilt(before, 777, numbers, bestiary);
    expect(floorCount(after)).toBe(3);
    expect(after.seed).toBe(777);
    expect(after.lowerFloors).toEqual(floors(777, 3).slice(1));
    floorsOf(after).forEach((plan, i) => {
      expect(plan.rooms, `этаж ${i + 1}`).not.toEqual(floorsOf(before)[i].rooms);
      expect(planFloor(plan)).toBe(i + 1);
    });
  });

  it("правка этажа кладётся на его место, а чужой номер оставляет запись как была", () => {
    const dungeon = record(floors(20261018, 2));
    const empty: DungeonPlan = { ...floorPlan(dungeon, 2), markers: [] };
    const changed = withFloorPlan(dungeon, 2, empty);
    expect(changed.lowerFloors![0].markers).toEqual([]);
    expect(changed.plan).toEqual(dungeon.plan);
    expect(withFloorPlan(dungeon, 5, empty)).toBe(dungeon);
  });
});
