/**
 * Темп путешествия отряда и счётчик пути — SRD 5.1, `rules.json` раздел `[2]`
 * «Передвижение».
 *
 * Каждое число здесь прочитано в источнике, а не взято из карточки:
 * - таблица темпа — `[2]/blocks[15]`, четыре колонки и три строки целиком;
 * - «8 часов в день» и спасбросок за лишний час — `[2]/blocks[9]` и
 *   `[2]/blocks[10]`;
 * - половина расстояния на труднопроходимой местности — `[2]/blocks[18]`,
 *   и сказано там про все три колонки сразу: «за минуту, час или день вы
 *   пройдёте вдвое меньшее расстояние».
 *
 * **Мили здесь считаются, а не хранятся.** Состояние пути несёт только время —
 * часы сегодняшнего перехода и дневные переходы, — а расстояние выводит
 * `travelledMiles` из темпа и местности. Поэтому у пройденного одна причина:
 * строка таблицы SRD. Цена этого решения названа прямо: переключив темп или
 * местность посреди пути, мастер видит пересчёт ВСЕГО счётчика, потому что
 * банка миль в состоянии нет. Это честно для одного отрезка пути, а отрезки
 * разной местности — своя карточка, не эта.
 *
 * Колонки «Час» и «День» в SRD не выводятся друг из друга: у быстрого темпа
 * 8 × 4 мили = 32, а в колонке «День» стоит 30, у замедления 8 × 2 = 16
 * против 18. Поэтому полный дневной переход считается колонкой «День», а
 * неполный день — колонкой «Час», каждая своим числом источника. Выдумывать
 * из них одно среднее значило бы спорить с таблицей.
 */

import type { TravelPaceId, TravelState } from "../state/types";

export interface TravelPace {
  readonly id: TravelPaceId;
  /** Имя строки дословно из `[2]/blocks[15]`: «Быстрый», «Обычный», «Замедление». */
  readonly name: string;
  readonly feetPerMinute: number;
  readonly milesPerHour: number;
  readonly milesPerDay: number;
  /** Колонка «Эффект» дословно; у обычного темпа в источнике стоит «—». */
  readonly effect: string;
}

/** Таблица темпа перемещения, `rules.json` `[2]/blocks[15]`, построчно. */
export const TRAVEL_PACES: readonly TravelPace[] = [
  {
    id: "fast",
    name: "Быстрый",
    feetPerMinute: 400,
    milesPerHour: 4,
    milesPerDay: 30,
    effect: "Штраф −5 к пассивному значению Мудрости (восприятие)",
  },
  {
    id: "normal",
    name: "Обычный",
    feetPerMinute: 300,
    milesPerHour: 3,
    milesPerDay: 24,
    effect: "—",
  },
  {
    id: "slow",
    name: "Замедление",
    feetPerMinute: 200,
    milesPerHour: 2,
    milesPerDay: 18,
    effect: "Возможность использовать скрытность",
  },
];

/**
 * Темп кампании, у которой его ещё нет. Обычный: в таблице SRD это строка без
 * эффекта, то есть единственная, которая ничего не обещает и ничего не отнимает
 * у старого сохранения.
 */
export const DEFAULT_TRAVEL_PACE: TravelPaceId = "normal";

/**
 * Строка таблицы по id — и единственное место, где неизвестное значение
 * превращается в обычный темп. Сохранение, записанное до этой карточки,
 * приезжает со строкой по умолчанию со стороны Rust; если в поле всё же
 * окажется что-то другое, счётчик покажет обычный темп, а не упадёт.
 */
export function paceById(id: string | null | undefined): TravelPace {
  return TRAVEL_PACES.find((pace) => pace.id === id) ?? TRAVEL_PACES.find((p) => p.id === DEFAULT_TRAVEL_PACE)!;
}

/**
 * Штраф быстрого темпа к пассивной внимательности — «−5» из колонки «Эффект»
 * той же строки `[2]/blocks[15]`, названный числом.
 */
export const FAST_PACE_PASSIVE_PENALTY = 5;

/** Насколько темп роняет пассивную внимательность: 5 у быстрого, 0 у остальных. */
export function pacePassivePenalty(pace: string | null | undefined): number {
  return paceById(pace).id === "fast" ? FAST_PACE_PASSIVE_PENALTY : 0;
}

/**
 * Пассивная внимательность с учётом темпа отряда.
 *
 * Своего счёта пассивной внимательности здесь НЕТ: число приходит готовым
 * (`Character.passivePerception`, посчитанное мастером создания), а темп только
 * вычитает из него штраф. Тем же приёмом считает цену «Чувствительности к
 * солнечному свету» `sunlitPassivePerception` в `abyssElfRace.ts` — второго
 * владельца самого значения не заводит ни та функция, ни эта.
 */
export function pacedPassivePerception(passivePerception: number, pace: string | null | undefined): number {
  return passivePerception - pacePassivePenalty(pace);
}

/**
 * Сколько часов в день предполагает таблица темпа — `[2]/blocks[9]`: «Таблица
 * темпа путешествия предполагает, что персонажи путешествуют по 8 часов в
 * день». Девятый час и дальше — форсированный марш.
 */
export const TRAVEL_HOURS_PER_DAY = 8;

/** Основание спасброска форсированного марша: «УС равен 10 + 1 за каждый час сверх 8» (`[2]/blocks[10]`). */
export const FORCED_MARCH_BASE_DC = 10;

/**
 * УС спасброска Телосложения в конце указанного по счёту часа перехода.
 * `null` до девятого часа включительно по восьмой: пока отряд в пределах
 * восьми часов, спасброска нет вовсе.
 *
 * Считается формулой, а не таблицей-константой: часов сверх восьми правило не
 * ограничивает, и таблица на десять строк соврала бы на одиннадцатой.
 */
export function forcedMarchDc(hourOfDay: number): number | null {
  if (hourOfDay <= TRAVEL_HOURS_PER_DAY) return null;
  return FORCED_MARCH_BASE_DC + (hourOfDay - TRAVEL_HOURS_PER_DAY);
}

/** Труднопроходимая местность: половина расстояния (`[2]/blocks[18]`). */
export const DIFFICULT_TERRAIN_DIVISOR = 2;

/**
 * Числа темпа, которыми отряд идёт прямо сейчас: строка таблицы как есть, а на
 * труднопроходимой местности — все три колонки вдвое меньше. Деление живёт
 * здесь, а не у каждого показывающего места: иначе «вдвое меньше» разъехалось
 * бы между счётчиком и подписью темпа.
 */
export function effectivePace(pace: string | null | undefined, difficultTerrain: boolean): TravelPace {
  const row = paceById(pace);
  if (!difficultTerrain) return row;
  return {
    ...row,
    feetPerMinute: row.feetPerMinute / DIFFICULT_TERRAIN_DIVISOR,
    milesPerHour: row.milesPerHour / DIFFICULT_TERRAIN_DIVISOR,
    milesPerDay: row.milesPerDay / DIFFICULT_TERRAIN_DIVISOR,
  };
}

/** Счётчик пути у кампании, которая ещё не выходила в путь. */
export function emptyTravelState(): TravelState {
  return {
    pace: DEFAULT_TRAVEL_PACE,
    difficultTerrain: false,
    hoursToday: 0,
    dayMarches: 0,
    halfDayMarches: 0,
    lostDays: 0,
  };
}

/**
 * Счётчик пути кампании с подставленными умолчаниями. Кампания, записанная до
 * этой карточки, поля не несёт — и читается как «в путь не выходили», а не
 * роняет экран.
 */
export function travelOf(travel: TravelState | null | undefined): TravelState {
  return travel ?? emptyTravelState();
}

/**
 * Пройденные мили — из темпа, времени и местности, и больше ниоткуда.
 *
 * Полный дневной переход берёт колонку «День», переход «темп вдвое» — её
 * половину (ровно то, чем наказывают девять строк «Столкновений местности
 * Подземья»), часы сегодняшнего перехода — колонку «Час». Потерянный день не
 * даёт миль вовсе: он стоит времени, а не расстояния.
 */
export function travelledMiles(travel: TravelState): number {
  const pace = effectivePace(travel.pace, travel.difficultTerrain);
  return (
    travel.dayMarches * pace.milesPerDay +
    (travel.halfDayMarches * pace.milesPerDay) / 2 +
    travel.hoursToday * pace.milesPerHour
  );
}

/**
 * Дни с начала пути: полные переходы, половинные и потерянные. Начатый, но не
 * закрытый день здесь НЕ считается — он показан часами, и считать его сразу
 * целым днём значило бы прибавить отряду сутки за один пройденный час.
 */
export function travelDays(travel: TravelState): number {
  return travel.dayMarches + travel.halfDayMarches + travel.lostDays;
}

/**
 * Прошли час. Возвращает новое состояние и номер пройденного часа в сегодняшнем
 * дне — по нему `forcedMarchDc` называет УС, и считать его второй раз у кнопки
 * не нужно.
 */
export function withHourMarched(travel: TravelState): { travel: TravelState; hourOfDay: number } {
  const hourOfDay = travel.hoursToday + 1;
  return { travel: { ...travel, hoursToday: hourOfDay }, hourOfDay };
}

/**
 * Закрыли день. Часы сегодняшнего перехода обнуляются: следующий час снова
 * первый, и форсированный марш нового дня начинается с девятого часа, а не
 * продолжает счёт прошлого.
 */
export function withDayMarched(travel: TravelState): TravelState {
  return { ...travel, dayMarches: travel.dayMarches + 1, hoursToday: 0 };
}

/** Темп вдвое: день прошёл, расстояние — половина дневного перехода. */
export function withHalvedDay(travel: TravelState): TravelState {
  return { ...travel, halfDayMarches: travel.halfDayMarches + 1, hoursToday: 0 };
}

/** Потерян день: время ушло, миль нет. */
export function withLostDay(travel: TravelState): TravelState {
  return { ...travel, lostDays: travel.lostDays + 1, hoursToday: 0 };
}

/** Темп — выбор мастера; часы и дни пути он не трогает. */
export function withPace(travel: TravelState, pace: TravelPaceId): TravelState {
  return { ...travel, pace };
}

/** Переключатель местности — тоже свойство пути, а не отдельный счётчик. */
export function withDifficultTerrain(travel: TravelState, difficultTerrain: boolean): TravelState {
  return { ...travel, difficultTerrain };
}

/**
 * Мили числом для подписи. Половина дневного перехода на труднопроходимой
 * местности даёт дробь (7,5 мили у быстрого темпа), и округлять её нельзя:
 * счётчик врал бы на каждом втором дне. Запятая — десятичный разделитель
 * русского текста, в котором живёт весь остальной интерфейс.
 */
export function formatMiles(miles: number): string {
  const rounded = Math.round(miles * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}
