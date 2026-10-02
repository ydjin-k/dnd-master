import { describe, expect, it } from "vitest";
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
