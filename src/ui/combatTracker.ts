import type {
  Character,
  CombatState,
  Combatant,
  InitiativeRoll,
  MonsterTemplate,
} from "../state/types";
import { abilityMod } from "./characterCreationData";

/**
 * Трекер боя: всё, что раздел «Бой» ВЫВОДИТ из сохранённого состояния, — одним
 * местом. Хранит бой Rust (`src-tauri/src/combat.rs`): участников, броски,
 * указатель и раунд. Подпись бойца, порядок ходов и отметка «походил» здесь
 * считаются и нигде не лежат второй копией.
 */

/** Итог инициативы — сумма, а не третье хранимое число. */
export function initiativeTotal(roll: InitiativeRoll): number {
  return roll.d20 + roll.dexModifier;
}

/**
 * Модификатор Ловкости для броска инициативы. Единственный владелец этого
 * числа для боя:
 * - персонажу — его `Character.initiative`, тот же, что на листе; из Ловкости
 *   он второй раз НЕ считается, иначе лист и бой могли бы разойтись;
 * - существу — `abilityMod` Ловкости его шаблона, той же функцией, что и всё
 *   остальное приложение.
 *
 * `null` — источника нет (персонаж удалён, бестиарий не загрузился): бросать
 * такому бойцу не с чем.
 */
export function initiativeModifierOf(
  combatant: Combatant,
  characters: readonly Character[],
  bestiary: readonly MonsterTemplate[],
): number | null {
  const source = combatant.source;
  if (source.kind === "character") {
    return characters.find((c) => c.id === source.characterId)?.initiative ?? null;
  }
  const template = bestiary.find((m) => m.id === source.templateId);
  return template ? abilityMod(template.abilities.dexterity) : null;
}

/**
 * Подпись бойца. Имя берётся у источника — у листа персонажа или у шаблона
 * бестиария, — а номер дописывается, только когда этого вида в бою больше
 * одного: один волк — «Волк», пять — «Волк 1»…«Волк 5».
 */
export function combatantLabel(
  combatant: Combatant,
  combat: CombatState,
  characters: readonly Character[],
  bestiary: readonly MonsterTemplate[],
): string {
  const source = combatant.source;
  if (source.kind === "character") {
    return characters.find((c) => c.id === source.characterId)?.name ?? "Персонаж удалён";
  }
  const name = bestiary.find((m) => m.id === source.templateId)?.name ?? source.templateId;
  const sameKind = combat.combatants.filter(
    (c) => c.source.kind === "monster" && c.source.templateId === source.templateId,
  ).length;
  return sameKind > 1 ? `${name} ${source.number}` : name;
}

/**
 * Порядок ходов — сверху вниз. Брошенные идут по итогу инициативы; равные
 * разводятся ПРАВИЛОМ, а не местом в массиве: выше больший модификатор
 * Ловкости, при равном — по подписи (`localeCompare` ru, с числами по
 * значению: «Волк 2» выше «Волк 10»), и последним — по `id`, чтобы порядок
 * был воспроизводим на каждом перечитывании сохранения.
 *
 * Ещё не брошенные (добавлены до кнопки или после неё) стоят ниже всех, в
 * порядке добавления: их место определит следующий бросок.
 */
export function turnOrder(
  combat: CombatState,
  characters: readonly Character[],
  bestiary: readonly MonsterTemplate[],
): Combatant[] {
  const label = (c: Combatant) => combatantLabel(c, combat, characters, bestiary);
  const rolled = combat.combatants.filter((c) => c.initiativeRoll !== null);
  const unrolled = combat.combatants.filter((c) => c.initiativeRoll === null);
  rolled.sort((a, b) => {
    const ra = a.initiativeRoll!;
    const rb = b.initiativeRoll!;
    return (
      initiativeTotal(rb) - initiativeTotal(ra) ||
      rb.dexModifier - ra.dexModifier ||
      label(a).localeCompare(label(b), "ru", { numeric: true }) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
  return [...rolled, ...unrolled];
}

/**
 * Походил ли боец на месте `position` в этом раунде. Отдельно не хранится:
 * «Следующий» ведёт по линии без пропусков, поэтому походили ровно те, кто
 * стоит выше указателя. С оборотом раунда указатель встаёт на первого — и
 * отметки снимаются сами.
 */
export function hasActed(combat: CombatState, position: number): boolean {
  return position < combat.currentTurnIndex;
}

/**
 * Поиск существ для боя — тем же приёмом, что в «Бестиарии»
 * (`BestiaryPage.tsx`): подстрока имени без регистра и сортировка по-русски.
 * Пустой запрос не даёт ничего: плоской кучи всего бестиария раздел не
 * показывает.
 */
export function searchMonsters(
  bestiary: readonly MonsterTemplate[],
  search: string,
): MonsterTemplate[] {
  const query = search.trim().toLowerCase();
  if (!query) return [];
  return bestiary
    .filter((m) => m.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
