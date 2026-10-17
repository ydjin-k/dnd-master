import { describe, expect, it } from "vitest";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../../state/types";
import { buildTrap, TRAP_LAYER_TABLE_IDS, type TrapRolls } from "./trapBuilder";
import {
  rangeRollExpression,
  readTrapNumbers,
  TRAP_DANGERS,
  TRAPS_TOPIC_ID,
  type TrapNumbers,
} from "./trapNumbers";

const topics = bundledRules as RuleTopic[];
const topic = topics.find((t) => t.id === TRAPS_TOPIC_ID)!;

/**
 * Эталон берётся из самого `rules.json` и ПО НОМЕРАМ блоков, названным в
 * карточке (`blocks[20]`, `blocks[22]`), а код ищет таблицы по шапке. Пути
 * разные, поэтому сдвиг в разборе или в выборе строки уровня здесь краснеет,
 * а не совпадает сам с собой.
 */
const severityBlock = topic.blocks[20];
const damageBlock = topic.blocks[22];
if (severityBlock.type !== "table" || damageBlock.type !== "table") {
  throw new Error("в rules.json на местах 20 и 22 раздела ловушек обязаны стоять таблицы");
}

/** «+6 до +8» → [6, 8]; своим разбором, не тем, что у кода. */
const ends = (cell: string) => cell.replace(/[+\s]/g, "").split(/–|-|до/).map(Number);

/** Броски: эффект 6 («Падающая тяжесть») бьёт, остальное — первое число. */
function rolls(effect: number, saveDcRoll: number, attackRoll: number): TrapRolls {
  const layers = Object.fromEntries(TRAP_LAYER_TABLE_IDS.map((id) => [id, 1])) as Record<
    (typeof TRAP_LAYER_TABLE_IDS)[number],
    number
  >;
  return { layers: { ...layers, "trap-effect": effect }, saveDcRoll, attackRoll };
}

describe("числа ловушек против rules.json", () => {
  const numbers = readTrapNumbers(topics) as TrapNumbers;

  it("справочник несёт обе таблицы", () => {
    expect(numbers).not.toBeNull();
    expect(severityBlock.rows[0][0]).toBe("Опасность Ловушки");
    expect(damageBlock.rows[0][0]).toBe("Уровень персонажа");
  });

  it("урон: все 4 × 3 клетки, на каждом уровне 1–20", () => {
    let checked = 0;
    for (const row of damageBlock.rows.slice(1)) {
      const [from, to] = ends(row[0]);
      for (let level = from; level <= to; level += 1) {
        TRAP_DANGERS.forEach((danger) => {
          const column = damageBlock.rows[0].indexOf(danger);
          const trap = buildTrap(numbers, level, danger, rolls(6, 1, 1));
          expect(trap.damage, `уровень ${level}, ${danger}`).toBe(row[column]);
        });
      }
      checked += 1;
    }
    expect(checked).toBe(4);
  });

  it("УС и бонус атаки: все три строки, оба края промежутка", () => {
    for (const row of severityBlock.rows.slice(1)) {
      const danger = row[0] as (typeof TRAP_DANGERS)[number];
      const [dcMin, dcMax] = ends(row[1]);
      const [atkMin, atkMax] = ends(row[2]);
      const severity = numbers.severity[danger];
      expect(rangeRollExpression(severity.saveDc)).toBe(`1d${dcMax - dcMin + 1}`);
      expect(rangeRollExpression(severity.attackBonus)).toBe(`1d${atkMax - atkMin + 1}`);

      const low = buildTrap(numbers, 1, danger, rolls(6, 1, 1));
      const high = buildTrap(numbers, 1, danger, rolls(6, dcMax - dcMin + 1, atkMax - atkMin + 1));
      expect([low.saveDc, high.saveDc], danger).toEqual([dcMin, dcMax]);
      expect([low.attackBonus, high.attackBonus], danger).toEqual([atkMin, atkMax]);
      // Подпись — та, что в справочнике: мастер видит, откуда число.
      expect(low.saveDcRange).toBe(row[1]);
      expect(low.attackRange).toBe(row[2]);
    }
    expect(severityBlock.rows.length - 1).toBe(3);
  });

  it("небьющий эффект: УС есть, бонуса атаки и урона нет", () => {
    // Эффект 2 — «Сигнал»: громкий звук, не рана.
    const trap = buildTrap(numbers, 9, "Смертоносная", rolls(2, 1, 1));
    expect(trap.saveDc).toBe(ends(severityBlock.rows[3][1])[0]);
    expect(trap.attackBonus).toBeNull();
    expect(trap.damage).toBeNull();
  });

  it("без раздела ловушек чисел нет, а не наполовину", () => {
    expect(readTrapNumbers([])).toBeNull();
  });
});
