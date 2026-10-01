import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../state/types";
import { ALL_SKILLS } from "./characterCreationData";
import { findTable } from "./eventTables";
import { FORAGE_SKILL, FORAGE_ZONES, forageOutcome, forageZoneById } from "./foraging";

const srdTopics = bundledRules as unknown as RuleTopic[];

describe("сбор еды — наше правило, и это проверяемо", () => {
  /**
   * Сторож происхождения — и он точнее, чем «в SRD этого нет вовсе».
   *
   * Упоминание в `rules.json` ровно одно: раздел «Расходы» говорит, что
   * персонажи «живут в глухой местности за счёт охоты и сбора еды». Это описание
   * быта, а не правило: ни проверки, ни Сложности, ни выдачи в нём нет — и
   * проба сторожит именно это. Появись в источнике настоящее правило сбора —
   * падает здесь, и наш файл надо будет сносить, а не чинить.
   */
  it("в SRD нет ПРАВИЛА сбора еды, а единственное упоминание — про быт", () => {
    const mentions = srdTopics.flatMap((topic) =>
      topic.blocks
        .filter((b) => "text" in b && b.text.includes("сбора еды"))
        .map((b) => ({ topic: topic.id, text: (b as { text: string }).text })),
    );

    expect(mentions).toHaveLength(1);
    expect(mentions[0].topic).toBe("equipment-expenses");
    expect(mentions[0].text).not.toContain("Сложность");
    expect(mentions[0].text).not.toContain("проверк");
    expect(JSON.stringify(srdTopics)).not.toContain("фуражир");
  });

  it("проверка идёт навыком, который есть на листе персонажа", () => {
    expect(ALL_SKILLS).toContain(FORAGE_SKILL);
  });

  it("три ступени изобилия, Сложности разные и по убыванию", () => {
    expect(FORAGE_ZONES.map((z) => z.dc)).toEqual([20, 15, 10]);
    expect(new Set(FORAGE_ZONES.map((z) => z.id)).size).toBe(FORAGE_ZONES.length);
  });

  it("неизвестная ступень читается как обычная зона", () => {
    expect(forageZoneById("ordinary").dc).toBe(15);
    expect(forageZoneById(undefined).id).toBe("ordinary");
    expect(forageZoneById("plentiful").id).toBe("ordinary");
  });

  /**
   * Та самая строка, ради которой правило и заведено. Это и есть доказательство,
   * что она «начала работать»: обещанное ею число — ступень «Изобильная» нашей
   * таблицы, и разъедись они, падает эта проверка, а не доверие игрока за
   * столом.
   */
  it("подземный ручей обещает ровно Сложность изобильной зоны", () => {
    const table = findTable("underdark-terrain-encounters")!;
    const stream = table.rows.find((row) => row.from === 11)!;
    const abundant = FORAGE_ZONES.find((zone) => zone.id === "abundant")!;

    expect(stream.text).toContain("Сложность проверки на сбор еды");
    expect(stream.text).toContain(`снижается до ${abundant.dc}`);
  });
});

describe("итог сбора", () => {
  it("провал не даёт ни еды, ни воды", () => {
    const failed = forageOutcome(9, 10, 6, 3);

    expect(failed.success).toBe(false);
    expect(failed.poundsOfFood).toBe(0);
    expect(failed.gallonsOfWater).toBe(0);
  });

  it("успех даёт 1к6 + модификатор Мудрости фунтов и столько же галлонов", () => {
    const found = forageOutcome(14, 10, 4, 2);

    expect(found.success).toBe(true);
    expect(found.poundsOfFood).toBe(6);
    expect(found.gallonsOfWater).toBe(6);
  });

  it("ровно по Сложности — это успех", () => {
    expect(forageOutcome(10, 10, 1, 0).success).toBe(true);
  });

  it("успех с пустыми руками невозможен: минимум один фунт", () => {
    const stingy = forageOutcome(20, 10, 1, -3);

    expect(stingy.success).toBe(true);
    expect(stingy.poundsOfFood).toBe(1);
  });

  it("подпись называет числа проверки, а не «получилось»", () => {
    expect(forageOutcome(12, 10, 3, 1).reason).toContain("12 против Сложности 10");
  });
});
