import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../state/types";
import { OPTIONAL_CATEGORY, OPTIONAL_RULE_TOPICS } from "./optionalRules";

const srdTopics = bundledRules as unknown as RuleTopic[];

describe("раздел «Опционально»", () => {
  it("темы заведены и все в своей категории", () => {
    expect(OPTIONAL_RULE_TOPICS.length).toBeGreaterThan(0);
    for (const topic of OPTIONAL_RULE_TOPICS) {
      expect(topic.category).toBe(OPTIONAL_CATEGORY);
    }
  });

  /**
   * Сторож границы. В `rules.json` лежит ровно SRD, и вкладка «Правила»
   * подписывает всё пришедшее оттуда переводом SRD 5.1. Стоит опциональному
   * правилу заехать в тот файл — подпись соврёт об источнике, а проверить это
   * глазами уже не выйдет: тема выглядит там как своя.
   */
  it("ни одно опциональное правило не подмешано в rules.json", () => {
    const srdIds = new Set(srdTopics.map((t) => t.id));

    for (const topic of OPTIONAL_RULE_TOPICS) {
      expect(srdIds.has(topic.id)).toBe(false);
    }
  });

  it("в rules.json нет ни одной темы категории optional", () => {
    // Обратная сторона того же сторожа: подмешать могли и не нашим id.
    expect(srdTopics.filter((t) => t.category === OPTIONAL_CATEGORY)).toEqual([]);
  });

  it("id опциональных тем не сталкиваются между собой", () => {
    const ids = OPTIONAL_RULE_TOPICS.map((t) => t.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("у опциональных тем нет ссылки на источник SRD", () => {
    // `sourceUrl` показывается подвалом как «Источник этого раздела» и ведёт
    // на longstoryshort.app. Для нашего текста такой ссылки быть не может.
    for (const topic of OPTIONAL_RULE_TOPICS) {
      expect(topic.sourceUrl).toBe("");
    }
  });
});

describe("числа опциональных правил сохранены", () => {
  function tableOf(topicId: string, headFirstCell: string): string[][] {
    const topic = OPTIONAL_RULE_TOPICS.find((t) => t.id === topicId);
    if (!topic) throw new Error(`нет темы ${topicId}`);
    const block = topic.blocks.find(
      (b) => b.type === "table" && b.rows[0]?.[0] === headFirstCell,
    );
    if (!block || block.type !== "table") throw new Error(`нет таблицы ${headFirstCell}`);
    return block.rows;
  }

  it("степени Осквернения: пороги очков и сложности по трём расстояниям", () => {
    const rows = tableOf("optional-corruption", "Степень");

    expect(rows[1]).toEqual(["Нет", "0", "10", "12", "14"]);
    expect(rows[2]).toEqual(["Слабое", "1-2", "12", "14", "18"]);
    expect(rows[3]).toEqual(["Среднее", "3-8", "14", "18", "22"]);
    expect(rows[4]).toEqual(["Сильное", "9-11", "18", "22", "25"]);
    // Сложность растёт и с близостью к источнику, и со степенью — если правка
    // это сломает, таблица потеряет смысл, а выглядеть будет прежней.
    for (let i = 1; i <= 4; i++) {
      const [, , far, mid, near] = rows[i];
      expect(Number(far)).toBeLessThan(Number(mid));
      expect(Number(mid)).toBeLessThan(Number(near));
    }
  });

  it("эффекты Осквернения: восемь строк на три степени", () => {
    const rows = tableOf("optional-corruption", "к8");

    expect(rows).toHaveLength(9);
    for (const row of rows.slice(1)) expect(row).toHaveLength(4);
  });

  it("обряд возвращения покрывает к20 без дыр и нахлёстов", () => {
    const rows = tableOf("optional-return-from-death", "к20");
    const covered = new Set<number>();

    for (const [range] of rows.slice(1)) {
      const [from, to] = range.includes("-") ? range.split("-").map(Number) : [Number(range), Number(range)];
      for (let n = from; n <= to; n++) {
        expect(covered.has(n)).toBe(false);
        covered.add(n);
      }
    }

    expect(covered.size).toBe(20);
  });

  it("стигийское проклятие покрывает к10 без дыр и нахлёстов", () => {
    const rows = tableOf("optional-return-from-death", "к10");
    const covered = new Set<number>();

    for (const [range] of rows.slice(1)) {
      const [from, to] = range.includes("-") ? range.split("-").map(Number) : [Number(range), Number(range)];
      for (let n = from; n <= to; n++) {
        expect(covered.has(n)).toBe(false);
        covered.add(n);
      }
    }

    expect(covered.size).toBe(10);
  });
});
