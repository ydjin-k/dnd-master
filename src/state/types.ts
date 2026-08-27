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
}

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  abilities: AbilityScores;
  maxHp: number;
  currentHp: number;
  armorClass: number;
  conditions: string[];
  inventory: InventoryItem[];
  gold: number;
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
  | { kind: "custom"; text: string };

export interface CampaignState {
  campaignName: string;
  characters: Character[];
  journal: JournalEntry[];
  currentSceneId: string | null;
  adventureLog: AdventureLogEntry[];
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

export interface RollResult {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  dropped: number[] | null;
}

export const emptyAbilityScores = (): AbilityScores => ({
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
});

export const emptyCampaignState = (): CampaignState => ({
  campaignName: "",
  characters: [],
  journal: [],
  currentSceneId: null,
  adventureLog: [],
});
