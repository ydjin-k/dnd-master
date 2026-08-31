import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CharacterWizard } from "./CharacterWizard";
import type { AbilityScoreRoll, Character, RuleTopic } from "../state/types";
import { BACKGROUNDS, INSTRUMENTS, NAME_SUGGESTIONS } from "./characterCreationData";

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
  {
    id: "classes-ranger",
    category: "classes",
    title: "Следопыт",
    sourceUrl: "",
    blocks: [{ type: "paragraph", text: "Кость хитов: 1к10 за уровень следопыта" }],
  },
  {
    id: "classes-monk",
    category: "classes",
    title: "Монах",
    sourceUrl: "",
    blocks: [{ type: "paragraph", text: "Кость хитов: 1к8 за уровень монаха" }],
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

  it("has the full Acolyte-plus-12-archetypes set of backgrounds", () => {
    expect(BACKGROUNDS.length).toBe(13);
    expect(BACKGROUNDS.map((b) => b.id)).toEqual(
      expect.arrayContaining([
        "acolyte",
        "charlatan",
        "criminal",
        "entertainer",
        "folk-hero",
        "guild-artisan",
        "hermit",
        "noble",
        "outlander",
        "sage",
        "sailor",
        "soldier",
        "urchin",
      ]),
    );
  });

  it("carries a newly added background's own skills/equipment/gold through to the finished character", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Солдат"));
    fireEvent.click(screen.getByText("Далее"));

    // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее"));
    // equipment: keep defaults
    fireEvent.click(await screen.findByText("Далее"));

    const nameInput = await screen.findByPlaceholderText("Имя персонажа");
    fireEvent.change(nameInput, { target: { value: "Тестовый Солдат" } });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.background).toBe("Солдат");
    expect(character.skillProficiencies).toEqual(
      expect.arrayContaining(["Запугивание", "Восприятие"]),
    );
    expect(character.gold).toBe(10);
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
    // Criminal has no bonus language of its own (unlike e.g. Acolyte/Sage) —
    // keeps this test focused on the race's language mechanism alone.
    fireEvent.click(await screen.findByText("Преступник"));
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

  it("lets a Half-Elf pick their +1 ability bonuses right on the race step (not buried on abilities)", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Полуэльф"));
    await screen.findByText(/Увеличение характеристик по выбору/);
    // Charisma already has a fixed +2 from this race and must not appear as a choice.
    expect(screen.queryByText("Харизма")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Сила"));
    fireEvent.click(screen.getByText("Ловкость"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep base 10s, just the racial bonuses matter
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Крепкий Полуэльф" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.abilities.strength).toBe(11);
    expect(character.abilities.dexterity).toBe(11);
    expect(character.abilities.charisma).toBe(12);
  });

  it("lets a Dwarf choose which craft tool they're proficient with, reflected in the review text", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Дварф"));
    const toolSelect = await screen.findByDisplayValue(/^Инструменты кузнеца /);
    fireEvent.change(toolSelect, { target: { value: "Инструменты пивовара" } });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее"));
    fireEvent.click(await screen.findByText("Далее"));

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/выбрано: Инструменты пивовара/)).toBeInTheDocument();
  });

  it("lets a Fighter choose a fighting style, shown by name and description on review", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    const styleSelect = await screen.findByDisplayValue(/^Стрельба из лука$/);
    fireEvent.change(styleSelect, { target: { value: "Оборона" } });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее"));
    fireEvent.click(await screen.findByText("Далее"));

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Оборона/)).toBeInTheDocument();
    expect(screen.getByText(/бонус \+1 к КД/)).toBeInTheDocument();
  });

  it("lets a Ranger pick a favored enemy and known terrain (previously not offered at all)", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Следопыт"));
    const enemySelect = await screen.findByDisplayValue(/^Аберрации$/);
    fireEvent.change(enemySelect, { target: { value: "Драконы" } });
    const terrainSelect = await screen.findByDisplayValue(/^Арктика$/);
    fireEvent.change(terrainSelect, { target: { value: "Горы" } });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее"));
    fireEvent.click(await screen.findByText("Далее"));

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Избранный враг: Драконы/)).toBeInTheDocument();
    expect(screen.getByText(/Известная местность: Горы/)).toBeInTheDocument();
  });

  it("shows the chosen background's feature (bold name + description) on the review step", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Дворянин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее"));
    fireEvent.click(await screen.findByText("Далее"));

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Предыстория: Дворянин/)).toBeInTheDocument();
    expect(screen.getByText(/Право голоса/)).toBeInTheDocument();
    expect(
      screen.getByText(/вас принимают без очереди и выслушивают на аудиенциях/),
    ).toBeInTheDocument();
  });

  it("suggests a name from the selected race's list for the current gender, and rerolling gives a different one", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Дварф"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    const nameInput = (await screen.findByPlaceholderText("Имя персонажа")) as HTMLInputElement;
    const suggestButton = screen.getByText("🎲 Предложить имя");

    // Gender defaults to GENDERS[0] ("Мужской") on the review step.
    fireEvent.click(suggestButton);
    const first = nameInput.value;
    expect(NAME_SUGGESTIONS["races-dwarf"].male).toContain(first);

    fireEvent.click(suggestButton);
    const second = nameInput.value;
    expect(NAME_SUGGESTIONS["races-dwarf"].male).toContain(second);
    expect(second).not.toBe(first);

    // Switching gender changes which list the button draws from.
    const genderSelect = screen.getByDisplayValue("Мужской");
    fireEvent.change(genderSelect, { target: { value: "Женский" } });
    fireEvent.click(suggestButton);
    expect(NAME_SUGGESTIONS["races-dwarf"].female).toContain(nameInput.value);

    // The field stays a normal, freely editable input after the suggestion.
    fireEvent.change(nameInput, { target: { value: "Своё Имя" } });
    await waitFor(() => expect(nameInput.value).toBe("Своё Имя"));
  });

  it("has distinct male and female name lists per race (regression: gender used to be ignored)", () => {
    for (const key of Object.keys(NAME_SUGGESTIONS)) {
      const { male, female } = NAME_SUGGESTIONS[key];
      expect(male).not.toEqual(female);
    }
  });

  it("carries gender and age chosen on the review step into the finished character", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Возрастной Герой" },
    });
    fireEvent.change(screen.getByDisplayValue("Мужской"), { target: { value: "Женский" } });
    const ageInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(ageInput, { target: { value: "134" } });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.gender).toBe("Женский");
    expect(character.age).toBe(134);
  });

  it("АС on the review step tracks Dexterity for a Human, across all three ability-score methods (regression: owner saw AC stuck at 9)", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Беспризорник"));
    fireEvent.click(screen.getByText("Далее"));

    // Standard array, Dexterity = 8 (the value that reproduces the reported "9").
    const dexSelect = () => document.querySelectorAll("table.wizard__ability-table select")[1] as HTMLSelectElement;
    fireEvent.change(dexSelect(), { target: { value: "8" } });
    await waitFor(() => expect(dexSelect().value).toBe("8"));
    fireEvent.click(screen.getByText("Далее")); // -> equipment
    fireEvent.click(await screen.findByText("Далее")); // -> review
    expect((await screen.findByText(/КД:/)).textContent).toMatch(/КД: 9\b/);

    // Back to abilities, switch to point buy, raise Dexterity to 14.
    fireEvent.click(screen.getByText("Назад"));
    fireEvent.click(screen.getByText("Назад"));
    fireEvent.click(await screen.findByLabelText(/Покупка очков/));
    const dexPlusButton = () => {
      const rows = document.querySelectorAll("table.wizard__ability-table tbody tr");
      return within(rows[1] as HTMLElement).getByText("+");
    };
    for (let i = 0; i < 4; i++) fireEvent.click(dexPlusButton()); // 10 -> 14
    fireEvent.click(screen.getByText("Далее")); // -> equipment
    fireEvent.click(await screen.findByText("Далее")); // -> review
    expect((await screen.findByText(/КД:/)).textContent).toMatch(/КД: 12\b/);

    // Back to abilities, switch to manual entry, set Dexterity to 18.
    fireEvent.click(screen.getByText("Назад"));
    fireEvent.click(screen.getByText("Назад"));
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    const manualDexInput = () => document.querySelectorAll('input[type="number"]')[1] as HTMLInputElement;
    fireEvent.change(manualDexInput(), { target: { value: "18" } });
    await waitFor(() => expect(manualDexInput().value).toBe("18"));
    fireEvent.click(screen.getByText("Далее")); // -> equipment
    fireEvent.click(await screen.findByText("Далее")); // -> review
    expect((await screen.findByText(/КД:/)).textContent).toMatch(/КД: 14\b/);
  });

  it("lets a Monk choose one artisan's or musical instrument tool, reflected in the review text", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Монах"));

    // Craft tool is the default category.
    const toolSelect = await screen.findByDisplayValue(/^Инструменты алхимика /);
    fireEvent.change(toolSelect, { target: { value: "Инструменты каменщика" } });

    // Switch category to musical instrument.
    fireEvent.change(screen.getByDisplayValue("Инструмент ремесленника"), {
      target: { value: "music" },
    });
    const instrumentSelect = await screen.findByDisplayValue(/^Волынка /);
    fireEvent.change(instrumentSelect, { target: { value: "Лютня" } });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Владение инструментами: Лютня/)).toBeInTheDocument();
  });

  it("lets a Bard choose 3 distinct musical instrument proficiencies, shown on review", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Бард"));

    const instrumentNames = INSTRUMENTS.map((i) => i.name);
    const selects = Array.from(document.querySelectorAll("select")).filter((s) =>
      instrumentNames.includes((s as HTMLSelectElement).value),
    ) as HTMLSelectElement[];
    expect(selects.length).toBe(3);
    // Default picks are the first three instruments, already distinct.
    expect(new Set(selects.map((s) => s.value)).size).toBe(3);

    // Changing the first select to a value already used by another select is
    // impossible — that option isn't offered there — so pick a free one.
    const thirdSelectOptions = Array.from(selects[2].options).map((o) => o.value);
    expect(thirdSelectOptions).not.toContain(selects[0].value);
    expect(thirdSelectOptions).not.toContain(selects[1].value);

    fireEvent.change(selects[0], { target: { value: "Лютня" } });
    fireEvent.change(selects[1], { target: { value: "Лира" } });
    fireEvent.change(selects[2], { target: { value: "Рожок" } });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Владение музыкальными инструментами: Лютня, Лира, Рожок/)).toBeInTheDocument();
  });

  it("lets a Sage pick 2 bonus languages, distinct from the race's, ending up in the finished character", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    // Human's own bonus language — pick Гномий, so we can prove the two
    // background language slots avoid it and each other.
    fireEvent.change(await screen.findByDisplayValue("Великаний"), { target: { value: "Гномий" } });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Мудрец"));
    const languageSelects = await screen.findAllByRole("combobox");
    // Only the two background-language selects are on this step (no race
    // select here) — both must offer real, non-overlapping languages.
    expect(languageSelects.length).toBe(2);
    const values = languageSelects.map((s) => (s as HTMLSelectElement).value);
    expect(new Set(values).size).toBe(2);
    expect(values).not.toContain("Гномий");
    fireEvent.change(languageSelects[0], { target: { value: "Дварфский" } });
    fireEvent.change(languageSelects[1], { target: { value: "Орочий" } });
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Всезнающий Мудрец" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.languages).toEqual(["Общий", "Гномий", "Дварфский", "Орочий"]);
  });

  it("does not show a language choice for a background without one (e.g. Urchin)", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Беспризорник"));
    await screen.findByText(/Городское дно/);
    expect(screen.queryByText(/Дополнительный язык/)).not.toBeInTheDocument();
  });
});
