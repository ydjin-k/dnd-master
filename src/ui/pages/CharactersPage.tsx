import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import {
  ABILITY_LABELS,
  ALL_ITEM_NAMES,
  ALL_SKILLS,
  canLevelUp,
  carryingCapacityLb,
  catalogWeightLb,
  CLASS_LEVEL_FEATURES,
  CLASS_SUBCLASSES,
  COIN_DENOMINATIONS,
  coinsWeightLb,
  CONDITIONS,
  ENCUMBRANCE_LABELS,
  encumbranceLevel,
  encumbranceSpeedPenaltyFeet,
  HEALING_POTIONS,
  HEAVILY_ENCUMBERED_DISADVANTAGE_HINT,
  inventoryWeightLb,
  RACE_HP_BONUS,
  SKILL_ABILITY,
  ARMOR_PROFICIENCY_LABELS,
  UNPROFICIENT_ARMOR_HINT,
  abilityMod,
  armorProficienciesFor,
  coinsTotalGold,
  computeArmorClass,
  effectiveSubclassGrants,
  fmtMod,
  healingPoolSelfHeal,
  maxHpForLevel,
  parseHitDie,
  parseHitDieAverage,
  proficiencyBonusForLevel,
  proficiencyBonusHint,
  subclassEffectValue,
  subclassGrants,
  subclassResourceOptionsAt,
  subclassScalingAt,
  subclassSpellsUpToLevel,
  toggleChoiceSelection,
  toolProficienciesFor,
  unproficientArmorIssue,
  weaponAttackFor,
  weaponProficienciesFor,
  weaponsInInventory,
  xpNeededForNextLevel,
  type AbilityKey,
  type ArmorProficiency,
  type ClassLevelFeature,
  type SubclassChoice,
  type SubclassResourceOption,
} from "../characterCreationData";
import {
  CLASS_PROGRESSION,
  characterResources,
  highestSpellCircle,
  progressionAt,
  resourceMax,
  spellSlotsForLevel,
  type ClassResource,
} from "../classProgression";
import type { AbilityScores, Character, Coins, RuleTopic, Spell } from "../../state/types";
import { CharacterWizard } from "../CharacterWizard";
import { characterFromPreset, presetSubtitle, type CharacterPreset } from "../characterPresets";
import { CoinIcon } from "../CoinIcon";
import { playCoinsSound, playLevelUpSound, playLimitSound, playSpellCastSound } from "../../audio/uiSounds";
import "./CharactersPage.css";

type Panel = "none" | "wizard" | "presets";

/** Левелинг в приложении пока ограничен уровнями 1-5 (см. tasks/open/characters-leveling-1-5.md). */
const MAX_LEVEL = 5;

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

/**
 * Обрезает до последнего конца предложения (./!/?) в пределах `max` символов — без «…», раз
 * предложение и так закончено. Если в пределах `max` конца предложения нет (первое предложение
 * длиннее лимита), обрезает по границе последнего слова и добавляет «…».
 */
export function truncateDescription(text: string, max = 90): string {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const lastSentenceEnd = Math.max(window.lastIndexOf("."), window.lastIndexOf("!"), window.lastIndexOf("?"));
  if (lastSentenceEnd !== -1) return window.slice(0, lastSentenceEnd + 1);
  const lastSpace = window.lastIndexOf(" ");
  const cut = lastSpace === -1 ? window : window.slice(0, lastSpace);
  return `${cut.trimEnd()}…`;
}

/**
 * Блок «Особенности класса» обязан открыться, если ЛЮБОЙ из этих грантов есть
 * что показать — не только текстовые `classFeatures`/`classResources`/
 * `classScaling`. Раньше условие проверяло только эти три, и архетип, дающий
 * только `domainSpells`/`subclassScaling`/`resourceOptions`/`bonusCantrips`/
 * `damageResistances`/`healingBonus` без единой текстовой особенности на этом
 * уровне, оставался невидимым целиком (characters-card-missing-subclass-and-
 * class-choice-info, находка 2).
 */
export function classFeaturesBlockHasContent(args: {
  classFeatures: unknown[];
  classResources: unknown[];
  classScaling: unknown[];
  subclassOptions: unknown[];
  subclassScaling: unknown[];
  domainSpells: unknown[];
  bonusCantrips: unknown;
  damageResistances?: unknown[];
  healingBonus: unknown;
}): boolean {
  return (
    args.classFeatures.length > 0 ||
    args.classResources.length > 0 ||
    args.classScaling.length > 0 ||
    args.subclassOptions.length > 0 ||
    args.subclassScaling.length > 0 ||
    args.domainSpells.length > 0 ||
    !!args.bonusCantrips ||
    !!args.damageResistances?.length ||
    !!args.healingBonus
  );
}

function CharacterCard({
  character: c,
  spells,
  conditionEffects,
  classHitDiceByTitle,
  raceHpBonusByTitle,
  onRemove,
  onUpdate,
}: {
  character: Character;
  spells: Spell[];
  conditionEffects: Record<string, string[]>;
  classHitDiceByTitle: Record<string, { id: string; max: number; average: number }>;
  raceHpBonusByTitle: Record<string, number>;
  onRemove: () => void;
  onUpdate: (updater: (character: Character) => Character) => void;
}) {
  const [newItemName, setNewItemName] = useState("");
  const [newCondition, setNewCondition] = useState("");
  const [xpInput, setXpInput] = useState("");
  const [asiPanelOpen, setAsiPanelOpen] = useState(false);
  const [asiMode, setAsiMode] = useState<"plus2" | "plus1plus1">("plus2");
  const [asiKeys, setAsiKeys] = useState<AbilityKey[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [subclassPanelOpen, setSubclassPanelOpen] = useState(false);
  const [subclassChoiceIndex, setSubclassChoiceIndex] = useState(0);
  // Выбор внутри архетипа (Добыча охотника и т.п.) — третья ветка того же
  // прерывания левел-апа, что и выбор архетипа/ASI выше (см. requestLevelUp).
  const [pendingChoice, setPendingChoice] = useState<SubclassChoice | null>(null);
  const [pendingChoiceSubclassName, setPendingChoiceSubclassName] = useState<string | undefined>(undefined);
  const [choiceSelections, setChoiceSelections] = useState<string[]>([]);
  const [chosenCantrips, setChosenCantrips] = useState<string[]>([]);
  const [chosenSpells, setChosenSpells] = useState<string[]>([]);

  /** `Character.class` хранит заголовок класса, id ищем через ту же карту, что и кость хитов. */
  const classId = classHitDiceByTitle[c.class]?.id;

  /**
   * Владения доспехами/оружием персонаж хранит снимком (как и владения
   * спасбросками), но у персонажей, сохранённых до появления этих полей, снимка
   * ещё нет — тогда берём его прямо из таблиц класса и архетипа, тем же
   * правилом, что и у счётчика ресурсов ниже.
   */
  const armorProficiencies =
    c.armorProficiencies.length > 0 ? c.armorProficiencies : armorProficienciesFor(classId, c.subclass, c.subclassChoices);
  const weaponProficiencies =
    c.weaponProficiencies.length > 0
      ? c.weaponProficiencies
      : weaponProficienciesFor(classId, c.subclass, c.subclassChoices);
  const toolProficiencies =
    c.toolProficiencies.length > 0 ? c.toolProficiencies : toolProficienciesFor(classId, c.subclass, c.subclassChoices);

  /**
   * КД пересчитывается по инвентарю при каждом его изменении — единственный
   * владелец формулы — `computeArmorClass`, поле `armorClass` персонажа только
   * хранит её последний результат.
   */
  function withRecomputedArmorClass(ch: Character): Character {
    if (!classId) return ch;
    return {
      ...ch,
      armorClass: computeArmorClass({
        classId,
        subclassName: ch.subclass,
        abilities: ch.abilities,
        inventoryItemNames: ch.inventory.map((item) => item.name),
        fightingStyle: ch.fightingStyle || undefined,
      }),
    };
  }

  function adjustCoin(key: keyof Coins, delta: number) {
    if (delta < 0 && c.coins[key] === 0) return;
    playCoinsSound();
    onUpdate((ch) => ({ ...ch, coins: { ...ch.coins, [key]: Math.max(0, ch.coins[key] + delta) } }));
  }

  function adjustItemQuantity(itemId: string, delta: number) {
    onUpdate((ch) =>
      withRecomputedArmorClass({
        ...ch,
        inventory: ch.inventory
          .map((item) => (item.id === itemId ? { ...item, quantity: item.quantity + delta } : item))
          .filter((item) => item.quantity > 0),
      }),
    );
  }

  function removeItem(itemId: string) {
    onUpdate((ch) =>
      withRecomputedArmorClass({ ...ch, inventory: ch.inventory.filter((item) => item.id !== itemId) }),
    );
  }

  function addItem() {
    const name = newItemName.trim();
    if (!name) return;
    onUpdate((ch) =>
      withRecomputedArmorClass({
        ...ch,
        inventory: [
          ...ch.inventory,
          { id: crypto.randomUUID(), name, quantity: 1, notes: "", weightLb: catalogWeightLb(name) },
        ],
      }),
    );
    setNewItemName("");
  }

  function addExperience() {
    const amount = Number(xpInput);
    if (!Number.isFinite(amount) || amount <= 0) return;
    onUpdate((ch) => ({ ...ch, experiencePoints: ch.experiencePoints + amount }));
    setXpInput("");
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

  function restoreSpellSlots() {
    onUpdate((ch) => ({ ...ch, spellSlotsCurrent: [...ch.spellSlotsMax] }));
  }

  /** SRD: заклинание творится ячейкой своего круга или любого старшего — тратим наименьшую подходящую. */
  function freeSlotIndex(slots: number[], circle: number): number {
    return slots.findIndex((free, i) => i >= circle - 1 && free > 0);
  }

  function useSpellSlot(circle: number) {
    const index = freeSlotIndex(c.spellSlotsCurrent, circle);
    if (index === -1) {
      playLimitSound();
      return;
    }
    playSpellCastSound();
    onUpdate((ch) => ({
      ...ch,
      spellSlotsCurrent: ch.spellSlotsCurrent.map((free, i) => (i === index ? Math.max(0, free - 1) : free)),
    }));
  }

  function resourceCurrent(resource: ClassResource): number {
    const stored = c.featureUses.find((u) => u.featureId === resource.id);
    const max = resourceMax(resource, c.abilities);
    // Максимум владеет таблица прогрессии: у персонажа, сохранённого до этой
    // карточки, счётчика ещё нет — показываем полный запас, а не ноль.
    return stored ? Math.min(max, Math.max(0, stored.usesCurrent)) : max;
  }

  function setResourceCurrent(resource: ClassResource, value: number) {
    onUpdate((ch) => {
      const rest = ch.featureUses.filter((u) => u.featureId !== resource.id);
      return { ...ch, featureUses: [...rest, { featureId: resource.id, usesCurrent: value }] };
    });
  }

  function spendResource(resource: ClassResource) {
    const current = resourceCurrent(resource);
    if (current <= 0) {
      playLimitSound();
      return;
    }
    setResourceCurrent(resource, current - 1);
  }

  function restoreResource(resource: ClassResource) {
    setResourceCurrent(resource, resourceMax(resource, c.abilities));
  }

  /**
   * Применение варианта архетипа: тратит использование ТОГО ЖЕ классового
   * ресурса (второго счётчика у архетипа нет) и применяет к персонажу то, что
   * вариант действительно меняет в его состоянии. «Сохранение жизни» лечит
   * самого жреца из запаса, не поднимая выше половины максимума хитов;
   * «Неутомимый шаг» возвращает потраченную ячейку заклинаний; у остальных
   * вариантов цель — союзник или враг, так что на листе владельца меняется
   * только счётчик, а посчитанное число видно на кнопке.
   */
  function applySubclassOption(option: SubclassResourceOption) {
    const resource = classResources.find((r) => r.id === option.resourceId);
    if (!resource) return;
    const cost = option.cost ?? 1;
    const current = resourceCurrent(resource);
    if (current < cost) {
      playLimitSound();
      return;
    }
    const selfHeal =
      option.effect.kind === "healing-pool"
        ? healingPoolSelfHeal(option.effect.perLevel * c.level, c.currentHp, c.maxHp)
        : 0;
    if (option.effect.kind === "healing-pool" && selfHeal === 0) {
      playLimitSound();
      return;
    }
    // Ячейку некуда возвращать, если ни одной этого круга не потрачено.
    const restoredCircle = option.effect.kind === "restore-slot" ? option.effect.circle : 0;
    if (restoredCircle > 0 && c.spellSlotsCurrent[restoredCircle - 1] >= (c.spellSlotsMax[restoredCircle - 1] ?? 0)) {
      playLimitSound();
      return;
    }
    onUpdate((ch) => {
      const rest = ch.featureUses.filter((u) => u.featureId !== resource.id);
      return {
        ...ch,
        currentHp: Math.min(ch.maxHp, ch.currentHp + selfHeal),
        spellSlotsCurrent: ch.spellSlotsCurrent.map((free, i) =>
          i === restoredCircle - 1 ? Math.min(ch.spellSlotsMax[i] ?? 0, free + 1) : free,
        ),
        featureUses: [...rest, { featureId: resource.id, usesCurrent: current - cost }],
      };
    });
  }

  /**
   * Имя архетипа, действующее ПОСЛЕ этого левел-апа — при единственном
   * варианте (SRD) назначается автоматически, при нескольких приходит из
   * confirmSubclass. Единственный владелец правила: и requestLevelUp (чтобы
   * проверить, не появился ли ещё не сделанный `choice` архетипа), и
   * applyLevelUp читают отсюда, а не считают то же самое дважды.
   */
  function subclassNameAfterLevelUp(newLevel: number, chosenSubclassName?: string): string {
    const dice = classHitDiceByTitle[c.class];
    const subclassInfo = dice ? CLASS_SUBCLASSES[dice.id] : undefined;
    const grantedSubclass =
      subclassInfo && !c.subclass && newLevel >= subclassInfo.chosenAtLevel
        ? (chosenSubclassName ?? subclassInfo.subclasses[0]?.name)
        : undefined;
    return grantedSubclass ?? c.subclass;
  }

  /** Ещё не сделанный выбор архетипа (SubclassChoice), открывающийся на этом уровне. */
  function pendingChoiceFor(subclassName: string | undefined, newLevel: number): SubclassChoice | undefined {
    return subclassGrants(classId, subclassName)?.choices?.find(
      (choice) => choice.minLevel <= newLevel && !(c.subclassChoices[choice.id]?.length),
    );
  }

  /**
   * Левел-ап: level+1, maxHp пересчитывается полностью по формуле (не
   * инкрементально) — см. maxHpForLevel и «Архитектурное решение» в карточке
   * characters-leveling-1-5. currentHp растёт на ту же прибавку (левел-ап
   * лечит, стандартное правило SRD). Принимает abilities явно — на 4 уровне
   * они уже включают выбор улучшения характеристик (ASI), см. confirmAsi.
   * `newSubclassChoices` — выбор внутри архетипа, сделанный на этом же
   * левел-апе (см. confirmChoice), подмешивается в снимок владений/заклинаний
   * так же, как и сам архетип.
   */
  function applyLevelUp(
    abilities: AbilityScores,
    chosenSubclassName?: string,
    newSubclassChoices?: Record<string, string[]>,
  ) {
    const newLevel = c.level + 1;
    const dice = classHitDiceByTitle[c.class];
    const conMod = abilityMod(abilities.constitution);
    const raceBonus = raceHpBonusByTitle[c.race] ?? 0;
    const newMaxHp = dice
      ? maxHpForLevel(dice.max, dice.average, conMod, raceBonus, newLevel)
      : c.maxHp;
    const hpGained = Math.max(0, newMaxHp - c.maxHp);
    // Прогрессия по таблице класса: ячейки заклинаний по кругам и классовые
    // ресурсы с ограниченным числом использований (classProgression.ts).
    // Прибавка идёт и в максимум, и в текущий запас — тем же правилом, что
    // уже применяется к хитам выше: новый уровень даёт новые ресурсы сразу.
    const newSlotsMax = spellSlotsForLevel(dice?.id, newLevel);
    // Архетип, действующий после этого левел-апа: ресурсы, владения и
    // заклинания домена считаются уже по нему, а не по прежнему пустому.
    const subclassName = subclassNameAfterLevelUp(newLevel, chosenSubclassName);
    const newResources = characterResources(dice?.id, subclassName, newLevel);
    const oldResources = characterResources(dice?.id, c.subclass, c.level);
    onUpdate((ch) => {
      // Полный набор выбора внутри архетипа: то, что уже было сохранено,
      // плюс выбор, сделанный этим же левел-апом (если был).
      const allSubclassChoices = newSubclassChoices
        ? { ...ch.subclassChoices, ...newSubclassChoices }
        : ch.subclassChoices;
      const effectiveGrants = effectiveSubclassGrants(dice?.id, subclassName, allSubclassChoices);
      return withRecomputedArmorClass({
        ...ch,
        level: newLevel,
        abilities,
        maxHp: newMaxHp,
        currentHp: Math.min(newMaxHp, ch.currentHp + hpGained),
        subclass: subclassName,
        subclassChoices: allSubclassChoices,
        // Архетип может давать владения, навык и всегда подготовленные заклинания
        // домена — на левел-апе они появляются вместе с ним (и с выбранным
        // вариантом, если он есть). Слияние, а не замена: таблицы класса и
        // архетипа — не единственный источник владений (мастер кладёт сюда
        // инструменты дварфа, барда и монаха, лист пресета — свои топоры и
        // ремесленные наборы), а левел-ап владений не отнимает, поэтому
        // прежний список сохраняется целиком — тем же приёмом, что у навыков
        // и заклинаний ниже.
        armorProficiencies: [
          ...new Set([...ch.armorProficiencies, ...armorProficienciesFor(dice?.id, subclassName, allSubclassChoices)]),
        ],
        weaponProficiencies: [
          ...new Set([...ch.weaponProficiencies, ...weaponProficienciesFor(dice?.id, subclassName, allSubclassChoices)]),
        ],
        toolProficiencies: [
          ...new Set([...ch.toolProficiencies, ...toolProficienciesFor(dice?.id, subclassName, allSubclassChoices)]),
        ],
        skillProficiencies: [...new Set([...ch.skillProficiencies, ...(effectiveGrants?.skills ?? [])])],
        knownSpells: [
          ...new Set([...ch.knownSpells, ...subclassSpellsUpToLevel(dice?.id, subclassName, newLevel, allSubclassChoices)]),
        ],
        spellSlotsMax: newSlotsMax,
        spellSlotsCurrent: newSlotsMax.map((max, i) => {
          const gained = Math.max(0, max - (ch.spellSlotsMax[i] ?? 0));
          return Math.min(max, (ch.spellSlotsCurrent[i] ?? 0) + gained);
        }),
        featureUses: newResources.map((resource) => {
          const max = resourceMax(resource, abilities);
          // Прежний максимум — по прежним характеристикам: улучшение на 4 уровне
          // поднимает Вдохновение барда/Божественное чувство, и эта прибавка
          // должна дойти до текущего запаса, а не потеряться.
          const before = oldResources.find((r) => r.id === resource.id);
          const previousMax = before ? resourceMax(before, c.abilities) : 0;
          const stored = ch.featureUses.find((u) => u.featureId === resource.id);
          const current = stored ? Math.min(previousMax, Math.max(0, stored.usesCurrent)) : previousMax;
          return { featureId: resource.id, usesCurrent: Math.min(max, current + (max - previousMax)) };
        }),
      });
    });
    playLevelUpSound();
  }

  /**
   * На 4 уровне левел-ап не мгновенный — сперва открывает выбор ASI (см.
   * confirmAsi). На уровне выбора архетипа (chosenAtLevel), если вариантов
   * больше одного, сперва открывает выбор архетипа (см. confirmSubclass).
   * Третья ветка того же прерывания: если у архетипа (уже известного или
   * только что назначенного этим же левел-апом) на новом уровне есть ещё не
   * сделанный `choice` (Добыча охотника и т.п.), сперва открывает его панель
   * (см. confirmChoice). Ни одна пара веток не совпадает уровнем ни у одного
   * ПОДКЛЮЧЁННОГО случая, но само прерывание рассчитано на совпадение: если
   * бы совпало, выбор архетипа заканчивается раньше и обнаруживает choice
   * следующим шагом, а не одновременно с ним.
   */
  function requestLevelUp() {
    if (c.level >= MAX_LEVEL) return;
    if (!canLevelUp(c.level, c.experiencePoints)) {
      playLimitSound();
      return;
    }
    const newLevel = c.level + 1;
    const dice = classHitDiceByTitle[c.class];
    const subclassInfo = dice ? CLASS_SUBCLASSES[dice.id] : undefined;
    if (subclassInfo && !c.subclass && newLevel >= subclassInfo.chosenAtLevel && subclassInfo.subclasses.length > 1) {
      setSubclassChoiceIndex(0);
      setSubclassPanelOpen(true);
      return;
    }
    const grantedSubclassName = subclassNameAfterLevelUp(newLevel);
    const choice = pendingChoiceFor(grantedSubclassName, newLevel);
    if (choice) {
      openChoicePanel(choice, grantedSubclassName);
      return;
    }
    if (newLevel === 4) {
      setAsiMode("plus2");
      setAsiKeys([]);
      setAsiPanelOpen(true);
      return;
    }
    applyLevelUp(c.abilities);
  }

  const levelUpDice = subclassPanelOpen ? classHitDiceByTitle[c.class] : undefined;
  const levelUpSubclassInfo = levelUpDice ? CLASS_SUBCLASSES[levelUpDice.id] : undefined;

  function confirmSubclass() {
    const chosen = levelUpSubclassInfo?.subclasses[subclassChoiceIndex]?.name;
    if (!chosen) return;
    setSubclassPanelOpen(false);
    const choice = pendingChoiceFor(chosen, c.level + 1);
    if (choice) {
      openChoicePanel(choice, chosen);
      return;
    }
    applyLevelUp(c.abilities, chosen);
  }

  function openChoicePanel(choice: SubclassChoice, subclassName?: string) {
    setPendingChoice(choice);
    setPendingChoiceSubclassName(subclassName);
    setChoiceSelections([]);
  }

  function toggleChoiceOption(optionId: string) {
    if (!pendingChoice) return;
    setChoiceSelections((prev) => toggleChoiceSelection(prev, optionId, pendingChoice.pick));
  }

  function confirmChoice() {
    if (!pendingChoice || choiceSelections.length !== pendingChoice.pick) return;
    applyLevelUp(c.abilities, pendingChoiceSubclassName, { [pendingChoice.id]: choiceSelections });
    setPendingChoice(null);
    setPendingChoiceSubclassName(undefined);
    setChoiceSelections([]);
  }

  function cancelChoice() {
    setPendingChoice(null);
    setPendingChoiceSubclassName(undefined);
    setChoiceSelections([]);
  }

  function setAsiModeAndReset(mode: "plus2" | "plus1plus1") {
    setAsiMode(mode);
    setAsiKeys([]);
  }

  function toggleAsiKey(key: AbilityKey) {
    if (c.abilities[key] >= 20) return;
    setAsiKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (asiMode === "plus2") return [key];
      if (prev.length >= 2) return prev;
      return [...prev, key];
    });
  }

  const asiReady = asiMode === "plus2" ? asiKeys.length === 1 : asiKeys.length === 2;

  /**
   * Улучшение характеристик на 4 уровне (rules.json → character-beyond-1-level):
   * либо +2 одной характеристике, либо +1 двум разным, потолок 20.
   */
  function confirmAsi() {
    if (!asiReady) return;
    const abilities = { ...c.abilities };
    const bump = asiMode === "plus2" ? 2 : 1;
    for (const key of asiKeys) abilities[key] = Math.min(20, abilities[key] + bump);
    applyLevelUp(abilities);
    setAsiPanelOpen(false);
  }

  /**
   * Классовые особенности уровней 2..текущий (CLASS_LEVEL_FEATURES) + особенности
   * подкласса уровней 1..текущий, если подкласс уже выбран (CLASS_SUBCLASSES).
   */
  const classFeatures: ClassLevelFeature[] = [];
  if (classId) {
    for (let lvl = 2; lvl <= c.level; lvl++) {
      classFeatures.push(...(CLASS_LEVEL_FEATURES[classId]?.[lvl] ?? []));
    }
    const subclass = CLASS_SUBCLASSES[classId]?.subclasses.find((s) => s.name === c.subclass);
    if (subclass) {
      for (let lvl = 1; lvl <= c.level; lvl++) {
        classFeatures.push(...(subclass.featuresByLevel[lvl] ?? []));
      }
    }
  }

  /**
   * Строка таблицы прогрессии на текущем уровне: сколько ячеек по кругам,
   * заговоров и известных заклинаний класс обязан иметь (classProgression.ts).
   * Недобор считается прямо из неё, а не хранится отдельным флагом — тогда он
   * виден и после отмены выбора на левел-апе, и у персонажей, сохранённых до
   * появления прогрессии.
   */
  const progression = progressionAt(classId, c.level);
  const grants = effectiveSubclassGrants(classId, c.subclass, c.subclassChoices);
  const spellsKnownKind = classId ? CLASS_PROGRESSION[classId]?.spellsKnownKind : undefined;
  const highestCircle = highestSpellCircle(classId, c.level);
  // Архетип может добавить заговоры сверх нормы класса (Круг земли, Круг звёзд,
  // Мистический ловкач) — норма растёт вместе с ним, иначе недобор не виден.
  const cantripsNorm = (progression?.cantripsKnown ?? 0) + (grants?.bonusCantrips?.count ?? 0);
  const missingCantrips = Math.max(0, cantripsNorm - c.knownCantrips.length);
  const missingSpells =
    spellsKnownKind === "known" ? Math.max(0, (progression?.spellsKnown ?? 0) - c.knownSpells.length) : 0;
  // Ресурсы класса и архетипа с общим счётчиком (classProgression.ts).
  const classResources = characterResources(classId, c.subclass, c.level);
  const classScaling = progression?.scaling ?? [];
  const subclassOptions = subclassResourceOptionsAt(classId, c.subclass, c.level, c.subclassChoices).filter((option) =>
    classResources.some((r) => r.id === option.resourceId),
  );
  const subclassScaling = subclassScalingAt(classId, c.subclass, c.level, c.subclassChoices);
  const domainSpells = subclassSpellsUpToLevel(classId, c.subclass, c.level, c.subclassChoices);
  const armorIssue = unproficientArmorIssue(c.inventory.map((item) => item.name), armorProficiencies);
  const weaponAttacks = weaponsInInventory(c.inventory.map((item) => item.name)).map((weapon) =>
    weaponAttackFor(weapon, c.abilities, c.level, weaponProficiencies),
  );
  const healingBonus = grants?.healingBonus;
  const isSpellcaster =
    c.knownCantrips.length > 0 || c.knownSpells.length > 0 || highestCircle > 0 || missingCantrips > 0;

  // Заговоры своего класса плюс чужой список, если архетип открывает именно его
  // (Мистический ловкач учит заговоры волшебника, своих у плута нет вовсе).
  const cantripClassIds = classId
    ? [classId, ...(grants?.bonusCantrips?.fromClassId ? [grants.bonusCantrips.fromClassId] : [])]
    : [];
  const bonusCantripClassTitle = Object.entries(classHitDiceByTitle).find(
    ([, dice]) => dice.id === grants?.bonusCantrips?.fromClassId,
  )?.[0];
  const learnableCantrips = spells.filter(
    (sp) => sp.level === 0 && sp.classes.some((id) => cantripClassIds.includes(id)) && !c.knownCantrips.includes(sp.id),
  );
  const learnableSpells = classId
    ? spells.filter(
        (sp) =>
          sp.level >= 1 && sp.level <= highestCircle && sp.classes.includes(classId) && !c.knownSpells.includes(sp.id),
      )
    : [];

  function toggleLearn(id: string, limit: number, selected: string[], setSelected: (ids: string[]) => void) {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id));
    else if (selected.length < limit) setSelected([...selected, id]);
  }

  function learnChosen() {
    onUpdate((ch) => ({
      ...ch,
      knownCantrips: [...ch.knownCantrips, ...chosenCantrips],
      knownSpells: [...ch.knownSpells, ...chosenSpells],
    }));
    setChosenCantrips([]);
    setChosenSpells([]);
  }

  const totalWeightLb = inventoryWeightLb(c.inventory) + coinsWeightLb(c.coins);
  const carryingCapacity = carryingCapacityLb(c.abilities.strength);
  const encLevel = encumbranceLevel(totalWeightLb, c.abilities.strength);
  const speedPenaltyFeet = encumbranceSpeedPenaltyFeet(encLevel);
  const effectiveSpeedFeet = Math.max(0, c.speedFeet - speedPenaltyFeet);
  const speedLabel = speedPenaltyFeet > 0 ? `${effectiveSpeedFeet} фт` : `${c.speedFeet} фт`;
  /** Жёсткий потолок (Сила × 15): нельзя добавить предмет, если это довело бы вес выше грузоподъёмности. */
  function wouldExceedCapacity(additionalWeightLb: number): boolean {
    return totalWeightLb + additionalWeightLb > carryingCapacity;
  }
  const addItemBlocked = wouldExceedCapacity(catalogWeightLb(newItemName.trim()));
  const nextLevelXp = xpNeededForNextLevel(c.level);
  const levelUpReady = canLevelUp(c.level, c.experiencePoints);

  return (
    <li className="character-card">
      <div className="character-card__name">
        <span>{c.name}</span>
        <span className="character-card__header-actions">
          <button type="button" className="character-card__collapse" aria-expanded={!collapsed} aria-label={`${collapsed ? "Развернуть" : "Свернуть"} карточку ${c.name}`} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "Развернуть" : "Свернуть"}
          </button>
          <button className="character-card__delete" title="Удалить персонажа" onClick={onRemove}>✕</button>
        </span>
      </div>
      <div className="character-card__summary">
        <div className="character-card__meta">
          {c.race || "раса не указана"} · {c.class || "класс не указан"}
          {c.subclass && <> ({c.subclass})</>}
          {c.background && <> · {c.background}</>} · ур. {c.level}
          {c.alignment && <> · {c.alignment}</>}
          {c.gender && <> · {c.gender}</>}
          {c.age > 0 && <> · {c.age} л.</>}
        </div>
        {c.languages.length > 0 && (
          <div className="character-card__prof">Языки: {c.languages.join(", ")}</div>
        )}
        {(c.favoredEnemy || c.knownTerrain) && (
          <div className="character-card__prof">
            {c.favoredEnemy && <>Избранный враг: {c.favoredEnemy}</>}
            {c.favoredEnemy && c.knownTerrain && " · "}
            {c.knownTerrain && <>Известная местность: {c.knownTerrain}</>}
          </div>
        )}
        <dl className="character-card__hp" aria-label="Характеристики персонажа">
        <div className="character-card__stat">
          <dt>HP</dt>
          <dd>{c.currentHp}/{c.maxHp}</dd>
        </div>
        <div className="character-card__stat">
          <dt>КД</dt>
          <dd>{c.armorClass}</dd>
        </div>
        <div className="character-card__stat">
          <dt>Скорость</dt>
          <dd>{speedLabel}</dd>
        </div>
        <div className="character-card__stat">
          <dt>Инициатива</dt>
          <dd>{c.initiative >= 0 ? `+${c.initiative}` : c.initiative}</dd>
        </div>
        <div className="character-card__stat">
          <dt>Пас. внимательность</dt>
          <dd>{c.passivePerception}</dd>
        </div>
        <div className="character-card__stat">
          <dt>Вес</dt>
          <dd>{Math.round(totalWeightLb * 10) / 10} / {carryingCapacity} фнт.</dd>
        </div>
        </dl>
      </div>
      {!collapsed && <div className="character-card__body">
      {encLevel !== "normal" && (
        <div className="character-card__danger character-card__danger--heavy">
          ⚠ {ENCUMBRANCE_LABELS[encLevel]} — скорость {effectiveSpeedFeet} фт (было {c.speedFeet} фт)
        </div>
      )}
      <div className="character-card__level">
        Уровень {c.level}{" "}
        <button
          type="button"
          onClick={requestLevelUp}
          disabled={c.level >= MAX_LEVEL || asiPanelOpen || subclassPanelOpen || !!pendingChoice}
          aria-disabled={!levelUpReady}
          className={!levelUpReady && c.level < MAX_LEVEL ? "character-card__danger" : undefined}
          data-own-sound
        >
          {c.level >= MAX_LEVEL ? "Максимальный уровень (5)" : "Повысить уровень"}
        </button>
      </div>
      <div className="character-card__xp">
        Опыт: {c.experiencePoints}
        {nextLevelXp !== null ? (
          <> / {nextLevelXp} до {c.level + 1} уровня</>
        ) : (
          " (максимум уровня достигнут)"
        )}
        <div className="character-card__add-row">
          <input
            className="character-card__xp-input"
            type="number"
            min={1}
            placeholder="Добавить опыт"
            value={xpInput}
            onChange={(e) => setXpInput(e.currentTarget.value)}
          />
          <button type="button" onClick={addExperience}>
            Добавить опыт
          </button>
        </div>
      </div>
      {subclassPanelOpen && levelUpSubclassInfo && (
        <div className="character-card__asi">
          <p>Выберите архетип ({c.level + 1} уровень):</p>
          <div className="character-card__asi-mode character-card__asi-mode--choices">
            {levelUpSubclassInfo.subclasses.map((s, i) => (
              <label key={s.name}>
                <input
                  type="radio"
                  name="subclass-choice"
                  checked={subclassChoiceIndex === i}
                  onChange={() => setSubclassChoiceIndex(i)}
                />{" "}
                <strong>{s.name}</strong>
                {s.description && <> — {s.description}</>}
              </label>
            ))}
          </div>
          <div className="character-card__asi-actions">
            <button type="button" onClick={confirmSubclass} data-own-sound>
              Подтвердить и повысить уровень
            </button>
            <button type="button" onClick={() => setSubclassPanelOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {pendingChoice && (
        <div className="character-card__asi">
          <p>
            Выберите «{pendingChoice.name}» ({c.level + 1} уровень) —{" "}
            {pendingChoice.pick > 1 ? `${pendingChoice.pick} варианта(ов)` : "один вариант"}:
          </p>
          <div className="character-card__asi-mode character-card__asi-mode--choices">
            {pendingChoice.options.map((option) => (
              <label key={option.id}>
                <input
                  type={pendingChoice.pick === 1 ? "radio" : "checkbox"}
                  name="subclass-choice-option"
                  checked={choiceSelections.includes(option.id)}
                  disabled={
                    pendingChoice.pick > 1 &&
                    !choiceSelections.includes(option.id) &&
                    choiceSelections.length >= pendingChoice.pick
                  }
                  onChange={() => toggleChoiceOption(option.id)}
                />{" "}
                {option.label}
              </label>
            ))}
          </div>
          <div className="character-card__asi-actions">
            <button
              type="button"
              onClick={confirmChoice}
              disabled={choiceSelections.length !== pendingChoice.pick}
              data-own-sound
            >
              Подтвердить и повысить уровень
            </button>
            <button type="button" onClick={cancelChoice}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {asiPanelOpen && (
        <div className="character-card__asi">
          <p>
            Улучшение характеристик (4 уровень): «Некоторые из этих умений позволяют повысить значение ваших
            характеристик: либо увеличить значение двух характеристик на 1, либо одной — на 2. При этом значение
            не может стать выше 20.»
          </p>
          <div className="character-card__asi-mode character-card__asi-mode--compact">
            <label>
              <input
                type="radio"
                checked={asiMode === "plus2"}
                onChange={() => setAsiModeAndReset("plus2")}
              />{" "}
              +2 одной характеристике
            </label>
            <label>
              <input
                type="radio"
                checked={asiMode === "plus1plus1"}
                onChange={() => setAsiModeAndReset("plus1plus1")}
              />{" "}
              +1 двум характеристикам
            </label>
          </div>
          <div className="character-card__asi-abilities">
            {ABILITY_LABELS.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={asiKeys.includes(key)}
                  disabled={c.abilities[key] >= 20 && !asiKeys.includes(key)}
                  onChange={() => toggleAsiKey(key)}
                />{" "}
                {label} ({c.abilities[key]})
              </label>
            ))}
          </div>
          <div className="character-card__asi-actions">
            <button type="button" onClick={confirmAsi} disabled={!asiReady} data-own-sound>
              Подтвердить и повысить уровень
            </button>
            <button type="button" onClick={() => setAsiPanelOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
      <details className="character-card__abilities">
        <summary>Спасброски и навыки</summary>
        {encLevel === "heavily-encumbered" && (
          <p className="character-card__danger character-card__danger--heavy">
            ⚠ {HEAVILY_ENCUMBERED_DISADVANTAGE_HINT}
          </p>
        )}
        <p className="character-card__prof">{proficiencyBonusHint(c.level)}</p>
        <ul className="character-card__skill-list">
          {ABILITY_LABELS.map(([key, label]) => {
            const proficient = c.savingThrowProficiencies.includes(label);
            const mod = abilityMod(c.abilities[key]) + (proficient ? proficiencyBonusForLevel(c.level) : 0);
            return (
              <li key={key}>
                {label} (спасбросок): {fmtMod(mod)}
                {proficient && " · владение"}
              </li>
            );
          })}
        </ul>
        <ul className="character-card__skill-list">
          {ALL_SKILLS.map((skill) => {
            const proficient = c.skillProficiencies.includes(skill);
            const mod = abilityMod(c.abilities[SKILL_ABILITY[skill]]) + (proficient ? proficiencyBonusForLevel(c.level) : 0);
            return (
              <li key={skill} className="typography-term-line">
                {skill}: {fmtMod(mod)}
                {proficient && " · владение"}
              </li>
            );
          })}
        </ul>
      </details>
      <details className="character-card__gear-proficiency">
        <summary>Оружие и доспехи ({weaponAttacks.length})</summary>
        {armorIssue && (
          <p className="character-card__danger character-card__danger--heavy">
            ⚠ {armorIssue.items.join(", ")}: {UNPROFICIENT_ARMOR_HINT}
          </p>
        )}
        {weaponAttacks.length > 0 ? (
          <ul className="character-card__skill-list">
            {weaponAttacks.map((attack) => (
              <li key={attack.weapon.name} className="typography-term-line">
                {attack.weapon.name}: атака {fmtMod(attack.attackBonus)}, урон {attack.damage}
                {attack.proficient ? " · владение" : " · без владения"}
                {grants?.critRange !== undefined && ` · крит ${grants.critRange}-20`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="character-card__hint">Оружия из таблицы SRD в инвентаре нет.</p>
        )}
        <p className="character-card__prof">
          Доспехи:{" "}
          {armorProficiencies.length > 0
            ? armorProficiencies.map((id) => ARMOR_PROFICIENCY_LABELS[id as ArmorProficiency] ?? id).join(", ")
            : "нет владений"}
        </p>
        {toolProficiencies.length > 0 && (
          <p className="character-card__prof">Инструменты: {toolProficiencies.join(", ")}</p>
        )}
      </details>
      {classFeaturesBlockHasContent({
        classFeatures,
        classResources,
        classScaling,
        subclassOptions,
        subclassScaling,
        domainSpells,
        bonusCantrips: grants?.bonusCantrips,
        damageResistances: grants?.damageResistances,
        healingBonus,
      }) && (
        <details className="character-card__class-features" open>
          <summary>Особенности класса ({classFeatures.length + classResources.length})</summary>
          {classResources.length > 0 && (
            <ul className="character-card__resource-list">
              {classResources.map((resource) => {
                const max = resourceMax(resource, c.abilities);
                const current = resourceCurrent(resource);
                return (
                  <li key={resource.id} className="character-card__item">
                    <strong>{resource.name}</strong>{" "}
                    <span className="character-card__resource-count">
                      {current}/{max} {resource.unit}
                    </span>
                    <button
                      type="button"
                      title={`Потратить: ${resource.name}`}
                      aria-disabled={current === 0}
                      className={current === 0 ? "character-card__danger" : undefined}
                      onClick={() => spendResource(resource)}
                    >
                      Потратить
                    </button>
                    <button type="button" disabled={current >= max} onClick={() => restoreResource(resource)}>
                      Восстановить
                    </button>
                    <span className="character-card__hint">
                      {resource.recharge === "short" ? "короткий или длинный отдых" : "длинный отдых"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {subclassOptions.length > 0 && (
            <ul className="character-card__resource-list">
              {subclassOptions.map((option) => {
                const resource = classResources.find((r) => r.id === option.resourceId)!;
                const value = classId
                  ? subclassEffectValue(option.effect, {
                      classId,
                      abilities: c.abilities,
                      level: c.level,
                      spellCircle: highestCircle,
                    })
                  : null;
                const spent = resourceCurrent(resource) < (option.cost ?? 1);
                return (
                  <li key={option.id} className="character-card__item">
                    <strong>{option.name}</strong>{" "}
                    {value && (
                      <span className="character-card__resource-count">
                        {value.value} {value.label}
                      </span>
                    )}
                    <button
                      type="button"
                      title={`Применить: ${option.name} (тратит ${resource.name}${
                        (option.cost ?? 1) > 1 ? `, ${option.cost}` : ""
                      })`}
                      aria-disabled={spent}
                      className={spent ? "character-card__danger" : undefined}
                      onClick={() => applySubclassOption(option)}
                    >
                      Применить
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {subclassScaling.length > 0 && classId && (
            <ul className="character-card__skill-list">
              {subclassScaling.map((entry) => {
                const value = subclassEffectValue(entry.effect, {
                  classId,
                  abilities: c.abilities,
                  level: c.level,
                  spellCircle: highestCircle,
                });
                return (
                  <li key={entry.name} className="typography-term-line">
                    {entry.name}
                    {value && `: ${value.value} ${value.label}`}
                  </li>
                );
              })}
            </ul>
          )}
          {grants?.damageResistances && grants.damageResistances.length > 0 && (
            <p className="character-card__prof">Сопротивление урону: {grants.damageResistances.join(", ")}</p>
          )}
          {grants?.bonusCantrips && (
            <p className="character-card__prof">
              Заговоры сверх нормы класса: {grants.bonusCantrips.count}
              {bonusCantripClassTitle && ` (из списка класса «${bonusCantripClassTitle}»)`}
            </p>
          )}
          {healingBonus && (
            <p className="character-card__prof">
              Лечение заклинанием усилено: +{healingBonus.flat} и ещё +1 за каждый круг заклинания
              (1 круг — +{healingBonus.flat + 1}, {highestCircle > 0 ? highestCircle : 1} круг — +
              {healingBonus.flat + Math.max(1, highestCircle)}).
            </p>
          )}
          {domainSpells.length > 0 && (
            <p className="character-card__prof">
              Заклинания архетипа (всегда подготовлены): {domainSpells.map(spellName).join(", ")}
            </p>
          )}
          {classScaling.length > 0 && (
            <ul className="character-card__skill-list">
              {classScaling.map((value) => (
                <li key={value.name} className="typography-term-line">
                  {value.name}: {value.value}
                </li>
              ))}
            </ul>
          )}
          <ul className="character-card__traits">
            {classFeatures.map((f) => (
              <li key={f.name}>
                <strong>{f.name}</strong> — {f.description}
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="character-card__inventory" open={c.inventory.length > 0}>
        <summary>Инвентарь ({c.inventory.length})</summary>
        <ul>
          {c.inventory.map((item) => (
            <li key={item.id} className="character-card__item">
              <strong>{item.name}</strong>
              <button type="button" onClick={() => adjustItemQuantity(item.id, -1)}>
                −
              </button>
              <span>{item.quantity}</span>
              <button
                type="button"
                aria-disabled={wouldExceedCapacity(item.weightLb)}
                className={wouldExceedCapacity(item.weightLb) ? "character-card__danger" : undefined}
                title={wouldExceedCapacity(item.weightLb) ? "Достигнута максимальная грузоподъёмность" : undefined}
                onClick={() => wouldExceedCapacity(item.weightLb) ? playLimitSound() : adjustItemQuantity(item.id, 1)}
              >
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
            className="character-card__item-input"
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
          <button type="button" aria-disabled={addItemBlocked} className={addItemBlocked ? "character-card__danger" : undefined} onClick={() => addItemBlocked ? playLimitSound() : addItem()}>
            Добавить
          </button>
          {addItemBlocked && (
            <span className="character-card__hint">Достигнута максимальная грузоподъёмность</span>
          )}
        </div>
      </details>

      <details className="character-card__coins" open>
        <summary>Деньги (итого {coinsTotalGold(c.coins)} зм)</summary>
        <ul>
          {COIN_DENOMINATIONS.map((denomination) => (
            <li key={denomination.key} className="character-card__item character-card__coin-row">
              <CoinIcon denomination={denomination} />
              <button type="button" onClick={() => adjustCoin(denomination.key, -1)} data-own-sound>
                −
              </button>
              <span className="character-card__coin-count">{c.coins[denomination.key]}</span>
              <button type="button" onClick={() => adjustCoin(denomination.key, 1)} data-own-sound>
                +
              </button>
            </li>
          ))}
        </ul>
      </details>

      <details
        className="character-card__traits"
        open={!!(c.personalityTraits || c.ideals || c.bonds || c.flaws)}
      >
        <summary>Черты характера, идеалы, привязанности, слабости</summary>
        <div className="character-card__traits-grid">
          <label>
            Черты характера
            <textarea
              rows={2}
              value={c.personalityTraits}
              onChange={(e) => onUpdate((ch) => ({ ...ch, personalityTraits: e.currentTarget.value }))}
            />
          </label>
          <label>
            Идеалы
            <textarea
              rows={2}
              value={c.ideals}
              onChange={(e) => onUpdate((ch) => ({ ...ch, ideals: e.currentTarget.value }))}
            />
          </label>
          <label>
            Привязанности
            <textarea
              rows={2}
              value={c.bonds}
              onChange={(e) => onUpdate((ch) => ({ ...ch, bonds: e.currentTarget.value }))}
            />
          </label>
          <label>
            Слабости
            <textarea
              rows={2}
              value={c.flaws}
              onChange={(e) => onUpdate((ch) => ({ ...ch, flaws: e.currentTarget.value }))}
            />
          </label>
        </div>
      </details>

      <details
        className="character-card__traits"
        open={!!(c.height || c.weight || c.eyes || c.skin || c.hair || c.appearance || c.backstory || c.allies || c.treasures)}
      >
        <summary>Внешность, предыстория, союзники, сокровища</summary>
        <div className="character-card__traits-grid">
          <label>
            Рост
            <input value={c.height} onChange={(e) => onUpdate((ch) => ({ ...ch, height: e.currentTarget.value }))} />
          </label>
          <label>
            Вес
            <input value={c.weight} onChange={(e) => onUpdate((ch) => ({ ...ch, weight: e.currentTarget.value }))} />
          </label>
          <label>
            Глаза
            <input value={c.eyes} onChange={(e) => onUpdate((ch) => ({ ...ch, eyes: e.currentTarget.value }))} />
          </label>
          <label>
            Кожа
            <input value={c.skin} onChange={(e) => onUpdate((ch) => ({ ...ch, skin: e.currentTarget.value }))} />
          </label>
          <label>
            Волосы
            <input value={c.hair} onChange={(e) => onUpdate((ch) => ({ ...ch, hair: e.currentTarget.value }))} />
          </label>
          <label>
            Внешний вид
            <textarea
              rows={4}
              value={c.appearance}
              onChange={(e) => onUpdate((ch) => ({ ...ch, appearance: e.currentTarget.value }))}
            />
          </label>
          <label>
            Предыстория персонажа
            <textarea
              rows={6}
              value={c.backstory}
              onChange={(e) => onUpdate((ch) => ({ ...ch, backstory: e.currentTarget.value }))}
            />
          </label>
          <label>
            Союзники и организации
            <textarea
              rows={4}
              value={c.allies}
              onChange={(e) => onUpdate((ch) => ({ ...ch, allies: e.currentTarget.value }))}
            />
          </label>
          <label>
            Сокровища
            <textarea
              rows={3}
              value={c.treasures}
              onChange={(e) => onUpdate((ch) => ({ ...ch, treasures: e.currentTarget.value }))}
            />
          </label>
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
            className="character-card__condition-input"
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
                          {spell.castingTime} · {spell.range} · {spell.description}
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
              {spellsKnownKind === "prepared" ? "Подготовленные заклинания:" : "Известные заклинания:"}
              <ul className="character-card__spell-list">
                {c.knownSpells.map((id) => {
                  const spell = findSpell(id);
                  const circle = spell?.level ?? 1;
                  return (
                    <li key={id}>
                      {spellName(id)} ({circle} круг){" "}
                      <button
                        type="button"
                        onClick={() => useSpellSlot(circle)}
                        disabled={freeSlotIndex(c.spellSlotsCurrent, circle) === -1}
                        data-own-sound
                      >
                        Использовать
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="character-card__spell-group">
            <ul className="character-card__spell-list">
              {c.spellSlotsMax.map((max, i) =>
                max > 0 ? (
                  <li key={i}>
                    Ячейки {i + 1} круга: {c.spellSlotsCurrent[i] ?? 0}/{max}
                  </li>
                ) : null,
              )}
            </ul>
            <button
              type="button"
              onClick={restoreSpellSlots}
              disabled={c.spellSlotsMax.every((max, i) => (c.spellSlotsCurrent[i] ?? 0) >= max)}
            >
              Восстановить все ячейки
            </button>
          </div>
          {(missingCantrips > 0 || missingSpells > 0) && (
            <div className="character-card__asi">
              <p>
                По таблице класса на {c.level} уровне доступно больше магии, чем выбрано
                {missingCantrips > 0 && <> — новых заговоров: {missingCantrips}</>}
                {missingSpells > 0 && <> — новых заклинаний: {missingSpells}</>}.
              </p>
              {missingCantrips > 0 && learnableCantrips.length === 0 && (
                <p className="character-card__hint">
                  Списка заговоров этого класса в приложении пока нет — веди новые заговоры сам по книге.
                </p>
              )}
              {missingCantrips > 0 && learnableCantrips.length > 0 && (
                <>
                  <p>
                    Заговоры ({chosenCantrips.length}/{missingCantrips}):
                  </p>
                  <ul className="character-card__spell-list">
                    {learnableCantrips.map((sp) => (
                      <li key={sp.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={chosenCantrips.includes(sp.id)}
                            onChange={() => toggleLearn(sp.id, missingCantrips, chosenCantrips, setChosenCantrips)}
                          />{" "}
                          {sp.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {missingSpells > 0 && learnableSpells.length === 0 && (
                <p className="character-card__hint">
                  Списка заклинаний этого класса в приложении пока нет — веди новые заклинания сам по книге.
                </p>
              )}
              {missingSpells > 0 && learnableSpells.length > 0 && (
                <>
                  <p>
                    Заклинания до {highestCircle} круга ({chosenSpells.length}/{missingSpells}):
                  </p>
                  <ul className="character-card__spell-list">
                    {learnableSpells.map((sp) => (
                      <li key={sp.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={chosenSpells.includes(sp.id)}
                            onChange={() => toggleLearn(sp.id, missingSpells, chosenSpells, setChosenSpells)}
                          />{" "}
                          {sp.name} ({sp.level} круг)
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {(learnableCantrips.length > 0 || learnableSpells.length > 0) && (
                <div className="character-card__asi-actions">
                  <button
                    type="button"
                    disabled={
                      chosenCantrips.length !== Math.min(missingCantrips, learnableCantrips.length) ||
                      chosenSpells.length !== Math.min(missingSpells, learnableSpells.length)
                    }
                    onClick={learnChosen}
                  >
                    Выучить
                  </button>
                </div>
              )}
            </div>
          )}
          {spellsKnownKind === "prepared" && (
            <p className="character-card__spell-info">
              Класс готовит заклинания заново после длинного отдыха: доступен весь список класса до {highestCircle} круга,
              список выше — то, что подготовлено сейчас.
            </p>
          )}
        </details>
      )}
      </div>}
    </li>
  );
}

/**
 * Кость хитов по классу (для левел-апа), по названию класса (`Character.class`
 * хранит текст, не id топика) — вытащено из тех же топиков rules.json, что уже
 * загружаются мастером персонажа.
 */
function extractClassHitDice(topics: RuleTopic[]): Record<string, { id: string; max: number; average: number }> {
  const result: Record<string, { id: string; max: number; average: number }> = {};
  for (const t of topics) {
    if (t.category !== "classes") continue;
    const max = parseHitDie(t);
    const average = parseHitDieAverage(t);
    if (max !== null && average !== null) result[t.title] = { id: t.id, max, average };
  }
  return result;
}

/** Расовый бонус к хитам (см. RACE_HP_BONUS), по названию расы (`Character.race` хранит текст, не id). */
function extractRaceHpBonus(topics: RuleTopic[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const t of topics) {
    if (t.category !== "races") continue;
    const bonus = RACE_HP_BONUS[t.id];
    if (bonus) result[t.title] = bonus;
  }
  return result;
}

export function CharactersPage() {
  const { state, addCharacter, removeCharacter, updateCharacter } = useCampaign();
  const [panel, setPanel] = useState<Panel>("none");
  const [spells, setSpells] = useState<Spell[]>([]);
  const [presets, setPresets] = useState<CharacterPreset[]>([]);
  const [conditionEffects, setConditionEffects] = useState<Record<string, string[]>>({});
  const [classHitDiceByTitle, setClassHitDiceByTitle] = useState<Record<string, { id: string; max: number; average: number }>>({});
  const [raceHpBonusByTitle, setRaceHpBonusByTitle] = useState<Record<string, number>>({});

  useEffect(() => {
    invoke<Spell[]>("get_spells").then(setSpells);
    invoke<CharacterPreset[]>("get_character_presets").then(setPresets);
    invoke<RuleTopic[]>("get_rules").then((topics) => {
      setConditionEffects(extractConditionEffects(topics));
      setClassHitDiceByTitle(extractClassHitDice(topics));
      setRaceHpBonusByTitle(extractRaceHpBonus(topics));
    });
  }, []);

  return (
    <div className="characters-page">
      <div className="characters-page__heading">
        <h2>Персонажи</h2>
        <button
          className={"characters-page__action characters-page__action--compact" + (panel === "wizard" ? " characters-page__action--active" : "")}
          onClick={() => setPanel(panel === "wizard" ? "none" : "wizard")}
        >
          Создать персонажа по правилам
        </button>
      </div>

      <ul className="characters-page__list">
        {state.characters.map((c) => (
          <CharacterCard
            key={c.id}
            character={c}
            spells={spells}
            conditionEffects={conditionEffects}
            classHitDiceByTitle={classHitDiceByTitle}
            raceHpBonusByTitle={raceHpBonusByTitle}
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
          className={"characters-page__action" + (panel === "presets" ? " characters-page__action--active" : "")}
          onClick={() => setPanel(panel === "presets" ? "none" : "presets")}
        >
          Взять готового персонажа
        </button>
      </div>

      {panel === "wizard" && <CharacterWizard onDone={() => setPanel("none")} />}

      {panel === "presets" && (
        <ul className="characters-page__list">
          {presets.map((preset) => (
            <li key={preset.id}>
              <button
                className="characters-page__action"
                onClick={async () => {
                  await addCharacter(characterFromPreset(preset));
                  setPanel("none");
                }}
              >
                {preset.name} — {presetSubtitle(preset)}
              </button>
            </li>
          ))}
          {presets.length === 0 && (
            <li className="characters-page__empty">Готовых персонажей пока нет.</li>
          )}
        </ul>
      )}
    </div>
  );
}
