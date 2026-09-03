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
  abilityMod,
  coinsTotalGold,
  fmtMod,
  maxHpForLevel,
  parseHitDie,
  parseHitDieAverage,
  proficiencyBonusForLevel,
  proficiencyBonusHint,
  xpNeededForNextLevel,
  type AbilityKey,
  type ClassLevelFeature,
} from "../characterCreationData";
import type { AbilityScores, Character, Coins, RuleTopic, Spell } from "../../state/types";
import { CharacterWizard } from "../CharacterWizard";
import { CoinIcon } from "../CoinIcon";
import { playCoinsSound, playLevelUpSound, playLimitSound, playSpellCastSound } from "../../audio/uiSounds";
import "./CharactersPage.css";

type Panel = "none" | "wizard";

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

function CharacterCard({
  character: c,
  spells,
  conditionEffects,
  classHitDiceByTitle,
  raceHpBonusByTitle,
  collapsible,
  onRemove,
  onUpdate,
}: {
  character: Character;
  spells: Spell[];
  conditionEffects: Record<string, string[]>;
  classHitDiceByTitle: Record<string, { id: string; max: number; average: number }>;
  raceHpBonusByTitle: Record<string, number>;
  collapsible: boolean;
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

  function adjustCoin(key: keyof Coins, delta: number) {
    if (delta < 0 && c.coins[key] === 0) return;
    playCoinsSound();
    onUpdate((ch) => ({ ...ch, coins: { ...ch.coins, [key]: Math.max(0, ch.coins[key] + delta) } }));
  }

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
      inventory: [
        ...ch.inventory,
        { id: crypto.randomUUID(), name, quantity: 1, notes: "", weightLb: catalogWeightLb(name) },
      ],
    }));
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
    onUpdate((ch) => ({ ...ch, spellSlotsLevel1Current: ch.spellSlotsLevel1Max }));
  }

  function useSpellSlot() {
    playSpellCastSound();
    onUpdate((ch) => ({ ...ch, spellSlotsLevel1Current: Math.max(0, ch.spellSlotsLevel1Current - 1) }));
  }

  /**
   * Левел-ап: level+1, maxHp пересчитывается полностью по формуле (не
   * инкрементально) — см. maxHpForLevel и «Архитектурное решение» в карточке
   * characters-leveling-1-5. currentHp растёт на ту же прибавку (левел-ап
   * лечит, стандартное правило SRD). Принимает abilities явно — на 4 уровне
   * они уже включают выбор улучшения характеристик (ASI), см. confirmAsi.
   */
  function applyLevelUp(abilities: AbilityScores, chosenSubclassName?: string) {
    const newLevel = c.level + 1;
    const dice = classHitDiceByTitle[c.class];
    const conMod = abilityMod(abilities.constitution);
    const raceBonus = raceHpBonusByTitle[c.race] ?? 0;
    const newMaxHp = dice
      ? maxHpForLevel(dice.max, dice.average, conMod, raceBonus, newLevel)
      : c.maxHp;
    const hpGained = Math.max(0, newMaxHp - c.maxHp);
    // Подкласс, выбираемый левел-апом (2 или 3 уровень — для Жреца/Колдуна/
    // Чародея он уже назначен мастером на 1 уровне, см. CharacterWizard.tsx).
    // При единственном варианте (SRD) назначается автоматически; при
    // нескольких — выбранное имя приходит из confirmSubclass (см. requestLevelUp).
    const subclassInfo = dice ? CLASS_SUBCLASSES[dice.id] : undefined;
    const grantedSubclass =
      subclassInfo && !c.subclass && newLevel >= subclassInfo.chosenAtLevel
        ? (chosenSubclassName ?? subclassInfo.subclasses[0]?.name)
        : undefined;
    onUpdate((ch) => ({
      ...ch,
      level: newLevel,
      abilities,
      maxHp: newMaxHp,
      currentHp: Math.min(newMaxHp, ch.currentHp + hpGained),
      subclass: grantedSubclass ?? ch.subclass,
    }));
    playLevelUpSound();
  }

  /**
   * На 4 уровне левел-ап не мгновенный — сперва открывает выбор ASI (см.
   * confirmAsi). На уровне выбора архетипа (chosenAtLevel), если вариантов
   * больше одного, сперва открывает выбор архетипа (см. confirmSubclass) —
   * оба уровня не совпадают ни у одного класса, ветки взаимоисключающие.
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
    applyLevelUp(c.abilities, chosen);
    setSubclassPanelOpen(false);
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

  const isSpellcaster = c.knownCantrips.length > 0 || c.knownSpells.length > 0;

  /**
   * Классовые особенности уровней 2..текущий (CLASS_LEVEL_FEATURES) + особенности
   * подкласса уровней 1..текущий, если подкласс уже выбран (CLASS_SUBCLASSES).
   * `Character.class` хранит текст, id класса ищем через ту же карту, что и
   * для хитов на левел-апе (classHitDiceByTitle содержит id).
   */
  const classId = classHitDiceByTitle[c.class]?.id;
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

  const totalWeightLb = inventoryWeightLb(c.inventory) + coinsWeightLb(c.coins);
  const carryingCapacity = carryingCapacityLb(c.abilities.strength);
  const encLevel = encumbranceLevel(totalWeightLb, c.abilities.strength);
  const speedPenaltyFeet = encumbranceSpeedPenaltyFeet(encLevel);
  const effectiveSpeedFeet = Math.max(0, c.speedFeet - speedPenaltyFeet);
  const speedLabel =
    speedPenaltyFeet > 0
      ? `${effectiveSpeedFeet} фт (${c.speedFeet} − ${speedPenaltyFeet}, ${ENCUMBRANCE_LABELS[encLevel].toLowerCase()})`
      : `${c.speedFeet} фт`;
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
          {collapsible && (
            <button type="button" className="character-card__collapse" aria-expanded={!collapsed} aria-label={`${collapsed ? "Развернуть" : "Свернуть"} карточку ${c.name}`} onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? "Развернуть" : "Свернуть"}
            </button>
          )}
          <button className="character-card__delete" title="Удалить персонажа" onClick={onRemove}>✕</button>
        </span>
      </div>
      {collapsed && <div className="character-card__compact-meta">{c.class || "класс не указан"} · ур. {c.level} · HP {c.currentHp}/{c.maxHp}</div>}
      {!collapsed && <div className="character-card__body">
      <div className="character-card__meta">
        {c.race || "раса не указана"} · {c.class || "класс не указан"}
        {c.subclass && <> ({c.subclass})</>}
        {c.background && <> · {c.background}</>} · ур. {c.level}
        {c.alignment && <> · {c.alignment}</>}
        {c.gender && <> · {c.gender}</>}
        {c.age > 0 && <> · {c.age} л.</>}
      </div>
      <div className="character-card__hp">
        HP {c.currentHp}/{c.maxHp} · КД {c.armorClass} · Скорость {speedLabel} · Иниц.{" "}
        {c.initiative >= 0 ? `+${c.initiative}` : c.initiative} · Пас. внимательность{" "}
        {c.passivePerception} · Вес: {Math.round(totalWeightLb * 10) / 10} / {carryingCapacity} фнт.
      </div>
      {encLevel !== "normal" && (
        <div
          className={
            encLevel === "heavily-encumbered"
              ? "character-card__danger character-card__danger--heavy"
              : "character-card__danger"
          }
        >
          {ENCUMBRANCE_LABELS[encLevel]}
        </div>
      )}
      <div className="character-card__level">
        Уровень {c.level}{" "}
        <button
          type="button"
          onClick={requestLevelUp}
          disabled={c.level >= MAX_LEVEL || asiPanelOpen || subclassPanelOpen}
          aria-disabled={!levelUpReady}
          className={!levelUpReady && c.level < MAX_LEVEL ? "character-card__danger" : undefined}
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
          <div className="character-card__asi-mode">
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
            <button type="button" onClick={confirmSubclass}>
              Подтвердить и повысить уровень
            </button>
            <button type="button" onClick={() => setSubclassPanelOpen(false)}>
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
          <div className="character-card__asi-mode">
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
            <button type="button" onClick={confirmAsi} disabled={!asiReady}>
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
            {HEAVILY_ENCUMBERED_DISADVANTAGE_HINT}
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
      {classFeatures.length > 0 && (
        <details className="character-card__class-features" open>
          <summary>Особенности класса ({classFeatures.length})</summary>
          <ul className="character-card__traits">
            {classFeatures.map((f) => (
              <li key={f.name}>
                <strong>{f.name}</strong> — {f.description}
              </li>
            ))}
          </ul>
        </details>
      )}
      {c.languages.length > 0 && (
        <div className="character-card__prof">Языки: {c.languages.join(", ")}</div>
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
              <button type="button" onClick={() => adjustCoin(denomination.key, -1)}>
                −
              </button>
              <span className="character-card__coin-count">{c.coins[denomination.key]}</span>
              <button type="button" onClick={() => adjustCoin(denomination.key, 1)}>
                +
              </button>
            </li>
          ))}
        </ul>
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
          {c.level >= 2 && (
            <p className="character-card__spell-info">Заклинания 2+ круга — пока в разработке, список известных заклинаний не растёт выше выбора 1 уровня.</p>
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
  const { state, removeCharacter, updateCharacter } = useCampaign();
  const [panel, setPanel] = useState<Panel>("none");
  const [spells, setSpells] = useState<Spell[]>([]);
  const [conditionEffects, setConditionEffects] = useState<Record<string, string[]>>({});
  const [classHitDiceByTitle, setClassHitDiceByTitle] = useState<Record<string, { id: string; max: number; average: number }>>({});
  const [raceHpBonusByTitle, setRaceHpBonusByTitle] = useState<Record<string, number>>({});

  useEffect(() => {
    invoke<Spell[]>("get_spells").then(setSpells);
    invoke<RuleTopic[]>("get_rules").then((topics) => {
      setConditionEffects(extractConditionEffects(topics));
      setClassHitDiceByTitle(extractClassHitDice(topics));
      setRaceHpBonusByTitle(extractRaceHpBonus(topics));
    });
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
            classHitDiceByTitle={classHitDiceByTitle}
            raceHpBonusByTitle={raceHpBonusByTitle}
            collapsible={state.characters.length > 1}
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
