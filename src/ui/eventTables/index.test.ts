import { describe, it, expect } from "vitest";
import bundledSpells from "../../../src-tauri/rules/spells.json";
import {
  EVENT_TABLES,
  TABLE_GROUPS,
  findCoverageGap,
  findTable,
  rollExpression,
  rowForRoll,
  type EventTable,
} from "./index";

/** Копия таблицы с подменёнными строками — чтобы ломать её, не трогая данные. */
function withRows(table: EventTable, rows: EventTable["rows"]): EventTable {
  return { ...table, rows };
}

describe("таблицы генератора событий", () => {
  it("каждая таблица закрывает свою кость без дыр и нахлёстов", () => {
    const broken = EVENT_TABLES.map(findCoverageGap).filter((gap) => gap !== null);
    expect(broken).toEqual([]);
  });

  it("кость берётся у таблицы, а не у вызывающего кода", () => {
    // Разброс костей в переданных документах — это не догадка: он и есть
    // причина, по которой кость обязана жить в таблице.
    const dice = new Set(EVENT_TABLES.map((t) => t.die));
    expect(dice.size).toBeGreaterThan(1);
    expect(rollExpression(findTable("fey-marks")!)).toBe("1d8");
    expect(rollExpression(findTable("plot-twists")!)).toBe("1d150");
    expect(rollExpression(findTable("battle-11")!)).toBe("1d6");
  });

  it("у каждой таблицы записано происхождение, а id не повторяются", () => {
    const ids = EVENT_TABLES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const table of EVENT_TABLES) {
      expect(table.source).not.toBe("");
      expect(TABLE_GROUPS).toContain(table.group as (typeof TABLE_GROUPS)[number]);
    }
  });

  it("каждое число кости находит свою строку", () => {
    for (const table of EVENT_TABLES) {
      for (let n = 1; n <= table.die; n += 1) {
        expect(rowForRoll(table, n), `${table.id} → ${n}`).toBeDefined();
      }
    }
  });

  it("строка, ссылающаяся на заклинание, называет существующий id spells.json", () => {
    const known = new Set(bundledSpells.map((spell) => spell.id));
    for (const table of EVENT_TABLES) {
      for (const row of table.rows) {
        for (const id of row.spellIds ?? []) {
          expect(known.has(id), `${table.id} → ${row.from}: заклинание "${id}"`).toBe(true);
        }
      }
    }
  });

  // ── отрицательные пробы: страж обязан краснеть, а не молчать ──────────────

  it("дыра в диапазонах краснеет и называет таблицу и незакрытое число", () => {
    const table = findTable("fey-marks")!;
    const holed = withRows(
      table,
      table.rows.filter((row) => row.from !== 5),
    );
    const gap = findCoverageGap(holed);
    expect(gap).toContain("Метки фей");
    expect(gap).toContain("5");
    expect(gap).toContain("d8");
  });

  it("дыра в слитой таблице грибов краснеет на числе из влитой части", () => {
    // Слияние тринадцати грибов Подземья в d100 первой волны сдвинуло кость до
    // d113. Дыру пробиваем в ВЛИТОЙ части: там ошибка нумерации и вероятна.
    const table = findTable("magic-mushrooms")!;
    expect(table.die).toBe(113);
    const holed = withRows(
      table,
      table.rows.filter((row) => row.from !== 107),
    );
    const gap = findCoverageGap(holed);
    expect(gap).toContain("Волшебные грибы");
    expect(gap).toContain("107");
    expect(gap).toContain("d113");
  });

  it("нахлёст диапазонов краснеет и называет таблицу и число", () => {
    const table = findTable("fey-marks")!;
    const overlapped = withRows(table, [
      ...table.rows,
      { from: 3, to: 3, text: "вторая строка на то же число" },
    ]);
    const gap = findCoverageGap(overlapped);
    expect(gap).toContain("Метки фей");
    expect(gap).toContain("3");
    expect(gap).toContain("2 строками");
  });

  it("строка за пределами кости краснеет", () => {
    const table = findTable("fey-marks")!;
    const overflowing = withRows(table, [
      ...table.rows,
      { from: 9, to: 9, text: "число, которого на кости нет" },
    ]);
    expect(findCoverageGap(overflowing)).toContain("9");
  });
});
