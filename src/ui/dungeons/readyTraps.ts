import type { RuleTopic } from "../../state/types";
import type { Trap } from "./trapBuilder";

/**
 * Готовые ловушки справочника — одиннадцать примеров из раздела «Ловушки».
 *
 * **Текста и чисел в этом файле нет.** Всё читается из `rules.json` при каждой
 * загрузке: заголовок «Примеры ловушек», а дальше заголовки уровнем ниже —
 * каждый заголовок — ловушка. Внутри «Ям» разновидности отделены не
 * заголовком, а выделенным названием в начале абзаца, и это тоже ловушки:
 * вместе с ними выходит одиннадцать. Сторож — `readyTraps.test.ts`: он сверяет
 * имена и текст с самим `rules.json`.
 *
 * Числа готовой ловушки — свои, из её текста; уровнем отряда и опасностью они
 * не масштабируются. Масштабируется только собранная из слоёв — `trapBuilder.ts`
 * с таблицами `trapNumbers.ts`. Поэтому `ReadyTrap` не знает ни уровня, ни
 * опасности, и в экране их нечем было бы применить.
 */

/** Заголовок, с которого начинаются примеры ловушек. */
export const READY_TRAPS_HEADING = "Примеры ловушек";

export interface ReadyTrap {
  /** Заголовок справочника или выделенное название абзаца внутри него. */
  readonly name: string;
  /** Заголовок, внутри которого лежит разновидность, иначе `null`. */
  readonly section: string | null;
  /** Абзацы заголовка до первого названия — вступление к разновидностям. */
  readonly sectionIntro: readonly string[];
  /** Текст ловушки как есть, абзацами: срабатывание, обнаружение, эффект. */
  readonly paragraphs: readonly string[];
  /** Ниже этого уровня отряда генератор схемы ловушку не ставит. */
  readonly minPartyLevel: number;
}

/**
 * Готовая ловушка в схеме подземелья: ОДНО имя. Текст и числа живут в
 * справочнике, второй их копии в записи кампании нет — иначе правка
 * `rules.json` оставила бы в сохранённых подземельях прежний текст.
 *
 * Поле `ready` и различает два вида ловушки: у собранной из слоёв его нет
 * вовсе, поэтому подземелья, созданные до готовых ловушек, читаются как
 * раньше, безо всякой починки записи.
 */
export interface ReadyTrapPick {
  readonly ready: true;
  readonly name: string;
}

/** Что лежит в `DungeonMarker.trap`: собранная из слоёв или готовая. */
export type PlacedTrap = Trap | ReadyTrapPick;

export function isReadyTrap(trap: PlacedTrap): trap is ReadyTrapPick {
  return (trap as ReadyTrapPick).ready === true;
}

export function readyTrapPick(name: string): ReadyTrapPick {
  return { ready: true, name };
}

/** Собранная из слоёв; `null` — ловушки нет вовсе или она готовая. */
export function builtTrap(trap: PlacedTrap | null | undefined): Trap | null {
  return trap && !isReadyTrap(trap) ? trap : null;
}

/**
 * Строка шкалы урона, по которой выводится уровень: с какого уровня начинается
 * полоса и какой урон на ней считается смертоносным.
 *
 * Шкалу приносит `trapNumbers.ts` — он читает ту же таблицу для собранных
 * ловушек, и второго её чтения здесь нет.
 */
export interface DeadlyBand {
  readonly fromLevel: number;
  /** Клетка «Смертоносная» этой полосы — «4к10». */
  readonly deadly: string;
}

/**
 * Порог, который из текста не выводится. Сфера аннигиляции урона не бросает
 * вовсе — всё, что входит в рот, уничтожается мгновенно, — поэтому шкала урона
 * о ней молчит. Её уровень назван решением владельца (18.10.2026), и это
 * единственное число, не выведенное из справочника.
 */
export const OWNER_MIN_LEVEL: Readonly<Record<string, number>> = {
  "Сфера аннигиляции": 11,
};

/**
 * Название разновидности в начале абзаца: «Простая Яма. Простая яма-ловушка…».
 * Выделения в `rules.json` нет, поэтому название узнаётся по форме: от одного
 * до четырёх слов из русских букв и дефисов, точка, пробел и заглавная буква
 * дальше. Цифр, скобок и тире в названии нет — поэтому «УС обнаружения ямы —
 * 10. Тот, кто наступит…» названием не считается, хотя точка в нём тоже рано.
 */
const VARIANT_NAME = /^([А-ЯЁ][а-яё]*(?:[ -][А-Яа-яЁё]+){0,3})\. [А-ЯЁ]/;

interface Group {
  readonly name: string;
  readonly paragraphs: string[];
}

/** Заголовки примеров и их абзацы, в порядке справочника. */
function exampleGroups(topic: RuleTopic): Group[] {
  const start = topic.blocks.findIndex(
    (b) => b.type === "heading" && b.text.trim() === READY_TRAPS_HEADING,
  );
  if (start === -1) return [];
  const head = topic.blocks[start];
  if (head.type !== "heading") return [];
  const groups: Group[] = [];
  for (const block of topic.blocks.slice(start + 1)) {
    // Заголовок того же или более высокого уровня — примеры кончились.
    if (block.type === "heading") {
      if (block.level <= head.level) break;
      groups.push({ name: block.text.trim(), paragraphs: [] });
    } else if (block.type === "paragraph" && groups.length > 0) {
      groups[groups.length - 1].paragraphs.push(block.text.trim());
    }
  }
  return groups;
}

/** Средний урон самого тяжёлого броска в тексте; броска нет — 0. */
function heaviestRoll(paragraphs: readonly string[]): number {
  let worst = 0;
  for (const text of paragraphs) {
    for (const [, count, faces] of text.matchAll(/(\d+)к(\d+)/g)) {
      worst = Math.max(worst, (Number(count) * (Number(faces) + 1)) / 2);
    }
  }
  return worst;
}

/**
 * Уровень, с которого ловушку можно ставить, — по её же тексту: самый тяжёлый
 * бросок урона сравнивается со столбцом «Смертоносная» шкалы уровней, и ловушка
 * начинается с той полосы, где её урон смертоносным уже только считается, а не
 * превосходит смертоносный. Так «Катящаяся Сфера» с 10к10 не достаётся отряду
 * 1–4 уровня, у которого смертоносная ловушка бьёт на 4к10.
 *
 * Ловушка без броска урона порога не получает: сеть опутывает, яма сбрасывает,
 * и уровень отряда их не касается.
 */
function levelFromText(paragraphs: readonly string[], bands: readonly DeadlyBand[]): number {
  const worst = heaviestRoll(paragraphs);
  if (worst === 0 || bands.length === 0) return 1;
  const sorted = [...bands].sort((a, b) => a.fromLevel - b.fromLevel);
  const fits = sorted.find((band) => heaviestRoll([band.deadly]) >= worst);
  return (fits ?? sorted[sorted.length - 1]).fromLevel;
}

/** Разновидности одного заголовка или сам заголовок, если их в нём нет. */
function trapsOfGroup(group: Group, bands: readonly DeadlyBand[]): ReadyTrap[] {
  const marks: { index: number; name: string }[] = [];
  group.paragraphs.forEach((text, index) => {
    const name = VARIANT_NAME.exec(text)?.[1];
    if (name) marks.push({ index, name });
  });
  const level = (name: string, paragraphs: readonly string[]) =>
    Math.max(levelFromText(paragraphs, bands), OWNER_MIN_LEVEL[name] ?? 1);
  if (marks.length === 0) {
    return [
      {
        name: group.name,
        section: null,
        sectionIntro: [],
        paragraphs: group.paragraphs,
        minPartyLevel: level(group.name, group.paragraphs),
      },
    ];
  }
  const intro = group.paragraphs.slice(0, marks[0].index);
  return marks.map((mark, i) => {
    const paragraphs = group.paragraphs.slice(mark.index, marks[i + 1]?.index);
    return {
      name: mark.name,
      section: group.name,
      sectionIntro: intro,
      paragraphs,
      minPartyLevel: level(mark.name, paragraphs),
    };
  });
}

/**
 * Готовые ловушки раздела — пустой список, если справочник примеров не несёт.
 * Раздел передаётся найденным: его ищет `trapNumbers.ts` по своему `id`, и
 * второго владельца этого `id` здесь нет.
 */
export function readReadyTraps(
  topic: RuleTopic,
  bands: readonly DeadlyBand[],
): readonly ReadyTrap[] {
  return exampleGroups(topic).flatMap((group) => trapsOfGroup(group, bands));
}

/** Ловушка по имени из записи кампании; `null` — справочник её больше не несёт. */
export function findReadyTrap(
  traps: readonly ReadyTrap[],
  name: string,
): ReadyTrap | null {
  return traps.find((trap) => trap.name === name) ?? null;
}

/** Те, что годятся отряду этого уровня. */
export function readyTrapsForLevel(
  traps: readonly ReadyTrap[],
  partyLevel: number,
): readonly ReadyTrap[] {
  return traps.filter((trap) => trap.minPartyLevel <= partyLevel);
}
