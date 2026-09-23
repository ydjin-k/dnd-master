import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import { findCoverageGap, rowForRoll, type EventTable } from "./eventTables";
import type { RuleTopic } from "../state/types";
import {
  MADNESS_LADDER,
  MADNESS_MAX_LEVEL,
  MADNESS_ROLL_EXPRESSION,
  MADNESS_TOPIC_ID,
  madnessConditionName,
  madnessCoverageGap,
  madnessDurationText,
  madnessEffectLines,
  madnessLevelOf,
  madnessTable,
  nextMadnessLevel,
  parseMadnessCondition,
  readMadnessRules,
  withMadness,
  type MadnessRules,
} from "./madness";

const rules = bundledRules as RuleTopic[];

function loaded(): MadnessRules {
  const read = readMadnessRules(rules);
  expect(read, `раздел ${MADNESS_TOPIC_ID} не прочитался`).not.toBeNull();
  return read as MadnessRules;
}

/** Копия таблицы с подменёнными строками — чтобы ломать её, не трогая rules.json. */
function withRows(table: EventTable, rows: EventTable["rows"]): EventTable {
  return { ...table, rows };
}

describe("граница «в rules.json только SRD»", () => {
  it("нашей лестницы уровней в справочнике нет: там три вида безумия и ни одного счётчика", () => {
    // Сердце карточки: лестница живёт отдельным файлом именно затем, чтобы эта
    // проба была выполнима. Подмешивание её в rules.json красит пробу.
    const topic = rules.find((t) => t.id === MADNESS_TOPIC_ID);
    expect(topic).toBeDefined();
    const text = (topic as RuleTopic).blocks
      .map((b) => (b.type === "table" ? b.rows.flat().join(" ") : b.type === "list" ? b.items.join(" ") : b.text))
      .join("\n");
    expect(text).not.toContain("уровень безумия");
    expect(text).not.toContain("ур. 1");
    expect(text).not.toMatch(/лестниц/i);
  });

  it("таблицы не скопированы к нам: весь текст эффектов приходит из rules.json", () => {
    const srdTopic = rules.find((t) => t.id === MADNESS_TOPIC_ID) as RuleTopic;
    const srdRows = srdTopic.blocks.flatMap((b) => (b.type === "table" ? b.rows.slice(1) : []));
    for (const table of loaded().tables) {
      for (const row of table.table.rows) {
        expect(srdRows.some((srd) => srd[1].trim() === row.text)).toBe(true);
      }
    }
  });
});

describe("три таблицы SRD, прочитанные из rules.json", () => {
  it("читаются все три, с теми числами пунктов и краевыми диапазонами, что в справочнике", () => {
    const { tables } = loaded();
    expect(tables.map((t) => t.step.level)).toEqual([1, 2, 3]);
    expect(tables.map((t) => t.table.rows.length)).toEqual([10, 12, 12]);
    expect(tables.map((t) => t.table.die)).toEqual([100, 100, 100]);

    // Краевые диапазоны — то, чем таблица к100 отличается от плоской кости:
    // «уходит в себя» занимает 20 чисел из 100, а не 10, как в редакции на к10.
    expect(tables[0].table.rows[0]).toMatchObject({ from: 1, to: 20 });
    expect(tables[0].table.rows[tables[0].table.rows.length - 1]).toMatchObject({ from: 91, to: 100 });
    expect(tables[1].table.rows[0]).toMatchObject({ from: 1, to: 10 });
    expect(tables[1].table.rows[tables[1].table.rows.length - 1]).toMatchObject({ from: 96, to: 100 });
    expect(tables[2].table.rows[0]).toMatchObject({ from: 1, to: 15 });
    expect(tables[2].table.rows[tables[2].table.rows.length - 1]).toMatchObject({ from: 96, to: 100 });
  });

  it("диапазоны шире одного числа: строк меньше, чем чисел на кости", () => {
    for (const table of loaded().tables) {
      expect(table.table.rows.length).toBeLessThan(table.table.die);
      expect(table.table.rows.some((row) => row.to > row.from)).toBe(true);
    }
  });

  it("кость — к100: бросок идёт одним выражением для всех трёх ступеней", () => {
    expect(MADNESS_ROLL_EXPRESSION).toBe("1d100");
  });

  it("каждое число от 1 до 100 попадает ровно в один диапазон в каждой из трёх таблиц", () => {
    expect(madnessCoverageGap(loaded())).toBeNull();
    for (const table of loaded().tables) {
      for (let n = 1; n <= 100; n += 1) {
        expect(rowForRoll(table.table, n), `${table.step.kind} → ${n}`).toBeDefined();
      }
    }
  });

  it("длительность разобрана из шапки SRD, а не записана у нас", () => {
    const [short, long, indefinite] = loaded().tables;
    expect(short.duration).toEqual({ expression: "1d10", multiplier: 1, unit: "минут" });
    expect(long.duration).toEqual({ expression: "1d10", multiplier: 10, unit: "часов" });
    expect(indefinite.duration).toBeNull();
    expect(indefinite.durationText).toBe("до тех пор, пока безумие не будет излечено");
  });

  it("сопротивление и лечение — абзацы SRD, взятые целиком", () => {
    const { resistance, healing } = loaded();
    expect(resistance).toContain("спасброска Мудрости или Харизмы");
    expect(healing).toContain("Умиротворение");
    expect(healing).toContain("восстановление");
  });
});

describe("наша лестница уровней", () => {
  it("три ступени, выше третьей не растёт", () => {
    expect(MADNESS_LADDER).toHaveLength(MADNESS_MAX_LEVEL);
    expect(nextMadnessLevel([])).toBe(1);
    expect(nextMadnessLevel(["Безумие (ур. 1, к100 7, 1к10 6)"])).toBe(2);
    expect(nextMadnessLevel(["Безумие (ур. 2, к100 7, 1к10 6)"])).toBe(3);
    expect(nextMadnessLevel(["Безумие (ур. 3, к100 7)"])).toBeNull();
  });

  it("подпись состояния разбирается обратно в те же числа", () => {
    const rolled = { level: 2 as const, roll: 57, durationRoll: 9 };
    const name = madnessConditionName(rolled);
    expect(name).toBe("Безумие (ур. 2, к100 57, 1к10 9)");
    expect(parseMadnessCondition(name)).toEqual(rolled);

    const indefinite = { level: 3 as const, roll: 100, durationRoll: null };
    expect(madnessConditionName(indefinite)).toBe("Безумие (ур. 3, к100 100)");
    expect(parseMadnessCondition(madnessConditionName(indefinite))).toEqual(indefinite);
  });

  it("обычные состояния безумием не считаются — старое сохранение грузится как раньше", () => {
    const old = ["Ослеплённое", "Истощение (ур. 3)", "Отравленное"];
    expect(old.map(parseMadnessCondition)).toEqual([null, null, null]);
    expect(madnessLevelOf(old)).toBe(0);
    expect(nextMadnessLevel(old)).toBe(1);
  });

  it("повышение заменяет прежнее безумие на его месте, а не дописывает второе", () => {
    const before = ["Ослеплённое", "Безумие (ур. 1, к100 7, 1к10 6)", "Отравленное"];
    const after = withMadness(before, { level: 2, roll: 57, durationRoll: 9 });
    expect(after).toEqual(["Ослеплённое", "Безумие (ур. 2, к100 57, 1к10 9)", "Отравленное"]);
    expect(madnessLevelOf(after)).toBe(2);
    expect(withMadness(["Ослеплённое"], { level: 1, roll: 7, durationRoll: 6 })).toEqual([
      "Ослеплённое",
      "Безумие (ур. 1, к100 7, 1к10 6)",
    ]);
  });
});

describe("строки под состоянием", () => {
  it("верхний диапазон краткосрочной таблицы отдаёт текст SRD на любом числе от 1 до 20", () => {
    const rules57 = loaded();
    for (const roll of [1, 7, 20]) {
      const lines = madnessEffectLines(rules57, { level: 1, roll, durationRoll: 6 });
      expect(lines[0]).toBe(`Краткосрочное безумие, бросок к100: ${roll} (диапазон 1–20).`);
      expect(lines[1]).toContain("уходит в себя и становится парализованным");
      expect(lines[2]).toBe("Длительность: 6 минут (1к10: 6).");
      expect(lines[3]).toContain("Умиротворение");
    }
  });

  it("на второй ступени длительность становится часами и умножается на десять", () => {
    const lines = madnessEffectLines(loaded(), { level: 2, roll: 57, durationRoll: 9 });
    expect(lines[0]).toContain("Долгосрочное безумие");
    expect(lines[2]).toBe("Длительность: 90 часов (1к10: 9 × 10).");
  });

  it("у бессрочного длительность — текст SRD, а не число", () => {
    const lines = madnessEffectLines(loaded(), { level: 3, roll: 100, durationRoll: null });
    expect(lines[2]).toBe("Длительность: до тех пор, пока безумие не будет излечено.");
  });

  it("множитель применяется к броску, а не к готовому числу часов", () => {
    const long = madnessTable(loaded(), 2)!;
    expect(madnessDurationText(long, 1)).toBe("10 часов (1к10: 1 × 10)");
    expect(madnessDurationText(long, 10)).toBe("100 часов (1к10: 10 × 10)");
  });
});

// ── отрицательные пробы: страж обязан краснеть, а не молчать ────────────────

describe("страж покрытия к100", () => {
  it("снятый диапазон краснеет и называет таблицу и незакрытое число", () => {
    const short = madnessTable(loaded(), 1)!;
    const holed = withRows(
      short.table,
      short.table.rows.filter((row) => row.from !== 21),
    );
    const gap = findCoverageGap(holed);
    expect(gap).toContain("Краткосрочное безумие");
    expect(gap).toContain("21");
    expect(gap).toContain("d100");
  });

  it("дыра в любой из трёх ступеней доходит до madnessCoverageGap", () => {
    const rules57 = loaded();
    for (const level of [1, 2, 3] as const) {
      const target = madnessTable(rules57, level)!;
      // Снимаем последнюю строку: первым непокрытым станет её начало, и страж
      // обязан назвать именно это число, а не «что-то не сошлось».
      const last = target.table.rows[target.table.rows.length - 1];
      const broken: MadnessRules = {
        ...rules57,
        tables: rules57.tables.map((t) =>
          t.step.level === level
            ? { ...t, table: withRows(t.table, t.table.rows.filter((row) => row.from !== last.from)) }
            : t,
        ),
      };
      const gap = madnessCoverageGap(broken);
      expect(gap, `ступень ${level}`).toContain(target.step.kind);
      expect(gap, `ступень ${level}`).toContain(String(last.from));
    }
  });

  it("нахлёст диапазонов краснеет и называет число", () => {
    const short = madnessTable(loaded(), 1)!;
    const overlapped = withRows(short.table, [
      ...short.table.rows,
      { from: 3, to: 3, text: "вторая строка на то же число" },
    ]);
    const gap = findCoverageGap(overlapped);
    expect(gap).toContain("3");
    expect(gap).toContain("2 строками");
  });

  it("раздел без таблиц читается как «безумия нет», а не падает", () => {
    expect(readMadnessRules([])).toBeNull();
    expect(
      readMadnessRules([
        { id: MADNESS_TOPIC_ID, category: "additional-rules", title: "Безумие", sourceUrl: "", blocks: [] },
      ]),
    ).toBeNull();
  });
});
