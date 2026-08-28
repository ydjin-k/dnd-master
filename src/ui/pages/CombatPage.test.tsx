import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CombatPage } from "./CombatPage";
import type { CampaignState, MonsterTemplate } from "../../state/types";

const bestiary: MonsterTemplate[] = [
  { id: "wolf", name: "Волк", maxHp: 11, armorClass: 13, speedFeet: 40, attackBonus: 4, damageDice: "2d4+2" },
];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "get_bestiary") return bestiary;
    return null;
  }),
}));

function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: "c1",
    campaignName: "Тест",
    characters: [
      {
        id: "hero",
        name: "Герой",
        race: "",
        class: "",
        background: "",
        alignment: "",
        languages: [],
        level: 1,
        abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        maxHp: 12,
        currentHp: 12,
        armorClass: 14,
        speedFeet: 30,
        initiative: 1,
        passivePerception: 11,
        conditions: [],
        inventory: [],
        gold: 0,
        savingThrowProficiencies: [],
        skillProficiencies: [],
      },
    ],
    journal: [],
    currentSceneId: null,
    adventureLog: [],
    combat: null,
    chaosFactor: 5,
    ...overrides,
  };
}

const startCombat = vi.fn();
const moveCombatant = vi.fn();
const combatAttack = vi.fn();
const applyDamage = vi.fn();
const endTurn = vi.fn();
const monsterAutoTurn = vi.fn();
const endCombat = vi.fn();

let mockState = baseState();
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({
    state: mockState,
    startCombat,
    moveCombatant,
    combatAttack,
    applyDamage,
    endTurn,
    monsterAutoTurn,
    endCombat,
  }),
}));

describe("CombatPage", () => {
  it("renders the pre-combat panel and lets you pick monsters/characters without crashing", async () => {
    mockState = baseState();
    render(<CombatPage />);

    expect(await screen.findByText(/Волк/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Волк/));
    fireEvent.click(screen.getByText(/Герой/));
    fireEvent.click(screen.getByText("Начать бой"));
    expect(startCombat).toHaveBeenCalledWith(["wolf"], ["hero"]);
  });

  it("renders an active combat grid, selecting a token and attacking does not crash", async () => {
    mockState = baseState({
      combat: {
        gridWidth: 3,
        gridHeight: 3,
        combatants: [
          {
            id: "hero",
            name: "Герой",
            isMonster: false,
            x: 0,
            y: 0,
            speedFeet: 30,
            maxHp: 12,
            currentHp: 12,
            armorClass: 14,
            attackBonus: 4,
            damageDice: "1d8",
            initiative: 15,
            feetMovedThisTurn: 0,
          },
          {
            id: "wolf",
            name: "Волк",
            isMonster: true,
            x: 1,
            y: 1,
            speedFeet: 40,
            maxHp: 11,
            currentHp: 11,
            armorClass: 13,
            attackBonus: 4,
            damageDice: "2d4+2",
            initiative: 10,
            feetMovedThisTurn: 0,
          },
        ],
        turnOrder: ["hero", "wolf"],
        currentTurnIndex: 0,
        round: 1,
        log: ["Бой начался."],
        finished: false,
      },
    });
    render(<CombatPage />);

    // Grid renders without crashing; select the hero token by clicking its cell.
    const heroToken = await screen.findByTitle(/Герой: 12\/12 HP/);
    fireEvent.click(heroToken);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "wolf" } });

    const attackButton = screen.getByText("Атаковать выбранным");
    await waitFor(() => expect(attackButton).not.toBeDisabled());
    fireEvent.click(attackButton);
    expect(combatAttack).toHaveBeenCalledWith("hero", "wolf");

    fireEvent.click(screen.getByText("Закончить ход"));
    expect(endTurn).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Завершить бой"));
    expect(endCombat).toHaveBeenCalled();
  });

  it("clicking a cell with a downed combatant moves the selected combatant there instead of selecting the body", async () => {
    mockState = baseState({
      combat: {
        gridWidth: 3,
        gridHeight: 3,
        combatants: [
          {
            id: "hero",
            name: "Герой",
            isMonster: false,
            x: 0,
            y: 0,
            speedFeet: 30,
            maxHp: 12,
            currentHp: 12,
            armorClass: 14,
            attackBonus: 4,
            damageDice: "1d8",
            initiative: 15,
            feetMovedThisTurn: 0,
          },
          {
            id: "wolf",
            name: "Волк",
            isMonster: true,
            x: 2,
            y: 2,
            speedFeet: 40,
            maxHp: 11,
            currentHp: 0,
            armorClass: 13,
            attackBonus: 4,
            damageDice: "2d4+2",
            initiative: 10,
            feetMovedThisTurn: 0,
          },
        ],
        turnOrder: ["hero", "wolf"],
        currentTurnIndex: 0,
        round: 1,
        log: ["Бой начался."],
        finished: false,
      },
    });
    render(<CombatPage />);

    const heroToken = await screen.findByTitle(/Герой: 12\/12 HP/);
    fireEvent.click(heroToken);

    const deadWolfToken = screen.getByTitle(/Волк: 0\/11 HP/);
    fireEvent.click(deadWolfToken);

    expect(moveCombatant).toHaveBeenCalledWith("hero", 2, 2);
  });
});
