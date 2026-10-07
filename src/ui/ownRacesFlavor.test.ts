import { describe, expect, it } from "vitest";
import type { RuleBlock, RuleTopic } from "../state/types";
import { NAME_SUGGESTIONS } from "./characterCreationData";
import { ABYSS_ELF_TOPIC, ABYSS_ELF_ID } from "./abyssElfRace";
import { GOBLIN_TOPIC, GOBLIN_ID } from "./goblinRace";
import { SATYR_TOPIC, SATYR_ID } from "./satyrRace";
import { SERPENT_TOPIC, SERPENT_ID } from "./serpentRace";
import { CHANGELING_TOPIC, CHANGELING_ID } from "./changelingRace";
import { GOLIATH_TOPIC, GOLIATH_ID } from "./goliathRace";
import { TABAXI_TOPIC, TABAXI_ID } from "./tabaxiRace";
import { HARENGON_TOPIC, HARENGON_ID } from "./harengonRace";

/**
 * Сторож ФОРМЫ текста всех ШЕСТИ наших рас — той, которую владелец попросил 04.10.2026,
 * посмотрев на пачку A глазами: «описание бедное, в мастере должно быть как на
 * моих листах». Листы владельца — чужой изданный текст (Volo's, Theros,
 * Eberron), и переносить его нельзя; перенесена СТРУКТУРА, наполненная своим
 * содержанием. Разбор — `docs/design/own-races-how-to.md`, раздел «Форма
 * текста расы».
 *
 * ЧТО ИМЕННО СТОРОЖИТСЯ. Не слова — форма: пять разделов в объявленном
 * порядке, таблица происхождения ровно на к8, три таблицы отыгрыша ровно на
 * к6, механика НЕ выехала из своего раздела, «Источник» остался последним.
 * Проба написана потому, что перестройка модулей руками — ровно тот случай,
 * когда абзац уезжает в соседний раздел незаметно.
 *
 * «Эльф бездны» приведён к той же форме второй просьбой владельца в тот же день:
 * он не из пачки A, поэтому в первую правку не вошёл и остался плоским — пять
 * рас с таблицами против одной без них. Разнобоя больше нет.
 *
 * ПОЧЕМУ ПРОБА НЕ САМОССЫЛОЧНА (урок записи 179). Числа строк она не берёт из
 * тех же констант, что код: «восемь» требуется от ПОДПИСИ таблицы («к8»),
 * прочитанной из самого блока, и сверяется с числом строк того же блока.
 * Разъехаться подписи и содержанию — это и есть ошибка, которую проба ловит;
 * списка «тут должно быть 8» в ней нет.
 */

interface Race {
  id: string;
  topic: RuleTopic;
  /** Название раздела с механикой — у каждой расы своё, во множественном числе. */
  mechanicsSection: string;
}

const RACES: Race[] = [
  { id: ABYSS_ELF_ID, topic: ABYSS_ELF_TOPIC, mechanicsSection: "Особенности эльфов бездны" },
  { id: GOBLIN_ID, topic: GOBLIN_TOPIC, mechanicsSection: "Особенности гоблинов" },
  { id: SATYR_ID, topic: SATYR_TOPIC, mechanicsSection: "Особенности сатиров" },
  { id: SERPENT_ID, topic: SERPENT_TOPIC, mechanicsSection: "Особенности серпентов" },
  { id: CHANGELING_ID, topic: CHANGELING_TOPIC, mechanicsSection: "Особенности чейнджлингов" },
  { id: GOLIATH_ID, topic: GOLIATH_TOPIC, mechanicsSection: "Особенности голиафов" },
  { id: TABAXI_ID, topic: TABAXI_TOPIC, mechanicsSection: "Особенности табакси" },
  { id: HARENGON_ID, topic: HARENGON_TOPIC, mechanicsSection: "Особенности зайцегонов" },
];

/** Заголовки второго уровня по порядку — это и есть оглавление статьи. */
function sections(topic: RuleTopic): string[] {
  return topic.blocks
    .filter((b): b is Extract<RuleBlock, { type: "heading" }> => b.type === "heading" && b.level === 2)
    .map((b) => b.text);
}

/** Блоки, попавшие в раздел с данным заголовком (до следующего заголовка). */
function blocksOfSection(topic: RuleTopic, heading: string): RuleBlock[] {
  const from = topic.blocks.findIndex((b) => b.type === "heading" && b.level === 2 && b.text === heading);
  if (from < 0) return [];
  const rest = topic.blocks.slice(from + 1);
  const to = rest.findIndex((b) => b.type === "heading");
  return to < 0 ? rest : rest.slice(0, to);
}

function tablesOfSection(topic: RuleTopic, heading: string) {
  return blocksOfSection(topic, heading).filter(
    (b): b is Extract<RuleBlock, { type: "table" }> => b.type === "table",
  );
}

describe.each(RACES)("форма текста расы: $id", ({ id, topic, mechanicsSection }) => {
  it("пять разделов в объявленном порядке, механика между культурой и таблицами", () => {
    const names = sections(topic);
    expect(names).toHaveLength(5);
    // Два раздела про культуру — до механики, происхождение и отыгрыш — после.
    expect(names[2]).toBe(mechanicsSection);
    expect(names[3]).toMatch(/^Почему ты /);
    expect(names[4]).toBe("Отыгрыш");
  });

  it("механика осталась в своём разделе и не уехала в культуру", () => {
    const mechanics = blocksOfSection(topic, mechanicsSection)
      .filter((b): b is Extract<RuleBlock, { type: "paragraph" }> => b.type === "paragraph")
      .map((b) => b.text);
    // Три абзаца, без которых лист расы неполон. Если перестройка увезла их
    // в соседний раздел, проба назовёт, какого не хватило.
    for (const opener of ["Увеличение характеристик.", "Скорость.", "Языки."]) {
      expect(mechanics.some((t) => t.startsWith(opener)), `нет абзаца «${opener}»`).toBe(true);
    }
  });

  it("таблица происхождения: подпись и число строк совпадают", () => {
    const [table, ...extra] = tablesOfSection(topic, sections(topic)[3]);
    expect(extra).toHaveLength(0);
    const [header, ...rows] = table.rows;
    // Подпись первой клетки задаёт кость; число строк обязано ей отвечать.
    const die = Number(header[0].replace("к", ""));
    expect(die).toBeGreaterThan(0);
    expect(rows).toHaveLength(die);
    expect(rows.map((r) => r[0])).toEqual(rows.map((_, i) => String(i + 1)));
  });

  it("отыгрыш: три таблицы, каждая отвечает своей подписи", () => {
    const tables = tablesOfSection(topic, "Отыгрыш");
    expect(tables.map((t) => t.rows[0][1])).toEqual(["Черта характера", "Идеал", "Привязанность"]);
    for (const t of tables) {
      const [header, ...rows] = t.rows;
      const die = Number(header[0].replace("к", ""));
      expect(rows).toHaveLength(die);
      expect(rows.map((r) => r[0])).toEqual(rows.map((_, i) => String(i + 1)));
    }
  });

  it("все таблицы прямоугольны — `RuleBlockView` рисует их как есть", () => {
    const tables = topic.blocks.filter(
      (b): b is Extract<RuleBlock, { type: "table" }> => b.type === "table",
    );
    expect(tables).toHaveLength(4);
    for (const t of tables) {
      const widths = new Set(t.rows.map((r) => r.length));
      expect([...widths]).toEqual([2]);
    }
  });

  it("«Источник» остался последним блоком статьи", () => {
    const last = topic.blocks[topic.blocks.length - 1];
    expect(last.type).toBe("paragraph");
    expect((last as Extract<RuleBlock, { type: "paragraph" }>).text).toMatch(/^Источник\./);
  });

  it("раса даёт свои имена, а не падает на общий список", () => {
    const names = NAME_SUGGESTIONS[id];
    expect(names, `у ${id} нет своего списка имён`).toBeDefined();
    expect(names).not.toBe(NAME_SUGGESTIONS.general);
    expect(names.male).not.toEqual(names.female);
    // Повтор внутри списка обесценивает кнопку «Предложить имя»: она избегает
    // ровно предыдущего имени, а не всех показанных.
    for (const key of ["male", "female"] as const) {
      expect(new Set(names[key]).size, `повтор в ${key}`).toBe(names[key].length);
    }
  });
});
