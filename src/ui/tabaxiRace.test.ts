import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledBestiary from "../../src-tauri/bestiary/bestiary.json";
import type { RuleTopic } from "../state/types";
import {
  CURIOSITY_TRAIT_NAME,
  TABAXI_ABILITY_BONUS,
  TABAXI_DARKVISION_FEET,
  TABAXI_FIXED_SKILLS,
  TABAXI_ID,
  TABAXI_LANGUAGES,
  TABAXI_SPEED_FEET,
  TABAXI_TITLE,
  TABAXI_TRAITS,
  isTabaxi,
} from "./tabaxiRace";
import { ALL_LANGUAGES, ALL_SKILLS, RACE_FIXED_SKILLS, RACE_LANGUAGES, RACE_TRAITS } from "./characterCreationData";
import { isOwnRuleTopic, playableRaces } from "./ownRuleTopics";
import { abyssElfSpellLine, raceGrantedCantrips, raceResources } from "./abyssElfRace";
import { CHARACTER_PORTRAIT_RACES } from "./characterPortraits";

const rules = bundledRules as unknown as RuleTopic[];

/** Запись `tiger` открытого бестиария (CC BY 4.0) — источник единственного взятого факта. */
interface BestiaryEntry {
  id: string;
  name: string;
  size: string;
  speedFeet: number;
  languages?: string[];
  senses?: { name: string; rangeFeet?: number | null }[];
  traits?: string[];
}
const bestiary = bundledBestiary as unknown as BestiaryEntry[];
const tigerBlock = bestiary.find((m) => m.id === "tiger");

describe("граница «в rules.json только SRD» — Табакси", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    expect(rules.some((t) => t.id === TABAXI_ID)).toBe(false);
    expect(rules.some((t) => t.title === TABAXI_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === TABAXI_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется: текст расы сам говорит, чей он", () => {
    const prose = tabaxiProse();
    expect(prose).toContain("раса этого приложения, а не раса SRD 5.1");
    expect(prose).toContain("CC BY 4.0");
  });
});

describe("Табакси попадает в мастер и на лист", () => {
  it("стоит в playableRaces со своей категорией и своим названием", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === TABAXI_ID);
    expect(topic?.title).toBe(TABAXI_TITLE);
    expect(topic?.category).toBe("races");
    expect(races.filter((t) => t.id === TABAXI_ID)).toHaveLength(1);
  });

  it("черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    // Тот же обход, что у `extractRaceTraits` (`CharactersPage.tsx`).
    const byTitle: Record<string, typeof TABAXI_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[TABAXI_TITLE]).toEqual(TABAXI_TRAITS);
    expect(byTitle[TABAXI_TITLE].map((t) => t.name)).toContain(CURIOSITY_TRAIT_NAME);
  });

  it("языки и навык расы прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[TABAXI_ID]).toEqual(TABAXI_LANGUAGES);
    expect(RACE_FIXED_SKILLS[TABAXI_ID]).toEqual(TABAXI_FIXED_SKILLS);
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    for (const language of TABAXI_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of TABAXI_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("выбор языка ровно один — больше одного мастер молча потерял бы", () => {
    // Находка пачки A: `raceFinalLanguages` берёт ОДНО значение независимо от
    // числа в карте, поэтому двойка здесь потерялась бы на втором языке.
    expect(TABAXI_LANGUAGES.choiceCount).toBe(1);
  });

  it("слага портрета у расы нет — портрет человеческий, а не битая картинка", () => {
    expect(CHARACTER_PORTRAIT_RACES).not.toContain(TABAXI_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isTabaxi(TABAXI_TITLE)).toBe(true);
    expect(isTabaxi("Гоблин")).toBe(false);
    expect(isTabaxi(null)).toBe(false);
    expect(isTabaxi(undefined)).toBe(false);
  });
});

describe("что взято из открытого бестиария — сверено с САМИМ бестиарием", () => {
  /**
   * Сторож происхождения, и он читает ИСТОЧНИК, а не нашу же константу (урок
   * записи 179). Шапка `tabaxiRace.ts` обещает ОДИН факт из открытого
   * бестиария — тёмное зрение 60 футов из записи `tiger`, единственного
   * кошачьего стат-блока, у которого чувство с дальностью есть вовсе.
   */
  it("запись `tiger` в открытом бестиарии на месте и чувство у неё одно", () => {
    expect(tigerBlock).toBeDefined();
    const ranges = (tigerBlock?.senses ?? []).filter((s) => s.name === "тёмное зрение");
    expect(ranges).toHaveLength(1);
  });

  it("тёмное зрение расы — ровно та дальность, что стоит в стат-блоке", () => {
    const darkvision = tigerBlock?.senses?.find((s) => s.name === "тёмное зрение");
    expect(darkvision?.rangeFeet).toBe(TABAXI_DARKVISION_FEET);
    const trait = TABAXI_TRAITS.find((t) => t.name === "Тёмное зрение");
    expect(trait?.description).toContain(String(TABAXI_DARKVISION_FEET));
    expect(tabaxiProse()).toContain(`На расстоянии в ${TABAXI_DARKVISION_FEET} футов`);
  });

  it("остальные числа кошачьего стат-блока в расу НЕ переехали", () => {
    // Числа обязаны РАЗОЙТИСЬ: совпади скорость — значит она молча взята из
    // чужого блока вместе с чувством. Тот же приём, что у кости рогов Сатира.
    expect(tigerBlock?.speedFeet).toBe(40);
    expect(TABAXI_SPEED_FEET).not.toBe(tigerBlock?.speedFeet);
    // Размер тигра Большой — наша раса Средняя, и в прозе стоит её размер.
    expect(tigerBlock?.size).toBe("Большой");
    expect(tabaxiProse()).toContain("Ваш размер — Средний");
  });

  it("у кошачьих стат-блоков без чувств число не подобрано по соседям", () => {
    // Шапка утверждает, что `cat`, `panther` и `saber-toothed-tiger` строку
    // чувств не несут вовсе. Соври она — и дальность оказалась бы взята
    // неизвестно откуда.
    for (const id of ["cat", "panther", "saber-toothed-tiger"]) {
      const block = bestiary.find((m) => m.id === id);
      expect(block, `${id} нет в бестиарии`).toBeDefined();
      expect(block?.senses ?? []).toEqual([]);
    }
  });
});

describe("что НАШЕ — собрано не под чужую играбельную расу", () => {
  it("бонусы характеристик наши: Ловкость +2 и Мудрость +1", () => {
    // Чужая играбельная раса той же ниши даёт Ловкость и Харизму. Проба
    // сторожит и то, что бонусов ровно два: третий прошёл бы в характеристики
    // молча.
    expect(TABAXI_ABILITY_BONUS).toEqual({ dexterity: 2, wisdom: 1 });
    expect(Object.keys(TABAXI_ABILITY_BONUS)).toHaveLength(2);
    expect(TABAXI_ABILITY_BONUS.charisma).toBeUndefined();
  });

  it("скорость — 30 футов и объявлена базой, а не слоем", () => {
    expect(TABAXI_SPEED_FEET).toBe(30);
    expect(tabaxiProse()).toContain(`Ваша базовая скорость ходьбы — ${TABAXI_SPEED_FEET} футов`);
  });

  it("навык раса даёт ОДИН — двух фиксированных навыков чужого пакета у неё нет", () => {
    expect(TABAXI_FIXED_SKILLS).toHaveLength(1);
    expect(TABAXI_FIXED_SKILLS).toEqual(["Расследование"]);
  });

  it("заклинаний раса не даёт — ни заговора, ни ресурса, ни строки заклинаний", () => {
    // Спрашиваются НАСТОЯЩИЕ раздатчики (их зовут мастер создания и лист), а
    // не слова в тексте: раздатчики сегодня умеют ровно одну расу, и обобщать
    // их — чужая карточка.
    expect(raceGrantedCantrips(TABAXI_TITLE)).toEqual([]);
    expect(raceResources(TABAXI_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(TABAXI_TITLE, (id) => id)).toBeNull();
  });

  it("каждая черта непуста и названа по-своему — двух заголовков одного факта нет", () => {
    const names = TABAXI_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const trait of TABAXI_TRAITS) {
      expect(trait.name.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });

  it("фиксированный навык назван чертой — иначе на листе он выглядит как ничей", () => {
    const trait = TABAXI_TRAITS.find((t) => t.name === "Повадка собирателя");
    expect(trait?.description).toContain(TABAXI_FIXED_SKILLS[0]);
  });
});

/** Проза расы одной строкой — её читают сразу несколько проб выше. */
function tabaxiProse(): string {
  const topic = playableRaces(rules).find((t) => t.id === TABAXI_ID);
  return (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
}
