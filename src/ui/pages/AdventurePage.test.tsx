import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdventurePage } from "./AdventurePage";
import type { Adventure, CampaignState } from "../../state/types";

const adventure: Adventure = {
  startSceneId: "forest_edge",
  scenes: [
    {
      id: "forest_edge",
      text: "Тропа выводит отряд на опушку.",
      options: [{ id: "go", label: "Идти дальше", nextSceneId: "river_path", tableId: null }],
    },
    {
      id: "river_path",
      text: "Река выводит к мосту.",
      options: [],
    },
  ],
  tables: [],
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => adventure),
}));

const startAdventure = vi.fn();
const chooseOption = vi.fn();
const submitCustomAction = vi.fn();

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, startAdventure, chooseOption, submitCustomAction }),
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

describe("AdventurePage", () => {
  it("starts the adventure when no scene is active, then renders the scene and options", async () => {
    mockState = baseState({ currentSceneId: null });
    render(<AdventurePage />);

    await waitFor(() => expect(startAdventure).toHaveBeenCalled());
  });

  it("renders the current scene and lets you choose an option without crashing", async () => {
    mockState = baseState({ currentSceneId: "forest_edge" });
    render(<AdventurePage />);

    expect(await screen.findByText(/Тропа выводит отряд/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Идти дальше"));
    expect(chooseOption).toHaveBeenCalledWith("go");
  });

  it("submitting a custom action clears the input and does not crash", async () => {
    mockState = baseState({ currentSceneId: "forest_edge" });
    render(<AdventurePage />);
    await screen.findByText(/Тропа выводит отряд/);

    const input = screen.getByPlaceholderText(/Свой вариант действия/);
    fireEvent.change(input, { target: { value: "Осмотреться" } });
    fireEvent.click(screen.getByText("Записать"));

    await waitFor(() => expect(submitCustomAction).toHaveBeenCalledWith("Осмотреться"));
  });
});
