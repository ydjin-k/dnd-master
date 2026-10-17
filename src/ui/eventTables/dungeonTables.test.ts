import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
// Список чужих ярлыков живёт в пробе каталога, и владелец у него один. Здесь он
// читается из её исходника (`?raw`), а не переписывается: новый ярлык, внесённый
// туда, сразу ловится и в таблицах подземелья.
import catalogGuardSource from "./index.test.ts?raw";
import { DUNGEON_TABLES, findDungeonTable } from "./dungeonTables";
import { EVENT_TABLES, findCoverageGap, STUDIO_AUTHORED_DUNGEON_TABLES } from "./index";

const FOREIGN_LABELS: [string, RegExp][] = [
  ...catalogGuardSource.matchAll(/^\s*\["([^"]+)",\s*\/(.+)\/([a-z]*)\],?\s*$/gm),
].map(([, name, body, flags]) => [name, new RegExp(body, flags)]);

describe("таблицы подземелья", () => {
  it("девять таблиц, каждая закрывает свою кость ровно", () => {
    expect(DUNGEON_TABLES.map((t) => [t.id, t.die])).toEqual([
      ["dungeon-purpose", 8],
      ["dungeon-entrance", 8],
      ["dungeon-room", 12],
      ["dungeon-passage", 8],
      ["dungeon-door", 6],
      ["dungeon-dwellers", 10],
      ["dungeon-loot", 10],
      ["dungeon-feature", 8],
      ["dungeon-secret", 6],
    ]);
    expect(DUNGEON_TABLES.map(findCoverageGap).filter(Boolean)).toEqual([]);
  });

  it("своё происхождение и вне списка выбора «Приключений»", () => {
    for (const table of DUNGEON_TABLES) {
      expect(table.source).toBe(STUDIO_AUTHORED_DUNGEON_TABLES);
      expect(EVENT_TABLES.some((t) => t.id === table.id)).toBe(false);
    }
  });

  it("строка — «Название — особенность», как у восьми тем", () => {
    for (const table of DUNGEON_TABLES) {
      for (const row of table.rows) expect(row.text, `${table.id}:${row.from}`).toMatch(/^[^—]+ — \S/);
    }
  });

  it("обитатели ссылаются только на существ бестиария", () => {
    const ids = new Set((bundledBestiary as { id: string }[]).map((m) => m.id));
    const missing = findDungeonTable("dungeon-dwellers")!
      .rows.flatMap((row) => row.monsterIds ?? [])
      .filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it("список ярлыков прочитан из пробы каталога, а не пуст", () => {
    expect(FOREIGN_LABELS.length).toBeGreaterThanOrEqual(30);
    expect(FOREIGN_LABELS.some(([name]) => name === "иллитид")).toBe(true);
  });

  it("в строках и именах таблиц нет чужих ярлыков", () => {
    const hits: string[] = [];
    for (const table of DUNGEON_TABLES) {
      for (const text of [table.name, ...table.rows.map((r) => r.text)]) {
        for (const [name, re] of FOREIGN_LABELS) if (re.test(text)) hits.push(`${table.id}: ${name}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("сторож краснеет на чужом ярлыке в строке", () => {
    const text = "Бехолдер дремлет — Глаз на стебле приоткрыт.";
    expect(FOREIGN_LABELS.some(([, re]) => re.test(text))).toBe(true);
  });
});
