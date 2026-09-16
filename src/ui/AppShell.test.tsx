import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell, type Tab } from "./AppShell";
import { SoundtrackProvider } from "../state/SoundtrackContext";
import type { CampaignState } from "../state/types";

const setCampaignName = vi.fn();
vi.mock("../state/CampaignContext", () => ({
  useCampaign: () => ({
    state: { campaignName: "Тест" } as CampaignState,
    setCampaignName,
  }),
}));

describe("AppShell", () => {
  it("switches tabs and renders campaign-name editing without crashing", () => {
    const seen: Tab[] = [];
    render(
      <SoundtrackProvider>
        <AppShell onSwitchCampaign={() => {}}>
          {(tab) => {
            seen.push(tab);
            return <div data-testid="tab-content">{tab}</div>;
          }}
        </AppShell>
      </SoundtrackProvider>,
    );

    expect(screen.getByTestId("tab-content")).toHaveTextContent("characters");

    fireEvent.click(screen.getByText("Бой"));
    expect(screen.getByTestId("tab-content")).toHaveTextContent("combat");

    fireEvent.click(screen.getByText("Заклинания"));
    expect(screen.getByTestId("tab-content")).toHaveTextContent("spells");

    const nameInput = screen.getByPlaceholderText("Название кампании");
    fireEvent.change(nameInput, { target: { value: "Новое имя" } });
    expect(setCampaignName).toHaveBeenCalledWith("Новое имя");
  });
});
