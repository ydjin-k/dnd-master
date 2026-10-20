import type { DungeonRecord } from "../../state/types";
import type { DungeonMarker, DungeonPlan } from "./dungeonGenerator";

/**
 * Этажи подземелья: от одного до трёх, каждый — своя схема, связанные
 * лестницей.
 *
 * Здесь живут ВСЕ правила этажа: сколько их бывает, где лежит каждый, какое
 * семя у нижнего, какой приставкой отличаются его ключи и куда ведёт лестница.
 * Генератор схемы, статусы, заметки и экран эти правила только зовут: иначе у
 * приставки ключа оказалось бы два владельца — схема и запись кампании, — и
 * статус отметки нижнего этажа читался бы с одной стороны как `f2-trap-1`, а с
 * другой как `trap-1`, то есть молча терялся при каждой загрузке.
 *
 * ФОРМА ЗАПИСИ: первый этаж лежит в `plan`, нижние — списком в `lowerFloors`.
 * Выбрано так, а не миграцией при чтении, ровно по одной причине: подземелье,
 * записанное до этажей, И ЕСТЬ одноэтажное — `plan` у него на месте,
 * `lowerFloors` нет, и читается оно без единой правки файла. Миграция же
 * обязана была бы переписать чужую запись, чтобы показать её без изменений.
 */

/** Этажей у подземелья — от одного до трёх (решение владельца 18.10.2026). */
export const FLOOR_COUNTS = [1, 2, 3] as const;
export type FloorCount = (typeof FLOOR_COUNTS)[number];

export const MAX_FLOORS = FLOOR_COUNTS[FLOOR_COUNTS.length - 1];

/** Число этажей на форме создания по умолчанию — один, как было до этажей. */
export const DEFAULT_FLOOR_COUNT: FloorCount = 1;

/**
 * Номер этажа этой схемы. Поля нет вовсе у первого этажа и у всех схем,
 * записанных до этажей, — и то и другое значит «первый».
 */
export function planFloor(plan: DungeonPlan): number {
  return plan.floor ?? 1;
}

/**
 * Приставка ключей статусов и заметок этажа: у первого пустая, у нижних
 * `f2-`, `f3-`.
 *
 * Пустая у первого — не красота, а требование: иначе сохранённые статусы и
 * заметки ВСЕХ подземелий, созданных до этажей, перестали бы находиться по
 * своим ключам, то есть пройденное подземелье открылось бы непройденным.
 */
export function floorPrefix(floor: number): string {
  return floor <= 1 ? "" : `f${floor}-`;
}

/** Подпись этажа — на вкладке переключателя и в заголовке листа PNG. */
export function floorLabel(floor: number): string {
  return `Этаж ${floor}`;
}

/**
 * Семя этажа, выведенное из общего семени подземелья.
 *
 * У первого этажа оно РАВНО общему: схема первого этажа семени 20261018 обязана
 * совпасть с одноэтажной схемой того же семени, иначе мастер, вписавший семя,
 * получил бы не то подземелье, которое повторял.
 *
 * У нижних номер этажа не прибавляется, а смешивается (splitmix32): `seed + 2`
 * — это семя соседнего подземелья, и прибавлением второй этаж одного оказался
 * бы первым этажом другого. Смешивание разводит и соседние семена: у
 * подземелий 100 и 101 вторые этажи не похожи.
 */
export function floorSeed(seed: number, floor: number): number {
  if (floor <= 1) return seed >>> 0;
  let h = (seed + Math.imul(floor, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Все этажи записи, сверху вниз. У подземелья без `lowerFloors` — один этаж,
 * и это же читает запись, созданная до этажей.
 */
export function floorsOf(dungeon: DungeonRecord): DungeonPlan[] {
  return [dungeon.plan, ...(dungeon.lowerFloors ?? [])];
}

/** Сколько этажей у подземелья: считается по записи, отдельного числа нет. */
export function floorCount(dungeon: DungeonRecord): number {
  return floorsOf(dungeon).length;
}

/**
 * Схема этажа по номеру (считая с единицы). Номер вне подземелья — первый
 * этаж: открытый этаж живёт в состоянии экрана и обязан пережить смену
 * записи, у которой этажей стало меньше.
 */
export function floorPlan(dungeon: DungeonRecord, floor: number): DungeonPlan {
  return floorsOf(dungeon)[floor - 1] ?? dungeon.plan;
}

/**
 * Поля записи, хранящие этажи. Первый кладётся в `plan`, остальные — в
 * `lowerFloors`; у одноэтажного список пустой, а не отсутствует: пустой
 * список и отсутствие поля читаются одинаково (`floorsOf`), и выбирать между
 * ними при записи незачем.
 */
export function floorFields(
  plans: readonly DungeonPlan[],
): Pick<DungeonRecord, "plan" | "lowerFloors"> {
  return { plan: plans[0], lowerFloors: plans.slice(1) };
}

/**
 * Запись, у которой схема этого этажа заменена на новую. Номер вне подземелья
 * оставляет запись как была: лучше не записать правку, чем приписать её
 * чужому этажу.
 *
 * Живёт здесь, у формы записи: иначе каждый, кто правит схему (постановка
 * ловушки, удаление отметки, пересборка), помнил бы сам, что первый этаж
 * лежит в `plan`, а нижние — в `lowerFloors`, и один из них однажды забыл бы.
 */
export function withFloorPlan(
  dungeon: DungeonRecord,
  floor: number,
  plan: DungeonPlan,
): DungeonRecord {
  const plans = floorsOf(dungeon);
  if (floor < 1 || floor > plans.length) return dungeon;
  plans[floor - 1] = plan;
  return { ...dungeon, ...floorFields(plans) };
}

/** Этаж, на котором стоит отметка с этим `id`, или `null`, если такой нет. */
export function floorOfMarker(dungeon: DungeonRecord, markerId: string): number | null {
  const at = floorsOf(dungeon).findIndex((plan) =>
    plan.markers.some((m) => m.id === markerId),
  );
  return at === -1 ? null : at + 1;
}

/** Этаж, на который ведёт эта лестница; у отметки другого вида — `null`. */
export function stairsTarget(plan: DungeonPlan, marker: DungeonMarker): number | null {
  if (marker.kind !== "stairs") return null;
  return planFloor(plan) + (marker.stairs === "up" ? -1 : 1);
}
