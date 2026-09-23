import { findCoverageGap, rowForRoll, type EventTable, type EventTableRow } from "./eventTables";
import type { RuleTopic } from "../state/types";

/**
 * Безумие на листе персонажа: НАША лестница уровней 1-2-3 поверх SRD-таблиц.
 *
 * Что здесь наше, а что SRD — граница проходит ровно по одному месту.
 *
 * **Наше** — только лестница `MADNESS_LADDER`: решение владельца от 17.09.2026
 * о том, что у персонажа есть «уровень безумия», который растёт на 1 и выше
 * третьего не поднимается, а каждая ступень отсылает к своему виду безумия.
 * Такого счётчика в SRD 5.1 нет вовсе: там три ВИДА безумия и ни одного числа,
 * которое бы между ними двигало. Поэтому лестница лежит отдельным файлом рядом
 * с `wildMagicSurges.ts` и `abyssElfRace.ts`, а **не строкой в
 * `src-tauri/rules/rules.json`**: там ровно SRD 5.1 под своей атрибуцией, и
 * подмешивание туда собственного содержания сделало бы границу «у нас только
 * SRD» непроверяемой. Проба `madness.test.ts` эту границу и стережёт.
 *
 * **SRD** — всё остальное: три таблицы к100 с диапазонами, длительности,
 * спасбросок сопротивления и лечение. Ни одна их строка сюда НЕ скопирована,
 * всё читается из `rules.json` → `additional-rules-madness` функцией
 * `readMadnessRules`. Копия была бы вторым владельцем того же факта — а у факта
 * владелец один. По той же причине отсюда не берутся ни кость длительности, ни
 * единица времени: «1к10 минут» и «1к10 × 10 часов» разбираются из шапки
 * соответствующей таблицы SRD, и если SRD изменится, изменится и приложение.
 *
 * Покрытие диапазонов сторожит `findCoverageGap` из `./eventTables` — тот же
 * страж, что у таблиц событий, а не второй такой же: таблица с диапазонами
 * здесь ровно того же устройства.
 */

/** Раздел SRD, из которого читается всё про безумие. Единственный адрес. */
export const MADNESS_TOPIC_ID = "additional-rules-madness";

/** Кость всех трёх таблиц SRD. Выражение для `roll_dice`. */
export const MADNESS_ROLL_EXPRESSION = "1d100";

/** Выше третьей ступени лестница не идёт — решение владельца от 17.09.2026. */
export const MADNESS_MAX_LEVEL = 3;

export type MadnessLevel = 1 | 2 | 3;

/**
 * Ступень нашей лестницы. Кроме уровня в ней нет ничего своего: `kind` — это
 * заголовок раздела SRD, по которому ступень находит свою таблицу, а не
 * пересказ её содержимого.
 */
export interface MadnessStep {
  readonly level: MadnessLevel;
  /** Заголовок таблицы в `rules.json`; с него же начинается подпись на листе. */
  readonly kind: string;
}

/**
 * Лестница целиком — единственное наше содержание в этом файле.
 *
 * 1 → краткосрочное безумие, 2 → долгосрочное, 3 → бессрочное. Длительность у
 * ступени не записана намеренно: её называет SRD в шапке своей таблицы.
 */
export const MADNESS_LADDER: readonly MadnessStep[] = [
  { level: 1, kind: "Краткосрочное безумие" },
  { level: 2, kind: "Долгосрочное безумие" },
  { level: 3, kind: "Бессрочное безумие" },
];

/**
 * Длительность, разобранная из шапки таблицы SRD: «1к10 минут» →
 * `1d10`, множитель 1, «минут»; «1к10 × 10 часов» → `1d10`, множитель 10,
 * «часов». У бессрочного безумия длительности нет — там `null`.
 */
export interface MadnessDuration {
  /** Выражение для `roll_dice`. */
  readonly expression: string;
  readonly multiplier: number;
  readonly unit: string;
}

export interface MadnessTable {
  readonly step: MadnessStep;
  /**
   * Строки SRD в том же виде, в каком их понимает страж покрытия. Это
   * проекция `rules.json`, а не копия: значения собираются при чтении.
   */
  readonly table: EventTable;
  /** Как длительность записана в шапке SRD, без ведущего «длится». */
  readonly durationText: string;
  /** Разобранная из той же шапки кость длительности, либо `null`. */
  readonly duration: MadnessDuration | null;
}

export interface MadnessRules {
  readonly tables: readonly MadnessTable[];
  /** Абзац SRD про спасбросок сопротивления. */
  readonly resistance: string;
  /** Абзац SRD про лечение безумия. */
  readonly healing: string;
}

/** Выпавшее: ступень лестницы и оба броска. Больше о безумии знать нечего. */
export interface RolledMadness {
  readonly level: MadnessLevel;
  /** Результат к100 по таблице своей ступени. */
  readonly roll: number;
  /** Результат кости длительности, либо `null` у бессрочного. */
  readonly durationRoll: number | null;
}

/** Все дефисоподобные знаки, которыми в SRD записан диапазон (там — U+2011). */
const DASHES = /[-‐‑‒–—−]/;

/** `01‑20` → `{ from: 1, to: 20 }`; одиночное число → `from === to`. */
function parseRange(cell: string): { from: number; to: number } | null {
  const parts = cell.trim().split(DASHES);
  if (parts.length === 1) {
    const only = Number(parts[0]);
    return Number.isInteger(only) ? { from: only, to: only } : null;
  }
  if (parts.length !== 2) return null;
  const from = Number(parts[0]);
  const to = Number(parts[1]);
  return Number.isInteger(from) && Number.isInteger(to) ? { from, to } : null;
}

/** Из шапки «Эффект (длится 1к10 × 10 часов)» достаёт «1к10 × 10 часов». */
function parseDurationText(headerCell: string): string {
  const inside = headerCell.match(/\(([^)]*)\)/);
  const text = inside ? inside[1] : headerCell;
  return text.replace(/^длится\s+/i, "").trim();
}

/**
 * Кость длительности из текста шапки. Множитель — необязательный, единица
 * времени берётся оттуда же. Не разобралось (бессрочное безумие) — `null`.
 */
function parseDuration(durationText: string): MadnessDuration | null {
  const match = durationText.match(/(\d+)\s*к\s*(\d+)(?:\s*[×xх*]\s*(\d+))?\s+(\S+)/i);
  if (!match) return null;
  return {
    expression: `${Number(match[1])}d${Number(match[2])}`,
    multiplier: match[3] ? Number(match[3]) : 1,
    unit: match[4],
  };
}

/**
 * Читает раздел «Безумие» из `rules.json`. Блоки ищутся по заголовкам, а не по
 * номерам: номер блока сместился бы при любой правке справочника, а заголовок
 * и есть то, чем SRD называет свою таблицу.
 *
 * Возвращает `null`, если раздела нет или в нём не нашлось всех трёх таблиц, —
 * лист тогда просто не предлагает безумие, а не падает.
 */
export function readMadnessRules(topics: RuleTopic[]): MadnessRules | null {
  const topic = topics.find((t) => t.id === MADNESS_TOPIC_ID);
  if (!topic) return null;
  const blocks = topic.blocks;

  const tables: MadnessTable[] = [];
  for (const step of MADNESS_LADDER) {
    const headingIndex = blocks.findIndex(
      (block) => block.type === "heading" && block.text.startsWith(step.kind),
    );
    if (headingIndex === -1) continue;
    const next = blocks[headingIndex + 1];
    if (next?.type !== "table" || next.rows.length < 2) continue;

    const durationText = parseDurationText(next.rows[0][1] ?? "");
    const rows: EventTableRow[] = [];
    for (const row of next.rows.slice(1)) {
      const range = parseRange(row[0] ?? "");
      if (range) rows.push({ from: range.from, to: range.to, text: (row[1] ?? "").trim() });
    }
    tables.push({
      step,
      table: {
        id: `${MADNESS_TOPIC_ID}-${step.level}`,
        name: step.kind,
        // Поле формы `EventTable`; в каталог событий эта таблица не входит и
        // в списке выбора не показывается — её раздел на листе персонажа.
        group: "Состояния",
        die: 100,
        source: topic.sourceUrl,
        rows,
      },
      durationText,
      duration: parseDuration(durationText),
    });
  }
  if (tables.length !== MADNESS_LADDER.length) return null;

  const paragraph = (startsWith: string): string => {
    const block = blocks.find((b) => b.type === "paragraph" && b.text.trim().startsWith(startsWith));
    return block?.type === "paragraph" ? block.text.trim() : "";
  };

  return {
    tables,
    resistance: paragraph("Сопротивление"),
    healing: paragraph("Заклинание"),
  };
}

export function madnessTable(rules: MadnessRules, level: MadnessLevel): MadnessTable | undefined {
  return rules.tables.find((t) => t.step.level === level);
}

/** Первая дыра или нахлёст в любой из трёх таблиц — фразой стража событий. */
export function madnessCoverageGap(rules: MadnessRules): string | null {
  for (const table of rules.tables) {
    const gap = findCoverageGap(table.table);
    if (gap !== null) return gap;
  }
  return null;
}

/**
 * Подпись состояния на листе. Оба броска живут ПРЯМО В НЕЙ, потому что своего
 * поля у безумия нет и заводить его карточка запретила: состояние — это строка
 * в существующем массиве `conditions`, и всё, что о нём нужно помнить между
 * запусками, обязано уместиться в строке. В строке лежат только числа: текст
 * эффекта каждый раз перечитывается из `rules.json` по выпавшему числу, иначе
 * сохранение стало бы вторым владельцем SRD-текста.
 */
export function madnessConditionName(rolled: RolledMadness): string {
  const duration = rolled.durationRoll === null ? "" : `, 1к10 ${rolled.durationRoll}`;
  return `Безумие (ур. ${rolled.level}, к100 ${rolled.roll}${duration})`;
}

const MADNESS_CONDITION_RE = /^Безумие \(ур\. ([1-3]), к100 (\d{1,3})(?:, 1к10 (\d{1,2}))?\)$/;

/** Разбирает подпись обратно; не безумие — `null`. Обратна `madnessConditionName`. */
export function parseMadnessCondition(condition: string): RolledMadness | null {
  const match = condition.match(MADNESS_CONDITION_RE);
  if (!match) return null;
  return {
    level: Number(match[1]) as MadnessLevel,
    roll: Number(match[2]),
    durationRoll: match[3] === undefined ? null : Number(match[3]),
  };
}

/** Текущая ступень персонажа: 0, если безумия в состояниях нет. */
export function madnessLevelOf(conditions: readonly string[]): number {
  let level = 0;
  for (const condition of conditions) {
    const rolled = parseMadnessCondition(condition);
    if (rolled && rolled.level > level) level = rolled.level;
  }
  return level;
}

/**
 * Ступень, на которую поднимет «+1», либо `null` — если персонаж уже на
 * третьей: выше лестница не идёт.
 */
export function nextMadnessLevel(conditions: readonly string[]): MadnessLevel | null {
  const level = madnessLevelOf(conditions);
  if (level >= MADNESS_MAX_LEVEL) return null;
  return (level + 1) as MadnessLevel;
}

/**
 * Состояния с обновлённым безумием: прежнее заменяется НА СВОЁМ МЕСТЕ, а не
 * снимается и дописывается в конец, — иначе повышение уровня перетасовывало бы
 * список у мастера на глазах. Безумия не было — дописывается в конец.
 */
export function withMadness(conditions: readonly string[], rolled: RolledMadness): string[] {
  const name = madnessConditionName(rolled);
  const at = conditions.findIndex((condition) => parseMadnessCondition(condition) !== null);
  if (at === -1) return [...conditions, name];
  return conditions.map((condition, i) => (i === at ? name : condition));
}

/** «6 минут (1к10: 6)», «60 часов (1к10: 6 × 10)» или текст бессрочного из SRD. */
export function madnessDurationText(table: MadnessTable, durationRoll: number | null): string {
  const { duration } = table;
  if (!duration || durationRoll === null) return table.durationText;
  const total = durationRoll * duration.multiplier;
  const shown = duration.multiplier === 1 ? `${durationRoll}` : `${durationRoll} × ${duration.multiplier}`;
  return `${total} ${duration.unit} (${duration.expression.replace("d", "к")}: ${shown})`;
}

/**
 * Строки под состоянием — ровно то же место, где истощение показывает свои
 * накопленные эффекты. Текст эффекта и лечения берётся из `rules.json`; здесь
 * только подписи к ним.
 */
export function madnessEffectLines(rules: MadnessRules, rolled: RolledMadness): string[] {
  const table = madnessTable(rules, rolled.level);
  if (!table) return [];
  const row = rowForRoll(table.table, rolled.roll);
  if (!row) {
    // Дыру в диапазонах стережёт проба на покрытие кости; если она всё же
    // добралась до мастера — честнее сказать, чем показать пустоту.
    return [`Таблица «${table.table.name}» не покрывает число ${rolled.roll}`];
  }
  return [
    `${table.step.kind}, бросок к100: ${rolled.roll} (диапазон ${row.from}–${row.to}).`,
    row.text,
    `Длительность: ${madnessDurationText(table, rolled.durationRoll)}.`,
    `Лечение: ${rules.healing}`,
  ];
}
