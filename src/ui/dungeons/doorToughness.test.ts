import { describe, expect, it } from "vitest";
import bundledRules from "../../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../../state/types";
import { findDungeonTable } from "../eventTables/dungeonTables";
import {
  DOOR_MATERIALS,
  DOOR_SIZE,
  DOOR_STRENGTH,
  doorMaterial,
  doorToughness,
  OBJECTS_TOPIC_ID,
  readObjectToughness,
  type DoorMaterial,
  type ObjectToughness,
} from "./doorToughness";

const topics = bundledRules as RuleTopic[];
const topic = topics.find((t) => t.id === OBJECTS_TOPIC_ID)!;

/**
 * Эталон берётся из самого `rules.json` и ПО НОМЕРАМ блоков, названным в
 * карточке (`blocks[7]` — вещество → КД, `blocks[10]` — хиты), а код ищет
 * таблицы по шапке. Пути разные, поэтому сдвиг в выборе строки или столбца
 * здесь краснеет, а не совпадает сам с собой.
 *
 * Рядом с клетками справочника стоят те же числа, выписанные руками: 15 у
 * дерева, 17 у камня, 19 у железа, 18 (4к8) хитов. Это намеренный дубль —
 * сдвинется число в коде, покраснеет сверка с клеткой; сдвинется клетка в
 * справочнике, покраснеет сверка с выписанным.
 */
const armorBlock = topic.blocks[7];
const hitsBlock = topic.blocks[10];
if (armorBlock.type !== "table" || hitsBlock.type !== "table") {
  throw new Error("в rules.json на местах 7 и 10 раздела предметов обязаны стоять таблицы");
}

const BY_HAND: Readonly<Record<DoorMaterial, number>> = { Дерево: 15, Камень: 17, Железо: 19 };
const HITS_BY_HAND = "18 (4к8)";

/** Клетка «УЗ» той строки, где это вещество названо первым. */
const armorCell = (material: string) =>
  armorBlock.rows.find((row) => row[0].split(",")[0].trim() === material)![1].trim();

describe("КД и хиты двери против rules.json", () => {
  const toughness = readObjectToughness(topics) as ObjectToughness;

  it("шапки таблиц — те самые, и клетки совпадают с выписанными руками", () => {
    expect(armorBlock.rows[0]).toEqual(["Вещество", "УЗ"]);
    expect(hitsBlock.rows[0]).toEqual(["Размер", "Хрупкий", DOOR_STRENGTH]);
    for (const material of DOOR_MATERIALS) {
      expect(armorCell(material), material).toBe(String(BY_HAND[material]));
    }
    const sizeRow = hitsBlock.rows.find((row) => row[0].startsWith(DOOR_SIZE))!;
    expect(sizeRow[hitsBlock.rows[0].indexOf(DOOR_STRENGTH)]).toBe(HITS_BY_HAND);
  });

  it("КД — клетка вещества, хиты — клетка Среднего крепкого", () => {
    for (const material of DOOR_MATERIALS) {
      expect(toughness.armorClass[material], material).toBe(Number(armorCell(material)));
      expect(toughness.armorClass[material], material).toBe(BY_HAND[material]);
    }
    expect(toughness.hitPoints).toBe(HITS_BY_HAND);
    // Хиты у двери одни на все вещества: размер и крепость от вещества не зависят.
    for (const material of DOOR_MATERIALS) {
      const door = doorToughness(toughness, material, 1, "door-1");
      expect([door.material, door.armor, door.hitPoints]).toEqual([
        material,
        BY_HAND[material],
        HITS_BY_HAND,
      ]);
    }
  });

  it("вещество берётся из строки таблицы дверей, а без него — по кости", () => {
    const rows = findDungeonTable("dungeon-door")!.rows;
    expect(rows).toHaveLength(12);
    /** Строки, которые вещество называют сами; остальные его бросают. */
    const named: Readonly<Record<number, DoorMaterial>> = {
      1: "Дерево", // «Разбухшая деревянная»
      2: "Дерево", // «Окованная, запертая» — полотно деревянное, полосы железные
      3: "Камень", // «Каменная на оси»
      4: "Железо", // «Решётка — …сквозь прутья»
      5: "Камень", // «Заложенный проём — Кладка свежее стен»
    };
    for (const row of rows) {
      const material = doorMaterial(row.text, 20261018, "door-1");
      if (named[row.from]) expect(material, row.text).toBe(named[row.from]);
      else expect(DOOR_MATERIALS, row.text).toContain(material);
    }
    // Названное вещество от семени и отметки не зависит вовсе.
    for (const seed of [1, 777, 20261018]) {
      expect(doorMaterial(rows[0].text, seed, `door-${seed}`)).toBe("Дерево");
    }
  });

  it("брошенное вещество постоянно у одной двери и разное у разных", () => {
    // «Распахнутая» вещества не называет: его бросает кость от семени и id.
    const line = findDungeonTable("dungeon-door")!.rows.find((r) => r.from === 6)!.text;
    expect(doorMaterial(line, 4242, "door-3")).toBe(doorMaterial(line, 4242, "door-3"));
    const ids = Array.from({ length: 14 }, (_, i) => `door-${i + 1}`);
    const rolled = new Set(ids.map((id) => doorMaterial(line, 4242, id)));
    expect(rolled.size, "все двери одной схемы вышли из одного вещества").toBeGreaterThan(1);
    // Схема другая — вещества тех же дверей не повторяют прежние поголовно.
    const other = ids.map((id) => doorMaterial(line, 777, id));
    expect(other).not.toEqual(ids.map((id) => doorMaterial(line, 4242, id)));
    // Строки у двери может не быть вовсе — кость всё равно даёт вещество.
    expect(DOOR_MATERIALS).toContain(doorMaterial(null, 4242, "door-1"));
  });

  it("без раздела предметов чисел нет, а не наполовину", () => {
    expect(readObjectToughness([])).toBeNull();
    expect(readObjectToughness([{ ...topic, blocks: [armorBlock] }])).toBeNull();
    expect(readObjectToughness([{ ...topic, blocks: [hitsBlock] }])).toBeNull();
  });
});
