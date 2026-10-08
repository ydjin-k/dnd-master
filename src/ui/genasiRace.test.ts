import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledBestiary from "../../src-tauri/bestiary/bestiary.json";
import type { RuleBlock, RuleTopic } from "../state/types";
import {
  ELEMENT_TRAIT_NAME,
  GENASI_ABILITY_BONUS,
  GENASI_ELEMENTS,
  GENASI_FIXED_SKILLS,
  GENASI_ID,
  GENASI_LANGUAGES,
  GENASI_NAMES,
  GENASI_SPEED_FEET,
  GENASI_TITLE,
  GENASI_TOPIC,
  GENASI_TRAITS,
  isGenasi,
} from "./genasiRace";
import {
  ALL_LANGUAGES,
  ALL_SKILLS,
  RACE_FIXED_SKILLS,
  RACE_HP_BONUS,
  RACE_LANGUAGES,
  RACE_TRAITS,
  RACE_VARIANTS,
  raceTraitsWithVariant,
  raceVariantById,
} from "./characterCreationData";
import { isOwnRuleTopic, playableRaces, raceWizardBlocks } from "./ownRuleTopics";
import { abyssElfSpellLine, raceGrantedCantrips, raceResources } from "./abyssElfRace";
import { SERPENT_ABILITY_BONUS } from "./serpentRace";
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

describe("граница «в rules.json только SRD» — Дженази", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    expect(rules.some((t) => t.id === GENASI_ID)).toBe(false);
    expect(rules.some((t) => t.title === GENASI_TITLE)).toBe(false);
  });

  it("раса объявлена нашей ровно в одном месте — в списке OWN_RULE_TOPICS", () => {
    const topic = playableRaces(rules).find((t) => t.id === GENASI_ID);
    expect(topic).toBeDefined();
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(topic?.sourceUrl).toBe("");
  });

  it("источником не притворяется: текст расы сам говорит, чей он", () => {
    const prose = genasiProse();
    expect(prose).toContain("раса этого приложения, а не раса SRD 5.1");
    expect(prose).toContain("CC BY 4.0");
  });
});

describe("Дженази попадает в мастер и на лист", () => {
  it("стоит в playableRaces со своей категорией и своим названием", () => {
    const races = playableRaces(rules);
    const topic = races.find((t) => t.id === GENASI_ID);
    expect(topic?.title).toBe(GENASI_TITLE);
    expect(topic?.category).toBe("races");
    expect(races.filter((t) => t.id === GENASI_ID)).toHaveLength(1);
  });

  it("общие черты доезжают до листа по ЗАГОЛОВКУ — тем же путём, каким их ищет лист", () => {
    const byTitle: Record<string, typeof GENASI_TRAITS> = {};
    for (const topic of playableRaces(rules)) {
      const traits = RACE_TRAITS[topic.id];
      if (traits && traits.length > 0) byTitle[topic.title] = traits;
    }
    expect(byTitle[GENASI_TITLE]).toEqual(GENASI_TRAITS);
  });

  it("языки и навык расы прописаны в тех же картах, что у девяти соседей", () => {
    expect(RACE_LANGUAGES[GENASI_ID]).toEqual(GENASI_LANGUAGES);
    expect(RACE_FIXED_SKILLS[GENASI_ID]).toEqual(GENASI_FIXED_SKILLS);
  });

  it("языки и навык взяты из существующих списков, а не выдуманы рядом", () => {
    for (const language of GENASI_LANGUAGES.fixed) expect(ALL_LANGUAGES).toContain(language);
    for (const skill of GENASI_FIXED_SKILLS) expect(ALL_SKILLS).toContain(skill);
  });

  it("прибавки к хитам у расы нет — карта о ней не знает", () => {
    expect(RACE_HP_BONUS[GENASI_ID]).toBeUndefined();
  });

  it("слага портрета у расы нет — портрет человеческий, а не битая картинка", () => {
    expect(CHARACTER_PORTRAIT_RACES).not.toContain(GENASI_TITLE);
  });

  it("раса узнаётся по названию, и только своим", () => {
    expect(isGenasi(GENASI_TITLE)).toBe(true);
    expect(isGenasi("Аасимар")).toBe(false);
    expect(isGenasi(null)).toBe(false);
    expect(isGenasi(undefined)).toBe(false);
  });
});

describe("механизм выбора варианта расы — пункт 2а карточки", () => {
  it("раса зарегистрирована в карте вариантов, и она там одна", () => {
    // Девять рас SRD здесь стоять не должны: у них подраса вшита в бонусы
    // намеренно, и карточка просила этого не трогать.
    expect(RACE_VARIANTS[GENASI_ID]).toBe(GENASI_ELEMENTS);
    expect(Object.keys(RACE_VARIANTS)).toEqual([GENASI_ID]);
    for (const srd of rules.filter((t) => t.category === "races")) {
      expect(RACE_VARIANTS[srd.id], `${srd.id} получила вариант, а не должна`).toBeUndefined();
    }
  });

  it("четыре стихии, у каждой свой id, своё название и свои черты", () => {
    expect(GENASI_ELEMENTS.options).toHaveLength(4);
    expect(GENASI_ELEMENTS.options.map((o) => o.title)).toEqual(["воздух", "земля", "огонь", "вода"]);
    const ids = GENASI_ELEMENTS.options.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of GENASI_ELEMENTS.options) {
      expect(option.traits.length).toBeGreaterThan(0);
      for (const trait of option.traits) {
        expect(trait.name.length).toBeGreaterThan(0);
        expect(trait.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("id варианта уникален СРЕДИ ВСЕХ рас — по нему лист и ищет", () => {
    // Лист хранит `Character.race` названием и спрашивает вариант только по
    // id. Совпади id у двух рас — лист выдал бы чужую особенность.
    const all = Object.values(RACE_VARIANTS).flatMap((c) => c.options.map((o) => o.id));
    expect(new Set(all).size).toBe(all.length);
    for (const option of GENASI_ELEMENTS.options) {
      expect(raceVariantById(option.id)).toBe(option);
    }
    expect(raceVariantById("нет такого")).toBeUndefined();
    expect(raceVariantById("")).toBeUndefined();
    expect(raceVariantById(null)).toBeUndefined();
  });

  it("стихия ДОБАВЛЯЕТ черты к общим и встаёт первой", () => {
    for (const option of GENASI_ELEMENTS.options) {
      const merged = raceTraitsWithVariant(GENASI_TRAITS, option.id);
      expect(merged).toEqual([...option.traits, ...GENASI_TRAITS]);
      expect(merged[0].name).toBe(ELEMENT_TRAIT_NAME);
      expect(merged[0].description).toContain(option.title);
    }
  });

  it("раса без варианта получает свой список нетронутым", () => {
    // Четырнадцать рас из пятнадцати вариантов не имеют, и склейка обязана
    // быть для них тождественной — иначе owner-функция стала бы ветвиться.
    const dwarf = RACE_TRAITS["races-dwarf"];
    expect(raceTraitsWithVariant(dwarf, "")).toBe(dwarf);
    expect(raceTraitsWithVariant(dwarf, undefined)).toBe(dwarf);
    expect(raceTraitsWithVariant(dwarf, "genasi-fire")).not.toBe(dwarf);
  });

  it("выбранная стихия названа СЛОВАМИ в описании черты — её видно и в «Итоге», и на листе", () => {
    // Обзорный шаг печатает имя черты жирным, а описание рядом. Имя у всех
    // четырёх стихий одно, поэтому стихию обязано называть описание: иначе на
    // обзоре стояло бы «Стихия в крови» без ответа, какая именно.
    for (const option of GENASI_ELEMENTS.options) {
      const record = option.traits.find((t) => t.name === ELEMENT_TRAIT_NAME);
      expect(record, `у стихии «${option.title}» нет записи выбора`).toBeDefined();
      expect(record?.description).toContain(option.title);
    }
  });

  it("стихия НЕ меняет ни бонусов, ни скорости, ни навыка, ни языков", () => {
    // Главная граница механизма: вариант меняет только особенности. Появись
    // здесь бонус — и шаг «Характеристики» с расчётом хитов получили бы ветку
    // «а какая у него стихия», а одна раса с вариантами стала бы четырьмя.
    for (const option of GENASI_ELEMENTS.options) {
      const keys = Object.keys(option as unknown as Record<string, unknown>);
      expect(keys.sort()).toEqual(["id", "title", "traits"]);
    }
  });
});

describe("выбор стихии лежит ВНУТРИ раздела механики — иначе человек его не увидит", () => {
  /**
   * Первое из трёх мест, которые ломаются молча. Мастер показывает срез от
   * заголовка «Особенности …» до заголовка «Почему ты …» (`raceWizardBlocks`),
   * и абзац про выбор стихии вместе с описаниями всех четырёх обязан лежать
   * ровно в нём. Уехав в культурную прозу, он остался бы только во вкладке
   * «Правила», и выбирающий расу человек не прочитал бы, что ему вообще надо
   * что-то выбрать.
   */
  const wizardText = () =>
    raceWizardBlocks(GENASI_TOPIC)
      .flatMap((b) => (b.type === "paragraph" ? [b.text] : []))
      .join("\n");

  it("абзац «Стихия» виден в срезе мастера", () => {
    expect(wizardText()).toContain("Стихия. В крови дженази лежит одна из четырёх стихий");
  });

  it("все четыре стихии описаны в срезе мастера, каждая своим абзацем", () => {
    const text = wizardText();
    for (const option of GENASI_ELEMENTS.options) {
      const opener = option.title.charAt(0).toUpperCase() + option.title.slice(1);
      expect(text.includes(`${opener}.`), `в срезе нет абзаца «${opener}.»`).toBe(true);
    }
  });

  it("порядок абзацев стихий совпадает с порядком переключателя", () => {
    // Порядок в `GENASI_ELEMENTS.options` задаёт порядок пунктов в мастере.
    // Разъедься он с порядком абзацев — игрок читал бы одно, а выбирал другое.
    const text = wizardText();
    const positions = GENASI_ELEMENTS.options.map((o) =>
      text.indexOf(`${o.title.charAt(0).toUpperCase() + o.title.slice(1)}.`),
    );
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("таблиц и «Источника» в срезе нет — срез остался срезом", () => {
    const slice = raceWizardBlocks(GENASI_TOPIC);
    expect(slice.some((b) => b.type === "table")).toBe(false);
    expect(
      slice.flatMap((b) => (b.type === "paragraph" ? [b.text] : [])).some((t) => t.startsWith("Источник.")),
    ).toBe(false);
  });
});

describe("что взято из открытого содержания — сверено с САМИМ источником", () => {
  /**
   * Сторож происхождения, и он читает ИСТОЧНИК, а не нашу же константу (урок
   * записи 179). Шапка `genasiRace.ts` обещает язык с наречиями, формулировку
   * «дышать воздухом и водой» и две ссылки на правила SRD.
   */
  it("Первичный стоит в списке языков SRD и в открытом стат-блоке", () => {
    expect(ALL_LANGUAGES).toContain("Первичный");
    const nightHag = bestiary.find((m) => m.id === "night-hag");
    expect(nightHag?.languages ?? []).toContain("Первичный");
    expect(GENASI_LANGUAGES.fixed).toContain("Первичный");
  });

  it("два наречия Первичного стоят в открытом бестиарии — повод для четырёх стихий", () => {
    // Шапка обещает Игнан и Акван у семи стат-блоков каждое. Соври она — и
    // «один язык, четыре наречия» оказалось бы нашей выдумкой, а не фактом.
    for (const [dialect, examples] of [
      ["Игнан", ["magmin", "azer", "fire-elemental", "salamander"]],
      ["Акван", ["merfolk", "water-elemental", "dragon-turtle"]],
    ] as const) {
      const speakers = bestiary.filter((m) => (m.languages ?? []).includes(dialect));
      expect(speakers.length, `наречия ${dialect} нет в бестиарии`).toBeGreaterThanOrEqual(7);
      for (const id of examples) {
        expect(speakers.map((m) => m.id), `${id} не говорит на ${dialect}`).toContain(id);
      }
    }
    expect(genasiProse()).toContain("Наречий у Первичного четыре");
  });

  it("«дышать воздухом и водой» — формулировка открытой «Амфибии»", () => {
    const open = bestiary.flatMap((m) => (m.traits ?? []).filter((t) => t.startsWith("Амфибия.")));
    expect(open.length, "«Амфибии» нет в бестиарии").toBeGreaterThan(0);
    expect(open.some((t) => t.includes("дышать воздухом и водой"))).toBe(true);
    const water = GENASI_ELEMENTS.options.find((o) => o.id === "genasi-water");
    expect(water?.traits.map((t) => t.description).join(" ")).toContain("дышать воздухом и водой");
  });

  it("два правила, на которые ссылаются стихии, стоят в открытом SRD", () => {
    const srd = JSON.stringify(rules);
    expect(srd).toContain("задержать дыхание");
    expect(srd).toContain("сбить его с ног или оттолкнуть");
    const air = GENASI_ELEMENTS.options.find((o) => o.id === "genasi-air");
    expect(air?.traits.map((t) => t.description).join(" ")).toContain("задерживаешь дыхание");
    const earth = GENASI_ELEMENTS.options.find((o) => o.id === "genasi-earth");
    expect(earth?.traits.map((t) => t.description).join(" ")).toContain("сбили с ног");
  });

  it("тёмного зрения раса не даёт — единого открытого числа для него нет", () => {
    // Шапка не утверждает, что взять было негде: у открытых стихийных тёмное
    // зрение как раз есть. Она утверждает, что числа РАСХОДЯТСЯ — 60 футов у
    // элементалей и 120 у гениев, то есть у родителя дженази по этой нише.
    // Проба читает оба числа: сойдись они, довод шапки был бы ложным.
    const darkvision = (id: string) =>
      (bestiary.find((m) => m.id === id)?.senses ?? []).find((s) => s.name.includes("тёмное зрение"))
        ?.rangeFeet;
    for (const id of ["fire-elemental", "water-elemental", "air-elemental", "earth-elemental"]) {
      expect(darkvision(id), `${id}: тёмного зрения нет`).toBe(60);
    }
    for (const id of ["efreeti", "djinni"]) {
      expect(darkvision(id), `${id}: тёмного зрения нет`).toBe(120);
    }
    const everyTrait = [...GENASI_TRAITS, ...GENASI_ELEMENTS.options.flatMap((o) => o.traits)];
    expect(everyTrait.map((t) => t.name)).not.toContain("Тёмное зрение");
    expect(genasiProse()).not.toContain("Тёмное зрение.");
  });

  it("дальность 60 футов в наших расах уже держат трое — четвёртой копии нет", () => {
    // Второй довод шапки, и он тоже читается из данных, а не повторяется
    // словами: три наши расы с тёмным зрением 60 стоят в карте черт, и
    // Дженази среди них нет.
    const withDarkvision = Object.entries(RACE_TRAITS)
      .filter(([, traits]) => traits.some((t) => t.name === "Тёмное зрение"))
      .map(([id]) => id);
    for (const id of ["races-goblin", "races-serpent", "races-tabaxi"]) {
      expect(withDarkvision, `${id} потерял тёмное зрение`).toContain(id);
    }
    expect(withDarkvision).not.toContain(GENASI_ID);
  });
});

describe("что НАШЕ — собрано не под чужую играбельную расу", () => {
  it("бонус — ОДНА пара на расу, и ни одной из четырёх чужих подрас она не равна", () => {
    // У чужой расы Телосложение +2 плюс свой +1 у каждой подрасы: Ловкость,
    // Сила, Интеллект, Мудрость. Харизмы среди них нет ни у одной. Пара
    // Серпентов читается из их модуля, а не повторяется здесь строкой.
    expect(GENASI_ABILITY_BONUS).toEqual({ constitution: 2, charisma: 1 });
    for (const foreign of [
      { constitution: 2, dexterity: 1 },
      { constitution: 2, strength: 1 },
      { constitution: 2, intelligence: 1 },
      { constitution: 2, wisdom: 1 },
    ]) {
      expect(GENASI_ABILITY_BONUS).not.toEqual(foreign);
    }
    expect(GENASI_ABILITY_BONUS).not.toEqual(SERPENT_ABILITY_BONUS);
  });

  it("скорость — 30 футов, объявлена базой, и стихия её не меняет", () => {
    expect(GENASI_SPEED_FEET).toBe(30);
    expect(genasiProse()).toContain(`Ваша базовая скорость ходьбы — ${GENASI_SPEED_FEET} футов`);
    // Скорости плавания у расы нет: `Character.speedFeet` — одно число с одним
    // владельцем, и вторая скорость потребовала бы второго.
    expect(genasiProse()).not.toContain("скорость плавания");
  });

  it("рост и срок жизни у расы свои — чужие числа в тексте не стоят", () => {
    const prose = genasiProse();
    expect(prose).toContain("от 4,5 до 6,5 футов");
    expect(prose).not.toContain("от 5 до 6 футов");
    expect(prose).not.toContain("120 лет");
    expect(prose).toContain("Ваш размер — Средний");
  });

  it("заклинаний не даёт ни раса, ни одна из четырёх стихий", () => {
    // Самая заметная потеря этой расы: в чужом пакете заклинание есть у
    // каждой подрасы. Раздатчики умеют ровно одну расу, и обобщать их —
    // чужая карточка.
    expect(raceGrantedCantrips(GENASI_TITLE)).toEqual([]);
    expect(raceResources(GENASI_TITLE, 20)).toEqual([]);
    expect(abyssElfSpellLine(GENASI_TITLE, (id) => id)).toBeNull();
    const everyTrait = [...GENASI_TRAITS, ...GENASI_ELEMENTS.options.flatMap((o) => o.traits)];
    const all = everyTrait.map((t) => `${t.name}. ${t.description}`).join(" ").toLowerCase();
    for (const forbidden of ["заговор", "заклинание", "левитац", "сопротивление"]) {
      expect(all.includes(forbidden), `в чертах всплыло «${forbidden}»`).toBe(false);
    }
  });

  it("каждая черта непуста, и двух заголовков одного факта нет", () => {
    const names = GENASI_TRAITS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const option of GENASI_ELEMENTS.options) {
      const merged = raceTraitsWithVariant(GENASI_TRAITS, option.id).map((t) => t.name);
      expect(new Set(merged).size, `повтор имени черты у стихии «${option.title}»`).toBe(merged.length);
    }
  });

  it("фиксированный навык назван чертой — иначе на листе он выглядит как ничей", () => {
    const trait = GENASI_TRAITS.find((t) => t.name === "Чтение стихии");
    expect(trait?.description).toContain("Маги");
  });

  it("четыре слова с листа владельца в имена не попали", () => {
    // Лист называет примеры имён дженази прямым перечислением, и скан
    // происхождения такого не поймает: одно слово короче любой цепочки.
    for (const forbidden of ["Пламя", "Зола", "Волна", "Оникс"]) {
      expect(GENASI_NAMES.male, `имя «${forbidden}» вернулось`).not.toContain(forbidden);
      expect(GENASI_NAMES.female, `имя «${forbidden}» вернулось`).not.toContain(forbidden);
    }
  });
});

/** Проза расы одной строкой — её читают сразу несколько проб выше. */
function genasiProse(): string {
  const topic = playableRaces(rules).find((t) => t.id === GENASI_ID);
  return (topic?.blocks ?? []).map((b: RuleBlock) => (b.type === "paragraph" ? b.text : "")).join(" ");
}
