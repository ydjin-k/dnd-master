import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledSpells from "../../src-tauri/rules/spells.json";
import type { RuleTopic, Spell } from "../state/types";
import {
  ABYSS_CALL_RESOURCE_ID,
  ABYSS_CALL_SPELL_IDS,
  ABYSS_ELF_CANTRIP_ID,
  ABYSS_ELF_ID,
  ABYSS_ELF_TITLE,
  ABYSS_ELF_TRAITS,
  abyssElfSpellLine,
  playableRaces,
  raceGrantedCantrips,
  raceResources,
  SUNLIGHT_TRAIT_NAME,
  sunlitPassivePerception,
  withSunlitPassive,
} from "./abyssElfRace";
import { CHARACTER_PORTRAIT_RACES } from "./characterPortraits";

const rules = bundledRules as RuleTopic[];
const spells = bundledSpells as Spell[];

describe("граница «в rules.json только SRD»", () => {
  it("нашей расы в справочнике нет вовсе — ни по id, ни по названию", () => {
    // Сердце карточки: раса живёт отдельным файлом именно затем, чтобы эта
    // проба была выполнима. Подмешивание её в rules.json красит пробу.
    expect(rules.some((t) => t.id === ABYSS_ELF_ID)).toBe(false);
    expect(rules.some((t) => t.title === ABYSS_ELF_TITLE)).toBe(false);
  });

  it("играбельных рас в справочнике по-прежнему девять — десятую добавляет только playableRaces", () => {
    const srdRaces = rules.filter((t) => t.category === "races" && t.id !== "races-traits");
    expect(srdRaces).toHaveLength(9);
    expect(playableRaces(rules)).toHaveLength(10);
  });

  it("девять прежних рас не тронуты: playableRaces отдаёт их теми же и в том же порядке", () => {
    const srdRaces = rules.filter((t) => t.category === "races" && t.id !== "races-traits");
    expect(playableRaces(rules).slice(0, 9)).toEqual(srdRaces);
    // Общая статья «Расовые особенности» — не раса, играть ею нельзя.
    expect(playableRaces(rules).some((t) => t.id === "races-traits")).toBe(false);
  });
});

describe("Эльф бездны как данные", () => {
  it("десятой встаёт именно наша раса, и её название то же, что ждёт библиотека портретов", () => {
    const tenth = playableRaces(rules)[9];
    expect(tenth.id).toBe(ABYSS_ELF_ID);
    expect(tenth.title).toBe(ABYSS_ELF_TITLE);
    expect(tenth.category).toBe("races");
    // Портрет подбирается по названию расы — разойдись эти две строки, эльф
    // бездны получил бы человеческое лицо.
    expect(CHARACTER_PORTRAIT_RACES).toContain(ABYSS_ELF_TITLE);
  });

  it("источником не притворяется: ссылки на SRD у нашей расы нет, а в тексте сказано, чья она", () => {
    const tenth = playableRaces(rules)[9];
    expect(tenth.sourceUrl).toBe("");
    const prose = tenth.blocks.map((b) => (b.type === "paragraph" ? b.text : "")).join(" ");
    expect(prose).toContain("раса этого приложения, а не раса SRD 5.1");
  });

  it("все три заклинания расы — ссылки по id на существующие заклинания spells.json", () => {
    for (const id of [ABYSS_ELF_CANTRIP_ID, ...ABYSS_CALL_SPELL_IDS]) {
      expect(spells.some((s) => s.id === id)).toBe(true);
    }
    expect(spells.find((s) => s.id === ABYSS_ELF_CANTRIP_ID)?.level).toBe(0);
  });

  it("строка заклинаний берёт названия у spells.json, а не хранит вторую копию", () => {
    const line = abyssElfSpellLine(ABYSS_ELF_TITLE, (id) => spells.find((s) => s.id === id)?.name ?? id);
    expect(line).toContain("Пляшущие огоньки");
    expect(line).toContain("Огонь фей");
    expect(line).toContain("Тьма");
    // Имён заклинаний в самих особенностях нет — иначе при переименовании в
    // spells.json на листе разошлись бы две строки.
    const traitText = ABYSS_ELF_TRAITS.map((t) => t.description).join(" ");
    expect(traitText).not.toContain("Пляшущие огоньки");
    expect(traitText).not.toContain("Огонь фей");
    expect(traitText).not.toContain("Тьма");
    expect(abyssElfSpellLine("Эльф", (id) => id)).toBeNull();
  });

  it("заговор даёт только наша раса", () => {
    expect(raceGrantedCantrips(ABYSS_ELF_TITLE)).toEqual([ABYSS_ELF_CANTRIP_ID]);
    expect(raceGrantedCantrips("Эльф")).toEqual([]);
    expect(raceGrantedCantrips(null)).toEqual([]);
  });
});

describe("«Зов бездны» — наша лесенка и наша частота", () => {
  it("одно использование на 1 уровне, второе с 5-го, и оба возвращает длинный отдых", () => {
    const atOne = raceResources(ABYSS_ELF_TITLE, 1);
    expect(atOne).toHaveLength(1);
    expect(atOne[0].id).toBe(ABYSS_CALL_RESOURCE_ID);
    expect(atOne[0].max).toBe(1);
    expect(atOne[0].recharge).toBe("long");
    expect(raceResources(ABYSS_ELF_TITLE, 4)[0].max).toBe(1);
    expect(raceResources(ABYSS_ELF_TITLE, 5)[0].max).toBe(2);
    expect(raceResources(ABYSS_ELF_TITLE, 12)[0].max).toBe(2);
  });

  it("подпись счётчика называет обе стороны и обходится без цифр (см. 4e480b2)", () => {
    const description = raceResources(ABYSS_ELF_TITLE, 1)[0].description;
    expect(description).toContain("без ячейки заклинаний");
    expect(description).toContain("платится");
    expect(description).not.toMatch(/\d/);
  });

  it("остальным девяти расам ресурса не достаётся", () => {
    expect(raceResources("Эльф", 5)).toEqual([]);
    expect(raceResources("", 5)).toEqual([]);
  });
});

describe("цена: чувствительность к солнечному свету", () => {
  it("названа числом, а не обещанием: пассивная внимательность под солнцем на 5 ниже", () => {
    expect(sunlitPassivePerception(ABYSS_ELF_TITLE, 14)).toBe(9);
    expect(sunlitPassivePerception("Эльф", 14)).toBeNull();
  });

  it("число подставляется в саму особенность, и только в неё", () => {
    const shown = withSunlitPassive(ABYSS_ELF_TRAITS, ABYSS_ELF_TITLE, 14);
    const sunlight = shown.find((t) => t.name === SUNLIGHT_TRAIT_NAME);
    expect(sunlight?.description).toContain("9 вместо 14");
    const darkvision = shown.find((t) => t.name === "Превосходное тёмное зрение");
    expect(darkvision).toEqual(ABYSS_ELF_TRAITS[0]);
  });

  it("особенностям других рас число не приписывается", () => {
    const elfTraits = [{ name: SUNLIGHT_TRAIT_NAME, description: "Чужая строка." }];
    expect(withSunlitPassive(elfTraits, "Эльф", 14)).toEqual(elfTraits);
  });
});
