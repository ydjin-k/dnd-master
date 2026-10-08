import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleBlock, RuleTopic } from "../state/types";
import {
  BLOOD_HUNTER_FIGHTING_STYLE_NAMES,
  BLOOD_HUNTER_ID,
  BLOOD_HUNTER_TITLE,
  BLOOD_HUNTER_TOPIC,
} from "./bloodHunterClass";
import {
  ALL_ITEMS_WITH_COST,
  ALL_SKILLS,
  ARMOR_STATS,
  CLASS_EQUIPMENT,
  CLASS_LEVEL_FEATURES,
  CLASS_PROFICIENCIES,
  FIGHTER_FIGHTING_STYLES,
  armorProficienciesFor,
  equipmentChoiceFor,
  maxHpForLevel,
  parseHitDie,
  parseHitDieAverage,
  toolProficienciesFor,
  weaponProficienciesFor,
} from "./characterCreationData";
import { PROGRESSION_MAX_LEVEL } from "./classProgression";
import { isOwnRuleTopic, playableClasses } from "./ownRuleTopics";

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
