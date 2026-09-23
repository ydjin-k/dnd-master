import type { LogLine, SceneOutcome } from "../../state/types";

/**
 * Русская строка лога приключения по записи движка.
 *
 * Владелец текста — этот файл, и только он: движок хранит ключ и числа
 * (`LogLine`), фраза живёт здесь. Тот же разрез, что у текста события в
 * ADR 0001 («движок владеет ключом, UI владеет строкой»), и он нужен ровно
 * затем, чтобы одна фраза не оказалась написанной дважды — в Rust и в TS.
 *
 * Лог приключения — НЕ дневник кампании. Движок в дневник не пишет никак, ни
 * сам, ни по кнопке (решение владельца 23.09.2026, правка к §29.2), и мостика
 * между ними здесь нет.
 */

const OUTCOME_TEXT: Record<SceneOutcome, string> = {
  calmer: "Ситуация стала контролируемее",
  unchanged: "Существенных изменений нет",
  worse: "Положение ухудшилось",
};

export function adventureLogText(line: LogLine): string {
  switch (line.kind) {
    case "sceneStarted":
      return (
        `Сцена началась: ${line.location}. ` +
        `Цель: «${line.objective}». Напряжение ${line.tension}.`
      );
    case "sceneEnded":
      return (
        `Сцена завершена: ${line.location}. Цель: «${line.objective}». ` +
        `${OUTCOME_TEXT[line.outcome]}. ` +
        `Напряжение ${line.tensionBefore} → ${line.tensionAfter}.`
      );
  }
}

/** Подпись исхода для кнопок завершения сцены — из того же места, что и
 *  строка лога, чтобы игрок читал на кнопке ровно то, что потом увидит. */
export function outcomeLabel(outcome: SceneOutcome): string {
  return OUTCOME_TEXT[outcome];
}
