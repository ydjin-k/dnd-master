import { describe, expect, it } from "vitest";
import type { DungeonRecord } from "../../state/types";
import mediumPlan from "./__fixtures__/mediumPlan.20261018.json";
import type { DungeonPlan, MarkerKind } from "./dungeonGenerator";
import { MARKER_KINDS } from "./dungeonGenerator";
import type { MarkerStatus } from "./markerStatus";
import {
  dungeonMapSvg,
  legendRows,
  PNG_LONG_SIDE,
  pngFileName,
  pngSize,
  SHEET_BG,
  sheetSize,
  sheetTitle,
} from "./DungeonMapImage";
import { floorLabel } from "./dungeonFloors";
import { MAP_AUDIENCE_LABELS, shownKinds, shownStatuses } from "./mapAudience";

/**
 * Лист PNG проверяется по разметке SVG, из которой он рисуется: растр делает
 * `canvas` окна, которого в jsdom нет, и живьём лист снимается в окне Tauri
 * (проба карточки «живьём»).
 */

const plan = mediumPlan as unknown as DungeonPlan;

/**
 * Отметка каждого вида, в каждом статусе — ровно то, что карточка требует
 * скормить отрисовке: «получает SVG со всеми видами отметок».
 */
function markerOfEveryKind(): { plan: DungeonPlan; statuses: Record<string, string> } {
  const free = [...plan.corridors];
  const markers = MARKER_KINDS.map((kind, i) => ({
    id: `${kind}-9`,
    kind,
    x: free[i][0],
    y: free[i][1],
    line: { roll: 1, text: `Проба: ${kind}` },
    trap: null,
    connects: null,
    // У лестницы направление есть всегда: оно решает и фигуру значка, и
    // подпись. Строки таблицы у неё при этом не бывает — здесь она стоит
    // только потому, что отметки собираются одним выражением.
    ...(kind === "stairs" ? { stairs: "down" as const } : {}),
  }));
  return {
    plan: { ...plan, markers } as unknown as DungeonPlan,
    // Ловушка и потайной ход — исследованы, остальные три по кругу: так видно,
    // что вид прячется по виду, а не потому, что не дошёл до «обнаружено».
    statuses: {
      "trap-9": "explored",
      "secret-9": "explored",
      "door-9": "unexplored",
      "loot-9": "discovered",
      "feature-9": "explored",
      // Лестница прячется ПО СТАТУСУ, как дверь, а не по виду, как ловушка:
      // обнаруженная лестница на листе игроков остаётся — спуск на нижний
      // этаж они уже нашли, и скрывать его от них нечего.
      "stairs-9": "discovered",
      "room-1": "discovered",
      "room-2": "explored",
    },
  };
}

function dungeonWithEveryKind(): DungeonRecord {
  const { plan: withMarkers, statuses } = markerOfEveryKind();
  return {
    id: "d1",
    name: "Склеп старого рода",
    createdAt: "2026-10-20T10:00:00Z",
    seed: 20261018,
    partyLevel: 3,
    danger: "Опасная",
    plan: withMarkers,
    statuses: statuses as DungeonRecord["statuses"],
    notes: { "room-1": "за шкафом тайник", "loot-9": "подменить на фальшивку" },
  };
}

/** Какие отметки нарисованы: `data-marker` стоит у каждого значка. */
function drawnMarkers(svg: string): string[] {
  return [...svg.matchAll(/data-marker="([^"]+)"/g)].map((m) => m[1]);
}

function drawnKinds(svg: string): MarkerKind[] {
  return [...svg.matchAll(/data-kind="([^"]+)"/g)].map((m) => m[1] as MarkerKind);
}

/** Какие комнаты нарисованы: `data-room` стоит у каждой комнаты. */
function drawnRooms(svg: string): number[] {
  return [...svg.matchAll(/data-room="(\d+)"/g)].map((m) => Number(m[1]));
}

/** Подписи отметок: `aria-label` начинается с номера, который стоит на схеме. */
function markerLabels(svg: string): string[] {
  return [...svg.matchAll(/aria-label="(\d+\. [^"]+)"/g)].map((m) => m[1]);
}

describe("лист со схемой", () => {
  const dungeon = dungeonWithEveryKind();

  it("мастеру отдаёт все виды отметок и все статусы", () => {
    const svg = dungeonMapSvg(dungeon, "master");
    expect(drawnMarkers(svg).sort()).toEqual(
      ["door-9", "feature-9", "loot-9", "secret-9", "stairs-9", "trap-9"].sort(),
    );
    expect(new Set(drawnKinds(svg))).toEqual(new Set(MARKER_KINDS));
    expect(svg).toContain('data-status="unexplored"');
  });

  it("листу игроков не достаются ни неисследованные отметки, ни ловушки, ни потайные ходы", () => {
    const svg = dungeonMapSvg(dungeon, "players");
    // `door-9` — «не исследовано», `trap-9` и `secret-9` — исследованные
    // ловушка и потайной ход: уходят все три, каждая по своей причине.
    // `stairs-9` остаётся: лестница — обычная отметка, видна по статусу.
    expect(drawnMarkers(svg)).toEqual(["loot-9", "feature-9", "stairs-9"]);
    expect(drawnKinds(svg)).not.toContain("trap");
    expect(drawnKinds(svg)).not.toContain("secret");
    // «не исследовано» не осталось ни у одной ОТМЕТКИ — и ни у одной комнаты
    // (решение владельца 21.10.2026, проба ниже).
    expect(svg).not.toMatch(/data-kind="[^"]+" data-status="unexplored"/);
    expect(dungeonMapSvg(dungeon, "master")).toMatch(
      /data-kind="door" data-status="unexplored"/,
    );
    // Пунктир потайного хода — тот же секрет, нарисованный иначе.
    expect(svg).not.toContain("dungeon-map__secret-path");
    expect(dungeonMapSvg(dungeon, "master")).toContain("dungeon-map__secret-path");
  });

  it("неисследованных комнат и проходов к ним на листе игроков нет вовсе", () => {
    const master = dungeonMapSvg(dungeon, "master");
    const players = dungeonMapSvg(dungeon, "players");
    // В записи открыты только комнаты 1 и 2 — остальных на листе игроков нет
    // в РАЗМЕТКЕ, а не спрятаны стилем: лист уходит файлом, и спрятанное
    // стилем уехало бы в него вместе с номерами комнат.
    expect(drawnRooms(master).length).toBeGreaterThan(2);
    expect(drawnRooms(players)).toEqual([1, 2]);
    expect(players).not.toContain('data-room="3"');
    expect(players).not.toContain('data-status="unexplored"');
    // Проходов на листе игроков меньше, чем у мастера: от открытых комнат
    // ведут не все. Сколько именно — считает `shownCorridors`, и его правило
    // проверено своей пробой (`mapAudience.test.ts`).
    const corridors = (svg: string) => (svg.match(/data-corridor=/g) ?? []).length;
    expect(corridors(players)).toBeLessThan(corridors(master));
    // Лист мастера по-прежнему рисует ВСЕ комнаты — прятать их у него нечего.
    expect(master).toContain('data-status="unexplored"');

    // Отряд прошёл подземелье целиком — и лист игроков сошёлся с листом
    // мастера клетка в клетку: правило прячет закрытое, а не рисует меньше.
    const walked: DungeonRecord = {
      ...dungeon,
      statuses: Object.fromEntries([
        ...Object.entries(dungeon.statuses),
        ...plan.rooms.map((r) => [`room-${r.number}`, "explored"]),
      ]) as DungeonRecord["statuses"],
    };
    const open = dungeonMapSvg(walked, "players");
    expect(drawnRooms(open)).toEqual(plan.rooms.map((r) => r.number));
    expect(corridors(open)).toBe(corridors(dungeonMapSvg(walked, "master")));
  });

  it("номер отметки на обоих листах один и тот же", () => {
    // Лут и точка интереса — четвёртая и пятая отметки схемы. На листе игроков
    // они единственные, но подписаны по-прежнему «4» и «5»: перенумеруй их — и
    // два листа одного подземелья нельзя положить рядом.
    expect(markerLabels(dungeonMapSvg(dungeon, "master"))).toEqual([
      "1. Ловушка: исследовано",
      "2. Потайной ход: исследовано",
      "3. Дверь: не исследовано",
      "4. Лут: обнаружено",
      "5. Точка интереса: исследовано",
      "6. Лестница вниз: обнаружено",
    ]);
    expect(markerLabels(dungeonMapSvg(dungeon, "players"))).toEqual([
      "4. Лут: обнаружено",
      "5. Точка интереса: исследовано",
      "6. Лестница вниз: обнаружено",
    ]);
  });

  it("заметок мастера на листе игроков нет", () => {
    expect(dungeonMapSvg(dungeon, "master")).toContain("dungeon-map__note");
    expect(dungeonMapSvg(dungeon, "players")).not.toContain("dungeon-map__note");
  });

  it("семя и настройки подземелья — только на листе мастера", () => {
    expect(dungeonMapSvg(dungeon, "master")).toContain("номер схемы 20261018");
    expect(dungeonMapSvg(dungeon, "players")).not.toContain("20261018");
  });

  it("имя подземелья, легенда и подпись варианта — на обоих листах", () => {
    for (const audience of ["master", "players"] as const) {
      const svg = dungeonMapSvg(dungeon, audience);
      expect(svg).toContain("Склеп старого рода");
      expect(svg).toContain('aria-label="Легенда"');
      expect(svg).toContain("Статус комнаты");
    }
    expect(dungeonMapSvg(dungeon, "master")).toContain("для мастера");
    expect(dungeonMapSvg(dungeon, "players")).toContain("для игроков");
  });

  it("лист самодостаточен: пространство имён есть, внешних ссылок нет", () => {
    const svg = dungeonMapSvg(dungeon, "master");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // Картинка рисуется из Blob, и любая внешняя ссылка пришла бы в файл дырой.
    expect(svg).not.toMatch(/(href|url\()\s*=?\s*"?(https?:|\/\/)/);
  });

  it("фон светлый и непрозрачный, во весь лист", () => {
    const svg = dungeonMapSvg(dungeon, "players");
    const sheet = sheetSize(dungeon, "players");
    const px = pngSize(dungeon, "players");
    // Подложка — весь лист, а не только рамка схемы: прозрачных пикселей на
    // печати не остаётся даже там, где ничего не нарисовано.
    expect(svg).toContain(
      `<rect x="0" y="0" width="${sheet.width}" height="${sheet.height}" fill="${SHEET_BG}"`,
    );
    // Светлый — это свойство цвета, а не обещание: все три канала высокие.
    const channels = [1, 3, 5].map((i) => parseInt(SHEET_BG.slice(i, i + 2), 16));
    expect(Math.min(...channels)).toBeGreaterThan(0xe0);
    expect(svg).toContain(`width="${px.width}"`);
    expect(svg).toContain(`height="${px.height}"`);
  });
});

describe("разрешение картинки", () => {
  const dungeon = dungeonWithEveryKind();

  it("длинная сторона не меньше 2000 px — лист A4 печатается чётко", () => {
    for (const audience of ["master", "players"] as const) {
      const { width, height } = pngSize(dungeon, audience);
      expect(Math.max(width, height)).toBe(PNG_LONG_SIDE);
      expect(PNG_LONG_SIDE).toBeGreaterThanOrEqual(2000);
      expect(Math.min(width, height)).toBeGreaterThan(0);
    }
  });

  it("пропорции листа сохранены", () => {
    const { width, height } = pngSize(dungeon, "master");
    const svg = dungeonMapSvg(dungeon, "master");
    const box = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
    expect(box).not.toBeNull();
    const ratio = Number(box![1]) / Number(box![2]);
    expect(width / height).toBeCloseTo(ratio, 2);
  });
});

describe("легенда листа", () => {
  it("называет ровно те виды и статусы, которые на листе бывают", () => {
    for (const audience of ["master", "players"] as const) {
      const named = legendRows(audience)
        .filter((r) => r.row === "marker")
        .map((r) => (r as { kind: MarkerKind }).kind);
      // Ни одного вида сверх видимых — и каждый видимый назван.
      expect(new Set(named)).toEqual(new Set(shownKinds(audience)));
    }
    expect(shownStatuses("players")).not.toContain("unexplored");
  });

  it("«не исследовано» на листе игроков не объясняется ни у отметки, ни у комнаты", () => {
    const named = legendRows("players").filter((r) => r.row === "marker" || r.row === "floor");
    for (const row of named) {
      expect(shownStatuses("players")).toContain((row as { status: MarkerStatus }).status);
    }
    // У мастера оно объясняется — иначе легенда молчала бы о тоне пола,
    // который на его листе есть.
    expect(
      legendRows("master").some((r) => r.row === "floor" && r.status === "unexplored"),
    ).toBe(true);
  });

  it("строки «только для мастера» на листе игроков нет", () => {
    expect(legendRows("master").some((r) => r.row === "secret")).toBe(true);
    expect(legendRows("master").some((r) => r.row === "note")).toBe(true);
    expect(legendRows("players").some((r) => r.row === "secret")).toBe(false);
    expect(legendRows("players").some((r) => r.row === "note")).toBe(false);
  });

  it("выбранный лут объяснён только на листе мастера", () => {
    // engine-dungeon-loot-master-choice: признак лута на схеме мастера есть, и
    // легенда обязана его назвать — своей строкой, а не строкой заметки.
    expect(legendRows("master").some((r) => r.row === "loot")).toBe(true);
    expect(legendRows("players").some((r) => r.row === "loot")).toBe(false);
  });

  it("статус объясняется значком, который на листе есть", () => {
    const sample = legendRows("players").filter((r) => r.row === "marker");
    for (const row of sample) {
      expect(shownKinds("players")).toContain((row as { kind: MarkerKind }).kind);
    }
  });
});

describe("имя файла по умолчанию", () => {
  /** Одноэтажное подземелье с этим именем — `lowerFloors` нет вовсе. */
  const named = (name: string): DungeonRecord => ({ ...dungeonWithEveryKind(), name });

  /** То же подземелье, но в два этажа: второй — та же схема с номером этажа. */
  const twoFloors = (name: string): DungeonRecord => ({
    ...named(name),
    lowerFloors: [{ ...plan, floor: 2 } as unknown as DungeonPlan],
  });

  it("лист мастера — имя подземелья плюс .png", () => {
    expect(pngFileName(named("Склеп старого рода"), "master")).toBe("Склеп старого рода.png");
  });

  it("лист игроков просится в ДРУГОЙ файл, а не поверх мастерского", () => {
    const dungeon = named("Склеп старого рода");
    expect(pngFileName(dungeon, "players")).toBe("Склеп старого рода — для игроков.png");
    expect(pngFileName(dungeon, "players")).not.toBe(pngFileName(dungeon, "master"));
  });

  it("подпись листа игроков — та же, что у кнопки выбора листа", () => {
    // Подпись не переписана в пробу: разойдись имя файла с кнопкой — мастер
    // нажал бы «для игроков», а получил файл с другим словом.
    expect(pngFileName(named("Склеп"), "players")).toBe(
      `Склеп — ${MAP_AUDIENCE_LABELS.players}.png`,
    );
  });

  it("у многоэтажного в имени стоит ОТКРЫТЫЙ этаж, у одноэтажного этажа нет", () => {
    expect(pngFileName(twoFloors("Склеп"), "master", 2)).toBe("Склеп — этаж 2.png");
    expect(pngFileName(twoFloors("Склеп"), "players", 2)).toBe(
      "Склеп — этаж 2 — для игроков.png",
    );
    expect(pngFileName(twoFloors("Склеп"), "master", 1)).toBe("Склеп — этаж 1.png");
    // Одноэтажное: номер не появляется ни у одного листа, даже если открытым
    // объявлен первый этаж — других у него и нет.
    expect(pngFileName(named("Склеп"), "master", 1)).toBe("Склеп.png");
    expect(pngFileName(named("Склеп"), "players", 1)).toBe("Склеп — для игроков.png");
  });

  it("номер этажа в имени файла — тот же, что в заголовке листа", () => {
    // Числа из одной руки: заголовок печатает `floorLabel`, и имя файла обязано
    // называть тот же этаж — иначе файл «этаж 2» нёс бы лист третьего.
    const dungeon = twoFloors("Склеп");
    const title = sheetTitle(dungeon, 2);
    expect(title).toContain(floorLabel(2));
    expect(pngFileName(dungeon, "master", 2)).toContain(floorLabel(2).toLowerCase());
  });

  it("запрещённые в имени файла знаки заменяются, а не роняют диалог", () => {
    expect(pngFileName(named("Склеп: нижний/ярус?"), "master")).toBe("Склеп_ нижний_ярус_.png");
    expect(pngFileName(named("Логово  "), "master")).toBe("Логово.png");
    // Точка в конце имени файла на Windows отваливается молча — срезаем сами.
    expect(pngFileName(named("Логово..."), "master")).toBe("Логово.png");
    expect(pngFileName(named("///"), "master")).toBe("___.png");
    // Пустым имя файла не бывает: от имени из одних точек не остаётся ничего.
    expect(pngFileName(named("..."), "master")).toBe("подземелье.png");
    expect(pngFileName(named("   "), "master")).toBe("подземелье.png");
    // Замена и запасное имя достаются обоим листам, а не одному мастерскому.
    expect(pngFileName(named("Склеп: нижний/ярус?"), "players")).toBe(
      "Склеп_ нижний_ярус_ — для игроков.png",
    );
    expect(pngFileName(twoFloors("   "), "players", 2)).toBe(
      "подземелье — этаж 2 — для игроков.png",
    );
  });
});
