import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { BestiaryPage } from "./BestiaryPage";
import type { MonsterTemplate } from "../../state/types";

const invokeMock = vi.mocked(invoke);

const monsters: MonsterTemplate[] = [
  {
    id: "wolf",
    name: "Волк",
    maxHp: 11,
    hitDice: "2d8+2",
    armorClass: 13,
    speedFeet: 40,
    attackBonus: 4,
    damageDice: "2d4+2",
    challengeRating: "1/4",
    creatureType: "зверь",
    size: "Средний",
    description: "Средний зверь, без мировоззрения.",
    abilities: { strength: 12, dexterity: 15, constitution: 12, intelligence: 3, wisdom: 12, charisma: 6 },
    passivePerception: 13,
    skills: [
      { skill: "Восприятие", bonus: 3 },
      { skill: "Скрытность", bonus: 4 },
    ],
    traits: ["Острый нюх."],
    actions: ["Укус. Попадание: 7 (2к4+2) колющего урона."],
    imageAsset: "images/wolf.jpg",
  },
  {
    id: "bandit",
    name: "Разбойник",
    maxHp: 11,
    hitDice: "2d8+2",
    armorClass: 12,
    speedFeet: 30,
    attackBonus: 3,
    damageDice: "1d6+1",
    challengeRating: "1/8",
    creatureType: "гуманоид",
    size: "Средний",
    description: "Средний гуманоид.",
    abilities: { strength: 11, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
    passivePerception: 10,
    languages: ["любой один язык (обычно Общий)"],
    traits: [],
    actions: ["Скимитар. Попадание: 4 (1к6+1) рубящего урона."],
    imageAsset: null,
  },
  {
    id: "bat",
    name: "Летучая мышь",
    maxHp: 1,
    hitDice: "1d4-1",
    armorClass: 12,
    speedFeet: 5,
    attackBonus: 0,
    damageDice: "1",
    challengeRating: "0",
    creatureType: "зверь",
    size: "Крошечный",
    description: "Крошечный зверь, без мировоззрения.",
    abilities: { strength: 2, dexterity: 15, constitution: 8, intelligence: 2, wisdom: 12, charisma: 4 },
    passivePerception: 11,
    senses: [{ name: "слепое зрение", rangeFeet: 60 }],
    traits: [],
    actions: ["Укус."],
    imageAsset: "images/bat.png",
  },
  // Существо с ПОЛНОЙ шапкой стат-блока. Оно нарочно выдумано и живёт только
  // здесь: у нынешних пятидесяти нет ни спасбросков, ни сопротивлений, ни
  // реакций (в их блоках SRD этих строк нет), а показ этих строк проверить
  // надо — их привезёт следующая карточка, `bestiary-finish-srd-monsters`.
  {
    id: "test-dummy",
    name: "Пробное чудище",
    maxHp: 40,
    hitDice: "9d8",
    armorClass: 15,
    speedFeet: 30,
    attackBonus: 5,
    damageDice: "2d6+3",
    challengeRating: "5",
    creatureType: "исчадие",
    size: "Большой",
    description: "Большое исчадие, законно-злое.",
    abilities: { strength: 18, dexterity: 14, constitution: 16, intelligence: 8, wisdom: 11, charisma: 9 },
    passivePerception: 14,
    savingThrows: [
      { ability: "dexterity", bonus: 5 },
      { ability: "wisdom", bonus: 3 },
    ],
    skills: [{ skill: "Восприятие", bonus: 4 }],
    damageVulnerabilities: ["лучистый"],
    damageResistances: ["холод"],
    damageImmunities: ["огонь", "яд"],
    conditionImmunities: ["Отравленное"],
    senses: [{ name: "тёмное зрение", rangeFeet: 120 }],
    languages: ["Инфернальный"],
    traits: ["Пробная особенность."],
    actions: ["Пробная атака."],
    reactions: ["Пробная реакция."],
    legendaryActions: ["Пробное легендарное действие."],
    imageAsset: null,
  },
];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "get_bestiary") return monsters;
    if (cmd === "get_bestiary_image") return "data:image/jpeg;base64,AAAA";
    return null;
  }),
}));

// jsdom не реализует IntersectionObserver — список бестиария теперь грузит
// мелкие превью по видимости строки (карточка bestiary-thumbnail-loading-at-scale,
// см. BestiaryPage.tsx), так что тестам нужен способ явно сказать «эта строка
// сейчас видна», а не полагаться на реальную геометрию прокрутки.
class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observed: Element[] = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((o) => o !== el);
  }
  disconnect() {
    this.observed = [];
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Тестовый помощник: помечает все сейчас наблюдаемые строки видимыми. */
  intersectAll() {
    const entries = this.observed.map(
      (target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry,
    );
    this.callback(entries, this);
  }
}

describe("BestiaryPage", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    MockIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  it("loads monsters, shows the first one's stat block by default, and switches on click", async () => {
    render(<BestiaryPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Волк" })).toBeInTheDocument());
    expect(screen.getByText(/Острый нюх/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Разбойник"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Разбойник" })).toBeInTheDocument());
    expect(screen.getByText(/Скимитар/)).toBeInTheDocument();
  });

  it("filters the monster list by search input", async () => {
    render(<BestiaryPage />);

    await waitFor(() => expect(screen.getAllByText("Волк").length).toBeGreaterThan(0));
    expect(screen.getByText("Разбойник")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Поиск/), { target: { value: "волк" } });

    await waitFor(() => expect(screen.queryByText("Разбойник")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Волк" })).toBeInTheDocument();
  });

  it("does not request list thumbnails before their row is visible, only the selected monster's detail image", async () => {
    render(<BestiaryPage />);

    // Деталь загружается сразу (одна картинка), список — по видимости строки:
    // до пересечения ушёл только 1 вызов (детальная картинка волка).
    const detailPortrait = await screen.findByRole("img", { name: "Волк" });
    expect(detailPortrait.getAttribute("src")).toMatch(/^data:image\//);
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_bestiary_image")).toHaveLength(1);
  });

  it("requests a small list thumbnail and a separate, larger detail image once rows become visible", async () => {
    render(<BestiaryPage />);
    await screen.findByRole("img", { name: "Волк" }); // дождаться начальной загрузки детали

    // Эффект пересоздаёт наблюдатель, когда список тварей меняется (пустой ->
    // загруженный), так что нужен последний инстанс — тот, что реально
    // наблюдает строки с уже отрисованными тварями.
    expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0);
    MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1].intersectAll();

    // Не findAllByRole — она резолвится, как только находит хоть одно
    // совпадение (уже загруженная деталь), не дожидаясь второго (список).
    // waitFor опрашивает, пока не появятся оба.
    await waitFor(() => expect(screen.getAllByRole("img", { name: "Волк" })).toHaveLength(2));
    const portraits = screen.getAllByRole("img", { name: "Волк" });
    expect(portraits.every((portrait) => portrait.getAttribute("src")?.startsWith("data:image/"))).toBe(true);

    // Только у волка и летучей мыши есть картинка (у разбойника imageAsset: null) — после
    // того как все строки стали видимыми, должно уйти 2 вызова на волка (мелкое превью для
    // списка + крупное для выбранной твари) и 1 на летучую мышь (только список), не 5+ разом.
    await waitFor(() =>
      expect(invokeMock.mock.calls.filter(([command]) => command === "get_bestiary_image")).toHaveLength(3),
    );
    const imageCalls = invokeMock.mock.calls.filter(([command]) => command === "get_bestiary_image");
    const wolfCalls = imageCalls.filter(([, args]) => (args as { imageAsset: string }).imageAsset === "images/wolf.jpg");
    expect(wolfCalls).toHaveLength(2);
    const wolfSizes = wolfCalls.map(([, args]) => (args as { maxSize: number }).maxSize).sort((a, b) => a - b);
    expect(wolfSizes[0]).toBeLessThan(wolfSizes[1]);
  });

  it("requests only the newly selected monster's detail image on selection change, not every monster again", async () => {
    render(<BestiaryPage />);

    // Ждём не заголовок, а саму картинку волка: заголовок оказывается в DOM раньше,
    // чем React успевает выполнить эффект, запрашивающий его детальную картинку. Если
    // чистить счётчик по заголовку, запрос волка иногда уезжает уже ПОСЛЕ mockClear() и
    // попадает в замер как чужой (карточка bug-bestiary-detail-image-test-flaky).
    await screen.findByRole("img", { name: "Волк" });

    // Размер детали берём не числом из BestiaryPage.tsx (это завёл бы второго владельца
    // факта), а из самих запросов: деталь — самая крупная из картинок, превью списка
    // всегда мельче (тот же признак, что у соседней пробы).
    const detailSize = Math.max(
      ...invokeMock.mock.calls
        .filter(([command]) => command === "get_bestiary_image")
        .map(([, args]) => (args as { maxSize: number }).maxSize),
    );

    invokeMock.mockClear();

    fireEvent.click(screen.getByText("Летучая мышь"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Летучая мышь" })).toBeInTheDocument());

    // Считаем только ДЕТАЛЬНЫЕ запросы: мелкие превью списка идут той же командой
    // и приезжают лениво, когда строка попала в видимость, — проба стережёт не их.
    const detailAssets = invokeMock.mock.calls
      .filter(
        ([command, args]) =>
          command === "get_bestiary_image" && (args as { maxSize: number }).maxSize === detailSize,
      )
      .map(([, args]) => (args as { imageAsset: string }).imageAsset);
    expect(detailAssets).toEqual(["images/bat.png"]);
  });

  it("shows every stat-block field a creature has", async () => {
    render(<BestiaryPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Волк" })).toBeInTheDocument());

    fireEvent.click(screen.getByText("Пробное чудище"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Пробное чудище" })).toBeInTheDocument(),
    );

    const card = screen.getByRole("article");

    // Характеристики — значение и модификатор, посчитанный тем же abilityMod,
    // что и на листе персонажа.
    expect(within(card).getByText("Сила").nextSibling).toHaveTextContent("18 (+4)");
    expect(within(card).getByText("Интеллект").nextSibling).toHaveTextContent("8 (-1)");

    const rowValue = (label: string) =>
      within(card).getByText(label).nextSibling?.textContent;

    expect(rowValue("Спасброски")).toBe("Ловкость +5, Мудрость +3");
    expect(rowValue("Навыки")).toBe("Восприятие +4");
    expect(rowValue("Уязвимость к урону")).toBe("лучистый");
    expect(rowValue("Сопротивление урону")).toBe("холод");
    expect(rowValue("Иммунитет к урону")).toBe("огонь, яд");
    expect(rowValue("Иммунитет к состояниям")).toBe("Отравленное");
    expect(rowValue("Чувства")).toBe("тёмное зрение 120 футов");
    expect(rowValue("Языки")).toBe("Инфернальный");
    expect(rowValue("Пассивная внимательность")).toBe("14");

    expect(within(card).getByText("Реакции")).toBeInTheDocument();
    expect(within(card).getByText(/Пробная реакция/)).toBeInTheDocument();
    expect(within(card).getByText("Легендарные действия")).toBeInTheDocument();
    expect(within(card).getByText(/Пробное легендарное действие/)).toBeInTheDocument();
  });

  it("leaves no empty row where a creature simply has no such field", async () => {
    render(<BestiaryPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Волк" })).toBeInTheDocument());

    // У волка в блоке SRD нет ни языков, ни чувств с дальностью, ни
    // спасбросков, ни иммунитетов — подписи не должны появиться ВООБЩЕ.
    // Пустая клетка на их месте читалась бы как потерянные данные.
    const card = screen.getByRole("article");
    for (const label of [
      "Спасброски",
      "Уязвимость к урону",
      "Сопротивление урону",
      "Иммунитет к урону",
      "Иммунитет к состояниям",
      "Чувства",
      "Языки",
      "Реакции",
      "Легендарные действия",
    ]) {
      expect(within(card).queryByText(label)).not.toBeInTheDocument();
    }

    // А то, что у волка есть, на месте.
    expect(within(card).getByText("Навыки").nextSibling).toHaveTextContent(
      "Восприятие +3, Скрытность +4",
    );
    expect(within(card).getByText("Пассивная внимательность").nextSibling).toHaveTextContent("13");

    // У летучей мыши чувство есть, а языков нет — соседняя проверка тому же правилу.
    fireEvent.click(screen.getByText("Летучая мышь"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Летучая мышь" })).toBeInTheDocument(),
    );
    const batCard = screen.getByRole("article");
    expect(within(batCard).getByText("Чувства").nextSibling).toHaveTextContent(
      "слепое зрение 60 футов",
    );
    expect(within(batCard).queryByText("Языки")).not.toBeInTheDocument();
  });
});
