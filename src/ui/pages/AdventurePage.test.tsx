import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdventurePage } from "./AdventurePage";
import type { Adventure, CampaignState, LikelihoodOption } from "../../state/types";

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

const likelihoods: LikelihoodOption[] = [{ id: "even", label: "50/50" }];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === "get_oracle_likelihoods") return likelihoods;
    return adventure;
  }),
}));

const startAdventure = vi.fn();
const chooseOption = vi.fn();
const submitCustomAction = vi.fn();
const askOracle = vi.fn();
const adjustChaosFactor = vi.fn();

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({
    state: mockState,
    startAdventure,
    chooseOption,
    submitCustomAction,
    askOracle,
    adjustChaosFactor,
  }),
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

  it("asking the oracle submits the question and likelihood, then clears the input", async () => {
    askOracle.mockClear();
    mockState = baseState({ currentSceneId: "forest_edge" });
    render(<AdventurePage />);
    await screen.findByText(/Тропа выводит отряд/);

    const input = await screen.findByPlaceholderText(/прячется ли кто-то за дверью/);
    fireEvent.change(input, { target: { value: "Есть ли тут ловушка?" } });
    fireEvent.click(screen.getByText("Спросить"));

    await waitFor(() =>
      expect(askOracle).toHaveBeenCalledWith("Есть ли тут ловушка?", "even"),
    );
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("adjusting the chaos factor calls adjustChaosFactor with the right delta", async () => {
    adjustChaosFactor.mockClear();
    mockState = baseState({ currentSceneId: "forest_edge", chaosFactor: 5 });
    render(<AdventurePage />);
    await screen.findByText(/Тропа выводит отряд/);

    fireEvent.click(screen.getByText("+"));
    expect(adjustChaosFactor).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText("−"));
    expect(adjustChaosFactor).toHaveBeenCalledWith(-1);
  });
});
