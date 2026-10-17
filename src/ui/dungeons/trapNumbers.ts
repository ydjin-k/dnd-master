import type { RuleTopic } from "../../state/types";

/**
 * Числа ловушек SRD 5.1 — раздел `additional-rules-traps` в `rules.json`.
 *
 * **Чисел в этом файле нет.** Обе таблицы читаются из справочника при каждой
 * загрузке: «опасность → УС спасброска и бонус атаки» (`blocks[20]`) и «урон по
 * уровню персонажа и опасности» (`blocks[22]`). Таблица ищется по шапке, а не по
 * номеру блока, — так сдвиг блоков в справочнике не подменит её соседней.
 * Сторож — `trapNumbers.test.ts`: он сверяет выданное с самим `rules.json`.
 */
export const TRAPS_TOPIC_ID = "additional-rules-traps";

/** Три степени опасности SRD — подписи как в шапке таблицы урона. */
export const TRAP_DANGERS = ["Неудобство", "Опасная", "Смертоносная"] as const;
export type TrapDanger = (typeof TRAP_DANGERS)[number];

export const PARTY_LEVEL_MIN = 1;
export const PARTY_LEVEL_MAX = 20;

/** Включительный промежуток вместе с подписью справочника — её видит мастер. */
export interface TrapRange {
  readonly min: number;
  readonly max: number;
  readonly text: string;
}

export interface TrapSeverity {
  readonly saveDc: TrapRange;
  readonly attackBonus: TrapRange;
}

export interface TrapNumbers {
  readonly severity: Readonly<Record<TrapDanger, TrapSeverity>>;
  /** Строки таблицы урона: уровни включительно и урон по опасности. */
  readonly damage: readonly {
    readonly fromLevel: number;
    readonly toLevel: number;
    readonly dice: Readonly<Record<TrapDanger, string>>;
  }[];
}

/** «10–11», «+3 до +5», «1-4» → два числа; иначе `null`. */
export function parseRange(text: string): { min: number; max: number } | null {
  const numbers = text.match(/\d+/g);
  if (!numbers || numbers.length !== 2) return null;
  const [min, max] = numbers.map(Number);
  return min <= max ? { min, max } : null;
}

function tableWithHeader(topic: RuleTopic, firstCell: string): string[][] | null {
  for (const block of topic.blocks) {
    if (block.type === "table" && block.rows[0]?.[0]?.trim() === firstCell) return block.rows;
  }
  return null;
}

/**
 * Обе таблицы ловушек из справочника — либо `null`, если справочник их не
 * несёт целиком. Половинчатый результат не отдаётся: ловушка с УС, но без
 * урона, показала бы мастеру неправду о том, что SRD её не определяет.
 */
export function readTrapNumbers(topics: readonly RuleTopic[]): TrapNumbers | null {
  const topic = topics.find((t) => t.id === TRAPS_TOPIC_ID);
  if (!topic) return null;
  const severityRows = tableWithHeader(topic, "Опасность Ловушки");
  const damageRows = tableWithHeader(topic, "Уровень персонажа");
  if (!severityRows || !damageRows) return null;

  const severity = {} as Record<TrapDanger, TrapSeverity>;
  for (const danger of TRAP_DANGERS) {
    const row = severityRows.find((r) => r[0]?.trim() === danger);
    const dc = row && parseRange(row[1] ?? "");
    const attack = row && parseRange(row[2] ?? "");
    if (!row || !dc || !attack) return null;
    severity[danger] = {
      saveDc: { ...dc, text: row[1].trim() },
      attackBonus: { ...attack, text: row[2].trim() },
    };
  }

  const header = damageRows[0].map((cell) => cell.trim());
  const columns = TRAP_DANGERS.map((danger) => header.indexOf(danger));
  if (columns.some((index) => index < 1)) return null;
  const damage: TrapNumbers["damage"][number][] = [];
  for (const row of damageRows.slice(1)) {
    const levels = parseRange(row[0] ?? "");
    if (!levels) return null;
    const dice = {} as Record<TrapDanger, string>;
    TRAP_DANGERS.forEach((danger, i) => (dice[danger] = (row[columns[i]] ?? "").trim()));
    damage.push({ fromLevel: levels.min, toLevel: levels.max, dice });
  }
  return { severity, damage };
}

/** Урон ловушки для уровня отряда — `null`, если уровень вне таблицы. */
export function trapDamage(numbers: TrapNumbers, level: number, danger: TrapDanger): string | null {
  const row = numbers.damage.find((r) => level >= r.fromLevel && level <= r.toLevel);
  return row ? row.dice[danger] : null;
}

/** Выражение броска внутри промежутка: `1dN`, где N — ширина промежутка. */
export function rangeRollExpression(range: TrapRange): string {
  return `1d${range.max - range.min + 1}`;
}

/** Выпавшее на `rangeRollExpression` → значение внутри промежутка. */
export function valueInRange(range: TrapRange, roll: number): number {
  return range.min + roll - 1;
}
