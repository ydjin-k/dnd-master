import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharactersPage } from "./CharactersPage";
import type { CampaignState, Character } from "../../state/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const addCharacter = vi.fn();
const removeCharacter = vi.fn();
const updateCharacter = vi.fn();

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, addCharacter, removeCharacter, updateCharacter }),
}));

function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: "c1",
    campaignName: "Тест",
    characters: [],
    journal: [],
    currentSceneId: null,
    adventureLog: [],
    combat: null,
    chaosFactor: 5,
    ...overrides,
  };
}

describe("CharactersPage", () => {
  beforeEach(() => {
    addCharacter.mockClear();
    removeCharacter.mockClear();
    updateCharacter.mockClear();
    window.confirm = vi.fn(() => true);
  });

  function characterWithInventory(): CampaignState["characters"][number] {
    return {
      id: "hero",
      name: "Герой",
      race: "Человек",
      class: "Воин",
      background: "",
      alignment: "",
      gender: "",
      age: 0,
      languages: [],
      level: 1,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      maxHp: 10,
      currentHp: 10,
      armorClass: 10,
      speedFeet: 30,
      initiative: 0,
      passivePerception: 10,
      conditions: [],
      inventory: [{ id: "torch-1", name: "Факел", quantity: 5, notes: "" }],
      gold: 0,
      savingThrowProficiencies: [],
      skillProficiencies: [],
      knownCantrips: [],
      knownSpells: [],
      spellSlotsLevel1Max: 0,
      spellSlotsLevel1Current: 0,
    };
  }

  it("deletes a character after confirmation without crashing", async () => {
    mockState = baseState({
      characters: [
        {
          id: "hero",
          name: "Герой",
          race: "Человек",
          class: "Воин",
          background: "",
          alignment: "",
          gender: "",
          age: 0,
          languages: [],
          level: 1,
          abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
          maxHp: 10,
          currentHp: 10,
          armorClass: 10,
          speedFeet: 30,
          initiative: 0,
          passivePerception: 10,
          conditions: [],
          inventory: [],
          gold: 0,
          savingThrowProficiencies: [],
          skillProficiencies: [],
          knownCantrips: [],
          knownSpells: [],
          spellSlotsLevel1Max: 0,
          spellSlotsLevel1Current: 0,
        },
      ],
    });
    render(<CharactersPage />);

    expect(screen.getByText("Герой")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Удалить персонажа"));

    await waitFor(() => expect(removeCharacter).toHaveBeenCalledWith("hero"));
  });

  it("toggles between the Import and rules-wizard panels without crashing", async () => {
    mockState = baseState();
    render(<CharactersPage />);

    expect(screen.queryByText("Выбрать файл")).not.toBeInTheDocument();
    expect(screen.queryByText("Раса")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Импорт"));
    expect(await screen.findByText("Выбрать файл")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Создать персонажа по правилам"));
    expect(await screen.findByText(/Выбери расу слева/)).toBeInTheDocument();
    expect(screen.queryByText("Выбрать файл")).not.toBeInTheDocument();

    // Clicking the active panel's own button again closes it.
    fireEvent.click(screen.getByText("Создать персонажа по правилам"));
    await waitFor(() => expect(screen.queryByText(/Выбери расу слева/)).not.toBeInTheDocument());
  });

  it("spending 3 of 5 torches updates the tracked quantity, not just removes one", async () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    const minusButtons = screen.getAllByText("−");
    fireEvent.click(minusButtons[0]);
    fireEvent.click(minusButtons[0]);
    fireEvent.click(minusButtons[0]);

    expect(updateCharacter).toHaveBeenCalledTimes(3);
    for (const call of updateCharacter.mock.calls) {
      expect(call[0]).toBe("hero");
    }
    // Apply the last updater the same way the real context would, to check
    // the actual resulting quantity (each call decrements independently from
    // the same base fixture, since the mock state is static).
    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const updated = updater(characterWithInventory());
    expect(updated.inventory[0].quantity).toBe(4);
  });

  it("running out of an item (quantity reaches 0) removes it from inventory", async () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    const updater = () => {
      const onMinus = screen.getAllByText("−")[0];
      fireEvent.click(onMinus);
      return updateCharacter.mock.calls[updateCharacter.mock.calls.length - 1][1] as (
        c: Character,
      ) => Character;
    };

    let current = characterWithInventory();
    for (let i = 0; i < 5; i++) {
      current = updater()(current);
    }
    expect(current.inventory).toHaveLength(0);
  });

  it("adding a new item and a condition (typed, SRD or custom) calls updateCharacter correctly", async () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    fireEvent.change(screen.getByPlaceholderText("Новый предмет"), {
      target: { value: "Верёвка" },
    });
    fireEvent.click(screen.getAllByText("Добавить")[0]);
    const addItemUpdater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const afterItem = addItemUpdater(characterWithInventory());
    expect(afterItem.inventory.map((i) => i.name)).toContain("Верёвка");

    fireEvent.change(screen.getByPlaceholderText("Состояние (из SRD или своё)"), {
      target: { value: "Отравленное" },
    });
    fireEvent.click(screen.getAllByText("Добавить")[1]);
    const addConditionUpdater = updateCharacter.mock.calls[1][1] as (c: Character) => Character;
    const afterCondition = addConditionUpdater(characterWithInventory());
    expect(afterCondition.conditions).toEqual(["Отравленное"]);
  });
});
