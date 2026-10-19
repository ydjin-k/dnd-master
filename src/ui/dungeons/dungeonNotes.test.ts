import { describe, expect, it } from "vitest";
import type { DungeonRecord } from "../../state/types";
import type { DungeonPlan } from "./dungeonGenerator";
import { hasNote, noteCount, noteOf, withNote } from "./dungeonNotes";
import { roomKey } from "./markerStatus";

const dungeon: DungeonRecord = {
  id: "d1",
  name: "Склеп старого рода",
  createdAt: "2026-10-19T10:00:00Z",
  seed: 7,
  partyLevel: 3,
  danger: "Опасная",
  plan: { markers: [] } as unknown as DungeonPlan,
  statuses: {},
};

describe("заметка мастера", () => {
  it("у записи без заметок — пустая строка и ни одной заметки", () => {
    expect(noteOf(dungeon, "trap-1")).toBe("");
    expect(hasNote(dungeon, "trap-1")).toBe(false);
    expect(noteCount(dungeon)).toBe(0);
  });

  it("заметка к комнате и к отметке лежат в одной карте, под ключом статуса", () => {
    const written = withNote(withNote(dungeon, roomKey(3), "Рычаг за гобеленом"), "trap-1", "сработала");
    expect(written.notes).toEqual({ "room-3": "Рычаг за гобеленом", "trap-1": "сработала" });
    expect(noteOf(written, roomKey(3))).toBe("Рычаг за гобеленом");
    expect(noteCount(written)).toBe(2);
    expect(hasNote(written, "trap-1")).toBe(true);
    expect(hasNote(written, "door-2")).toBe(false);
  });

  it("пустая заметка и заметка из одних пробелов удаляются из записи", () => {
    const written = withNote(dungeon, roomKey(3), "Рычаг за гобеленом");
    expect(withNote(written, roomKey(3), "").notes).toEqual({});
    expect(withNote(written, roomKey(3), "   \n\t").notes).toEqual({});
    expect(noteCount(withNote(written, roomKey(3), ""))).toBe(0);
  });

  it("стирание одной заметки не трогает соседние", () => {
    const written = withNote(withNote(dungeon, roomKey(3), "Рычаг"), roomKey(4), "Колодец");
    expect(withNote(written, roomKey(3), "").notes).toEqual({ "room-4": "Колодец" });
  });

  it("пробелы внутри и по краям текста сохраняются как набраны", () => {
    // Подрезка на каждом нажатии не дала бы поставить пробел между словами.
    const written = withNote(dungeon, roomKey(1), "Два слова ");
    expect(noteOf(written, roomKey(1))).toBe("Два слова ");
  });

  it("запись не правится на месте", () => {
    const before = withNote(dungeon, roomKey(1), "Было");
    withNote(before, roomKey(1), "Стало");
    expect(noteOf(before, roomKey(1))).toBe("Было");
  });
});
