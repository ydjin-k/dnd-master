import { describe, it, expect } from "vitest";
import { factSourceLabel, factText, factValueLabel } from "./facts";
import type { Fact } from "../../state/types";

function fact(over: Partial<Fact> = {}): Fact {
  return {
    id: "fact-1",
    subject: "door_03",
    predicate: "locked",
    value: true,
    source: "oracle",
    certainty: "confirmed",
    ...over,
  };
}

describe("подписи фактов мира", () => {
  it("строка факта читается как утверждение о мире", () => {
    expect(factText(fact())).toBe("door_03.locked = да");
    expect(factText(fact({ value: false }))).toBe("door_03.locked = нет");
  });

  /** Ключи не переводятся: мастер вводит их сам, словаря им не завести. */
  it("субъект и предикат остаются машинными ключами", () => {
    expect(factText(fact({ subject: "room_01", predicate: "second_exit" }))).toBe(
      "room_01.second_exit = да",
    );
  });

  it("каждый источник §4.6 назван по-русски", () => {
    expect(factSourceLabel("oracle")).toBe("Оракул");
    expect(factSourceLabel("exploration")).toBe("осмотр");
    expect(factSourceLabel("event")).toBe("событие");
    expect(factSourceLabel("master")).toBe("мастер");
  });

  it("значение называется тем же словом, что и на кнопке изменения", () => {
    expect(factValueLabel(true)).toBe("да");
    expect(factValueLabel(false)).toBe("нет");
  });
});
