import type { DungeonRecord } from "../../state/types";
import { MARKER_KINDS, type DungeonMarker, type MarkerKind } from "./dungeonGenerator";
import { markerStatusOf, MARKER_STATUSES, type MarkerStatus } from "./markerStatus";

/**
 * Для кого нарисована схема: лист мастера или лист, который можно отдать
 * игрокам.
 *
 * Здесь живёт ВЕСЬ ответ на вопрос «что видно игрокам». Схема
 * (`DungeonMap.tsx`) и легенда картинки (`DungeonMapImage.tsx`) спрашивают
 * отсюда и своего мнения не имеют: иначе лист печатался бы с легендой
 * «ловушка», на которой ни одной ловушки нет, — а это ровно тот случай, когда
 * картинка врёт игрокам о подземелье.
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
