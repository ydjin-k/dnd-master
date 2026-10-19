import { describe, expect, it } from "vitest";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../../state/types";
import {
  findReadyTrap,
  readReadyTraps,
  READY_TRAPS_HEADING,
  readyTrapsForLevel,
  type DeadlyBand,
} from "./readyTraps";
import { DEADLIEST_DANGER, readTrapNumbers, TRAPS_TOPIC_ID, type TrapNumbers } from "./trapNumbers";

const topics = bundledRules as RuleTopic[];
const topic = topics.find((t) => t.id === TRAPS_TOPIC_ID)!;
const numbers = readTrapNumbers(topics) as TrapNumbers;

/** Шкала уровней, по которой код выводит порог, — своим чтением справочника. */
const bands: DeadlyBand[] = (() => {
  const table = topic.blocks[22];
  if (table.type !== "table") throw new Error("в rules.json на месте 22 обязана стоять таблица");
  const column = table.rows[0].indexOf(DEADLIEST_DANGER);
  return table.rows.slice(1).map((row) => ({
    fromLevel: Number(row[0].match(/\d+/)![0]),
    deadly: row[column],
  }));
})();

/**
 * Эталон — свой: одиннадцать имён выписаны из справочника глазами и каждое
 * здесь же сверяется с его блоками (заголовок или начало абзаца). Код ищет их
 * разбором заголовков и названий в абзацах, проба — поиском текста: пути
 * разные, и сдвиг в разборе краснеет здесь, а не совпадает сам с собой.
 *
 * Уровни: 5 у катящейся сферы и 11 у сферы аннигиляции — остальные ловушки
 * годятся любому отряду. Проверяется это ниже не только числом, но и тем, что
 * порог сдвигается вместе со шкалой справочника.
 */
const EXPECTED = [
  { name: "Обрушивающийся потолок", section: null, level: 1 },
  { name: "Падающая сеть", section: null, level: 1 },
  { name: "Огнедышащая статуя", section: null, level: 1 },
  { name: "Простая Яма", section: "Ямы", level: 1 },
  { name: "Скрытая Яма", section: "Ямы", level: 1 },
  { name: "Запирающаяся яма", section: "Ямы", level: 1 },
  { name: "Яма с шипами", section: "Ямы", level: 1 },
  { name: "Отравленные дротики", section: null, level: 1 },
  { name: "Отравленная игла", section: null, level: 1 },
  { name: "Катящаяся Сфера", section: null, level: 5 },
  { name: "Сфера аннигиляции", section: null, level: 11 },
] as const;

const headings = topic.blocks.flatMap((b) =>
  b.type === "heading" ? [{ level: b.level, text: b.text.trim() }] : [],
);
const paragraphs = topic.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text.trim()] : []));

describe("готовые ловушки против rules.json", () => {
  const traps = readReadyTraps(topic, bands);

  it("их ровно одиннадцать, и имена — из справочника", () => {
    expect(traps).toHaveLength(11);
    expect(traps.map((t) => t.name)).toEqual(EXPECTED.map((e) => e.name));
    // Заголовок, с которого начинаются примеры, в справочнике есть.
    expect(headings.map((h) => h.text)).toContain(READY_TRAPS_HEADING);
    for (const { name, section } of EXPECTED) {
      if (section === null) {
        // Имя — заголовок справочника, и заголовок этот ниже «Примеров».
        const head = headings.find((h) => h.text === name);
        expect(head, name).toBeDefined();
        expect(head!.level, name).toBeGreaterThan(
          headings.find((h) => h.text === READY_TRAPS_HEADING)!.level,
        );
      } else {
        // Имя — выделенное название в начале абзаца внутри заголовка.
        expect(headings.map((h) => h.text), name).toContain(section);
        expect(
          paragraphs.filter((p) => p.startsWith(`${name}. `)),
          name,
        ).toHaveLength(1);
      }
      expect(traps.find((t) => t.name === name)!.section, name).toBe(section);
    }
  });

  it("текст — абзацы справочника как есть, ни одного своего слова", () => {
    const seen: string[] = [];
    for (const trap of traps) {
      expect(trap.paragraphs.length, trap.name).toBeGreaterThan(0);
      for (const text of trap.paragraphs) {
        expect(paragraphs, trap.name).toContain(text);
        seen.push(text);
      }
      for (const text of trap.sectionIntro) expect(paragraphs, trap.name).toContain(text);
    }
    // Каждый абзац примеров достался ровно одной ловушке — ни потерянных, ни
    // размноженных. Вступления «Ям» идут отдельно и потому вычитаются.
    const intro = new Set(traps.flatMap((t) => t.sectionIntro));
    const start = paragraphs.indexOf(traps[0].paragraphs[0]);
    const expected = paragraphs.slice(start).filter((p) => !intro.has(p));
    expect(seen).toEqual(expected);
  });

  it("порог уровня выведен из шкалы урона справочника, а не вписан числом", () => {
    for (const { name, level } of EXPECTED) {
      expect(traps.find((t) => t.name === name)!.minPartyLevel, name).toBe(level);
    }
    // Почему у катящейся сферы 5: в её тексте 10к10, а смертоносная ловушка
    // отряда 1–4 бьёт слабее. Оба числа читаются из справочника.
    expect(traps.find((t) => t.name === "Катящаяся Сфера")!.paragraphs.join(" ")).toContain("10к10");
    expect(bands[0]).toEqual({ fromLevel: 1, deadly: "4к10" });
    expect(bands[1].fromLevel).toBe(5);

    // Шкала сдвинулась — сдвинулся и порог: число 5 не вписано в код. А порог
    // сферы аннигиляции от шкалы не зависит вовсе: у неё урона нет, и 11 — это
    // решение владельца.
    const generous = readReadyTraps(topic, [{ fromLevel: 1, deadly: "18к10" }]);
    expect(findReadyTrap(generous, "Катящаяся Сфера")!.minPartyLevel).toBe(1);
    expect(findReadyTrap(generous, "Сфера аннигиляции")!.minPartyLevel).toBe(11);
  });

  it("по уровню отряда отбираются те, что ему годятся", () => {
    const names = (level: number) => readyTrapsForLevel(traps, level).map((t) => t.name);
    expect(names(4)).not.toContain("Катящаяся Сфера");
    expect(names(5)).toContain("Катящаяся Сфера");
    expect(names(10)).not.toContain("Сфера аннигиляции");
    expect(names(11)).toContain("Сфера аннигиляции");
    expect(names(20)).toHaveLength(11);
  });

  it("числа ловушек несут готовые с собой, а пустой справочник — нет", () => {
    expect(numbers.ready.map((t) => t.name)).toEqual(EXPECTED.map((e) => e.name));
    expect(readReadyTraps({ ...topic, blocks: [] }, bands)).toEqual([]);
    expect(findReadyTrap(traps, "Ловушка, которой нет")).toBeNull();
  });
});
