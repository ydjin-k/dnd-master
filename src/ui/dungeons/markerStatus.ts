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

/**
 * Ключ комнаты в карте `statuses` и в карте `notes`: `room-<номер>`.
 *
 * Своего набора статусов у комнат нет — тот же круг, те же подписи и та же
 * карта (решение карточки `journal-dungeon-room-status-and-notes`). С ключами
 * отметок (`trap-1`, `door-3`) `room-` не пересекается: `id` отметке даёт
 * генератор схемы по её виду, и вида «room» у отметок нет.
 *
 * Ключ родится ЗДЕСЬ, у владельца карты статусов, а не в экране и не в
 * заметках: иначе список комнат и схема писали бы каждый свою строку, и
 * опечатка в одной из них читалась бы как «не исследовано» молча.
 */
export function roomKey(roomNumber: number): string {
  return `room-${roomNumber}`;
}

/** Ключ принадлежит комнате, а не отметке. */
export function isRoomKey(key: string): boolean {
  return /^room-\d+$/.test(key);
}

/** Статус комнаты — тот же круг, что у отметки. */
export function roomStatusOf(dungeon: DungeonRecord, roomNumber: number): MarkerStatus {
  return markerStatusOf(dungeon, roomKey(roomNumber));
}

/** Подземелье с комнатой, сдвинутой на следующий статус. */
export function withRoomAdvanced(dungeon: DungeonRecord, roomNumber: number): DungeonRecord {
  return withMarkerAdvanced(dungeon, roomKey(roomNumber));
}

/** Подземелья кампании; у снимка без поля — пустой список. */
export function dungeonsOf(state: CampaignState): DungeonRecord[] {
  return state.dungeons ?? [];
}
