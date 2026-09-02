import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DicePage } from "./DicePage";
import type { RollResult } from "../../state/types";

const { invokeMock, playDiceRollSoundMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  playDiceRollSoundMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../../audio/uiSounds", () => ({
  playDiceRollSound: playDiceRollSoundMock,
}));

describe("DicePage", () => {
  beforeEach(() => {
    invokeMock.mockImplementation(async (_cmd: string, args: { expression: string }): Promise<RollResult> => ({
      expression: args.expression,
      rolls: [4],
      modifier: 0,
      total: 4,
      dropped: null,
    }));
    playDiceRollSoundMock.mockClear();
  });

  it("rolling a quick die and recording a manual value does not crash", async () => {
    render(<DicePage />);

    fireEvent.click(screen.getByText("d20"));
    await waitFor(() => expect(screen.getByLabelText("Кость d20, результат 4")).toBeInTheDocument());

    const manualInput = screen.getByPlaceholderText(/результат броска в реальности/);
    fireEvent.change(manualInput, { target: { value: "17" } });
    fireEvent.click(screen.getByText("Записать вручную"));

    await waitFor(() => expect(screen.getByText("17")).toBeInTheDocument());
    expect((manualInput as HTMLInputElement).value).toBe("");
    expect(playDiceRollSoundMock).toHaveBeenCalledTimes(1);
  });

  it("typing a custom expression and rolling it does not crash", async () => {
    render(<DicePage />);
    const exprInput = screen.getByPlaceholderText(/например 2d6\+3/);
    fireEvent.change(exprInput, { target: { value: "2d6+3" } });
    fireEvent.click(screen.getByText("Бросить"));

    await waitFor(() => expect(screen.getByText("2d6+3")).toBeInTheDocument());
    expect(playDiceRollSoundMock).toHaveBeenCalledTimes(1);
  });

  it("plays the roll sound only after a successful roll", async () => {
    invokeMock.mockRejectedValueOnce(new Error("bad expression"));
    render(<DicePage />);

    fireEvent.click(screen.getByText("Бросить"));

    await waitFor(() => expect(screen.getByText("Error: bad expression")).toBeInTheDocument());
    expect(playDiceRollSoundMock).not.toHaveBeenCalled();
  });

  it("renders distinct die shapes in the roll log", async () => {
    render(<DicePage />);
    fireEvent.click(screen.getByText("d4"));
    fireEvent.click(screen.getByText("d6"));
    fireEvent.click(screen.getByText("d20"));

    await waitFor(() => expect(screen.getByLabelText("Кость d20, результат 4")).toBeInTheDocument());
    expect(screen.getByLabelText("Кость d4, результат 4")).toHaveAttribute("data-die", "d4");
    expect(screen.getByLabelText("Кость d6, результат 4")).toHaveAttribute("data-die", "d6");
  });
});
