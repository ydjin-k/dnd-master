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
import { findTable, rowForRoll } from "../eventTables";
import { generateDungeon, MARKER_KINDS } from "../dungeons/dungeonGenerator";
import { markerStatusOf } from "../dungeons/markerStatus";
import { readTrapNumbers } from "../dungeons/trapNumbers";
import { floorCells, freeFloorCells } from "../dungeons/trapPlacement";
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
        // Происхождение бэкенд ставит по файлу-источнику (`bestiary.rs`), в
        // самом JSON его нет: без него карточка существа не знала бы, чью
        // подпись ставить, и проба на подпись SRD проверяла бы пустоту.
        return Promise.resolve(bundledBestiary.map((m) => ({ ...m, origin: "srd" })));
      case "combat_add":
        // `combat_add` отдаёт НОВОЕ состояние кампании, и контекст его
        // применяет; верни отсюда `undefined` — и state обнулится.
        return Promise.resolve(disk);
      case "roll_dice":
        return Promise.resolve({ total: rolls.shift() ?? 1 });
      default:
        return Promise.resolve(undefined);
    }
  });
});

/** Персонажи кампании: бой без своей стороны не поднимается. */
function withParty() {
  disk = {
    ...disk,
    characters: [
      { id: "ch1", name: "Тестовый герой", level: 3 },
      { id: "ch2", name: "Вторая", level: 3 },
    ] as unknown as CampaignState["characters"],
  };
}

/**
 * Готовая схема в кампании, а не созданная нажатием: семя у «Создать
 * подземелье» случайное (`crypto.getRandomValues`), и комната с существами в
 * нём выпадает не всегда. Семя подбирается перебором, а не вписано числом:
 * строки обитателей правит соседняя карточка, и зашитое семя сломалось бы от
 * чужой правки таблицы.
 */
function dungeonWithDwellers(): DungeonRecord {
  const numbers = readTrapNumbers(bundledRules as RuleTopic[])!;
  for (let seed = 1; seed < 500; seed += 1) {
    const plan = generateDungeon({
      seed,
      partyLevel: 3,
      danger: "Опасная",
      numbers,
      bestiary: bundledBestiary,
    });
    const hasMonsters = plan.rooms.some((r) => (r.dwellers?.monsters.length ?? 0) > 0);
    const hasLivedIn = plan.rooms.some((r) => r.dwellers && r.dwellers.monsters.length === 0);
    if (hasMonsters && hasLivedIn) {
      return {
        id: "d-fixture",
        name: "Проба обитателей",
        createdAt: "2026-10-18T10:00:00Z",
        seed,
        partyLevel: 3,
        danger: "Опасная",
        plan,
        statuses: {},
      };
    }
  }
  throw new Error("нет схемы и с существами, и со строкой «пусто, но обжито»");
}

/** Строки списка комнат — в том же порядке, что `plan.rooms`. */
function roomRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll(".dungeons-page__rooms > li")) as HTMLElement[];
}

async function openFixture(fixture: DungeonRecord) {
  disk = { ...disk, dungeons: [fixture] };
  await mount();
  fireEvent.click(screen.getByText("Подземелья кампании"));
  fireEvent.click(await screen.findByRole("button", { name: "Открыть" }));
  await screen.findByRole("img", { name: /^Схема:/ });
}

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

describe("вкладка «Подземелья»: обитатели комнат", () => {
  it("имя обитателя открывает его карточку из бестиария и закрывается одной кнопкой", async () => {
    withParty();
    const fixture = dungeonWithDwellers();
    await openFixture(fixture);

    const index = fixture.plan.rooms.findIndex((r) => (r.dwellers?.monsters.length ?? 0) > 0);
    const monster = fixture.plan.rooms[index].dwellers!.monsters[0];
    const template = bundledBestiary.find((m) => m.id === monster.id)!;

    fireEvent.click(within(roomRows()[index]).getByRole("button", { name: monster.name }));

    const card = await screen.findByLabelText(`Существо: ${template.name}`);
    // Те же строки, что во вкладке «Бестиарий», и значения — из самого
    // бестиария, а не из разметки: карточка одна на приложение.
    expect(within(card).getByRole("heading", { name: template.name })).toBeInTheDocument();
    expect(within(card).getByText("Класс доспеха").nextSibling).toHaveTextContent(
      String(template.armorClass),
    );
    expect(within(card).getByText("Скорость").nextSibling).toHaveTextContent(
      `${template.speedFeet} футов`,
    );
    expect(within(card).getByText("Хиты").nextSibling).toHaveTextContent(String(template.maxHp));
    expect(within(card).getByText("Пассивная внимательность").nextSibling).toHaveTextContent(
      String(template.passivePerception),
    );
    expect(within(card).getByText("Опасность").nextSibling).toHaveTextContent(
      template.challengeRating,
    );
    expect(within(card).getByRole("heading", { name: "Действия" })).toBeInTheDocument();
    // Подпись об источнике ездит вместе с карточкой, а не со вкладкой.
    expect(within(card).getByText(/System Reference Document 5\.1/)).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Закрыть карточку" }));
    expect(screen.queryByLabelText(`Существо: ${template.name}`)).toBeNull();
  });

  it("«Поднять бой» выводит существ ИМЕННО этой комнаты и всех персонажей", async () => {
    withParty();
    const fixture = dungeonWithDwellers();
    await openFixture(fixture);

    const index = fixture.plan.rooms.findIndex((r) => (r.dwellers?.monsters.length ?? 0) > 0);
    const room = fixture.plan.rooms[index];
    const others = fixture.plan.rooms
      .filter((r, i) => i !== index && (r.dwellers?.monsters.length ?? 0) > 0)
      .flatMap((r) => r.dwellers!.monsters.map((m) => m.id));

    await act(async () =>
      fireEvent.click(within(roomRows()[index]).getByRole("button", { name: "Поднять бой" })),
    );

    const call = vi.mocked(invoke).mock.calls.find(([command]) => command === "combat_add");
    expect(call).toBeDefined();
    const sent = call![1] as { monsterIds: string[]; characterIds: string[] };
    expect(sent).toEqual({
      monsterIds: room.dwellers!.monsters.map((m) => m.id),
      characterIds: ["ch1", "ch2"],
    });
    // Соседние комнаты в бой не поехали.
    for (const id of others) expect(sent.monsterIds).not.toContain(id);
    expect(within(roomRows()[index]).getByText(/Бой начат/)).toBeInTheDocument();
  });

  it("без персонажей кнопка выключена, а строка «пусто, но обжито» её не предлагает", async () => {
    const fixture = dungeonWithDwellers();
    await openFixture(fixture);

    const withMonsters = fixture.plan.rooms.findIndex((r) => (r.dwellers?.monsters.length ?? 0) > 0);
    const livedIn = fixture.plan.rooms.findIndex(
      (r) => r.dwellers && r.dwellers.monsters.length === 0,
    );

    expect(
      within(roomRows()[withMonsters]).getByRole("button", { name: "Поднять бой" }),
    ).toBeDisabled();
    expect(screen.getByText(/добавьте персонажей/i)).toBeInTheDocument();

    const lived = roomRows()[livedIn];
    expect(within(lived).queryByRole("button", { name: "Поднять бой" })).toBeNull();
    expect(lived).toHaveTextContent("Обитатели:");

    expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "combat_add")).toBe(false);
  });
});

describe("вкладка «Подземелья»: ловушка в подземелье", () => {
  /** Собирает ловушку 7 уровня «Смертоносная» — не как у схемы фикстуры. */
  async function assembleOwnTrap() {
    fireEvent.click(screen.getByText("Собрать ловушку"));
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Смертоносная" }));
    rolls = [3, 2, 5, 6, 4, 2, 2];
    const assemble = screen.getByRole("button", { name: "Собрать ловушку" });
    await waitFor(() => expect(assemble).toBeEnabled());
    await act(async () => fireEvent.click(assemble));
    return screen.getByRole("article", { name: "Собранная ловушка" });
  }

  /** Собрать ловушку и поставить её в единственное подземелье кампании. */
  async function placeOwnTrap(cell: readonly [number, number]) {
    const trap = await assembleOwnTrap();
    expect(trap).toHaveTextContent("отряд 7 ур.");
    fireEvent.click(within(trap).getByRole("button", { name: "Поставить в подземелье" }));
    const picker = await screen.findByLabelText("Куда поставить ловушку");
    const [x, y] = cell;
    await act(async () => fireEvent.click(picker.querySelector(`[data-cell="${x},${y}"]`)!));
    return picker;
  }

  it("ставится на свободную клетку пола, получает новый id и переживает перезагрузку", async () => {
    const fixture = dungeonWithDwellers();
    disk = { ...disk, dungeons: [fixture] };
    const view = await mount();

    const trap = await assembleOwnTrap();
    expect(trap).toHaveTextContent("отряд 7 ур.");
    fireEvent.click(within(trap).getByRole("button", { name: "Поставить в подземелье" }));
    const picker = await screen.findByLabelText("Куда поставить ловушку");

    // Клетки под отметками не предлагаются вовсе, как и камень за полом:
    // поставить ловушку куда-то, кроме свободного пола, нечем.
    const floor = new Set(floorCells(fixture.plan).map(([fx, fy]) => `${fx},${fy}`));
    const taken = fixture.plan.markers.find((m) => floor.has(`${m.x},${m.y}`))!;
    expect(picker.querySelector(`[data-cell="${taken.x},${taken.y}"]`)).toBeNull();
    expect(picker.querySelectorAll("[data-cell]")).toHaveLength(
      freeFloorCells(fixture.plan).length,
    );

    const [x, y] = freeFloorCells(fixture.plan)[0];
    await act(async () => fireEvent.click(picker.querySelector(`[data-cell="${x},${y}"]`)!));

    expect(await screen.findByText(/Ловушка поставлена/)).toBeInTheDocument();
    const saved = disk.dungeons![0];
    expect(saved.plan.markers).toHaveLength(fixture.plan.markers.length + 1);
    const placed = saved.plan.markers[saved.plan.markers.length - 1];
    expect([placed.x, placed.y]).toEqual([x, y]);
    expect(placed.placedByMaster).toBe(true);
    expect(fixture.plan.markers.map((m) => m.id)).not.toContain(placed.id);
    expect(markerStatusOf(saved, placed.id)).toBe("unexplored");
    // Числа — те, с которыми собрали: уровень 7 и «Смертоносная» при схеме 3 и
    // «Опасной».
    expect([placed.trap!.partyLevel, placed.trap!.danger]).toEqual([7, "Смертоносная"]);
    expect([saved.partyLevel, saved.danger]).toEqual([3, "Опасная"]);

    // Перезагрузка окна: отметка на схеме, с теми же числами.
    view.unmount();
    await mount();
    fireEvent.click(screen.getByText("Подземелья кампании"));
    fireEvent.click(await screen.findByRole("button", { name: "Открыть" }));
    const map = await screen.findByRole("img", { name: /^Схема:/ });
    const again = map.querySelector(`[data-marker="${placed.id}"]`)!;
    expect(again).toHaveAttribute("data-status", "unexplored");
    fireEvent.click(again);
    const detail = screen.getByRole("article", { name: "Описание отметки" });
    expect(detail).toHaveTextContent("поставлена мастером");
    expect(within(detail).getByText("УС спасброска")).toBeInTheDocument();
    expect(detail).toHaveTextContent(String(placed.trap!.saveDc));
  });

  it("без подземелий ставить некуда, и об этом сказано", async () => {
    await mount();
    const trap = await assembleOwnTrap();
    expect(within(trap).getByRole("button", { name: "Поставить в подземелье" })).toBeDisabled();
    expect(within(trap).getByText(/создайте подземелье/i)).toBeInTheDocument();
  });

  it("поставленную руками ловушку можно убрать с подтверждением, генераторную — нельзя", async () => {
    const fixture = dungeonWithDwellers();
    disk = { ...disk, dungeons: [fixture] };
    await mount();
    await placeOwnTrap(freeFloorCells(fixture.plan)[0]);
    const placed = disk.dungeons![0].plan.markers.slice(-1)[0];

    fireEvent.click(screen.getByText("← Назад"));
    fireEvent.click(screen.getByText("Подземелья кампании"));
    fireEvent.click(await screen.findByRole("button", { name: "Открыть" }));
    const map = await screen.findByRole("img", { name: /^Схема:/ });

    // Генераторную отметку убрать нечем.
    const made = fixture.plan.markers[0];
    fireEvent.click(map.querySelector(`[data-marker="${made.id}"]`)!);
    const madeDetail = screen.getByRole("article", { name: "Описание отметки" });
    expect(within(madeDetail).queryByRole("button", { name: "Убрать" })).toBeNull();
    expect(madeDetail).not.toHaveTextContent("поставлена мастером");

    // Ручную — только после подтверждения.
    fireEvent.click(map.querySelector(`[data-marker="${placed.id}"]`)!);
    const mineDetail = screen.getByRole("article", { name: "Описание отметки" });
    fireEvent.click(within(mineDetail).getByRole("button", { name: "Убрать" }));
    fireEvent.click(within(mineDetail).getByRole("button", { name: "Нет" }));
    expect(disk.dungeons![0].plan.markers.map((m) => m.id)).toContain(placed.id);

    fireEvent.click(within(mineDetail).getByRole("button", { name: "Убрать" }));
    await act(async () =>
      fireEvent.click(within(mineDetail).getByRole("button", { name: "Да, убрать" })),
    );
    expect(disk.dungeons![0].plan.markers.map((m) => m.id)).not.toContain(placed.id);
    expect(
      (await screen.findByRole("img", { name: /^Схема:/ })).querySelector(
        `[data-marker="${placed.id}"]`,
      ),
    ).toBeNull();
    // Схема в остальном цела: генераторные отметки на месте.
    expect(disk.dungeons![0].plan.markers).toHaveLength(fixture.plan.markers.length);
  });
});
