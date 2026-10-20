import { useEffect, useRef } from "react";
import type { DungeonRecord } from "../../state/types";
import { floorPlan, planFloor } from "./dungeonFloors";
import type { DungeonRoom } from "./dungeonGenerator";
import { hasNote, noteOf } from "./dungeonNotes";
import { RoomFloorSwatch } from "./DungeonMap";
import {
  MARKER_STATUS_LABELS,
  MARKER_STATUSES,
  nextMarkerStatus,
  roomKey,
  roomStatusOf,
} from "./markerStatus";
import { NoteField } from "./NoteField";

/**
 * Список комнат подземелья — вторая половина пары «схема ↔ список».
 *
 * Статус комнаты и её заметка здесь только показываются: круг статусов живёт в
 * `markerStatus.ts`, правила заметки — в `dungeonNotes.ts`, а запись в
 * кампанию делает экран. Своего понятия «следующий статус» список не имеет.
 *
 * Заметку можно ПРАВИТЬ только у выбранной комнаты; у остальных она читается
 * строкой, а комната без заметки места под неё не занимает. Поэтому выбор
 * комнаты — не только подсветка: им же открывается её заметка.
 */
export function DungeonRooms({
  dungeon,
  floor = 1,
  selectedRoom,
  onSelectRoom,
  onAdvanceRoom,
  onNote,
  onDweller,
  onRaiseCombat,
  raisedIn,
  noCharacters,
}: {
  dungeon: DungeonRecord;
  /** Какой этаж перечислять; ключи комнат спрашиваются у его схемы. */
  floor?: number;
  /** Комната, выбранная на схеме или здесь, — к ней же список и прокручивается. */
  selectedRoom: number | null;
  onSelectRoom: (roomNumber: number) => void;
  onAdvanceRoom: (roomNumber: number) => void;
  /** Заметка по ключу комнаты — тому же, под которым лежит её статус. */
  onNote: (id: string, text: string) => void;
  onDweller: (monsterId: string) => void;
  onRaiseCombat: (room: DungeonRoom) => void;
  /** Номер комнаты, из которой подняли бой, — подпись стоит на месте. */
  raisedIn: number | null;
  noCharacters: boolean;
}) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const plan = floorPlan(dungeon, floor);
  const atFloor = planFloor(plan);

  /**
   * Выбранную комнату — к глазам: щелчок по комнате на схеме ведёт к строке
   * списка, а в узком окне список стоит ниже схемы и выбранная строка может
   * оказаться за краем. Прокрутка живёт ЗДЕСЬ, у списка: схема не знает, где
   * его строки. `scrollIntoView` под `?.` — в jsdom его нет; `block: "nearest"`
   * — чтобы щелчок по строке, которая и так видна, не дёргал страницу.
   */
  useEffect(() => {
    if (selectedRoom === null) return;
    const row = listRef.current?.querySelector(`[data-room="${selectedRoom}"]`);
    (row as HTMLElement | null)?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [selectedRoom]);

  return (
    <>
      <h4>Комнаты</h4>
      <ol className="dungeons-page__rooms" ref={listRef}>
        {plan.rooms.map((room) => {
          const status = roomStatusOf(dungeon, room.number, atFloor);
          const key = roomKey(room.number, atFloor);
          const selected = room.number === selectedRoom;
          return (
            <li
              key={room.number}
              className={"dungeons-page__room" + (selected ? " dungeons-page__room--selected" : "")}
              data-room={room.number}
              data-status={status}
              aria-current={selected ? "true" : undefined}
            >
              <button
                type="button"
                className="dungeons-page__room-name"
                aria-pressed={selected}
                onClick={() => onSelectRoom(room.number)}
              >
                {room.kind.text}
              </button>
              <div className="dungeons-page__room-status">
                <span className="dm-chip" data-status={status}>{MARKER_STATUS_LABELS[status]}</span>
                <button type="button" onClick={() => onAdvanceRoom(room.number)}>
                  Отметить: {MARKER_STATUS_LABELS[nextMarkerStatus(status)]}
                </button>
              </div>
              {room.dwellers && (
                <div className="dungeons-page__dwellers">
                  <span className="dungeons-page__range">Обитатели:</span> {room.dwellers.text}
                  {room.dwellers.monsters.length > 0 && (
                    <>
                      <div className="dungeons-page__dweller-names">
                        {room.dwellers.monsters.map((m, i) => (
                          <button
                            key={`${m.id}-${i}`}
                            type="button"
                            className="dungeons-page__dweller"
                            onClick={() => onDweller(m.id)}
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="dungeons-page__fight"
                        disabled={noCharacters}
                        onClick={() => onRaiseCombat(room)}
                      >
                        Поднять бой
                      </button>
                      {raisedIn === room.number && (
                        <span className="dungeons-page__placed">
                          Бой начат — откройте вкладку «Бой»
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
              {/* Поле заметки — только у выбранной комнаты (решение владельца
                  19.10.2026). У остальных заметка стоит строкой, а комната без
                  заметки не занимает места вовсе: иначе список комнат
                  превращается в стену пустых полей. */}
              {selected ? (
                <NoteField
                  label={`Заметка к комнате ${room.number}`}
                  value={noteOf(dungeon, key)}
                  onChange={(text) => onNote(key, text)}
                />
              ) : (
                hasNote(dungeon, key) && (
                  <p className="dungeons-page__room-note">{noteOf(dungeon, key)}</p>
                )
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * Часть легенды про комнату. Стоит рядом со списком, а не в экране: тон пола и
 * точку заметки рисует схема (`ROOM_STATUS_FILL`, `NoteMark`), и подписи к ним
 * должны жить вплотную к тому, что они объясняют.
 */
export function RoomLegend() {
  return (
    <>
      <h4>Статус комнаты</h4>
      {MARKER_STATUSES.map((status) => (
        <div key={status} className="dungeons-page__legend-row">
          <svg width="26" height="24" aria-hidden="true">
            <RoomFloorSwatch status={status} />
          </svg>
          {MARKER_STATUS_LABELS[status]}
        </div>
      ))}
      <p className="dungeons-page__range">
        Тон пола — тот же круг, что у отметок. Точка в углу комнаты или у значка —
        заметка мастера. Пунктирная рамка — комната, выбранная в списке; щелчок по
        комнате на схеме выделяет её в списке, и наоборот.
      </p>
    </>
  );
}
