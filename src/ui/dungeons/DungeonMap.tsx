import type { KeyboardEvent } from "react";
import type { DungeonRecord } from "../../state/types";
import { MARKER_KIND_LABELS, type DungeonPlan, type MarkerKind } from "./dungeonGenerator";
import { MARKER_STATUS_LABELS, markerStatusOf, type MarkerStatus } from "./markerStatus";
import { cellPlace, freeFloorCells } from "./trapPlacement";

/**
 * Схема подземелья — SVG, вид принят владельцем по образцу 18.10.2026:
 * светлый пол на «пергаменте», тёмные стены, сетка клеток, номера комнат.
 *
 * Статус виден прямо на значке: «не исследовано» — серый пунктирный контур,
 * «обнаружено» — заливка цветом вида, «исследовано» — бледная заливка с
 * зелёной галочкой. Схема только для мастера: тумана и фишек здесь нет.
 */
export const CELL = 26;

export const MARKER_COLORS: Record<MarkerKind, string> = {
  trap: "#b3261e",
  secret: "#6b3fa0",
  door: "#7a4a1d",
  loot: "#b88600",
  feature: "#1d5fa8",
};

const MUTED = "#8c8577";
const PAPER = "#fffdf6";

/** Значок отметки с центром в (cx, cy). Общий для схемы и легенды. */
export function MarkerGlyph({
  kind,
  status,
  cx,
  cy,
  size = 9,
}: {
  kind: MarkerKind;
  status: MarkerStatus;
  cx: number;
  cy: number;
  size?: number;
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

export function DungeonMap({
  dungeon,
  selectedId,
  onSelect,
  onPlace,
}: {
  dungeon: DungeonRecord;
  selectedId: string | null;
  onSelect: (markerId: string) => void;
  /**
   * Режим выбора клетки: схема ждёт не отметку, а место. Пока он включён,
   * нажимаются только свободные клетки пола, а отметки становятся просто
   * рисунком — мастер выбирает место, а не читает описания. Какая клетка
   * свободна, решает `trapPlacement.ts`, а не схема.
   */
  onPlace?: (x: number, y: number) => void;
}) {
  const { plan } = dungeon;
  const floor = floorRects(plan);
  // Рамка по полу с полем в клетку: пустые края сетки схеме не нужны.
  const x0 = Math.min(...floor.map((f) => f[0])) - 1;
  const y0 = Math.min(...floor.map((f) => f[1])) - 1;
  const x1 = Math.max(...floor.map((f) => f[0] + f[2])) + 1;
  const y1 = Math.max(...floor.map((f) => f[1] + f[3])) + 1;
  const [vx, vy, vw, vh] = [x0 * CELL, y0 * CELL, (x1 - x0) * CELL, (y1 - y0) * CELL];
  const half = CELL / 2;
  const entrance = plan.rooms[0];
  const [from, to] = plan.secretPath;

  return (
    <svg
      className="dungeon-map__svg"
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
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
        {floor.map(([x, y, w, h], i) => (
          <rect key={i} x={x * CELL - 3} y={y * CELL - 3} width={w * CELL + 6} height={h * CELL + 6} />
        ))}
      </g>
      <g fill={PAPER}>
        {floor.map(([x, y, w, h], i) => (
          <rect key={i} x={x * CELL} y={y * CELL} width={w * CELL} height={h * CELL} />
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
      <path
        d={`M${from[0] * CELL + half},${from[1] * CELL + half} L${to[0] * CELL + half},${to[1] * CELL + half}`}
        fill="none"
        stroke={MARKER_COLORS.secret}
        strokeWidth={2.5}
        strokeDasharray="6 5"
        opacity={0.7}
      />
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
      {plan.markers.map((m, index) => {
        const status = markerStatusOf(dungeon, m.id);
        const cx = m.x * CELL + half;
        const cy = m.y * CELL + half;
        const selected = m.id === selectedId;
        const pick = onPlace
          ? {}
          : {
              role: "button",
              tabIndex: 0,
              "aria-pressed": selected,
              onClick: () => onSelect(m.id),
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(m.id);
                }
              },
            };
        return (
          <g
            key={m.id}
            className={"dungeon-map__marker" + (onPlace ? " dungeon-map__marker--quiet" : "")}
            data-marker={m.id}
            data-kind={m.kind}
            data-status={status}
            aria-label={`${index + 1}. ${MARKER_KIND_LABELS[m.kind]}: ${MARKER_STATUS_LABELS[status]}`}
            {...pick}
          >
            {/* Невидимая подложка в клетку — по значку легко попасть. */}
            <rect x={cx - half} y={cy - half} width={CELL} height={CELL} fill="transparent" />
            {selected && <circle cx={cx} cy={cy} r={14} fill="none" stroke="#2c261e" strokeWidth={1.5} />}
            <MarkerGlyph kind={m.kind} status={status} cx={cx} cy={cy} />
            <text x={cx + 11} y={cy - 8} fontSize={10} fontWeight={600} fill="#3b3226">
              {index + 1}
            </text>
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
