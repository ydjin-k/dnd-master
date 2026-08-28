import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell, type Tab } from "./AppShell";
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
      <AppShell onSwitchCampaign={() => {}}>
        {(tab) => {
          seen.push(tab);
          return <div data-testid="tab-content">{tab}</div>;
        }}
      </AppShell>,
    );

    expect(screen.getByTestId("tab-content")).toHaveTextContent("adventure");

    fireEvent.click(screen.getByText("Бой"));
    expect(screen.getByTestId("tab-content")).toHaveTextContent("combat");

    const nameInput = screen.getByPlaceholderText("Название кампании");
    fireEvent.change(nameInput, { target: { value: "Новое имя" } });
    expect(setCampaignName).toHaveBeenCalledWith("Новое имя");
  });
});
