import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { DungeonRecord, RuleTopic } from "../../state/types";
import { generateDungeon, type DungeonPlan } from "./dungeonGenerator";
import { markerStatusOf } from "./markerStatus";
import { builtTrap } from "./readyTraps";
import { readTrapNumbers } from "./trapNumbers";
import {
  cellPlace,
  floorCells,
  freeFloorCells,
  isFreeFloorCell,
  isMasterPlaced,
  nextTrapMarkerId,
  withMarkerRemoved,
  withTrapPlaced,
} from "./trapPlacement";

/**
 * Правила постановки ловушки проверяются на НАСТОЯЩЕЙ схеме из генератора, а
 * не на выдуманной руками сетке: «свободная клетка пола» — это то, что рисует
 * схема, и проба, кормящая себя своей же сеткой, сдвиг в генераторе не поймала
 * бы (см. `self_referential_test_never_reddens`).
 */
const numbers = readTrapNumbers(bundledRules as RuleTopic[])!;

function dungeon(seed: number, partyLevel = 3): DungeonRecord {
  const plan = generateDungeon({
    seed,
    partyLevel,
    danger: "Опасная",
    numbers,
    bestiary: bundledBestiary,
  });
  return {
    id: "d1",
    name: "Проба",
    createdAt: "2026-10-18T00:00:00Z",
    seed,
    partyLevel,
    danger: "Опасная",
    plan,
    statuses: {},
  };
}

/**
 * Ловушка со своими числами: собрана из слоёв на 17 уровне, а не на уровне
 * схемы. Готовая здесь не годится — у неё ни уровня, ни опасности нет.
 */
const ownTrap = () => {
  const plan = generateDungeon({
    seed: 777,
    partyLevel: 17,
    danger: "Смертоносная",
    numbers,
    bestiary: bundledBestiary,
  });
  for (const marker of plan.markers) {
    const built = builtTrap(marker.trap);
    if (built) return built;
  }
  throw new Error("в схеме семени 777 нет ни одной собранной из слоёв ловушки");
};

const stone = (plan: DungeonPlan): [number, number] => {
  const floor = new Set(floorCells(plan).map(([x, y]) => `${x},${y}`));
  for (let y = 0; y < plan.height; y += 1) {
    for (let x = 0; x < plan.width; x += 1) if (!floor.has(`${x},${y}`)) return [x, y];
  }
  throw new Error("в схеме нет ни одной клетки камня");
};

describe("постановка ловушки в подземелье", () => {
  it("пол — это комнаты и проходы, и только свободные его клетки годятся", () => {
    const d = dungeon(20261018);
    const cells = floorCells(d.plan);
    const roomCells = d.plan.rooms.reduce((sum, r) => sum + r.w * r.h, 0);
    expect(cells.length).toBe(roomCells + d.plan.corridors.length);

    // Камень не пол.
    const [sx, sy] = stone(d.plan);
    expect(isFreeFloorCell(d.plan, sx, sy)).toBe(false);
    expect(withTrapPlaced(d, ownTrap(), sx, sy)).toBeNull();

    // Клетка под чужой отметкой — пол, но занята.
    const taken = d.plan.markers[0];
    expect(cells.some(([x, y]) => x === taken.x && y === taken.y)).toBe(true);
    expect(isFreeFloorCell(d.plan, taken.x, taken.y)).toBe(false);
    expect(withTrapPlaced(d, ownTrap(), taken.x, taken.y)).toBeNull();

    // Свободных клеток ровно столько, сколько пола без отметок. Вычитаются
    // только отметки, стоящие НА полу: потайной ход генератор ставит в камень
    // между комнатами, и эта клетка полом не была изначально.
    const floor = new Set(cells.map(([x, y]) => `${x},${y}`));
    const onFloor = d.plan.markers.filter((m) => floor.has(`${m.x},${m.y}`)).length;
    expect(onFloor).toBeLessThan(d.plan.markers.length);
    expect(freeFloorCells(d.plan)).toHaveLength(cells.length - onFloor);
    expect(freeFloorCells(d.plan).every(([x, y]) => isFreeFloorCell(d.plan, x, y))).toBe(true);
  });

  it("ловушка встаёт на свободную клетку со своими числами и новым id", () => {
    const d = dungeon(4242);
    const trap = ownTrap();
    expect(trap.partyLevel).toBe(17);
    const [x, y] = freeFloorCells(d.plan)[0];

    const after = withTrapPlaced(d, trap, x, y)!;
    const placed = after.plan.markers[after.plan.markers.length - 1];
    expect(placed.kind).toBe("trap");
    expect([placed.x, placed.y]).toEqual([x, y]);
    // Числа — те, с которыми ловушку собрали, а не уровень и опасность схемы.
    expect(placed.trap).toBe(trap);
    expect([after.partyLevel, after.danger]).toEqual([3, "Опасная"]);
    expect([builtTrap(placed.trap)!.partyLevel, builtTrap(placed.trap)!.danger]).toEqual([
      17,
      "Смертоносная",
    ]);
    // Новый id не совпал ни с одним прежним, и статус у отметки — начальный.
    expect(d.plan.markers.map((m) => m.id)).not.toContain(placed.id);
    expect(placed.id).toMatch(/^trap-\d+$/);
    expect(markerStatusOf(after, placed.id)).toBe("unexplored");
    expect(isMasterPlaced(placed)).toBe(true);
    // Генераторные отметки не тронуты — ни одна не стала ручной.
    expect(after.plan.markers.filter(isMasterPlaced)).toHaveLength(1);
    expect(after.plan.markers.slice(0, -1)).toEqual(d.plan.markers);
  });

  it("id не садится на номер убранной ловушки вместе с её статусом", () => {
    const d = dungeon(77);
    const trap = ownTrap();
    const [x1, y1] = freeFloorCells(d.plan)[0];
    const first = withTrapPlaced(d, trap, x1, y1)!;
    const mine = first.plan.markers[first.plan.markers.length - 1];
    const marked = { ...first, statuses: { ...first.statuses, [mine.id]: "explored" as const } };

    const removed = withMarkerRemoved(marked, mine.id);
    expect(removed.plan.markers.map((m) => m.id)).not.toContain(mine.id);
    // Статус ушёл вместе с отметкой: иначе следующая ловушка на том же номере
    // родилась бы «исследованной».
    expect(removed.statuses[mine.id]).toBeUndefined();

    const again = withTrapPlaced(removed, trap, x1, y1)!;
    const second = again.plan.markers[again.plan.markers.length - 1];
    expect(markerStatusOf(again, second.id)).toBe("unexplored");

    // Номер считается по всем отметкам схемы, а не по числу ловушек: две
    // ручные подряд не получают один id.
    const [x2, y2] = freeFloorCells(again.plan)[0];
    const third = withTrapPlaced(again, trap, x2, y2)!;
    const ids = third.plan.markers.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(nextTrapMarkerId(third.plan));
  });

  it("генераторную отметку убрать нельзя", () => {
    const d = dungeon(555);
    const made = d.plan.markers[0];
    expect(isMasterPlaced(made)).toBe(false);
    expect(withMarkerRemoved(d, made.id)).toBe(d);
    expect(withMarkerRemoved(d, "trap-999")).toBe(d);
  });

  it("место клетки подписано комнатой или проходом", () => {
    const d = dungeon(31337);
    const room = d.plan.rooms[0];
    expect(cellPlace(d.plan, room.x, room.y)).toBe(`комната ${room.number}`);
    const corridor = d.plan.corridors[0];
    expect(cellPlace(d.plan, corridor[0], corridor[1])).toBe("проход");
  });
});
