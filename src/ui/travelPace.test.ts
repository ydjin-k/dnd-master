import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleTopic, TravelState } from "../state/types";
import {
  DEFAULT_TRAVEL_PACE,
  FAST_PACE_PASSIVE_PENALTY,
  TRAVEL_HOURS_PER_DAY,
  TRAVEL_PACES,
  effectivePace,
  emptyTravelState,
  forcedMarchDc,
  formatMiles,
  pacePassivePenalty,
  pacedPassivePerception,
  paceById,
  travelDays,
  travelOf,
  travelledMiles,
  withDayMarched,
  withDifficultTerrain,
  withHalvedDay,
  withHourMarched,
  withLostDay,
  withPace,
} from "./travelPace";

const srdTopics = bundledRules as unknown as RuleTopic[];
const movement = srdTopics.find((t) => t.id === "gameplay-movement")!;

/** Таблица темпа из источника: `rules.json` → `gameplay-movement`, единственная table-блока. */
function paceTableRows(): string[][] {
  const tables = movement.blocks.filter((b) => b.type === "table");
  expect(tables).toHaveLength(1);
  return (tables[0] as { type: "table"; rows: string[][] }).rows;
}

/** Число из клетки таблицы: «400 футов» → 400. Единица в источнике идёт словом. */
function cellNumber(cell: string): number {
  const digits = cell.match(/\d+/);
  expect(digits).not.toBeNull();
  return Number(digits![0]);
}

describe("темп перемещения — числа приходят из rules.json", () => {
  /**
   * Сторож каждого числа таблицы. Это и есть отрицательная проба на темп: ни
   * одно значение `TRAVEL_PACES` не выдумано здесь, и разойдись оно с таблицей
   * SRD хоть на милю — падает именно эта проверка, назвав строку и колонку.
   */
  it("три строки совпадают с таблицей источника по всем четырём колонкам", () => {
    const [header, ...rows] = paceTableRows();

    expect(header).toEqual(["Темп", "Расстояние за минуту:", "Час", "День", "Эффект"]);
    expect(rows).toHaveLength(TRAVEL_PACES.length);

    rows.forEach((row, index) => {
      const pace = TRAVEL_PACES[index];
      expect(row[0]).toBe(pace.name);
      // Число из клетки, а не вся клетка: падеж единицы в источнике зависит от
      // числа («24 мили», но «30 миль»), и сверять надо расстояние, а не грамматику.
      expect(cellNumber(row[1])).toBe(pace.feetPerMinute);
      expect(cellNumber(row[2])).toBe(pace.milesPerHour);
      expect(cellNumber(row[3])).toBe(pace.milesPerDay);
      expect(row[4]).toBe(pace.effect);
    });
  });

  it("штраф быстрого темпа — то самое −5 из колонки «Эффект»", () => {
    const fast = paceById("fast");

    expect(fast.effect).toContain(`−${FAST_PACE_PASSIVE_PENALTY}`);
    expect(pacePassivePenalty("fast")).toBe(FAST_PACE_PASSIVE_PENALTY);
  });

  it("восемь часов в день взяты из абзаца о форсированном марше", () => {
    const forcedMarch = movement.blocks.find(
      (b) => b.type === "paragraph" && b.text.startsWith("Форсированный марш."),
    ) as { type: "paragraph"; text: string };

    expect(forcedMarch.text).toContain(`по ${TRAVEL_HOURS_PER_DAY} часов в день`);
  });

  it("половина расстояния на труднопроходимой местности — из абзаца о ней", () => {
    const halved = movement.blocks.find(
      (b) => b.type === "paragraph" && b.text.includes("вдвое меньшее расстояние"),
    );

    expect(halved).toBeDefined();
    expect(effectivePace("normal", true).milesPerDay).toBe(paceById("normal").milesPerDay / 2);
  });

  it("неизвестный темп читается как обычный, а не роняет счётчик", () => {
    expect(paceById("").id).toBe(DEFAULT_TRAVEL_PACE);
    expect(paceById(undefined).id).toBe(DEFAULT_TRAVEL_PACE);
    expect(paceById("galloping").id).toBe(DEFAULT_TRAVEL_PACE);
  });
});

describe("пассивная внимательность под темпом", () => {
  it("быстрый темп роняет её ровно на 5, обычный и замедление не трогают", () => {
    expect(pacedPassivePerception(13, "fast")).toBe(8);
    expect(pacedPassivePerception(13, "normal")).toBe(13);
    expect(pacedPassivePerception(13, "slow")).toBe(13);
  });

  it("своего счёта внимательности здесь нет: число приходит готовым", () => {
    // Любое значение листа проходит насквозь — функция только вычитает штраф.
    expect(pacedPassivePerception(9, "normal")).toBe(9);
    expect(pacedPassivePerception(21, "fast")).toBe(16);
  });
});

describe("форсированный марш", () => {
  it("до восьмого часа включительно спасброска нет", () => {
    for (let hour = 1; hour <= TRAVEL_HOURS_PER_DAY; hour++) {
      expect(forcedMarchDc(hour)).toBeNull();
    }
  });

  /** Девятый — УС 11, десятый — 12, одиннадцатый — 13: «10 + 1 за каждый час сверх 8». */
  it("УС растёт на 1 за каждый час сверх восьми", () => {
    expect(forcedMarchDc(9)).toBe(11);
    expect(forcedMarchDc(10)).toBe(12);
    expect(forcedMarchDc(11)).toBe(13);
  });

  it("считается формулой, а не таблицей: двадцатый час даёт УС 22", () => {
    expect(forcedMarchDc(20)).toBe(22);
    expect(forcedMarchDc(100)).toBe(102);
  });
});

describe("счётчик пути", () => {
  const journey = (over: Partial<TravelState> = {}): TravelState => ({ ...emptyTravelState(), ...over });

  it("у кампании без темпа — обычный темп и нули", () => {
    const fresh = travelOf(null);

    expect(fresh.pace).toBe(DEFAULT_TRAVEL_PACE);
    expect(travelDays(fresh)).toBe(0);
    expect(travelledMiles(fresh)).toBe(0);
  });

  it("мили выводятся из темпа и часов, а не хранятся", () => {
    const sixHours = journey({ hoursToday: 6 });

    // Обычный темп: 3 мили в час → 18 за шесть часов.
    expect(travelledMiles(sixHours)).toBe(18);
    // Тот же путь быстрым темпом — другое расстояние без всякой записи миль.
    expect(travelledMiles(withPace(sixHours, "fast"))).toBe(24);
    expect(travelledMiles(withPace(sixHours, "slow"))).toBe(12);
  });

  it("полный дневной переход берёт колонку «День», а не восемь часов", () => {
    expect(travelledMiles(journey({ pace: "fast", dayMarches: 1 }))).toBe(30);
    expect(travelledMiles(journey({ pace: "normal", dayMarches: 1 }))).toBe(24);
    expect(travelledMiles(journey({ pace: "slow", dayMarches: 1 }))).toBe(18);
  });

  it("«темп вдвое» даёт половину дневного перехода", () => {
    expect(travelledMiles(journey({ pace: "fast", halfDayMarches: 1 }))).toBe(15);
    expect(travelledMiles(journey({ pace: "normal", halfDayMarches: 2 }))).toBe(24);
  });

  it("потерянный день стоит времени, а не миль", () => {
    const lost = withLostDay(journey({ dayMarches: 2 }));

    expect(travelDays(lost)).toBe(3);
    expect(travelledMiles(lost)).toBe(48);
  });

  it("труднопроходимая местность режет пройденное вдвое", () => {
    const day = journey({ pace: "normal", dayMarches: 1, hoursToday: 2 });

    expect(travelledMiles(day)).toBe(30);
    expect(travelledMiles(withDifficultTerrain(day, true))).toBe(15);
  });

  it("час добавляется и называет свой номер в сегодняшнем дне", () => {
    let travel = journey();
    let hourOfDay = 0;

    for (let i = 0; i < 9; i++) ({ travel, hourOfDay } = withHourMarched(travel));

    expect(hourOfDay).toBe(9);
    expect(travel.hoursToday).toBe(9);
    expect(forcedMarchDc(hourOfDay)).toBe(11);
  });

  it("закрытый день обнуляет часы: форсированный марш нового дня начинается заново", () => {
    const after = withDayMarched(journey({ hoursToday: 10 }));

    expect(after.hoursToday).toBe(0);
    expect(after.dayMarches).toBe(1);
    expect(forcedMarchDc(withHourMarched(after).hourOfDay)).toBeNull();
  });

  it("«темп вдвое» и «потерян день» тоже закрывают день", () => {
    expect(withHalvedDay(journey({ hoursToday: 5 })).hoursToday).toBe(0);
    expect(withLostDay(journey({ hoursToday: 5 })).hoursToday).toBe(0);
  });

  it("незакрытый день не считается днём пути — он показан часами", () => {
    expect(travelDays(journey({ hoursToday: 7 }))).toBe(0);
    expect(travelDays(journey({ dayMarches: 1, halfDayMarches: 1, lostDays: 1 }))).toBe(3);
  });

  it("смена темпа и местности часов и дней не трогает", () => {
    const walked = journey({ hoursToday: 3, dayMarches: 2, halfDayMarches: 1, lostDays: 1 });
    const repaced = withDifficultTerrain(withPace(walked, "slow"), true);

    expect(repaced.hoursToday).toBe(3);
    expect(repaced.dayMarches).toBe(2);
    expect(repaced.halfDayMarches).toBe(1);
    expect(repaced.lostDays).toBe(1);
  });

  it("дробные мили не округляются до лжи", () => {
    // Половина дневного перехода быстрым темпом по труднопроходимой: 30 / 2 / 2.
    const miles = travelledMiles(journey({ pace: "fast", halfDayMarches: 1, difficultTerrain: true }));

    expect(miles).toBe(7.5);
    expect(formatMiles(miles)).toBe("7,5");
    expect(formatMiles(24)).toBe("24");
  });
});
