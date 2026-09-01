import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import { ALL_ITEM_NAMES, CONDITIONS, HEALING_POTIONS, PROFICIENCY_BONUS_HINT } from "../characterCreationData";
import type { Character, RuleTopic, Spell } from "../../state/types";
import { CharacterWizard } from "../CharacterWizard";
import "./CharactersPage.css";

type Panel = "none" | "wizard";

/** Эффект каждого отдельного уровня истощения, по таблице «Истощение» в rules.json → appendices-conditions. */
const EXHAUSTION_LEVEL_EFFECTS: Record<number, string> = {
  1: "Помеха на проверки характеристик.",
  2: "Скорость уменьшается вдвое.",
  3: "Помеха на броски атаки и спасброски.",
  4: "Максимальные хиты уменьшаются вдвое.",
  5: "Скорость уменьшается до 0.",
  6: "Смерть.",
};

/** Дословно из rules.json → appendices-conditions, абзац после таблицы «Истощение». */
const EXHAUSTION_RECOVERY =
  "Завершение длинного отдыха снижает уровень истощения существа на 1, при условии, что существо также принимало некоторую пищу и питьё.";

/** Общий принцип снятия состояний (rules.json → appendices-conditions, абзац перед таблицей). */
const CONDITIONS_GENERAL_HINT =
  "Состояние снимается, когда его отменяет вызвавший эффект (например, «Сбитый с ног» снимается, если встать на ноги), либо когда заканчивается его длительность.";

function exhaustionLevelName(level: number): string {
  return `Истощение (ур. ${level})`;
}

/** Эффекты истощения накопительные: уровень N включает эффекты уровней 1..N, плюс как снять. */
function exhaustionEffectLines(level: number): string[] {
  const lines: string[] = [];
  for (let l = 1; l <= level; l++) lines.push(EXHAUSTION_LEVEL_EFFECTS[l]);
  lines.push(EXHAUSTION_RECOVERY);
  return lines;
}

/**
 * Карта «состояние → строки эффекта», извлечённая из appendices-conditions:
 * у каждого обычного состояния из CONDITIONS в rules.json заголовок 2 уровня
 * с точным именем состояния, а следом — list-блок с текстом эффекта.
 * Истощение в rules.json — таблица, не список, поэтому его 6 уровней
 * добавляются отдельно, вручную (см. exhaustionEffectLines).
 */
function extractConditionEffects(topics: RuleTopic[]): Record<string, string[]> {
  const topic = topics.find((t) => t.id === "appendices-conditions");
  const effects: Record<string, string[]> = {};
  if (topic) {
    const blocks = topic.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.type !== "heading" || block.level !== 2) continue;
      if (!CONDITIONS.includes(block.text)) continue;
      const next = blocks[i + 1];
      if (next?.type === "list") effects[block.text] = next.items;
    }
  }
  for (let level = 1; level <= 6; level++) {
    effects[exhaustionLevelName(level)] = exhaustionEffectLines(level);
  }
  return effects;
}

function CharacterCard({
  character: c,
  spells,
  conditionEffects,
  onRemove,
  onUpdate,
}: {
  character: Character;
  spells: Spell[];
  conditionEffects: Record<string, string[]>;
  onRemove: () => void;
  onUpdate: (updater: (character: Character) => Character) => void;
}) {
  const [newItemName, setNewItemName] = useState("");
  const [newCondition, setNewCondition] = useState("");

  function adjustItemQuantity(itemId: string, delta: number) {
    onUpdate((ch) => ({
      ...ch,
      inventory: ch.inventory
        .map((item) => (item.id === itemId ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0),
    }));
  }

  function removeItem(itemId: string) {
    onUpdate((ch) => ({ ...ch, inventory: ch.inventory.filter((item) => item.id !== itemId) }));
  }

  function addItem() {
    const name = newItemName.trim();
    if (!name) return;
    onUpdate((ch) => ({
      ...ch,
      inventory: [...ch.inventory, { id: crypto.randomUUID(), name, quantity: 1, notes: "" }],
    }));
    setNewItemName("");
  }

  function addCondition() {
    const condition = newCondition.trim();
    if (!condition || c.conditions.includes(condition)) return;
    onUpdate((ch) => ({ ...ch, conditions: [...ch.conditions, condition] }));
    setNewCondition("");
  }

  function removeCondition(condition: string) {
    onUpdate((ch) => ({ ...ch, conditions: ch.conditions.filter((cond) => cond !== condition) }));
  }

  function spellName(id: string): string {
    return spells.find((sp) => sp.id === id)?.name ?? id;
  }

  function findSpell(id: string): Spell | undefined {
    return spells.find((sp) => sp.id === id);
  }

  function truncateDescription(text: string, max = 90): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max).trimEnd()}…`;
  }

  function restoreSpellSlots() {
    onUpdate((ch) => ({ ...ch, spellSlotsLevel1Current: ch.spellSlotsLevel1Max }));
  }

  function useSpellSlot() {
    onUpdate((ch) => ({ ...ch, spellSlotsLevel1Current: Math.max(0, ch.spellSlotsLevel1Current - 1) }));
  }

  const isSpellcaster = c.knownCantrips.length > 0 || c.knownSpells.length > 0;

  return (
    <li className="character-card">
      <div className="character-card__name">
        {c.name}
        <button className="character-card__delete" title="Удалить персонажа" onClick={onRemove}>
          ✕
        </button>
      </div>
      <div className="character-card__meta">
        {c.race || "раса не указана"} · {c.class || "класс не указан"}
        {c.background && <> · {c.background}</>} · ур. {c.level}
        {c.alignment && <> · {c.alignment}</>}
        {c.gender && <> · {c.gender}</>}
        {c.age > 0 && <> · {c.age} л.</>}
      </div>
      <div className="character-card__hp">
        HP {c.currentHp}/{c.maxHp} · КД {c.armorClass} · Скорость {c.speedFeet} фт · Иниц.{" "}
        {c.initiative >= 0 ? `+${c.initiative}` : c.initiative} · Пас. внимательность{" "}
        {c.passivePerception} · {c.gold} зм
      </div>
      {c.savingThrowProficiencies.length > 0 && (
        <div className="character-card__prof">
          Спасброски: {c.savingThrowProficiencies.join(", ")} — {PROFICIENCY_BONUS_HINT}
        </div>
      )}
      {c.skillProficiencies.length > 0 && (
        <div className="character-card__prof">
          Навыки: {c.skillProficiencies.join(", ")} — {PROFICIENCY_BONUS_HINT}
        </div>
      )}
      {c.languages.length > 0 && (
        <div className="character-card__prof">Языки: {c.languages.join(", ")}</div>
      )}

      <details className="character-card__inventory" open={c.inventory.length > 0}>
        <summary>Инвентарь ({c.inventory.length})</summary>
        <ul>
          {c.inventory.map((item) => (
            <li key={item.id} className="character-card__item">
              <span>{item.name}</span>
              <button type="button" onClick={() => adjustItemQuantity(item.id, -1)}>
                −
              </button>
              <span>{item.quantity}</span>
              <button type="button" onClick={() => adjustItemQuantity(item.id, 1)}>
                +
              </button>
              <button type="button" title="Убрать предмет" onClick={() => removeItem(item.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="character-card__add-row">
          <input
            list={`items-${c.id}`}
            placeholder="Новый предмет"
            value={newItemName}
            onChange={(e) => setNewItemName(e.currentTarget.value)}
          />
          <datalist id={`items-${c.id}`}>
            {ALL_ITEM_NAMES.map((name) => {
              const potion = HEALING_POTIONS.find((p) => p.name === name);
              return (
                <option key={name} value={name}>
                  {potion ? `${name} — лечит ${potion.healingDice}` : name}
                </option>
              );
            })}
          </datalist>
          <button type="button" onClick={addItem}>
            Добавить
          </button>
        </div>
      </details>

      <details className="character-card__conditions" open={c.conditions.length > 0}>
        <summary>Состояния ({c.conditions.length})</summary>
        <div className="character-card__conditions-hint">{CONDITIONS_GENERAL_HINT}</div>
        {c.conditions.length > 0 && (
          <ul className="character-card__condition-list">
            {c.conditions.map((condition) => (
              <li key={condition}>
                <div className="character-card__condition-row">
                  {condition}{" "}
                  <button type="button" onClick={() => removeCondition(condition)}>
                    ✕
                  </button>
                </div>
                {conditionEffects[condition] && (
                  <ul className="character-card__condition-effect">
                    {conditionEffects[condition].map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="character-card__add-row">
          <input
            list={`conditions-${c.id}`}
            placeholder="Состояние (из SRD или своё)"
            value={newCondition}
            onChange={(e) => setNewCondition(e.currentTarget.value)}
          />
          <datalist id={`conditions-${c.id}`}>
            {CONDITIONS.map((cond) => (
              <option key={cond} value={cond} />
            ))}
          </datalist>
          <button type="button" onClick={addCondition}>
            Добавить
          </button>
        </div>
      </details>

      {isSpellcaster && (
        <details className="character-card__spells" open>
          <summary>Заклинания</summary>
          {c.knownCantrips.length > 0 && (
            <div className="character-card__spell-group">
              Заговоры:
              <ul className="character-card__spell-list">
                {c.knownCantrips.map((id) => {
                  const spell = findSpell(id);
                  return (
                    <li key={id}>
                      <div>{spellName(id)}</div>
                      {spell && (
                        <div className="character-card__spell-info">
                          {spell.castingTime} · {spell.range} · {truncateDescription(spell.description)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {c.knownSpells.length > 0 && (
            <div className="character-card__spell-group">
              Заклинания 1 уровня:
              <ul className="character-card__spell-list">
                {c.knownSpells.map((id) => (
                  <li key={id}>
                    {spellName(id)}{" "}
                    <button type="button" onClick={useSpellSlot} disabled={c.spellSlotsLevel1Current === 0}>
                      Использовать
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="character-card__spell-group">
            Ячейки 1 уровня: {c.spellSlotsLevel1Current}/{c.spellSlotsLevel1Max}{" "}
            <button type="button" onClick={restoreSpellSlots} disabled={c.spellSlotsLevel1Current >= c.spellSlotsLevel1Max}>
              Восстановить все ячейки
            </button>
          </div>
        </details>
      )}
    </li>
  );
}

export function CharactersPage() {
  const { state, removeCharacter, updateCharacter } = useCampaign();
  const [panel, setPanel] = useState<Panel>("none");
  const [spells, setSpells] = useState<Spell[]>([]);
  const [conditionEffects, setConditionEffects] = useState<Record<string, string[]>>({});

  useEffect(() => {
    invoke<Spell[]>("get_spells").then(setSpells);
    invoke<RuleTopic[]>("get_rules").then((topics) => setConditionEffects(extractConditionEffects(topics)));
  }, []);

  return (
    <div className="characters-page">
      <h2>Персонажи</h2>

      <ul className="characters-page__list">
        {state.characters.map((c) => (
          <CharacterCard
            key={c.id}
            character={c}
            spells={spells}
            conditionEffects={conditionEffects}
            onRemove={() => {
              if (window.confirm(`Удалить персонажа «${c.name}»? Это необратимо.`)) {
                removeCharacter(c.id);
              }
            }}
            onUpdate={(updater) => updateCharacter(c.id, updater)}
          />
        ))}
        {state.characters.length === 0 && (
          <li className="characters-page__empty">Персонажей пока нет.</li>
        )}
      </ul>

      <div className="characters-page__actions">
        <button
          className={"characters-page__action" + (panel === "wizard" ? " characters-page__action--active" : "")}
          onClick={() => setPanel(panel === "wizard" ? "none" : "wizard")}
        >
          Создать персонажа по правилам
        </button>
      </div>

      {panel === "wizard" && <CharacterWizard onDone={() => setPanel("none")} />}
    </div>
  );
}
