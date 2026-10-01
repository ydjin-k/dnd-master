import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import { useDiceLog } from "../../state/DiceLogContext";
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
  encumbranceThresholdsLb,
  HEALING_POTIONS,
  HEAVILY_ENCUMBERED_DISADVANTAGE_HINT,
  inventoryWeightLb,
  OVERLOAD_WARNING,
  RACE_HP_BONUS,
  RACE_TRAITS,
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
  type RaceTrait,
  type SubclassChoice,
  type SubclassResourceOption,
} from "../characterCreationData";
import {
  CLASS_PROGRESSION,
  PROGRESSION_MAX_LEVEL,
  characterResources,
  highestSpellCircle,
  isAsiLevel,
  progressionAt,
  resourceMax,
  slotRechargeOf,
  spellSlotsForLevel,
  type ClassResource,
} from "../classProgression";
import {
  attemptWildMagicSurge,
  isWildMagicSorcerer,
  NO_WILD_MAGIC_TURN,
  WILD_MAGIC_DIE,
  WILD_MAGIC_PAYBACK_FEATURE,
  WILD_MAGIC_PAYBACK_RESOURCE_ID,
  wildMagicTurnKey,
  type WildMagicSurge,
  type WildMagicTurnState,
} from "../wildMagicSurges";
import {
  MADNESS_MAX_LEVEL,
  MADNESS_ROLL_EXPRESSION,
  madnessEffectLines,
  madnessLevelOf,
  madnessTable,
  nextMadnessLevel,
  parseMadnessCondition,
  readMadnessRules,
  withMadness,
  type MadnessRules,
} from "../madness";
import {
  DEATH_SAVE_EXPRESSION,
  DEATH_SAVE_FAILURES_TO_DEATH,
  DEATH_SAVE_RULES_LINK,
  DEATH_SAVE_STATE_LABELS,
  DEATH_SAVE_SUCCESSES_TO_STABLE,
  applyDeathSaveRoll,
  clampDeathSaveCount,
  deathSaveHintLines,
  deathSaveRollLabel,
  deathSaveState,
  deathSaveVerdict,
  deathSavesOf,
  normalizeDeathSaves,
} from "../deathSaves";
import {
  abilitiesWithFeat,
  allFeats,
  canTakeFeat,
  featsOf,
  prerequisiteText,
  unmetPrerequisite,
  type Feat,
} from "../feats";
import { preparableSpells, preparedSpells, preparedSpellsFormulaLabel, preparesSpells } from "../preparedSpells";
import { restoreAllSlots, restoreSlots, spentSlots } from "../spellSlots";
import { hitDiceLeft, restoreHitDice, spendHitDie } from "../hitDice";
import { pacePassivePenalty, pacedPassivePerception, paceById, travelOf } from "../travelPace";
import {
  EXHAUSTION_MAX_LEVEL,
  exhaustionEffectLines,
  exhaustionLevelName,
  exhaustionLevelOf,
  withExhaustionReduced,
} from "../exhaustion";
import { hasSpellbook, keepSpellbook, spellbookAt, spellbookOf, spellbookSource, writableSpells } from "../spellbook";
import type { AbilityScores, Character, Coins, FeatureUses, RollResult, RuleTopic, Spell } from "../../state/types";
import { CharacterWizard } from "../CharacterWizard";
import { UIIcon } from "../UIIcon";
import { characterFromPreset, presetSubtitle, type CharacterPreset } from "../characterPresets";
import { CoinIcon } from "../CoinIcon";
import { characterPortraitUrl } from "../characterPortraits";
import { abyssElfSpellLine, playableRaces, raceResources, withSunlitPassive } from "../abyssElfRace";
import { playCoinsSound, playLevelUpSound, playLimitSound, playSpellCastSound } from "../../audio/uiSounds";
import "./CharactersPage.css";

export { withExhaustionReduced };

type Panel = "none" | "wizard" | "presets";

/**
 * Левелинг в приложении ограничен уровнями 1-12 (см.
 * tasks/open/characters-leveling-6-12.md). Потолок не заведён вторым числом:
 * он и есть глубина таблиц прогрессии, и разойтись с ними не может — кнопка
 * не пустит персонажа на уровень, строки которого в таблице нет.
 */
const MAX_LEVEL = PROGRESSION_MAX_LEVEL;

/**
 * Правило траты Костей Хитов — словами, а не машиной состояний. По SRD кости
 * тратятся в конце короткого отдыха, по одной, с правом остановиться после
 * каждого броска. Состояния «идёт отдых» в приложении нет намеренно: час
 * простоя объявляет Мастер за столом, и поддельная машина состояний врала бы о
 * том, чего приложение не знает, — поэтому кнопка тратит ровно одну кость за
 * нажатие, а правило стоит здесь текстом.
 */
const HIT_DICE_HINT =
  "Кости Хитов тратятся в конце короткого отдыха — по одной, останавливаясь после каждого броска, и не больше, чем костей по уровню. Час отдыха объявляет Мастер: приложение время не считает.";

/**
 * Что возвращает короткий отдых — правило SRD словами; числа за кнопкой.
 * Ячейки названы Магией договора, а не Колдуном: факт «чьи ячейки возвращает
 * короткий отдых» живёт полем данных (`slotRecharge` в classProgression.ts), и
 * подпись пересказывает правило, а не подменяет владельца.
 */
const SHORT_REST_HINT =
  "Короткий отдых (не меньше часа) возвращает то, что помечено «короткий или длинный отдых», и ячейки Магии договора. Сам по себе хиты он не поднимает — их растит только потраченная Кость Хитов.";

/**
 * Что возвращает длинный отдых и чего от него ждать словами. Два правила SRD
 * стоят здесь по разным причинам: «не больше одного длинного отдыха за 24 часа»
 * — текстом, потому что времени в состоянии кампании нет вовсе и заводить часы
 * эта карточка не должна, а «хотя бы 1 хит на входе» — кодом (см. takeLongRest),
 * потому что хиты приложение знает и проверить может.
 */
const LONG_REST_HINT =
  "Длинный отдых (не меньше 8 часов) возвращает все хиты, половину Костей Хитов (минимум одну), все ячейки, использования особенностей и снимает один уровень истощения. Нужен хотя бы 1 хит на входе: без сознания отдых не начинается. Больше одного длинного отдыха за 24 часа SRD не разрешает — этот счёт за Мастером, приложение время не считает.";

/**
 * Сколько Костей Хитов возвращает длинный отдых: половина МАКСИМУМА, то есть
 * половина уровня, а не половина остатка («если у персонажа восемь Костей
 * Хитов, он восстанавливает четыре» — gameplay-rest). Минимум одна обязателен:
 * на 1 уровне максимум равен единице, и половина дала бы ноль — кость не
 * вернулась бы никогда. Больше потраченного из этого числа не вернётся, и
 * считает это `hitDice.ts`, а не здесь.
 */
function longRestHitDiceBack(level: number): number {
  return Math.max(1, Math.floor(level / 2));
}

/** Общий принцип снятия состояний (rules.json → appendices-conditions, абзац перед таблицей). */
const CONDITIONS_GENERAL_HINT =
  "Состояние снимается, когда его отменяет вызвавший эффект (например, «Сбитый с ног» снимается, если встать на ноги), либо когда заканчивается его длительность.";

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
  for (let level = 1; level <= EXHAUSTION_MAX_LEVEL; level++) {
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
 * Предел текущих хитов, набранных игроком вручную: ниже нуля и выше максимума
 * они не уходят. Ноль разрешён и означает ровно «ноль хитов» — спасбросков от
 * смерти в приложении пока нет, и эта карточка их не заводит
 * (combat-damage-reaches-character-sheet).
 *
 * Дробное число поле ввода пропустить может («5.7» набирается посимвольно),
 * а хиты целые — отсюда `Math.trunc`. Неразобранное значение сюда не доходит:
 * его отсеивает вызывающий, потому что «поле пусто» и «хитов ноль» — разные
 * вещи, и пустое поле в персонажа писать нечем.
 */
export function clampCurrentHp(value: number, maxHp: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maxHp, Math.trunc(value)));
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

/**
 * Строка ограниченного ресурса: счётчик, обе кнопки и подпись «что даёт и чем
 * платится» (см. 4e480b2). Одна на классовые ресурсы и на расовые — форма у
 * них одна (`ClassResource`), и разметка, написанная дважды, разошлась бы
 * первой же правкой. Откуда ресурс пришёл, решает вызывающий блок, а не строка.
 */
function ResourceRow({
  resource,
  current,
  max,
  onSpend,
  onRestore,
}: {
  resource: ClassResource;
  current: number;
  max: number;
  onSpend: () => void;
  onRestore: () => void;
}) {
  return (
    <li className="character-card__item dm-list-row">
      <strong>{resource.name}</strong>{" "}
      <span className="character-card__resource-count">
        {current}/{max} {resource.unit}
      </span>
      <button
        type="button"
        title={`Потратить: ${resource.name}`}
        aria-disabled={current === 0}
        className={current === 0 ? "character-card__danger" : undefined}
        onClick={onSpend}
      >
        Потратить
      </button>
      <button type="button" disabled={current >= max} onClick={onRestore}>
        Восстановить
      </button>
      <span className="character-card__hint">
        {resource.description} Восстановление:{" "}
        {resource.recharge === "short" ? "короткий или длинный отдых" : "длинный отдых"}.
      </span>
    </li>
  );
}

/**
 * Ряд галочек спасброска — успехи или провалы. Одна разметка на оба ряда:
 * отличаются они только подписью и числом клеток, и написанная дважды
 * разошлась бы первой правкой (то же правило, что у `ResourceRow` выше).
 *
 * Клетки — настоящие `checkbox`: их можно нажать, они читаются скринридером и
 * видны пробе по имени. Счёт `checked` считается сравнением с числом, а не
 * своим массивом флагов: массив был бы вторым владельцем того же числа.
 */
function DeathSaveRow({
  legend,
  count,
  total,
  onSet,
}: {
  legend: string;
  count: number;
  total: number;
  onSet: (box: number) => void;
}) {
  return (
    <span className="character-card__dying-count">
      {legend}: {count}/{total}
      {Array.from({ length: total }, (_, index) => index + 1).map((box) => (
        <input
          key={box}
          type="checkbox"
          checked={box <= count}
          aria-label={`${legend} ${box} из ${total}`}
          onChange={() => onSet(box)}
        />
      ))}
    </span>
  );
}

function CharacterCard({
  character: c,
  spells,
  conditionEffects,
  madness,
  classHitDiceByTitle,
  raceHpBonusByTitle,
  raceTraitsByTitle,
  feats,
  turnKey,
  travelPace,
  onRemove,
  onUpdate,
}: {
  character: Character;
  spells: Spell[];
  conditionEffects: Record<string, string[]>;
  /** Раздел «Безумие» из rules.json; null — справочник не загрузился, тогда безумие просто не предлагается. */
  madness: MadnessRules | null;
  classHitDiceByTitle: Record<string, { id: string; max: number; average: number }>;
  raceHpBonusByTitle: Record<string, number>;
  raceTraitsByTitle: Record<string, RaceTrait[]>;
  /**
   * Все черты приложения: SRD-«Борец», прочитанный из rules.json, плюс наши
   * (`feats.ts`). Приезжают сверху тем же приёмом, что расовые особенности:
   * справочник загружает страница, а карточка его не читает.
   */
  feats: Feat[];
  /** Ключ текущего хода боя или null вне боя — им ограничивается «не чаще раза за ход» у Дикого всплеска. */
  turnKey: string | null;
  /**
   * Темп, которым идёт отряд (`CampaignState.travel`) — плата быстрого темпа
   * вычитается из пассивной внимательности здесь, на листе. Карточка темпом не
   * владеет и не меняет его: выбирают его на «Приключениях», у счётчика пути.
   */
  travelPace: string;
  onRemove: () => void;
  onUpdate: (updater: (character: Character) => Character) => void;
}) {
  const [newItemName, setNewItemName] = useState("");
  const [newCondition, setNewCondition] = useState("");
  const [xpInput, setXpInput] = useState("");
  // Черновик поля текущих хитов. `null` — поле показывает то, что в персонаже;
  // строка — игрок набирает прямо сейчас. Нужен ровно ради одного мгновения:
  // чтобы стереть «10» и набрать «3», поле должно побыть пустым, а в персонаже
  // пустоты нет — писать туда «ничего» нечем, и без черновика очистка поля
  // уехала бы в сейв нулём. В сохранение не идёт: это набираемое, а не
  // состояние персонажа, — тем же правилом, что `slotsToRestore` ниже.
  const [hpDraft, setHpDraft] = useState<string | null>(null);
  const [asiPanelOpen, setAsiPanelOpen] = useState(false);
  // Третий режим той же панели — «черта вместо увеличения» (необязательное
  // правило SRD, раздел `character-feats`). Умолчание остаётся "plus2":
  // Увеличение характеристик — основное правило, а черта от него отказ.
  const [asiMode, setAsiMode] = useState<"plus2" | "plus1plus1" | "feat">("plus2");
  const [asiKeys, setAsiKeys] = useState<AbilityKey[]>([]);
  const [asiFeatId, setAsiFeatId] = useState<string | null>(null);
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
  // Выбор подготовки держится отдельно от выбора «выучить»: у класса с
  // подготовкой оба списка могут быть открыты одновременно (заговоры по-
  // прежнему учатся насовсем), и общий счётчик перемешал бы их.
  const [chosenPrepared, setChosenPrepared] = useState<string[]>([]);
  // Выбор «вписать в книгу» — третий независимый список: книга наполняется
  // насовсем и своей нормой (spellbook.ts), а подготовка меняется каждый день
  // и своей, и общий счётчик у них был бы неверен обоим.
  const [chosenForBook, setChosenForBook] = useState<string[]>([]);
  // Дикий всплеск: за какой ход бросок уже сделан и что выпало в последний раз.
  // Оба живут в листе, а не в персонаже: в сейв это не пишется — всплеск
  // случается и показывается здесь и сейчас, как и бросок кости.
  const [wildMagicTurn, setWildMagicTurn] = useState<WildMagicTurnState>(NO_WILD_MAGIC_TURN);
  const [lastSurge, setLastSurge] = useState<{ surge: WildMagicSurge; payback: number } | null>(null);
  // Сколько ячеек какого круга игрок собрался вернуть. Ключ — круг, значение —
  // то, что набрано в поле (строка, чтобы поле можно было очистить). В сейв не
  // пишется: это намерение перед нажатием, а не состояние персонажа. Предел
  // считает не оно, а spellSlots.ts — здесь лежит только набранное.
  const [slotsToRestore, setSlotsToRestore] = useState<Record<number, string>>({});
  // Безумие: бросок идёт в движок и может не вернуться. Оба поля живут в листе,
  // а не в персонаже, — в сейв уходит только выпавшее, подписью состояния.
  const [madnessRolling, setMadnessRolling] = useState(false);
  const [madnessError, setMadnessError] = useState<string | null>(null);
  // Сторож повторного входа — ref, а не состояние: состояние к следующему
  // нажатию ещё не перерисовалось бы, и второе нажатие прошло бы следом за
  // первым, подняв лестницу на две ступени за один жест. Кнопка с `disabled`
  // от этого не спасает по той же причине.
  const madnessRollingRef = useRef(false);
  // Итог последнего отдыха или броска Кости Хитов — одна строка для игрока.
  // Живёт в листе, а не в персонаже: в сейв уходит только результат (хиты,
  // счётчик костей, ячейки), как и у броска безумия выше.
  const [restNote, setRestNote] = useState<string | null>(null);
  // Сторож повторного входа в бросок Кости Хитов — ref по той же причине, что
  // и у безумия: состояние ко второму нажатию ещё не перерисовалось бы, и
  // одна кость ушла бы за два броска.
  const hitDieRollingRef = useRef(false);
  // Спасбросок от смерти: что выпало на последней кости и отказ движка. Оба
  // живут в листе, а не в персонаже, — как у безумия и Кости Хитов выше. В
  // листе лежит РОВНО выпавшее число, а не готовая строка про счёт: счёт
  // показывают галочки из персонажа, и вторая его копия в состоянии страницы
  // разошлась бы с записанным.
  const [lastDeathSaveRoll, setLastDeathSaveRoll] = useState<number | null>(null);
  const [deathSaveError, setDeathSaveError] = useState<string | null>(null);
  const [deathSaveRolling, setDeathSaveRolling] = useState(false);
  // Сторож повторного входа — ref, а не состояние, по той же причине, что у
  // безумия: состояние ко второму нажатию ещё не перерисовалось бы, и второе
  // нажатие прошло бы следом за первым. `disabled` на кнопке не спасает — он
  // ждёт той же перерисовки.
  const deathSaveRollingRef = useRef(false);

  /** Журнал бросков — единственный владелец истории; лист в него только пишет. */
  const { recordRoll } = useDiceLog();

  // Счёт и состояние спасбросков — из персонажа через правило, а не из своего
  // сравнения «успехов === 3»: у факта «стабилизирован/мёртв» один владелец.
  const deathSaves = deathSavesOf(c);
  const deathSaveStateNow = deathSaveState(deathSaves);

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

  /**
   * Текущие хиты правит САМ ИГРОК и пишет их прямо числом — бой в лист не
   * пишет вовсе (combat-damage-reaches-character-sheet, решение владельца
   * 24.09.2026). Записывается сразу, как остальной лист: `updateCharacter`
   * сохраняет кампанию каждым вызовом, отдельного «Применить» у соседних
   * полей листа (внешность, предыстория) нет — нет и здесь.
   *
   * Разобранное число считается ДО `onUpdate` и кладётся в переменную:
   * читать поле события внутри отложенного updater'а нельзя.
   */
  function editCurrentHp(raw: string) {
    setHpDraft(raw);
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    // Показанное не может разойтись с записанным: набранные «99» при максимуме
    // 12 в тот же миг становятся «12» и в поле, и в персонаже.
    setHpDraft(String(clampCurrentHp(parsed, c.maxHp)));
    onUpdate((ch) => ({ ...ch, currentHp: clampCurrentHp(parsed, ch.maxHp) }));
  }

  /**
   * Спасбросок от смерти. Первое место листа персонажа, которое пишет в журнал
   * бросков: за столом видно, чей бросок и что выпало, — поэтому в метке стоит
   * имя (`deathSaveRollLabel`). Соседний бросок листа, «Безумие +1», в журнал
   * НЕ пишет — расхождение известно и чинится своей карточкой, не этой.
   *
   * Кость бросает движок (`roll_dice`), как у безумия и Кости Хитов: своего
   * `Math.random` на листе нет.
   *
   * Чем обернулся бросок, решает НЕ эта функция: выпавшее число уходит в
   * `applyDeathSaveRoll` — единственного владельца правила. И считается там
   * ВНУТРИ updater'а, от свежего персонажа (`ch`), а не от снимка рендера: два
   * броска подряд, сделанные до перерисовки, иначе сложились бы в один — то же
   * семейство дефектов, что поймала запись 136 у безумия. Само выпавшее число
   * читается из результата ДО updater'а и кладётся в переменную.
   */
  async function rollDeathSave() {
    if (deathSaveRollingRef.current) return;
    if (deathSaveState(deathSavesOf(c)) !== "rolling") return;
    deathSaveRollingRef.current = true;
    setDeathSaveRolling(true);
    setDeathSaveError(null);
    setLastDeathSaveRoll(null);
    try {
      const result = await invoke<RollResult>("roll_dice", { expression: DEATH_SAVE_EXPRESSION });
      recordRoll(deathSaveRollLabel(c.name), result);
      const roll = result.total;
      setLastDeathSaveRoll(roll);
      onUpdate((ch) => {
        const outcome = applyDeathSaveRoll(deathSavesOf(ch), roll);
        return {
          ...ch,
          deathSaveSuccesses: outcome.saves.successes,
          deathSaveFailures: outcome.saves.failures,
          // Единственное место карточки, которое пишет хиты по ПРАВИЛУ, а не по
          // вводу игрока: «20» возвращает ровно 1 хит. Величину даёт правило,
          // предел — clampCurrentHp, как и всем прочим записям хитов.
          currentHp: outcome.hp === null ? ch.currentHp : clampCurrentHp(outcome.hp, ch.maxHp),
        };
      });
    } catch (e) {
      setDeathSaveError(String(e));
    } finally {
      deathSaveRollingRef.current = false;
      setDeathSaveRolling(false);
    }
  }

  /**
   * Галочка успеха/провала, поставленная руками: за столом бросают настоящей
   * костью чаще, чем экранной, и игрок — хозяин числа, тем же правилом, что у
   * поля хитов. Нажатие на N-ю клетку ставит счёт N, а повторное нажатие на
   * уже отмеченную — N-1, то есть снимает её.
   *
   * Предел тот же, что у броска (`clampDeathSaveCount`), — второго владельца
   * «не больше трёх» здесь нет. Число считается ДО `onUpdate`.
   */
  function setDeathSaveCount(kind: "successes" | "failures", box: number) {
    const saves = deathSavesOf(c);
    const was = kind === "successes" ? saves.successes : saves.failures;
    const next = clampDeathSaveCount(box === was ? box - 1 : box);
    onUpdate((ch) =>
      kind === "successes"
        ? { ...ch, deathSaveSuccesses: next }
        : { ...ch, deathSaveFailures: next },
    );
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

  /**
   * «Уровень безумия +1»: поднимает персонажа на следующую ступень нашей
   * лестницы и бросает по ТОЙ таблице SRD, которая этой ступени отвечает.
   * Бросок идёт кубиком движка (`roll_dice`), а не своим генератором, — как
   * и бросок по таблицам событий.
   *
   * Повышение перебрасывает эффект заново: у долгосрочного безумия своя
   * таблица, и переносить в неё выпавшее на краткосрочной было бы подлогом.
   */
  async function raiseMadness() {
    if (!madness || madnessRollingRef.current) return;
    const level = nextMadnessLevel(c.conditions);
    if (level === null) return;
    const table = madnessTable(madness, level);
    if (!table) return;
    madnessRollingRef.current = true;
    setMadnessRolling(true);
    setMadnessError(null);
    try {
      const effect = await invoke<RollResult>("roll_dice", { expression: MADNESS_ROLL_EXPRESSION });
      const duration = table.duration
        ? await invoke<RollResult>("roll_dice", { expression: table.duration.expression })
        : null;
      const rolled = { level, roll: effect.total, durationRoll: duration?.total ?? null };
      onUpdate((ch) => ({ ...ch, conditions: withMadness(ch.conditions, rolled) }));
    } catch (e) {
      setMadnessError(String(e));
    } finally {
      madnessRollingRef.current = false;
      setMadnessRolling(false);
    }
  }

  /**
   * Строки под состоянием. У безумия они собираются по выпавшим числам из
   * подписи, у всех прочих состояний — берутся из готовой карты SRD: текст
   * безумия зависит от броска, и заранее разложить его по именам нельзя.
   */
  function conditionEffectLinesFor(condition: string): string[] | undefined {
    const rolled = parseMadnessCondition(condition);
    if (rolled) return madness ? madnessEffectLines(madness, rolled) : undefined;
    return conditionEffects[condition];
  }

  function spellName(id: string): string {
    return spells.find((sp) => sp.id === id)?.name ?? id;
  }

  function findSpell(id: string): Spell | undefined {
    return spells.find((sp) => sp.id === id);
  }

  /**
   * Строка заклинания в списке: название, круг, трата ячейки и — только у
   * того, что игрок подготовил сам, — снятие подготовки. `canUnprepare`
   * приходит от разбора `preparedSpells`, потому что владелец факта «это
   * снять нельзя» один: заклинания архетипа подготовлены всегда.
   */
  function spellLine(id: string, canUnprepare: boolean) {
    const circle = findSpell(id)?.level ?? 1;
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
        {canUnprepare && (
          <button type="button" onClick={() => unprepareSpell(id)}>
            Снять
          </button>
        )}
      </li>
    );
  }

  function restoreSpellSlots() {
    onUpdate((ch) => ({ ...ch, spellSlotsCurrent: restoreAllSlots(ch.spellSlotsCurrent, ch.spellSlotsMax) }));
  }

  /**
   * Возврат нескольких ячеек одного круга: «Естественное восстановление»
   * друида, предмет, решение Мастера. Предел считает `restoreSlots`, тот же,
   * что и у кнопки «всё» и у эффекта архетипа, — здесь только намерение.
   */
  function restoreSpellSlotsOfCircle(circle: number, count: number) {
    // Возвращать нечего либо в поле не число — жать не на что, состояние не трогаем.
    if (spentSlots(c.spellSlotsCurrent, c.spellSlotsMax, circle) === 0 || !(count >= 1)) {
      playLimitSound();
      return;
    }
    onUpdate((ch) => ({
      ...ch,
      spellSlotsCurrent: restoreSlots(ch.spellSlotsCurrent, ch.spellSlotsMax, circle, count),
    }));
  }

  /** SRD: заклинание творится ячейкой своего круга или любого старшего — тратим наименьшую подходящую. */
  function freeSlotIndex(slots: number[], circle: number): number {
    return slots.findIndex((free, i) => i >= circle - 1 && free > 0);
  }

  /**
   * Дикий всплеск при наложенном заклинании. Бросок целиком за движком
   * (`attemptWildMagicSurge` в wildMagicSurges.ts): лист только отвечает на
   * вопрос «чей это персонаж и какой сейчас ход» и запоминает выпавшее, чтобы
   * показать строку игроку. Возвращает null, если всплеска не было.
   */
  function rollWildMagic(circle: number): WildMagicSurge | null {
    if (!isWildMagicSorcerer(c.subclass)) return null;
    const { attempt, turnState } = attemptWildMagicSurge({ circle, turnKey, turnState: wildMagicTurn });
    setWildMagicTurn(turnState);
    return attempt.kind === "surge" ? attempt.surge : null;
  }

  /**
   * Сколько очков чар вернёт «Расплата за всплеск» ИМЕННО СЕЙЧАС: половина
   * уровня чародея, но не выше максимума запаса (оговорка особенности). Само
   * число принадлежит `grants.scaling` архетипа и считается тем же
   * `subclassEffectValue`, что и остальные числа архетипов, — второго владельца
   * половине уровня здесь не заводится.
   */
  function wildMagicPaybackGain(): number {
    const sorceryPoints = classResources.find((r) => r.id === WILD_MAGIC_PAYBACK_RESOURCE_ID);
    const entry = subclassScaling.find((s) => s.name === WILD_MAGIC_PAYBACK_FEATURE);
    if (!classId || !sorceryPoints || !entry) return 0;
    const value = subclassEffectValue(entry.effect, {
      classId,
      abilities: c.abilities,
      level: c.level,
      spellCircle: highestCircle,
    });
    const points = typeof value?.value === "number" ? value.value : 0;
    const current = resourceCurrent(sorceryPoints);
    return Math.max(0, Math.min(resourceMax(sorceryPoints, c.abilities), current + points) - current);
  }

  function useSpellSlot(circle: number) {
    const index = freeSlotIndex(c.spellSlotsCurrent, circle);
    if (index === -1) {
      playLimitSound();
      return;
    }
    playSpellCastSound();
    // Бросок делается ДО onUpdate и его результат кладётся в переменные: читать
    // что-либо внутри updater'а нельзя, он выполняется отложенно.
    const surge = rollWildMagic(circle);
    const payback = surge ? wildMagicPaybackGain() : 0;
    const sorceryPoints = classResources.find((r) => r.id === WILD_MAGIC_PAYBACK_RESOURCE_ID);
    const restored = sorceryPoints && payback > 0 ? resourceCurrent(sorceryPoints) + payback : 0;
    setLastSurge(surge ? { surge, payback } : null);
    onUpdate((ch) => ({
      ...ch,
      spellSlotsCurrent: ch.spellSlotsCurrent.map((free, i) => (i === index ? Math.max(0, free - 1) : free)),
      featureUses:
        sorceryPoints && payback > 0
          ? [
              ...ch.featureUses.filter((u) => u.featureId !== sorceryPoints.id),
              { featureId: sorceryPoints.id, usesCurrent: restored },
            ]
          : ch.featureUses,
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
   * Трата одной Кости Хитов. Бросок делает движок (`roll_dice`), как и у
   * безумия, — своего `Math.random` на листе нет; модификатор Телосложения
   * уходит в само выражение (`1d10+2`), поэтому сумму считает тот же владелец,
   * что и бросок, а лист только показывает выпавшее.
   *
   * Кнопка НЕ заперта состоянием «идёт отдых»: его в приложении нет (см.
   * HIT_DICE_HINT). Предел остатка — за `hitDice.ts`, звук предела — здесь,
   * тем же правилом, что у `spendResource`.
   */
  async function spendHitDieRoll() {
    if (hitDieRollingRef.current) return;
    const die = classHitDiceByTitle[c.class]?.max;
    // Пустой запас и неизвестная кость (справочник не загрузился) — звук
    // предела, а не молчание: кнопка помечена aria-disabled, но не disabled.
    if (!die || hitDiceLeft(c.hitDiceSpent, c.level) === 0) {
      playLimitSound();
      return;
    }
    hitDieRollingRef.current = true;
    setRestNote(null);
    const conMod = abilityMod(c.abilities.constitution);
    try {
      const roll = await invoke<RollResult>("roll_dice", { expression: `1d${die}${fmtMod(conMod)}` });
      // Отрицательное Телосложение хитов не отнимает: кость лечит минимум 0.
      const healed = Math.max(0, roll.total);
      onUpdate((ch) => ({
        ...ch,
        // Выше максимума и ниже нуля не уйдёт — предел уже есть у clampCurrentHp.
        currentHp: clampCurrentHp(ch.currentHp + healed, ch.maxHp),
        hitDiceSpent: spendHitDie(ch.hitDiceSpent, ch.level),
      }));
      setRestNote(
        `Кость Хитов 1к${die}: выпало ${roll.rolls.join(", ")}, Телосложение ${fmtMod(conMod)} — хитов +${healed}.`,
      );
    } catch (e) {
      setRestNote(String(e));
    } finally {
      hitDieRollingRef.current = false;
    }
  }

  /**
   * Ограниченные ресурсы, которые возвращает отдых, — классовые с архетипом и
   * расовые вместе, отобранные по ПОЛЮ `recharge`, а не по списку id. Поэтому
   * расовый «Зов бездны» Эльфа бездны, помеченный `long`, на коротком отдыхе не
   * вернётся, а помеченное `short` вернётся у любого класса, который появится в
   * таблице позже.
   *
   * Длинный отдых берёт И `"long"`, И `"short"`: `"short"` в SRD значит
   * «короткий ИЛИ длинный», и подпись на листе так и напечатана — «короткий или
   * длинный отдых» (см. ResourceRow). Это не небрежность отбора, а само правило.
   */
  function resourcesBackAfterRest(rest: "short" | "long"): ClassResource[] {
    const all = [...classResources, ...raceResourceList];
    return rest === "long" ? all : all.filter((r) => r.recharge === "short");
  }

  /**
   * Счётчики после отдыха: перечисленные ресурсы полны, остальные не тронуты.
   * Максимум считает `resourceMax` — тот же владелец, что и у строки ресурса,
   * второго предела отдых не заводит. Характеристики берутся из `ch`, а не из
   * снимка рендера: updater выполняется отложенно.
   */
  function refilledFeatureUses(ch: Character, resources: ClassResource[]): FeatureUses[] {
    const ids = new Set(resources.map((r) => r.id));
    return [
      ...ch.featureUses.filter((u) => !ids.has(u.featureId)),
      ...resources.map((r) => ({ featureId: r.id, usesCurrent: resourceMax(r, ch.abilities) })),
    ];
  }

  /** Одна строка-итог отдыха: что именно вернулось. Пусто — так и сказано. */
  function restSummary(title: string, parts: string[]): string {
    return parts.length > 0 ? `${title}: ${parts.join(", ")}.` : `${title}: возвращать было нечего.`;
  }

  /**
   * Короткий отдых возвращает РОВНО то, что помечено `recharge: "short"` у
   * класса, архетипа и расы, плюс ячейки — только тому классу, у которого
   * `slotRecharge: "short"` (Магия договора Колдуна). Проверки id класса здесь
   * нет: владелец факта — поле данных, а кнопка его читает.
   *
   * Хиты короткий отдых не поднимает: их растит только потраченная Кость Хитов.
   * Числа для подписи считаются ДО `onUpdate` — читать что-либо внутри
   * отложенного updater'а нельзя.
   */
  function takeShortRest() {
    const resources = resourcesBackAfterRest("short");
    const refilled = resources.filter((r) => resourceCurrent(r) < resourceMax(r, c.abilities));
    const slotsBack = shortRestReturnsSlots ? spentSlotsTotal() : 0;
    onUpdate((ch) => ({
      ...ch,
      featureUses: refilledFeatureUses(ch, resources),
      spellSlotsCurrent: shortRestReturnsSlots
        ? restoreAllSlots(ch.spellSlotsCurrent, ch.spellSlotsMax)
        : ch.spellSlotsCurrent,
    }));
    setRestNote(
      restSummary("Короткий отдых", [
        ...refilled.map((r) => r.name),
        ...(slotsBack > 0 ? [`ячеек возвращено ${slotsBack}`] : []),
      ]),
    );
  }

  /**
   * Длинный отдых, одним нажатием и без промежуточных состояний: все хиты,
   * половина максимума Костей Хитов (минимум одна), все ячейки, ресурсы ОБОИХ
   * видов отдыха и одна ступень истощения вниз.
   *
   * «Хотя бы 1 хит на входе» — правило SRD, которое приложению проверяемо, и
   * потому стоит кодом: на нуле кнопка не срабатывает, звучит предел, а причина
   * названа в подписи. Заодно поэтому длинному отдыху нечего обнулять в
   * спасбросках от смерти: на нуле его не нажать.
   * «Не больше одного за 24 часа» осталось текстом (LONG_REST_HINT): времени в
   * состоянии кампании нет, и заводить его эта карточка не должна.
   *
   * Подготовленные заклинания отдых НЕ трогает намеренно: лист и так позволяет
   * готовить и снимать в любой момент (`preparedSpells.ts`), так что права после
   * отдыха не прибавляется, а сбросить подготовленное кнопкой значило бы отнять
   * у игрока его выбор без просьбы. Текст SRD о подготовке заново на листе стоит
   * и остаётся верным.
   *
   * Все числа для подписи считаются ДО `onUpdate`: читать что-либо внутри
   * отложенного updater'а нельзя.
   */
  function takeLongRest() {
    if (c.currentHp === 0) {
      playLimitSound();
      return;
    }
    const resources = resourcesBackAfterRest("long");
    const refilled = resources.filter((r) => resourceCurrent(r) < resourceMax(r, c.abilities));
    const slotsBack = spentSlotsTotal();
    // Сколько костей действительно вернётся: половину максимума просит правило
    // отдыха, а обрезает просьбу по потраченному `hitDice.ts` — своего Math.min
    // здесь нет, иначе предел получил бы второго владельца.
    const diceBack =
      hitDiceLeft(restoreHitDice(c.hitDiceSpent, c.level, longRestHitDiceBack(c.level)), c.level) - hitDiceRemaining;
    const exhaustionBefore = exhaustionLevelOf(c.conditions);
    onUpdate((ch) => ({
      ...ch,
      currentHp: ch.maxHp,
      hitDiceSpent: restoreHitDice(ch.hitDiceSpent, ch.level, longRestHitDiceBack(ch.level)),
      spellSlotsCurrent: restoreAllSlots(ch.spellSlotsCurrent, ch.spellSlotsMax),
      featureUses: refilledFeatureUses(ch, resources),
      conditions: withExhaustionReduced(ch.conditions),
    }));
    setRestNote(
      restSummary("Длинный отдых", [
        `хиты ${c.maxHp}/${c.maxHp}`,
        ...(diceBack > 0 ? [`Костей Хитов +${diceBack}`] : []),
        ...(slotsBack > 0 ? [`ячеек возвращено ${slotsBack}`] : []),
        ...refilled.map((r) => r.name),
        ...(exhaustionBefore > 0
          ? [exhaustionBefore === 1 ? "уровень истощения снят" : `истощение ур. ${exhaustionBefore - 1}`]
          : []),
      ]),
    );
  }

  /** Сколько ячеек потрачено во всех кругах — для строки-итога отдыха; предел считает spellSlots.ts. */
  function spentSlotsTotal(): number {
    return c.spellSlotsMax.reduce(
      (sum, _max, i) => sum + spentSlots(c.spellSlotsCurrent, c.spellSlotsMax, i + 1),
      0,
    );
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
    if (restoredCircle > 0 && spentSlots(c.spellSlotsCurrent, c.spellSlotsMax, restoredCircle) === 0) {
      playLimitSound();
      return;
    }
    onUpdate((ch) => {
      const rest = ch.featureUses.filter((u) => u.featureId !== resource.id);
      return {
        ...ch,
        currentHp: Math.min(ch.maxHp, ch.currentHp + selfHeal),
        spellSlotsCurrent:
          restoredCircle > 0
            ? restoreSlots(ch.spellSlotsCurrent, ch.spellSlotsMax, restoredCircle, 1)
            : ch.spellSlotsCurrent,
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
   *
   * `newFeatId` — черта, взятая вместо Увеличения характеристик (см.
   * confirmAsi). Идёт сюда, а не своей записью в персонажа, по той же причине,
   * по которой сюда идут характеристики: черта с прибавкой меняет
   * `abilities`, а у значения характеристики один владелец — этот левел-ап.
   * Отдельная запись «взял черту» + отдельная «поднял Силу» разъехались бы на
   * первом же промахе.
   */
  function applyLevelUp(
    abilities: AbilityScores,
    chosenSubclassName?: string,
    newSubclassChoices?: Record<string, string[]>,
    newFeatId?: string,
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
    // Расовый ресурс идёт в тот же пересчёт, что классовый: `featureUses` ниже
    // собирается списком заново, и не попавший в него счётчик исчез бы с
    // первым же левел-апом. Лесенка у расы своя — оттого и уровень отдельно.
    const newResources = [
      ...characterResources(dice?.id, subclassName, newLevel),
      ...raceResources(c.race, newLevel),
    ];
    const oldResources = [
      ...characterResources(dice?.id, c.subclass, c.level),
      ...raceResources(c.race, c.level),
    ];
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
        // Каждую черту можно взять только раз (SRD) — повтор дал бы двойную
        // прибавку к характеристике; отбор доступных это уже учитывает
        // (`canTakeFeat`), поэтому здесь список только пополняется.
        feats: newFeatId ? [...ch.feats, newFeatId] : ch.feats,
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
        castableSpells: [
          ...new Set([...ch.castableSpells, ...subclassSpellsUpToLevel(dice?.id, subclassName, newLevel, allSubclassChoices)]),
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
    // Уровни ASI берутся из таблицы класса (classProgression.ts): стандартные
    // 4/8/12 плюс дополнительные точки Воина (6) и Плута (10).
    if (isAsiLevel(dice?.id, newLevel)) {
      setAsiMode("plus2");
      setAsiKeys([]);
      setAsiFeatId(null);
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

  function setAsiModeAndReset(mode: "plus2" | "plus1plus1" | "feat") {
    setAsiMode(mode);
    setAsiKeys([]);
    setAsiFeatId(null);
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

  /**
   * Черты, которые персонаж может взять прямо сейчас, и те, что не может, — с
   * причиной. Причину выдаёт `unmetPrerequisite` (feats.ts), панель её только
   * подписывает: догадываться о причине отказа показу запрещено, это тот самый
   * дефект, на котором экран называл «сюда пути нет» 29 мирных объектов.
   */
  const takenFeats = featsOf(c, feats);
  const offeredFeats = feats.filter((feat) => canTakeFeat(feat, c));
  const blockedFeats = feats
    .filter((feat) => !takenFeats.includes(feat) && !offeredFeats.includes(feat))
    .map((feat) => ({ feat, reason: unmetPrerequisite(feat, c) ?? "" }));
  const chosenFeat = offeredFeats.find((feat) => feat.id === asiFeatId) ?? null;

  const asiReady =
    asiMode === "feat" ? chosenFeat !== null : asiMode === "plus2" ? asiKeys.length === 1 : asiKeys.length === 2;

  /**
   * Улучшение характеристик (rules.json → character-beyond-1-level): либо +2
   * одной характеристике, либо +1 двум разным, потолок 20. На каких уровнях
   * оно вообще предлагается, решает таблица класса (isAsiLevel), а не эта
   * функция — здесь только сама механика прибавки.
   */
  function confirmAsi() {
    if (!asiReady) return;
    // Черта вместо увеличения (необязательное правило SRD): прибавку черты к
    // характеристикам считает `abilitiesWithFeat` — единственный владелец
    // этого перевода, — и она едет тем же аргументом `abilities`, которым
    // едет Улучшение характеристик. Второго пути записи характеристик здесь
    // не заводится, поэтому нормализация на воронке листа видит и эту запись.
    if (asiMode === "feat") {
      if (!chosenFeat) return;
      applyLevelUp(abilitiesWithFeat(c.abilities, chosenFeat), undefined, undefined, chosenFeat.id);
      setAsiPanelOpen(false);
      setAsiFeatId(null);
      return;
    }
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
    spellsKnownKind === "known" ? Math.max(0, (progression?.spellsKnown ?? 0) - c.castableSpells.length) : 0;
  // Ресурсы класса и архетипа с общим счётчиком (classProgression.ts).
  const classResources = characterResources(classId, c.subclass, c.level);
  /**
   * Расовое — отдельным блоком и отдельными списками, а не подмешанное в
   * классовое: «Особенности класса» ниже подписаны классом, и счётчик расы,
   * попавший под эту подпись, врал бы об источнике. Счётчик при этом общий,
   * `Character.featureUses` по id, — и тратится теми же кнопками.
   */
  /**
   * Пассивная внимательность, какой она есть в пути: число листа минус плата
   * быстрого темпа. Считает её `travelPace.ts` — здесь только показ, своего
   * вычитания у карточки нет.
   */
  const pacePenalty = pacePassivePenalty(travelPace);
  const pacedPassive = pacedPassivePerception(c.passivePerception, travelPace);
  const paceName = paceById(travelPace).name.toLowerCase();
  /**
   * Цена «Чувствительности к солнечному свету» считается ОТ числа с темпом, а не
   * от листового: иначе на быстром темпе особенность обещала бы под солнцем
   * внимательность выше той, что стоит на плитке рядом. Две платы складываются,
   * и обе названы числом.
   */
  const raceTraits = withSunlitPassive(raceTraitsByTitle[c.race] ?? [], c.race, pacedPassive);
  const raceResourceList = raceResources(c.race, c.level);
  const raceSpellLine = abyssElfSpellLine(c.race, (id) => spells.find((sp) => sp.id === id)?.name ?? id);
  /**
   * Кости Хитов: лицо кости приходит тем же `classHitDiceByTitle`, что и
   * левел-ап (второго источника не заводим), остаток считает `hitDice.ts`, а
   * максимум — это уровень, и потому нигде не хранится.
   */
  const hitDie = classHitDiceByTitle[c.class]?.max;
  const hitDiceRemaining = hitDiceLeft(c.hitDiceSpent, c.level);
  /** Возвращает ли короткий отдых ячейки — ПОЛЕ данных класса, а не сверка его id. */
  const shortRestReturnsSlots = slotRechargeOf(classId) === "short";
  const classScaling = progression?.scaling ?? [];
  const subclassOptions = subclassResourceOptionsAt(classId, c.subclass, c.level, c.subclassChoices).filter((option) =>
    classResources.some((r) => r.id === option.resourceId),
  );
  const subclassScaling = subclassScalingAt(classId, c.subclass, c.level, c.subclassChoices);
  const domainSpells = subclassSpellsUpToLevel(classId, c.subclass, c.level, c.subclassChoices);
  /**
   * Подготовка заклинаний (preparedSpells.ts) — у класса, который готовит их
   * по данным SRD (`spellsKnownKind`). Норма не хранится в персонаже: она
   * пересчитывается здесь из `c.abilities` и `c.level` при каждом показе,
   * поэтому смена характеристики и левел-ап двигают её сами, а не по снимку.
   * Заклинания архетипа идут сверх нормы — их владелец прежний,
   * `subclassSpellsUpToLevel`.
   */
  const preparesOnSheet = preparesSpells(classId);
  const prepared = preparedSpells({
    classId,
    abilities: c.abilities,
    level: c.level,
    castableSpells: c.castableSpells,
    alwaysPrepared: domainSpells,
  });
  /**
   * Книга заклинаний (spellbook.ts) — у Волшебника, и только у него. Готовит
   * он из книги, а не из всего списка класса: источник подготовки приходит
   * параметром, и подмена его книгой второго отбора не заводит. Норма книги
   * тоже не хранится снимком — она считается из `c.level`, поэтому левел-ап
   * открывает место в книге сам.
   */
  const book = spellbookAt({ classId, level: c.level, character: c });
  const preparedSource = hasSpellbook(classId) ? spellbookSource(spells, book.spells) : spells;
  const preparableNow = preparesOnSheet
    ? preparableSpells(preparedSource, { classId, level: c.level, alreadyPrepared: c.castableSpells })
    : [];
  const writableNow = book.free > 0 ? writableSpells(spells, { classId, level: c.level, book: book.spells }) : [];
  const armorIssue = unproficientArmorIssue(c.inventory.map((item) => item.name), armorProficiencies);
  const weaponAttacks = weaponsInInventory(c.inventory.map((item) => item.name)).map((weapon) =>
    weaponAttackFor(weapon, c.abilities, c.level, weaponProficiencies),
  );
  const healingBonus = grants?.healingBonus;
  const isSpellcaster =
    c.knownCantrips.length > 0 || c.castableSpells.length > 0 || highestCircle > 0 || missingCantrips > 0;

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
          sp.level >= 1 && sp.level <= highestCircle && sp.classes.includes(classId) && !c.castableSpells.includes(sp.id),
      )
    : [];

  function toggleLearn(id: string, limit: number, selected: string[], setSelected: (ids: string[]) => void) {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id));
    else if (selected.length < limit) setSelected([...selected, id]);
  }

  /** Подготовить выбранное: у класса с подготовкой `castableSpells` — это и есть подготовленное. */
  function prepareChosen() {
    onUpdate((ch) => ({ ...ch, castableSpells: [...ch.castableSpells, ...chosenPrepared] }));
    setChosenPrepared([]);
  }

  /**
   * Снять подготовку. Заклинания архетипа сюда не приходят: по SRD они
   * подготовлены всегда, и кнопки у них нет — разделяет списки
   * `preparedSpells`, второй проверки здесь не заводится.
   *
   * `keepSpellbook` — про переход старых сохранений: у волшебника, чья книга
   * ещё живёт в `castableSpells`, снятие подготовки без записи книги вычеркнуло
   * бы заклинание и из неё. У остальных классов ничего не меняет.
   */
  function unprepareSpell(id: string) {
    onUpdate((ch) => {
      const kept = keepSpellbook(ch, classId);
      return { ...kept, castableSpells: kept.castableSpells.filter((spellId) => spellId !== id) };
    });
  }

  /** Вписать выбранное в книгу — насовсем; подготовка из неё делается отдельно. */
  function writeToSpellbook() {
    onUpdate((ch) => ({ ...ch, spellbook: [...spellbookOf(ch, classId), ...chosenForBook] }));
    setChosenForBook([]);
  }

  function learnChosen() {
    onUpdate((ch) => ({
      ...ch,
      knownCantrips: [...ch.knownCantrips, ...chosenCantrips],
      castableSpells: [...ch.castableSpells, ...chosenSpells],
    }));
    setChosenCantrips([]);
    setChosenSpells([]);
  }

  const totalWeightLb = inventoryWeightLb(c.inventory) + coinsWeightLb(c.coins);
  const carryingCapacity = carryingCapacityLb(c.abilities.strength);
  const encLevel = encumbranceLevel(totalWeightLb, c.abilities.strength);
  /**
   * Веса, на которых меняется плашка, — берутся у того же кода, что её и ставит
   * (encumbranceThresholdsLb), формула сюда не переписана. Числа не округляем:
   * при нечётной Силе порог — ровно половина фунта (Сила 13 → 175.5 фнт), и
   * округление развело бы показанное число с моментом появления плашки.
   */
  const encThresholds = encumbranceThresholdsLb(c.abilities.strength);
  const speedPenaltyFeet = encumbranceSpeedPenaltyFeet(encLevel);
  const effectiveSpeedFeet = Math.max(0, c.speedFeet - speedPenaltyFeet);
  const speedLabel = speedPenaltyFeet > 0 ? `${effectiveSpeedFeet} фт` : `${c.speedFeet} фт`;
  /**
   * Грузоподъёмность — мягкий потолок: перевес разрешён, он даёт «Сильно нагружен»
   * со штрафом (encumbranceLevel), а не запрет на добавление. Предикат остался
   * только ради предупреждения заранее, чтобы перевес не случился незаметно.
   */
  function wouldExceedCapacity(additionalWeightLb: number): boolean {
    return totalWeightLb + additionalWeightLb > carryingCapacity;
  }
  const addItemOverloads = wouldExceedCapacity(catalogWeightLb(newItemName.trim()));
  const nextLevelXp = xpNeededForNextLevel(c.level);
  const levelUpReady = canLevelUp(c.level, c.experiencePoints);
  const portraitUrl = characterPortraitUrl(c.race, c.gender, c.portraitVariant);

  return (
    <li className="character-card">
      <div className="character-card__name dm-card-head">
        <UIIcon name="characters" />
        <span>{c.name}</span>
        <span className="character-card__header-actions dm-card-head__action">
          <button type="button" className="character-card__collapse" aria-expanded={!collapsed} aria-label={`${collapsed ? "Развернуть" : "Свернуть"} карточку ${c.name}`} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "Развернуть" : "Свернуть"}
          </button>
          <button className="character-card__delete" title="Удалить персонажа" onClick={onRemove}>✕</button>
        </span>
      </div>
      <div className="character-card__summary">
        <div className="character-card__portrait-frame">
          <img
            className="character-card__portrait"
            src={portraitUrl}
            alt={`Портрет персонажа ${c.name}: ${c.race || "раса не указана"}, ${c.gender || "пол не указан"}`}
            width="112"
            height="112"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="character-card__summary-main">
          <div className="character-card__meta dm-chip">
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
              <dd>
                <input
                  className="character-card__hp-input"
                  type="number"
                  min={0}
                  max={c.maxHp}
                  step={1}
                  aria-label={`Текущие хиты: ${c.name}`}
                  value={hpDraft ?? String(c.currentHp)}
                  onChange={(e) => editCurrentHp(e.currentTarget.value)}
                  // Уход из поля снимает черновик: оставленное пустым поле
                  // возвращается к тому, что в персонаже, а не обнуляет хиты.
                  onBlur={() => setHpDraft(null)}
                />
                /{c.maxHp}
              </dd>
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
              <dd>{pacedPassive}</dd>
              {pacePenalty > 0 && (
                <p className="character-card__stat-note">
                  {paceName} темп −{pacePenalty}
                </p>
              )}
            </div>
            <div className="character-card__stat">
              <dt>Вес</dt>
              <dd>{Math.round(totalWeightLb * 10) / 10} / {carryingCapacity} фнт.</dd>
            </div>
          </dl>
          <div className="character-card__encumbrance-scale">
            Нагружен с {encThresholds.encumberedFromLb} фнт. · Сильно нагружен свыше {encThresholds.heavilyEncumberedAboveLb} фнт.
          </div>
          {/*
            Подсказка про 0 хитов стоит ПОД плитками характеристик, а не между
            плиткой «Вес» и её шкалой нагрузки: шкала — подпись к плитке, и
            вклиниваться между ними значило бы разорвать пару. Место в шапке
            карточки, а не в теле: тело сворачивается кнопкой, а правило нуля
            хитов пропасть по сворачиванию не должно.

            Появляется РОВНО на нуле — при любом другом значении хитов лист
            выглядит как раньше, ни на пиксель иначе (просьба владельца
            25.09.2026: подсказка по событию, а не постоянная строка).
          */}
          {c.currentHp === 0 && (
            <section className="character-card__dying" aria-label={`Ноль хитов: ${c.name}`}>
              <strong className="character-card__dying-title">0 хитов — что дальше</strong>
              <ul className="character-card__dying-hints">
                {deathSaveHintLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="character-card__dying-counts">
                <DeathSaveRow
                  legend="Успехи"
                  count={deathSaves.successes}
                  total={DEATH_SAVE_SUCCESSES_TO_STABLE}
                  onSet={(box) => setDeathSaveCount("successes", box)}
                />
                <DeathSaveRow
                  legend="Провалы"
                  count={deathSaves.failures}
                  total={DEATH_SAVE_FAILURES_TO_DEATH}
                  onSet={(box) => setDeathSaveCount("failures", box)}
                />
              </div>
              {deathSaveStateNow !== "rolling" && (
                <p className="character-card__dying-state">{DEATH_SAVE_STATE_LABELS[deathSaveStateNow]}</p>
              )}
              <div className="character-card__add-row">
                <button
                  type="button"
                  onClick={rollDeathSave}
                  disabled={deathSaveRolling || deathSaveStateNow !== "rolling"}
                >
                  Спасбросок от смерти
                </button>
                {lastDeathSaveRoll !== null && (
                  <span className="character-card__dying-note">
                    Выпало {lastDeathSaveRoll} — {deathSaveVerdict(lastDeathSaveRoll)}.
                  </span>
                )}
                {deathSaveError && (
                  <span className="character-card__madness-error">Бросок не удался: {deathSaveError}</span>
                )}
              </div>
              <p className="character-card__hint">Правило целиком: {DEATH_SAVE_RULES_LINK}.</p>
            </section>
          )}
        </div>
      </div>
      {!collapsed && <div className="character-card__body">
      {encLevel !== "normal" && (
        <div className="character-card__danger character-card__danger--heavy">
          ⚠ {ENCUMBRANCE_LABELS[encLevel]} — скорость {effectiveSpeedFeet} фт (было {c.speedFeet} фт)
        </div>
      )}
      <details className="character-card__rest" open>
        <summary>Отдых</summary>
        <ul className="character-card__resource-list">
          <li className="character-card__item character-card__rest-actions dm-list-row">
            <strong>Кости Хитов</strong>{" "}
            <span className="character-card__resource-count">
              {hitDiceRemaining}/{c.level}
              {hitDie ? ` (1к${hitDie})` : ""}
            </span>
            <button
              type="button"
              title={`Потратить Кость Хитов: бросок 1к${hitDie ?? "?"} + модификатор Телосложения`}
              aria-disabled={hitDiceRemaining === 0 || !hitDie}
              className={hitDiceRemaining === 0 || !hitDie ? "character-card__danger" : undefined}
              onClick={spendHitDieRoll}
            >
              Потратить кость
            </button>
            <button type="button" onClick={takeShortRest}>
              Короткий отдых
            </button>
            <button
              type="button"
              title="Длинный отдых: все хиты, половина Костей Хитов, все ячейки, особенности и ступень истощения"
              aria-disabled={c.currentHp === 0}
              className={c.currentHp === 0 ? "character-card__danger" : undefined}
              onClick={takeLongRest}
            >
              Длинный отдых
            </button>
          </li>
        </ul>
        <div className="character-card__rest-hints">
          <p className="character-card__hint">{HIT_DICE_HINT}</p>
          <p className="character-card__hint">{SHORT_REST_HINT}</p>
          <p className="character-card__hint">{LONG_REST_HINT}</p>
        </div>
        {restNote && <p className="character-card__rest-note">{restNote}</p>}
      </details>
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
          {c.level >= MAX_LEVEL ? `Максимальный уровень (${MAX_LEVEL})` : "Повысить уровень"}
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
            Улучшение характеристик ({c.level + 1} уровень): «Некоторые из этих умений позволяют повысить значение ваших
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
            {/*
              Третья ветка того же выбора — необязательное правило по чертам
              (rules.json → character-feats): «вы можете отказаться от этой
              особенности, чтобы вместо неё взять черту». Отдельной панели у неё
              нет намеренно: это не второй выбор, а альтернатива первому, и
              разведи их по панелям — игрок смог бы взять и то и другое.
            */}
            {feats.length > 0 && (
              <label>
                <input type="radio" checked={asiMode === "feat"} onChange={() => setAsiModeAndReset("feat")} />{" "}
                черта вместо увеличения
              </label>
            )}
          </div>
          {asiMode === "feat" ? (
            <div className="character-card__asi-abilities character-card__asi-feats">
              {offeredFeats.map((feat) => (
                <label key={feat.id}>
                  <input
                    type="radio"
                    name="asi-feat"
                    checked={asiFeatId === feat.id}
                    onChange={() => setAsiFeatId(feat.id)}
                  />{" "}
                  <strong>{feat.name}</strong>
                  {feat.prerequisite && <> (требование: {prerequisiteText(feat.prerequisite)})</>} — {feat.description}
                </label>
              ))}
              {offeredFeats.length === 0 && (
                <p className="character-card__hint">
                  Доступных черт нет: все подходящие уже взяты или их требования не выполнены.
                </p>
              )}
              {/*
                Недоступная черта не предлагается — но и не исчезает молча:
                молчание игрок читает как «такой черты нет», а правило SRD
                говорит именно о требовании, которое надо выполнить. Причина
                приходит готовой строкой из feats.ts.
              */}
              {blockedFeats.length > 0 && (
                <ul className="character-card__traits character-card__asi-feats-blocked">
                  {blockedFeats.map(({ feat, reason }) => (
                    <li key={feat.id} className="character-card__hint">
                      <strong>{feat.name}</strong> — недоступна: {reason}
                    </li>
                  ))}
                </ul>
              )}
              {takenFeats.length > 0 && (
                <p className="character-card__hint">
                  Уже взято (каждую черту можно взять только раз):{" "}
                  {takenFeats.map((feat) => feat.name).join(", ")}
                </p>
              )}
            </div>
          ) : (
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
          )}
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
      {/*
        Взятые черты — своим блоком, жирным именем, как расовые и классовые
        особенности рядом (запись 17 в tasks/DONE.md: выбор, дающий особенность,
        обязан быть виден). Прибавки к характеристике здесь нет и быть не
        должно: она УЖЕ в `c.abilities` — черта применила её тем же левел-апом,
        — и вторая подпись «+1 к Силе» рядом с числом характеристики означала
        бы второго владельца этого числа.
      */}
      {takenFeats.length > 0 && (
        <details className="character-card__feats" open>
          <summary>Черты ({takenFeats.length})</summary>
          <ul className="character-card__traits">
            {takenFeats.map((feat) => (
              <li key={feat.id} className="typography-term-line">
                <strong>{feat.name}</strong> — {feat.description}
              </li>
            ))}
          </ul>
        </details>
      )}
      {raceTraits.length > 0 && (
        <details className="character-card__race-features" open>
          <summary>Расовые особенности ({raceTraits.length})</summary>
          {raceResourceList.length > 0 && (
            <ul className="character-card__resource-list">
              {raceResourceList.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  current={resourceCurrent(resource)}
                  max={resourceMax(resource, c.abilities)}
                  onSpend={() => spendResource(resource)}
                  onRestore={() => restoreResource(resource)}
                />
              ))}
            </ul>
          )}
          <ul className="character-card__traits">
            {raceTraits.map((trait) => (
              <li key={trait.name} className="typography-term-line">
                <strong>{trait.name}</strong> — {trait.description}
              </li>
            ))}
          </ul>
          {raceSpellLine && <p className="character-card__hint">{raceSpellLine}</p>}
        </details>
      )}
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
              {classResources.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  current={resourceCurrent(resource)}
                  max={resourceMax(resource, c.abilities)}
                  onSpend={() => spendResource(resource)}
                  onRestore={() => restoreResource(resource)}
                />
              ))}
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
                  <li key={option.id} className="character-card__item dm-list-row">
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
                    {/* Чем платится, уже сказано в подсказке кнопки «Применить» — здесь только что даёт. */}
                    <span className="character-card__hint">{option.description}</span>
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
            <li key={item.id} className="character-card__item dm-list-row">
              <strong>{item.name}</strong>
              <button type="button" onClick={() => adjustItemQuantity(item.id, -1)}>
                −
              </button>
              <span>{item.quantity}</span>
              <button
                type="button"
                className={wouldExceedCapacity(item.weightLb) ? "character-card__danger" : undefined}
                title={wouldExceedCapacity(item.weightLb) ? OVERLOAD_WARNING : undefined}
                onClick={() => adjustItemQuantity(item.id, 1)}
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
          <button type="button" className={addItemOverloads ? "character-card__danger" : undefined} onClick={addItem}>
            Добавить
          </button>
          {addItemOverloads && (
            <span className="character-card__hint">{OVERLOAD_WARNING}</span>
          )}
        </div>
      </details>

      <details className="character-card__coins" open>
        <summary>Деньги (итого {coinsTotalGold(c.coins)} зм)</summary>
        <ul>
          {COIN_DENOMINATIONS.map((denomination) => (
            <li key={denomination.key} className="character-card__item character-card__coin-row dm-list-row">
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
            {c.conditions.map((condition) => {
              const effectLines = conditionEffectLinesFor(condition);
              return (
                <li key={condition}>
                  <div className="character-card__condition-row">
                    <span className="dm-pill dm-pill--important">{condition}</span>{" "}
                    <button type="button" onClick={() => removeCondition(condition)}>
                      ✕
                    </button>
                  </div>
                  {effectLines && (
                    <ul className="character-card__condition-effect">
                      {effectLines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
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
        {madness && (
          <div className="character-card__add-row">
            <button
              type="button"
              onClick={raiseMadness}
              disabled={madnessRolling || nextMadnessLevel(c.conditions) === null}
            >
              Безумие +1
            </button>
            <span className="character-card__hint">
              Уровень безумия: {madnessLevelOf(c.conditions)} из {MADNESS_MAX_LEVEL}. {madness.resistance}
            </span>
            {madnessError && <span className="character-card__madness-error">Бросок не удался: {madnessError}</span>}
          </div>
        )}
      </details>

      {isSpellcaster && (
        <details className="character-card__spells" open>
          <summary>Заклинания</summary>
          {lastSurge && (
            <p className="character-card__spell-group">
              <strong>
                Дикий всплеск ({lastSurge.surge.roll}/{WILD_MAGIC_DIE}):
              </strong>{" "}
              <span className="character-card__spell-info">{lastSurge.surge.text}</span>
              {lastSurge.payback > 0 && (
                <>
                  {" "}
                  {WILD_MAGIC_PAYBACK_FEATURE}: +{lastSurge.payback} к очкам чар.
                </>
              )}
            </p>
          )}
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
          {(preparesOnSheet || c.castableSpells.length > 0) && (
            <div className="character-card__spell-group">
              {preparesOnSheet
                ? `Подготовленные заклинания (${prepared.prepared.length}/${prepared.max}):`
                : "Известные заклинания:"}
              <ul className="character-card__spell-list">
                {(preparesOnSheet ? prepared.prepared : c.castableSpells).map((id) => spellLine(id, preparesOnSheet))}
              </ul>
            </div>
          )}
          {preparesOnSheet && prepared.overflow > 0 && (
            <p className="character-card__danger">
              ⚠ Подготовлено {prepared.prepared.length} при норме {prepared.max} — сними {prepared.overflow}.
            </p>
          )}
          {preparesOnSheet && prepared.alwaysPrepared.length > 0 && (
            <div className="character-card__spell-group">
              Заклинания архетипа — всегда подготовлены, сверх нормы ({prepared.alwaysPrepared.length}):
              <ul className="character-card__spell-list">
                {prepared.alwaysPrepared.map((id) => spellLine(id, false))}
              </ul>
            </div>
          )}
          {hasSpellbook(classId) && (
            <div className="character-card__spell-group">
              Книга заклинаний ({book.spells.length}/{book.max}):
              <ul className="character-card__spell-list">
                {book.spells.map((id) => (
                  <li key={id}>
                    {spellName(id)} ({findSpell(id)?.level ?? 1} круг)
                    {c.castableSpells.includes(id) && <> — подготовлено</>}
                  </li>
                ))}
                {book.spells.length === 0 && <li>Книга пуста — впиши в неё заклинания ниже.</li>}
              </ul>
            </div>
          )}
          <div className="character-card__spell-group">
            <ul className="character-card__spell-list">
              {c.spellSlotsMax.map((max, i) => {
                if (max <= 0) return null;
                const circle = i + 1;
                const spent = spentSlots(c.spellSlotsCurrent, c.spellSlotsMax, circle);
                const typed = slotsToRestore[circle] ?? "1";
                return (
                  <li key={i}>
                    Ячейки {circle} круга: {c.spellSlotsCurrent[i] ?? 0}/{max}{" "}
                    <input
                      type="number"
                      className="character-card__slot-input"
                      min={1}
                      max={Math.max(1, spent)}
                      value={typed}
                      disabled={spent === 0}
                      aria-label={`Сколько ячеек ${circle} круга вернуть`}
                      onChange={(e) => {
                        // Значение снимается ДО setState: читать поля события
                        // внутри updater'а нельзя, он выполняется отложенно.
                        const value = e.target.value;
                        setSlotsToRestore((prev) => ({ ...prev, [circle]: value }));
                      }}
                    />
                    <button
                      type="button"
                      title={`Вернуть ячейки ${circle} круга (потрачено ${spent})`}
                      disabled={spent === 0}
                      onClick={() => restoreSpellSlotsOfCircle(circle, Number(typed))}
                    >
                      Вернуть
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={restoreSpellSlots}
              disabled={c.spellSlotsMax.every((_max, i) => spentSlots(c.spellSlotsCurrent, c.spellSlotsMax, i + 1) === 0)}
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
          {hasSpellbook(classId) && (
            <div className="character-card__asi">
              <p>
                Вписано в книгу: {book.spells.length} из {book.max}, положенных на {c.level} уровень (шесть на первом
                и по два за каждый следующий).
              </p>
              {book.free > 0 && writableNow.length > 0 && (
                <>
                  <p>
                    Вписать в книгу до {highestCircle} круга ({chosenForBook.length}/{book.free}):
                  </p>
                  <ul className="character-card__spell-list">
                    {writableNow.map((sp) => (
                      <li key={sp.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={chosenForBook.includes(sp.id)}
                            onChange={() => toggleLearn(sp.id, book.free, chosenForBook, setChosenForBook)}
                          />{" "}
                          {sp.name} ({sp.level} круг)
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="character-card__asi-actions">
                    <button type="button" disabled={chosenForBook.length === 0} onClick={writeToSpellbook}>
                      Вписать
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {preparesOnSheet && (
            <div className="character-card__asi">
              <p>
                Подготовлено {prepared.prepared.length} из {prepared.max} ({preparedSpellsFormulaLabel(classId, c.level)})
                {prepared.alwaysPrepared.length > 0 && (
                  <> — и ещё {prepared.alwaysPrepared.length} от архетипа сверх этой нормы</>
                )}
                .
              </p>
              {prepared.free > 0 && preparableNow.length > 0 && (
                <>
                  <p>
                    Подготовить до {highestCircle} круга ({chosenPrepared.length}/{prepared.free}):
                  </p>
                  <ul className="character-card__spell-list">
                    {preparableNow.map((sp) => (
                      <li key={sp.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={chosenPrepared.includes(sp.id)}
                            onChange={() => toggleLearn(sp.id, prepared.free, chosenPrepared, setChosenPrepared)}
                          />{" "}
                          {sp.name} ({sp.level} круг)
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="character-card__asi-actions">
                    <button type="button" disabled={chosenPrepared.length === 0} onClick={prepareChosen}>
                      Подготовить
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {preparesOnSheet && (
            <p className="character-card__spell-info">
              {hasSpellbook(classId) ? (
                <>
                  Класс готовит заклинания заново после длинного отдыха — из своей книги, а не из всего списка класса:
                  до {highestCircle} круга, список выше — то, что подготовлено сейчас.
                </>
              ) : (
                <>
                  Класс готовит заклинания заново после длинного отдыха: доступен весь список класса до {highestCircle}{" "}
                  круга, список выше — то, что подготовлено сейчас.
                </>
              )}
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

/**
 * Особенности расы по её названию (`Character.race` хранит текст, не id) — тем
 * же приёмом, что и `extractRaceHpBonus` выше. Список рас берётся у
 * `playableRaces`: девять из справочника SRD плюс наша десятая, и лист не
 * знает, какая из них откуда, — ему нужно только название и особенности.
 */
function extractRaceTraits(topics: RuleTopic[]): Record<string, RaceTrait[]> {
  const result: Record<string, RaceTrait[]> = {};
  for (const topic of playableRaces(topics)) {
    const traits = RACE_TRAITS[topic.id];
    if (traits && traits.length > 0) result[topic.title] = traits;
  }
  return result;
}

export function CharactersPage() {
  const { state, addCharacter, removeCharacter, updateCharacter } = useCampaign();
  const [panel, setPanel] = useState<Panel>("none");
  const [spells, setSpells] = useState<Spell[]>([]);
  const [presets, setPresets] = useState<CharacterPreset[]>([]);
  const [conditionEffects, setConditionEffects] = useState<Record<string, string[]>>({});
  const [madness, setMadness] = useState<MadnessRules | null>(null);
  const [classHitDiceByTitle, setClassHitDiceByTitle] = useState<Record<string, { id: string; max: number; average: number }>>({});
  const [raceHpBonusByTitle, setRaceHpBonusByTitle] = useState<Record<string, number>>({});
  const [raceTraitsByTitle, setRaceTraitsByTitle] = useState<Record<string, RaceTrait[]>>({});
  /**
   * Черты приложения. Начальное значение — НАШИ черты, а не пустой список:
   * справочник нужен ровно одной из них (SRD-«Борец» лежит в `rules.json` и
   * оттуда читается, см. `allFeats`), а остальные четырнадцать не зависят от
   * загрузки вовсе. Пустой старт устроил бы панели левел-апа мигание: ветка
   * «черта вместо увеличения» сперва отсутствовала бы, потом появлялась.
   */
  const [feats, setFeats] = useState<Feat[]>(() => allFeats([]));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<Spell[] | null>("get_spells")
      .then((loaded) => setSpells(loaded ?? []))
      .catch((e) => setError(String(e)));
    invoke<CharacterPreset[] | null>("get_character_presets")
      .then((loaded) => setPresets(loaded ?? []))
      .catch((e) => setError(String(e)));
    invoke<RuleTopic[] | null>("get_rules")
      .then((loaded) => {
        // Все три extract* обходят список — пустой список здесь честнее взрыва.
        const topics = loaded ?? [];
        setConditionEffects(extractConditionEffects(topics));
        setMadness(readMadnessRules(topics));
        setClassHitDiceByTitle(extractClassHitDice(topics));
        setRaceHpBonusByTitle(extractRaceHpBonus(topics));
        setRaceTraitsByTitle(extractRaceTraits(topics));
        setFeats(allFeats(topics));
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="characters-page">
      <div className="characters-page__heading dm-card-head">
        <UIIcon name="characters" />
        <h2>Персонажи</h2>
        <button
          className={"characters-page__action characters-page__action--compact dm-card-head__action dm-button--primary" + (panel === "wizard" ? " characters-page__action--active" : "")}
          onClick={() => setPanel(panel === "wizard" ? "none" : "wizard")}
        >
          Создать персонажа по правилам
        </button>
      </div>

      {error && (
        <p className="characters-page__error">Не удалось загрузить справочные данные: {error}</p>
      )}

      {panel === "wizard" && <CharacterWizard onDone={() => setPanel("none")} />}

      <ul className="characters-page__list">
        {state.characters.map((c) => (
          <CharacterCard
            key={c.id}
            character={c}
            spells={spells}
            conditionEffects={conditionEffects}
            madness={madness}
            classHitDiceByTitle={classHitDiceByTitle}
            raceHpBonusByTitle={raceHpBonusByTitle}
            raceTraitsByTitle={raceTraitsByTitle}
            feats={feats}
            turnKey={wildMagicTurnKey(state.combat)}
            travelPace={travelOf(state.travel).pace}
            onRemove={() => {
              if (window.confirm(`Удалить персонажа «${c.name}»? Это необратимо.`)) {
                removeCharacter(c.id);
              }
            }}
            /*
              Воронка листа: КАЖДАЯ запись в персонажа проходит здесь, какой бы
              кнопкой она ни началась. Поэтому нормализация счётчиков
              спасбросков стоит одна и ровно тут, а не на пяти путях записи
              хитов (ввод игрока, Кость Хитов, длинный отдых, пул лечения
              архетипа, левел-ап): пять владельцев одного факта разошлись бы, а
              шестой путь прошёл бы мимо всех пяти — см. normalizeDeathSaves.
            */
            onUpdate={(updater) => updateCharacter(c.id, (ch) => normalizeDeathSaves(updater(ch)))}
          />
        ))}
        {state.characters.length === 0 && (
          <li className="characters-page__empty">Персонажей пока нет.</li>
        )}
      </ul>

      <div className="characters-page__actions">
        <button
          className={"characters-page__action dm-tab" + (panel === "presets" ? " characters-page__action--active is-selected" : "")}
          onClick={() => setPanel(panel === "presets" ? "none" : "presets")}
        >
          Взять готового персонажа
        </button>
      </div>

      {panel === "presets" && (
        <ul className="characters-page__list">
          {presets.map((preset) => (
            <li key={preset.id}>
              <button
                className="characters-page__action dm-tab"
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
