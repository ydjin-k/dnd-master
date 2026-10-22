import { LOOT_RARITIES, type LootRarity } from "./dungeonLoot";
import {
  LOOT_KIND_LABELS,
  LOOT_KINDS,
  LOOT_NOT_CHOSEN,
  lootChoiceLine,
  lootKindHasRarity,
  lootRarityOf,
  withLootKindToggled,
  withLootRarity,
  withLootText,
  type LootChoice,
} from "./dungeonLootChoice";
import { NoteField } from "./NoteField";

/**
 * Выбор лута в находке: строка «Внутри», отметки видов, редкость у предметов,
 * описание своими словами и кнопка «Предложить».
 *
 * Правил здесь нет вовсе — ни одного. Какие бывают виды, у кого редкость, что
 * считается пустым выбором и как он читается строкой, решает
 * `dungeonLootChoice.ts`; поле только показывает выбор и отдаёт наверх новый.
 * Подсказку оно не бросает и уровня отряда не знает: по нажатию зовётся
 * `onSuggest`, а кость берёт экран (своим случаем, а не семенем схемы).
 */
export function LootChoiceField({
  label,
  choice,
  onChange,
  onSuggest,
}: {
  /** Имя группы для чтения с экрана: «Лут находки 3». */
  label: string;
  choice: LootChoice;
  onChange: (choice: LootChoice) => void;
  onSuggest: () => void;
}) {
  const line = lootChoiceLine(choice);
  return (
    <div className="dungeons-page__loot" role="group" aria-label={label}>
      {/* Строка таблицы выше говорит, ГДЕ находка лежит, а эта — что в ней, по
          выбору мастера. Пока он не выбрал, здесь так и сказано. */}
      <p>
        <b>Внутри:</b> {line === "" ? LOOT_NOT_CHOSEN : line}
      </p>
      <div className="dungeons-page__loot-kinds">
        {LOOT_KINDS.map((kind) => {
          const on = choice.kinds.includes(kind);
          return (
            <span key={kind} className="dungeons-page__loot-kind">
              <label>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onChange(withLootKindToggled(choice, kind))}
                />
                {LOOT_KIND_LABELS[kind]}
              </label>
              {/* Редкость спрашивается только у отмеченного вида, которому она
                  положена: у снятого спрашивать нечего, и выбор её не несёт. */}
              {on && lootKindHasRarity(kind) && (
                <select
                  aria-label={`Редкость: ${LOOT_KIND_LABELS[kind]}`}
                  value={lootRarityOf(choice, kind) ?? ""}
                  onChange={(e) =>
                    onChange(
                      withLootRarity(choice, kind, (e.currentTarget.value || null) as LootRarity | null),
                    )
                  }
                >
                  <option value="">редкость не выбрана</option>
                  {LOOT_RARITIES.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {rarity}
                    </option>
                  ))}
                </select>
              )}
            </span>
          );
        })}
      </div>
      <NoteField
        label={`${label}: описание`}
        placeholder="Что именно нашли"
        value={choice.text}
        onChange={(text) => onChange(withLootText(choice, text))}
      />
      <div className="dungeons-page__status">
        <button type="button" onClick={onSuggest}>
          Предложить
        </button>
      </div>
    </div>
  );
}
