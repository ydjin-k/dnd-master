import { describe, it, expect } from "vitest";
import { CLASS_SUBCLASSES } from "./characterCreationData";
import { findCoverageGap, type EventTable } from "./eventTables/index";
import {
  attemptWildMagicSurge,
  isWildMagicSorcerer,
  NO_WILD_MAGIC_TURN,
  rollWildMagicSurge,
  WILD_MAGIC_DIE,
  WILD_MAGIC_PAYBACK_FEATURE,
  WILD_MAGIC_SUBCLASS_NAME,
  WILD_MAGIC_TABLE,
  WILD_MAGIC_TABLE_SIZE,
  WILD_MAGIC_TRIGGER_MAX,
  wildMagicTurnKey,
  type WildMagicRow,
} from "./wildMagicSurges";
import type { CombatState } from "../state/types";

/** Подменённая случайность: очередь значений, которые вернёт `random()` по порядку. */
function fakeRandom(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** Значение random(), дающее ровно этот результат к20 (d20 = floor(r × 20) + 1). */
const d20Value = (d20: number) => (d20 - 1) / 20 + 0.001;

/** Значение random(), дающее ровно эту строку таблицы (roll = floor(r × 100) + 1). */
const rowValue = (roll: number) => (roll - 1) / WILD_MAGIC_DIE + 0.001;

/**
 * Взгляд на таблицу дикой магии как на таблицу событий — чтобы покрытие кости
 * проверял тот же `findCoverageGap`, а не вторая его копия здесь. Номер строки
 * у нас не хранится (он и есть позиция плюс единица), поэтому диапазон строки
 * строится из позиции.
 */
function asEventTable(rows: readonly WildMagicRow[]): EventTable {
  return {
    id: "wild-magic-surges",
    name: "Всплески дикой магии",
    group: "Магия",
    die: WILD_MAGIC_DIE,
    source: "Документ владельца, 23.09.2026",
    rows: rows.map((row, i) => ({ from: i + 1, to: i + 1, text: row.text })),
  };
}

describe("таблица дикой магии", () => {
  it("кость d100, ровно 100 строк, и все тексты разные", () => {
    expect(WILD_MAGIC_DIE).toBe(100);
    expect(WILD_MAGIC_TABLE_SIZE).toBe(100);
    expect(new Set(WILD_MAGIC_TABLE.map((row) => row.text)).size).toBe(100);
  });

  it("таблица закрывает свою кость без дыр и нахлёстов", () => {
    expect(findCoverageGap(asEventTable(WILD_MAGIC_TABLE))).toBeNull();
  });

  it("каждая строка непустая, заканчивается точкой и короче 200 знаков", () => {
    // Самая длинная строка документа владельца — 179 знаков (№87), запас 21.
    for (const row of WILD_MAGIC_TABLE) {
      expect(row.text.length, row.text).toBeGreaterThan(0);
      expect(row.text.endsWith("."), row.text).toBe(true);
      expect(row.text.length, row.text).toBeLessThan(200);
    }
  });

  // ── отрицательные пробы: страж покрытия обязан краснеть, а не молчать ─────

  it("снятая строка краснеет и называет непокрытое число и кость", () => {
    // Номер строки — это её позиция, поэтому снятие ЛЮБОЙ строки сдвигает
    // хвост вверх, и непокрытым остаётся последнее число кости.
    const short = WILD_MAGIC_TABLE.filter((_, i) => i !== 41);
    expect(short.length).toBe(99);
    const gap = findCoverageGap(asEventTable(short));
    expect(gap).toContain("Всплески дикой магии");
    expect(gap).toContain("100");
    expect(gap).toContain("d100");
  });

  it("лишняя сто первая строка краснеет как вышедшая за кость", () => {
    const long = [...WILD_MAGIC_TABLE, { text: "строка, которой на кости нет." }];
    expect(findCoverageGap(asEventTable(long))).toContain("101");
  });
});

describe("бросок по таблице", () => {
  it("результат всегда в границах кости, даже на краях случайности", () => {
    expect(rollWildMagicSurge(fakeRandom(0)).roll).toBe(1);
    expect(rollWildMagicSurge(fakeRandom(0.999999)).roll).toBe(WILD_MAGIC_DIE);
    // random(), вернувшая ровно 1, за кость не выводит.
    expect(rollWildMagicSurge(fakeRandom(1)).roll).toBe(WILD_MAGIC_DIE);
    expect(rollWildMagicSurge(fakeRandom(-0.5)).roll).toBe(1);
  });

  it("достижимы все 100 строк, и номер совпадает со строкой таблицы", () => {
    const seen = new Set<number>();
    for (let roll = 1; roll <= WILD_MAGIC_DIE; roll++) {
      const surge = rollWildMagicSurge(fakeRandom(rowValue(roll)));
      expect(surge.roll).toBe(roll);
      expect(surge.text).toBe(WILD_MAGIC_TABLE[roll - 1].text);
      seen.add(surge.roll);
    }
    expect(seen.size).toBe(WILD_MAGIC_DIE);
  });
});

describe("триггер всплеска", () => {
  it("всплеск на 1 и 2, тишина на 3 — порог называется числом", () => {
    expect(WILD_MAGIC_TRIGGER_MAX).toBe(2);
    for (const d20 of [1, 2]) {
      const { attempt } = attemptWildMagicSurge({
        circle: 1,
        turnKey: null,
        turnState: NO_WILD_MAGIC_TURN,
        random: fakeRandom(d20Value(d20), rowValue(7)),
      });
      expect(attempt.kind).toBe("surge");
      if (attempt.kind === "surge") {
        expect(attempt.d20).toBe(d20);
        expect(attempt.surge.roll).toBe(7);
      }
    }
    const { attempt } = attemptWildMagicSurge({
      circle: 1,
      turnKey: null,
      turnState: NO_WILD_MAGIC_TURN,
      random: fakeRandom(d20Value(3)),
    });
    expect(attempt).toEqual({ kind: "calm", d20: 3 });
  });

  it("заговор всплеска не даёт и кости не тратит", () => {
    const { attempt, turnState } = attemptWildMagicSurge({
      circle: 0,
      turnKey: "1:0",
      turnState: NO_WILD_MAGIC_TURN,
      random: fakeRandom(d20Value(1)),
    });
    expect(attempt).toEqual({ kind: "cantrip" });
    // Ход не «израсходован»: заговор к броску отношения не имеет.
    expect(turnState.rolledTurnKey).toBeNull();
  });

  /**
   * Отрицательная проба карточки: снять в `attemptWildMagicSurge` проверку
   * `turnState.rolledTurnKey === turnKey` — и эта проба краснеет, потому что
   * второе заклинание в тот же ход снова бросит кость и даст всплеск.
   */
  it("в один ход бросок делается один раз, сколько бы заклинаний ни наложили", () => {
    const first = attemptWildMagicSurge({
      circle: 1,
      turnKey: "2:3",
      turnState: NO_WILD_MAGIC_TURN,
      random: fakeRandom(d20Value(1), rowValue(4)),
    });
    expect(first.attempt.kind).toBe("surge");

    const second = attemptWildMagicSurge({
      circle: 1,
      turnKey: "2:3",
      turnState: first.turnState,
      random: fakeRandom(d20Value(1), rowValue(4)),
    });
    expect(second.attempt).toEqual({ kind: "same-turn" });

    // Спокойный бросок ход тоже расходует — иначе «раз в ход» обходилось бы промахом.
    const calm = attemptWildMagicSurge({
      circle: 1,
      turnKey: "2:4",
      turnState: second.turnState,
      random: fakeRandom(d20Value(11)),
    });
    expect(calm.attempt.kind).toBe("calm");
    const afterCalm = attemptWildMagicSurge({
      circle: 1,
      turnKey: "2:4",
      turnState: calm.turnState,
      random: fakeRandom(d20Value(1), rowValue(4)),
    });
    expect(afterCalm.attempt).toEqual({ kind: "same-turn" });
  });

  it("новый ход снова открывает бросок", () => {
    const first = attemptWildMagicSurge({
      circle: 1,
      turnKey: "2:3",
      turnState: NO_WILD_MAGIC_TURN,
      random: fakeRandom(d20Value(1), rowValue(4)),
    });
    const nextTurn = attemptWildMagicSurge({
      circle: 1,
      turnKey: "3:3",
      turnState: first.turnState,
      random: fakeRandom(d20Value(2), rowValue(100)),
    });
    expect(nextTurn.attempt.kind).toBe("surge");
    if (nextTurn.attempt.kind === "surge") expect(nextTurn.attempt.surge.roll).toBe(100);
  });

  it("вне боя ходов нет, и бросок идёт на каждое заклинание", () => {
    const first = attemptWildMagicSurge({
      circle: 1,
      turnKey: null,
      turnState: NO_WILD_MAGIC_TURN,
      random: fakeRandom(d20Value(1), rowValue(4)),
    });
    const second = attemptWildMagicSurge({
      circle: 1,
      turnKey: null,
      turnState: first.turnState,
      random: fakeRandom(d20Value(1), rowValue(9)),
    });
    expect(second.attempt.kind).toBe("surge");
    if (second.attempt.kind === "surge") expect(second.attempt.surge.roll).toBe(9);
  });
});

describe("ключ хода", () => {
  const combat = (extra: Partial<CombatState> = {}): CombatState => ({
    gridWidth: 5,
    gridHeight: 5,
    combatants: [],
    turnOrder: ["hero", "goblin"],
    currentTurnIndex: 0,
    round: 1,
    log: [],
    finished: false,
    ...extra,
  });

  it("раунд и место в очереди дают разные ключи, а повтор — один и тот же", () => {
    expect(wildMagicTurnKey(combat())).toBe(wildMagicTurnKey(combat()));
    expect(wildMagicTurnKey(combat({ currentTurnIndex: 1 }))).not.toBe(wildMagicTurnKey(combat()));
    expect(wildMagicTurnKey(combat({ round: 2 }))).not.toBe(wildMagicTurnKey(combat()));
  });

  it("вне боя и после боя ключа нет", () => {
    expect(wildMagicTurnKey(null)).toBeNull();
    expect(wildMagicTurnKey(combat({ finished: true }))).toBeNull();
  });
});

describe("сцепка с архетипом", () => {
  it("архетип с таблицей узнаётся по имени и существует в данных чародея", () => {
    expect(isWildMagicSorcerer(WILD_MAGIC_SUBCLASS_NAME)).toBe(true);
    expect(isWildMagicSorcerer("Драконья кровь")).toBe(false);
    expect(isWildMagicSorcerer("")).toBe(false);
    const subclass = CLASS_SUBCLASSES["classes-sorcerer"]?.subclasses.find(
      (s) => s.name === WILD_MAGIC_SUBCLASS_NAME,
    );
    expect(subclass).toBeDefined();
    expect(subclass?.grants?.scaling?.some((s) => s.name === WILD_MAGIC_PAYBACK_FEATURE)).toBe(true);
  });

  it("особенность 1 уровня больше не отдаёт решение Мастеру", () => {
    const subclass = CLASS_SUBCLASSES["classes-sorcerer"]?.subclasses.find(
      (s) => s.name === WILD_MAGIC_SUBCLASS_NAME,
    );
    const surgeFeature = subclass?.featuresByLevel?.[1]?.find((f) => f.name === "Дикий всплеск");
    expect(surgeFeature).toBeDefined();
    expect(surgeFeature!.description).not.toMatch(/Мастер может/);
    expect(surgeFeature!.description).not.toMatch(/по своему выбору/);
    expect(surgeFeature!.description).toMatch(/1 или 2/);
    expect(surgeFeature!.description).toMatch(/один раз в свой ход/);
  });
});
