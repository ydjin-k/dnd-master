import { describe, expect, it } from "vitest";
import type { DungeonRecord } from "../../state/types";
import type { DungeonPlan } from "./dungeonGenerator";
import {
  markerShown,
  playersRecord,
  roomShown,
  shownCorridors,
  shownStatuses,
} from "./mapAudience";

/**
 * Что видно игрокам — решение владельца 21.10.2026 «Прятать неисследованные».
 *
 * Схема здесь собирается руками, а не генератором: правило про проходы
 * проверяется на заранее известной развилке, и выпавшая схема на каждом семени
 * ставила бы её в новое место. Как это же правило работает на настоящей схеме,
 * проверяют пробы листа PNG (`DungeonMapImage.test.tsx`) и окна игроков
 * (`PlayersWindow.test.tsx`).
 *
 * Развилка (клетки, точка — проход):
 *
 *   комната 1 ···· комната 2      проход 1↔2: (3,1) (4,1) (5,1)
 *             ·
 *             ·                   ответвление к комнате 3:
 *   комната 3 ·                   (4,2) (4,3) (4,4) (4,5) (4,6) (3,6)
 */

const CORRIDOR_1_2: [number, number][] = [
  [3, 1],
  [4, 1],
  [5, 1],
];

const BRANCH_TO_3: [number, number][] = [
  [4, 2],
  [4, 3],
  [4, 4],
  [4, 5],
  [4, 6],
  [3, 6],
];

function plan(): DungeonPlan {
  return {
    seed: 20261021,
    partyLevel: 3,
    danger: "Опасная",
    width: 10,
    height: 10,
    purpose: { roll: 1, text: "Усыпальница" },
    entrance: { roll: 2, text: "Пролом в стене" },
    rooms: [
      {
        number: 1,
        x: 1,
        y: 1,
        w: 2,
        h: 2,
        kind: { roll: 3, text: "Караулка" },
        dwellers: null,
      },
      {
        number: 2,
        x: 6,
        y: 1,
        w: 2,
        h: 2,
        kind: { roll: 4, text: "Молельня" },
        dwellers: {
          roll: 5,
          text: "Стая волков",
          monsters: [{ id: "wolf", name: "Волк" }],
        },
      },
      {
        number: 3,
        x: 1,
        y: 6,
        w: 2,
        h: 2,
        kind: { roll: 6, text: "Склад с припасами" },
        dwellers: null,
      },
    ],
    corridors: [...CORRIDOR_1_2, ...BRANCH_TO_3],
    secretPath: [
      [2, 2],
      [6, 1],
    ],
    markers: [
      {
        id: "door-1",
        kind: "door",
        x: 3,
        y: 1,
        line: { roll: 1, text: "Створка из дуба" },
        trap: null,
        connects: null,
      },
      {
        id: "trap-1",
        kind: "trap",
        x: 5,
        y: 1,
        line: null,
        trap: {
          name: "Яма",
          dc: 13,
          damage: "2d6",
        } as unknown as DungeonPlan["markers"][number]["trap"],
        connects: null,
      },
    ],
  } as DungeonPlan;
}

/** Комнаты 1 и 2 открыты, 3 — нет; дверь обнаружена, ловушка исследована. */
function dungeon(statuses: Record<string, string> = {}): DungeonRecord {
  return {
    id: "d-players",
    name: "Склеп старого рода",
    createdAt: "2026-10-21T10:00:00Z",
    seed: 20261021,
    partyLevel: 3,
    danger: "Опасная",
    plan: plan(),
    statuses: {
      "room-1": "discovered",
      "room-2": "explored",
      "door-1": "discovered",
      "trap-1": "explored",
      ...statuses,
    } as DungeonRecord["statuses"],
    notes: { "room-2": "подменить алтарь", "door-1": "скрипит" },
  };
}

describe("комната на листе игроков", () => {
  it("видна обнаруженная и исследованная, не видна неисследованная", () => {
    const d = dungeon();
    expect(roomShown(d, 1, 1, "players")).toBe(true);
    expect(roomShown(d, 2, 1, "players")).toBe(true);
    expect(roomShown(d, 3, 1, "players")).toBe(false);
  });

  it("мастеру видны все, включая неисследованную", () => {
    const d = dungeon();
    for (const number of [1, 2, 3]) expect(roomShown(d, number, 1, "master")).toBe(true);
  });

  it("правило — те же статусы, что у отметки: второго перечня нет", () => {
    expect(shownStatuses("players")).not.toContain("unexplored");
    const d = dungeon();
    // Комната без записи в статусах — «не исследовано», как и отметка.
    expect(roomShown(d, 9, 1, "players")).toBe(false);
  });

  it("статусы читаются с приставкой этажа: комната 1 второго этажа — своя", () => {
    const d = dungeon({ "f2-room-1": "discovered" });
    expect(roomShown(d, 1, 2, "players")).toBe(true);
    expect(roomShown(d, 2, 2, "players")).toBe(false);
  });
});

describe("проход на листе игроков", () => {
  it("виден между двумя открытыми комнатами", () => {
    expect(shownCorridors(dungeon(), plan(), "players")).toEqual(CORRIDOR_1_2);
  });

  it("ответвление к неоткрытой комнате срезано до развилки", () => {
    const shown = shownCorridors(dungeon(), plan(), "players");
    for (const cell of BRANCH_TO_3) expect(shown).not.toContainEqual(cell);
  });

  it("открыта одна комната — проходов не видно вовсе", () => {
    const d = dungeon({ "room-2": "unexplored" });
    expect(shownCorridors(d, plan(), "players")).toEqual([]);
  });

  it("открылась комната 3 — ответвление к ней появилось целиком", () => {
    const d = dungeon({ "room-3": "discovered" });
    const shown = shownCorridors(d, plan(), "players");
    for (const cell of [...CORRIDOR_1_2, ...BRANCH_TO_3]) expect(shown).toContainEqual(cell);
  });

  it("кольцо прохода у одной открытой комнаты не показывается целиком", () => {
    // Кольцо (клетки по кругу) тупиками не выглядит: у каждой клетки два
    // соседа, и срезать у него нечего. А ведёт оно из открытой комнаты в
    // закрытое — показывать его нельзя, и убирает его счёт открытых комнат у
    // всего куска, а не срезка тупиков.
    const ring: [number, number][] = [
      [1, 3],
      [2, 3],
      [1, 4],
      [2, 4],
    ];
    const withRing: DungeonPlan = {
      ...plan(),
      corridors: [...CORRIDOR_1_2, ...BRANCH_TO_3, ...ring],
    };
    expect(shownCorridors(dungeon(), withRing, "players")).toEqual(CORRIDOR_1_2);
  });

  it("мастеру видны все проходы", () => {
    expect(shownCorridors(dungeon(), plan(), "master")).toEqual(plan().corridors);
  });
});

describe("копия записи для окна игроков", () => {
  const copy = playersRecord(dungeon(), 1);

  it("неоткрытой комнаты в копии нет вовсе", () => {
    expect(copy.plan.rooms.map((r) => r.number)).toEqual([1, 2]);
  });

  it("проходов в копии ровно столько, сколько видно", () => {
    expect(copy.plan.corridors.map(([x, y]) => [x, y])).toEqual(CORRIDOR_1_2);
  });

  it("отметки — только видимые игрокам, и без описаний", () => {
    // Ловушка уходит по виду, дверь остаётся по статусу — то же правило, что
    // на листе PNG, и спрошено оно тем же `markerShown`.
    expect(copy.plan.markers.map((m) => m.id)).toEqual(["door-1"]);
    expect(markerShown(dungeon(), plan().markers[1], "players")).toBe(false);
    expect(copy.plan.markers[0].line).toBeNull();
    expect(copy.plan.markers[0].trap).toBeNull();
  });

  it("описаний комнат, обитателей, заметок и семени в копии нет", () => {
    expect(copy.plan.rooms.map((r) => r.kind.text)).toEqual(["", ""]);
    expect(copy.plan.rooms.every((r) => r.dwellers === null)).toBe(true);
    expect(copy.notes).toEqual({});
    expect(copy.seed).toBe(0);
    expect(copy.plan.seed).toBe(0);
    expect(copy.plan.purpose).toBeUndefined();
    expect(copy.plan.entrance).toBeUndefined();
    // Ни одного секрета не осталось и в целом тексте копии — проверяется
    // строкой, а не полями: новое поле записи попадёт сюда само.
    const text = JSON.stringify(copy);
    for (const secret of [
      "Склад с припасами",
      "Стая волков",
      "подменить алтарь",
      "скрипит",
      "20261021",
      "Яма",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("статусы — только у того, что в копии осталось", () => {
    expect(copy.statuses).toEqual({ "room-1": "discovered", "room-2": "explored", "door-1": "discovered" });
  });

  it("имя подземелья в копии есть: оно и на листе игроков напечатано", () => {
    expect(copy.name).toBe("Склеп старого рода");
  });

  it("нижних этажей в копии нет, а приставка ключей у этажа своя", () => {
    // У схемы нижнего этажа приставка стоит и у `id` отметок, и у ключей
    // комнат (`floorPrefix`): статусы первого этажа ей не достаются.
    const lower = plan();
    const two: DungeonRecord = {
      ...dungeon({ "f2-room-1": "explored" }),
      lowerFloors: [
        {
          ...lower,
          floor: 2,
          markers: lower.markers.map((m) => ({ ...m, id: `f2-${m.id}` })),
        },
      ],
    };
    const second = playersRecord(two, 2);
    expect(second.lowerFloors).toEqual([]);
    expect(second.plan.floor).toBe(2);
    expect(second.plan.rooms.map((r) => r.number)).toEqual([1]);
    expect(second.statuses).toEqual({ "f2-room-1": "explored" });
  });
});
