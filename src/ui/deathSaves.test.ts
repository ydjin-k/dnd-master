import { describe, expect, it } from "vitest";
import bundledRules from "../../src-tauri/rules/rules.json";
import type { Character, RuleTopic } from "../state/types";
import {
  DEATH_SAVE_CRIT_FAIL_COST,
  DEATH_SAVE_CRIT_FAIL_ROLL,
  DEATH_SAVE_CRIT_SUCCESS_HP,
  DEATH_SAVE_CRIT_SUCCESS_ROLL,
  DEATH_SAVE_DC,
  DEATH_SAVE_EXPRESSION,
  DEATH_SAVE_FAILURES_TO_DEATH,
  DEATH_SAVE_MAX_COUNT,
  DEATH_SAVE_STATE_LABELS,
  DEATH_SAVE_SUCCESSES_TO_STABLE,
  DEATH_SAVE_TOPIC_ID,
  STABILIZE_MEDICINE_DC,
  applyDeathSaveRoll,
  deathSaveHintLines,
  deathSaveRollLabel,
  deathSaveRulesText,
  deathSaveState,
  deathSaveVerdict,
  normalizeDeathSaves,
  type DeathSaves,
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
    expect(text).toMatch(/отмечайте галочкой сами/);
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

describe("правило счёта: кому принадлежит «успех / провал / два провала / 1 хит»", () => {
  const fresh: DeathSaves = { successes: 0, failures: 0 };

  it("порог и выше — успех, ниже — провал", () => {
    expect(applyDeathSaveRoll(fresh, DEATH_SAVE_DC)).toEqual({ saves: { successes: 1, failures: 0 }, hp: null });
    expect(applyDeathSaveRoll(fresh, 17)).toEqual({ saves: { successes: 1, failures: 0 }, hp: null });
    expect(applyDeathSaveRoll(fresh, DEATH_SAVE_DC - 1)).toEqual({ saves: { successes: 0, failures: 1 }, hp: null });
  });

  it("«1» — два провала сразу, а не один", () => {
    expect(applyDeathSaveRoll(fresh, DEATH_SAVE_CRIT_FAIL_ROLL)).toEqual({
      saves: { successes: 0, failures: DEATH_SAVE_CRIT_FAIL_COST },
      hp: null,
    });
  });

  it("«20» возвращает 1 хит и обнуляет ОБА счётчика", () => {
    expect(applyDeathSaveRoll({ successes: 2, failures: 2 }, DEATH_SAVE_CRIT_SUCCESS_ROLL)).toEqual({
      saves: { successes: 0, failures: 0 },
      hp: DEATH_SAVE_CRIT_SUCCESS_HP,
    });
  });

  it("дальше третьего счётчик не идёт: «1» при двух провалах даёт три, а не четыре", () => {
    expect(applyDeathSaveRoll({ successes: 0, failures: 2 }, DEATH_SAVE_CRIT_FAIL_ROLL).saves.failures).toBe(
      DEATH_SAVE_MAX_COUNT,
    );
  });

  it("стабилизированный и мёртвый не бросают: счёт не двигается даже на «20»", () => {
    const stable: DeathSaves = { successes: DEATH_SAVE_SUCCESSES_TO_STABLE, failures: 1 };
    expect(applyDeathSaveRoll(stable, DEATH_SAVE_CRIT_SUCCESS_ROLL)).toEqual({ saves: stable, hp: null });
    const dead: DeathSaves = { successes: 1, failures: DEATH_SAVE_FAILURES_TO_DEATH };
    expect(applyDeathSaveRoll(dead, 19)).toEqual({ saves: dead, hp: null });
  });

  it("испорченный счёт читается пределом, а не роняет правило", () => {
    // Нечисло — это ноль, и бросок ложится на него как на пустой счёт.
    expect(applyDeathSaveRoll({ successes: Number.NaN, failures: 1 }, 15).saves).toEqual({
      successes: 1,
      failures: 1,
    });
    // Счёт выше предела уже означает смерть — бросок ничего не меняет.
    expect(applyDeathSaveRoll({ successes: 0, failures: 99 }, 15).saves).toEqual({
      successes: 0,
      failures: DEATH_SAVE_MAX_COUNT,
    });
  });
});

describe("состояние персонажа на нуле хитов", () => {
  it("три успеха — стабилизирован, три провала — смерть, иначе бросает", () => {
    expect(deathSaveState({ successes: 0, failures: 0 })).toBe("rolling");
    expect(deathSaveState({ successes: 2, failures: 2 })).toBe("rolling");
    expect(deathSaveState({ successes: DEATH_SAVE_SUCCESSES_TO_STABLE, failures: 0 })).toBe("stable");
    expect(deathSaveState({ successes: 0, failures: DEATH_SAVE_FAILURES_TO_DEATH })).toBe("dead");
  });

  it("смерть старше стабилизации: набравший и то и другое мёртв", () => {
    // Руками такое поставить можно, и молчать об этом хуже, чем выбрать.
    expect(
      deathSaveState({ successes: DEATH_SAVE_SUCCESSES_TO_STABLE, failures: DEATH_SAVE_FAILURES_TO_DEATH }),
    ).toBe("dead");
  });

  it("у каждого исхода есть слово для листа", () => {
    expect(DEATH_SAVE_STATE_LABELS.stable).toMatch(/Стабилизирован/);
    expect(DEATH_SAVE_STATE_LABELS.dead).toMatch(/Мёртв/);
  });

  it("итог броска называется словами от ОДНОЙ кости, без счёта", () => {
    expect(deathSaveVerdict(15)).toBe("успех");
    expect(deathSaveVerdict(DEATH_SAVE_DC - 1)).toBe("провал");
    expect(deathSaveVerdict(DEATH_SAVE_CRIT_FAIL_ROLL)).toMatch(/2 провала сразу/);
    expect(deathSaveVerdict(DEATH_SAVE_CRIT_SUCCESS_ROLL)).toMatch(/1 хит и сознание/);
  });
});

describe("обнуление счётчиков — одно место на все пути записи хитов", () => {
  const downed = (over: Partial<Character> = {}): Character =>
    ({ currentHp: 0, maxHp: 12, deathSaveSuccesses: 1, deathSaveFailures: 2, ...over }) as Character;

  it("любые хиты выше нуля обнуляют оба счётчика", () => {
    // Ввод игрока, Кость Хитов, длинный отдых, пул лечения архетипа и левел-ап
    // отличаются только тем, КАК подняли хиты; воронка листа у них одна.
    for (const hp of [1, 5, 12]) {
      const next = normalizeDeathSaves(downed({ currentHp: hp }));
      expect(next.deathSaveSuccesses, `хиты ${hp}`).toBe(0);
      expect(next.deathSaveFailures, `хиты ${hp}`).toBe(0);
    }
  });

  it("на нуле хитов счётчики не трогаются — иначе счёт стирался бы каждой записью листа", () => {
    const character = downed();
    expect(normalizeDeathSaves(character)).toBe(character);
  });

  it("менять нечего — возвращается тот же объект, лишней записи в кампанию нет", () => {
    const healthy = downed({ currentHp: 9, deathSaveSuccesses: 0, deathSaveFailures: 0 });
    expect(normalizeDeathSaves(healthy)).toBe(healthy);
  });

  it("счёт выше предела обрезается даже на нуле хитов", () => {
    const next = normalizeDeathSaves(downed({ deathSaveSuccesses: 9, deathSaveFailures: 9 }));
    expect(next.deathSaveSuccesses).toBe(DEATH_SAVE_MAX_COUNT);
    expect(next.deathSaveFailures).toBe(DEATH_SAVE_MAX_COUNT);
  });
});
