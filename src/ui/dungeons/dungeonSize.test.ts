import { describe, expect, it } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../../state/types";
import type { DwellerSource } from "./dungeonDwellers";
import { generateDungeon } from "./dungeonGenerator";
import { readTrapNumbers, type TrapNumbers } from "./trapNumbers";
import mediumPlan from "./__fixtures__/mediumPlan.20261018.json";

/**
 * Размер, назначение и семя подземелья.
 *
 * Главная проба здесь — эталон: схема семени 20261018 записана в
 * `__fixtures__/mediumPlan.20261018.json` ДО правок генератора (коммит с
 * эталоном предшествует коммиту с размерами) и сравнивается целиком. Числа
 * эталона не выводятся из констант генератора, поэтому сдвиг в броске,
 * порядке бросков или в сетке «Среднего» краснеет здесь, а не остаётся
 * незамеченным.
 */

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
const bestiary = bundledBestiary as DwellerSource[];

describe("размер подземелья", () => {
  it("«Среднее» со случайным назначением — схема, равная схеме до правки", () => {
    const plan = generateDungeon({
      seed: 20261018,
      partyLevel: 3,
      danger: "Опасная",
      numbers,
      bestiary,
    });
    expect(JSON.parse(JSON.stringify(plan))).toEqual(mediumPlan);
  });
});
