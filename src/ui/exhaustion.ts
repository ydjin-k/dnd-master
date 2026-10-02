/**
 * Истощение — одно состояние на весь проект, с одним владельцем формата.
 *
 * Жило это в `pages/CharactersPage.tsx`, пока истощение поднимали только на
 * листе персонажа. Форсированный марш поднимает его со счётчика пути
 * («Приключения»), и второй разбор строки `Истощение (ур. N)` там означал бы
 * второго владельца формата: разъехавшись с листом, он молча перестал бы видеть
 * истощение вовсе. Поэтому функции переехали сюда целиком, а не скопировались.
 *
 * Хранится истощение, как и раньше, обычным состоянием в `Character.conditions`
 * — отдельного числа на листе нет и заводить его нельзя: шесть строк
 * `Истощение (ур. 1..6)` уже есть в `CONDITIONS`
 * (`characterCreationData.ts`), и игрок ставит их руками теми же кнопками.
 *
 * Текст эффектов — таблица «Истощение» из `rules.json` →
 * `appendices-conditions`, абзац про снятие — оттуда же, дословно.
 */

/** Ступеней истощения в таблице SRD ровно шесть — и столько же строк в CONDITIONS (characterCreationData.ts). */
export const EXHAUSTION_MAX_LEVEL = 6;

/** Эффект каждого отдельного уровня истощения, по таблице «Истощение» в rules.json → appendices-conditions. */
export const EXHAUSTION_LEVEL_EFFECTS: Record<number, string> = {
  1: "Помеха на проверки характеристик.",
  2: "Скорость уменьшается вдвое.",
  3: "Помеха на броски атаки и спасброски.",
  4: "Максимальные хиты уменьшаются вдвое.",
  5: "Скорость уменьшается до 0.",
  6: "Смерть.",
};

/**
 * Те же строки таблицы, но НОМЕРОМ уровня — для того, кто не показывает текст, а
 * считает число (`effectiveStats.ts`). Из текста выше их не достать, а
 * писать «2» и «4» у считающего значило бы развести таблицу с её же номерами:
 * поправив строку, никто не вспомнил бы про второе место. Числа — из той же
 * таблицы `rules.json` `[14]/blocks[13]`: строка «2» — «Скорость уменьшается
 * вдвое», строка «4» — «Максимальные хиты уменьшаются вдвое», строка «5» —
 * «Скорость уменьшается до 0».
 *
 * Накопительность эффектов («свой уровень и все ниже», `[14]/blocks[15]`)
 * считает тот, кто сравнивает: уровень 5 несёт и половину скорости уровня 2,
 * и половину максимума уровня 4.
 */
export const EXHAUSTION_HALF_SPEED_LEVEL = 2;
export const EXHAUSTION_HALF_MAX_HP_LEVEL = 4;
export const EXHAUSTION_ZERO_SPEED_LEVEL = 5;

/** Дословно из rules.json → appendices-conditions, абзац после таблицы «Истощение». */
export const EXHAUSTION_RECOVERY =
  "Завершение длинного отдыха снижает уровень истощения существа на 1, при условии, что существо также принимало некоторую пищу и питьё.";

export function exhaustionLevelName(level: number): string {
  return `Истощение (ур. ${level})`;
}

/**
 * Наивысший уровень истощения в состояниях или 0, если его нет. Читается ТЕМ ЖЕ
 * владельцем формата строки, что и пишется (`exhaustionLevelName`): своего
 * разбора регэкспом здесь нет намеренно — разъехавшись с форматом, он молча
 * перестал бы видеть истощение вовсе.
 */
export function exhaustionLevelOf(conditions: string[]): number {
  let level = 0;
  for (let l = 1; l <= EXHAUSTION_MAX_LEVEL; l++) {
    if (conditions.includes(exhaustionLevelName(l))) level = l;
  }
  return level;
}

/**
 * Одна ступень истощения вниз — правило длинного отдыха SRD (EXHAUSTION_RECOVERY
 * выше). Первый уровень снимается совсем, остальные заменяются строкой уровнем
 * ниже — тем же `exhaustionLevelName`, что их и написал.
 *
 * Снижается ступень у ВЫСШЕГО уровня: несколько строк истощения разом
 * появляются только если игрок наставил их руками, и снимать по одной у каждой
 * значило бы вылечить его вдвое-втрое быстрее правила. Шестой уровень — смерть
 * по таблице SRD, но исключения правило не делает: до пятого отдых снижает и
 * его, и прятать это не наше дело.
 */
export function withExhaustionReduced(conditions: string[]): string[] {
  const level = exhaustionLevelOf(conditions);
  if (level === 0) return conditions;
  const current = exhaustionLevelName(level);
  if (level === 1) return conditions.filter((cond) => cond !== current);
  // Set — если игрок уже держал и строку уровнем ниже: двух одинаковых состояний не бывает.
  return [...new Set(conditions.map((cond) => (cond === current ? exhaustionLevelName(level - 1) : cond)))];
}

/**
 * Ступени истощения ВВЕРХ — провал спасброска форсированного марша
 * (`rules.json` `[2]/blocks[10]`), голод (`[3]/blocks[28]`) и жажда
 * (`[3]/blocks[31]`). Жажда умеет давать сразу две ступени (`[3]/blocks[32]`),
 * поэтому число передаётся параметром, а не зашито единицей.
 *
 * Строка истощения ЗАМЕНЯЕТСЯ, а не добавляется рядом: эффекты уровней
 * накопительны (`exhaustionEffectLines`), и две строки «ур. 1» и «ур. 2» на
 * листе показали бы первый уровень дважды. Высшим уровнем здесь считается тот
 * же, что видит `exhaustionLevelOf`, — других разборов формата нет.
 *
 * Выше шестого не поднимается: шестой — смерть, и седьмой ступени в таблице SRD
 * нет. Сверхштатный провал мёртвого персонажа не делает мертвее, и выдумывать
 * ему уровень, которого нет в источнике, нельзя.
 */
export function withExhaustionRaised(conditions: string[], degrees = 1): string[] {
  const level = exhaustionLevelOf(conditions);
  const next = Math.min(EXHAUSTION_MAX_LEVEL, level + Math.max(1, degrees));
  if (next === level) return conditions;
  const raised = exhaustionLevelName(next);
  const withoutOldLevels = conditions.filter(
    (cond) => cond !== raised && (level === 0 || cond !== exhaustionLevelName(level)),
  );
  return [...withoutOldLevels, raised];
}

/** Эффекты истощения накопительные: уровень N включает эффекты уровней 1..N, плюс как снять. */
export function exhaustionEffectLines(level: number): string[] {
  const lines: string[] = [];
  for (let l = 1; l <= level; l++) lines.push(EXHAUSTION_LEVEL_EFFECTS[l]);
  lines.push(EXHAUSTION_RECOVERY);
  return lines;
}
