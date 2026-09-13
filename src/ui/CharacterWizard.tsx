import { Fragment, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../state/CampaignContext";
import {
  emptyAbilityScores,
  type AbilityScoreRoll,
  type AbilityScores,
  type Character,
  type Coins,
  type InventoryItem,
  type RuleTopic,
  type Spell,
} from "../state/types";
import { RuleBlockView } from "./RuleBlockView";
import { EmphasizedText } from "./EmphasizedText";
import { CoinIcon } from "./CoinIcon";
import { playCoinsSound, playDiceRollSound, playLimitSound } from "../audio/uiSounds";
import {
  ABILITY_LABELS,
  AGE_LIMIT,
  ALIGNMENTS,
  ALIGNMENT_DESCRIPTIONS,
  ALL_ITEMS_WITH_COST,
  ALL_LANGUAGES,
  ALL_SKILLS,
  ARTISAN_TOOLS,
  BACKGROUNDS,
  BACKGROUND_LANGUAGES,
  CLASS_EQUIPMENT,
  CLASS_PROFICIENCIES,
  CLASS_SPELLCASTING_ABILITY,
  CLASS_SPELLCASTING_ABILITY_KEY,
  CLASS_SUBCLASSES,
  catalogWeightLb,
  computeArmorClass,
  COIN_DENOMINATIONS,
  CUSTOM_BACKGROUND_EQUIPMENT_LIMIT,
  CUSTOM_BACKGROUND_GOLD_LIMIT,
  DWARF_TOOL_CHOICES,
  FIGHTER_FIGHTING_STYLES,
  INSTRUMENTS,
  NAME_SUGGESTIONS,
  PROFICIENCY_BONUS_HINT,
  PROFICIENCY_BONUS_LEVEL_1,
  parseHitDie,
  RACE_FIXED_SKILLS,
  RACE_HP_BONUS,
  RACE_LANGUAGES,
  RACE_SKILL_CHOICE_COUNT,
  RACE_TRAITS,
  RANGER_FAVORED_ENEMIES,
  RANGER_TERRAIN_TYPES,
  SKILL_ABILITY,
  abilityMod,
  armorProficienciesFor,
  equipmentChoiceFor,
  fmtMod,
  subclassGrants,
  subclassSpellsUpToLevel,
  toggleChoiceSelection,
  toolProficienciesFor,
  weaponProficienciesFor,
  type AbilityKey,
  type BackgroundData,
} from "./characterCreationData";
import { CLASS_PROGRESSION, characterResources, progressionAt, resourceMax, spellSlotsForLevel } from "./classProgression";
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

// Ровно два варианта — владелец продукта явно попросил не добавлять третий.
const GENDERS = ["Мужской", "Женский"] as const;

const GENDER_TO_NAME_KEY: Record<(typeof GENDERS)[number], "male" | "female"> = {
  Мужской: "male",
  Женский: "female",
};

export function CharacterWizard({ onDone }: { onDone: () => void }) {
  const { addCharacter } = useCampaign();
  const [topics, setTopics] = useState<RuleTopic[]>([]);
  const [spells, setSpells] = useState<Spell[]>([]);
  const [step, setStep] = useState<Step>("race");
  const [raceId, setRaceId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [chosenSubclassIndex, setChosenSubclassIndex] = useState(0);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [customBackground, setCustomBackground] = useState({
    title: "",
    skillProficiencies: [] as string[],
    equipment: [] as string[],
    gold: 0,
    feature: "",
  });
  const [gearToAdd, setGearToAdd] = useState(ALL_ITEMS_WITH_COST[0]?.name ?? "");
  const [alignment, setAlignment] = useState("Нейтральный");
  const [personalityTraits, setPersonalityTraits] = useState("");
  const [ideals, setIdeals] = useState("");
  const [bonds, setBonds] = useState("");
  const [flaws, setFlaws] = useState("");
  const [chosenLanguage, setChosenLanguage] = useState("");
  const [raceSkillChoices, setRaceSkillChoices] = useState<string[]>([]);
  const [chosenDwarfTool, setChosenDwarfTool] = useState("");
  const [fightingStyle, setFightingStyle] = useState("");
  const [favoredEnemy, setFavoredEnemy] = useState("");
  const [rangerTerrain, setRangerTerrain] = useState("");
  const [monkToolCategory, setMonkToolCategory] = useState<"craft" | "music">("craft");
  const [chosenMonkTool, setChosenMonkTool] = useState("");
  const [bardInstruments, setBardInstruments] = useState<string[]>([]);
  const [chosenBackgroundLanguages, setChosenBackgroundLanguages] = useState<string[]>([]);
  const [classSkills, setClassSkills] = useState<string[]>([]);
  const [equipmentChoice, setEquipmentChoice] = useState<Record<number, number>>({});
  const [equipmentPicks, setEquipmentPicks] = useState<Record<string, string[]>>({});
  const [method, setMethod] = useState<AbilityMethod>("standard");
  const [assignment, setAssignment] = useState<Partial<Record<AbilityKey, number>>>({});
  // Виртуальный бросок для метода "manual" — просто предзаполняет числа,
  // которые всё равно остаются обычными редактируемыми полями ниже.
  const [abilityRolls, setAbilityRolls] = useState<AbilityScoreRoll[] | null>(null);
  const [rolling, setRolling] = useState(false);
  const [pointBuy, setPointBuy] = useState<AbilityScores>(emptyAbilityScores());
  const [manual, setManual] = useState<AbilityScores>(emptyAbilityScores());
  const [choiceBonusKeys, setChoiceBonusKeys] = useState<AbilityKey[]>([]);
  const [name, setName] = useState("");
  const [lastSuggestedName, setLastSuggestedName] = useState<string | null>(null);
  const [gender, setGender] = useState<(typeof GENDERS)[number]>(GENDERS[0]);
  const [age, setAge] = useState(0);
  const [ageLimitHit, setAgeLimitHit] = useState(false);
  const [goldLimitHit, setGoldLimitHit] = useState(false);
  const [knownCantrips, setKnownCantrips] = useState<string[]>([]);
  const [knownSpells, setKnownSpells] = useState<string[]>([]);

  useEffect(() => {
    invoke<RuleTopic[]>("get_rules").then(setTopics);
    invoke<Spell[]>("get_spells").then(setSpells);
  }, []);

  const races = useMemo(
    () => topics.filter((t) => t.category === "races" && t.id !== "races-traits"),
    [topics],
  );
  const classes = useMemo(() => topics.filter((t) => t.category === "classes"), [topics]);
  const race = races.find((r) => r.id === raceId);
  const klass = classes.find((c) => c.id === classId);
  // Шаг «Класс» показывает только «шапку» класса из SRD (кости хитов,
  // владения, стартовое снаряжение) — не полный текст со всеми фичами по
  // уровням и таблицей прогрессии; это можно посмотреть на вкладке «Правила».
  // У всех 12 классов один и тот же порядок блоков в rules.json, поэтому
  // срез «до первого списка» стабильно даёт именно этот заголовочный кусок.
  const classIntroListIndex = klass?.blocks.findIndex((b) => b.type === "list") ?? -1;
  const classIntroBlocks = klass
    ? klass.blocks.slice(0, classIntroListIndex === -1 ? klass.blocks.length : classIntroListIndex + 1)
    : [];
  const hitDie = parseHitDie(klass);
  const raceBonus = raceId ? RACE_ABILITY_BONUSES[raceId] : undefined;
  const raceHpBonus = raceId ? (RACE_HP_BONUS[raceId] ?? 0) : 0;
  const raceFixedSkills = raceId ? (RACE_FIXED_SKILLS[raceId] ?? []) : [];
  const raceSkillChoiceCount = raceId ? (RACE_SKILL_CHOICE_COUNT[raceId] ?? 0) : 0;
  const raceTraits = raceId ? (RACE_TRAITS[raceId] ?? []) : [];
  const spellAbility = classId ? CLASS_SPELLCASTING_ABILITY[classId] : undefined;
  const dwarfToolChoices = raceId === "races-dwarf" ? DWARF_TOOL_CHOICES : [];
  const fighterFightingStyles = classId === "classes-fighter" ? FIGHTER_FIGHTING_STYLES : [];
  const isRanger = classId === "classes-ranger";
  const isMonk = classId === "classes-monk";
  const isBard = classId === "classes-bard";
  const monkToolOptions = monkToolCategory === "craft" ? ARTISAN_TOOLS : INSTRUMENTS;
  const finalMonkTool = isMonk ? chosenMonkTool || monkToolOptions[0]?.name : undefined;
  const finalDwarfTool = dwarfToolChoices.length > 0 ? chosenDwarfTool || dwarfToolChoices[0].name : undefined;
  const displayedRaceTraits = raceTraits.map((t) =>
    t.name === "Владение инструментами" && finalDwarfTool
      ? { ...t, description: `Инструменты кузнеца, пивовара или каменщика — выбрано: ${finalDwarfTool}.` }
      : t,
  );
  const raceLanguages = raceId ? RACE_LANGUAGES[raceId] : undefined;
  const availableLanguageChoices = raceLanguages
    ? ALL_LANGUAGES.filter((l) => !raceLanguages.fixed.includes(l))
    : [];
  const raceFinalLanguages: string[] = raceLanguages
    ? [
        ...raceLanguages.fixed,
        ...(raceLanguages.choiceCount
          ? [chosenLanguage || availableLanguageChoices[0]].filter((l): l is string => !!l)
          : []),
      ]
    : [];
  const backgroundLanguageCount = backgroundId ? (BACKGROUND_LANGUAGES[backgroundId] ?? 0) : 0;
  function backgroundLanguageOptions(index: number): string[] {
    return ALL_LANGUAGES.filter(
      (l) =>
        !raceFinalLanguages.includes(l) &&
        (l === chosenBackgroundLanguages[index] ||
          !chosenBackgroundLanguages.some((v, i) => i !== index && v === l)),
    );
  }
  const finalBackgroundLanguages: string[] = Array.from({ length: backgroundLanguageCount }, (_, i) => {
    const chosen = chosenBackgroundLanguages[i];
    const options = backgroundLanguageOptions(i);
    return chosen && options.includes(chosen) ? chosen : options[0];
  }).filter((l): l is string => !!l);
  const finalLanguages: string[] = [...new Set([...raceFinalLanguages, ...finalBackgroundLanguages])];
  const classProf = classId ? CLASS_PROFICIENCIES[classId] : undefined;
  const classEquipment = classId ? CLASS_EQUIPMENT[classId] : undefined;
  // Жрец/Колдун/Чародей выбирают архетип уже на 1 уровне (см. таблицу в
  // карточке characters-leveling-1-5) — при единственном варианте (SRD)
  // назначается автоматически, при нескольких (см. CLASS_SUBCLASSES) игрок
  // выбирает через `chosenSubclassIndex` на шаге «Итог».
  const subclassInfo = classId ? CLASS_SUBCLASSES[classId] : undefined;
  const level1Subclass =
    subclassInfo?.chosenAtLevel === 1 ? subclassInfo.subclasses[chosenSubclassIndex] : undefined;
  const background: BackgroundData | undefined =
    backgroundId === CUSTOM_BACKGROUND_ID
      ? {
          id: CUSTOM_BACKGROUND_ID,
          title: customBackground.title.trim() || "Своя предыстория",
          skillProficiencies: customBackground.skillProficiencies,
          equipment: customBackground.equipment,
          gold: customBackground.gold,
          feature: customBackground.feature,
        }
      : backgroundId
        ? BACKGROUNDS.find((b) => b.id === backgroundId)
        : undefined;
  // Стартовые монеты фиксированы золотом предыстории — перераспределять по
  // номиналам можно только после создания персонажа (см. `adjustCoin` в
  // CharactersPage.tsx), не на этом шаге.
  const coins: Coins = {
    copper: 0,
    silver: 0,
    electrum: 0,
    gold: background?.gold ?? 0,
    platinum: 0,
  };

  function toggleCustomBackgroundSkill(skill: string) {
    setCustomBackground((prev) => ({
      ...prev,
      skillProficiencies: toggleChoiceSelection(prev.skillProficiencies, skill, 2),
    }));
  }

  function addCustomBackgroundEquipment(item: string) {
    setCustomBackground((prev) => {
      if (prev.equipment.length >= CUSTOM_BACKGROUND_EQUIPMENT_LIMIT) return prev;
      return { ...prev, equipment: [...prev.equipment, item] };
    });
  }

  function removeCustomBackgroundEquipment(index: number) {
    setCustomBackground((prev) => ({
      ...prev,
      equipment: prev.equipment.filter((_, i) => i !== index),
    }));
  }

  /** Реролл никогда не повторяет последний предложенный вариант (если в списке > 1 имени). */
  function suggestName() {
    const byGender = (raceId && NAME_SUGGESTIONS[raceId]) || NAME_SUGGESTIONS.general;
    const genderKey = GENDER_TO_NAME_KEY[gender];
    const list = byGender[genderKey];
    const pool = list.length > 1 ? list.filter((n) => n !== lastSuggestedName) : list;
    const suggestion = pool[Math.floor(Math.random() * pool.length)];
    setLastSuggestedName(suggestion);
    setName(suggestion);
  }

  function selectRace(id: string) {
    setRaceId(id);
    setChoiceBonusKeys([]);
    setChosenLanguage("");
    setRaceSkillChoices([]);
    setChosenDwarfTool("");
  }

  function toggleRaceSkillChoice(skill: string) {
    setRaceSkillChoices((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill);
      if (prev.length >= raceSkillChoiceCount) return prev;
      return [...prev, skill];
    });
  }

  function selectBackground(id: string) {
    setBackgroundId(id);
    const count = BACKGROUND_LANGUAGES[id] ?? 0;
    const defaults: string[] = [];
    for (const lang of ALL_LANGUAGES) {
      if (defaults.length >= count) break;
      if (!raceFinalLanguages.includes(lang)) defaults.push(lang);
    }
    setChosenBackgroundLanguages(defaults);
  }

  function setBackgroundLanguageAt(index: number, lang: string) {
    setChosenBackgroundLanguages((prev) => prev.map((v, i) => (i === index ? lang : v)));
  }

  function selectClass(id: string) {
    setClassId(id);
    setChosenSubclassIndex(0);
    setClassSkills([]);
    setEquipmentChoice({});
    setFightingStyle("");
    setFavoredEnemy("");
    setRangerTerrain("");
    setMonkToolCategory("craft");
    setChosenMonkTool("");
    setBardInstruments(id === "classes-bard" ? INSTRUMENTS.slice(0, 3).map((i) => i.name) : []);
    setKnownCantrips([]);
    setKnownSpells([]);
  }

  function changeMonkToolCategory(category: "craft" | "music") {
    setMonkToolCategory(category);
    setChosenMonkTool("");
  }

  function setBardInstrumentAt(index: number, instrumentName: string) {
    setBardInstruments((prev) => prev.map((v, i) => (i === index ? instrumentName : v)));
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

  const level1Progression = progressionAt(classId, 1);
  const level1SubclassSpells = subclassSpellsUpToLevel(classId, level1Subclass?.name, 1);
  const level1SpellSlots = spellSlotsForLevel(classId, 1);
  const classCantrips = classId ? spells.filter((sp) => sp.level === 0 && sp.classes.includes(classId)) : [];
  const classLevel1Spells = classId ? spells.filter((sp) => sp.level === 1 && sp.classes.includes(classId)) : [];
  const requiredCantrips = level1Progression?.cantripsKnown ?? 0;
  // Волшебник/Друид/Жрец «подготавливают» заклинания: мод. заклинательной
  // характеристики + уровень персонажа (в мастере всегда 1), минимум одно —
  // не фиксированное число из таблицы (у тех классов spellsKnown = 0).
  const spellAbilityKey = classId ? CLASS_SPELLCASTING_ABILITY_KEY[classId] : undefined;
  const requiredSpells = !spellAbilityKey
    ? 0
    : CLASS_PROGRESSION[classId!]?.spellsKnownKind === "known"
      ? (level1Progression?.spellsKnown ?? 0)
      : Math.max(1, abilityMod(totalAbilities[spellAbilityKey]) + 1);
  const reviewMissing: string | null = !name.trim()
    ? "Впиши имя персонажа, чтобы продолжить."
    : spellAbility && knownCantrips.length !== requiredCantrips
      ? `Выбери ${requiredCantrips} заговора(ов), чтобы продолжить.`
      : spellAbility && knownSpells.length !== requiredSpells
        ? `Выбери ${requiredSpells} заклинание(й) 1 уровня, чтобы продолжить.`
        : null;

  function toggleCantrip(id: string) {
    setKnownCantrips((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= requiredCantrips) return prev;
      return [...prev, id];
    });
  }

  function toggleKnownSpell(id: string) {
    setKnownSpells((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= requiredSpells) return prev;
      return [...prev, id];
    });
  }

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

  function selectAbilityMethod(next: AbilityMethod) {
    setMethod(next);
    // Пул значений для стандартного набора не совпадает со свободным вводом —
    // старая привязка может ссылаться на число, которого в новом методе нет.
    setAssignment({});
  }

  /** Виртуальный бросок 4к6 (шесть раз, без младшего кубика) — предзаполняет
   * поля ручного ввода, но не подменяет его: результат можно тут же
   * поправить, как и любое число, введённое руками. */
  async function rollAbilityScores() {
    playDiceRollSound();
    setRolling(true);
    try {
      const rolls = await invoke<AbilityScoreRoll[]>("roll_ability_scores");
      setAbilityRolls(rolls);
      const next = { ...manual };
      ABILITY_LABELS.forEach(([key], i) => {
        next[key] = rolls[i].total;
      });
      setManual(next);
    } finally {
      setRolling(false);
    }
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

  const allSkillProficiencies = [
    ...new Set([
      ...classSkills,
      ...(background?.skillProficiencies ?? []),
      ...raceFixedSkills,
      ...raceSkillChoices,
      // Навык, данный самим архетипом (Домен обмана — Обман): владение реальное,
      // на модификатор навыка на листе оно влияет так же, как классовое.
      ...(level1Subclass ? (subclassGrants(classId, level1Subclass.name)?.skills ?? []) : []),
    ]),
  ];

  const speedFeet = raceId ? (RACE_SPEED_FEET[raceId] ?? 30) : 30;
  const initiative = abilityMod(totalAbilities.dexterity);
  const passivePerception =
    10 +
    abilityMod(totalAbilities.wisdom) +
    (allSkillProficiencies.includes("Восприятие") ? PROFICIENCY_BONUS_LEVEL_1 : 0);

  function resolveEquipmentItem(slotIndex: number, itemIndex: number, item: string): string[] {
    const choice = equipmentChoiceFor(item);
    if (!choice) return [item];
    const picks = equipmentPicks[`${slotIndex}:${itemIndex}`] ?? [];
    return Array.from({ length: choice.count }, (_, i) => picks[i] ?? choice.options[0]?.name ?? item);
  }

  const inventoryItems: string[] = [
    ...(classEquipment ?? []).flatMap((s, slotIndex) => {
      const opt = s.options[equipmentChoice[slotIndex] ?? 0];
      return opt?.items.flatMap((item, itemIndex) => resolveEquipmentItem(slotIndex, itemIndex, item)) ?? [];
    }),
    ...(background?.equipment ?? []),
  ];
  const finalFightingStyle =
    classId === "classes-fighter" ? fightingStyle || fighterFightingStyles[0]?.name || "" : "";
  const armorClass = computeArmorClass({
    classId: classId ?? "",
    subclassName: level1Subclass?.name,
    abilities: totalAbilities,
    inventoryItemNames: inventoryItems,
    fightingStyle: finalFightingStyle || undefined,
  });

  async function finish() {
    if (!name.trim()) return;
    if (spellAbility && (knownCantrips.length !== requiredCantrips || knownSpells.length !== requiredSpells)) return;
    const conMod = abilityMod(totalAbilities.constitution);
    const maxHp = Math.max(1, (hitDie ?? 8) + conMod + raceHpBonus);
    const inventory: InventoryItem[] = inventoryItems.map((itemName) => ({
      id: crypto.randomUUID(),
      name: itemName,
      quantity: 1,
      notes: "",
      weightLb: catalogWeightLb(itemName),
    }));
    const character: Character = {
      id: crypto.randomUUID(),
      name: name.trim(),
      race: race?.title ?? "",
      class: klass?.title ?? "",
      subclass: level1Subclass?.name ?? "",
      background: background?.title ?? "",
      personalityTraits: personalityTraits.trim(),
      ideals: ideals.trim(),
      bonds: bonds.trim(),
      flaws: flaws.trim(),
      alignment,
      gender,
      age,
      // Описательные поля листа (рост/вес/внешность/предыстория…) мастер не
      // спрашивает — они заполняются потом в карточке персонажа или приезжают
      // готовыми из пресета.
      height: "",
      weight: "",
      eyes: "",
      skin: "",
      hair: "",
      appearance: "",
      backstory: "",
      allies: "",
      treasures: "",
      languages: finalLanguages,
      favoredEnemy: isRanger ? favoredEnemy || RANGER_FAVORED_ENEMIES[0] : "",
      knownTerrain: isRanger ? rangerTerrain || RANGER_TERRAIN_TYPES[0] : "",
      level: 1,
      experiencePoints: 0,
      abilities: totalAbilities,
      maxHp,
      currentHp: maxHp,
      armorClass,
      speedFeet,
      initiative,
      passivePerception,
      conditions: [],
      inventory,
      coins,
      savingThrowProficiencies: classProf?.savingThrowLabels ?? [],
      skillProficiencies: allSkillProficiencies,
      armorProficiencies: armorProficienciesFor(classId, level1Subclass?.name),
      weaponProficiencies: weaponProficienciesFor(classId, level1Subclass?.name),
      // Инструменты архетипа плюс личный выбор игрока при создании — Владение
      // музыкальными инструментами барда, владение инструментами монаха и
      // владение инструментами дварфа выбираются здесь же (шаг «Итог»), но
      // раньше нигде не сохранялись.
      toolProficiencies: [
        ...new Set([
          ...toolProficienciesFor(classId, level1Subclass?.name),
          ...(isBard ? bardInstruments : []),
          ...(isMonk && finalMonkTool ? [finalMonkTool] : []),
          ...(finalDwarfTool ? [finalDwarfTool] : []),
        ]),
      ],
      fightingStyle: finalFightingStyle,
      knownCantrips: spellAbility ? knownCantrips : [],
      // Заклинания домена архетипа всегда подготовлены и не считаются в норму
      // класса — добавляются поверх выбранных игроком (SRD, «Заклинания домена»).
      knownSpells: spellAbility ? [...new Set([...knownSpells, ...level1SubclassSpells])] : [],
      spellSlotsMax: level1SpellSlots,
      spellSlotsCurrent: [...level1SpellSlots],
      // Классовые ресурсы 1 уровня (Второе дыхание воина, Вдохновение барда,
      // Наложение рук паладина) плюс собственные ресурсы архетипа — сразу полными.
      featureUses: characterResources(classId, level1Subclass?.name, 1).map((resource) => ({
        featureId: resource.id,
        usesCurrent: resourceMax(resource, totalAbilities),
      })),
      // Выбор внутри архетипа появляется только левел-апом (chosenAtLevel всех
      // трёх подключённых случаев — 2 или 3 уровень, персонаж создаётся 1-м).
      subclassChoices: {},
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
        value={manual[key] === 0 ? "" : manual[key]}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          const value = raw === "" ? 0 : Number(raw) || 0;
          setManual((prev) => ({ ...prev, [key]: value }));
        }}
      />
    );
  }

  const stepIndex = STEPS.indexOf(step);

  /**
   * Причина, по которой «Далее» неактивна на текущем шаге — null, если шаг
   * полностью заполнен. Возвращает первую найденную нехватку, не все сразу.
   * Проверяются только под-выборы, у которых в остальном коде НЕТ значения
   * по умолчанию (инструмент Дварфа/боевой стиль/язык предыстории и т.п. уже
   * молча подставляют первый вариант, если ничего не выбрано — там блокировать
   * нечего, см. characters-wizard-step-validation).
   */
  function stepValidationMessage(): string | null {
    if (step === "race") {
      if (!raceId) return "Выбери расу, чтобы продолжить.";
      if (raceSkillChoiceCount > 0 && raceSkillChoices.length < raceSkillChoiceCount) {
        return `Выбери ${raceSkillChoiceCount} навыка (гибкость навыков), чтобы продолжить.`;
      }
      if (raceBonus?.choice && choiceBonusKeys.length < raceBonus.choice.count) {
        return `Выбери ${raceBonus.choice.count} характеристики для бонуса, чтобы продолжить.`;
      }
      return null;
    }
    if (step === "class") {
      if (!classId) return "Выбери класс, чтобы продолжить.";
      if (classProf && classSkills.length < classProf.skillCount) {
        return `Выбери ${classProf.skillCount} навыка класса, чтобы продолжить.`;
      }
      return null;
    }
    if (step === "background") {
      if (!backgroundId) return "Выбери предысторию, чтобы продолжить.";
      if (backgroundId === CUSTOM_BACKGROUND_ID) {
        if (!customBackground.title.trim()) return "Впиши название своей предыстории, чтобы продолжить.";
        if (customBackground.skillProficiencies.length === 0) {
          return "Выбери хотя бы один навык своей предыстории, чтобы продолжить.";
        }
      }
      return null;
    }
    if (step === "abilities") {
      if (method === "standard" && ABILITY_LABELS.some(([key]) => assignment[key] === undefined)) {
        return "Распредели все шесть характеристик, чтобы продолжить.";
      }
      return null;
    }
    // "equipment": каждый обязательный выбор (комплект снаряжения, оружие/инструмент
    // внутри комплекта) уже молча выбирает первый вариант по умолчанию — блокировать
    // здесь нечего, шаг всегда в валидном состоянии.
    return null;
  }

  const stepMissing = stepValidationMessage();
  const canGoNext = stepMissing === null;

  return (
    <div className="wizard">
      <div className="wizard__steps">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={
              "wizard__step dm-pill " +
              (i < stepIndex
                ? "wizard__step--done dm-pill--done"
                : s === step
                  ? "wizard__step--active dm-pill--progress"
                  : "wizard__step--pending")
            }
          >
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
                  className={"wizard__pick-item dm-tab" + (r.id === raceId ? " wizard__pick-item--active is-selected" : "")}
                  onClick={() => selectRace(r.id)}
                >
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
          <div className="wizard__pick-detail">
            {race ? (
              <>
                {race.blocks.map((b, i) => <RuleBlockView key={i} block={b} />)}
                {raceLanguages?.choiceCount ? (
                  <p className="wizard__hint">
                    Дополнительный язык по выбору:{" "}
                    <select
                      value={chosenLanguage || availableLanguageChoices[0] || ""}
                      onChange={(e) => setChosenLanguage(e.currentTarget.value)}
                    >
                      {availableLanguageChoices.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </p>
                ) : null}
                {raceSkillChoiceCount > 0 && (
                  <p className="wizard__hint">
                    Гибкость навыков: выбери {raceSkillChoiceCount} навыка (выбрано{" "}
                    {raceSkillChoices.length}/{raceSkillChoiceCount}) —{" "}
                    {ALL_SKILLS.map((skill) => (
                      <label key={skill} className="wizard__choice-bonus">
                        <input
                          type="checkbox"
                          checked={raceSkillChoices.includes(skill)}
                          onChange={() => toggleRaceSkillChoice(skill)}
                          disabled={
                            !raceSkillChoices.includes(skill) && raceSkillChoices.length >= raceSkillChoiceCount
                          }
                        />
                        {skill}
                      </label>
                    ))}
                  </p>
                )}
                {raceBonus?.choice && (
                  <p className="wizard__hint">
                    Увеличение характеристик по выбору: выбери {raceBonus.choice.count} характеристики для
                    бонуса +{raceBonus.choice.amount} (выбрано {choiceBonusKeys.length}/{raceBonus.choice.count}) —{" "}
                    {ABILITY_LABELS.filter(([key]) => !(key in raceBonus.fixed)).map(([key, label]) => (
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
                {dwarfToolChoices.length > 0 && (
                  <p className="wizard__hint">
                    Владение инструментами (на выбор):{" "}
                    <select
                      value={chosenDwarfTool || dwarfToolChoices[0]?.name || ""}
                      onChange={(e) => setChosenDwarfTool(e.currentTarget.value)}
                    >
                      {dwarfToolChoices.map((tool) => (
                        <option key={tool.name} value={tool.name}>
                          {tool.name} ({tool.cost}, {tool.weight})
                        </option>
                      ))}
                    </select>
                  </p>
                )}
              </>
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
                  className={"wizard__pick-item dm-tab" + (c.id === classId ? " wizard__pick-item--active is-selected" : "")}
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
                {fighterFightingStyles.length > 0 && (
                  <p className="wizard__hint">
                    Боевой стиль:{" "}
                    <select
                      value={fightingStyle || fighterFightingStyles[0]?.name || ""}
                      onChange={(e) => setFightingStyle(e.currentTarget.value)}
                    >
                      {fighterFightingStyles.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </p>
                )}
                {isRanger && (
                  <>
                    <p className="wizard__hint">
                      Избранный враг:{" "}
                      <select
                        value={favoredEnemy || RANGER_FAVORED_ENEMIES[0]}
                        onChange={(e) => setFavoredEnemy(e.currentTarget.value)}
                      >
                        {RANGER_FAVORED_ENEMIES.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </p>
                    <p className="wizard__hint">
                      Известная местность:{" "}
                      <select
                        value={rangerTerrain || RANGER_TERRAIN_TYPES[0]}
                        onChange={(e) => setRangerTerrain(e.currentTarget.value)}
                      >
                        {RANGER_TERRAIN_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </p>
                  </>
                )}
                {isBard && (
                  <p className="wizard__hint">
                    Владение музыкальными инструментами (3 на выбор, без повторов):{" "}
                    {bardInstruments.map((chosen, index) => (
                      <select
                        key={index}
                        value={chosen}
                        onChange={(e) => setBardInstrumentAt(index, e.currentTarget.value)}
                      >
                        {INSTRUMENTS.filter((inst) => inst.name === chosen || !bardInstruments.includes(inst.name)).map(
                          (inst) => (
                            <option key={inst.name} value={inst.name}>
                              {inst.name}
                            </option>
                          ),
                        )}
                      </select>
                    ))}
                  </p>
                )}
                {isMonk && (
                  <p className="wizard__hint">
                    Владение инструментами:{" "}
                    <select
                      value={monkToolCategory}
                      onChange={(e) => changeMonkToolCategory(e.currentTarget.value as "craft" | "music")}
                    >
                      <option value="craft">Инструмент ремесленника</option>
                      <option value="music">Музыкальный инструмент</option>
                    </select>{" "}
                    <select
                      value={chosenMonkTool || monkToolOptions[0]?.name || ""}
                      onChange={(e) => setChosenMonkTool(e.currentTarget.value)}
                    >
                      {monkToolOptions.map((tool) => (
                        <option key={tool.name} value={tool.name}>
                          {tool.name} ({tool.cost}, {tool.weight})
                        </option>
                      ))}
                    </select>
                  </p>
                )}
                {classIntroBlocks.map((b, i) => (
                  <RuleBlockView key={i} block={b} />
                ))}
                <p className="wizard__hint">
                  Полное описание классовых способностей по уровням — на вкладке «Правила».
                </p>
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
                  className={"wizard__pick-item dm-tab" + (b.id === backgroundId ? " wizard__pick-item--active is-selected" : "")}
                  onClick={() => selectBackground(b.id)}
                >
                  {b.title}
                </button>
              </li>
            ))}
            <li>
              <button
                className={
                  "wizard__pick-item dm-tab" + (backgroundId === CUSTOM_BACKGROUND_ID ? " wizard__pick-item--active is-selected" : "")
                }
                onClick={() => selectBackground(CUSTOM_BACKGROUND_ID)}
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
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setCustomBackground((prev) => ({ ...prev, title: value }));
                  }}
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
                <p className="wizard__hint">
                  Снаряжение ({customBackground.equipment.length}/{CUSTOM_BACKGROUND_EQUIPMENT_LIMIT}):
                </p>
                {customBackground.equipment.length > 0 && (
                  <ul className="wizard__custom-equipment-list">
                    {customBackground.equipment.map((item, i) => (
                      <li key={i}>
                        {item}{" "}
                        <button type="button" onClick={() => removeCustomBackgroundEquipment(i)}>
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="wizard__custom-equipment-add">
                  <select value={gearToAdd} onChange={(e) => setGearToAdd(e.currentTarget.value)}>
                    {ALL_ITEMS_WITH_COST.map((g) => (
                      <option key={g.name} value={g.name}>
                        {g.name} ({g.cost}, {g.weight})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-disabled={customBackground.equipment.length >= CUSTOM_BACKGROUND_EQUIPMENT_LIMIT}
                    className={customBackground.equipment.length >= CUSTOM_BACKGROUND_EQUIPMENT_LIMIT ? "character-card__danger" : undefined}
                    onClick={() => customBackground.equipment.length >= CUSTOM_BACKGROUND_EQUIPMENT_LIMIT ? playLimitSound() : addCustomBackgroundEquipment(gearToAdd)}
                  >
                    Добавить
                  </button>
                </div>
                <label>
                  Золото (максимум {CUSTOM_BACKGROUND_GOLD_LIMIT} зм):{" "}
                  <input
                    className={goldLimitHit ? "character-card__danger" : undefined}
                    type="number"
                    min={0}
                    max={CUSTOM_BACKGROUND_GOLD_LIMIT}
                    value={customBackground.gold === 0 ? "" : customBackground.gold}
                    onChange={(e) => {
                      const raw = e.currentTarget.value;
                      const requested = raw === "" ? 0 : Number(raw) || 0;
                      const overLimit = requested > CUSTOM_BACKGROUND_GOLD_LIMIT;
                      setGoldLimitHit(overLimit);
                      if (overLimit) playLimitSound();
                      else if (requested !== customBackground.gold) playCoinsSound();
                      const value = Math.min(CUSTOM_BACKGROUND_GOLD_LIMIT, requested);
                      setCustomBackground((prev) => ({ ...prev, gold: value }));
                    }}
                  />
                </label>
                <textarea
                  placeholder="Особенность предыстории"
                  value={customBackground.feature}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setCustomBackground((prev) => ({ ...prev, feature: value }));
                  }}
                />
              </div>
            ) : background ? (
              <>
                <h3 className="rule-block__heading">{background.title}</h3>
                <p>
                  <strong>Навыки:</strong>{" "}
                  {background.skillProficiencies.map((skill, i) => (
                    <Fragment key={skill}>
                      {i > 0 ? ", " : ""}
                      <strong>{skill}</strong>
                    </Fragment>
                  ))}
                </p>
                <p>
                  <strong>Снаряжение:</strong>{" "}
                  {background.equipment.map((item, i) => (
                    <Fragment key={item}>
                      {i > 0 ? ", " : ""}
                      <strong>{item}</strong>
                    </Fragment>
                  ))}
                  ; {background.gold} зм
                </p>
                <p><EmphasizedText>{background.feature}</EmphasizedText></p>
                {backgroundLanguageCount > 0 && (
                  <p className="wizard__hint">
                    Дополнительный язык{backgroundLanguageCount > 1 ? "и" : ""} по выбору:{" "}
                    {Array.from({ length: backgroundLanguageCount }, (_, index) => {
                      const options = backgroundLanguageOptions(index);
                      const value = chosenBackgroundLanguages[index] ?? options[0] ?? "";
                      return (
                        <select
                          key={index}
                          value={value}
                          onChange={(e) => setBackgroundLanguageAt(index, e.currentTarget.value)}
                        >
                          {options.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      );
                    })}
                  </p>
                )}
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
                onChange={() => selectAbilityMethod("standard")}
              />
              Стандартный набор (15, 14, 13, 12, 10, 8)
            </label>
            <label>
              <input
                type="radio"
                checked={method === "pointbuy"}
                onChange={() => selectAbilityMethod("pointbuy")}
              />
              Покупка очков (27 очков)
            </label>
            <label>
              <input
                type="radio"
                checked={method === "manual"}
                onChange={() => selectAbilityMethod("manual")}
              />
              Ручной ввод (бросок кубиков или свои числа)
            </label>
          </div>

          {method === "pointbuy" && (
            <p className="wizard__hint">
              Потрачено {pointsSpent} из {POINT_BUY_BUDGET} очков.
            </p>
          )}

          {method === "manual" && (
            <div className="wizard__roll">
              <p className="wizard__hint">
                Правило: брось четыре к6 и убери наименьший кубик — оставшиеся три сложи, получится
                число от 3 до 18. Повтори шесть раз, по одному числу на характеристику, и впиши суммы
                в поля ниже. Либо нажми «Бросить кубики» — движок сделает это сам, а число всё равно
                можно поправить вручную.
              </p>
              <button type="button" onClick={rollAbilityScores} disabled={rolling} data-own-sound>
                {rolling ? "Бросаю…" : abilityRolls ? "Перебросить" : "Бросить кубики"}
              </button>
              {abilityRolls && (
                <p className="wizard__hint">
                  Выпало (кубик в скобках — отброшен):{" "}
                  {abilityRolls
                    .map(
                      (r) =>
                        `${r.total} (${r.dice
                          .map((d, i) => (i === r.droppedIndex ? `[${d}]` : String(d)))
                          .join(", ")})`,
                    )
                    .join("; ")}
                </p>
              )}
            </div>
          )}

          {race && !raceBonus && (
            <p className="wizard__hint">
              Для расы «{race.title}» бонусы к характеристикам ещё не занесены — прибавь их сама(сам) по
              тексту расы с первого шага.
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
                  const choice = equipmentChoiceFor(item);
                  if (!choice) return null;
                  const key = `${i}:${itemIndex}`;
                  const picks = equipmentPicks[key] ?? [];
                  return (
                    <div key={itemIndex} className="wizard__weapon-choice">
                      {Array.from({ length: choice.count }).map((_, pickIdx) => (
                        <select
                          key={pickIdx}
                          className="wizard__weapon-select"
                          value={picks[pickIdx] ?? choice.options[0]?.name ?? ""}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setEquipmentPicks((prev) => {
                              const nextPicks = [...(prev[key] ?? [])];
                              nextPicks[pickIdx] = value;
                              return { ...prev, [key]: nextPicks };
                            });
                          }}
                        >
                          {choice.options.map((opt) => (
                            <option key={opt.name} value={opt.name}>
                              {opt.name} ({opt.detail})
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
          <div className="wizard__name-row">
            <input
              className="wizard__name-input"
              placeholder="Имя персонажа"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <button type="button" className="wizard__suggest-name" onClick={suggestName}>
              🎲 Предложить имя
            </button>
          </div>
          <label className="wizard__hint">
            Мировоззрение:{" "}
            <select value={alignment} onChange={(e) => setAlignment(e.currentTarget.value)}>
              {ALIGNMENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          {alignment && <p className="wizard__hint">{ALIGNMENT_DESCRIPTIONS[alignment]}</p>}
          <label className="wizard__hint">
            Пол:{" "}
            <select value={gender} onChange={(e) => setGender(e.currentTarget.value as (typeof GENDERS)[number])}>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="wizard__hint">
            Возраст (до {AGE_LIMIT} лет):{" "}
            <input
              className={ageLimitHit ? "character-card__danger" : undefined}
              type="number"
              max={AGE_LIMIT}
              value={age === 0 ? "" : age}
              onChange={(e) => {
                const raw = e.currentTarget.value;
                const requested = raw === "" ? 0 : Number(raw) || 0;
                const overLimit = requested > AGE_LIMIT;
                setAgeLimitHit(overLimit);
                if (overLimit) playLimitSound();
                const value = Math.min(AGE_LIMIT, requested);
                setAge(value);
              }}
            />
          </label>
          <div className="wizard__traits">
            <label className="wizard__hint">
              Черты характера
              <textarea
                rows={3}
                value={personalityTraits}
                onChange={(e) => setPersonalityTraits(e.currentTarget.value)}
              />
            </label>
            <label className="wizard__hint">
              Идеалы
              <textarea rows={3} value={ideals} onChange={(e) => setIdeals(e.currentTarget.value)} />
            </label>
            <label className="wizard__hint">
              Привязанности
              <textarea rows={3} value={bonds} onChange={(e) => setBonds(e.currentTarget.value)} />
            </label>
            <label className="wizard__hint">
              Слабости
              <textarea rows={3} value={flaws} onChange={(e) => setFlaws(e.currentTarget.value)} />
            </label>
          </div>
          <ul className="wizard__summary">
            <li>Раса: {race?.title ?? "не выбрана"}</li>
            <li>Класс: {klass?.title ?? "не выбран"}{hitDie ? ` (кость хитов 1к${hitDie})` : ""}</li>
            {level1Subclass && (
              <li>
                Архетип:{" "}
                {subclassInfo && subclassInfo.subclasses.length > 1 ? (
                  <select
                    aria-label="Архетип"
                    value={chosenSubclassIndex}
                    onChange={(e) => setChosenSubclassIndex(Number(e.currentTarget.value))}
                  >
                    {subclassInfo.subclasses.map((s, i) => (
                      <option key={s.name} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong>{level1Subclass.name}</strong>
                )}
                {level1Subclass.description && <p className="wizard__hint">{level1Subclass.description}</p>}
                <ul className="wizard__traits">
                  {(level1Subclass.featuresByLevel[1] ?? []).map((f) => (
                    <li key={f.name}>
                      <strong>{f.name}</strong> — {f.description}
                    </li>
                  ))}
                </ul>
                {level1SubclassSpells.length > 0 && (
                  <p className="wizard__hint">
                    Заклинания архетипа (всегда подготовлены):{" "}
                    {level1SubclassSpells.map((id) => spells.find((sp) => sp.id === id)?.name ?? id).join(", ")}
                  </p>
                )}
              </li>
            )}
            <li>Предыстория: {background?.title ?? "не выбрана"}</li>
            <li>Языки: {finalLanguages.join(", ") || "—"}</li>
            <li>
              HP: {Math.max(1, (hitDie ?? 8) + abilityMod(totalAbilities.constitution) + raceHpBonus)} · КД:{" "}
              {armorClass}
            </li>
            <li>
              Скорость: {speedFeet} фт · Инициатива: {fmtMod(initiative)} · Пассивная внимательность:{" "}
              {passivePerception}
            </li>
            <li>
              Деньги:
              <div className="wizard__coins">
                {COIN_DENOMINATIONS.map((denomination) => (
                  <span key={denomination.key} className="wizard__coin-row">
                    <CoinIcon denomination={denomination} />
                    <span className="wizard__coin-count">{coins[denomination.key]}</span>
                  </span>
                ))}
              </div>
            </li>
            {ABILITY_LABELS.map(([key, label]) => (
              <li key={key}>
                {label}: {totalAbilities[key]} ({fmtMod(abilityMod(totalAbilities[key]))})
                {racialBonusFor(key) > 0 && (
                  <span className="wizard__ability-bonus"> — включая бонус расы +{racialBonusFor(key)}</span>
                )}
              </li>
            ))}
            <li>
              Спасброски:
              {classProf ? (
                <ul className="wizard__skill-list">
                  {ABILITY_LABELS.map(([key, label]) => {
                    const proficient = classProf.savingThrows.includes(key);
                    const mod = abilityMod(totalAbilities[key]) + (proficient ? PROFICIENCY_BONUS_LEVEL_1 : 0);
                    return (
                      <li key={key}>
                        {label}: {fmtMod(mod)}
                        {proficient && " (владение)"}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                " —"
              )}
            </li>
            <li>
              Навыки:
              <p className="wizard__hint">{PROFICIENCY_BONUS_HINT}</p>
              <ul className="wizard__skill-list">
                {ALL_SKILLS.map((skill) => {
                  const proficient = allSkillProficiencies.includes(skill);
                  const abilityKey = SKILL_ABILITY[skill];
                  const mod = abilityMod(totalAbilities[abilityKey]) + (proficient ? PROFICIENCY_BONUS_LEVEL_1 : 0);
                  return (
                    <li key={skill} className="typography-term-line">
                      {skill}: {fmtMod(mod)}
                      {proficient && " (владение)"}
                    </li>
                  );
                })}
              </ul>
            </li>
            <li>
              <strong>Снаряжение:</strong>{" "}
              {inventoryItems.length > 0
                ? inventoryItems.map((item, index) => (
                    <Fragment key={`${item}-${index}`}>
                      {index > 0 ? ", " : ""}{item}
                    </Fragment>
                  ))
                : "—"}
            </li>
            {displayedRaceTraits.length > 0 && (
              <li>
                Расовые особенности:
                <ul className="wizard__traits">
                  {displayedRaceTraits.map((t) => (
                    <li key={t.name}>
                      <strong>{t.name}</strong> — {t.description}
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {fighterFightingStyles.length > 0 && (
              <li>
                Боевой стиль:{" "}
                <strong>{fightingStyle || fighterFightingStyles[0].name}</strong> —{" "}
                {
                  fighterFightingStyles.find((s) => s.name === (fightingStyle || fighterFightingStyles[0].name))
                    ?.description
                }
              </li>
            )}
            {background?.feature && (
              <li>
                Особенность предыстории:{" "}
                {(() => {
                  const [featureName, ...rest] = background.feature.split(":");
                  const featureDescription = rest.join(":").trim();
                  return (
                    <>
                      <strong>{featureName}</strong> — {featureDescription}
                    </>
                  );
                })()}
              </li>
            )}
            {isRanger && (
              <li>
                Избранный враг: {favoredEnemy || RANGER_FAVORED_ENEMIES[0]} · Известная местность:{" "}
                {rangerTerrain || RANGER_TERRAIN_TYPES[0]}
              </li>
            )}
            {isMonk && <li>Владение инструментами: {finalMonkTool}</li>}
            {isBard && <li>Владение музыкальными инструментами: {bardInstruments.join(", ")}</li>}
            {spellAbility && (
              <li>
                Заклинания: класс «{klass?.title}» владеет заклинаниями (заклинательная характеристика —{" "}
                {spellAbility}).
                <div className="wizard__spell-picker">
                  <p className="wizard__hint">
                    Заговоры ({knownCantrips.length}/{requiredCantrips}):
                  </p>
                  <ul className="wizard__traits">
                    {classCantrips.map((sp) => (
                      <li key={sp.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={knownCantrips.includes(sp.id)}
                            disabled={!knownCantrips.includes(sp.id) && knownCantrips.length >= requiredCantrips}
                            onChange={() => toggleCantrip(sp.id)}
                          />{" "}
                          {sp.name}
                        </label>
                      </li>
                    ))}
                    {classCantrips.length === 0 && <li>Загрузка списка заговоров…</li>}
                  </ul>
                  <p className="wizard__hint">
                    Заклинания 1 уровня ({knownSpells.length}/{requiredSpells}):
                  </p>
                  <ul className="wizard__traits">
                    {classLevel1Spells.map((sp) => (
                      <li key={sp.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={knownSpells.includes(sp.id)}
                            disabled={!knownSpells.includes(sp.id) && knownSpells.length >= requiredSpells}
                            onChange={() => toggleKnownSpell(sp.id)}
                          />{" "}
                          {sp.name}
                        </label>
                      </li>
                    ))}
                    {classLevel1Spells.length === 0 && <li>Загрузка списка заклинаний…</li>}
                  </ul>
                  <p className="wizard__hint">Ячейки заклинаний 1 уровня: {level1SpellSlots[0]}</p>
                </div>
              </li>
            )}
          </ul>
          <button className="dm-button--primary" disabled={!!reviewMissing} onClick={finish}>
            Создать персонажа
          </button>
          {reviewMissing && <p className="wizard__hint wizard__step-warning">{reviewMissing}</p>}
        </div>
      )}

      <div className="wizard__nav">
        {stepIndex > 0 && <button onClick={() => setStep(STEPS[stepIndex - 1])}>Назад</button>}
        {step !== "review" && (
          <button className="dm-button--primary" disabled={!canGoNext} onClick={() => setStep(STEPS[stepIndex + 1])}>
            Далее
          </button>
        )}
        {stepMissing && <p className="wizard__hint wizard__step-warning">{stepMissing}</p>}
      </div>
    </div>
  );
}
