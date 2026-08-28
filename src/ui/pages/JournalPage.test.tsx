import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JournalPage } from "./JournalPage";
import type { CampaignState } from "../../state/types";

const addJournalEntry = vi.fn();
let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, addJournalEntry }),
}));

describe("JournalPage", () => {
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
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });
});
