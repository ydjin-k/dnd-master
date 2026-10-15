import { describe, expect, it } from "vitest";
import ownCreatures from "../../src-tauri/bestiary/own-creatures.json";
import { EVENT_TABLES } from "./eventTables";
import { OWN_FEATS } from "./feats";
import { OPTIONAL_RULE_TOPICS } from "./optionalRules";
import * as aasimar from "./aasimarRace";
import * as abyssElf from "./abyssElfRace";
import * as changeling from "./changelingRace";
import * as firbolg from "./firbolgRace";
import * as genasi from "./genasiRace";
import * as goblin from "./goblinRace";
import * as goliath from "./goliathRace";
import * as harengon from "./harengonRace";
import * as satyr from "./satyrRace";
import * as serpent from "./serpentRace";
import * as tabaxi from "./tabaxiRace";
import * as alchemist from "./alchemistClass";
import * as artificer from "./artificerClass";
import * as bloodHunter from "./bloodHunterClass";

/**
 * Сторож решения владельца 15.10.2026: служебных приписок на экране нет.
 *
 * Владелец, посмотрев приложение: «Ты везде оставлял приписки, причём в
 * большом количестве <…> такое надо убрать, они загромождают экран». На
 * развилку — «Убрать вообще всё»: ни рассказов о происхождении, ни метки
 * «не входит в SRD 5.1», ни «Источника» у наших рас, ни «что взято из PDF» у
 * наших классов, ни «решение владельца от …», «исходник», «Producer»
 * (`content-strip-provenance-notes`). Происхождение не потеряно — оно лежит
 * комментариями рядом с данными; на экран оно не выводится.
 *
 * ЧТО ОБХОДИТСЯ. Всё наше, что игрок может увидеть: все строки, которые
 * экспортируют модули наших рас и классов (статья, особенности для листа,
 * подсказки имён), опциональные правила, наши черты, видимые поля таблиц
 * генератора (имя, подпись под таблицей, строки) и свои существа бестиария
 * целиком. Текст SRD сюда не входит: там «SRD» и лицензия — законная подпись,
 * а не приписка.
 *
 * ПОЧЕМУ У ТАБЛИЦ НЕ ВСЁ, А ВИДИМЫЕ ПОЛЯ. `source` таблицы — как раз запись
 * о происхождении для своих («Передано владельцем 16.09.2026…»), на экран она
 * не идёт и по смыслу обязана содержать то, что здесь запрещено.
 *
 * ПОЧЕМУ СПИСОК ОБОРОТОВ, А НЕ ОДНО СЛОВО. Приписки были написаны по-разному:
 * «раса этого приложения», «Написано заново по структуре и сути исходника»,
 * «решение владельца от 16.09.2026», «Лист их не выдаёт», «Наше правило, не
 * SRD». Каждый оборот ниже — по меньшей мере одна снятая 15.10.2026 приписка;
 * отрицательная проба в конце файла держит это и дальше.
 *
 * ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ. «Кость бросает движок», «лист сам не считает —
 * впишите вручную», «выше потолка приложения» — правила показа: они говорят
 * игроку, что делать за столом, и остаются (граница проведена карточкой).
 */
const SERVICE_PHRASES: readonly RegExp[] = [
  /^Источник\./,
  /(раса|класс) этого приложения/,
  /\bSRD\b|System Reference Document/,
  /CC BY/,
  /\bPDF\b/,
  /Producer/,
  /исходник/i,
  /владел\S* (продукта|решил)|решени\S* владельца|владельц\S* от \d|владельцем \d|[Рр]едакция владельца|сборник владельца|передан\S* владельцем|дано владельцем/,
  /Лист их не выдаёт|в справочнике приложения нет/,
  /в прежнем виде/,
  /[Нн]аписан\S* (заново|для (этого приложения|D&D Master))|придуман\S* здесь/,
  /[Нн]аше правило|наш набор/,
  /не выдаётся за/,
  /перепечатк/,
  /Подтаблица документа|не перенесен/,
  /\b\d{2}\.\d{2}\.20\d{2}\b/,
];

/** Строка с первым запретным оборотом, который в ней нашёлся, — иначе `null`. */
function findServicePhrase(text: string): string | null {
  const hit = SERVICE_PHRASES.find((phrase) => phrase.test(text));
  return hit ? String(hit) : null;
}

/** Все строки значения, рекурсивно, с путём до каждой. */
function stringsOf(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, i) => stringsOf(item, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) stringsOf(item, `${path}.${key}`, out);
  }
}

const OWN_MODULES: Record<string, Record<string, unknown>> = {
  aasimar, abyssElf, changeling, firbolg, genasi, goblin, goliath, harengon, satyr, serpent,
  tabaxi, alchemist, artificer, bloodHunter,
};

/** Всё наше, что видит игрок, — пары «где : текст». */
function visibleOwnTexts(): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, mod] of Object.entries(OWN_MODULES)) stringsOf(mod, name, out);
  stringsOf(OPTIONAL_RULE_TOPICS, "optionalRules", out);
  stringsOf(OWN_FEATS, "feats", out);
  for (const table of EVENT_TABLES) {
    out.push([`${table.id}.name`, table.name]);
    if (table.sourceNote) out.push([`${table.id}.sourceNote`, table.sourceNote]);
    table.rows.forEach((row) => out.push([`${table.id}#${row.from}`, row.text]));
  }
  stringsOf(ownCreatures, "own-creatures", out);
  return out;
}

function serviceHits(texts: [string, string][]): string[] {
  return texts.flatMap(([where, text]) => {
    const hit = findServicePhrase(text);
    return hit ? [`${where} ${hit}: ${text.slice(0, 80)}`] : [];
  });
}

describe("служебных приписок на экране нет (решение владельца 15.10.2026)", () => {
  it("обход видит всё наше: расы, классы, правила, черты, таблицы, существа", () => {
    // Обход, нашедший ноль строк, был бы зелёным вхолостую.
    const texts = visibleOwnTexts();
    const sources = new Set(texts.map(([where]) => where.split(/[.#[]/)[0]));
    for (const name of [...Object.keys(OWN_MODULES), "optionalRules", "feats", "own-creatures"]) {
      expect(sources.has(name), name).toBe(true);
    }
    expect(texts.filter(([where]) => where.endsWith(".sourceNote")).length).toBeGreaterThan(0);
  });

  it("ни в одном показываемом тексте наших модулей нет служебного оборота", () => {
    expect(serviceHits(visibleOwnTexts())).toEqual([]);
  });

  // ── отрицательные пробы: сторож обязан краснеть на снятом ────────────────

  /**
   * Приписки, снятые 15.10.2026, — по одной на каждый вид, дословно. Возврат
   * любой из них на экран сторож обязан поймать.
   */
  const REMOVED: readonly string[] = [
    "Источник. Гоблин как играбельная раса — раса этого приложения, а не раса SRD 5.1.",
    "Источник. Алхимик — класс этого приложения, а не класс SRD 5.1. Числа и устройство класса взяты из PDF «Алхимик», принесённого владельцем продукта.",
    "Список заклинаний изобретателя — наш: в PDF его нет, и владелец решил собрать его из заклинаний справочника по теме класса.",
    "В таблице специальности есть и заклинания, которых в справочнике приложения нет: Луч болезни. Лист их не выдаёт.",
    "Написано заново по структуре и сути исходника: текст исходника — дословный текст изданного приключения, решение владельца от 16.09.2026 — переписать.",
    "двадцать строк этой таблицы приняты в прежнем виде и не переписывались.",
    "Редакция владельца от 16.09.2026: 230 пунктов.",
    "Авторский сборник владельца, передан 30.09.2026: все строки написаны специально для него — это не официальный текст и не перепечатка таблиц книги.",
    "Газовая спора исходника носит наше имя — Спорогниль, оно дано владельцем 23.09.2026.",
    "Подтаблица документа «Случаные столкновения в пути». Верхняя таблица-распределитель 1к12 не перенесена.",
    "Этот раздел не входит в SRD 5.1 — он написан для D&D Master.",
    "Опциональные правила — не часть SRD 5.1. Механика и числа взяты из сторонних дополнений, текст написан заново для этого приложения.",
    "Существо не входит в System Reference Document 5.1: имя, описание, особые свойства и действия написаны для D&D Master, лицензия CC BY 4.0 на него не распространяется.",
    "Черты: наш набор",
    "Наше правило, не SRD: проверка Мудрости",
  ];

  it.each(REMOVED)("сторож ловит снятую приписку: %s", (note) => {
    expect(findServicePhrase(note)).not.toBeNull();
  });

  it("сторож ловит приписку, вернувшуюся в живые данные, и называет место", () => {
    const texts = visibleOwnTexts();
    const [where] = texts.find(([w]) => w.startsWith("goblin.GOBLIN_TOPIC.blocks") && w.endsWith(".text"))!;
    const returned: [string, string][] = [...texts, [where, REMOVED[0]]];
    expect(serviceHits(returned)).toEqual([expect.stringContaining(where)]);
  });

  it("правило показа за приписку не считается: «впишите вручную» и «движок» остаются", () => {
    expect(findServicePhrase("Заговоры лист сам не выдаёт — впишите их вручную.")).toBeNull();
    expect(findServicePhrase("Кость бросает движок.")).toBeNull();
    expect(findServicePhrase("На 18 уровне — «Оно живое!», выше нынешнего потолка приложения.")).toBeNull();
  });
});
