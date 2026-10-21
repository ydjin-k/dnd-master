import type { DungeonRecord } from "../../state/types";
import { floorPlan, planFloor } from "./dungeonFloors";
import {
  MARKER_KINDS,
  type DungeonMarker,
  type DungeonPlan,
  type MarkerKind,
} from "./dungeonGenerator";
import {
  markerStatusOf,
  MARKER_STATUSES,
  roomKey,
  roomStatusOf,
  type MarkerStatus,
} from "./markerStatus";

/**
 * Для кого нарисована схема: лист мастера или лист, который можно отдать
 * игрокам.
 *
 * Здесь живёт ВЕСЬ ответ на вопрос «что видно игрокам». Схема
 * (`DungeonMap.tsx`), легенда картинки (`DungeonMapImage.tsx`) и окно игроков
 * (`PlayersWindow.tsx`) спрашивают отсюда и своего мнения не имеют: иначе лист
 * печатался бы с легендой «ловушка», на которой ни одной ловушки нет, — а это
 * ровно тот случай, когда картинка врёт игрокам о подземелье.
 *
 * Правило ОДНО на оба листа и на окно. Решение владельца 21.10.2026 («Прятать
 * неисследованные») заведено здесь же, рядом с `markerShown`, и второго
 * правила для окна нет: разойдясь, окно на телевизоре и лист, отданный в руки,
 * показали бы игрокам разные подземелья.
 *
 * Правило одно и то же у значка и у легенды, потому что предикат
 * `markerShown` СОБРАН из тех же двух перечней, которые печатает легенда
 * (`shownKinds`, `shownStatuses`). Разойтись им физически нечем.
 */
export const MAP_AUDIENCES = ["master", "players"] as const;
export type MapAudience = (typeof MAP_AUDIENCES)[number];

export const MAP_AUDIENCE_LABELS: Record<MapAudience, string> = {
  master: "для мастера",
  players: "для игроков",
};

/**
 * Виды отметок, которых на листе игроков нет вовсе — даже исследованных.
 *
 * Ловушка и потайной ход прячутся по виду, а не по статусу: решение владельца
 * в карточке названо отдельной строкой («без неисследованных отметок, ловушек
 * и потайных ходов»). Пройденная ловушка игрокам уже не новость, но лист живёт
 * дольше одной сцены, и мастер отдаёт его, а не сверяет построчно.
 */
const MASTER_ONLY_KINDS: readonly MarkerKind[] = ["trap", "secret"];

/** Виды отметок, попадающие на лист: их же печатает легенда. */
export function shownKinds(audience: MapAudience): readonly MarkerKind[] {
  if (audience === "master") return MARKER_KINDS;
  return MARKER_KINDS.filter((kind) => !MASTER_ONLY_KINDS.includes(kind));
}

/** Статусы, попадающие на лист: их же печатает легенда. */
export function shownStatuses(audience: MapAudience): readonly MarkerStatus[] {
  if (audience === "master") return MARKER_STATUSES;
  return MARKER_STATUSES.filter((status) => status !== "unexplored");
}

/** Отметка видна этой публике. */
export function markerShown(
  dungeon: DungeonRecord,
  marker: DungeonMarker,
  audience: MapAudience,
): boolean {
  return (
    shownKinds(audience).includes(marker.kind) &&
    shownStatuses(audience).includes(markerStatusOf(dungeon, marker.id))
  );
}

/**
 * Комната видна этой публике.
 *
 * Статусы — те же `shownStatuses`, которыми решается судьба отметки и которые
 * печатает легенда: у игроков комната появляется, когда отряд её обнаружил
 * (решение владельца 21.10.2026 — «Прятать неисследованные»). Своего перечня
 * у комнаты нет нарочно — иначе «обнаружено» значило бы на схеме одно, а в
 * легенде другое.
 */
export function roomShown(
  dungeon: DungeonRecord,
  roomNumber: number,
  floor: number,
  audience: MapAudience,
): boolean {
  return shownStatuses(audience).includes(roomStatusOf(dungeon, roomNumber, floor));
}

/** Ключ клетки — только внутри этого модуля, наружу уходят сами клетки. */
const cellKey = (x: number, y: number): string => `${x},${y}`;

const sideways = (x: number, y: number): readonly (readonly [number, number])[] => [
  [x + 1, y],
  [x - 1, y],
  [x, y + 1],
  [x, y - 1],
];

/**
 * Клетки проходов, видные этой публике: карточка просит «проходы МЕЖДУ двумя
 * такими комнатами», и здесь это сказано буквально.
 *
 * Пары «комната — комната» в схеме не записаны: проход лежит списком клеток
 * (`plan.corridors`), и какие комнаты он соединяет, видно только по тому, к
 * чему он прилегает. Поэтому отбор идёт в два прохода, и каждый убирает свою
 * утечку:
 *
 * 1. Связный кусок прохода, у которого открытых комнат меньше двух, не
 *    показывается целиком. Такой кусок ведёт из открытой комнаты в закрытую
 *    (или вовсе между двумя закрытыми), и нарисованный он показывал бы
 *    игрокам направление, в котором их ждёт комната, о которой они не знают.
 *    Кольцо вокруг двух закрытых комнат убирается этим же счётом: клетки
 *    кольца тупиками не выглядят, а ведёт оно в закрытое.
 * 2. У уцелевшего куска срезаются тупиковые ответвления. У клетки на пути
 *    между двумя комнатами выходов всегда два — соседняя клетка прохода или
 *    открытая комната; у конца тупика выход один, и за ним закрытая комната.
 *    Снятая клетка делает тупиком следующую, и ответвление сматывается до
 *    развилки, откуда путь между открытыми комнатами идёт дальше.
 */
export function shownCorridors(
  dungeon: DungeonRecord,
  plan: DungeonPlan,
  audience: MapAudience,
): readonly (readonly [number, number])[] {
  if (audience === "master") return plan.corridors;
  const floor = planFloor(plan);
  // Клетки пола ОТКРЫТЫХ комнат → номер комнаты. Закрытых здесь нет вовсе:
  // проход, упирающийся в закрытую комнату, не «между двумя открытыми».
  const open = new Map<string, number>();
  for (const r of plan.rooms) {
    if (!roomShown(dungeon, r.number, floor, audience)) continue;
    for (let x = r.x; x < r.x + r.w; x += 1) {
      for (let y = r.y; y < r.y + r.h; y += 1) open.set(cellKey(x, y), r.number);
    }
  }
  const kept = new Set(plan.corridors.map(([x, y]) => cellKey(x, y)));
  /** Открытые комнаты, к которым клетка прилегает: по номерам, а не по сторонам. */
  const roomsAt = (x: number, y: number): Set<number> =>
    new Set(
      sideways(x, y)
        .map(([nx, ny]) => open.get(cellKey(nx, ny)))
        .filter((n): n is number => n !== undefined),
    );

  const seen = new Set<string>();
  for (const [x, y] of plan.corridors) {
    if (seen.has(cellKey(x, y))) continue;
    const piece: (readonly [number, number])[] = [];
    const rooms = new Set<number>();
    const queue: (readonly [number, number])[] = [[x, y]];
    seen.add(cellKey(x, y));
    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!;
      piece.push([cx, cy]);
      for (const n of roomsAt(cx, cy)) rooms.add(n);
      for (const [nx, ny] of sideways(cx, cy)) {
        const key = cellKey(nx, ny);
        if (kept.has(key) && !seen.has(key)) {
          seen.add(key);
          queue.push([nx, ny]);
        }
      }
    }
    if (rooms.size < 2) for (const [cx, cy] of piece) kept.delete(cellKey(cx, cy));
  }

  for (let cutting = true; cutting; ) {
    cutting = false;
    for (const [x, y] of plan.corridors) {
      const key = cellKey(x, y);
      if (!kept.has(key)) continue;
      const exits =
        roomsAt(x, y).size +
        sideways(x, y).filter(([nx, ny]) => kept.has(cellKey(nx, ny))).length;
      if (exits < 2) {
        kept.delete(key);
        cutting = true;
      }
    }
  }

  return plan.corridors.filter(([x, y]) => kept.has(cellKey(x, y)));
}

/**
 * Запись подземелья, из которой вынуто всё, чего игрокам видеть нельзя:
 * ровно её и получает окно игроков.
 *
 * Отрисовка и так спрашивает `markerShown`, `roomShown` и `shownCorridors`, но
 * в окно уходит ОТРЕДАКТИРОВАННАЯ копия, а не запись мастера: во втором окне
 * живёт тот же пакет приложения, и описания комнат, обитатели, числа ловушек,
 * заметки и семя не должны там даже лежать. Что окно не показывает, оно и не
 * знает.
 *
 * Возвращается одноэтажная запись: нижние этажи выброшены, а приставка ключей
 * у схемы остаётся своя (поле `floor` схемы не трогается), поэтому статусы
 * третьей комнаты второго этажа и в копии читаются как `f2-room-3`.
 */
export function playersRecord(dungeon: DungeonRecord, floor: number): DungeonRecord {
  const plan = floorPlan(dungeon, floor);
  const at = planFloor(plan);
  const rooms = plan.rooms.filter((r) => roomShown(dungeon, r.number, at, "players"));
  const markers = plan.markers.filter((m) => markerShown(dungeon, m, "players"));
  const statuses: Record<string, MarkerStatus> = {};
  for (const r of rooms) statuses[roomKey(r.number, at)] = roomStatusOf(dungeon, r.number, at);
  for (const m of markers) statuses[m.id] = markerStatusOf(dungeon, m.id);
  return {
    id: dungeon.id,
    // Имя подземелья игрокам видно и на листе PNG («Склеп старого рода»):
    // секретом оно не было ни там, ни здесь.
    name: dungeon.name,
    createdAt: dungeon.createdAt,
    // Семя — хозяйство мастера: по нему схема собирается заново целиком, со
    // всеми закрытыми комнатами. В копии его нет ни у записи, ни у схемы.
    seed: 0,
    partyLevel: 0,
    danger: dungeon.danger,
    plan: {
      ...plan,
      seed: 0,
      purpose: undefined,
      entrance: undefined,
      rooms: rooms.map((r) => ({
        number: r.number,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        // Вид комнаты — описание: на схеме он живёт только в `aria-label`, и
        // в копии от него остаётся пустая строка.
        kind: { roll: 0, text: "" },
        dwellers: null,
      })),
      corridors: shownCorridors(dungeon, plan, "players").map(([x, y]) => [x, y] as const),
      // Потайной ход игрокам не рисуется (`secretPathShown`), и его концы в
      // копии ведут в одну клетку схемы — показывать по ним нечего.
      secretPath: [
        [rooms[0]?.x ?? 0, rooms[0]?.y ?? 0],
        [rooms[0]?.x ?? 0, rooms[0]?.y ?? 0],
      ],
      markers: markers.map((m) => ({
        id: m.id,
        kind: m.kind,
        x: m.x,
        y: m.y,
        line: null,
        trap: null,
        connects: null,
        ...(m.stairs ? { stairs: m.stairs } : {}),
      })),
    },
    lowerFloors: [],
    statuses,
    notes: {},
  };
}

/**
 * Пунктир потайного хода. Прячется вместе с отметками потайных ходов: это один
 * и тот же секрет, нарисованный дважды, и спрятать половину — хуже, чем не
 * прятать вовсе.
 */
export function secretPathShown(audience: MapAudience): boolean {
  return audience === "master";
}

/**
 * Точки заметок мастера. Текста заметки на схеме и не было, но сама точка
 * говорит игрокам «здесь мастер что-то приготовил» — на их листе её нет.
 */
export function notesShown(audience: MapAudience): boolean {
  return audience === "master";
}
