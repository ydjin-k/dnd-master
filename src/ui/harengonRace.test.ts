import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledBestiary from "../../src-tauri/bestiary/bestiary.json";
import type { RuleTopic } from "../state/types";
import {
  HARENGON_ABILITY_BONUS,
  HARENGON_FIXED_SKILLS,
  HARENGON_ID,
  HARENGON_LANGUAGES,
  HARENGON_SPEED_FEET,
  HARENGON_TITLE,
  HARENGON_TRAITS,
  STANDING_LEAP_TRAIT_NAME,
  isHarengon,
} from "./harengonRace";
import { ALL_LANGUAGES, ALL_SKILLS, RACE_FIXED_SKILLS, RACE_LANGUAGES, RACE_TRAITS } from "./characterCreationData";
import { isOwnRuleTopic, playableRaces } from "./ownRuleTopics";
import { abyssElfSpellLine, raceGrantedCantrips, raceResources } from "./abyssElfRace";
import { CHARACTER_PORTRAIT_RACES } from "./characterPortraits";

const rules = bundledRules as unknown as RuleTopic[];

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

describe("граница «в rules.json только SRD» — Зайцегон", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    expect(rules.some((t) => t.id === HARENGON_ID)).toBe(false);
    expect(rules.some((t) => t.title === HARENGON_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === HARENGON_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется: текст расы сам говорит, чей он", () => {
    const prose = harengonProse();
    expect(prose).toContain("раса этого приложения, а не раса SRD 5.1");
    expect(prose).toContain("CC BY 4.0");
  });
});

describe("Зайцегон попадает в мастер и на лист", () => {
  it("стоит в playableRaces со своей категорией и своим названием", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === HARENGON_ID);
    expect(topic?.title).toBe(HARENGON_TITLE);
    expect(topic?.category).toBe("races");
    expect(races.filter((t) => t.id === HARENGON_ID)).toHaveLength(1);
  });

  it("черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    const byTitle: Record<string, typeof HARENGON_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[HARENGON_TITLE]).toEqual(HARENGON_TRAITS);
    expect(byTitle[HARENGON_TITLE].map((t) => t.name)).toContain(STANDING_LEAP_TRAIT_NAME);
  });

  it("языки и навык расы прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[HARENGON_ID]).toEqual(HARENGON_LANGUAGES);
    expect(RACE_FIXED_SKILLS[HARENGON_ID]).toEqual(HARENGON_FIXED_SKILLS);
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    for (const language of HARENGON_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of HARENGON_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("выбора языка раса не даёт — в отличие от чужой расы той же ниши", () => {
    expect(HARENGON_LANGUAGES.choiceCount).toBeUndefined();
    expect(HARENGON_LANGUAGES.fixed).toHaveLength(2);
  });

  it("слага портрета у расы нет — портрет человеческий, а не битая картинка", () => {
    expect(CHARACTER_PORTRAIT_RACES).not.toContain(HARENGON_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isHarengon(HARENGON_TITLE)).toBe(true);
    expect(isHarengon("Табакси")).toBe(false);
    expect(isHarengon(null)).toBe(false);
    expect(isHarengon(undefined)).toBe(false);
  });
});

describe("что взято из открытого бестиария — сверено с САМИМ бестиарием", () => {
  /**
   * Сторож происхождения, и он читает ИСТОЧНИК, а не нашу же константу (урок
   * записи 179). Шапка `harengonRace.ts` обещает два факта из открытого
   * бестиария: язык Сильван фейских стат-блоков и формулировку преимущества на
   * проверки по одному чувству.
   */
  it("Сильван стоит в открытых фейских стат-блоках — язык взят оттуда", () => {
    const fey = ["sprite", "dryad", "satyr"].map((id) => bestiary.find((m) => m.id === id));
    for (const block of fey) {
      expect(block, "фейского стат-блока нет в бестиарии").toBeDefined();
      expect(block?.languages ?? []).toContain("Сильван");
    }
    expect(HARENGON_LANGUAGES.fixed).toContain("Сильван");
  });

  it("формулировка «Заячьего слуха» повторяет открытую, а не заводит вторую", () => {
    // В стат-блоке `tiger` стоит «Острый нюх. Тигр совершает с преимуществом
    // проверки Мудрости (Восприятие), основанные на нюхе.» Наша черта
    // повторяет ту же конструкцию для слуха.
    const tiger = bestiary.find((m) => m.id === "tiger");
    const openWording = (tiger?.traits ?? []).find((t) =>
      t.includes("с преимуществом проверки Мудрости (Восприятие), основанные на"),
    );
    expect(openWording, "формулировки нет в открытом стат-блоке").toBeDefined();
    const trait = HARENGON_TRAITS.find((t) => t.name === "Заячий слух");
    expect(trait?.description).toContain("с преимуществом проверки Мудрости (Восприятие), основанные на");
  });

  it("тёмного зрения раса не даёт — у открытых фей его нет поголовно", () => {
    // Шапка утверждает, что `sprite` и `satyr` чувств не несут вовсе. Соври
    // она — и дальность оказалась бы приписана «как соседям».
    for (const id of ["sprite", "satyr"]) {
      const block = bestiary.find((m) => m.id === id);
      expect(block?.senses ?? []).toEqual([]);
    }
    expect(HARENGON_TRAITS.map((t) => t.name)).not.toContain("Тёмное зрение");
    expect(harengonProse()).not.toContain("Тёмное зрение.");
  });
});

describe("что НАШЕ — собрано не под чужую играбельную расу", () => {
  it("бонусы характеристик НАЗНАЧЕНЫ, а выбора игроку раса не даёт", () => {
    // Главное отличие от чужой играбельной расы той же ниши: там оба бонуса
    // выбирает игрок. Здесь выбора нет — и `raceBonus.choice` для этой расы
    // остаётся пустым, иначе мастер нарисовал бы лишний блок выбора.
    expect(HARENGON_ABILITY_BONUS).toEqual({ dexterity: 2, constitution: 1 });
    expect(Object.keys(HARENGON_ABILITY_BONUS)).toHaveLength(2);
  });

  it("скорость — 30 футов и объявлена базой, а не слоем", () => {
    expect(HARENGON_SPEED_FEET).toBe(30);
    expect(harengonProse()).toContain(`Ваша базовая скорость ходьбы — ${HARENGON_SPEED_FEET} футов`);
  });

  it("размер один — выбора между Маленьким и Средним у расы нет", () => {
    const prose = harengonProse();
    expect(prose).toContain("Ваш размер — Средний");
    expect(prose).not.toContain("Маленький");
  });

  it("прыжок меняет ХАРАКТЕРИСТИКУ расчёта, а не добавляет действие хода", () => {
    // У чужой расы прыжок — бонусное действие на пятикратный бонус
    // мастерства. Проба сторожит, что наша черта ни бонусного действия, ни
    // бонуса мастерства не упоминает: иначе чужая механика переехала бы
    // целиком, только под другим именем.
    const trait = HARENGON_TRAITS.find((t) => t.name === STANDING_LEAP_TRAIT_NAME);
    expect(trait?.description).toContain("Ловкости");
    expect(trait?.description).not.toContain("бонусным действием");
    expect(trait?.description).not.toContain("бонус мастерства");
  });

  it("инициативу раса не трогает — бонуса мастерства к ней нет ни в одной черте", () => {
    // У чужой расы к инициативе прибавляется бонус мастерства. Это заодно и
    // техническая правда: `initiative` на листе считается из Ловкости одним
    // владельцем, и расовая прибавка к нему потребовала бы второго.
    for (const trait of HARENGON_TRAITS) expect(trait.description).not.toContain("инициатив");
    expect(harengonProse()).not.toContain("инициатив");
  });

  it("заклинаний раса не даёт — ни заговора, ни ресурса, ни строки заклинаний", () => {
    expect(raceGrantedCantrips(HARENGON_TITLE)).toEqual([]);
    expect(raceResources(HARENGON_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(HARENGON_TITLE, (id) => id)).toBeNull();
  });

  it("каждая черта непуста и названа по-своему — двух заголовков одного факта нет", () => {
    const names = HARENGON_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const trait of HARENGON_TRAITS) {
      expect(trait.name.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });

  it("фиксированный навык назван чертой — иначе на листе он выглядит как ничей", () => {
    const trait = HARENGON_TRAITS.find((t) => t.name === "Повадка бегуна");
    expect(trait?.description).toContain("Акробатик");
  });
});

/** Проза расы одной строкой — её читают сразу несколько проб выше. */
function harengonProse(): string {
  const topic = playableRaces(rules).find((t) => t.id === HARENGON_ID);
  return (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
}
