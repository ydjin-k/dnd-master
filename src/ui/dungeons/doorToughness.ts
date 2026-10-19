import type { RuleTopic } from "../../state/types";
import { seededDice } from "./seededRandom";

/**
 * Насколько крепка дверь подземелья: КД и хиты, чтобы мастер сразу знал, можно
 * ли дверь выбить.
 *
 * **Чисел в этом файле нет.** Обе таблицы читаются из `rules.json`, раздел
 * `additional-rules-objects`: «Уровень защиты предметов» (вещество → КД) и
 * «Хиты предметов» (размер × хрупкий/крепкий). Таблица ищется по шапке, а не по
 * номеру блока, — так сдвиг блоков в справочнике не подменит её соседней.
 * Сторож — `doorToughness.test.ts`: он сверяет выданное с самим `rules.json`.
 *
 * Дверь — Средний крепкий предмет, так решено карточкой; размер и крепость
 * здесь и названы, чтобы в экране их не пришлось повторять.
 */

export const OBJECTS_TOPIC_ID = "additional-rules-objects";

/** Строка таблицы хитов, по которой считается дверь. */
export const DOOR_SIZE = "Средний";
/** Столбец той же таблицы: дверь крепкая, а не хрупкая. */
export const DOOR_STRENGTH = "Крепкий";

export const DOOR_MATERIALS = ["Дерево", "Камень", "Железо"] as const;
export type DoorMaterial = (typeof DOOR_MATERIALS)[number];

/**
 * По каким словам строки таблицы `dungeon-door` видно вещество двери. Корни, а
 * не целые слова: граница слова в JS по русскому тексту не срабатывает вовсе, а
 * «деревянная» и «дерево» — одно и то же дерево. Если строка назовёт два
 * вещества сразу, побеждает первое по `DOOR_MATERIALS`.
 *
 * Слова подобраны по строкам таблицы: «Разбухшая деревянная» — дерево,
 * «Каменная на оси» и «Заложенный проём — Кладка свежее стен» — камень,
 * «Окованная» и «Решётка — …сквозь прутья» — железо. Остальные строки вещества
 * не называют вовсе («Распахнутая», «Дверь без ручки»), и его бросает кость.
 */
const MATERIAL_WORDS: Readonly<Record<DoorMaterial, readonly string[]>> = {
  Дерево: ["дерев"],
  Камень: ["камен", "кладк"],
  Железо: ["желез", "окован", "решётк", "прут"],
};

/** Таблицы предметов из справочника: КД по веществу и хиты двери. */
export interface ObjectToughness {
  readonly armorClass: Readonly<Record<DoorMaterial, number>>;
  /** Клетка «Крепкий» у Среднего размера — как есть, вместе с броском. */
  readonly hitPoints: string;
}

export interface DoorToughness extends ObjectToughness {
  readonly material: DoorMaterial;
  /** КД этого вещества — то же число, что в `armorClass[material]`. */
  readonly armor: number;
}

function tableWithHeader(topic: RuleTopic, firstCell: string): string[][] | null {
  for (const block of topic.blocks) {
    if (block.type === "table" && block.rows[0]?.[0]?.trim() === firstCell) return block.rows;
  }
  return null;
}

/**
 * Обе таблицы предметов — либо `null`, если справочник не несёт их целиком.
 * Половинчатый результат не отдаётся: «КД 15, хиты —» сказало бы мастеру, что
 * хитов у двери нет, а это неправда.
 */
export function readObjectToughness(topics: readonly RuleTopic[]): ObjectToughness | null {
  const topic = topics.find((t) => t.id === OBJECTS_TOPIC_ID);
  if (!topic) return null;
  const armorRows = tableWithHeader(topic, "Вещество");
  const hitRows = tableWithHeader(topic, "Размер");
  if (!armorRows || !hitRows) return null;

  const armorClass = {} as Record<DoorMaterial, number>;
  for (const material of DOOR_MATERIALS) {
    // «Дерево, кость» — вещество стоит первым в клетке, остальное рядом с ним.
    const row = armorRows.find((r) => r[0]?.split(",")[0].trim() === material);
    const value = row && Number(row[1]?.trim());
    if (!row || !value || !Number.isFinite(value)) return null;
    armorClass[material] = value;
  }

  const column = hitRows[0].findIndex((cell) => cell.trim() === DOOR_STRENGTH);
  // «Средний (бочонок, люстра)»: размер стоит в начале клетки.
  const sizeRow = hitRows.slice(1).find((r) => r[0]?.trim().startsWith(DOOR_SIZE));
  const hitPoints = column > 0 && sizeRow ? (sizeRow[column] ?? "").trim() : "";
  if (hitPoints.length === 0) return null;
  return { armorClass, hitPoints };
}

/**
 * Вещество двери по строке таблицы `dungeon-door`, а если строка его не
 * называет — по кости. Кость засеяна семенем схемы и `id` отметки: в записи
 * кампании нового поля под вещество нет, поэтому подземелья, созданные до
 * дверных чисел, показывают то же самое, что новые, и показывают это одинаково
 * при каждом открытии.
 */
export function doorMaterial(line: string | null, seed: number, markerId: string): DoorMaterial {
  const text = (line ?? "").toLowerCase();
  const named = DOOR_MATERIALS.find((material) =>
    MATERIAL_WORDS[material].some((word) => text.includes(word)),
  );
  if (named) return named;
  let state = seed | 0;
  for (const letter of markerId) state = (Math.imul(state, 31) + letter.charCodeAt(0)) | 0;
  return DOOR_MATERIALS[seededDice(state).die(DOOR_MATERIALS.length) - 1];
}

/** Вещество, КД и хиты одной двери — всё, что нужно строке «Выбить». */
export function doorToughness(
  toughness: ObjectToughness,
  line: string | null,
  seed: number,
  markerId: string,
): DoorToughness {
  const material = doorMaterial(line, seed, markerId);
  return { ...toughness, material, armor: toughness.armorClass[material] };
}
