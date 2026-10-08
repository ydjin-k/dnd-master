import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleBlock, RuleTopic } from "../state/types";
import {
  BLOOD_CURSES,
  BLOOD_CURSES_CHOICE_ID,
  BLOOD_CURSES_KNOWN_STEPS,
  BLOOD_CURSE_RESOURCE_ID,
  BLOOD_HUNTER_FIGHTING_STYLE_NAMES,
  BLOOD_HUNTER_ID,
  BLOOD_HUNTER_TITLE,
  BLOOD_HUNTER_TOPIC,
  BRAND_OF_CASTIGATION_RESOURCE_ID,
} from "./bloodHunterClass";
import {
  ALL_ITEMS_WITH_COST,
  ALL_SKILLS,
  ARMOR_STATS,
  CLASS_EQUIPMENT,
  CLASS_LEVEL_FEATURES,
  CLASS_PROFICIENCIES,
  CLASS_CHOICES,
  CLASS_SUBCLASSES,
  classChoiceKnownAt,
  classChoicesFor,
  fightingStyleByName,
  fightingStyleChoiceFor,
  subclassGrants,
  FIGHTER_FIGHTING_STYLES,
  armorProficienciesFor,
  computeArmorClass,
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
  progressionAt,
  resourceMax,
  slotRechargeOf,
} from "./classProgression";
import { isOwnRuleTopic, playableClasses } from "./ownRuleTopics";
import { emptyAbilityScores } from "../state/types";

const srdTopics = bundledRules as unknown as RuleTopic[];
const topic = playableClasses(srdTopics).find((t) => t.id === BLOOD_HUNTER_ID);

/** Абзацы статьи одной строкой — по ним проверяется, что в текст доехали числа PDF. */
function paragraphs(blocks: readonly RuleBlock[]): string {
  return blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : [])).join("\n");
}

describe("Кровавый охотник — наш класс в справочнике", () => {
  it("стоит в playableClasses со своей категорией и своим названием, без задвоения", () => {
    const classes = playableClasses(srdTopics);

    expect(topic).toBeDefined();
    expect(topic!.title).toBe(BLOOD_HUNTER_TITLE);
    expect(topic!.category).toBe("classes");
    expect(isOwnRuleTopic(topic)).toBe(true);
    expect(classes.filter((t) => t.id === BLOOD_HUNTER_ID)).toHaveLength(1);
    // Наш класс идёт ПОСЛЕ классов справочника — порядок списка значащий.
    expect(classes[classes.length - 1]!.id).toBe(BLOOD_HUNTER_ID);
  });

  it("в rules.json его нет — ни по id, ни по названию", () => {
    // Граница проекта: всё, что пришло из rules.json, подписано как SRD 5.1.
    expect(srdTopics.some((t) => t.id === BLOOD_HUNTER_ID)).toBe(false);
    expect(srdTopics.some((t) => t.title === BLOOD_HUNTER_TITLE)).toBe(false);
    expect(BLOOD_HUNTER_TOPIC.sourceUrl).toBe("");
  });

  /**
   * Сердце модуля. Кость хитов читается ИЗ ТЕКСТА статьи, а не из поля (см.
   * `parseHitDie`), и без правильного оборота абзаца класс молча получил бы
   * кость по умолчанию и разошёлся бы с собственным описанием. Числа здесь —
   * с. 3 PDF владельца («Кость хитов: 1к10», «1к10 (или 6)»), а не повтор
   * константы кода: в модуле их вообще нет числом, только текстом.
   */
  it("кость хитов 1к10 и среднее 6 вычитываются из статьи тем же разбором, что у SRD-классов", () => {
    expect(parseHitDie(topic)).toBe(10);
    expect(parseHitDieAverage(topic)).toBe(6);
  });

  it("кость хитов доезжает до максимума хитов и до левел-апа", () => {
    const max = parseHitDie(topic)!;
    const average = parseHitDieAverage(topic)!;

    // 1 уровень: максимум кости + модификатор Телосложения (здесь +2).
    expect(maxHpForLevel(max, average, 2, 0, 1)).toBe(12);
    // 2 уровень: плюс среднее кости и тот же модификатор.
    expect(maxHpForLevel(max, average, 2, 0, 2)).toBe(20);
    // 6 уровень из критериев тестирования карточки.
    expect(maxHpForLevel(max, average, 2, 0, 6)).toBe(52);
  });

  it("шапка класса, которую мастер показывает на шаге «Класс», несёт числа выбора и не несёт таблицы уровней", () => {
    // Тот же срез, что в CharacterWizard: до первого списка включительно.
    const listIndex = BLOOD_HUNTER_TOPIC.blocks.findIndex((b) => b.type === "list");
    expect(listIndex).toBeGreaterThan(0);
    const intro = BLOOD_HUNTER_TOPIC.blocks.slice(0, listIndex + 1);
    const text = paragraphs(intro);

    for (const opener of ["Кость хитов:", "Спасброски:", "Навыки:", "Владение инструментами:"]) {
      expect(text.includes(opener), `в шапке нет «${opener}»`).toBe(true);
    }
    expect(intro.some((b) => b.type === "table")).toBe(false);
  });

  it("таблица уровней в статье идёт до 12 уровня и ни строкой дальше", () => {
    const table = BLOOD_HUNTER_TOPIC.blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    const rows = (table as Extract<RuleBlock, { type: "table" }>).rows;
    const levels = rows.slice(1).map((r) => Number(r[0]));

    expect(levels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(Math.max(...levels)).toBeLessThanOrEqual(PROGRESSION_MAX_LEVEL);
  });

  it("боевые стили класса — четыре из шести, и каждый есть в общем списке стилей", () => {
    // Список PDF (с. 5) уже нашего: «Обороны» и «Защиты» у класса нет, поэтому
    // правило «+1 КД в доспехе» кровавого охотника не касается вовсе.
    expect(BLOOD_HUNTER_FIGHTING_STYLE_NAMES).toHaveLength(4);
    for (const name of BLOOD_HUNTER_FIGHTING_STYLE_NAMES) {
      expect(FIGHTER_FIGHTING_STYLES.some((s) => s.name === name), `нет стиля «${name}»`).toBe(true);
    }
    expect([...BLOOD_HUNTER_FIGHTING_STYLE_NAMES]).not.toContain("Оборона");
    expect([...BLOOD_HUNTER_FIGHTING_STYLE_NAMES]).not.toContain("Защита");
  });
});

/**
 * Боевой стиль существующим полем `Character.fightingStyle` — второго поля
 * класс не завёл. Отличий от Воина два, и оба живут данными, а не ветками в
 * коде: уровень выбора (2 против 1) и состав стилей (4 из 6).
 */
describe("Кровавый охотник — боевой стиль", () => {
  it("выбирается на 2 уровне, а не на 1, — и у Воина при этом по-прежнему на 1", () => {
    expect(fightingStyleChoiceFor(BLOOD_HUNTER_ID)?.level).toBe(2);
    expect(fightingStyleChoiceFor("classes-fighter")?.level).toBe(1);
  });

  it("четыре стиля с. 5 PDF, и их текст принадлежит общему списку, а не копии", () => {
    const styles = fightingStyleChoiceFor(BLOOD_HUNTER_ID)!.styles;

    expect(styles.map((s) => s.name)).toEqual([
      "Дуэлянт",
      "Сражение большим оружием",
      "Сражение двумя оружиями",
      "Стрельба из лука",
    ]);
    // Те же объекты, что в общем списке: копии текста нет.
    for (const style of styles) expect(FIGHTER_FIGHTING_STYLES).toContain(style);
    expect(fightingStyleChoiceFor("classes-fighter")!.styles).toHaveLength(6);
  });

  it("«Обороны» у класса нет, поэтому прибавки +1 к КД он не получает ни при каком стиле", () => {
    const styles = fightingStyleChoiceFor(BLOOD_HUNTER_ID)!.styles.map((s) => s.name);
    expect(styles).not.toContain("Оборона");

    // Доспех тот же, стиль «Оборона» в поле всё же стоит (чужой или ручная
    // правка) — КД класса от этого не меняется: правило привязано к Воину.
    const abilities = emptyAbilityScores();
    const inventory = ["Проклёпанная кожа"];
    expect(
      computeArmorClass({ classId: BLOOD_HUNTER_ID, abilities, inventoryItemNames: inventory, fightingStyle: "Оборона" }),
    ).toBe(computeArmorClass({ classId: BLOOD_HUNTER_ID, abilities, inventoryItemNames: inventory }));
  });

  it("текст выбранного стиля лист берёт у единственного владельца", () => {
    expect(fightingStyleByName("Дуэлянт")?.description).toBe(
      FIGHTER_FIGHTING_STYLES.find((s) => s.name === "Дуэлянт")!.description,
    );
    expect(fightingStyleByName("")).toBeUndefined();
    expect(fightingStyleByName("Выдуманный стиль")).toBeUndefined();
  });
});

describe("Кровавый охотник — карта владений и спасбросков", () => {
  const prof = CLASS_PROFICIENCIES[BLOOD_HUNTER_ID];

  it("спасброски, навыки и владения — числа с. 3-4 PDF", () => {
    expect(prof.savingThrowLabels).toEqual(["Ловкость", "Интеллект"]);
    expect(prof.savingThrows).toEqual(["dexterity", "intelligence"]);
    expect(prof.skillCount).toBe(3);
    expect(prof.skillOptions).toEqual([
      "Акробатика",
      "Атлетика",
      "Выживание",
      "История",
      "Магия",
      "Проницательность",
      "Расследование",
      "Религия",
    ]);
    expect(armorProficienciesFor(BLOOD_HUNTER_ID, null)).toEqual(["light", "medium", "shields"]);
    expect(weaponProficienciesFor(BLOOD_HUNTER_ID, null)).toEqual(["simple", "martial"]);
  });

  /**
   * Инструменты алхимика — первое в приложении БЕЗУСЛОВНОЕ классовое владение
   * инструментами: раньше `toolProficienciesFor` знала только про архетипы.
   * Проба сторожит оба конца: класс свои инструменты отдаёт, а двенадцать
   * SRD-классов от правки не получили ничего нового.
   */
  it("инструменты алхимика приходят от самого класса, а не от архетипа", () => {
    expect(toolProficienciesFor(BLOOD_HUNTER_ID, null)).toEqual(["Инструменты алхимика"]);
    expect(toolProficienciesFor("classes-fighter", null)).toEqual([]);
    expect(toolProficienciesFor("classes-rogue", "Вор")).toEqual(["Воровские инструменты"]);
  });

  it("каждый навык класса есть в общем списке навыков приложения", () => {
    // Опечатка в названии навыка не поймалась бы иначе: шаг мастера просто
    // показал бы чекбокс, который ничего не даёт листу.
    for (const skill of prof.skillOptions) {
      expect(ALL_SKILLS.includes(skill), `навыка «${skill}» нет в ALL_SKILLS`).toBe(true);
    }
  });
});

describe("Кровавый охотник — стартовое снаряжение", () => {
  const slots = CLASS_EQUIPMENT[BLOOD_HUNTER_ID];

  it("четыре слота выбора по с. 4 PDF", () => {
    expect(slots).toHaveLength(4);
    expect(slots[0].options.map((o) => o.label)).toEqual(["Воинское оружие", "Два простых оружия"]);
    expect(slots[2].options.map((o) => o.label)).toEqual(["Проклёпанная кожа", "Чешуйчатый доспех"]);
  });

  /**
   * Опечатка в названии предмета не ломает ни сборку, ни типы: мастер положит
   * в инвентарь строку, которой нет в каталоге, — без веса, без КД и без
   * характеристик оружия. Поэтому каждый предмет обязан быть узнаваемым.
   *
   * ЧЕТВЁРТАЯ ВЕТКА — не поддавка, а честное описание текущего состояния:
   * снаряжённых наборов SRD («Набор путешественника» и соседи) в каталоге
   * `ALL_ITEMS_WITH_COST` нет вовсе, и ими пользуются все двенадцать
   * SRD-классов. Пока этот пробел не закрыт чужой карточкой, требование к
   * нашему классу то же, что к ним: либо предмет узнаётся, либо он написан
   * ровно той же строкой, что уже стоит у SRD-класса, — своих новых
   * непонятных названий класс не вносит.
   */
  it("каждый предмет узнаётся каталогом, выбором или уже стоит у SRD-класса", () => {
    const srdItems = new Set(
      Object.entries(CLASS_EQUIPMENT)
        .filter(([classId]) => classId !== BLOOD_HUNTER_ID)
        .flatMap(([, srdSlots]) => srdSlots.flatMap((s) => s.options.flatMap((o) => o.items))),
    );

    for (const slot of slots) {
      for (const option of slot.options) {
        for (const item of option.items) {
          const known =
            ALL_ITEMS_WITH_COST.some((i) => i.name === item) ||
            !!equipmentChoiceFor(item) ||
            /^(.+) ×\d+$/.test(item) ||
            srdItems.has(item);
          expect(known, `предмет «${item}» не узнан ни каталогом, ни выбором, ни SRD-классом`).toBe(true);
        }
      }
    }
  });

  /**
   * Отдельная проба на то, что общий пробел с наборами не прикрыл настоящую
   * опечатку: арбалет и доспехи класса обязаны лежать в каталоге ПОИМЁННО.
   * Четыре SRD-класса пишут в этом же слоте «Лёгкий арбалет», которого в
   * каталоге нет (там «Арбалет, лёгкий»), — повторять за ними этот промах
   * класс не должен.
   */
  it("арбалет и оба доспеха класса названы так, как они лежат в каталоге", () => {
    for (const name of ["Арбалет, лёгкий", "Проклёпанная кожа", "Чешуйчатый доспех"]) {
      const used = slots.some((s) => s.options.some((o) => o.items.includes(name)));
      expect(used, `класс не использует «${name}»`).toBe(true);
      expect(ALL_ITEMS_WITH_COST.some((i) => i.name === name), `«${name}» нет в каталоге`).toBe(true);
    }
  });

  it("оба доспеха класса дают КД — имена взяты из таблицы доспехов, а не из PDF", () => {
    // В PDF это «проклёпанный кожаный доспех»; в приложении доспех называется
    // «Проклёпанная кожа», и лист считает КД по этому имени.
    expect(ARMOR_STATS["Проклёпанная кожа"]).toEqual({ baseAc: 12, category: "light" });
    expect(ARMOR_STATS["Чешуйчатый доспех"]).toBeDefined();
  });
});

describe("Кровавый охотник — особенности по уровням", () => {
  const byLevel = CLASS_LEVEL_FEATURES[BLOOD_HUNTER_ID];

  it("заведена на каждый уровень 2-12: пустой список это «—» таблицы, а не дыра", () => {
    for (let level = 2; level <= PROGRESSION_MAX_LEVEL; level++) {
      expect(Array.isArray(byLevel[level]), `ур. ${level}`).toBe(true);
    }
    for (const key of Object.keys(byLevel)) {
      expect(Number(key)).toBeLessThanOrEqual(PROGRESSION_MAX_LEVEL);
    }
  });

  it("имена особенностей стоят на уровнях таблицы с. 2 PDF", () => {
    const nameAt = (level: number) => byLevel[level].map((f) => f.name);

    expect(nameAt(2)).toEqual(["Боевой стиль", "Алый обряд"]);
    expect(nameAt(5)).toEqual(["Дополнительная атака"]);
    expect(nameAt(6)).toEqual(["Клеймо наказания", "Проклятая кровь (2/отдых)"]);
    expect(nameAt(7)).toEqual(["Улучшение Алого обряда"]);
    expect(nameAt(9)).toEqual(["Мрачная психометрия"]);
    expect(nameAt(10)).toEqual(["Тёмное усиление"]);
    // Орден (3, 11) принадлежит архетипу, Увеличение характеристик (4, 8, 12) —
    // отдельной механике: в этой таблице их быть не должно.
    expect(nameAt(3)).toEqual([]);
    expect(nameAt(4)).toEqual([]);
    expect(nameAt(8)).toEqual([]);
    expect(nameAt(11)).toEqual([]);
    expect(nameAt(12)).toEqual([]);
  });
});

/**
 * Таблица уровней класса числами — те же столбцы, что в статье справочника, но
 * здесь их читает механика. Ожидания ниже выписаны по с. 2 PDF владельца
 * построчно и НЕ повторяют за кодом ни ступеней `byStep`, ни их границ: код
 * задаёт ступени «с какого уровня», проба перечисляет все двенадцать уровней.
 * Сдвинь границу на уровень — и проба покраснеет на конкретном уровне.
 */
describe("Кровавый охотник — таблица прогрессии 1-12", () => {
  const at = (level: number) => progressionAt(BLOOD_HUNTER_ID, level)!;
  const levels = Array.from({ length: PROGRESSION_MAX_LEVEL }, (_, i) => i + 1);
  const scalingValue = (level: number, name: string) =>
    at(level).scaling.find((v) => v.name === name)?.value;

  it("кость гемокрафта растёт 1к4 → 1к6 с 5 уровня → 1к8 с 11", () => {
    expect(levels.map((l) => scalingValue(l, "Кость гемокрафта"))).toEqual([
      "1к4", "1к4", "1к4", "1к4", "1к6", "1к6", "1к6", "1к6", "1к6", "1к6", "1к8", "1к8",
    ]);
  });

  it("известных проклятий крови 1, со 6 уровня 2, с 10 — 3", () => {
    expect(levels.map((l) => scalingValue(l, "Известные проклятья крови"))).toEqual([
      "1", "1", "1", "1", "1", "2", "2", "2", "2", "3", "3", "3",
    ]);
  });

  /**
   * Главное место, где столбец таблицы легко спутать с запасом применений:
   * известных проклятий на 10 уровне три, а применений «Проклятой крови»
   * по-прежнему два — третье приходит на 13, выше потолка приложения.
   */
  it("применений «Проклятой крови» одно, со 6 уровня два — и на 10 их всё ещё два", () => {
    const uses = (level: number) => {
      const resource = at(level).resources.find((r) => r.id === BLOOD_CURSE_RESOURCE_ID);
      return resource ? resourceMax(resource, emptyAbilityScores()) : undefined;
    };

    expect(levels.map(uses)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]);
    expect(scalingValue(10, "Известные проклятья крови")).toBe("3");
  });

  it("счётчик «Клейма наказания» заводится ровно на 6 уровне и возвращается коротким отдыхом", () => {
    const brand = (level: number) =>
      at(level).resources.find((r) => r.id === BRAND_OF_CASTIGATION_RESOURCE_ID);

    for (const level of [1, 2, 3, 4, 5]) expect(brand(level), `ур. ${level}`).toBeUndefined();
    for (const level of [6, 7, 8, 9, 10, 11, 12]) {
      expect(brand(level), `ур. ${level}`).toBeDefined();
      expect(brand(level)!.max).toBe(1);
      expect(brand(level)!.recharge).toBe("short");
    }
  });

  it("оба счётчика возвращаются отдыхом — поле recharge, по которому их отбирает лист", () => {
    const resources = characterResources(BLOOD_HUNTER_ID, null, 6);

    expect(resources.map((r) => r.id)).toEqual([BLOOD_CURSE_RESOURCE_ID, BRAND_OF_CASTIGATION_RESOURCE_ID]);
    for (const resource of resources) expect(resource.recharge).toBe("short");
  });

  it("класс не заклинатель: ни ячеек, ни заговоров, ни известных заклинаний", () => {
    expect(CLASS_PROGRESSION[BLOOD_HUNTER_ID].spellsKnownKind).toBe("none");
    // Поле обязательное у каждого класса намеренно — объявлено даже там, где ячеек нет.
    expect(slotRechargeOf(BLOOD_HUNTER_ID)).toBe("long");
    for (const level of levels) {
      expect(at(level).spellSlots.every((n) => n === 0), `ур. ${level}`).toBe(true);
      expect(at(level).cantripsKnown, `ур. ${level}`).toBe(0);
      expect(at(level).spellsKnown, `ур. ${level}`).toBe(0);
    }
  });

  it("увеличение характеристик приходит на 4, 8 и 12 — как у десяти классов SRD", () => {
    // с. 6 PDF: 4, 8, 12, 16 и 19 уровни; последние два выше потолка.
    expect(asiLevels(BLOOD_HUNTER_ID)).toEqual([4, 8, 12]);
  });
});

/**
 * Ордены — архетипы класса, выбор на 3 уровне (с. 2 и 5 PDF владельца).
 * Названия и состав выписаны здесь по PDF, а не сняты с кода: подмени орден
 * или сдвинь уровень умения — и проба покраснеет на названии, а не на общем
 * снимке данных.
 */
describe("Кровавый охотник — ордены", () => {
  const info = CLASS_SUBCLASSES[BLOOD_HUNTER_ID];

  it("выбираются на 3 уровне, и их четыре — все, что есть в файле владельца", () => {
    expect(info.chosenAtLevel).toBe(3);
    expect(info.subclasses.map((s) => s.name)).toEqual([
      "Орден призрачных убийц",
      "Орден осквернённых душ",
      "Орден мутантов",
      "Орден ликантропов",
    ]);
  });

  it("у каждого ордена есть умения на 3, 7 и 11 уровнях и ни одного выше потолка", () => {
    for (const order of info.subclasses) {
      for (const level of [3, 7, 11]) {
        expect(order.featuresByLevel[level]?.length, `${order.name} ур. ${level}`).toBeGreaterThan(0);
      }
      for (const key of Object.keys(order.featuresByLevel)) {
        expect(Number(key), `${order.name}: уровень ${key}`).toBeLessThanOrEqual(PROGRESSION_MAX_LEVEL);
      }
      // Умения 15 и 18 уровней из PDF выше потолка приложения — их здесь быть не должно.
      expect(order.featuresByLevel[15]).toBeUndefined();
      expect(order.featuresByLevel[18]).toBeUndefined();
    }
  });

  it("у каждого ордена есть своё описание — выбор из четырёх вариантов без него слепой", () => {
    for (const order of info.subclasses) {
      expect(order.description?.trim().length, order.name).toBeGreaterThan(40);
    }
  });

  it("имена умений 3 уровня — те же, что в PDF", () => {
    const at3 = (name: string) =>
      info.subclasses.find((s) => s.name === name)!.featuresByLevel[3].map((f) => f.name);

    expect(at3("Орден призрачных убийц")).toEqual(["Обряд рассвета", "Специалист по проклятьям"]);
    expect(at3("Орден осквернённых душ")).toEqual([
      "Потусторонний покровитель",
      "Магия договора",
      "Ритуальная фокусировка",
    ]);
    expect(at3("Орден мутантов")).toEqual(["Формулы", "Создание мутагенов"]);
    expect(at3("Орден ликантропов")).toEqual(["Обострённые чувства", "Гибридная трансформация"]);
  });

  /**
   * Единственная механика, которую ордены выражают числом. «Магия договора»
   * даёт два заговора колдуна с 3 уровня — ровно с уровня выбора ордена и
   * внутри потолка не растёт (третий заговор на 10 уровне приложение выразить
   * не может: у `bonusCantrips` нет уровня, и об этом сказано в тексте
   * особенности). Ячеек «Магии договора» на листе нет вовсе: у класса ячеек
   * не бывает, а запаса ячеек у архетипа в приложении нет.
   */
  it("Орден осквернённых душ даёт два заговора из списка колдуна и ни одной ячейки", () => {
    const grants = subclassGrants(BLOOD_HUNTER_ID, "Орден осквернённых душ");

    expect(grants?.bonusCantrips).toEqual({ count: 2, fromClassId: "classes-warlock" });
    for (const level of [3, 7, 11, 12]) {
      expect(progressionAt(BLOOD_HUNTER_ID, level)!.spellSlots.every((n) => n === 0), `ур. ${level}`).toBe(true);
    }
  });

  /**
   * Сознательное решение, а не пропуск: `SubclassGrants.resources` уровня не
   * знает, а почти каждый счётчик ордена либо приходит позже 3 уровня
   * («Эфирный шаг» — 7), либо меняет число на 11 («Гибридная трансформация»,
   * «Создание мутагенов»). Счётчик, заведённый сразу, выдал бы умение раньше
   * срока или соврал бы числом. Проба сторожит именно это: появится механизм
   * с уровнем — её надо будет пересмотреть вместе с данными.
   */
  it("своих счётчиков ордены не заводят — всё, что растёт с уровнем, живёт текстом", () => {
    for (const order of info.subclasses) {
      expect(order.grants?.resources, order.name).toBeUndefined();
      expect(order.grants?.resourceOptions, order.name).toBeUndefined();
    }
    // Классовые счётчики от выбора ордена не меняются ни числом, ни составом.
    expect(characterResources(BLOOD_HUNTER_ID, "Орден ликантропов", 11).map((r) => r.id)).toEqual(
      characterResources(BLOOD_HUNTER_ID, null, 11).map((r) => r.id),
    );
  });
});

/**
 * Проклятья крови как ВЫБОР игрока — первый пользователь общего механизма
 * классового выбора (сам механизм проверяется на выдуманных данных в
 * classChoices.test.ts). Здесь сторожится подключение и числа PDF.
 */
describe("Кровавый охотник — проклятья крови как выбор", () => {
  const choice = classChoicesFor(BLOOD_HUNTER_ID)[0];

  it("у класса ровно один классовый выбор, и это проклятья крови", () => {
    expect(classChoicesFor(BLOOD_HUNTER_ID)).toHaveLength(1);
    expect(choice.id).toBe(BLOOD_CURSES_CHOICE_ID);
    expect(choice.options).toEqual(BLOOD_CURSES);
  });

  it("известных проклятий 1, со 6 уровня 2, с 10 — 3 (с. 2 PDF)", () => {
    const byLevel = Array.from({ length: PROGRESSION_MAX_LEVEL }, (_, i) => classChoiceKnownAt(choice, i + 1));

    expect(byLevel).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
  });

  /**
   * Сердце шва между выбором и таблицей. Столбец «Известные проклятья крови»
   * на листе и число, которое спрашивает выбор, — ОДНО число; написанные
   * отдельно, они разошлись бы, и игрок увидел бы на листе «3», выбрав два.
   * Проба сверяет два ЧИТАТЕЛЯ одного владельца на всех двенадцати уровнях.
   */
  it("столбец таблицы и число спрашиваемого выбора — одно и то же на каждом уровне", () => {
    for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
      const fromTable = progressionAt(BLOOD_HUNTER_ID, level)!.scaling.find(
        (v) => v.name === "Известные проклятья крови",
      )!.value;
      expect(fromTable, `ур. ${level}`).toBe(String(classChoiceKnownAt(choice, level)));
    }
  });

  it("восемь проклятий на выбор — все без требования уровня и ордена", () => {
    expect(BLOOD_CURSES).toHaveLength(8);
    for (const curse of BLOOD_CURSES) {
      expect(curse.minLevel, curse.id).toBeUndefined();
      expect(curse.name.startsWith("Проклятье "), curse.id).toBe(true);
    }
  });

  /**
   * Четыре проклятья PDF даёт сам орден на 15 и 18 уровнях, и они не
   * считаются в число известных — то есть в выбор игрока не входят ни сейчас,
   * ни после подъёма потолка. Попади любое в список — игрок смог бы взять на
   * 1 уровне то, что принадлежит ордену и восемнадцатому.
   */
  it("проклятья, которые даёт орден, в выбор не попали", () => {
    const ownerBound = ["экзорциста", "пожирания души", "гниения", "воя"];
    const names = BLOOD_CURSES.map((c) => c.name).join(" | ");
    for (const tail of ownerBound) {
      expect(names.includes(tail), `в выборе оказалось «Проклятье ${tail}»`).toBe(false);
    }
  });

  /**
   * Статья справочника и панель выбора берут имена и тексты из ОДНОГО списка:
   * абзацы раздела «Проклятья крови» собираются из `BLOOD_CURSES`. Напиши их
   * второй копией — и переименование проклятья разошлось бы между статьёй и
   * выбором молча.
   */
  it("абзацы статьи собраны из того же списка, что и варианты выбора", () => {
    const paragraphs = BLOOD_HUNTER_TOPIC.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : []));

    for (const curse of BLOOD_CURSES) {
      expect(
        paragraphs.includes(`${curse.name}. ${curse.description}`),
        `в статье нет абзаца «${curse.name}»`,
      ).toBe(true);
    }
  });

  it("ступени известного — тот же единственный владелец, что кормит таблицу", () => {
    expect(choice.knownByLevel).toBe(BLOOD_CURSES_KNOWN_STEPS);
    // Четвёртое и пятое проклятье приходят на 14 и 18 — выше потолка.
    expect(BLOOD_CURSES_KNOWN_STEPS.map(([from]) => from)).toEqual([1, 6, 10]);
  });

  it("проклятья крови есть только у нашего класса — в CLASS_CHOICES больше никого", () => {
    expect(Object.keys(CLASS_CHOICES)).toEqual([BLOOD_HUNTER_ID]);
  });
});
