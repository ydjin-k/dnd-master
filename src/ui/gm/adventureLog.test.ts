import { describe, it, expect } from "vitest";
import { adventureLogText, oracleOutcomeLabel, outcomeLabel } from "./adventureLog";

/**
 * Строка лога приключения рождается ЗДЕСЬ и только здесь — у текста один
 * владелец. Проба держит формулировки дословно: если строка поедет, поедет и
 * она, а не жалоба игрока на разъехавшийся лог.
 */
describe("строки лога приключения", () => {
  it("создание сцены", () => {
    expect(
      adventureLogText({
        kind: "sceneStarted",
        location: "Подземный зал",
        objective: "Найти выход",
        tension: 3,
      }),
    ).toBe("Сцена началась: Подземный зал. Цель: «Найти выход». Напряжение 3.");
  });

  it("завершение сцены — с исходом и обоими числами напряжения", () => {
    expect(
      adventureLogText({
        kind: "sceneEnded",
        location: "Подземный зал",
        objective: "Найти выход",
        outcome: "worse",
        tensionBefore: 3,
        tensionAfter: 4,
      }),
    ).toBe(
      "Сцена завершена: Подземный зал. Цель: «Найти выход». " +
        "Положение ухудшилось. Напряжение 3 → 4.",
    );
  });

  it("исход на кнопке и исход в логе — одни и те же слова", () => {
    const line = adventureLogText({
      kind: "sceneEnded",
      location: "Зал",
      objective: "Цель",
      outcome: "calmer",
      tensionBefore: 3,
      tensionAfter: 2,
    });
    expect(line).toContain(outcomeLabel("calmer"));
    expect(outcomeLabel("unchanged")).toBe("Существенных изменений нет");
  });

  /**
   * Ответ Оракула с броском — игрок видит и число, и вероятность, против
   * которой оно сравнивалось. Без них строка «НЕТ» ничего не объясняет.
   */
  it("ответ Оракула с броском называет число и вероятность", () => {
    expect(
      adventureLogText({
        kind: "oracleAnswered",
        question: "Дверь заперта?",
        subject: "door_03",
        predicate: "locked",
        probability: 70,
        roll: 82,
        outcome: "no",
        value: false,
      }),
    ).toBe("Оракул: «Дверь заперта?» → НЕТ. door_03.locked = нет (бросок 82 при вероятности 70).");
  });

  /**
   * §6.3 глазами игрока: тот же вопрос второй раз — и в логе прямо сказано,
   * что броска не было. Признак приходит из движка полем `roll: null`, строка
   * его не выводит ни из чего косвенного.
   */
  it("ответ из факта говорит, что броска не было", () => {
    expect(
      adventureLogText({
        kind: "oracleAnswered",
        question: "Дверь заперта?",
        subject: "door_03",
        predicate: "locked",
        probability: 70,
        roll: null,
        outcome: "yes",
        value: true,
      }),
    ).toBe(
      "Оракул: «Дверь заперта?» → ДА. door_03.locked = да " +
        "(ответ из уже известного факта, бросок не выполнялся).",
    );
  });

  it("у всех четырёх исходов §6.2 есть своя подпись, и крайние отличимы", () => {
    expect(oracleOutcomeLabel("strongYes")).toBe("ДА, и более того");
    expect(oracleOutcomeLabel("yes")).toBe("ДА");
    expect(oracleOutcomeLabel("no")).toBe("НЕТ");
    expect(oracleOutcomeLabel("strongNo")).toBe("НЕТ, и хуже того");
  });
});
