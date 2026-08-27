import { useState } from "react";
import { useCampaign } from "../../state/CampaignContext";
import { emptyAbilityScores, type Character } from "../../state/types";
import { CharacterWizard } from "../CharacterWizard";
import "./CharactersPage.css";

function newCharacter(name: string, race: string, klass: string, level: number): Character {
  return {
    id: crypto.randomUUID(),
    name,
    race,
    class: klass,
    level,
    abilities: emptyAbilityScores(),
    maxHp: 10,
    currentHp: 10,
    armorClass: 10,
    conditions: [],
    inventory: [],
    gold: 0,
  };
}

export function CharactersPage() {
  const { state, addCharacter } = useCampaign();
  const [name, setName] = useState("");
  const [race, setRace] = useState("");
  const [klass, setKlass] = useState("");
  const [level, setLevel] = useState(1);
  const [showWizard, setShowWizard] = useState(false);
  const [showQuickForm, setShowQuickForm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addCharacter(newCharacter(name.trim(), race.trim(), klass.trim(), level));
    setName("");
    setRace("");
    setKlass("");
    setLevel(1);
  }

  return (
    <div className="characters-page">
      <h2>Персонажи</h2>

      <ul className="characters-page__list">
        {state.characters.map((c) => (
          <li key={c.id} className="character-card">
            <div className="character-card__name">{c.name}</div>
            <div className="character-card__meta">
              {c.race || "раса не указана"} · {c.class || "класс не указан"} · ур. {c.level}
            </div>
            <div className="character-card__hp">
              HP {c.currentHp}/{c.maxHp} · КД {c.armorClass}
            </div>
          </li>
        ))}
        {state.characters.length === 0 && (
          <li className="characters-page__empty">Персонажей пока нет.</li>
        )}
      </ul>

      {showWizard ? (
        <CharacterWizard onDone={() => setShowWizard(false)} />
      ) : (
        <button onClick={() => setShowWizard(true)}>Создать персонажа по правилам</button>
      )}

      <details
        className="characters-page__quick"
        open={showQuickForm}
        onToggle={(e) => setShowQuickForm(e.currentTarget.open)}
      >
        <summary>Быстрое добавление (без мастера)</summary>
        <form className="characters-page__form" onSubmit={handleSubmit}>
          <input
            placeholder="Имя"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <input
            placeholder="Раса"
            value={race}
            onChange={(e) => setRace(e.currentTarget.value)}
          />
          <input
            placeholder="Класс"
            value={klass}
            onChange={(e) => setKlass(e.currentTarget.value)}
          />
          <input
            type="number"
            min={1}
            max={20}
            value={level}
            onChange={(e) => setLevel(Number(e.currentTarget.value) || 1)}
          />
          <button type="submit">Добавить</button>
        </form>
      </details>
    </div>
  );
}
