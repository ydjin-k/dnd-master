import type { DungeonRecord } from "../../state/types";
import type { DwellerSource } from "./dungeonDwellers";
import { noteCount } from "./dungeonNotes";
import {
  dungeonSizeOf,
  generateDungeon,
  lineTitle,
  type DungeonSize,
} from "./dungeonGenerator";
import { isRoomKey } from "./markerStatus";
import type { TrapDanger, TrapNumbers } from "./trapNumbers";
import { isMasterPlaced } from "./trapPlacement";

/**
 * Правка подземелья кампании: переименование, пересборка и чтение семени с
 * формы.
 *
 * Здесь живут ВСЕ правила этих трёх действий: что считается пустым именем, чем
 * подземелье пересобирается, что при пересборке пропадает и какое семя годится.
 * Показ (`DungeonsPage`) их только зовёт. Генератор схемы эти функции не
 * трогают: они собирают ему параметры и получают готовый план.
 */

/** Чем подземелье было создано — этим же его и пересобирают. */
export interface DungeonRecipe {
  readonly partyLevel: number;
  readonly danger: TrapDanger;
  readonly size: DungeonSize;
  /** Выбранное назначение или `null` — «Случайно», бросать заново. */
  readonly purposeRoll: number | null;
}

/**
 * Рецепт записи. У подземелий, созданных до выбора размера, полей нет: размер
 * читается как «Среднее» (`dungeonSizeOf`), назначение — как «Случайно».
 * Умолчание здесь не подставляется второй раз: оно одно, в генераторе.
 */
export function recipeOf(dungeon: DungeonRecord): DungeonRecipe {
  return {
    partyLevel: dungeon.partyLevel,
    danger: dungeon.danger,
    size: dungeonSizeOf(dungeon.size),
    purposeRoll: dungeon.purposeRoll ?? null,
  };
}

/** Наибольшее семя: `seededDice` держит состояние в 32 битах. */
export const SEED_MAX = 0xffffffff;

/** Случайное семя — его берут «Создать подземелье» и «Пересобрать». */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Что сказало поле «Семя» на форме создания. */
export type SeedInput =
  | { readonly kind: "random" }
  | { readonly kind: "seed"; readonly seed: number }
  | { readonly kind: "error"; readonly message: string };

/**
 * Семя с формы: пустое поле — случайное семя, целое от 0 до 4294967295 — оно
 * само. Мусор не подменяется случайным молча: мастер вписал семя, чтобы
 * повторить схему, и схема по другому семени — это не то, о чём он просил.
 */
export function readSeedInput(text: string): SeedInput {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { kind: "random" };
  if (!/^\d+$/.test(trimmed)) {
    return { kind: "error", message: `Семя — целое число от 0 до ${SEED_MAX}` };
  }
  const seed = Number(trimmed);
  if (seed > SEED_MAX) {
    return { kind: "error", message: `Семя не больше ${SEED_MAX}` };
  }
  return { kind: "seed", seed };
}

/**
 * Подземелье с новым именем. Пустое имя (и имя из одних пробелов) — `null`, и
 * вызывающий оставляет запись как была: подземелье без имени в списке не
 * отличить от соседнего.
 */
export function withDungeonRenamed(dungeon: DungeonRecord, name: string): DungeonRecord | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === dungeon.name) return dungeon;
  return { ...dungeon, name: trimmed };
}

/**
 * Что пропадёт при пересборке — перечнем для подтверждения. Пустой список
 * значит, что спрашивать не о чем: схема ещё не тронута мастером.
 *
 * Статусы комнат считаются ОТДЕЛЬНО от статусов отметок, хотя лежат в той же
 * карте: ключи комнат отличает `isRoomKey`. Одной строкой «отметок со
 * статусом» перечень врал бы вдвое — у подземелья из восьми комнат, которые
 * мастер прошёл, он обещал бы потерю восьми отметок, которых мастер не касался.
 */
export function rebuildLosses(dungeon: DungeonRecord): string[] {
  const losses: string[] = [];
  const keys = Object.keys(dungeon.statuses);
  const markers = keys.filter((key) => !isRoomKey(key)).length;
  if (markers > 0) losses.push(`отметок со статусом: ${markers}`);
  const rooms = keys.length - markers;
  if (rooms > 0) losses.push(`комнат со статусом: ${rooms}`);
  const notes = noteCount(dungeon);
  if (notes > 0) losses.push(`заметок мастера: ${notes}`);
  const byMaster = dungeon.plan.markers.filter(isMasterPlaced).length;
  if (byMaster > 0) losses.push(`ловушек, поставленных руками: ${byMaster}`);
  return losses;
}

/**
 * Подземелье, пересобранное новым семенем по своему же рецепту: уровень,
 * опасность, размер и выбранное назначение — те же. Статусы отметок и ручные
 * ловушки уходят вместе со старой схемой: отметок с теми же `id` в новой нет,
 * и «исследовано» от снесённой отметки не должно достаться случайной соседке.
 *
 * Заметки мастера и статусы комнат уходят ровно так же и по той же причине:
 * комната №3 новой схемы — другая комната, и «Рычаг за гобеленом» в ней
 * указывал бы на гобелен, которого там нет. О пропаже предупреждает
 * `rebuildLosses`, и переспрашивать здесь уже нечего.
 *
 * Имя: своё, если мастер его менял, и новое название назначения, если имя так и
 * осталось генераторным. Проверяется это сравнением с названием СТАРОГО
 * назначения — отдельного признака «переименовано» для этого не нужно. Иначе
 * выходило бы одно из двух: либо пересборка затирала бы имя, данное мастером,
 * либо в шапке стояла бы «Заброшенная шахта» над описанием монетного двора.
 */
export function withDungeonRebuilt(
  dungeon: DungeonRecord,
  seed: number,
  numbers: TrapNumbers,
  bestiary: readonly DwellerSource[],
): DungeonRecord {
  const recipe = recipeOf(dungeon);
  const plan = generateDungeon({ seed, numbers, bestiary, ...recipe });
  const wasGeneratorName = dungeon.name === lineTitle(dungeon.plan.purpose.text);
  return {
    ...dungeon,
    name: wasGeneratorName ? lineTitle(plan.purpose.text) : dungeon.name,
    seed,
    size: recipe.size,
    purposeRoll: recipe.purposeRoll,
    plan,
    statuses: {},
    notes: {},
  };
}
