import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import { CampaignProvider } from "../../state/CampaignContext";
import {
  emptyCampaignState,
  type CampaignState,
  type DungeonRecord,
  type RuleTopic,
} from "../../state/types";
import { generateDungeon } from "../dungeons/dungeonGenerator";
import { readTrapNumbers } from "../dungeons/trapNumbers";
import { DungeonsPage } from "./DungeonsPage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound: vi.fn() }));

/**
 * Статус комнаты, заметки мастера и связь списка со схемой
 * (`journal-dungeon-room-status-and-notes`) — на живом экране, а не на
 * функциях: правила проверены своими пробами в `markerStatus.test.tsx` и
 * `dungeonNotes.test.ts`, здесь проверяется, что экран их зовёт и что
 * написанное доезжает до записи кампании и переживает перезагрузку.
 */

let disk: CampaignState;

beforeAll(() => {
  // Разовая цена первого getComputedStyle в jsdom — платит не первая проба.
  getComputedStyle(document.body);
});

beforeEach(() => {
  disk = { ...emptyCampaignState(), id: "c1", campaignName: "Поход", dungeons: [fixture()] };
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
        return Promise.resolve(bundledBestiary.map((m) => ({ ...m, origin: "srd" })));
      case "roll_dice":
        return Promise.resolve({ total: 1 });
      default:
        return Promise.resolve(undefined);
    }
  });
});

/** Готовое подземелье в кампании: экрану нужна схема, а не её создание. */
function fixture(): DungeonRecord {
  const numbers = readTrapNumbers(bundledRules as RuleTopic[])!;
  const plan = generateDungeon({
    seed: 20261019,
    partyLevel: 3,
    danger: "Опасная",
    numbers,
    bestiary: bundledBestiary,
  });
  return {
    id: "d-rooms",
    name: "Проба комнат",
    createdAt: "2026-10-19T10:00:00Z",
    seed: 20261019,
    partyLevel: 3,
    danger: "Опасная",
    plan,
    statuses: {},
  };
}

async function mount() {
  const view = render(
    <CampaignProvider>
      <DungeonsPage />
    </CampaignProvider>,
  );
  await screen.findByText("Собрать ловушку");
  fireEvent.click(screen.getByText("Подземелья кампании"));
  fireEvent.click(await screen.findByRole("button", { name: "Открыть" }));
  const map = await screen.findByRole("img", { name: /^Схема:/ });
  return { view, map };
}

/** Выбрать комнату щелчком по её имени в списке. */
function selectRoom(number: number) {
  fireEvent.click(roomRow(number).querySelector(".dungeons-page__room-name")!);
}

/** Строка списка комнат по её номеру. */
function roomRow(number: number): HTMLElement {
  return document.querySelector(`.dungeons-page__rooms > li[data-room="${number}"]`) as HTMLElement;
}

describe("вкладка «Подземелья»: статус комнаты", () => {
  it("меняется по кругу теми же подписями, сохраняется и переживает перезагрузку", async () => {
    const { view, map } = await mount();

    const row = roomRow(2);
    expect(row).toHaveAttribute("data-status", "unexplored");
    expect(map.querySelector('[data-room="2"]')).toHaveAttribute("data-status", "unexplored");
    expect(within(row).getByText("не исследовано")).toBeInTheDocument();

    for (const expected of ["discovered", "explored", "unexplored", "discovered"]) {
      await act(async () => fireEvent.click(within(roomRow(2)).getByText(/^Отметить:/)));
      expect(roomRow(2)).toHaveAttribute("data-status", expected);
      expect(map.querySelector('[data-room="2"]')).toHaveAttribute("data-status", expected);
    }
    // Тот же круг и та же карта, что у отметок: свой набор не заведён.
    expect(disk.dungeons![0].statuses).toEqual({ "room-2": "discovered" });
    // Соседняя комната не тронута.
    expect(roomRow(3)).toHaveAttribute("data-status", "unexplored");

    view.unmount();
    const again = await mount();
    expect(roomRow(2)).toHaveAttribute("data-status", "discovered");
    expect(again.map.querySelector('[data-room="2"]')).toHaveAttribute("data-status", "discovered");
  });
});

describe("вкладка «Подземелья»: заметки мастера", () => {
  it("заметка к комнате сохраняется, пустая удаляется из записи", async () => {
    const { view } = await mount();

    selectRoom(3);
    const field = within(roomRow(3)).getByLabelText("Заметка к комнате 3");
    await act(async () => fireEvent.change(field, { target: { value: "Рычаг за гобеленом" } }));
    expect(disk.dungeons![0].notes).toEqual({ "room-3": "Рычаг за гобеленом" });

    view.unmount();
    const again = await mount();
    selectRoom(3);
    expect(within(roomRow(3)).getByLabelText("Заметка к комнате 3")).toHaveValue("Рычаг за гобеленом");
    // Признак заметки виден на схеме у той же комнаты, и только у неё.
    expect(again.map.querySelector('[data-room="3"]')).toHaveAttribute("data-note", "yes");
    expect(again.map.querySelector('[data-room="4"]')).not.toHaveAttribute("data-note");

    const back = within(roomRow(3)).getByLabelText("Заметка к комнате 3");
    await act(async () => fireEvent.change(back, { target: { value: "   " } }));
    expect(disk.dungeons![0].notes).toEqual({});
    expect(again.map.querySelector('[data-room="3"]')).not.toHaveAttribute("data-note");
  });

  it("поле заметки — только у выбранной комнаты, у остальных заметка строкой", async () => {
    // Решение владельца 19.10.2026: список комнат не должен быть стеной полей.
    await mount();

    selectRoom(3);
    const field = within(roomRow(3)).getByLabelText("Заметка к комнате 3");
    await act(async () => fireEvent.change(field, { target: { value: "Рычаг за гобеленом" } }));

    // Выбрали соседнюю: поле уехало к ней, а заметка третьей осталась видна.
    selectRoom(5);
    expect(within(roomRow(5)).getByLabelText("Заметка к комнате 5")).toBeInTheDocument();
    expect(within(roomRow(3)).queryByLabelText("Заметка к комнате 3")).toBeNull();
    expect(roomRow(3).querySelector(".dungeons-page__room-note")).toHaveTextContent(
      "Рычаг за гобеленом",
    );
    // Поле ровно одно на весь список.
    expect(document.querySelectorAll(".dungeons-page__rooms textarea")).toHaveLength(1);

    // Комната без заметки места под неё не занимает вовсе.
    expect(roomRow(4).querySelector(".dungeons-page__room-note")).toBeNull();
    expect(within(roomRow(4)).queryByLabelText("Заметка к комнате 4")).toBeNull();

    // Строка не поле: править заметку можно только в выбранной комнате.
    selectRoom(3);
    expect(roomRow(3).querySelector(".dungeons-page__room-note")).toBeNull();
    expect(within(roomRow(3)).getByLabelText("Заметка к комнате 3")).toHaveValue("Рычаг за гобеленом");
  });

  it("заметка к отметке живёт в описании отметки и помечает её на схеме", async () => {
    const { map } = await mount();
    const marker = map.querySelector('[data-marker="trap-1"]')!;
    fireEvent.click(marker);

    const detail = screen.getByRole("article", { name: "Описание отметки" });
    const field = within(detail).getByLabelText(/^Заметка к отметке /);
    await act(async () => fireEvent.change(field, { target: { value: "уже сработала" } }));
    expect(disk.dungeons![0].notes).toEqual({ "trap-1": "уже сработала" });
    await waitFor(() =>
      expect(map.querySelector('[data-marker="trap-1"]')).toHaveAttribute("data-note", "yes"),
    );

    await act(async () => fireEvent.change(field, { target: { value: "" } }));
    expect(disk.dungeons![0].notes).toEqual({});
  });
});

describe("вкладка «Подземелья»: список и схема выделяют одну комнату", () => {
  it("щелчок по комнате на схеме выделяет её в списке, и наоборот", async () => {
    const { map } = await mount();

    expect(roomRow(4)).not.toHaveAttribute("aria-current");
    fireEvent.click(map.querySelector('[data-room="4"]')!);
    expect(roomRow(4)).toHaveAttribute("aria-current", "true");
    expect(map.querySelector('[data-room="4"]')).toHaveAttribute("aria-pressed", "true");
    // Выделена ровно одна комната — и в списке, и на схеме.
    expect(document.querySelectorAll('.dungeons-page__rooms > li[aria-current="true"]')).toHaveLength(1);
    expect(map.querySelectorAll('[data-room][aria-pressed="true"]')).toHaveLength(1);

    await act(async () => fireEvent.click(within(roomRow(2)).getByText(/^Отметить:/)));
    // Кнопка статуса не выделяет комнату: выделение — своё действие.
    expect(roomRow(2)).not.toHaveAttribute("aria-current");

    selectRoom(2);
    expect(roomRow(2)).toHaveAttribute("aria-current", "true");
    expect(map.querySelector('[data-room="2"]')).toHaveAttribute("aria-pressed", "true");
    expect(roomRow(4)).not.toHaveAttribute("aria-current");
    expect(map.querySelector('[data-room="4"]')).toHaveAttribute("aria-pressed", "false");
  });
});
