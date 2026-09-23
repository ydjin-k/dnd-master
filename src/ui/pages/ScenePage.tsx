import { useState } from "react";
import { useCampaign } from "../../state/CampaignContext";
import { adventureLogText, outcomeLabel } from "../gm/adventureLog";
import { factSourceLabel, factText, factValueLabel } from "../gm/facts";
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

/** Шкала §6.1 целиком — мастер выбирает из неё, а не называет свой процент. */
const PROBABILITIES = [
  { percent: 10, label: "почти невозможно" },
  { percent: 30, label: "маловероятно" },
  { percent: 50, label: "равные шансы" },
  { percent: 70, label: "вероятно" },
  { percent: 90, label: "почти наверняка" },
];

/** Модификаторы §6.4. Шаг двигает категорию, а не прибавляет проценты. */
const MODIFIERS = [
  { steps: -2, label: "сильно против" },
  { steps: -1, label: "против" },
  { steps: 0, label: "нейтрально" },
  { steps: 1, label: "в пользу" },
  { steps: 2, label: "сильно в пользу" },
];

export function ScenePage() {
  const { state, gmEndScene, gmUpdateFact } = useCampaign();
  const engine = state.engine;
  const scene = engine?.scene ?? null;
  const active = scene !== null && scene.status === "active";

  return (
    <section className="scene-page">
      <h2>Сцена</h2>
      {active ? <ActiveScene /> : <NewSceneForm />}
      <OracleForm />
      <ActivePanel />
      <AdventureLog />
    </section>
  );

  /** Панель «Активно» (§29.1). В v0.1 в ней живут только факты: акторов,
   *  угроз и сюжетных линий в состоянии ещё нет — их карточки впереди. */
  function ActivePanel() {
    const facts = engine?.facts ?? [];
    return (
      <div className="scene-page__active" data-panel="active">
        <h3>Активно</h3>
        {facts.length === 0 ? (
          <p className="dm-hint">Фактов пока нет — здесь появится то, что о мире уже решено.</p>
        ) : (
          <ul className="scene-page__facts-list">
            {facts.map((fact) => (
              <li key={fact.id} data-fact={`${fact.subject}.${fact.predicate}`}>
                <span className="scene-page__fact-text">{factText(fact)}</span>
                <span className="scene-page__fact-source">({factSourceLabel(fact.source)})</span>
                <button
                  type="button"
                  onClick={() => gmUpdateFact(fact.subject, fact.predicate, !fact.value)}
                >
                  Изменить на «{factValueLabel(!fact.value)}»
                </button>
              </li>
            ))}
          </ul>
        )}
        <NewFactForm />
      </div>
    );
  }

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

/**
 * Спросить Оракула (§29.2).
 *
 * Вероятность выбирает мастер из шкалы §6.1 — приложение её не угадывает
 * (§30 ASSISTED GM; §31 Confidence и §43 AUTO GM — это v0.3). Текст вопроса
 * уезжает как есть и в решении не участвует: ни один символ его здесь не
 * разбирается, а вопрос адресуется парой «субъект + предикат».
 *
 * Ответ показывать этой форме нечем и незачем: он приходит строкой в лог
 * приключения ниже, а вся арифметика — на отладочном экране (§38).
 */
function OracleForm() {
  const { gmAskOracle } = useCampaign();
  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState("");
  const [predicate, setPredicate] = useState("");
  const [probability, setProbability] = useState(50);
  const [modifier, setModifier] = useState(0);

  return (
    <form
      className="scene-page__oracle"
      onSubmit={(e) => {
        e.preventDefault();
        gmAskOracle(question, subject, predicate, probability, modifier);
        setQuestion("");
      }}
    >
      <h3>Спросить Оракула</h3>
      <label>
        Вопрос
        <input
          value={question}
          placeholder="Дверь заперта?"
          onChange={(e) => setQuestion(e.currentTarget.value)}
        />
      </label>
      <p className="dm-hint">
        Текст — для журнала: движок решает по паре «субъект + предикат», а не по
        формулировке (§29.2).
      </p>
      <label>
        Субъект вопроса
        <input
          value={subject}
          placeholder="door_03"
          onChange={(e) => setSubject(e.currentTarget.value)}
        />
      </label>
      <label>
        Предикат вопроса
        <input
          value={predicate}
          placeholder="locked"
          onChange={(e) => setPredicate(e.currentTarget.value)}
        />
      </label>
      <fieldset className="scene-page__probability">
        <legend>Вероятность</legend>
        {PROBABILITIES.map(({ percent, label }) => (
          <label key={percent}>
            <input
              type="radio"
              name="oracle-probability"
              value={percent}
              checked={probability === percent}
              onChange={() => setProbability(percent)}
            />
            {percent} — {label}
          </label>
        ))}
      </fieldset>
      <label>
        Модификатор
        <select
          value={modifier}
          onChange={(e) => setModifier(Number(e.currentTarget.value))}
        >
          {MODIFIERS.map(({ steps, label }) => (
            <option key={steps} value={steps}>
              {steps > 0 ? `+${steps}` : steps} — {label}
            </option>
          ))}
        </select>
      </label>
      <p className="dm-hint">Шаг двигает категорию на одну позицию, а не проценты (§6.4).</p>
      <button
        type="submit"
        className="dm-button--primary"
        disabled={subject.trim() === "" || predicate.trim() === ""}
      >
        Бросить
      </button>
    </form>
  );
}

/**
 * Заявить факт руками (§4.6, источник `master`).
 *
 * Субъект и предикат — машинные ключи, и мастер вводит их как есть: приведение
 * к нижнему регистру и отказ от дубля живут в движке (`gm/facts.rs`), а не
 * здесь. Экран не проверяет, свободна ли пара, и не догадывается о причине
 * отказа — причину выдаёт тот, кто выносит решение.
 */
function NewFactForm() {
  const { gmCreateFact } = useCampaign();
  const [subject, setSubject] = useState("");
  const [predicate, setPredicate] = useState("");
  const [value, setValue] = useState(true);

  return (
    <form
      className="scene-page__fact-form"
      onSubmit={(e) => {
        e.preventDefault();
        gmCreateFact(subject, predicate, value);
        setSubject("");
        setPredicate("");
      }}
    >
      <label>
        Субъект
        <input
          value={subject}
          placeholder="door_03"
          onChange={(e) => setSubject(e.currentTarget.value)}
        />
      </label>
      <label>
        Предикат
        <input
          value={predicate}
          placeholder="locked"
          onChange={(e) => setPredicate(e.currentTarget.value)}
        />
      </label>
      <label>
        Значение
        <select
          value={value ? "yes" : "no"}
          onChange={(e) => setValue(e.currentTarget.value === "yes")}
        >
          <option value="yes">да</option>
          <option value="no">нет</option>
        </select>
      </label>
      <button type="submit" disabled={subject.trim() === "" || predicate.trim() === ""}>
        Заявить факт
      </button>
    </form>
  );
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
