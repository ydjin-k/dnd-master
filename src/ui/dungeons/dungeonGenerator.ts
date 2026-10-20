import { rowForRoll, type EventTable, type EventTableRow } from "../eventTables";
import { findDungeonTable } from "../eventTables/dungeonTables";
import {
  dwellersForTier,
  rowFitsTier,
  tierForLevel,
  type DwellerSource,
} from "./dungeonDwellers";
import { floorPrefix, floorSeed } from "./dungeonFloors";
import { rollLootContents, type LootContents } from "./dungeonLoot";
import {
  readyTrapPick,
  readyTrapsForLevel,
  type PlacedTrap,
} from "./readyTraps";
import { seededDice, type SeededDice } from "./seededRandom";
import {
  buildTrap,
  TRAP_LAYER_TABLE_IDS,
  trapLayerTable,
  type Trap,
  type TrapLayerId,
} from "./trapBuilder";
import { rangeRollExpression, type TrapDanger, type TrapNumbers } from "./trapNumbers";

/**
 * Генератор схемы подземелья: комнаты и проходы на сетке, отметки пяти видов.
 *
 * Всё содержимое — броски по таблицам `dungeonTables.ts` (свои таблицы
 * студии) и, для ловушек, сборка `buildTrap` с числами SRD. Чистая функция
 * семени и параметров: одно и то же семя даёт ту же схему, поэтому её можно
 * пересобрать и проверить пробой. Статусов отметок здесь нет — ими владеет
 * мастер, они живут в записи кампании рядом со схемой.
 */

/**
 * Виды отметок. «Лестница» стоит ПОСЛЕДНЕЙ нарочно: первым видом перечня
 * легенда листа объясняет статус (`legendRows`), и лестница, встав первой,
 * объясняла бы его значком, которого у одноэтажного подземелья нет вовсе.
 */
export const MARKER_KINDS = ["trap", "secret", "door", "loot", "feature", "stairs"] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];

export const MARKER_KIND_LABELS: Record<MarkerKind, string> = {
  trap: "Ловушка",
  secret: "Потайной ход",
  door: "Дверь",
  loot: "Лут",
  feature: "Точка интереса",
  stairs: "Лестница",
};

/** Куда ведёт лестница: вниз, на этаж под ней, или вверх, на этаж над ней. */
export const STAIRS_DIRECTIONS = ["down", "up"] as const;
export type StairsDirection = (typeof STAIRS_DIRECTIONS)[number];

/**
 * Подписи лестницы — своей короткой строкой в коде, а не строкой таблицы:
 * таблицы подземелья эта карточка не трогает (решение владельца), и лестница
 * ничего не бросает.
 */
export const STAIRS_LABELS: Record<StairsDirection, string> = {
  down: "Лестница вниз",
  up: "Лестница вверх",
};

/**
 * Подпись отметки: у лестницы со направлением, у остальных — вид. Нужна и
 * схеме (`aria-label` значка), и описанию отметки, поэтому живёт здесь, у
 * видов отметок, а не в каждом из них по копии.
 */
export function markerLabel(marker: DungeonMarker): string {
  if (marker.kind === "stairs" && marker.stairs) return STAIRS_LABELS[marker.stairs];
  return MARKER_KIND_LABELS[marker.kind];
}

/** Выпавшая строка таблицы: число и текст. */
export interface RolledLine {
  readonly roll: number;
  readonly text: string;
}

export interface DungeonDwellers extends RolledLine {
  readonly monsters: readonly { readonly id: string; readonly name: string }[];
}

export interface DungeonRoom {
  readonly number: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly kind: RolledLine;
  readonly dwellers: DungeonDwellers | null;
}

export interface DungeonMarker {
  /** Постоянный в пределах схемы: по нему запись кампании хранит статус. */
  readonly id: string;
  readonly kind: MarkerKind;
  readonly x: number;
  readonly y: number;
  /** Строка таблицы — у всех, кроме ловушки. */
  readonly line: RolledLine | null;
  /**
   * Ловушка отметки: собранная из пяти слоёв или готовая из справочника
   * (`readyTraps.ts` — там же и признак, которым они различаются). У отметок
   * других видов — `null`.
   */
  readonly trap: PlacedTrap | null;
  /** Номера комнат, которые соединяет потайной ход. */
  readonly connects: readonly [number, number] | null;
  /**
   * Куда ведёт лестница. Есть только у отметок вида `stairs`; на какой этаж
   * она выходит, считает `stairsTarget` из `dungeonFloors.ts` по номеру этажа
   * схемы — второго, записанного, номера у лестницы нет нарочно, иначе он
   * расходился бы с этажом, на котором лестница стоит.
   */
  readonly stairs?: StairsDirection;
  /**
   * Содержимое находки: монеты с драгоценностями или магический предмет одной
   * редкости (`dungeonLoot.ts` — там же вилки сумм и доли по ступеням).
   * Строка таблицы (`line`) остаётся описанием того, где находка лежит.
   *
   * Поля нет вовсе у отметок других видов и у подземелий, записанных до
   * содержимого: такая находка показывается строкой таблицы, как раньше.
   */
  readonly contents?: LootContents;
  /**
   * Отметку поставил мастер руками (ловушка из генератора ловушек), а не
   * генератор схемы. Генератор поля не пишет вовсе, поэтому «поля нет» и
   * значит «это выпало по таблицам»; убрать со схемы можно только ручную
   * (`trapPlacement.ts` — там же и правила постановки).
   */
  readonly placedByMaster?: boolean;
}

export interface DungeonPlan {
  readonly seed: number;
  readonly partyLevel: number;
  readonly danger: TrapDanger;
  readonly width: number;
  readonly height: number;
  /**
   * Номер этажа этой схемы. Поля нет вовсе у первого этажа — и у всех схем,
   * записанных до этажей: читать его надо через `planFloor` из
   * `dungeonFloors.ts`, он и подставляет единицу. Приставка ключей отметок и
   * комнат выводится отсюда же, поэтому схема всегда знает, под какими ключами
   * лежат её статусы, и передавать номер этажа рядом с ней не нужно.
   */
  readonly floor?: number;
  /**
   * Назначение и вход — только у ПЕРВОГО этажа: назначение одно на всё
   * подземелье, а вход у нижних этажей — лестница сверху (решение карточки).
   * У нижних этажей полей нет вовсе, и бросков на них не делается.
   */
  readonly purpose?: RolledLine;
  readonly entrance?: RolledLine;
  /** Первая комната — та, куда ведёт вход. */
  readonly rooms: readonly DungeonRoom[];
  /** Клетки проходов вне комнат. */
  readonly corridors: readonly (readonly [number, number])[];
  /** Пунктир потайного хода: от клетки одной комнаты до клетки другой. */
  readonly secretPath: readonly [readonly [number, number], readonly [number, number]];
  readonly markers: readonly DungeonMarker[];
}

export interface DungeonParams {
  readonly seed: number;
  readonly partyLevel: number;
  readonly danger: TrapDanger;
  readonly numbers: TrapNumbers;
  readonly bestiary: readonly DwellerSource[];
  /** Размер; поля нет — «Среднее», то есть ровно прежнее поведение. */
  readonly size?: DungeonSize;
  /**
   * Назначение, выбранное мастером: номер броска строки `dungeon-purpose`.
   * `null` или поля нет — назначение бросается, как и раньше.
   */
  readonly purposeRoll?: number | null;
  /**
   * Какой этаж строится (считая с единицы) и сколько этажей у подземелья
   * всего. Поля нет — этаж один, то есть ровно прежнее поведение: ни
   * лестницы, ни приставки у ключей, ни поля `floor` в схеме.
   *
   * Семя здесь — семя ЭТОГО этажа, а не общее: выводит его `floorSeed`, и
   * второго места, где общее семя превращается в этажное, быть не должно.
   */
  readonly floor?: number;
  readonly floorCount?: number;
}

export const DUNGEON_SIZES = ["Малое", "Среднее", "Большое"] as const;
export type DungeonSize = (typeof DUNGEON_SIZES)[number];

/** Размер подземелья — одним набором чисел, чтобы вторых копий не было. */
export interface DungeonShape {
  /** Сколько комнат ставить, пока хватает попыток. */
  readonly rooms: number;
  /** Попыток постановки: на большое поле их нужно больше, чем на малое. */
  readonly tries: number;
  readonly width: number;
  readonly height: number;
  /** Сколько дверей подписывать, остальные проходы остаются без отметки. */
  readonly doors: number;
  /** Ловушек, лута и точек интереса — от и до, КАЖДОГО вида по отдельности. */
  readonly findings: readonly [number, number];
}

/**
 * «Среднее» — ровно прежние числа генератора (8 комнат, 34 × 22, восемь
 * дверей, по 2–3 находки каждого вида). Трогать их нельзя: подземелья,
 * созданные до размеров, пересобираются по семени и обязаны выйти теми же —
 * это держит эталон в `dungeonSize.test.ts`.
 *
 * У малого сетка тоже меньше: пять комнат на поле 34 × 22 стояли бы врозь, и
 * схема вышла бы не малым подземельем, а средним с длинными проходами.
 */
export const DUNGEON_SHAPES: Record<DungeonSize, DungeonShape> = {
  Малое: { rooms: 5, tries: 600, width: 26, height: 18, doors: 5, findings: [1, 2] },
  Среднее: { rooms: 8, tries: 600, width: 34, height: 22, doors: 8, findings: [2, 3] },
  Большое: { rooms: 13, tries: 1400, width: 48, height: 30, doors: 14, findings: [4, 5] },
};

/** Размер подземелий, созданных до появления выбора. */
export const DEFAULT_DUNGEON_SIZE: DungeonSize = "Среднее";

/** Размер из записи кампании; отсутствующий и незнакомый — «Среднее». */
export function dungeonSizeOf(size: string | null | undefined): DungeonSize {
  return DUNGEON_SIZES.find((known) => known === size) ?? DEFAULT_DUNGEON_SIZE;
}

function table(id: string): EventTable {
  const found = findDungeonTable(id);
  if (!found) throw new Error(`Нет таблицы подземелья «${id}»`);
  return found;
}

/**
 * Строка таблицы по номеру броска — БЕЗ кости: её выбрал мастер, а не кубик.
 * Остальные броски от этого не сдвигаются по-другому, чем на один пропущенный:
 * семя одно и то же, просто первого броска назначения в нём больше нет.
 */
function chosenLine(id: string, roll: number): RolledLine {
  const t = table(id);
  const row = rowForRoll(t, roll);
  if (!row) throw new Error(`В таблице «${id}» нет строки ${roll}`);
  return { roll, text: row.text };
}

function rollLine(dice: SeededDice, id: string, accept?: (row: EventTableRow, n: number) => boolean): RolledLine & { row: EventTableRow } {
  const t = table(id);
  // Перебросы конечны: каждая таблица держит строку, которую принимают всегда
  // (у обитателей — «пусто, но обжито»; у комнат строк больше, чем комнат).
  for (;;) {
    const roll = dice.die(t.die);
    const row = rowForRoll(t, roll);
    if (row && (!accept || accept(row, roll))) return { roll, text: row.text, row };
  }
}

interface Rect { x: number; y: number; w: number; h: number }

function placeRooms(dice: SeededDice, shape: DungeonShape): Rect[] {
  const rooms: Rect[] = [];
  for (let tries = 0; rooms.length < shape.rooms && tries < shape.tries; tries += 1) {
    const w = dice.int(4, 8);
    const h = dice.int(3, 6);
    const x = dice.int(1, shape.width - w - 1);
    const y = dice.int(1, shape.height - h - 1);
    // Между комнатами не меньше двух клеток: в зазоре помещаются стены и проход.
    const clash = rooms.some(
      (r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y,
    );
    if (!clash) rooms.push({ x, y, w, h });
  }
  return rooms.sort((a, b) => a.x + a.y / 2 - (b.x + b.y / 2));
}

const centre = (r: Rect): [number, number] => [r.x + (r.w >> 1), r.y + (r.h >> 1)];
const distance = (a: Rect, b: Rect) => {
  const [ax, ay] = centre(a);
  const [bx, by] = centre(b);
  return Math.abs(ax - bx) + Math.abs(ay - by);
};

/** Остов из ближайших соседей (алгоритм Прима) и одна петля сверху. */
function linkRooms(rooms: Rect[]): [number, number][] {
  const edges: [number, number][] = [];
  const linked = new Set([0]);
  while (linked.size < rooms.length) {
    let best: { i: number; j: number; d: number } | null = null;
    for (const i of linked) {
      rooms.forEach((b, j) => {
        if (linked.has(j)) return;
        const d = distance(rooms[i], b);
        if (!best || d < best.d) best = { i, j, d };
      });
    }
    const { i, j } = best!;
    edges.push([i, j]);
    linked.add(j);
  }
  const spare: [number, number, number][] = [];
  rooms.forEach((a, i) =>
    rooms.forEach((b, j) => {
      if (i < j && !hasEdge(edges, i, j)) spare.push([i, j, distance(a, b)]);
    }),
  );
  spare.sort((p, q) => p[2] - q[2]);
  if (spare.length > 0) edges.push([spare[0][0], spare[0][1]]);
  return edges;
}

const hasEdge = (edges: [number, number][], i: number, j: number) =>
  edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i));

function roomAt(rooms: Rect[], x: number, y: number): number {
  return rooms.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** Потайной ход: ближайшая пара комнат, стоящих друг против друга. */
function secretLink(rooms: Rect[], edges: [number, number][]) {
  type Link = { gap: number; from: [number, number]; to: [number, number]; i: number; j: number; linked: boolean };
  let best: Link | null = null;
  rooms.forEach((a, i) =>
    rooms.forEach((b, j) => {
      if (i >= j) return;
      const overlapX = [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w) - 1];
      const overlapY = [Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h) - 1];
      let link: Link | null = null;
      const linked = hasEdge(edges, i, j);
      if (overlapX[0] <= overlapX[1]) {
        const [top, bottom, ti, bi] = a.y < b.y ? [a, b, i, j] : [b, a, j, i];
        const x = (overlapX[0] + overlapX[1]) >> 1;
        link = { gap: bottom.y - (top.y + top.h), from: [x, top.y + top.h - 1], to: [x, bottom.y], i: ti, j: bi, linked };
      } else if (overlapY[0] <= overlapY[1]) {
        const [left, right, li, ri] = a.x < b.x ? [a, b, i, j] : [b, a, j, i];
        const y = (overlapY[0] + overlapY[1]) >> 1;
        link = { gap: right.x - (left.x + left.w), from: [left.x + left.w - 1, y], to: [right.x, y], i: li, j: ri, linked };
      }
      if (!link) return;
      // Ход между комнатами, у которых нет прохода, интереснее короткого.
      const better =
        !best ||
        (best.linked && !link.linked) ||
        (best.linked === link.linked && link.gap < best.gap);
      if (better) best = link;
    }),
  );
  if (best) return best as Link;
  // Ни одна пара не стоит друг против друга — ход идёт от центра к центру.
  const [i, j] = edges[0];
  return { gap: 0, from: centre(rooms[i]), to: centre(rooms[j]), i, j, linked: true };
}

/**
 * Доля готовых ловушек на схеме: одна из трёх. Остальные собираются из пяти
 * слоёв, как и раньше, — готовые разбавляют схему, а не вытесняют сборку.
 */
export const READY_TRAP_SHARE = 1 / 3;

/**
 * Готовая ловушка, годная отряду этого уровня, или `null` — тогда ловушка
 * собирается из слоёв. Уровень решает не схема, а сама ловушка
 * (`ReadyTrap.minPartyLevel`), и порог здесь не повторяется.
 */
function rollReadyTrap(dice: SeededDice, params: DungeonParams): PlacedTrap | null {
  const fit = readyTrapsForLevel(params.numbers.ready, params.partyLevel);
  return fit.length === 0 ? null : readyTrapPick(dice.pick(fit).name);
}

function rollTrap(dice: SeededDice, params: DungeonParams): Trap {
  const layers = {} as Record<TrapLayerId, number>;
  for (const id of TRAP_LAYER_TABLE_IDS) layers[id] = dice.die(trapLayerTable(id).die);
  const { saveDc, attackBonus } = params.numbers.severity[params.danger];
  const sides = (range: typeof saveDc) => Number(rangeRollExpression(range).slice(2));
  return buildTrap(params.numbers, params.partyLevel, params.danger, {
    layers,
    saveDcRoll: dice.die(sides(saveDc)),
    attackRoll: dice.die(sides(attackBonus)),
  });
}

export function generateDungeon(params: DungeonParams): DungeonPlan {
  const dice = seededDice(params.seed);
  const tier = tierForLevel(params.partyLevel);
  const shape = DUNGEON_SHAPES[params.size ?? DEFAULT_DUNGEON_SIZE];
  const floor = params.floor ?? 1;
  const floorCount = params.floorCount ?? 1;
  const prefix = floorPrefix(floor);

  // Назначение и вход бросаются только у первого этажа: у нижних вход —
  // лестница сверху, а назначение одно на всё подземелье. Пропущенные броски
  // нижним этажам не вредят — у них своё семя.
  const purpose =
    floor > 1
      ? null
      : params.purposeRoll == null
        ? rollLine(dice, "dungeon-purpose")
        : chosenLine("dungeon-purpose", params.purposeRoll);
  const entrance = floor > 1 ? null : rollLine(dice, "dungeon-entrance");

  const rects = placeRooms(dice, shape);
  const usedKinds = new Set<number>();
  const rooms: DungeonRoom[] = rects.map((r, index) => {
    const kind = rollLine(dice, "dungeon-room", (_, n) => !usedKinds.has(n));
    usedKinds.add(kind.roll);
    let dwellers: DungeonDwellers | null = null;
    if (index > 0 && dice.chance(0.5)) {
      const line = rollLine(dice, "dungeon-dwellers", (row) => rowFitsTier(row, tier, params.bestiary));
      dwellers = {
        roll: line.roll,
        text: line.text,
        monsters: dwellersForTier(line.row, tier, params.bestiary).map(({ id, name }) => ({ id, name })),
      };
    }
    return { number: index + 1, ...r, kind: { roll: kind.roll, text: kind.text }, dwellers };
  });

  // Проходы: L-образно от центра к центру. Дверь — первая клетка прохода
  // за стеной комнаты, с обеих сторон.
  const corridor = new Map<string, [number, number]>();
  const doorCells: [number, number][] = [];
  const edges = linkRooms(rects);
  for (const [i, j] of edges) {
    let [x, y] = centre(rects[i]);
    const [tx, ty] = centre(rects[j]);
    const path: [number, number][] = [];
    const alongX = () => { while (x !== tx) { x += Math.sign(tx - x); path.push([x, y]); } };
    const alongY = () => { while (y !== ty) { y += Math.sign(ty - y); path.push([x, y]); } };
    if (dice.chance(0.5)) { alongX(); alongY(); } else { alongY(); alongX(); }
    let previousInRoom = true;
    path.forEach(([px, py], k) => {
      const inRoom = roomAt(rects, px, py) !== -1;
      if (!inRoom) {
        if (previousInRoom) doorCells.push([px, py]);
        corridor.set(`${px},${py}`, [px, py]);
      } else if (!previousInRoom) {
        doorCells.push(path[k - 1]);
      }
      previousInRoom = inRoom;
    });
  }

  const taken = new Set<string>();
  const markers: DungeonMarker[] = [];
  const add = (kind: MarkerKind, [x, y]: readonly [number, number], extra: Partial<DungeonMarker>) => {
    taken.add(`${x},${y}`);
    const index = markers.filter((m) => m.kind === kind).length + 1;
    // Приставку этажа даёт `floorPrefix`, и она же стоит у ключей статусов и
    // заметок: `id` отметки и есть этот ключ. У первого этажа приставка пустая,
    // поэтому его отметки носят ровно те `id`, что носили до этажей.
    markers.push({
      id: `${prefix}${kind}-${index}`,
      kind,
      x,
      y,
      line: null,
      trap: null,
      connects: null,
      ...extra,
    });
  };

  for (const cell of doorCells) {
    if (markers.length >= shape.doors) break;
    const crowded = markers.some((m) => Math.abs(m.x - cell[0]) + Math.abs(m.y - cell[1]) <= 2);
    if (crowded) continue;
    const { roll, text } = rollLine(dice, "dungeon-door");
    add("door", cell, { line: { roll, text } });
  }

  const corridorCells = [...corridor.values()];
  const roomCell = (r: Rect): [number, number] => [dice.int(r.x, r.x + r.w - 1), dice.int(r.y, r.y + r.h - 1)];
  const freeCell = (make: () => [number, number]): [number, number] | null => {
    for (let k = 0; k < 60; k += 1) {
      const cell = make();
      if (!taken.has(`${cell[0]},${cell[1]}`)) return cell;
    }
    return null;
  };
  const inner = rects.length > 1 ? rects.slice(1) : rects;

  const secret = secretLink(rects, edges);
  const secretCell: [number, number] = [
    Math.round((secret.from[0] + secret.to[0]) / 2),
    Math.round((secret.from[1] + secret.to[1]) / 2),
  ];
  {
    const { roll, text } = rollLine(dice, "dungeon-secret");
    add("secret", secretCell, { line: { roll, text }, connects: [secret.i + 1, secret.j + 1] });
  }

  const [findMin, findMax] = shape.findings;
  const trapCount = dice.int(findMin, findMax);
  for (let k = 0; k < trapCount; k += 1) {
    const inCorridor = k === 0 && corridorCells.length > 0;
    const cell = freeCell(() => (inCorridor ? dice.pick(corridorCells) : roomCell(dice.pick(inner))));
    if (!cell) continue;
    // Вид ловушки бросается ПОСЛЕ клетки: не нашлось клетки — не тронут и
    // броски ловушки, и схема того же семени остаётся той же.
    const ready = dice.chance(READY_TRAP_SHARE) ? rollReadyTrap(dice, params) : null;
    add("trap", cell, { trap: ready ?? rollTrap(dice, params) });
  }
  for (const [kind, tableId] of [["loot", "dungeon-loot"], ["feature", "dungeon-feature"]] as const) {
    const count = dice.int(findMin, findMax);
    for (let k = 0; k < count; k += 1) {
      const cell = freeCell(() => roomCell(dice.pick(inner)));
      if (!cell) continue;
      const { roll, text } = rollLine(dice, tableId);
      add(kind, cell, { line: { roll, text } });
    }
  }

  // Содержимое находок бросается ПОСЛЕ всех отметок, а не внутри их цикла:
  // так схема того же семени осталась ровно той же, какой была до
  // содержимого, — у находок добавилось поле, а не сдвинулись броски дверей,
  // ловушек и точек интереса.
  markers.forEach((marker, index) => {
    if (marker.kind !== "loot") return;
    markers[index] = { ...marker, contents: rollLootContents(dice, params.partyLevel) };
  });

  /**
   * Клетка под лестницу в одной из этих комнат: сперва случайными попытками,
   * как у находок, а если все они пришлись на занятые клетки — обходом клеток
   * по порядку. Обход нужен не для красоты: этаж без лестницы разорвал бы
   * подземелье, перейти на него было бы нечем, и «парные лестницы» стали бы
   * обещанием, которое схема иногда не держит.
   */
  const stairsCell = (rooms: readonly Rect[]): [number, number] | null => {
    if (rooms.length === 0) return null;
    const picked = freeCell(() => roomCell(dice.pick(rooms)));
    if (picked) return picked;
    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.h; y += 1) {
        for (let x = r.x; x < r.x + r.w; x += 1) {
          if (!taken.has(`${x},${y}`)) return [x, y];
        }
      }
    }
    return null;
  };

  // Лестница ставится ПОСЛЕ всех отметок и после содержимого находок — по той
  // же причине, по которой там же бросается содержимое: схема одноэтажного
  // подземелья от появления этажей не сдвинулась ни на один бросок, а у этажа
  // многоэтажного лестница добавилась в конец перечня.
  //
  // Вверх — в ПЕРВОЙ комнате: на нижнем этаже она и есть вход, и мастер ищет
  // её там, где у первого этажа стоит «▼ вход». Вниз — в любой другой,
  // тем же `inner`, которым расставлены находки.
  if (floor > 1) {
    const cell = stairsCell(rects.slice(0, 1));
    if (cell) add("stairs", cell, { stairs: "up" });
  }
  if (floor < floorCount) {
    const cell = stairsCell(inner);
    if (cell) add("stairs", cell, { stairs: "down" });
  }

  return {
    seed: params.seed,
    partyLevel: params.partyLevel,
    danger: params.danger,
    width: shape.width,
    height: shape.height,
    // Поля нет вовсе у первого этажа: его схема обязана остаться той же, какой
    // была до этажей, — её сторожит эталон `mediumPlan.20261018.json`.
    ...(floor > 1 ? { floor } : {}),
    ...(purpose ? { purpose: { roll: purpose.roll, text: purpose.text } } : {}),
    ...(entrance ? { entrance: { roll: entrance.roll, text: entrance.text } } : {}),
    rooms,
    corridors: corridorCells,
    secretPath: [secret.from, secret.to],
    markers,
  };
}

/**
 * Все этажи одного подземелья, сверху вниз. Семя каждого выводит `floorSeed`
 * из общего, а число этажей едет в сам генератор: от него зависит, где стоят
 * лестницы, и считать их расстановку снаружи значило бы завести второго
 * владельца схемы.
 *
 * Один этаж — список из одной схемы, и она в точности равна схеме, которую
 * `generateDungeon` отдавал до появления этажей.
 */
export function generateFloorPlans(
  params: DungeonParams,
  floorCount: number,
): DungeonPlan[] {
  return Array.from({ length: Math.max(1, floorCount) }, (_, i) =>
    generateDungeon({
      ...params,
      seed: floorSeed(params.seed, i + 1),
      floor: i + 1,
      floorCount: Math.max(1, floorCount),
    }),
  );
}

/** «Мастерская чародея — Двери подписаны…» → «Мастерская чародея». */
export function lineTitle(text: string): string {
  return text.split(" — ")[0];
}

/** Остаток строки после названия. */
export function lineDetail(text: string): string {
  const at = text.indexOf(" — ");
  return at === -1 ? "" : text.slice(at + 3);
}
