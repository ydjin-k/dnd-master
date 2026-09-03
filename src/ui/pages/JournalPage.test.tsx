import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JournalPage } from "./JournalPage";
import type { CampaignState } from "../../state/types";

const { addJournalEntry, removeJournalEntry, audioPlayMock } = vi.hoisted(() => ({
  addJournalEntry: vi.fn(),
  removeJournalEntry: vi.fn(),
  audioPlayMock: vi.fn(() => Promise.resolve()),
}));
let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, addJournalEntry, removeJournalEntry }),
}));

const audioInstances: AudioMock[] = [];

class AudioMock {
  currentTime = 0;
  constructor(public src: string) {
    audioInstances.push(this);
  }
  play = audioPlayMock;
}

describe("JournalPage", () => {
  beforeEach(() => {
    vi.stubGlobal("Audio", AudioMock);
    addJournalEntry.mockReset();
    removeJournalEntry.mockReset();
    audioPlayMock.mockClear();
    audioInstances.length = 0;
  });

  it("adding a journal entry clears the form and does not crash", async () => {
    mockState = {
      id: "c1",
      campaignName: "Тест",
      characters: [],
      journal: [{ id: "e1", timestamp: new Date("2026-01-01T10:00:00Z").toISOString(), text: "Старая запись" }],
      currentSceneId: null,
      adventureLog: [],
      combat: null,
      chaosFactor: 5,
    };
    render(<JournalPage />);

    expect(screen.getByText("Старая запись")).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText("Что произошло?");
    fireEvent.change(textarea, { target: { value: "Новая запись" } });
    fireEvent.click(screen.getByText("Записать"));

    await waitFor(() => expect(addJournalEntry).toHaveBeenCalledTimes(1));
    expect(addJournalEntry.mock.calls[0][0].text).toBe("Новая запись");
    expect(audioPlayMock).toHaveBeenCalledTimes(1);
    expect(audioInstances[0]).toMatchObject({
      src: "/audio/quill-scratch.mp3",
      currentTime: 0,
    });
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("removes the selected journal entry", () => {
    mockState = {
      id: "c1",
      campaignName: "Тест",
      characters: [],
      journal: [{ id: "entry-to-remove", timestamp: "2026-01-01T10:00:00Z", text: "Старая запись" }],
      currentSceneId: null,
      adventureLog: [],
      combat: null,
      chaosFactor: 5,
    };
    render(<JournalPage />);

    fireEvent.click(screen.getByRole("button", { name: /удалить запись/i }));

    expect(removeJournalEntry).toHaveBeenCalledWith("entry-to-remove");
  });

  it("paginates packed spreads and disables pagination at its boundaries", () => {
    mockState = createStateWithEntries(8, 120);
    render(<JournalPage />);

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText(/Запись 8/)).toBeInTheDocument();
    expect(screen.queryByText(/Запись 2/)).not.toBeInTheDocument();

    const previous = screen.getByRole("button", { name: "Предыдущий разворот" });
    const next = screen.getByRole("button", { name: "Следующий разворот" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText(/Запись 4/)).toBeInTheDocument();
    expect(previous).toBeEnabled();
    expect(next).toBeDisabled();
    expect(audioInstances[0]).toMatchObject({ src: "/audio/page-flip.mp3", currentTime: 0 });
    expect(audioPlayMock).toHaveBeenCalledTimes(1);
  });

  it("returns to the first spread after adding an entry", async () => {
    mockState = createStateWithEntries(8, 120);
    render(<JournalPage />);
    fireEvent.click(screen.getByRole("button", { name: "Следующий разворот" }));
    expect(screen.getByText(/Запись 4/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Что произошло?"), { target: { value: "Новая запись" } });
    fireEvent.click(screen.getByText("Записать"));

    await waitFor(() => expect(addJournalEntry).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Запись 8/)).toBeInTheDocument();
    expect(screen.queryByText(/Запись 4/)).not.toBeInTheDocument();
  });
});

function createStateWithEntries(count: number, textLength = 0): CampaignState {
  return {
    id: "c1",
    campaignName: "Тест",
    characters: [],
    journal: Array.from({ length: count }, (_, index) => ({
      id: `e${index + 1}`,
      timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      text: `Запись ${index + 1} ${"т".repeat(textLength)}`,
    })),
    currentSceneId: null,
    adventureLog: [],
    combat: null,
    chaosFactor: 5,
  };
}
