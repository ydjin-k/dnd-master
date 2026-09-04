import { describe, it, expect } from "vitest";
import {
  armorProficienciesFor,
  carryingCapacityLb,
  catalogWeightLb,
  CLASS_PROFICIENCIES,
  CLASS_SUBCLASSES,
  coinsWeightLb,
  computeArmorClass,
  healingPoolSelfHeal,
  inventoryWeightLb,
  parseItemWeightLb,
  spellSaveDc,
  subclassEffectValue,
  subclassGrants,
  subclassResourceOptionsAt,
  subclassScalingAt,
  subclassSpellsUpToLevel,
  toolProficienciesFor,
  unproficientArmorIssue,
  weaponAttackFor,
  weaponProficienciesFor,
  WEAPONS,
} from "./characterCreationData";
import { characterResources, PROGRESSION_MAX_LEVEL } from "./classProgression";
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

  it.each(ALL_12_CLASSES)("%s has exactly 3 subclasses (1 SRD + 2 original), all with distinct non-empty names", (classId) => {
    const info = CLASS_SUBCLASSES[classId];
    expect(info.subclasses).toHaveLength(3);
    const names = info.subclasses.map((s) => s.name);
    expect(new Set(names).size).toBe(3);
    for (const name of names) expect(name.trim().length).toBeGreaterThan(0);
  });

  it("the 2 original subclasses of every class carry a description and at least one feature at chosenAtLevel", () => {
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
];

describe("механика архетипов", () => {
  it.each(GRANTED_ARCHETYPES)("%s / %s даёт %s", (classId, subclass, key) => {
    expect(subclassGrants(classId, subclass)?.[key]).toBeDefined();
  });

  it("архетип, до которого карточка не дошла, механики не получил", () => {
    // Добыча охотника — выбор одного из трёх умений, для него нужен свой UI;
    // проба краснеет, когда выбор появится, и тогда строка отсюда уходит.
    expect(subclassGrants("classes-ranger", "Охотник")).toBeUndefined();
  });

  it("без архетипа грантов нет вовсе", () => {
    expect(subclassGrants("classes-fighter", null)).toBeUndefined();
    expect(subclassGrants(null, "Воитель")).toBeUndefined();
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
