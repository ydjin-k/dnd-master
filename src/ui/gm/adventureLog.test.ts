import { describe, it, expect } from "vitest";
import { adventureLogText, outcomeLabel } from "./adventureLog";

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
});
