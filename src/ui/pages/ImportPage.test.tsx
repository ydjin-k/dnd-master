import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportPage } from "./ImportPage";

const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...args: unknown[]) => openMock(...args) }));

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: [string, unknown]) => invoke(...args) }));

describe("ImportPage", () => {
  it("picking a file shows the extracted text and it stays editable without crashing", async () => {
    openMock.mockResolvedValue("C:\\sheets\\hero.txt");
    invoke.mockResolvedValue("Имя: Торин\nКласс: Воин");

    render(<ImportPage />);
    fireEvent.click(screen.getByText("Выбрать файл"));

    const textarea = await screen.findByDisplayValue(/Торин/);
    expect(screen.getByText("hero.txt")).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "Имя: Торин (правка)" } });
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe("Имя: Торин (правка)"));

    // Confirms the currently-documented gap: no way to turn this into a
    // saved character from this page yet (see ImportPage.tsx hint text).
    expect(screen.queryByText(/Подтвердить/)).not.toBeInTheDocument();
  });

  it("a failed extraction shows the error and does not crash", async () => {
    openMock.mockResolvedValue("C:\\sheets\\broken.pdf");
    invoke.mockRejectedValue("не удалось прочитать PDF");

    render(<ImportPage />);
    fireEvent.click(screen.getByText("Выбрать файл"));

    expect(await screen.findByText(/Не удалось:/)).toBeInTheDocument();
  });
});
