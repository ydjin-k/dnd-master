import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../state/types";
import { exhaustionLevelName } from "./exhaustion";
import {
  DAYS_WITHOUT_FOOD_BASE,
  FOOD_LB_PER_DAY,
  WATER_GALLONS_PER_DAY,
  WATER_GALLONS_PER_DAY_HOT,
  WATER_HALF_RATION_SAVE_DC,
  daysWithoutFood,
  daysWithoutFoodLimit,
  halfDaysWithoutFoodLimit,
  resolveFoodDay,
  resolveWaterDay,
  waterGallonsNeeded,
} from "./foodAndWater";

const srdTopics = bundledRules as unknown as RuleTopic[];
const environment = srdTopics.find((t) => t.id === "gameplay-environment")!;
const paragraphs = environment.blocks.filter((b) => b.type === "paragraph").map((b) => (b as { text: string }).text);

describe("голод и жажда — числа из rules.json", () => {
  /**
   * Сторож каждого числа этого файла. Три обещанных карточкой числа — предел
   * голода, галлон воды и СЛ 15 — сверяются с абзацами источника, а не с
   * памятью: разъедись любое, падает именно эта проверка.
   */
  it("предел голода, норма воды и СЛ спасброска стоят в источнике", () => {
    expect(
      paragraphs.some((t) =>
        t.includes(`количество дней, равное ${DAYS_WITHOUT_FOOD_BASE} + модификатор Телосложения`),
      ),
    ).toBe(true);
    // Единицы в источнике названы словами — число сверяется отдельно от текста.
    expect(paragraphs.some((t) => t.includes("один фунт еды в день"))).toBe(true);
    expect(FOOD_LB_PER_DAY).toBe(1);
    expect(paragraphs.some((t) => t.includes("в одном галлоне воды в день"))).toBe(true);
    expect(paragraphs.some((t) => t.includes(`два галлона в день, если погода жаркая`))).toBe(true);
    expect(paragraphs.some((t) => t.includes(`спасброске Телосложения со СЛ ${WATER_HALF_RATION_SAVE_DC}`))).toBe(true);
    expect(WATER_GALLONS_PER_DAY).toBe(1);
    expect(WATER_GALLONS_PER_DAY_HOT).toBe(2);
  });

  it("полрациона считается полднём без еды — так и сказано в источнике", () => {
    expect(paragraphs.some((t) => t.includes("Полфунта еды в день считается как полдня без еды"))).toBe(true);
    expect(resolveFoodDay(0, 10, "half").halfDaysWithoutFood).toBe(1);
    expect(daysWithoutFood(1)).toBe(0.5);
  });

  it("автоматическое истощение приходит только ПОСЛЕ предела", () => {
    expect(paragraphs.some((t) => t.includes("В конце каждого дня после этого персонаж автоматически"))).toBe(true);
  });
});

describe("предел дней без еды", () => {
  it("3 + модификатор Телосложения", () => {
    expect(daysWithoutFoodLimit(10)).toBe(3);
    expect(daysWithoutFoodLimit(14)).toBe(5);
    expect(daysWithoutFoodLimit(20)).toBe(8);
  });

  it("минимум один день даже при самом слабом Телосложении", () => {
    expect(daysWithoutFoodLimit(6)).toBe(1);
    expect(daysWithoutFoodLimit(1)).toBe(1);
  });

  it("в полуднях предел ровно вдвое больше", () => {
    expect(halfDaysWithoutFoodLimit(14)).toBe(10);
  });
});

describe("день без еды", () => {
  it("полный рацион сбрасывает счёт до нуля", () => {
    const fed = resolveFoodDay(7, 10, "full");

    expect(fed.halfDaysWithoutFood).toBe(0);
    expect(fed.degrees).toBe(0);
  });

  it("день голода добавляет целый день, полрациона — половину", () => {
    expect(resolveFoodDay(0, 10, "none").halfDaysWithoutFood).toBe(2);
    expect(resolveFoodDay(2, 10, "half").halfDaysWithoutFood).toBe(3);
  });

  it("на пределе истощения ещё нет, за пределом — одна степень", () => {
    // Телосложение 10 → предел три дня, то есть шесть полудней.
    expect(resolveFoodDay(4, 10, "none").degrees).toBe(0);
    expect(resolveFoodDay(5, 10, "half").degrees).toBe(0);
    expect(resolveFoodDay(6, 10, "half").degrees).toBe(1);
    expect(resolveFoodDay(6, 10, "none").degrees).toBe(1);
  });

  it("слабое Телосложение голодает уже на второй день", () => {
    // Предел один день = два полудня.
    expect(resolveFoodDay(0, 6, "none").degrees).toBe(0);
    expect(resolveFoodDay(2, 6, "none").degrees).toBe(1);
  });

  it("подпись называет числа, а не обещания", () => {
    expect(resolveFoodDay(6, 10, "none").reason).toContain("при пределе 3");
    expect(resolveFoodDay(1, 10, "half").reason).toContain("из 3");
  });
});

describe("день без воды", () => {
  it("норма выпита — правилу сказать нечего", () => {
    expect(resolveWaterDay([], "full", false)).toBeNull();
    expect(resolveWaterDay([], "full", true)).toBeNull();
  });

  it("половина нормы требует спасброска Телосложения СЛ 15", () => {
    const half = resolveWaterDay([], "half", false)!;

    expect(half.saveDc).toBe(WATER_HALF_RATION_SAVE_DC);
    expect(half.degrees).toBe(1);
  });

  it("меньше половины — истощение без всякого броска", () => {
    const less = resolveWaterDay([], "less", false)!;

    expect(less.saveDc).toBeNull();
    expect(less.degrees).toBe(1);
  });

  it("уже истощённый получает сразу две степени — в обоих случаях", () => {
    const already = [exhaustionLevelName(1)];

    expect(resolveWaterDay(already, "half", false)!.degrees).toBe(2);
    expect(resolveWaterDay(already, "less", false)!.degrees).toBe(2);
  });

  it("в жару норма — два галлона", () => {
    expect(waterGallonsNeeded(false)).toBe(1);
    expect(waterGallonsNeeded(true)).toBe(2);
    expect(resolveWaterDay([], "less", true)!.gallonsNeeded).toBe(2);
  });
});
