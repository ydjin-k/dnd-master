import { TABLES as adventureHooks } from "./adventureHooks";
import { TABLES as battleEvents } from "./battleEvents";
import { TABLES as bossMechanics } from "./bossMechanics";
import { TABLES as cityEvents } from "./cityEvents";
import { TABLES as feyMarks } from "./feyMarks";
import { TABLES as hallucinations } from "./hallucinations";
import { TABLES as infernalContracts } from "./infernalContracts";
import { TABLES as longRestEvents } from "./longRestEvents";
import { TABLES as magicMushrooms } from "./magicMushrooms";
import { TABLES as plotTwists } from "./plotTwists";
import { TABLES as pocketTrinkets } from "./pocketTrinkets";
import { TABLES as questHooks } from "./questHooks";
import { TABLES as randomEvents } from "./randomEvents";
import { TABLES as resurrectionSideEffects } from "./resurrectionSideEffects";
import { TABLES as riddles } from "./riddles";
import { TABLES as roadEncounters } from "./roadEncounters";
import { TABLES as secretSocieties } from "./secretSocieties";
import { TABLES as settlementEvents } from "./settlementEvents";
import { TABLES as thievesGuildQuests } from "./thievesGuildQuests";
import { TABLES as trapsAndPuzzles } from "./trapsAndPuzzles";
import { TABLES as travelEvents } from "./travelEvents";
import { TABLES as underdarkCreatureEncounters } from "./underdarkCreatureEncounters";
import { TABLES as underdarkEvents } from "./underdarkEvents";
import { TABLES as underdarkTerrainEncounters } from "./underdarkTerrainEncounters";
import { TABLES as underwaterEvents } from "./underwaterEvents";
import { TABLES as waterEvents } from "./waterEvents";
import { TABLES as weaponRunes } from "./weaponRunes";
import type { EventTable, EventTableRow } from "./types";

export type { EventTable, EventTableRow } from "./types";
export { OWNER_SUPPLIED } from "./types";

/** Порядок разделов в списке выбора. Единственный владелец порядка. */
export const TABLE_GROUPS = [
  "Приключения и зацепки",
  "Странствия",
  "Бой и столкновения",
  "Находки и диковины",
  "Странности и последствия",
] as const;

/** Все таблицы генератора, в порядке разделов, внутри раздела — по имени. */
export const EVENT_TABLES: readonly EventTable[] = [
  ...adventureHooks, ...battleEvents, ...bossMechanics, ...cityEvents,
  ...feyMarks, ...hallucinations, ...infernalContracts, ...longRestEvents,
  ...magicMushrooms, ...plotTwists, ...pocketTrinkets, ...questHooks,
  ...randomEvents, ...resurrectionSideEffects, ...riddles, ...roadEncounters,
  ...secretSocieties, ...settlementEvents, ...thievesGuildQuests,
  ...trapsAndPuzzles, ...travelEvents, ...underdarkCreatureEncounters,
  ...underdarkEvents, ...underdarkTerrainEncounters, ...underwaterEvents,
  ...waterEvents,
  ...weaponRunes,
].sort(
  (a, b) =>
    TABLE_GROUPS.indexOf(a.group as (typeof TABLE_GROUPS)[number]) -
      TABLE_GROUPS.indexOf(b.group as (typeof TABLE_GROUPS)[number]) ||
    a.name.localeCompare(b.name, "ru"),
);

export function findTable(id: string): EventTable | undefined {
  return EVENT_TABLES.find((table) => table.id === id);
}

/**
 * Таблицы, в которые строка посылает бросок дальше, в порядке строки.
 *
 * Неизвестный `id` сюда не попадёт: его ловит проба «строка не посылает в
 * несуществующую таблицу». Молча пропускать его здесь — значит превратить
 * опечатку в тихо исчезнувший результат, поэтому владелец решения один и
 * он — проба, а не эта функция.
 */
export function nextTables(row: EventTableRow): readonly EventTable[] {
  const found: EventTable[] = [];
  for (const id of row.rollTableIds ?? []) {
    const table = findTable(id);
    if (table) found.push(table);
  }
  return found;
}

/** Выражение броска для `roll_dice`: кость берётся у таблицы, а не у кода. */
export function rollExpression(table: EventTable): string {
  return `1d${table.die}`;
}

/** Строка, которую покрывает выпавшее число, либо `undefined`, если такой нет. */
export function rowForRoll(table: EventTable, roll: number): EventTableRow | undefined {
  return table.rows.find((row) => roll >= row.from && roll <= row.to);
}

/**
 * Первая дыра или нахлёст в покрытии кости — либо `null`, если таблица
 * закрывает свою кость ровно.
 *
 * Возвращает готовую фразу, а не флаг: проба, поймавшая сдвиг в таблице на сто
 * строк, обязана назвать таблицу и незакрытое число, иначе вместо дефекта
 * читается общий снимок «что-то не сошлось». Причину выдаёт тот, кто выносит
 * решение, — она рождается здесь и нигде больше не пересобирается.
 */
export function findCoverageGap(table: EventTable): string | null {
  const covered = new Map<number, number>();
  for (const row of table.rows) {
    if (row.from > row.to) {
      return `«${table.name}»: строка ${row.from}-${row.to} задана задом наперёд`;
    }
    for (let n = row.from; n <= row.to; n += 1) {
      covered.set(n, (covered.get(n) ?? 0) + 1);
    }
  }
  for (let n = 1; n <= table.die; n += 1) {
    const times = covered.get(n) ?? 0;
    if (times === 0) return `«${table.name}»: число ${n} не покрыто ни одной строкой (кость d${table.die})`;
    if (times > 1) return `«${table.name}»: число ${n} покрыто ${times} строками (кость d${table.die})`;
  }
  for (const n of covered.keys()) {
    if (n < 1 || n > table.die) {
      return `«${table.name}»: строка покрывает число ${n} за пределами кости d${table.die}`;
    }
  }
  return null;
}
