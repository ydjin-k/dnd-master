import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { CampaignProvider, useCampaign } from "./CampaignContext";
import type { CampaignState, Character } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const initialState: CampaignState = {
  travel: null,
  id: "campaign-1",
  campaignName: "Тест",
  characters: [],
  journal: [
    { id: "keep", timestamp: "2026-01-01T10:00:00Z", text: "Оставить" },
    { id: "remove", timestamp: "2026-01-02T10:00:00Z", text: "Удалить" },
  ],
  combat: null,
  engine: null,
};

describe("CampaignContext journal persistence", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(command === "load_active_campaign" ? initialState : undefined),
    );
  });

  it("persists the journal without the removed entry", async () => {
    let removeEntry: ((id: string) => Promise<void>) | undefined;
    function Consumer() {
      const campaign = useCampaign();
      useEffect(() => {
        if (!campaign.loading) removeEntry = campaign.removeJournalEntry;
      }, [campaign]);
      return null;
    }

    render(
      <CampaignProvider>
        <Consumer />
      </CampaignProvider>,
    );
    await waitFor(() => expect(removeEntry).toBeTypeOf("function"));
    await act(() => removeEntry!("remove"));

    expect(invoke).toHaveBeenCalledWith("save_campaign", {
      state: expect.objectContaining({ journal: [initialState.journal[0]] }),
    });
  });
});

/** Персонаж-заготовка: пробам ниже важны только `id` и `conditions`. */
function hero(conditions: string[]): Character {
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
    conditions,
    inventory: [],
    coins: { copper: 0, silver: 0, electrum: 0, gold: 0, platinum: 0 },
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
    feats: [],
  };
}

/**
 * Отрицательная проба на потерю записи: лист персонажа пишет в `conditions`
 * двумя разными путями (кнопка состояния и «Безумие +1»), и обе записи могут
 * лечь ДО перерисовки. Мутатор, считающий новое состояние от снимка своего
 * рендера, вторую записывает поверх первой — и состояние, добавленное между
 * ними, исчезает с листа молча.
 */
describe("CampaignContext: две записи в персонажа подряд", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(
        command === "load_active_campaign" ? { ...initialState, characters: [hero([])] } : undefined,
      ),
    );
  });

  it("вторая запись не затирает первую: оба состояния доезжают до сохранения", async () => {
    let update: ((id: string, updater: (c: Character) => Character) => Promise<void>) | undefined;
    function Consumer() {
      const campaign = useCampaign();
      useEffect(() => {
        if (!campaign.loading) update = campaign.updateCharacter;
      }, [campaign]);
      return null;
    }

    render(
      <CampaignProvider>
        <Consumer />
      </CampaignProvider>,
    );
    await waitFor(() => expect(update).toBeTypeOf("function"));

    // Обе записи исходят из ОДНОГО рендера — как два нажатия подряд на листе.
    const write = update!;
    await act(async () => {
      await Promise.all([
        write("hero", (c) => ({ ...c, conditions: [...c.conditions, "Ослеплённое"] })),
        write("hero", (c) => ({ ...c, conditions: [...c.conditions, "Безумие (ур. 1, к100 7, 1к10 6)"] })),
      ]);
    });

    const saves = vi.mocked(invoke).mock.calls.filter(([command]) => command === "save_campaign");
    const last = saves[saves.length - 1][1] as { state: CampaignState };
    expect(last.state.characters[0].conditions).toEqual([
      "Ослеплённое",
      "Безумие (ур. 1, к100 7, 1к10 6)",
    ]);
  });
});

/**
 * Команды движка. Здесь проверяется ровно то, на чём стоит решение ADR 0001:
 * фронт отправляет намерение, кладёт вернувшееся состояние и НЕ пишет документ
 * сам. Если когда-нибудь рядом с `gm_*` появится `save_campaign`, у состояния
 * движка окажется второй владелец — и это поймает вторая проба.
 */
type CampaignApi = ReturnType<typeof useCampaign>;

describe("CampaignContext и команды движка", () => {
  const stateWithScene: CampaignState = {
    ...initialState,
    engine: {
      scene: {
        id: "scene-1",
        status: "active",
        location: "Подземный зал",
        objective: "Найти выход",
        tension: 3,
        participants: [],
        activeThreats: [],
        sceneTags: [],
        startedAtTurn: 1,
        resolvedConditions: [],
      },
      adventureLog: [],
      history: [],
      turn: 1,
      facts: [],
      seed: "481922",
      rngState: "481922",
      rngDraws: "0",
    },
  };

  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "load_active_campaign") return Promise.resolve(initialState);
      if (command === "gm_create_scene") {
        return Promise.resolve({
          state: stateWithScene,
          result: {
            success: true,
            resultType: "SCENE_CREATED",
            summaryKey: "scene.started",
            rolls: [],
            stateChanges: [],
            generatedEvents: [],
            choices: [],
            trace: ["Scene Manager → CREATE_SCENE"],
          },
        });
      }
      return Promise.resolve(undefined);
    });
  });

  it("отправляет намерение, кладёт ответ и не пишет документ сам", async () => {
    let campaign: CampaignApi | undefined;
    function Consumer() {
      campaign = useCampaign();
      return null;
    }

    render(
      <CampaignProvider>
        <Consumer />
      </CampaignProvider>,
    );
    await waitFor(() => expect(campaign?.loading).toBe(false));

    let result: Awaited<ReturnType<CampaignApi["gmCreateScene"]>> | undefined;
    await act(async () => {
      result = await campaign!.gmCreateScene("Подземный зал", "Найти выход", [], ["dark"]);
    });

    expect(invoke).toHaveBeenCalledWith("gm_create_scene", {
      location: "Подземный зал",
      objective: "Найти выход",
      participants: [],
      tags: ["dark"],
    });
    expect(campaign!.state.engine?.scene?.location).toBe("Подземный зал");
    expect(result?.trace).toEqual(["Scene Manager → CREATE_SCENE"]);

    const saves = vi.mocked(invoke).mock.calls.filter(([command]) => command === "save_campaign");
    expect(saves).toHaveLength(0);
  });
});
