import { useState } from "react";
import { useCampaign } from "../../state/CampaignContext";
import { CONDITIONS } from "../characterCreationData";
import type { Character } from "../../state/types";
import { CharacterWizard } from "../CharacterWizard";
import { ImportPage } from "./ImportPage";
import "./CharactersPage.css";

type Panel = "none" | "import" | "wizard";

function CharacterCard({
  character: c,
  onRemove,
  onUpdate,
}: {
  character: Character;
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
      </div>
      <div className="character-card__hp">
        HP {c.currentHp}/{c.maxHp} · КД {c.armorClass} · Скорость {c.speedFeet} фт · Иниц.{" "}
        {c.initiative >= 0 ? `+${c.initiative}` : c.initiative} · Пас. внимательность{" "}
        {c.passivePerception} · {c.gold} зм
      </div>
      {c.savingThrowProficiencies.length > 0 && (
        <div className="character-card__prof">
          Спасброски: {c.savingThrowProficiencies.join(", ")}
        </div>
      )}
      {c.skillProficiencies.length > 0 && (
        <div className="character-card__prof">Навыки: {c.skillProficiencies.join(", ")}</div>
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
            placeholder="Новый предмет"
            value={newItemName}
            onChange={(e) => setNewItemName(e.currentTarget.value)}
          />
          <button type="button" onClick={addItem}>
            Добавить
          </button>
        </div>
      </details>

      <details className="character-card__conditions" open={c.conditions.length > 0}>
        <summary>Состояния ({c.conditions.length})</summary>
        {c.conditions.length > 0 && (
          <ul className="character-card__condition-list">
            {c.conditions.map((condition) => (
              <li key={condition}>
                {condition}{" "}
                <button type="button" onClick={() => removeCondition(condition)}>
                  ✕
                </button>
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
    </li>
  );
}

export function CharactersPage() {
  const { state, removeCharacter, updateCharacter } = useCampaign();
  const [panel, setPanel] = useState<Panel>("none");

  return (
    <div className="characters-page">
      <h2>Персонажи</h2>

      <ul className="characters-page__list">
        {state.characters.map((c) => (
          <CharacterCard
            key={c.id}
            character={c}
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
          className={"characters-page__action" + (panel === "import" ? " characters-page__action--active" : "")}
          onClick={() => setPanel(panel === "import" ? "none" : "import")}
        >
          Импорт
        </button>
        <button
          className={"characters-page__action" + (panel === "wizard" ? " characters-page__action--active" : "")}
          onClick={() => setPanel(panel === "wizard" ? "none" : "wizard")}
        >
          Создать персонажа по правилам
        </button>
      </div>

      {panel === "import" && <ImportPage />}
      {panel === "wizard" && <CharacterWizard onDone={() => setPanel("none")} />}
    </div>
  );
}
