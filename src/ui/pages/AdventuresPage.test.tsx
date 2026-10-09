import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdventuresPage, journalTextFor, journalTextForChain } from "./AdventuresPage";
import { findTable, rowForRoll } from "../eventTables";
import type { CampaignState } from "../../state/types";

const { invokeMock, addJournalEntry, playDiceRollSound, startCombat } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  addJournalEntry: vi.fn(),
  playDiceRollSound: vi.fn(),
  startCombat: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound }));

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, addJournalEntry, startCombat }),
}));

/** Бросок движка, который всегда даёт `total`. */
function rollsAlways(total: number) {
  invokeMock.mockImplementation(async (_cmd: string, args: { expression: string }) => ({
    expression: args.expression,
    rolls: [total],
    modifier: 0,
    total,
    dropped: null,
  }));
}

/**
 * Бросок, который даёт `total`, но не выше кости брошенной таблицы.
 *
 * Нужен цепочке распределителя: в ней подряд бросаются таблицы с РАЗНЫМИ
 * костями, и жёсткое «всегда 18» выдало бы на d10 число, которого на ней нет.
 */
function rollsAlwaysWithin(total: number) {
  invokeMock.mockImplementation(async (_cmd: string, args: { expression: string }) => {
    const die = Number(/^1d(\d+)$/.exec(args.expression)![1]);
    const capped = Math.min(total, die);
    return { expression: args.expression, rolls: [capped], modifier: 0, total: capped, dropped: null };
  });
}

function emptyState(): CampaignState {
  return { id: "c1", campaignName: "Тест", characters: [], journal: [], combat: null, travel: null };
}

/** Отряд из одного бойца: боя без своей стороны не поднять. */
function withOneCharacter(): CampaignState {
  return {
    ...emptyState(),
    characters: [{ id: "ch1", name: "Тестовый герой" }] as unknown as CampaignState["characters"],
  };
}

async function openGenerator() {
  render(<AdventuresPage />);
  fireEvent.click(screen.getByText("Сгенерировать события"));
  return screen.getByLabelText("Таблица событий") as HTMLSelectElement;
}

describe("AdventuresPage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    addJournalEntry.mockReset();
    playDiceRollSound.mockClear();
    startCombat.mockReset();
    mockState = emptyState();
  });

  it("экран выбора показывает один вход и не держит заглушек", () => {
    render(<AdventuresPage />);
    expect(screen.getByText("Сгенерировать события")).toBeInTheDocument();
    expect(screen.queryByText(/Начать приключение/)).not.toBeInTheDocument();
    expect(screen.queryByText(/скоро/i)).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button")) expect(button).not.toBeDisabled();
  });

  it("бросает кость выбранной таблицы и показывает выпавшее число", async () => {
    rollsAlways(5);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });

    fireEvent.click(screen.getByText("Бросить"));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    // Кость — из таблицы: у «Меток фей» она d8, а не d100 «по умолчанию».
    expect(invokeMock.mock.calls[0][1]).toEqual({ expression: "1d8" });
    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(screen.getByText("из d8")).toBeInTheDocument();
    expect(screen.getByText(rowForRoll(findTable("fey-marks")!, 5)!.text)).toBeInTheDocument();
  });

  it("другая таблица — другая кость", async () => {
    rollsAlways(7);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "plot-twists" } });

    fireEvent.click(screen.getByText("Бросить"));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][1]).toEqual({ expression: "1d150" });
  });

  // Ради этой пробы выпавшее и держится на экране до нажатия: неудачный бросок
  // игрок перебрасывает, не засоряя историю кампании.
  it("бросок без нажатия «В дневник» дневник не меняет", async () => {
    rollsAlways(3);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });

    fireEvent.click(screen.getByText("Бросить"));
    await screen.findByText("3");
    fireEvent.click(screen.getByText("Бросить"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));

    expect(addJournalEntry).not.toHaveBeenCalled();
    expect(mockState.journal).toEqual([]);
  });

  it("«В дневник» кладёт запись с броском через addJournalEntry", async () => {
    rollsAlways(2);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });

    fireEvent.click(screen.getByText("Бросить"));
    await screen.findByText("2");
    fireEvent.click(screen.getByText("В дневник"));

    await waitFor(() => expect(addJournalEntry).toHaveBeenCalledTimes(1));
    const table = findTable("fey-marks")!;
    const entry = addJournalEntry.mock.calls[0][0];
    expect(entry.text).toBe(journalTextFor({ table, roll: 2, row: rowForRoll(table, 2)! }));
    expect(entry.text).toContain("выпало 2");
    expect(entry.timestamp).not.toBe("");
  });

  it("смена таблицы убирает прежде выпавшее", async () => {
    rollsAlways(1);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });
    fireEvent.click(screen.getByText("Бросить"));
    await screen.findByText("В дневник");

    fireEvent.change(select, { target: { value: "battle-11" } });

    expect(screen.queryByText("В дневник")).not.toBeInTheDocument();
  });

  // ── распределитель Подземья ───────────────────────────────────────────────

  it("распределитель на «и то, и другое» показывает два столкновения по отдельности", async () => {
    rollsAlwaysWithin(18);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "underdark-encounter-check" } });

    fireEvent.click(screen.getByText("Бросить"));

    // Бросков столько, сколько таблиц в цепочке, и все — тем же механизмом:
    // распределитель, местность, существа и подтаблица, в которую послали те.
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(4));
    expect(invokeMock.mock.calls.map((call) => call[1].expression)).toEqual([
      "1d20",
      "1d20",
      "1d20",
      "1d10",
    ]);

    const terrain = findTable("underdark-terrain-encounters")!;
    const creatures = findTable("underdark-creature-encounters")!;
    // Два результата на экране, каждый своей строкой: смешанного одного нет.
    expect(await screen.findByText(rowForRoll(terrain, 18)!.text)).toBeInTheDocument();
    expect(screen.getByText(rowForRoll(creatures, 18)!.text)).toBeInTheDocument();
    // Звенья после первого подписаны именем своей таблицы — иначе не понять,
    // что именно бросили.
    expect(screen.getByText(terrain.name)).toBeInTheDocument();
  });

  it("строка без указателя дальше не бросает ничего", async () => {
    rollsAlwaysWithin(1);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "underdark-encounter-check" } });

    fireEvent.click(screen.getByText("Бросить"));

    await screen.findByText("В дневник");
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("в дневник едет вся цепочка, а не одно её звено", async () => {
    rollsAlwaysWithin(18);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "underdark-encounter-check" } });

    fireEvent.click(screen.getByText("Бросить"));
    await screen.findByText("В дневник");
    fireEvent.click(screen.getByText("В дневник"));

    await waitFor(() => expect(addJournalEntry).toHaveBeenCalledTimes(1));
    const entry = addJournalEntry.mock.calls[0][0];
    expect(entry.text).toContain("Столкновения местности Подземья");
    expect(entry.text).toContain("Столкновения существ Подземья");
    expect(entry.text.length).toBeLessThanOrEqual(420);
  });

  it("цепочка из одного звена пишется в дневник ровно как обычный бросок", () => {
    const table = findTable("fey-marks")!;
    const outcome = { table, roll: 2, row: rowForRoll(table, 2)! };
    expect(journalTextForChain([outcome])).toBe(journalTextFor(outcome));
  });

  // ── бой прямо со строки ───────────────────────────────────────────────────

  it("«Поднять бой» выводит тех существ, которых назвала строка", async () => {
    mockState = withOneCharacter();
    rollsAlwaysWithin(4);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "underdark-traders" } });

    fireEvent.click(screen.getByText("Бросить"));
    fireEvent.click(await screen.findByText("Поднять бой"));

    await waitFor(() => expect(startCombat).toHaveBeenCalledTimes(1));
    // Противники — из строки и только из неё; со стороны отряда выходят все.
    expect(startCombat.mock.calls[0]).toEqual([["rybolyud"], ["ch1"]]);
    expect(await screen.findByText(/Бой начат/)).toBeInTheDocument();
  });

  it("строка без ссылок на бестиарий боя не предлагает", async () => {
    mockState = withOneCharacter();
    // Споровые слуги: ссылок нет ни у одной строки намеренно — споровый слуга
    // это отдельный стат-блок, а не то существо, из которого он вышел.
    rollsAlwaysWithin(10);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "underdark-spore-servants" } });

    fireEvent.click(screen.getByText("Бросить"));

    await screen.findByText("В дневник");
    expect(screen.queryByText("Поднять бой")).not.toBeInTheDocument();
  });

  it("без персонажей бой поднять нельзя, и сказано почему", async () => {
    rollsAlwaysWithin(4);
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "underdark-traders" } });

    fireEvent.click(screen.getByText("Бросить"));

    expect(await screen.findByText("Поднять бой")).toBeDisabled();
    expect(screen.getByText(/добавьте персонажей/i)).toBeInTheDocument();
    expect(startCombat).not.toHaveBeenCalled();
  });

  it("отказ движка показан игроку, а не проглочен", async () => {
    invokeMock.mockRejectedValue("кость сломалась");
    const select = await openGenerator();
    fireEvent.change(select, { target: { value: "fey-marks" } });

    fireEvent.click(screen.getByText("Бросить"));

    expect(await screen.findByText(/кость сломалась/)).toBeInTheDocument();
    expect(screen.queryByText("В дневник")).not.toBeInTheDocument();
  });
});
