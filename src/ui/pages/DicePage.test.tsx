import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DicePage } from "./DicePage";
import type { RollResult } from "../../state/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (_cmd: string, args: { expression: string }): Promise<RollResult> => ({
    expression: args.expression,
    rolls: [4],
    modifier: 0,
    total: 4,
    dropped: null,
  })),
}));

describe("DicePage", () => {
  it("rolling a quick die and recording a manual value does not crash", async () => {
    render(<DicePage />);

    fireEvent.click(screen.getByText("d20"));
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());

    const manualInput = screen.getByPlaceholderText(/результат броска в реальности/);
    fireEvent.change(manualInput, { target: { value: "17" } });
    fireEvent.click(screen.getByText("Записать вручную"));

    await waitFor(() => expect(screen.getByText("17")).toBeInTheDocument());
    expect((manualInput as HTMLInputElement).value).toBe("");
  });

  it("typing a custom expression and rolling it does not crash", async () => {
    render(<DicePage />);
    const exprInput = screen.getByPlaceholderText(/например 2d6\+3/);
    fireEvent.change(exprInput, { target: { value: "2d6+3" } });
    fireEvent.click(screen.getByText("Бросить"));

    await waitFor(() => expect(screen.getByText("2d6+3")).toBeInTheDocument());
  });
});
