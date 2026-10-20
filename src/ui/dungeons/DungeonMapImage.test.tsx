import { describe, expect, it } from "vitest";
import type { DungeonRecord } from "../../state/types";
import mediumPlan from "./__fixtures__/mediumPlan.20261018.json";
import type { DungeonPlan, MarkerKind } from "./dungeonGenerator";
import { MARKER_KINDS } from "./dungeonGenerator";
import {
  dungeonMapSvg,
  legendRows,
  PNG_LONG_SIDE,
  pngFileName,
  pngSize,
  SHEET_BG,
  sheetSize,
} from "./DungeonMapImage";
import { shownKinds, shownStatuses } from "./mapAudience";

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

/** Подписи отметок: `aria-label` начинается с номера, который стоит на схеме. */
function markerLabels(svg: string): string[] {
  return [...svg.matchAll(/aria-label="(\d+\. [^"]+)"/g)].map((m) => m[1]);
}

describe("лист со схемой", () => {
  const dungeon = dungeonWithEveryKind();

  it("мастеру отдаёт все пять видов отметок и все статусы", () => {
    const svg = dungeonMapSvg(dungeon, "master");
    expect(drawnMarkers(svg).sort()).toEqual(
      ["door-9", "feature-9", "loot-9", "secret-9", "trap-9"].sort(),
    );
    expect(new Set(drawnKinds(svg))).toEqual(new Set(MARKER_KINDS));
    expect(svg).toContain('data-status="unexplored"');
  });

  it("листу игроков не достаются ни неисследованные отметки, ни ловушки, ни потайные ходы", () => {
    const svg = dungeonMapSvg(dungeon, "players");
    // `door-9` — «не исследовано», `trap-9` и `secret-9` — исследованные
    // ловушка и потайной ход: уходят все три, каждая по своей причине.
    expect(drawnMarkers(svg)).toEqual(["loot-9", "feature-9"]);
    expect(drawnKinds(svg)).not.toContain("trap");
    expect(drawnKinds(svg)).not.toContain("secret");
    // «не исследовано» не осталось ни у одной ОТМЕТКИ. У комнат статус
    // остаётся: пол неисследованной комнаты — чистый пергамент, и прятать
    // комнаты карточка не просила.
    expect(svg).not.toMatch(/data-kind="[^"]+" data-status="unexplored"/);
    expect(dungeonMapSvg(dungeon, "master")).toMatch(
      /data-kind="door" data-status="unexplored"/,
    );
    // Пунктир потайного хода — тот же секрет, нарисованный иначе.
    expect(svg).not.toContain("dungeon-map__secret-path");
    expect(dungeonMapSvg(dungeon, "master")).toContain("dungeon-map__secret-path");
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
    ]);
    expect(markerLabels(dungeonMapSvg(dungeon, "players"))).toEqual([
      "4. Лут: обнаружено",
      "5. Точка интереса: исследовано",
    ]);
  });

  it("заметок мастера на листе игроков нет", () => {
    expect(dungeonMapSvg(dungeon, "master")).toContain("dungeon-map__note");
    expect(dungeonMapSvg(dungeon, "players")).not.toContain("dungeon-map__note");
  });

  it("семя и настройки подземелья — только на листе мастера", () => {
    expect(dungeonMapSvg(dungeon, "master")).toContain("семя 20261018");
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

  it("строки «только для мастера» на листе игроков нет", () => {
    expect(legendRows("master").some((r) => r.row === "secret")).toBe(true);
    expect(legendRows("master").some((r) => r.row === "note")).toBe(true);
    expect(legendRows("players").some((r) => r.row === "secret")).toBe(false);
    expect(legendRows("players").some((r) => r.row === "note")).toBe(false);
  });

  it("статус объясняется значком, который на листе есть", () => {
    const sample = legendRows("players").filter((r) => r.row === "marker");
    for (const row of sample) {
      expect(shownKinds("players")).toContain((row as { kind: MarkerKind }).kind);
    }
  });
});

describe("имя файла по умолчанию", () => {
  it("имя подземелья плюс .png", () => {
    expect(pngFileName("Склеп старого рода")).toBe("Склеп старого рода.png");
  });

  it("запрещённые в имени файла знаки заменяются, а не роняют диалог", () => {
    expect(pngFileName("Склеп: нижний/ярус?")).toBe("Склеп_ нижний_ярус_.png");
    expect(pngFileName("Логово  ")).toBe("Логово.png");
    // Точка в конце имени файла на Windows отваливается молча — срезаем сами.
    expect(pngFileName("Логово...")).toBe("Логово.png");
    expect(pngFileName("///")).toBe("___.png");
    // Пустым имя файла не бывает: от имени из одних точек не остаётся ничего.
    expect(pngFileName("...")).toBe("подземелье.png");
    expect(pngFileName("   ")).toBe("подземелье.png");
  });
});
