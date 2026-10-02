import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleBlock, RuleTopic } from "../state/types";
import {
  CANNOT_MOVE_CONDITIONS,
  MAX_HP_LAYER_ORDER,
  PASSIVE_LAYER_ORDER,
  SPEED_LAYER_ORDER,
  SPEED_ZERO_LOCKED_CONDITIONS,
  effectiveStats,
  type EffectiveStatsInput,
} from "./effectiveStats";
import { DISADVANTAGE_PASSIVE_PENALTY, sunlitPassivePerception, ABYSS_ELF_TITLE } from "./abyssElfRace";
import { EXHAUSTION_HALF_MAX_HP_LEVEL, EXHAUSTION_HALF_SPEED_LEVEL, EXHAUSTION_ZERO_SPEED_LEVEL, exhaustionLevelName } from "./exhaustion";

/** Персонаж карточки: скорость 30, максимум 40 — числа из «Критериев тестирования». */
function sheet(overrides: Partial<EffectiveStatsInput> = {}): EffectiveStatsInput {
  return {
    maxHp: 40,
    currentHp: 40,
    speedFeet: 30,
    passivePerception: 13,
    conditions: [],
    ...overrides,
  };
}

describe("effectiveStats — владелец эффективных значений листа", () => {
  it("без состояний, на обычном темпе и без нагрузки показывает ровно хранимые числа", () => {
    const stats = effectiveStats(sheet());
    expect(stats.speedFeet.value).toBe(30);
    expect(stats.maxHp.value).toBe(40);
    expect(stats.currentHp).toBe(40);
    expect(stats.passivePerception.value).toBe(13);
    // Старое сохранение не несёт ни состояний, ни темпа — и ни один слой не применён.
    expect(stats.speedFeet.layers).toEqual([]);
    expect(stats.maxHp.layers).toEqual([]);
    expect(stats.passivePerception.layers).toEqual([]);
    expect(stats.currentHpClamped).toBe(false);
  });

  it("порядок слоёв объявлен, а не случаен: нагрузка → половина → ноль → замок → бонусы", () => {
    const stats = effectiveStats(
      sheet({
        encumbrance: "encumbered",
        conditions: [exhaustionLevelName(EXHAUSTION_HALF_SPEED_LEVEL), "Схваченное"],
        speedBonusesFeet: [10],
      }),
    );
    const sources = stats.speedFeet.layers.map((layer) => layer.source);
    expect(sources).toEqual(["нагрузка", exhaustionLevelName(EXHAUSTION_HALF_SPEED_LEVEL), "Схваченное"]);
    // Бонус в слои не попал вовсе — он отброшен замком, а не применён и вычтен.
    expect(sources).not.toContain("бонус к скорости");
    // И сам объявленный порядок — те же стадии и в том же порядке.
    expect(SPEED_LAYER_ORDER.indexOf("нагрузка")).toBeLessThan(
      SPEED_LAYER_ORDER.indexOf("истощение: половина скорости"),
    );
    expect(SPEED_LAYER_ORDER.indexOf("истощение: половина скорости")).toBeLessThan(
      SPEED_LAYER_ORDER.indexOf("состояния «скорость 0»"),
    );
    expect(SPEED_LAYER_ORDER.indexOf("состояния «скорость 0»")).toBeLessThan(
      SPEED_LAYER_ORDER.indexOf("бонусы к скорости"),
    );
    expect(MAX_HP_LAYER_ORDER).toEqual(["истощение: половина максимума хитов"]);
    expect(PASSIVE_LAYER_ORDER[0]).toBe("темп путешествия");
  });

  it("плоский штраф раньше половины: 30 − 10 нагрузки, и только потом вдвое → 10 фт", () => {
    const stats = effectiveStats(
      sheet({ encumbrance: "encumbered", conditions: [exhaustionLevelName(EXHAUSTION_HALF_SPEED_LEVEL)] }),
    );
    // Обратный порядок дал бы 30/2 − 10 = 5 фт; объявленный даёт 10.
    expect(stats.speedFeet.value).toBe(10);
  });
});

describe("состояния со скоростью 0 (rules.json [14]/blocks[21] и [35])", () => {
  it.each(SPEED_ZERO_LOCKED_CONDITIONS)("«%s» роняет скорость 30 → 0", (condition) => {
    expect(effectiveStats(sheet({ conditions: [condition] })).speedFeet.value).toBe(0);
  });

  it.each(SPEED_ZERO_LOCKED_CONDITIONS)("«%s»: НИКАКОЙ последующий бонус нуля не поднимает", (condition) => {
    const stats = effectiveStats(sheet({ conditions: [condition], speedBonusesFeet: [10, 100] }));
    expect(stats.speedFeet.value).toBe(0);
    expect(stats.speedFeet.locked).toBe(true);
  });

  it("бонус к скорости БЕЗ замка работает — иначе проба на замок ничего не доказывала бы", () => {
    const stats = effectiveStats(sheet({ speedBonusesFeet: [10] }));
    expect(stats.speedFeet.value).toBe(40);
    expect(stats.speedFeet.locked).toBe(false);
  });

  it("снятие состояния возвращает прежние 30 фт: хранимое не менялось", () => {
    const grappled = effectiveStats(sheet({ conditions: ["Схваченное"] }));
    expect(grappled.speedFeet.value).toBe(0);
    expect(grappled.speedFeet.base).toBe(30);
    expect(effectiveStats(sheet({ conditions: [] })).speedFeet.value).toBe(30);
  });

  it("нагруженный под «Схваченным» показывает 0, а не отрицательные футы", () => {
    const stats = effectiveStats(sheet({ encumbrance: "heavily-encumbered", conditions: ["Схваченное"] }));
    expect(stats.speedFeet.value).toBe(0);
  });

  it("нагрузка сильнее скорости тоже не уводит ниже нуля", () => {
    expect(effectiveStats(sheet({ speedFeet: 15, encumbrance: "heavily-encumbered" })).speedFeet.value).toBe(0);
  });
});

describe("состояния «не может двигаться» — решение карточки: ноль с замком", () => {
  it.each(CANNOT_MOVE_CONDITIONS)("«%s» даёт 0 фт и замок", (condition) => {
    const stats = effectiveStats(sheet({ conditions: [condition], speedBonusesFeet: [15] }));
    expect(stats.speedFeet.value).toBe(0);
    expect(stats.speedFeet.locked).toBe(true);
  });

  it("список закрыт четырьмя: это те, у кого в SRD сказано «не может двигаться»", () => {
    expect([...CANNOT_MOVE_CONDITIONS].sort()).toEqual(
      ["Бессознательный", "Оглушенное", "Окаменевшее", "Парализованное"].sort(),
    );
  });

  it("состояния без чисел скорость не трогают", () => {
    for (const condition of ["Ослеплённое", "Заворожённое", "Оглохшее", "Испуганное", "Недееспособное", "Невидимое", "Отравленное", "Сбитый с ног"]) {
      expect(effectiveStats(sheet({ conditions: [condition] })).speedFeet.value).toBe(30);
    }
  });
});

describe("истощение — таблица rules.json [14]/blocks[13]", () => {
  it(`ур. ${EXHAUSTION_HALF_SPEED_LEVEL}: скорость вдвое, 30 → 15`, () => {
    const stats = effectiveStats(sheet({ conditions: [exhaustionLevelName(EXHAUSTION_HALF_SPEED_LEVEL)] }));
    expect(stats.speedFeet.value).toBe(15);
    expect(stats.maxHp.value).toBe(40);
  });

  it("ур. 1 скорость не трогает: в таблице у него помеха, а не число", () => {
    expect(effectiveStats(sheet({ conditions: [exhaustionLevelName(1)] })).speedFeet.value).toBe(30);
  });

  it(`ур. ${EXHAUSTION_ZERO_SPEED_LEVEL}: скорость до 0, и ноль этот БЕЗ замка — оговорки про бонусы в таблице нет`, () => {
    const stats = effectiveStats(sheet({ conditions: [exhaustionLevelName(EXHAUSTION_ZERO_SPEED_LEVEL)] }));
    expect(stats.speedFeet.value).toBe(0);
    expect(stats.speedFeet.locked).toBe(false);
  });

  it("накопительность: ур. 5 несёт и половину максимума хитов уровня 4", () => {
    const stats = effectiveStats(sheet({ conditions: [exhaustionLevelName(EXHAUSTION_ZERO_SPEED_LEVEL)] }));
    expect(stats.maxHp.value).toBe(20);
  });

  it(`ур. ${EXHAUSTION_HALF_MAX_HP_LEVEL}: максимум 40 → 20, а в сохранении всё время 40`, () => {
    const stats = effectiveStats(sheet({ conditions: [exhaustionLevelName(EXHAUSTION_HALF_MAX_HP_LEVEL)] }));
    expect(stats.maxHp.value).toBe(20);
    expect(stats.maxHp.base).toBe(40);
  });

  it("снятие ур. 4 возвращает показанный максимум к хранимому — ровно та проба, что требует DoD", () => {
    const stored = sheet();
    const exhausted = effectiveStats({ ...stored, conditions: [exhaustionLevelName(EXHAUSTION_HALF_MAX_HP_LEVEL)] });
    expect(exhausted.maxHp.value).toBe(20);
    const recovered = effectiveStats({ ...stored, conditions: [] });
    expect(recovered.maxHp.value).toBe(stored.maxHp);
    expect(recovered.maxHp.value).toBe(recovered.maxHp.base);
  });

  it("половина округляется в меньшую сторону — наше решение, названное числом", () => {
    expect(effectiveStats(sheet({ speedFeet: 25, conditions: [exhaustionLevelName(EXHAUSTION_HALF_SPEED_LEVEL)] })).speedFeet.value).toBe(12);
    expect(effectiveStats(sheet({ maxHp: 45, currentHp: 45, conditions: [exhaustionLevelName(EXHAUSTION_HALF_MAX_HP_LEVEL)] })).maxHp.value).toBe(22);
  });

  it("подпись максимума называет и хранимое число, чтобы 40 не выглядело потерянным", () => {
    const stats = effectiveStats(sheet({ conditions: [exhaustionLevelName(EXHAUSTION_HALF_MAX_HP_LEVEL)] }));
    expect(stats.maxHp.layers[0].note).toContain("40");
  });
});

describe("текущие хиты выше эффективного максимума — обрезаются при показе", () => {
  it("40/40 под ур. 4 показывает 20/20, хранимое — прежнее", () => {
    const stats = effectiveStats(sheet({ conditions: [exhaustionLevelName(EXHAUSTION_HALF_MAX_HP_LEVEL)] }));
    expect(stats.currentHp).toBe(20);
    expect(stats.maxHp.value).toBe(20);
    expect(stats.currentHpClamped).toBe(true);
  });

  it("хиты ниже эффективного максимума не трогаются: 15 остаются 15", () => {
    const stats = effectiveStats(
      sheet({ currentHp: 15, conditions: [exhaustionLevelName(EXHAUSTION_HALF_MAX_HP_LEVEL)] }),
    );
    expect(stats.currentHp).toBe(15);
    expect(stats.currentHpClamped).toBe(false);
  });

  it("обрезка только при показе: снятие ур. 4 возвращает и хиты, и максимум", () => {
    const stored = sheet({ currentHp: 35 });
    expect(effectiveStats({ ...stored, conditions: [exhaustionLevelName(EXHAUSTION_HALF_MAX_HP_LEVEL)] }).currentHp).toBe(20);
    expect(effectiveStats(stored).currentHp).toBe(35);
  });
});

describe("пассивная внимательность — темп и солнечный свет, в объявленном порядке", () => {
  it("быстрый темп −5 (travelPace.ts), обычный и замедление ничего не отнимают", () => {
    expect(effectiveStats(sheet({ travelPace: "fast" })).passivePerception.value).toBe(8);
    expect(effectiveStats(sheet({ travelPace: "normal" })).passivePerception.value).toBe(13);
    expect(effectiveStats(sheet({ travelPace: "slow" })).passivePerception.value).toBe(13);
  });

  it("солнечный свет считается ОТ числа с темпом: 13 − 5 − 5 = 3", () => {
    const paced = effectiveStats(sheet({ travelPace: "fast" })).passivePerception.value;
    expect(sunlitPassivePerception(ABYSS_ELF_TITLE, paced)).toBe(13 - 5 - DISADVANTAGE_PASSIVE_PENALTY);
  });
});

/**
 * Сверка с источником ПОСТРОЧНО, а не по памяти: числа читаются из того самого
 * `src-tauri/rules/rules.json`, который уходит в сборку, раздел `[14]`
 * `appendices-conditions`.
 *
 * Без этой сверки пробы выше были бы самоссылочными: они берут номера уровней
 * из тех же констант, что и считающий код, и уехавшая на единицу константа
 * уехала бы вместе с пробой. Поймано отрицательной пробой: `2 → 3` ничего не
 * покраснело. Здесь номер сверяется со СТРОКОЙ таблицы, и теперь краснеет.
 */
describe("числа сверены с rules.json [14] appendices-conditions", () => {
  const section = (bundledRules as RuleTopic[]).find((topic) => topic.id === "appendices-conditions");

  function blocks(): RuleBlock[] {
    expect(section, "в rules.json нет раздела appendices-conditions").toBeTruthy();
    return section!.blocks;
  }

  /** Строки таблицы «Истощение» — единственной таблицы раздела (`[14]/blocks[13]`). */
  function exhaustionRows(): string[][] {
    const table = blocks().find((block) => block.type === "table");
    expect(table, "в разделе нет таблицы истощения").toBeTruthy();
    const rows = (table as { type: "table"; rows: string[][] }).rows;
    // Первая строка — заголовки «Уровень | Эффект».
    expect(rows[0]).toEqual(["Уровень", "Эффект"]);
    return rows.slice(1);
  }

  /** Номер уровня у строки, чей эффект назван этими словами. */
  function levelWithEffect(effect: string): number {
    const row = exhaustionRows().find(([, text]) => text === effect);
    expect(row, `в таблице истощения нет строки «${effect}»`).toBeTruthy();
    return Number(row![0]);
  }

  /** Текст эффектов состояния — list-блок сразу за заголовком с его именем. */
  function conditionLines(name: string): string[] {
    const all = blocks();
    const at = all.findIndex((block) => block.type === "heading" && block.level === 2 && block.text === name);
    expect(at, `в разделе нет состояния «${name}»`).toBeGreaterThanOrEqual(0);
    const next = all[at + 1];
    expect(next.type, `за «${name}» идёт не список`).toBe("list");
    return (next as { type: "list"; items: string[] }).items;
  }

  it("таблица истощения даёт ровно шесть строк", () => {
    expect(exhaustionRows()).toHaveLength(6);
  });

  it("«Скорость уменьшается вдвое» — это строка уровня 2, а не какая-то другая", () => {
    expect(EXHAUSTION_HALF_SPEED_LEVEL).toBe(levelWithEffect("Скорость уменьшается вдвое"));
  });

  it("«Максимальные хиты уменьшаются вдвое» — строка уровня 4", () => {
    expect(EXHAUSTION_HALF_MAX_HP_LEVEL).toBe(levelWithEffect("Максимальные хиты уменьшаются вдвое"));
  });

  it("«Скорость уменьшается до 0» — строка уровня 5", () => {
    expect(EXHAUSTION_ZERO_SPEED_LEVEL).toBe(levelWithEffect("Скорость уменьшается до 0"));
  });

  it("у уровней 1 и 3 в таблице помеха, а не число — потому они скорость и не трогают", () => {
    const rows = exhaustionRows();
    expect(rows[0]).toEqual(["1", "Помеха на проверки характеристик"]);
    expect(rows[2]).toEqual(["3", "Помеха на броски атаки и спасброски"]);
  });

  it.each(SPEED_ZERO_LOCKED_CONDITIONS)(
    "у «%s» в источнике сказано и «скорость… становится 0», и что бонусы её не поднимают",
    (condition) => {
      const first = conditionLines(condition)[0];
      expect(first).toContain("становится 0");
      expect(first).toMatch(/не может извлечь выгоду из какого-либо бонуса|никакие эффекты не могут повысить/);
    },
  );

  it.each(CANNOT_MOVE_CONDITIONS)("у «%s» в источнике сказано «не может двигаться», а не «скорость 0»", (condition) => {
    const lines = conditionLines(condition).join(" ");
    expect(lines).toContain("не может двигаться");
    expect(lines).not.toContain("Скорость");
  });

  it("состояния без чисел не обещают ни нуля скорости, ни запрета двигаться", () => {
    for (const condition of ["Ослеплённое", "Заворожённое", "Оглохшее", "Испуганное", "Недееспособное", "Невидимое", "Отравленное"]) {
      const lines = conditionLines(condition).join(" ");
      expect(lines).not.toContain("становится 0");
      expect(lines).not.toContain("не может двигаться");
    }
  });

  it("«Сбитый с ног» ограничивает движение ползанием, но числа листу не даёт", () => {
    const lines = conditionLines("Сбитый с ног").join(" ");
    expect(lines).toContain("ползание");
    expect(lines).not.toContain("становится 0");
  });

  it("«Окаменевшее» множит вес вдесятеро — а вес на листе строка, и считать там нечего", () => {
    expect(conditionLines("Окаменевшее").join(" ")).toContain("вес увеличивается в десять раз");
  });
});
