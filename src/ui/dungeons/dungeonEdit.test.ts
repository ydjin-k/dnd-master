import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { DungeonRecord, RuleTopic } from "../../state/types";
import type { DwellerSource } from "./dungeonDwellers";
import {
  readSeedInput,
  rebuildLosses,
  recipeOf,
  SEED_MAX,
  withDungeonRebuilt,
  withDungeonRenamed,
} from "./dungeonEdit";
import { EMPTY_LOOT_CHOICE, withLootChoice } from "./dungeonLootChoice";
import { withNote } from "./dungeonNotes";
import { generateDungeon, lineTitle } from "./dungeonGenerator";
import { roomKey } from "./markerStatus";
import { readTrapNumbers, type TrapNumbers } from "./trapNumbers";

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
const bestiary = bundledBestiary as DwellerSource[];

function record(over: Partial<DungeonRecord> = {}): DungeonRecord {
  const seed = over.seed ?? 4242;
  const plan = generateDungeon({
    seed,
    partyLevel: over.partyLevel ?? 3,
    danger: over.danger ?? "Опасная",
    numbers,
    bestiary,
    size: over.size,
    purposeRoll: over.purposeRoll ?? null,
  });
  return {
    id: "d1",
    name: lineTitle(plan.purpose!.text),
    createdAt: "2026-10-19T10:00:00Z",
    seed,
    partyLevel: 3,
    danger: "Опасная",
    statuses: {},
    ...over,
    plan: over.plan ?? plan,
  };
}

describe("рецепт подземелья", () => {
  it("у записи без новых полей — «Среднее» и «Случайно»", () => {
    const old = record();
    delete old.size;
    delete old.purposeRoll;
    expect(recipeOf(old)).toEqual({
      partyLevel: 3,
      danger: "Опасная",
      size: "Среднее",
      purposeRoll: null,
      // engine-dungeon-floors: этажи считаются по записи, и у записи без
      // `lowerFloors` их один — как у созданной до этажей.
      floors: 1,
    });
  });

  it("у записи с полями — они", () => {
    expect(recipeOf(record({ size: "Большое", purposeRoll: 7 }))).toEqual({
      partyLevel: 3,
      danger: "Опасная",
      size: "Большое",
      purposeRoll: 7,
      floors: 1,
    });
  });
});

describe("переименование", () => {
  it("имя подрезается по краям и записывается", () => {
    expect(withDungeonRenamed(record(), "  Логово у реки  ")?.name).toBe("Логово у реки");
  });

  it("пустое имя и имя из пробелов не сохраняются", () => {
    expect(withDungeonRenamed(record(), "")).toBeNull();
    expect(withDungeonRenamed(record(), "   ")).toBeNull();
    expect(withDungeonRenamed(record(), "\t \n")).toBeNull();
  });

  it("остальная запись не тронута", () => {
    const before = record({ statuses: { "trap-1": "explored" } });
    const after = withDungeonRenamed(before, "Другое имя")!;
    expect(after.seed).toBe(before.seed);
    expect(after.plan).toBe(before.plan);
    expect(after.statuses).toEqual({ "trap-1": "explored" });
  });
});

describe("семя с формы", () => {
  it("пустое поле — случайное семя", () => {
    expect(readSeedInput("")).toEqual({ kind: "random" });
    expect(readSeedInput("   ")).toEqual({ kind: "random" });
  });

  it("целое — оно само, вместе с краями промежутка", () => {
    expect(readSeedInput("0")).toEqual({ kind: "seed", seed: 0 });
    expect(readSeedInput(" 20261019 ")).toEqual({ kind: "seed", seed: 20261019 });
    expect(readSeedInput(String(SEED_MAX))).toEqual({ kind: "seed", seed: SEED_MAX });
  });

  it("мусор и перебор — ошибка, а не молча случайное семя", () => {
    for (const bad of ["abc", "-5", "1.5", "12 34", "0x10", "٣"]) {
      expect(readSeedInput(bad).kind, bad).toBe("error");
    }
    expect(readSeedInput(String(SEED_MAX + 1)).kind).toBe("error");
  });
});

describe("пересборка", () => {
  it("перечень потерь пуст у нетронутой схемы", () => {
    expect(rebuildLosses(record())).toEqual([]);
  });

  it("перечень называет статусы и ручные ловушки", () => {
    const plain = record();
    const marked = { ...plain, statuses: { "trap-1": "explored", "door-2": "discovered" } };
    expect(rebuildLosses(marked as DungeonRecord)).toEqual(["отметок со статусом: 2"]);

    const byMaster = {
      ...plain,
      plan: {
        ...plain.plan,
        markers: [
          ...plain.plan.markers,
          { ...plain.plan.markers[0], id: "trap-99", placedByMaster: true },
        ],
      },
    };
    expect(rebuildLosses(byMaster)).toEqual(["ловушек, поставленных руками: 1"]);
    expect(rebuildLosses({ ...byMaster, statuses: { "trap-1": "explored" } })).toEqual([
      "отметок со статусом: 1",
      "ловушек, поставленных руками: 1",
    ]);
  });

  it("комнаты со статусом считаются отдельно от отметок, хотя карта одна", () => {
    // journal-dungeon-room-status-and-notes: одной строкой перечень врал бы —
    // у пройденного подземелья он обещал бы потерю отметок, которых мастер не
    // касался.
    const plain = record();
    const mixed = {
      ...plain,
      statuses: { "trap-1": "explored", "room-1": "explored", "room-2": "discovered" },
    } as DungeonRecord;
    expect(rebuildLosses(mixed)).toEqual([
      "отметок со статусом: 1",
      "комнат со статусом: 2",
    ]);
    expect(rebuildLosses({ ...plain, statuses: { "room-3": "discovered" } } as DungeonRecord)).toEqual([
      "комнат со статусом: 1",
    ]);
  });

  it("перечень называет заметки мастера", () => {
    const plain = record();
    const noted = withNote(withNote(plain, roomKey(2, 1), "Рычаг"), "door-1", "скрипит");
    expect(rebuildLosses(noted)).toEqual(["заметок мастера: 2"]);
    // Стёртая заметка в записи не лежит и в перечень не попадает.
    expect(rebuildLosses(withNote(noted, "door-1", ""))).toEqual(["заметок мастера: 1"]);
  });

  it("перечень называет находки с выбранным лутом — отдельно от заметок", () => {
    // engine-dungeon-loot-master-choice: выбор мастера лежит тем же ключом,
    // что заметка, но теряется своим: строка «заметок мастера» о нём не
    // сказала бы ничего.
    const plain = record();
    const chosen = withLootChoice(
      withLootChoice(plain, "loot-1", { kinds: ["money"], text: "40 зм" }),
      "loot-2",
      { kinds: ["magic"], rarities: { magic: "редкий" }, text: "" },
    );
    expect(rebuildLosses(chosen)).toEqual(["находок с выбранным лутом: 2"]);
    // Снятый выбор в записи не лежит и в перечень не попадает.
    expect(rebuildLosses(withLootChoice(chosen, "loot-2", EMPTY_LOOT_CHOICE))).toEqual([
      "находок с выбранным лутом: 1",
    ]);
    // Рядом с заметкой — две строки, а не одна.
    expect(rebuildLosses(withNote(chosen, "loot-1", "сундук под плитой"))).toEqual([
      "заметок мастера: 1",
      "находок с выбранным лутом: 2",
    ]);
  });

  it("выбранный лут уходит вместе со старой схемой", () => {
    const before = withLootChoice(record(), "loot-1", { kinds: ["artifact"], text: "чаша" });
    const after = withDungeonRebuilt(before, 4242 + 2, numbers, bestiary);
    expect(after.loot).toEqual({});
    // Старая запись не тронута: пересборка возвращает новую.
    expect(before.loot).toEqual({ "loot-1": { kinds: ["artifact"], text: "чаша" } });
  });

  it("новое семя, те же уровень, опасность, размер и назначение", () => {
    const before = record({ size: "Большое", purposeRoll: 7, statuses: { "trap-1": "explored" } });
    const after = withDungeonRebuilt(before, 777, numbers, bestiary);
    expect(after.seed).toBe(777);
    expect([after.size, after.purposeRoll]).toEqual(["Большое", 7]);
    expect([after.partyLevel, after.danger]).toEqual([3, "Опасная"]);
    expect(after.plan.purpose!.roll).toBe(7);
    expect(after.plan.rooms.length).toBe(before.plan.rooms.length);
    expect(after.plan.rooms).not.toEqual(before.plan.rooms);
    expect(after.statuses).toEqual({});
    expect(after.id).toBe(before.id);
  });

  it("заметки и статусы комнат уходят вместе со старой схемой", () => {
    const before = withNote(
      withNote(record({ statuses: { "room-2": "explored", "trap-1": "discovered" } }), roomKey(2, 1), "Рычаг"),
      "trap-1",
      "сработала",
    );
    const after = withDungeonRebuilt(before, 4242 + 1, numbers, bestiary);
    expect(after.notes).toEqual({});
    expect(after.statuses).toEqual({});
    // Старая запись не тронута: пересборка возвращает новую.
    expect(before.notes).toEqual({ "room-2": "Рычаг", "trap-1": "сработала" });
  });

  it("схема пересобранного равна схеме, созданной тем же семенем и рецептом", () => {
    const before = record({ size: "Малое", purposeRoll: 3 });
    const after = withDungeonRebuilt(before, 31337, numbers, bestiary);
    expect(after.plan).toEqual(
      generateDungeon({
        seed: 31337,
        partyLevel: 3,
        danger: "Опасная",
        numbers,
        bestiary,
        size: "Малое",
        purposeRoll: 3,
      }),
    );
  });

  it("запись без новых полей пересобирается как «Среднее / Случайно»", () => {
    const old = record();
    delete old.size;
    delete old.purposeRoll;
    const after = withDungeonRebuilt(old, 20261018, numbers, bestiary);
    // Семя эталона: «Среднее» со случайным назначением даёт ровно его схему.
    expect(after.plan).toEqual(
      generateDungeon({ seed: 20261018, partyLevel: 3, danger: "Опасная", numbers, bestiary }),
    );
    expect(after.size).toBe("Среднее");
  });

  it("имя мастера остаётся, генераторное едет за новым назначением", () => {
    const generated = record();
    const rebuilt = withDungeonRebuilt(generated, 909090, numbers, bestiary);
    expect(rebuilt.name).toBe(lineTitle(rebuilt.plan.purpose!.text));

    const renamed = withDungeonRenamed(generated, "Логово у реки")!;
    expect(withDungeonRebuilt(renamed, 909090, numbers, bestiary).name).toBe("Логово у реки");
  });
});
