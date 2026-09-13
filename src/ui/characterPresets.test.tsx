import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import bundledPresets from "../../src-tauri/characters/presets.json";
import bundledRules from "../../src-tauri/rules/rules.json";
import bundledSpells from "../../src-tauri/rules/spells.json";
import { CharactersPage } from "./pages/CharactersPage";
import { CharacterWizard } from "./CharacterWizard";
import { characterFromPreset, type CharacterPreset } from "./characterPresets";
import { ALL_SKILLS, ARMOR_STATS, CLASS_SUBCLASSES, abilityMod, catalogWeightLb, maxHpForLevel, subclassSpellsUpToLevel } from "./characterCreationData";
import { preparedSpells } from "./preparedSpells";
import { characterResources, resourceMax, spellSlotsForLevel } from "./classProgression";
import { emptyCoins, type CampaignState, type Character, type RuleTopic } from "../state/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));
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
const removeCharacter = vi.fn();
const updateCharacter = vi.fn();
let mockState: CampaignState;
vi.mock("../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, addCharacter, removeCharacter, updateCharacter }),
}));

/** Кость хитов в том же формате строк rules.json, что читает `extractClassHitDice`. */
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

const HALFLING_TOPIC: RuleTopic = { id: "races-halfling", category: "races", title: "Полурослик", sourceUrl: "", blocks: [] };
const HUMAN_TOPIC: RuleTopic = { id: "races-human", category: "races", title: "Человек", sourceUrl: "", blocks: [] };
const HALF_ELF_TOPIC: RuleTopic = { id: "races-half-elf", category: "races", title: "Полуэльф", sourceUrl: "", blocks: [] };
const BARD_TOPIC = classTopic("classes-bard", "Бард", "8", "5");
const CLERIC_TOPIC = classTopic("classes-cleric", "Жрец", "8", "5");
const DRUID_TOPIC = classTopic("classes-druid", "Друид", "8", "5");
const TOPICS = [HALFLING_TOPIC, HUMAN_TOPIC, HALF_ELF_TOPIC, BARD_TOPIC, CLERIC_TOPIC, DRUID_TOPIC];

const PRESETS = bundledPresets as unknown as CharacterPreset[];
const BARD_PRESET = PRESETS.find((p) => p.id === "preset-bard-halfling")!;

/**
 * Каталог целиком — двенадцать листов из `Готовые персонажи/`. Список здесь
 * записан руками нарочно: это сторожевая строчка на состав каталога, и она
 * обязана ломаться, когда пресет пропал, задвоился или уехал не в свой класс.
 */
const CATALOG: [string, string, string, string][] = [
  ["preset-bard-halfling", "Кимри Тростинка", "Полурослик", "Бард"],
  ["preset-bard-tiefling", "Азара Виоль", "Тифлинг", "Бард"],
  ["preset-barbarian-half-elf", "Таэрин Волчий Шаг", "Полуэльф", "Варвар"],
  ["preset-barbarian-human", "Хродгар Ковач", "Человек", "Варвар"],
  ["preset-fighter-half-elf", "Аэлин Полутень", "Полуэльф", "Воин"],
  ["preset-fighter-human", "Балдвин Кварел", "Человек", "Воин"],
  ["preset-wizard-high-elf", "Илларион Сильвэ", "Эльф", "Волшебник"],
  ["preset-wizard-gnome", "Финдл Шестерёнка", "Гном", "Волшебник"],
  ["preset-druid-hill-dwarf", "Вэйт Данкил", "Дварф", "Друид"],
  ["preset-druid-dwarf", "Торунн Камнецвет", "Дварф", "Друид"],
  ["preset-cleric-dwarf", "Дарин Светоч", "Дварф", "Жрец"],
  ["preset-cleric-half-elf", "Селиэн Ардвен", "Полуэльф", "Жрец"],
];

/** Заклинания барда, которыми мастер персонажа наполняет шаг выбора заговоров/заклинаний. */
const BARD_SPELLS = ["c1", "c2", "s1", "s2", "s3", "s4"].map((id, i) => ({
  id,
  name: i < 2 ? `Заговор Барда ${i + 1}` : `Заклинание Барда ${i - 1}`,
  level: i < 2 ? 0 : 1,
  school: "",
  castingTime: "",
  range: "",
  components: "",
  duration: "",
  concentration: false,
  ritual: false,
  classes: ["classes-bard"],
  description: "",
  damageDice: null,
  damageType: null,
  attackRoll: false,
  savingThrow: null,
}));

function mockBackend() {
  vi.mocked(invoke).mockImplementation(async (cmd: unknown) => {
    if (cmd === "get_rules") return TOPICS;
    if (cmd === "get_spells") return BARD_SPELLS;
    if (cmd === "get_character_presets") return PRESETS;
    return [];
  });
}

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

/** Заготовка персонажа для полей, которых нет в проверяемом сценарии. */
function blankCharacter(): Character {
  return {
    id: "blank",
    name: "Заготовка",
    race: "Человек",
    class: "Бард",
    subclass: "",
    background: "",
    personalityTraits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    alignment: "",
    gender: "",
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
    experiencePoints: 999999,
    abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    maxHp: 8,
    currentHp: 8,
    armorClass: 10,
    speedFeet: 30,
    initiative: 0,
    passivePerception: 10,
    conditions: [],
    inventory: [],
    coins: emptyCoins(),
    savingThrowProficiencies: [],
    skillProficiencies: [],
    armorProficiencies: [],
    weaponProficiencies: [],
    toolProficiencies: [],
    fightingStyle: "",
    knownCantrips: [],
    knownSpells: [],
    spellSlotsMax: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    spellSlotsCurrent: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    featureUses: [],
    subclassChoices: {},
  };
}

/**
 * Единственный путь повышения уровня в приложении — кнопка «Повысить уровень»
 * на карточке персонажа в CharactersPage. Тесты ниже гоняют через неё и
 * пресетного персонажа, и персонажа из мастера: разной ветки логики нет, и
 * этот хелпер — то место, где это видно.
 */
async function levelUpThroughTheRoster(character: Character): Promise<Character> {
  updateCharacter.mockClear();
  mockState = baseState({ characters: [character] });
  const view = render(<CharactersPage />);
  await screen.findByText("Повысить уровень");
  fireEvent.click(screen.getByText("Повысить уровень"));
  expect(updateCharacter).toHaveBeenCalledTimes(1);
  const updater = updateCharacter.mock.calls[0][1] as (c: Character) => Character;
  const updated = updater(character);
  view.unmount();
  return updated;
}

/** Бард, собранный настоящим мастером персонажа — не пересобранный тестом вручную. */
async function bardFromTheWizard(): Promise<Character> {
  addCharacter.mockClear();
  const view = render(<CharacterWizard onDone={() => {}} />);

  fireEvent.click(await screen.findByText("Полурослик"));
  fireEvent.click(screen.getByText("Далее"));
  fireEvent.click(await screen.findByText("Бард"));
  for (let i = 0; i < 3; i++) {
    const checkbox = document.querySelector<HTMLInputElement>(
      '.wizard__skill-grid input[type="checkbox"]:not(:checked):not(:disabled)',
    );
    if (checkbox) fireEvent.click(checkbox);
  }
  fireEvent.click(screen.getByText("Далее"));
  fireEvent.click(await screen.findByText("Артист"));
  fireEvent.click(screen.getByText("Далее"));

  // Характеристики: стандартный набор, все шесть ячеек обязаны быть розданы.
  const values = ["15", "14", "13", "12", "10", "8"];
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("table.wizard__ability-table select"));
  selects.forEach((select, i) => fireEvent.change(select, { target: { value: values[i] } }));
  fireEvent.click(await screen.findByText("Далее"));
  fireEvent.click(await screen.findByText("Далее")); // снаряжение: значения по умолчанию

  fireEvent.change(await screen.findByPlaceholderText("Имя персонажа"), { target: { value: "Бард из мастера" } });
  await screen.findByText("Заговор Барда 1");
  const spellBoxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  spellBoxes.forEach((box) => fireEvent.click(box));
  fireEvent.click(screen.getByText("Создать персонажа"));

  await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
  view.unmount();
  return addCharacter.mock.calls[0][0] as Character;
}

/** Пресет, взятый настоящей кнопкой на вкладке «Персонажи» — не собранный тестом. */
async function presetFromThePanel(label: RegExp): Promise<Character> {
  addCharacter.mockClear();
  mockState = baseState();
  const view = render(<CharactersPage />);
  fireEvent.click(screen.getByText("Взять готового персонажа"));
  fireEvent.click(await screen.findByText(label));
  await waitFor(() => expect(addCharacter).toHaveBeenCalledTimes(1));
  view.unmount();
  return addCharacter.mock.calls[0][0] as Character;
}

const bardFromThePresetPanel = () => presetFromThePanel(/Кимри Тростинка/);

describe("пресеты готовых персонажей", () => {
  beforeEach(() => {
    addCharacter.mockClear();
    removeCharacter.mockClear();
    updateCharacter.mockClear();
    Object.values(sounds).forEach((sound) => sound.mockClear());
    window.confirm = vi.fn(() => true);
    mockBackend();
  });

  it("копия пресета получает свой id и id строк инвентаря, остальное — как в пресете", () => {
    const copy = characterFromPreset(BARD_PRESET);

    expect(copy.id).not.toBe(BARD_PRESET.id);
    expect(copy.id).toBeTruthy();
    expect(new Set(copy.inventory.map((i) => i.id)).size).toBe(copy.inventory.length);
    expect(copy.inventory.map((i) => i.name)).toEqual(BARD_PRESET.inventory.map((i) => i.name));
    expect({ ...copy, id: BARD_PRESET.id, inventory: [] }).toEqual({ ...BARD_PRESET, inventory: [] });
  });

  it("вес предмета пресета берётся из каталога, а не из файла пресета", () => {
    const copy = characterFromPreset(BARD_PRESET);
    const dagger = copy.inventory.find((i) => i.name === "Кинжал")!;

    expect(dagger.weightLb).toBe(catalogWeightLb("Кинжал"));
    expect(dagger.weightLb).toBeGreaterThan(0);
  });

  it("вкладка «Персонажи» отдаёт готового персонажа в ростер со всеми числами с листа", async () => {
    const bard = await bardFromThePresetPanel();

    expect(bard.name).toBe("Кимри Тростинка");
    expect(bard.race).toBe("Полурослик");
    expect(bard.class).toBe("Бард");
    expect(bard.level).toBe(1);
    expect(bard.maxHp).toBe(9);
    expect(bard.currentHp).toBe(9);
    expect(bard.armorClass).toBe(14);
    expect(bard.speedFeet).toBe(25);
    expect(bard.initiative).toBe(3);
    expect(bard.passivePerception).toBe(11);
    expect(bard.abilities).toEqual({
      strength: 9,
      dexterity: 16,
      constitution: 12,
      intelligence: 10,
      wisdom: 12,
      charisma: 16,
    });
    expect(bard.coins).toEqual({ copper: 6, silver: 4, electrum: 0, gold: 10, platinum: 0 });
    expect(bard.skillProficiencies).toEqual([
      "Атлетика",
      "Выступление",
      "Запугивание",
      "Проницательность",
      "Обращение с животными",
    ]);
    expect(bard.knownCantrips).toEqual(["vicious-mockery", "message"]);
    // Четвёртое известное заклинание барда — «Надтреснутая нота» (cracked-note):
    // на листе там стоит «Диссонирующий шёпот» (PHB, вне SRD), и его место заняло
    // наше оригинальное заклинание близкой темы (docs/design/character-presets.md).
    expect(bard.knownSpells).toEqual(["longstrider", "healing-word", "heroism", "cracked-note"]);
    expect(bard.spellSlotsMax).toEqual(spellSlotsForLevel("classes-bard", 1));
    expect(bard.featureUses).toEqual([{ featureId: "bardic-inspiration", usesCurrent: 3 }]);
  });

  /**
   * Тот самый вопрос карточки: прогрессия у пресетного персонажа и у персонажа
   * из мастера — один код или два. Тело проверки одно, источник персонажа —
   * параметр: обе ветки жмут одну и ту же кнопку одной и той же карточки и
   * обязаны получить числа из одних и тех же таблиц класса.
   */
  const SOURCES: { label: string; make: () => Promise<Character> }[] = [
    { label: "мастера создания", make: bardFromTheWizard },
    { label: "пресета", make: bardFromThePresetPanel },
  ];

  for (const source of SOURCES) {
    it(`левел-ап барда из ${source.label} считается по таблицам класса, а не по источнику персонажа`, async () => {
      const bard = await source.make();
      const updated = await levelUpThroughTheRoster({ ...bard, experiencePoints: 999999 });

      expect(updated.level).toBe(2);
      // Кость хитов барда 1к8 (среднее 5), расового бонуса у полурослика нет.
      expect(updated.maxHp).toBe(maxHpForLevel(8, 5, abilityMod(bard.abilities.constitution), 0, 2));
      expect(updated.maxHp).toBeGreaterThan(bard.maxHp);
      expect(updated.spellSlotsMax).toEqual(spellSlotsForLevel("classes-bard", 2));
      expect(updated.featureUses).toEqual(
        characterResources("classes-bard", "", 2).map((resource) => ({
          featureId: resource.id,
          usesCurrent: resourceMax(resource, bard.abilities),
        })),
      );
    });
  }

  /**
   * Формат пресета обязан нести архетип уровня 1 — следующими идут жрецы, у
   * которых домен выбирается на 1 уровне. Проверяется не то, что поле
   * переживает копирование, а то, что архетип из пресета доходит до общих
   * таблиц: «Домен жизни» даёт владение тяжёлыми доспехами.
   */
  it("пресет с архетипом 1 уровня доносит его до общих таблиц архетипов", async () => {
    const clericPreset: CharacterPreset = {
      ...blankCharacter(),
      id: "preset-cleric-probe",
      class: "Жрец",
      subclass: "Домен жизни",
    };
    const cleric = characterFromPreset(clericPreset);

    expect(cleric.subclass).toBe("Домен жизни");
    const updated = await levelUpThroughTheRoster(cleric);
    expect(updated.subclass).toBe("Домен жизни");
    expect(updated.armorProficiencies).toContain("heavy");
  });

  /**
   * Вторая половина того же требования: `subclassChoices` уровня 1 не теряется
   * и продолжает действовать — выбранная местность Круга земли приносит свои
   * заклинания на следующем уровне.
   */
  it("пресет доносит сделанный выбор внутри архетипа (subclassChoices) до прогрессии", async () => {
    const druidPreset: CharacterPreset = {
      ...blankCharacter(),
      id: "preset-druid-probe",
      class: "Друид",
      level: 2,
      subclass: "Круг земли",
      subclassChoices: { "circle-of-the-land-terrain": ["forest"] },
    };
    const druid = characterFromPreset(druidPreset);

    expect(druid.subclassChoices).toEqual({ "circle-of-the-land-terrain": ["forest"] });
    const updated = await levelUpThroughTheRoster(druid);
    expect(updated.level).toBe(3);
    expect(updated.subclassChoices).toEqual({ "circle-of-the-land-terrain": ["forest"] });
    expect(updated.knownSpells).toEqual(expect.arrayContaining(["barkskin", "spider-climb"]));
  });

  it("каталог отдаёт все двенадцать листов, каждый под своим именем, расой и классом", async () => {
    const presets = (await invoke("get_character_presets")) as CharacterPreset[];

    expect(presets.map((p) => [p.id, p.name, p.race, p.class])).toEqual(CATALOG);
  });

  it("во вкладке «Персонажи» предлагаются все двенадцать готовых персонажей", async () => {
    mockState = baseState();
    render(<CharactersPage />);
    fireEvent.click(screen.getByText("Взять готового персонажа"));

    await screen.findByText(/Кимри Тростинка/);
    for (const [, name, race, className] of CATALOG) {
      expect(screen.getByText(`${name} — ${race}, ${className}`)).toBeInTheDocument();
    }
  });

  /**
   * Одна сторожевая проба на весь каталог, а не по одной на каждого из
   * двенадцати: словарь у названий один, и разойтись с ним может любая строчка
   * любого листа. Заклинания — id из spells.json, навыки — из ALL_SKILLS,
   * надетый доспех — из ARMOR_STATS (иначе КД пересчитается неверно при первой
   * же правке инвентаря).
   */
  it("каждый пресет назван словарём проекта: заклинания, навыки и доспех", () => {
    const spellIds = new Set((bundledSpells as unknown as { id: string }[]).map((s) => s.id));
    const skills = new Set(ALL_SKILLS);
    const armorNames = Object.keys(ARMOR_STATS);

    for (const preset of PRESETS) {
      for (const id of [...preset.knownCantrips, ...preset.knownSpells]) {
        expect(spellIds, `заклинание ${id} пресета ${preset.id}`).toContain(id);
      }
      for (const skill of preset.skillProficiencies) {
        expect(skills, `навык ${skill} пресета ${preset.id}`).toContain(skill);
      }
      // Доспех у пресета либо назван каталогом, либо его нет вовсе; «похожее»
      // название молча даёт КД без доспеха.
      const worn = preset.inventory.filter((i) => /доспех|кольчуга|латы|кираса|полулаты/i.test(i.name));
      for (const item of worn) {
        expect(armorNames, `доспех ${item.name} пресета ${preset.id}`).toContain(item.name);
      }
    }
  });

  /**
   * Домен Знаний с листа «Жреца полуэльфа» — PHB, вне SRD. Его место занял наш
   * «Домен прозрения» (решение владельца от 9 сентября 2026). Проверяется не
   * то, что строчка лежит в файле, а что архетип у факта один: тот же домен
   * стоит в CLASS_SUBCLASSES (откуда его берёт мастер создания) и доходит из
   * пресета до общих таблиц прогрессии.
   */
  it("оригинальный домен Жреца доходит из пресета до таблиц архетипа", async () => {
    expect(CLASS_SUBCLASSES["classes-cleric"].subclasses.map((s) => s.name)).toContain("Домен прозрения");

    const cleric = await presetFromThePanel(/Селиэн Ардвен/);
    expect(cleric.subclass).toBe("Домен прозрения");
    // Заклинания домена 1 уровня — те же, что игрок выписал на лист.
    expect(cleric.knownSpells).toEqual(expect.arrayContaining(["identify", "detect-magic"]));

    const level2 = await levelUpThroughTheRoster({ ...cleric, experiencePoints: 999999 });
    expect(level2.featureUses.map((f) => f.featureId)).toContain("channel-divinity");

    const level3 = await levelUpThroughTheRoster({ ...level2, experiencePoints: 999999 });
    expect(level3.subclass).toBe("Домен прозрения");
    expect(level3.knownSpells).toEqual(expect.arrayContaining(["augury", "locate-object"]));
  });

  /**
   * characters-cleric-prepared-spells: `knownSpells` у Жреца стал списком
   * ПОДГОТОВЛЕННЫХ, и лист готового персонажа обязан пережить переход целиком
   * — ни одно заклинание не исчезло и ни одно не оказалось сверх нормы.
   * Оба жреца каталога проверяются одной пробой: домены у них разные, а
   * правило одно.
   */
  it("готовые жрецы переходят на подготовку без потерь и без перебора нормы", async () => {
    const clerics = PRESETS.filter((preset) => preset.class === "Жрец");
    expect(clerics).toHaveLength(2);

    for (const preset of clerics) {
      const copy = characterFromPreset(preset);
      const status = preparedSpells({
        classId: "classes-cleric",
        abilities: copy.abilities,
        level: copy.level,
        knownSpells: copy.knownSpells,
        alwaysPrepared: subclassSpellsUpToLevel("classes-cleric", copy.subclass, copy.level, copy.subclassChoices),
      });
      // Ничего не потеряно: подготовленное плюс доменное — ровно лист пресета.
      expect([...status.prepared, ...status.alwaysPrepared].sort(), preset.id).toEqual([...preset.knownSpells].sort());
      // Мудрость 16 (+3) на 1 уровне даёт норму в 4, и все четыре свои заняты,
      // а два заклинания домена идут сверх неё.
      expect(status.max, preset.id).toBe(4);
      expect(status.prepared, preset.id).toHaveLength(4);
      expect(status.alwaysPrepared, preset.id).toHaveLength(2);
      expect(status.overflow, preset.id).toBe(0);
    }

    // И то же самое видно на листе взятого из панели жреца, а не только в расчёте.
    const cleric = await presetFromThePanel(/Селиэн Ардвен/);
    mockState = baseState({ characters: [cleric] });
    render(<CharactersPage />);
    expect(await screen.findByText("Подготовленные заклинания (4/4):")).toBeInTheDocument();
    expect(screen.getByText(/Заклинания архетипа — всегда подготовлены, сверх нормы \(2\)/)).toBeInTheDocument();
  });

  /**
   * Сверяется с НАСТОЯЩИМ rules.json, а не с заглушкой `TOPICS` этого файла:
   * заглушка знает две расы из девяти, и проба на ней прошла бы у любого
   * пресета, чью расу в неё просто не положили.
   */
  it("каждый пресет назван словарём проекта: раса и класс — заголовки тем rules.json", () => {
    const topics = bundledRules as unknown as RuleTopic[];
    const raceTitles = topics.filter((t) => t.category === "races").map((t) => t.title);
    const classTitles = topics.filter((t) => t.category === "classes").map((t) => t.title);

    for (const preset of PRESETS) {
      expect(raceTitles, `раса пресета ${preset.id}`).toContain(preset.race);
      expect(classTitles, `класс пресета ${preset.id}`).toContain(preset.class);
    }
  });
});
