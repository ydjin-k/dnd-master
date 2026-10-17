/**
 * Кость с семенем для генератора подземелья: одно семя — одно подземелье.
 *
 * `roll_dice` движка здесь не годится: он бросает честно случайно, а схеме
 * нужна повторяемость (пробы и пересборка по семени). Алгоритм — mulberry32:
 * 32-битное состояние, без зависимостей, одинаков в любом окружении.
 */
export interface SeededDice {
  /** Целое от `min` до `max` включительно. */
  int(min: number, max: number): number;
  /** Бросок кости `1dN`. */
  die(sides: number): number;
  /** Один элемент списка. */
  pick<T>(items: readonly T[]): T;
  /** Вероятность `p` от 0 до 1. */
  chance(p: number): boolean;
}

export function seededDice(seed: number): SeededDice {
  let state = seed | 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    int,
    die: (sides) => int(1, sides),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
}
