import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { CombatPage } from "./CombatPage";
import { CampaignProvider } from "../../state/CampaignContext";
import { DiceLogProvider } from "../../state/DiceLogContext";
import type { CampaignState, Character, Combatant, MonsterTemplate } from "../../state/types";

/**
 * Спасброски от смерти в трекере (карточка `combat-tracker-death-saves`, слово
 * владельца 14.10.2026) — сквозь НАСТОЯЩИЙ `CampaignProvider`: счёт персонажа
 * обязан доехать до листа в сохранении, а «20» — до боевых хитов, и обе записи
 * идут разными путями (лист — `save_campaign`, бой — командой Rust). Подмена
 * `useCampaign` такую стыковку не проверила бы.
 *
 * `invoke` изображает бэкенд ровно настолько, насколько его трогает раздел:
 * хранит кампанию, бросает заданную кость и двигает хиты с тем же зажимом
 * `0..=max`, что `combat::apply_damage`. Шаг «Следующего» по линии здесь не
 * изображается — его держат пробы Rust (`combat.rs`); отсюда проверяется, какие
 * флаги «пал» фронт туда отправляет.
 */

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const wolfTemplate = { id: "wolf", name: "Волк", maxHp: 11, abilities: { dexterity: 15 } } as MonsterTemplate;

function sheet(over: Partial<Character> = {}): Character {
  return {
    id: "hero",
    name: "Герой",
    initiative: 3,
    maxHp: 12,
    currentHp: 12,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    conditions: [],
    ...over,
  } as Character;
}

function heroInCombat(currentHp: number, d20 = 15): Combatant {
  return {
    id: "hero",
    source: { kind: "character", characterId: "hero" },
    maxHp: 12,
    currentHp,
    initiativeRoll: { d20, dexModifier: 3 },
    playerRules: false,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
  };
}

function wolf(number: number, d20: number, over: Partial<Combatant> = {}): Combatant {
  return {
    id: `monster-wolf-${number}`,
    source: { kind: "monster", templateId: "wolf", number },
    maxHp: 11,
    currentHp: 11,
    initiativeRoll: { d20, dexModifier: 2 },
    playerRules: false,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    ...over,
  };
}

let saved: CampaignState;
let rolls: number[];

function campaign(character: Character, combatants: Combatant[]): CampaignState {
  return {
    travel: null,
    id: "c1",
    campaignName: "Тест",
    characters: [character],
    journal: [],
    combat: { combatants, currentTurnIndex: 0, round: 1 },
  };
}

function withCombatant(id: string, change: (c: Combatant) => Combatant): CampaignState {
  const combat = saved.combat!;
  saved = { ...saved, combat: { ...combat, combatants: combat.combatants.map((c) => (c.id === id ? change(c) : c)) } };
  return saved;
}

beforeEach(() => {
  rolls = [];
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
    const a = (args ?? {}) as Record<string, unknown>;
    switch (command) {
      case "load_active_campaign":
        return saved;
      case "get_bestiary":
        return [wolfTemplate];
      case "save_campaign":
        saved = a.state as CampaignState;
        return undefined;
      case "roll_dice": {
        const total = rolls.shift();
        if (total === undefined) throw new Error("кость не задана");
        return { expression: a.expression, rolls: [total], modifier: 0, total };
      }
      case "apply_damage":
        return withCombatant(a.targetId as string, (c) => ({
          ...c,
          currentHp: Math.min(c.maxHp, Math.max(0, c.currentHp - (a.delta as number))),
        }));
      case "combat_set_death_saves":
        return withCombatant(a.targetId as string, (c) => ({
          ...c,
          deathSaveSuccesses: a.successes as number,
          deathSaveFailures: a.failures as number,
        }));
      case "combat_set_player_rules":
        return withCombatant(a.targetId as string, (c) => ({ ...c, playerRules: a.on as boolean }));
      case "combat_next_turn":
        return saved;
      default:
        throw new Error(`неожиданная команда ${command}`);
    }
  });
});

function renderPage() {
  render(
    <CampaignProvider>
      <DiceLogProvider>
        <CombatPage />
      </DiceLogProvider>
    </CampaignProvider>,
  );
}

function row(name: string): HTMLElement {
  return screen.getAllByTestId("combat-row").find((r) => r.querySelector(".combat-line__name")!.textContent === name)!;
}

async function rollFor(name: string, total: number) {
  rolls.push(total);
  await act(async () => {
    fireEvent.click(screen.getByLabelText(`Спасбросок от смерти: ${name}`));
  });
}

describe("спасброски от смерти в трекере", () => {
  /**
   * Лист ещё помнит 12 хитов — переноса не было, — а в бою герой на нуле.
   * Счёт пишется в лист и НЕ стирается следующей записью: «лежит ли он»
   * решают боевые хиты. Хиты листа трекер не трогает.
   */
  it("персонаж на нуле бросает к20, и счёт ложится в его лист", async () => {
    saved = campaign(sheet({ currentHp: 12 }), [heroInCombat(0), wolf(1, 5)]);
    renderPage();
    await screen.findByText("Волк");
    expect(within(row("Герой")).getByText("Успехи 0/3 · Провалы 0/3")).toBeInTheDocument();

    await rollFor("Герой", 7);
    await waitFor(() => expect(saved.characters[0].deathSaveFailures).toBe(1));
    await rollFor("Герой", 15);
    await waitFor(() => expect(saved.characters[0].deathSaveSuccesses).toBe(1));

    expect(saved.characters[0].deathSaveFailures).toBe(1);
    expect(saved.characters[0].currentHp).toBe(12);
    expect(saved.combat!.combatants[0].currentHp).toBe(0);
    expect(within(row("Герой")).getByText("Успехи 1/3 · Провалы 1/3")).toBeInTheDocument();
    expect(within(row("Герой")).getByText("Выпало 15 — успех")).toBeInTheDocument();
  });

  /**
   * «20»: 1 хит БОЕВОМУ бойцу командой хитов, счёт листа очищен правилом, а
   * хиты листа (0 после переноса) остались нулём — перенос только кнопкой.
   */
  it("двадцатка возвращает 1 хит в бою и очищает счёт на листе", async () => {
    saved = campaign(sheet({ currentHp: 0, deathSaveSuccesses: 1, deathSaveFailures: 2 }), [heroInCombat(0)]);
    renderPage();
    await screen.findByText("Успехи 1/3 · Провалы 2/3");

    await rollFor("Герой", 20);
    await waitFor(() => expect(saved.combat!.combatants[0].currentHp).toBe(1));

    expect(invoke).toHaveBeenCalledWith("apply_damage", { targetId: "hero", delta: -1 });
    expect(saved.characters[0].deathSaveSuccesses).toBe(0);
    expect(saved.characters[0].deathSaveFailures).toBe(0);
    expect(saved.characters[0].currentHp).toBe(0);
    expect(screen.queryByLabelText("Спасбросок от смерти: Герой")).not.toBeInTheDocument();
  });

  /**
   * Лечение в бою пишет хиты не в лист, а счёт листа обязан обнулиться (SRD:
   * любое восстановление хитов). Отрицательная проба: снять сброс после
   * команды хитов в `CampaignContext.applyDamage` — и счёт 2/1 доживёт до
   * следующего падения.
   */
  it("лечение в бою обнуляет счёт листа, хотя хиты листа не менялись", async () => {
    saved = campaign(sheet({ currentHp: 0, deathSaveSuccesses: 2, deathSaveFailures: 1 }), [heroInCombat(0)]);
    renderPage();
    await screen.findByText("Успехи 2/3 · Провалы 1/3");

    fireEvent.change(screen.getByLabelText("Хиты: Герой"), { target: { value: "3" } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Вернуть хиты: Герой"));
    });

    await waitFor(() => expect(saved.characters[0].deathSaveSuccesses).toBe(0));
    expect(saved.characters[0].deathSaveFailures).toBe(0);
    expect(saved.characters[0].currentHp).toBe(0);
    expect(saved.combat!.combatants[0].currentHp).toBe(3);
  });

  /**
   * Чудовище на нуле — «пал», броска нет, и в «Следующий» его место уходит
   * флагом `true`. Линия по инициативе: Волк 2 (20+2), Герой (15+3), Волк 1 (5+2).
   */
  it("чудовище на нуле пало, и «Следующий» шлёт его место как пропускаемое", async () => {
    saved = campaign(sheet(), [heroInCombat(12), wolf(1, 5, { currentHp: 0 }), wolf(2, 20)]);
    renderPage();
    await screen.findByText("Волк 1");

    expect(within(row("Волк 1")).getByText("пал")).toBeInTheDocument();
    expect(screen.queryByLabelText("Спасбросок от смерти: Волк 1")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Следующий"));
    });
    expect(invoke).toHaveBeenCalledWith("combat_next_turn", { fallen: [false, false, true] });
  });

  /**
   * С переключателем спасбросков существа существо на нуле не пало: не
   * пропускается и бросает спасброски, а счёт живёт в бою — листа у него нет.
   */
  it("с переключателем существо не пропускается и бросает, счёт в бою", async () => {
    saved = campaign(sheet(), [heroInCombat(12), wolf(1, 5, { currentHp: 0 }), wolf(2, 20)]);
    renderPage();
    await screen.findByText("Волк 1");

    const toggle = within(row("Волк 1")).getByLabelText("Спасброски от смерти как у персонажа");
    expect(toggle.closest("label")).toHaveAttribute(
      "title",
      "На 0 хитов существо бросает спасброски от смерти, а не погибает сразу",
    );
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(invoke).toHaveBeenCalledWith("combat_set_player_rules", { targetId: "monster-wolf-1", on: true });
    await screen.findByLabelText("Спасбросок от смерти: Волк 1");
    expect(within(row("Волк 1")).queryByText("пал")).not.toBeInTheDocument();

    await rollFor("Волк 1", 1);
    await waitFor(() => expect(saved.combat!.combatants[1].deathSaveFailures).toBe(2));
    expect(saved.characters[0].deathSaveFailures).toBe(0);

    await act(async () => {
      fireEvent.click(screen.getByText("Следующий"));
    });
    expect(invoke).toHaveBeenCalledWith("combat_next_turn", { fallen: [false, false, false] });
  });

  it("пали все — «Следующий» выключен, обходить некого", async () => {
    saved = campaign(sheet(), [wolf(1, 5, { currentHp: 0 }), wolf(2, 20, { currentHp: 0 })]);
    renderPage();
    await screen.findByText("Волк 1");
    expect(screen.getByText("Следующий")).toBeDisabled();
  });
});
