import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { RuleTopic } from "../state/types";
import {
  DEATH_SAVE_CRIT_FAIL_COST,
  DEATH_SAVE_CRIT_FAIL_ROLL,
  DEATH_SAVE_CRIT_SUCCESS_HP,
  DEATH_SAVE_CRIT_SUCCESS_ROLL,
  DEATH_SAVE_DC,
  DEATH_SAVE_EXPRESSION,
  DEATH_SAVE_FAILURES_TO_DEATH,
  DEATH_SAVE_SUCCESSES_TO_STABLE,
  DEATH_SAVE_TOPIC_ID,
  STABILIZE_MEDICINE_DC,
  deathSaveHintLines,
  deathSaveRollLabel,
  deathSaveRulesText,
} from "./deathSaves";

const rules = bundledRules as RuleTopic[];
const srd = deathSaveRulesText(rules);

/**
 * SRD пишет счёт словом, а не цифрой («в случае трёх успехов»), поэтому
 * привязать к тексту сам КОНСТАНТ можно только через эту карту. Если константа
 * съедет на 4, `WORD[4]` окажется `undefined`, подстановка не найдётся в
 * справочнике — и проба покраснеет, а не промолчит.
 */
const WORD: Record<number, string> = { 2: "двумя", 3: "трёх" };

describe("числа спасброска от смерти взяты из rules.json, а не из памяти", () => {
  it("раздел SRD на месте и читается", () => {
    expect(rules.find((t) => t.id === DEATH_SAVE_TOPIC_ID), `раздела ${DEATH_SAVE_TOPIC_ID} нет`).toBeDefined();
    expect(srd).toContain("Спасброски от смерти");
  });

  it("кость и порог успеха — те же, что в справочнике", () => {
    expect(DEATH_SAVE_EXPRESSION).toBe(`1d${DEATH_SAVE_CRIT_SUCCESS_ROLL}`);
    expect(srd).toContain(`Бросьте к${DEATH_SAVE_CRIT_SUCCESS_ROLL}.`);
    expect(srd).toContain(`Если результат будет «${DEATH_SAVE_DC}» или выше, вы преуспели`);
  });

  it("три успеха и три провала — счёт из справочника", () => {
    expect(srd).toContain(`В случае ${WORD[DEATH_SAVE_SUCCESSES_TO_STABLE]} успехов вы становитесь стабилизированным`);
    expect(srd).toContain(`В случае ${WORD[DEATH_SAVE_FAILURES_TO_DEATH]} провалов вы умираете`);
  });

  it("«1» стоит два провала, «20» возвращает один хит — числа из справочника", () => {
    expect(srd).toContain(
      `выпадает «${DEATH_SAVE_CRIT_FAIL_ROLL}», это считается ${WORD[DEATH_SAVE_CRIT_FAIL_COST]} провалами`,
    );
    expect(srd).toContain(
      `Если выпадет «${DEATH_SAVE_CRIT_SUCCESS_ROLL}», вы восстанавливаете ${DEATH_SAVE_CRIT_SUCCESS_HP} хит`,
    );
  });

  it("УС стабилизации — из справочника", () => {
    expect(srd).toContain(`проверку Мудрости (Медицина) с УС ${STABILIZE_MEDICINE_DC}`);
  });
});

describe("подсказка пересказывает правило, а не копирует SRD", () => {
  it("ни одна строка подсказки не является выдержкой из rules.json", () => {
    // Сердце запрета «дословный текст SRD в UI не копировать»: скопированный
    // абзац найдётся в справочнике целиком и покрасит пробу.
    for (const line of deathSaveHintLines) {
      expect(srd, `строка подсказки скопирована из SRD: ${line}`).not.toContain(line);
    }
  });

  it("числа из правила в подсказке есть — игрок видит их, не уходя в справочник", () => {
    const text = deathSaveHintLines.join("\n");
    expect(text).toContain(`к${DEATH_SAVE_CRIT_SUCCESS_ROLL}`);
    expect(text).toContain(`${DEATH_SAVE_DC} и выше`);
    expect(text).toContain(`${DEATH_SAVE_SUCCESSES_TO_STABLE} успеха`);
    expect(text).toContain(`${DEATH_SAVE_FAILURES_TO_DEATH} провала`);
    expect(text).toContain(`«${DEATH_SAVE_CRIT_FAIL_ROLL}» на кости стоит ${DEATH_SAVE_CRIT_FAIL_COST} провала`);
    expect(text).toContain(`возвращает ${DEATH_SAVE_CRIT_SUCCESS_HP} хит и сознание`);
    expect(text).toContain(`УС ${STABILIZE_MEDICINE_DC}`);
  });

  it("называет то, чего приложение не автоматизирует, и чем это отличается от чудовищ", () => {
    const text = deathSaveHintLines.join("\n");
    // Урон в лист не приходит вовсе (запись 150) — правило «урон при 0 хитов
    // это провал» обязано стоять словами и просить игрока отметить его сам.
    expect(text).toMatch(/критического попадания/);
    expect(text).toMatch(/отмечайте сами/);
    // Чудовища живут по своему правилу (combat.rs), и подсказка листа не должна
    // выдавать игроку спасброски за них.
    expect(text).toMatch(/Чудовищ/);
    expect(text).toMatch(/Без сознания/);
  });
});

describe("метка записи в журнале бросков", () => {
  it("несёт слова «Спасбросок от смерти» и имя персонажа", () => {
    const label = deathSaveRollLabel("Гримуар");
    expect(label).toContain("Спасбросок от смерти");
    expect(label).toContain("Гримуар");
  });

  it("несёт выражение — иначе журнал не покажет кость", () => {
    // dieSidesFromExpression (DiceIcon.tsx) читает именно метку: без выражения
    // запись о спасброске осталась бы единственной в журнале без картинки кости.
    expect(deathSaveRollLabel("Гримуар")).toContain(DEATH_SAVE_EXPRESSION);
  });

  it("безымянный персонаж не даёт метки с болтающимся двоеточием", () => {
    expect(deathSaveRollLabel("   ")).toBe(`Спасбросок от смерти (${DEATH_SAVE_EXPRESSION})`);
  });
});
