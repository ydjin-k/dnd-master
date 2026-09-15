import { describe, it, expect } from "vitest";
import { restoreAllSlots, restoreSlots, spentSlots } from "./spellSlots";

/**
 * Предел возврата ячеек живёт здесь один на все пути (кнопка круга, «всё»,
 * эффект архетипа), поэтому и проверяется он здесь. Пробы отрицательные: сними
 * `Math.min` с потраченным в `restoreSlots` — краснеют «больше максимума» и
 * «больше потраченного» разом.
 */
describe("spellSlots", () => {
  const max = [4, 3, 2, 0, 0];

  it("потрачено — это разница с максимумом, а не само число ячеек", () => {
    expect(spentSlots([4, 0, 2, 0, 0], max, 2)).toBe(3);
    expect(spentSlots([4, 3, 2, 0, 0], max, 2)).toBe(0);
    expect(spentSlots([4, 3, 2, 0, 0], max, 4)).toBe(0); // круга нет вовсе
  });

  it("возврат больше максимума невозможен: просят 9 при трёх потраченных — вернётся три", () => {
    expect(restoreSlots([4, 0, 2, 0, 0], max, 2, 9)).toEqual([4, 3, 2, 0, 0]);
  });

  it("возврат больше потраченного невозможен: просят 3 при одной потраченной — вернётся одна", () => {
    expect(restoreSlots([4, 2, 2, 0, 0], max, 2, 3)).toEqual([4, 3, 2, 0, 0]);
  });

  it("возврат меняет только свой круг", () => {
    expect(restoreSlots([0, 0, 0, 0, 0], max, 2, 1)).toEqual([0, 1, 0, 0, 0]);
  });

  it("ноль, отрицательное и не-число ячеек не добавляют и не отнимают", () => {
    expect(restoreSlots([1, 1, 1, 0, 0], max, 2, 0)).toEqual([1, 1, 1, 0, 0]);
    expect(restoreSlots([1, 1, 1, 0, 0], max, 2, -5)).toEqual([1, 1, 1, 0, 0]);
    expect(restoreSlots([1, 1, 1, 0, 0], max, 2, Number.NaN)).toEqual([1, 1, 1, 0, 0]);
  });

  it("дробное округляется вниз: полторы ячейки — это одна", () => {
    expect(restoreSlots([0, 0, 0, 0, 0], max, 1, 1.9)).toEqual([1, 0, 0, 0, 0]);
  });

  it("«вернуть всё» поднимает каждый круг ровно до максимума", () => {
    expect(restoreAllSlots([0, 1, 0, 0, 0], max)).toEqual([4, 3, 2, 0, 0]);
    expect(restoreAllSlots([4, 3, 2, 0, 0], max)).toEqual([4, 3, 2, 0, 0]);
  });

  it("запас выше максимума (старое сохранение) не считается тратой и не растёт дальше", () => {
    expect(spentSlots([9, 3, 2, 0, 0], max, 1)).toBe(0);
    expect(restoreSlots([9, 3, 2, 0, 0], max, 1, 5)).toEqual([9, 3, 2, 0, 0]);
  });
});
