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
import { floorFields } from "../dungeons/dungeonFloors";
import { generateFloorPlans, lineTitle } from "../dungeons/dungeonGenerator";
import { sheetTitle } from "../dungeons/DungeonMapImage";
import type { PlayersMapView } from "../dungeons/playersMap";
import { readTrapNumbers, type TrapNumbers } from "../dungeons/trapNumbers";
import { DungeonsPage } from "./DungeonsPage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound: vi.fn() }));

/**
 * Сторона мастера у окна «для игроков»: что экран отдаёт окну и когда.
 *
 * Само окно и правило видимости проверены своими пробами
 * (`PlayersWindow.test.tsx`, `mapAudience.test.ts`). Здесь ровно то, чего там
 * не видно: экран отправляет схему при КАЖДОЙ правке — смене статуса, смене
 * этажа, закрытии схемы, — и отправляет её независимо от того, открыто ли
 * окно.
 */

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
let disk: CampaignState;
/** Что экран отдал окну игроков, по порядку. */
let sent: (PlayersMapView | null)[];
/** Сколько раз просили вывести окно на экран. */
let opened: number;

beforeAll(() => {
  // Разовая цена первого getComputedStyle в jsdom — платит не первая проба.
  getComputedStyle(document.body);
});

beforeEach(() => {
  disk = { ...emptyCampaignState(), id: "c1", campaignName: "Поход", dungeons: [] };
  sent = [];
  opened = 0;
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
      case "players_map_set":
        sent.push((args as { view: PlayersMapView | null }).view);
        return Promise.resolve(undefined);
      case "players_window_open":
        opened += 1;
        return Promise.resolve(undefined);
      default:
        return Promise.resolve(undefined);
    }
  });
});

/** Подземелье на два этажа, записанное в кампанию готовым. */
function fixture(): DungeonRecord {
  const plans = generateFloorPlans(
    { seed: 20261021, partyLevel: 3, danger: "Опасная", numbers, bestiary: bundledBestiary },
    2,
  );
  return {
    id: "d-players",
    name: lineTitle(plans[0].purpose!.text),
    createdAt: "2026-10-21T10:00:00Z",
    seed: 20261021,
    partyLevel: 3,
    danger: "Опасная",
    size: "Среднее",
    purposeRoll: null,
    ...floorFields(plans),
    statuses: {},
  };
}

async function openDungeon(): Promise<DungeonRecord> {
  const dungeon = fixture();
  disk = { ...disk, dungeons: [dungeon] };
  render(
    <CampaignProvider>
      <DungeonsPage />
    </CampaignProvider>,
  );
  await screen.findByText("Собрать ловушку");
  fireEvent.click(screen.getByText("Подземелья кампании"));
  fireEvent.click(await screen.findByRole("button", { name: "Открыть" }));
  await screen.findByRole("img", { name: /^Схема:/ });
  return dungeon;
}

/** Последнее, что ушло в окно игроков. */
const last = (): PlayersMapView | null => sent[sent.length - 1] ?? null;

/** Номера комнат, которые видно в окне. */
const roomsInWindow = (): number[] => last()?.dungeon.plan.rooms.map((r) => r.number) ?? [];

/** Строка списка комнат по её номеру. */
const roomRow = (number: number): HTMLElement =>
  document.querySelector(`.dungeons-page__rooms > li[data-room="${number}"]`) as HTMLElement;

describe("вкладка «Подземелья»: схема для окна игроков", () => {
  it("открытая схема уезжает в окно сразу, ещё до того как окно открыли", async () => {
    const dungeon = await openDungeon();

    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    expect(opened).toBe(0);
    expect(last()?.title).toBe(sheetTitle(dungeon, 1));
    // Отряд не открыл ни одной комнаты — в окне пустое поле, а не вся схема.
    expect(roomsInWindow()).toEqual([]);
  });

  it("смена статуса комнаты доезжает до окна тем же вызовом", async () => {
    await openDungeon();
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    const before = sent.length;

    await act(async () => fireEvent.click(within(roomRow(2)).getByText(/^Отметить:/)));

    await waitFor(() => expect(sent.length).toBeGreaterThan(before));
    expect(roomsInWindow()).toEqual([2]);

    // Второй щелчок — «исследовано»: комната остаётся видной.
    await act(async () => fireEvent.click(within(roomRow(2)).getByText(/^Отметить:/)));
    await waitFor(() => expect(roomsInWindow()).toEqual([2]));

    // Третий — круг замкнулся на «не исследовано», и комната из окна ушла.
    await act(async () => fireEvent.click(within(roomRow(2)).getByText(/^Отметить:/)));
    await waitFor(() => expect(roomsInWindow()).toEqual([]));
  });

  it("мастер переключил этаж — в окне схема этого этажа", async () => {
    const dungeon = await openDungeon();
    await act(async () => fireEvent.click(within(roomRow(2)).getByText(/^Отметить:/)));
    await waitFor(() => expect(roomsInWindow()).toEqual([2]));

    const tabs = screen.getByRole("group", { name: "Этаж" });
    await act(async () => fireEvent.click(within(tabs).getByRole("button", { name: "Этаж 2" })));

    await waitFor(() => expect(last()?.title).toBe(sheetTitle(dungeon, 2)));
    // Статус комнаты 2 стоял на ПЕРВОМ этаже: на втором эта комната закрыта,
    // и в окне её нет — ключи этажей не перепутаны.
    expect(roomsInWindow()).toEqual([]);
  });

  it("кнопка «Показать игрокам» выводит окно, ничего больше не меняя", async () => {
    await openDungeon();
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    const before = sent.length;

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Показать игрокам" })));

    expect(opened).toBe(1);
    // Схема уже лежит в приложении — кнопка её не пересылает.
    expect(sent.length).toBe(before);
  });

  it("мастер закрыл схему — в окно уходит пустота, а не последняя схема", async () => {
    await openDungeon();
    await act(async () => fireEvent.click(within(roomRow(2)).getByText(/^Отметить:/)));
    await waitFor(() => expect(roomsInWindow()).toEqual([2]));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "← К списку" })));

    await waitFor(() => expect(last()).toBeNull());
  });

  it("подпись выбора листа называет и неисследованные комнаты", async () => {
    await openDungeon();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить картинкой" }));

    expect(
      await screen.findByText(
        /На листе игроков нет ловушек, потайных ходов, заметок мастера и ещё не исследованных комнат и отметок\./,
      ),
    ).toBeInTheDocument();
  });
});
