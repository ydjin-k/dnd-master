import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../state/CampaignContext";
import { emptyAbilityScores, type AbilityScores, type Character, type RuleTopic } from "../state/types";
import { RuleBlockView } from "./RuleBlockView";
import "./CharacterWizard.css";

type Step = "race" | "class" | "abilities" | "review";
type AbilityMethod = "standard" | "pointbuy" | "manual";
type AbilityKey = keyof AbilityScores;

const ABILITY_LABELS: [AbilityKey, string][] = [
  ["strength", "Сила"],
  ["dexterity", "Ловкость"],
  ["constitution", "Телосложение"],
  ["intelligence", "Интеллект"],
  ["wisdom", "Мудрость"],
  ["charisma", "Харизма"],
];

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_BUY_BUDGET = 27;
const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function parseHitDie(classTopic: RuleTopic | undefined): number | null {
  if (!classTopic) return null;
  for (const b of classTopic.blocks) {
    if (b.type === "paragraph" && b.text.includes("Кость хитов")) {
      const m = b.text.match(/1к(\d+)/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

export function CharacterWizard({ onDone }: { onDone: () => void }) {
  const { addCharacter } = useCampaign();
  const [topics, setTopics] = useState<RuleTopic[]>([]);
  const [step, setStep] = useState<Step>("race");
  const [raceId, setRaceId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [method, setMethod] = useState<AbilityMethod>("standard");
  const [assignment, setAssignment] = useState<Partial<Record<AbilityKey, number>>>({});
  const [pointBuy, setPointBuy] = useState<AbilityScores>(emptyAbilityScores());
  const [manual, setManual] = useState<AbilityScores>(emptyAbilityScores());
  const [name, setName] = useState("");

  useEffect(() => {
    invoke<RuleTopic[]>("get_rules").then(setTopics);
  }, []);

  const races = useMemo(
    () => topics.filter((t) => t.category === "races" && t.id !== "races-traits"),
    [topics],
  );
  const classes = useMemo(() => topics.filter((t) => t.category === "classes"), [topics]);
  const race = races.find((r) => r.id === raceId);
  const klass = classes.find((c) => c.id === classId);
  const hitDie = parseHitDie(klass);

  const abilities: AbilityScores =
    method === "standard"
      ? {
          strength: assignment.strength ?? 10,
          dexterity: assignment.dexterity ?? 10,
          constitution: assignment.constitution ?? 10,
          intelligence: assignment.intelligence ?? 10,
          wisdom: assignment.wisdom ?? 10,
          charisma: assignment.charisma ?? 10,
        }
      : method === "pointbuy"
        ? pointBuy
        : manual;

  const pointsSpent = ABILITY_LABELS.reduce((sum, [key]) => sum + (POINT_BUY_COST[pointBuy[key]] ?? 0), 0);
  // Значения в STANDARD_ARRAY все разные, поэтому "занято" — просто множество
  // уже назначенных значений; сама характеристика видит и своё текущее значение.
  const usedStandardValues = new Set(Object.values(assignment));

  function assignStandard(key: AbilityKey, value: number | null) {
    setAssignment((prev) => {
      const next = { ...prev };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function adjustPointBuy(key: AbilityKey, delta: number) {
    setPointBuy((prev) => {
      const nextVal = prev[key] + delta;
      if (nextVal < 8 || nextVal > 15) return prev;
      const nextCost = pointsSpent - (POINT_BUY_COST[prev[key]] ?? 0) + (POINT_BUY_COST[nextVal] ?? 0);
      if (nextCost > POINT_BUY_BUDGET) return prev;
      return { ...prev, [key]: nextVal };
    });
  }

  async function finish() {
    if (!name.trim()) return;
    const conMod = abilityMod(abilities.constitution);
    const dexMod = abilityMod(abilities.dexterity);
    const maxHp = Math.max(1, (hitDie ?? 8) + conMod);
    const character: Character = {
      id: crypto.randomUUID(),
      name: name.trim(),
      race: race?.title ?? "",
      class: klass?.title ?? "",
      level: 1,
      abilities,
      maxHp,
      currentHp: maxHp,
      armorClass: 10 + dexMod,
      conditions: [],
      inventory: [],
      gold: 0,
    };
    await addCharacter(character);
    onDone();
  }

  return (
    <div className="wizard">
      <div className="wizard__steps">
        {(["race", "class", "abilities", "review"] as Step[]).map((s, i) => (
          <span key={s} className={"wizard__step" + (s === step ? " wizard__step--active" : "")}>
            {i + 1}. {{ race: "Раса", class: "Класс", abilities: "Характеристики", review: "Итог" }[s]}
          </span>
        ))}
        <button className="wizard__close" onClick={onDone}>
          Отмена
        </button>
      </div>

      {step === "race" && (
        <div className="wizard__pick">
          <ul className="wizard__pick-list">
            {races.map((r) => (
              <li key={r.id}>
                <button
                  className={"wizard__pick-item" + (r.id === raceId ? " wizard__pick-item--active" : "")}
                  onClick={() => setRaceId(r.id)}
                >
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
          <div className="wizard__pick-detail">
            {race ? (
              race.blocks.map((b, i) => <RuleBlockView key={i} block={b} />)
            ) : (
              <p className="wizard__hint">Выбери расу слева — здесь появятся её особенности из SRD.</p>
            )}
          </div>
        </div>
      )}

      {step === "class" && (
        <div className="wizard__pick">
          <ul className="wizard__pick-list">
            {classes.map((c) => (
              <li key={c.id}>
                <button
                  className={"wizard__pick-item" + (c.id === classId ? " wizard__pick-item--active" : "")}
                  onClick={() => setClassId(c.id)}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
          <div className="wizard__pick-detail">
            {klass ? (
              klass.blocks.map((b, i) => <RuleBlockView key={i} block={b} />)
            ) : (
              <p className="wizard__hint">Выбери класс слева — здесь появятся его свойства из SRD.</p>
            )}
          </div>
        </div>
      )}

      {step === "abilities" && (
        <div className="wizard__abilities">
          <div className="wizard__method">
            <label>
              <input
                type="radio"
                checked={method === "standard"}
                onChange={() => setMethod("standard")}
              />
              Стандартный набор (15, 14, 13, 12, 10, 8)
            </label>
            <label>
              <input
                type="radio"
                checked={method === "pointbuy"}
                onChange={() => setMethod("pointbuy")}
              />
              Покупка очков (27 очков)
            </label>
            <label>
              <input type="radio" checked={method === "manual"} onChange={() => setMethod("manual")} />
              Ручной ввод (бросил кубики сам)
            </label>
          </div>

          {method === "standard" && (
            <table className="wizard__ability-table">
              <tbody>
                {ABILITY_LABELS.map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>
                      <select
                        value={assignment[key] ?? ""}
                        onChange={(e) =>
                          assignStandard(key, e.currentTarget.value ? Number(e.currentTarget.value) : null)
                        }
                      >
                        <option value="">—</option>
                        {STANDARD_ARRAY.filter(
                          (v) => v === assignment[key] || !usedStandardValues.has(v),
                        ).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="wizard__ability-mod">
                      {assignment[key] !== undefined ? `модификатор ${abilityMod(assignment[key]!) >= 0 ? "+" : ""}${abilityMod(assignment[key]!)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {method === "pointbuy" && (
            <>
              <p className="wizard__hint">
                Потрачено {pointsSpent} из {POINT_BUY_BUDGET} очков.
              </p>
              <table className="wizard__ability-table">
                <tbody>
                  {ABILITY_LABELS.map(([key, label]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className="wizard__pointbuy-controls">
                        <button type="button" onClick={() => adjustPointBuy(key, -1)}>
                          −
                        </button>
                        <span>{pointBuy[key]}</span>
                        <button type="button" onClick={() => adjustPointBuy(key, 1)}>
                          +
                        </button>
                      </td>
                      <td className="wizard__ability-mod">
                        модификатор {abilityMod(pointBuy[key]) >= 0 ? "+" : ""}
                        {abilityMod(pointBuy[key])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {method === "manual" && (
            <table className="wizard__ability-table">
              <tbody>
                {ABILITY_LABELS.map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>
                      <input
                        type="number"
                        value={manual[key]}
                        onChange={(e) =>
                          setManual((prev) => ({ ...prev, [key]: Number(e.currentTarget.value) || 0 }))
                        }
                      />
                    </td>
                    <td className="wizard__ability-mod">
                      модификатор {abilityMod(manual[key]) >= 0 ? "+" : ""}
                      {abilityMod(manual[key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {step === "review" && (
        <div className="wizard__review">
          <input
            className="wizard__name-input"
            placeholder="Имя персонажа"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <ul className="wizard__summary">
            <li>Раса: {race?.title ?? "не выбрана"}</li>
            <li>Класс: {klass?.title ?? "не выбран"}{hitDie ? ` (кость хитов 1к${hitDie})` : ""}</li>
            <li>
              HP: {Math.max(1, (hitDie ?? 8) + abilityMod(abilities.constitution))} · КД:{" "}
              {10 + abilityMod(abilities.dexterity)} (безоружный, без брони)
            </li>
            {ABILITY_LABELS.map(([key, label]) => (
              <li key={key}>
                {label}: {abilities[key]} ({abilityMod(abilities[key]) >= 0 ? "+" : ""}
                {abilityMod(abilities[key])})
              </li>
            ))}
          </ul>
          <p className="wizard__hint">
            Расовые бонусы к характеристикам применяются вручную — см. текст расы на предыдущем шаге и
            учти их при выборе значений выше.
          </p>
          <button disabled={!name.trim()} onClick={finish}>
            Создать персонажа
          </button>
        </div>
      )}

      <div className="wizard__nav">
        {step !== "race" && (
          <button
            onClick={() =>
              setStep(step === "class" ? "race" : step === "abilities" ? "class" : "abilities")
            }
          >
            Назад
          </button>
        )}
        {step !== "review" && (
          <button
            disabled={(step === "race" && !raceId) || (step === "class" && !classId)}
            onClick={() =>
              setStep(step === "race" ? "class" : step === "class" ? "abilities" : "review")
            }
          >
            Далее
          </button>
        )}
      </div>
    </div>
  );
}
