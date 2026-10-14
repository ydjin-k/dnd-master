import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CombatPage } from "./CombatPage";
import {
  emptyCoins,
  type CampaignState,
  type Combatant,
  type MonsterTemplate,
} from "../../state/types";

function template(id: string, name: string, dexterity: number): MonsterTemplate {
  return {
    id,
    name,
    origin: "srd",
    maxHp: 11,
    hitDice: "2d8+2",
    armorClass: 13,
    speedFeet: 40,
    attackBonus: 4,
    damageDice: "2d4+2",
    challengeRating: "1/4",
    creatureType: "зверь",
    size: "Средний",
    description: "",
    abilities: { strength: 12, dexterity, constitution: 12, intelligence: 3, wisdom: 12, charisma: 6 },
    passivePerception: 13,
    traits: [],
    actions: [],
    imageAsset: null,
  };
}

// Нарочно не по алфавиту: порядок в выдаче поиска обязан дать сортировка.
const bestiary: MonsterTemplate[] = [
  template("winter-wolf", "Зимний волк", 13),
  template("goblin", "Гоблин", 14),
  template("wolf", "Волк", 15),
];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "get_bestiary") return bestiary;
    return null;
  }),
}));

function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    travel: null,
    id: "c1",
    campaignName: "Тест",
    characters: [
      {
        halfDaysWithoutFood: 0,
        id: "hero",
        name: "Герой",
        race: "",
        class: "",
        subclass: "",
        background: "",
        personalityTraits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        alignment: "",
        gender: "",
        portraitVariant: 1,
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
        maxHp: 12,
        currentHp: 12,
        deathSaveSuccesses: 0,
        deathSaveFailures: 0,
        hitDiceSpent: 0,
        armorClass: 14,
        speedFeet: 30,
        initiative: 3,
        passivePerception: 11,
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
    journal: [],
    combat: null,
   
    ...overrides,
  };
}

const addToCombat = vi.fn();
const rollInitiative = vi.fn();
const nextTurn = vi.fn();
const applyDamage = vi.fn();
const removeFromCombat = vi.fn();
const transferHpToSheets = vi.fn();
const endCombat = vi.fn();

let mockState = baseState();
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({
    state: mockState,
    addToCombat,
    rollInitiative,
    nextTurn,
    applyDamage,
    removeFromCombat,
    transferHpToSheets,
    endCombat,
  }),
}));

function wolf(number: number, d20: number): Combatant {
  return {
    id: `monster-wolf-${number}`,
    source: { kind: "monster", templateId: "wolf", number },
    maxHp: 11,
    currentHp: 11,
    initiativeRoll: { d20, dexModifier: 2 },
  };
}

/** Герой и пять волков, брошено всем; указатель на четвёртом месте. */
function combatInProgress(): CampaignState["combat"] {
  return {
    combatants: [
      wolf(1, 5),
      wolf(2, 12),
      {
        id: "hero",
        source: { kind: "character", characterId: "hero" },
        maxHp: 12,
        currentHp: 12,
        initiativeRoll: { d20: 15, dexModifier: 3 },
      },
      wolf(3, 20),
      wolf(4, 1),
      wolf(5, 9),
    ],
    currentTurnIndex: 3,
    round: 2,
  };
}

describe("CombatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = baseState();
  });

  it("существа добавляются поиском, а не из кучи: пять волков одним действием", async () => {
    render(<CombatPage />);
    const search = screen.getByLabelText("Поиск существ");
    expect(search).toHaveClass("dm-field--search");

    fireEvent.change(search, { target: { value: "волк" } });
    const names = (await screen.findAllByText(/волк/i)).map((el) => el.textContent);
    expect(names).toEqual(["Волк", "Зимний волк"]);
    expect(screen.queryByText("Гоблин")).not.toBeInTheDocument();

    // Бестиарий загружен, а пустой запрос не высыпает его кучей.
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.queryByText("Волк")).not.toBeInTheDocument();
    expect(screen.queryByText("Гоблин")).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "волк" } });

    fireEvent.change(screen.getByLabelText("Сколько: Волк"), { target: { value: "5" } });
    const wolfRow = screen.getByText("Волк").closest("li")!;
    fireEvent.click(within(wolfRow).getByText("Добавить"));
    expect(addToCombat).toHaveBeenCalledWith(["wolf", "wolf", "wolf", "wolf", "wolf"], []);
  });

  it("линия стоит по инициативе сверху вниз, с номерами, отметками и указателем", async () => {
    mockState = baseState({ combat: combatInProgress() });
    render(<CombatPage />);
    await screen.findByText("Волк 3");

    const rows = screen.getAllByTestId("combat-row");
    const text = rows.map((r) => r.querySelector(".combat-line__name")!.textContent);
    expect(text).toEqual(["Волк 3", "Герой", "Волк 2", "Волк 5", "Волк 1", "Волк 4"]);
    expect(rows[1]).toHaveTextContent("18 (к20: 15 +3)");
    expect(rows.slice(0, 3).every((r) => r.textContent!.includes("походил"))).toBe(true);
    expect(rows[3]).toHaveAttribute("aria-current", "step");
    expect(rows[3]).toHaveTextContent("его ход");
    expect(rows[4]).not.toHaveTextContent("походил");
    expect(screen.getByText("Раунд 2")).toBeInTheDocument();
    expect(screen.getByText("В бою")).toBeDisabled();
  });

  it("«Рассчитать инициативу» шлёт модификатор с листа персонажа и из Ловкости существа", async () => {
    mockState = baseState({ combat: combatInProgress() });
    render(<CombatPage />);
    await screen.findByText("Волк 3");

    fireEvent.click(screen.getByText("Рассчитать инициативу"));
    expect(rollInitiative).toHaveBeenCalledWith({
      hero: 3,
      "monster-wolf-1": 2,
      "monster-wolf-2": 2,
      "monster-wolf-3": 2,
      "monster-wolf-4": 2,
      "monster-wolf-5": 2,
    });
    fireEvent.click(screen.getByText("Следующий"));
    expect(nextTurn).toHaveBeenCalledTimes(1);
  });

  it("хиты отнимаются и возвращаются любым числом; перенос и конец боя — отдельные кнопки", async () => {
    mockState = baseState({ combat: combatInProgress() });
    render(<CombatPage />);
    await screen.findByText("Волк 2");

    fireEvent.change(screen.getByLabelText("Хиты: Волк 2"), { target: { value: "7" } });
    fireEvent.click(screen.getByLabelText("Отнять хиты: Волк 2"));
    expect(applyDamage).toHaveBeenLastCalledWith("monster-wolf-2", 7);
    fireEvent.click(screen.getByLabelText("Вернуть хиты: Волк 2"));
    expect(applyDamage).toHaveBeenLastCalledWith("monster-wolf-2", -7);
    expect(transferHpToSheets).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Перенести хиты в листы"));
    expect(transferHpToSheets).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Закончить бой"));
    fireEvent.click(screen.getByText("Да, закончить"));
    expect(endCombat).toHaveBeenCalledTimes(1);
  });

  it("участника можно убрать: на сервер уходит его место в линии, а не в массиве", async () => {
    mockState = baseState({ combat: combatInProgress() });
    render(<CombatPage />);
    await screen.findByText("Волк 2");

    // Линия: Волк 3, Герой, Волк 2, ... — Волк 2 третий, хотя в массиве второй.
    fireEvent.click(screen.getByLabelText("Убрать из боя: Волк 2"));
    expect(removeFromCombat).toHaveBeenCalledWith("monster-wolf-2", 2);
  });

  it("«Закончить бой» сначала спрашивает и называет персонажей с неперенесёнными хитами", async () => {
    const combat = combatInProgress()!;
    combat.combatants = combat.combatants.map((c) =>
      c.id === "hero" ? { ...c, currentHp: 4 } : c,
    );
    mockState = baseState({ combat });
    render(<CombatPage />);
    await screen.findByText("Волк 2");

    fireEvent.click(screen.getByText("Закончить бой"));
    expect(endCombat).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Закончить бой?" });
    expect(dialog).toHaveTextContent("Хиты не перенесены в листы: Герой.");

    fireEvent.click(within(dialog).getByText("Отмена"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(endCombat).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Закончить бой"));
    fireEvent.click(screen.getByText("Да, закончить"));
    expect(endCombat).toHaveBeenCalledTimes(1);
  });
});
