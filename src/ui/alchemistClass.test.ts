import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleBlock, RuleTopic } from "../state/types";
import { emptyAbilityScores } from "../state/types";
import {
  ALCHEMIST_DISCOVERIES,
  ALCHEMIST_ID,
  ALCHEMIST_TITLE,
  ALCHEMIST_TOPIC,
  BOMB_FORMULAS,
  BOMBS_RESOURCE_ID,
  READY_TO_BLOW_DISCOVERY_ID,
  REAGENT_DICE_RESOURCE_ID,
} from "./alchemistClass";
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
  equipmentChoiceFor,
  maxHpForLevel,
  parseHitDie,
  parseHitDieAverage,
  toolProficienciesFor,
  weaponProficienciesFor,
} from "./characterCreationData";
import {
  CLASS_PROGRESSION,
  PROGRESSION_MAX_LEVEL,
  asiLevels,
  characterResources,
  classSaveDc,
  progressionAt,
  slotRechargeOf,
} from "./classProgression";
import { isOwnRuleTopic, playableClasses } from "./ownRuleTopics";

const srdTopics = bundledRules as unknown as RuleTopic[];
const topic = playableClasses(srdTopics).find((t) => t.id === ALCHEMIST_ID);

/**
 * Таблица класса с. 1 PDF владельца, переписанная РУКОЙ, а не из констант
 * модуля: проба, читающая числа из того же места, что код, сдвиг не ловит.
 * Столбцы: уровень, известные формулы, кости реагентов, известные открытия.
 */
const PDF_TABLE: [number, number, number, number][] = [
  [1, 0, 0, 0],
  [2, 3, 0, 0],
  [3, 3, 3, 0],
  [4, 3, 4, 2],
  [5, 4, 5, 2],
  [6, 4, 6, 3],
  [7, 5, 7, 3],
  [8, 5, 8, 3],
  [9, 6, 9, 4],
  [10, 6, 10, 4],
  [11, 7, 11, 4],
  [12, 7, 12, 4],
];

describe("Алхимик — наш класс в справочнике", () => {
  it("стоит в playableClasses как наш класс, в rules.json его нет", () => {
    expect(topic).toBeDefined();
    expect(topic!.title).toBe(ALCHEMIST_TITLE);
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(playableClasses(srdTopics).filter((t) => t.id === ALCHEMIST_ID)).toHaveLength(1);
    expect(srdTopics.some((t) => t.id === ALCHEMIST_ID || t.title === ALCHEMIST_TITLE)).toBe(false);
    expect(ALCHEMIST_TOPIC.sourceUrl).toBe("");
  });

  /** Кость 1к6 — самая слабая в приложении, до неё нигде не встречалась (с. 2 PDF: «1к6 (или 4)»). */
  it("кость хитов 1к6 и среднее 4 вычитываются из статьи тем же разбором, что у SRD-классов", () => {
    expect(parseHitDie(topic)).toBe(6);
    expect(parseHitDieAverage(topic)).toBe(4);
  });

  it("кость 1к6 доезжает до максимума хитов создания и левел-апа", () => {
    const max = parseHitDie(topic)!;
    const average = parseHitDieAverage(topic)!;
    // 1 уровень: 6 + Телосложение (+1); 4 уровень: ещё по 4 + 1 за три уровня.
    expect(maxHpForLevel(max, average, 1, 0, 1)).toBe(7);
    expect(maxHpForLevel(max, average, 1, 0, 4)).toBe(22);
  });

  it("таблица уровней статьи идёт до 12 и совпадает со с. 1 PDF", () => {
    const table = ALCHEMIST_TOPIC.blocks.find((b) => b.type === "table") as Extract<RuleBlock, { type: "table" }>;
    const rows = table.rows.slice(1);
    expect(rows.map((r) => Number(r[0]))).toEqual(PDF_TABLE.map(([level]) => level));
    for (const [level, formulas, reagents, discoveries] of PDF_TABLE) {
      const row = rows[level - 1];
      expect(row[2], `формулы, ур. ${level}`).toBe(formulas ? String(formulas) : "—");
      expect(row[3], `реагенты, ур. ${level}`).toBe(reagents ? `${reagents}к10` : "—");
      expect(row[4], `открытия, ур. ${level}`).toBe(discoveries ? String(discoveries) : "—");
    }
  });

  it("каждая формула и каждое открытие попадают в статью из того же списка, что и выбор", () => {
    const text = ALCHEMIST_TOPIC.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : [])).join("\n");
    for (const option of [...BOMB_FORMULAS, ...ALCHEMIST_DISCOVERIES]) {
      expect(text.includes(option.description), `в статье нет «${option.name}»`).toBe(true);
    }
  });
});

describe("Алхимик — карты класса", () => {
  const prof = CLASS_PROFICIENCIES[ALCHEMIST_ID];

  it("спасброски, навыки и владения — с. 2 PDF; бомба — названием, а не категорией", () => {
    expect(prof.savingThrows).toEqual(["dexterity", "intelligence"]);
    expect(prof.skillCount).toBe(3);
    expect(prof.skillOptions).toHaveLength(8);
    for (const skill of prof.skillOptions) expect(ALL_SKILLS).toContain(skill);
    expect(armorProficienciesFor(ALCHEMIST_ID, null)).toEqual(["light"]);
    expect(weaponProficienciesFor(ALCHEMIST_ID, null)).toEqual(["simple", "Бомба"]);
    expect(toolProficienciesFor(ALCHEMIST_ID, null)).toEqual(["Инструменты алхимика", "Набор травника"]);
  });

  it("четыре слота снаряжения, и каждый предмет узнаётся каталогом или уже стоит у SRD-класса", () => {
    const slots = CLASS_EQUIPMENT[ALCHEMIST_ID];
    expect(slots).toHaveLength(4);
    expect(slots[2].options).toHaveLength(3);
    const srdItems = new Set(
      Object.entries(CLASS_EQUIPMENT)
        .filter(([id]) => id !== ALCHEMIST_ID)
        .flatMap(([, s]) => s.flatMap((slot) => slot.options.flatMap((o) => o.items))),
    );
    for (const item of slots.flatMap((s) => s.options.flatMap((o) => o.items))) {
      const known =
        ALL_ITEMS_WITH_COST.some((i) => i.name === item) ||
        !!equipmentChoiceFor(item) ||
        /^(.+) ×\d+$/.test(item) ||
        srdItems.has(item);
      expect(known, `предмет «${item}» не узнан`).toBe(true);
    }
  });

  it("не заклинатель: ячеек нет ни на одном уровне, отдых ячеек — длинный", () => {
    expect(CLASS_PROGRESSION[ALCHEMIST_ID].spellsKnownKind).toBe("none");
    expect(slotRechargeOf(ALCHEMIST_ID)).toBe("long");
    for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
      expect(progressionAt(ALCHEMIST_ID, level)!.spellSlots.every((n) => n === 0)).toBe(true);
    }
    expect(asiLevels(ALCHEMIST_ID)).toEqual([4, 8, 12]);
  });

  it("кости реагентов растут по таблице PDF и возвращаются ДЛИННЫМ отдыхом, бомбы — коротким", () => {
    for (const [level, , reagents] of PDF_TABLE) {
      const resources = characterResources(ALCHEMIST_ID, null, level);
      const dice = resources.find((r) => r.id === REAGENT_DICE_RESOURCE_ID);
      expect(dice?.max ?? 0, `кости реагентов, ур. ${level}`).toBe(reagents);
      if (dice) expect(dice.recharge).toBe("long");
      // «10 + ваш удвоенный уровень алхимика» (с. 2).
      const bombs = resources.find((r) => r.id === BOMBS_RESOURCE_ID)!;
      expect(bombs.max).toBe(10 + 2 * level);
      expect(bombs.recharge).toBe("short");
    }
  });

  it("лесенки выбора формул и открытий — столбцы таблицы PDF", () => {
    const [formulas, discoveries] = CLASS_CHOICES[ALCHEMIST_ID];
    for (const [level, f, , d] of PDF_TABLE) {
      expect(classChoiceKnownAt(formulas, level), `формулы, ур. ${level}`).toBe(f);
      expect(classChoiceKnownAt(discoveries, level), `открытия, ур. ${level}`).toBe(d);
    }
    expect(formulas.options).toHaveLength(24);
    expect(discoveries.options).toHaveLength(18);
    // Открытия с требованием 9 уровня раньше не предлагаются.
    expect(discoveries.options.filter((o) => o.minLevel === 9)).toHaveLength(4);
  });

  it("специализация — на 2 уровне (с. 1, 3 PDF), одиннадцать вариантов с умениями на 2, 6 и 10", () => {
    const info = CLASS_SUBCLASSES[ALCHEMIST_ID];
    expect(info.chosenAtLevel).toBe(2);
    expect(info.subclasses).toHaveLength(11);
    for (const spec of info.subclasses) {
      expect(Object.keys(spec.featuresByLevel).map(Number), spec.name).toEqual([2, 6, 10]);
    }
  });

  it("особенности класса на листе: светошумовая 5, улучшенные зелья 7, увёртливость 11", () => {
    const names = (level: number) => (CLASS_LEVEL_FEATURES[ALCHEMIST_ID][level] ?? []).map((f) => f.name);
    expect(names(5)).toContain("Светошумовая бомба");
    expect(names(7)).toContain("Улучшенные зелья");
    expect(names(11)).toContain("Увёртливость");
    expect(names(3)).toEqual(["Реагенты", "Зельеварение"]);
  });
});

describe("Алхимик — СЛ спасброска от бомб (с. 3 PDF)", () => {
  const abilities = { ...emptyAbilityScores(), intelligence: 16 };

  it("8 + бонус мастерства + модификатор Интеллекта", () => {
    expect(classSaveDc(ALCHEMIST_ID, abilities, 4, {})).toEqual({ name: "СЛ спасброска от бомб", value: "13" });
    expect(classSaveDc(ALCHEMIST_ID, abilities, 9, {})!.value).toBe("15");
  });

  it("«Сейчас рванёт» прибавляет половину бонуса мастерства вниз (с. 15)", () => {
    const choices = { "alchemist-discoveries": [READY_TO_BLOW_DISCOVERY_ID] };
    expect(classSaveDc(ALCHEMIST_ID, abilities, 9, choices)!.value).toBe("17");
  });

  it("у SRD-классов такой СЛ нет", () => {
    expect(classSaveDc("classes-wizard", abilities, 9, {})).toBeNull();
  });
});
