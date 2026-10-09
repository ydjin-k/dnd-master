import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharacterWizard } from "./CharacterWizard";
import type { AbilityScoreRoll, Character, RuleTopic } from "../state/types";
import { RACE_FIXED_SKILLS, RACE_HP_BONUS, RACE_LANGUAGES, RACE_TRAITS } from "./characterCreationData";
import {
  CHARACTER_PORTRAIT_GENDERS,
  characterPortraitUrl,
  characterPortraitVariants,
} from "./characterPortraits";
import { GOBLIN_ABILITY_BONUS, GOBLIN_ID, GOBLIN_SPEED_FEET, GOBLIN_TITLE } from "./goblinRace";
import { SATYR_ABILITY_BONUS, SATYR_ID, SATYR_SPEED_FEET, SATYR_TITLE } from "./satyrRace";
import {
  CHANGELING_ABILITY_BONUS,
  CHANGELING_ID,
  CHANGELING_SPEED_FEET,
  CHANGELING_TITLE,
} from "./changelingRace";
import { GOLIATH_ABILITY_BONUS, GOLIATH_ID, GOLIATH_SPEED_FEET, GOLIATH_TITLE } from "./goliathRace";
import { SERPENT_ABILITY_BONUS, SERPENT_ID, SERPENT_SPEED_FEET, SERPENT_TITLE } from "./serpentRace";

/**
 * Пачка A — наблюдаемым поведением мастера создания, а не данными.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ `<race>Race.test.ts`. Те пробы сторожат содержание расы и её
 * происхождение: что раса не подмешана в rules.json, что открытые факты сверены
 * с бестиарием, что карты заполнены. Здесь сторожится ДРУГОЕ — что игрок
 * действительно получает: раса выбирается на первом шаге, её бонусы легли в
 * характеристики созданного персонажа, скорость и языки доехали до сохранения,
 * навык расы не съел слот класса, а особенности видны на шаге «Итог» жирным
 * именем. Пропущенная строка в любой из семи карт данными не ловится — там
 * просто нет записи, и молчание выглядит как «раса ничего не даёт».
 *
 * ПОЧЕМУ ЧИСЛА ЗДЕСЬ — ИЗ МОДУЛЕЙ РАС, А НЕ ЛИТЕРАЛАМИ. Литерал «25 футов»
 * сторожил бы значение, которое и так сторожит `goblinRace.test.ts` рядом с его
 * обоснованием. Здесь сторожится ДОРОГА от владельца числа до
 * `Character.speedFeet`: сотрите строку расы из `RACE_SPEED_FEET` — и персонаж
 * приедет с чужой скоростью, хотя константа на месте. Самоссылочной такая проба
 * не становится: она сравнивает два РАЗНЫХ места, модуль и сохранение.
 */

const topics: RuleTopic[] = [
  { id: "races-human", category: "races", title: "Человек", sourceUrl: "", blocks: [] },
  { id: "races-dwarf", category: "races", title: "Дварф", sourceUrl: "", blocks: [] },
  {
    id: "classes-fighter",
    category: "classes",
    title: "Воин",
    sourceUrl: "",
    blocks: [{ type: "paragraph", text: "Кость хитов: 1к10 за уровень воина" }],
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
    if (command === "get_spells") return [];
    return topics;
  }),
}));

const sounds = vi.hoisted(() => ({ playCoinsSound: vi.fn(), playDiceRollSound: vi.fn(), playLimitSound: vi.fn() }));
vi.mock("../audio/uiSounds", () => sounds);

const addCharacter = vi.fn();
vi.mock("../state/CampaignContext", () => ({
  useCampaign: () => ({ addCharacter }),
}));

/** Та же вспомогалка, что в `CharacterWizard.test.tsx`: добрать навыки класса, сколько требует шаг. */
function pickRequiredClassSkills() {
  for (let i = 0; i < 3; i++) {
    const checkbox = document.querySelector<HTMLInputElement>(
      '.wizard__skill-grid input[type="checkbox"]:not(:checked):not(:disabled)',
    );
    if (!checkbox) break;
    fireEvent.click(checkbox);
  }
}

/** Та же вспомогалка: заполнить «стандартный набор», иначе шаг характеристик не пускает дальше. */
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

/**
 * Доводит мастер до шага «Итог» выбранной расой. Характеристики — ручным вводом,
 * то есть база 10 во всех шести: тогда значение в созданном персонаже равно
 * `10 + расовый бонус`, и бонус видно числом, а не «изменилось на сколько-то».
 */
async function walkToReview(raceTitle: string) {
  render(<CharacterWizard onDone={() => {}} />);

  fireEvent.click(await screen.findByText(raceTitle));
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
  fireEvent.click(await screen.findByText("Далее"));
  fillStandardAbilities();
  fireEvent.click(await screen.findByText("Далее"));
  await screen.findByPlaceholderText("Имя персонажа");
}

/** Доводит мастер до конца и отдаёт созданного персонажа. */
async function createWithRace(raceTitle: string): Promise<Character> {
  addCharacter.mockClear();
  await walkToReview(raceTitle);
  fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), {
    target: { value: `Проба ${raceTitle}` },
  });
  fireEvent.click(screen.getByText("Создать персонажа"));
  await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
  return addCharacter.mock.calls[0][0] as Character;
}

/** Описание расы пачки для табличных проб ниже. Поля — ровно то, что раса объявляет. */
interface PackRace {
  id: string;
  title: string;
  bonuses: Record<string, number>;
  speedFeet: number;
}

const PACK_A: PackRace[] = [
  { id: GOBLIN_ID, title: GOBLIN_TITLE, bonuses: GOBLIN_ABILITY_BONUS, speedFeet: GOBLIN_SPEED_FEET },
  { id: SATYR_ID, title: SATYR_TITLE, bonuses: SATYR_ABILITY_BONUS, speedFeet: SATYR_SPEED_FEET },
  { id: SERPENT_ID, title: SERPENT_TITLE, bonuses: SERPENT_ABILITY_BONUS, speedFeet: SERPENT_SPEED_FEET },
  {
    id: CHANGELING_ID,
    title: CHANGELING_TITLE,
    bonuses: CHANGELING_ABILITY_BONUS,
    speedFeet: CHANGELING_SPEED_FEET,
  },
  { id: GOLIATH_ID, title: GOLIATH_TITLE, bonuses: GOLIATH_ABILITY_BONUS, speedFeet: GOLIATH_SPEED_FEET },
];

describe.each(PACK_A)("раса пачки A в мастере: $title", (race) => {
  it("выбирается на первом шаге и доезжает в сохранение своим названием", async () => {
    const character = await createWithRace(race.title);
    // `Character.race` хранит ТЕКСТ, не id — по нему лист ищет и черты, и портрет.
    expect(character.race).toBe(race.title);
  });

  it("бонусы характеристик легли в характеристики созданного персонажа", async () => {
    const character = await createWithRace(race.title);
    const BASE = 10; // ручной ввод начинает каждую характеристику с 10
    for (const [ability, bonus] of Object.entries(race.bonuses)) {
      expect(character.abilities[ability as keyof typeof character.abilities]).toBe(BASE + bonus);
    }
    // Характеристики без бонуса остались базовыми: лишнего бонуса раса не дала.
    for (const [ability, value] of Object.entries(character.abilities)) {
      if (!(ability in race.bonuses)) expect(value).toBe(BASE);
    }
  });

  it("скорость доехала до сохранения базой — пересчёты листа накладывает effectiveStats", async () => {
    const character = await createWithRace(race.title);
    expect(character.speedFeet).toBe(race.speedFeet);
  });

  it("языки расы доехали до сохранения все до одного", async () => {
    const character = await createWithRace(race.title);
    const declared = RACE_LANGUAGES[race.id];
    expect(declared).toBeDefined();
    for (const language of declared.fixed) expect(character.languages).toContain(language);
  });

  it("навык, который раса даёт сама, не съел слот класса", async () => {
    const character = await createWithRace(race.title);
    const fixed = RACE_FIXED_SKILLS[race.id] ?? [];
    for (const skill of fixed) expect(character.skillProficiencies).toContain(skill);
    // Два навыка воина плюс два навыка Послушника плюс расовые — слот класса
    // расовый навык не занял.
    expect(character.skillProficiencies.length).toBeGreaterThanOrEqual(4 + fixed.length);
  });

  it("прибавка к максимуму хитов учтена, если раса её даёт", async () => {
    const character = await createWithRace(race.title);
    const hpBonus = RACE_HP_BONUS[race.id] ?? 0;
    const conMod = Math.floor((character.abilities.constitution - 10) / 2);
    // Воин: кость хитов 1к10, на 1 уровне максимум кости.
    expect(character.maxHp).toBe(10 + conMod + hpBonus);
  });

  it("все особенности расы видны на шаге «Итог», имя жирным", async () => {
    // Правило проекта: выбор мастера, дающий особенность, обязан отрисоваться на
    // обзоре. Для расы это значит ВСЕ её черты, а не первую попавшуюся.
    await walkToReview(race.title);
    const traits = RACE_TRAITS[race.id] ?? [];
    expect(traits.length).toBeGreaterThan(0);
    for (const trait of traits) {
      const strong = screen.getByText(trait.name, { selector: "strong" });
      expect(strong).toBeInTheDocument();
    }
  });
});

/**
 * Портрет новой расы — СВОЙ и не битый, проверено по файлам на диске.
 *
 * Это та строка DoD, которую легко «проверить» глазами и ошибиться: битая
 * картинка в маленьком окне выглядит почти как задуманная рамка. Здесь она
 * проверена тем, чем проверяется по-настоящему, — существованием файла.
 *
 * Запас надёжности устроен так: НЕИЗВЕСТНАЯ раса получает человеческий
 * портрет, а известная — файл по своему слагу. Поэтому здесь сторожатся и
 * собственный слаг, и наличие каждого файла в production-библиотеке.
 */
const bundledPortraits = import.meta.glob("/public/character-portraits/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});

describe.each(PACK_A)("портрет расы пачки A: $title", (race) => {
  it("все сочетания пол×вариант дают свой портрет, и файл каждого лежит на диске", () => {
    for (const gender of CHARACTER_PORTRAIT_GENDERS) {
      for (const variant of characterPortraitVariants(race.title)) {
        const url = characterPortraitUrl(race.title, gender, variant);
        expect(url).not.toContain("/human-");
        // И не битый: ровно этот файл есть в библиотеке.
        expect(Object.keys(bundledPortraits)).toContain(`/public${url}`);
      }
    }
  });

  it("персонаж, созданный мастером, просит ровно тот портрет, который существует", async () => {
    const character = await createWithRace(race.title);
    const url = characterPortraitUrl(character.race, character.gender, character.portraitVariant);
    expect(Object.keys(bundledPortraits)).toContain(`/public${url}`);
  });
});
