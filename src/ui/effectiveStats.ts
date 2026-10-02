/**
 * Эффективные значения листа персонажа — ОДИН владелец на все четыре источника.
 *
 * До этого файла пересчётов на листе было три, и каждый жил своей инлайновой
 * арифметикой в `pages/CharactersPage.tsx`: темп путешествия вычитал из
 * пассивной внимательности, «Чувствительность к солнечному свету» вычитала из
 * результата первого, нагрузка отнимала футы у скорости. Состояния стали бы
 * четвёртым. Порядок между ними держался на том, в каком порядке кто-то написал
 * строки в теле компонента, — то есть не был объявлен нигде.
 *
 * Здесь он ОБЪЯВЛЕН: у каждого числа листа свой список слоёв
 * (`SPEED_LAYER_ORDER`, `MAX_HP_LAYER_ORDER`, `PASSIVE_LAYER_ORDER`), слои
 * применяются сверху вниз, и результат несёт с собой список применённых слоёв —
 * лист показывает подписи из него, а не собирает их второй раз.
 *
 * **Что здесь НЕ живёт.** Ни одно правило-источник сюда не переписано:
 * - штраф быстрого темпа — `travelPace.ts` (`pacePassivePenalty`);
 * - штраф нагрузки — `characterCreationData.ts` (`encumbranceSpeedPenaltyFeet`);
 * - уровень истощения, его накопление и снятие — `exhaustion.ts`
 *   (`exhaustionLevelOf`), оттуда же номера уровней-с-числами;
 * - цена «Чувствительности к солнечному свету» — `abyssElfRace.ts`
 *   (`DISADVANTAGE_PASSIVE_PENALTY`).
 *
 * Этот файл — только порядок наложения и арифметика слоя.
 *
 * **Хранимое не меняется.** `maxHp`, `speedFeet`, `passivePerception` остаются
 * в сохранении базой (`state/types.ts`), и ни одна функция здесь в персонажа не
 * пишет. Истощение уровня 4 половинит ПОКАЗАННЫЙ максимум; половинить
 * хранимый нельзя — цикл «получил ур. 4 → отдохнул» необратимо срезал бы
 * персонажу половину запаса.
 *
 * Числа состояний прочитаны в `src-tauri/rules/rules.json`, раздел `[14]`
 * `appendices-conditions`, построчно — адреса блоков стоят у каждой константы.
 */

import { encumbranceSpeedPenaltyFeet, type EncumbranceLevel } from "./characterCreationData";
import {
  EXHAUSTION_HALF_MAX_HP_LEVEL,
  EXHAUSTION_HALF_SPEED_LEVEL,
  EXHAUSTION_ZERO_SPEED_LEVEL,
  exhaustionLevelOf,
} from "./exhaustion";
import { pacePassivePenalty } from "./travelPace";

/**
 * Что слой делает с числом. Три действия, и больше их не нужно: таблица SRD
 * говорит либо «вдвое», либо «до 0», либо даёт плоский штраф числом.
 *
 * `locked` у нуля — не украшение, а оговорка источника: «не может извлечь
 * выгоду из какого-либо бонуса к своей скорости» (`[14]/blocks[21]`,
 * Схваченное) и «никакие эффекты не могут повысить его скорость»
 * (`[14]/blocks[35]`, Опутанный). Такой ноль не поднимает ни один слой,
 * считающийся ПОСЛЕ него.
 */
export type LayerEffect =
  | { readonly kind: "add"; readonly delta: number }
  | { readonly kind: "halve" }
  | { readonly kind: "zero"; readonly locked: boolean };

/** Слой пересчёта: кто его наложил, что он делает и как подписать его на листе. */
export interface StatLayer {
  /** Источник — тем же словом, каким он назван игроку (состояние, темп, нагрузка). */
  readonly source: string;
  /** Подпись под плиткой: источник и его цена числом. */
  readonly note: string;
  readonly effect: LayerEffect;
}

/** Выведенное число: база из сохранения, результат и список применённых слоёв. */
export interface DerivedStat {
  /** Хранимое значение — то, что лежит в сохранении и не меняется. */
  readonly base: number;
  /** Что показывает лист. */
  readonly value: number;
  /** Применённые слои в объявленном порядке — подписи лист берёт отсюда. */
  readonly layers: readonly StatLayer[];
  /** Ноль, который не поднимет никакой последующий бонус. */
  readonly locked: boolean;
}

/**
 * Делим — округляем в МЕНЬШУЮ сторону. Это НАШЕ решение, а не строка источника:
 * общего правила округления в вендоренном SRD нет (есть только частные —
 * модификатор характеристики `[0]/blocks[11]`, Дикий облик `[32]/blocks[42]`),
 * а таблица истощения говорит «уменьшается вдвое», не уточняя нечётного случая.
 * Выбрано вниз: вверх округлённая половина дала бы персонажу со скоростью 25
 * тринадцать футов из двенадцати с половиной, то есть ПОДАРИЛА бы пол-фута
 * штрафа обратно. Тем же вниз округляет половину уровня `longRestHitDiceBack`.
 */
function halved(value: number): number {
  return Math.floor(value / 2);
}

/**
 * Применяет слои к базе в том порядке, в каком они пришли. Ниже нуля число не
 * уходит никогда: нагруженный под «Схваченным» обязан показать 0, а не
 * отрицательные футы.
 *
 * Замок (`zero` с `locked`) гасит ровно ПОДЪЁМ, а не весь последующий счёт:
 * штраф и второй ноль, пришедшие после замка, просто ничего не меняют (ноль и
 * так ноль) и остаются в `layers` подписями, а положительный `add`
 * отбрасывается — в этом и состоит оговорка источника про бонусы. Отброшенный
 * слой в `layers` не попадает: на листе он не цена, а ничто.
 */
function applyLayers(base: number, layers: readonly StatLayer[]): DerivedStat {
  let value = base;
  let locked = false;
  const applied: StatLayer[] = [];
  for (const layer of layers) {
    if (locked && layer.effect.kind === "add" && layer.effect.delta > 0) continue;
    switch (layer.effect.kind) {
      case "add":
        value = Math.max(0, value + layer.effect.delta);
        break;
      case "halve":
        value = halved(Math.max(0, value));
        break;
      case "zero":
        value = 0;
        locked = locked || layer.effect.locked;
        break;
    }
    applied.push(layer);
  }
  return { base, value: Math.max(0, value), layers: applied, locked };
}

/**
 * Состояния, у которых SRD говорит про скорость ПРЯМО и добавляет, что бонусы
 * её не поднимают:
 * - «Скорость схваченного существа становится 0, и оно не может извлечь выгоду
 *   из какого-либо бонуса к своей скорости» — `[14]/blocks[21]`, Схваченное;
 * - «Скорость опутанного существа становится 0, и никакие эффекты не могут
 *   повысить его скорость» — `[14]/blocks[35]`, Опутанный.
 */
export const SPEED_ZERO_LOCKED_CONDITIONS: readonly string[] = ["Схваченное", "Опутанный"];

/**
 * Состояния, у которых сказано «не может двигаться», а не «скорость 0»:
 * Парализованное (`[14]/blocks[27]`), Окаменевшее (`[14]/blocks[29]`),
 * Оглушенное (`[14]/blocks[37]`), Бессознательный (`[14]/blocks[39]`).
 *
 * **Решение: на листе это ноль скорости, и ноль с замком.** Лист показывает
 * скорость в футах, то есть «сколько существо может пройти прямо сейчас»;
 * у того, кто двигаться не может, это ноль, и показывать ему 30 футов значило
 * бы ровно то ложное второе утверждение, из-за которого эта карточка и
 * появилась. Замок — потому что «не может двигаться» сильнее, чем «скорость 0»:
 * бонус к скорости не превращает запрет двигаться в движение.
 *
 * Цена решения названа: формулировка источника у этих четырёх другая, и если
 * правило когда-нибудь разойдётся с нашим чтением — расходиться оно будет
 * здесь, одним списком, а не в четырёх местах.
 */
export const CANNOT_MOVE_CONDITIONS: readonly string[] = [
  "Парализованное",
  "Окаменевшее",
  "Оглушенное",
  "Бессознательный",
];

/**
 * Объявленный порядок слоёв скорости. Это не комментарий: `speedLayers` строит
 * слои ровно в этом порядке, а проба `SPEED_LAYER_ORDER` его сторожит.
 *
 * Почему именно так:
 * 1. плоские штрафы раньше множителей — иначе «вдвое» считалось бы от числа,
 *    которого у персонажа уже нет;
 * 2. нули — после них: ноль не зависит от того, что было до, а всё, что
 *    считается до, он отменяет;
 * 3. замки — последними из нулей, чтобы бонусы отбрасывал именно замок;
 * 4. бонусы — в самом конце, потому что только там оговорка источника про
 *    «никакой бонус не поднимет» имеет смысл.
 */
export const SPEED_LAYER_ORDER: readonly string[] = [
  "нагрузка",
  "истощение: половина скорости",
  "истощение: скорость 0",
  "состояния «скорость 0»",
  "состояния «не может двигаться»",
  "бонусы к скорости",
];

/** Объявленный порядок слоёв максимума хитов — истощение ур. 4 и больше ничего. */
export const MAX_HP_LAYER_ORDER: readonly string[] = ["истощение: половина максимума хитов"];

/**
 * Объявленный порядок слоёв пассивной внимательности. Солнечный свет считается
 * ОТ числа с темпом, а не от листового: иначе на быстром темпе особенность
 * обещала бы под солнцем внимательность выше той, что стоит на плитке рядом.
 * Применяет его `withSunlitPassive` (`abyssElfRace.ts`) к `value` этого
 * владельца — поэтому слой назван здесь, а не только там.
 */
export const PASSIVE_LAYER_ORDER: readonly string[] = [
  "темп путешествия",
  "чувствительность к солнечному свету (в тексте особенности)",
];

/** Из чего выводятся числа листа. Персонаж приходит целиком, но читаются только эти поля. */
export interface EffectiveStatsInput {
  readonly maxHp: number;
  readonly currentHp: number;
  readonly speedFeet: number;
  readonly passivePerception: number;
  readonly conditions: readonly string[];
  /** id темпа отряда (`travelPace.ts`); пусто у кампании, не выходившей в путь. */
  readonly travelPace?: string | null;
  /** Уровень нагрузки (`encumbranceLevel`); по умолчанию обычный. */
  readonly encumbrance?: EncumbranceLevel;
  /**
   * Бонусы к скорости в футах — последний слой `SPEED_LAYER_ORDER`.
   *
   * Он здесь не «на будущее»: без него оговорку источника «не может извлечь
   * выгоду из какого-либо бонуса» нечем ни выразить, ни проверить, а DoD
   * карточки требует на неё отдельную пробу. Сегодня лист бонусов к скорости не
   * знает и передаёт пусто.
   */
  readonly speedBonusesFeet?: readonly number[];
}

/** Числа листа, выведенные из хранимых. */
export interface EffectiveStats {
  readonly maxHp: DerivedStat;
  readonly speedFeet: DerivedStat;
  readonly passivePerception: DerivedStat;
  /**
   * Текущие хиты, какими их показывает лист: не выше эффективного максимума.
   *
   * **Решение: обрезаем при ПОКАЗЕ, а не при записи.** Хранимое `currentHp`
   * остаётся как есть — ровно по той же причине, по которой не половинится
   * хранимый `maxHp`: обрезав при записи, мы потеряли бы хиты насовсем, и
   * снятие истощения вернуло бы максимум, но не их. Цена выбранного названа:
   * персонаж на 40/40, получив ур. 4, видит 20/20, а сняв его — снова 40/40;
   * половина запаса не «потратилась», она просто была недоступна, пока
   * истощение держалось.
   */
  readonly currentHp: number;
  /** Хранимые текущие хиты выше эффективного максимума — показ обрезан. */
  readonly currentHpClamped: boolean;
}

/** Слои скорости — в порядке `SPEED_LAYER_ORDER`. */
function speedLayers(input: EffectiveStatsInput): StatLayer[] {
  const layers: StatLayer[] = [];
  const encumbrance = input.encumbrance ?? "normal";
  const penaltyFeet = encumbranceSpeedPenaltyFeet(encumbrance);
  if (penaltyFeet > 0) {
    layers.push({
      source: "нагрузка",
      note: `нагрузка −${penaltyFeet} фт`,
      effect: { kind: "add", delta: -penaltyFeet },
    });
  }
  const exhaustion = exhaustionLevelOf([...input.conditions]);
  if (exhaustion >= EXHAUSTION_HALF_SPEED_LEVEL) {
    layers.push({
      source: `Истощение (ур. ${EXHAUSTION_HALF_SPEED_LEVEL})`,
      note: `истощение ур. ${EXHAUSTION_HALF_SPEED_LEVEL} — вдвое`,
      effect: { kind: "halve" },
    });
  }
  if (exhaustion >= EXHAUSTION_ZERO_SPEED_LEVEL) {
    layers.push({
      source: `Истощение (ур. ${EXHAUSTION_ZERO_SPEED_LEVEL})`,
      note: `истощение ур. ${EXHAUSTION_ZERO_SPEED_LEVEL} — 0 фт`,
      // Без замка: у таблицы истощения оговорки про бонусы нет, в отличие от
      // Схваченного и Опутанного. Формулировка источника разная — и здесь она
      // разная тоже.
      effect: { kind: "zero", locked: false },
    });
  }
  for (const condition of SPEED_ZERO_LOCKED_CONDITIONS) {
    if (input.conditions.includes(condition)) {
      layers.push({
        source: condition,
        note: `${condition} — 0 фт, и бонусы её не поднимают`,
        effect: { kind: "zero", locked: true },
      });
    }
  }
  for (const condition of CANNOT_MOVE_CONDITIONS) {
    if (input.conditions.includes(condition)) {
      layers.push({
        source: condition,
        note: `${condition} — не может двигаться, 0 фт`,
        effect: { kind: "zero", locked: true },
      });
    }
  }
  for (const bonus of input.speedBonusesFeet ?? []) {
    if (bonus === 0) continue;
    layers.push({
      source: "бонус к скорости",
      note: bonus > 0 ? `бонус +${bonus} фт` : `бонус ${bonus} фт`,
      effect: { kind: "add", delta: bonus },
    });
  }
  return layers;
}

/** Слои максимума хитов — истощение ур. 4, `[14]/blocks[13]`, строка «4». */
function maxHpLayers(input: EffectiveStatsInput): StatLayer[] {
  const exhaustion = exhaustionLevelOf([...input.conditions]);
  if (exhaustion < EXHAUSTION_HALF_MAX_HP_LEVEL) return [];
  return [
    {
      source: `Истощение (ур. ${EXHAUSTION_HALF_MAX_HP_LEVEL})`,
      note: `истощение ур. ${EXHAUSTION_HALF_MAX_HP_LEVEL} — максимум вдвое, в сохранении ${input.maxHp}`,
      effect: { kind: "halve" },
    },
  ];
}

/** Слои пассивной внимательности — темп отряда; солнечный свет см. `PASSIVE_LAYER_ORDER`. */
function passiveLayers(input: EffectiveStatsInput): StatLayer[] {
  const penalty = pacePassivePenalty(input.travelPace);
  if (penalty === 0) return [];
  return [
    {
      source: "темп путешествия",
      note: `быстрый темп −${penalty}`,
      effect: { kind: "add", delta: -penalty },
    },
  ];
}

/**
 * Числа листа персонажа, выведенные из хранимых. Единственный вход для листа:
 * инлайновой арифметики над `speedFeet`, `passivePerception` и `maxHp` на
 * странице персонажей больше нет.
 *
 * Персонаж без состояний, на обычном темпе и без нагрузки получает ровно свои
 * хранимые числа — поэтому сохранение, записанное до этой карточки, показывает
 * прежний лист, а не пересчитанный.
 */
export function effectiveStats(input: EffectiveStatsInput): EffectiveStats {
  const maxHp = applyLayers(input.maxHp, maxHpLayers(input));
  const currentHp = Math.min(input.currentHp, maxHp.value);
  return {
    maxHp,
    speedFeet: applyLayers(input.speedFeet, speedLayers(input)),
    passivePerception: applyLayers(input.passivePerception, passiveLayers(input)),
    currentHp,
    currentHpClamped: input.currentHp > maxHp.value,
  };
}
