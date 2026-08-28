import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharacterWizard } from "./CharacterWizard";
import type { AbilityScoreRoll, Character, RuleTopic } from "../state/types";

const topics: RuleTopic[] = [
  { id: "races-human", category: "races", title: "Человек", sourceUrl: "", blocks: [] },
  { id: "races-dwarf", category: "races", title: "Дварф", sourceUrl: "", blocks: [] },
  { id: "races-elf", category: "races", title: "Эльф", sourceUrl: "", blocks: [] },
  { id: "races-half-elf", category: "races", title: "Полуэльф", sourceUrl: "", blocks: [] },
  {
    id: "classes-fighter",
    category: "classes",
    title: "Воин",
    sourceUrl: "",
    blocks: [{ type: "paragraph", text: "Кость хитов: 1к10 за уровень воина" }],
  },
  {
    id: "classes-bard",
    category: "classes",
    title: "Бард",
    sourceUrl: "",
    blocks: [{ type: "paragraph", text: "Кость хитов: 1к8 за уровень барда" }],
  },
  {
    id: "classes-wizard",
    category: "classes",
    title: "Волшебник",
    sourceUrl: "",
    blocks: [{ type: "paragraph", text: "Кость хитов: 1к6 за уровень волшебника" }],
  },
];

const abilityRolls: AbilityScoreRoll[] = [
  { dice: [6, 5, 4, 1], droppedIndex: 3, total: 15 },
  { dice: [5, 5, 4, 2], droppedIndex: 3, total: 14 },
  { dice: [6, 4, 3, 1], droppedIndex: 3, total: 13 },
  { dice: [4, 4, 3, 2], droppedIndex: 3, total: 11 },
  { dice: [3, 3, 3, 1], droppedIndex: 3, total: 9 },
  { dice: [3, 2, 2, 1], droppedIndex: 3, total: 7 },
];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === "roll_ability_scores") return abilityRolls;
    return topics;
  }),
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

  it("typing in the custom background fields (including gold) does not crash the tree", async () => {
    // Regression test: the custom-background inputs read e.currentTarget.value
    // *inside* the setCustomBackground updater callback — same bug class as
    // above, reintroduced when custom backgrounds were added.
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Своя предыстория"));
    const titleInput = await screen.findByPlaceholderText("Название предыстории");
    fireEvent.change(titleInput, { target: { value: "Бродяга" } });
    await waitFor(() => expect((titleInput as HTMLInputElement).value).toBe("Бродяга"));

    fireEvent.click(screen.getByText("Добавить"));
    await screen.findByText(/1\/5/);

    const goldInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(goldInput, { target: { value: "25" } });
    await waitFor(() => expect(goldInput.value).toBe("25"));

    const featureInput = screen.getByPlaceholderText("Особенность предыстории");
    fireEvent.change(featureInput, { target: { value: "Знает все закоулки города" } });
    await waitFor(() => expect((featureInput as HTMLTextAreaElement).value).toBe("Знает все закоулки города"));

    // A crash unmounts everything; the step navigation must still be present.
    expect(screen.getByText("Далее")).toBeInTheDocument();
  });

  it("carries a custom background (title/gold/equipment) through to the finished character", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Своя предыстория"));
    fireEvent.change(await screen.findByPlaceholderText("Название предыстории"), {
      target: { value: "Бродяга" },
    });
    await screen.findByText("Добавить");
    const gearSelect = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(gearSelect, { target: { value: "Верёвка, пеньковая (50 футов)" } });
    fireEvent.click(screen.getByText("Добавить"));
    fireEvent.change(gearSelect, { target: { value: "Факел" } });
    fireEvent.click(screen.getByText("Добавить"));
    fireEvent.change(document.querySelector('input[type="number"]') as HTMLInputElement, {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Тестовый Бродяга" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.background).toBe("Бродяга");
    expect(character.gold).toBe(25);
    expect(character.inventory.map((i) => i.name)).toEqual(
      expect.arrayContaining(["Верёвка, пеньковая (50 футов)", "Факел"]),
    );
  });

  it("caps custom background equipment at the limit and lets you remove an item", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Своя предыстория"));

    const addButton = await screen.findByText("Добавить");
    for (let i = 0; i < 5; i++) {
      fireEvent.click(addButton);
    }
    expect(await screen.findByText(/5\/5/)).toBeInTheDocument();
    expect(addButton).toBeDisabled();

    // Removing one frees up a slot again.
    fireEvent.click(screen.getAllByText("✕")[0]);
    await screen.findByText(/4\/5/);
    expect(addButton).not.toBeDisabled();
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

  it("rolling ability scores fills the manual fields, which stay freely editable afterward", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(screen.getByText("Бросить кубики"));
    await screen.findByText(/Выпало/);

    // abilityRolls fixture totals are [15, 14, 13, 11, 9, 7], filled in
    // ABILITY_LABELS order: strength, dexterity, constitution, intelligence,
    // wisdom, charisma.
    const numberInputs = document.querySelectorAll('input[type="number"]');
    expect(numberInputs.length).toBe(6);
    expect((numberInputs[0] as HTMLInputElement).value).toBe("15"); // Сила
    expect((numberInputs[1] as HTMLInputElement).value).toBe("14"); // Ловкость
    expect((numberInputs[4] as HTMLInputElement).value).toBe("9"); // Мудрость

    // A rolled value is not final — it's still a plain editable number field.
    fireEvent.change(numberInputs[4], { target: { value: "12" } });
    await waitFor(() => expect((numberInputs[4] as HTMLInputElement).value).toBe("12"));

    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее"));

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Кубик Кубикович" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    // +1 к каждой характеристике — расовый бонус человека (races-human).
    expect(character.abilities.strength).toBe(16);
    expect(character.abilities.dexterity).toBe(15);
    expect(character.abilities.wisdom).toBe(13); // отредактированное вручную значение 12 + 1
  });

  it("picking 'any other instrument' for the bard resolves to a concrete instrument, not a vague placeholder", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Бард"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults

    // Equipment step: pick "Любой другой музыкальный инструмент" over "Лютня"
    // (second radio in the "equip-slot-2" group).
    await screen.findByText("Любой другой музыкальный инструмент");
    const instrumentSlotRadios = document.querySelectorAll('input[name="equip-slot-2"]');
    expect(instrumentSlotRadios.length).toBe(2);
    fireEvent.click(instrumentSlotRadios[1]);
    const instrumentSelect = await screen.findByDisplayValue(/^Волынка /);
    fireEvent.change(instrumentSelect, { target: { value: "Барабан" } });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Менестрель" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.inventory.map((i) => i.name)).toContain("Барабан");
    expect(character.inventory.map((i) => i.name)).not.toContain("Музыкальный инструмент (на выбор)");
  });

  it("lets a Human pick a bonus language and records the chosen alignment", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    // Human gets a language of choice on top of Общий — pick a non-default one.
    const languageSelect = await screen.findByDisplayValue("Великаний");
    fireEvent.change(languageSelect, { target: { value: "Эльфийский" } });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Многоязыкий Герой" },
    });
    const alignmentSelect = screen.getByDisplayValue("Нейтральный");
    fireEvent.change(alignmentSelect, { target: { value: "Хаотично-добрый" } });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.languages).toEqual(["Общий", "Эльфийский"]);
    expect(character.alignment).toBe("Хаотично-добрый");
  });

  it("applies the Dwarf's +1 max HP racial bonus (previously silently dropped)", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Дварф"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults (base 10 everywhere)
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Крепкий Дварф" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    // Fighter hit die 1к10 + Dwarf CON+2 (base 10 -> 12, mod +1) + Dwarven
    // Toughness +1 = 12, not 11.
    expect(character.maxHp).toBe(12);
  });

  it("grants the Elf's automatic Perception proficiency without spending a class skill slot", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Эльф"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Атлетика"));
    fireEvent.click(screen.getByText("История"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Востроглазый Эльф" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.skillProficiencies).toEqual(
      expect.arrayContaining(["Атлетика", "История", "Восприятие", "Религия"]),
    );
  });

  it("lets a Half-Elf pick 2 bonus skills (Гибкость навыков)", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Полуэльф"));
    await screen.findByText(/Гибкость навыков/);
    fireEvent.click(screen.getByText("Магия"));
    fireEvent.click(screen.getByText("Обман"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Разносторонний Полуэльф" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.skillProficiencies).toEqual(expect.arrayContaining(["Магия", "Обман"]));
  });

  it("shows the full portrait on the review step: race traits as text and a spellcasting note", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Дварф"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Волшебник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Дварфская стойкость/)).toBeInTheDocument();
    expect(screen.getByText(/Знание камня/)).toBeInTheDocument();
    expect(
      screen.getByText(/владеет заклинаниями \(заклинательная характеристика — Интеллект\)/),
    ).toBeInTheDocument();
  });
});
