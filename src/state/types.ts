export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  notes: string;
  weightLb: number;
}

export interface Coins {
  copper: number;
  silver: number;
  electrum: number;
  gold: number;
  platinum: number;
}

/**
 * Потраченные использования классового ресурса с ограниченным числом раз
 * (Ярость, Ци, Проведение энергии, Наложение рук…). Максимум здесь НЕ хранится:
 * его владелец — таблица прогрессии класса (`classProgression.ts`), иначе
 * сохранённое число расходилось бы с таблицей у старых персонажей.
 */
export interface FeatureUses {
  featureId: string;
  usesCurrent: number;
}

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  subclass: string;
  background: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  alignment: string;
  gender: string;
  /** Вариант портрета 1–3; старые сохранения без поля показывают вариант 1. */
  portraitVariant: number;
  age: number;
  /**
   * Описательные поля листа персонажа (рост/вес/глаза/кожа/волосы, внешность,
   * предыстория, союзники, сокровища). Ни один расчёт их не читает — это текст
   * для игрока, и владелец у него один: сам лист (или поле карточки, если
   * игрок правит его руками).
   *
   * `height`/`weight` — строки, а не числа: на листах игроки пишут единицы как
   * хотят («168 СМ (5.5 фут)», «3,5 фута», «145»), и превращать это в число
   * значило бы выдумать за них систему единиц.
   */
  height: string;
  weight: string;
  eyes: string;
  skin: string;
  hair: string;
  appearance: string;
  backstory: string;
  allies: string;
  treasures: string;
  languages: string[];
  /** Избранный враг Следопыта (SRD 5.1, «Любимый враг») — пусто у не-Следопытов. */
  favoredEnemy: string;
  /** Известная местность Следопыта (SRD 5.1, «Исследователь природы») — пусто у не-Следопытов. */
  knownTerrain: string;
  level: number;
  experiencePoints: number;
  abilities: AbilityScores;
  maxHp: number;
  currentHp: number;
  /**
   * Сколько Костей Хитов потрачено. Хранится ПОТРАЧЕНО, а не ОСТАЛОСЬ: у
   * сохранения, записанного до появления поля, здесь ноль, и ноль обязан
   * значить «запас полон» — «осталось» сделало бы ноль неотличимым от пустого
   * запаса. Максимум не хранится вовсе: по SRD костей ровно столько, каков
   * уровень персонажа, поэтому остаток считает `hitDice.ts` — единственный
   * владелец предела (тем же правилом, которым максимум ресурса принадлежит
   * таблице прогрессии, а не сохранению).
   */
  hitDiceSpent: number;
  armorClass: number;
  speedFeet: number;
  initiative: number;
  passivePerception: number;
  conditions: string[];
  inventory: InventoryItem[];
  coins: Coins;
  savingThrowProficiencies: string[];
  skillProficiencies: string[];
  /** Категории доспехов (`ArmorProficiency` в characterCreationData.ts) — снимок класса + архетипа. */
  armorProficiencies: string[];
  /** Владение оружием: категории "simple"/"martial" и отдельные виды по названию. */
  weaponProficiencies: string[];
  /** Владение инструментами по названию набора — снимок таблицы архетипа, как и владения выше. */
  toolProficiencies: string[];
  /** Боевой стиль воина, выбранный при создании — «Оборона» даёт +1 КД в доспехе. */
  fightingStyle: string;
  knownCantrips: string[];
  /**
   * Что персонаж может творить ячейкой прямо сейчас. Одно имя честно для обоих
   * составов, потому что называет не происхождение списка, а право на
   * применение: у класса с известным списком (Бард/Колдун/Чародей/Следопыт)
   * сюда попадает выученное навсегда, у класса с подготовкой
   * (Жрец/Друид/Волшебник/Паладин) — подготовленное после последнего отдыха
   * (см. preparedSpells.ts). Единственный, кто это право проверяет, —
   * `cast_spell_action` в Rust: заклинания не из этого списка он не пускает.
   *
   * `spellbook` — третья сущность, а не синоним: книга это «выучено вообще», и
   * творить она сама по себе не даёт. Заговоры — четвёртая: они в
   * `knownCantrips`, ячейку не тратят и подготовки не требуют, поэтому слово
   * «известные» у них честное, а здесь было бы ложью для половины классов.
   *
   * Старые сохранения несут это поле под прежним именем `knownSpells`; читает
   * их serde-alias на стороне Rust (`model.rs`), и снимать его нельзя — см.
   * пробу `legacy_campaign_with_known_spells_keeps_every_spell_after_rename`.
   */
  castableSpells: string[];
  /**
   * Книга заклинаний Волшебника (SRD 5.1, «Книга заклинаний») — что вообще
   * выучено; источник, из которого готовится `castableSpells`. У остальных
   * классов пуста: книга есть только у Волшебника, и единственный владелец
   * этого факта — `spellbook.ts`.
   */
  spellbook: string[];
  /** Ячейки заклинаний по кругам 1..9 — индекс 0 это 1 круг (см. SPELL_CIRCLES в classProgression.ts). */
  spellSlotsMax: number[];
  spellSlotsCurrent: number[];
  featureUses: FeatureUses[];
  /**
   * Выбор игрока внутри архетипа (`SubclassChoice.id` → id выбранных
   * `options`), напр. «Добыча охотника» Следопыта. Отдельно от `featureUses`:
   * это не расходуемый ресурс, а разовый выбор, который держит эффект
   * навсегда — см. `effectiveSubclassGrants` в characterCreationData.ts.
   */
  subclassChoices: Record<string, string[]>;
}

export interface JournalEntry {
  id: string;
  timestamp: string;
  text: string;
}

export interface Combatant {
  id: string;
  name: string;
  isMonster: boolean;
  x: number;
  y: number;
  speedFeet: number;
  maxHp: number;
  currentHp: number;
  armorClass: number;
  /** Нет вовсе, если у существа нет ни одной атаки в стат-блоке SRD:
   *  такой боец стоит на поле и получает урон, но атаковать ему нечем. */
  attackBonus?: number;
  damageDice?: string;
  initiative: number;
  feetMovedThisTurn: number;
}

export interface CombatState {
  gridWidth: number;
  gridHeight: number;
  combatants: Combatant[];
  turnOrder: string[];
  currentTurnIndex: number;
  round: number;
  log: string[];
  finished: boolean;
}

/** Спасбросок из шапки стат-блока. `ability` — ключ `AbilityScores`, русскую
 *  подпись к нему даёт `ABILITY_LABELS`, а не вторая копия в данных. */
export interface MonsterSavingThrow {
  ability: keyof AbilityScores;
  bonus: number;
}

/** Навык из шапки стат-блока; `skill` — имя из `ALL_SKILLS`. */
export interface MonsterSkill {
  skill: string;
  bonus: number;
}

/** Чувство с дальностью: «тёмное зрение», 60. */
export interface MonsterSense {
  name: string;
  rangeFeet: number;
}

/**
 * Чей это контент — и, значит, какой подписью его подписывает вкладка
 * «Бестиарий». Зеркало `MonsterOrigin` в `src-tauri/src/combat.rs`.
 *
 * Значение приезжает от Rust и НЕ лежит в данных: его ставит загрузчик по
 * файлу, из которого запись прочитана (`bestiary.json` — SRD, CC BY 4.0;
 * `own-creatures.json` — наше). Один владелец факта: подписать наше существо
 * переводом SRD можно было бы только переложив файл, а не забыв поле.
 */
export type MonsterOrigin = "srd" | "own";

/**
 * Запись существа — полный стат-блок.
 *
 * Необязательные поля ОТСУТСТВУЮТ у существа, которому они не положены, а не
 * стоят пустыми: пустая строка в карточке читается как потерянные данные.
 * Зеркало этой схемы — `MonsterTemplate` в `src-tauri/src/combat.rs`;
 * расхождение ловит проба `monster_template_matches_frontend_type`.
 */
export interface MonsterTemplate {
  id: string;
  name: string;
  /** Ставится загрузчиком по файлу-источнику, см. `MonsterOrigin`. */
  origin: MonsterOrigin;
  maxHp: number;
  /** Кости хитов из той же строки, что и `maxHp`: «58 (9d8 + 18)» → «9d8+18».
   *  Запись как у `damageDice`. Обязательное: кости есть в каждом стат-блоке
   *  SRD 5.1, у которого есть опасность. */
  hitDice: string;
  armorClass: number;
  speedFeet: number;
  attackBonus?: number;
  damageDice?: string;
  challengeRating: string;
  creatureType: string;
  size: string;
  description: string;
  abilities: AbilityScores;
  passivePerception: number;
  savingThrows?: MonsterSavingThrow[];
  skills?: MonsterSkill[];
  damageVulnerabilities?: string[];
  damageResistances?: string[];
  damageImmunities?: string[];
  conditionImmunities?: string[];
  senses?: MonsterSense[];
  languages?: string[];
  traits: string[];
  actions: string[];
  reactions?: string[];
  legendaryActions?: string[];
  imageAsset: string | null;
}

/**
 * Как закончилась сцена (§7.2). Зеркало `SceneOutcome` в
 * `src-tauri/src/gm/scene.rs`.
 */
export type SceneOutcome = "calmer" | "unchanged" | "worse";

export type SceneStatus = "active" | "resolved";

/** Состояние сцены (§4.2). Читается, но не собирается на фронте: сцену
 *  создаёт и меняет движок, интерфейс её только показывает. */
export interface SceneState {
  id: string;
  status: SceneStatus;
  location: string;
  objective: string;
  tension: number;
  participants: string[];
  activeThreats: string[];
  sceneTags: string[];
  startedAtTurn: number;
  resolvedConditions: string[];
}

/**
 * Строка лога приключения — КЛЮЧ И ЧИСЛА, а не готовая фраза.
 *
 * Владелец текста один, и это интерфейс (`src/ui/gm/adventureLog.ts`): движок
 * владеет тем, что произошло, интерфейс — тем, как это звучит по-русски.
 * Иначе одна и та же фраза жила бы в Rust и в TS сразу.
 */
/** Четыре исхода Оракула (§6.2). Зеркало `Outcome` в `src-tauri/src/gm/oracle.rs`. */
export type OracleOutcome = "strongYes" | "yes" | "no" | "strongNo";

export type LogLine =
  | { kind: "sceneStarted"; location: string; objective: string; tension: number }
  | {
      kind: "sceneEnded";
      location: string;
      objective: string;
      outcome: SceneOutcome;
      tensionBefore: number;
      tensionAfter: number;
    }
  | {
      kind: "oracleAnswered";
      /** Текст мастера. Хранится для человека, в решении не участвует (§29.2). */
      question: string;
      subject: string;
      predicate: string;
      /** Итоговая вероятность после модификатора (§6.4). */
      probability: number;
      /** `null` — броска НЕ БЫЛО, ответ пришёл из факта (§6.3). */
      roll: number | null;
      outcome: OracleOutcome;
      value: boolean;
    };

export interface LogEntry {
  id: string;
  turn: number;
  line: LogLine;
}

/** Откуда факт взялся (§4.6). Зеркало `FactSource` в `src-tauri/src/gm/facts.rs`. */
export type FactSource = "oracle" | "exploration" | "event" | "master";

/** Достоверность (§4.6). Шкалы в v0.1 нет намеренно — одно значение. */
export type Certainty = "confirmed";

/**
 * Подтверждённый факт мира (§4.6).
 *
 * Пара «субъект + предикат» — личность факта: двух фактов с одной парой в
 * состоянии не бывает, второе создание движок отклоняет (§6.3). Собирать факт
 * на фронте нельзя — его создаёт команда движка.
 */
export interface Fact {
  id: string;
  subject: string;
  predicate: string;
  value: boolean;
  source: FactSource;
  certainty: Certainty;
}

/**
 * Курсор потока ГСЧ кампании (§22).
 *
 * Числа СТРОКАМИ, и это не небрежность: `u64` в Rust больше, чем точное целое
 * в JavaScript, и число в JSON потеряло бы младшие разряды — то есть отладочный
 * экран показал бы не то состояние, с которым бросал движок. Считать их здесь
 * нечем и не нужно: они только показываются.
 */
export interface RngCursor {
  state: string;
  draws: string;
}

/** Типизированное изменение состояния (§33 без строковых путей). */
export type Mutation =
  | ({ kind: "sceneCreated" } & SceneState)
  | { kind: "sceneEnded"; outcome: SceneOutcome; tension: number }
  | { kind: "logged"; id: string; turn: number; line: LogLine }
  | ({ kind: "rngAdvanced" } & RngCursor)
  | ({ kind: "factCreated" } & Fact)
  | { kind: "factUpdated"; id: string; value: boolean; source: FactSource };

export interface Transaction {
  id: number;
  turn: number;
  action: string;
  mutations: Mutation[];
}

export interface RollTrace {
  die: string;
  value: number;
  modifier: number;
  total: number;
  target: number | null;
}

/** Ответ команды движка (§33). `trace` живёт один ответ и в состояние не
 *  попадает — его заполняет тот, кто принял решение. */
export interface ResultObject {
  success: boolean;
  resultType: string;
  summaryKey: string;
  rolls: RollTrace[];
  stateChanges: Mutation[];
  generatedEvents: string[];
  choices: string[];
  trace: string[];
}

/**
 * Состояние движка мастера. Поля приватны на стороне Rust и меняются только
 * через `mutate::apply` — здесь они только читаются. Своего `useState` на эти
 * данные заводить нельзя: это признак опровержения решения ADR 0001
 * (раздел 4, признак 2).
 */
export interface EngineState {
  scene: SceneState | null;
  /** Лог приключения — игроку. Дневник кампании движок не трогает вовсе. */
  adventureLog: LogEntry[];
  /** Журнал транзакций — движку, наружу не показывается (§29.2). */
  history: Transaction[];
  turn: number;
  /** Подтверждённые факты мира (§4.6) — показываются в панели «Активно». */
  facts: Fact[];
  /** Сид кампании (§22). Ставится один раз при рождении движка и не меняется
   *  ничем; показывается на отладочном экране. Строкой — см. `RngCursor`. */
  seed: string;
  /** Состояние потока ГСЧ. Двигает только `gm/rng.rs`. */
  rngState: string;
  /** Сколько обращений к ГСЧ уже было — «обращение №14» на отладке. */
  rngDraws: string;
}

/** Что возвращает команда движка: состояние для показа и ответ для объяснения. */
export interface GmResponse {
  state: CampaignState;
  result: ResultObject;
}

export interface CampaignState {
  id: string;
  campaignName: string;
  characters: Character[];
  journal: JournalEntry[];
  combat: CombatState | null;
  /** Состояние движка мастера. `null` у кампаний, созданных до него. */
  engine: EngineState | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  characterCount: number;
}

export type RuleBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][] };

export interface RuleTopic {
  id: string;
  category: string;
  title: string;
  sourceUrl: string;
  blocks: RuleBlock[];
}

export interface Spell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  description: string;
  damageDice: string | null;
  damageType: string | null;
  attackRoll: boolean;
  savingThrow: string | null;
}

export interface AbilityScoreRoll {
  dice: number[];
  droppedIndex: number;
  total: number;
}

export interface RollResult {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  dropped: number[] | null;
}

export const emptyCoins = (): Coins => ({
  copper: 0,
  silver: 0,
  electrum: 0,
  gold: 0,
  platinum: 0,
});

export const emptyAbilityScores = (): AbilityScores => ({
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
});

export const emptyCampaignState = (): CampaignState => ({
  id: "",
  campaignName: "",
  characters: [],
  journal: [],
  combat: null,
  engine: null,
});
