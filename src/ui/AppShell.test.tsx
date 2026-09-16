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

const TAB_LABELS: Record<string, string> = {
  combat: "Бой", dice: "Кубики", characters: "Персонажи", journal: "Дневник",
  rules: "Правила", spells: "Заклинания", bestiary: "Бестиарий", soundboard: "Саундборд",
};

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

    // engine-wipe-adventure-and-oracle: «Приключение» снесено вместе с движком —
    // пустой экран-заглушка хуже отсутствующего пункта. Остальные восемь стоят
    // в прежнем порядке и открываются.
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("data-tab")).filter(Boolean),
    ).toEqual(["combat", "dice", "characters", "journal", "rules", "spells", "bestiary", "soundboard"]);
    expect(screen.queryByText("Приключение")).not.toBeInTheDocument();
    for (const id of ["combat", "dice", "characters", "journal", "rules", "spells", "bestiary", "soundboard"]) {
      fireEvent.click(screen.getByRole("button", { name: TAB_LABELS[id] }));
      expect(screen.getByTestId("tab-content")).toHaveTextContent(id);
    }

    const nameInput = screen.getByPlaceholderText("Название кампании");
    fireEvent.change(nameInput, { target: { value: "Новое имя" } });
    expect(setCampaignName).toHaveBeenCalledWith("Новое имя");
  });
});
