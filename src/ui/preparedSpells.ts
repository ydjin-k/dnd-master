import { CLASS_SPELLCASTING_ABILITY_KEY, abilityMod } from "./characterCreationData";
import { CLASS_PROGRESSION, highestSpellCircle } from "./classProgression";
import type { AbilityScores, Spell } from "../state/types";

/**
 * Подготовка заклинаний — механика классов с `spellsKnownKind: "prepared"`
 * (Жрец, Друид, Волшебник, Паладин). Известного списка у них нет: по SRD 5.1
 * доступен весь список класса, а игрок держит подготовленным подмножество,
 * которое меняет после длинного отдыха. Поэтому `Character.knownSpells` у
 * такого класса хранит не «что знает», а «что подготовлено сейчас».
 *
 * Здесь живёт ЕДИНСТВЕННЫЙ владелец числа подготовленных и разбора «что идёт
 * в счёт нормы, а что сверх неё»: и лист персонажа (`CharactersPage`), и
 * мастер создания (`CharacterWizard`) спрашивают отсюда, а не считают формулу
 * у себя. Число нигде не хранится снимком — оно пересчитывается из
 * характеристик и уровня при каждом показе, поэтому смена Мудрости и левел-ап
 * двигают его сами.
 *
 * Карточек на эту механику четыре — по классу на каждую, и делаются они
 * лесенкой. Что достаётся сёстрам:
 * - `PREPARED_ON_SHEET` — калитка: класс включается одной строкой;
 * - `preparedSpellsMax` — число; формула SRD «модификатор + уровень» общая для
 *   Жреца, Друида и Волшебника, у Паладина в неё идёт половина уровня — это
 *   единственное место, где формула обязана разветвиться;
 * - `preparableSpells` — отбор источника: список приходит параметром, так что
 *   книга Волшебника подставляется тем же вызовом, что и полный список класса;
 * - `preparedSpells` — разбор подготовленного на «в счёт» и «сверх нормы»;
 *   всегда подготовленные (домен Жреца, круг Друида, клятва Паладина) приходят
 *   параметром от `subclassSpellsUpToLevel` — второго владельца у них нет.
 */

/**
 * Классы, у которых подготовка уже включена на листе персонажа. Не то же
 * самое, что `spellsKnownKind: "prepared"`: там перечислены все четыре класса
 * SRD, а здесь — те, чья карточка уже сделана. Калитка временная: когда
 * сойдутся все четыре, множество совпадёт со `spellsKnownKind` и её можно
 * снять, оставив проверку вида класса.
 */
export const PREPARED_ON_SHEET: ReadonlySet<string> = new Set(["classes-cleric", "classes-druid"]);

/** Готовит ли этот класс заклинания на листе персонажа (см. `PREPARED_ON_SHEET`). */
export function preparesSpells(classId: string | null | undefined): boolean {
  return !!classId && PREPARED_ON_SHEET.has(classId);
}

/**
 * Сколько заклинаний класс может держать подготовленными: модификатор
 * заклинательной характеристики + уровень, минимум одно (SRD 5.1, «Подготовка
 * заклинаний» Жреца/Друида/Волшебника). Ноль — если класс не готовит
 * заклинания вовсе или на этом уровне ещё не колдует: «ещё не колдует»
 * спрашивается у `highestSpellCircle`, а не сверяется с номером уровня, иначе
 * у полузаклинателя завёлся бы второй владелец факта «с какого уровня магия».
 *
 * Всегда подготовленные заклинания архетипа в это число не входят — они сверх
 * нормы (см. `preparedSpells`).
 */
export function preparedSpellsMax(
  classId: string | null | undefined,
  abilities: AbilityScores,
  level: number,
): number {
  if (!classId || CLASS_PROGRESSION[classId]?.spellsKnownKind !== "prepared") return 0;
  const ability = CLASS_SPELLCASTING_ABILITY_KEY[classId];
  if (!ability) return 0;
  if (highestSpellCircle(classId, level) === 0) return 0;
  return Math.max(1, abilityMod(abilities[ability]) + level);
}

/** Разбор подготовленного списка: что занимает норму, что идёт сверх неё и сколько осталось. */
export interface PreparedSpells {
  /** Норма — сколько можно держать подготовленными (см. `preparedSpellsMax`). */
  max: number;
  /** Подготовленные в счёт нормы, в порядке списка персонажа. */
  prepared: string[];
  /** Всегда подготовленные архетипом: сверх нормы, снять нельзя. */
  alwaysPrepared: string[];
  /** Сколько ещё можно подготовить; 0 при выбранной норме и при переборе. */
  free: number;
  /** На сколько норма превышена (упала Мудрость) — 0, если перебора нет. */
  overflow: number;
}

/**
 * Делит подготовленное на «в счёт нормы» и «сверх нормы». Всегда
 * подготовленные (`alwaysPrepared` — заклинания домена/круга/клятвы от
 * `subclassSpellsUpToLevel`) из счёта исключаются: по SRD они подготовлены
 * всегда и места не занимают.
 */
export function preparedSpells(args: {
  classId: string | null | undefined;
  abilities: AbilityScores;
  level: number;
  knownSpells: string[];
  alwaysPrepared: string[];
}): PreparedSpells {
  const { classId, abilities, level, knownSpells, alwaysPrepared } = args;
  const max = preparedSpellsMax(classId, abilities, level);
  const always = alwaysPrepared.filter((id) => knownSpells.includes(id));
  const prepared = knownSpells.filter((id) => !alwaysPrepared.includes(id));
  return {
    max,
    prepared,
    alwaysPrepared: always,
    free: Math.max(0, max - prepared.length),
    overflow: Math.max(0, prepared.length - max),
  };
}

/**
 * Что можно подготовить прямо сейчас: заклинания источника не выше
 * доступного круга и ещё не подготовленные. Источник приходит параметром —
 * у Жреца, Друида и Паладина это весь список класса из `spells.json`, у
 * Волшебника им станет его книга, и подмена источника не требует второго
 * отбора.
 */
export function preparableSpells(
  spells: Spell[],
  args: { classId: string | null | undefined; level: number; alreadyPrepared: string[] },
): Spell[] {
  const { classId, level, alreadyPrepared } = args;
  if (!classId) return [];
  const highestCircle = highestSpellCircle(classId, level);
  return spells.filter(
    (sp) =>
      sp.level >= 1 &&
      sp.level <= highestCircle &&
      sp.classes.includes(classId) &&
      !alreadyPrepared.includes(sp.id),
  );
}
