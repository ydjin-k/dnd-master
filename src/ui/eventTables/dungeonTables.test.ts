import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
// Список чужих ярлыков живёт в пробе каталога, и владелец у него один. Здесь он
// читается из её исходника (`?raw`), а не переписывается: новый ярлык, внесённый
// туда, сразу ловится и в таблицах подземелья.
import catalogGuardSource from "./index.test.ts?raw";
import { DWELLER_TIERS, rowFitsTier, type DwellerSource } from "../dungeons/dungeonDwellers";
import { DUNGEON_TABLES, findDungeonTable } from "./dungeonTables";
import {
  EVENT_TABLES,
  findCoverageGap,
  STUDIO_AUTHORED_DUNGEON_TABLES,
  type EventTableRow,
} from "./index";

const FOREIGN_LABELS: [string, RegExp][] = [
  ...catalogGuardSource.matchAll(/^\s*\["([^"]+)",\s*\/(.+)\/([a-z]*)\],?\s*$/gm),
].map(([, name, body, flags]) => [name, new RegExp(body, flags)]);

const bestiary = bundledBestiary as DwellerSource[];
const dwellerRows = findDungeonTable("dungeon-dwellers")!.rows;

/**
 * Ступени, на которых подходящих строк меньше пяти. Пусто — требование
 * карточки выполнено. Берётся настоящий бестиарий: ПО живёт там, а строка
 * знает только `id`, и дыра появляется ровно тогда, когда существо уезжает.
 */
function tiersBelowFive(rows: readonly EventTableRow[]): string[] {
  return DWELLER_TIERS.filter(
    (tier) => rows.filter((row) => rowFitsTier(row, tier, bestiary)).length < 5,
  ).map((tier) => `${tier.fromLevel}–${tier.toLevel}`);
}

describe("таблицы подземелья", () => {
  it("девять таблиц, каждая закрывает свою кость ровно", () => {
    expect(DUNGEON_TABLES.map((t) => [t.id, t.die])).toEqual([
      ["dungeon-purpose", 16],
      ["dungeon-entrance", 16],
      ["dungeon-room", 20],
      ["dungeon-passage", 16],
      ["dungeon-door", 12],
      ["dungeon-dwellers", 20],
      ["dungeon-loot", 20],
      ["dungeon-feature", 16],
      ["dungeon-secret", 12],
    ]);
    expect(DUNGEON_TABLES.map(findCoverageGap).filter(Boolean)).toEqual([]);
  });

  it("строк ровно столько, сколько сторон у кости", () => {
    // Каждая строка таблиц подземелья — одно число, поэтому «строк меньше, чем
    // сторон» означает дыру, а «больше» — что часть строк не выпадает никогда.
    expect(DUNGEON_TABLES.map((t) => [t.id, t.rows.length])).toEqual(
      DUNGEON_TABLES.map((t) => [t.id, t.die]),
    );
  });

  it("сторож дыр краснеет на потерянной строке", () => {
    const rooms = findDungeonTable("dungeon-room")!;
    const short = { ...rooms, rows: rooms.rows.slice(0, -1) };
    expect(findCoverageGap(short)).not.toBeNull();
  });

  it("комнат не меньше двадцати — больше самого большого подземелья", () => {
    // Генератор берёт вид комнаты «без повторов» (`rollLine` в
    // `dungeonGenerator.ts`): строк обязано быть больше, чем комнат в схеме,
    // иначе перебросы не кончатся. Самое большое подземелье — 14 комнат.
    expect(findDungeonTable("dungeon-room")!.rows.length).toBeGreaterThanOrEqual(20);
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

  it("на каждой ступени отряда выпадает не меньше пяти строк обитателей", () => {
    expect(tiersBelowFive(dwellerRows)).toEqual([]);
  });

  it("сторож ступеней краснеет, когда на ступени осталось четыре строки", () => {
    // Отрицательная проба на настоящих строках: с верхней ступени снимается
    // всё, кроме четырёх подходящих, — и сторож обязан назвать эту ступень.
    const top = DWELLER_TIERS[DWELLER_TIERS.length - 1];
    const fits = dwellerRows.filter((row) => rowFitsTier(row, top, bestiary));
    const thin = [...dwellerRows.filter((row) => !fits.includes(row)), ...fits.slice(0, 4)];
    expect(tiersBelowFive(thin)).toContain(`${top.fromLevel}–${top.toLevel}`);
  });

  it("строка «пусто, но обжито» на месте: на ней держится конечность перебросов", () => {
    // `rollLine` перебрасывает, пока строка не подойдёт ступени; строка без
    // существ подходит всегда. Без неё высокая ступень могла бы зациклить.
    const always = dwellerRows.filter((row) => (row.monsterIds ?? []).length === 0);
    expect(always.map((row) => row.text)).toEqual([
      "Пусто, но обжито — Кто-то ушёл недавно: зола ещё тёплая, следы ведут вглубь.",
    ]);
    for (const tier of DWELLER_TIERS) expect(rowFitsTier(always[0], tier, bestiary)).toBe(true);
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
