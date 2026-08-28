import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Launcher } from "./Launcher";
import type { CampaignSummary, CampaignState } from "../state/types";

const summaries: CampaignSummary[] = [{ id: "c1", name: "Старая кампания", characterCount: 2 }];

const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  switch (cmd) {
    case "list_campaigns":
      return summaries;
    case "create_campaign":
      return { id: "new", campaignName: args?.name ?? "" } as CampaignState;
    case "switch_campaign":
      return { id: args?.id, campaignName: "Старая кампания" } as CampaignState;
    case "delete_campaign":
      return null;
    default:
      return null;
  }
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: [string, Record<string, unknown>?]) => invoke(...args) }));

describe("Launcher", () => {
  beforeEach(() => {
    invoke.mockClear();
    window.confirm = vi.fn(() => true);
  });

  it("lists existing campaigns and lets you continue one without crashing", async () => {
    const onEnter = vi.fn();
    render(<Launcher onEnter={onEnter} />);

    expect(await screen.findByText(/Старая кампания/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(onEnter).toHaveBeenCalled());
  });

  it("creates a new campaign from the form", async () => {
    const onEnter = vi.fn();
    render(<Launcher onEnter={onEnter} />);
    await screen.findByText(/Старая кампания/);

    fireEvent.change(screen.getByPlaceholderText("Название новой кампании"), {
      target: { value: "Новый поход" },
    });
    fireEvent.click(screen.getByText("Новая кампания"));

    await waitFor(() => expect(onEnter).toHaveBeenCalled());
  });

  it("deletes a campaign after confirmation without crashing", async () => {
    render(<Launcher onEnter={() => {}} />);
    await screen.findByText(/Старая кампания/);

    fireEvent.click(screen.getByText("Удалить"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("delete_campaign", { id: "c1" }));
  });
});
