import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdventuresPage, journalTextFor } from "./AdventuresPage";
import { findTable, rowForRoll } from "../eventTables";
import type { CampaignState } from "../../state/types";

const { invokeMock, addJournalEntry, playDiceRollSound } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  addJournalEntry: vi.fn(),
  playDiceRollSound: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound }));

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, addJournalEntry }),
}));

/** Бросок движка, который всегда даёт `total`. */
function rollsAlways(total: number) {
  invokeMock.mockImplementation(async (_cmd: string, args: { expression: string }) => ({
    expression: args.expression,
    rolls: [total],
    modifier: 0,
    total,
    dropped: null,
  }));
}

function emptyState(): CampaignState {
  return { id: "c1", campaignName: "Тест", characters: [], journal: [], combat: null };
}

async function openGenerator() {
  render(<AdventuresPage />);
  fireEvent.click(screen.getByText("Сгенерировать события"));
  return screen.getByLabelText("Таблица событий") as HTMLSelectElement;
}

describe("AdventuresPage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    addJournalEntry.mockReset();
    playDiceRollSound.mockClear();
    mockState = emptyState();
  });

  it("экран выбора показывает один вход и не держит заглушек", () => {
    render(<AdventuresPage />);
    expect(screen.getByText("Сгенерировать события")).toBeInTheDocument();
    expect(screen.queryByText(/Начать приключение/)).not.toBeInTheDocument();
    expect(screen.queryByText(/скоро/i)).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button")) expect(button).not.toBeDisabled();
  });

  it("бросает кость выбранной таблицы и показывает выпавшее число", async () => {
    rollsAlways(5);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });

    fireEvent.click(screen.getByText("Бросить"));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    // Кость — из таблицы: у «Меток фей» она d8, а не d100 «по умолчанию».
    expect(invokeMock.mock.calls[0][1]).toEqual({ expression: "1d8" });
    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(screen.getByText("из d8")).toBeInTheDocument();
    expect(screen.getByText(rowForRoll(findTable("fey-marks")!, 5)!.text)).toBeInTheDocument();
  });

  it("другая таблица — другая кость", async () => {
    rollsAlways(7);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "plot-twists" } });

    fireEvent.click(screen.getByText("Бросить"));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][1]).toEqual({ expression: "1d150" });
  });

  // Ради этой пробы выпавшее и держится на экране до нажатия: неудачный бросок
  // игрок перебрасывает, не засоряя историю кампании.
  it("бросок без нажатия «В дневник» дневник не меняет", async () => {
    rollsAlways(3);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });

    fireEvent.click(screen.getByText("Бросить"));
    await screen.findByText("3");
    fireEvent.click(screen.getByText("Бросить"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));

    expect(addJournalEntry).not.toHaveBeenCalled();
    expect(mockState.journal).toEqual([]);
  });

  it("«В дневник» кладёт запись с броском через addJournalEntry", async () => {
    rollsAlways(2);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });

    fireEvent.click(screen.getByText("Бросить"));
    await screen.findByText("2");
    fireEvent.click(screen.getByText("В дневник"));

    await waitFor(() => expect(addJournalEntry).toHaveBeenCalledTimes(1));
    const table = findTable("fey-marks")!;
    const entry = addJournalEntry.mock.calls[0][0];
    expect(entry.text).toBe(journalTextFor({ table, roll: 2, row: rowForRoll(table, 2)! }));
    expect(entry.text).toContain("выпало 2");
    expect(entry.timestamp).not.toBe("");
  });

  it("смена таблицы убирает прежде выпавшее", async () => {
    rollsAlways(1);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });
    fireEvent.click(screen.getByText("Бросить"));
    await screen.findByText("В дневник");

    fireEvent.change(select, { target: { value: "battle-11" } });

    expect(screen.queryByText("В дневник")).not.toBeInTheDocument();
  });

  it("отказ движка показан игроку, а не проглочен", async () => {
    invokeMock.mockRejectedValue("кость сломалась");
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });

    fireEvent.click(screen.getByText("Бросить"));

    expect(await screen.findByText(/кость сломалась/)).toBeInTheDocument();
    expect(screen.queryByText("В дневник")).not.toBeInTheDocument();
  });
});
