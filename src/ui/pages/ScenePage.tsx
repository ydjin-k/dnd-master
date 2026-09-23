import { useState } from "react";
import { useCampaign } from "../../state/CampaignContext";
import { adventureLogText, outcomeLabel } from "../gm/adventureLog";
import type { SceneOutcome } from "../../state/types";
import "./ScenePage.css";

/**
 * Экран сцены (§29.1) — место, цель, напряжение и лог приключения.
 *
 * Своего `useState` на данные движка здесь НЕТ и быть не должно: всё, что
 * показывается, читается из `state.engine`. Копия любого поля `state.engine.*`
 * в локальном состоянии — это второй владелец факта и признак опровержения
 * решения ADR 0001 (раздел 4, признак 2). Локальное состояние ниже — только
 * поля формы, то есть то, чего в состоянии ещё нет.
 *
 * Экран намеренно простой: оформление наводит `ui-developer` своей карточкой.
 */

const OUTCOMES: SceneOutcome[] = ["calmer", "unchanged", "worse"];

export function ScenePage() {
  const { state, gmEndScene } = useCampaign();
  const engine = state.engine;
  const scene = engine?.scene ?? null;
  const active = scene !== null && scene.status === "active";

  return (
    <section className="scene-page">
      <h2>Сцена</h2>
      {active ? <ActiveScene /> : <NewSceneForm />}
      <AdventureLog />
    </section>
  );

  function ActiveScene() {
    if (scene === null) return null;
    return (
      <div className="scene-page__card">
        <dl className="scene-page__facts">
          <dt>Место</dt>
          <dd data-field="location">{scene.location}</dd>
          <dt>Цель</dt>
          <dd data-field="objective">{scene.objective}</dd>
          <dt>Напряжение</dt>
          <dd data-field="tension">{scene.tension} из 5</dd>
        </dl>
        {scene.participants.length > 0 && (
          <p className="scene-page__participants">
            Участники: {scene.participants.map(nameOf).join(", ")}
          </p>
        )}
        <h3>Завершить сцену</h3>
        <p className="dm-hint">Напряжение следующей сцены зависит от исхода (§7.2).</p>
        <div className="scene-page__outcomes">
          {OUTCOMES.map((outcome) => (
            <button key={outcome} type="button" onClick={() => gmEndScene(outcome)}>
              {outcomeLabel(outcome)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function AdventureLog() {
    const log = engine?.adventureLog ?? [];
    return (
      <div className="scene-page__log">
        <h3>Лог приключения</h3>
        {log.length === 0 ? (
          <p className="dm-hint">Пока пусто — здесь появится то, что решил движок.</p>
        ) : (
          <ol>
            {log.map((entry) => (
              <li key={entry.id}>
                <span className="scene-page__log-turn">Ход {entry.turn}</span>
                {adventureLogText(entry.line)}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  function nameOf(id: string): string {
    return state.characters.find((c) => c.id === id)?.name ?? id;
  }
}

/** Форма намерения: из неё уезжают аргументы команды, а не состояние. */
function NewSceneForm() {
  const { state, gmCreateScene } = useCampaign();
  const [location, setLocation] = useState("");
  const [objective, setObjective] = useState("");
  const [tags, setTags] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);

  function toggle(id: string) {
    setParticipants((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  return (
    <form
      className="scene-page__form"
      onSubmit={(e) => {
        e.preventDefault();
        gmCreateScene(
          location,
          objective,
          participants,
          tags
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
        );
        setLocation("");
        setObjective("");
        setTags("");
        setParticipants([]);
      }}
    >
      <label>
        Место
        <input
          value={location}
          placeholder="Подземный зал"
          onChange={(e) => setLocation(e.currentTarget.value)}
        />
      </label>
      <label>
        Цель
        <input
          value={objective}
          placeholder="Найти выход"
          onChange={(e) => setObjective(e.currentTarget.value)}
        />
      </label>
      <label>
        Теги через запятую
        <input
          value={tags}
          placeholder="темнота, подземелье"
          onChange={(e) => setTags(e.currentTarget.value)}
        />
      </label>
      <fieldset className="scene-page__participants-pick">
        <legend>Участники</legend>
        {state.characters.length === 0 && (
          <p className="dm-hint">Персонажей нет — сцену можно начать и без них.</p>
        )}
        {state.characters.map((character) => (
          <label key={character.id}>
            <input
              type="checkbox"
              checked={participants.includes(character.id)}
              onChange={() => toggle(character.id)}
            />
            {character.name}
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        className="dm-button--primary"
        disabled={location.trim() === "" || objective.trim() === ""}
      >
        Начать сцену
      </button>
    </form>
  );
}
