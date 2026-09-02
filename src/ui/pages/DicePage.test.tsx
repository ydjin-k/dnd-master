import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DicePage } from "./DicePage";
import type { RollResult } from "../../state/types";

const { invokeMock, audioPlayMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), audioPlayMock: vi.fn(() => Promise.resolve()) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

class AudioMock {
  currentTime = 0;
  constructor(public src: string) {}
  play = audioPlayMock;
}

describe("DicePage", () => {
  beforeEach(() => {
    vi.stubGlobal("Audio", AudioMock);
    invokeMock.mockReset();
    audioPlayMock.mockClear();
    invokeMock.mockImplementation(async (_cmd: string, args: { expression: string }): Promise<RollResult> => ({
      expression: args.expression, rolls: [4], modifier: 0, total: 4, dropped: null,
    }));
  });

  it("assembles an expression from all selectors and plays the supplied sound", async () => {
    render(<DicePage />);
    fireEvent.click(screen.getByRole("button", { name: "Выбрать d6" }));
    fireEvent.change(screen.getByLabelText("Количество костей"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Модификатор"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Преимущество или помеха"), { target: { value: "adv" } });
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));
    expect(invokeMock).toHaveBeenCalledWith("roll_dice", { expression: "2d6+3adv" });
    expect(audioPlayMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("2d6+3adv")).toBeInTheDocument(), { timeout: 1000 });
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
});
