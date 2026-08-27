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

export interface CampaignState {
  campaignName: string;
  characters: Character[];
  journal: JournalEntry[];
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
});
