import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledSpells from "../../src-tauri/rules/spells.json";
import type { RuleBlock, RuleTopic, Spell } from "../state/types";
import { emptyAbilityScores } from "../state/types";
import {
  ARTIFICER_ID,
  ARTIFICER_INFUSIONS,
  ARTIFICER_SPELL_IDS,
  ARTIFICER_TITLE,
  ARTIFICER_TOPIC,
  FLASH_OF_GENIUS_RESOURCE_ID,
  SPELL_STORING_ITEM_RESOURCE_ID,
} from "./artificerClass";
import {
  ALL_ITEMS_WITH_COST,
  ALL_SKILLS,
  CLASS_CHOICES,
  CLASS_EQUIPMENT,
  CLASS_LEVEL_FEATURES,
  CLASS_PROFICIENCIES,
  CLASS_SUBCLASSES,
  armorProficienciesFor,
  classChoiceKnownAt,
  classChoiceOptionsAt,
  equipmentChoiceFor,
  isClassSpell,
  maxHpForLevel,
  parseHitDie,
  parseHitDieAverage,
  subclassSpellsUpToLevel,
  toolProficienciesFor,
  weaponProficienciesFor,
} from "./characterCreationData";
import {
  CLASS_PROGRESSION,
  PROGRESSION_MAX_LEVEL,
  asiLevels,
  characterResources,
  progressionAt,
  resourceMax,
  slotRechargeOf,
} from "./classProgression";
import { isOwnRuleTopic, playableClasses } from "./ownRuleTopics";
import { preparableSpells, preparedSpellsMax } from "./preparedSpells";

const srdTopics = bundledRules as unknown as RuleTopic[];
const spells = bundledSpells as unknown as Spell[];
const topic = playableClasses(srdTopics).find((t) => t.id === ARTIFICER_ID);

/**
 * Таблицы с. 1-2 PDF владельца, переписанные РУКОЙ, а не из констант модуля:
 * проба, читающая числа из того же места, что код, сдвиг не ловит.
 * Столбцы: уровень, известные инфузии, предметы с инфузией, заговоры, ячейки
 * 1, 2 и 3 круга.
 */
const PDF_TABLE: [number, number, number, number, number, number, number][] = [
  [1, 0, 0, 2, 2, 0, 0],
  [2, 4, 2, 2, 2, 0, 0],
  [3, 4, 2, 2, 3, 0, 0],
  [4, 4, 2, 2, 3, 0, 0],
  [5, 4, 2, 2, 4, 2, 0],
  [6, 6, 3, 2, 4, 2, 0],
  [7, 6, 3, 2, 4, 3, 0],
  [8, 6, 3, 2, 4, 3, 0],
  [9, 6, 3, 2, 4, 3, 2],
  [10, 8, 4, 3, 4, 3, 2],
  [11, 8, 4, 3, 4, 3, 3],
  [12, 8, 4, 3, 4, 3, 3],
];

describe("Изобретатель — наш класс в справочнике", () => {
  it("стоит в playableClasses последним нашим классом, в rules.json его нет", () => {
    const classes = playableClasses(srdTopics);
    expect(topic).toBeDefined();
    expect(topic!.title).toBe(ARTIFICER_TITLE);
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(classes.filter((t) => t.id === ARTIFICER_ID)).toHaveLength(1);
    expect(classes[classes.length - 1].id).toBe(ARTIFICER_ID);
    expect(srdTopics.some((t) => t.id === ARTIFICER_ID || t.title === ARTIFICER_TITLE)).toBe(false);
    expect(ARTIFICER_TOPIC.sourceUrl).toBe("");
  });

  it("кость хитов 1к8 и среднее 5 вычитываются из статьи (с. 3 PDF: «1к8 (или 5)»)", () => {
    expect(parseHitDie(topic)).toBe(8);
    expect(parseHitDieAverage(topic)).toBe(5);
  });

  it("кость 1к8 доезжает до максимума хитов создания и левел-апа", () => {
    const max = parseHitDie(topic)!;
    const average = parseHitDieAverage(topic)!;
    // 1 уровень: 8 + Телосложение (+2); 5 уровень: ещё по 5 + 2 за четыре уровня.
    expect(maxHpForLevel(max, average, 2, 0, 1)).toBe(10);
    expect(maxHpForLevel(max, average, 2, 0, 5)).toBe(38);
  });

  it("таблица уровней статьи идёт до 12 и совпадает со с. 1-2 PDF", () => {
    const table = ARTIFICER_TOPIC.blocks.find((b) => b.type === "table") as Extract<RuleBlock, { type: "table" }>;
    const header = table.rows[0];
    const rows = table.rows.slice(1);
    const col = (title: string) => header.indexOf(title);
    expect(rows.map((r) => Number(r[0]))).toEqual(PDF_TABLE.map(([level]) => level));
    const cell = (n: number) => (n ? String(n) : "—");
    for (const [level, known, infused, cantrips, s1, s2, s3] of PDF_TABLE) {
      const row = rows[level - 1];
      expect(row[col("Известные инфузии")], `инфузии, ур. ${level}`).toBe(cell(known));
      expect(row[col("Предметы с инфузией")], `предметы, ур. ${level}`).toBe(cell(infused));
      expect(row[col("Заговоры")], `заговоры, ур. ${level}`).toBe(String(cantrips));
      expect(row[col("Ячейки 1 круга")], `1 круг, ур. ${level}`).toBe(cell(s1));
      expect(row[col("Ячейки 2 круга")], `2 круг, ур. ${level}`).toBe(cell(s2));
      expect(row[col("Ячейки 3 круга")], `3 круг, ур. ${level}`).toBe(cell(s3));
    }
  });

  it("каждая инфузия попадает в статью из того же списка, что и выбор", () => {
    const text = ARTIFICER_TOPIC.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : [])).join("\n");
    for (const infusion of ARTIFICER_INFUSIONS) {
      expect(text.includes(infusion.description), `в статье нет «${infusion.name}»`).toBe(true);
    }
  });
});

describe("Изобретатель — карты класса", () => {
  const prof = CLASS_PROFICIENCIES[ARTIFICER_ID];

  it("спасброски, навыки и владения — с. 3 PDF", () => {
    expect(prof.savingThrows).toEqual(["constitution", "intelligence"]);
    expect(prof.skillCount).toBe(2);
    expect(prof.skillOptions).toHaveLength(7);
    for (const skill of prof.skillOptions) expect(ALL_SKILLS).toContain(skill);
    expect(armorProficienciesFor(ARTIFICER_ID, null)).toEqual(["light", "medium", "shields"]);
    expect(weaponProficienciesFor(ARTIFICER_ID, null)).toEqual(["simple"]);
    expect(toolProficienciesFor(ARTIFICER_ID, null)).toEqual(["Воровские инструменты", "Инструменты жестянщика"]);
    // «И один тип инструментов ремесленника на ваш выбор» — спрашивает мастер.
    expect(prof.artisanToolChoice).toBe(true);
  });

  it("четыре слота снаряжения, и каждый предмет узнаётся каталогом или уже стоит у SRD-класса", () => {
    const slots = CLASS_EQUIPMENT[ARTIFICER_ID];
    expect(slots).toHaveLength(4);
    const otherItems = new Set(
      Object.entries(CLASS_EQUIPMENT)
        .filter(([id]) => id !== ARTIFICER_ID)
        .flatMap(([, s]) => s.flatMap((slot) => slot.options.flatMap((o) => o.items))),
    );
    for (const item of slots.flatMap((s) => s.options.flatMap((o) => o.items))) {
      const known =
        ALL_ITEMS_WITH_COST.some((i) => i.name === item) ||
        !!equipmentChoiceFor(item) ||
        /^(.+) ×\d+$/.test(item) ||
        otherItems.has(item);
      expect(known, `предмет «${item}» не узнан`).toBe(true);
    }
  });

  it("ячейки — СВОЯ таблица: две 1 круга уже на 1 уровне, дальше числа PDF до 12", () => {
    for (const [level, , , cantrips, s1, s2, s3] of PDF_TABLE) {
      const row = progressionAt(ARTIFICER_ID, level)!;
      expect(row.spellSlots, `ячейки, ур. ${level}`).toEqual([s1, s2, s3, 0, 0, 0, 0, 0, 0]);
      expect(row.cantripsKnown, `заговоры, ур. ${level}`).toBe(cantrips);
    }
    // Чем она не HALF_CASTER_SLOTS: у Паладина на 1 уровне ячеек нет вовсе.
    expect(progressionAt("classes-paladin", 1)!.spellSlots.every((n) => n === 0)).toBe(true);
    expect(PROGRESSION_MAX_LEVEL).toBe(12);
  });

  it("готовит заклинания; ячейки возвращает длинный отдых; увеличение характеристик на 4, 8, 12", () => {
    expect(CLASS_PROGRESSION[ARTIFICER_ID].spellsKnownKind).toBe("prepared");
    expect(slotRechargeOf(ARTIFICER_ID)).toBe("long");
    expect(asiLevels(ARTIFICER_ID)).toEqual([4, 8, 12]);
  });

  /** С. 5 PDF: «модификатор Интеллекта + половина уровня, округлённая вниз (минимум одно)». */
  it("норма подготовки — Интеллект + половина уровня вниз, с примером PDF «5 уровень, Интеллект 14 → четыре»", () => {
    const int = (score: number) => ({ ...emptyAbilityScores(), intelligence: score });
    expect(preparedSpellsMax(ARTIFICER_ID, int(14), 5)).toBe(4);
    expect(preparedSpellsMax(ARTIFICER_ID, int(16), 1)).toBe(3);
    expect(preparedSpellsMax(ARTIFICER_ID, int(16), 12)).toBe(9);
    expect(preparedSpellsMax(ARTIFICER_ID, int(8), 1)).toBe(1);
  });
});

describe("Изобретатель — наш список заклинаний", () => {
  it("каждый id есть в spells.json, круги только 0-3, без повторов", () => {
    expect(new Set(ARTIFICER_SPELL_IDS).size).toBe(ARTIFICER_SPELL_IDS.length);
    for (const id of ARTIFICER_SPELL_IDS) {
      const spell = spells.find((sp) => sp.id === id);
      expect(spell, `заклинания «${id}» нет в spells.json`).toBeDefined();
      expect(spell!.level, id).toBeLessThanOrEqual(3);
    }
  });

  it("на 1 уровне есть из чего выбрать: заговоров и заклинаний 1 круга больше нормы", () => {
    const cantrips = spells.filter((sp) => sp.level === 0 && isClassSpell(sp, ARTIFICER_ID));
    expect(cantrips.length).toBeGreaterThan(2);
    const preparable = preparableSpells(spells, { classId: ARTIFICER_ID, level: 1, alreadyPrepared: [] });
    expect(preparable.length).toBeGreaterThanOrEqual(5);
    expect(preparable.every((sp) => sp.level === 1)).toBe(true);
    expect(preparable.map((sp) => sp.id)).toContain("cure-wounds");
    // На 9 уровне открывается 3 круг.
    const at9 = preparableSpells(spells, { classId: ARTIFICER_ID, level: 9, alreadyPrepared: [] });
    expect(at9.map((sp) => sp.id)).toContain("haste");
  });

  it("у SRD-классов отбор прежний — по `spell.classes`, наш список их не задевает", () => {
    const wizardBefore = spells.filter((sp) => sp.classes.includes("classes-wizard")).map((sp) => sp.id);
    const wizardNow = spells.filter((sp) => isClassSpell(sp, "classes-wizard")).map((sp) => sp.id);
    expect(wizardNow).toEqual(wizardBefore);
    expect(spells.filter((sp) => isClassSpell(sp, "classes-cleric")).some((sp) => sp.id === "fire-bolt")).toBe(false);
  });
});

describe("Изобретатель — инфузии и специальности", () => {
  const [infusions] = CLASS_CHOICES[ARTIFICER_ID];

  it("известные инфузии и предметы с инфузией — столбцы таблицы PDF", () => {
    for (const [level, known, infused] of PDF_TABLE) {
      expect(classChoiceKnownAt(infusions, level), `известные, ур. ${level}`).toBe(known);
      const scaling = progressionAt(ARTIFICER_ID, level)!.scaling;
      const items = scaling.find((s) => s.name === "Предметы с инфузией");
      expect(items?.value ?? "0", `предметы, ур. ${level}`).toBe(String(infused));
    }
  });

  /**
   * С. 7-11 и 26-27 PDF: шестнадцать основных инфузий (без «Движимого магией
   * доспеха» 14 уровня — пятнадцать) и шесть дополнительных — двадцать одна.
   * «Копия магического предмета» изучается по разу на предмет и потому стоит
   * тремя вариантами (таблицы 2, 6 и 10 уровня) — вариантов выбора 23.
   */
  it("двадцать одна инфузия в 23 вариантах; с требованием 6 и 10 уровня раньше не предлагаются", () => {
    const distinct = new Set(infusions.options.map((o) => o.name.replace(/ \(\d+ уровень\)$/, "")));
    expect(distinct.size).toBe(21);
    expect(infusions.options).toHaveLength(23);
    expect(classChoiceOptionsAt(infusions, 2)).toHaveLength(12);
    expect(classChoiceOptionsAt(infusions, 6)).toHaveLength(21);
    expect(classChoiceOptionsAt(infusions, 10)).toHaveLength(23);
    expect(infusions.options.some((o) => o.name.startsWith("Движимый"))).toBe(false);
  });

  it("специальность — на 3 уровне, восемь вариантов с умениями на 3, 5 и 9", () => {
    const info = CLASS_SUBCLASSES[ARTIFICER_ID];
    expect(info.chosenAtLevel).toBe(3);
    expect(info.subclasses.map((s) => s.name)).toEqual([
      "Алхимик (специальность)",
      "Артиллерист",
      "Боевой кузнец",
      "Бронник",
      "Мастер кузнечного дела",
      "Инакомыслящий",
      "Мастер-создатель",
      "Стихийный проводник",
    ]);
    for (const spec of info.subclasses) {
      expect(Object.keys(spec.featuresByLevel).map(Number), spec.name).toEqual([3, 5, 9]);
    }
  });

  it("заклинания специальности — только те, что есть в spells.json, и приходят по уровням", () => {
    for (const spec of CLASS_SUBCLASSES[ARTIFICER_ID].subclasses) {
      for (const ids of Object.values(spec.grants?.spellsByLevel ?? {})) {
        for (const id of ids) expect(spells.some((sp) => sp.id === id), `${spec.name}: ${id}`).toBe(true);
      }
    }
    // Артиллерист, с. 14 PDF: «волна грома, щит» на 3, «дребезги, палящий луч» на 5.
    expect(subclassSpellsUpToLevel(ARTIFICER_ID, "Артиллерист", 3)).toEqual(["thunderwave", "shield"]);
    expect(subclassSpellsUpToLevel(ARTIFICER_ID, "Артиллерист", 5)).toEqual([
      "thunderwave",
      "shield",
      "shatter",
      "scorching-ray",
    ]);
  });

  it("особенности класса на листе: инфузирование 2, подходящий инструмент 3, проблеск гениальности 7", () => {
    const names = (level: number) => (CLASS_LEVEL_FEATURES[ARTIFICER_ID][level] ?? []).map((f) => f.name);
    expect(names(2)).toEqual(["Инфузирование предмета"]);
    expect(names(3)).toEqual(["Подходящий инструмент"]);
    expect(names(7)).toEqual(["Проблеск гениальности"]);
    expect(names(11)).toEqual(["Хранящий заклинания предмет"]);
  });

  it("«Проблеск гениальности» с 7 уровня — модификатор Интеллекта; «Хранящий предмет» с 11 — удвоенный, минимум два", () => {
    const abilities = { ...emptyAbilityScores(), intelligence: 16 };
    expect(characterResources(ARTIFICER_ID, null, 6).some((r) => r.id === FLASH_OF_GENIUS_RESOURCE_ID)).toBe(false);
    const flash = characterResources(ARTIFICER_ID, null, 7).find((r) => r.id === FLASH_OF_GENIUS_RESOURCE_ID)!;
    expect(resourceMax(flash, abilities)).toBe(3);
    expect(flash.recharge).toBe("long");
    const storing = characterResources(ARTIFICER_ID, null, 11).find((r) => r.id === SPELL_STORING_ITEM_RESOURCE_ID)!;
    expect(resourceMax(storing, abilities)).toBe(6);
    expect(resourceMax(storing, { ...abilities, intelligence: 10 })).toBe(2);
    expect(storing.recharge).toBe("long");
  });
});
