import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledBestiary from "../../src-tauri/bestiary/bestiary.json";
import type { RuleTopic } from "../state/types";
import {
  FIRBOLG_ABILITY_BONUS,
  FIRBOLG_FIXED_SKILLS,
  FIRBOLG_ID,
  FIRBOLG_LANGUAGES,
  FIRBOLG_SPEED_FEET,
  FIRBOLG_TITLE,
  FIRBOLG_TRAITS,
  STAND_AS_TREE_TRAIT_NAME,
  isFirbolg,
} from "./firbolgRace";
import { ALL_LANGUAGES, ALL_SKILLS, RACE_FIXED_SKILLS, RACE_HP_BONUS, RACE_LANGUAGES, RACE_TRAITS } from "./characterCreationData";
import { isOwnRuleTopic, playableRaces } from "./ownRuleTopics";
import { abyssElfSpellLine, raceGrantedCantrips, raceResources } from "./abyssElfRace";
import { GOLIATH_ABILITY_BONUS } from "./goliathRace";
import { SATYR_TRAITS } from "./satyrRace";
import { SERPENT_TRAITS } from "./serpentRace";
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

describe("граница «в rules.json только SRD» — Фирболг", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    expect(rules.some((t) => t.id === FIRBOLG_ID)).toBe(false);
    expect(rules.some((t) => t.title === FIRBOLG_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === FIRBOLG_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется: текст расы сам говорит, чей он", () => {
    const prose = firbolgProse();
    expect(prose).toContain("раса этого приложения, а не раса SRD 5.1");
    expect(prose).toContain("CC BY 4.0");
  });
});

describe("Фирболг попадает в мастер и на лист", () => {
  it("стоит в playableRaces со своей категорией и своим названием", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === FIRBOLG_ID);
    expect(topic?.title).toBe(FIRBOLG_TITLE);
    expect(topic?.category).toBe("races");
    expect(races.filter((t) => t.id === FIRBOLG_ID)).toHaveLength(1);
  });

  it("черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    const byTitle: Record<string, typeof FIRBOLG_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[FIRBOLG_TITLE]).toEqual(FIRBOLG_TRAITS);
    expect(byTitle[FIRBOLG_TITLE].map((t) => t.name)).toContain(STAND_AS_TREE_TRAIT_NAME);
  });

  it("языки и навык расы прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[FIRBOLG_ID]).toEqual(FIRBOLG_LANGUAGES);
    expect(RACE_FIXED_SKILLS[FIRBOLG_ID]).toEqual(FIRBOLG_FIXED_SKILLS);
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    for (const language of FIRBOLG_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of FIRBOLG_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("выбора языка раса не даёт — в отличие от чужой расы той же ниши", () => {
    expect(FIRBOLG_LANGUAGES.choiceCount).toBeUndefined();
    expect(FIRBOLG_LANGUAGES.fixed).toHaveLength(3);
  });

  it("прибавки к хитам у расы нет — карта о ней не знает", () => {
    // Шапка обещает, что хитов раса не добавляет. Запись в карте появилась бы
    // молча: `maxHpForLevel` прибавляет её один раз и никак не жалуется.
    expect(RACE_HP_BONUS[FIRBOLG_ID]).toBeUndefined();
  });

  it("раса зарегистрирована в библиотеке портретов", () => {
    expect(CHARACTER_PORTRAIT_RACES).toContain(FIRBOLG_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isFirbolg(FIRBOLG_TITLE)).toBe(true);
    expect(isFirbolg("Зайцегон")).toBe(false);
    expect(isFirbolg(null)).toBe(false);
    expect(isFirbolg(undefined)).toBe(false);
  });
});

describe("что взято из открытого бестиария — сверено с САМИМ бестиарием", () => {
  /**
   * Сторож происхождения, и он читает ИСТОЧНИК, а не нашу же константу (урок
   * записи 179). Шапка `firbolgRace.ts` обещает три факта из открытого
   * бестиария: язык великанов, язык Сильван и формулировку неподвижности.
   */
  it("язык великанов стоит в открытых стат-блоках великанов — взят оттуда", () => {
    const giants = ["hill-giant", "stone-giant", "cloud-giant"].map((id) =>
      bestiary.find((m) => m.id === id),
    );
    for (const block of giants) {
      expect(block, "стат-блока великана нет в бестиарии").toBeDefined();
      expect(block?.languages ?? []).toContain("Великаний");
    }
    expect(FIRBOLG_LANGUAGES.fixed).toContain("Великаний");
  });

  it("Сильван стоит в открытых фейских стат-блоках — язык взят оттуда", () => {
    const fey = ["dryad", "treant", "satyr", "sprite"].map((id) => bestiary.find((m) => m.id === id));
    for (const block of fey) {
      expect(block, "фейского стат-блока нет в бестиарии").toBeDefined();
      expect(block?.languages ?? []).toContain("Сильван");
    }
    expect(FIRBOLG_LANGUAGES.fixed).toContain("Сильван");
  });

  it("формулировка «Стоять деревом» повторяет открытую, а не заводит вторую", () => {
    // В стат-блоках `treant` и `awakened-tree` стоит «Ложная внешность. Пока
    // древень остаётся неподвижным, он неотличим от обычного дерева.» Наша
    // черта повторяет ту же конструкцию для существа, а не для дерева.
    const WORDING = "остаётся неподвижным";
    const INDISTINGUISHABLE = "неотличим";
    for (const id of ["treant", "awakened-tree"]) {
      const block = bestiary.find((m) => m.id === id);
      expect(block, `${id} нет в бестиарии`).toBeDefined();
      const open = (block?.traits ?? []).find(
        (t) => t.includes(WORDING) && t.includes(INDISTINGUISHABLE) && t.includes("дерева"),
      );
      expect(open, `формулировки нет в открытом стат-блоке ${id}`).toBeDefined();
    }
    const trait = FIRBOLG_TRAITS.find((t) => t.name === STAND_AS_TREE_TRAIT_NAME);
    expect(trait?.description).toContain("неподвижным");
    expect(trait?.description).toContain(INDISTINGUISHABLE);
  });

  it("тёмного зрения раса не даёт — у открытых фей его нет поголовно", () => {
    // Шапка утверждает: `treant`, `satyr` и `sprite` чувств не несут вовсе, а
    // тёмное зрение есть только у `dryad`. Соври она — и дальность оказалась бы
    // приписана «как соседям».
    for (const id of ["treant", "satyr", "sprite"]) {
      const block = bestiary.find((m) => m.id === id);
      expect(block?.senses ?? []).toEqual([]);
    }
    expect((bestiary.find((m) => m.id === "dryad")?.senses ?? []).length).toBeGreaterThan(0);
    expect(FIRBOLG_TRAITS.map((t) => t.name)).not.toContain("Тёмное зрение");
    expect(firbolgProse()).not.toContain("Тёмное зрение.");
  });

  it("«Сопротивление магии» раса не берёт — его уже держат Сатир и Серпенты", () => {
    // Открытые феи его дают (`satyr`, `dryad`), то есть взять было бы можно.
    // Шапка объясняет, почему не взято: третья копия сделала бы формулировку
    // общей приметой наших рас вместо приметы расы. Проба читает обе наши
    // расы, а не повторяет утверждение шапки.
    const RESIST = "Сопротивление магии";
    const open = (bestiary.find((m) => m.id === "satyr")?.traits ?? []).some((t) => t.startsWith(RESIST));
    expect(open, "формулировки нет в открытом стат-блоке сатира").toBe(true);
    expect(SATYR_TRAITS.map((t) => t.name)).toContain(RESIST);
    expect(SERPENT_TRAITS.map((t) => t.name)).toContain(RESIST);
    expect(FIRBOLG_TRAITS.map((t) => t.name)).not.toContain(RESIST);
  });
});

describe("что НАШЕ — собрано не под чужую играбельную расу", () => {
  it("бонусы характеристик разошлись и с чужим пакетом, и с нашим Голиафом", () => {
    // У чужой расы той же ниши — Мудрость +2 и Сила +1; у нашего Голиафа —
    // Сила +2 и Мудрость +1. Совпади любая из пар, и числа молча переехали бы
    // либо из чужого пакета, либо из соседней нашей расы. Пара Голиафа читается
    // из его модуля, а не повторяется здесь строкой.
    expect(FIRBOLG_ABILITY_BONUS).toEqual({ wisdom: 2, constitution: 1 });
    expect(FIRBOLG_ABILITY_BONUS).not.toEqual({ wisdom: 2, strength: 1 });
    expect(FIRBOLG_ABILITY_BONUS).not.toEqual(GOLIATH_ABILITY_BONUS);
    expect(Object.keys(FIRBOLG_ABILITY_BONUS)).toHaveLength(2);
  });

  it("скорость — 30 футов и объявлена базой, а не слоем", () => {
    expect(FIRBOLG_SPEED_FEET).toBe(30);
    expect(firbolgProse()).toContain(`Ваша базовая скорость ходьбы — ${FIRBOLG_SPEED_FEET} футов`);
  });

  it("рост у расы свой — чужие 7–8 футов в тексте не стоят", () => {
    const prose = firbolgProse();
    expect(prose).toContain("от 6,5 до 7,5 футов");
    expect(prose).not.toContain("от 7 до 8 футов");
    expect(prose).toContain("Ваш размер — Средний");
  });

  it("заклинаний раса не даёт — ни заговора, ни ресурса, ни строки заклинаний", () => {
    expect(raceGrantedCantrips(FIRBOLG_TITLE)).toEqual([]);
    expect(raceResources(FIRBOLG_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(FIRBOLG_TITLE, (id) => id)).toBeNull();
  });

  it("ни невидимости, ни грузоподъёмности, ни зверей с растениями в чертах", () => {
    // Три узнаваемых части чужого пакета: невидимость бонусным действием,
    // грузоподъёмность на категорию размера выше и общение со зверями и
    // растениями с преимуществом на проверки Харизмы. Ни одна из них не должна
    // доехать до наших черт даже под другим именем.
    for (const trait of FIRBOLG_TRAITS) {
      const text = `${trait.name}. ${trait.description}`;
      for (const forbidden of ["невидим", "грузоподъёмност", "бонусным действием", "звер", "растен"]) {
        expect(text.toLowerCase().includes(forbidden), `в черте «${trait.name}» всплыло «${forbidden}»`).toBe(
          false,
        );
      }
    }
    const prose = firbolgProse();
    expect(prose).not.toContain("невидим");
    expect(prose).not.toContain("грузоподъёмност");
  });

  it("каждая черта непуста и названа по-своему — двух заголовков одного факта нет", () => {
    const names = FIRBOLG_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const trait of FIRBOLG_TRAITS) {
      expect(trait.name.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });

  it("фиксированный навык назван чертой — иначе на листе он выглядит как ничей", () => {
    const trait = FIRBOLG_TRAITS.find((t) => t.name === "Повадка лесничего");
    expect(trait?.description).toContain("Выживани");
  });
});

/** Проза расы одной строкой — её читают сразу несколько проб выше. */
function firbolgProse(): string {
  const topic = playableRaces(rules).find((t) => t.id === FIRBOLG_ID);
  return (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
}
