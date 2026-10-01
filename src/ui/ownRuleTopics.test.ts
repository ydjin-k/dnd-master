import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../state/types";
import { isOwnRuleTopic, OWN_RULE_TOPICS, playableRaces } from "./ownRuleTopics";

const srdTopics = bundledRules as unknown as RuleTopic[];

describe("наши темы справочника", () => {
  it("список не пуст и у каждой темы есть категория из существующих", () => {
    // Своих разделов наши темы не заводят: категория обязана быть той же, что
    // у SRD-соседей, иначе в списке появится раздел без подписи.
    const srdCategories = new Set(srdTopics.map((t) => t.category));

    expect(OWN_RULE_TOPICS.length).toBeGreaterThan(0);
    for (const topic of OWN_RULE_TOPICS) {
      expect(srdCategories.has(topic.category)).toBe(true);
    }
  });

  /**
   * Сторож границы, тот же, что у опциональных правил. В `rules.json` лежит
   * ровно SRD, и подвал обещает SRD за всё пришедшее оттуда. Стоит нашей теме
   * заехать в тот файл — подпись соврёт об источнике, а глазами это уже не
   * проверить: тема выглядит там как своя.
   */
  it("ни одна наша тема не подмешана в rules.json — ни по id, ни по названию", () => {
    const srdIds = new Set(srdTopics.map((t) => t.id));
    const srdTitles = new Set(srdTopics.map((t) => t.title));

    for (const topic of OWN_RULE_TOPICS) {
      expect(srdIds.has(topic.id)).toBe(false);
      expect(srdTitles.has(topic.title)).toBe(false);
    }
  });

  it("у наших тем нет ссылки на источник SRD", () => {
    // `sourceUrl` подвал показывает как «Источник этого раздела» и ведёт на
    // longstoryshort.app. Для нашего текста такой ссылки быть не может.
    for (const topic of OWN_RULE_TOPICS) {
      expect(topic.sourceUrl).toBe("");
    }
  });

  it("«наше» определяется принадлежностью списку, а не категорией и не пустым sourceUrl", () => {
    // Сердце карточки. У Эльфа бездны категория `races` ровно та же, что у
    // Эльфа из SRD, поэтому предикат обязан отвечать по id, а не по признакам,
    // которые у SRD-темы такие же.
    for (const topic of OWN_RULE_TOPICS) {
      expect(isOwnRuleTopic(topic)).toBe(true);
    }
    for (const topic of srdTopics) {
      expect(isOwnRuleTopic(topic)).toBe(false);
    }
    expect(isOwnRuleTopic(undefined)).toBe(false);
  });
});

describe("playableRaces", () => {
  it("девять рас справочника плюс наши, каждая по одному разу", () => {
    const srdRaces = srdTopics.filter((t) => t.category === "races" && t.id !== "races-traits");
    const ownRaces = OWN_RULE_TOPICS.filter((t) => t.category === "races");
    const races = playableRaces(srdTopics);

    expect(srdRaces).toHaveLength(9);
    expect(races).toHaveLength(srdRaces.length + ownRaces.length);
    // Задвоение — главный риск переезда: наша раса могла остаться приписанной
    // руками И приехать из OWN_RULE_TOPICS.
    expect(new Set(races.map((t) => t.id)).size).toBe(races.length);
    expect(new Set(races.map((t) => t.title)).size).toBe(races.length);
  });

  it("наши расы приходят из OWN_RULE_TOPICS и ниоткуда больше", () => {
    const races = playableRaces(srdTopics);
    const ourRaces = races.filter((t) => isOwnRuleTopic(t));

    expect(ourRaces).toEqual(OWN_RULE_TOPICS.filter((t) => t.category === "races"));
    // Общая статья «Расовые особенности» — не раса, играть ею нельзя.
    expect(races.some((t) => t.id === "races-traits")).toBe(false);
  });
});
