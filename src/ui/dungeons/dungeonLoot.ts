import { COIN_DENOMINATIONS } from "../characterCreationData";
import type { Coins } from "../../state/types";
import { tierForLevel } from "./dungeonDwellers";
import type { SeededDice } from "./seededRandom";

/**
 * Числа ПОДСКАЗКИ к находке подземелья: монеты с драгоценностями или
 * магический предмет одной только редкости.
 *
 * Сама собой находка содержимого больше не получает (решение владельца
 * 22.10.2026): что найдено, выбирает мастер, и его выбор живёт в
 * `dungeonLootChoice.ts`. Эти числа бросаются ТОЛЬКО по кнопке «Предложить» —
 * и бросаются своим случаем, а не семенем схемы, поэтому схема того же семени
 * от нажатия не сдвигается. Единственный зовущий — `suggestLootChoice`.
 *
 * Каталога магических предметов здесь нет и не будет: по решению владельца
 * (18.10.2026) подсказка говорит, что предмет магический и какой он редкости, а
 * какой именно предмет найдут игроки, решает мастер за столом.
 *
 * Числа — свои, студийные. Таблицы сокровищ «Руководства мастера» источником
 * не брались: ни их суммы, ни их распределения. Растут они по ступени отряда,
 * и ступень здесь НЕ объявлена второй раз — её границы живут в `DWELLER_TIERS`
 * (`dungeonDwellers.ts`), а ступень находится через `tierForLevel`; ключ
 * ступени в таблице ниже — её `fromLevel`.
 *
 * Сокращения монет (`зм`, `см`, `мм`, `эм`, `пм`) тоже не переписаны: они
 * берутся из `COIN_DENOMINATIONS` — того же списка, по которому подписан лист
 * персонажа. Разъехаться им негде.
 */

/** Редкости магического предмета — от обычного к легендарному. */
export const LOOT_RARITIES = [
  "обычный",
  "необычный",
  "редкий",
  "очень редкий",
  "легендарный",
] as const;
export type LootRarity = (typeof LOOT_RARITIES)[number];

/** Магический предмет: одна редкость, названия предмета нет. */
export interface MagicItemFind {
  readonly kind: "magic";
  readonly rarity: LootRarity;
}

/** Монеты и драгоценности: суммы по номиналам и названия камней. */
export interface CoinsFind {
  readonly kind: "coins";
  /** Номинал листа персонажа → сумма. Нулей в записи нет вовсе. */
  readonly coins: Partial<Record<keyof Coins, number>>;
  /** Названия камней, без цены; от нуля до двух, и они не повторяются. */
  readonly gems: readonly string[];
}

/** Что выпало в подсказке: её разбирает `suggestLootChoice`. */
export type LootContents = CoinsFind | MagicItemFind;

/**
 * Названия драгоценных камней — список студии. Цены у камня нет нарочно:
 * находка называет камень, а сколько он стоит в этом мире, решает мастер.
 */
export const LOOT_GEMS = [
  "аметист",
  "гранат",
  "жемчуг",
  "нефрит",
  "топаз",
  "обсидиан",
  "сердолик",
  "малахит",
  "оникс",
  "бирюза",
  "янтарь",
  "лазурит",
] as const;

/**
 * Номинал в находке: вилка суммы (от и до включительно) и доля находок, в
 * которых он вообще встречается. Доли нет — номинал есть всегда, и у каждой
 * ступени такой номинал один: им находка и держится непустой.
 *
 * Отсутствие номинала решает ЭТА доля, а не нулевая сумма: вилки начинаются с
 * единицы, и «ноль золотых» в записи завестись нечем.
 */
type CoinSpec = readonly [number, number] | readonly [number, number, number];

interface LootTier {
  /** `fromLevel` ступени отряда из `DWELLER_TIERS` — ключ, а не вторая граница. */
  readonly fromLevel: number;
  /** Доля находок, которые оказываются магическим предметом. */
  readonly magicShare: number;
  /** Веса редкостей; номинал без веса на этой ступени не выпадает вовсе. */
  readonly rarity: Partial<Record<LootRarity, number>>;
  /** Вилки сумм; номинала без вилки на этой ступени в находке нет вовсе. */
  readonly coins: Partial<Record<keyof Coins, CoinSpec>>;
  /** Веса числа камней: ноль, один, два. */
  readonly gemWeights: readonly [number, number, number];
}

/**
 * Ступени находки. Доля магических растёт с 10 % на 1–4 до 55 % на 17–20;
 * легендарный предмет объявлен ТОЛЬКО на 17–20, и ниже ему выпасть нечем —
 * веса там для него нет.
 *
 * Монеты на 1–4 — единицы и десятки серебра и меди, золото там редкий гость
 * (треть находок) и единицами; дальше оно и растёт, и встречается в каждой
 * находке, а на 17–20 к нему прибавляется платина. В находке обычно два-три
 * номинала, как в образце владельца («5 зм, 10 см, аметист»), а не весь
 * столбик монет листа персонажа сразу.
 */
export const LOOT_TIERS: readonly LootTier[] = [
  {
    fromLevel: 1,
    magicShare: 0.1,
    rarity: { обычный: 70, необычный: 30 },
    coins: { gold: [1, 8, 0.3], silver: [2, 25], copper: [5, 40, 0.85] },
    gemWeights: [60, 35, 5],
  },
  {
    fromLevel: 5,
    magicShare: 0.25,
    rarity: { обычный: 35, необычный: 45, редкий: 20 },
    coins: { gold: [10, 60], electrum: [1, 10, 0.3], silver: [5, 40, 0.8], copper: [1, 30, 0.5] },
    gemWeights: [45, 40, 15],
  },
  {
    fromLevel: 11,
    magicShare: 0.4,
    rarity: { необычный: 25, редкий: 45, "очень редкий": 30 },
    coins: { platinum: [1, 8, 0.45], gold: [50, 250], electrum: [1, 20, 0.4], silver: [1, 30, 0.55] },
    gemWeights: [30, 45, 25],
  },
  {
    fromLevel: 17,
    magicShare: 0.55,
    rarity: { редкий: 30, "очень редкий": 45, легендарный: 25 },
    coins: { platinum: [5, 40, 0.8], gold: [150, 700], electrum: [1, 30, 0.35] },
    gemWeights: [20, 45, 35],
  },
];

/**
 * Номиналы от дорогого к дешёвому: в этом порядке суммы и бросаются, и
 * выписываются в строку («5 зм, 10 см» из образца владельца). Порядок выведен
 * из цены номинала, а не задан вторым списком.
 */
const DENOMINATIONS = [...COIN_DENOMINATIONS].sort((a, b) => b.copperValue - a.copperValue);

/** Ступень находки по уровню отряда. */
export function lootTierForLevel(partyLevel: number): LootTier {
  const { fromLevel } = tierForLevel(partyLevel);
  return LOOT_TIERS.find((t) => t.fromLevel === fromLevel) ?? LOOT_TIERS[0];
}

/** Одно из значений по весам; вес 0 или отсутствие веса — не выпадает. */
function weighted<T>(dice: SeededDice, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let left = dice.int(1, total);
  for (const [value, weight] of entries) {
    left -= weight;
    if (left <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Веса редкостей ступени — в порядке `LOOT_RARITIES`, а не ключей объекта. */
function rarityEntries(tier: LootTier): readonly (readonly [LootRarity, number])[] {
  return LOOT_RARITIES.flatMap((rarity) => {
    const weight = tier.rarity[rarity] ?? 0;
    return weight > 0 ? [[rarity, weight] as const] : [];
  });
}

function rollGems(dice: SeededDice, tier: LootTier): string[] {
  const count = weighted(dice, tier.gemWeights.map((weight, n) => [n, weight] as const));
  const left = [...LOOT_GEMS] as string[];
  const gems: string[] = [];
  for (let k = 0; k < count; k += 1) {
    // Два камня одной находки — разные: «аметист, аметист» читается ошибкой.
    const gem = dice.pick(left);
    gems.push(gem);
    left.splice(left.indexOf(gem), 1);
  }
  return gems;
}

/**
 * Одна подсказка: сначала вид (магический предмет или монеты), затем его
 * числа. Чистая функция кости и уровня — та же кость даёт ту же подсказку,
 * поэтому проба бросает её своим семенем, а «Предложить» — случайным.
 */
export function rollLootContents(dice: SeededDice, partyLevel: number): LootContents {
  const tier = lootTierForLevel(partyLevel);
  if (dice.chance(tier.magicShare)) {
    return { kind: "magic", rarity: weighted(dice, rarityEntries(tier)) };
  }
  const coins: Partial<Record<keyof Coins, number>> = {};
  for (const denomination of DENOMINATIONS) {
    const spec = tier.coins[denomination.key];
    if (!spec) continue;
    const [min, max, share] = spec;
    // Доля бросается ДО суммы и всегда: номинал, которого в находке не
    // оказалось, не должен сдвигать суммы остальных.
    const present = share === undefined || dice.chance(share);
    const amount = dice.int(min, max);
    if (present) coins[denomination.key] = amount;
  }
  return { kind: "coins", coins, gems: rollGems(dice, tier) };
}

/**
 * Строка подсказки: «5 зм, 10 см, аметист» или «магический предмет, редкость:
 * редкий». Пустых частей в ней нет — номинала, которого в подсказке нет,
 * строка не упоминается, и «0 зм» в ней не бывает даже у записи, где ноль
 * почему-то лежит. Суммы из неё «Предложить» подставляет мастеру в описание.
 */
export function lootContentsLine(contents: LootContents): string {
  if (contents.kind === "magic") return `магический предмет, редкость: ${contents.rarity}`;
  const coins = DENOMINATIONS.flatMap((denomination) => {
    const amount = contents.coins[denomination.key] ?? 0;
    return amount > 0 ? [`${amount} ${denomination.label}`] : [];
  });
  return [...coins, ...contents.gems].join(", ");
}
