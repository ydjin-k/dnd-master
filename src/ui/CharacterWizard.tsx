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

/**
 * Расовые бонусы к характеристикам — сверены вручную с текстом каждой расы
 * в rules.json (SRD 5.1), а не вытащены регэкспом из прозы: в SRD у части
 * рас бонус описан в двух местах (базовая раса + единственный подрасовый
 * вариант, который там есть), у получеловека — часть бонуса игрок выбирает
 * сам. Раз уж нельзя доверять автопарсингу — таблица проверена глазами один
 * раз и живёт как обычные данные, а не как результат разбора текста.
 */
interface RaceAbilityBonus {
  fixed: Partial<Record<AbilityKey, number>>;
  choice?: { count: number; amount: number };
}

const RACE_ABILITY_BONUSES: Record<string, RaceAbilityBonus> = {
  "races-dwarf": { fixed: { constitution: 2, wisdom: 1 } }, // + Холмовой дварф
  "races-halfling": { fixed: { dexterity: 2, charisma: 1 } }, // + Легконогий
  "races-human": {
    fixed: { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 },
  },
  "races-elf": { fixed: { dexterity: 2, intelligence: 1 } }, // + Высший эльф
  "races-gnome": { fixed: { intelligence: 2, constitution: 1 } }, // + Скальный гном
  "races-dragonborn": { fixed: { strength: 2, charisma: 1 } },
  "races-half-orc": { fixed: { strength: 2, constitution: 1 } },
  "races-half-elf": { fixed: { charisma: 2 }, choice: { count: 2, amount: 1 } },
  "races-tiefling": { fixed: { intelligence: 1, charisma: 2 } },
};

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function fmtMod(mod: number): string {
  return (mod >= 0 ? "+" : "") + mod;
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
  const [choiceBonusKeys, setChoiceBonusKeys] = useState<AbilityKey[]>([]);
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
  const raceBonus = raceId ? RACE_ABILITY_BONUSES[raceId] : undefined;

  function selectRace(id: string) {
    setRaceId(id);
    setChoiceBonusKeys([]);
  }

  function racialBonusFor(key: AbilityKey): number {
    if (!raceBonus) return 0;
    const fixed = raceBonus.fixed[key] ?? 0;
    const chosen = raceBonus.choice && choiceBonusKeys.includes(key) ? raceBonus.choice.amount : 0;
    return fixed + chosen;
  }

  function toggleChoiceBonus(key: AbilityKey) {
    if (!raceBonus?.choice) return;
    setChoiceBonusKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= raceBonus.choice!.count) return prev;
      return [...prev, key];
    });
  }

  const baseAbilities: AbilityScores =
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

  const totalAbilities: AbilityScores = {
    strength: baseAbilities.strength + racialBonusFor("strength"),
    dexterity: baseAbilities.dexterity + racialBonusFor("dexterity"),
    constitution: baseAbilities.constitution + racialBonusFor("constitution"),
    intelligence: baseAbilities.intelligence + racialBonusFor("intelligence"),
    wisdom: baseAbilities.wisdom + racialBonusFor("wisdom"),
    charisma: baseAbilities.charisma + racialBonusFor("charisma"),
  };

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
    const conMod = abilityMod(totalAbilities.constitution);
    const dexMod = abilityMod(totalAbilities.dexterity);
    const maxHp = Math.max(1, (hitDie ?? 8) + conMod);
    const character: Character = {
      id: crypto.randomUUID(),
      name: name.trim(),
      race: race?.title ?? "",
      class: klass?.title ?? "",
      level: 1,
      abilities: totalAbilities,
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

  function baseCell(key: AbilityKey) {
    if (method === "standard") {
      return (
        <select
          value={assignment[key] ?? ""}
          onChange={(e) => assignStandard(key, e.currentTarget.value ? Number(e.currentTarget.value) : null)}
        >
          <option value="">—</option>
          {STANDARD_ARRAY.filter((v) => v === assignment[key] || !usedStandardValues.has(v)).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      );
    }
    if (method === "pointbuy") {
      return (
        <div className="wizard__pointbuy-controls">
          <button type="button" onClick={() => adjustPointBuy(key, -1)}>
            −
          </button>
          <span>{pointBuy[key]}</span>
          <button type="button" onClick={() => adjustPointBuy(key, 1)}>
            +
          </button>
        </div>
      );
    }
    return (
      <input
        type="number"
        value={manual[key]}
        onChange={(e) => setManual((prev) => ({ ...prev, [key]: Number(e.currentTarget.value) || 0 }))}
      />
    );
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
                  onClick={() => selectRace(r.id)}
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

          {method === "pointbuy" && (
            <p className="wizard__hint">
              Потрачено {pointsSpent} из {POINT_BUY_BUDGET} очков.
            </p>
          )}

          {race && !raceBonus && (
            <p className="wizard__hint">
              Для расы «{race.title}» бонусы к характеристикам ещё не занесены — прибавь их сама(сам) по
              тексту расы с первого шага.
            </p>
          )}

          {raceBonus?.choice && (
            <p className="wizard__hint">
              {race?.title}: выбери {raceBonus.choice.count} характеристики для бонуса +{raceBonus.choice.amount}{" "}
              (выбрано {choiceBonusKeys.length}/{raceBonus.choice.count}) —{" "}
              {ABILITY_LABELS.filter(([key]) => key !== "charisma").map(([key, label]) => (
                <label key={key} className="wizard__choice-bonus">
                  <input
                    type="checkbox"
                    checked={choiceBonusKeys.includes(key)}
                    onChange={() => toggleChoiceBonus(key)}
                    disabled={!choiceBonusKeys.includes(key) && choiceBonusKeys.length >= raceBonus.choice!.count}
                  />
                  {label}
                </label>
              ))}
            </p>
          )}

          <table className="wizard__ability-table">
            <thead>
              <tr>
                <th></th>
                <th>База</th>
                <th>Бонус расы</th>
                <th>Итого</th>
                <th>Модификатор</th>
              </tr>
            </thead>
            <tbody>
              {ABILITY_LABELS.map(([key, label]) => {
                const bonus = racialBonusFor(key);
                const total = baseAbilities[key] + bonus;
                return (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{baseCell(key)}</td>
                    <td className="wizard__ability-bonus">{bonus > 0 ? `+${bonus}` : "—"}</td>
                    <td className="wizard__ability-total">{total}</td>
                    <td className="wizard__ability-mod">{fmtMod(abilityMod(total))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
              HP: {Math.max(1, (hitDie ?? 8) + abilityMod(totalAbilities.constitution))} · КД:{" "}
              {10 + abilityMod(totalAbilities.dexterity)} (безоружный, без брони)
            </li>
            {ABILITY_LABELS.map(([key, label]) => (
              <li key={key}>
                {label}: {totalAbilities[key]} ({fmtMod(abilityMod(totalAbilities[key]))})
                {racialBonusFor(key) > 0 && (
                  <span className="wizard__ability-bonus"> — включая бонус расы +{racialBonusFor(key)}</span>
                )}
              </li>
            ))}
          </ul>
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
