import { renderToStaticMarkup } from "react-dom/server";
import type { DungeonRecord } from "../../state/types";
import { floorCount, floorLabel, floorPlan } from "./dungeonFloors";
import { dungeonSizeOf, MARKER_KIND_LABELS, type MarkerKind } from "./dungeonGenerator";
import {
  DungeonMap,
  LootMark,
  MARKER_COLORS,
  MarkerGlyph,
  mapViewBox,
  NoteMark,
  RoomFloorSwatch,
} from "./DungeonMap";
import {
  lootShown,
  MAP_AUDIENCE_LABELS,
  notesShown,
  secretPathShown,
  shownKinds,
  shownStatuses,
  type MapAudience,
} from "./mapAudience";
import { MARKER_STATUS_LABELS, type MarkerStatus } from "./markerStatus";

/**
 * Лист со схемой подземелья — то, что уходит в файл PNG.
 *
 * Схему рисует сама `DungeonMap`: второй её копии здесь нет, иначе картинка и
 * экран расходились бы с первой же правки вида. Этот модуль складывает лист —
 * заголовок, схему, легенду, подпись — и переводит его в растр.
 *
 * Что на листе видно, здесь тоже не решается: и схема, и легенда спрашивают
 * `mapAudience.ts`. Поэтому легенда листа для игроков физически не может
 * назвать вид, которого на нём нет.
 *
 * Растр делается через `canvas`: SVG листа грузится картинкой и рисуется в
 * полотно нужного размера. Шрифт — системный `Segoe UI`, внешних ссылок в SVG
 * нет вовсе, иначе картинка ушла бы в файл с дырами.
 */

/** Отступ по краю листа. */
const PAD = 20;
/** Полоса заголовка над схемой. */
const TITLE_H = 34;
/** Просвет между схемой и легендой. */
const GAP = 20;
/** Столбец легенды. */
const LEGEND_W = 250;
/** Строка легенды и строка её заголовка. */
const ROW_H = 26;
const HEAD_H = 30;

/** Фон листа — светлый и непрозрачный: лист идёт на печать. */
export const SHEET_BG = "#fffdf6";
const INK = "#3b3226";
const MUTED = "#6d6352";
const EDGE = "#c9bb9b";

/**
 * Длинная сторона картинки в пикселях. Лист A4 при 300 dpi — 2480×3508, так
 * что 2480 по длинной стороне печатается чётко в любой ориентации; карточка
 * требует не меньше ~2000.
 */
export const PNG_LONG_SIDE = 2480;

/** Строка легенды: перечень строк и есть её высота — второго счёта нет. */
type LegendRow =
  | { readonly row: "head"; readonly text: string }
  | { readonly row: "marker"; readonly kind: MarkerKind; readonly status: MarkerStatus; readonly text: string }
  | { readonly row: "floor"; readonly status: MarkerStatus; readonly text: string }
  | { readonly row: "secret"; readonly text: string }
  | { readonly row: "note"; readonly text: string }
  | { readonly row: "loot"; readonly text: string };

/**
 * Легенда листа — ровно то, что на листе бывает. Виды и статусы берутся из
 * `mapAudience.ts`, тем же перечнем, которым схема решает, рисовать ли значок.
 *
 * Статус показывается на первом ИЗ ВИДИМЫХ видов, а не на ловушке: на листе
 * игроков ловушек нет, и объяснять статус их значком значило бы рисовать
 * игрокам фигуру, которой они на схеме не найдут.
 */
export function legendRows(audience: MapAudience): LegendRow[] {
  const kinds = shownKinds(audience);
  const statuses = shownStatuses(audience);
  const sample = kinds[0];
  const rows: LegendRow[] = [{ row: "head", text: "Виды отметок" }];
  for (const kind of kinds) {
    rows.push({ row: "marker", kind, status: "discovered", text: MARKER_KIND_LABELS[kind] });
  }
  rows.push({ row: "head", text: "Статус отметки" });
  for (const status of statuses) {
    rows.push({ row: "marker", kind: sample, status, text: MARKER_STATUS_LABELS[status] });
  }
  rows.push({ row: "head", text: "Статус комнаты" });
  // Те же статусы, что у отметки, и по той же причине: с 21.10.2026 комната
  // прячется от игроков по статусу, и «не исследовано» на их листе объясняло
  // бы тон пола, которого на листе нет ни у одной комнаты.
  for (const status of statuses) {
    rows.push({ row: "floor", status, text: MARKER_STATUS_LABELS[status] });
  }
  const extras: LegendRow[] = [];
  if (secretPathShown(audience)) extras.push({ row: "secret", text: "Потайной ход" });
  if (notesShown(audience)) extras.push({ row: "note", text: "Заметка мастера" });
  // Выбранный лут — своя строка, а не «ещё одна заметка»: на схеме у него свой
  // признак, и легенда обязана называть то, что на листе нарисовано.
  if (lootShown(audience)) extras.push({ row: "loot", text: "Выбранный мастером лут" });
  if (extras.length > 0) rows.push({ row: "head", text: "Только для мастера" }, ...extras);
  return rows;
}

function legendHeight(rows: readonly LegendRow[]): number {
  return rows.reduce((sum, r) => sum + (r.row === "head" ? HEAD_H : ROW_H), 0);
}

function MapLegend({ audience, x, y }: { audience: MapAudience; x: number; y: number }) {
  let top = y;
  return (
    <g aria-label="Легенда">
      {legendRows(audience).map((r, i) => {
        const at = top;
        top += r.row === "head" ? HEAD_H : ROW_H;
        if (r.row === "head") {
          return (
            <text key={i} x={x} y={at + 21} fontSize={15} fontWeight={700} fill={INK}>
              {r.text}
            </text>
          );
        }
        const cx = x + 13;
        const cy = at + 13;
        return (
          <g key={i}>
            {r.row === "marker" && <MarkerGlyph kind={r.kind} status={r.status} cx={cx} cy={cy} size={8} />}
            {r.row === "floor" && (
              <g transform={`translate(${x}, ${at + 1})`}>
                <RoomFloorSwatch status={r.status} />
              </g>
            )}
            {r.row === "secret" && (
              <line
                x1={x + 2}
                y1={cy}
                x2={x + 24}
                y2={cy}
                stroke={MARKER_COLORS.secret}
                strokeWidth={2.5}
                strokeDasharray="6 5"
              />
            )}
            {/* Значки признаков — те же, что на схеме: своей копии круга и
                квадрата здесь нет, иначе легенда и лист разошлись бы. */}
            {r.row === "note" && <NoteMark cx={cx} cy={cy} />}
            {r.row === "loot" && <LootMark cx={cx} cy={cy} />}
            <text x={x + 34} y={cy + 5} fontSize={13} fill={INK}>
              {r.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Подпись под схемой: семя и настройки — хозяйство мастера, не игроков. */
function sheetFooter(dungeon: DungeonRecord, audience: MapAudience): string | null {
  if (audience !== "master") return null;
  return `Отряд ${dungeon.partyLevel} ур. · ловушки «${dungeon.danger}» · ${dungeonSizeOf(
    dungeon.size,
  ).toLowerCase()} · номер схемы ${dungeon.seed}`;
}

/**
 * Заголовок листа: имя подземелья, а у многоэтажного — и номер этажа. У
 * одноэтажного номера нет вовсе: «Этаж 1» на единственном листе — шум, и
 * карточка просит номер именно когда этажей больше одного.
 */
export function sheetTitle(dungeon: DungeonRecord, floor: number): string {
  return floorCount(dungeon) > 1 ? `${dungeon.name} · ${floorLabel(floor)}` : dungeon.name;
}

/** Размер листа в единицах SVG: заголовок, схема со столбцом легенды, подпись. */
export function sheetSize(
  dungeon: DungeonRecord,
  audience: MapAudience,
  floor = 1,
): { width: number; height: number } {
  const [, , vw, vh] = mapViewBox(floorPlan(dungeon, floor));
  const body = Math.max(vh, legendHeight(legendRows(audience)));
  const footer = sheetFooter(dungeon, audience) ? 22 : 0;
  return {
    width: PAD + vw + GAP + LEGEND_W + PAD,
    height: PAD + TITLE_H + body + footer + PAD,
  };
}

/**
 * Размер картинки в пикселях: лист целиком, растянутый так, чтобы длинная
 * сторона вышла `PNG_LONG_SIDE`. Пропорции листа при этом не меняются.
 */
export function pngSize(
  dungeon: DungeonRecord,
  audience: MapAudience,
  floor = 1,
): { width: number; height: number } {
  const { width, height } = sheetSize(dungeon, audience, floor);
  const scale = PNG_LONG_SIDE / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Лист со схемой как разметка SVG — из неё и получается PNG. Этаж тот, что
 * открыт у мастера: лист сохраняет ВИДИМЫЙ этаж, а не всегда первый.
 */
export function dungeonMapSvg(
  dungeon: DungeonRecord,
  audience: MapAudience,
  floor = 1,
): string {
  const [, , vw, vh] = mapViewBox(floorPlan(dungeon, floor));
  const sheet = sheetSize(dungeon, audience, floor);
  const px = pngSize(dungeon, audience, floor);
  const footer = sheetFooter(dungeon, audience);
  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={px.width}
      height={px.height}
      viewBox={`0 0 ${sheet.width} ${sheet.height}`}
      fontFamily="Segoe UI, sans-serif"
    >
      <rect x={0} y={0} width={sheet.width} height={sheet.height} fill={SHEET_BG} />
      <text x={PAD} y={PAD + 23} fontSize={22} fontWeight={700} fill={INK}>
        {sheetTitle(dungeon, floor)}
      </text>
      <text
        x={sheet.width - PAD}
        y={PAD + 23}
        fontSize={14}
        textAnchor="end"
        fill={MUTED}
      >
        {MAP_AUDIENCE_LABELS[audience]}
      </text>
      <rect
        x={PAD - 1}
        y={PAD + TITLE_H - 1}
        width={vw + 2}
        height={vh + 2}
        fill="none"
        stroke={EDGE}
        strokeWidth={1}
      />
      <DungeonMap
        dungeon={dungeon}
        selectedId={null}
        audience={audience}
        floor={floor}
        place={{ x: PAD, y: PAD + TITLE_H, width: vw, height: vh }}
      />
      <MapLegend audience={audience} x={PAD + vw + GAP} y={PAD + TITLE_H} />
      {footer && (
        <text x={PAD} y={sheet.height - PAD - 4} fontSize={13} fill={MUTED}>
          {footer}
        </text>
      )}
    </svg>,
  );
}

/**
 * Имя подземелья, пригодное для имени файла.
 *
 * Запрещённые в именах файлов знаки заменяются подчёркиванием, а не
 * выбрасываются: мастер мог назвать подземелье «Склеп: нижний ярус», и
 * `defaultPath` с двоеточием диалог «Сохранить как» показал бы обрезанным.
 * Пустого имени не бывает: от имени из одних точек не остаётся ничего, и на
 * его месте стоит «подземелье».
 */
function safeName(name: string): string {
  const safe = name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\s.]+$/, "")
    .trim();
  return safe.length > 0 ? safe : "подземелье";
}

/**
 * Имя файла по умолчанию для листа PNG. Решение владельца 21.10.2026 —
 * «Имена сохранить разные»: лист мастера и лист игроков, сохранённые подряд, не
 * должны проситься в один файл.
 *
 * Лист мастера — `<имя>.png`, лист игроков — `<имя> — для игроков.png`. У
 * многоэтажного подземелья между ними встаёт ОТКРЫТЫЙ этаж:
 * `<имя> — этаж 2 — для игроков.png`. У одноэтажного номера нет вовсе — по той
 * же причине, по которой его нет в заголовке листа (`sheetTitle`): «этаж 1» на
 * единственном листе ничего не различает. Этажей ли больше одного, решает
 * `floorCount` — тот же счёт, что у заголовка и у переключателя этажей.
 *
 * Подпись публики берётся из `MAP_AUDIENCE_LABELS` — оттуда же, откуда её
 * читают кнопка выбора листа и легенда картинки: разойдясь, файл назвался бы
 * не тем, что мастер нажал. Лист мастера подписи не несёт (так в карточке):
 * он сохраняется чаще, и приписка к нему была бы шумом. Подпись достаётся
 * любой НЕ мастерской публике, а не одним игрокам: появится третий лист — он
 * получит своё имя, а не ляжет поверх мастерского.
 */
export function pngFileName(
  dungeon: DungeonRecord,
  audience: MapAudience,
  floor = 1,
): string {
  const parts = [safeName(dungeon.name)];
  // `floorLabel` даёт «Этаж 2» — с заглавной, как на вкладке и в заголовке
  // листа. В имени файла этаж стоит серединой фразы, и буква там строчная
  // (образец владельца — «Склеп — этаж 2.png»). Своей строки с номером здесь
  // нет нарочно: номер этажа печатает один `floorLabel`.
  if (floorCount(dungeon) > 1) parts.push(floorLabel(floor).toLowerCase());
  if (audience !== "master") parts.push(MAP_AUDIENCE_LABELS[audience]);
  return `${parts.join(" — ")}.png`;
}

function svgImage(svg: string, width: number, height: number): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  return new Promise((resolve, reject) => {
    const image = new Image(width, height);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Схему не удалось нарисовать картинкой"));
    };
    image.src = url;
  });
}

/**
 * Картинка схемы как PNG в base64 — ровно в том виде, в каком её принимает
 * команда записи `save_png_file`.
 *
 * Полотно сначала заливается фоном листа и только потом принимает схему:
 * `drawImage` сам по себе оставил бы прозрачные пиксели там, где у SVG ничего
 * нет, и «светлый непрозрачный фон» держался бы только на том, что лист
 * нарисован от края до края.
 */
export async function dungeonMapPngBase64(
  dungeon: DungeonRecord,
  audience: MapAudience,
  floor = 1,
): Promise<string> {
  const { width, height } = pngSize(dungeon, audience, floor);
  const image = await svgImage(dungeonMapSvg(dungeon, audience, floor), width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Полотно для картинки недоступно");
  ctx.fillStyle = SHEET_BG;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1] ?? "";
  if (base64.length === 0) throw new Error("Картинка схемы вышла пустой");
  return base64;
}
