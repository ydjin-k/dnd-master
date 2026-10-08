import { describe, it, expect, vi, beforeEach } from "vitest";
import bundledSpells from "../../../src-tauri/rules/spells.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import { act, cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import {
  CharactersPage,
  truncateDescription,
  classFeaturesBlockHasContent,
  clampCurrentHp,
  withExhaustionReduced,
} from "./CharactersPage";
import { armorProficienciesFor, proficiencyBonusForLevel, weaponProficienciesFor } from "../characterCreationData";
import { DEATH_SAVE_EXPRESSION, deathSaveRollLabel } from "../deathSaves";
import { WILD_MAGIC_DIE, WILD_MAGIC_TABLE } from "../wildMagicSurges";
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

/**
 * Журнал бросков подменяется так же, как кампания выше: страница рендерится
 * без провайдеров, а `useDiceLog` вне провайдера бросает намеренно. Нужен здесь
 * только `recordRoll` — единственное, что лист персонажа в журнал вызывает
 * (characters-zero-hp-hint).
 */
const recordRoll = vi.fn();
vi.mock("../../state/DiceLogContext", () => ({
  useDiceLog: () => ({
    log: [],
    recordRoll,
    recordRollError: vi.fn(),
    recordManual: vi.fn(),
    clearLog: vi.fn(),
  }),
}));

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, addCharacter, removeCharacter, updateCharacter }),
}));

function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    travel: null,
    id: "c1",
    campaignName: "Тест",
    characters: [],
    journal: [],
    combat: null,
    engine: null,
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
    recordRoll.mockClear();
    Object.values(sounds).forEach((sound) => sound.mockClear());
    window.confirm = vi.fn(() => true);
    vi.mocked(invoke).mockImplementation(async () => []);
  });

  function spellcaster(): CampaignState["characters"][number] {
    return {
      ...characterWithInventory(),
      knownCantrips: ["cantrip-1"],
      castableSpells: ["spell-1"],
      spellSlotsMax: [2, 0, 0, 0, 0],
      spellSlotsCurrent: [2, 0, 0, 0, 0],
    };
  }

  function characterWithInventory(): CampaignState["characters"][number] {
    return {
      halfDaysWithoutFood: 0,
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
      portraitVariant: 0,
      age: 0,
      height: "",
      weight: "",
      eyes: "",
      skin: "",
      hair: "",
      appearance: "",
      backstory: "",
      allies: "",
      treasures: "",
      languages: [],
      raceVariant: "",
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
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      hitDiceSpent: 0,
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
      castableSpells: [],
      spellbook: [],
      spellSlotsMax: [0, 0, 0, 0, 0],
      spellSlotsCurrent: [0, 0, 0, 0, 0],
      featureUses: [],
      subclassChoices: {},
      classChoices: {},
      feats: [],
    };
  }

  /**
   * Прогон левел-апа: рендерит карточку, жмёт «Повысить уровень» и применяет
   * полученный updater к персонажу, оставаясь на одном и том же состоянии —
   * так проверяются цепочки из нескольких уровней подряд.
   */
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

  it("показывает первый портрет персонажу из старого сохранения без выбранного варианта", () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    expect(screen.getByRole("img", { name: /Портрет персонажа Герой/ })).toHaveAttribute(
      "src",
      "/character-portraits/human-male-1.jpg",
    );
  });

  it("deletes a character after confirmation without crashing", async () => {
    mockState = baseState({
      characters: [
        {
          halfDaysWithoutFood: 0,
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
          portraitVariant: 0,
          age: 0,
          height: "",
          weight: "",
          eyes: "",
          skin: "",
          hair: "",
          appearance: "",
          backstory: "",
          allies: "",
          treasures: "",
          languages: [],
          raceVariant: "",
          favoredEnemy: "",
          knownTerrain: "",
          level: 1,
          experiencePoints: 0,
          abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
          maxHp: 10,
          currentHp: 10,
          deathSaveSuccesses: 0,
          deathSaveFailures: 0,
          hitDiceSpent: 0,
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
          castableSpells: [],
          spellbook: [],
          spellSlotsMax: [0, 0, 0, 0, 0],
          spellSlotsCurrent: [0, 0, 0, 0, 0],
          featureUses: [],
          subclassChoices: {},
          classChoices: {},
          feats: [],
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
    expect(screen.getAllByText("Человек · Воин · ур. 1")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Развернуть карточку Герой" }));
    expect(screen.getAllByText(/Опыт: 999999/)).toHaveLength(2);
  });

  it("also offers the collapse button with only a single character", () => {
    mockState = baseState({ characters: [characterWithInventory()] });
    render(<CharactersPage />);

    fireEvent.click(screen.getByRole("button", { name: "Свернуть карточку Герой" }));
    expect(screen.queryByText(/Опыт: 999999/)).not.toBeInTheDocument();
    expect(screen.getByText("Человек · Воин · ур. 1")).toBeInTheDocument();
  });

  it("keeps the full summary before stats while hiding the collapsed card body", () => {
    mockState = baseState({
      characters: [{
        ...characterWithInventory(),
        subclass: "Мастер боя",
        background: "Солдат",
        alignment: "Нейтральный",
        gender: "Мужской",
        portraitVariant: 1,
        age: 30,
        height: "",
        weight: "",
        eyes: "",
        skin: "",
        hair: "",
        appearance: "",
        backstory: "",
        allies: "",
        treasures: "",
        languages: ["Общий", "Дварфийский"],
      }],
    });
    render(<CharactersPage />);

    const card = screen.getByText("Герой").closest(".character-card") as HTMLElement;
    const languages = within(card).getByText("Языки: Общий, Дварфийский");
    const stats = card.querySelector(".character-card__hp") as HTMLElement;
    expect(languages.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(within(card).getByRole("button", { name: "Свернуть карточку Герой" }));
    expect(within(card).getByText("Человек · Воин (Мастер боя) · Солдат · ур. 1 · Нейтральный · Мужской · 30 л.")).toBeInTheDocument();
    expect(within(card).getByText("Языки: Общий, Дварфийский")).toBeInTheDocument();
    expect(within(stats).getAllByRole("term")).toHaveLength(6);
    expect(within(stats).getAllByRole("definition")).toHaveLength(6);
    expect(within(card).queryByText(/Инвентарь/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Классовые особенности/)).not.toBeInTheDocument();
  });

  /**
   * Ручная правка хитов на листе (combat-damage-reaches-character-sheet).
   * Владелец `currentHp` один и это игрок: бой в лист не пишет, хиты игрок
   * уменьшает сам — прямой правкой числа в плитке HP.
   */
  describe("текущие хиты правит игрок руками", () => {
    /** Поле хитов и то, что в персонаже после последней правки. */
    function hpField() {
      return screen.getByLabelText("Текущие хиты: Герой") as HTMLInputElement;
    }

    function lastUpdate(start: Character): Character {
      const calls = updateCharacter.mock.calls;
      const updater = calls[calls.length - 1][1] as (c: Character) => Character;
      return updater(start);
    }

    it("игрок уменьшает хиты прямой правкой числа, и правка уезжает в персонажа сразу", () => {
      const hero = characterWithInventory(); // maxHp 10, currentHp 10
      mockState = baseState({ characters: [hero] });
      render(<CharactersPage />);

      expect(hpField().value).toBe("10");
      fireEvent.change(hpField(), { target: { value: "3" } });

      // Сразу, без отдельного «Применить»: у соседних полей листа его нет.
      expect(updateCharacter).toHaveBeenCalledTimes(1);
      expect(updateCharacter.mock.calls[0][0]).toBe("hero");
      expect(lastUpdate(hero).currentHp).toBe(3);
    });

    it("ниже нуля хиты не уходят: набранное «-4» становится нулём", () => {
      const hero = characterWithInventory();
      mockState = baseState({ characters: [hero] });
      render(<CharactersPage />);

      fireEvent.change(hpField(), { target: { value: "-4" } });

      expect(lastUpdate(hero).currentHp).toBe(0);
      // Показанное не расходится с записанным.
      expect(hpField().value).toBe("0");
    });

    it("выше максимума хиты не уходят: набранное «99» становится maxHp", () => {
      const hero = characterWithInventory();
      mockState = baseState({ characters: [hero] });
      render(<CharactersPage />);

      fireEvent.change(hpField(), { target: { value: "99" } });

      expect(lastUpdate(hero).currentHp).toBe(10);
      expect(hpField().value).toBe("10");
    });

    it("пустое поле в персонажа не пишется, а уход из него возвращает прежнее число", () => {
      const hero = characterWithInventory();
      mockState = baseState({ characters: [hero] });
      render(<CharactersPage />);

      fireEvent.change(hpField(), { target: { value: "" } });

      // Стереть число, чтобы набрать новое, — не то же самое, что «ноль хитов».
      expect(updateCharacter).not.toHaveBeenCalled();
      expect(hpField().value).toBe("");

      fireEvent.blur(hpField());
      expect(hpField().value).toBe("10");
      expect(updateCharacter).not.toHaveBeenCalled();
    });

    it("хиты на листе переживают перезапуск: правка уходит в сохраняемого персонажа целиком", () => {
      const hero = characterWithInventory();
      mockState = baseState({ characters: [hero] });
      render(<CharactersPage />);

      fireEvent.change(hpField(), { target: { value: "4" } });
      const saved = lastUpdate(hero);

      // Ровно этот объект уезжает в `save_campaign` через updateCharacter —
      // тронут только currentHp, остальной лист цел.
      expect(saved.currentHp).toBe(4);
      expect(saved.maxHp).toBe(10);
      expect(saved.inventory).toEqual(hero.inventory);

      // Перезапуск = загрузка сохранённого персонажа заново.
      mockState = baseState({ characters: [saved] });
      cleanup();
      render(<CharactersPage />);
      expect(hpField().value).toBe("4");
    });
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

  // Сила 10 -> грузоподъёмность 150 фнт; пороги свои, не книжные: «Нагружен» с 135 фнт
  // (90 % грузоподъёмности), «Сильно нагружен» — свыше 150 (characters-encumbrance-own-thresholds).
  const withWeight = (weightLb: number) => withLoad(weightLb, 10);

  it("shows no encumbrance tier and full speed under 135 фнт (90 % грузоподъёмности)", () => {
    mockState = baseState({ characters: [withWeight(134)] });
    render(<CharactersPage />);
    expect(screen.queryByText("Нагружен")).not.toBeInTheDocument();
    expect(screen.queryByText("Сильно нагружен")).not.toBeInTheDocument();
    expectStat("Скорость", "30 фт");
  });

  it("135 фнт (ровно 90 %): Нагружен, скорость реально падает на 10 (30 → 20)", () => {
    mockState = baseState({ characters: [withWeight(135)] });
    render(<CharactersPage />);
    expect(screen.getByText(/⚠ Нагружен — скорость 20 фт \(было 30 фт\)/)).toBeInTheDocument();
    expectStat("Скорость", "20 фт");
    expect(screen.queryByText(/⚠ Сильно нагружен/)).not.toBeInTheDocument(); // плашка, а не строка порогов
    expect(screen.queryByText(/Помеха на проверки/)).not.toBeInTheDocument();
  });

  it("ровно на потолке (150 фнт) — ещё Нагружен, но не Сильно: потолок сам по себе не перевес", () => {
    mockState = baseState({ characters: [withWeight(150)] });
    render(<CharactersPage />);
    expect(screen.getByText(/⚠ Нагружен — скорость 20 фт \(было 30 фт\)/)).toBeInTheDocument();
    expect(screen.queryByText(/⚠ Сильно нагружен/)).not.toBeInTheDocument(); // плашка, а не строка порогов
  });

  it("151 фнт (фунт сверх потолка): Сильно нагружен, скорость −20 (30 → 10), помеха-напоминание видна", () => {
    mockState = baseState({ characters: [withWeight(151)] });
    render(<CharactersPage />);
    expect(screen.getByText(/⚠ Сильно нагружен — скорость 10 фт \(было 30 фт\)/)).toBeInTheDocument();
    expectStat("Скорость", "10 фт");
    expect(
      screen.getByText(/⚠ Помеха на проверки характеристик, броски атаки и спасброски/),
    ).toBeInTheDocument();
  });

  it("на потолке (150 фнт) добавление не запрещено: кнопки живые, стоит предупреждение о перевесе", () => {
    mockState = baseState({ characters: [withWeight(150)] });
    render(<CharactersPage />);

    fireEvent.change(screen.getByPlaceholderText("Новый предмет"), { target: { value: "Верёвка, пеньковая (50 футов)" } }); // in catalog, weight > 0
    expect(screen.getAllByText("Добавить")[0]).not.toHaveAttribute("aria-disabled");
    expect(screen.getByText("Перевес: станет «Сильно нагружен»")).toBeInTheDocument();

    const item = screen.getByText("Груз").closest("li") as HTMLElement;
    expect(within(item).getByText("+")).not.toHaveAttribute("aria-disabled");
    expect(within(item).getByText("−")).toBeEnabled();
    expect(within(item).getByTitle("Убрать предмет")).toBeEnabled();
  });

  it("предмет, уводящий в перевес, реально добавляется — иначе третья ступень недостижима", () => {
    mockState = baseState({ characters: [withWeight(145)] });
    render(<CharactersPage />);
    fireEvent.change(screen.getByPlaceholderText("Новый предмет"), { target: { value: "Верёвка, пеньковая (50 футов)" } }); // ~10 фнт in catalog
    const addButton = screen.getAllByText("Добавить")[0];
    expect(addButton).not.toHaveAttribute("aria-disabled");

    fireEvent.click(addButton);
    const applied = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(withWeight(145));
    expect(applied.inventory.map((i) => i.name)).toContain("Верёвка, пеньковая (50 футов)");
    expect(applied.inventory.reduce((sum, i) => sum + i.weightLb * i.quantity, 0)).toBeGreaterThan(150);
    // Перевес перестал быть запретом — звука предела здесь быть не должно.
    expect(sounds.playLimitSound).not.toHaveBeenCalled();
  });

  // ── порог виден числом (characters-encumbrance-threshold-visible) ──────────────

  function withLoad(weightLb: number, strength: number) {
    const base = characterWithInventory();
    return {
      ...base,
      abilities: { ...base.abilities, strength },
      inventory: [{ id: "load-1", name: "Груз", quantity: 1, notes: "", weightLb }],
    };
  }

  /** Читает два порога С ЭКРАНА — в пробу они не вписаны. */
  function shownThresholds(strength: number) {
    mockState = baseState({ characters: [withLoad(0, strength)] });
    render(<CharactersPage />);
    const text = screen.getByText(/^Нагружен с /).textContent ?? "";
    cleanup();
    const m = text.match(/Нагружен с ([\d.]+) фнт\. · Сильно нагружен свыше ([\d.]+) фнт\./);
    expect(m, `не разобралась строка порогов: ${text}`).not.toBeNull();
    return { encumberedFrom: Number(m![1]), heavilyAbove: Number(m![2]) };
  }

  /** Что на самом деле показывает плашка при таком весе. */
  function tierAt(weightLb: number, strength: number) {
    mockState = baseState({ characters: [withLoad(weightLb, strength)] });
    render(<CharactersPage />);
    const heavy = screen.queryByText(/⚠ Сильно нагружен/) !== null;
    const enc = screen.queryByText(/⚠ Нагружен/) !== null;
    cleanup();
    return heavy ? "heavily-encumbered" : enc ? "encumbered" : "normal";
  }

  /**
   * Главная проба карточки: показанное число и момент смены плашки — один
   * и тот же вес. Ни одно число сюда не вписано: границы читаются с экрана,
   * поведение — рендерами вокруг них. Сдвинь сравнение в encumbranceLevel — проба
   * краснеет, хотя разметка не менялась (сами 90 % и потолок прибиты
   * числами в characterCreationData.test.ts — там они решение владельца).
   */
  it.each([10, 13, 15])("показанный порог совпадает с тем, где реально меняется плашка (Сила %i)", (strength) => {
    const { encumberedFrom, heavilyAbove } = shownThresholds(strength);

    expect(tierAt(encumberedFrom - 0.1, strength)).toBe("normal");
    expect(tierAt(encumberedFrom, strength)).toBe("encumbered");
    expect(tierAt(heavilyAbove, strength)).toBe("encumbered");
    expect(tierAt(heavilyAbove + 0.1, strength)).toBe("heavily-encumbered");
  });

  it("нечётная Сила 13: полфунта показаны, а не спрятаны округлением", () => {
    mockState = baseState({ characters: [withLoad(0, 13)] });
    render(<CharactersPage />);
    expect(
      screen.getByText("Нагружен с 175.5 фнт. · Сильно нагружен свыше 195 фнт."),
    ).toBeInTheDocument();
  });

  // Границы из DoD карточки при Силе 10: 134 / 135 / 150 / 151 фнт.
  it.each([
    [134, "normal"],
    [135, "encumbered"],
    [150, "encumbered"],
    [151, "heavily-encumbered"],
  ])("Сила 10, %i фнт — плашка согласна с показанными 135 / свыше 150", (weightLb, tier) => {
    expect(shownThresholds(10)).toEqual({ encumberedFrom: 135, heavilyAbove: 150 });
    expect(tierAt(weightLb as number, 10)).toBe(tier);
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
    fireEvent.click(useButtons[0]); // only group with a button now is castableSpells (level 1)

    expect(updateCharacter).toHaveBeenCalledTimes(1);
    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    expect(updater(spellcaster()).spellSlotsCurrent).toEqual([1, 0, 0, 0, 0]);
    expect(sounds.playSpellCastSound).toHaveBeenCalledOnce();
  });

  it("plays coin feedback on a real coin change; going over capacity is no longer a limit", () => {
    mockState = baseState({ characters: [withWeight(150)] });
    render(<CharactersPage />);

    const money = screen.getByText(/Деньги/).closest("details") as HTMLElement;
    fireEvent.click(within(money).getAllByText("+")[0]);
    expect(sounds.playCoinsSound).toHaveBeenCalledOnce();

    const item = screen.getByText("Груз").closest("li") as HTMLElement;
    fireEvent.click(within(item).getByText("+"));
    expect(sounds.playLimitSound).not.toHaveBeenCalled();
    const updater = updateCharacter.mock.calls[updateCharacter.mock.calls.length - 1][1] as (
      c: Character,
    ) => Character;
    expect(updater(withWeight(150)).inventory[0].quantity).toBe(2);
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

  /**
   * characters-spell-slot-partial-restore: возврат ячеек по кругу и по числу.
   * Предел «не выше максимума» живёт в `spellSlots.ts` и проверяется там же
   * отрицательными пробами; здесь — что строка круга действительно даёт
   * вернуть ровно столько, сколько набрано, и не трогает соседние круги.
   */
  describe("частичный возврат ячеек по кругам", () => {
    /** Два круга: 1-й полон (2/2), во 2-м потрачено две из трёх — 1/3. */
    function twoCircles(overrides: Partial<Character> = {}): Character {
      return {
        ...spellcaster(),
        spellSlotsMax: [2, 3, 0, 0, 0],
        spellSlotsCurrent: [2, 1, 0, 0, 0],
        ...overrides,
      };
    }

    function circleRow(circle: number): HTMLElement {
      return screen.getByText(new RegExp(`Ячейки ${circle} круга`)).closest("li") as HTMLElement;
    }

    it("вернуть одну ячейку 2 круга: 1/3 → 2/3, первый круг не тронут", () => {
      const char = twoCircles();
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);

      const row = circleRow(2);
      fireEvent.change(within(row).getByLabelText("Сколько ячеек 2 круга вернуть"), { target: { value: "1" } });
      fireEvent.click(within(row).getByText("Вернуть"));

      const updated = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(char);
      expect(updated.spellSlotsCurrent).toEqual([2, 2, 0, 0, 0]);

      cleanup();
      mockState = baseState({ characters: [updated] });
      render(<CharactersPage />);
      expect(screen.getByText(/Ячейки 2 круга: 2\/3/)).toBeInTheDocument();
      expect(screen.getByText(/Ячейки 1 круга: 2\/2/)).toBeInTheDocument();
    });

    it("вернуть можно и несколько разом — все три потраченные ячейки одним нажатием", () => {
      const char = twoCircles({ spellSlotsCurrent: [2, 0, 0, 0, 0] });
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);

      const row = circleRow(2);
      fireEvent.change(within(row).getByLabelText("Сколько ячеек 2 круга вернуть"), { target: { value: "3" } });
      fireEvent.click(within(row).getByText("Вернуть"));

      expect((updateCharacter.mock.calls[0][1] as (c: Character) => Character)(char).spellSlotsCurrent).toEqual([
        2, 3, 0, 0, 0,
      ]);
    });

    it("больше потраченного не вернуть: просим 9 при двух потраченных — станет 3/3, а не 10/3", () => {
      const char = twoCircles();
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);

      const row = circleRow(2);
      fireEvent.change(within(row).getByLabelText("Сколько ячеек 2 круга вернуть"), { target: { value: "9" } });
      fireEvent.click(within(row).getByText("Вернуть"));

      expect((updateCharacter.mock.calls[0][1] as (c: Character) => Character)(char).spellSlotsCurrent).toEqual([
        2, 3, 0, 0, 0,
      ]);
    });

    it("полному кругу возвращать нечего: поле и кнопка недоступны, состояние не меняется", () => {
      const char = twoCircles({ spellSlotsCurrent: [2, 3, 0, 0, 0] });
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);

      const row = circleRow(2);
      expect(within(row).getByLabelText("Сколько ячеек 2 круга вернуть")).toBeDisabled();
      expect(within(row).getByText("Вернуть")).toBeDisabled();
      fireEvent.click(within(row).getByText("Вернуть"));
      expect(updateCharacter).not.toHaveBeenCalled();
    });

    it("пустое поле ячейку не возвращает — жмём и слышим предел, а не молчаливую правку", () => {
      const char = twoCircles();
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);

      const row = circleRow(2);
      fireEvent.change(within(row).getByLabelText("Сколько ячеек 2 круга вернуть"), { target: { value: "" } });
      fireEvent.click(within(row).getByText("Вернуть"));
      expect(updateCharacter).not.toHaveBeenCalled();
      expect(sounds.playLimitSound).toHaveBeenCalled();
    });

    it("«Восстановить все ячейки» осталась и поднимает оба круга до максимума", () => {
      const char = twoCircles({ spellSlotsCurrent: [0, 1, 0, 0, 0] });
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);

      fireEvent.click(screen.getByText("Восстановить все ячейки"));
      expect((updateCharacter.mock.calls[0][1] as (c: Character) => Character)(char).spellSlotsCurrent).toEqual([
        2, 3, 0, 0, 0,
      ]);
    });
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

  /*
    Черты. Наблюдаемое поведение, которого требует карточка: на уровне ASI
    игрок выбирает черту ВМЕСТО увеличения, черта видна на листе жирным именем,
    а прибавка +1 действительно доходит до характеристики — тем же левел-апом,
    которым доходит ASI, а не своей записью.
  */
  it("на уровне ASI можно взять черту вместо увеличения, и её +1 доходит до характеристики", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_rules" ? [FIGHTER_TOPIC] : []));
    const char: Character = {
      ...characterWithInventory(),
      level: 3,
      abilities: { ...characterWithInventory().abilities, wisdom: 14 },
    };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);

    fireEvent.click(screen.getByText("Повысить уровень"));
    expect(updateCharacter).not.toHaveBeenCalled(); // сперва панель выбора
    fireEvent.click(screen.getByLabelText(/черта вместо увеличения/));
    fireEvent.click(screen.getByLabelText(/Цепкий глаз/));
    fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));

    expect(updateCharacter).toHaveBeenCalledTimes(1);
    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const updated = updater(char);
    expect(updated.level).toBe(4);
    expect(updated.feats).toEqual(["feat-cepkiy-glaz"]);
    expect(updated.abilities.wisdom).toBe(15); // черта обещает +1 — и он применён
    // Характеристики не поднялись больше нигде: черта — отказ от увеличения.
    expect(updated.abilities.strength).toBe(char.abilities.strength);
  });

  /*
    Второй половине того же требования карточки — «увидеть изменившуюся
    характеристику И МОДИФИКАТОР» — на листе отвечает строка спасброска: сырое
    значение характеристики лист показывает только в панели выбора, а модификатор
    живёт здесь. Мудрость 13 (+1) → 14 (+2): прибавка черты перешагивает через
    чётную ступень, поэтому меняется и то и другое.
  */
  it("прибавка черты меняет и значение характеристики, и модификатор на листе", () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_rules" ? [FIGHTER_TOPIC] : []));
    const char: Character = {
      ...characterWithInventory(),
      level: 3,
      abilities: { ...characterWithInventory().abilities, wisdom: 13 },
    };
    mockState = baseState({ characters: [char] });
    const { unmount } = render(<CharactersPage />);

    expect(screen.getByText(/Мудрость \(спасбросок\): \+1/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Повысить уровень"));
    // Сырое значение видно в списке характеристик панели — до прибавки.
    expect(screen.getByLabelText(/Мудрость \(13\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/черта вместо увеличения/));
    fireEvent.click(screen.getByLabelText(/Цепкий глаз/));
    fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));

    const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
    const updated = updater(char);
    unmount();

    mockState = baseState({ characters: [updated] });
    render(<CharactersPage />);
    expect(updated.abilities.wisdom).toBe(14);
    expect(screen.getByText(/Мудрость \(спасбросок\): \+2/)).toBeInTheDocument();
  });

  it("взятая черта видна на листе жирным именем", () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_rules" ? [FIGHTER_TOPIC] : []));
    mockState = baseState({
      characters: [{ ...characterWithInventory(), level: 4, feats: ["feat-cepkiy-glaz"] }],
    });
    render(<CharactersPage />);

    expect(screen.getByText("Черты (1)")).toBeInTheDocument();
    const name = screen.getByText("Цепкий глаз");
    expect(name.tagName).toBe("STRONG");
  });

  it("персонаж без черт открывается как раньше: блока черт нет", () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_rules" ? [FIGHTER_TOPIC] : []));
    mockState = baseState({ characters: [{ ...characterWithInventory(), level: 4, feats: [] }] });
    render(<CharactersPage />);

    expect(screen.queryByText(/^Черты \(/)).not.toBeInTheDocument();
  });

  /*
    Отрицательная проверка требования из карточки: персонаж с Силой 10 не может
    взять черту с требованием Сила 15 — и видит, почему. Причина приходит из
    feats.ts, панель её не выводит сама.
  */
  it("недоступная по требованию черта не предлагается, а объясняется", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) => (cmd === "get_rules" ? [FIGHTER_TOPIC] : []));
    const char: Character = {
      ...characterWithInventory(),
      level: 3,
      abilities: { ...characterWithInventory().abilities, strength: 10 },
    };
    mockState = baseState({ characters: [char] });
    render(<CharactersPage />);

    fireEvent.click(screen.getByText("Повысить уровень"));
    fireEvent.click(screen.getByLabelText(/черта вместо увеличения/));

    // Взять её нечем: радиокнопки с этим именем среди предложенных нет.
    expect(screen.queryByLabelText(/Широкий замах/)).not.toBeInTheDocument();
    // Но и молча она не исчезла — сказано, чего не хватает и сколько есть.
    expect(screen.getByText(/требуется Сила 15 или выше, у вас 10/)).toBeInTheDocument();
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

    // 5 уровень перестал быть потолком (characters-leveling-6-12): кнопка живая.
    expect(screen.getByText("Повысить уровень")).toBeEnabled();
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

  /**
   * Проводит персонажа от 1 уровня до `target`, разбирая по дороге все три
   * прерывания левел-апа (выбор архетипа, выбор внутри архетипа, улучшение
   * характеристик) — тем же способом, каким их разбирает игрок: тыкает в
   * свободные варианты, пока кнопка подтверждения не оживёт. Возвращает
   * уровни, на которых открылась панель ASI: их и проверяют тесты ниже.
   */
  async function levelUpTo(target: number, topic: RuleTopic): Promise<{ char: Character; asiAt: number[] }> {
    vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
      cmd === "get_rules" ? [topic, CONDITIONS_TOPIC] : [],
    );
    let char: Character = {
      ...characterWithInventory(),
      level: 1,
      class: topic.title,
      subclass: "",
      // Состояние нужно только как признак того, что get_rules уже разрешился
      // и classHitDiceByTitle наполнен, — тем же приёмом, что в тесте 1→5 выше.
      conditions: ["Ослеплённое"],
    };
    mockState = baseState({ characters: [char] });
    const { rerender } = render(<CharactersPage />);
    await screen.findByText(/не может видеть/);

    function applyLatestUpdate() {
      const calls = updateCharacter.mock.calls;
      const updater = calls[calls.length - 1][1] as (c: Character) => Character;
      char = updater(char);
      mockState = baseState({ characters: [char] });
      rerender(<CharactersPage />);
    }

    /** Кнопка подтверждения открытой панели прерывания, если панель открыта. */
    function confirmButton(): HTMLElement | null {
      return screen.queryByText("Подтвердить и повысить уровень");
    }

    const asiAt: number[] = [];
    while (char.level < target) {
      const before = char.level;
      const callsBefore = updateCharacter.mock.calls.length;
      fireEvent.click(screen.getByText("Повысить уровень"));

      // Прерывания могут идти подряд (архетип, затем выбор внутри него, затем
      // ASI), поэтому разбираем их, пока левел-ап действительно не произойдёт.
      let guard = 0;
      while (updateCharacter.mock.calls.length === callsBefore) {
        expect(guard++, `ур. ${before}: панель не закрывается`).toBeLessThan(6);
        const asiPanel = screen.queryByText(/Улучшение характеристик \(\d+ уровень\)/);
        if (asiPanel) {
          asiAt.push(before + 1);
          // Подпись обязана называть уровень, на который персонаж поднимается
          // сейчас, а не вечный 4-й.
          expect(asiPanel.textContent).toContain(`(${before + 1} уровень)`);
        }
        // Тычем в свободные варианты, пока подтверждение не оживёт: у ASI это
        // характеристики (переключатели «+2» / «+1+1» трогать нельзя — каждый
        // из них сбрасывает уже выбранное), у выбора архетипа и выбора внутри
        // архетипа — переключатели вариантов, сколько просит choice.pick.
        let clicks = 0;
        while (confirmButton() && (confirmButton() as HTMLButtonElement).disabled) {
          expect(clicks++, `ур. ${before}: нечего выбрать в панели`).toBeLessThan(8);
          const boxes = asiPanel
            ? screen.getAllByRole("checkbox")
            : [...screen.getAllByRole("radio"), ...screen.getAllByRole("checkbox")];
          const free = boxes.find(
            (box) => !(box as HTMLInputElement).disabled && !(box as HTMLInputElement).checked,
          );
          expect(free, `ур. ${before}: свободных вариантов нет`).toBeDefined();
          fireEvent.click(free!);
        }
        const confirm = confirmButton();
        expect(confirm, `ур. ${before}: панель без подтверждения`).not.toBeNull();
        fireEvent.click(confirm!);
      }
      applyLatestUpdate();
      expect(char.level, `переход ${before} → ${before + 1}`).toBe(before + 1);
    }
    return { char, asiAt };
  }

  it("проводит Воина 1 → 12: бонус мастерства по таблице SRD и четыре ASI (4/6/8/12)", async () => {
    const { char, asiAt } = await levelUpTo(12, FIGHTER_TOPIC);
    expect(char.level).toBe(12);
    expect(asiAt).toEqual([4, 6, 8, 12]);
    expect(screen.getByText("Максимальный уровень (12)")).toBeDisabled();
    expect(screen.getByText(/даёт \+4 \(бонус мастерства\)/)).toBeInTheDocument();
  }, 30000);

  it("проводит Плута 1 → 12: четыре ASI (4/8/10/12) — дополнительная точка на 10", async () => {
    const { char, asiAt } = await levelUpTo(12, classTopic("classes-rogue", "Плут", "8", "5"));
    expect(char.level).toBe(12);
    expect(asiAt).toEqual([4, 8, 10, 12]);
  }, 30000);

  it("проводит Волшебника 1 → 12: ячейки по таблице и настоящий 6 круг на 11 уровне", async () => {
    const { char, asiAt } = await levelUpTo(12, classTopic("classes-wizard", "Волшебник", "6", "4"));
    expect(char.level).toBe(12);
    // Обычный класс получает ровно три улучшения характеристик в диапазоне 1-12.
    expect(asiAt).toEqual([4, 8, 12]);
    expect(char.spellSlotsMax).toEqual([4, 3, 3, 3, 2, 1, 0, 0, 0]);
    expect(proficiencyBonusForLevel(char.level)).toBe(4);
  }, 30000);

  it("проводит Паладина 1 → 12: полузаклинатель доходит только до 3 круга", async () => {
    const { char, asiAt } = await levelUpTo(12, classTopic("classes-paladin", "Паладин", "10", "6"));
    expect(char.level).toBe(12);
    expect(asiAt).toEqual([4, 8, 12]);
    expect(char.spellSlotsMax).toEqual([4, 3, 3, 0, 0, 0, 0, 0, 0]);
  }, 30000);

  it("at max level (12), the XP row shows no threshold, just the total", () => {
    mockState = baseState({ characters: [{ ...characterWithInventory(), level: 12, experiencePoints: 120000 }] });
    render(<CharactersPage />);
    expect(screen.getByText(/Опыт: 120000 \(максимум уровня достигнут\)/)).toBeInTheDocument();
    expect(screen.getByText("Максимальный уровень (12)")).toBeDisabled();
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
    it("Бард 1→5 получает ячейки заклинаний по официальной таблице полного заклинателя", async () => {
      const run = levelUpRunner(BARD_TOPIC, {
        ...characterWithInventory(),
        class: "Бард",
        subclass: "Коллегия знаний", // архетип уже выбран — панель выбора не перехватывает левел-ап
        level: 1,
        conditions: ["Ослеплённое"],
        abilities: { ...characterWithInventory().abilities, charisma: 16 },
        knownCantrips: ["cantrip-1", "cantrip-2"],
        castableSpells: ["spell-1", "spell-2", "spell-3", "spell-4"],
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
        castableSpells: ["spell-1", "spell-2"],
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
   * characters-levelup-drops-non-class-proficiencies — приёмка карточки:
   * левел-ап складывает владения с уже имеющимися, а не подменяет список
   * снимком таблиц класса и архетипа. Проб две: сохранение владений не из
   * таблиц и добавление владений архетипа — починка первого обязана
   * оставить второе целым.
   */
  describe("владения на левел-апе", () => {
    const CLERIC_LEVELUP_TOPIC = classTopic("classes-cleric", "Жрец", "8", "5");

    /**
     * Жрец-дварф, у которого на листе есть владения не из таблиц: боевой
     * топор и инструменты каменщика (так устроены дварфы в presets.json,
     * инструмент дварфа кладёт и мастер создания). Снимок намеренно без
     * тяжёлых доспехов и воинского оружия Домена войны: их обязан добавить
     * сам левел-ап.
     */
    function warCleric(level: number): Character {
      return {
        ...characterWithInventory(),
        class: "Жрец",
        subclass: "Домен войны",
        race: "Дварф",
        level,
        conditions: ["Ослеплённое"],
        armorProficiencies: ["light", "medium", "shields"],
        weaponProficiencies: ["simple", "Боевой топор"],
        toolProficiencies: ["Инструменты каменщика"],
      };
    }

    it("владения не из таблиц класса и архетипа переживают левел-ап", async () => {
      const run = levelUpRunner(CLERIC_LEVELUP_TOPIC, warCleric(1));
      await run.ready();

      run.levelUp();

      expect(run.char.level).toBe(2);
      expect(run.char.weaponProficiencies).toContain("Боевой топор");
      expect(run.char.toolProficiencies).toEqual(["Инструменты каменщика"]);
      expect(run.char.armorProficiencies).toContain("shields");

      // Порядок устойчив: второй левел-ап подряд список не переставляет,
      // иначе диф сохранённой кампании шумит на ровном месте.
      const afterFirst = {
        armor: run.char.armorProficiencies,
        weapon: run.char.weaponProficiencies,
        tool: run.char.toolProficiencies,
      };
      run.levelUp();
      expect(run.char.level).toBe(3);
      expect(run.char.armorProficiencies).toEqual(afterFirst.armor);
      expect(run.char.weaponProficiencies).toEqual(afterFirst.weapon);
      expect(run.char.toolProficiencies).toEqual(afterFirst.tool);
    });

    it("владения архетипа тот же левел-ап по-прежнему добавляет", async () => {
      const run = levelUpRunner(CLERIC_LEVELUP_TOPIC, warCleric(1));
      await run.ready();

      run.levelUp();

      // Домен войны: тяжёлые доспехи и воинское оружие приходят из таблицы
      // архетипа, слияние их не потеряло.
      expect(run.char.armorProficiencies).toContain("heavy");
      expect(run.char.weaponProficiencies).toContain("martial");
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

    /**
     * characters-class-feature-short-descriptions: строка особенности показывает
     * подпись из данных. Тексты ниже дословны — снимите `description` у ресурса
     * в classProgression.ts или у варианта в characterCreationData.ts, и здесь
     * станет нечего искать.
     */
    it("строка особенности показывает подпись — и у классового ресурса, и у варианта домена", async () => {
      await renderCleric(cleric("Домен жизни", { level: 2 }));

      expect(
        screen.getByText(/Запас божественной энергии: одно использование тратит любой вариант, который даёт ваш домен\./),
      ).toBeInTheDocument();
      // Подпись встала в ту же строку-подсказку, что и правило отдыха, — новой строки не завелось.
      expect(screen.getByText(/Восстановление: короткий или длинный отдых\./)).toBeInTheDocument();
      expect(
        screen.getByText("Действием раздаёт хиты существам вокруг, но не поднимает никого выше половины его максимума."),
      ).toBeInTheDocument();
      // Счётчик и обе кнопки на месте: подпись их не подвинула.
      expect(screen.getByText(/1\/1 использование/)).toBeInTheDocument();
      expect(screen.getByTitle("Потратить: Проведение энергии")).toBeInTheDocument();
      expect(screen.getByTitle("Применить: Сохранение жизни (тратит Проведение энергии)")).toBeInTheDocument();
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

    /**
     * characters-wild-magic-surge-table — приёмка карточки: всплеск бросает
     * движок сам, игрок видит выпавшую строку, и «Расплата за всплеск»
     * (6 ур.) при этом действительно возвращает очки чар.
     *
     * Отрицательная проба: убрать вызов `rollWildMagic` из `useSpellSlot` —
     * и обе пробы ниже краснеют, потому что строки на листе не появится.
     */
    describe("Дикий всплеск чародея", () => {
      function wildSorcerer(extra: Partial<Character> = {}): Character {
        return {
          ...characterWithInventory(),
          class: "Чародей",
          subclass: "Дикая магия",
          level: 6,
          conditions: ["Ослеплённое"],
          castableSpells: ["magic-missile"],
          spellSlotsMax: [4, 3, 3, 0, 0, 0, 0, 0, 0],
          spellSlotsCurrent: [4, 3, 3, 0, 0, 0, 0, 0, 0],
          ...extra,
        };
      }

      /** Кость подменена: первый бросок к20 = 1 (всплеск), второй — первая строка таблицы. */
      async function castWith(char: Character) {
        const random = vi.spyOn(Math, "random").mockReturnValue(0);
        try {
          await renderWith("classes-sorcerer", "Чародей", "6", "4", char);
          fireEvent.click(screen.getByText("Использовать"));
        } finally {
          random.mockRestore();
        }
      }

      it("наложенное заклинание показывает игроку выпавшую строку и возвращает очки чар", async () => {
        const char = wildSorcerer({ featureUses: [{ featureId: "sorcery-points", usesCurrent: 1 }] });
        await castWith(char);

        expect(screen.getByText(`Дикий всплеск (1/${WILD_MAGIC_DIE}):`)).toBeInTheDocument();
        expect(screen.getByText(WILD_MAGIC_TABLE[0].text)).toBeInTheDocument();
        // Половина уровня чародея округляя вверх: 6 → 3.
        expect(screen.getByText(/Расплата за всплеск: \+3 к очкам чар/)).toBeInTheDocument();

        const after = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(char);
        expect(after.featureUses).toContainEqual({ featureId: "sorcery-points", usesCurrent: 4 });
        // Ячейка 1 круга всё равно потрачена — всплеск её не отменяет.
        expect(after.spellSlotsCurrent[0]).toBe(3);
      });

      it("полный запас очков чар выше максимума не поднимается, а строка всё равно видна", async () => {
        // Максимум очков чар на 6 уровне — 6, потрачено одно.
        const char = wildSorcerer({ featureUses: [{ featureId: "sorcery-points", usesCurrent: 6 }] });
        await castWith(char);

        expect(screen.getByText(WILD_MAGIC_TABLE[0].text)).toBeInTheDocument();
        expect(screen.queryByText(/Расплата за всплеск: \+/)).not.toBeInTheDocument();
        const after = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(char);
        expect(after.featureUses).toEqual([{ featureId: "sorcery-points", usesCurrent: 6 }]);
      });

      it("у Драконьей крови всплеска не бывает — таблица принадлежит Дикой магии", async () => {
        await castWith(wildSorcerer({ subclass: "Драконья кровь" }));
        expect(screen.queryByText(/Дикий всплеск \(/)).not.toBeInTheDocument();
      });
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

    /**
     * characters-archetypes-6-12-mechanics-fixes, позиция 16: владелец просил,
     * чтобы оба числа «Слуха повсюду» были перед глазами — счётчик
     * использования и сама СЛ заклинаний барда, чтобы её не считали в уме.
     */
    it("Слух повсюду показывает на листе и счётчик использования, и СЛ заклинаний барда", async () => {
      const bard = (subclass: string): Character => ({
        ...characterWithInventory(),
        class: "Бард",
        subclass,
        level: 6,
        conditions: ["Ослеплённое"],
      });
      await renderWith("classes-bard", "Бард", "8", "5", bard("Коллегия шёпота"));
      // Харизма 10 (модификатор 0), бард 6 уровня — бонус мастерства +3: СЛ 11.
      expect(screen.getByText(/Слух повсюду: 11 СЛ спасброска \(Харизма\)/)).toBeInTheDocument();
      // Счётчик ищется своей строкой: «1/1 использование» есть и у Вдохновения
      // барда, а «Слух повсюду» жирным — ещё и в списке текстов особенностей.
      const counterRow = screen
        .getAllByText("Слух повсюду", { selector: "strong" })
        .map((el) => el.closest("li.dm-list-row"))
        .find(Boolean);
      expect(counterRow).toHaveTextContent("1/1 использование");

      cleanup();
      await renderWith("classes-bard", "Бард", "8", "5", bard("Коллегия доблести"));
      expect(screen.queryByText(/Слух повсюду/)).not.toBeInTheDocument();
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
      expect(char.castableSpells).not.toContain("hold-person");

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
      expect(char.castableSpells).toEqual(expect.arrayContaining(["hold-person", "spike-growth"]));

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

  /**
   * characters-cleric-prepared-spells — приёмка карточки. Жрец помечен
   * `spellsKnownKind: "prepared"` и до этой карточки получал жёсткий ноль:
   * ячейки и заговоры росли, а заклинаний не было ни одного. Настоящий
   * поставляемый spells.json, не фикстура: «у жреца есть что готовить»
   * держится ровно на данных, и подсунутый список ничего бы не доказал.
   */
  describe("подготовка заклинаний Жреца", () => {
    /** Мудрость 16 (+3) — как у обоих готовых жрецов в presets.json. */
    function preparedCleric(extra: Partial<Character> = {}): Character {
      return {
        ...characterWithInventory(),
        class: "Жрец",
        subclass: "Домен жизни",
        conditions: ["Ослеплённое"],
        abilities: { ...characterWithInventory().abilities, wisdom: 16 },
        spellSlotsMax: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        spellSlotsCurrent: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        ...extra,
      };
    }

    async function renderWithRealSpells(char: Character, topic = classTopic("classes-cleric", "Жрец", "8", "5")) {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [topic, CONDITIONS_TOPIC];
        if (cmd === "get_spells") return bundledSpells as Spell[];
        return [];
      });
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      await screen.findByText(/не может видеть/);
    }

    it("жрец 12 уровня готовит заклинания из всего списка класса вплоть до 6 круга", async () => {
      await renderWithRealSpells(
        preparedCleric({
          level: 12,
          // Только заклинания домена — своих подготовленных ещё нет ни одного.
          castableSpells: [
            "bless", "cure-wounds", "lesser-restoration", "spiritual-weapon", "beacon-of-hope",
            "revivify", "death-ward", "guardian-of-faith", "mass-cure-wounds", "raise-dead",
          ],
          spellSlotsMax: [4, 3, 3, 3, 2, 1, 0, 0, 0],
          spellSlotsCurrent: [4, 3, 3, 3, 2, 1, 0, 0, 0],
        }),
      );

      // Норма: модификатор Мудрости (+3) + уровень (12) = 15.
      expect(screen.getByText(/Подготовлено 0 из 15/)).toBeInTheDocument();
      expect(screen.getByText(/Подготовить до 6 круга \(0\/15\)/)).toBeInTheDocument();
      // Из списка жреца доступно всё до 6 круга — «Исцеление» это 6 круг.
      expect(screen.getByLabelText(/Исцеление \(6 круг\)/)).toBeInTheDocument();
      // …и ничего выше: «Огненный шторм» жреца — 7 круг, ячеек под него нет.
      expect(screen.queryByLabelText(/Огненный шторм/)).not.toBeInTheDocument();
    });

    /**
     * Отрицательная проба карточки: снять исключение доменных из подсчёта
     * (`preparedSpells` в preparedSpells.ts) — и эта проба краснеет, потому
     * что подготовленных станет 6 при норме 4 с предупреждением о переборе.
     */
    it("заклинания домена показаны отдельно и в норму не засчитываются", async () => {
      await renderWithRealSpells(
        preparedCleric({
          castableSpells: ["healing-word", "shield-of-faith", "sanctuary", "command", "bless", "cure-wounds"],
        }),
      );

      expect(screen.getByText("Подготовленные заклинания (4/4):")).toBeInTheDocument();
      expect(screen.getByText(/Подготовлено 4 из 4/)).toBeInTheDocument();
      const domain = screen.getByText(/Заклинания архетипа — всегда подготовлены, сверх нормы \(2\)/);
      const domainGroup = domain.closest(".character-card__spell-group") as HTMLElement;
      expect(within(domainGroup).getByText(/Благословение/)).toBeInTheDocument();
      expect(within(domainGroup).getByText(/Лечение ран/)).toBeInTheDocument();
      // Снять их нельзя — кнопка есть только у подготовленного самим игроком.
      expect(within(domainGroup).queryByText("Снять")).not.toBeInTheDocument();
      expect(screen.getAllByText("Снять")).toHaveLength(4);
      expect(screen.queryByText(/при норме/)).not.toBeInTheDocument();
    });

    it("упавшая Мудрость пересчитывает норму и показывает перебор числом, а не молча срезает список", async () => {
      await renderWithRealSpells(
        preparedCleric({
          abilities: { ...characterWithInventory().abilities, wisdom: 10 },
          castableSpells: ["healing-word", "shield-of-faith", "sanctuary", "command", "bless", "cure-wounds"],
        }),
      );

      expect(screen.getByText(/Подготовлено 4 из 1/)).toBeInTheDocument();
      expect(screen.getByText(/Подготовлено 4 при норме 1 — сними 3/)).toBeInTheDocument();
      // Ничего не исчезло: все четыре по-прежнему на листе и их можно снять вручную.
      expect(screen.getAllByText("Снять")).toHaveLength(4);
    });

    it("левел-ап поднимает норму подготовки вместе с уровнем", async () => {
      const run = levelUpRunner(classTopic("classes-cleric", "Жрец", "8", "5"), preparedCleric({ level: 1 }));
      await run.ready();
      expect(screen.getByText(/Подготовлено 0 из 4/)).toBeInTheDocument();

      run.levelUp();
      expect(run.char.level).toBe(2);
      expect(screen.getByText(/Подготовлено 0 из 5/)).toBeInTheDocument();
    });

    /**
     * Калитка лесенки сошлась: все четыре `prepared`-класса сделаны, и вторая
     * половина этой пробы (Друид без подготовки) снята — у него теперь своя,
     * в `describe("подготовка заклинаний Друида")`. Осталось то, что не
     * зависит от хода лесенки: класс с ИЗВЕСТНЫМ списком в подготовку не
     * проваливается, иначе общий код открыл бы механику чужому классу.
     */
    it("у класса с известным списком подготовки нет", async () => {
      await renderWithRealSpells({
        ...preparedCleric(),
        class: "Бард",
        subclass: "Коллегия знаний",
        castableSpells: ["bless", "cure-wounds"],
      }, classTopic("classes-bard", "Бард", "8", "5"));
      expect(screen.queryByText(/Подготовлено/)).not.toBeInTheDocument();
      expect(screen.queryByText(/при норме/)).not.toBeInTheDocument();
      expect(screen.getByText("Известные заклинания:")).toBeInTheDocument();
    });

    it("выбранное подготавливается и снимается через onUpdate", async () => {
      const char = preparedCleric({ castableSpells: ["bless", "cure-wounds"] });
      await renderWithRealSpells(char);

      fireEvent.click(screen.getByLabelText(/Направляющий луч \(1 круг\)/));
      fireEvent.click(screen.getByText("Подготовить"));
      const prepare = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      expect(prepare(char).castableSpells).toEqual(["bless", "cure-wounds", "guiding-bolt"]);

      cleanup();
      updateCharacter.mockClear();
      const withOwn = preparedCleric({ castableSpells: ["bless", "cure-wounds", "guiding-bolt"] });
      await renderWithRealSpells(withOwn);
      fireEvent.click(screen.getByText("Снять"));
      const unprepare = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      expect(unprepare(withOwn).castableSpells).toEqual(["bless", "cure-wounds"]);
    });
  });

  /**
   * characters-druid-prepared-spells — приёмка карточки. Друид помечен
   * `spellsKnownKind: "prepared"` и до этой карточки получал тот же жёсткий
   * ноль, что и Жрец: ячейки и заговоры росли, а заклинаний не было ни одного.
   * Форма механики жрецовская, а числа свои — список друида в spells.json
   * другой, поэтому здесь настоящий поставляемый spells.json, а не фикстура.
   */
  describe("подготовка заклинаний Друида", () => {
    /** Мудрость 16 (+3) — как у обоих готовых друидов в presets.json. */
    function preparedDruid(extra: Partial<Character> = {}): Character {
      return {
        ...characterWithInventory(),
        class: "Друид",
        subclass: "Круг земли",
        subclassChoices: { "circle-of-the-land-terrain": ["forest"] },
        conditions: ["Ослеплённое"],
        abilities: { ...characterWithInventory().abilities, wisdom: 16 },
        spellSlotsMax: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        spellSlotsCurrent: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        ...extra,
      };
    }

    async function renderDruid(char: Character) {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [classTopic("classes-druid", "Друид", "8", "5"), CONDITIONS_TOPIC];
        if (cmd === "get_spells") return bundledSpells as Spell[];
        return [];
      });
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      await screen.findByText(/не может видеть/);
    }

    it("друид 12 уровня готовит заклинания из всего списка класса вплоть до 6 круга", async () => {
      await renderDruid(
        preparedDruid({
          level: 12,
          // Только заклинания круга Леса — своих подготовленных ещё нет ни одного.
          castableSpells: [
            "barkskin", "spider-climb", "call-lightning", "plant-growth",
            "divination", "freedom-of-movement", "tree-stride", "commune-with-nature",
          ],
          spellSlotsMax: [4, 3, 3, 3, 2, 1, 0, 0, 0],
          spellSlotsCurrent: [4, 3, 3, 3, 2, 1, 0, 0, 0],
        }),
      );

      // Норма: модификатор Мудрости (+3) + уровень друида (12) = 15.
      expect(screen.getByText(/Подготовлено 0 из 15/)).toBeInTheDocument();
      expect(screen.getByText(/Подготовить до 6 круга \(0\/15\)/)).toBeInTheDocument();
      // Из списка друида доступно всё до 6 круга — «Солнечный луч» это 6 круг.
      expect(screen.getByLabelText(/Солнечный луч \(6 круг\)/)).toBeInTheDocument();
      // …и ничего выше: «Обращение гравитации» друида — 7 круг, ячеек под него нет.
      expect(screen.queryByLabelText(/Обращение гравитации/)).not.toBeInTheDocument();
      // Список именно друидский: жрецовский «Направляющий луч» в него не попал.
      expect(screen.queryByLabelText(/Направляющий луч/)).not.toBeInTheDocument();
    });

    /**
     * Заклинания круга приходят от `subclassSpellsUpToLevel` и в норму не
     * входят. Часть из них вообще не из списка друида («Паучье лазание» —
     * заклинание волшебника), и разбор всё равно ведётся по `alwaysPrepared`,
     * а не по принадлежности к списку класса.
     */
    it("заклинания круга показаны отдельно и в норму не засчитываются", async () => {
      await renderDruid(
        preparedDruid({
          level: 3,
          castableSpells: ["entangle", "goodberry", "barkskin", "spider-climb"],
          spellSlotsMax: [4, 2, 0, 0, 0, 0, 0, 0, 0],
          spellSlotsCurrent: [4, 2, 0, 0, 0, 0, 0, 0, 0],
        }),
      );

      // Норма: +3 и уровень 3 = 6; в счёт идут только два своих.
      expect(screen.getByText("Подготовленные заклинания (2/6):")).toBeInTheDocument();
      expect(screen.getByText(/Подготовлено 2 из 6/)).toBeInTheDocument();
      const circle = screen.getByText(/Заклинания архетипа — всегда подготовлены, сверх нормы \(2\)/);
      const circleGroup = circle.closest(".character-card__spell-group") as HTMLElement;
      expect(within(circleGroup).getByText(/Кора/)).toBeInTheDocument();
      expect(within(circleGroup).getByText(/Паучье лазание/)).toBeInTheDocument();
      // Снять их нельзя — кнопка есть только у подготовленного самим игроком.
      expect(within(circleGroup).queryByText("Снять")).not.toBeInTheDocument();
      expect(screen.getAllByText("Снять")).toHaveLength(2);
      expect(screen.queryByText(/при норме/)).not.toBeInTheDocument();
    });

    /**
     * Отрицательная проба карточки: снять пересчёт нормы от Мудрости
     * (слагаемое `abilityMod` в `preparedSpellsMax`) — и краснеет именно эта
     * проба, на ЧИСЛО: норма стала бы 3 вместо 2, а перебор пропал бы вовсе.
     * Наличие самого списка она не сторожит — это делают пробы выше.
     */
    it("упавшая Мудрость пересчитывает норму и показывает перебор числом, а не молча срезает список", async () => {
      await renderDruid(
        preparedDruid({
          level: 3,
          abilities: { ...characterWithInventory().abilities, wisdom: 8 }, // −1 → норма 3 − 1 = 2
          castableSpells: ["entangle", "goodberry", "thunderwave", "barkskin", "spider-climb"],
          spellSlotsMax: [4, 2, 0, 0, 0, 0, 0, 0, 0],
          spellSlotsCurrent: [4, 2, 0, 0, 0, 0, 0, 0, 0],
        }),
      );

      expect(screen.getByText(/Подготовлено 3 из 2/)).toBeInTheDocument();
      expect(screen.getByText(/Подготовлено 3 при норме 2 — сними 1/)).toBeInTheDocument();
      // Ничего не исчезло: все три по-прежнему на листе и их можно снять вручную.
      expect(screen.getAllByText("Снять")).toHaveLength(3);
      // Заклинания круга перебора не создают и остаются сверх нормы.
      expect(screen.getByText(/Заклинания архетипа — всегда подготовлены, сверх нормы \(2\)/)).toBeInTheDocument();
    });

    it("левел-ап поднимает норму подготовки вместе с уровнем друида", async () => {
      const run = levelUpRunner(
        classTopic("classes-druid", "Друид", "8", "5"),
        preparedDruid({ level: 5, subclass: "Круг луны", subclassChoices: {}, castableSpells: [] }),
      );
      await run.ready();
      expect(screen.getByText(/Подготовлено 0 из 8/)).toBeInTheDocument();

      run.levelUp();
      expect(run.char.level).toBe(6);
      expect(screen.getByText(/Подготовлено 0 из 9/)).toBeInTheDocument();
    });

    it("выбранное подготавливается и снимается через onUpdate", async () => {
      const char = preparedDruid({ level: 3, castableSpells: ["barkskin", "spider-climb"] });
      await renderDruid(char);

      fireEvent.click(screen.getByLabelText(/Чудесная ягода \(1 круг\)/));
      fireEvent.click(screen.getByText("Подготовить"));
      const prepare = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      expect(prepare(char).castableSpells).toEqual(["barkskin", "spider-climb", "goodberry"]);

      cleanup();
      updateCharacter.mockClear();
      const withOwn = preparedDruid({ level: 3, castableSpells: ["barkskin", "spider-climb", "goodberry"] });
      await renderDruid(withOwn);
      fireEvent.click(screen.getByText("Снять"));
      const unprepare = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      expect(unprepare(withOwn).castableSpells).toEqual(["barkskin", "spider-climb"]);
    });
  });

  /**
   * characters-paladin-prepared-spells — приёмка карточки. Паладин тоже
   * `prepared`, но полузаклинатель: магия приходит со 2 уровня, а в формулу
   * идёт половина уровня. Заклинания клятвы раздаёт архетип тем же
   * `subclassSpellsUpToLevel`, что и домены Жреца. Список заклинаний —
   * поставляемый spells.json, не фикстура.
   */
  describe("подготовка заклинаний Паладина", () => {
    const PALADIN_TOPIC = classTopic("classes-paladin", "Паладин", "10", "6");
    /** Четыре клятвенных заклинания, открытых Клятвой преданности к 5 уровню. */
    const OATH_TO_LEVEL_5 = ["protection-from-evil-and-good", "sanctuary", "lesser-restoration", "zone-of-truth"];

    /** Харизма 16 (+3), 5 уровень: ячейки 4/2, норма 3 + половина 5 = 5. */
    function preparedPaladin(extra: Partial<Character> = {}): Character {
      return {
        ...characterWithInventory(),
        class: "Паладин",
        subclass: "Клятва преданности",
        conditions: ["Ослеплённое"],
        abilities: { ...characterWithInventory().abilities, charisma: 16 },
        level: 5,
        castableSpells: [...OATH_TO_LEVEL_5],
        spellSlotsMax: [4, 2, 0, 0, 0, 0, 0, 0, 0],
        spellSlotsCurrent: [4, 2, 0, 0, 0, 0, 0, 0, 0],
        ...extra,
      };
    }

    async function renderPaladin(char: Character) {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [PALADIN_TOPIC, CONDITIONS_TOPIC];
        if (cmd === "get_spells") return bundledSpells as Spell[];
        return [];
      });
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      await screen.findByText(/не может видеть/);
    }

    /**
     * Отрицательная проба на формулу: убери ветку половины уровня в
     * `preparedSpellsMax` — норма станет 8 вместо 5, и краснеет и число, и
     * подпись под ним.
     */
    it("норма считается от половины уровня, и подпись называет ту же формулу", async () => {
      await renderPaladin(preparedPaladin());

      expect(screen.getByText("Подготовленные заклинания (0/5):")).toBeInTheDocument();
      expect(
        screen.getByText(
          /Подготовлено 0 из 5 \(модификатор заклинательной характеристики \+ половина уровня 5, округляя вниз\)/,
        ),
      ).toBeInTheDocument();
      // Круг режется ячейками полузаклинателя: на 5 уровне это 2, а не 3.
      expect(screen.getByText(/Подготовить до 2 круга \(0\/5\)/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Помощь \(2 круг\)/)).toBeInTheDocument();
      // Заклинание жреца в списке паладина не появляется даже 1 круга.
      expect(screen.queryByLabelText(/Направляющий луч/)).not.toBeInTheDocument();
    });

    /**
     * Отрицательная проба на вторую половину карточки: убери строки 3 и 5 в
     * `spellsByLevel` Клятвы преданности — и отдельной строки «сверх нормы» у
     * паладина 5 уровня не станет вовсе.
     */
    it("заклинания клятвы идут отдельной строкой сверх нормы и снять их нельзя", async () => {
      await renderPaladin(preparedPaladin());

      const oath = screen.getByText(/Заклинания архетипа — всегда подготовлены, сверх нормы \(4\)/);
      const oathGroup = oath.closest(".character-card__spell-group") as HTMLElement;
      expect(within(oathGroup).getByText(/Защита от зла и добра/)).toBeInTheDocument();
      expect(within(oathGroup).getByText(/Убежище/)).toBeInTheDocument();
      expect(within(oathGroup).getByText(/Малое восстановление/)).toBeInTheDocument();
      expect(within(oathGroup).getByText(/Зона истины/)).toBeInTheDocument();
      expect(within(oathGroup).queryByText("Снять")).not.toBeInTheDocument();
      // Норму они не занимают: подготовлено по-прежнему 0 из 5, перебора нет.
      expect(screen.getByText(/Подготовлено 0 из 5/)).toBeInTheDocument();
      expect(screen.queryByText(/при норме/)).not.toBeInTheDocument();
      // И второй раз, уже своей рукой, их не подготовить — они уже подготовлены.
      expect(screen.queryByLabelText(/Зона истины/)).not.toBeInTheDocument();
      // «Убежища» в списке паладина нет вовсе — оно пришло только клятвой.
      expect(screen.queryByLabelText(/Убежище/)).not.toBeInTheDocument();
    });

    /**
     * characters-oath-spells-for-original-oaths. Оригинальные клятвы студии
     * ведут себя ровно как Преданность: заклинания раздаёт тот же
     * `subclassSpellsUpToLevel`, разбор на «сверх нормы» — тот же
     * `preparedSpells`, второго владельца у факта нет. Проба на листе, а не на
     * данных: до карточки группа «сверх нормы» у этих двух паладинов не
     * рисовалась вовсе.
     *
     * Отрицательная проба: убери у клятвы строку 5 уровня — клятвенных станет
     * две вместо четырёх, и число в заголовке группы покраснеет.
     */
    it.each([
      ["Клятва древних", ["entangle", "speak-with-animals", "moonbeam", "barkskin"], ["Опутывание", "Разговор с животными", "Лунный луч", "Кора"]],
      ["Клятва мести", ["bane", "hunters-mark", "hold-person", "misty-step"], ["Проклятие", "Метка охотника", "Удержание личности", "Туманный шаг"]],
    ])("паладин %s 5 уровня видит четыре клятвенных заклинания сверх нормы", async (oath, ids, names) => {
      await renderPaladin(preparedPaladin({ subclass: oath, castableSpells: [...ids] }));

      const group = screen
        .getByText(/Заклинания архетипа — всегда подготовлены, сверх нормы \(4\)/)
        .closest(".character-card__spell-group") as HTMLElement;
      for (const name of names) {
        expect(within(group).getByText(new RegExp(name)), name).toBeInTheDocument();
      }
      // Снять их нельзя — как у Преданности и у домена жреца.
      expect(within(group).queryByText("Снять")).not.toBeInTheDocument();
      // Норму они не занимают: подготовлено 0 из 5, перебора нет.
      expect(screen.getByText(/Подготовлено 0 из 5/)).toBeInTheDocument();
      expect(screen.queryByText(/при норме/)).not.toBeInTheDocument();
    });

    it("до 2 уровня раздела заклинаний у паладина нет вовсе", async () => {
      await renderPaladin(
        preparedPaladin({
          level: 1,
          subclass: "",
          castableSpells: [],
          spellSlotsMax: [0, 0, 0, 0, 0, 0, 0, 0, 0],
          spellSlotsCurrent: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
      );

      expect(screen.queryByText("Заклинания", { selector: "summary" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Подготовлено/)).not.toBeInTheDocument();
    });

    it("упавшая Харизма пересчитывает норму и показывает перебор числом", async () => {
      await renderPaladin(
        preparedPaladin({
          abilities: { ...characterWithInventory().abilities, charisma: 8 },
          castableSpells: [...OATH_TO_LEVEL_5, "bless", "divine-favor", "heroism"],
        }),
      );

      // Харизма 8 (−1) + половина 5 (2) = 1.
      expect(screen.getByText(/Подготовлено 3 из 1/)).toBeInTheDocument();
      expect(screen.getByText(/Подготовлено 3 при норме 1 — сними 2/)).toBeInTheDocument();
      // Клятвенные в перебор не входят: их четыре, а в счёт идут только три своих.
      expect(screen.getAllByText("Снять")).toHaveLength(3);
    });

    /**
     * У полузаклинателя норма растёт через уровень — это и отличает её от
     * жреческой. 4 → 5 не двигает её вовсе, 5 → 6 поднимает на единицу.
     */
    it("левел-ап двигает норму через уровень, а не каждый", async () => {
      const run = levelUpRunner(
        PALADIN_TOPIC,
        preparedPaladin({ level: 4, castableSpells: [], spellSlotsMax: [3, 0, 0, 0, 0, 0, 0, 0, 0], spellSlotsCurrent: [3, 0, 0, 0, 0, 0, 0, 0, 0] }),
      );
      await run.ready();
      expect(screen.getByText(/Подготовлено 0 из 5/)).toBeInTheDocument();

      run.levelUp();
      expect(run.char.level).toBe(5);
      // Клятвенные 5 уровня приехали на левел-апе — и норму не тронули.
      expect(run.char.castableSpells).toEqual(OATH_TO_LEVEL_5);
      expect(screen.getByText(/Подготовлено 0 из 5/)).toBeInTheDocument();

      run.levelUp();
      expect(run.char.level).toBe(6);
      expect(screen.getByText(/Подготовлено 0 из 6/)).toBeInTheDocument();
    });
  });

  /**
   * characters-wizard-spellbook — приёмка карточки. У волшебника два уровня:
   * книга (что выучено вообще) и подготовленный из неё срез. До этой карточки
   * ему, как и остальным `prepared`-классам, доставался жёсткий ноль: ячейки и
   * заговоры росли, а вписать и подготовить было нечего. Проверяется на
   * настоящем поставляемом spells.json, а не на фикстуре: «волшебнику есть что
   * вписывать» держится ровно на данных.
   */
  describe("книга заклинаний Волшебника", () => {
    const WIZARD_TOPIC = classTopic("classes-wizard", "Волшебник", "6", "4");

    /** Интеллект 16 (+3) — как у обоих готовых волшебников в presets.json. */
    function wizardChar(extra: Partial<Character> = {}): Character {
      return {
        ...characterWithInventory(),
        class: "Волшебник",
        conditions: ["Ослеплённое"],
        abilities: { ...characterWithInventory().abilities, intelligence: 16 },
        knownCantrips: ["fire-bolt"],
        spellSlotsMax: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        spellSlotsCurrent: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        ...extra,
      };
    }

    /** Лист 12 уровня: ячейки до 6 круга — та самая строка таблицы, на которой заведена карточка. */
    function wizardAt12(extra: Partial<Character> = {}): Character {
      return wizardChar({
        level: 12,
        subclass: "Школа эвокации",
        spellSlotsMax: [4, 3, 3, 3, 2, 1, 0, 0, 0],
        spellSlotsCurrent: [4, 3, 3, 3, 2, 1, 0, 0, 0],
        ...extra,
      });
    }

    async function renderWizard(char: Character) {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [WIZARD_TOPIC, CONDITIONS_TOPIC];
        if (cmd === "get_spells") return bundledSpells as Spell[];
        return [];
      });
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      await screen.findByText(/не может видеть/);
    }

    it("волшебник 12 уровня вписывает в книгу заклинания вплоть до 6 круга", async () => {
      await renderWizard(wizardAt12({ spellbook: ["magic-missile", "shield", "fireball"], castableSpells: [] }));

      // Норма книги на 12 уровне: шесть на первом плюс по два за одиннадцать следующих.
      expect(screen.getByText("Книга заклинаний (3/28):")).toBeInTheDocument();
      expect(screen.getByText(/Вписано в книгу: 3 из 28, положенных на 12 уровень/)).toBeInTheDocument();
      const write = screen.getByText(/Вписать в книгу до 6 круга \(0\/25\)/).nextElementSibling as HTMLElement;
      // 6 круг доступен — «Распад» это шестой круг списка волшебника…
      expect(within(write).getByLabelText(/Распад \(6 круг\)/)).toBeInTheDocument();
      // …а 7 круг в spells.json есть, но ячеек под него на 12 уровне нет.
      expect(within(write).queryByLabelText(/Отсроченный огненный шар/)).not.toBeInTheDocument();
      // Уже вписанное второй раз не предлагается: в книге оно есть, вписывать нечего.
      expect(within(write).queryByLabelText(/Волшебная стрела/)).not.toBeInTheDocument();
      // Весь список волшебника до 6 круга — 149 заклинаний, минус три уже вписанных
      // (было 148: `stinking-cloud` вернулся волшебнику по сверке с эталоном SRD).
      expect(within(write).getAllByRole("checkbox")).toHaveLength(146);
    });

    /**
     * Отличие от сестёр, ради которого заведена книга: источник подготовки у
     * волшебника — она, а не весь список класса. Проба отрицательная: подставь
     * на лист полный список (как у Жреца) — и «Огненный шар», которого в книге
     * нет, окажется в выборе подготовки.
     */
    it("готовит волшебник только из книги, а не из всего списка класса", async () => {
      await renderWizard(wizardAt12({ spellbook: ["magic-missile", "shield"], castableSpells: [] }));

      // Норма подготовки: модификатор Интеллекта (+3) + уровень (12) = 15.
      expect(screen.getByText(/Подготовлено 0 из 15/)).toBeInTheDocument();
      const prepare = screen.getByText(/Подготовить до 6 круга \(0\/15\)/).nextElementSibling as HTMLElement;
      expect(within(prepare).getByLabelText(/Волшебная стрела \(1 круг\)/)).toBeInTheDocument();
      expect(within(prepare).getByLabelText(/Щит \(1 круг\)/)).toBeInTheDocument();
      expect(within(prepare).queryByLabelText(/Огненный шар/)).not.toBeInTheDocument();
      expect(within(prepare).getAllByRole("checkbox")).toHaveLength(2);
    });

    it("вписанное уходит в книгу, а подготовленное — в список подготовленных", async () => {
      const char = wizardAt12({ spellbook: ["magic-missile"], castableSpells: [] });
      await renderWizard(char);

      fireEvent.click(screen.getByLabelText(/Огненный шар \(3 круг\)/));
      fireEvent.click(screen.getByText("Вписать"));
      const write = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      expect(write(char).spellbook).toEqual(["magic-missile", "fireball"]);
      // Вписанное не считается подготовленным: это разные списки.
      expect(write(char).castableSpells).toEqual([]);

      cleanup();
      updateCharacter.mockClear();
      const withBook = wizardAt12({ spellbook: ["magic-missile", "fireball"], castableSpells: [] });
      await renderWizard(withBook);
      fireEvent.click(screen.getByLabelText(/Огненный шар \(3 круг\)/));
      fireEvent.click(screen.getByText("Подготовить"));
      const prepare = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      expect(prepare(withBook).castableSpells).toEqual(["fireball"]);
      expect(prepare(withBook).spellbook).toEqual(["magic-missile", "fireball"]);
    });

    /**
     * Отрицательная проба на пересчёт: сними в `preparedSpellsMax` слагаемое от
     * характеристики — и оба числа станут одинаковыми, проба покраснеет. Объём
     * книги при этом не меняется вовсе: он от уровня, а не от Интеллекта.
     */
    it("Интеллект двигает число подготовленных и не двигает объём книги", async () => {
      await renderWizard(wizardAt12({ spellbook: ["magic-missile"], castableSpells: [] }));
      expect(screen.getByText(/Подготовлено 0 из 15/)).toBeInTheDocument();
      expect(screen.getByText("Книга заклинаний (1/28):")).toBeInTheDocument();

      cleanup();
      await renderWizard(
        wizardAt12({
          spellbook: ["magic-missile"],
          castableSpells: [],
          abilities: { ...characterWithInventory().abilities, intelligence: 8 },
        }),
      );
      expect(screen.getByText(/Подготовлено 0 из 11/)).toBeInTheDocument();
      expect(screen.getByText("Книга заклинаний (1/28):")).toBeInTheDocument();
    });

    it("левел-ап открывает в книге два места и поднимает норму подготовки на одно", async () => {
      const run = levelUpRunner(
        WIZARD_TOPIC,
        wizardChar({ level: 5, subclass: "Школа эвокации", spellbook: ["magic-missile", "shield", "fireball"] }),
      );
      await run.ready();
      expect(screen.getByText("Книга заклинаний (3/14):")).toBeInTheDocument();
      expect(screen.getByText(/Подготовлено 0 из 8/)).toBeInTheDocument();

      run.levelUp();
      expect(run.char.level).toBe(6);
      expect(screen.getByText("Книга заклинаний (3/16):")).toBeInTheDocument();
      expect(screen.getByText(/Подготовлено 0 из 9/)).toBeInTheDocument();
    });

    /**
     * Переход старых сохранений: до карточки заклинания волшебника лежали в
     * `castableSpells`. Отрицательная проба — убери запасной путь `spellbookOf`,
     * и книга такого персонажа окажется пустой, а снятие подготовки вычеркнет
     * заклинание не только из подготовленных, но и из книги.
     */
    it("у сохранения без книги её роль играет прежний список, и снятие подготовки его не съедает", async () => {
      const legacy = wizardChar({
        spellbook: [],
        castableSpells: ["shield", "mage-armor", "magic-missile", "find-familiar"],
      });
      await renderWizard(legacy);

      expect(screen.getByText("Книга заклинаний (4/6):")).toBeInTheDocument();
      expect(screen.getByText("Подготовленные заклинания (4/4):")).toBeInTheDocument();

      fireEvent.click(screen.getAllByText("Снять")[3]);
      const unprepare = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      const after = unprepare(legacy);
      expect(after.castableSpells).toEqual(["shield", "mage-armor", "magic-missile"]);
      expect(after.spellbook).toEqual(["shield", "mage-armor", "magic-missile", "find-familiar"]);
    });

    /** Книга — только у волшебника: у Жреца её нет ни в списках, ни в подсказке. */
    it("у Жреца книги нет — источником подготовки остаётся весь список класса", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [classTopic("classes-cleric", "Жрец", "8", "5"), CONDITIONS_TOPIC];
        if (cmd === "get_spells") return bundledSpells as Spell[];
        return [];
      });
      mockState = baseState({
        characters: [{ ...wizardChar(), class: "Жрец", subclass: "Домен жизни", castableSpells: ["bless"] }],
      });
      render(<CharactersPage />);
      await screen.findByText(/не может видеть/);

      // Не просто /Книга заклинаний/: так называется и предмет снаряжения в каталоге.
      expect(screen.queryByText(/Книга заклинаний \(/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Вписано в книгу/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Вписать в книгу/)).not.toBeInTheDocument();
      expect(screen.getByText(/доступен весь список класса до 1 круга/)).toBeInTheDocument();
    });
  });

  describe("Эльф бездны на листе персонажа", () => {
    /** Персонаж нашей расы: остальное — обычная заготовка листа. */
    function abyssElf(level: number): Character {
      return {
        ...characterWithInventory(),
        name: "Ксарнет",
        race: "Эльф бездны",
        subclass: "Воитель",
        level,
        conditions: ["Ослеплённое"],
        knownCantrips: ["dancing-lights"],
        featureUses: [{ featureId: "abyss-call", usesCurrent: 1 }],
      };
    }

    /** Заклинания расы в справочнике — лист берёт их названия по id, а не хранит копию. */
    const RACE_SPELLS: Spell[] = (bundledSpells as Spell[]).filter((s) =>
      ["dancing-lights", "faerie-fire", "darkness"].includes(s.id),
    );

    it("показывает расовые особенности, счётчик «Зова бездны» и цену числом", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [FIGHTER_TOPIC, CONDITIONS_TOPIC];
        if (cmd === "get_spells") return RACE_SPELLS;
        return [];
      });
      mockState = baseState({ characters: [abyssElf(1)] });
      render(<CharactersPage />);

      const block = (await screen.findByText(/Расовые особенности \(3\)/)).closest("details") as HTMLElement;
      expect(within(block).getByText("Превосходное тёмное зрение")).toBeInTheDocument();
      expect(within(block).getByText("Зов бездны")).toBeInTheDocument();
      expect(within(block).getByText("Дар бездны")).toBeInTheDocument();
      expect(within(block).getByText(/1\/1 использование/)).toBeInTheDocument();
      // Цена названа числом: пассивная внимательность 10, под прямым солнцем 5.
      expect(within(block).getByText(/Пассивная внимательность там же — 5 вместо 10/)).toBeInTheDocument();
      // Названия заклинаний приехали из spells.json по id, а не из текста расы.
      expect(within(block).getByText(/Пляшущие огоньки.*Огонь фей.*Тьма/)).toBeInTheDocument();
    });

    it("«Зов бездны» тратится, переживает левел-ап и на 5 уровне даёт второе использование", async () => {
      const run = levelUpRunner(FIGHTER_TOPIC, abyssElf(4));
      await run.ready();

      fireEvent.click(screen.getByTitle("Потратить: Зов бездны"));
      const spent = (updateCharacter.mock.calls[0][1] as (c: Character) => Character)(run.char);
      expect(spent.featureUses).toContainEqual({ featureId: "abyss-call", usesCurrent: 0 });

      run.levelUp(); // 4 -> 5: наша лесенка открывает второе использование
      expect(run.char.level).toBe(5);
      expect(run.char.featureUses).toContainEqual({ featureId: "abyss-call", usesCurrent: 2 });
    });

    it("остальным девяти расам ни счётчика, ни цены не достаётся", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules"
          ? [FIGHTER_TOPIC, CONDITIONS_TOPIC, { id: "races-elf", category: "races", title: "Эльф", sourceUrl: "", blocks: [] }]
          : [],
      );
      mockState = baseState({ characters: [{ ...characterWithInventory(), race: "Эльф" }] });
      render(<CharactersPage />);

      await screen.findByText(/Расовые особенности/);
      expect(screen.queryByText("Зов бездны")).not.toBeInTheDocument();
      expect(screen.queryByText(/Пассивная внимательность там же/)).not.toBeInTheDocument();
    });

    /**
     * Стихия Дженази — выбор, сделанный в мастере создания (пункт 2а карточки
     * characters-races-pack-b). Лист обязан показать особенности ИМЕННО той
     * стихии, что лежит в сохранении: склейку делает тот же единственный
     * владелец правила, которого зовёт мастер (`raceTraitsWithVariant`), и
     * разойдись они — на обзорном шаге игрок увидел бы одно, а на листе другое.
     */
    it("лист Дженази показывает особенности выбранной стихии, а не всех четырёх", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [FIGHTER_TOPIC, CONDITIONS_TOPIC] : [],
      );
      mockState = baseState({
        characters: [
          { ...characterWithInventory(), name: "Струя", race: "Дженази", raceVariant: "genasi-water" },
        ],
      });
      render(<CharactersPage />);

      // Три общих особенности плюс две у стихии.
      const block = (await screen.findByText(/Расовые особенности \(5\)/)).closest("details") as HTMLElement;
      expect(within(block).getByText("Стихия в крови")).toBeInTheDocument();
      expect(within(block).getByText(/Стихия твоей крови — вода/)).toBeInTheDocument();
      expect(within(block).getByText("Дыхание под водой")).toBeInTheDocument();
      // Чужие стихии на лист не приезжают.
      expect(within(block).queryByText("Искра")).not.toBeInTheDocument();
      expect(within(block).queryByText("Дыхание ветра")).not.toBeInTheDocument();
      expect(within(block).queryByText("Не свалить")).not.toBeInTheDocument();
    });

    it("Дженази из сохранения без стихии открывается и показывает только общие особенности", async () => {
      // Поле `raceVariant` появилось вместе с механизмом, и у сохранений до
      // него там "". Лист обязан открыться, а не остаться без блока или упасть.
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [FIGHTER_TOPIC, CONDITIONS_TOPIC] : [],
      );
      mockState = baseState({
        characters: [{ ...characterWithInventory(), name: "Прах", race: "Дженази", raceVariant: "" }],
      });
      render(<CharactersPage />);

      const block = (await screen.findByText(/Расовые особенности \(3\)/)).closest("details") as HTMLElement;
      expect(within(block).getByText("Не исчадие")).toBeInTheDocument();
      expect(within(block).queryByText("Стихия в крови")).not.toBeInTheDocument();
    });

    it("старое сохранение расы без особенностей открывается и блока не заводит", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [FIGHTER_TOPIC, CONDITIONS_TOPIC] : [],
      );
      // Человек — единственная раса SRD вовсе без особенностей в списке.
      mockState = baseState({ characters: [characterWithInventory()] });
      render(<CharactersPage />);

      await screen.findByText("Герой");
      expect(screen.queryByText(/Расовые особенности/)).not.toBeInTheDocument();
    });
  });

  /**
   * Безумие: наша лестница 1-2-3 поверх трёх таблиц SRD. Раздел справочника
   * берётся НАСТОЯЩИЙ (rules.json → additional-rules-madness), а не выдуманный
   * под пробу: иначе проба скармливала бы себе проверяемое.
   */
  describe("безумие на листе", () => {
    const MADNESS_TOPIC = (bundledRules as RuleTopic[]).find((t) => t.id === "additional-rules-madness") as RuleTopic;

    /** Движок бросает к100 и к10; проба подменяет только выпавшее. */
    function rollingD100(d100: number, d10: number) {
      // `beforeEach` файла чистит только счётчики кампании, но не invoke —
      // без этого в счёт бросков попали бы чужие вызовы прошлых проб.
      vi.mocked(invoke).mockClear();
      vi.mocked(invoke).mockImplementation(async (cmd: unknown, args?: unknown) => {
        if (cmd === "get_rules") return [MADNESS_TOPIC, CONDITIONS_TOPIC];
        if (cmd === "roll_dice") {
          const expression = (args as { expression: string }).expression;
          return { expression, rolls: [], modifier: 0, total: expression === "1d100" ? d100 : d10, dropped: null };
        }
        return [];
      });
    }

    async function raise(char: Character): Promise<Character> {
      // Каждая ступень поднимается со свежего листа: два рендера подряд в одном
      // документе оставили бы на экране обе карточки и проба сверяла бы не то.
      cleanup();
      updateCharacter.mockClear();
      mockState = baseState({ characters: [char] });
      const { rerender } = render(<CharactersPage />);
      fireEvent.click(await screen.findByRole("button", { name: "Безумие +1" }));
      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
      const calls = updateCharacter.mock.calls;
      const updater = calls[calls.length - 1][1] as (c: Character) => Character;
      const next = updater(char);
      mockState = baseState({ characters: [next] });
      rerender(<CharactersPage />);
      return next;
    }

    it("«Безумие +1» бросает к100 движком и вешает состояние с эффектом SRD и длительностью в минутах", async () => {
      rollingD100(7, 6);
      const after = await raise(characterWithInventory());

      // 7 попадает в верхний диапазон 01-20 краткосрочной таблицы — то самое
      // место, где к100 с диапазонами отличается от плоской кости.
      expect(after.conditions).toEqual(["Безумие (ур. 1, к100 7, 1к10 6)"]);
      expect(invoke).toHaveBeenCalledWith("roll_dice", { expression: "1d100" });
      expect(invoke).toHaveBeenCalledWith("roll_dice", { expression: "1d10" });
      expect(await screen.findByText(/уходит в себя и становится парализованным/)).toBeInTheDocument();
      expect(screen.getByText("Краткосрочное безумие, бросок к100: 7 (диапазон 1–20).")).toBeInTheDocument();
      expect(screen.getByText("Длительность: 6 минут (1к10: 6).")).toBeInTheDocument();
      expect(screen.getByText(/Лечение:.*Умиротворение/)).toBeInTheDocument();
    });

    it("повышение до второй ступени перебрасывает по долгосрочной таблице, а длительность становится часами", async () => {
      rollingD100(7, 6);
      const first = await raise(characterWithInventory());
      rollingD100(57, 9);
      const second = await raise(first);

      expect(second.conditions).toEqual(["Безумие (ур. 2, к100 57, 1к10 9)"]);
      expect(await screen.findByText(/Долгосрочное безумие, бросок к100: 57/)).toBeInTheDocument();
      expect(screen.getByText("Длительность: 90 часов (1к10: 9 × 10).")).toBeInTheDocument();
      // Эффект перебросился по СВОЕЙ таблице, а не переехал с краткосрочной.
      expect(screen.queryByText(/уходит в себя и становится парализованным/)).not.toBeInTheDocument();
    });

    it("выше третьей ступени лестница не идёт: кнопка не жмётся, длительности у бессрочного нет", async () => {
      rollingD100(100, 1);
      const char = { ...characterWithInventory(), conditions: ["Безумие (ур. 3, к100 100)"] };
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);

      expect(await screen.findByRole("button", { name: "Безумие +1" })).toBeDisabled();
      expect(screen.getByText(/Уровень безумия: 3 из 3/)).toBeInTheDocument();
      expect(screen.getByText("Длительность: до тех пор, пока безумие не будет излечено.")).toBeInTheDocument();
    });

    it("состояние снимается той же кнопкой, что и прочие, — таймера у него нет", async () => {
      rollingD100(7, 6);
      const char = { ...characterWithInventory(), conditions: ["Безумие (ур. 1, к100 7, 1к10 6)"] };
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      await screen.findByText(/уходит в себя/);

      const item = screen.getByText("Безумие (ур. 1, к100 7, 1к10 6)").closest("li") as HTMLElement;
      fireEvent.click(within(item).getByText("✕"));
      const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      expect(updater(char).conditions).toEqual([]);
    });

    it("два нажатия подряд, до конца первого броска, поднимают лестницу на ОДНУ ступень", async () => {
      // Отрицательная проба на «уровень перепрыгнул выше нажатого»: сторож
      // повторного входа держится на ref, а не на состоянии React, — состояние
      // к моменту второго нажатия ещё не перерисовалось бы, и второй бросок
      // прошёл бы следом за первым.
      rollingD100(7, 6);
      const char = characterWithInventory();
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      const button = await screen.findByRole("button", { name: "Безумие +1" });

      // Оба нажатия — в ОДНОМ проходе act: иначе React успевает перерисовать
      // карточку между ними, и второе нажатие видит уже поднятый флаг. В живом
      // окне такой передышки нет, и проба должна проверять именно этот случай.
      await act(async () => {
        button.click();
        button.click();
      });
      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());

      const rolls = vi.mocked(invoke).mock.calls.filter(([command]) => command === "roll_dice");
      expect(rolls).toHaveLength(2); // к100 и к10 — ровно один подъём
      expect(updateCharacter).toHaveBeenCalledTimes(1);
      const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      expect(updater(char).conditions).toEqual(["Безумие (ур. 1, к100 7, 1к10 6)"]);
    });

    it("повышение не трогает прочие состояния: они остаются на листе рядом с безумием", async () => {
      rollingD100(7, 6);
      const char = { ...characterWithInventory(), conditions: ["Ослеплённое", "Отравленное"] };
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      fireEvent.click(await screen.findByRole("button", { name: "Безумие +1" }));
      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());

      const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
      expect(updater(char).conditions).toEqual([
        "Ослеплённое",
        "Отравленное",
        "Безумие (ур. 1, к100 7, 1к10 6)",
      ]);
    });

    it("старое сохранение без безумия открывается как раньше: уровень 0, прочие состояния целы", async () => {
      rollingD100(7, 6);
      const char = { ...characterWithInventory(), conditions: ["Ослеплённое", "Истощение (ур. 3)"] };
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);

      expect(await screen.findByText(/не может видеть/)).toBeInTheDocument();
      expect(screen.getByText("Помеха на проверки характеристик.")).toBeInTheDocument();
      expect(screen.getByText(/Уровень безумия: 0 из 3/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Безумие +1" })).toBeEnabled();
    });
  });

  /**
   * Отдых: Кости Хитов и короткий отдых (characters-hit-dice-and-short-rest).
   * Предел остатка проверяется в hitDice.test.ts — здесь наблюдаемое поведение
   * листа: бросок идёт в движок, счётчик считается от уровня, а короткий отдых
   * возвращает ровно помеченное `recharge: "short"` и ячейки только тому, у
   * кого `slotRecharge: "short"`.
   */
  describe("Отдых: Кости Хитов, короткий и длинный", () => {
    const WIZARD_TOPIC = classTopic("classes-wizard", "Волшебник", "6", "4");

    /**
     * Лист с загруженным справочником класса: та же загрузка `get_rules`, что
     * наполняет `classHitDiceByTitle`, поэтому ожидание идёт по лицу кости в
     * счётчике Костей Хитов — до загрузки его нет.
     */
    async function renderSheet(
      char: Character,
      options: { topic?: RuleTopic; roll?: { rolls: number[]; modifier: number; total: number } } = {},
    ) {
      const topic = options.topic ?? FIGHTER_TOPIC;
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [topic, CONDITIONS_TOPIC];
        if (cmd === "roll_dice") {
          const roll = options.roll ?? { rolls: [1], modifier: 0, total: 1 };
          return { expression: "", dropped: null, ...roll };
        }
        return [];
      });
      mockState = baseState({ characters: [char] });
      render(<CharactersPage />);
      await screen.findByText(/\(1к\d+\)/);
    }

    /** Персонаж после последнего обновления листа. */
    function applied(char: Character): Character {
      const calls = updateCharacter.mock.calls;
      return (calls[calls.length - 1][1] as (c: Character) => Character)(char);
    }

    it("держит счётчик и действия в строке, а правила и итог отдыха — отдельными блоками", async () => {
      const hero: Character = {
        ...characterWithInventory(),
        level: 5,
        hitDiceSpent: 2,
        featureUses: [
          { featureId: "second-wind", usesCurrent: 0 },
          { featureId: "action-surge", usesCurrent: 0 },
        ],
      };
      await renderSheet(hero);

      const rest = screen.getByText("Отдых").closest("details");
      expect(rest).toBeInTheDocument();
      if (!rest) throw new Error("Блок отдыха не найден");

      const actionRow = rest.querySelector<HTMLElement>(".character-card__rest-actions");
      const hints = rest.querySelector<HTMLElement>(".character-card__rest-hints");
      expect(actionRow).toBeInTheDocument();
      expect(hints).toBeInTheDocument();
      if (!actionRow || !hints) throw new Error("Раскладка отдыха не найдена");

      expect(within(actionRow).getByText("3/5 (1к10)")).toBeInTheDocument();
      expect(hints).not.toBe(actionRow);
      expect(actionRow.contains(hints)).toBe(false);
      expect([...hints.children].map((child) => child.tagName)).toEqual(["P", "P", "P"]);

      fireEvent.click(within(actionRow).getByText("Короткий отдых"));
      const note = screen.getByText("Короткий отдых: Второе дыхание, Всплеск действий.");
      expect(note).toHaveClass("character-card__rest-note");
      expect(note).not.toHaveClass("character-card__hint");
    });

    it("трата кости лечит на выпавшее с модификатором Телосложения и уменьшает счётчик", async () => {
      const hero: Character = {
        ...characterWithInventory(),
        abilities: { ...characterWithInventory().abilities, constitution: 14 }, // +2
        level: 3,
        maxHp: 20,
        currentHp: 5,
      };
      await renderSheet(hero, { roll: { rolls: [7], modifier: 2, total: 9 } });

      fireEvent.click(screen.getByText("Потратить кость"));
      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());

      // Бросок сделал движок, а не свой Math.random: кость классовая, модификатор в выражении.
      expect(invoke).toHaveBeenCalledWith("roll_dice", { expression: "1d10+2" });
      const after = applied(hero);
      expect(after.currentHp).toBe(14);
      expect(after.hitDiceSpent).toBe(1);
      expect(screen.getByText(/Кость Хитов 1к10: выпало 7, Телосложение \+2 — хитов \+9\./)).toBeInTheDocument();
    });

    it("выше максимума хитов кость не поднимает, а отрицательное Телосложение их не отнимает", async () => {
      const tough: Character = { ...characterWithInventory(), level: 2, maxHp: 16, currentHp: 12 };
      await renderSheet(tough, { roll: { rolls: [9], modifier: 0, total: 9 } });
      fireEvent.click(screen.getByText("Потратить кость"));
      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
      expect(applied(tough).currentHp).toBe(16);

      cleanup();
      updateCharacter.mockClear();
      const frail: Character = {
        ...characterWithInventory(),
        abilities: { ...characterWithInventory().abilities, constitution: 6 }, // -2
        level: 2,
        maxHp: 8,
        currentHp: 3,
      };
      await renderSheet(frail, { roll: { rolls: [1], modifier: -2, total: -1 } });
      fireEvent.click(screen.getByText("Потратить кость"));
      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
      const after = applied(frail);
      // Лечение минимум 0: отрицательный модификатор хиты не отнимает, а кость всё равно потрачена.
      expect(after.currentHp).toBe(3);
      expect(after.hitDiceSpent).toBe(1);
    });

    it("пустой запас костей не тратится, помечен aria-disabled и звучит пределом", async () => {
      const spent: Character = { ...characterWithInventory(), level: 2, hitDiceSpent: 2, maxHp: 16, currentHp: 4 };
      await renderSheet(spent);

      const button = screen.getByText("Потратить кость");
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toBeEnabled(); // не `disabled`: тогда звука предела не было бы
      fireEvent.click(button);

      expect(sounds.playLimitSound).toHaveBeenCalled();
      expect(updateCharacter).not.toHaveBeenCalled();
    });

    it("максимум костей — это уровень: левел-ап даёт кость, потраченные обратно не приходят", async () => {
      const spentTwo = { ...characterWithInventory(), maxHp: 30, currentHp: 30, hitDiceSpent: 2 };
      await renderSheet({ ...spentTwo, level: 5 });
      expect(screen.getByText("3/5 (1к10)")).toBeInTheDocument();

      cleanup();
      // То же хранимое «потрачено 2», уровень выше — костей больше, а потраченные так и потрачены.
      await renderSheet({ ...spentTwo, level: 6 });
      expect(screen.getByText("4/6 (1к10)")).toBeInTheDocument();
    });

    it("короткий отдых возвращает только помеченное short: расовый «Зов бездны» остаётся потраченным", async () => {
      const elf: Character = {
        ...characterWithInventory(),
        race: "Эльф бездны",
        level: 2,
        maxHp: 16,
        currentHp: 4,
        hitDiceSpent: 1,
        featureUses: [
          { featureId: "second-wind", usesCurrent: 0 },
          { featureId: "action-surge", usesCurrent: 0 },
          { featureId: "abyss-call", usesCurrent: 0 },
        ],
      };
      await renderSheet(elf);

      fireEvent.click(screen.getByText("Короткий отдых"));
      const after = applied(elf);

      expect(after.featureUses).toContainEqual({ featureId: "second-wind", usesCurrent: 1 });
      expect(after.featureUses).toContainEqual({ featureId: "action-surge", usesCurrent: 1 });
      // Расовый ресурс помечен `long` — чтение идёт по полю данных, а не по списку id.
      expect(after.featureUses).toContainEqual({ featureId: "abyss-call", usesCurrent: 0 });
      // Хиты и кости короткий отдых сам не возвращает.
      expect(after.currentHp).toBe(4);
      expect(after.hitDiceSpent).toBe(1);
      expect(screen.getByText("Короткий отдых: Второе дыхание, Всплеск действий.")).toBeInTheDocument();
    });

    it("ячейки на коротком отдыхе возвращаются только по полю slotRecharge: у Колдуна да, у Волшебника нет", async () => {
      const warlock: Character = {
        ...characterWithInventory(),
        class: "Колдун",
        subclass: "Архифея",
        level: 3,
        maxHp: 18,
        currentHp: 18,
        spellSlotsMax: [0, 2, 0, 0, 0, 0, 0, 0, 0],
        spellSlotsCurrent: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      };
      await renderSheet(warlock, { topic: WARLOCK_TOPIC });
      fireEvent.click(screen.getByText("Короткий отдых"));
      expect(applied(warlock).spellSlotsCurrent).toEqual([0, 2, 0, 0, 0, 0, 0, 0, 0]);
      expect(screen.getByText(/ячеек возвращено 2/)).toBeInTheDocument();

      cleanup();
      updateCharacter.mockClear();
      const wizard: Character = {
        ...warlock,
        class: "Волшебник",
        subclass: "Школа воплощения",
        spellSlotsMax: [4, 2, 0, 0, 0, 0, 0, 0, 0],
        spellSlotsCurrent: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      };
      await renderSheet(wizard, { topic: WIZARD_TOPIC });
      fireEvent.click(screen.getByText("Короткий отдых"));
      expect(applied(wizard).spellSlotsCurrent).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    // --- длинный отдых (characters-long-rest) ---

    it("длинный отдых возвращает всё: хиты, половину костей, ячейки, ресурсы обоих отдыхов и ступень истощения", async () => {
      const CLERIC_DIE = classTopic("classes-cleric", "Жрец", "8", "5");
      const cleric: Character = {
        ...characterWithInventory(),
        class: "Жрец",
        subclass: "Домен жизни",
        race: "Эльф бездны",
        level: 8,
        maxHp: 60,
        currentHp: 3,
        hitDiceSpent: 8,
        conditions: ["Истощение (ур. 4)"],
        spellSlotsMax: [4, 3, 3, 2, 0, 0, 0, 0, 0],
        spellSlotsCurrent: [0, 1, 0, 0, 0, 0, 0, 0, 0],
        featureUses: [
          // «Проведение энергии» помечено short — длинный отдых возвращает и его тоже.
          { featureId: "channel-divinity", usesCurrent: 0 },
          // «Зов бездны» помечен long — короткий его не возвращал, длинный обязан.
          { featureId: "abyss-call", usesCurrent: 0 },
        ],
      };
      await renderSheet(cleric, { topic: CLERIC_DIE });

      fireEvent.click(screen.getByText("Длинный отдых"));
      const after = applied(cleric);

      expect(after.currentHp).toBe(60);
      expect(after.hitDiceSpent).toBe(4); // половина МАКСИМУМА: на 8 уровне четыре кости
      expect(after.spellSlotsCurrent).toEqual([4, 3, 3, 2, 0, 0, 0, 0, 0]);
      expect(after.featureUses).toContainEqual({ featureId: "channel-divinity", usesCurrent: 2 });
      expect(after.featureUses).toContainEqual({ featureId: "abyss-call", usesCurrent: 2 });
      expect(after.conditions).toContain("Истощение (ур. 3)");
      expect(after.conditions).not.toContain("Истощение (ур. 4)");
      expect(
        screen.getByText(/Длинный отдых: хиты 60\/60, Костей Хитов \+4, ячеек возвращено 11/),
      ).toBeInTheDocument();
      expect(screen.getByText(/истощение ур\. 3/)).toBeInTheDocument();
    });

    it("половина костей считается от максимума: на 1 уровне минимум одна, а больше потраченного не вернётся", async () => {
      const novice: Character = { ...characterWithInventory(), level: 1, maxHp: 12, currentHp: 4, hitDiceSpent: 1 };
      await renderSheet(novice);
      fireEvent.click(screen.getByText("Длинный отдых"));
      // Половина от одной кости — ноль, и без минимума кость не вернулась бы никогда.
      expect(applied(novice).hitDiceSpent).toBe(0);

      cleanup();
      updateCharacter.mockClear();
      const thrifty: Character = { ...characterWithInventory(), level: 8, maxHp: 60, currentHp: 9, hitDiceSpent: 1 };
      await renderSheet(thrifty);
      fireEvent.click(screen.getByText("Длинный отдых"));
      // Потрачена одна из восьми — вернётся ровно одна, а не половина уровня.
      expect(applied(thrifty).hitDiceSpent).toBe(0);
      expect(screen.getByText(/Костей Хитов \+1/)).toBeInTheDocument();
    });

    it("на нуле хитов длинный отдых не срабатывает, а короткий правилом не запрещён", async () => {
      const downed: Character = { ...characterWithInventory(), level: 4, maxHp: 30, currentHp: 0, hitDiceSpent: 4 };
      await renderSheet(downed);

      const longRest = screen.getByText("Длинный отдых");
      expect(longRest).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(longRest);

      expect(sounds.playLimitSound).toHaveBeenCalled();
      expect(updateCharacter).not.toHaveBeenCalled();
      expect(screen.getByText("Короткий отдых")).not.toHaveAttribute("aria-disabled");
    });

    it("отличие длинного от короткого — именно в ресурсах: short возвращают оба, long только длинный", async () => {
      const elf: Character = {
        ...characterWithInventory(),
        race: "Эльф бездны",
        level: 5,
        maxHp: 40,
        currentHp: 12,
        featureUses: [
          { featureId: "second-wind", usesCurrent: 0 },
          { featureId: "abyss-call", usesCurrent: 0 },
        ],
      };
      await renderSheet(elf);

      fireEvent.click(screen.getByText("Короткий отдых"));
      const afterShort = applied(elf);
      expect(afterShort.featureUses).toContainEqual({ featureId: "second-wind", usesCurrent: 1 });
      expect(afterShort.featureUses).toContainEqual({ featureId: "abyss-call", usesCurrent: 0 });

      fireEvent.click(screen.getByText("Длинный отдых"));
      const afterLong = applied(elf);
      expect(afterLong.featureUses).toContainEqual({ featureId: "second-wind", usesCurrent: 1 });
      expect(afterLong.featureUses).toContainEqual({ featureId: "abyss-call", usesCurrent: 2 });
    });
  });

  describe("подсказка про 0 хитов", () => {
    /** Лист персонажа с заданными хитами; `total` — что выдаст движок на `roll_dice`. */
    async function renderSheetAtHp(currentHp: number, total = 14, over: Partial<Character> = {}) {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [FIGHTER_TOPIC, CONDITIONS_TOPIC];
        if (cmd === "roll_dice") return { expression: DEATH_SAVE_EXPRESSION, rolls: [total], modifier: 0, total, dropped: null };
        return [];
      });
      const hero: Character = { ...characterWithInventory(), currentHp, ...over };
      mockState = baseState({ characters: [hero] });
      render(<CharactersPage />);
      await screen.findByText(/\(1к\d+\)/); // та же загрузка get_rules, что ждёт renderSheet выше
      return hero;
    }

    /**
     * Обновитель, который лист отдал кампании последним, применённый к
     * персонажу. Именно то, что уедет в сохранение, — вместе с воронкой
     * нормализации, которую CharactersPage надевает на каждый вызов.
     */
    function lastUpdater(): (character: Character) => Character {
      const calls = updateCharacter.mock.calls;
      expect(calls.length, "лист ничего не записал в персонажа").toBeGreaterThan(0);
      return calls[calls.length - 1][1] as (character: Character) => Character;
    }

    it("на нуле хитов блок виден: правило словами, кнопка и ссылка на раздел", async () => {
      await renderSheetAtHp(0);

      const block = screen.getByRole("region", { name: "Ноль хитов: Герой" });
      expect(block).toBeInTheDocument();
      // Числа правила видны игроку, не уходя на вкладку «Правила».
      expect(within(block).getByText(/10 и выше — успех/)).toBeInTheDocument();
      expect(within(block).getByText(/3 успеха — вы стабилизированы/)).toBeInTheDocument();
      expect(within(block).getByRole("button", { name: "Спасбросок от смерти" })).toBeInTheDocument();
      expect(within(block).getByText(/Правила → Урон и лечение/)).toBeInTheDocument();
    });

    it("выше нуля хитов блока нет вовсе", async () => {
      await renderSheetAtHp(1);

      expect(screen.queryByRole("region", { name: "Ноль хитов: Герой" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Спасбросок от смерти" })).toBeNull();
    });

    it("кнопка бросает к20 движком и пишет в журнал бросков метку с именем персонажа", async () => {
      await renderSheetAtHp(0, 17);

      fireEvent.click(screen.getByRole("button", { name: "Спасбросок от смерти" }));

      await waitFor(() => expect(recordRoll).toHaveBeenCalledTimes(1));
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("roll_dice", { expression: DEATH_SAVE_EXPRESSION });
      const [label, result] = recordRoll.mock.calls[0];
      expect(label).toBe(deathSaveRollLabel("Герой"));
      expect(result).toMatchObject({ total: 17 });
      expect(await screen.findByText(/Выпало 17/)).toBeInTheDocument();
    });

    it("бросок не трогает в персонаже ничего, кроме счёта спасбросков", async () => {
      const hero = await renderSheetAtHp(0, 3, { conditions: ["Ослеплённое"] });

      fireEvent.click(screen.getByRole("button", { name: "Спасбросок от смерти" }));

      await waitFor(() => expect(recordRoll).toHaveBeenCalledTimes(1));
      const after = lastUpdater()(hero);
      // Провал записан, а остальной лист остался тем же: ни хитов, ни состояний.
      expect(after.deathSaveFailures).toBe(1);
      expect(after.currentHp).toBe(0);
      expect(after.conditions).toEqual(["Ослеплённое"]);
      expect({ ...after, deathSaveFailures: hero.deathSaveFailures }).toEqual(hero);
    });

    it("отказ движка виден на листе, а в журнал бросков ничего не уходит", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
        if (cmd === "get_rules") return [FIGHTER_TOPIC, CONDITIONS_TOPIC];
        if (cmd === "roll_dice") throw new Error("кость не бросилась");
        return [];
      });
      mockState = baseState({ characters: [{ ...characterWithInventory(), currentHp: 0 }] });
      render(<CharactersPage />);
      await screen.findByText(/\(1к\d+\)/);

      fireEvent.click(screen.getByRole("button", { name: "Спасбросок от смерти" }));

      expect(await screen.findByText(/Бросок не удался: .*кость не бросилась/)).toBeInTheDocument();
      expect(recordRoll).not.toHaveBeenCalled();
    });

    describe("счёт спасбросков", () => {
      it("на нуле хитов видны оба ряда галочек, пустые", async () => {
        await renderSheetAtHp(0);

        const block = screen.getByRole("region", { name: "Ноль хитов: Герой" });
        expect(within(block).getByText(/Успехи: 0\/3/)).toBeInTheDocument();
        expect(within(block).getByText(/Провалы: 0\/3/)).toBeInTheDocument();
        expect(within(block).getByRole("checkbox", { name: "Успехи 1 из 3" })).not.toBeChecked();
      });

      it("выше нуля хитов галочек нет вовсе — заполненными они и не должны быть", async () => {
        await renderSheetAtHp(5, 14, { deathSaveSuccesses: 2, deathSaveFailures: 1 });

        expect(screen.queryByRole("checkbox", { name: "Успехи 1 из 3" })).toBeNull();
      });

      it("«10» и выше — успех, ниже — провал", async () => {
        const hero = await renderSheetAtHp(0, 12);
        fireEvent.click(screen.getByRole("button", { name: "Спасбросок от смерти" }));
        await waitFor(() => expect(recordRoll).toHaveBeenCalledTimes(1));
        expect(lastUpdater()(hero)).toMatchObject({ deathSaveSuccesses: 1, deathSaveFailures: 0, currentHp: 0 });

        cleanup();
        updateCharacter.mockClear();
        recordRoll.mockClear();
        const other = await renderSheetAtHp(0, 9);
        fireEvent.click(screen.getByRole("button", { name: "Спасбросок от смерти" }));
        await waitFor(() => expect(recordRoll).toHaveBeenCalledTimes(1));
        expect(lastUpdater()(other)).toMatchObject({ deathSaveSuccesses: 0, deathSaveFailures: 1, currentHp: 0 });
      });

      it("«1» даёт два провала сразу", async () => {
        const hero = await renderSheetAtHp(0, 1);

        fireEvent.click(screen.getByRole("button", { name: "Спасбросок от смерти" }));

        await waitFor(() => expect(recordRoll).toHaveBeenCalledTimes(1));
        expect(lastUpdater()(hero)).toMatchObject({ deathSaveFailures: 2 });
        expect(await screen.findByText(/Выпало 1 — «1» — 2 провала сразу\./)).toBeInTheDocument();
      });

      it("«20» возвращает 1 хит и обнуляет оба счётчика", async () => {
        const hero = await renderSheetAtHp(0, 20, { deathSaveSuccesses: 1, deathSaveFailures: 2 });

        fireEvent.click(screen.getByRole("button", { name: "Спасбросок от смерти" }));

        await waitFor(() => expect(recordRoll).toHaveBeenCalledTimes(1));
        expect(lastUpdater()(hero)).toMatchObject({
          currentHp: 1,
          deathSaveSuccesses: 0,
          deathSaveFailures: 0,
        });
      });

      it("счёт идёт от СВЕЖЕГО персонажа, а не от снимка рендера: два броска подряд не складываются в один", async () => {
        // Запись 136, то же семейство дефектов, что поймала карточка безумия:
        // обновитель, считающий от снимка своего рендера, терял второй бросок.
        const hero = await renderSheetAtHp(0, 7);

        fireEvent.click(screen.getByRole("button", { name: "Спасбросок от смерти" }));
        await waitFor(() => expect(recordRoll).toHaveBeenCalledTimes(1));
        const updater = lastUpdater();

        const first = updater(hero);
        expect(first.deathSaveFailures).toBe(1);
        expect(updater(first).deathSaveFailures).toBe(2);
      });

      it("три успеха — стабилизирован словом, и кнопка больше не бросает", async () => {
        await renderSheetAtHp(0, 14, { deathSaveSuccesses: 3 });

        expect(screen.getByText(/Стабилизирован/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Спасбросок от смерти" })).toBeDisabled();
        // Хиты стабилизированного по-прежнему ноль — блок на месте.
        expect(screen.getByRole("region", { name: "Ноль хитов: Герой" })).toBeInTheDocument();
      });

      it("три провала — смерть словом, но персонаж на листе остаётся целиком", async () => {
        await renderSheetAtHp(0, 14, { deathSaveFailures: 3 });

        expect(screen.getByText(/Мёртв/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Спасбросок от смерти" })).toBeDisabled();
        // Ни удаления, ни прятанья: имя и поле хитов на месте.
        expect(screen.getByText("Герой")).toBeInTheDocument();
        expect(screen.getByLabelText("Текущие хиты: Герой")).toHaveValue(0);
        expect(removeCharacter).not.toHaveBeenCalled();
      });

      it("галочка ставится руками: нажатие на третью клетку даёт счёт 3", async () => {
        const hero = await renderSheetAtHp(0, 14, { deathSaveFailures: 1 });

        fireEvent.click(screen.getByRole("checkbox", { name: "Провалы 3 из 3" }));

        expect(lastUpdater()(hero)).toMatchObject({ deathSaveFailures: 3 });
      });

      it("повторное нажатие на отмеченную клетку снимает её", async () => {
        const hero = await renderSheetAtHp(0, 14, { deathSaveSuccesses: 2 });

        fireEvent.click(screen.getByRole("checkbox", { name: "Успехи 2 из 3" }));

        expect(lastUpdater()(hero)).toMatchObject({ deathSaveSuccesses: 1 });
      });
    });

    describe("обнуление счёта при подъёме хитов — одна воронка на все пути", () => {
      it("ввод игрока: поднял хиты в поле — счёт очищен", async () => {
        const hero = await renderSheetAtHp(0, 14, { deathSaveSuccesses: 1, deathSaveFailures: 2 });

        fireEvent.change(screen.getByLabelText("Текущие хиты: Герой"), { target: { value: "4" } });

        expect(lastUpdater()(hero)).toMatchObject({
          currentHp: 4,
          deathSaveSuccesses: 0,
          deathSaveFailures: 0,
        });
      });

      it("Кость Хитов: лечение костью очищает счёт тем же путём", async () => {
        const hero = await renderSheetAtHp(0, 6, { deathSaveSuccesses: 1, deathSaveFailures: 2, level: 3, maxHp: 24 });

        fireEvent.click(screen.getByTitle(/Потратить Кость Хитов/));

        await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
        const after = lastUpdater()(hero);
        expect(after.currentHp).toBeGreaterThan(0);
        expect(after.deathSaveSuccesses).toBe(0);
        expect(after.deathSaveFailures).toBe(0);
      });

      it("левел-ап: прибавка хитов очищает счёт тем же путём", async () => {
        const hero = await renderSheetAtHp(0, 14, {
          deathSaveSuccesses: 1,
          deathSaveFailures: 2,
          level: 1,
          maxHp: 12,
        });

        fireEvent.click(screen.getByText("Повысить уровень"));

        const after = lastUpdater()(hero);
        expect(after.level).toBe(2);
        expect(after.currentHp).toBeGreaterThan(0);
        expect(after.deathSaveSuccesses).toBe(0);
        expect(after.deathSaveFailures).toBe(0);
      });

      it("запись, не поднимающая хиты, счёт НЕ стирает", async () => {
        // Иначе любое движение по листу на нуле хитов обнуляло бы спасброски.
        const hero = await renderSheetAtHp(0, 14, { deathSaveSuccesses: 1, deathSaveFailures: 2 });

        const conditionInput = screen.getByPlaceholderText(/Состояние/);
        fireEvent.change(conditionInput, { target: { value: "Отравленное" } });
        const row = conditionInput.closest(".character-card__add-row") as HTMLElement;
        fireEvent.click(within(row).getByText("Добавить"));

        expect(lastUpdater()(hero)).toMatchObject({ deathSaveSuccesses: 1, deathSaveFailures: 2 });
      });
    });
  });

  /**
   * Состояния с числами НА ЛИСТЕ — то же, что проверяется глазами в живом окне
   * («Критерии тестирования» карточки characters-conditions-to-numbers), но
   * читается с плиток, а не со скриншота. Сами числа сверены с `rules.json`
   * `[14]` в `effectiveStats.test.ts`; здесь проверяется, что лист показывает
   * именно их, а не ярлык рядом с прежним числом.
   */
  describe("состояния доходят до чисел на плитках", () => {
    /** Персонаж «Критериев тестирования»: скорость 30, максимум 40. */
    function sheetHero(conditions: string[], extra: Partial<Character> = {}): Character {
      return { ...characterWithInventory(), maxHp: 40, currentHp: 40, speedFeet: 30, conditions, ...extra };
    }

    function renderWith(conditions: string[], extra: Partial<Character> = {}) {
      mockState = baseState({ characters: [sheetHero(conditions, extra)] });
      render(<CharactersPage />);
    }

    it("«Схваченное»: 30 фт → 0 фт, и снятие возвращает 30", () => {
      renderWith(["Схваченное"]);
      expectStat("Скорость", "0 фт");
      expect(screen.getByText("Схваченное — 0 фт, и бонусы её не поднимают")).toBeInTheDocument();
      cleanup();
      renderWith([]);
      expectStat("Скорость", "30 фт");
    });

    it("«Опутанный»: 30 фт → 0 фт", () => {
      renderWith(["Опутанный"]);
      expectStat("Скорость", "0 фт");
    });

    it("«Истощение (ур. 2)» — 15 фт, «Истощение (ур. 5)» — 0 фт", () => {
      renderWith(["Истощение (ур. 2)"]);
      expectStat("Скорость", "15 фт");
      cleanup();
      renderWith(["Истощение (ур. 5)"]);
      expectStat("Скорость", "0 фт");
    });

    it("«Парализованное» — не может двигаться, лист показывает 0 фт", () => {
      renderWith(["Парализованное"]);
      expectStat("Скорость", "0 фт");
    });

    it("нагруженный под «Схваченным» показывает 0 фт, а не отрицательное число", () => {
      const base = characterWithInventory();
      renderWith(["Схваченное"], {
        abilities: { ...base.abilities, strength: 10 },
        inventory: [{ id: "load-1", name: "Груз", quantity: 1, notes: "", weightLb: 151 }],
      });
      expectStat("Скорость", "0 фт");
      expect(screen.getByText(/⚠ Сильно нагружен — скорость 0 фт \(было 30 фт\)/)).toBeInTheDocument();
    });

    it("«Истощение (ур. 4)»: максимум 40 → 20, снятие — снова 40", () => {
      renderWith(["Истощение (ур. 4)"]);
      expect(screen.getByText("/20")).toBeInTheDocument();
      expect(screen.getByText("истощение ур. 4 — максимум вдвое, в сохранении 40")).toBeInTheDocument();
      cleanup();
      renderWith([]);
      expect(screen.getByText("/40")).toBeInTheDocument();
    });

    it("ур. 4 обрезает показанные хиты, а в сохранение не пишет ничего", () => {
      renderWith(["Истощение (ур. 4)"]);
      expect((screen.getByLabelText("Текущие хиты: Герой") as HTMLInputElement).value).toBe("20");
      // Показ — показом: от самого показа в персонажа не ушло ни одной записи.
      expect(updateCharacter).not.toHaveBeenCalled();
    });

    it("хиты ниже эффективного максимума лист не трогает", () => {
      renderWith(["Истощение (ур. 4)"], { currentHp: 12 });
      expect((screen.getByLabelText("Текущие хиты: Герой") as HTMLInputElement).value).toBe("12");
    });

    it("длинный отдых при ур. 4 называет послеотдыховый максимум, а в сохранение пишет хранимый", async () => {
      renderWith(["Истощение (ур. 4)"], { currentHp: 7 });
      await act(async () => {
        fireEvent.click(screen.getByText("Длинный отдых"));
      });
      // Ступень снята отдыхом (ур. 4 → ур. 3), и половина максимума ушла с ней.
      expect(screen.getByText(/хиты 40\/40/)).toBeInTheDocument();
      const updater = updateCharacter.mock.calls[updateCharacter.mock.calls.length - 1][1] as (
        c: Character,
      ) => Character;
      const after = updater(sheetHero(["Истощение (ур. 4)"], { currentHp: 7 }));
      expect(after.maxHp).toBe(40);
      expect(after.currentHp).toBe(40);
      expect(after.conditions).toEqual(["Истощение (ур. 3)"]);
    });

    it("состояние без чисел плитки не двигает", () => {
      renderWith(["Отравленное"]);
      expectStat("Скорость", "30 фт");
      expect(screen.getByText("/40")).toBeInTheDocument();
    });
  });

  /**
   * Лист нашего класса — приёмка `characters-class-blood-hunter`.
   *
   * ПОЧЕМУ `topics` КЛАССА НЕ СОДЕРЖАТ. Кровавого охотника нет ни в этом
   * файле, ни в `rules.json`: на лист он приезжает через `playableClasses`
   * (ownRuleTopics.ts), откуда `extractClassHitDice` берёт его кость хитов.
   * Поэтому пробы ниже заодно сторожат тот конец шва, который не видно в
   * мастере: отбери у листа точку регистрации — и кость хитов класса
   * пропадёт, а с ней и левел-ап.
   */
  describe("Кровавый охотник на листе персонажа", () => {
    const HUMAN_TOPIC: RuleTopic = {
      id: "races-human",
      category: "races",
      title: "Человек",
      sourceUrl: "",
      blocks: [],
    };

    /** Кровавый охотник заданного уровня с полными счётчиками этого уровня. */
    function bloodHunter(level: number, featureUses: { featureId: string; usesCurrent: number }[]): Character {
      return {
        ...characterWithInventory(),
        name: "Гаррен",
        class: "Кровавый охотник",
        level,
        // Кость хитов 1к10, модификатор Телосложения 0: 10 + 6 за каждый уровень после первого.
        maxHp: 10 + (level - 1) * 6,
        currentHp: 10 + (level - 1) * 6,
        // Состояние — то же, по которому levelUpRunner ждёт загрузки справочника.
        conditions: ["Ослеплённое"],
        // Боевой стиль класс выбирает на 2 уровне: персонаж 2 уровня и выше уже
        // с ним, иначе левел-ап справедливо остановится и спросит (см. пробы ниже).
        fightingStyle: level >= 2 ? "Дуэлянт" : "",
        // Столько проклятий крови, сколько открыто на этом уровне (1 / 2 с 6 /
        // 3 с 10): иначе левел-ап справедливо остановится и спросит недостающие.
        classChoices: {
          "blood-curses": ["blood-curse-marked", "blood-curse-eyes", "blood-curse-binding"].slice(
            0,
            level >= 10 ? 3 : level >= 6 ? 2 : 1,
          ),
        },
        featureUses,
      };
    }

    it("показывает кость гемокрафта, число известных проклятий и оба счётчика 6 уровня", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [HUMAN_TOPIC, CONDITIONS_TOPIC] : [],
      );
      mockState = baseState({
        characters: [
          bloodHunter(6, [{ featureId: "blood-curse", usesCurrent: 2 }, { featureId: "brand-of-castigation", usesCurrent: 1 }]),
        ],
      });
      render(<CharactersPage />);

      const block = (await screen.findByText(/Особенности класса/)).closest("details") as HTMLElement;
      expect(within(block).getByText("Проклятая кровь")).toBeInTheDocument();
      expect(within(block).getByText(/2\/2 использование/)).toBeInTheDocument();
      // «Клеймо наказания» на листе названо дважды и это верно: строка счётчика
      // и текст особенности 6 уровня — разные вещи с одним именем.
      expect(within(block).getAllByText("Клеймо наказания")).toHaveLength(2);
      expect(within(block).getByText(/1\/1 использование/)).toBeInTheDocument();
      // Растущие числа таблицы: 6 уровень — кость 1к6, известных проклятий два.
      expect(within(block).getByText("Кость гемокрафта: 1к6")).toBeInTheDocument();
      expect(within(block).getByText("Известные проклятья крови: 2")).toBeInTheDocument();
      // Третий путь кости хитов (после максимума хитов и левел-апа) — счётчик
      // Костей Хитов: лицо кости тоже приходит из classHitDiceByTitle.
      expect(screen.getByText("6/6 (1к10)")).toBeInTheDocument();
    });

    it("проклятье тратится, и длинный отдых возвращает счётчик полным", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [HUMAN_TOPIC, CONDITIONS_TOPIC] : [],
      );
      const start = bloodHunter(6, [{ featureId: "blood-curse", usesCurrent: 2 }, { featureId: "brand-of-castigation", usesCurrent: 1 }]);
      mockState = baseState({ characters: [start] });
      const { rerender } = render(<CharactersPage />);
      await screen.findByText(/Особенности класса/);

      fireEvent.click(screen.getByTitle("Потратить: Проклятая кровь"));
      let updater = updateCharacter.mock.calls[updateCharacter.mock.calls.length - 1][1] as (c: Character) => Character;
      const spent = updater(start);
      expect(spent.featureUses).toContainEqual({ featureId: "blood-curse", usesCurrent: 1 });

      mockState = baseState({ characters: [spent] });
      rerender(<CharactersPage />);
      await act(async () => {
        fireEvent.click(screen.getByText("Длинный отдых"));
      });
      updater = updateCharacter.mock.calls[updateCharacter.mock.calls.length - 1][1] as (c: Character) => Character;
      const rested = updater(spent);

      // Счётчик помечен «короткий или длинный отдых», и длинный берёт и такие.
      expect(rested.featureUses).toContainEqual({ featureId: "blood-curse", usesCurrent: 2 });
      expect(rested.featureUses).toContainEqual({ featureId: "brand-of-castigation", usesCurrent: 1 });
    });

    it("левел-ап 5 → 6 растит хиты своей костью, даёт второе проклятье и кость 1к6", async () => {
      // Орден уже выбран — иначе левел-ап перехватила бы панель выбора ордена
      // (chosenAtLevel 3, а персонаж до сих пор без архетипа).
      const run = levelUpRunner(HUMAN_TOPIC, {
        ...bloodHunter(5, [{ featureId: "blood-curse", usesCurrent: 1 }]),
        subclass: "Орден мутантов",
      });
      await run.ready();

      // На 6 уровне открывается второе известное проклятье, и левел-ап
      // останавливается, чтобы спросить ЕГО — см. отдельные пробы ниже.
      run.levelUp(() => {
        fireEvent.click(screen.getByText("Проклятье слепоты").closest("label")!.querySelector("input")!);
        fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      });
      expect(run.char.level).toBe(6);
      // 1к10 из текста статьи: 10 + 5 × (6 + 0).
      expect(run.char.maxHp).toBe(40);
      expect(run.char.featureUses).toContainEqual({ featureId: "blood-curse", usesCurrent: 2 });
      expect(run.char.featureUses).toContainEqual({ featureId: "brand-of-castigation", usesCurrent: 1 });
      expect(screen.getByText("Кость гемокрафта: 1к6")).toBeInTheDocument();
    });

    /**
     * Классовый выбор — общий механизм (`CLASS_CHOICES`), и проклятья крови
     * его первый пользователь. Пробы ниже сторожат ровно то, что требует
     * карточка: выбор приходит на уровне, где вырос столбец известного (6 и
     * 10), уже выбранное не переспрашивается, и на листе оно видно ПОИМЁННО.
     */
    it("левел-ап 5 → 6 спрашивает второе проклятье крови, не переспрашивая первое", async () => {
      const run = levelUpRunner(HUMAN_TOPIC, {
        ...bloodHunter(5, [{ featureId: "blood-curse", usesCurrent: 1 }]),
        subclass: "Орден мутантов",
      });
      await run.ready();
      expect(run.char.classChoices["blood-curses"]).toEqual(["blood-curse-marked"]);

      run.levelUp(() => {
        expect(screen.getByText(/Выберите «Проклятья крови» \(6 уровень\)/)).toBeInTheDocument();
        const labels = Array.from(document.querySelectorAll('input[name="class-choice-option"]')).map(
          (input) => (input.closest("label") as HTMLElement).textContent ?? "",
        );
        // Семь из восьми: выученное на 1 уровне «Проклятье метки» выброшено.
        expect(labels).toHaveLength(7);
        expect(labels.join(" | ")).not.toMatch(/Проклятье метки/);

        fireEvent.click(screen.getByText("Проклятье слепоты").closest("label")!.querySelector("input")!);
        fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      });

      expect(run.char.level).toBe(6);
      // Добавилось, а не заменило: первое проклятье на месте.
      expect(run.char.classChoices["blood-curses"]).toEqual(["blood-curse-marked", "blood-curse-eyes"]);
      // На листе — поимённо, а не числом.
      expect(screen.getByText("Проклятья крови:")).toBeInTheDocument();
      expect(screen.getByText("Проклятье метки")).toBeInTheDocument();
      expect(screen.getByText("Проклятье слепоты")).toBeInTheDocument();
      // Число известного при этом никуда не делось — это столбец таблицы.
      expect(screen.getByText("Известные проклятья крови: 2")).toBeInTheDocument();
    });

    it("на 7 уровне ничего не переспрашивает — столбец известного не вырос", async () => {
      const run = levelUpRunner(HUMAN_TOPIC, {
        ...bloodHunter(6, [{ featureId: "blood-curse", usesCurrent: 2 }]),
        subclass: "Орден мутантов",
      });
      await run.ready();

      run.levelUp(() => {
        expect(screen.queryByText(/Выберите «Проклятья крови»/)).not.toBeInTheDocument();
      });
      expect(run.char.level).toBe(7);
      expect(run.char.classChoices["blood-curses"]).toHaveLength(2);
    });

    it("левел-ап 9 → 10 спрашивает третье проклятье, и выбранное переживает перезапуск", async () => {
      const run = levelUpRunner(HUMAN_TOPIC, {
        ...bloodHunter(9, [{ featureId: "blood-curse", usesCurrent: 2 }]),
        subclass: "Орден мутантов",
      });
      await run.ready();

      run.levelUp(() => {
        expect(screen.getByText(/Выберите «Проклятья крови» \(10 уровень\)/)).toBeInTheDocument();
        fireEvent.click(screen.getByText("Проклятье привязки").closest("label")!.querySelector("input")!);
        fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      });

      expect(run.char.classChoices["blood-curses"]).toEqual([
        "blood-curse-marked",
        "blood-curse-eyes",
        "blood-curse-binding",
      ]);
      // «Переживает перезапуск» на этом уровне проверяется тем же, чем его
      // переживают все поля персонажа: выбор лежит в `Character` и уходит в
      // сохранение. Что лист читает его из сохранения, а не из своей памяти,
      // показывает отдельный рендер того же персонажа с нуля.
      cleanup();
      mockState = baseState({ characters: [run.char] });
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [HUMAN_TOPIC, CONDITIONS_TOPIC] : [],
      );
      render(<CharactersPage />);

      await screen.findByText(/Особенности класса/);
      expect(screen.getByText("Проклятье метки")).toBeInTheDocument();
      expect(screen.getByText("Проклятье слепоты")).toBeInTheDocument();
      expect(screen.getByText("Проклятье привязки")).toBeInTheDocument();
      expect(screen.getByText("Известные проклятья крови: 3")).toBeInTheDocument();
    });

    it("персонажу из сохранения без выбора вовсе левел-ап спрашивает всё недостающее сразу", async () => {
      // Поле `classChoices` появилось вместе с механизмом, и у сохранений до
      // него оно пустое. Лист обязан догнать выбор, а не молча оставить
      // персонажа без проклятий: на 6 уровне открыто два, выбрано ноль.
      const run = levelUpRunner(HUMAN_TOPIC, {
        ...bloodHunter(5, [{ featureId: "blood-curse", usesCurrent: 1 }]),
        subclass: "Орден мутантов",
        classChoices: {},
      });
      await run.ready();

      run.levelUp(() => {
        expect(screen.getByText(/ещё 2 варианта/)).toBeInTheDocument();
        const inputs = Array.from(
          document.querySelectorAll<HTMLInputElement>('input[name="class-choice-option"]'),
        );
        // Ни одно не выброшено: выбранных у персонажа нет.
        expect(inputs).toHaveLength(8);
        fireEvent.click(inputs[0]);
        fireEvent.click(inputs[1]);
        fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      });

      expect(run.char.classChoices["blood-curses"]).toHaveLength(2);
    });

    /**
   * Орден — архетип с четырьмя вариантами, поэтому левел-ап на 3 уровне
   * ОБЯЗАН остановиться и спросить: автоподстановка первого отдала бы игроку
   * орден, которого он не выбирал.
     */
    it("левел-ап 2 → 3 спрашивает орден из четырёх и приносит его умения 3 уровня", async () => {
      const run = levelUpRunner(HUMAN_TOPIC, bloodHunter(2, [{ featureId: "blood-curse", usesCurrent: 1 }]));
      await run.ready();

      run.levelUp(() => {
        // Панель открылась вместо мгновенного левел-апа.
        expect(screen.getByText("Выберите архетип (3 уровень):")).toBeInTheDocument();
        const labels = Array.from(document.querySelectorAll('input[name="subclass-choice"]')).map(
          (input) => (input.closest("label") as HTMLElement).textContent,
        );
        expect(labels).toHaveLength(4);
        expect(labels.join(" | ")).toMatch(/Орден призрачных убийц/);
        expect(labels.join(" | ")).toMatch(/Орден ликантропов/);

        fireEvent.click(screen.getByText("Орден ликантропов").closest("label")!.querySelector("input")!);
        fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      });

      expect(run.char.level).toBe(3);
      expect(run.char.subclass).toBe("Орден ликантропов");
      // Умения ордена 3 уровня видны на листе; умения других орденов — нет.
      expect(screen.getByText("Обострённые чувства")).toBeInTheDocument();
      expect(screen.getByText("Гибридная трансформация")).toBeInTheDocument();
      expect(screen.queryByText("Обряд рассвета")).not.toBeInTheDocument();
    });

    it("Орден осквернённых душ поднимает норму заговоров с нуля до двух, ячеек не даёт", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: unknown) =>
        cmd === "get_rules" ? [HUMAN_TOPIC, CONDITIONS_TOPIC] : [],
      );
      mockState = baseState({
        characters: [
          {
            ...bloodHunter(3, [{ featureId: "blood-curse", usesCurrent: 1 }]),
            subclass: "Орден осквернённых душ",
          },
        ],
      });
      render(<CharactersPage />);

      const block = (await screen.findByText(/Особенности класса/)).closest("details") as HTMLElement;
      expect(within(block).getByText(/Заговоры сверх нормы класса: 2/)).toBeInTheDocument();
      // Ячеек «Магии договора» на листе нет: у класса ячеек не бывает, а запаса
      // ячеек у архетипа в приложении нет вовсе.
      expect(within(block).queryByText(/Ячейки заклинаний/)).not.toBeInTheDocument();
    });

    /**
     * Боевой стиль существующим полем `Character.fightingStyle` — тем же, что у
     * Воина. Разница одна и она в данных: Воин выбирает стиль на 1 уровне, и
     * его спрашивает мастер создания, а кровавый охотник на 2 — и спросить
     * может только левел-ап. Стилей у него четыре из шести: «Обороны» и
     * «Защиты» в файле владельца нет.
     */
    it("левел-ап 1 → 2 спрашивает боевой стиль из четырёх и пишет его тем же полем, что у Воина", async () => {
      const run = levelUpRunner(HUMAN_TOPIC, bloodHunter(1, [{ featureId: "blood-curse", usesCurrent: 1 }]));
      await run.ready();
      expect(run.char.fightingStyle).toBe("");

      run.levelUp(() => {
        expect(screen.getByText("Выберите боевой стиль (2 уровень):")).toBeInTheDocument();
        const labels = Array.from(document.querySelectorAll('input[name="fighting-style-choice"]')).map(
          (input) => (input.closest("label") as HTMLElement).textContent ?? "",
        );
        expect(labels).toHaveLength(4);
        // «Обороны» и «Защиты» у класса нет — иначе игрок получил бы +1 КД,
        // которого PDF ему не даёт.
        expect(labels.join(" | ")).not.toMatch(/Оборона/);
        expect(labels.join(" | ")).not.toMatch(/Защита/);

        const greatWeapon = Array.from(document.querySelectorAll('input[name="fighting-style-choice"]')).find(
          (input) => (input.closest("label") as HTMLElement).textContent?.includes("Сражение большим оружием"),
        )!;
        fireEvent.click(greatWeapon);
        fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      });

      expect(run.char.level).toBe(2);
      expect(run.char.fightingStyle).toBe("Сражение большим оружием");
      // Выбор виден на листе, а не только лежит в сохранении.
      expect(screen.getByText(/Боевой стиль:/)).toBeInTheDocument();
      expect(screen.getByText("Сражение большим оружием")).toBeInTheDocument();
    });

    it("выбранный стиль больше не переспрашивается — левел-ап 2 → 3 сразу идёт к ордену", async () => {
      const run = levelUpRunner(HUMAN_TOPIC, {
        ...bloodHunter(2, [{ featureId: "blood-curse", usesCurrent: 1 }]),
        fightingStyle: "Стрельба из лука",
      });
      await run.ready();

      run.levelUp(() => {
        expect(screen.queryByText("Выберите боевой стиль (3 уровень):")).not.toBeInTheDocument();
        expect(screen.getByText("Выберите архетип (3 уровень):")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Подтвердить и повысить уровень"));
      });

      expect(run.char.level).toBe(3);
      expect(run.char.fightingStyle).toBe("Стрельба из лука");
    });
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

/**
 * Снижение истощения читает и пишет строку состояния ОДНИМ владельцем формата
 * (`exhaustionLevelName`), а не своим регэкспом на месте. Проба отрицательная:
 * поменяй в `withExhaustionReduced` высший уровень на любой другой — краснеет
 * «снижается только высшая».
 */
describe("withExhaustionReduced", () => {
  it("первый уровень истощения снимается совсем", () => {
    expect(withExhaustionReduced(["Отравленное", "Истощение (ур. 1)"])).toEqual(["Отравленное"]);
  });

  it("остальные уровни опускаются на одну ступень", () => {
    expect(withExhaustionReduced(["Истощение (ур. 4)"])).toEqual(["Истощение (ур. 3)"]);
  });

  it("шестой уровень — смерть по таблице SRD, но отдых всё равно снижает его до пятого", () => {
    expect(withExhaustionReduced(["Истощение (ур. 6)"])).toEqual(["Истощение (ур. 5)"]);
  });

  it("без истощения список состояний не меняется вовсе", () => {
    const conditions = ["Ослеплённое", "Отравленное"];
    expect(withExhaustionReduced(conditions)).toBe(conditions);
  });

  it("несколько строк истощения разом: снижается только высшая, и двойника не появляется", () => {
    expect(withExhaustionReduced(["Истощение (ур. 2)", "Истощение (ур. 1)"])).toEqual(["Истощение (ур. 1)"]);
  });
});

describe("clampCurrentHp", () => {
  it("оставляет число внутри предела как есть", () => {
    expect(clampCurrentHp(7, 12)).toBe(7);
  });

  it("не пускает хиты ниже нуля, и ноль — разрешённое значение", () => {
    expect(clampCurrentHp(-4, 12)).toBe(0);
    expect(clampCurrentHp(0, 12)).toBe(0);
  });

  it("не пускает хиты выше максимума", () => {
    expect(clampCurrentHp(99, 12)).toBe(12);
    expect(clampCurrentHp(12, 12)).toBe(12);
  });

  it("хиты целые: дробное отбрасывается к меньшему по модулю", () => {
    expect(clampCurrentHp(5.7, 12)).toBe(5);
  });

  it("неразобранное число не роняет лист, а читается как ноль", () => {
    expect(clampCurrentHp(Number.NaN, 12)).toBe(0);
  });
});
