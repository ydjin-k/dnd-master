import { findTable, rowForRoll, type EventTable } from "../eventTables";
import {
  trapDamage,
  valueInRange,
  type TrapDanger,
  type TrapNumbers,
} from "./trapNumbers";

/**
 * Ловушка из пяти слоёв «восьми тем» (группа «Ловушки и препятствия») с
 * числами SRD под уровень отряда.
 *
 * Слои бросаются по тем же таблицам, что и во «Приключениях», — через
 * `findTable`/`rowForRoll`; строки сюда не копируются. Сборщик сам кости не
 * бросает: выпавшие числа ему приносят (`roll_dice` на экране ловушки,
 * семя на схеме подземелья), поэтому одни и те же броски всегда дают одну и
 * ту же ловушку.
 */
export const TRAP_LAYER_TABLE_IDS = [
  "trap-obstacle",
  "trap-trigger",
  "trap-clue",
  "trap-effect",
  "trap-disarm",
] as const;
export type TrapLayerId = (typeof TRAP_LAYER_TABLE_IDS)[number];

/** Слой, от которого зависит, бьёт ли ловушка (`dealsDamage`). */
export const TRAP_EFFECT_LAYER: TrapLayerId = "trap-effect";

export function trapLayerTable(id: TrapLayerId): EventTable {
  const table = findTable(id);
  // Пропажу таблицы ловит проба на этот список; молча собрать ловушку из
  // четырёх слоёв было бы хуже громкого отказа.
  if (!table) throw new Error(`Нет таблицы слоя ловушки «${id}»`);
  return table;
}

/** Броски, из которых собирается ловушка. Значения — то, что выпало на кости. */
export interface TrapRolls {
  readonly layers: Readonly<Record<TrapLayerId, number>>;
  /** Выпавшее на `rangeRollExpression(saveDc)`. */
  readonly saveDcRoll: number;
  /** Выпавшее на `rangeRollExpression(attackBonus)`. */
  readonly attackRoll: number;
}

export interface TrapLayer {
  readonly tableId: TrapLayerId;
  readonly tableName: string;
  readonly die: number;
  readonly roll: number;
  readonly text: string;
}

export interface Trap {
  readonly partyLevel: number;
  readonly danger: TrapDanger;
  readonly layers: readonly TrapLayer[];
  readonly saveDc: number;
  readonly saveDcRange: string;
  /** Бонус атаки и урон — только у эффекта с `dealsDamage`, иначе `null`. */
  readonly attackBonus: number | null;
  readonly attackRange: string | null;
  readonly damage: string | null;
  readonly rolls: TrapRolls;
}

export function buildTrap(
  numbers: TrapNumbers,
  partyLevel: number,
  danger: TrapDanger,
  rolls: TrapRolls,
): Trap {
  const layers = TRAP_LAYER_TABLE_IDS.map((tableId): TrapLayer => {
    const table = trapLayerTable(tableId);
    const roll = rolls.layers[tableId];
    const row = rowForRoll(table, roll);
    if (!row) throw new Error(`«${table.name}» не покрывает число ${roll}`);
    return { tableId, tableName: table.name, die: table.die, roll, text: row.text };
  });
  const effect = rowForRoll(trapLayerTable(TRAP_EFFECT_LAYER), rolls.layers[TRAP_EFFECT_LAYER]);
  const hits = effect?.dealsDamage === true;
  const { saveDc, attackBonus } = numbers.severity[danger];
  return {
    partyLevel,
    danger,
    layers,
    saveDc: valueInRange(saveDc, rolls.saveDcRoll),
    saveDcRange: saveDc.text,
    attackBonus: hits ? valueInRange(attackBonus, rolls.attackRoll) : null,
    attackRange: hits ? attackBonus.text : null,
    damage: hits ? trapDamage(numbers, partyLevel, danger) : null,
    rolls,
  };
}

/** Та же ловушка с одним перевыпавшим слоем — остальные броски не трогаются. */
export function withLayerRerolled(
  numbers: TrapNumbers,
  trap: Trap,
  layer: TrapLayerId,
  roll: number,
): Trap {
  return buildTrap(numbers, trap.partyLevel, trap.danger, {
    ...trap.rolls,
    layers: { ...trap.rolls.layers, [layer]: roll },
  });
}
