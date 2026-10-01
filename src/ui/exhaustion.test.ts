import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../state/types";
import { CONDITIONS } from "./characterCreationData";
import {
  EXHAUSTION_MAX_LEVEL,
  EXHAUSTION_RECOVERY,
  exhaustionEffectLines,
  exhaustionLevelName,
  exhaustionLevelOf,
  withExhaustionRaised,
  withExhaustionReduced,
} from "./exhaustion";

const srdTopics = bundledRules as unknown as RuleTopic[];

describe("истощение — формат строки и источник", () => {
  /**
   * Сторож формата. Истощение живёт в `conditions: string[]`, и ставит его туда
   * не только форсированный марш, но и кнопки состояний на листе, которые
   * берут имена из `CONDITIONS`. Разъедься эти две записи — марш поднимал бы
   * истощение, которого лист не видит.
   */
  it("шесть уровней называются ровно так же, как строки CONDITIONS", () => {
    for (let level = 1; level <= EXHAUSTION_MAX_LEVEL; level++) {
      expect(CONDITIONS).toContain(exhaustionLevelName(level));
    }
    expect(CONDITIONS).not.toContain(exhaustionLevelName(EXHAUSTION_MAX_LEVEL + 1));
  });

  /**
   * Абзац о снятии — из источника, а не из чьей-то памяти. Сверка без «ё»:
   * в `rules.json` стоит «питье», в константе листа — «питьё», и это
   * единственное расхождение между ними. Нормализовать ё здесь дешевле, чем
   * править текст, который уже показан на листе персонажа.
   */
  it("абзац о снятии взят из rules.json", () => {
    const conditions = srdTopics.find((t) => t.id === "appendices-conditions")!;
    const plain = (text: string) => text.replace(/ё/g, "е");
    const texts = conditions.blocks.map((b) => ("text" in b ? plain(b.text) : ""));

    expect(texts).toContain(plain(EXHAUSTION_RECOVERY));
  });

  /**
   * Накопление и подъём уровня — тоже из источника: `appendices-conditions`
   * говорит и «текущий уровень истощения увеличивается на величину, указанную в
   * описании эффекта», и «существо страдает от эффекта его текущего уровня, а
   * также всех более низких».
   */
  it("правила подъёма и накопления стоят в источнике", () => {
    const conditions = srdTopics.find((t) => t.id === "appendices-conditions")!;
    const texts = conditions.blocks.map((b) => ("text" in b ? b.text : ""));

    expect(texts.some((t) => t.includes("уровень истощения увеличивается"))).toBe(true);
    expect(texts.some((t) => t.includes("а также всех более низких уровней"))).toBe(true);
    expect(texts.some((t) => t.includes("Истощение имеет шесть уровней"))).toBe(true);
  });
});

describe("withExhaustionRaised", () => {
  it("первый провал даёт первый уровень", () => {
    expect(withExhaustionRaised([])).toEqual([exhaustionLevelName(1)]);
  });

  /** Критерий карточки: второй провал обязан дать ровно «Истощение (ур. 2)». */
  it("второй провал поднимает уровень, а не ставит вторую строку рядом", () => {
    const first = withExhaustionRaised([]);
    const second = withExhaustionRaised(first);

    expect(second).toEqual([exhaustionLevelName(2)]);
    expect(exhaustionLevelOf(second)).toBe(2);
  });

  it("прочие состояния остаются на листе", () => {
    expect(withExhaustionRaised(["Отравленное", exhaustionLevelName(1)])).toEqual([
      "Отравленное",
      exhaustionLevelName(2),
    ]);
  });

  /** Жажда при уже имеющемся истощении даёт сразу две ступени — `[3]/blocks[32]`. */
  it("две ступени разом поднимают на два уровня", () => {
    expect(withExhaustionRaised([exhaustionLevelName(1)], 2)).toEqual([exhaustionLevelName(3)]);
  });

  it("выше шестого уровня не поднимает: седьмой ступени в SRD нет", () => {
    const dead = [exhaustionLevelName(EXHAUSTION_MAX_LEVEL)];

    expect(withExhaustionRaised(dead)).toBe(dead);
    expect(withExhaustionRaised([exhaustionLevelName(5)], 3)).toEqual([exhaustionLevelName(6)]);
  });

  it("поднятое истощение снимается тем же механизмом, что и всякое другое", () => {
    const raised = withExhaustionRaised(withExhaustionRaised([]));

    expect(withExhaustionReduced(raised)).toEqual([exhaustionLevelName(1)]);
  });

  it("текст эффекта показывает все уровни до текущего, а не только последний", () => {
    const lines = exhaustionEffectLines(exhaustionLevelOf(withExhaustionRaised(withExhaustionRaised([]))));

    expect(lines[0]).toBe("Помеха на проверки характеристик.");
    expect(lines[1]).toBe("Скорость уменьшается вдвое.");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe(EXHAUSTION_RECOVERY);
  });

  it("игрок, наставивший несколько строк руками, получает уровень от высшей", () => {
    const messy = [exhaustionLevelName(1), exhaustionLevelName(3)];

    expect(withExhaustionRaised(messy)).toEqual([exhaustionLevelName(1), exhaustionLevelName(4)]);
  });
});
