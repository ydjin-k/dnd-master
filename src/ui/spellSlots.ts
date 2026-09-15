/**
 * Ячейки заклинаний: возврат потраченного.
 *
 * ЕДИНСТВЕННЫЙ ВЛАДЕЛЕЦ предела «не выше максимума и не ниже нуля». Все пути
 * возврата на листе персонажа — кнопка круга, «Восстановить все ячейки» и
 * эффект `restore-slot` архетипа («Неутомимый шаг» следопыта) — считают новое
 * состояние здесь, а не повторяют свой `Math.min` у каждой кнопки.
 *
 * Трата ячейки сюда не входит: её владелец — `freeSlotIndex` на листе, там
 * своё правило SRD «ячейкой своего круга или любого старшего».
 */

/**
 * Сколько ячеек этого круга потрачено — ровно столько и можно вернуть.
 * Значение выше максимума (данные старого сохранения) считается полным
 * запасом, а не отрицательной тратой.
 */
export function spentSlots(current: number[], max: number[], circle: number): number {
  const i = circle - 1;
  const cap = Math.max(0, max[i] ?? 0);
  const free = Math.max(0, Math.min(cap, current[i] ?? 0));
  return cap - free;
}

/**
 * Возврат `count` ячеек одного круга (круг считается от 1). Больше
 * потраченного не вернётся, отрицательное и нечисловое `count` возвращают ноль
 * ячеек — то есть выйти за `max` или уйти ниже нуля этим путём нельзя.
 */
export function restoreSlots(current: number[], max: number[], circle: number, count: number): number[] {
  const i = circle - 1;
  const asked = Math.floor(count);
  const back = Math.min(Math.max(0, Number.isFinite(asked) ? asked : 0), spentSlots(current, max, circle));
  const length = Math.max(current.length, max.length);
  return Array.from({ length }, (_, j) => Math.max(0, current[j] ?? 0) + (j === i ? back : 0));
}

/** Возврат всего потраченного во всех кругах — тот же предел, круг за кругом. */
export function restoreAllSlots(current: number[], max: number[]): number[] {
  return max.reduce(
    (slots, _max, i) => restoreSlots(slots, max, i + 1, spentSlots(slots, max, i + 1)),
    current,
  );
}
