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
import {
  floorCount,
  floorFields,
  floorPlan,
  planFloor,
} from "../dungeons/dungeonFloors";
import { generateFloorPlans, lineTitle } from "../dungeons/dungeonGenerator";
import { dungeonMapSvg, sheetTitle } from "../dungeons/DungeonMapImage";
import { roomKey } from "../dungeons/markerStatus";
import { freeFloorCells } from "../dungeons/trapPlacement";
import { readTrapNumbers, type TrapNumbers } from "../dungeons/trapNumbers";
import { DungeonsPage } from "./DungeonsPage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound: vi.fn() }));

/**
 * Вкладка «Подземелья»: этажи на экране — переключатель, переход по лестнице и
 * то, какой этаж уходит в картинку.
 *
 * Правила самих этажей (семя, лестницы, ключи, форма записи) проверены у их
 * владельца — `dungeonFloors.test.ts`. Здесь ровно то, чего там не видно:
 * что экран показывает ОТКРЫТЫЙ этаж и пишет статусы под его ключами.
 */

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
let disk: CampaignState;
/** Путь, который вернул диалог «Сохранить как», и то, что ушло в файл. */
let savedPng: { path: string; bytesBase64: string } | null;

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: () => Promise.resolve("C:/tmp/схема.png"),
}));

/**
 * Чем экран позвал отрисовку листа: публика и ЭТАЖ.
 *
 * Без этой записи проверить «сохраняется открытый этаж» нечем: растр делает
 * `canvas`, которого в jsdom нет, и настоящий `dungeonMapPngBase64` падает,
 * не дойдя до команды записи. А сравнивать разметку листа, собранную самой
 * пробой, значило бы проверять `dungeonMapSvg` второй раз и ничего не узнать о
 * том, какой этаж ему передал экран.
 */
const pngCalls: { audience: string; floor: number | undefined }[] = [];

vi.mock("../dungeons/DungeonMapImage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../dungeons/DungeonMapImage")>();
  return {
    ...real,
    dungeonMapPngBase64: (_dungeon: unknown, audience: string, floor?: number) => {
      pngCalls.push({ audience, floor });
      return Promise.resolve("0JHQsNC30LA2NA==");
    },
  };
});

beforeAll(() => {
  // Разовая цена первого getComputedStyle в jsdom — платит не первая проба.
  getComputedStyle(document.body);
});

beforeEach(() => {
  disk = { ...emptyCampaignState(), id: "c1", campaignName: "Поход", dungeons: [] };
  savedPng = null;
  pngCalls.length = 0;
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
        // Числа собранной ловушки эта проба не проверяет — её интересует, на
        // какой этаж ловушка легла.
        return Promise.resolve({ total: 1 });
      case "save_png_file":
        savedPng = args as { path: string; bytesBase64: string };
        return Promise.resolve(undefined);
      default:
        return Promise.resolve(undefined);
    }
  });
});

/** Подземелье на `count` этажей, записанное в кампанию готовым. */
function multiFloor(count: number, seed = 20261018): DungeonRecord {
  const plans = generateFloorPlans(
    { seed, partyLevel: 3, danger: "Опасная", numbers, bestiary: bundledBestiary },
    count,
  );
  return {
    id: "d-floors",
    name: lineTitle(plans[0].purpose!.text),
    createdAt: "2026-10-20T10:00:00Z",
    seed,
    partyLevel: 3,
    danger: "Опасная",
    size: "Среднее",
    purposeRoll: null,
    ...floorFields(plans),
    statuses: {},
  };
}

async function openDungeon(fixture: DungeonRecord) {
  disk = { ...disk, dungeons: [fixture] };
  render(
    <CampaignProvider>
      <DungeonsPage />
    </CampaignProvider>,
  );
  await screen.findByText("Собрать ловушку");
  fireEvent.click(screen.getByText("Подземелья кампании"));
  fireEvent.click(await screen.findByRole("button", { name: "Открыть" }));
  await screen.findByRole("img", { name: /^Схема:/ });
}

const tabs = () => screen.getByRole("group", { name: "Этаж" });
const map = () => screen.getByRole("img", { name: /^Схема:/ });
const drawnMarkers = () =>
  Array.from(map().querySelectorAll("[data-marker]"), (m) => m.getAttribute("data-marker"));

describe("вкладка «Подземелья»: этажи", () => {
  it("на форме выбирается от одного до трёх этажей, по умолчанию один", async () => {
    render(
      <CampaignProvider>
        <DungeonsPage />
      </CampaignProvider>,
    );
    await screen.findByText("Собрать ловушку");
    fireEvent.click(screen.getByText("Подземелья кампании"));
    const create = await screen.findByRole("button", { name: "Создать подземелье" });
    await waitFor(() => expect(create).toBeEnabled());

    const select = screen.getByLabelText("Этажей") as HTMLSelectElement;
    expect(Array.from(select.options, (o) => o.value)).toEqual(["1", "2", "3"]);
    expect(select.value).toBe("1");

    // По умолчанию — одноэтажное: ни нижних этажей, ни переключателя.
    await act(async () => fireEvent.click(create));
    expect(floorCount(disk.dungeons![0])).toBe(1);
    expect(screen.queryByRole("group", { name: "Этаж" })).toBeNull();
  });

  it("выбранное число этажей доезжает до записи кампании", async () => {
    render(
      <CampaignProvider>
        <DungeonsPage />
      </CampaignProvider>,
    );
    await screen.findByText("Собрать ловушку");
    fireEvent.click(screen.getByText("Подземелья кампании"));
    const create = await screen.findByRole("button", { name: "Создать подземелье" });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Этажей"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Семя"), { target: { value: "20261018" } });
    await act(async () => fireEvent.click(create));

    const saved = disk.dungeons![0];
    expect(floorCount(saved)).toBe(3);
    // Семя записи — ОБЩЕЕ, вписанное мастером; этажи выведены из него.
    expect(saved.seed).toBe(20261018);
    expect([saved.plan, ...saved.lowerFloors!]).toEqual(
      generateFloorPlans(
        {
          seed: 20261018,
          partyLevel: saved.partyLevel,
          danger: "Опасная",
          numbers,
          bestiary: bundledBestiary,
          size: "Среднее",
          purposeRoll: null,
        },
        3,
      ),
    );
    // Переключатель этажей появился, и открыт первый.
    expect(within(tabs()).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Этаж 1",
      "Этаж 2",
      "Этаж 3",
    ]);
    expect(within(tabs()).getByRole("button", { name: "Этаж 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("вкладка открывает схему своего этажа, а не первого", async () => {
    const fixture = multiFloor(3);
    await openDungeon(fixture);
    expect(drawnMarkers()).toEqual(fixture.plan.markers.map((m) => m.id));

    fireEvent.click(within(tabs()).getByRole("button", { name: "Этаж 2" }));
    const second = floorPlan(fixture, 2);
    expect(drawnMarkers()).toEqual(second.markers.map((m) => m.id));
    // Подпись «▼ вход» — только у первого этажа: вниз входят по лестнице.
    expect(map().textContent).not.toContain("▼ вход");
    // Падеж проверяется дословно: `floorLabel(n).toLowerCase()` даёт «этаж 1»,
    // и в живом окне подпись читалась «лестница с этаж 1».
    const lead = () => document.querySelector(".dungeons-page__lead")!;
    expect(lead()).toHaveTextContent("Вход: лестница с этажа 1");
    expect(lead().textContent).not.toContain("с этаж 1");

    fireEvent.click(within(tabs()).getByRole("button", { name: "Этаж 1" }));
    expect(map().textContent).toContain("▼ вход");
  });

  it("щелчок по лестнице даёт кнопку перехода, и она открывает нужный этаж", async () => {
    const fixture = multiFloor(3);
    await openDungeon(fixture);
    const down = fixture.plan.markers.find((m) => m.kind === "stairs")!;
    expect(down.stairs).toBe("down");

    fireEvent.click(map().querySelector(`[data-marker="${down.id}"]`)!);
    const detail = screen.getByRole("article", { name: "Описание отметки" });
    expect(detail).toHaveTextContent("Лестница вниз");
    fireEvent.click(within(detail).getByRole("button", { name: "Перейти на этаж 2" }));

    // Открылся второй этаж, и описание отметки первого закрылось.
    expect(within(tabs()).getByRole("button", { name: "Этаж 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(drawnMarkers()).toEqual(floorPlan(fixture, 2).markers.map((m) => m.id));
    expect(screen.queryByRole("article", { name: "Описание отметки" })).toBeNull();

    // Обратно, вверх: на втором этаже лестница вверх ведёт на первый.
    const up = floorPlan(fixture, 2).markers.find((m) => m.stairs === "up")!;
    fireEvent.click(map().querySelector(`[data-marker="${up.id}"]`)!);
    const back = screen.getByRole("article", { name: "Описание отметки" });
    expect(back).toHaveTextContent("Лестница вверх");
    fireEvent.click(within(back).getByRole("button", { name: "Перейти на этаж 1" }));
    expect(drawnMarkers()).toEqual(fixture.plan.markers.map((m) => m.id));
  });

  it("статус отметки и комнаты нижнего этажа пишется под ключом этажа", async () => {
    const fixture = multiFloor(2);
    await openDungeon(fixture);
    fireEvent.click(within(tabs()).getByRole("button", { name: "Этаж 2" }));

    const marker = floorPlan(fixture, 2).markers.find((m) => m.kind === "door")!;
    expect(marker.id).toMatch(/^f2-door-\d+$/);
    fireEvent.click(map().querySelector(`[data-marker="${marker.id}"]`)!);
    const detail = screen.getByRole("article", { name: "Описание отметки" });
    await act(async () => fireEvent.click(within(detail).getByText(/^Отметить:/)));
    expect(disk.dungeons![0].statuses[marker.id]).toBe("discovered");

    // Комната: ключ с приставкой этажа, и одноимённая комната первого этажа
    // остаётся нетронутой.
    const room = floorPlan(fixture, 2).rooms[1];
    const row = document.querySelector(`.dungeons-page__rooms [data-room="${room.number}"]`)!;
    await act(async () => fireEvent.click(within(row as HTMLElement).getByText(/^Отметить:/)));
    expect(disk.dungeons![0].statuses[roomKey(room.number, 2)]).toBe("discovered");
    expect(disk.dungeons![0].statuses[roomKey(room.number, 1)]).toBeUndefined();
  });

  it("картинка сохраняет ОТКРЫТЫЙ этаж, и номер этажа стоит в заголовке листа", async () => {
    const fixture = multiFloor(2);
    await openDungeon(fixture);
    fireEvent.click(within(tabs()).getByRole("button", { name: "Этаж 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить картинкой" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "для мастера" })),
    );

    // Экран позвал отрисовку ВТОРОГО этажа — и записал файл.
    expect(pngCalls).toEqual([{ audience: "master", floor: 2 }]);
    expect(savedPng?.path).toBe("C:/tmp/схема.png");
    expect(screen.getByRole("status")).toHaveTextContent("Схема сохранена");

    const second = dungeonMapSvg(fixture, "master", 2);
    expect(second).toContain(`${fixture.name} · Этаж 2`);
    expect(sheetTitle(fixture, 2)).toBe(`${fixture.name} · Этаж 2`);
    // На листе второго этажа — его отметки, и ни одной отметки первого.
    for (const m of floorPlan(fixture, 2).markers) {
      expect(second).toContain(`data-marker="${m.id}"`);
    }
    for (const m of fixture.plan.markers) {
      expect(second).not.toContain(`data-marker="${m.id}"`);
    }
    // У одноэтажного номера этажа в заголовке нет вовсе.
    const alone = multiFloor(1);
    expect(sheetTitle(alone, 1)).toBe(alone.name);
    expect(dungeonMapSvg(alone, "master", 1)).not.toContain("Этаж");
  });

  it("ручная ловушка из генератора ложится на выбранный там этаж", async () => {
    const fixture = multiFloor(2);
    disk = { ...disk, dungeons: [fixture] };
    render(
      <CampaignProvider>
        <DungeonsPage />
      </CampaignProvider>,
    );
    await screen.findByText("Собрать ловушку");
    fireEvent.click(screen.getByText("Собрать ловушку"));
    const assemble = await screen.findByRole("button", { name: "Собрать ловушку" });
    await waitFor(() => expect(assemble).toBeEnabled());
    await act(async () => fireEvent.click(assemble));
    await screen.findByRole("article", { name: "Собранная ловушка" });
    fireEvent.click(screen.getByRole("button", { name: "Поставить в подземелье" }));

    fireEvent.click(within(tabs()).getByRole("button", { name: "Этаж 2" }));
    const [x, y] = freeFloorCells(floorPlan(fixture, 2))[0];
    await act(async () =>
      fireEvent.click(map().querySelector(`[data-cell="${x},${y}"]`)!),
    );

    const saved = disk.dungeons![0];
    expect(saved.plan.markers).toHaveLength(fixture.plan.markers.length);
    const mine = floorPlan(saved, 2).markers.slice(-1)[0];
    expect(mine.id).toMatch(/^f2-trap-\d+$/);
    expect([mine.x, mine.y]).toEqual([x, y]);
    expect(planFloor(floorPlan(saved, 2))).toBe(2);
    expect(screen.getByText(/Ловушка поставлена/)).toHaveTextContent("этаж 2");
  });
});
