import type { KeyboardEvent } from "react";
import type { DungeonRecord } from "../../state/types";
import { floorPlan, planFloor } from "./dungeonFloors";
import {
  markerLabel,
  type DungeonPlan,
  type MarkerKind,
  type StairsDirection,
} from "./dungeonGenerator";
import { hasNote } from "./dungeonNotes";
import {
  markerShown,
  notesShown,
  secretPathShown,
  type MapAudience,
} from "./mapAudience";
import {
  MARKER_STATUS_LABELS,
  markerStatusOf,
  roomKey,
  roomStatusOf,
  type MarkerStatus,
} from "./markerStatus";
import { cellPlace, freeFloorCells } from "./trapPlacement";

/**
 * Схема подземелья — SVG, вид принят владельцем по образцу 18.10.2026:
 * светлый пол на «пергаменте», тёмные стены, сетка клеток, номера комнат.
 *
 * Статус виден прямо на значке: «не исследовано» — серый пунктирный контур,
 * «обнаружено» — заливка цветом вида, «исследовано» — бледная заливка с
 * зелёной галочкой. У комнаты тот же статус читается тоном пола, а заметка
 * мастера — точкой в углу. Тумана и фишек здесь нет.
 *
 * На экране схема всегда мастерская, но та же схема уходит в картинку PNG, и
 * там бывает лист для игроков. Что на нём видно, решает НЕ схема, а
 * `mapAudience.ts`: схема только спрашивает.
 */
export const CELL = 26;

export const MARKER_COLORS: Record<MarkerKind, string> = {
  trap: "#b3261e",
  secret: "#6b3fa0",
  door: "#7a4a1d",
  loot: "#b88600",
  feature: "#1d5fa8",
  stairs: "#116b63",
};

const MUTED = "#8c8577";
const PAPER = "#fffdf6";
const INK = "#3b3226";

/**
 * Тон пола по статусу комнаты: «не исследовано» — чистый пергамент, как было
 * у всех комнат, «обнаружено» — тёплая подложка, «исследовано» — бледно-зелёная,
 * в ту же сторону, что зелёная галочка у исследованной отметки.
 *
 * Статус комнаты — ЗАЛИВКА, а выбранная комната — пунктирная рамка поверх:
 * спутать их нельзя, они разной природы и живут в разных местах рисунка.
 */
export const ROOM_STATUS_FILL: Record<MarkerStatus, string> = {
  unexplored: PAPER,
  discovered: "#fdf0cf",
  explored: "#e3eddc",
};

/**
 * Признак заметки мастера — точка в кольце «пергамента». Одна и та же у
 * комнаты и у отметки: мастер ищет её глазами, а не разбирает, чья она.
 */
export function NoteMark({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g className="dungeon-map__note">
      <circle cx={cx} cy={cy} r={4.2} fill={PAPER} stroke={INK} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={1.8} fill={INK} />
    </g>
  );
}

/** Клочок пола со статусом — для легенды; тон тот же, что на схеме. */
export function RoomFloorSwatch({ status }: { status: MarkerStatus }) {
  return (
    <>
      <rect x={1} y={3} width={24} height={18} fill={INK} />
      <rect x={3} y={5} width={20} height={14} fill={ROOM_STATUS_FILL[status]} />
    </>
  );
}

/** Значок отметки с центром в (cx, cy). Общий для схемы и легенды. */
export function MarkerGlyph({
  kind,
  status,
  cx,
  cy,
  size = 9,
  stairs = "down",
}: {
  kind: MarkerKind;
  status: MarkerStatus;
  cx: number;
  cy: number;
  size?: number;
  /**
   * Куда ведёт лестница — её ступени идут в эту сторону. У остальных видов
   * не значит ничего; у легенды направления нет вовсе, и она берёт «вниз»:
   * строка легенды называет ВИД («Лестница»), а не направление.
   */
  stairs?: StairsDirection;
}) {
  const s = size;
  const color = MARKER_COLORS[kind];
  const hidden = status === "unexplored";
  const done = status === "explored";
  const paint = {
    fill: hidden ? PAPER : color,
    stroke: hidden ? MUTED : color,
    strokeWidth: 2,
    strokeDasharray: hidden ? "3 2" : undefined,
    fillOpacity: done ? 0.45 : 1,
    strokeOpacity: done ? 0.6 : 1,
  };
  const ink = hidden ? MUTED : "#fff";
  let shape;
  if (kind === "trap") {
    shape = <path d={`M${cx},${cy - s} L${cx + s},${cy + s * 0.8} L${cx - s},${cy + s * 0.8} Z`} {...paint} />;
  } else if (kind === "secret") {
    shape = (
      <>
        <circle cx={cx} cy={cy} r={s} {...paint} />
        <text x={cx} y={cy + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill={ink}>S</text>
      </>
    );
  } else if (kind === "door") {
    shape = <rect x={cx - s * 0.75} y={cy - s * 0.75} width={s * 1.5} height={s * 1.5} {...paint} />;
  } else if (kind === "stairs") {
    // Три ступени: у лестницы вниз они спускаются слева направо, у лестницы
    // вверх поднимаются. Направление видно самой фигурой, а не подписью:
    // мастер читает схему глазами, а описание отметки называет его словами.
    const dir = stairs === "up" ? -1 : 1;
    const step = (s * 2) / 3;
    shape = (
      <path
        d={
          `M${cx - s * dir},${cy - s}` +
          ` h${step * dir} v${step}` +
          ` h${step * dir} v${step}` +
          ` h${step * dir} v${step}` +
          ` h${-s * 2 * dir} Z`
        }
        {...paint}
      />
    );
  } else if (kind === "loot") {
    shape = (
      <>
        <rect x={cx - s} y={cy - s * 0.55} width={s * 2} height={s * 1.3} rx={2} {...paint} />
        <line x1={cx - s} y1={cy - s * 0.05} x2={cx + s} y2={cy - s * 0.05} stroke={ink} strokeWidth={1.5} />
      </>
    );
  } else {
    const points = Array.from({ length: 10 }, (_, k) => {
      const angle = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? s * 0.45 : s * 1.05;
      return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
    });
    shape = <polygon points={points.join(" ")} {...paint} />;
  }
  return (
    <>
      {shape}
      {done && (
        <path
          d={`M${cx + s * 0.35},${cy + s * 0.55} l3,3 l6,-7`}
          fill="none"
          stroke="#2e7d32"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </>
  );
}

function floorRects(plan: DungeonPlan): [number, number, number, number][] {
  return [
    ...plan.rooms.map((r): [number, number, number, number] => [r.x, r.y, r.w, r.h]),
    ...plan.corridors.map(([x, y]): [number, number, number, number] => [x, y, 1, 1]),
  ];
}

/**
 * Рамка схемы в единицах SVG: `[x, y, ширина, высота]`. Рамка по полу с полем
 * в клетку — пустые края сетки схеме не нужны.
 *
 * Живёт здесь, у схемы, и ею же считается собственный `viewBox`. Картинке PNG
 * рамка нужна, чтобы разложить схему и легенду на листе и выбрать разрешение;
 * второй, своей, у неё быть не должно — разъехавшись на клетку, они обрезали
 * бы край схемы на печати.
 */
export function mapViewBox(plan: DungeonPlan): [number, number, number, number] {
  const floor = floorRects(plan);
  const x0 = Math.min(...floor.map((f) => f[0])) - 1;
  const y0 = Math.min(...floor.map((f) => f[1])) - 1;
  const x1 = Math.max(...floor.map((f) => f[0] + f[2])) + 1;
  const y1 = Math.max(...floor.map((f) => f[1] + f[3])) + 1;
  return [x0 * CELL, y0 * CELL, (x1 - x0) * CELL, (y1 - y0) * CELL];
}

export function DungeonMap({
  dungeon,
  selectedId,
  onSelect,
  selectedRoom = null,
  onSelectRoom,
  onPlace,
  audience = "master",
  place,
  floor = 1,
}: {
  dungeon: DungeonRecord;
  selectedId: string | null;
  /**
   * Щелчок по отметке. Без него отметки не нажимаются вовсе — так схема
   * выходит в картинку PNG, где она рисунок, а не управление.
   */
  onSelect?: (markerId: string) => void;
  /** Номер комнаты, выбранной в списке, или `null`. */
  selectedRoom?: number | null;
  /**
   * Щелчок по комнате. Без него комнаты не нажимаются вовсе — так схема
   * выходит у постановки ловушки, где выбирают клетку, а не комнату.
   */
  onSelectRoom?: (roomNumber: number) => void;
  /**
   * Режим выбора клетки: схема ждёт не отметку, а место. Пока он включён,
   * нажимаются только свободные клетки пола, а отметки становятся просто
   * рисунком — мастер выбирает место, а не читает описания. Какая клетка
   * свободна, решает `trapPlacement.ts`, а не схема.
   */
  onPlace?: (x: number, y: number) => void;
  /**
   * Для кого схема. На экране — всегда `"master"`; `"players"` бывает только у
   * картинки PNG. Что при этом прячется, знает `mapAudience.ts`.
   */
  audience?: MapAudience;
  /**
   * Место схемы внутри чужого SVG — для картинки, где рядом стоит легенда. На
   * экране его нет: размер даёт CSS.
   */
  place?: { x: number; y: number; width: number; height: number };
  /**
   * Какой этаж рисовать (считая с единицы). Схему этажа даёт `floorPlan`, а
   * приставку его ключей — сама схема (`planFloor`): номер этажа рядом со
   * схемой не передаётся никуда дальше, чтобы отрисованный этаж и ключи, под
   * которыми читаются его статусы, не могли разойтись.
   */
  floor?: number;
}) {
  const plan = floorPlan(dungeon, floor);
  const atFloor = planFloor(plan);
  const rects = floorRects(plan);
  const [vx, vy, vw, vh] = mapViewBox(plan);
  const half = CELL / 2;
  const x0 = vx / CELL;
  const y0 = vy / CELL;
  const x1 = (vx + vw) / CELL;
  const y1 = (vy + vh) / CELL;
  // «▼ вход» — только на первом этаже: вход на нижний этаж это лестница
  // сверху, и она стоит на схеме обычной отметкой (`stairs`), а не подписью.
  const entrance = atFloor === 1 ? plan.rooms[0] : null;
  const [from, to] = plan.secretPath;

  return (
    <svg
      className="dungeon-map__svg"
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      {...(place ?? {})}
      role="img"
      aria-label={`Схема: ${dungeon.name}`}
      fontFamily="Segoe UI, sans-serif"
    >
      <rect x={vx} y={vy} width={vw} height={vh} fill="#efe6d2" />
      <g stroke="#e2d6bc" strokeWidth={1}>
        {Array.from({ length: x1 - x0 + 1 }, (_, i) => (
          <line key={`v${i}`} x1={(x0 + i) * CELL} y1={vy} x2={(x0 + i) * CELL} y2={vy + vh} />
        ))}
        {Array.from({ length: y1 - y0 + 1 }, (_, i) => (
          <line key={`h${i}`} x1={vx} y1={(y0 + i) * CELL} x2={vx + vw} y2={(y0 + i) * CELL} />
        ))}
      </g>
      <g fill="#3b3226">
        {rects.map(([x, y, w, h], i) => (
          <rect key={i} x={x * CELL - 3} y={y * CELL - 3} width={w * CELL + 6} height={h * CELL + 6} />
        ))}
      </g>
      {/* Пол комнаты — тоном статуса, пол проходов — всегда пергамент: статус
          у подземелья есть у комнаты и у отметки, а у прохода его нет. */}
      <g>
        {plan.rooms.map((r) => (
          <rect
            key={`floor-${r.number}`}
            x={r.x * CELL}
            y={r.y * CELL}
            width={r.w * CELL}
            height={r.h * CELL}
            fill={ROOM_STATUS_FILL[roomStatusOf(dungeon, r.number, atFloor)]}
          />
        ))}
        {plan.corridors.map(([x, y]) => (
          <rect key={`corridor-${x}-${y}`} x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill={PAPER} />
        ))}
      </g>
      <g stroke="#ece4d2" strokeWidth={1}>
        {plan.rooms.flatMap((r) => [
          ...Array.from({ length: r.w - 1 }, (_, i) => (
            <line key={`r${r.number}v${i}`} x1={(r.x + i + 1) * CELL} y1={r.y * CELL} x2={(r.x + i + 1) * CELL} y2={(r.y + r.h) * CELL} />
          )),
          ...Array.from({ length: r.h - 1 }, (_, j) => (
            <line key={`r${r.number}h${j}`} x1={r.x * CELL} y1={(r.y + j + 1) * CELL} x2={(r.x + r.w) * CELL} y2={(r.y + j + 1) * CELL} />
          )),
        ])}
      </g>
      {secretPathShown(audience) && (
        <path
          className="dungeon-map__secret-path"
          d={`M${from[0] * CELL + half},${from[1] * CELL + half} L${to[0] * CELL + half},${to[1] * CELL + half}`}
          fill="none"
          stroke={MARKER_COLORS.secret}
          strokeWidth={2.5}
          strokeDasharray="6 5"
          opacity={0.7}
        />
      )}
      {plan.rooms.map((r) => (
        <text key={r.number} x={r.x * CELL + 6} y={r.y * CELL + 15} fontSize={13} fontWeight={700} fill="#6d6352">
          {r.number}
        </text>
      ))}
      {entrance && (
        <text
          x={entrance.x * CELL + (entrance.w * CELL) / 2}
          y={(entrance.y + entrance.h) * CELL - 6}
          fontSize={11}
          fontWeight={600}
          textAnchor="middle"
          fill="#3b3226"
        >
          ▼ вход
        </text>
      )}
      {/* Комнаты — слой НИЖЕ отметок: щелчок по значку достаётся отметке, а по
          остальному полу комнаты — комнате. Подложки у них не пересекаются,
          потому что отметка рисуется позже. */}
      {plan.rooms.map((r) => {
        const status = roomStatusOf(dungeon, r.number, atFloor);
        const selected = r.number === selectedRoom;
        const pickable = !onPlace && !!onSelectRoom;
        const pick = pickable
          ? {
              role: "button",
              tabIndex: 0,
              "aria-pressed": selected,
              onClick: () => onSelectRoom?.(r.number),
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectRoom?.(r.number);
                }
              },
            }
          : {};
        return (
          <g
            key={`room-${r.number}`}
            className={"dungeon-map__room" + (pickable ? "" : " dungeon-map__room--quiet")}
            data-room={r.number}
            data-status={status}
            data-note={
              notesShown(audience) && hasNote(dungeon, roomKey(r.number, atFloor)) ? "yes" : undefined
            }
            aria-label={`Комната ${r.number}: ${r.kind.text} — ${MARKER_STATUS_LABELS[status]}`}
            {...pick}
          >
            <rect x={r.x * CELL} y={r.y * CELL} width={r.w * CELL} height={r.h * CELL} fill="transparent" />
            {selected && (
              <rect
                className="dungeon-map__room-ring"
                x={r.x * CELL + 2}
                y={r.y * CELL + 2}
                width={r.w * CELL - 4}
                height={r.h * CELL - 4}
                fill="none"
                stroke="#2c261e"
                strokeWidth={2.5}
                strokeDasharray="7 4"
              />
            )}
            {notesShown(audience) && hasNote(dungeon, roomKey(r.number, atFloor)) && (
              <NoteMark cx={(r.x + r.w) * CELL - 8} cy={r.y * CELL + 8} />
            )}
          </g>
        );
      })}
      {plan.markers.map((m, index) => {
        // Номер отметки — её место в схеме, а не в том, что видно: иначе на
        // листе игроков «3» стояла бы у другой отметки, чем у мастера, и два
        // листа одного подземелья нельзя было бы положить рядом.
        if (!markerShown(dungeon, m, audience)) return null;
        const status = markerStatusOf(dungeon, m.id);
        const cx = m.x * CELL + half;
        const cy = m.y * CELL + half;
        const selected = m.id === selectedId;
        const pickable = !onPlace && !!onSelect;
        const pick = pickable
          ? {
              role: "button",
              tabIndex: 0,
              "aria-pressed": selected,
              onClick: () => onSelect?.(m.id),
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(m.id);
                }
              },
            }
          : {};
        return (
          <g
            key={m.id}
            className={"dungeon-map__marker" + (pickable ? "" : " dungeon-map__marker--quiet")}
            data-marker={m.id}
            data-kind={m.kind}
            data-status={status}
            data-note={notesShown(audience) && hasNote(dungeon, m.id) ? "yes" : undefined}
            aria-label={`${index + 1}. ${markerLabel(m)}: ${MARKER_STATUS_LABELS[status]}`}
            {...pick}
          >
            {/* Невидимая подложка в клетку — по значку легко попасть. */}
            <rect x={cx - half} y={cy - half} width={CELL} height={CELL} fill="transparent" />
            {selected && <circle cx={cx} cy={cy} r={14} fill="none" stroke="#2c261e" strokeWidth={1.5} />}
            <MarkerGlyph kind={m.kind} status={status} cx={cx} cy={cy} stairs={m.stairs} />
            <text x={cx + 11} y={cy - 8} fontSize={10} fontWeight={600} fill={INK}>
              {index + 1}
            </text>
            {notesShown(audience) && hasNote(dungeon, m.id) && (
              <NoteMark cx={cx - 10} cy={cy - 9} />
            )}
          </g>
        );
      })}
      {onPlace &&
        freeFloorCells(plan).map(([x, y]) => (
          <rect
            key={`cell-${x}-${y}`}
            className="dungeon-map__cell"
            data-cell={`${x},${y}`}
            x={x * CELL}
            y={y * CELL}
            width={CELL}
            height={CELL}
            role="button"
            tabIndex={0}
            aria-label={`Поставить сюда: ${cellPlace(plan, x, y)}, клетка ${x}, ${y}`}
            onClick={() => onPlace(x, y)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPlace(x, y);
              }
            }}
          />
        ))}
    </svg>
  );
}
