import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JOURNAL_ENTRY_MAX_LENGTH, JournalPage } from "./JournalPage";
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
      combat: null,
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
      combat: null,
    };
    render(<JournalPage />);

    fireEvent.click(screen.getByRole("button", { name: /удалить запись/i }));

    expect(removeJournalEntry).toHaveBeenCalledWith("entry-to-remove");
  });

  it("paginates six entries per spread regardless of text length", () => {
    mockState = createStateWithEntries(7, 1_000);
    render(<JournalPage />);

    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText(/Запись 7/)).toBeInTheDocument();
    expect(screen.getByText(/Запись 2/)).toBeInTheDocument();
    expect(screen.queryByText(/Запись 1/)).not.toBeInTheDocument();

    const previous = screen.getByRole("button", { name: "Предыдущий разворот" });
    const next = screen.getByRole("button", { name: "Следующий разворот" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText(/Запись 1/)).toBeInTheDocument();
    expect(screen.queryByText(/Запись 2/)).not.toBeInTheDocument();
    expect(previous).toBeEnabled();
    expect(next).toBeDisabled();
    expect(audioInstances[0]).toMatchObject({ src: "/audio/page-flip.mp3", currentTime: 0 });
    expect(audioPlayMock).toHaveBeenCalledTimes(1);
  });

  it("shows disabled pagination when the first spread is exactly full", () => {
    mockState = createStateWithEntries(6);
    render(<JournalPage />);

    expect(screen.getByRole("button", { name: "Предыдущий разворот" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Следующий разворот" })).toBeDisabled();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("limits a new entry and displays the limit beside the field", () => {
    mockState = createStateWithEntries(0);
    render(<JournalPage />);

    const textarea = screen.getByPlaceholderText("Что произошло?");
    expect(textarea).toHaveAttribute("maxlength", String(JOURNAL_ENTRY_MAX_LENGTH));
    expect(screen.getByText(`До ${JOURNAL_ENTRY_MAX_LENGTH} символов.`)).toBeInTheDocument();
  });

  it("stays on the current spread after adding an entry", async () => {
    mockState = createStateWithEntries(8, 120);
    render(<JournalPage />);
    fireEvent.click(screen.getByRole("button", { name: "Следующий разворот" }));
    expect(screen.getByText(/Запись 2/)).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Что произошло?"), { target: { value: "Новая запись" } });
    fireEvent.click(screen.getByText("Записать"));

    await waitFor(() => expect(addJournalEntry).toHaveBeenCalledTimes(1));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.queryByText(/Запись 8/)).not.toBeInTheDocument();
  });

  // engine-wipe-adventure-and-oracle: записи, переехавшие из снесённого журнала
  // приключения, пришли без времени — его у них никогда не было. Выдуманной
  // даты быть не должно, «Invalid Date» на экране — тем более.
  // Отрицательная проба: вернуть `new Date(entry.timestamp).toLocaleString()`
  // вместо `entryTime` — краснеет именно эта проба, остальные остаются зелёными.
  it("запись без даты подписана честно и уходит в конец дневника", () => {
    mockState = {
      id: "c1",
      campaignName: "Тест",
      characters: [],
      journal: [
        { id: "old", timestamp: "", text: "Оракул: «Есть ли тут ловушка?» → Да" },
        { id: "new", timestamp: new Date("2026-01-01T10:00:00Z").toISOString(), text: "Своя запись" },
      ],
      combat: null,
    };
    render(<JournalPage />);

    expect(screen.getByText("без даты")).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Удалить запись от без даты" }),
    ).toBeInTheDocument();

    const texts = screen
      .getAllByText(/.*/, { selector: ".journal-entry__text" })
      .map((el) => el.textContent);
    expect(texts).toEqual(["Своя запись", "Оракул: «Есть ли тут ловушка?» → Да"]);
  });

  it("shows the page-count window even with a single spread", () => {
    mockState = createStateWithEntries(2);
    render(<JournalPage />);

    expect(screen.getByText("1 / 1")).toBeInTheDocument();
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
    combat: null,
  };
}
