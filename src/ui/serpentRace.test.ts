import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledBestiary from "../../src-tauri/bestiary/bestiary.json";
import bundledOwnCreatures from "../../src-tauri/bestiary/own-creatures.json";
import type { RuleTopic } from "../state/types";
import {
  COLD_RESOLVE_TRAIT_NAME,
  SERPENT_ABILITY_BONUS,
  SERPENT_DARKVISION_FEET,
  SERPENT_FIXED_SKILLS,
  SERPENT_ID,
  SERPENT_LANGUAGES,
  SERPENT_SPEED_FEET,
  SERPENT_TITLE,
  SERPENT_TRAITS,
  isSerpent,
} from "./serpentRace";
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

interface Creature {
  id: string;
  name: string;
  languages?: string[];
  senses?: { name: string; rangeFeet?: number | null }[];
  traits?: string[];
}
const ownCreatures = bundledOwnCreatures as unknown as Creature[];
const srdBestiary = bundledBestiary as unknown as Creature[];

/** Наши серпенты из бестиария — с ними раса обязана быть согласована. */
const ourSerpents = ownCreatures.filter((m) => m.name.toLowerCase().includes("серпент"));

function serpentProse(): string {
  const topic = playableRaces(rules).find((t) => t.id === SERPENT_ID);
  return (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
}

describe("граница «в rules.json только SRD» — Серпенты", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    expect(rules.some((t) => t.id === SERPENT_ID)).toBe(false);
    expect(rules.some((t) => t.title === SERPENT_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === SERPENT_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется: текст расы сам говорит, чей он", () => {
    expect(serpentProse()).toContain("раса этого приложения, а не раса SRD 5.1");
  });
});

describe("Серпенты попадают в мастер и на лист", () => {
  it("стоят в playableRaces со своей категорией и своим названием, без задвоения", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === SERPENT_ID);
    expect(topic?.title).toBe(SERPENT_TITLE);
    expect(topic?.category).toBe("races");
    expect(races.filter((t) => t.id === SERPENT_ID)).toHaveLength(1);
  });

  it("черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    const byTitle: Record<string, typeof SERPENT_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[SERPENT_TITLE]).toEqual(SERPENT_TRAITS);
    expect(byTitle[SERPENT_TITLE].map((t) => t.name)).toContain(COLD_RESOLVE_TRAIT_NAME);
  });

  it("языки и навык расы прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[SERPENT_ID]).toEqual(SERPENT_LANGUAGES);
    expect(RACE_FIXED_SKILLS[SERPENT_ID]).toEqual(SERPENT_FIXED_SKILLS);
  });

  it("навыка ПО ВЫБОРУ раса не даёт — подпись к тому выбору принадлежит Полуэльфу", () => {
    // Решение, названное в шапке модуля: подпись к `RACE_SKILL_CHOICE_COUNT` в
    // мастере вшита строкой «Гибкость навыков», то есть именем особенности
    // Полуэльфа. Наша раса в этой карте показала бы игроку чужое имя.
    expect(RACE_SKILL_CHOICE_COUNT[SERPENT_ID]).toBeUndefined();
    expect(Object.keys(RACE_SKILL_CHOICE_COUNT)).toEqual(["races-half-elf"]);
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    for (const language of SERPENT_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of SERPENT_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("слага портрета у расы нет — портрет человеческий, а не битая картинка", () => {
    expect(CHARACTER_PORTRAIT_RACES).not.toContain(SERPENT_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isSerpent(SERPENT_TITLE)).toBe(true);
    expect(isSerpent("Сатир")).toBe(false);
    expect(isSerpent(null)).toBe(false);
  });
});

describe("согласование с НАШИМИ серпентами бестиария — сверено с самим бестиарием", () => {
  /**
   * Сторож, читающий ИСТОЧНИК. Шапка `serpentRace.ts` обещает, что тёмное зрение
   * и языки расы согласованы с нашими же существами в `own-creatures.json`.
   * Обещание, сверяемое со своей же константой, не покраснеет никогда (урок
   * записи 179) — поэтому числа и строки тянутся из бестиария.
   */
  it("наши серпенты в бестиарии на месте — все три записи", () => {
    expect(ourSerpents.map((m) => m.id).sort()).toEqual(
      ["chistokrovny-serpent", "otrodye-serpenta", "polukrovny-serpent"],
    );
  });

  it("тёмное зрение расы — та же дальность, что у каждого нашего серпента", () => {
    for (const creature of ourSerpents) {
      const darkvision = creature.senses?.find((s) => s.name === "тёмное зрение");
      expect(darkvision?.rangeFeet).toBe(SERPENT_DARKVISION_FEET);
    }
    const trait = SERPENT_TRAITS.find((t) => t.name === "Тёмное зрение");
    expect(trait?.description).toContain(String(SERPENT_DARKVISION_FEET));
  });

  it("языки расы — те же, что у каждого нашего серпента, с точностью до набора", () => {
    for (const creature of ourSerpents) {
      expect([...(creature.languages ?? [])].sort()).toEqual([...SERPENT_LANGUAGES.fixed].sort());
    }
    expect(SERPENT_LANGUAGES.choiceCount).toBeUndefined();
  });

  it("«Сопротивление магии» — формулировка открытого SRD, а не второй её пересказ", () => {
    // Та же строка стоит в открытых стат-блоках SRD (`bestiary.json`) и у наших
    // серпентов. Правило одно — слова у него одни.
    const RULE = "спасброски против заклинаний и прочих магических эффектов";
    const inSrd = srdBestiary.some((m) => (m.traits ?? []).some((t) => t.includes(RULE)));
    expect(inSrd).toBe(true);
    const ours = SERPENT_TRAITS.find((t) => t.name === "Сопротивление магии");
    expect(ours?.description).toContain(RULE);
  });
});

describe("что НАШЕ — и чего сознательно нет", () => {
  it("бонусы характеристик наши: Телосложение +2 и Интеллект +1, и ровно два", () => {
    expect(SERPENT_ABILITY_BONUS).toEqual({ constitution: 2, intelligence: 1 });
    expect(Object.keys(SERPENT_ABILITY_BONUS)).toHaveLength(2);
  });

  it("бонус к Харизме раса НЕ даёт — на нём держится чужая играбельная раса этой ниши", () => {
    // Сердце размена, объявленного в шапке: колдовство заменено выдержкой.
    expect(SERPENT_ABILITY_BONUS.charisma).toBeUndefined();
  });

  it("скорость — 30 футов, как у Средних рас SRD", () => {
    expect(SERPENT_SPEED_FEET).toBe(30);
    expect(serpentProse()).toContain(`Ваша базовая скорость ходьбы — ${SERPENT_SPEED_FEET} футов`);
  });

  it("врождённого колдовства у расы нет — ни заговора, ни ресурса, ни строки заклинаний", () => {
    expect(raceGrantedCantrips(SERPENT_TITLE)).toEqual([]);
    expect(raceResources(SERPENT_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(SERPENT_TITLE, (id) => id)).toBeNull();
  });

  it("цена размена названа игроку словами, а не умолчана", () => {
    // У наших же серпентов в бестиарии врождённое колдовство ЕСТЬ — игрок это
    // увидит и спросит. Текст расы обязан ответить заранее.
    const withSpellcasting = ourSerpents.filter((m) =>
      (m.traits ?? []).some((t) => t.startsWith("Врождённое колдовство")),
    );
    expect(withSpellcasting.length).toBeGreaterThan(0);
    expect(serpentProse()).toContain("Врождённого колдовства у вас нет");
  });

  it("каждая черта непуста и названа по-своему — двух заголовков одного факта нет", () => {
    const names = SERPENT_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const trait of SERPENT_TRAITS) {
      expect(trait.name.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });
});
