import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportPage } from "./ImportPage";
import type { Character } from "../../state/types";

const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...args: unknown[]) => openMock(...args) }));

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: [string, unknown]) => invoke(...args) }));

const addCharacter = vi.fn();
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ addCharacter }),
}));

describe("ImportPage", () => {
  it("picking a file shows the extracted text and it stays editable without crashing", async () => {
    openMock.mockResolvedValue("C:\\sheets\\hero.txt");
    invoke.mockResolvedValue("Имя: Торин\nКласс: Воин");

    render(<ImportPage />);
    fireEvent.click(screen.getByText("Выбрать файл"));

    // Matches only the textarea's full multi-line text, not the (first-line-only) name input.
    const textarea = await screen.findByDisplayValue(/Класс: Воин/);
    expect(screen.getByText("hero.txt")).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "Имя: Торин (правка)" } });
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe("Имя: Торин (правка)"));
  });

  it("a failed extraction shows the error and does not crash", async () => {
    openMock.mockResolvedValue("C:\\sheets\\broken.pdf");
    invoke.mockRejectedValue("не удалось прочитать PDF");

    render(<ImportPage />);
    fireEvent.click(screen.getByText("Выбрать файл"));

    expect(await screen.findByText(/Не удалось:/)).toBeInTheDocument();
  });

  it("saves the extracted text as a character, guessing the name from the first line", async () => {
    addCharacter.mockClear();
    openMock.mockResolvedValue("C:\\sheets\\hero.txt");
    invoke.mockResolvedValue("Торин Железнобород\nКласс: Воин\nСила 16");

    render(<ImportPage />);
    fireEvent.click(screen.getByText("Выбрать файл"));

    expect(await screen.findByPlaceholderText("Имя персонажа")).toHaveValue("Торин Железнобород");
    fireEvent.click(screen.getByText("Сохранить как персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.name).toBe("Торин Железнобород");
    expect(character.inventory[0].notes).toBe("Торин Железнобород\nКласс: Воин\nСила 16");
    expect(await screen.findByText(/Сохранено как/)).toBeInTheDocument();
  });
});
