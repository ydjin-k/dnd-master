import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharacterWizard } from "./CharacterWizard";
import type { Character, RuleTopic } from "../state/types";

const topics: RuleTopic[] = [
  { id: "races-human", category: "races", title: "Человек", sourceUrl: "", blocks: [] },
  {
    id: "classes-fighter",
    category: "classes",
    title: "Воин",
    sourceUrl: "",
    blocks: [{ type: "paragraph", text: "Кость хитов: 1к10 за уровень воина" }],
  },
];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => topics),
}));

const addCharacter = vi.fn();
vi.mock("../state/CampaignContext", () => ({
  useCampaign: () => ({ addCharacter }),
}));

describe("CharacterWizard", () => {
  it("switching to manual ability entry and typing a value does not crash the tree", async () => {
    // Regression test: baseCell()'s manual-mode onChange used to read
    // e.currentTarget.value *inside* the setManual updater callback. React
    // runs that callback during a later render, by which point the browser
    // has already nulled e.currentTarget, throwing
    // "Cannot read properties of null (reading 'value')" and unmounting the
    // whole tree (there was no error boundary, so it failed silently).
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    const numberInputs = document.querySelectorAll('input[type="number"]');
    expect(numberInputs.length).toBe(6);

    const first = numberInputs[0] as HTMLInputElement;
    fireEvent.change(first, { target: { value: "16" } });

    await waitFor(() => expect(first.value).toBe("16"));
    // The step navigation must still be present — a crash unmounts everything.
    expect(screen.getByText("Далее")).toBeInTheDocument();
  });

  it("carries class saving throws/skills and background skills/equipment through to the finished character", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    // Fighter's saving throws/skill picker should render on the class step.
    const savingThrowsLine = (await screen.findByText(/Спасброски:/)).closest("p");
    expect(savingThrowsLine).toHaveTextContent("Сила, Телосложение");
    fireEvent.click(screen.getByText("Атлетика"));
    fireEvent.click(screen.getByText("Восприятие"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));

    // abilities: keep defaults (method === "standard"), just move on
    fireEvent.click(await screen.findByText("Далее"));
    // equipment: keep defaults
    fireEvent.click(await screen.findByText("Далее"));

    const nameInput = await screen.findByPlaceholderText("Имя персонажа");
    fireEvent.change(nameInput, { target: { value: "Тестовый Герой" } });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.name).toBe("Тестовый Герой");
    expect(character.background).toBe("Послушник");
    expect(character.savingThrowProficiencies).toEqual(["Сила", "Телосложение"]);
    expect(character.skillProficiencies).toEqual(
      expect.arrayContaining(["Атлетика", "Восприятие", "Проницательность", "Религия"]),
    );
    expect(character.gold).toBe(15);
    expect(character.inventory.length).toBeGreaterThan(0);
  });
});
