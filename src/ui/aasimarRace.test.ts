import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledBestiary from "../../src-tauri/bestiary/bestiary.json";
import type { RuleBlock, RuleTopic } from "../state/types";
import {
  AASIMAR_ABILITY_BONUS,
  AASIMAR_FIXED_SKILLS,
  AASIMAR_ID,
  AASIMAR_LANGUAGES,
  AASIMAR_SPEED_FEET,
  AASIMAR_TITLE,
  AASIMAR_TOPIC,
  AASIMAR_TRAITS,
  CELESTIAL_MARK_TRAIT_NAME,
  isAasimar,
} from "./aasimarRace";
import {
  ALL_LANGUAGES,
  ALL_SKILLS,
  RACE_FIXED_SKILLS,
  RACE_HP_BONUS,
  RACE_LANGUAGES,
  RACE_TRAITS,
} from "./characterCreationData";
import { isOwnRuleTopic, playableRaces, raceWizardBlocks } from "./ownRuleTopics";
import { abyssElfSpellLine, raceGrantedCantrips, raceResources } from "./abyssElfRace";
import { SATYR_ABILITY_BONUS } from "./satyrRace";
import { CHANGELING_ABILITY_BONUS } from "./changelingRace";
import { FIRBOLG_ABILITY_BONUS } from "./firbolgRace";
import { CHARACTER_PORTRAIT_RACES } from "./characterPortraits";

const rules = bundledRules as unknown as RuleTopic[];

interface BestiaryEntry {
  id: string;
  name: string;
  languages?: string[];
  senses?: { name: string; rangeFeet?: number | null }[];
  damageResistances?: string[];
  traits?: string[];
}
const bestiary = bundledBestiary as unknown as BestiaryEntry[];

/** Три дороги аасимара — слова, которых в механике быть не должно. */
const THREE_PATHS = ["заступник", "мстител", "погасш"];

describe("граница «в rules.json только SRD» — Аасимар", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    expect(rules.some((t) => t.id === AASIMAR_ID)).toBe(false);
    expect(rules.some((t) => t.title === AASIMAR_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === AASIMAR_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется: текст расы сам говорит, чей он", () => {
    const prose = aasimarProse();
    expect(prose).toContain("раса этого приложения, а не раса SRD 5.1");
    expect(prose).toContain("CC BY 4.0");
  });
});

describe("Аасимар попадает в мастер и на лист", () => {
  it("стоит в playableRaces со своей категорией и своим названием", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === AASIMAR_ID);
    expect(topic?.title).toBe(AASIMAR_TITLE);
    expect(topic?.category).toBe("races");
    expect(races.filter((t) => t.id === AASIMAR_ID)).toHaveLength(1);
  });

  it("черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    const byTitle: Record<string, typeof AASIMAR_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[AASIMAR_TITLE]).toEqual(AASIMAR_TRAITS);
    expect(byTitle[AASIMAR_TITLE].map((t) => t.name)).toContain(CELESTIAL_MARK_TRAIT_NAME);
  });

  it("языки и навык расы прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[AASIMAR_ID]).toEqual(AASIMAR_LANGUAGES);
    expect(RACE_FIXED_SKILLS[AASIMAR_ID]).toEqual(AASIMAR_FIXED_SKILLS);
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    for (const language of AASIMAR_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of AASIMAR_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("выбора языка раса не даёт", () => {
    expect(AASIMAR_LANGUAGES.choiceCount).toBeUndefined();
    expect(AASIMAR_LANGUAGES.fixed).toHaveLength(2);
  });

  it("прибавки к хитам у расы нет — карта о ней не знает", () => {
    expect(RACE_HP_BONUS[AASIMAR_ID]).toBeUndefined();
  });

  it("раса зарегистрирована в библиотеке портретов", () => {
    expect(CHARACTER_PORTRAIT_RACES).toContain(AASIMAR_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isAasimar(AASIMAR_TITLE)).toBe(true);
    expect(isAasimar("Фирболг")).toBe(false);
    expect(isAasimar(null)).toBe(false);
    expect(isAasimar(undefined)).toBe(false);
  });
});

describe("видов в механике НЕТ — решение владельца 07.10.2026", () => {
  /**
   * Главное требование карточки по этой расе, и ломается оно молча: достаточно
   * дописать расе второй набор бонусов «для дороги», и раса станет той самой
   * чужой расой с тремя видами, которую владелец просил не делать. Поэтому
   * проба спрашивает не шапку, а СРЕЗ, который мастер показывает человеку, —
   * и прозу, в которой дороги жить обязаны.
   */
  it("три дороги названы в прозе — иначе решение владельца потеряно наполовину", () => {
    const prose = aasimarProse().toLowerCase();
    for (const path of THREE_PATHS) {
      expect(prose.includes(path), `в прозе нет дороги «${path}»`).toBe(true);
    }
  });

  it("в разделе механики о дорогах нет ни слова — ни «вид», ни «выберите»", () => {
    // `raceWizardBlocks` — ровно тот срез, который мастер рисует на шаге
    // «Раса»: от заголовка механики до заголовка происхождения. Если дорога
    // въехала в механику, человек увидит её именно здесь.
    const mechanics = raceWizardBlocks(AASIMAR_TOPIC)
      .flatMap((b) => (b.type === "paragraph" ? [b.text] : []))
      .join("\n")
      .toLowerCase();
    expect(mechanics.length).toBeGreaterThan(0);
    for (const word of [...THREE_PATHS, "разновидност", "выберите одну", "подрас"]) {
      expect(mechanics.includes(word), `в механике всплыло «${word}»`).toBe(false);
    }
  });

  it("набор бонусов один, без второго «по виду» и без выбора игроку", () => {
    // У чужой расы к общему бонусу добавляется +1, свой у каждого из трёх
    // видов. Здесь набор ОДИН: две записи, и ни одной лишней.
    expect(AASIMAR_ABILITY_BONUS).toEqual({ wisdom: 2, charisma: 1 });
    expect(Object.keys(AASIMAR_ABILITY_BONUS)).toHaveLength(2);
  });

  it("абзац «Увеличение характеристик» в механике ровно один", () => {
    // Два таких абзаца — первый признак того, что вид начал отрастать: у
    // чужой расы их как раз два, общий и видовой.
    const openers = raceWizardBlocks(AASIMAR_TOPIC).filter(
      (b): b is Extract<RuleBlock, { type: "paragraph" }> =>
        b.type === "paragraph" && b.text.startsWith("Увеличение характеристик."),
    );
    expect(openers).toHaveLength(1);
  });

  it("ни одна черта не привязана к дороге — набор черт один на всю расу", () => {
    for (const trait of AASIMAR_TRAITS) {
      const text = `${trait.name}. ${trait.description}`.toLowerCase();
      for (const path of THREE_PATHS) {
        expect(text.includes(path), `черта «${trait.name}» знает про дорогу`).toBe(false);
      }
    }
  });

  it("дороги доехали до таблицы к8 — там им карточка и место", () => {
    // Карточка просит, чтобы дороги жили в прозе И в таблице происхождения.
    // Таблицы лежат в `rows`, и скан по `text` их не видит — спрашиваем прямо.
    const rows = AASIMAR_TOPIC.blocks
      .filter((b): b is Extract<RuleBlock, { type: "table" }> => b.type === "table")
      .flatMap((t) => t.rows.map((r) => r.join(" ")));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => /сн[аоы]|сон/i.test(r))).toBe(true);
  });
});

describe("что взято из открытого содержания — сверено с САМИМ источником", () => {
  /**
   * Сторож происхождения, и он читает ИСТОЧНИК, а не нашу же константу (урок
   * записи 179). Шапка `aasimarRace.ts` обещает два факта из открытого
   * бестиария и одно слово из открытого SRD.
   */
  it("Небесный назван в открытых стат-блоках небожителей — язык взят оттуда", () => {
    for (const id of ["unicorn", "guardian-naga"]) {
      const block = bestiary.find((m) => m.id === id);
      expect(block, `${id} нет в бестиарии`).toBeDefined();
      expect(block?.languages ?? []).toContain("Небесный");
    }
    const pegasus = bestiary.find((m) => m.id === "pegasus");
    expect((pegasus?.languages ?? []).join(" ")).toContain("Небесный");
    expect(AASIMAR_LANGUAGES.fixed).toContain("Небесный");
  });

  it("сопротивление лучистому урону стоит в открытых стат-блоках — взято оттуда", () => {
    for (const id of ["deva", "planetar", "solar", "couatl"]) {
      const block = bestiary.find((m) => m.id === id);
      expect(block, `${id} нет в бестиарии`).toBeDefined();
      expect((block?.damageResistances ?? []).join(" ")).toContain("лучист");
    }
    const trait = AASIMAR_TRAITS.find((t) => t.name === CELESTIAL_MARK_TRAIT_NAME);
    expect(trait?.description).toContain("сопротивление к лучистому урону");
  });

  it("сопротивление одно — второго, некротического, раса не даёт", () => {
    // У чужой расы сопротивлений два. Второе переехало бы молча: карта черт
    // ничего не проверяет.
    const all = AASIMAR_TRAITS.map((t) => `${t.name}. ${t.description}`).join(" ").toLowerCase();
    expect(all).toContain("сопротивление к лучистому");
    expect(all).not.toContain("некротич");
  });

  it("слово «стабилизировать» — из открытого SRD, а не наше понятие", () => {
    const srd = JSON.stringify(rules);
    expect(srd).toContain("стабилизировать");
    const trait = AASIMAR_TRAITS.find((t) => t.name === "Ладони света");
    expect(trait?.description).toContain("стабилизируешь");
  });

  it("тёмного зрения раса не даёт — единого открытого числа для него нет", () => {
    // Шапка утверждает: у `deva` 120 футов, у `unicorn` 60, у `planetar` и
    // `solar` вместо тёмного зрения истинное, у `pegasus` чувств нет вовсе.
    // Соври она — и дальность оказалась бы приписана «как соседям».
    const range = (id: string, sense: string) =>
      (bestiary.find((m) => m.id === id)?.senses ?? []).find((s) => s.name.includes(sense))?.rangeFeet;
    expect(range("deva", "тёмное зрение")).toBe(120);
    expect(range("unicorn", "тёмное зрение")).toBe(60);
    for (const id of ["planetar", "solar"]) {
      expect(range(id, "тёмное зрение")).toBeUndefined();
      expect(range(id, "истинное зрение")).toBe(120);
    }
    expect(bestiary.find((m) => m.id === "pegasus")?.senses ?? []).toEqual([]);
    expect(AASIMAR_TRAITS.map((t) => t.name)).not.toContain("Тёмное зрение");
    expect(aasimarProse()).not.toContain("Тёмное зрение.");
  });
});

describe("что НАШЕ — собрано не под чужую играбельную расу", () => {
  it("бонус стоит НЕ на Харизме двойкой — расхождение со всеми тремя видами", () => {
    // Все три чужих вида стоят на Харизме +2, различаясь только второй
    // прибавкой. Совпади любая из трёх пар — и числа молча переехали бы из
    // чужого пакета. Пары наших соседей читаются из их модулей, а не
    // повторяются здесь строкой.
    expect(AASIMAR_ABILITY_BONUS.charisma).toBe(1);
    for (const foreign of [
      { charisma: 2, wisdom: 1 },
      { charisma: 2, constitution: 1 },
      { charisma: 2, strength: 1 },
    ]) {
      expect(AASIMAR_ABILITY_BONUS).not.toEqual(foreign);
    }
    for (const own of [SATYR_ABILITY_BONUS, CHANGELING_ABILITY_BONUS, FIRBOLG_ABILITY_BONUS]) {
      expect(AASIMAR_ABILITY_BONUS).not.toEqual(own);
    }
  });

  it("скорость — 30 футов и объявлена базой, а не слоем", () => {
    expect(AASIMAR_SPEED_FEET).toBe(30);
    expect(aasimarProse()).toContain(`Ваша базовая скорость ходьбы — ${AASIMAR_SPEED_FEET} футов`);
  });

  it("рост у расы свой, числом — чужая раса числа не называет вовсе", () => {
    const prose = aasimarProse();
    expect(prose).toContain("от 5,5 до 6,5 футов");
    expect(prose).toContain("Ваш размер — Средний");
  });

  it("заклинаний раса не даёт — ни заговора, ни ресурса, ни строки заклинаний", () => {
    // Заговор света — узнаваемая часть чужого пакета, и взять его было нельзя:
    // раздатчики заговоров умеют ровно одну расу. Свет у нас особенность.
    expect(raceGrantedCantrips(AASIMAR_TITLE)).toEqual([]);
    expect(raceResources(AASIMAR_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(AASIMAR_TITLE, (id) => id)).toBeNull();
    const all = AASIMAR_TRAITS.map((t) => `${t.name}. ${t.description}`).join(" ").toLowerCase();
    expect(all).not.toContain("заговор");
  });

  it("ни крыльев, ни полёта, ни испуга, ни счёта по уровню в чертах", () => {
    // Четыре узнаваемых части чужого превращения: крылья, скорость полёта,
    // спасбросок от испуга и урон, равный уровню персонажа. Ни одна не должна
    // доехать до наших черт даже под другим именем.
    for (const trait of AASIMAR_TRAITS) {
      const text = `${trait.name}. ${trait.description}`.toLowerCase();
      for (const forbidden of ["крыл", "полёт", "полета", "испуган", "уровн", "превращени"]) {
        expect(text.includes(forbidden), `в черте «${trait.name}» всплыло «${forbidden}»`).toBe(false);
      }
    }
    const prose = aasimarProse().toLowerCase();
    for (const forbidden of ["крыл", "скорость полёта", "испуган", "3-го уровня"]) {
      expect(prose.includes(forbidden), `в прозе всплыло «${forbidden}»`).toBe(false);
    }
  });

  it("хитов раса не восстанавливает — и текст говорит это прямо", () => {
    // У чужой расы исцеление на величину уровня действием. Наши «Ладони
    // света» только стабилизируют, и путаница тут дорогая: игрок посчитал бы
    // лечение, которого раса не даёт.
    expect(aasimarProse()).toContain("Хитов это существу не восстанавливает");
    const all = AASIMAR_TRAITS.map((t) => t.description).join(" ").toLowerCase();
    expect(all).not.toContain("восстанав");
  });

  it("каждая черта непуста и названа по-своему — двух заголовков одного факта нет", () => {
    const names = AASIMAR_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const trait of AASIMAR_TRAITS) {
      expect(trait.name.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });

  it("фиксированный навык назван чертой — иначе на листе он выглядит как ничей", () => {
    const trait = AASIMAR_TRAITS.find((t) => t.name === "Слово наставника");
    expect(trait?.description).toContain("Религи");
  });
});

/** Проза расы одной строкой — её читают сразу несколько проб выше. */
function aasimarProse(): string {
  const topic = playableRaces(rules).find((t) => t.id === AASIMAR_ID);
  return (topic?.blocks ?? []).map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
}
