import { describe, expect, it } from "vitest";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../../state/types";
import { findTable, rowForRoll } from "../eventTables";
import {
  buildTrap,
  TRAP_LAYER_TABLE_IDS,
  withLayerRerolled,
  type TrapLayerId,
} from "./trapBuilder";
import { readTrapNumbers, type TrapNumbers } from "./trapNumbers";

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
const allOnes = Object.fromEntries(TRAP_LAYER_TABLE_IDS.map((id) => [id, 1])) as Record<TrapLayerId, number>;

describe("сборка ловушки", () => {
  it("пять слоёв — ровно таблицы группы «Ловушки и препятствия» из восьми тем", () => {
    for (const id of TRAP_LAYER_TABLE_IDS) {
      expect(findTable(id)?.group, id).toBe("Ловушки и препятствия");
    }
    expect(TRAP_LAYER_TABLE_IDS).toHaveLength(5);
  });

  it("строка слоя — та же, что выдаёт rowForRoll каталога, не копия", () => {
    const trap = buildTrap(numbers, 3, "Опасная", {
      layers: { ...allOnes, "trap-clue": 7 },
      saveDcRoll: 2,
      attackRoll: 1,
    });
    const clue = trap.layers.find((l) => l.tableId === "trap-clue")!;
    expect(clue.text).toBe(rowForRoll(findTable("trap-clue")!, 7)!.text);
  });

  it("переброс одного слоя не трогает остальные слои и числа", () => {
    const trap = buildTrap(numbers, 5, "Опасная", {
      layers: { ...allOnes, "trap-effect": 6 },
      saveDcRoll: 3,
      attackRoll: 2,
    });
    const again = withLayerRerolled(numbers, trap, "trap-obstacle", 8);
    expect(again.layers[0].roll).toBe(8);
    expect(again.layers.slice(1)).toEqual(trap.layers.slice(1));
    expect([again.saveDc, again.attackBonus, again.damage]).toEqual([
      trap.saveDc,
      trap.attackBonus,
      trap.damage,
    ]);
  });

  it("бьют только эффекты, помеченные dealsDamage: иглы и падающая тяжесть", () => {
    const hitting = findTable("trap-effect")!
      .rows.filter((row) => row.dealsDamage)
      .map((row) => row.from);
    expect(hitting).toEqual([4, 6]);
    for (let effect = 1; effect <= 8; effect += 1) {
      const trap = buildTrap(numbers, 1, "Неудобство", {
        layers: { ...allOnes, "trap-effect": effect },
        saveDcRoll: 1,
        attackRoll: 1,
      });
      expect(trap.damage !== null, `эффект ${effect}`).toBe(hitting.includes(effect));
      expect(trap.attackBonus !== null, `эффект ${effect}`).toBe(hitting.includes(effect));
    }
  });
});
