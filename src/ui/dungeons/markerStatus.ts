import type { CampaignState, DungeonRecord } from "../../state/types";

/**
 * Статус отметки на схеме — ровно три, по кругу (решение владельца
 * 17.10.2026: «изучено» и «исследовано» — одно и то же, четвёртого нет).
 */
export const MARKER_STATUSES = ["unexplored", "discovered", "explored"] as const;
export type MarkerStatus = (typeof MARKER_STATUSES)[number];

export const MARKER_STATUS_LABELS: Record<MarkerStatus, string> = {
  unexplored: "не исследовано",
  discovered: "обнаружено",
  explored: "исследовано",
};

/** Следующий по кругу: не исследовано → обнаружено → исследовано → снова. */
export function nextMarkerStatus(status: MarkerStatus): MarkerStatus {
  return MARKER_STATUSES[(MARKER_STATUSES.indexOf(status) + 1) % MARKER_STATUSES.length];
}

/** Статус отметки; незнакомое или отсутствующее — «не исследовано». */
export function markerStatusOf(dungeon: DungeonRecord, markerId: string): MarkerStatus {
  const status = dungeon.statuses[markerId];
  return MARKER_STATUSES.includes(status) ? status : "unexplored";
}

/** Подземелье с отметкой, сдвинутой на следующий статус. */
export function withMarkerAdvanced(dungeon: DungeonRecord, markerId: string): DungeonRecord {
  return {
    ...dungeon,
    statuses: { ...dungeon.statuses, [markerId]: nextMarkerStatus(markerStatusOf(dungeon, markerId)) },
  };
}

/** Подземелья кампании; у снимка без поля — пустой список. */
export function dungeonsOf(state: CampaignState): DungeonRecord[] {
  return state.dungeons ?? [];
}
