import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleBlock, RuleTopic } from "../state/types";
import { isOwnRuleTopic, OWN_RULE_TOPICS, playableRaces, raceWizardBlocks } from "./ownRuleTopics";

const srdTopics = bundledRules as unknown as RuleTopic[];

describe("наши темы справочника", () => {
  it("список не пуст и у каждой темы есть категория из существующих", () => {
    // Своих разделов наши темы не заводят: категория обязана быть той же, что
    // у SRD-соседей, иначе в списке появится раздел без подписи.
    const srdCategories = new Set(srdTopics.map((t) => t.category));

    expect(OWN_RULE_TOPICS.length).toBeGreaterThan(0);
    for (const topic of OWN_RULE_TOPICS) {
      expect(srdCategories.has(topic.category)).toBe(true);
    }
  });

  /**
   * Сторож границы, тот же, что у опциональных правил. В `rules.json` лежит
   * ровно SRD, и подвал обещает SRD за всё пришедшее оттуда. Стоит нашей теме
   * заехать в тот файл — подпись соврёт об источнике, а глазами это уже не
   * проверить: тема выглядит там как своя.
   */
  it("ни одна наша тема не подмешана в rules.json — ни по id, ни по названию", () => {
    const srdIds = new Set(srdTopics.map((t) => t.id));
    const srdTitles = new Set(srdTopics.map((t) => t.title));

    for (const topic of OWN_RULE_TOPICS) {
      expect(srdIds.has(topic.id)).toBe(false);
      expect(srdTitles.has(topic.title)).toBe(false);
    }
  });

  it("у наших тем нет ссылки на источник SRD", () => {
    // `sourceUrl` подвал показывает как «Источник этого раздела» и ведёт на
    // longstoryshort.app. Для нашего текста такой ссылки быть не может.
    for (const topic of OWN_RULE_TOPICS) {
      expect(topic.sourceUrl).toBe("");
    }
  });

  it("«наше» определяется принадлежностью списку, а не категорией и не пустым sourceUrl", () => {
    // Сердце карточки. У Эльфа бездны категория `races` ровно та же, что у
    // Эльфа из SRD, поэтому предикат обязан отвечать по id, а не по признакам,
    // которые у SRD-темы такие же.
    for (const topic of OWN_RULE_TOPICS) {
      expect(isOwnRuleTopic(topic)).toBe(true);
    }
    for (const topic of srdTopics) {
      expect(isOwnRuleTopic(topic)).toBe(false);
    }
    expect(isOwnRuleTopic(undefined)).toBe(false);
  });
});

describe("playableRaces", () => {
  it("девять рас справочника плюс наши, каждая по одному разу", () => {
    const srdRaces = srdTopics.filter((t) => t.category === "races" && t.id !== "races-traits");
    const ownRaces = OWN_RULE_TOPICS.filter((t) => t.category === "races");
    const races = playableRaces(srdTopics);

    expect(srdRaces).toHaveLength(9);
    expect(races).toHaveLength(srdRaces.length + ownRaces.length);
    // Задвоение — главный риск переезда: наша раса могла остаться приписанной
    // руками И приехать из OWN_RULE_TOPICS.
    expect(new Set(races.map((t) => t.id)).size).toBe(races.length);
    expect(new Set(races.map((t) => t.title)).size).toBe(races.length);
  });

  it("наши расы приходят из OWN_RULE_TOPICS и ниоткуда больше", () => {
    const races = playableRaces(srdTopics);
    const ourRaces = races.filter((t) => isOwnRuleTopic(t));

    expect(ourRaces).toEqual(OWN_RULE_TOPICS.filter((t) => t.category === "races"));
    // Общая статья «Расовые особенности» — не раса, играть ею нельзя.
    expect(races.some((t) => t.id === "races-traits")).toBe(false);
  });
});

/**
 * Сторож среза, который мастер создания показывает на шаге «Раса».
 *
 * ПОЧЕМУ ОН ЕСТЬ. Правка владельца 07.10.2026: мастер вываливал статью расы
 * целиком, вместе с таблицей отыгрыша на к6, — «там это не нужно». Правило
 * одно на ВСЕ расы: от раздела механики до раздела происхождения.
 * Ломается оно молча — заголовок в `rules.json` или в нашем модуле стоит
 * переименовать, и срез тихо отдаст либо всю статью, либо не ту её часть.
 *
 * ПОЧЕМУ ПРОБА НЕ САМОССЫЛОЧНА (урок записи 179). Она не повторяет за кодом
 * ни индексов, ни строк поиска: берёт готовый срез и спрашивает у него то,
 * чего ждёт ЧЕЛОВЕК у мастера, — числа расы есть, таблицы отыгрыша нет.
 *
 * ЧИСЛО РАС ЗДЕСЬ НЕ ВШИТО, и это не придирка: вшитая пятнашка покраснела на
 * расе, которая всё сделала правильно (Табакси и Зайцегон пачки B). Считается
 * оно так же, как в `playableRaces` выше: девять рас SRD — факт `rules.json` и
 * проверяется отдельно, наши — `OWN_RULE_TOPICS`, и ждём мы их сумму.
 */
describe("raceWizardBlocks — что мастер показывает на шаге «Раса»", () => {
  const races = playableRaces(srdTopics);

  it("все расы на месте, и ни у одной срез не пуст", () => {
    const srdRaces = srdTopics.filter((t) => t.category === "races" && t.id !== "races-traits");
    const ownRaces = OWN_RULE_TOPICS.filter((t) => t.category === "races");
    expect(srdRaces).toHaveLength(9);
    expect(races).toHaveLength(srdRaces.length + ownRaces.length);
    for (const race of races) {
      expect(raceWizardBlocks(race).length, `пустой срез у ${race.id}`).toBeGreaterThan(0);
    }
  });

  it("срез начинается разделом механики — у всех рас одинаково", () => {
    for (const race of races) {
      const first = raceWizardBlocks(race)[0];
      expect(first.type, `${race.id} начинается не заголовком`).toBe("heading");
      expect((first as Extract<RuleBlock, { type: "heading" }>).text).toMatch(/^Особенности /);
    }
  });

  it("числа, без которых расу не выбрать, остались в срезе", () => {
    for (const race of races) {
      const text = raceWizardBlocks(race)
        .flatMap((b) => (b.type === "paragraph" ? [b.text] : []))
        .join("\n");
      for (const opener of ["Увеличение характеристик.", "Скорость.", "Языки."]) {
        expect(text.includes(opener), `${race.id}: в срезе нет «${opener}»`).toBe(true);
      }
    }
  });

  it("у наших шести рас отыгрыш и происхождение в мастер не попадают", () => {
    for (const race of races.filter(isOwnRuleTopic)) {
      const slice = raceWizardBlocks(race);
      // Все четыре таблицы наших рас живут в разделах, которых в мастере быть
      // не должно. Уцелевшая таблица означает, что срез взял лишнее.
      expect(slice.some((b) => b.type === "table"), `${race.id}: таблица в мастере`).toBe(false);
      // «Источник» — последний блок статьи; попал в срез — значит срез дошёл до конца.
      const paragraphs = slice.flatMap((b) => (b.type === "paragraph" ? [b.text] : []));
      expect(paragraphs.some((t) => t.startsWith("Источник."))).toBe(false);
      expect(slice.length).toBeLessThan(race.blocks.length);
    }
  });

  it("у SRD-рас подраса осталась в срезе — её бонусы мастер уже выдаёт", () => {
    const withSubrace: Record<string, string> = {
      "races-dwarf": "Холмовой дварф",
      "races-halfling": "Легконогий",
      "races-elf": "Высший эльф",
      "races-gnome": "Скальный гном",
    };
    for (const [id, subrace] of Object.entries(withSubrace)) {
      const race = races.find((t) => t.id === id);
      expect(race, `нет расы ${id}`).toBeDefined();
      const headings = raceWizardBlocks(race!).flatMap((b) => (b.type === "heading" ? [b.text] : []));
      expect(headings, `${id}: подраса «${subrace}» выпала из мастера`).toContain(subrace);
    }
  });

  it("статья без раздела механики показывается целиком, а не пустым экраном", () => {
    const broken: RuleTopic = {
      id: "races-broken",
      category: "races",
      title: "Без механики",
      sourceUrl: "",
      blocks: [{ type: "paragraph", text: "Одна проза и ничего больше." }],
    };
    expect(raceWizardBlocks(broken)).toEqual(broken.blocks);
  });
});
