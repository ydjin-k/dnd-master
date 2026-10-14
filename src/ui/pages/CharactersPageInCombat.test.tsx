import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CharactersPage } from "./CharactersPage";
import { emptyCoins, type CampaignState, type Character, type Combatant } from "../../state/types";

/**
 * Воронка листа (`onUpdate` → `normalizeDeathSaves`) в бою. Пока персонаж
 * стоит в бою, «лежит ли он» решают БОЕВЫЕ хиты: лист ещё помнит 12 хитов (их
 * переносит только кнопка), а счёт, набранный в трекере, любая правка листа
 * стирать не должна. Отрицательная проба: убрать `state.combat` из воронки в
 * `CharactersPage.tsx` — и счёт 1/1 обнулится от добавленного состояния.
 */

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../audio/uiSounds", () => ({
  playCoinsSound: vi.fn(),
  playLevelUpSound: vi.fn(),
  playLimitSound: vi.fn(),
  playSpellCastSound: vi.fn(),
}));
vi.mock("../../state/DiceLogContext", () => ({ useDiceLog: () => ({ recordRoll: vi.fn() }) }));

const updateCharacter = vi.fn();
let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({
    state: mockState,
    addCharacter: vi.fn(),
    removeCharacter: vi.fn(),
    updateCharacter,
  }),
}));

function hero(over: Partial<Character>): Character {
  return {
    halfDaysWithoutFood: 0,
    id: "hero",
    name: "Герой",
    race: "",
    class: "",
    subclass: "",
    background: "",
    personalityTraits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    alignment: "",
    gender: "",
    portraitVariant: 1,
    age: 0,
    height: "",
    weight: "",
    eyes: "",
    skin: "",
    hair: "",
    appearance: "",
    backstory: "",
    allies: "",
    treasures: "",
    languages: [],
    raceVariant: "",
    favoredEnemy: "",
    knownTerrain: "",
    level: 1,
    experiencePoints: 0,
    abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    maxHp: 12,
    currentHp: 12,
    deathSaveSuccesses: 1,
    deathSaveFailures: 1,
    hitDiceSpent: 0,
    armorClass: 14,
    speedFeet: 30,
    initiative: 3,
    passivePerception: 11,
    conditions: [],
    inventory: [],
    coins: emptyCoins(),
    savingThrowProficiencies: [],
    armorProficiencies: [],
    weaponProficiencies: [],
    toolProficiencies: [],
    fightingStyle: "",
    skillProficiencies: [],
    knownCantrips: [],
    castableSpells: [],
    spellbook: [],
    spellSlotsMax: [0, 0, 0, 0, 0],
    spellSlotsCurrent: [0, 0, 0, 0, 0],
    featureUses: [],
    subclassChoices: {},
    classChoices: {},
    feats: [],
    ...over,
  };
}

function inCombat(currentHp: number): Combatant {
  return {
    id: "hero",
    source: { kind: "character", characterId: "hero" },
    maxHp: 12,
    currentHp,
    initiativeRoll: null,
    playerRules: false,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
  };
}

function campaign(character: Character, combatHp: number | null): CampaignState {
  return {
    travel: null,
    id: "c1",
    campaignName: "Тест",
    characters: [character],
    journal: [],
    combat: combatHp === null ? null : { combatants: [inCombat(combatHp)], currentTurnIndex: 0, round: 1 },
  };
}

/** Любая запись листа — здесь добавленное состояние; возвращает персонажа после воронки. */
function writeThroughSheet(character: Character): Character {
  render(<CharactersPage />);
  const input = screen.getByPlaceholderText("Состояние (из SRD или своё)");
  fireEvent.change(input, { target: { value: "Ослеплённое" } });
  fireEvent.click(within(input.closest("div")!).getByText("Добавить"));
  expect(updateCharacter).toHaveBeenCalledTimes(1);
  const [, updater] = updateCharacter.mock.calls[0] as [string, (c: Character) => Character];
  return updater(character);
}

describe("воронка листа, пока персонаж в бою", () => {
  beforeEach(() => updateCharacter.mockClear());

  it("в бою на нуле хитов правка листа не стирает счёт, хотя на листе 12 хитов", () => {
    const character = hero({ currentHp: 12 });
    mockState = campaign(character, 0);
    const next = writeThroughSheet(character);
    expect(next.conditions).toEqual(["Ослеплённое"]);
    expect([next.deathSaveSuccesses, next.deathSaveFailures]).toEqual([1, 1]);
  });

  it("в бою поднят лечением — счёт обнуляется, хотя на листе 0 хитов", () => {
    const character = hero({ currentHp: 0 });
    mockState = campaign(character, 4);
    const next = writeThroughSheet(character);
    expect([next.deathSaveSuccesses, next.deathSaveFailures]).toEqual([0, 0]);
  });

  it("без боя решают хиты листа, как до трекера", () => {
    const character = hero({ currentHp: 12 });
    mockState = campaign(character, null);
    const next = writeThroughSheet(character);
    expect([next.deathSaveSuccesses, next.deathSaveFailures]).toEqual([0, 0]);
  });
});
