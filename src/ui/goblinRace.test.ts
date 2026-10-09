import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledBestiary from "../../src-tauri/bestiary/bestiary.json";
import type { RuleTopic } from "../state/types";
import {
  GOBLIN_ABILITY_BONUS,
  GOBLIN_DARKVISION_FEET,
  GOBLIN_FIXED_SKILLS,
  GOBLIN_ID,
  GOBLIN_LANGUAGES,
  GOBLIN_SPEED_FEET,
  GOBLIN_TITLE,
  GOBLIN_TRAITS,
  GRUDGE_TRAIT_NAME,
  isGoblin,
} from "./goblinRace";
import { ALL_LANGUAGES, ALL_SKILLS, RACE_FIXED_SKILLS, RACE_LANGUAGES, RACE_TRAITS } from "./characterCreationData";
import { isOwnRuleTopic, playableRaces } from "./ownRuleTopics";
import { abyssElfSpellLine, raceGrantedCantrips, raceResources } from "./abyssElfRace";
import { CHARACTER_PORTRAIT_RACES } from "./characterPortraits";

const rules = bundledRules as unknown as RuleTopic[];

/** Запись `goblin` открытого бестиария (CC BY 4.0) — источник четырёх фактов расы. */
interface BestiaryEntry {
  id: string;
  name: string;
  size: string;
  languages?: string[];
  senses?: { name: string; rangeFeet?: number | null }[];
  traits?: string[];
}
const bestiary = bundledBestiary as unknown as BestiaryEntry[];
const goblinBlock = bestiary.find((m) => m.id === "goblin");

describe("граница «в rules.json только SRD» — Гоблин", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    // Раса живёт отдельным модулем именно затем, чтобы эта проба была
    // выполнима: подвал вкладки «Правила» обещает SRD за всё, что пришло из
    // rules.json, и подмешанная туда раса соврала бы об источнике.
    expect(rules.some((t) => t.id === GOBLIN_ID)).toBe(false);
    expect(rules.some((t) => t.title === GOBLIN_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === GOBLIN_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    // Ссылки на SRD у нашего текста быть не может: подвал показывает её как
    // «Источник этого раздела».
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется: текст расы сам говорит, чей он", () => {
    const topic = playableRaces(rules).find((t) => t.id === GOBLIN_ID);
    const prose = (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
    expect(prose).toContain("раса этого приложения, а не раса SRD 5.1");
    expect(prose).toContain("CC BY 4.0");
  });
});

describe("Гоблин попадает в мастер и на лист", () => {
  it("стоит в playableRaces со своей категорией и своим названием", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === GOBLIN_ID);
    expect(topic?.title).toBe(GOBLIN_TITLE);
    expect(topic?.category).toBe("races");
    // Задвоение — главный риск регистрации: раса могла приехать и из
    // OWN_RULE_TOPICS, и откуда-то ещё.
    expect(races.filter((t) => t.id === GOBLIN_ID)).toHaveLength(1);
  });

  it("черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    // Тот же обход, что у `extractRaceTraits` (`CharactersPage.tsx`): лист
    // идёт по `playableRaces`, переводит id раздела в заголовок и берёт черты
    // из `RACE_TRAITS`. `Character.race` хранит ТЕКСТ, не id, поэтому
    // пропущенная строка в карте делает расу на листе безмолвной.
    const byTitle: Record<string, typeof GOBLIN_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[GOBLIN_TITLE]).toEqual(GOBLIN_TRAITS);
    expect(byTitle[GOBLIN_TITLE].map((t) => t.name)).toContain(GRUDGE_TRAIT_NAME);
  });

  it("языки и навык расы прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[GOBLIN_ID]).toEqual(GOBLIN_LANGUAGES);
    expect(RACE_FIXED_SKILLS[GOBLIN_ID]).toEqual(GOBLIN_FIXED_SKILLS);
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    // Язык или навык, которого нет в общем списке, мастер молча не покажет и
    // не выдаст: выбор языков строится фильтром по `ALL_LANGUAGES`.
    for (const language of GOBLIN_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of GOBLIN_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("раса зарегистрирована в библиотеке портретов", () => {
    expect(CHARACTER_PORTRAIT_RACES).toContain(GOBLIN_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isGoblin(GOBLIN_TITLE)).toBe(true);
    expect(isGoblin("Эльф бездны")).toBe(false);
    expect(isGoblin(null)).toBe(false);
    expect(isGoblin(undefined)).toBe(false);
  });
});

describe("что взято из открытого бестиария — сверено с САМИМ бестиарием", () => {
  /**
   * Сторож происхождения, и он читает ИСТОЧНИК, а не нашу же константу. Шапка
   * `goblinRace.ts` обещает четыре факта из записи `goblin` открытого бестиария
   * (CC BY 4.0): размер, тёмное зрение, языки и «Ловкий побег». Обещание,
   * сверяемое только с собственным числом, не покраснеет никогда — поэтому
   * числа и строки тянутся из `bestiary.json`.
   */
  it("запись `goblin` в открытом бестиарии на месте", () => {
    expect(goblinBlock).toBeDefined();
    expect(goblinBlock?.name).toBe(GOBLIN_TITLE);
  });

  it("тёмное зрение расы — ровно та дальность, что стоит в стат-блоке", () => {
    const darkvision = goblinBlock?.senses?.find((s) => s.name === "тёмное зрение");
    expect(darkvision?.rangeFeet).toBe(GOBLIN_DARKVISION_FEET);
    // И число доехало до того текста, который видит игрок.
    const trait = GOBLIN_TRAITS.find((t) => t.name === "Тёмное зрение");
    expect(trait?.description).toContain(String(GOBLIN_DARKVISION_FEET));
  });

  it("языки расы — ровно те, что стоят в стат-блоке, и выбора раса не даёт", () => {
    expect(GOBLIN_LANGUAGES.fixed).toEqual(goblinBlock?.languages);
    expect(GOBLIN_LANGUAGES.choiceCount).toBeUndefined();
  });

  it("«Ловкий побег» назван тем же именем, каким он стоит в стат-блоке", () => {
    const fromBlock = (goblinBlock?.traits ?? []).some((t) => t.startsWith("Ловкий побег."));
    expect(fromBlock).toBe(true);
    expect(GOBLIN_TRAITS.map((t) => t.name)).toContain("Ловкий побег");
  });

  it("размер расы в прозе — тот же, что в стат-блоке", () => {
    const prose = GOBLIN_TOPIC_PROSE();
    expect(goblinBlock?.size).toBe("Маленький");
    expect(prose).toContain(`Ваш размер — ${goblinBlock?.size}`);
  });
});

describe("что НАШЕ — собрано не под чужую играбельную расу", () => {
  it("бонусы характеристик наши: Ловкость +2 и Интеллект +1", () => {
    // Числа — решение этого проекта (см. шапку модуля). Проба сторожит не их
    // «правильность», а то, что раса даёт ровно два бонуса и ни одного лишнего:
    // третий бонус прошёл бы в характеристики молча.
    expect(GOBLIN_ABILITY_BONUS).toEqual({ dexterity: 2, intelligence: 1 });
    expect(Object.keys(GOBLIN_ABILITY_BONUS)).toHaveLength(2);
  });

  it("скорость — 25 футов, как у Маленьких рас SRD, а не 30 у чужой играбельной", () => {
    expect(GOBLIN_SPEED_FEET).toBe(25);
    const prose = GOBLIN_TOPIC_PROSE();
    expect(prose).toContain(`Ваша базовая скорость ходьбы — ${GOBLIN_SPEED_FEET} футов`);
  });

  it("заклинаний раса не даёт — ни заговора, ни ресурса, ни строки заклинаний", () => {
    // Решение пачки, названное словами в шапке модуля: ни одна из пяти рас
    // заклинаний не даёт, поэтому второго владельца заклинания не появляется.
    // Проба спрашивает НАСТОЯЩИЕ раздатчики (их зовут мастер создания и лист),
    // а не ищет слова в тексте: «Сопротивление магии» законно говорит про
    // заклинания, а в spells.json есть заклинания с именами «Тёмное зрение» и
    // «Языки» — поиск по словам краснел бы на честных строках.
    expect(raceGrantedCantrips(GOBLIN_TITLE)).toEqual([]);
    expect(raceResources(GOBLIN_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(GOBLIN_TITLE, (id) => id)).toBeNull();
  });

  it("каждая черта непуста и названа по-своему — двух заголовков одного факта нет", () => {
    const names = GOBLIN_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const trait of GOBLIN_TRAITS) {
      expect(trait.name.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });
});

/** Проза расы одной строкой — её читают сразу три пробы выше. */
function GOBLIN_TOPIC_PROSE(): string {
  const topic = playableRaces(rules).find((t) => t.id === GOBLIN_ID);
  return (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
}
