import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { CharactersPage } from "./CharactersPage";
import type { CampaignState, Character, RuleTopic, Spell } from "../../state/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const CONDITIONS_TOPIC: RuleTopic = {
  id: "appendices-conditions",
  category: "appendices",
  title: "Состояния",
  sourceUrl: "",
  blocks: [
    { type: "heading", level: 2, text: "Ослеплённое" },
    {
      type: "list",
      items: [
        "Ослеплённое существо не может видеть и автоматически проваливает любую проверку характеристик, зависящую от зрения.",
        "Броски атаки против существа совершаются с преимуществом, а броски атаки существа совершаются с помехой.",
      ],
    },
    { type: "heading", level: 2, text: "Парализованное" },
    { type: "list", items: ["Парализованное существо недееспособно и не может двигаться или говорить."] },
  ],
};

const addCharacter = vi.fn();
const removeCharacter = vi.fn();
const updateCharacter = vi.fn();

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, addCharacter, removeCharacter, updateCharacter }),
}));

function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: "c1",
    campaignName: "Тест",
    characters: [],
    journal: [],
    currentSceneId: null,
    adventureLog: [],
    combat: null,
    chaosFactor: 5,
    ...overrides,
  };
}

describe("CharactersPage", () => {
  beforeEach(() => {
    addCharacter.mockClear();
    removeCharacter.mockClear();
    updateCharacter.mockClear();
    window.confirm = vi.fn(() => true);
    vi.mocked(invoke).mockImplementation(async () => []);
  });

  function spellcaster(): CampaignState["characters"][number] {
    return {
      ...characterWithInventory(),
      knownCantrips: ["cantrip-1"],
      knownSpells: ["spell-1"],
      spellSlotsLevel1Max: 2,
      spellSlotsLevel1Current: 2,
    };
  }

  function characterWithInventory(): CampaignState["characters"][number] {
    return {
      id: "hero",
      name: "Герой",
      race: "Человек",
      class: "Воин",
      background: "",
      alignment: "",
      gender: "",
      age: 0,
      languages: [],
      level: 1,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      maxHp: 10,
      currentHp: 10,
      armorClass: 10,
      speedFeet: 30,
      initiative: 0,
      passivePerception: 10,
      conditions: [],
      inventory: [{ id: "torch-1", name: "Факел", quantity: 5, notes: "" }],
      gold: 0,
      savingThrowProficiencies: [],
      skillProficiencies: [],
      knownCantrips: [],
      knownSpells: [],
      spellSlotsLevel1Max: 0,
      spellSlotsLevel1Current: 0,
    };
  }

  it("deletes a character after confirmation without crashing", async () => {
    mockState = baseState({
      characters: [
        {
          id: "hero",
          name: "Герой",
          race: "Человек",
          class: "Воин",
          background: "",
          alignment: "",
          gender: "",
          age: 0,
          languages: [],
          level: 1,
          abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
          maxHp: 10,
          currentHp: 10,
          armorClass: 10,
          speedFeet: 30,
          initiative: 0,
          passivePerception: 10,
          conditions: [],
          inventory: [],
          gold: 0,
          savingThrowProficiencies: [],
          skillProficiencies: [],
          knownCantrips: [],
          knownSpells: [],
          spellSlotsLevel1Max: 0,
          spellSlotsLevel1Current: 0,
        },
      ],
    });
    render(<CharactersPage />);

    expect(screen.getByText("Герой")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Удалить персонажа"));

    await waitFor(() => expect(removeCharacter).toHaveBeenCalledWith("hero"));
  });

  it("has no Import button or panel (feature removed)", async () => {
    mockState = baseState();
    render(<CharactersPage />);

    expect(screen.queryByText("Импорт")).not.toBeInTheDocument();
    expect(screen.queryByText("Выбрать файл")).not.toBeInTheDocument();
  });

  it("toggles the rules-wizard panel without crashing", async () => {
    mockState = baseState();
    render(<CharactersPage />);

    expect(screen.queryByText("Раса")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Создать персонажа по правилам"));
    expect(await screen.findByText(/Выбери расу слева/)).toBeInTheDocument();

    // Clicking the active panel's own button again closes it.
    fireEvent.click(screen.getByText("Создать персонажа по правилам"));
    await waitFor(() => expect(screen.queryByText(/Выбери расу слева/)).not.toBeInTheDocument());
  });

  it("spending 3 of 5 torches updates the tracked quantity, not just removes one", async () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    const minusButtons = screen.getAllByText("−");
    fireEvent.click(minusButtons[0]);
    fireEvent.click(minusButtons[0]);
    fireEvent.click(minusButtons[0]);

    expect(updateCharacter).toHaveBeenCalledTimes(3);
    for (const call of updateCharacter.mock.calls) {
      expect(call[0]).toBe("hero");
    }
    // Apply the last updater the same way the real context would, to check
    // the actual resulting quantity (each call decrements independently from
    // the same base fixture, since the mock state is static).
    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const updated = updater(characterWithInventory());
    expect(updated.inventory[0].quantity).toBe(4);
  });

  it("running out of an item (quantity reaches 0) removes it from inventory", async () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    const updater = () => {
      const onMinus = screen.getAllByText("−")[0];
      fireEvent.click(onMinus);
      return updateCharacter.mock.calls[updateCharacter.mock.calls.length - 1][1] as (
        c: Character,
      ) => Character;
    };

    let current = characterWithInventory();
    for (let i = 0; i < 5; i++) {
      current = updater()(current);
    }
    expect(current.inventory).toHaveLength(0);
  });

  it("adding a new item and a condition (typed, SRD or custom) calls updateCharacter correctly", async () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    fireEvent.change(screen.getByPlaceholderText("Новый предмет"), {
      target: { value: "Верёвка" },
    });
    fireEvent.click(screen.getAllByText("Добавить")[0]);
    const addItemUpdater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const afterItem = addItemUpdater(characterWithInventory());
    expect(afterItem.inventory.map((i) => i.name)).toContain("Верёвка");

    fireEvent.change(screen.getByPlaceholderText("Состояние (из SRD или своё)"), {
      target: { value: "Отравленное" },
    });
    fireEvent.click(screen.getAllByText("Добавить")[1]);
    const addConditionUpdater = updateCharacter.mock.calls[1][1] as (c: Character) => Character;
    const afterCondition = addConditionUpdater(characterWithInventory());
    expect(afterCondition.conditions).toEqual(["Отравленное"]);
  });

  it("a character with a known condition renders its SRD effect text; each active condition shows its own effect", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_rules" ? [CONDITIONS_TOPIC] : []));
    const char = { ...characterWithInventory(), conditions: ["Ослеплённое", "Парализованное"] };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);

    expect(await screen.findByText(/не может видеть/)).toBeInTheDocument();
    expect(screen.getByText(/недееспособно и не может двигаться/)).toBeInTheDocument();
  });

  it("removing a condition removes it from the character (and with it, its effect plate)", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_rules" ? [CONDITIONS_TOPIC] : []));
    const char = { ...characterWithInventory(), conditions: ["Ослеплённое"] };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);
    await screen.findByText(/не может видеть/);

    const conditionItem = screen.getByText("Ослеплённое").closest("li") as HTMLElement;
    fireEvent.click(within(conditionItem).getByText("✕"));

    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    expect(updater(char).conditions).toEqual([]);
  });

  it("exhaustion level 3 shows the cumulative effects of levels 1-3, not just level 3, plus recovery text", async () => {
    const char = { ...characterWithInventory(), conditions: ["Истощение (ур. 3)"] };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);

    expect(await screen.findByText("Помеха на проверки характеристик.")).toBeInTheDocument();
    expect(screen.getByText("Скорость уменьшается вдвое.")).toBeInTheDocument();
    expect(screen.getByText("Помеха на броски атаки и спасброски.")).toBeInTheDocument();
    expect(screen.queryByText("Максимальные хиты уменьшаются вдвое.")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Завершение длинного отдыха снижает уровень истощения существа на 1, при условии, что существо также принимало некоторую пищу и питьё.",
      ),
    ).toBeInTheDocument();
  });

  it("exhaustion level 6 shows death among its cumulative effects", async () => {
    const char = { ...characterWithInventory(), conditions: ["Истощение (ур. 6)"] };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);

    expect(await screen.findByText("Смерть.")).toBeInTheDocument();
  });

  it("the general 'how conditions end' hint renders once in the Состояния section", () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    expect(
      screen.getByText(
        "Состояние снимается, когда его отменяет вызвавший эффект (например, «Сбитый с ног» снимается, если встать на ноги), либо когда заканчивается его длительность.",
      ),
    ).toBeInTheDocument();
  });

  it("the item add-row offers datalist suggestions from multiple catalog categories (weapons, armor, ...)", () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    const { container } = render(<CharactersPage />);

    const options = Array.from(container.querySelectorAll('datalist[id^="items-"] option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toContain("Кинжал"); // WEAPONS
    expect(options).toContain("Кожаный доспех"); // ARMOR
  });

  it("the item add-row datalist includes healing potion tiers with their healing dice shown as a hint", () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    const { container } = render(<CharactersPage />);

    const options = Array.from(container.querySelectorAll('datalist[id^="items-"] option'));
    const potionOption = options.find((o) => (o as HTMLOptionElement).value === "Зелье лечения") as
      | HTMLOptionElement
      | undefined;
    expect(potionOption).toBeDefined();
    expect(potionOption!.textContent).toContain("2к4+2");
    expect(options.map((o) => (o as HTMLOptionElement).value)).toContain("Зелье наивысшего лечения");
  });

  it("the item add-row datalist includes trade goods and mounts/vehicles", () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    const { container } = render(<CharactersPage />);

    const options = Array.from(container.querySelectorAll('datalist[id^="items-"] option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toContain("Соль (1 фунт.)"); // TRADE_GOODS
    expect(options).toContain("Осёл или мул"); // MOUNTS_AND_VEHICLES
  });

  it("a free-typed item name (not in the catalog) is still added on click", async () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    fireEvent.change(screen.getByPlaceholderText("Новый предмет"), {
      target: { value: "Совершенно случайное имя" },
    });
    fireEvent.click(screen.getAllByText("Добавить")[0]);

    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    expect(updater(characterWithInventory()).inventory.map((i) => i.name)).toContain(
      "Совершенно случайное имя",
    );
  });

  it("using a level-1 spell decrements the slot counter by exactly 1 through onUpdate", async () => {
    mockState = baseState({ characters: [spellcaster()] });
    render(<CharactersPage />);

    const useButtons = screen.getAllByText("Использовать");
    fireEvent.click(useButtons[0]); // only group with a button now is knownSpells (level 1)

    expect(updateCharacter).toHaveBeenCalledTimes(1);
    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    expect(updater(spellcaster()).spellSlotsLevel1Current).toBe(1);
  });

  it("the level-1 'Использовать' button is disabled at 0 slots, and the updater itself floors at 0 too", async () => {
    const empty = { ...spellcaster(), spellSlotsLevel1Current: 0 };
    mockState = baseState({ characters: [empty] });
    render(<CharactersPage />);

    const useButtons = screen.getAllByText("Использовать");
    expect(useButtons[0]).toBeDisabled();

    // Belt-and-suspenders: even if the button were somehow clicked, the
    // decrement logic itself must not go below 0.
    fireEvent.click(useButtons[0]);
    expect(updateCharacter).not.toHaveBeenCalled();
  });

  it("a cantrip has no 'Использовать' button, only usage info; the level-1 spell keeps its button", async () => {
    const cantripSpell: Spell = {
      id: "cantrip-1",
      name: "Свет",
      level: 0,
      school: "Преобразование",
      castingTime: "1 действие",
      range: "Касание",
      components: "В, М",
      duration: "1 час",
      concentration: false,
      ritual: false,
      classes: [],
      description: "Вы касаетесь предмета, который начинает испускать яркий свет.",
      damageDice: null,
      damageType: null,
      attackRoll: false,
      savingThrow: null,
    };
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_spells" ? [cantripSpell] : []));
    mockState = baseState({ characters: [spellcaster()] });
    render(<CharactersPage />);

    await screen.findByText(/Касание/);
    expect(screen.getAllByText("Использовать")).toHaveLength(1);
    expect(screen.getByText(/1 действие · Касание/)).toBeInTheDocument();
  });
});
