import { describe, it, expect } from "vitest";
import bundledSpells from "../../src-tauri/rules/spells.json";
import {
  armorProficienciesFor,
  carryingCapacityLb,
  catalogWeightLb,
  encumbranceLevel,
  encumbranceSpeedPenaltyFeet,
  CLASS_PROFICIENCIES,
  CLASS_SUBCLASSES,
  type SubclassGrants,
  coinsWeightLb,
  computeArmorClass,
  effectiveSubclassGrants,
  healingPoolSelfHeal,
  inventoryWeightLb,
  parseItemWeightLb,
  spellSaveDc,
  subclassEffectValue,
  subclassGrants,
  subclassResourceOptionsAt,
  subclassScalingAt,
  subclassSpellsUpToLevel,
  toggleChoiceSelection,
  toolProficienciesFor,
  unproficientArmorIssue,
  weaponAttackFor,
  weaponProficienciesFor,
  WEAPONS,
  CLASS_LEVEL_FEATURES,
} from "./characterCreationData";
import { CLASS_PROGRESSION, characterResources, PROGRESSION_MAX_LEVEL } from "./classProgression";
import { emptyAbilityScores, emptyCoins } from "../state/types";

/** Все 12 базовых классов SRD 5.1 (rules.json → category "classes") — см. таблицу в карточке characters-original-subclasses. */
const ALL_12_CLASSES = [
  "classes-bard",
  "classes-barbarian",
  "classes-fighter",
  "classes-wizard",
  "classes-druid",
  "classes-cleric",
  "classes-warlock",
  "classes-monk",
  "classes-paladin",
  "classes-rogue",
  "classes-ranger",
  "classes-sorcerer",
];

describe("CLASS_SUBCLASSES (characters-original-subclasses)", () => {
  it("has exactly 12 classes", () => {
    expect(new Set(Object.keys(CLASS_SUBCLASSES))).toEqual(new Set(ALL_12_CLASSES));
  });

  /**
   * У одиннадцати классов ровно 3 архетипа (1 из SRD + 2 оригинальных,
   * characters-original-subclasses). У Жреца их 4: карточка
   * characters-preset-pool-remaining-11 добавила четвёртый оригинальный домен
   * вместо домена Знаний с листа «Селиэн Ардвен» (PHB, вне SRD).
   */
  const SUBCLASS_COUNT: Record<string, number> = { "classes-cleric": 4 };

  it.each(ALL_12_CLASSES)("%s has 1 SRD subclass plus original ones, all with distinct non-empty names", (classId) => {
    const info = CLASS_SUBCLASSES[classId];
    const expected = SUBCLASS_COUNT[classId] ?? 3;
    expect(info.subclasses).toHaveLength(expected);
    const names = info.subclasses.map((s) => s.name);
    expect(new Set(names).size).toBe(expected);
    for (const name of names) expect(name.trim().length).toBeGreaterThan(0);
  });

  it("every original subclass carries a description and at least one feature at chosenAtLevel", () => {
    for (const classId of ALL_12_CLASSES) {
      const info = CLASS_SUBCLASSES[classId];
      for (const original of info.subclasses.slice(1)) {
        expect(original.description).toBeTruthy();
        expect(original.featuresByLevel[info.chosenAtLevel]?.length).toBeGreaterThan(0);
      }
    }
  });
});

/** characters-subclass-features-have-no-mechanical-effect — владения как структурные данные. */
describe("владения доспехами и оружием", () => {
  it.each(ALL_12_CLASSES)("%s: каждый поимённый вид оружия есть в таблице WEAPONS", (classId) => {
    for (const name of CLASS_PROFICIENCIES[classId].weapons) {
      expect(WEAPONS.some((w) => w.name === name), `${name} нет в WEAPONS`).toBe(true);
    }
  });

  it("Домен войны добавляет жрецу тяжёлые доспехи и воинское оружие поверх классовых", () => {
    expect(armorProficienciesFor("classes-cleric", null)).toEqual(["light", "medium", "shields"]);
    expect(armorProficienciesFor("classes-cleric", "Домен войны")).toContain("heavy");
    expect(weaponProficienciesFor("classes-cleric", null)).toEqual(["simple"]);
    expect(weaponProficienciesFor("classes-cleric", "Домен войны")).toEqual(["simple", "martial"]);
  });

  it("Домен жизни даёт тяжёлые доспехи, но не воинское оружие", () => {
    expect(armorProficienciesFor("classes-cleric", "Домен жизни")).toContain("heavy");
    expect(weaponProficienciesFor("classes-cleric", "Домен жизни")).not.toContain("martial");
  });
});

describe("weaponAttackFor (владение оружием превращается в число)", () => {
  const longsword = WEAPONS.find((w) => w.name === "Длинный меч")!;
  const abilities = { ...emptyAbilityScores(), strength: 16 };

  it("жрец без Домена войны бьёт длинным мечом только по характеристике", () => {
    const attack = weaponAttackFor(longsword, abilities, 1, weaponProficienciesFor("classes-cleric", "Домен жизни"));
    expect(attack.proficient).toBe(false);
    expect(attack.attackBonus).toBe(3);
  });

  it("Домен войны добавляет к тому же броску бонус мастерства", () => {
    const attack = weaponAttackFor(longsword, abilities, 1, weaponProficienciesFor("classes-cleric", "Домен войны"));
    expect(attack.proficient).toBe(true);
    expect(attack.attackBonus).toBe(5);
  });

  it("дальнобойное оружие считается по Ловкости, а фехтовальное — по лучшей из Силы и Ловкости", () => {
    const shortbow = WEAPONS.find((w) => w.name === "Короткий лук")!;
    const rapier = WEAPONS.find((w) => w.name === "Рапира")!;
    const dexy = { ...emptyAbilityScores(), strength: 8, dexterity: 18 };
    expect(weaponAttackFor(shortbow, dexy, 1, []).ability).toBe("dexterity");
    expect(weaponAttackFor(rapier, dexy, 1, []).ability).toBe("dexterity");
    expect(weaponAttackFor(rapier, abilities, 1, []).ability).toBe("strength");
  });
});

describe("unproficientArmorIssue (расплата SRD за доспех не по владению)", () => {
  it("латы у жреца без домена, дающего тяжёлые доспехи, — нарушение владения", () => {
    const issue = unproficientArmorIssue(["Латы"], armorProficienciesFor("classes-cleric", "Домен обмана"));
    expect(issue?.items).toEqual(["Латы"]);
  });

  it("те же латы у Домена войны нарушением не считаются", () => {
    expect(unproficientArmorIssue(["Латы"], armorProficienciesFor("classes-cleric", "Домен войны"))).toBeNull();
  });

  it("КД при этом одинаковое: владение по SRD на само КД не влияет", () => {
    const abilities = { ...emptyAbilityScores(), dexterity: 14 };
    const ac = (subclassName: string) =>
      computeArmorClass({ classId: "classes-cleric", subclassName, abilities, inventoryItemNames: ["Латы"] });
    expect(ac("Домен войны")).toBe(18);
    expect(ac("Домен обмана")).toBe(18);
  });

  it("«Драконья устойчивость» чародея-дракона по-прежнему даёт КД 13 + Ловкость", () => {
    const abilities = { ...emptyAbilityScores(), dexterity: 14 };
    const args = { classId: "classes-sorcerer", abilities, inventoryItemNames: [] };
    expect(computeArmorClass({ ...args, subclassName: "Наследие драконьей крови" })).toBe(15);
    expect(computeArmorClass({ ...args, subclassName: "Дикая магия" })).toBe(12);
  });
});

describe("эффекты вариантов архетипа", () => {
  const ctx = { classId: "classes-cleric", abilities: { ...emptyAbilityScores(), wisdom: 16 }, level: 2 };

  it("Сохранение жизни даёт 5 × уровень хитов на распределение", () => {
    const option = subclassResourceOptionsAt("classes-cleric", "Домен жизни", 2)[0];
    expect(option.resourceId).toBe("channel-divinity");
    expect(subclassEffectValue(option.effect, ctx)).toEqual({ label: "хитов на распределение", value: 10 });
  });

  it("варианты, ещё не открытые уровнем, не предлагаются", () => {
    expect(subclassResourceOptionsAt("classes-cleric", "Домен жизни", 1)).toHaveLength(0);
  });

  it("Обманный след считает СЛ спасброска от заклинаний жреца", () => {
    const option = subclassResourceOptionsAt("classes-cleric", "Домен обмана", 2)[0];
    expect(spellSaveDc("classes-cleric", ctx.abilities, 2)).toBe(13);
    expect(subclassEffectValue(option.effect, ctx)?.value).toBe(13);
  });

  it("запас лечения не поднимает жреца выше половины его максимума хитов", () => {
    expect(healingPoolSelfHeal(10, 2, 20)).toBe(8);
    expect(healingPoolSelfHeal(10, 12, 20)).toBe(0);
  });
});

/**
 * Каждый архетип, получивший механику карточкой
 * characters-subclass-features-remaining-archetypes, назван здесь вместе с
 * ключом гранта, который у него обязан быть. Таблица, а не 27 отдельных проб:
 * пробы сторожат дефект «архетип снова стал только текстом», и одного
 * перечисления для этого достаточно.
 */
const GRANTED_ARCHETYPES: [classId: string, subclass: string, key: keyof NonNullable<ReturnType<typeof subclassGrants>>][] = [
  ["classes-warlock", "Исчадие", "spellsByLevel"],
  ["classes-warlock", "Покровитель-Архифея", "spellsByLevel"],
  ["classes-warlock", "Покровитель-Древний Ужас", "spellsByLevel"],
  ["classes-sorcerer", "Дикая магия", "resourceOptions"],
  ["classes-sorcerer", "Происхождение от бури", "resources"],
  ["classes-wizard", "Школа эвокации", "scaling"],
  ["classes-wizard", "Школа иллюзий", "scaling"],
  ["classes-wizard", "Школа некромантии", "scaling"],
  ["classes-druid", "Круг земли", "resources"],
  ["classes-druid", "Круг луны", "scaling"],
  ["classes-druid", "Круг звёзд", "resources"],
  ["classes-bard", "Коллегия знаний", "resourceOptions"],
  ["classes-bard", "Коллегия шёпота", "toolProficiencies"],
  ["classes-barbarian", "Путь Берсерка", "resourceOptions"],
  ["classes-barbarian", "Путь Тотемного воина", "resourceOptions"],
  ["classes-barbarian", "Путь Штурмовика", "scaling"],
  ["classes-fighter", "Воитель", "critRange"],
  ["classes-fighter", "Мастер боя", "resources"],
  ["classes-fighter", "Мистический рыцарь", "resources"],
  ["classes-monk", "Путь открытой ладони", "resourceOptions"],
  ["classes-monk", "Путь тени", "resourceOptions"],
  ["classes-monk", "Путь четырёх стихий", "resourceOptions"],
  ["classes-rogue", "Вор", "toolProficiencies"],
  ["classes-rogue", "Убийца", "toolProficiencies"],
  ["classes-rogue", "Мистический ловкач", "bonusCantrips"],
  ["classes-ranger", "Укротитель зверей", "scaling"],
  ["classes-ranger", "Странник", "resources"],
  // characters-subclass-choice-ui: выбор внутри архетипа — не безусловный
  // грант, подключён через choices, см. describe ниже.
  ["classes-ranger", "Охотник", "choices"],
  ["classes-bard", "Коллегия знаний", "choices"],
  ["classes-druid", "Круг земли", "choices"],
];

describe("механика архетипов", () => {
  it.each(GRANTED_ARCHETYPES)("%s / %s даёт %s", (classId, subclass, key) => {
    expect(subclassGrants(classId, subclass)?.[key]).toBeDefined();
  });

  it("без архетипа грантов нет вовсе", () => {
    expect(subclassGrants("classes-fighter", null)).toBeUndefined();
    expect(subclassGrants(null, "Воитель")).toBeUndefined();
  });
});

/**
 * Общий механизм выбора внутри архетипа (SubclassChoice/effectiveSubclassGrants)
 * — покрыт независимо от конкретных архетипов, «Добыча охотника» здесь только
 * поставщик реальных данных (простейший подключённый случай, pick === 1).
 */
describe("выбор варианта архетипа (SubclassChoice)", () => {
  const hunterPreyChoice = subclassGrants("classes-ranger", "Охотник")!.choices![0];

  it("выбор недоступен до уровня — Добыча охотника открывается только на 3 уровне", () => {
    expect(hunterPreyChoice.minLevel).toBe(3);
    expect(hunterPreyChoice.pick).toBe(1);
    expect(hunterPreyChoice.options.map((o) => o.id)).toEqual(["colossus-slayer", "giant-killer", "horde-breaker"]);
  });

  it("без сделанного выбора эффективные гранты равны базовым", () => {
    expect(effectiveSubclassGrants("classes-ranger", "Охотник", {})).toEqual(subclassGrants("classes-ranger", "Охотник"));
    expect(effectiveSubclassGrants("classes-ranger", "Охотник")).toEqual(subclassGrants("classes-ranger", "Охотник"));
  });

  it("выбор доступен и применяется — выбранный вариант подмешивается в гранты", () => {
    const grants = effectiveSubclassGrants("classes-ranger", "Охотник", { [hunterPreyChoice.id]: ["colossus-slayer"] });
    expect(grants?.scaling).toContainEqual({
      name: "Убийца Колоссов",
      minLevel: 3,
      effect: { kind: "bonus-damage-dice", count: 1, die: 8 },
    });
  });

  it("невыбранный вариант эффекта не даёт", () => {
    const grants = effectiveSubclassGrants("classes-ranger", "Охотник", { [hunterPreyChoice.id]: ["giant-killer"] });
    expect(grants?.scaling?.some((s) => s.name === "Убийца Колоссов")).toBe(false);
    expect(grants?.scaling).toContainEqual({ name: "Убийца великанов", minLevel: 3, effect: { kind: "descriptive" } });
  });

  /** Коллегия знаний — второй подключённый случай, pick > 1 на настоящих данных (18 навыков SRD). */
  describe("Коллегия знаний барда — pick > 1", () => {
    const loreSkillsChoice = subclassGrants("classes-bard", "Коллегия знаний")!.choices![0];

    it("выбор — 3 варианта из полного списка навыков SRD, а не маленький фиксированный список", () => {
      expect(loreSkillsChoice.pick).toBe(3);
      expect(loreSkillsChoice.options).toHaveLength(18);
      expect(loreSkillsChoice.options.map((o) => o.id)).toContain("Магия");
    });

    it("три выбранных навыка подмешиваются в skills архетипа", () => {
      const grants = effectiveSubclassGrants("classes-bard", "Коллегия знаний", {
        [loreSkillsChoice.id]: ["Магия", "Религия", "История"],
      });
      expect(grants?.skills).toEqual(["Магия", "Религия", "История"]);
    });

    it("невыбранный навык в skills не попадает", () => {
      const grants = effectiveSubclassGrants("classes-bard", "Коллегия знаний", {
        [loreSkillsChoice.id]: ["Магия", "Религия", "История"],
      });
      expect(grants?.skills).not.toContain("Природа");
    });
  });

  /**
   * Круг земли — третий подключённый случай: вариант несёт не безусловный
   * список, а собственный мини-spellsByLevel (заклинания местности), который
   * должен пройти через тот же subclassSpellsUpToLevel, что и обычные домены.
   */
  describe("Круг земли друида — вариант несёт свой spellsByLevel", () => {
    const terrainChoice = subclassGrants("classes-druid", "Круг земли")!.choices![0];

    it("местность выбирается на том же уровне, что и сам архетип, вариантов 7", () => {
      expect(terrainChoice.minLevel).toBe(2);
      expect(terrainChoice.pick).toBe(1);
      expect(terrainChoice.options).toHaveLength(7);
      expect(terrainChoice.options.map((o) => o.id)).toEqual([
        "arctic",
        "coast",
        "desert",
        "forest",
        "grassland",
        "mountain",
        "swamp",
      ]);
    });

    it("заклинания выбранной местности доступны через subclassSpellsUpToLevel по уровню", () => {
      const choices = { [terrainChoice.id]: ["arctic"] };
      expect(subclassSpellsUpToLevel("classes-druid", "Круг земли", 2, choices)).toEqual([]);
      expect(subclassSpellsUpToLevel("classes-druid", "Круг земли", 3, choices)).toEqual(
        expect.arrayContaining(["hold-person", "spike-growth"]),
      );
      expect(subclassSpellsUpToLevel("classes-druid", "Круг земли", 5, choices)).toEqual(
        expect.arrayContaining(["hold-person", "spike-growth", "slow", "sleet-storm"]),
      );
    });

    it("невыбранная местность своих заклинаний не даёт", () => {
      const choices = { [terrainChoice.id]: ["swamp"] };
      expect(subclassSpellsUpToLevel("classes-druid", "Круг земли", 5, choices)).not.toContain("hold-person");
      expect(subclassSpellsUpToLevel("classes-druid", "Круг земли", 5, choices)).toEqual(
        expect.arrayContaining(["acid-arrow", "darkness", "stinking-cloud", "water-walk"]),
      );
    });

    it("все id заклинаний местностей существуют в бандле spells.json (bundledSpells)", () => {
      const ids = new Set(bundledSpells.map((s) => s.id));
      for (const option of terrainChoice.options) {
        for (const spellIds of Object.values(option.grants.spellsByLevel ?? {})) {
          for (const id of spellIds) {
            expect(ids.has(id), `${option.label}: заклинание "${id}" отсутствует в spells.json`).toBe(true);
          }
        }
      }
    });
  });
});

describe("toggleChoiceSelection — общий приём выбора N вариантов с потолком", () => {
  it("pick === 1 заменяет выбор целиком, как радиокнопка", () => {
    expect(toggleChoiceSelection([], "a", 1)).toEqual(["a"]);
    expect(toggleChoiceSelection(["a"], "b", 1)).toEqual(["b"]);
  });

  it("pick > 1 не даёт выбрать больше N", () => {
    expect(toggleChoiceSelection(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleChoiceSelection(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("уже выбранный вариант снимается повторным нажатием", () => {
    expect(toggleChoiceSelection(["a", "b"], "a", 2)).toEqual(["b"]);
  });
});

describe("владение инструментами", () => {
  it("даётся архетипом, который его обещает", () => {
    expect(toolProficienciesFor("classes-rogue", "Убийца")).toEqual(["Набор для отравления", "Маскировочный набор"]);
    expect(toolProficienciesFor("classes-bard", "Коллегия шёпота")).toEqual(["Воровские инструменты"]);
  });

  it("у архетипа без такого гранта список пуст", () => {
    expect(toolProficienciesFor("classes-rogue", "Мистический ловкач")).toEqual([]);
    expect(toolProficienciesFor("classes-rogue", null)).toEqual([]);
  });
});

describe("постоянные числа архетипа", () => {
  const abilities = { ...emptyAbilityScores(), charisma: 16, wisdom: 16, intelligence: 16 };

  it("Благословение темнейшего считает временные хиты от Харизмы и уровня", () => {
    const entry = subclassScalingAt("classes-warlock", "Исчадие", 3)[0];
    expect(subclassEffectValue(entry.effect, { classId: "classes-warlock", abilities, level: 3 })).toEqual({
      label: "временных хитов",
      value: 6,
    });
  });

  it("Сокрушительный напор считает урон по бонусу мастерства, Первый и последний удар — по уровню", () => {
    const rush = subclassScalingAt("classes-barbarian", "Путь Штурмовика", 5)[0];
    expect(subclassEffectValue(rush.effect, { classId: "classes-barbarian", abilities, level: 5 })?.value).toBe(3);
    const strike = subclassScalingAt("classes-rogue", "Убийца", 5)[0];
    expect(subclassEffectValue(strike.effect, { classId: "classes-rogue", abilities, level: 5 })?.value).toBe(5);
  });

  it("числа школ волшебника считаются от круга заклинаний, а не от уровня", () => {
    const ctx = { classId: "classes-wizard", abilities, level: 5, spellCircle: 3 };
    const sculpt = subclassScalingAt("classes-wizard", "Школа эвокации", 5)[0];
    expect(subclassEffectValue(sculpt.effect, ctx)?.value).toBe(4);
    const flesh = subclassScalingAt("classes-wizard", "Школа некромантии", 5)[0];
    expect(subclassEffectValue(flesh.effect, ctx)?.value).toBe(2);
  });

  it("Звериный спутник получает учетверённый уровень следопыта хитами", () => {
    const companion = subclassScalingAt("classes-ranger", "Укротитель зверей", 5)[0];
    expect(subclassEffectValue(companion.effect, { classId: "classes-ranger", abilities, level: 5 })).toEqual({
      label: "хитов у звериного спутника",
      value: 20,
    });
  });

  it("кость эффекта показывается костью, а не числом", () => {
    const maneuver = subclassResourceOptionsAt("classes-fighter", "Мастер боя", 3).find((o) => o.id === "maneuver-precision")!;
    expect(subclassEffectValue(maneuver.effect, { classId: "classes-fighter", abilities, level: 3 })).toEqual({
      label: "к броску",
      value: "1к8",
    });
  });

  it("до нужного уровня постоянных чисел нет, и у архетипа без них список пуст", () => {
    expect(subclassScalingAt("classes-ranger", "Укротитель зверей", 2)).toEqual([]);
    expect(subclassScalingAt("classes-bard", "Коллегия шёпота", 5)).toEqual([]);
  });
});

describe("собственные ресурсы архетипа", () => {
  it("Тень между вздохов стоит два очка ци, остальные варианты — одно", () => {
    const shadow = subclassResourceOptionsAt("classes-monk", "Путь тени", 3)[0];
    expect(shadow.cost).toBe(2);
    const burst = subclassResourceOptionsAt("classes-monk", "Путь четырёх стихий", 3)[0];
    expect(burst.cost).toBeUndefined();
  });

  it("варианты архетипа тратят ресурс, который у персонажа действительно есть", () => {
    for (const [classId, subclass] of GRANTED_ARCHETYPES) {
      const grants = subclassGrants(classId, subclass);
      const ownIds = (grants?.resources ?? []).map((r) => r.id);
      for (const option of grants?.resourceOptions ?? []) {
        const fromClass = characterResources(classId, subclass, PROGRESSION_MAX_LEVEL).map((r) => r.id);
        expect([...ownIds, ...fromClass]).toContain(option.resourceId);
      }
    }
  });
});

describe("заклинания домена", () => {
  it("открываются по уровню персонажа и накапливаются", () => {
    expect(subclassSpellsUpToLevel("classes-cleric", "Домен жизни", 1)).toEqual(["bless", "cure-wounds"]);
    expect(subclassSpellsUpToLevel("classes-cleric", "Домен жизни", 3)).toHaveLength(4);
    expect(subclassSpellsUpToLevel("classes-cleric", "Домен жизни", 5)).toHaveLength(6);
  });

  it("у архетипа без заклинаний домена список пуст", () => {
    expect(subclassSpellsUpToLevel("classes-fighter", "Воитель", 5)).toEqual([]);
  });

  /**
   * Заклинания клятвы Паладина идут тем же механизмом, что и домены Жреца, —
   * второго владельца у них нет. Строки таблицы «Заклинания клятвы
   * преданности» из `rules.json`: 3 уровень — защита от зла и добра, убежище;
   * 5 — малое восстановление, зона истины; 9 — маяк надежды, рассеивание магии.
   *
   * Отрицательная проба на вторую половину карточки: убери `spellsByLevel` у
   * Клятвы преданности — и она краснеет на каждом из трёх уровней.
   */
  it("заклинания клятвы паладина открываются по уровню тем же механизмом", () => {
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва преданности", 2)).toEqual([]);
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва преданности", 3)).toEqual([
      "protection-from-evil-and-good",
      "sanctuary",
    ]);
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва преданности", 5)).toEqual([
      "protection-from-evil-and-good",
      "sanctuary",
      "lesser-restoration",
      "zone-of-truth",
    ]);
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва преданности", 9)).toHaveLength(6);
  });

  /**
   * characters-oath-spells-for-original-oaths. Раньше здесь стоял сторож
   * «у древних и мести заклинаний нет вовсе»: он фиксировал не «так
   * правильно», а «так сейчас», и обязан был покраснеть, когда списки заведут.
   * Списки завели — владелец утвердил их 13.09.2026, — и сторож заменён на
   * проверку состава.
   *
   * Отрицательная проба: убери `spellsByLevel` у любой из двух клятв — она
   * краснеет на каждом из трёх уровней.
   */
  it("у оригинальных клятв заклинания открываются по уровню тем же механизмом", () => {
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва древних", 2)).toEqual([]);
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва древних", 3)).toEqual([
      "entangle",
      "speak-with-animals",
    ]);
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва древних", 5)).toEqual([
      "entangle",
      "speak-with-animals",
      "moonbeam",
      "barkskin",
    ]);
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва древних", 9)).toEqual([
      "entangle",
      "speak-with-animals",
      "moonbeam",
      "barkskin",
      "plant-growth",
      "protection-from-energy",
    ]);

    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва мести", 2)).toEqual([]);
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва мести", 3)).toEqual(["bane", "hunters-mark"]);
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва мести", 5)).toEqual([
      "bane",
      "hunters-mark",
      "hold-person",
      "misty-step",
    ]);
    expect(subclassSpellsUpToLevel("classes-paladin", "Клятва мести", 9)).toEqual([
      "bane",
      "hunters-mark",
      "hold-person",
      "misty-step",
      "haste",
      "fear",
    ]);
  });

  /**
   * Равенство клятв между собой — то, ради чего владелец задал ровно по три
   * пары. Проба сторожит не состав (он выше), а перекос: сними одну пару у
   * древних или добавь четвёртую мести — и краснеет она, а не проба состава.
   * Считается по каждому уровню отдельно, иначе перенос пары с 5 на 9 прошёл
   * бы незамеченным.
   */
  it("три клятвы паладина равны по числу клятвенных заклинаний на каждом уровне", () => {
    const oaths = ["Клятва преданности", "Клятва древних", "Клятва мести"];
    for (const [level, expected] of [
      [2, 0],
      [3, 2],
      [5, 4],
      [9, 6],
    ] as const) {
      const counts = oaths.map((oath) => subclassSpellsUpToLevel("classes-paladin", oath, level).length);
      expect(counts, `уровень ${level}`).toEqual([expected, expected, expected]);
    }
    // Ни одно заклинание клятвы не повторяется у двух клятв сразу.
    const all = oaths.flatMap((oath) => subclassSpellsUpToLevel("classes-paladin", oath, 9));
    expect(new Set(all).size).toBe(18);
  });
});

describe("parseItemWeightLb", () => {
  it("parses a whole-number weight string", () => {
    expect(parseItemWeightLb("10 фнт.")).toBe(10);
  });

  it("parses a fractional weight string", () => {
    expect(parseItemWeightLb("1/4 фнт.")).toBe(0.25);
  });

  it("treats a dash (no weight in SRD) as 0", () => {
    expect(parseItemWeightLb("—")).toBe(0);
  });
});

describe("catalogWeightLb", () => {
  it("finds the weight of a known catalog item by name", () => {
    expect(catalogWeightLb("Кольчуга")).toBe(55); // ARMOR, rules.json → equipment-armor
  });

  it("returns 0 for a name not in the catalog (freely typed item)", () => {
    expect(catalogWeightLb("Выдуманный артефакт")).toBe(0);
  });
});

describe("carryingCapacityLb", () => {
  it("is Сила × 15 (SRD 5.1 base rule, rules.json → gameplay-abilities)", () => {
    expect(carryingCapacityLb(10)).toBe(150);
  });
});

describe("encumbranceLevel (свои пороги, не книжные — characters-encumbrance-own-thresholds)", () => {
  // Сила 10 -> грузоподъёмность 150 фнт, «Нагружен» с 135 фнт, «Сильно нагружен» — свыше 150.
  it("до 90 % грузоподъёмности нагрузки нет", () => {
    expect(encumbranceLevel(134, 10)).toBe("normal");
    expect(encumbranceLevel(134.9, 10)).toBe("normal");
  });

  it("ровно 90 % (135 фнт) — уже «Нагружен»", () => {
    expect(encumbranceLevel(135, 10)).toBe("encumbered");
  });

  it("ровно на потолке (150 фнт) — ещё «Нагружен», не «Сильно нагружен»", () => {
    expect(encumbranceLevel(150, 10)).toBe("encumbered");
  });

  it("фунт сверх потолка (151 фнт) — «Сильно нагружен»", () => {
    expect(encumbranceLevel(151, 10)).toBe("heavily-encumbered");
  });

  it("штрафы наступают на тех же порогах, что и плашки (−10 / −20)", () => {
    expect(encumbranceSpeedPenaltyFeet(encumbranceLevel(134, 10))).toBe(0);
    expect(encumbranceSpeedPenaltyFeet(encumbranceLevel(135, 10))).toBe(10);
    expect(encumbranceSpeedPenaltyFeet(encumbranceLevel(151, 10))).toBe(20);
  });

  // Случай владельца, ради которого пороги и переехали: готовый «Дарин Светоч», Сила 15
  // (грузоподъёмность 225 фнт), снаряжение с листа ~94 фнт — по книжным порогам это был
  // «Нагружен» с 75 фнт, то есть плашка на свежесобранном персонаже.
  it("жрец дварф (Сила 15) с 94 фнт снаряжения не нагружен, хотя по книжным порогам был бы", () => {
    expect(carryingCapacityLb(15)).toBe(225);
    expect(encumbranceLevel(94, 15)).toBe("normal");
    expect(encumbranceSpeedPenaltyFeet(encumbranceLevel(94, 15))).toBe(0);
  });

  it("пороги считаются от грузоподъёмности: 90 % от 225 — это 202.5 фнт", () => {
    expect(encumbranceLevel(202, 15)).toBe("normal");
    expect(encumbranceLevel(202.5, 15)).toBe("encumbered");
    expect(encumbranceLevel(225, 15)).toBe("encumbered");
    expect(encumbranceLevel(225.5, 15)).toBe("heavily-encumbered");
  });
});

describe("inventoryWeightLb + coinsWeightLb (characters-carrying-capacity acceptance criteria)", () => {
  it("sums weight × quantity across the inventory", () => {
    const inventory = [
      { weightLb: 55, quantity: 1 }, // Кольчуга
      { weightLb: 1, quantity: 5 }, // 5 факелов
    ];
    expect(inventoryWeightLb(inventory)).toBe(60);
  });

  it("100 медных монет весят 2 фунта (курс 50 монет/фунт)", () => {
    expect(coinsWeightLb({ ...emptyCoins(), copper: 100 })).toBe(2);
  });

  it("combined item + coin weight matches a known total", () => {
    const inventory = [{ weightLb: 55, quantity: 1 }];
    const coins = { ...emptyCoins(), copper: 100 };
    expect(inventoryWeightLb(inventory) + coinsWeightLb(coins)).toBe(57);
  });
});

describe("CLASS_LEVEL_FEATURES на уровнях 6-12", () => {
  const ALL_CLASS_IDS = Object.keys(CLASS_PROGRESSION);

  it("заведена по каждому классу на каждый уровень до потолка — пустой список это «—», а не дыра", () => {
    for (const classId of ALL_CLASS_IDS) {
      const byLevel = CLASS_LEVEL_FEATURES[classId];
      expect(byLevel, classId).toBeDefined();
      for (let level = 2; level <= PROGRESSION_MAX_LEVEL; level++) {
        expect(byLevel[level], `${classId} ур. ${level}`).toBeDefined();
        expect(Array.isArray(byLevel[level]), `${classId} ур. ${level}`).toBe(true);
      }
    }
  });

  it("не заводит особенностей выше потолка уровня", () => {
    for (const classId of ALL_CLASS_IDS) {
      for (const key of Object.keys(CLASS_LEVEL_FEATURES[classId])) {
        expect(Number(key), `${classId}: уровень ${key}`).toBeLessThanOrEqual(PROGRESSION_MAX_LEVEL);
      }
    }
  });

  it("называет особенности 6-12 уровня именами из rules.json", () => {
    const nameAt = (classId: string, level: number) =>
      CLASS_LEVEL_FEATURES[classId][level].map((f) => f.name);

    expect(nameAt("classes-bard", 6)).toEqual(["Контрочарование"]);
    expect(nameAt("classes-bard", 10)).toEqual(["Экспертиза", "Вдохновение барда (к10)", "Магические секреты"]);
    expect(nameAt("classes-barbarian", 7)).toEqual(["Дикий инстинкт"]);
    expect(nameAt("classes-barbarian", 11)).toEqual(["Неукротимая ярость"]);
    expect(nameAt("classes-fighter", 9)).toEqual(["Неукротимый"]);
    expect(nameAt("classes-fighter", 11)).toEqual(["Дополнительная атака (2)"]);
    expect(nameAt("classes-cleric", 10)).toEqual(["Божественное вмешательство"]);
    expect(nameAt("classes-warlock", 11)).toEqual(["Таинственный арканум (6 круг)"]);
    expect(nameAt("classes-monk", 7)).toEqual(["Изворотливость", "Спокойствие разума"]);
    expect(nameAt("classes-paladin", 6)).toEqual(["Аура защиты"]);
    expect(nameAt("classes-rogue", 11)).toEqual(["Надёжный талант"]);
    expect(nameAt("classes-ranger", 8)).toEqual(["Тропами земли"]);
    expect(nameAt("classes-sorcerer", 10)).toEqual(["Метамагия"]);
    // Волшебник и Друид в этом диапазоне почти ничего не получают по таблице —
    // у Волшебника только архетип и ASI, у Друида ещё улучшение Дикого облика.
    expect(nameAt("classes-wizard", 6)).toEqual([]);
    expect(nameAt("classes-wizard", 11)).toEqual([]);
    expect(nameAt("classes-druid", 8)).toEqual(["Улучшение дикой формы"]);
  });

  it("даёт каждой особенности непустое описание", () => {
    for (const classId of ALL_CLASS_IDS) {
      for (let level = 6; level <= PROGRESSION_MAX_LEVEL; level++) {
        for (const feature of CLASS_LEVEL_FEATURES[classId][level]) {
          expect(feature.name.trim().length, `${classId} ур. ${level}`).toBeGreaterThan(0);
          expect(feature.description.trim().length, `${classId} ур. ${level}: ${feature.name}`).toBeGreaterThan(40);
        }
      }
    }
  });
});

describe("Особенности архетипов на уровнях 6-12", () => {
  /**
   * Уровни, на которых класс получает особенность архетипа, — столбец
   * «Умения» таблиц классов SRD, срезанный нынешним потолком 12. Именно по
   * ним и проверяется, что ни один архетип не остался пустым: у всех
   * архетипов одного класса особенности приходят на одних уровнях, каким бы
   * ни было их содержание.
   */
  const ARCHETYPE_LEVELS: Record<string, number[]> = {
    "classes-bard": [6],
    "classes-barbarian": [6, 10],
    "classes-cleric": [6, 8],
    "classes-druid": [6, 10],
    "classes-fighter": [7, 10],
    "classes-monk": [6, 11],
    "classes-paladin": [7],
    "classes-ranger": [7, 11],
    "classes-rogue": [9],
    "classes-sorcerer": [6],
    "classes-warlock": [6, 10],
    "classes-wizard": [6, 10],
  };

  it("покрывает каждый архетип каждого класса — и SRD-шный, и оба оригинальных", () => {
    for (const [classId, info] of Object.entries(CLASS_SUBCLASSES)) {
      const want = ARCHETYPE_LEVELS[classId];
      expect(want, `нет списка уровней для ${classId}`).toBeDefined();
      for (const subclass of info.subclasses) {
        const have = Object.keys(subclass.featuresByLevel).map(Number);
        for (const level of want) {
          const feats = subclass.featuresByLevel[level];
          expect(feats, `${classId} / ${subclass.name}: нет уровня ${level}`).toBeDefined();
          expect(feats.length, `${classId} / ${subclass.name} ур. ${level}: пусто`).toBeGreaterThan(0);
        }
        // Особенности выше потолка — это данные, которые никто не покажет.
        for (const level of have) {
          expect(level, `${classId} / ${subclass.name}: уровень ${level} выше потолка`).toBeLessThanOrEqual(
            PROGRESSION_MAX_LEVEL,
          );
        }
      }
    }
  });

  it("даёт каждой особенности архетипа 6-12 уровня непустое описание", () => {
    for (const [classId, info] of Object.entries(CLASS_SUBCLASSES)) {
      for (const subclass of info.subclasses) {
        for (const [level, feats] of Object.entries(subclass.featuresByLevel)) {
          if (Number(level) < 6) continue;
          for (const feature of feats) {
            const where = `${classId} / ${subclass.name} ур. ${level}: ${feature.name}`;
            expect(feature.name.trim().length, where).toBeGreaterThan(0);
            expect(feature.description.trim().length, where).toBeGreaterThan(40);
          }
        }
      }
    }
  });

  it("не ссылается на заклинания, которых нет в комплекте", () => {
    const bundled = new Set((bundledSpells as { id: string }[]).map((s) => s.id));
    function check(grants: SubclassGrants | undefined, where: string) {
      if (!grants) return;
      for (const [level, ids] of Object.entries(grants.spellsByLevel ?? {})) {
        for (const id of ids) expect(bundled.has(id), `${where} ур. ${level}: нет заклинания ${id}`).toBe(true);
      }
      for (const choice of grants.choices ?? []) {
        for (const option of choice.options) check(option.grants, `${where} / ${option.id}`);
      }
    }
    for (const [classId, info] of Object.entries(CLASS_SUBCLASSES)) {
      for (const subclass of info.subclasses) check(subclass.grants, `${classId} / ${subclass.name}`);
    }
  });
});

/**
 * characters-archetypes-6-12-mechanics-fixes — приёмка карточки: блок 2
 * отчёта original-archetypes-6-12-review. Каждая проба сторожит ОДНУ
 * позицию и краснеет при её откате, а не общий снимок данных: за снимок
 * отвечают пробы выше, и на подмену эффекта они не реагируют.
 */
describe("механика архетипов 6-12 уровней", () => {
  const abilities = { ...emptyAbilityScores(), wisdom: 16, charisma: 16 };

  function scalingNamed(classId: string, subclass: string, level: number, name: string) {
    return subclassScalingAt(classId, subclass, level).find((s) => s.name === name);
  }
  function ownResource(classId: string, subclass: string, id: string) {
    return subclassGrants(classId, subclass)?.resources?.find((r) => r.id === id);
  }

  // Позиция 1: текст обещал временные хиты самому жрецу, а temp-hp-allies по
  // построению считает только союзников — своё число жрец на листе не видел.
  it("Знамя стойкости даёт жрецу СВОИ временные хиты, а не только союзничьи", () => {
    const banner = scalingNamed("classes-cleric", "Домен войны", 6, "Знамя стойкости");
    expect(banner?.effect).toEqual({ kind: "temp-hp-self", perLevel: 1 });
    expect(subclassEffectValue(banner!.effect, { classId: "classes-cleric", abilities, level: 6 })).toEqual({
      label: "временных хитов",
      value: 6,
    });
    // «Боевой клич» остаётся владельцем союзничьего числа — это разные факты.
    const cry = subclassResourceOptionsAt("classes-cleric", "Домен войны", 6).find((o) => o.id === "battle-cry")!;
    expect(cry.effect).toEqual({ kind: "temp-hp-allies", perLevel: 1 });
  });

  it("до 6 уровня Знамени стойкости на листе нет", () => {
    expect(scalingNamed("classes-cleric", "Домен войны", 5, "Знамя стойкости")).toBeUndefined();
  });

  // Позиция 4: «модификатор Мудрости к урону заговора» не выражал ни один вид
  // эффекта — число было мёртвым текстом.
  it("Мощное заклинательство даёт кость урона, а не мёртвый модификатор Мудрости", () => {
    const mighty = scalingNamed("classes-cleric", "Домен прозрения", 8, "Мощное заклинательство");
    expect(subclassEffectValue(mighty!.effect, { classId: "classes-cleric", abilities, level: 8 })).toEqual({
      label: "дополнительного урона",
      value: "1к8",
    });
  });

  // Позиция 10б: урон громом «= модификатор Харизмы» был помечен descriptive,
  // то есть движок его не считал вовсе.
  it("Око бури даёт кость урона громом, а не descriptive", () => {
    const eye = subclassResourceOptionsAt("classes-sorcerer", "Происхождение от бури", 6).find(
      (o) => o.id === "eye-of-the-storm",
    )!;
    expect(eye.effect).toEqual({ kind: "bonus-damage-dice", count: 1, die: 6 });
    expect(subclassEffectValue(eye.effect, { classId: "classes-sorcerer", abilities, level: 6 })?.value).toBe("1к6");
  });

  // Позиция 5: «однажды между отдыхами» было написано, а счётчика не было —
  // в отличие от соседей по классу.
  it("Милость двора имеет счётчик той же формы, что у соседних покровителей", () => {
    expect(ownResource("classes-warlock", "Покровитель-Архифея", "courts-favor")).toEqual({
      id: "courts-favor",
      name: "Милость двора",
      max: 1,
      recharge: "short",
      unit: "использование",
    });
    expect(ownResource("classes-warlock", "Покровитель-Древний Ужас", "echoed-whisper")?.recharge).toBe("short");
  });

  // Позиция 16: безусловный детектор лжи заменён спасброском; владелец просил
  // оба числа перед глазами — счётчик и сама СЛ.
  it("Слух повсюду имеет счётчик на короткий отдых и показывает СЛ заклинаний барда", () => {
    expect(ownResource("classes-bard", "Коллегия шёпота", "ears-everywhere")?.recharge).toBe("short");
    const ears = scalingNamed("classes-bard", "Коллегия шёпота", 6, "Слух повсюду");
    expect(ears?.effect).toEqual({ kind: "saving-throw", against: "charisma" });
    // Бард 6 уровня с Харизмой 16: 8 + 3 бонуса мастерства + 3 модификатора.
    expect(spellSaveDc("classes-bard", abilities, 6)).toBe(14);
    expect(subclassEffectValue(ears!.effect, { classId: "classes-bard", abilities, level: 6 })).toEqual({
      label: "СЛ спасброска (Харизма)",
      value: 14,
    });
  });

  // Позиция 22: весь архетип живёт на 2 очках, не растущих с 3 по 12 уровень,
  // и два умения делят их между собой.
  it("Очки мистической энергии возвращаются коротким отдыхом", () => {
    expect(ownResource("classes-fighter", "Мистический рыцарь", "arcane-charge")).toMatchObject({
      max: 2,
      recharge: "short",
    });
  });

  // Позиция 19б: «одну потраченную кость за короткий отдых» не выражается
  // ничем — recharge знает только short/long. Владелец выбрал полный short,
  // зная, что выдача растёт с 4 за день до 4 за каждый короткий отдых.
  it("Знание поля возвращает кости превосходства за короткий отдых", () => {
    expect(ownResource("classes-fighter", "Мастер боя", "superiority-dice")).toMatchObject({
      max: 4,
      recharge: "short",
    });
  });

  // Позиция 20 после решения владельца: дешевеет БРОСОК, а не цена. Цена в две
  // кости — то, что держит выдачу манёвров от перемножения с коротким отдыхом
  // у костей превосходства (проба на него — соседняя, «Знание поля»): при цене
  // в одну кость двойной манёвр удваивал бы каждую кость, а при цене в две он
  // по числу манёвров нейтрален, и вся выгода приёма — один бросок на оба.
  it("Двойной манёвр стоит две кости, но бросок на оба — один", () => {
    const double = subclassResourceOptionsAt("classes-fighter", "Мастер боя", 10).find(
      (o) => o.id === "maneuver-double",
    )!;
    expect(double.cost).toBe(2);
    // Одиночный манёвр тратит одну кость (cost по умолчанию) — значит двойной
    // стоит ровно столько же, сколько два манёвра порознь.
    const single = subclassResourceOptionsAt("classes-fighter", "Мастер боя", 10).find(
      (o) => o.id === "maneuver-precision",
    )!;
    expect(single.cost ?? 1).toBe(1);
    expect(double.cost).toBe(2 * (single.cost ?? 1));
    // Кость эффекта одна — её бросок идёт в оба манёвра сразу.
    expect(double.effect).toEqual({ kind: "bonus-dice", count: 1, die: 8 });
    expect(subclassResourceOptionsAt("classes-fighter", "Мастер боя", 9).map((o) => o.id)).not.toContain(
      "maneuver-double",
    );
  });

  // Позиция 23: перемещение остаётся бесплатным, преимущество — за очко ци.
  it("преимущество Шага сквозь тень стоит очко ци, а само перемещение бесплатно", () => {
    const step = subclassResourceOptionsAt("classes-monk", "Путь тени", 6).find(
      (o) => o.id === "shadow-step-advantage",
    )!;
    expect(step.cost).toBe(1);
    expect(subclassResourceOptionsAt("classes-monk", "Путь тени", 5).map((o) => o.id)).not.toContain(
      "shadow-step-advantage",
    );
  });

  // Позиция Д: подпись на экране — «СЛ спасброска», значит и в текстах «СЛ».
  it("в текстах особенностей и заклинаний нет написания «Сл»", () => {
    const wrong = /(?<![А-Яа-яЁё])Сл(?![а-яё])/;
    for (const info of Object.values(CLASS_SUBCLASSES)) {
      for (const subclass of info.subclasses) {
        for (const features of Object.values(subclass.featuresByLevel)) {
          for (const f of features) expect(f.description, `${subclass.name} / ${f.name}`).not.toMatch(wrong);
        }
      }
    }
    for (const spell of bundledSpells as { name: string; description: string }[]) {
      expect(spell.description, spell.name).not.toMatch(wrong);
    }
  });
});
