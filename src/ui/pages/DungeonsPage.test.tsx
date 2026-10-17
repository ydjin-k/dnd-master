import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import { CampaignProvider } from "../../state/CampaignContext";
import { emptyCampaignState, type CampaignState } from "../../state/types";
import { findTable, rowForRoll } from "../eventTables";
import { MARKER_KINDS } from "../dungeons/dungeonGenerator";
import { DungeonsPage } from "./DungeonsPage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound: vi.fn() }));

let disk: CampaignState;
/** Очередь выпавшего для `roll_dice`; пустая — выпадает 1. */
let rolls: number[];

beforeAll(() => {
  // Разовая цена первого getComputedStyle в jsdom — платит не первая проба.
  getComputedStyle(document.body);
});

beforeEach(() => {
  disk = { ...emptyCampaignState(), id: "c1", campaignName: "Поход", dungeons: [] };
  rolls = [];
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((command, args) => {
    switch (command) {
      case "load_active_campaign":
        return Promise.resolve(disk);
      case "save_campaign":
        disk = (args as { state: CampaignState }).state;
        return Promise.resolve(undefined);
      case "get_rules":
        return Promise.resolve(bundledRules);
      case "get_bestiary":
        return Promise.resolve(bundledBestiary);
      case "roll_dice":
        return Promise.resolve({ total: rolls.shift() ?? 1 });
      default:
        return Promise.resolve(undefined);
    }
  });
});

async function mount() {
  const view = render(
    <CampaignProvider>
      <DungeonsPage />
    </CampaignProvider>,
  );
  await screen.findByText("Собрать ловушку");
  return view;
}

describe("вкладка «Подземелья»: ловушка", () => {
  it("собирает пять слоёв с числами SRD и перебрасывает один слой", async () => {
    await mount();
    fireEvent.click(screen.getByText("Собрать ловушку"));
    fireEvent.click(await screen.findByRole("button", { name: "Смертоносная" }));
    // Пять слоёв (эффект 6 — бьёт), затем УС и атака: вторые числа промежутков.
    rolls = [3, 2, 5, 6, 4, 2, 2];
    const assemble = screen.getByRole("button", { name: "Собрать ловушку" });
    await waitFor(() => expect(assemble).toBeEnabled());
    fireEvent.click(assemble);

    const trap = await screen.findByRole("article", { name: "Собранная ловушка" });
    expect(within(trap).getByText("17")).toBeInTheDocument();
    expect(within(trap).getByText("SRD 16–20")).toBeInTheDocument();
    expect(within(trap).getByText("+10")).toBeInTheDocument();
    expect(within(trap).getByText("SRD +9 до +12")).toBeInTheDocument();
    expect(within(trap).getByText("4к10")).toBeInTheDocument();
    const clue = trap.querySelector('[data-layer="trap-clue"]')!;
    expect(clue).toHaveTextContent(rowForRoll(findTable("trap-clue")!, 5)!.text);

    rolls = [8];
    const obstacle = trap.querySelector('[data-layer="trap-obstacle"]') as HTMLElement;
    fireEvent.click(within(obstacle).getByText("Перебросить"));
    await waitFor(() =>
      expect(obstacle).toHaveTextContent(rowForRoll(findTable("trap-obstacle")!, 8)!.text),
    );
    expect(clue).toHaveTextContent(rowForRoll(findTable("trap-clue")!, 5)!.text);
    expect(within(trap).getByText("17")).toBeInTheDocument();
  });

  it("небьющий эффект — урона и бонуса атаки нет", async () => {
    await mount();
    fireEvent.click(screen.getByText("Собрать ловушку"));
    rolls = [1, 1, 1, 2, 1, 1, 1];
    const assemble = screen.getByRole("button", { name: "Собрать ловушку" });
    await waitFor(() => expect(assemble).toBeEnabled());
    fireEvent.click(assemble);
    const trap = await screen.findByRole("article", { name: "Собранная ловушка" });
    expect(within(trap).queryByText("Бонус атаки")).toBeNull();
    expect(within(trap).getByText("нет — этот эффект не ранит")).toBeInTheDocument();
  });
});

describe("вкладка «Подземелья»: схема", () => {
  it("создаёт схему с пятью видами отметок, статус меняется по кругу и сохраняется", async () => {
    const view = await mount();
    fireEvent.click(screen.getByText("Подземелья кампании"));
    const create = await screen.findByRole("button", { name: "Создать подземелье" });
    await waitFor(() => expect(create).toBeEnabled());
    await act(async () => fireEvent.click(create));

    const map = await screen.findByRole("img", { name: /^Схема:/ });
    expect(map.tagName.toLowerCase()).toBe("svg");
    const kinds = new Set(Array.from(map.querySelectorAll("[data-kind]"), (m) => m.getAttribute("data-kind")));
    expect([...kinds].sort()).toEqual([...MARKER_KINDS].sort());

    const trap = map.querySelector('[data-marker="trap-1"]')!;
    expect(trap).toHaveAttribute("data-status", "unexplored");
    fireEvent.click(trap);
    const detail = screen.getByRole("article", { name: "Описание отметки" });
    expect(within(detail).getByText("УС спасброска")).toBeInTheDocument();

    for (const expected of ["discovered", "explored", "unexplored", "discovered"]) {
      await act(async () => fireEvent.click(within(detail).getByText(/^Отметить:/)));
      expect(map.querySelector('[data-marker="trap-1"]')).toHaveAttribute("data-status", expected);
    }
    expect(disk.dungeons).toHaveLength(1);
    expect(disk.dungeons![0].statuses["trap-1"]).toBe("discovered");

    // Перезагрузка окна: схема и статус читаются с «диска».
    view.unmount();
    await mount();
    fireEvent.click(screen.getByText("Подземелья кампании"));
    fireEvent.click(await screen.findByRole("button", { name: "Открыть" }));
    const again = await screen.findByRole("img", { name: /^Схема:/ });
    expect(again.querySelector('[data-marker="trap-1"]')).toHaveAttribute("data-status", "discovered");
  });

  it("удаление — только после подтверждения", async () => {
    await mount();
    fireEvent.click(screen.getByText("Подземелья кампании"));
    const create = await screen.findByRole("button", { name: "Создать подземелье" });
    await waitFor(() => expect(create).toBeEnabled());
    await act(async () => fireEvent.click(create));
    fireEvent.click(await screen.findByText("← К списку"));

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    fireEvent.click(screen.getByRole("button", { name: "Нет" }));
    expect(disk.dungeons).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Да, удалить" })));
    expect(disk.dungeons).toHaveLength(0);
    expect(screen.getByText("В этой кампании подземелий пока нет.")).toBeInTheDocument();
  });
});
