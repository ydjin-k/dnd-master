import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../state/types";
import {
  CHANGELING_ABILITY_BONUS,
  CHANGELING_FIXED_SKILLS,
  CHANGELING_ID,
  CHANGELING_LANGUAGES,
  CHANGELING_SPEED_FEET,
  CHANGELING_TITLE,
  CHANGELING_TRAITS,
  MASK_TRAIT_NAME,
  TRUE_FORM_TRAIT_NAME,
  isChangeling,
} from "./changelingRace";
import {
  ALL_LANGUAGES,
  ALL_SKILLS,
  RACE_FIXED_SKILLS,
  RACE_LANGUAGES,
  RACE_SKILL_CHOICE_COUNT,
  RACE_TRAITS,
} from "./characterCreationData";
import { isOwnRuleTopic, playableRaces } from "./ownRuleTopics";
import { abyssElfSpellLine, raceGrantedCantrips, raceResources } from "./abyssElfRace";
import { CHARACTER_PORTRAIT_RACES } from "./characterPortraits";

const rules = bundledRules as unknown as RuleTopic[];

function changelingProse(): string {
  const topic = playableRaces(rules).find((t) => t.id === CHANGELING_ID);
  return (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
}

describe("граница «в rules.json только SRD» — Чейнджлинг", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    expect(rules.some((t) => t.id === CHANGELING_ID)).toBe(false);
    expect(rules.some((t) => t.title === CHANGELING_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === CHANGELING_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется, и говорит прямо, что из SRD не взято ничего", () => {
    expect(changelingProse()).toContain("раса этого приложения, а не раса SRD 5.1");
    expect(changelingProse()).toContain("Из SRD здесь не взято ничего");
  });

  /**
   * Сторож того самого утверждения из шапки — и он читает ИСТОЧНИК, а не нашу
   * же константу: обещание «в открытом SRD расы этой ниши нет вовсе» проверяется
   * по самому `rules.json`, а не по слову в комментарии. Появись там раса или
   * статья с этим названием — проба покраснеет, и шапку придётся переписать.
   */
  it("обещание «в открытом SRD этой ниши нет» проверено по самому rules.json", () => {
    const srdText = JSON.stringify(rules).toLowerCase();
    expect(srdText).not.toContain("чейнджлинг");
    // И механики смены облика в SRD-расах тоже нет: иначе её стоило бы взять
    // открытым текстом, как «Ловкий побег» у Гоблина.
    const srdRaces = rules.filter((t) => t.category === "races");
    const racesText = JSON.stringify(srdRaces).toLowerCase();
    expect(racesText).not.toContain("меняющий облик");
  });
});

describe("Чейнджлинг попадает в мастер и на лист", () => {
  it("стоит в playableRaces со своей категорией и своим названием, без задвоения", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === CHANGELING_ID);
    expect(topic?.title).toBe(CHANGELING_TITLE);
    expect(topic?.category).toBe("races");
    expect(races.filter((t) => t.id === CHANGELING_ID)).toHaveLength(1);
  });

  it("черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    const byTitle: Record<string, typeof CHANGELING_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[CHANGELING_TITLE]).toEqual(CHANGELING_TRAITS);
    expect(byTitle[CHANGELING_TITLE].map((t) => t.name)).toContain(MASK_TRAIT_NAME);
  });

  it("языки и навык расы прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[CHANGELING_ID]).toEqual(CHANGELING_LANGUAGES);
    expect(RACE_FIXED_SKILLS[CHANGELING_ID]).toEqual(CHANGELING_FIXED_SKILLS);
    expect(RACE_SKILL_CHOICE_COUNT[CHANGELING_ID]).toBeUndefined();
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    for (const language of CHANGELING_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of CHANGELING_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("выбор языка — ровно один: второй мастер молча потерял бы", () => {
    // `raceFinalLanguages` (`CharacterWizard.tsx`) берёт ОДНО значение выбора
    // независимо от числа в карте, поэтому двойка здесь была бы обещанием,
    // которого интерфейс не выполняет.
    expect(CHANGELING_LANGUAGES.choiceCount).toBe(1);
  });

  it("слага портрета у расы нет — портрет человеческий, а не битая картинка", () => {
    expect(CHARACTER_PORTRAIT_RACES).not.toContain(CHANGELING_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isChangeling(CHANGELING_TITLE)).toBe(true);
    expect(isChangeling("Серпенты")).toBe(false);
    expect(isChangeling(null)).toBe(false);
  });
});

describe("что НАШЕ — собрано не под чужую играбельную расу", () => {
  it("оба бонуса ФИКСИРОВАНЫ — у чужой расы этой ниши второй отдан игроку", () => {
    expect(CHANGELING_ABILITY_BONUS).toEqual({ charisma: 2, wisdom: 1 });
    expect(Object.keys(CHANGELING_ABILITY_BONUS)).toHaveLength(2);
    // Карта бонусов умеет и `choice` (так устроен Полуэльф) — у этой расы его
    // нет нарочно, и проба держит именно это решение.
    expect(RACE_SKILL_CHOICE_COUNT[CHANGELING_ID]).toBeUndefined();
  });

  it("скорость — 30 футов, как у Средних рас SRD", () => {
    expect(CHANGELING_SPEED_FEET).toBe(30);
    expect(changelingProse()).toContain(`Ваша базовая скорость ходьбы — ${CHANGELING_SPEED_FEET} футов`);
  });

  it("смена облика — особенность, а НЕ заклинание: ни заговора, ни ресурса, ни строки", () => {
    // Тем же приёмом описан «Меняющий облик» у наших серпентов в бестиарии:
    // смена облика в этом проекте — текст особенности, а не ссылка в spells.json.
    expect(raceGrantedCantrips(CHANGELING_TITLE)).toEqual([]);
    expect(raceResources(CHANGELING_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(CHANGELING_TITLE, (id) => id)).toBeNull();
  });

  it("у смены облика названы границы: снаряжение, характеристики и размер", () => {
    // Особенность «меняю что захочу» непроверяема за столом. Границы — то, чем
    // она отличается от обещания.
    const mask = CHANGELING_TRAITS.find((t) => t.name === MASK_TRAIT_NAME);
    expect(mask?.description).toContain("Снаряжение не меняется");
    expect(mask?.description).toContain("характеристики");
    expect(mask?.description).toContain("в пределах своей категории размера");
  });

  it("у расы есть ЦЕНА, и она названа числом правил, а не обещанием", () => {
    // Приём Эльфа бездны: особенность-цена стоит в том же списке, что и
    // особенности-подарки, и говорит, чем именно платится.
    const cost = CHANGELING_TRAITS.find((t) => t.name === TRUE_FORM_TRAIT_NAME);
    expect(cost?.description).toContain("с помехой");
    // Утверждение держится за ФАКТ, а не за формулировку. Раньше здесь
    // стояла строка «Это цена, а не оговорка» — присказка в конце правила,
    // снятая 07.10.2026 вместе с остальными: на листе владельца особенности
    // идут голыми. Цена при этом никуда не делась и по-прежнему названа
    // игроку словами — в «Источнике», последнем абзаце статьи.
    expect(changelingProse()).toContain("за истинный облик приходится платить");
  });

  it("каждая черта непуста и названа по-своему — двух заголовков одного факта нет", () => {
    const names = CHANGELING_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const trait of CHANGELING_TRAITS) {
      expect(trait.name.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });
});
