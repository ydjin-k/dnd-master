import type { Fact, FactSource } from "../../state/types";

/**
 * Русские подписи к фактам мира (§4.6).
 *
 * Тот же разрез, что у лога приключения: движок владеет тем, ЧТО известно о
 * мире (субъект, предикат, значение, источник), интерфейс — тем, как это
 * читается по-русски. Иначе одна и та же фраза жила бы в Rust и в TS сразу.
 *
 * Субъект и предикат НЕ переводятся: это машинные ключи (`door_03`, `locked`),
 * и мастер вводит их сам. Переводить их значило бы завести словарь, второго
 * владельца которому не видно — а §29.2 прямо говорит, что логика от текста не
 * зависит.
 */

const SOURCE_TEXT: Record<FactSource, string> = {
  oracle: "Оракул",
  exploration: "осмотр",
  event: "событие",
  master: "мастер",
};

export function factValueLabel(value: boolean): string {
  return value ? "да" : "нет";
}

export function factSourceLabel(source: FactSource): string {
  return SOURCE_TEXT[source];
}

/** Строка факта для панели «Активно»: `door_03.locked = да`. */
export function factText(fact: Fact): string {
  return `${fact.subject}.${fact.predicate} = ${factValueLabel(fact.value)}`;
}
