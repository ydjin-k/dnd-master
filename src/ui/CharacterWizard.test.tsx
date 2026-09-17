import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CharacterWizard } from "./CharacterWizard";
import type { AbilityScoreRoll, Character, RuleTopic, Spell } from "../state/types";
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
  {
    id: "classes-cleric",
    category: "classes",
    title: "Жрец",
    sourceUrl: "",
    blocks: [{ type: "paragraph", text: "Кость хитов: 1к8 за уровень жреца" }],
  },
];

function makeSpell(id: string, name: string, level: number, classes: string[]): Spell {
  return {
    id,
    name,
    level,
    school: "Вызов",
    castingTime: "1 действие",
    range: "60 футов",
    components: "В, С",
    duration: "Мгновенная",
    concentration: false,
    ritual: false,
    classes,
    description: "Тестовое описание.",
    damageDice: null,
    damageType: null,
    attackRoll: false,
    savingThrow: null,
  };
}

const spells: Spell[] = [
  makeSpell("bard-cantrip-1", "Заговор Барда 1", 0, ["classes-bard"]),
  makeSpell("bard-cantrip-2", "Заговор Барда 2", 0, ["classes-bard"]),
  makeSpell("bard-spell-1", "Заклинание Барда 1", 1, ["classes-bard"]),
  makeSpell("bard-spell-2", "Заклинание Барда 2", 1, ["classes-bard"]),
  makeSpell("bard-spell-3", "Заклинание Барда 3", 1, ["classes-bard"]),
  makeSpell("bard-spell-4", "Заклинание Барда 4", 1, ["classes-bard"]),
  makeSpell("wizard-cantrip-1", "Заговор Волшебника 1", 0, ["classes-wizard"]),
  makeSpell("wizard-cantrip-2", "Заговор Волшебника 2", 0, ["classes-wizard"]),
  makeSpell("wizard-cantrip-3", "Заговор Волшебника 3", 0, ["classes-wizard"]),
  makeSpell("wizard-spell-1", "Заклинание Волшебника 1", 1, ["classes-wizard"]),
  makeSpell("wizard-spell-2", "Заклинание Волшебника 2", 1, ["classes-wizard"]),
  makeSpell("cleric-cantrip-1", "Заговор Жреца 1", 0, ["classes-cleric"]),
  makeSpell("cleric-cantrip-2", "Заговор Жреца 2", 0, ["classes-cleric"]),
  makeSpell("cleric-cantrip-3", "Заговор Жреца 3", 0, ["classes-cleric"]),
  makeSpell("cleric-spell-1", "Заклинание Жреца 1", 1, ["classes-cleric"]),
  // Три заклинания эльфа бездны — под теми же id, что в spells.json: мастер
  // показывает их названия ссылкой по id, а не своей копией строк. Список
  // классов пуст намеренно: раса даёт их сама, и в выборе заклинаний класса им
  // делать нечего (иначе они сдвинули бы нормы в пробах на волшебника).
  makeSpell("dancing-lights", "Пляшущие огоньки", 0, []),
  makeSpell("faerie-fire", "Огонь фей", 1, []),
  makeSpell("darkness", "Тьма", 2, []),
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
    if (command === "get_spells") return spells;
    return topics;
  }),
}));

const sounds = vi.hoisted(() => ({ playCoinsSound: vi.fn(), playDiceRollSound: vi.fn(), playLimitSound: vi.fn() }));
vi.mock("../audio/uiSounds", () => sounds);

const addCharacter = vi.fn();
vi.mock("../state/CampaignContext", () => ({
  useCampaign: () => ({ addCharacter }),
}));

/**
 * Class-skill checkboxes start unchecked with no default (characters-wizard-step-validation
 * blocks "Далее" on the class step until classProf.skillCount of them are picked). Most tests
 * just need any valid pick, not a specific one — this checks whichever boxes are first and not
 * yet disabled, re-querying the DOM each time so it naturally stops once the class's quota is met.
 */
function pickRequiredClassSkills() {
  for (let i = 0; i < 3; i++) {
    const checkbox = document.querySelector<HTMLInputElement>(
      '.wizard__skill-grid input[type="checkbox"]:not(:checked):not(:disabled)',
    );
    if (!checkbox) break;
    fireEvent.click(checkbox);
  }
}

/**
 * Same reasoning as pickRequiredClassSkills, for the abilities step: the "standard array"
 * method's 6 dropdowns start unassigned, and characters-wizard-step-validation now blocks
 * "Далее" until all 6 have a value. A no-op when the standard-array table isn't on screen
 * (other methods, other steps) or a dropdown was already explicitly set by the test.
 */
function fillStandardAbilities() {
  const STANDARD_VALUES = ["15", "14", "13", "12", "10", "8"];
  const selects = Array.from(
    document.querySelectorAll<HTMLSelectElement>("table.wizard__ability-table select"),
  );
  if (selects.length === 0) return;
  const used = new Set(selects.map((s) => s.value).filter(Boolean));
  const remaining = STANDARD_VALUES.filter((v) => !used.has(v));
  let next = 0;
  for (const select of selects) {
    if (select.value) continue;
    fireEvent.change(select, { target: { value: remaining[next++] } });
  }
}

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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Своя предыстория"));
    const titleInput = await screen.findByPlaceholderText("Название предыстории");
    fireEvent.change(titleInput, { target: { value: "Бродяга" } });
    await waitFor(() => expect((titleInput as HTMLInputElement).value).toBe("Бродяга"));

    fireEvent.click(screen.getByText("Добавить"));
    await screen.findByText(/1\/7/);

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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Своя предыстория"));
    fireEvent.change(await screen.findByPlaceholderText("Название предыстории"), {
      target: { value: "Бродяга" },
    });
    fireEvent.click(screen.getByText("Скрытность"));
    await screen.findByText("Добавить");
    const gearSelect = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(gearSelect, { target: { value: "Верёвка, пеньковая (50 футов)" } });
    fireEvent.click(screen.getByText("Добавить"));
    fireEvent.change(gearSelect, { target: { value: "Факел" } });
    fireEvent.click(screen.getByText("Добавить"));
    fireEvent.change(document.querySelector('input[type="number"]') as HTMLInputElement, {
      target: { value: "25" },
    });
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Тестовый Бродяга" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.background).toBe("Бродяга");
    expect(character.coins.gold).toBe(25);
    expect(character.inventory.map((i) => i.name)).toEqual(
      expect.arrayContaining(["Верёвка, пеньковая (50 футов)", "Факел"]),
    );
  });

  it("caps custom background equipment at the limit and lets you remove an item", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Своя предыстория"));

    const addButton = await screen.findByText("Добавить");
    for (let i = 0; i < 7; i++) {
      fireEvent.click(addButton);
    }
    expect(await screen.findByText(/7\/7/)).toBeInTheDocument();
    expect(addButton).toHaveAttribute("aria-disabled", "true");

    // Removing one frees up a slot again.
    fireEvent.click(screen.getAllByText("✕")[0]);
    await screen.findByText(/6\/7/);
    expect(addButton).toHaveAttribute("aria-disabled", "false");
  });

  it("offers the full item catalog (not just adventuring gear) for custom background equipment", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Своя предыстория"));

    await screen.findByText("Добавить");
    const gearSelect = document.querySelector("select") as HTMLSelectElement;
    const optionLabels = Array.from(gearSelect.options).map((o) => o.textContent);
    expect(optionLabels.some((label) => label?.startsWith("Кинжал ("))).toBe(true);
    expect(optionLabels.some((label) => label?.startsWith("Кожаный доспех ("))).toBe(true);
  });

  it("carries class saving throws/skills and background skills/equipment through to the finished character", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    // Fighter's saving throws/skill picker should render on the class step.
    const savingThrowsLine = (await screen.findByText(/Спасброски:/)).closest("p");
    expect(savingThrowsLine).toHaveTextContent("Сила, Телосложение");
    fireEvent.click(screen.getByText("Атлетика"));
    fireEvent.click(screen.getByText("Восприятие"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    // abilities: keep defaults (method === "standard"), just move on
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));
    // equipment: keep defaults
    fillStandardAbilities();
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
    expect(character.coins.gold).toBe(15);
    expect(character.inventory.length).toBeGreaterThan(0);
    // characters-starting-equipment-weight-fix: стартовое снаряжение (класс + предыстория)
    // подставляет вес из каталога (catalogWeightLb), а не оставляет weightLb: 0 по умолчанию.
    expect(character.inventory.some((item) => item.weightLb > 0)).toBe(true);
  });

  it("gives starting equipment its catalog weight, including stacked items like «×20» ammo (regression: used to default to weightLb 0)", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    // abilities: keep defaults
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));
    // equipment: keep defaults (кольчуга + лёгкий арбалет и 20 болтов + набор исследователя подземелий)
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));

    const nameInput = await screen.findByPlaceholderText("Имя персонажа");
    fireEvent.change(nameInput, { target: { value: "Тестовый Герой" } });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;

    const armor = character.inventory.find((item) => item.name === "Кольчуга");
    expect(armor?.weightLb).toBeGreaterThan(0);

    // "Арбалетные болты ×20" — предмет из стартового снаряжения, добавленный
    // пачкой (не по прямому имени из каталога): раньше оставался с weightLb: 0.
    const ammo = character.inventory.find((item) => item.name === "Арбалетные болты ×20");
    expect(ammo?.weightLb).toBeGreaterThan(0);
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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Солдат"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    // abilities: keep defaults
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));
    // equipment: keep defaults
    fillStandardAbilities();
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
    expect(character.coins.gold).toBe(10);
    expect(character.inventory.length).toBeGreaterThan(0);
  });

  it("rolling ability scores fills the manual fields, which stay freely editable afterward", async () => {
    addCharacter.mockClear();
    sounds.playDiceRollSound.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(screen.getByText("Бросить кубики"));
    expect(sounds.playDiceRollSound).toHaveBeenCalledOnce();
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

    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Бард"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults

    // Equipment step: pick "Любой другой музыкальный инструмент" over "Лютня"
    // (second radio in the "equip-slot-2" group).
    await screen.findByText("Любой другой музыкальный инструмент");
    const instrumentSlotRadios = document.querySelectorAll('input[name="equip-slot-2"]');
    expect(instrumentSlotRadios.length).toBe(2);
    fireEvent.click(instrumentSlotRadios[1]);
    const instrumentSelect = await screen.findByDisplayValue(/^Волынка /);
    fireEvent.change(instrumentSelect, { target: { value: "Барабан" } });
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Менестрель" },
    });
    // Бард на 1 уровне: ровно 2 заговора и 4 заклинания 1 круга — иначе
    // «Создать персонажа» остаётся заблокированной (см. отдельный тест на это).
    await screen.findByText("Заговор Барда 1");
    const spellCheckboxes = Array.from(
      document.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    expect(spellCheckboxes.length).toBe(6);
    spellCheckboxes.forEach((box) => fireEvent.click(box));
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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    // Criminal has no bonus language of its own (unlike e.g. Acolyte/Sage) —
    // keeps this test focused on the race's language mechanism alone.
    fireEvent.click(await screen.findByText("Преступник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    // Manual entry starts every ability at 10 and needs no per-field input to
    // be valid — keeps this test's "base 10 everywhere" premise reachable
    // now that the standard-array method requires all 6 to be assigned.
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults (base 10 everywhere)
    fillStandardAbilities();
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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    fireEvent.click(screen.getByText("Атлетика"));
    fireEvent.click(screen.getByText("История"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
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
    // Half-Elf also has a mandatory +1/+1 ability-bonus choice (a separate
    // requirement from the skill choice above) — pick any 2 to clear it.
    fireEvent.click(screen.getByText("Сила"));
    fireEvent.click(screen.getByText("Ловкость"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Волшебник"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
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
    // Half-Elf also has a mandatory 2-skill "Гибкость навыков" choice (a
    // separate requirement from the ability bonus above) — pick any 2.
    fireEvent.click(screen.getByText("Магия"));
    fireEvent.click(screen.getByText("Обман"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    // Manual entry keeps every base ability at 10 without per-field input —
    // the standard-array method would assign a real permutation and break
    // this test's "keep base 10s, just the racial bonuses matter" premise.
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep base 10s, just the racial bonuses matter
    fillStandardAbilities();
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
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Дварф"));
    const toolSelect = await screen.findByDisplayValue(/^Инструменты кузнеца /);
    fireEvent.change(toolSelect, { target: { value: "Инструменты пивовара" } });
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/выбрано: Инструменты пивовара/)).toBeInTheDocument();

    // Regression: the chosen tool used to vanish here — shown only on this
    // review step (inside the race-trait description text), never written
    // into the saved Character's toolProficiencies.
    fireEvent.change(screen.getByPlaceholderText("Имя персонажа"), { target: { value: "Дварф Тест" } });
    fireEvent.click(screen.getByText("Создать персонажа"));
    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.toolProficiencies).toContain("Инструменты пивовара");
  });

  it("lets a Fighter choose a fighting style, shown by name and description on review", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    const styleSelect = await screen.findByDisplayValue(/^Стрельба из лука$/);
    fireEvent.change(styleSelect, { target: { value: "Оборона" } });
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Оборона/)).toBeInTheDocument();
    expect(screen.getByText(/бонус \+1 к КД/)).toBeInTheDocument();
  });

  it("lets a Ranger pick a favored enemy and known terrain (previously not offered at all)", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Следопыт"));
    pickRequiredClassSkills();
    const enemySelect = await screen.findByDisplayValue(/^Аберрации$/);
    fireEvent.change(enemySelect, { target: { value: "Драконы" } });
    const terrainSelect = await screen.findByDisplayValue(/^Арктика$/);
    fireEvent.change(terrainSelect, { target: { value: "Горы" } });
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Избранный враг: Драконы/)).toBeInTheDocument();
    expect(screen.getByText(/Известная местность: Горы/)).toBeInTheDocument();

    // Regression: the choice used to vanish here — shown only on this review
    // step, never written into the saved Character (CharactersPage.tsx had
    // nowhere to read it from even if it wanted to render it).
    fireEvent.change(screen.getByPlaceholderText("Имя персонажа"), { target: { value: "Следопыт Тест" } });
    fireEvent.click(screen.getByText("Создать персонажа"));
    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.favoredEnemy).toBe("Драконы");
    expect(character.knownTerrain).toBe("Горы");
  });

  it("shows the chosen background's feature (bold name + description) on the review step", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Дворянин"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Предыстория: Дворянин/)).toBeInTheDocument();
    expect(screen.getByText(/Право голоса/)).toBeInTheDocument();
    expect(
      screen.getByText(/вас принимают без очереди и выслушивают на аудиенциях/),
    ).toBeInTheDocument();

    const equipmentLine = screen.getByText(/Снаряжение:/).closest("li");
    expect(equipmentLine).not.toBeNull();
    expect(within(equipmentLine!).getByText("Снаряжение:").tagName).toBe("STRONG");
    expect(equipmentLine).toHaveTextContent("Кольчуга");
    expect(equipmentLine!.querySelectorAll("strong")).toHaveLength(1);
  });

  it("suggests a name from the selected race's list for the current gender, and rerolling gives a different one", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Дварф"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
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

  it("shows three portraits, resets the choice after gender changes, and saves the selected variant", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Возрастной Герой" },
    });
    const portraitButtons = screen.getAllByRole("button", { name: /Вариант портрета/ });
    expect(portraitButtons).toHaveLength(3);
    expect(portraitButtons[0]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(portraitButtons[2]);
    expect(portraitButtons[2]).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByDisplayValue("Мужской"), { target: { value: "Женский" } });
    expect(portraitButtons[0]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(portraitButtons[1]);
    expect(portraitButtons[1]).toHaveAttribute("aria-pressed", "true");
    const ageInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(ageInput, { target: { value: "134" } });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.gender).toBe("Женский");
    expect(character.portraitVariant).toBe(2);
    expect(character.age).toBe(134);
  });

  it("clamps a typed age above the visible limit to that limit, and shows the limit as text", async () => {
    addCharacter.mockClear();
    sounds.playLimitSound.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Долгожитель" },
    });
    expect(screen.getByText(/Возраст \(до 500 лет\)/)).toBeInTheDocument();
    const ageInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(ageInput, { target: { value: "99999" } });
    expect(ageInput).toHaveClass("character-card__danger");
    expect(sounds.playLimitSound).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.age).toBe(500);
  });

  it("shows the proficiency-bonus hint next to Навыки on the review step once the character has a skill proficiency", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник")); // grants Проницательность/Религия unconditionally
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment

    const skillsLine = await screen.findByText(/Навыки:/);
    expect(skillsLine.textContent).toMatch(/бонус мастерства/);
  });

  it("shows a computed ability-mod + proficiency-bonus number next to each skill and saving throw on the review step", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин")); // proficient in Strength/Constitution saves
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник")); // grants Проницательность/Религия unconditionally
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment

    expect(screen.getByText(/^Проницательность: [+-]\d+ \(владение\)$/)).toBeInTheDocument();
    expect(screen.getByText(/^Религия: [+-]\d+ \(владение\)$/)).toBeInTheDocument();
    // Атлетика (Strength-based) is not one of the Acolyte's granted skills -> no "(владение)" suffix.
    expect(screen.getByText(/^Атлетика: [+-]\d+$/)).toBeInTheDocument();
    // Fighter is proficient in the Strength saving throw.
    expect(screen.getByText(/^Сила: [+-]\d+ \(владение\)$/)).toBeInTheDocument();
  });

  it("АС on the review step tracks Dexterity for a Human, across all three ability-score methods (regression: owner saw AC stuck at 9)", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Беспризорник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    // Standard array, Dexterity = 8 (the value that reproduces the reported "9").
    const dexSelect = () => document.querySelectorAll("table.wizard__ability-table select")[1] as HTMLSelectElement;
    fireEvent.change(dexSelect(), { target: { value: "8" } });
    await waitFor(() => expect(dexSelect().value).toBe("8"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее")); // -> equipment
    // Light armor, no shield (leather armor's full Dex bonus keeps AC tracking
    // Dexterity below — a heavy-armor/shield loadout like the class default
    // would mask that, see `characters-armor-class-from-worn-armor`).
    fireEvent.click(await screen.findByLabelText("Кожаный доспех, длинный лук и 20 стрел"));
    fireEvent.click(screen.getByLabelText("Два воинских оружия"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // -> review
    expect((await screen.findByText(/КД:/)).textContent).toMatch(/КД: 10\b/);

    // Back to abilities, switch to point buy, raise Dexterity to 14.
    fireEvent.click(screen.getByText("Назад"));
    fireEvent.click(screen.getByText("Назад"));
    fireEvent.click(await screen.findByLabelText(/Покупка очков/));
    const dexPlusButton = () => {
      const rows = document.querySelectorAll("table.wizard__ability-table tbody tr");
      return within(rows[1] as HTMLElement).getByText("+");
    };
    for (let i = 0; i < 4; i++) fireEvent.click(dexPlusButton()); // 10 -> 14
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее")); // -> equipment
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // -> review
    expect((await screen.findByText(/КД:/)).textContent).toMatch(/КД: 13\b/);

    // Back to abilities, switch to manual entry, set Dexterity to 18.
    fireEvent.click(screen.getByText("Назад"));
    fireEvent.click(screen.getByText("Назад"));
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    const manualDexInput = () => document.querySelectorAll('input[type="number"]')[1] as HTMLInputElement;
    fireEvent.change(manualDexInput(), { target: { value: "18" } });
    await waitFor(() => expect(manualDexInput().value).toBe("18"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее")); // -> equipment
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // -> review
    expect((await screen.findByText(/КД:/)).textContent).toMatch(/КД: 15\b/);
  });

  it("АС on the review step includes worn armor and a shield (regression: owner saw AC 8 on a mail-armored character)", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    // Race doesn't affect AC in SRD 5.1 — any race reproduces the bug; using
    // one already covered by this test file's race mocks.
    fireEvent.click(await screen.findByText("Дварф"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Беспризорник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее")); // -> equipment

    // Default equipment choice: "Кольчуга" (chain mail, AC 16, no Dex) + "Воинское оружие и щит" (shield, +2).
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // -> review
    expect((await screen.findByText(/КД:/)).textContent).toMatch(/КД: 18\b/);
  });

  it("lets a Monk choose one artisan's or musical instrument tool, reflected in the review text", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Монах"));
    pickRequiredClassSkills();

    // Craft tool is the default category.
    const toolSelect = await screen.findByDisplayValue(/^Инструменты алхимика /);
    fireEvent.change(toolSelect, { target: { value: "Инструменты каменщика" } });

    // Switch category to musical instrument.
    fireEvent.change(screen.getByDisplayValue("Инструмент ремесленника"), {
      target: { value: "music" },
    });
    const instrumentSelect = await screen.findByDisplayValue(/^Волынка /);
    fireEvent.change(instrumentSelect, { target: { value: "Лютня" } });
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Владение инструментами: Лютня/)).toBeInTheDocument();

    // Regression: the chosen tool used to vanish here — shown only on this
    // review step, never written into the saved Character's toolProficiencies.
    fireEvent.change(screen.getByPlaceholderText("Имя персонажа"), { target: { value: "Монах Тест" } });
    fireEvent.click(screen.getByText("Создать персонажа"));
    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.toolProficiencies).toContain("Лютня");
  });

  it("lets a Bard choose 3 distinct musical instrument proficiencies, shown on review", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Бард"));
    pickRequiredClassSkills();

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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    await screen.findByPlaceholderText("Имя персонажа");
    expect(screen.getByText(/Владение музыкальными инструментами: Лютня, Лира, Рожок/)).toBeInTheDocument();

    // Regression: the 3 chosen instruments used to vanish here — shown only
    // on this review step, never written into the saved Character.
    fireEvent.change(screen.getByPlaceholderText("Имя персонажа"), { target: { value: "Бард Тест" } });
    // Бард на 1 уровне обязан выбрать 2 заговора и 4 заклинания 1 круга,
    // иначе «Создать персонажа» остаётся заблокированной (см. другой тест).
    await screen.findByText("Заговор Барда 1");
    const spellCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    spellCheckboxes.forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByText("Создать персонажа"));
    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.toolProficiencies).toEqual(expect.arrayContaining(["Лютня", "Лира", "Рожок"]));
  });

  it("lets a Sage pick 2 bonus languages, distinct from the race's, ending up in the finished character", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    // Human's own bonus language — pick Гномий, so we can prove the two
    // background language slots avoid it and each other.
    fireEvent.change(await screen.findByDisplayValue("Великаний"), { target: { value: "Гномий" } });
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
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
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    fireEvent.click(await screen.findByText("Беспризорник"));
    await screen.findByText(/Городское дно/);
    expect(screen.queryByText(/Дополнительный язык/)).not.toBeInTheDocument();
  });

  it("Wizard spellcasting: Create stays disabled until exactly the required cantrips/spells are chosen, then they land on the character", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Волшебник"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    // Manual entry keeps every ability at 10 (Int mod 0) without per-field
    // input — the standard-array method would assign a real permutation and
    // break this test's "Int mod 0 -> 1 known spell" assumption.
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults (Int mod 0 -> 1 known spell)
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Тестовый Волшебник" },
    });
    const createButton = screen.getByText("Создать персонажа");
    expect(createButton).toBeDisabled();

    await screen.findByText("Заговор Волшебника 1");
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    // 3 заговора (Волшебник знает 3 на 1 уровне) + 2 заклинания 1 круга в фикстуре.
    expect(boxes.length).toBe(5);

    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    expect(createButton).toBeDisabled(); // ещё не все 3 заговора выбраны
    fireEvent.click(boxes[2]);
    expect(createButton).toBeDisabled(); // заговоры выбраны, но нет заклинания

    // Волшебник на 1 уровне "подготавливает" мод.Интеллекта + уровень (мин 1)
    // заклинаний — при базовых характеристиках это 1, а не фиксированное число.
    fireEvent.click(boxes[3]);
    expect(createButton).not.toBeDisabled();

    fireEvent.click(createButton);

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(new Set(character.knownCantrips)).toEqual(
      new Set(["wizard-cantrip-1", "wizard-cantrip-2", "wizard-cantrip-3"]),
    );
    expect(character.castableSpells).toEqual(["wizard-spell-1"]);
    expect(character.spellSlotsMax).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(character.spellSlotsCurrent).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  /**
   * characters-wizard-spellbook: подготовленное у волшебника — срез из книги,
   * поэтому выбранное в мастере обязано попасть и в неё. Проба отрицательная:
   * убери `spellbook` из `finish()` — и созданный волшебник выйдет с
   * подготовленным заклинанием, которого нет в его книге, то есть готовить его
   * было бы не из чего. Остаток книги 1 уровня вписывается на листе персонажа,
   * и шаг «Итог» об этом говорит.
   */
  it("Wizard spellbook: chosen spells land in the spellbook too, and the review step says where the rest is written", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Волшебник"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(await screen.findByText("Далее")); // Интеллект 10 (мод 0) → одно подготовленное
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Книжник" },
    });
    await screen.findByText("Заговор Волшебника 1");
    expect(screen.getByText(/Всего в книге на 1 уровне 6 заклинаний/)).toBeInTheDocument();

    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    [0, 1, 2, 3].forEach((i) => fireEvent.click(boxes[i]));
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.castableSpells).toEqual(["wizard-spell-1"]);
    expect(character.spellbook).toEqual(["wizard-spell-1"]);
  });

  it("a non-spellcaster (Воин) shows no spellcasting UI at all on the review step", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    await screen.findByPlaceholderText("Имя персонажа");
    expect(document.body.textContent).not.toMatch(/заклинани/i);
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });

  it("an unfinished required sub-choice on the class step blocks Далее with a specific hint, until it's filled", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));

    // Fighter requires 2 class skills; none picked yet.
    const nextButton = screen.getByText("Далее");
    expect(nextButton).toBeDisabled();
    expect(screen.getByText("Выбери 2 навыка класса, чтобы продолжить.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Атлетика"));
    expect(nextButton).toBeDisabled(); // 1/2, still short one
    expect(screen.getByText("Выбери 2 навыка класса, чтобы продолжить.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("История"));
    expect(nextButton).not.toBeDisabled();
    expect(screen.queryByText("Выбери 2 навыка класса, чтобы продолжить.")).not.toBeInTheDocument();
  });

  it("an empty custom background (no title, no skill) blocks Далее with a hint, until both are filled", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Своя предыстория"));

    const nextButton = screen.getByText("Далее");
    expect(nextButton).toBeDisabled();
    expect(screen.getByText("Впиши название своей предыстории, чтобы продолжить.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Название предыстории"), { target: { value: "Бродяга" } });
    expect(nextButton).toBeDisabled();
    expect(screen.getByText("Выбери хотя бы один навык своей предыстории, чтобы продолжить.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Скрытность"));
    expect(nextButton).not.toBeDisabled();
    expect(
      screen.queryByText("Выбери хотя бы один навык своей предыстории, чтобы продолжить."),
    ).not.toBeInTheDocument();
  });

  it("landing on the abilities step with the standard array unassigned blocks Далее, until all six are picked", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fireEvent.click(screen.getByText("Далее"));

    // Default method is "standard"; nothing assigned yet.
    const nextButton = screen.getByText("Далее");
    expect(nextButton).toBeDisabled();
    expect(screen.getByText("Распредели все шесть характеристик, чтобы продолжить.")).toBeInTheDocument();

    const selects = document.querySelectorAll<HTMLSelectElement>("table.wizard__ability-table select");
    expect(selects.length).toBe(6);
    const values = ["15", "14", "13", "12", "10", "8"];
    for (let i = 0; i < 5; i++) {
      fireEvent.change(selects[i], { target: { value: values[i] } });
    }
    expect(nextButton).toBeDisabled(); // still one unassigned
    expect(screen.getByText("Распредели все шесть характеристик, чтобы продолжить.")).toBeInTheDocument();

    fireEvent.change(selects[5], { target: { value: values[5] } });
    expect(nextButton).not.toBeDisabled();
    expect(
      screen.queryByText("Распредели все шесть характеристик, чтобы продолжить."),
    ).not.toBeInTheDocument();
  });

  it("renders all 4 Cleric domains on the review step and saves the chosen one, not always the first (characters-original-subclasses acceptance scenario)", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Жрец"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(await screen.findByText("Далее")); // abilities: keep defaults (Wis mod 0 -> 1 prepared spell)
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // equipment: keep defaults

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Тестовый Жрец" },
    });

    const subclassSelect = await screen.findByLabelText("Архетип");
    const optionLabels = Array.from(subclassSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionLabels).toEqual(["Домен жизни", "Домен войны", "Домен обмана", "Домен прозрения"]);
    fireEvent.change(subclassSelect, { target: { value: "2" } }); // "Домен обмана" — not the first/default option
    expect(screen.getByText("Домен обмана")).toBeInTheDocument();
    expect(screen.getByText(/Благословенная маска/)).toBeInTheDocument(); // level-1 feature of the chosen domain

    await screen.findByText("Заговор Жреца 1");
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[2]);
    fireEvent.click(boxes[3]); // 3 cantrips + 1 prepared spell

    const createButton = screen.getByText("Создать персонажа");
    expect(createButton).not.toBeDisabled();
    fireEvent.click(createButton);

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.subclass).toBe("Домен обмана");
    // characters-subclass-features-have-no-mechanical-effect: выбранный домен
    // даёт владение навыком, а не только строчку текста на «Итоге».
    expect(character.skillProficiencies).toContain("Обман");
    expect(character.castableSpells).toEqual(expect.arrayContaining(["sanctuary", "bane"]));
    expect(character.armorProficiencies).not.toContain("heavy");
  });

  /** characters-subclass-features-have-no-mechanical-effect — приёмка: Домен войны 1 уровня. */
  it("сохраняет жрецу Домена войны владение тяжёлыми доспехами и воинским оружием", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Жрец"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(await screen.findByText("Далее"));
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее"));

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Жрец войны" },
    });
    fireEvent.change(await screen.findByLabelText("Архетип"), { target: { value: "1" } }); // Домен войны

    await screen.findByText("Заговор Жреца 1");
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    for (const box of boxes.slice(0, 4)) fireEvent.click(box);
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.subclass).toBe("Домен войны");
    expect(character.armorProficiencies).toEqual(expect.arrayContaining(["light", "medium", "shields", "heavy"]));
    expect(character.weaponProficiencies).toEqual(expect.arrayContaining(["simple", "martial"]));
  });

  /**
   * Отрицательная проба на саму расу: `topics` в этом файле её НЕ содержат —
   * девять рас приезжают из справочника, а Эльф бездны добавляется
   * `playableRaces` (abyssElfRace.ts). Убери его оттуда — и проба покраснеет
   * именно на названии расы, а не на общем снимке экрана.
   */
  it("Эльф бездны выбирается наравне с девятью и доносит до персонажа свои бонусы, заговор и счётчик «Зова бездны»", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Эльф бездны"));
    // Воин — не заклинатель: заговор здесь может приехать только от расы.
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(await screen.findByText("Далее")); // характеристики: база 10 везде
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // снаряжение: по умолчанию

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
      target: { value: "Ксарнет" },
    });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.race).toBe("Эльф бездны");
    // Наши числа: Ловкость +2, Мудрость +1 от базовых 10.
    expect(character.abilities.dexterity).toBe(12);
    expect(character.abilities.wisdom).toBe(11);
    expect(character.speedFeet).toBe(30);
    expect(character.languages).toEqual(expect.arrayContaining(["Общий", "Эльфийский", "Подземный"]));
    expect(character.knownCantrips).toEqual(["dancing-lights"]);
    expect(character.featureUses).toContainEqual({ featureId: "abyss-call", usesCurrent: 1 });
  });

  it("шаг «Итог» показывает особенности эльфа бездны, называет цену числом и берёт названия заклинаний из справочника", async () => {
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Эльф бездны"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Воин"));
    pickRequiredClassSkills();
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByText("Послушник"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));
    fireEvent.click(await screen.findByLabelText(/Ручной ввод/));
    fireEvent.click(await screen.findByText("Далее")); // характеристики: база 10 везде
    fillStandardAbilities();
    fireEvent.click(await screen.findByText("Далее")); // снаряжение: по умолчанию

    const traits = await screen.findByText("Расовые особенности:");
    const list = traits.closest("li") as HTMLElement;
    expect(within(list).getByText("Превосходное тёмное зрение")).toBeInTheDocument();
    expect(within(list).getByText("Дар бездны")).toBeInTheDocument();
    // Цена названа числом: Мудрость 11 (+0) без владения Восприятием -> 10,
    // под прямым солнцем помеха -5 -> 5.
    expect(within(list).getByText(/Пассивная внимательность там же — 5 вместо 10/)).toBeInTheDocument();
    expect(
      within(list).getByText(/Пляшущие огоньки.*Огонь фей.*Тьма/),
    ).toBeInTheDocument();
  });
});
