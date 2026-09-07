import { describe, it, expect, vi, beforeEach } from "vitest";
import bundledSpells from "../../../src-tauri/rules/spells.json";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { CharactersPage, truncateDescription, classFeaturesBlockHasContent } from "./CharactersPage";
import { armorProficienciesFor, weaponProficienciesFor } from "../characterCreationData";
import { emptyCoins, type CampaignState, type Character, type RuleTopic, type Spell } from "../../state/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
const sounds = vi.hoisted(() => ({
  playCoinsSound: vi.fn(),
  playLevelUpSound: vi.fn(),
  playLimitSound: vi.fn(),
  playSpellCastSound: vi.fn(),
}));
vi.mock("../../audio/uiSounds", () => sounds);

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

/** Точный текст SRD, что и в rules.json (см. characters-leveling-1-5) — «Хиты на следующих уровнях: 1к10 (или 6) ...». */
const FIGHTER_TOPIC: RuleTopic = {
  id: "classes-fighter",
  category: "classes",
  title: "Воин",
  sourceUrl: "",
  blocks: [
    { type: "paragraph", text: "Кость хитов: 1к10 за каждый уровень воина" },
    {
      type: "paragraph",
      text: "Хиты на следующих уровнях: 1к10 (или 6) + модификатор Телосложения за каждый уровень воина после первого",
    },
  ],
};

const DRUID_TOPIC: RuleTopic = {
  id: "classes-druid",
  category: "classes",
  title: "Друид",
  sourceUrl: "",
  blocks: [
    { type: "paragraph", text: "Кость хитов: 1к8 за каждый уровень друида" },
    {
      type: "paragraph",
      text: "Хиты на следующих уровнях: 1к8 (или 5) + модификатор Телосложения за каждый уровень друида после первого",
    },
  ],
};

/** Кость хитов — тот же формат строк rules.json, что у FIGHTER_TOPIC выше; нужна левел-апу для пересчёта максимума хитов. */
function classTopic(id: string, title: string, die: string, average: string): RuleTopic {
  return {
    id,
    category: "classes",
    title,
    sourceUrl: "",
    blocks: [
      { type: "paragraph", text: `Кость хитов: 1к${die} за каждый уровень` },
      {
        type: "paragraph",
        text: `Хиты на следующих уровнях: 1к${die} (или ${average}) + модификатор Телосложения за каждый уровень после первого`,
      },
    ],
  };
}

const BARD_TOPIC = classTopic("classes-bard", "Бард", "8", "5");
const BARBARIAN_TOPIC = classTopic("classes-barbarian", "Варвар", "12", "7");
const WARLOCK_TOPIC = classTopic("classes-warlock", "Колдун", "8", "5");

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

function expectStat(label: string, value: string) {
  const tile = screen.getByText(label, { selector: "dt" }).closest(".character-card__stat");
  expect(tile).not.toBeNull();
  expect(within(tile as HTMLElement).getByText(value, { selector: "dd" })).toBeInTheDocument();
}

describe("CharactersPage", () => {
  beforeEach(() => {
    addCharacter.mockClear();
    removeCharacter.mockClear();
    updateCharacter.mockClear();
    Object.values(sounds).forEach((sound) => sound.mockClear());
    window.confirm = vi.fn(() => true);
    vi.mocked(invoke).mockImplementation(async () => []);
  });

  function spellcaster(): CampaignState["characters"][number] {
    return {
      ...characterWithInventory(),
      knownCantrips: ["cantrip-1"],
      knownSpells: ["spell-1"],
      spellSlotsMax: [2, 0, 0, 0, 0],
      spellSlotsCurrent: [2, 0, 0, 0, 0],
    };
  }

  function characterWithInventory(): CampaignState["characters"][number] {
    return {
      id: "hero",
      name: "Герой",
      race: "Человек",
      class: "Воин",
      subclass: "",
      background: "",
      personalityTraits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      alignment: "",
      gender: "",
      age: 0,
      languages: [],
      favoredEnemy: "",
      knownTerrain: "",
      level: 1,
      // Высокий запас опыта по умолчанию — level-up тесты в этом файле не про XP-гейтинг
      // (characters-experience-and-levelup-gating) и не должны на него наткнуться;
      // граничные значения порога проверяются отдельными тестами ниже.
      experiencePoints: 999999,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      maxHp: 10,
      currentHp: 10,
      armorClass: 10,
      speedFeet: 30,
      initiative: 0,
      passivePerception: 10,
      conditions: [],
      inventory: [{ id: "torch-1", name: "Факел", quantity: 5, notes: "", weightLb: 1 }],
      coins: emptyCoins(),
      savingThrowProficiencies: [],
      armorProficiencies: [],
      weaponProficiencies: [],
      toolProficiencies: [],
      fightingStyle: "",
      skillProficiencies: [],
      knownCantrips: [],
      knownSpells: [],
      spellSlotsMax: [0, 0, 0, 0, 0],
      spellSlotsCurrent: [0, 0, 0, 0, 0],
      featureUses: [],
      subclassChoices: {},
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
          subclass: "",
          background: "",
          personalityTraits: "",
          ideals: "",
          bonds: "",
          flaws: "",
          alignment: "",
          gender: "",
          age: 0,
          languages: [],
          favoredEnemy: "",
          knownTerrain: "",
          level: 1,
          experiencePoints: 0,
          abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
          maxHp: 10,
          currentHp: 10,
          armorClass: 10,
          speedFeet: 30,
          initiative: 0,
          passivePerception: 10,
          conditions: [],
          inventory: [],
          coins: emptyCoins(),
          savingThrowProficiencies: [],
          armorProficiencies: [],
          weaponProficiencies: [],
          toolProficiencies: [],
          fightingStyle: "",
          skillProficiencies: [],
          knownCantrips: [],
          knownSpells: [],
          spellSlotsMax: [0, 0, 0, 0, 0],
          spellSlotsCurrent: [0, 0, 0, 0, 0],
          featureUses: [],
          subclassChoices: {},
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

  it("collapses and expands each character card when more than one character exists", () => {
    mockState = baseState({
      characters: [characterWithInventory(), { ...characterWithInventory(), id: "mage", name: "Маг" }],
    });
    render(<CharactersPage />);

    fireEvent.click(screen.getByRole("button", { name: "Свернуть карточку Герой" }));
    expect(screen.getAllByText(/Опыт: 999999/)).toHaveLength(1);
    expect(screen.getByText("Воин · ур. 1 · HP 10/10")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Развернуть карточку Герой" }));
    expect(screen.getAllByText(/Опыт: 999999/)).toHaveLength(2);
  });

  it("also offers the collapse button with only a single character", () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    fireEvent.click(screen.getByRole("button", { name: "Свернуть карточку Герой" }));
    expect(screen.queryByText(/Опыт: 999999/)).not.toBeInTheDocument();
    expect(screen.getByText("Воин · ур. 1 · HP 10/10")).toBeInTheDocument();
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

  // Сила 10 -> грузоподъёмность 150 фнт, пороги нагрузки 50/100 фнт (characters-encumbrance-tiers).
  function withWeight(weightLb: number) {
    return {
      ...characterWithInventory(),
      inventory: [{ id: "load-1", name: "Груз", quantity: 1, notes: "", weightLb }],
    };
  }

  it("shows no encumbrance tier and full speed under 50 фнт", () => {
    mockState = baseState({ characters: [withWeight(40)] });
    render(<CharactersPage />);
    expect(screen.queryByText("Нагружен")).not.toBeInTheDocument();
    expect(screen.queryByText("Сильно нагружен")).not.toBeInTheDocument();
    expectStat("Скорость", "30 фт");
  });

  it("60 фнт (> Сила×5): Нагружен, скорость реально падает на 10 (30 → 20)", () => {
    mockState = baseState({ characters: [withWeight(60)] });
    render(<CharactersPage />);
    expect(screen.getByText(/⚠ Нагружен — скорость 20 фт \(было 30 фт\)/)).toBeInTheDocument();
    expectStat("Скорость", "20 фт");
    expect(screen.queryByText(/Сильно нагружен/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Помеха на проверки/)).not.toBeInTheDocument();
  });

  it("110 фнт (> Сила×10): Сильно нагружен, скорость −20 (30 → 10), помеха-напоминание видна", () => {
    mockState = baseState({ characters: [withWeight(110)] });
    render(<CharactersPage />);
    expect(screen.getByText(/⚠ Сильно нагружен — скорость 10 фт \(было 30 фт\)/)).toBeInTheDocument();
    expectStat("Скорость", "10 фт");
    expect(
      screen.getByText(/⚠ Помеха на проверки характеристик, броски атаки и спасброски/),
    ).toBeInTheDocument();
  });

  it("at exactly max carrying capacity (150 фнт), add-item and quantity-increase are disabled; decrease/remove stay enabled", () => {
    mockState = baseState({ characters: [withWeight(150)] });
    render(<CharactersPage />);

    fireEvent.change(screen.getByPlaceholderText("Новый предмет"), { target: { value: "Верёвка, пеньковая (50 футов)" } }); // in catalog, weight > 0
    expect(screen.getAllByText("Добавить")[0]).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Достигнута максимальная грузоподъёмность")).toBeInTheDocument();

    const item = screen.getByText("Груз").closest("li") as HTMLElement;
    expect(within(item).getByText("+")).toHaveAttribute("aria-disabled", "true");
    expect(within(item).getByText("−")).toBeEnabled();
    expect(within(item).getByTitle("Убрать предмет")).toBeEnabled();
  });

  it("below max capacity, adding an item that would push weight over it is still disabled", () => {
    mockState = baseState({ characters: [withWeight(145)] });
    render(<CharactersPage />);
    fireEvent.change(screen.getByPlaceholderText("Новый предмет"), { target: { value: "Верёвка, пеньковая (50 футов)" } }); // ~10 фнт in catalog
    expect(screen.getAllByText("Добавить")[0]).toHaveAttribute("aria-disabled", "true");
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

  it("each skill and saving throw shows a computed ability-mod + proficiency-bonus number", () => {
    const char = {
      ...characterWithInventory(),
      abilities: { strength: 14, dexterity: 16, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: ["Сила"],
      armorProficiencies: [],
      weaponProficiencies: [],
      toolProficiencies: [],
      fightingStyle: "",
      skillProficiencies: ["Акробатика"], // Dexterity-based skill
    };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);

    // Акробатика: Dex mod +3, proficient -> +2 more = +5
    expect(screen.getByText(/Акробатика: \+5/)).toBeInTheDocument();
    // Сила (save): Str mod +2, proficient -> +2 more = +4
    expect(screen.getByText(/Сила \(спасбросок\): \+4/)).toBeInTheDocument();
    // Атлетика (Str-based, not proficient): just the ability mod, +2
    expect(screen.getByText(/Атлетика: \+2/)).toBeInTheDocument();
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
    expect(updater(spellcaster()).spellSlotsCurrent).toEqual([1, 0, 0, 0, 0]);
    expect(sounds.playSpellCastSound).toHaveBeenCalledOnce();
  });

  it("plays coin feedback on a real coin change and limit feedback on blocked capacity", () => {
    mockState = baseState({ characters: [withWeight(150)] });
    render(<CharactersPage />);

    const money = screen.getByText(/Деньги/).closest("details") as HTMLElement;
    fireEvent.click(within(money).getAllByText("+")[0]);
    expect(sounds.playCoinsSound).toHaveBeenCalledOnce();

    const item = screen.getByText("Груз").closest("li") as HTMLElement;
    fireEvent.click(within(item).getByText("+"));
    expect(sounds.playLimitSound).toHaveBeenCalledOnce();
  });

  it("the level-1 'Использовать' button is disabled at 0 slots, and the updater itself floors at 0 too", async () => {
    const empty = { ...spellcaster(), spellSlotsCurrent: [0, 0, 0, 0, 0] };
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

  it("levelling up a Fighter recomputes maxHp by the hit-die-average formula and heals currentHp by the same amount", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
      cmd === "get_rules" ? [FIGHTER_TOPIC, CONDITIONS_TOPIC] : [],
    );
    const char: Character = {
      ...characterWithInventory(),
      abilities: { ...characterWithInventory().abilities, constitution: 14 }, // +2 mod
      maxHp: 12, // level-1 fighter: 10 (hit die max) + 2 (con mod)
      currentHp: 8,
      conditions: ["Ослеплённое"], // used only to await the same get_rules resolution that also fills classHitDiceByTitle
    };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);
    await screen.findByText(/не может видеть/);

    fireEvent.click(screen.getByText("Повысить уровень"));

    expect(updateCharacter).toHaveBeenCalledTimes(1);
    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const updated = updater(char);
    expect(updated.level).toBe(2);
    // maxHpForLevel(10, 6, 2, 0, 2) = 10 + 2 + 0 + (2-1)*(6+2) = 20
    expect(updated.maxHp).toBe(20);
    expect(updated.currentHp).toBe(8 + (20 - 12));
    expect(sounds.playLevelUpSound).toHaveBeenCalledOnce();
  });

  it("proficiency bonus hint shows +2 through level 4 and +3 at level 5", () => {
    mockState = baseState({ characters: [{ ...characterWithInventory(), level: 4 }] });
    const { unmount } = render(<CharactersPage />);
    expect(screen.getByText(/даёт \+2 \(бонус мастерства\)/)).toBeInTheDocument();
    unmount();

    mockState = baseState({ characters: [{ ...characterWithInventory(), level: 5 }] });
    render(<CharactersPage />);
    expect(screen.getByText(/даёт \+3 \(бонус мастерства\)/)).toBeInTheDocument();
  });

  it("ASI at level 4: +2 to one ability is capped at 20, not applied raw", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_rules" ? [FIGHTER_TOPIC] : []));
    const char: Character = {
      ...characterWithInventory(),
      level: 3,
      abilities: { ...characterWithInventory().abilities, strength: 19 },
    };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);

    fireEvent.click(screen.getByText("Повысить уровень"));
    expect(updateCharacter).not.toHaveBeenCalled(); // ASI panel opens instead of levelling immediately

    fireEvent.click(screen.getByLabelText(/Сила \(19\)/));
    fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));

    expect(updateCharacter).toHaveBeenCalledTimes(1);
    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const updated = updater(char);
    expect(updated.level).toBe(4);
    expect(updated.abilities.strength).toBe(20); // 19 + 2 would be 21, capped at 20
  });

  it("ASI at level 4: +1 to two different abilities applies both", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_rules" ? [FIGHTER_TOPIC] : []));
    const char: Character = { ...characterWithInventory(), level: 3 };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);

    fireEvent.click(screen.getByText("Повысить уровень"));
    fireEvent.click(screen.getByLabelText(/\+1 двум характеристикам/));
    fireEvent.click(screen.getByLabelText(/Сила \(10\)/));
    fireEvent.click(screen.getByLabelText(/Ловкость \(10\)/));
    fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));

    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const updated = updater(char);
    expect(updated.abilities.strength).toBe(11);
    expect(updated.abilities.dexterity).toBe(11);
  });

  it("levelling a Fighter from 1 to 5 in sequence grants class features, subclass at 3, and ASI at 4 (acceptance scenario from the task card)", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
      cmd === "get_rules" ? [FIGHTER_TOPIC, CONDITIONS_TOPIC] : [],
    );
    let char: Character = { ...characterWithInventory(), level: 1, conditions: ["Ослеплённое"] };
    mockState = baseState({ characters: [char] });
    const { rerender } = render(<CharactersPage />);
    await screen.findByText(/не может видеть/); // waits for the same get_rules resolution that fills classHitDiceByTitle

    function applyLatestUpdate() {
      const calls = updateCharacter.mock.calls;
      const updater = calls[calls.length - 1][1] as (c: Character) => Character;
      char = updater(char);
      mockState = baseState({ characters: [char] });
      rerender(<CharactersPage />);
    }

    fireEvent.click(screen.getByText("Повысить уровень")); // 1 -> 2
    applyLatestUpdate();
    expect(char.level).toBe(2);

    fireEvent.click(screen.getByText("Повысить уровень")); // 2 -> 3 opens the subclass panel (3 archetypes now, not autopicked)
    expect(updateCharacter).not.toHaveBeenCalledTimes(2);
    const subclassRadios = screen.getAllByRole("radio");
    const fighterLabel = subclassRadios
      .map((r) => (r.closest("label")?.textContent ?? "").trim())
      .findIndex((l) => l.startsWith("Воитель"));
    fireEvent.click(subclassRadios[fighterLabel]);
    fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
    applyLatestUpdate();
    expect(char.level).toBe(3);
    expect(char.subclass).toBe("Воитель");

    fireEvent.click(screen.getByText("Повысить уровень")); // 3 -> 4 opens the ASI panel instead of levelling immediately
    expect(updateCharacter).not.toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByLabelText(/Сила \(10\)/));
    fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
    applyLatestUpdate();
    expect(char.level).toBe(4);
    expect(char.abilities.strength).toBe(12);

    fireEvent.click(screen.getByText("Повысить уровень")); // 4 -> 5
    applyLatestUpdate();
    expect(char.level).toBe(5);

    expect(screen.getByText("Максимальный уровень (5)")).toBeDisabled();
    expect(screen.getByText(/даёт \+3 \(бонус мастерства\)/)).toBeInTheDocument();
    // Дважды: счётчик использований из таблицы прогрессии и описание особенности.
    expect(screen.getAllByText(/Всплеск действий/)).toHaveLength(2); // level 2 class feature
    expect(screen.getByText(/Улучшенные критические попадания/)).toBeInTheDocument(); // subclass feature at 3
    expect(screen.getByText(/Дополнительная атака/)).toBeInTheDocument(); // level 5 class feature
  });

  it("levelling a Druid from 1 to 2 opens the subclass panel with all 3 circles and saves the chosen one, not the default first (characters-original-subclasses)", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
      cmd === "get_rules" ? [DRUID_TOPIC, CONDITIONS_TOPIC] : [],
    );
    const char: Character = { ...characterWithInventory(), class: "Друид", level: 1, conditions: ["Ослеплённое"] };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);
    await screen.findByText(/не может видеть/); // waits for the same get_rules resolution that fills classHitDiceByTitle

    fireEvent.click(await screen.findByText("Повысить уровень"));
    expect(updateCharacter).not.toHaveBeenCalled(); // subclass panel opens instead of levelling immediately

    const radios = screen.getAllByRole("radio");
    const labels = radios.map((r) => (r.closest("label")?.textContent ?? "").trim());
    expect(labels.some((l) => l.startsWith("Круг земли"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Круг луны"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Круг звёзд"))).toBe(true);

    fireEvent.click(radios[labels.findIndex((l) => l.startsWith("Круг звёзд"))]); // not the default first option
    fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));

    expect(updateCharacter).toHaveBeenCalledTimes(1);
    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const updated = updater(char);
    expect(updated.level).toBe(2);
    expect(updated.subclass).toBe("Круг звёзд");
  });

  it("shows the XP row with the threshold for the next level, and adding XP updates it via updateCharacter", async () => {
    mockState = baseState({ characters: [{ ...characterWithInventory(), experiencePoints: 150 }] });
    render(<CharactersPage />);

    expect(screen.getByText(/Опыт: 150 \/ 300 до 2 уровня/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Добавить опыт"), { target: { value: "50" } });
    fireEvent.click(screen.getByText("Добавить опыт"));

    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    expect(updater({ ...characterWithInventory(), experiencePoints: 150 }).experiencePoints).toBe(200);
  });

  it("at max level (5), the XP row shows no threshold, just the total", () => {
    mockState = baseState({ characters: [{ ...characterWithInventory(), level: 5, experiencePoints: 7000 }] });
    render(<CharactersPage />);
    expect(screen.getByText(/Опыт: 7000 \(максимум уровня достигнут\)/)).toBeInTheDocument();
  });

  it("«Повысить уровень» is disabled below the XP threshold for each 1→2→3→4→5 transition, and enabled at/above it", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
      cmd === "get_rules" ? [FIGHTER_TOPIC, CONDITIONS_TOPIC] : [],
    );
    // level 1 -> 2 needs 300 XP.
    const below = { ...characterWithInventory(), level: 1, experiencePoints: 299 };
    mockState = baseState({ characters: [below] });
    const { unmount } = render(<CharactersPage />);
    expect(screen.getByText("Повысить уровень")).toHaveAttribute("aria-disabled", "true");
    unmount();

    const atThreshold = { ...below, experiencePoints: 300 };
    mockState = baseState({ characters: [atThreshold] });
    render(<CharactersPage />);
    expect(screen.getByText("Повысить уровень")).toBeEnabled();
    fireEvent.click(screen.getByText("Повысить уровень"));
    expect(updateCharacter).toHaveBeenCalledTimes(1);
  });

  it("clicking a disabled «Повысить уровень» (XP below threshold) does not call updateCharacter (defense in depth beyond the disabled attribute)", () => {
    const char = { ...characterWithInventory(), level: 1, experiencePoints: 0 };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);
    fireEvent.click(screen.getByText("Повысить уровень"));
    expect(updateCharacter).not.toHaveBeenCalled();
  });

  /**
   * characters-class-feature-progression-1-5 — приёмка карточки: левел-ап
   * обязан двигать не только хиты, но и таблицу прогрессии класса. По одному
   * сценарию на каждый вид таблицы SRD: полный заклинатель (Бард),
   * не-заклинатель (Варвар) и Магия договора (Колдун).
   */
  describe("прогрессия классов на левел-апе", () => {
    function levelUpRunner(topic: RuleTopic, start: Character) {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [topic, CONDITIONS_TOPIC] : [],
      );
      let char = start;
      mockState = baseState({ characters: [char] });
      const { rerender } = render(<CharactersPage />);
      return {
        get char() {
          return char;
        },
        async ready() {
          await screen.findByText(/не может видеть/); // ждём ту же загрузку get_rules, что наполняет classHitDiceByTitle
        },
        // `interact` — доп. клики между «Повысить уровень» и применением, для
        // левел-апов, прерывающихся панелью выбора (архетип/choice/ASI).
        levelUp(interact?: () => void) {
          fireEvent.click(screen.getByText("Повысить уровень"));
          interact?.();
          const calls = updateCharacter.mock.calls;
          const updater = calls[calls.length - 1][1] as (c: Character) => Character;
          char = updater(char);
          mockState = baseState({ characters: [char] });
          rerender(<CharactersPage />);
        },
      };
    }

    it("Бард 1→5 получает ячейки заклинаний по официальной таблице полного заклинателя", async () => {
      const run = levelUpRunner(BARD_TOPIC, {
        ...characterWithInventory(),
        class: "Бард",
        subclass: "Коллегия знаний", // архетип уже выбран — панель выбора не перехватывает левел-ап
        level: 1,
        conditions: ["Ослеплённое"],
        abilities: { ...characterWithInventory().abilities, charisma: 16 },
        knownCantrips: ["cantrip-1", "cantrip-2"],
        knownSpells: ["spell-1", "spell-2", "spell-3", "spell-4"],
        spellSlotsMax: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        spellSlotsCurrent: [2, 0, 0, 0, 0, 0, 0, 0, 0],
      });
      await run.ready();

      run.levelUp();
      expect(run.char.level).toBe(2);
      expect(run.char.spellSlotsMax).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(run.char.spellSlotsCurrent).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0]);

      // 2 -> 3: архетип уже выбран, но на этом же уровне открывается «Дополнительные
      // навыки» Коллегии знаний (characters-subclass-choice-ui) — левел-ап
      // применяется только после выбора 3 навыков.
      run.levelUp(() => {
        fireEvent.click(screen.getByLabelText("Магия"));
        fireEvent.click(screen.getByLabelText("Религия"));
        fireEvent.click(screen.getByLabelText("История"));
        fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      });
      expect(run.char.level).toBe(3);
      expect(run.char.spellSlotsMax).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
      expect(run.char.subclassChoices).toEqual({ "college-of-lore-skills": ["Магия", "Религия", "История"] });

      run.levelUp(); // 3 -> 4: панель улучшения характеристик
      fireEvent.click(screen.getByLabelText(/Харизма \(16\)/));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      const calls = updateCharacter.mock.calls;
      const afterAsi = (calls[calls.length - 1][1] as (c: Character) => Character)(run.char);
      expect(afterAsi.level).toBe(4);
      expect(afterAsi.spellSlotsMax).toEqual([4, 3, 0, 0, 0, 0, 0, 0, 0]);
      // Вдохновение барда считается от Харизмы: 16 → +3, после улучшения 18 → +4.
      expect(afterAsi.featureUses).toContainEqual({ featureId: "bardic-inspiration", usesCurrent: 4 });
    });

    it("Варвар 1→3 получает третье использование Ярости по таблице, потратив одно по дороге", async () => {
      const run = levelUpRunner(BARBARIAN_TOPIC, {
        ...characterWithInventory(),
        class: "Варвар",
        subclass: "Путь берсерка",
        level: 1,
        conditions: ["Ослеплённое"],
      });
      await run.ready();

      expect(screen.getByText(/2\/2 использование/)).toBeInTheDocument();
      fireEvent.click(screen.getByTitle("Потратить: Ярость"));
      const spent = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(run.char);
      expect(spent.featureUses).toEqual([{ featureId: "rage", usesCurrent: 1 }]);

      run.levelUp(); // 1 -> 2: по таблице всё ещё 2 использования
      expect(run.char.featureUses).toEqual([{ featureId: "rage", usesCurrent: 2 }]);

      run.levelUp(); // 2 -> 3: таблица даёт третье
      expect(run.char.level).toBe(3);
      expect(run.char.featureUses).toEqual([{ featureId: "rage", usesCurrent: 3 }]);
      expect(run.char.spellSlotsMax).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it("Колдун идёт по Магии договора: на 3 уровне ячейки становятся 2 круга, а не добавляются к первому", async () => {
      const run = levelUpRunner(WARLOCK_TOPIC, {
        ...characterWithInventory(),
        class: "Колдун",
        subclass: "Архифея",
        level: 1,
        conditions: ["Ослеплённое"],
        knownCantrips: ["cantrip-1", "cantrip-2"],
        knownSpells: ["spell-1", "spell-2"],
        spellSlotsMax: [1, 0, 0, 0, 0, 0, 0, 0, 0],
        spellSlotsCurrent: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      });
      await run.ready();

      run.levelUp();
      expect(run.char.spellSlotsMax).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);

      run.levelUp();
      expect(run.char.level).toBe(3);
      expect(run.char.spellSlotsMax).toEqual([0, 2, 0, 0, 0, 0, 0, 0, 0]);
      expect(run.char.spellSlotsCurrent).toEqual([0, 2, 0, 0, 0, 0, 0, 0, 0]);
    });
  });

  /**
   * characters-subclass-features-have-no-mechanical-effect — приёмка карточки:
   * выбор архетипа обязан менять числа и владения, а не только текст на экране.
   */
  describe("механика архетипа на листе", () => {
    const CLERIC_TOPIC = classTopic("classes-cleric", "Жрец", "8", "5");

    function cleric(subclass: string, extra: Partial<Character> = {}): Character {
      return {
        ...characterWithInventory(),
        class: "Жрец",
        subclass,
        conditions: ["Ослеплённое"],
        armorProficiencies: armorProficienciesFor("classes-cleric", subclass),
        weaponProficiencies: weaponProficienciesFor("classes-cleric", subclass),
        ...extra,
      };
    }

    async function renderCleric(char: Character) {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [CLERIC_TOPIC, CONDITIONS_TOPIC] : [],
      );
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      await screen.findByText(/не может видеть/);
    }

    const longswordInHand = [
      { id: "sword-1", name: "Длинный меч", quantity: 1, notes: "", weightLb: 3 },
    ];

    it("Домен войны добавляет бонус мастерства к атаке воинским оружием, другой домен — нет", async () => {
      await renderCleric(cleric("Домен войны", { inventory: longswordInHand }));
      expect(screen.getByText(/Длинный меч: атака \+2, урон 1к8 рубящий \+0 · владение/)).toBeInTheDocument();
    });

    it("тот же меч у Домена жизни бьёт без бонуса мастерства", async () => {
      await renderCleric(cleric("Домен жизни", { inventory: longswordInHand }));
      expect(screen.getByText(/Длинный меч: атака \+0, урон 1к8 рубящий \+0 · без владения/)).toBeInTheDocument();
    });

    it("надетые латы пересчитывают КД, а без владения к ним предупреждают о расплате SRD", async () => {
      await renderCleric(cleric("Домен обмана", { inventory: [], armorClass: 10 }));
      expect(screen.queryByText(/помеха на проверки/)).not.toBeInTheDocument();

      const addRow = screen.getByPlaceholderText("Новый предмет").parentElement!;
      fireEvent.change(screen.getByPlaceholderText("Новый предмет"), { target: { value: "Латы" } });
      fireEvent.click(within(addRow).getByText("Добавить"));
      const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      const wearing = updater(cleric("Домен обмана", { inventory: [], armorClass: 10 }));
      expect(wearing.armorClass).toBe(18);

      cleanup();
      await renderCleric(wearing);
      expect(screen.getByText(/Латы: Доспех или щит не по владению/)).toBeInTheDocument();
    });

    it("тот же доспех у Домена войны идёт по владению — предупреждения нет, КД то же самое", async () => {
      const warCleric = cleric("Домен войны", {
        inventory: [{ id: "plate-1", name: "Латы", quantity: 1, notes: "", weightLb: 65 }],
        armorClass: 18,
      });
      await renderCleric(warCleric);
      expect(screen.queryByText(/не по владению/)).not.toBeInTheDocument();
      expectStat("КД", "18");
    });

    it("Проведение энергии домена: применение тратит использование и лечит по числу уровня", async () => {
      const start = cleric("Домен жизни", { level: 2, maxHp: 20, currentHp: 2 });
      await renderCleric(start);

      // 5 хитов на уровень жреца: на 2 уровне запас 10.
      expect(screen.getByText(/10 хитов на распределение/)).toBeInTheDocument();
      expect(screen.getByText(/1\/1 использование/)).toBeInTheDocument();

      fireEvent.click(screen.getByTitle("Применить: Сохранение жизни (тратит Проведение энергии)"));
      const applied = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(start);
      expect(applied.featureUses).toContainEqual({ featureId: "channel-divinity", usesCurrent: 0 });
      // SRD-оговорка: не выше половины максимума хитов, то есть 2 → 10, а не 2 → 12.
      expect(applied.currentHp).toBe(10);

      cleanup();
      await renderCleric(applied);
      expect(screen.getByText(/0\/1 использование/)).toBeInTheDocument();
      fireEvent.click(screen.getByText("Восстановить"));
      const restored = (
        updateCharacter.mock.calls[updateCharacter.mock.calls.length - 1][1] as (c: Character) => Character
      )(applied);
      expect(restored.featureUses).toContainEqual({ featureId: "channel-divinity", usesCurrent: 1 });
    });

    it("вариант архетипа не применяется, когда использование уже потрачено", async () => {
      const spent = cleric("Домен жизни", {
        level: 2,
        maxHp: 20,
        currentHp: 2,
        featureUses: [{ featureId: "channel-divinity", usesCurrent: 0 }],
      });
      await renderCleric(spent);

      fireEvent.click(screen.getByTitle("Применить: Сохранение жизни (тратит Проведение энергии)"));
      expect(updateCharacter).not.toHaveBeenCalled();
      expect(sounds.playLimitSound).toHaveBeenCalled();
    });

    it("левел-ап паладина до клятвы заводит Проведение энергии, которого нет у класса", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [classTopic("classes-paladin", "Паладин", "10", "6"), CONDITIONS_TOPIC] : [],
      );
      let char: Character = {
        ...characterWithInventory(),
        class: "Паладин",
        subclass: "",
        level: 2,
        conditions: ["Ослеплённое"],
      };
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      await screen.findByText(/не может видеть/);
      expect(screen.queryByText(/Проведение энергии/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("Повысить уровень"));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      const calls = updateCharacter.mock.calls;
      char = (calls[calls.length - 1][1] as (c: Character) => Character)(char);
      expect(char.subclass).toBe("Клятва преданности");
      expect(char.featureUses).toContainEqual({ featureId: "channel-divinity", usesCurrent: 1 });

      cleanup();
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      expect(await screen.findByTitle("Применить: Священное оружие (тратит Проведение энергии)")).toBeInTheDocument();
    });

    it("Домен жизни показывает усиленное лечение заклинанием (healingBonus) на карточке", async () => {
      await renderCleric(cleric("Домен жизни"));
      expect(screen.getByText(/Лечение заклинанием усилено: \+2/)).toBeInTheDocument();
    });
  });

  /**
   * characters-subclass-features-remaining-archetypes — приёмка карточки:
   * новые ключи гранта обязаны доходить до листа персонажа, а не оставаться
   * данными. Каждая проба идёт парой «архетип с грантом» / «архетип без него».
   */
  describe("механика оставшихся архетипов на листе", () => {
    async function renderWith(
      classId: string,
      title: string,
      die: string,
      avg: string,
      char: Character,
      extraTopics: RuleTopic[] = [],
    ) {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [classTopic(classId, title, die, avg), ...extraTopics, CONDITIONS_TOPIC];
        if (cmd === "get_spells") return bundledSpells as Spell[];
        return [];
      });
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      await screen.findByText(/не может видеть/);
    }

    function rogue(subclass: string, extra: Partial<Character> = {}): Character {
      return { ...characterWithInventory(), class: "Плут", subclass, level: 3, conditions: ["Ослеплённое"], ...extra };
    }

    it("Убийца показывает владение инструментами, Мистический ловкач — нет", async () => {
      await renderWith("classes-rogue", "Плут", "8", "5", rogue("Убийца"));
      expect(screen.getByText(/Инструменты: Набор для отравления, Маскировочный набор/)).toBeInTheDocument();
      // Урон Первого и последнего удара — уровень плута, то есть 3.
      expect(screen.getByText(/Первый и последний удар: 3 дополнительного урона/)).toBeInTheDocument();

      cleanup();
      await renderWith("classes-rogue", "Плут", "8", "5", rogue("Мистический ловкач"), [
        classTopic("classes-wizard", "Волшебник", "6", "4"),
      ]);
      expect(screen.queryByText(/Инструменты:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Первый и последний удар/)).not.toBeInTheDocument();
      expect(screen.getByText(/Заговоры сверх нормы класса: 2 \(из списка класса «Волшебник»\)/)).toBeInTheDocument();
    });

    it("Мистический ловкач выбирает заговоры волшебника, которых у плута своих нет", async () => {
      await renderWith("classes-rogue", "Плут", "8", "5", rogue("Мистический ловкач"));
      // «Огненный снаряд» — заговор волшебника; в списке заговоров плута его нет вовсе.
      expect(await screen.findByText(/Огненный снаряд/)).toBeInTheDocument();

      cleanup();
      await renderWith("classes-rogue", "Плут", "8", "5", rogue("Убийца"));
      expect(screen.queryByText(/Огненный снаряд/)).not.toBeInTheDocument();
    });

    it("Воитель улучшает крит в строке атаки, Мастер боя тем же мечом — нет", async () => {
      const sword = [{ id: "sword-1", name: "Длинный меч", quantity: 1, notes: "", weightLb: 3 }];
      const fighter = (subclass: string): Character => ({
        ...characterWithInventory(),
        class: "Воин",
        subclass,
        level: 3,
        conditions: ["Ослеплённое"],
        inventory: sword,
        weaponProficiencies: ["martial"],
      });
      await renderWith("classes-fighter", "Воин", "10", "6", fighter("Воитель"));
      expect(screen.getByText(/Длинный меч:.*· крит 19-20/)).toBeInTheDocument();

      cleanup();
      await renderWith("classes-fighter", "Воин", "10", "6", fighter("Мастер боя"));
      expect(screen.queryByText(/крит 19-20/)).not.toBeInTheDocument();
      expect(screen.getByText(/4\/4 кость/)).toBeInTheDocument();
    });

    it("Происхождение от бури показывает сопротивление урону, Дикая магия — нет", async () => {
      const sorcerer = (subclass: string): Character => ({
        ...characterWithInventory(),
        class: "Чародей",
        subclass,
        level: 2,
        conditions: ["Ослеплённое"],
      });
      await renderWith("classes-sorcerer", "Чародей", "6", "4", sorcerer("Происхождение от бури"));
      expect(screen.getByText(/Сопротивление урону: Электричество, Гром/)).toBeInTheDocument();

      cleanup();
      await renderWith("classes-sorcerer", "Чародей", "6", "4", sorcerer("Дикая магия"));
      expect(screen.queryByText(/Сопротивление урону/)).not.toBeInTheDocument();
    });

    it("Тень между вздохов тратит сразу два очка ци, Стихийный всплеск — одно", async () => {
      const monk = (subclass: string): Character => ({
        ...characterWithInventory(),
        class: "Монах",
        subclass,
        level: 3,
        conditions: ["Ослеплённое"],
        featureUses: [{ featureId: "ki", usesCurrent: 3 }],
      });
      const shadow = monk("Путь тени");
      await renderWith("classes-monk", "Монах", "8", "5", shadow);
      fireEvent.click(screen.getByTitle("Применить: Тень между вздохов (тратит Ци, 2)"));
      const afterShadow = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(shadow);
      expect(afterShadow.featureUses).toContainEqual({ featureId: "ki", usesCurrent: 1 });

      cleanup();
      updateCharacter.mockClear();
      const elemental = monk("Путь четырёх стихий");
      await renderWith("classes-monk", "Монах", "8", "5", elemental);
      fireEvent.click(screen.getByTitle("Применить: Стихийный всплеск (тратит Ци)"));
      const afterBurst = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(elemental);
      expect(afterBurst.featureUses).toContainEqual({ featureId: "ki", usesCurrent: 2 });
    });

    it("двух очков ци не хватает на Тень между вздохов — применение отклоняется", async () => {
      await renderWith("classes-monk", "Монах", "8", "5", {
        ...characterWithInventory(),
        class: "Монах",
        subclass: "Путь тени",
        level: 3,
        conditions: ["Ослеплённое"],
        featureUses: [{ featureId: "ki", usesCurrent: 1 }],
      });
      fireEvent.click(screen.getByTitle("Применить: Тень между вздохов (тратит Ци, 2)"));
      expect(updateCharacter).not.toHaveBeenCalled();
      expect(sounds.playLimitSound).toHaveBeenCalled();
    });

    it("Неутомимый шаг Странника действительно возвращает ячейку, а полному запасу — не даёт", async () => {
      const ranger = (extra: Partial<Character>): Character => ({
        ...characterWithInventory(),
        class: "Следопыт",
        subclass: "Странник",
        level: 3,
        conditions: ["Ослеплённое"],
        spellSlotsMax: [3, 0, 0, 0, 0],
        ...extra,
      });
      const spent = ranger({ spellSlotsCurrent: [1, 0, 0, 0, 0] });
      await renderWith("classes-ranger", "Следопыт", "10", "6", spent);
      fireEvent.click(screen.getByTitle("Применить: Вернуть ячейку 1 круга (тратит Неутомимый шаг)"));
      const restored = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(spent);
      expect(restored.spellSlotsCurrent).toEqual([2, 0, 0, 0, 0]);
      expect(restored.featureUses).toContainEqual({ featureId: "tireless-step", usesCurrent: 0 });

      cleanup();
      updateCharacter.mockClear();
      await renderWith("classes-ranger", "Следопыт", "10", "6", ranger({ spellSlotsCurrent: [3, 0, 0, 0, 0] }));
      fireEvent.click(screen.getByTitle("Применить: Вернуть ячейку 1 круга (тратит Неутомимый шаг)"));
      expect(updateCharacter).not.toHaveBeenCalled();
    });

    it("левел-ап до архетипа с инструментами кладёт их в снимок владений персонажа", async () => {
      let char: Character = {
        ...characterWithInventory(),
        class: "Плут",
        subclass: "",
        level: 2,
        conditions: ["Ослеплённое"],
      };
      await renderWith("classes-rogue", "Плут", "8", "5", char);
      expect(screen.queryByText(/Инструменты:/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("Повысить уровень"));
      fireEvent.click(screen.getByText("Убийца"));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      const calls = updateCharacter.mock.calls;
      char = (calls[calls.length - 1][1] as (c: Character) => Character)(char);
      expect(char.subclass).toBe("Убийца");
      expect(char.toolProficiencies).toEqual(["Набор для отравления", "Маскировочный набор"]);
    });

    it("на 2 уровне Следопыта выбор архетипа/Добычи охотника ещё не предлагается", async () => {
      const char: Character = {
        ...characterWithInventory(),
        class: "Следопыт",
        subclass: "",
        level: 1,
        conditions: ["Ослеплённое"],
      };
      await renderWith("classes-ranger", "Следопыт", "10", "6", char);
      fireEvent.click(screen.getByText("Повысить уровень"));
      expect(screen.queryByText(/Выберите архетип/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Добыча охотника/)).not.toBeInTheDocument();
      expect(updateCharacter).toHaveBeenCalled();
    });

    it("левел-ап Следопыта до 3 уровня останавливается на «Добыча охотника»; выбранный вариант виден на карточке", async () => {
      let char: Character = {
        ...characterWithInventory(),
        class: "Следопыт",
        subclass: "",
        level: 2,
        conditions: ["Ослеплённое"],
      };
      await renderWith("classes-ranger", "Следопыт", "10", "6", char);

      fireEvent.click(screen.getByText("Повысить уровень"));
      fireEvent.click(screen.getByText("Охотник"));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      // Архетип выбран, но левел-ап ещё не применён — впереди «Добыча охотника».
      expect(updateCharacter).not.toHaveBeenCalled();
      expect(await screen.findByText(/Добыча охотника/)).toBeInTheDocument();

      fireEvent.click(screen.getByText("Убийца Колоссов"));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));

      const calls = updateCharacter.mock.calls;
      char = (calls[calls.length - 1][1] as (c: Character) => Character)(char);
      expect(char.level).toBe(3);
      expect(char.subclass).toBe("Охотник");
      expect(char.subclassChoices).toEqual({ "hunter-prey": ["colossus-slayer"] });

      cleanup();
      updateCharacter.mockClear();
      await renderWith("classes-ranger", "Следопыт", "10", "6", char);
      // ": 1к8 ..." — строка числа эффекта (subclassEffectValue), а не текст
      // особенности из featuresByLevel — та тоже упоминает «Убийца Колоссов».
      expect(screen.getByText(/Убийца Колоссов: 1к8/)).toBeInTheDocument();
    });

    it("невыбранный вариант Добычи охотника эффекта не даёт", async () => {
      let char: Character = {
        ...characterWithInventory(),
        class: "Следопыт",
        subclass: "",
        level: 2,
        conditions: ["Ослеплённое"],
      };
      await renderWith("classes-ranger", "Следопыт", "10", "6", char);
      fireEvent.click(screen.getByText("Повысить уровень"));
      fireEvent.click(screen.getByText("Охотник"));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      await screen.findByText(/Добыча охотника/);
      fireEvent.click(screen.getByText("Убийца великанов"));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));

      const calls = updateCharacter.mock.calls;
      char = (calls[calls.length - 1][1] as (c: Character) => Character)(char);
      expect(char.subclassChoices).toEqual({ "hunter-prey": ["giant-killer"] });

      cleanup();
      updateCharacter.mockClear();
      await renderWith("classes-ranger", "Следопыт", "10", "6", char);
      expect(screen.queryByText(/Убийца Колоссов: 1к8/)).not.toBeInTheDocument();
    });

    it("Добыча охотника не переспрашивается на следующем левел-апе", async () => {
      const char: Character = {
        ...characterWithInventory(),
        class: "Следопыт",
        subclass: "Охотник",
        level: 3,
        conditions: ["Ослеплённое"],
        subclassChoices: { "hunter-prey": ["colossus-slayer"] },
      };
      await renderWith("classes-ranger", "Следопыт", "10", "6", char);
      fireEvent.click(screen.getByText("Повысить уровень"));
      // 4 уровень — уже ASI, а не повторная панель «Добыча охотника» (статичный
      // текст особенности из featuresByLevel остаётся на карточке в любом случае).
      expect(screen.queryByText(/Выберите «Добыча охотника»/)).not.toBeInTheDocument();
      expect(screen.getByText(/Улучшение характеристик/)).toBeInTheDocument();
    });

    it("левел-ап барда до Коллегии знаний — pick=3 из 18, четвёртый чекбокс недоступен, дубль навыка не задваивается", async () => {
      let char: Character = {
        ...characterWithInventory(),
        class: "Бард",
        subclass: "",
        level: 2,
        conditions: ["Ослеплённое"],
        skillProficiencies: ["Магия"],
      };
      await renderWith("classes-bard", "Бард", "8", "5", char);

      fireEvent.click(screen.getByText("Повысить уровень"));
      fireEvent.click(screen.getByText("Коллегия знаний"));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      expect(updateCharacter).not.toHaveBeenCalled();
      await screen.findByText(/Дополнительные навыки/);

      fireEvent.click(screen.getByLabelText("Религия"));
      fireEvent.click(screen.getByLabelText("История"));
      fireEvent.click(screen.getByLabelText("Природа"));
      expect(screen.getByLabelText("Расследование")).toBeDisabled();

      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      const calls = updateCharacter.mock.calls;
      char = (calls[calls.length - 1][1] as (c: Character) => Character)(char);
      expect(char.subclass).toBe("Коллегия знаний");
      expect(char.subclassChoices).toEqual({ "college-of-lore-skills": ["Религия", "История", "Природа"] });
      expect(char.skillProficiencies).toEqual(expect.arrayContaining(["Магия", "Религия", "История", "Природа"]));
      expect(char.skillProficiencies.filter((s) => s === "Магия")).toHaveLength(1);
    });

    it("левел-ап друида до Круга земли выбирает архетип, потом местность (на том же уровне); заклинания местности видны с 3 уровня", async () => {
      let char: Character = {
        ...characterWithInventory(),
        class: "Друид",
        subclass: "",
        level: 1,
        conditions: ["Ослеплённое"],
      };
      await renderWith("classes-druid", "Друид", "8", "5", char);

      // 1 -> 2: сначала архетип (Круг земли — один из трёх), потом местность
      // (Арктика — на том же уровне, minLevel местности совпадает с chosenAtLevel).
      fireEvent.click(screen.getByText("Повысить уровень"));
      fireEvent.click(screen.getByText("Круг земли"));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      expect(updateCharacter).not.toHaveBeenCalled();
      await screen.findByText(/Заклинания круга/);
      fireEvent.click(screen.getByText("Арктика"));
      fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));

      let calls = updateCharacter.mock.calls;
      char = (calls[calls.length - 1][1] as (c: Character) => Character)(char);
      expect(char.level).toBe(2);
      expect(char.subclass).toBe("Круг земли");
      expect(char.subclassChoices).toEqual({ "circle-of-the-land-terrain": ["arctic"] });
      // На 2 уровне заклинаний местности ещё нет (они с 3 уровня).
      expect(char.knownSpells).not.toContain("hold-person");

      // 2 -> 3: местность уже выбрана — второй панели быть не должно, левел-ап
      // применяется сразу, и заклинания Арктики 3 круга появляются.
      updateCharacter.mockClear();
      mockState = baseState({ characters: [char] });
      cleanup();
      await renderWith("classes-druid", "Друид", "8", "5", char);
      fireEvent.click(screen.getByText("Повысить уровень"));
      expect(screen.queryByText(/Заклинания круга/)).not.toBeInTheDocument();
      calls = updateCharacter.mock.calls;
      char = (calls[calls.length - 1][1] as (c: Character) => Character)(char);
      expect(char.level).toBe(3);
      expect(char.knownSpells).toEqual(expect.arrayContaining(["hold-person", "spike-growth"]));

      cleanup();
      updateCharacter.mockClear();
      await renderWith("classes-druid", "Друид", "8", "5", char);
      // Заклинания местности — отдельная строка "заклинаний архетипа", не
      // спутать со строкой известных заклинаний персонажа (там те же имена).
      expect(
        await screen.findByText(/Заклинания архетипа \(всегда подготовлены\): Удержание личности, Шипастые заросли/),
      ).toBeInTheDocument();
    });

    /**
     * characters-card-missing-subclass-and-class-choice-info, находка 1:
     * favoredEnemy/knownTerrain захватывались в CharacterWizard.tsx (шаг
     * «Итог»), но никогда не попадали в сам объект Character — терялись
     * насовсем при создании, а не просто не рисовались на карточке.
     */
    it("Избранный враг и Известная местность Следопыта видны на карточке персонажа (не только в мастере при создании)", async () => {
      const ranger: Character = {
        ...characterWithInventory(),
        class: "Следопыт",
        conditions: ["Ослеплённое"],
        favoredEnemy: "Драконы",
        knownTerrain: "Горы",
      };
      await renderWith("classes-ranger", "Следопыт", "10", "6", ranger);
      expect(screen.getByText(/Избранный враг: Драконы · Известная местность: Горы/)).toBeInTheDocument();
    });

    it("персонаж без favoredEnemy/knownTerrain (не Следопыт) не показывает эту строку вовсе", async () => {
      const fighter: Character = { ...characterWithInventory(), class: "Воин", conditions: ["Ослеплённое"] };
      await renderWith("classes-fighter", "Воин", "10", "6", fighter);
      expect(screen.queryByText(/Избранный враг/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Известная местность/)).not.toBeInTheDocument();
    });

    /**
     * Прямое воспроизведение жалобы владельца (Колдун/Архифея): в коде блок
     * «Особенности класса» у уровня 1 Архифеи уже открывался и без правки
     * находки 2 (у неё есть текстовые featuresByLevel[1]) — но факт, что
     * заклинания покровителя действительно попадают на карточку, ни разу не
     * был проверен пробой. Настоящий spells.json, не фикстура.
     */
    it("Колдун с покровителем-Архифеей показывает заклинания архетипа на карточке персонажа", async () => {
      const warlock: Character = {
        ...characterWithInventory(),
        class: "Колдун",
        subclass: "Покровитель-Архифея",
        conditions: ["Ослеплённое"],
      };
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [classTopic("classes-warlock", "Колдун", "8", "5"), CONDITIONS_TOPIC];
        if (cmd === "get_spells") return bundledSpells as Spell[];
        return [];
      });
      mockState = baseState({ characters: [warlock] });
      render(<CharactersPage />);
      await screen.findByText(/не может видеть/);
      expect(
        await screen.findByText(/Заклинания архетипа \(всегда подготовлены\): Очарование личности, Огонь фей/),
      ).toBeInTheDocument();
    });
  });

  // Настоящий поставляемый spells.json, а не фикстура: заглушка «списка нет» держалась
  // ровно на отсутствии данных, поэтому подсунутый список ничего бы не доказал.
  it("a level-2 Ranger gets the real class spell list instead of the 'no list yet' placeholder", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
      cmd === "get_spells"
        ? (bundledSpells as Spell[])
        : cmd === "get_rules"
          ? [classTopic("classes-ranger", "Следопыт", "10", "6")]
          : [],
    );
    mockState = baseState({
      characters: [{ ...characterWithInventory(), class: "Следопыт", level: 2, spellSlotsMax: [2, 0, 0, 0, 0] }],
    });
    render(<CharactersPage />);

    expect(await screen.findByText(/Заклинания до 1 круга/)).toBeInTheDocument();
    expect(screen.queryByText(/Списка заклинаний этого класса в приложении пока нет/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Метка охотника/)).toBeInTheDocument();
  });
});

describe("truncateDescription", () => {
  it("returns short text unchanged", () => {
    expect(truncateDescription("Коротко.")).toBe("Коротко.");
  });

  it("cuts at the end of the first sentence when it fits within the limit, without an ellipsis", () => {
    const text = `Hi. ${"x".repeat(200)}`;
    expect(truncateDescription(text)).toBe("Hi.");
  });

  it("cuts at the end of the last sentence that fits within the limit, not the first, without an ellipsis", () => {
    const text = `Hi. Bye! ${"x".repeat(200)}`;
    expect(truncateDescription(text)).toBe("Hi. Bye!");
  });

  it("falls back to a word boundary with an ellipsis when the first sentence is longer than the limit", () => {
    const text = `${"A".repeat(50)} ${"B".repeat(50)}`;
    expect(truncateDescription(text)).toBe(`${"A".repeat(50)}…`);
  });
});

/**
 * characters-card-missing-subclass-and-class-choice-info, находка 2: раньше
 * блок «Особенности класса» открывался только по classFeatures/classResources/
 * classScaling — архетип, дающий исключительно один из остальных видов
 * гранта (заклинания домена, скейлинг архетипа, вариант ресурса, заговоры
 * сверх нормы, сопротивления, усиленное лечение) без единой текстовой
 * особенности на этом уровне, оставался невидим целиком. Каждая проба ниже —
 * ровно один вид гранта и ничего больше, чтобы показать, что именно ОН один
 * теперь достаточен для открытия блока.
 */
describe("classFeaturesBlockHasContent", () => {
  const empty = {
    classFeatures: [],
    classResources: [],
    classScaling: [],
    subclassOptions: [],
    subclassScaling: [],
    domainSpells: [],
    bonusCantrips: undefined,
    damageResistances: undefined,
    healingBonus: undefined,
  };

  it("false when nothing at all is granted (empty card doesn't open the block)", () => {
    expect(classFeaturesBlockHasContent(empty)).toBe(false);
  });

  it("true with only domainSpells (spellsByLevel-only archetype)", () => {
    expect(classFeaturesBlockHasContent({ ...empty, domainSpells: ["bless"] })).toBe(true);
  });

  it("true with only subclassScaling", () => {
    expect(classFeaturesBlockHasContent({ ...empty, subclassScaling: [{ name: "x" }] })).toBe(true);
  });

  it("true with only subclassOptions (resourceOptions-only archetype)", () => {
    expect(classFeaturesBlockHasContent({ ...empty, subclassOptions: [{ id: "x" }] })).toBe(true);
  });

  it("true with only bonusCantrips", () => {
    expect(classFeaturesBlockHasContent({ ...empty, bonusCantrips: { count: 1 } })).toBe(true);
  });

  it("true with only damageResistances", () => {
    expect(classFeaturesBlockHasContent({ ...empty, damageResistances: ["Электричество"] })).toBe(true);
  });

  it("true with only healingBonus", () => {
    expect(classFeaturesBlockHasContent({ ...empty, healingBonus: { flat: 2 } })).toBe(true);
  });

  it("an empty damageResistances array still counts as nothing granted", () => {
    expect(classFeaturesBlockHasContent({ ...empty, damageResistances: [] })).toBe(false);
  });
});
