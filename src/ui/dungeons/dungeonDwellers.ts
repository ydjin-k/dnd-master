import type { MonsterTemplate } from "../../state/types";
import type { EventTableRow } from "../eventTables";

/** Сколько о существе нужно генератору: имя для схемы и опасность для ступени. */
export type DwellerSource = Pick<MonsterTemplate, "id" | "name" | "challengeRating">;

/**
 * Ступени отряда и показатель опасности обитателей на каждой.
 *
 * Границы — решение студии по правке владельца 18.10.2026 («брать существ с
 * ПО, подходящим ступени»): на 1–4 не выше 1 — так огр и мимик (ПО 2) туда не
 * попадают, — дальше 2–6, 7–12 и от 13. Обитатели комнаты — обычно группа, а не
 * одиночка, поэтому потолок ступени ниже уровня отряда.
 *
 * ПО берётся из бестиария (`challengeRating`), а не из копии: строки таблицы
 * знают только `id`.
 */
export const DWELLER_TIERS = [
  { fromLevel: 1, toLevel: 4, minCr: 0, maxCr: 1 },
  { fromLevel: 5, toLevel: 10, minCr: 2, maxCr: 6 },
  { fromLevel: 11, toLevel: 16, minCr: 7, maxCr: 12 },
  { fromLevel: 17, toLevel: 20, minCr: 13, maxCr: 30 },
] as const;
export type DwellerTier = (typeof DWELLER_TIERS)[number];

export function tierForLevel(level: number): DwellerTier {
  return DWELLER_TIERS.find((t) => level >= t.fromLevel && level <= t.toLevel) ?? DWELLER_TIERS[0];
}

/** «1/8» → 0.125, «13» → 13; нечитаемое → `null`. */
export function crValue(cr: string): number | null {
  const fraction = cr.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const whole = Number(cr.trim());
  return cr.trim() !== "" && Number.isFinite(whole) ? whole : null;
}

/** Существа строки, подходящие ступени, — в порядке строки. */
export function dwellersForTier(
  row: EventTableRow,
  tier: DwellerTier,
  bestiary: readonly DwellerSource[],
): DwellerSource[] {
  const found: DwellerSource[] = [];
  for (const id of row.monsterIds ?? []) {
    const monster = bestiary.find((m) => m.id === id);
    const cr = monster ? crValue(monster.challengeRating) : null;
    if (monster && cr !== null && cr >= tier.minCr && cr <= tier.maxCr) found.push(monster);
  }
  return found;
}

/**
 * Может ли строка выпасть на этой ступени. Строка без существ («пусто, но
 * обжито») выпадает всегда; строка с существами — только если хоть одно
 * подходит. Иначе её перебрасывают: правило «берётся последний» владелец снял.
 */
export function rowFitsTier(
  row: EventTableRow,
  tier: DwellerTier,
  bestiary: readonly DwellerSource[],
): boolean {
  return (row.monsterIds ?? []).length === 0 || dwellersForTier(row, tier, bestiary).length > 0;
}
