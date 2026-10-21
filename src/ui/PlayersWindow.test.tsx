import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DungeonRecord } from "../state/types";
import type { DungeonPlan } from "./dungeons/dungeonGenerator";
import { playersMapView, type PlayersMapView } from "./dungeons/playersMap";
import { PlayersWindow } from "./PlayersWindow";

/**
 * Окно «для игроков»: что в нём видно и как до него доезжает смена статуса.
 *
 * Схема здесь своя, маленькая: комната 1 — открыта, комната 2 — нет, между ними
 * проход, на проходе обнаруженная дверь и исследованная ловушка. Правило
 * видимости проверено своими пробами (`mapAudience.test.ts`), здесь проверяется
 * окно: что оно спрашивает схему при открытии, что получает правки событием и
 * что управления в нём нет.
 */

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

const plan: DungeonPlan = {
  seed: 20261021,
  partyLevel: 3,
  danger: "Опасная",
  width: 10,
  height: 6,
  purpose: { roll: 1, text: "Усыпальница" },
  entrance: { roll: 2, text: "Пролом в стене" },
  rooms: [
    { number: 1, x: 1, y: 1, w: 2, h: 2, kind: { roll: 3, text: "Караулка" }, dwellers: null },
    {
      number: 2,
      x: 5,
      y: 1,
      w: 2,
      h: 2,
      kind: { roll: 4, text: "Молельня" },
      dwellers: { roll: 5, text: "Стая волков", monsters: [{ id: "wolf", name: "Волк" }] },
    },
  ],
  corridors: [
    [3, 1],
    [4, 1],
  ],
  secretPath: [
    [2, 2],
    [5, 1],
  ],
  markers: [
    {
      id: "door-1",
      kind: "door",
      x: 3,
      y: 1,
      line: { roll: 1, text: "Створка из дуба" },
      trap: null,
      connects: null,
    },
    {
      id: "trap-1",
      kind: "trap",
      x: 4,
      y: 1,
      line: null,
      trap: null,
      connects: null,
    },
  ],
} as DungeonPlan;

function dungeon(statuses: Record<string, string>): DungeonRecord {
  return {
    id: "d1",
    name: "Склеп старого рода",
    createdAt: "2026-10-21T10:00:00Z",
    seed: 20261021,
    partyLevel: 3,
    danger: "Опасная",
    plan,
    statuses: statuses as DungeonRecord["statuses"],
    notes: { "room-2": "подменить алтарь" },
  };
}

/** Схема в том виде, в каком её отправляет мастер (`DungeonsPage`). */
function view(statuses: Record<string, string>, title = "Склеп старого рода"): PlayersMapView {
  return playersMapView(dungeon(statuses), 1, title);
}

const OPEN_ONE = { "room-1": "discovered", "door-1": "discovered", "trap-1": "explored" };
const OPEN_BOTH = { ...OPEN_ONE, "room-2": "explored" };

/** Обработчик события, которым окно получает правки. */
let deliver: ((event: { payload: PlayersMapView | null }) => void) | null = null;
let unlisten: () => void;

beforeEach(() => {
  deliver = null;
  unlisten = vi.fn();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((_event, handler) => {
    deliver = handler as typeof deliver;
    return Promise.resolve(unlisten);
  });
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(null);
  vi.mocked(getCurrentWindow).mockReset();
  vi.mocked(getCurrentWindow).mockReturnValue({
    label: "players",
    isFullscreen: vi.fn().mockResolvedValue(false),
    setFullscreen: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof getCurrentWindow>);
});

/** Что нарисовано на схеме окна. */
function drawn(): { rooms: string[]; corridors: string[]; markers: string[] } {
  const svg = screen.getByRole("img", { name: /Схема/ });
  const at = (attribute: string) =>
    [...svg.querySelectorAll(`[${attribute}]`)].map((e) => e.getAttribute(attribute)!);
  return { rooms: at("data-room"), corridors: at("data-corridor"), markers: at("data-marker") };
}

describe("окно для игроков", () => {
  it("при открытии спрашивает схему у приложения и рисует её", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_BOTH));

    render(<PlayersWindow />);

    await screen.findByRole("img", { name: "Схема: Склеп старого рода" });
    expect(invoke).toHaveBeenCalledWith("players_map_get");
    expect(listen).toHaveBeenCalledWith("players-map", expect.any(Function));
    expect(drawn().rooms).toEqual(["1", "2"]);
    expect(screen.getByText("Склеп старого рода")).toBeInTheDocument();
  });

  it("неоткрытой комнаты, прохода к ней и ловушки в окне нет вовсе", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_ONE));

    render(<PlayersWindow />);
    await screen.findByRole("img", { name: /Схема/ });

    const { rooms, corridors, markers } = drawn();
    expect(rooms).toEqual(["1"]);
    // Проход ведёт в комнату 2, которой отряд не открыл: клеток прохода в
    // разметке нет — они не спрятаны стилем.
    expect(corridors).toEqual([]);
    // Ловушка не показывается игрокам никогда, дверь — по статусу.
    expect(markers).toEqual(["door-1"]);
  });

  it("описаний, обитателей, заметок и семени в окне нет ни в одном виде", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_BOTH));

    render(<PlayersWindow />);
    await screen.findByRole("img", { name: /Схема/ });

    const markup = document.body.innerHTML;
    for (const secret of [
      "Караулка",
      "Молельня",
      "Стая волков",
      "подменить алтарь",
      "20261021",
      "Усыпальница",
    ]) {
      expect(markup).not.toContain(secret);
    }
  });

  it("у отметок только значок вида: ни номера, ни подписи", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_BOTH));

    render(<PlayersWindow />);
    const svg = await screen.findByRole("img", { name: /Схема/ });

    const door = svg.querySelector('[data-marker="door-1"]')!;
    expect(door.querySelector("text")).toBeNull();
    expect(door.getAttribute("aria-label")).toBeNull();
    // Номера открытых комнат, наоборот, подписаны: карточка просит их показать.
    expect([...svg.querySelectorAll("text")].map((t) => t.textContent)).toContain("1");
  });

  it("закрытая часть схемы — тёмный фон окна, а не пергамент во всё поле", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_BOTH));

    render(<PlayersWindow />);
    const svg = await screen.findByRole("img", { name: /Схема/ });

    // Подложки «пергамент» и сетки по всему полю в окне нет: за фон отвечает
    // окно (`--dm-panel`), и закрытая часть подземелья — он и есть, туман.
    // Будь подложка нарисована, туман вышел бы светлым листом с пустыми
    // местами, по которым видно, где комнат НЕТ.
    expect(svg.innerHTML).not.toContain("#efe6d2");
    // Пол открытых комнат при этом нарисован — схема не стала пустой.
    expect(svg.querySelectorAll("[data-room]")).toHaveLength(2);
  });

  it("смена статуса у мастера доходит до окна без перезагрузки", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_ONE));

    render(<PlayersWindow />);
    await screen.findByRole("img", { name: /Схема/ });
    expect(drawn().rooms).toEqual(["1"]);

    // Мастер открыл комнату 2 — и отправил схему заново тем же событием.
    deliver!({ payload: view(OPEN_BOTH) });

    await waitFor(() => expect(drawn().rooms).toEqual(["1", "2"]));
    // Вместе с комнатой появился и проход к ней — он теперь между открытыми.
    expect(drawn().corridors).toEqual(["3,1", "4,1"]);
  });

  it("мастер переключил этаж — в заголовке новый лист", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_BOTH));

    render(<PlayersWindow />);
    await screen.findByRole("img", { name: /Схема/ });

    deliver!({ payload: view(OPEN_BOTH, "Склеп старого рода · Этаж 2") });

    expect(await screen.findByText("Склеп старого рода · Этаж 2")).toBeInTheDocument();
  });

  it("мастер закрыл схему — заставка, а не последняя схема", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_BOTH));

    render(<PlayersWindow />);
    await screen.findByRole("img", { name: /Схема/ });

    deliver!({ payload: null });

    expect(await screen.findByText("Мастер пока не вывел схему")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Схема/ })).toBeNull();
  });

  it("схемы нет вовсе — окно открывается заставкой, а не пустым белым полем", async () => {
    render(<PlayersWindow />);

    expect(await screen.findByText("Мастер пока не вывел схему")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Схема/ })).toBeNull();
  });

  it("менять игроки не могут ничего: кнопка одна, и она про полный экран", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_BOTH));

    render(<PlayersWindow />);
    const svg = await screen.findByRole("img", { name: /Схема/ });

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Во весь экран (F11)",
    ]);
    // Ни комната, ни отметка не нажимаются: на экране мастера они кнопки, тут
    // рисунок.
    expect(svg.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(svg.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("во весь экран — кнопкой и клавишей F11", async () => {
    const own = getCurrentWindow();
    render(<PlayersWindow />);
    await screen.findByText("Мастер пока не вывел схему");

    fireEvent.click(screen.getByRole("button", { name: "Во весь экран (F11)" }));
    await waitFor(() => expect(own.setFullscreen).toHaveBeenCalledWith(true));
    // Признак берётся у самого окна, а не выдумывается: кнопка теперь обратная.
    expect(await screen.findByRole("button", { name: "Выйти из полного экрана" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "F11" });
    await waitFor(() => expect(own.setFullscreen).toHaveBeenCalledTimes(2));
  });

  it("закрываясь, окно снимает подписку", async () => {
    vi.mocked(invoke).mockResolvedValue(view(OPEN_BOTH));
    const screenView = render(<PlayersWindow />);
    await screen.findByRole("img", { name: /Схема/ });

    screenView.unmount();

    expect(unlisten).toHaveBeenCalled();
  });
});
