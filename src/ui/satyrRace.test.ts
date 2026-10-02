import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledBestiary from "../../src-tauri/bestiary/bestiary.json";
import type { RuleTopic } from "../state/types";
import {
  SATYR_ABILITY_BONUS,
  SATYR_FIXED_SKILLS,
  SATYR_ID,
  SATYR_LANGUAGES,
  SATYR_RAM_DAMAGE_DICE,
  SATYR_RAM_TRAIT_NAME,
  SATYR_SPEED_FEET,
  SATYR_TITLE,
  SATYR_TRAITS,
  isSatyr,
} from "./satyrRace";
import { ALL_LANGUAGES, ALL_SKILLS, RACE_FIXED_SKILLS, RACE_LANGUAGES, RACE_TRAITS } from "./characterCreationData";
import { isOwnRuleTopic, playableRaces } from "./ownRuleTopics";
import { abyssElfSpellLine, raceGrantedCantrips, raceResources } from "./abyssElfRace";
import { CHARACTER_PORTRAIT_RACES } from "./characterPortraits";

const rules = bundledRules as unknown as RuleTopic[];

/** Запись `satyr` открытого бестиария (CC BY 4.0) — источник трёх фактов расы. */
interface BestiaryEntry {
  id: string;
  name: string;
  size: string;
  languages?: string[];
  traits?: string[];
  actions?: string[];
}
const bestiary = bundledBestiary as unknown as BestiaryEntry[];
const satyrBlock = bestiary.find((m) => m.id === "satyr");

/** Проза расы одной строкой. */
function satyrProse(): string {
  const topic = playableRaces(rules).find((t) => t.id === SATYR_ID);
  return (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
}

describe("граница «в rules.json только SRD» — Сатир", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    expect(rules.some((t) => t.id === SATYR_ID)).toBe(false);
    expect(rules.some((t) => t.title === SATYR_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === SATYR_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется: текст расы сам говорит, чей он", () => {
    expect(satyrProse()).toContain("раса этого приложения, а не раса SRD 5.1");
    expect(satyrProse()).toContain("CC BY 4.0");
  });
});

describe("Сатир попадает в мастер и на лист", () => {
  it("стоит в playableRaces со своей категорией и своим названием, без задвоения", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === SATYR_ID);
    expect(topic?.title).toBe(SATYR_TITLE);
    expect(topic?.category).toBe("races");
    expect(races.filter((t) => t.id === SATYR_ID)).toHaveLength(1);
  });

  it("черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    // Тот же обход, что у `extractRaceTraits` (`CharactersPage.tsx`).
    const byTitle: Record<string, typeof SATYR_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[SATYR_TITLE]).toEqual(SATYR_TRAITS);
    expect(byTitle[SATYR_TITLE].map((t) => t.name)).toContain(SATYR_RAM_TRAIT_NAME);
  });

  it("языки и навык расы прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[SATYR_ID]).toEqual(SATYR_LANGUAGES);
    expect(RACE_FIXED_SKILLS[SATYR_ID]).toEqual(SATYR_FIXED_SKILLS);
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    for (const language of SATYR_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of SATYR_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("слага портрета у расы нет — портрет человеческий, а не битая картинка", () => {
    expect(CHARACTER_PORTRAIT_RACES).not.toContain(SATYR_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isSatyr(SATYR_TITLE)).toBe(true);
    expect(isSatyr("Гоблин")).toBe(false);
    expect(isSatyr(null)).toBe(false);
  });
});

describe("что взято из открытого бестиария — сверено с САМИМ бестиарием", () => {
  /**
   * Сторож происхождения, читающий ИСТОЧНИК, а не нашу же константу: обещание
   * шапки, сверяемое со своим же числом, не покраснеет никогда (урок записи 179).
   */
  it("запись `satyr` в открытом бестиарии на месте", () => {
    expect(satyrBlock).toBeDefined();
    expect(satyrBlock?.name).toBe(SATYR_TITLE);
  });

  it("языки расы — ровно те, что стоят в стат-блоке, и выбора раса не даёт", () => {
    expect(SATYR_LANGUAGES.fixed).toEqual(satyrBlock?.languages);
    expect(SATYR_LANGUAGES.choiceCount).toBeUndefined();
  });

  it("«Сопротивление магии» взято формулировкой стат-блока, а не пересказом", () => {
    const fromBlock = (satyrBlock?.traits ?? []).find((t) => t.startsWith("Сопротивление магии."));
    expect(fromBlock).toBeDefined();
    const ours = SATYR_TRAITS.find((t) => t.name === "Сопротивление магии");
    expect(ours).toBeDefined();
    // Правило одно, и слова у него те же: вторая формулировка разошлась бы с
    // первой при любой правке стат-блока.
    expect(fromBlock).toContain("спасброски против заклинаний и прочих магических эффектов");
    expect(ours?.description).toContain("спасброски против заклинаний и прочих магических эффектов");
  });

  it("роговой удар есть в стат-блоке, но кость урона у расы НАША, а не его", () => {
    const ram = (satyrBlock?.actions ?? []).find((a) => a.startsWith("Удар головой."));
    expect(ram).toBeDefined();
    // Сердце этой пробы: в стат-блоке стоит другая кость, посчитанная под
    // монстра с его бонусом. Совпади они — значит число молча переехало из
    // чужого стат-блока в нашу расу.
    expect(ram).not.toContain(SATYR_RAM_DAMAGE_DICE);
    const ours = SATYR_TRAITS.find((t) => t.name === SATYR_RAM_TRAIT_NAME);
    expect(ours?.description).toContain(SATYR_RAM_DAMAGE_DICE);
  });

  it("размер расы в прозе — тот же, что в стат-блоке", () => {
    expect(satyrBlock?.size).toBe("Средний");
    expect(satyrProse()).toContain(`Ваш размер — ${satyrBlock?.size}`);
  });
});

describe("что НАШЕ — собрано не под чужую играбельную расу", () => {
  it("бонусы характеристик наши: Харизма +2 и Телосложение +1, и ровно два", () => {
    expect(SATYR_ABILITY_BONUS).toEqual({ charisma: 2, constitution: 1 });
    expect(Object.keys(SATYR_ABILITY_BONUS)).toHaveLength(2);
  });

  it("скорость — 30 футов, как у Средних рас SRD, а не 35 у чужой играбельной", () => {
    expect(SATYR_SPEED_FEET).toBe(30);
    expect(satyrProse()).toContain(`Ваша базовая скорость ходьбы — ${SATYR_SPEED_FEET} футов`);
  });

  it("заклинаний раса не даёт — ни заговора, ни ресурса, ни строки заклинаний", () => {
    // Спрашиваем настоящие раздатчики, а не слова в тексте: «Сопротивление
    // магии» законно говорит про заклинания.
    expect(raceGrantedCantrips(SATYR_TITLE)).toEqual([]);
    expect(raceResources(SATYR_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(SATYR_TITLE, (id) => id)).toBeNull();
  });

  it("каждая черта непуста и названа по-своему — двух заголовков одного факта нет", () => {
    const names = SATYR_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const trait of SATYR_TRAITS) {
      expect(trait.name.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });
});
