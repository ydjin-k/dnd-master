import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleBlock, RuleTopic } from "../state/types";
import {
  GOLIATH_ABILITY_BONUS,
  GOLIATH_FIXED_SKILLS,
  GOLIATH_HP_BONUS,
  GOLIATH_ID,
  GOLIATH_LANGUAGES,
  GOLIATH_SPEED_FEET,
  GOLIATH_TITLE,
  GOLIATH_TRAITS,
  RIVALRY_TRAIT_NAME,
  STONE_SKIN_TRAIT_NAME,
  isGoliath,
} from "./goliathRace";
import {
  ALL_LANGUAGES,
  ALL_SKILLS,
  RACE_FIXED_SKILLS,
  RACE_HP_BONUS,
  RACE_LANGUAGES,
  RACE_TRAITS,
  maxHpForLevel,
} from "./characterCreationData";
import { isOwnRuleTopic, playableRaces } from "./ownRuleTopics";
import { abyssElfSpellLine, raceGrantedCantrips, raceResources } from "./abyssElfRace";
import { CHARACTER_PORTRAIT_RACES } from "./characterPortraits";

const rules = bundledRules as unknown as RuleTopic[];

function goliathProse(): string {
  const topic = playableRaces(rules).find((t) => t.id === GOLIATH_ID);
  return (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
}

describe("граница «в rules.json только SRD» — Голиаф", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    expect(rules.some((t) => t.id === GOLIATH_ID)).toBe(false);
    expect(rules.some((t) => t.title === GOLIATH_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === GOLIATH_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется и честно говорит, что механики из SRD не взято", () => {
    expect(goliathProse()).toContain("раса этого приложения, а не раса SRD 5.1");
    expect(goliathProse()).toContain("механики не взято ничего");
  });

  /**
   * Сторож единственного, что раса взяла из SRD, — и он читает ИСТОЧНИК. Шапка
   * обещает, что «Великаний» пришёл из общего списка языков SRD, а не выдуман
   * рядом; и что расы этой ниши в открытом SRD нет вовсе.
   */
  it("«Великаний» действительно стоит в списке языков SRD, а не выдуман рядом", () => {
    const languages = rules.find((t) => t.id === "character-languages");
    expect(languages).toBeDefined();
    const text = JSON.stringify(languages?.blocks ?? ([] as RuleBlock[]));
    for (const language of GOLIATH_LANGUAGES.fixed) expect(text).toContain(language);
  });

  it("обещание «в открытом SRD этой ниши нет» проверено по самому rules.json", () => {
    expect(JSON.stringify(rules).toLowerCase()).not.toContain("голиаф");
  });
});

describe("Голиаф попадает в мастер и на лист", () => {
  it("стоит в playableRaces со своей категорией и своим названием, без задвоения", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === GOLIATH_ID);
    expect(topic?.title).toBe(GOLIATH_TITLE);
    expect(topic?.category).toBe("races");
    expect(races.filter((t) => t.id === GOLIATH_ID)).toHaveLength(1);
  });

  it("черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    const byTitle: Record<string, typeof GOLIATH_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[GOLIATH_TITLE]).toEqual(GOLIATH_TRAITS);
    expect(byTitle[GOLIATH_TITLE].map((t) => t.name)).toContain(RIVALRY_TRAIT_NAME);
  });

  it("языки, навык и прибавка к хитам прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[GOLIATH_ID]).toEqual(GOLIATH_LANGUAGES);
    expect(RACE_FIXED_SKILLS[GOLIATH_ID]).toEqual(GOLIATH_FIXED_SKILLS);
    expect(RACE_HP_BONUS[GOLIATH_ID]).toBe(GOLIATH_HP_BONUS);
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    for (const language of GOLIATH_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of GOLIATH_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("слага портрета у расы нет — портрет человеческий, а не битая картинка", () => {
    expect(CHARACTER_PORTRAIT_RACES).not.toContain(GOLIATH_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isGoliath(GOLIATH_TITLE)).toBe(true);
    expect(isGoliath("Чейнджлинг")).toBe(false);
    expect(isGoliath(null)).toBe(false);
  });
});

describe("«Каменная кожа» — вторая запись в RACE_HP_BONUS, и она разовая", () => {
  it("прибавка к хитам считается ОДИН раз, а не на каждом уровне", () => {
    // Сердце этой пробы: она спрашивает САМ расчёт (`maxHpForLevel`), а не наше
    // число. Прибавка, посчитанная на каждом уровне, дала бы на 5 уровне +10, и
    // «каменная кожа» молча росла бы вместе с персонажем.
    const WITHOUT = maxHpForLevel(10, 6, 0, 0, 5);
    const WITH = maxHpForLevel(10, 6, 0, GOLIATH_HP_BONUS, 5);
    expect(WITH - WITHOUT).toBe(GOLIATH_HP_BONUS);
    const atOne = maxHpForLevel(10, 6, 0, GOLIATH_HP_BONUS, 1) - maxHpForLevel(10, 6, 0, 0, 1);
    expect(atOne).toBe(GOLIATH_HP_BONUS);
  });

  it("особенность не повторяет прибавку, а отсылает к ней — тем же оборотом, что у дварфа", () => {
    // Иначе игрок прибавит её дважды: один раз из максимума хитов на листе,
    // второй — прочитав особенность.
    const stoneSkin = GOLIATH_TRAITS.find((t) => t.name === STONE_SKIN_TRAIT_NAME);
    expect(stoneSkin?.description).toContain("Уже учтено в максимуме хитов выше");
    expect(stoneSkin?.description).toContain(String(GOLIATH_HP_BONUS));
    const dwarfToughness = (RACE_TRAITS["races-dwarf"] ?? []).find((t) =>
      t.description.startsWith("Уже учтено в максимуме хитов выше"),
    );
    expect(dwarfToughness).toBeDefined();
  });

  it("карта прибавок держит ровно две записи — дварфа из SRD и нашу", () => {
    expect(Object.keys(RACE_HP_BONUS).sort()).toEqual([GOLIATH_ID, "races-dwarf"].sort());
    expect(RACE_HP_BONUS["races-dwarf"]).toBe(1);
  });

  it("текст расы называет и число, и то, что оно разовое", () => {
    expect(goliathProse()).toContain("увеличивается на 2 на 1 уровне");
    expect(goliathProse()).toContain("только на первом");
  });
});

describe("что НАШЕ — собрано не под чужую играбельную расу", () => {
  it("бонусы характеристик наши: Сила +2 и Мудрость +1, и ровно два", () => {
    expect(GOLIATH_ABILITY_BONUS).toEqual({ strength: 2, wisdom: 1 });
    expect(Object.keys(GOLIATH_ABILITY_BONUS)).toHaveLength(2);
  });

  it("бонуса к Телосложению раса НЕ даёт — на нём держится чужая играбельная раса", () => {
    // Мудрость вместо Телосложения взята из ниши файла владельца: на врождённую
    // мудрость вождя в племенах рассчитывают потому, что до мудрости от лет там
    // доживают редко.
    expect(GOLIATH_ABILITY_BONUS.constitution).toBeUndefined();
  });

  it("скорость — 30 футов, как у Средних рас SRD", () => {
    expect(GOLIATH_SPEED_FEET).toBe(30);
    expect(goliathProse()).toContain(`Ваша базовая скорость ходьбы — ${GOLIATH_SPEED_FEET} футов`);
  });

  it("заклинаний раса не даёт — ни заговора, ни ресурса, ни строки заклинаний", () => {
    expect(raceGrantedCantrips(GOLIATH_TITLE)).toEqual([]);
    expect(raceResources(GOLIATH_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(GOLIATH_TITLE, (id) => id)).toBeNull();
  });

  it("каждая черта непуста и названа по-своему — двух заголовков одного факта нет", () => {
    const names = GOLIATH_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const trait of GOLIATH_TRAITS) {
      expect(trait.name.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });
});
