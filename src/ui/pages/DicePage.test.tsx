import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DicePage } from "./DicePage";
import type { RollResult } from "../../state/types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const sounds = vi.hoisted(() => ({
  playDiceRollSound: vi.fn(),
  playCriticalSuccessSound: vi.fn(),
  playCriticalFailSound: vi.fn(),
}));
vi.mock("../../audio/uiSounds", () => sounds);

describe("DicePage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    sounds.playDiceRollSound.mockClear();
    sounds.playCriticalSuccessSound.mockClear();
    sounds.playCriticalFailSound.mockClear();
    invokeMock.mockImplementation(async (_cmd: string, args: { expression: string }): Promise<RollResult> => ({
      expression: args.expression, rolls: [4], modifier: 0, total: 4, dropped: null,
    }));
  });

  it("assembles an expression from all selectors and plays the normal roll sound", async () => {
    render(<DicePage />);
    fireEvent.click(screen.getByRole("button", { name: "Выбрать d6" }));
    fireEvent.change(screen.getByLabelText("Количество костей"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Модификатор"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Преимущество или помеха"), { target: { value: "adv" } });
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    expect(invokeMock).toHaveBeenCalledWith("roll_dice", { expression: "2d6+3adv" });
    await waitFor(() => expect(screen.getByText("2d6+3adv")).toBeInTheDocument(), { timeout: 1000 });
    expect(sounds.playDiceRollSound).toHaveBeenCalledTimes(1);
    expect(sounds.playCriticalSuccessSound).not.toHaveBeenCalled();
    expect(sounds.playCriticalFailSound).not.toHaveBeenCalled();
  });

  it("hides redundant roll detail for one unmodified die", async () => {
    render(<DicePage />);
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(screen.getByLabelText("Кость d20, результат 4")).toBeInTheDocument(), { timeout: 1000 });
    expect(screen.queryByText("[4]")).not.toBeInTheDocument();
  });

  it("keeps roll detail for compound and modified rolls", async () => {
    invokeMock.mockResolvedValueOnce({ expression: "2d6+3", rolls: [4, 5], modifier: 3, total: 12, dropped: null });
    render(<DicePage />);
    fireEvent.click(screen.getByRole("button", { name: "Выбрать d6" }));
    fireEvent.change(screen.getByLabelText("Количество костей"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Модификатор"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(screen.getByText(/\[4, 5\]/)).toHaveTextContent("[4, 5] +3"), { timeout: 1000 });
  });

  it("keeps the dropped set visible without duplicating a single chosen roll", async () => {
    invokeMock.mockResolvedValueOnce({ expression: "d20adv", rolls: [18], modifier: 0, total: 18, dropped: [7] });
    render(<DicePage />);
    fireEvent.change(screen.getByLabelText("Преимущество или помеха"), { target: { value: "adv" } });
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(screen.getByText(/отброшено: 7/)).toBeInTheDocument(), { timeout: 1000 });
    expect(screen.queryByText("[18]", { exact: false })).not.toBeInTheDocument();
  });

  it("records a manual value in the compact input", async () => {
    render(<DicePage />);
    const input = screen.getByLabelText("Результат ручного броска");
    fireEvent.change(input, { target: { value: "17" } });
    fireEvent.click(screen.getByText("Записать вручную"));
    expect(await screen.findByText("17", { selector: ".dice-log-entry__total" })).toBeInTheDocument();
    expect(input).toHaveValue(null);
  });

  it("labels a manual entry with the dice picked at the top (count and sides)", async () => {
    render(<DicePage />);
    fireEvent.click(screen.getByRole("button", { name: "Выбрать d6" }));
    fireEvent.change(screen.getByLabelText("Количество костей"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Результат ручного броска"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("Записать вручную"));
    expect(await screen.findByText("Вручную (3d6)")).toBeInTheDocument();
  });

  it("omits the count prefix for a single manual die, matching the auto-roll expression format", async () => {
    render(<DicePage />);
    fireEvent.change(screen.getByLabelText("Результат ручного броска"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("Записать вручную"));
    expect(await screen.findByText("Вручную (d20)")).toBeInTheDocument();
  });

  it("keeps only the 10 most recent entries, newest first", async () => {
    let expression = 0;
    invokeMock.mockImplementation(async (_cmd: string, args: { expression: string }): Promise<RollResult> => {
      expression += 1;
      return { expression: args.expression, rolls: [expression], modifier: 0, total: expression, dropped: null };
    });
    render(<DicePage />);
    const rollButton = screen.getByRole("button", { name: "Бросить" });
    for (let i = 0; i < 11; i += 1) {
      fireEvent.click(rollButton);
      await waitFor(() => expect(rollButton).not.toBeDisabled(), { timeout: 1000 });
    }
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(10);
    const totals = screen.getAllByText(/.*/, { selector: ".dice-log-entry__total" }).map((el) => el.textContent);
    expect(totals).toEqual(["11", "10", "9", "8", "7", "6", "5", "4", "3", "2"]);
  }, 15000);

  it("shows a clear-history button only when the log has entries, and clears on click", async () => {
    render(<DicePage />);
    expect(screen.queryByText("Очистить историю")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(screen.getByText("Очистить историю")).toBeInTheDocument(), { timeout: 1000 });
    fireEvent.click(screen.getByText("Очистить историю"));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByText("Очистить историю")).not.toBeInTheDocument();
  });

  it("expands selectors inline so the manual form stays outside their option list", () => {
    render(<DicePage />);
    const manualButton = screen.getByRole("button", { name: "Записать вручную" });

    for (const label of ["Количество костей", "Модификатор", "Преимущество или помеха"]) {
      const select = screen.getByLabelText<HTMLSelectElement>(label);
      expect(select).toHaveAttribute("size", "1");
      fireEvent.pointerDown(select);
      expect(select).toHaveAttribute("size", label === "Преимущество или помеха" ? "3" : "6");
      expect(manualButton).toBeEnabled();
      fireEvent.blur(select);
      expect(select).toHaveAttribute("size", "1");
    }
  });

  it("limits the modifier options to -10..+10", () => {
    render(<DicePage />);
    const select = screen.getByLabelText<HTMLSelectElement>("Модификатор");
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).toEqual(Array.from({ length: 21 }, (_, index) => String(index - 10)));
  });

  it("shows one dice icon per roll on a multi-die roll, plus the total as text", async () => {
    invokeMock.mockResolvedValueOnce({ expression: "3d6", rolls: [2, 5, 6], modifier: 0, total: 13, dropped: null });
    render(<DicePage />);
    fireEvent.click(screen.getByRole("button", { name: "Выбрать d6" }));
    fireEvent.change(screen.getByLabelText("Количество костей"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(screen.getByText("3d6")).toBeInTheDocument(), { timeout: 1000 });
    expect(screen.getByLabelText("Кость d6, результат 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Кость d6, результат 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Кость d6, результат 6")).toBeInTheDocument();
    expect(screen.queryByLabelText("Кость d6, результат 13")).not.toBeInTheDocument();
    expect(screen.getByText("13", { selector: ".dice-log-entry__total" })).toBeInTheDocument();
  });

  it("plays the critical success sound instead of the normal sound on a natural 20", async () => {
    invokeMock.mockResolvedValueOnce({ expression: "d20", rolls: [20], modifier: 0, total: 20, dropped: null });
    render(<DicePage />);
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(sounds.playCriticalSuccessSound).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(sounds.playDiceRollSound).not.toHaveBeenCalled();
    expect(sounds.playCriticalFailSound).not.toHaveBeenCalled();
  });

  it("plays the critical fail sound instead of the normal sound on a natural 1", async () => {
    invokeMock.mockResolvedValueOnce({ expression: "d20", rolls: [1], modifier: 0, total: 1, dropped: null });
    render(<DicePage />);
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(sounds.playCriticalFailSound).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(sounds.playDiceRollSound).not.toHaveBeenCalled();
    expect(sounds.playCriticalSuccessSound).not.toHaveBeenCalled();
  });

  it("plays the normal sound for a natural 20 rolled as part of a multi-d20 pool", async () => {
    invokeMock.mockResolvedValueOnce({ expression: "2d20", rolls: [20, 20], modifier: 0, total: 40, dropped: null });
    render(<DicePage />);
    fireEvent.change(screen.getByLabelText("Количество костей"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(sounds.playDiceRollSound).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(sounds.playCriticalSuccessSound).not.toHaveBeenCalled();
  });

  it("plays the critical success sound for a natural 20 kept from advantage (single saved d20)", async () => {
    invokeMock.mockResolvedValueOnce({ expression: "d20adv", rolls: [20], modifier: 0, total: 20, dropped: [7] });
    render(<DicePage />);
    fireEvent.change(screen.getByLabelText("Преимущество или помеха"), { target: { value: "adv" } });
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    await waitFor(() => expect(sounds.playCriticalSuccessSound).toHaveBeenCalledTimes(1), { timeout: 1000 });
  });
});
