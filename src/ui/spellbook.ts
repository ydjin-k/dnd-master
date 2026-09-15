import { preparableSpells } from "./preparedSpells";
import type { Character, Spell } from "../state/types";

/**
 * Книга заклинаний — механика одного класса, Волшебника (SRD 5.1, «Книга
 * заклинаний»). У остальных классов с подготовкой (Жрец, Друид, Паладин)
 * книги нет вовсе: им доступен весь список класса, и источником подготовки
 * служит он сам — см. `preparableSpells` в preparedSpells.ts.
 *
 * У Волшебника уровня два, и путать их нельзя:
 * - книга (`Character.spellbook`) — что выучено вообще; сама по себе не даёт
 *   творить ничего, кроме ритуалов;
 * - подготовленное (`Character.castableSpells`) — срез из книги, который можно
 *   творить сегодня. Его число и разбор считает preparedSpells.ts, второго
 *   владельца этому числу здесь не заводится: модуль лишь подставляет книгу
 *   источником в тот же вызов, что у сестёр подставляет список класса.
 *
 * Здесь живёт единственный владелец объёма книги (`spellbookMax`) и её
 * содержимого (`spellbookOf` — вместе с переходом старых сохранений, у
 * которых книги ещё не было).
 */

/**
 * Классы, ведущие книгу заклинаний. Множество, а не сравнение с
 * `"classes-wizard"` в десяти местах: факт «у этого класса есть книга» обязан
 * иметь одного владельца. Своим списком книга остаётся потому, что в данных
 * класса такого признака нет: подготовка рядом (`preparesSpells`) свой список
 * уже сдала и спрашивает `spellsKnownKind`.
 */
export const SPELLBOOK_CLASSES: ReadonlySet<string> = new Set(["classes-wizard"]);

/** Ведёт ли этот класс книгу заклинаний (см. `SPELLBOOK_CLASSES`). */
export function hasSpellbook(classId: string | null | undefined): boolean {
  return !!classId && SPELLBOOK_CLASSES.has(classId);
}

/**
 * Сколько заклинаний волшебник вписывает в книгу к своему уровню бесплатно.
 * Числа взяты из тела класса в `src-tauri/rules/rules.json` (`classes-wizard`),
 * а не из карточки: «На 1 уровне у вас есть книга заклинаний, содержащая шесть
 * заклинаний волшебника 1 круга» и «Каждый раз, когда вы получаете уровень
 * волшебника, вы можете добавить два заклинания волшебника по вашему выбору в
 * свою книгу заклинаний бесплатно».
 *
 * Заклинания, найденные в приключении (свитки, чужие книги), в это число не
 * входят — их в приложении пока нет вовсе, и потолок здесь означает «положено
 * по уровню», как `cantripsKnown` в таблице класса.
 */
const SPELLBOOK_AT_LEVEL_1 = 6;
const SPELLBOOK_PER_LEVEL = 2;

export function spellbookMax(classId: string | null | undefined, level: number): number {
  if (!hasSpellbook(classId) || level < 1) return 0;
  return SPELLBOOK_AT_LEVEL_1 + SPELLBOOK_PER_LEVEL * (level - 1);
}

/**
 * Что в книге сейчас. У класса без книги — пусто.
 *
 * Персонажи, сохранённые до появления книги (и листы пресетов той же поры),
 * держали заклинания волшебника в `castableSpells` (тогда поле звалось
 * `knownSpells`) — и значило это «выучено», а не «подготовлено». Такой список и
 * есть книга — иначе при переходе он исчез бы целиком. Переход читается на месте, а не сохраняется молча: в
 * персонажа книга попадает первой же правкой списков (см. `keepSpellbook`).
 */
export function spellbookOf(
  character: Pick<Character, "spellbook" | "castableSpells">,
  classId: string | null | undefined,
): string[] {
  if (!hasSpellbook(classId)) return [];
  return character.spellbook.length > 0 ? character.spellbook : character.castableSpells;
}

/**
 * Записать книгу в персонажа перед правкой подготовленного списка. Нужно
 * ровно для перехода выше: у старого сохранения книга живёт в `castableSpells`,
 * и снятие подготовки без этого вычеркнуло бы заклинание не только из
 * подготовленных, но и из книги. У класса без книги и у персонажа с уже
 * записанной книгой ничего не меняет.
 */
export function keepSpellbook(character: Character, classId: string | null | undefined): Character {
  if (!hasSpellbook(classId) || character.spellbook.length > 0) return character;
  return { ...character, spellbook: spellbookOf(character, classId) };
}

/** Книга персонажа на его уровне: норма, содержимое и остаток. */
export interface SpellbookState {
  /** Сколько заклинаний положено в книге на этом уровне (`spellbookMax`). */
  max: number;
  /** Что в книге сейчас, в порядке записи. */
  spells: string[];
  /** Сколько ещё можно вписать; 0 у полной книги и у класса без книги. */
  free: number;
}

export function spellbookAt(args: {
  classId: string | null | undefined;
  level: number;
  character: Pick<Character, "spellbook" | "castableSpells">;
}): SpellbookState {
  const { classId, level, character } = args;
  const max = spellbookMax(classId, level);
  const spells = spellbookOf(character, classId);
  return { max, spells, free: Math.max(0, max - spells.length) };
}

/**
 * Книга как источник подготовки: заклинания из `spells.json` по id из книги, в
 * порядке книги. Отсюда результат уходит прямо в `preparableSpells` — тем же
 * вызовом, каким сёстрам подставляется полный список класса.
 */
export function spellbookSource(spells: Spell[], book: string[]): Spell[] {
  return book.flatMap((id) => spells.filter((sp) => sp.id === id));
}

/**
 * Что можно вписать в книгу прямо сейчас: заклинания класса не выше
 * доступного круга («Каждое из этих заклинаний должно иметь круг, для
 * которого у вас есть ячейки заклинаний»), которых в книге ещё нет. Отбор тот
 * же самый, что и у подготовки, и второго экземпляра ему здесь не заводится —
 * меняется только то, с чем сверяется «уже есть»: там подготовленное, тут
 * книга.
 */
export function writableSpells(
  spells: Spell[],
  args: { classId: string | null | undefined; level: number; book: string[] },
): Spell[] {
  return preparableSpells(spells, { classId: args.classId, level: args.level, alreadyPrepared: args.book });
}
