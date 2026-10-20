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
import { findDungeonTable } from "../eventTables/dungeonTables";
import { generateDungeon, lineTitle } from "../dungeons/dungeonGenerator";
import { readTrapNumbers, type TrapNumbers } from "../dungeons/trapNumbers";
import { DungeonsPage } from "./DungeonsPage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound: vi.fn() }));

/**
 * Вкладка «Подземелья»: управление созданием — размер, назначение, семя,
 * переименование и пересборка.
 *
 * Пробы идут ЧЕРЕЗ экран и смотрят на «диск»: правила размеров и отказов
 * проверены у своих владельцев (`dungeonSize.test.ts`, `dungeonEdit.test.ts`),
 * здесь проверяется ровно то, чего там не видно, — что экран передаёт
 * выбранное генератору и записывает в кампанию.
 */

const numbers = readTrapNumbers(bundledRules as RuleTopic[]) as TrapNumbers;
let disk: CampaignState;

beforeAll(() => {
  // Разовая цена первого getComputedStyle в jsdom — платит не первая проба.
  getComputedStyle(document.body);
});

beforeEach(() => {
  disk = { ...emptyCampaignState(), id: "c1", campaignName: "Поход", dungeons: [] };
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

/**
 * Открывает список подземелий кампании и ждёт готовности формы. Из самого
 * списка (после «← К списку») входить уже некуда — тогда вход пропускается.
 */
async function openList() {
  const entry = screen.queryByText("Подземелья кампании");
  if (entry) fireEvent.click(entry);
  const create = await screen.findByRole("button", { name: "Создать подземелье" });
  await waitFor(() => expect(create).toBeEnabled());
  return create;
}

/** Заполняет форму и создаёт подземелье; возвращает запись с «диска». */
async function createWith({
  size,
  purpose,
  seed,
}: {
  size?: string;
  purpose?: string;
  seed?: string;
}) {
  const create = await openList();
  if (size) fireEvent.click(within(screen.getByLabelText("Размер")).getByRole("button", { name: size }));
  if (purpose) fireEvent.change(screen.getByLabelText("Назначение"), { target: { value: purpose } });
  if (seed !== undefined) fireEvent.change(screen.getByLabelText("Семя"), { target: { value: seed } });
  await act(async () => fireEvent.click(create));
  return () => disk.dungeons![disk.dungeons!.length - 1];
}

const purposeRows = findDungeonTable("dungeon-purpose")!.rows;

describe("создание подземелья: размер, назначение, семя", () => {
  it("введённое семя, выбранный размер и назначение едут в схему и в запись", async () => {
    await mount();
    const row = purposeRows[6];
    const saved = await createWith({ size: "Малое", purpose: String(row.from), seed: "20261019" });

    const record = saved();
    expect([record.seed, record.size, record.purposeRoll]).toEqual([20261019, "Малое", row.from]);
    // Схема — ровно та, что даёт генератор на этих параметрах: экран ничего
    // своего в них не подмешал.
    expect(record.plan).toEqual(
      generateDungeon({
        seed: 20261019,
        partyLevel: record.partyLevel,
        danger: record.danger,
        numbers,
        bestiary: bundledBestiary,
        size: "Малое",
        purposeRoll: row.from,
      }),
    );
    expect(record.plan.purpose!.text).toBe(row.text);
    expect(record.name).toBe(lineTitle(row.text));
    expect(record.plan.rooms.length).toBeLessThanOrEqual(5);
  });

  it("пустое поле семени даёт случайное: два подземелья подряд разные", async () => {
    await mount();
    await createWith({ size: "Среднее" });
    fireEvent.click(await screen.findByText("← К списку"));
    await createWith({});
    const [first, second] = disk.dungeons!;
    expect(second.seed).not.toBe(first.seed);
  });

  it("мусор в поле семени — отказ с объяснением, подземелье не создаётся", async () => {
    await mount();
    const create = await openList();
    fireEvent.change(screen.getByLabelText("Семя"), { target: { value: "не число" } });
    await act(async () => fireEvent.click(create));
    expect(screen.getByText(/Семя — целое число/)).toBeInTheDocument();
    expect(disk.dungeons).toHaveLength(0);
  });

  it("«Случайно» по умолчанию: назначение выпадает, а не берётся из списка", async () => {
    await mount();
    const saved = await createWith({ seed: "4242" });
    const record = saved();
    expect(record.purposeRoll ?? null).toBeNull();
    expect(record.plan.purpose!.roll).toBe(
      generateDungeon({
        seed: 4242,
        partyLevel: record.partyLevel,
        danger: record.danger,
        numbers,
        bestiary: bundledBestiary,
      }).purpose!.roll,
    );
  });

  it("семя и размер видны в шапке открытой схемы", async () => {
    await mount();
    await createWith({ size: "Большое", seed: "777" });
    const lead = document.querySelector(".dungeons-page__lead")!;
    expect(lead).toHaveTextContent("семя 777");
    expect(lead).toHaveTextContent("большое");
  });
});

describe("переименование подземелья", () => {
  it("меняется в заголовке открытой схемы и переживает перезагрузку", async () => {
    const view = await mount();
    await createWith({ seed: "100" });
    fireEvent.click(screen.getByRole("button", { name: "Переименовать" }));
    fireEvent.change(screen.getByLabelText("Название подземелья"), {
      target: { value: "  Логово у реки  " },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Сохранить" })));

    expect(screen.getByRole("heading", { name: "Логово у реки" })).toBeInTheDocument();
    expect(disk.dungeons![0].name).toBe("Логово у реки");

    view.unmount();
    await mount();
    fireEvent.click(screen.getByText("Подземелья кампании"));
    expect(await screen.findByText("Логово у реки")).toBeInTheDocument();
  });

  it("меняется в строке списка", async () => {
    await mount();
    await createWith({ seed: "101" });
    fireEvent.click(await screen.findByText("← К списку"));

    fireEvent.click(screen.getByRole("button", { name: "Переименовать" }));
    fireEvent.change(screen.getByLabelText("Название подземелья"), { target: { value: "Шахта" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Сохранить" })));
    expect(disk.dungeons![0].name).toBe("Шахта");
    expect(screen.getByText("Шахта")).toBeInTheDocument();
  });

  it("пустое имя не сохраняется: кнопка погашена, имя остаётся прежним", async () => {
    await mount();
    const saved = await createWith({ seed: "102" });
    const before = saved().name;

    fireEvent.click(screen.getByRole("button", { name: "Переименовать" }));
    const field = screen.getByLabelText("Название подземелья");
    fireEvent.change(field, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    // И через Enter тоже: отказ принадлежит правилу, а не погашенной кнопке.
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
    expect(saved().name).toBe(before);
    expect(screen.getByLabelText("Название подземелья")).toBeInTheDocument();
  });
});

describe("пересборка подземелья", () => {
  it("новое семя, те же уровень, опасность, размер и назначение", async () => {
    await mount();
    const row = purposeRows[9];
    const saved = await createWith({ size: "Большое", purpose: String(row.from), seed: "500" });
    const before = saved();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Пересобрать" })));
    const after = saved();

    expect(after.seed).not.toBe(before.seed);
    expect([after.size, after.purposeRoll]).toEqual(["Большое", row.from]);
    expect([after.partyLevel, after.danger]).toEqual([before.partyLevel, before.danger]);
    expect(after.plan.purpose!.roll).toBe(row.from);
    expect(after.plan.rooms).not.toEqual(before.plan.rooms);
    expect(after.id).toBe(before.id);
  });

  it("со статусами сначала спрашивает и перечисляет, что пропадёт", async () => {
    await mount();
    const saved = await createWith({ seed: "501" });
    const map = await screen.findByRole("img", { name: /^Схема:/ });

    // Статус отметке ставит мастер — именно он и пропадёт при пересборке.
    fireEvent.click(map.querySelector('[data-marker="trap-1"]')!);
    const detail = screen.getByRole("article", { name: "Описание отметки" });
    await act(async () => fireEvent.click(within(detail).getByText(/^Отметить:/)));
    expect(Object.keys(saved().statuses)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Пересобрать" }));
    const confirm = screen.getByText(/Пропадёт: отметок со статусом: 1/);
    expect(confirm).toBeInTheDocument();
    // «Нет» оставляет схему как была.
    fireEvent.click(screen.getByRole("button", { name: "Нет" }));
    expect(saved().statuses["trap-1"]).toBe("discovered");

    const before = saved().plan.rooms;
    fireEvent.click(screen.getByRole("button", { name: "Пересобрать" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Да, пересобрать" })));
    expect(saved().statuses).toEqual({});
    expect(saved().plan.rooms).not.toEqual(before);
  });

  it("у нетронутой схемы не спрашивает", async () => {
    await mount();
    const saved = await createWith({ seed: "502" });
    expect(saved().statuses).toEqual({});
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Пересобрать" })));
    expect(screen.queryByText(/Пропадёт/)).toBeNull();
    expect(saved().seed).not.toBe(502);
  });
});

describe("подземелье, созданное до выбора размера", () => {
  /** Запись без `size` и `purposeRoll` — как её пишет старое приложение. */
  function oldRecord(): DungeonRecord {
    const plan = generateDungeon({
      seed: 20261018,
      partyLevel: 3,
      danger: "Опасная",
      numbers,
      bestiary: bundledBestiary,
    });
    return {
      id: "d-old",
      name: lineTitle(plan.purpose!.text),
      createdAt: "2026-10-18T10:00:00Z",
      seed: 20261018,
      partyLevel: 3,
      danger: "Опасная",
      plan,
      statuses: {},
    };
  }

  it("открывается как «Среднее / Случайно» и так же пересобирается", async () => {
    disk = { ...disk, dungeons: [oldRecord()] };
    await mount();
    fireEvent.click(screen.getByText("Подземелья кампании"));
    expect(await screen.findByText(/среднее/)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Открыть" }));
    await screen.findByRole("img", { name: /^Схема:/ });
    expect(document.querySelector(".dungeons-page__lead")).toHaveTextContent("семя 20261018");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Пересобрать" })));
    const after = disk.dungeons![0];
    expect(after.size).toBe("Среднее");
    expect(after.purposeRoll ?? null).toBeNull();
    expect(after.plan.width).toBe(34);
    expect(after.plan.rooms.length).toBeGreaterThanOrEqual(6);
  });
});
