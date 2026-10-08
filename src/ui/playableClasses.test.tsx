import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AbilityScoreRoll, Character, RuleTopic } from "../state/types";
import { CharacterWizard } from "./CharacterWizard";
import { extractClassHitDice } from "./pages/CharactersPage";

/**
 * Сторож точки регистрации классов (`playableClasses`, ownRuleTopics.ts).
 *
 * ЧТО ИМЕННО ОН ЛОВИТ. Список классов собирался в приложении ДВАЖДЫ и
 * независимо: `topics.filter((t) => t.category === "classes")` в мастере
 * создания и такой же отбор внутри `extractClassHitDice` на листе персонажа.
 * Класс, которого нет в `rules.json`, не видел ни один из них — а именно так
 * живёт наш собственный класс (см. `docs/design/own-classes-how-to.md`).
 * Карточка `characters-class-blood-hunter` завела `playableClasses` и
 * перевела на него ОБА читателя; эта проба стоит ровно на том, что перевод не
 * откатится молча.
 *
 * ПОЧЕМУ ЧЕРЕЗ ПОДМЕНУ `playableClasses`. Проба обязана отличить читателя,
 * который спрашивает точку регистрации, от читателя, который отбирает топики
 * по категории сам. Отличие видно только на классе, которого в `topics` НЕТ:
 * отбор по категории его не найдёт, а точка регистрации отдаст. Поэтому
 * подменённая `playableClasses` дописывает к списку Воина, а `topics` ниже
 * класса не содержат вовсе. Вернёшь любому из двух читателей отбор по
 * категории — Воин пропадёт у него, и проба покраснеет именно на этом.
 *
 * Воин, а не выдуманный класс: его карты (`CLASS_PROFICIENCIES`,
 * `CLASS_EQUIPMENT`, `CLASS_PROGRESSION`) в приложении уже есть, так что
 * проба проверяет маршрут, а не живучесть мастера на незаполненных данных.
 */
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

/** Справочник без единого класса — всё, что увидят читатели, приедет только от `playableClasses`. */
const topics: RuleTopic[] = [
  { id: "races-human", category: "races", title: "Человек", sourceUrl: "", blocks: [] },
];

vi.mock("./ownRuleTopics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ownRuleTopics")>();
  return {
    ...actual,
    playableClasses: (given: RuleTopic[]) => [...actual.playableClasses(given), FIGHTER_TOPIC],
  };
});

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
    if (command === "get_spells") return [];
    return topics;
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const sounds = vi.hoisted(() => ({
  playCoinsSound: vi.fn(),
  playDiceRollSound: vi.fn(),
  playLevelUpSound: vi.fn(),
  playLimitSound: vi.fn(),
  playSpellCastSound: vi.fn(),
}));
vi.mock("../audio/uiSounds", () => sounds);

const addCharacter = vi.fn();
vi.mock("../state/CampaignContext", () => ({
  useCampaign: () => ({ addCharacter }),
}));

/** Те же помощники, что в CharacterWizard.test.tsx: шаг не пускает дальше без выбранных навыков и разложенных характеристик. */
function pickRequiredClassSkills() {
  for (let i = 0; i < 3; i++) {
    const checkbox = document.querySelector<HTMLInputElement>(
      '.wizard__skill-grid input[type="checkbox"]:not(:checked):not(:disabled)',
    );
    if (!checkbox) break;
    fireEvent.click(checkbox);
  }
}

function fillStandardAbilities() {
  const STANDARD_VALUES = ["15", "14", "13", "12", "10", "8"];
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("table.wizard__ability-table select"));
  if (selects.length === 0) return;
  const used = new Set(selects.map((s) => s.value).filter(Boolean));
  const remaining = STANDARD_VALUES.filter((v) => !used.has(v));
  let next = 0;
  for (const select of selects) {
    if (select.value) continue;
    fireEvent.change(select, { target: { value: remaining[next++] } });
  }
}

describe("playableClasses — единственный владелец факта «каким классом можно играть»", () => {
  it("мастер создания берёт список у точки регистрации, а не отбором по категории", async () => {
    addCharacter.mockClear();
    render(<CharacterWizard onDone={() => {}} />);

    fireEvent.click(await screen.findByText("Человек"));
    fillStandardAbilities();
    fireEvent.click(screen.getByText("Далее"));

    // Класса нет ни в `topics`, ни в `rules.json` этого файла — показать его
    // мог только `playableClasses`.
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

    fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), { target: { value: "Проба" } });
    fireEvent.click(screen.getByText("Создать персонажа"));

    await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
    const character = addCharacter.mock.calls[0][0] as Character;
    expect(character.class).toBe("Воин");
    // Кость хитов доехала из того же топика: 1к10 + модификатор Телосложения 0.
    expect(character.maxHp).toBe(10);
    expect(character.savingThrowProficiencies).toEqual(expect.arrayContaining(["Сила", "Телосложение"]));
  });

  it("лист персонажа берёт кость хитов у той же точки регистрации", () => {
    // `extractClassHitDice` строит `classHitDiceByTitle`, по которому левел-ап
    // считает максимум хитов. Отбор по категории не нашёл бы здесь ничего.
    const dice = extractClassHitDice(topics);

    expect(dice["Воин"]).toEqual({ id: "classes-fighter", max: 10, average: 6 });
  });
});
