import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
  adventures: "Приключения", dungeons: "Подземелья",
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

    // engine-event-generator: вкладка вернулась на прежнее место — первой в
    // рельсе, — но стартовой осталась «Персонажи» (проверено выше). Остальные
    // восемь стоят в прежнем порядке и открываются.
    //
    // Вкладки ищем внутри <nav> по тексту и проверяем имя найденной кнопки,
    // а не getByRole с именем: тот считает роль и имя каждой кнопки на каждый
    // вызов, и девять вызовов были главной статьёй пробы — под нагрузкой двух
    // полных прогонов она упиралась в 5 с таймаута. Строже прежнего: вкладка
    // обязана стоять в <nav>, и в <nav> нет кнопок, кроме вкладок.
    const nav = screen.getByRole("navigation");
    expect(
      Array.from(nav.querySelectorAll("button"), (b) => b.getAttribute("data-tab")),
    ).toEqual(["adventures", "dungeons", "combat", "dice", "characters", "journal", "rules", "spells", "bestiary", "soundboard"]);
    for (const id of ["adventures", "dungeons", "combat", "dice", "characters", "journal", "rules", "spells", "bestiary", "soundboard"]) {
      const tabButton = within(nav).getByText(TAB_LABELS[id]).closest("button");
      expect(tabButton).toHaveAccessibleName(TAB_LABELS[id]);
      fireEvent.click(tabButton!);
      expect(screen.getByTestId("tab-content")).toHaveTextContent(id);
    }

    const nameInput = screen.getByPlaceholderText("Название кампании");
    fireEvent.change(nameInput, { target: { value: "Новое имя" } });
    expect(setCampaignName).toHaveBeenCalledWith("Новое имя");
  });
});
