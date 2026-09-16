import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { CampaignProvider, useCampaign } from "./CampaignContext";
import type { CampaignState } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const initialState: CampaignState = {
  id: "campaign-1",
  campaignName: "Тест",
  characters: [],
  journal: [
    { id: "keep", timestamp: "2026-01-01T10:00:00Z", text: "Оставить" },
    { id: "remove", timestamp: "2026-01-02T10:00:00Z", text: "Удалить" },
  ],
  combat: null,
};

describe("CampaignContext journal persistence", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(command === "load_active_campaign" ? initialState : undefined),
    );
  });

  it("persists the journal without the removed entry", async () => {
    let removeEntry: ((id: string) => Promise<void>) | undefined;
    function Consumer() {
      const campaign = useCampaign();
      useEffect(() => {
        if (!campaign.loading) removeEntry = campaign.removeJournalEntry;
      }, [campaign]);
      return null;
    }

    render(
      <CampaignProvider>
        <Consumer />
      </CampaignProvider>,
    );
    await waitFor(() => expect(removeEntry).toBeTypeOf("function"));
    await act(() => removeEntry!("remove"));

    expect(invoke).toHaveBeenCalledWith("save_campaign", {
      state: expect.objectContaining({ journal: [initialState.journal[0]] }),
    });
  });
});
