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

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  subclass: string;
  background: string;
  alignment: string;
  gender: string;
  age: number;
  languages: string[];
  level: number;
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
  knownCantrips: string[];
  knownSpells: string[];
  spellSlotsLevel1Max: number;
  spellSlotsLevel1Current: number;
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
  imageAttribution: string | null;
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
