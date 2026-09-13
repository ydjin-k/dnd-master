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
   * У класса с известным списком (Бард/Колдун/Чародей/Следопыт) — что персонаж
   * знает, у класса с подготовкой (Жрец/Друид/Волшебник/Паладин) — что
   * подготовлено сейчас (см. preparedSpells.ts). Имя оставлено прежним
   * намеренно: переименование задело бы пресеты, Rust и сохранения.
   */
  knownSpells: string[];
  /**
   * Книга заклинаний Волшебника (SRD 5.1, «Книга заклинаний») — что вообще
   * выучено; источник, из которого готовится `knownSpells`. У остальных
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

export type AdventureLogEntry =
  | { kind: "scene"; text: string }
  | { kind: "choice"; text: string }
  | { kind: "roll"; text: string }
  | { kind: "custom"; text: string }
  | { kind: "oracle"; text: string };

export type Likelihood =
  | "almost-never"
  | "unlikely"
  | "some-chance"
  | "even"
  | "likely"
  | "very-likely"
  | "almost-sure";

export interface LikelihoodOption {
  id: Likelihood;
  label: string;
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
  attackBonus: number;
  damageDice: string;
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

export interface MonsterTemplate {
  id: string;
  name: string;
  maxHp: number;
  armorClass: number;
  speedFeet: number;
  attackBonus: number;
  damageDice: string;
  challengeRating: string;
  creatureType: string;
  size: string;
  description: string;
  traits: string[];
  actions: string[];
  imageAsset: string | null;
}

export interface CampaignState {
  id: string;
  campaignName: string;
  characters: Character[];
  journal: JournalEntry[];
  currentSceneId: string | null;
  adventureLog: AdventureLogEntry[];
  combat: CombatState | null;
  chaosFactor: number;
}

export interface SceneOption {
  id: string;
  label: string;
  nextSceneId: string | null;
  tableId: string | null;
}

export interface Scene {
  id: string;
  text: string;
  options: SceneOption[];
}

export interface TableEntry {
  weight: number;
  text: string;
  nextSceneId: string | null;
}

export interface EncounterTable {
  id: string;
  name: string;
  entries: TableEntry[];
}

export interface Adventure {
  startSceneId: string;
  scenes: Scene[];
  tables: EncounterTable[];
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
  currentSceneId: null,
  adventureLog: [],
  combat: null,
  chaosFactor: 5,
});
