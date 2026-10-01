/**
 * Голод и жажда — SRD 5.1, `rules.json` раздел `[3]` «Окружающая среда»,
 * подраздел «Еда и вода».
 *
 * Адреса чисел, прочитанные в источнике:
 * - `[3]/blocks[25]` — не едят и не пьют → истощение, и снять его нельзя, пока
 *   персонаж не получит полную норму;
 * - `[3]/blocks[27]` — фунт еды в день, полфунта считается как полдня без еды;
 * - `[3]/blocks[28]` — без еды живут 3 + модификатор Телосложения дней
 *   (минимум 1), а дальше в конце каждого дня одна степень истощения;
 * - `[3]/blocks[29]` — день с полноценным питанием сбрасывает счёт до нуля;
 * - `[3]/blocks[31]` — галлон воды в день, два в жару; половина нормы требует
 *   спасброска Телосложения СЛ 15, меньше половины — истощение без броска;
 * - `[3]/blocks[32]` — у того, кто УЖЕ истощён, обе водяные беды дают сразу две
 *   степени. Этот абзац стоит под заголовком «Вода» и говорит «и в том и в
 *   другом случае» про две водяные беды выше, поэтому на голод он здесь не
 *   распространён.
 *
 * Чего здесь нет намеренно: правила `[3]/blocks[25]` «нельзя снять, пока не
 * поест» не исполняет ничто, кроме подписи. Истощение на листе — одно число
 * (`conditions`), и происхождения каждой ступени оно не помнит; заводить ему
 * второго владельца с историей причин значило бы переделывать состояния целиком,
 * а это шире этой карточки.
 */

import { abilityMod } from "./characterCreationData";
import { exhaustionLevelOf } from "./exhaustion";

/** Фунт еды в день на персонажа (`[3]/blocks[27]`). */
export const FOOD_LB_PER_DAY = 1;

/** Половинок в дне: счёт голода идёт полуднями, потому что полрациона = полдня. */
export const HALVES_PER_DAY = 2;

/** Галлон воды в день (`[3]/blocks[31]`). */
export const WATER_GALLONS_PER_DAY = 1;

/** Два галлона в жаркую погоду — та же строка источника. */
export const WATER_GALLONS_PER_DAY_HOT = 2;

/** СЛ спасброска Телосложения за половину нормы воды (`[3]/blocks[31]`). */
export const WATER_HALF_RATION_SAVE_DC = 15;

/** Сколько дней живут без еды: «3 + модификатор Телосложения (минимум 1)». */
export const DAYS_WITHOUT_FOOD_BASE = 3;

/** Рацион дня: полный фунт, половина или ничего. */
export type Ration = "full" | "half" | "none";

/** Сколько воды выпито за день относительно нормы. */
export type WaterShare = "full" | "half" | "less";

/** Предел голода в днях: 3 + модификатор Телосложения, минимум 1 (`[3]/blocks[28]`). */
export function daysWithoutFoodLimit(constitution: number): number {
  return Math.max(1, DAYS_WITHOUT_FOOD_BASE + abilityMod(constitution));
}

/** Тот же предел в полуднях — в них живёт счётчик персонажа. */
export function halfDaysWithoutFoodLimit(constitution: number): number {
  return daysWithoutFoodLimit(constitution) * HALVES_PER_DAY;
}

/** Полудни в дни для подписи: 3 полудня — это полтора дня, а не три. */
export function daysWithoutFood(halfDays: number): number {
  return halfDays / HALVES_PER_DAY;
}

/** Норма воды на день: галлон, а в жару два (`[3]/blocks[31]`). */
export function waterGallonsNeeded(hot: boolean): number {
  return hot ? WATER_GALLONS_PER_DAY_HOT : WATER_GALLONS_PER_DAY;
}

/** Чем кончился день для голода персонажа. */
export interface FoodDayOutcome {
  /** Новое значение счётчика полудней без еды. */
  halfDaysWithoutFood: number;
  /** Степеней истощения за этот день: 0 или 1 (`[3]/blocks[28]`). */
  degrees: number;
  /** Словами — для подписи у кнопки; числа в ней уже подставлены. */
  reason: string;
}

/**
 * День с таким рационом.
 *
 * Полный рацион обнуляет счёт (`[3]/blocks[29]`), половина добавляет полдня,
 * отсутствие еды — целый день. Истощение приходит, когда прожитое без еды
 * ПЕРЕВАЛИЛО за предел: «может прожить… количество дней, равное 3 + модификатор
 * Телосложения», и только «в конце каждого дня ПОСЛЕ этого» — одна степень.
 * Поэтому сравнение строгое, а не «больше или равно».
 */
export function resolveFoodDay(
  halfDaysWithoutFood: number,
  constitution: number,
  ration: Ration,
): FoodDayOutcome {
  const limit = halfDaysWithoutFoodLimit(constitution);
  if (ration === "full") {
    return {
      halfDaysWithoutFood: 0,
      degrees: 0,
      reason: `Полный рацион (${FOOD_LB_PER_DAY} фунт) — счёт дней без еды сброшен`,
    };
  }
  const added = ration === "half" ? 1 : HALVES_PER_DAY;
  const next = Math.max(0, halfDaysWithoutFood) + added;
  const starving = next > limit;
  const days = daysWithoutFood(next);
  const limitDays = daysWithoutFoodLimit(constitution);
  return {
    halfDaysWithoutFood: next,
    degrees: starving ? 1 : 0,
    reason: starving
      ? `Без еды ${days} дн. при пределе ${limitDays} — степень истощения`
      : `Без еды ${days} дн. из ${limitDays}`,
  };
}

/** Чем кончился день для жажды персонажа. */
export interface WaterDayOutcome {
  /** СЛ спасброска Телосложения или `null`, если истощение приходит без броска. */
  saveDc: number | null;
  /** Сколько степеней даёт провал — или сразу, если броска нет (`[3]/blocks[32]`). */
  degrees: number;
  /** Норма дня в галлонах: 1, в жару 2. */
  gallonsNeeded: number;
  reason: string;
}

/**
 * День с таким объёмом воды. `null` — норма выпита, и правилу сказать нечего.
 *
 * Две степени разом получает тот, у кого истощение УЖЕ есть (`[3]/blocks[32]`),
 * и уровень для этого читается тем же `exhaustionLevelOf`, которым его читает
 * лист персонажа: второго разбора состояний здесь нет.
 */
export function resolveWaterDay(
  conditions: string[],
  share: WaterShare,
  hot: boolean,
): WaterDayOutcome | null {
  const gallonsNeeded = waterGallonsNeeded(hot);
  if (share === "full") return null;
  const degrees = exhaustionLevelOf(conditions) >= 1 ? 2 : 1;
  const alreadyNote = degrees === 2 ? " (уже истощён — сразу две степени)" : "";
  if (share === "half") {
    return {
      saveDc: WATER_HALF_RATION_SAVE_DC,
      degrees,
      gallonsNeeded,
      reason: `Половина нормы (${gallonsNeeded / 2} гал. из ${gallonsNeeded}) — спасбросок Телосложения СЛ ${WATER_HALF_RATION_SAVE_DC}${alreadyNote}`,
    };
  }
  return {
    saveDc: null,
    degrees,
    gallonsNeeded,
    reason: `Меньше половины нормы (${gallonsNeeded} гал.) — истощение без броска${alreadyNote}`,
  };
}

/**
 * Почему степень истощения от голода и жажды снимается на листе руками, как и
 * всякая другая. Правило `[3]/blocks[25]` знает происхождение каждой ступени, а
 * лист — нет, и подпись честно про это говорит.
 */
export const FOOD_EXHAUSTION_HINT =
  "Истощение от голода и жажды нельзя снять, пока персонаж не получит полную норму еды и воды (SRD, «Еда и вода»). Приложение происхождение ступеней не помнит: на листе они снимаются, как любые другие, — за этим следит Мастер.";
