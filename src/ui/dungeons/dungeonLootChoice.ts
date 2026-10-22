import type { DungeonRecord } from "../../state/types";
import { lootContentsLine, rollLootContents, type LootRarity } from "./dungeonLoot";
import type { SeededDice } from "./seededRandom";

/**
 * Что нашли в находке — выбор МАСТЕРА.
 *
 * Решение владельца 22.10.2026: содержимое находки больше не выдумывается
 * само. Деньги — лишь одна разновидность лута, а лут — предметы любой
 * редкости, драгоценности, артефакты и предметы из книг, которых у приложения
 * нет и быть не должно. Поэтому вид лута отмечает мастер, редкость у предметов
 * выбирает он же, а чем именно это было («кольчуга +1», «40 зм и серебряный
 * кубок») — пишет своими словами.
 *
 * Здесь живут ВСЕ правила выбора: какие бывают виды, у кого из них есть
 * редкость, чем выбор пуст, когда он исчезает из записи, как он читается
 * строкой и что предлагает кнопка «Предложить». Поля ввода и экраны эти
 * функции только зовут, своего понятия «пусто» не заводя.
 *
 * Ключ — тот же `id` отметки, под которым лежит статус и заметка (`trap-1`,
 * `loot-2`, у нижних этажей с приставкой — `f2-loot-1`). Второго пространства
 * имён выбор не заводит, поэтому одна находка не может оказаться «той же» для
 * заметки и «другой» для лута.
 *
 * Числа подсказки здесь не объявлены: вилки сумм, доли и редкости по ступеням
 * живут в `dungeonLoot.ts`, и второй их копии быть не должно.
 */

/**
 * Виды лута — один список на приложение, в этом порядке он и показывается.
 * «Другое» в конце нарочно: это не вид, а признание, что названного не
 * хватило, и подниматься выше названных ему незачем.
 */
export const LOOT_KINDS = ["money", "valuables", "item", "magic", "artifact", "other"] as const;
export type LootKind = (typeof LOOT_KINDS)[number];

/** Подписи видов — здесь и только здесь. */
export const LOOT_KIND_LABELS: Record<LootKind, string> = {
  money: "Деньги",
  valuables: "Драгоценности",
  item: "Предмет",
  magic: "Магический предмет",
  artifact: "Артефакт",
  other: "Другое",
};

/**
 * Виды, у которых мастер выбирает редкость (решение владельца: «у предметов
 * редкость»). У денег и драгоценностей редкости нет вовсе — не потому, что её
 * нельзя было бы придумать, а потому, что её не о чем спросить.
 */
export const RARITY_LOOT_KINDS: readonly LootKind[] = ["item", "magic"];

/** У этого вида лута бывает редкость. */
export function lootKindHasRarity(kind: LootKind): boolean {
  return RARITY_LOOT_KINDS.includes(kind);
}

/** Что мастер выбрал в одной находке. */
export interface LootChoice {
  /** Отмеченные виды, в порядке `LOOT_KINDS`; пустой список — не выбрано. */
  readonly kinds: readonly LootKind[];
  /**
   * Редкости отмеченных видов. Поля нет вовсе, пока ни одной не выбрано;
   * редкость вида, который мастер снял, в записи не остаётся — иначе снятая и
   * возвращённая отметка приносила бы редкость, которой мастер уже не ставил.
   */
  readonly rarities?: Partial<Record<LootKind, LootRarity>>;
  /** Описание своими словами; пустая строка — мастер его не писал. */
  readonly text: string;
}

/** Выбор находки, у которой мастер ничего не выбирал. */
export const EMPTY_LOOT_CHOICE: LootChoice = { kinds: [], text: "" };

/**
 * Строка на месте выбора, пока его нет. Живёт здесь, рядом с правилом «чем
 * выбор пуст»: экран, который решал бы это сам, однажды назвал бы пустым
 * выбор с одним описанием и без видов.
 */
export const LOOT_NOT_CHOSEN = "Лут не выбран";

/** Выбор пуст: ни одного вида и ни одного слова описания. */
export function isEmptyLootChoice(choice: LootChoice): boolean {
  return choice.kinds.length === 0 && choice.text.trim().length === 0;
}

/**
 * Выбор, приведённый к порядку: виды по `LOOT_KINDS` и без повторов, редкости
 * только у отмеченных видов, которым редкость положена, пустая карта редкостей
 * выброшена. Через неё проходит всё, что ложится в запись, — поэтому «вид
 * отмечен дважды» и «редкость у денег» в кампанию попасть не могут.
 */
function normalized(choice: LootChoice): LootChoice {
  const kinds = LOOT_KINDS.filter((kind) => choice.kinds.includes(kind));
  const rarities: Partial<Record<LootKind, LootRarity>> = {};
  for (const kind of kinds) {
    if (!lootKindHasRarity(kind)) continue;
    const rarity = choice.rarities?.[kind];
    if (rarity) rarities[kind] = rarity;
  }
  const kept = Object.keys(rarities).length > 0 ? { rarities } : {};
  return { kinds, ...kept, text: choice.text };
}

/** Выбор мастера в этой находке; у записи без выбора — пустой. */
export function lootChoiceOf(dungeon: DungeonRecord, id: string): LootChoice {
  const stored = dungeon.loot?.[id];
  return stored ? normalized(stored) : EMPTY_LOOT_CHOICE;
}

/** У находки выбран лут — её признак на схеме мастера. */
export function hasLootChoice(dungeon: DungeonRecord, id: string): boolean {
  return !isEmptyLootChoice(lootChoiceOf(dungeon, id));
}

/** Сколько находок с выбранным лутом: перечень «Пересобрать» обязан их назвать. */
export function lootChoiceCount(dungeon: DungeonRecord): number {
  return Object.keys(dungeon.loot ?? {}).length;
}

/** Редкость отмеченного вида или `null` — мастер её не выбирал. */
export function lootRarityOf(choice: LootChoice, kind: LootKind): LootRarity | null {
  return choice.rarities?.[kind] ?? null;
}

/**
 * Подземелье с новым выбором в находке `id`.
 *
 * Пустой выбор (ни видов, ни описания — и описание из одних пробелов тоже) из
 * записи УДАЛЯЕТСЯ, а не ложится пустым объектом: иначе мастер, снявший все
 * отметки, оставлял бы в кампании пустой ключ — и «Пересобрать» честно
 * предупреждало бы о потере лута, которого нет, а схема ставила бы у такой
 * находки признак.
 *
 * Описание пишется как набрано, пробелы по краям не срезаются: поле
 * управляемое, и подрезка на каждом нажатии не дала бы поставить пробел между
 * словами. Решает «пусто ли» всё равно `trim`.
 */
export function withLootChoice(
  dungeon: DungeonRecord,
  id: string,
  choice: LootChoice,
): DungeonRecord {
  const loot = { ...(dungeon.loot ?? {}) };
  const next = normalized(choice);
  if (isEmptyLootChoice(next)) delete loot[id];
  else loot[id] = next;
  return { ...dungeon, loot };
}

/**
 * Выбор с переключённым видом. Снятый вид уносит свою редкость: оставленная,
 * она вернулась бы вместе с отметкой и выдала бы за выбор мастера то, чего он
 * уже не выбирал.
 */
export function withLootKindToggled(choice: LootChoice, kind: LootKind): LootChoice {
  const on = choice.kinds.includes(kind);
  return normalized({
    ...choice,
    kinds: on ? choice.kinds.filter((k) => k !== kind) : [...choice.kinds, kind],
  });
}

/** Выбор с новой редкостью вида; `null` — редкость снята. */
export function withLootRarity(
  choice: LootChoice,
  kind: LootKind,
  rarity: LootRarity | null,
): LootChoice {
  const rarities = { ...(choice.rarities ?? {}) };
  if (rarity) rarities[kind] = rarity;
  else delete rarities[kind];
  return normalized({ ...choice, rarities });
}

/** Выбор с новым описанием. */
export function withLootText(choice: LootChoice, text: string): LootChoice {
  return normalized({ ...choice, text });
}

/**
 * Выбор строкой: «Магический предмет (редкий) — кольчуга +1». Пустой выбор —
 * пустая строка, и назвать его `LOOT_NOT_CHOSEN` — дело показа.
 *
 * Описание отделено тире, а не точкой: оно идёт после видов и само может
 * оказаться перечнем («40 зм и серебряный кубок»).
 */
export function lootChoiceLine(choice: LootChoice): string {
  const kinds = choice.kinds.map((kind) => {
    const rarity = lootRarityOf(choice, kind);
    return rarity ? `${LOOT_KIND_LABELS[kind]} (${rarity})` : LOOT_KIND_LABELS[kind];
  });
  const text = choice.text.trim();
  if (kinds.length === 0) return text;
  return text.length > 0 ? `${kinds.join(", ")} — ${text}` : kinds.join(", ");
}

/**
 * Подсказка по кнопке «Предложить»: вид и редкость — броском по ступени отряда
 * на числах `dungeonLoot.ts`, суммы монет и камни — текстом в описание, как и
 * выбирал бы их мастер руками.
 *
 * Кость приходит снаружи и в схеме не участвует: «Предложить» бросает своим
 * случаем (`seededDice(randomSeed())`), поэтому схема того же семени от
 * нажатия не сдвигается, а повторное нажатие предлагает заново.
 *
 * Выпавшие монеты — это «Деньги», выпавшие камни — «Драгоценности»: разные
 * виды лута, и подсказка отмечает оба, когда выпали оба. Магический предмет
 * приходит одной редкостью и без описания — какой это предмет, не знает ни
 * бросок, ни приложение, и выдумывать за мастера нечего.
 */
export function suggestLootChoice(dice: SeededDice, partyLevel: number): LootChoice {
  const contents = rollLootContents(dice, partyLevel);
  if (contents.kind === "magic") {
    return normalized({ kinds: ["magic"], rarities: { magic: contents.rarity }, text: "" });
  }
  const kinds: LootKind[] = [];
  if (Object.values(contents.coins).some((amount) => amount > 0)) kinds.push("money");
  if (contents.gems.length > 0) kinds.push("valuables");
  return normalized({ kinds, text: lootContentsLine(contents) });
}
