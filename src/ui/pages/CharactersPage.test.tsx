import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharactersPage } from "./CharactersPage";
import type { CampaignState } from "../../state/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));

const addCharacter = vi.fn();
const removeCharacter = vi.fn();

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, addCharacter, removeCharacter }),
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
    ...overrides,
  };
}

describe("CharactersPage", () => {
  beforeEach(() => {
    addCharacter.mockClear();
    removeCharacter.mockClear();
    window.confirm = vi.fn(() => true);
  });

  it("deletes a character after confirmation without crashing", async () => {
    mockState = baseState({
      characters: [
        {
          id: "hero",
          name: "Герой",
          race: "Человек",
          class: "Воин",
          background: "",
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
        },
      ],
    });
    render(<CharactersPage />);

    expect(screen.getByText("Герой")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Удалить персонажа"));

    await waitFor(() => expect(removeCharacter).toHaveBeenCalledWith("hero"));
  });

  it("quick-add form creates a character with defaults and does not crash", async () => {
    mockState = baseState();
    render(<CharactersPage />);

    fireEvent.click(screen.getByText("Быстрое добавление (без мастера)"));
    fireEvent.change(screen.getByPlaceholderText("Имя"), { target: { value: "Быстрый Герой" } });
    fireEvent.click(screen.getByText("Добавить"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0];
    expect(character.name).toBe("Быстрый Герой");
    expect(character.speedFeet).toBe(30);
  });
});
