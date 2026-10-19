import type { DungeonRecord } from "../../state/types";
import type { DungeonMarker, DungeonPlan } from "./dungeonGenerator";
import type { PlacedTrap } from "./readyTraps";

/**
 * Ловушка из генератора, поставленная мастером в подземелье.
 *
 * Здесь живут ВСЕ правила постановки: какая клетка годится, какой `id` получит
 * новая отметка, что считается поставленным руками и что уносит с собой
 * удаление. Показ (`DungeonsPage`, `DungeonMap`) эти правила только зовёт и ни
 * одного из них не повторяет: иначе у «свободной клетки пола» оказалось бы два
 * владельца — схема и экран, — и клетка под чужой отметкой кликалась бы на
 * одной из них.
 *
 * Схему эти функции не пересобирают и семени не знают: мастер дописывает в
 * план отметку, а всё, что сделал генератор, остаётся как есть.
 */

const key = (x: number, y: number) => `${x},${y}`;

/** Номер комнаты с клеткой (x, y) или `null`, если клетка не в комнате. */
export function roomNumberAt(plan: DungeonPlan, x: number, y: number): number | null {
  const room = plan.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  return room ? room.number : null;
}

/** Все клетки пола: комнаты и проходы между ними. */
export function floorCells(plan: DungeonPlan): [number, number][] {
  const cells = new Map<string, [number, number]>();
  for (const room of plan.rooms) {
    for (let y = room.y; y < room.y + room.h; y += 1) {
      for (let x = room.x; x < room.x + room.w; x += 1) cells.set(key(x, y), [x, y]);
    }
  }
  for (const [x, y] of plan.corridors) cells.set(key(x, y), [x, y]);
  return [...cells.values()];
}

/** Отметка, занимающая клетку, или `null`. */
export function markerAt(plan: DungeonPlan, x: number, y: number): DungeonMarker | null {
  return plan.markers.find((m) => m.x === x && m.y === y) ?? null;
}

/** Пол, не занятый ни одной отметкой: только сюда можно ставить ловушку. */
export function freeFloorCells(plan: DungeonPlan): [number, number][] {
  const taken = new Set(plan.markers.map((m) => key(m.x, m.y)));
  return floorCells(plan).filter(([x, y]) => !taken.has(key(x, y)));
}

export function isFreeFloorCell(plan: DungeonPlan, x: number, y: number): boolean {
  if (markerAt(plan, x, y)) return false;
  if (roomNumberAt(plan, x, y) !== null) return true;
  return plan.corridors.some(([cx, cy]) => cx === x && cy === y);
}

/** «комната 3» или «проход» — чем подписать выбранную клетку. */
export function cellPlace(plan: DungeonPlan, x: number, y: number): string {
  const room = roomNumberAt(plan, x, y);
  return room === null ? "проход" : `комната ${room}`;
}

/**
 * `id` для новой ловушки: `trap-<следующий номер>`, не совпадающий НИ С ОДНИМ
 * существующим. По `id` хранится статус отметки, поэтому номер не считается от
 * числа ловушек (убери одну — и следующая села бы на занятый номер), а
 * проверяется по всем отметкам схемы.
 */
export function nextTrapMarkerId(plan: DungeonPlan): string {
  const used = new Set(plan.markers.map((m) => m.id));
  for (let n = plan.markers.filter((m) => m.kind === "trap").length + 1; ; n += 1) {
    const id = `trap-${n}`;
    if (!used.has(id)) return id;
  }
}

/** Отметка поставлена мастером руками, а не генератором схемы. */
export function isMasterPlaced(marker: DungeonMarker): boolean {
  return marker.placedByMaster === true;
}

/**
 * Подземелье с поставленной ловушкой. Клетка не свободна или не пол — `null`,
 * и вызывающий оставляет запись как была: показ не обязан знать, почему клетка
 * не годится, но и поставить ловушку в стену не вправе.
 *
 * Числа ловушки — те, с которыми её собрали: уровень отряда и опасность едут
 * внутри самой `Trap`, и уровень подземелья их не перебивает. У готовой числа
 * свои, из справочника, и перебивать их нечем вовсе. Статус новой
 * отметки отдельной записью не ставится — отметка без записи и значит «не
 * исследовано» (`markerStatusOf`), а второй владелец этого умолчания не нужен.
 */
export function withTrapPlaced(
  dungeon: DungeonRecord,
  trap: PlacedTrap,
  x: number,
  y: number,
): DungeonRecord | null {
  if (!isFreeFloorCell(dungeon.plan, x, y)) return null;
  const marker: DungeonMarker = {
    id: nextTrapMarkerId(dungeon.plan),
    kind: "trap",
    x,
    y,
    line: null,
    trap,
    connects: null,
    placedByMaster: true,
  };
  return { ...dungeon, plan: { ...dungeon.plan, markers: [...dungeon.plan.markers, marker] } };
}

/**
 * Подземелье без отметки, поставленной руками. Генераторную не убирает:
 * схема — то, что выпало по таблицам, и выборочно её чистить мастеру незачем.
 *
 * Вместе с отметкой уходит и её статус: `id` освобождается, следующая ручная
 * ловушка может его занять, и «исследовано» от снесённой отметки ей не
 * достаётся.
 */
export function withMarkerRemoved(dungeon: DungeonRecord, markerId: string): DungeonRecord {
  const marker = dungeon.plan.markers.find((m) => m.id === markerId);
  if (!marker || !isMasterPlaced(marker)) return dungeon;
  const statuses = { ...dungeon.statuses };
  delete statuses[markerId];
  return {
    ...dungeon,
    plan: { ...dungeon.plan, markers: dungeon.plan.markers.filter((m) => m.id !== markerId) },
    statuses,
  };
}
