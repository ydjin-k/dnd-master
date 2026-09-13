import { useState } from "react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DiceLogProvider } from "./DiceLogContext";
import App from "../App";
import { DicePage } from "../ui/pages/DicePage";
import { emptyCampaignState, type CampaignState, type RollResult } from "./types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

vi.mock("../audio/uiSounds", () => ({
  playDiceRollSound: vi.fn(),
  playCriticalSuccessSound: vi.fn(),
  playCriticalFailSound: vi.fn(),
}));

class AudioStub {
  loop = false;
  volume = 1;
  currentTime = 0;
  constructor(public src: string) {}
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}
vi.stubGlobal("Audio", AudioStub);

/** Повторяет то, что делает AppShell: другая вкладка РАЗМОНТИРУЕТ «Кубики». */
function TabSwitcher() {
  const [tab, setTab] = useState<"dice" | "other">("dice");
  return (
    <>
      <button type="button" onClick={() => setTab(tab === "dice" ? "other" : "dice")}>
        Сменить вкладку
      </button>
      {tab === "dice" ? <DicePage /> : <p>Другая вкладка</p>}
    </>
  );
}

const switchTabAndBack = () => {
  fireEvent.click(screen.getByText("Сменить вкладку"));
  expect(screen.getByText("Другая вкладка")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Сменить вкладку"));
};

const totals = () =>
  screen.getAllByText(/.*/, { selector: ".dice-log-entry__total" }).map((el) => el.textContent);

let nextRoll = 0;

describe("журнал бросков в контексте", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    nextRoll = 0;
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case "roll_dice": {
          nextRoll += 1;
          return {
            expression: String(args?.expression), rolls: [nextRoll], modifier: 0, total: nextRoll, dropped: null,
          } satisfies RollResult;
        }
        case "load_active_campaign":
          return { ...emptyCampaignState(), campaignName: "Стол" } satisfies CampaignState;
        case "list_campaigns":
          return [{ id: "c1", name: "Стол", characterCount: 0 }];
        // Вкладка «Приключение» монтируется первой и тянет свои списки:
        // без них она падает и утаскивает за собой всё дерево.
        case "get_oracle_likelihoods":
          return [];
        case "switch_campaign":
          return { ...emptyCampaignState(), campaignName: "Стол" } satisfies CampaignState;
        default:
          return null;
      }
    });
  });

  it("держит записи при уходе на другую вкладку и возврате", async () => {
    render(<DiceLogProvider><TabSwitcher /></DiceLogProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(totals()).toEqual(["1"]), { timeout: 1000 });
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(totals()).toEqual(["2", "1"]), { timeout: 1000 });

    switchTabAndBack();

    expect(totals()).toEqual(["2", "1"]);
  }, 10000);

  it("после «Очистить историю» журнал пуст и остаётся пустым после смены вкладки", async () => {
    render(<DiceLogProvider><TabSwitcher /></DiceLogProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(screen.getByText("Очистить историю")).toBeInTheDocument(), { timeout: 1000 });
    fireEvent.click(screen.getByText("Очистить историю"));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);

    switchTabAndBack();

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByText("Очистить историю")).not.toBeInTheDocument();
  }, 10000);

  it("режет журнал до десяти записей, и предел верен после смены вкладки", async () => {
    render(<DiceLogProvider><TabSwitcher /></DiceLogProvider>);
    const rollButton = screen.getByRole("button", { name: "Бросить" });
    for (let i = 0; i < 11; i += 1) {
      fireEvent.click(rollButton);
      await waitFor(() => expect(rollButton).not.toBeDisabled(), { timeout: 1000 });
    }
    expect(screen.getAllByRole("listitem")).toHaveLength(10);

    switchTabAndBack();

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(totals()).toEqual(["11", "10", "9", "8", "7", "6", "5", "4", "3", "2"]);
  }, 20000);

  it("обнуляет журнал при входе в кампанию через лаунчер", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Кубики", {}, { timeout: 2000 }));
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(totals()).toEqual(["1"]), { timeout: 1000 });

    // Другая вкладка и обратно — журнал на месте (это уже настоящий AppShell).
    fireEvent.click(screen.getByText("Бой"));
    fireEvent.click(screen.getByText("Кубики"));
    expect(totals()).toEqual(["1"]);

    fireEvent.click(screen.getByRole("button", { name: /Кампании/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Открыть кампанию Стол" }, { timeout: 2000 }));
    fireEvent.click(screen.getByRole("button", { name: /Начать|Продолжить/ }));

    fireEvent.click(await screen.findByText("Кубики", {}, { timeout: 2000 }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  }, 20000);
});
