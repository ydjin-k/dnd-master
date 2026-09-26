import { describe, it, expect } from "vitest";
import { hitDiceLeft, restoreHitDice, spendHitDie } from "./hitDice";

/**
 * Предел Костей Хитов живёт здесь один на все пути записи (кнопка траты,
 * короткий отдых, длинный отдых), поэтому и проверяется он здесь. Пробы
 * отрицательные: сними `hitDiceLeft(...) > 0` из `spendHitDie` — краснеет
 * «пустой запас», сними `Math.min(..., current)` из `restoreHitDice` —
 * краснеет «больше потраченного не вернуть».
 */
describe("hitDice", () => {
  it("осталось — это уровень минус потраченное, максимум не хранится", () => {
    expect(hitDiceLeft(0, 5)).toBe(5);
    expect(hitDiceLeft(2, 5)).toBe(3);
    expect(hitDiceLeft(5, 5)).toBe(0);
  });

  it("ноль потраченного у старого сохранения — это полный запас, а не пустой", () => {
    expect(hitDiceLeft(0, 8)).toBe(8);
  });

  it("трата уменьшает остаток ровно на одну кость за вызов", () => {
    expect(spendHitDie(0, 3)).toBe(1);
    expect(spendHitDie(spendHitDie(0, 3), 3)).toBe(2);
  });

  it("пустой запас тратить нечем: потраченное не растёт выше уровня", () => {
    expect(spendHitDie(3, 3)).toBe(3);
    expect(hitDiceLeft(spendHitDie(3, 3), 3)).toBe(0);
  });

  it("возврат больше потраченного невозможен: потрачена одна из десяти — вернётся одна", () => {
    expect(restoreHitDice(1, 10, 5)).toBe(0);
  });

  it("возврат половины максимума: на 8 уровне четыре кости из восьми потраченных", () => {
    expect(restoreHitDice(8, 8, 4)).toBe(4);
    expect(hitDiceLeft(restoreHitDice(8, 8, 4), 8)).toBe(4);
  });

  it("ноль, отрицательное и не-число костей не возвращают и не отнимают", () => {
    expect(restoreHitDice(2, 4, 0)).toBe(2);
    expect(restoreHitDice(2, 4, -5)).toBe(2);
    expect(restoreHitDice(2, 4, Number.NaN)).toBe(2);
  });

  it("дробное округляется вниз: полторы кости — это одна", () => {
    expect(restoreHitDice(2, 4, 1.9)).toBe(1);
  });

  it("левел-ап поднимает запас сам, потраченные обратно не даёт", () => {
    const spent = spendHitDie(spendHitDie(0, 1), 1); // 1 уровень: тратится ровно одна
    expect(spent).toBe(1);
    expect(hitDiceLeft(spent, 1)).toBe(0);
    expect(hitDiceLeft(spent, 2)).toBe(1); // уровень 2 — запас 2, потраченная так и осталась
  });

  it("потраченное выше уровня (старое сохранение, странные данные) — это пустой запас, а не долг", () => {
    expect(hitDiceLeft(99, 5)).toBe(0);
    expect(restoreHitDice(99, 5, 1)).toBe(4);
    expect(spendHitDie(99, 5)).toBe(5);
  });

  it("уровень 0 и нечисловые данные не дают ни костей, ни отрицательного остатка", () => {
    expect(hitDiceLeft(0, 0)).toBe(0);
    expect(hitDiceLeft(Number.NaN, 4)).toBe(4);
    expect(hitDiceLeft(0, Number.NaN)).toBe(0);
  });
});
