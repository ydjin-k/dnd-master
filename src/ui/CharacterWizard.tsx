import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../state/CampaignContext";
import {
  emptyAbilityScores,
  type AbilityScores,
  type Character,
  type InventoryItem,
  type RuleTopic,
} from "../state/types";
import { RuleBlockView } from "./RuleBlockView";
import {
  ALL_SKILLS,
  BACKGROUNDS,
  CLASS_EQUIPMENT,
  CLASS_PROFICIENCIES,
  weaponChoiceFor,
  weaponsInCategory,
  type BackgroundData,
} from "./characterCreationData";
import "./CharacterWizard.css";

const CUSTOM_BACKGROUND_ID = "custom";

const STEPS = ["race", "class", "background", "abilities", "equipment", "review"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = {
  race: "Раса",
  class: "Класс",
  background: "Предыстория",
  abilities: "Характеристики",
  equipment: "Снаряжение",
  review: "Итог",
};

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

// Скорость — сверена вручную с текстом «Скорость. Ваша базовая скорость
// [ходьбы|перемещения] — N футов.» в rules.json для каждой расы.
const RACE_SPEED_FEET: Record<string, number> = {
  "races-dwarf": 25,
  "races-halfling": 25,
  "races-human": 30,
  "races-elf": 30,
  "races-gnome": 25,
  "races-dragonborn": 30,
  "races-half-orc": 30,
  "races-half-elf": 30,
  "races-tiefling": 30,
};

const PROFICIENCY_BONUS_LEVEL_1 = 2;

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
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [customBackground, setCustomBackground] = useState({
    title: "",
    skillProficiencies: [] as string[],
    equipment: "",
    gold: 0,
    feature: "",
  });
  const [classSkills, setClassSkills] = useState<string[]>([]);
  const [equipmentChoice, setEquipmentChoice] = useState<Record<number, number>>({});
  const [weaponPicks, setWeaponPicks] = useState<Record<string, string[]>>({});
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
  const classProf = classId ? CLASS_PROFICIENCIES[classId] : undefined;
  const classEquipment = classId ? CLASS_EQUIPMENT[classId] : undefined;
  const background: BackgroundData | undefined =
    backgroundId === CUSTOM_BACKGROUND_ID
      ? {
          id: CUSTOM_BACKGROUND_ID,
          title: customBackground.title.trim() || "Своя предыстория",
          skillProficiencies: customBackground.skillProficiencies,
          equipment: customBackground.equipment
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          gold: customBackground.gold,
          feature: customBackground.feature,
        }
      : backgroundId
        ? BACKGROUNDS.find((b) => b.id === backgroundId)
        : undefined;

  function toggleCustomBackgroundSkill(skill: string) {
    setCustomBackground((prev) => {
      if (prev.skillProficiencies.includes(skill)) {
        return { ...prev, skillProficiencies: prev.skillProficiencies.filter((s) => s !== skill) };
      }
      if (prev.skillProficiencies.length >= 2) return prev;
      return { ...prev, skillProficiencies: [...prev.skillProficiencies, skill] };
    });
  }

  function selectRace(id: string) {
    setRaceId(id);
    setChoiceBonusKeys([]);
  }

  function selectClass(id: string) {
    setClassId(id);
    setClassSkills([]);
    setEquipmentChoice({});
  }

  function toggleClassSkill(skill: string) {
    if (!classProf) return;
    setClassSkills((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill);
      if (prev.length >= classProf.skillCount) return prev;
      return [...prev, skill];
    });
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

  const allSkillProficiencies = [...new Set([...classSkills, ...(background?.skillProficiencies ?? [])])];

  const speedFeet = raceId ? (RACE_SPEED_FEET[raceId] ?? 30) : 30;
  const initiative = abilityMod(totalAbilities.dexterity);
  const passivePerception =
    10 +
    abilityMod(totalAbilities.wisdom) +
    (allSkillProficiencies.includes("Восприятие") ? PROFICIENCY_BONUS_LEVEL_1 : 0);

  function resolveEquipmentItem(slotIndex: number, itemIndex: number, item: string): string[] {
    const choice = weaponChoiceFor(item);
    if (!choice) return [item];
    const weaponOptions = weaponsInCategory(choice.categories);
    const picks = weaponPicks[`${slotIndex}:${itemIndex}`] ?? [];
    return Array.from({ length: choice.count }, (_, i) => picks[i] ?? weaponOptions[0]?.name ?? item);
  }

  const inventoryItems: string[] = [
    ...(classEquipment ?? []).flatMap((s, slotIndex) => {
      const opt = s.options[equipmentChoice[slotIndex] ?? 0];
      return opt?.items.flatMap((item, itemIndex) => resolveEquipmentItem(slotIndex, itemIndex, item)) ?? [];
    }),
    ...(background?.equipment ?? []),
  ];

  async function finish() {
    if (!name.trim()) return;
    const conMod = abilityMod(totalAbilities.constitution);
    const maxHp = Math.max(1, (hitDie ?? 8) + conMod);
    const inventory: InventoryItem[] = inventoryItems.map((itemName) => ({
      id: crypto.randomUUID(),
      name: itemName,
      quantity: 1,
      notes: "",
    }));
    const character: Character = {
      id: crypto.randomUUID(),
      name: name.trim(),
      race: race?.title ?? "",
      class: klass?.title ?? "",
      background: background?.title ?? "",
      level: 1,
      abilities: totalAbilities,
      maxHp,
      currentHp: maxHp,
      armorClass: 10 + initiative,
      speedFeet,
      initiative,
      passivePerception,
      conditions: [],
      inventory,
      gold: background?.gold ?? 0,
      savingThrowProficiencies: classProf?.savingThrowLabels ?? [],
      skillProficiencies: allSkillProficiencies,
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
        onChange={(e) => {
          const value = Number(e.currentTarget.value) || 0;
          setManual((prev) => ({ ...prev, [key]: value }));
        }}
      />
    );
  }

  const stepIndex = STEPS.indexOf(step);
  const canGoNext =
    (step !== "race" || !!raceId) &&
    (step !== "class" || !!classId) &&
    (step !== "background" || !!backgroundId);

  return (
    <div className="wizard">
      <div className="wizard__steps">
        {STEPS.map((s, i) => (
          <span key={s} className={"wizard__step" + (s === step ? " wizard__step--active" : "")}>
            {i + 1}. {STEP_LABEL[s]}
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
                  onClick={() => selectClass(c.id)}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
          <div className="wizard__pick-detail">
            {klass ? (
              <>
                {classProf && (
                  <div className="wizard__class-proficiencies">
                    <p>
                      <strong>Спасброски:</strong> {classProf.savingThrowLabels.join(", ")}
                    </p>
                    <p>
                      Навыки — выбери {classProf.skillCount} (выбрано {classSkills.length}/
                      {classProf.skillCount}):
                    </p>
                    <div className="wizard__skill-grid">
                      {classProf.skillOptions.map((skill) => (
                        <label key={skill} className="wizard__choice-bonus">
                          <input
                            type="checkbox"
                            checked={classSkills.includes(skill)}
                            onChange={() => toggleClassSkill(skill)}
                            disabled={
                              !classSkills.includes(skill) && classSkills.length >= classProf.skillCount
                            }
                          />
                          {skill}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {klass.blocks.map((b, i) => (
                  <RuleBlockView key={i} block={b} />
                ))}
              </>
            ) : (
              <p className="wizard__hint">Выбери класс слева — здесь появятся его свойства из SRD.</p>
            )}
          </div>
        </div>
      )}

      {step === "background" && (
        <div className="wizard__pick">
          <ul className="wizard__pick-list">
            {BACKGROUNDS.map((b) => (
              <li key={b.id}>
                <button
                  className={"wizard__pick-item" + (b.id === backgroundId ? " wizard__pick-item--active" : "")}
                  onClick={() => setBackgroundId(b.id)}
                >
                  {b.title}
                </button>
              </li>
            ))}
            <li>
              <button
                className={
                  "wizard__pick-item" + (backgroundId === CUSTOM_BACKGROUND_ID ? " wizard__pick-item--active" : "")
                }
                onClick={() => setBackgroundId(CUSTOM_BACKGROUND_ID)}
              >
                Своя предыстория
              </button>
            </li>
          </ul>
          <div className="wizard__pick-detail">
            {backgroundId === CUSTOM_BACKGROUND_ID ? (
              <div className="wizard__custom-background">
                <input
                  placeholder="Название предыстории"
                  value={customBackground.title}
                  onChange={(e) =>
                    setCustomBackground((prev) => ({ ...prev, title: e.currentTarget.value }))
                  }
                />
                <p className="wizard__hint">Навыки (до 2):</p>
                <div className="wizard__skill-grid">
                  {ALL_SKILLS.map((skill) => (
                    <label key={skill} className="wizard__equipment-option">
                      <input
                        type="checkbox"
                        checked={customBackground.skillProficiencies.includes(skill)}
                        onChange={() => toggleCustomBackgroundSkill(skill)}
                      />
                      {skill}
                    </label>
                  ))}
                </div>
                <input
                  placeholder="Снаряжение (через запятую)"
                  value={customBackground.equipment}
                  onChange={(e) =>
                    setCustomBackground((prev) => ({ ...prev, equipment: e.currentTarget.value }))
                  }
                />
                <label>
                  Золото:{" "}
                  <input
                    type="number"
                    min={0}
                    value={customBackground.gold}
                    onChange={(e) =>
                      setCustomBackground((prev) => ({
                        ...prev,
                        gold: Number(e.currentTarget.value) || 0,
                      }))
                    }
                  />
                </label>
                <textarea
                  placeholder="Особенность предыстории"
                  value={customBackground.feature}
                  onChange={(e) =>
                    setCustomBackground((prev) => ({ ...prev, feature: e.currentTarget.value }))
                  }
                />
              </div>
            ) : background ? (
              <>
                <h3 className="rule-block__heading">{background.title}</h3>
                <p>
                  <strong>Навыки:</strong> {background.skillProficiencies.join(", ")}
                </p>
                <p>
                  <strong>Снаряжение:</strong> {background.equipment.join(", ")}; {background.gold} зм
                </p>
                <p>{background.feature}</p>
                <p className="wizard__hint">
                  SRD 5.1 целиком включает только одну готовую предысторию — остальные из Книги игрока в
                  открытый документ не входят. Свою предысторию можно завести через «Своя предыстория» слева.
                </p>
              </>
            ) : (
              <p className="wizard__hint">Выбери предысторию слева.</p>
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

      {step === "equipment" && (
        <div className="wizard__equipment">
          {!classEquipment && (
            <p className="wizard__hint">Для класса «{klass?.title}» снаряжение ещё не занесено.</p>
          )}
          {classEquipment?.map((slotDef, i) => {
            const selectedOpt = slotDef.options[equipmentChoice[i] ?? 0];
            return (
              <div key={i} className="wizard__equipment-slot">
                {slotDef.options.map((opt, optIdx) => (
                  <label key={optIdx} className="wizard__equipment-option">
                    <input
                      type="radio"
                      name={`equip-slot-${i}`}
                      checked={(equipmentChoice[i] ?? 0) === optIdx}
                      onChange={() => setEquipmentChoice((prev) => ({ ...prev, [i]: optIdx }))}
                    />
                    {opt.label}
                  </label>
                ))}
                {selectedOpt?.items.map((item, itemIndex) => {
                  const choice = weaponChoiceFor(item);
                  if (!choice) return null;
                  const weaponOptions = weaponsInCategory(choice.categories);
                  const key = `${i}:${itemIndex}`;
                  const picks = weaponPicks[key] ?? [];
                  return (
                    <div key={itemIndex} className="wizard__weapon-choice">
                      {Array.from({ length: choice.count }).map((_, pickIdx) => (
                        <select
                          key={pickIdx}
                          className="wizard__weapon-select"
                          value={picks[pickIdx] ?? weaponOptions[0]?.name ?? ""}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setWeaponPicks((prev) => {
                              const nextPicks = [...(prev[key] ?? [])];
                              nextPicks[pickIdx] = value;
                              return { ...prev, [key]: nextPicks };
                            });
                          }}
                        >
                          {weaponOptions.map((w) => (
                            <option key={w.name} value={w.name}>
                              {w.name} ({w.damage}
                              {w.properties && w.properties !== "—" ? `, ${w.properties}` : ""})
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {background && (
            <>
              <p className="wizard__hint">Из предыстории «{background.title}» (без выбора):</p>
              <ul>
                {background.equipment.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                <li>{background.gold} зм</li>
              </ul>
            </>
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
            <li>Предыстория: {background?.title ?? "не выбрана"}</li>
            <li>
              HP: {Math.max(1, (hitDie ?? 8) + abilityMod(totalAbilities.constitution))} · КД:{" "}
              {10 + initiative} (безоружный, без брони) · Золото: {background?.gold ?? 0} зм
            </li>
            <li>
              Скорость: {speedFeet} фт · Инициатива: {fmtMod(initiative)} · Пассивная внимательность:{" "}
              {passivePerception}
            </li>
            {ABILITY_LABELS.map(([key, label]) => (
              <li key={key}>
                {label}: {totalAbilities[key]} ({fmtMod(abilityMod(totalAbilities[key]))})
                {racialBonusFor(key) > 0 && (
                  <span className="wizard__ability-bonus"> — включая бонус расы +{racialBonusFor(key)}</span>
                )}
              </li>
            ))}
            <li>Спасброски: {classProf?.savingThrowLabels.join(", ") || "—"}</li>
            <li>Навыки: {allSkillProficiencies.join(", ") || "—"}</li>
            <li>Снаряжение: {inventoryItems.join(", ") || "—"}</li>
          </ul>
          <button disabled={!name.trim()} onClick={finish}>
            Создать персонажа
          </button>
        </div>
      )}

      <div className="wizard__nav">
        {stepIndex > 0 && <button onClick={() => setStep(STEPS[stepIndex - 1])}>Назад</button>}
        {step !== "review" && (
          <button disabled={!canGoNext} onClick={() => setStep(STEPS[stepIndex + 1])}>
            Далее
          </button>
        )}
      </div>
    </div>
  );
}
