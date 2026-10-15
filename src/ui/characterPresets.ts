import { inventoryEntryFromName, unpackStackedItem } from "./characterCreationData";
import type { Character } from "../state/types";

/**
 * Пресет готового персонажа — это обычный `Character` (см.
 * `src-tauri/characters/presets.json` и команду `get_character_presets`), а не
 * параллельная урезанная структура: копия попадает в ростер и дальше живёт тем
 * же кодом, что и персонаж из мастера — левел-ап, архетипы, ресурсы, ячейки.
 *
 * Поэтому и признака «откуда взялся персонаж» в ростере нет: единственный
 * источник этого факта — сам каталог пресетов, доступный только на чтение;
 * после копирования различить пресет и мастера уже нечем, и ни один расчёт
 * этого не спрашивает.
 */
export type CharacterPreset = Character;

/**
 * Копия пресета для ростера: новый `id` у персонажа и у каждой строки
 * инвентаря, остальное — как в пресете.
 *
 * Вес предмета не хранится в presets.json намеренно: его единственный владелец
 * — каталог `characterCreationData.ts`, и подставляется он ровно тем же
 * разбором `inventoryEntryFromName`, что и у стартового снаряжения мастера персонажа
 * (см. `finish()` в CharacterWizard.tsx). Иначе число в файле пресета молча
 * разошлось бы с каталогом.
 */
export function characterFromPreset(preset: CharacterPreset): Character {
  return {
    ...preset,
    id: crypto.randomUUID(),
    inventory: preset.inventory.map((item) => {
      // Пачка в имени («Арбалетные болты (20)») становится количеством — тем же
      // разбором, что у мастера; вес одной штуки — из каталога.
      const unpacked = unpackStackedItem({ ...item, weightLb: 0 });
      return { ...unpacked, id: crypto.randomUUID(), weightLb: inventoryEntryFromName(unpacked.name).weightLb };
    }),
  };
}

/** Подпись пресета в списке выбора: «Раса, Класс» — без имени, оно рядом. */
export function presetSubtitle(preset: CharacterPreset): string {
  return [preset.race, preset.class].filter(Boolean).join(", ");
}
