import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SpellsPage } from "./SpellsPage";
import type { RuleTopic, Spell } from "../../state/types";
// Настоящие данные подключаются как текст (`?raw`) и разбираются вручную:
// rules.json почти на мегабайт, и прогон его через json-плагин Vite вешает
// воркер vitest на импорте.
import rulesRaw from "../../../src-tauri/rules/rules.json?raw";
import spellsRaw from "../../../src-tauri/rules/spells.json?raw";

const bundledTopics: RuleTopic[] = JSON.parse(rulesRaw);
const bundledSpells: Spell[] = JSON.parse(spellsRaw);

const topics: RuleTopic[] = [
  {
    id: "classes-wizard",
    category: "classes",
    title: "Волшебник",
    sourceUrl: "https://example.test/wizard",
    blocks: [{ type: "paragraph", text: "Класс волшебника" }],
  },
  {
    id: "spellcasting-casting",
    category: "spellcasting",
    title: "Сотворение заклинания",
    sourceUrl: "https://example.test/srd",
    blocks: [{ type: "paragraph", text: "Компоненты заклинания — это материальные требования" }],
  },
  {
    id: "spellcasting-schools",
    category: "spellcasting",
    title: "Школы магии",
    sourceUrl: "https://example.test/srd",
    blocks: [{ type: "paragraph", text: "Восемь категорий, называемых школами магии" }],
  },
];

function spell(id: string, name: string, level: number): Spell {
  return {
    id,
    name,
    level,
    school: "Воплощение",
    castingTime: `${level + 1} действие`,
    range: "60 футов",
    components: "В, С",
    duration: "Мгновенная",
    concentration: false,
    ritual: false,
    classes: ["classes-wizard"],
    description: `Описание заклинания ${name}`,
    damageDice: null,
    damageType: null,
    attackRoll: false,
    savingThrow: null,
  };
}

// Круги нарочно взяты по всей шкале: 0-1 показывала прежняя вкладка «Правила»,
// 5, 6 и 9 не были видны из интерфейса нигде.
const spells: Spell[] = [
  spell("light", "Свет", 0),
  spell("magic-missile", "Волшебная стрела", 1),
  spell("cone-of-cold", "Конус холода", 5),
  spell("chain-lightning", "Цепная молния", 6),
  spell("wish", "Исполнение желаний", 9),
];

// Источник ответа `invoke` подменяем целиком: те же пробы гоняются и на
// компактных фикстурах (логика показа), и на настоящих rules.json/spells.json
// (сколько кругов и заклинаний реально доступно из интерфейса).
let topicsSource: RuleTopic[] = topics;
let spellsSource: Spell[] = spells;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) =>
    command === "get_spells" ? spellsSource : topicsSource,
  ),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

describe("SpellsPage", () => {
  it("shows a section for every spell level in the data, not just cantrips and 1st level", async () => {
    render(<SpellsPage />);

    await waitFor(() => expect(screen.getByText("Заговоры")).toBeInTheDocument());
    expect(screen.getByText("Заклинания 1 круга")).toBeInTheDocument();
    expect(screen.getByText("Заклинания 5 круга")).toBeInTheDocument();
    expect(screen.getByText("Заклинания 6 круга")).toBeInTheDocument();
    expect(screen.getByText("Заклинания 9 круга")).toBeInTheDocument();
  });

  it("opens a 5th-level spell from the navigation on click", async () => {
    render(<SpellsPage />);

    await waitFor(() => expect(screen.getByText("Конус холода")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Конус холода"));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Конус холода" })).toBeInTheDocument(),
    );
    expect(screen.getByText("5 круг, школа: Воплощение")).toBeInTheDocument();
    expect(screen.getByText("6 действие")).toBeInTheDocument();
    expect(screen.getByText("Волшебник")).toBeInTheDocument();
    expect(screen.getByText("Описание заклинания Конус холода")).toBeInTheDocument();
  });

  it("finds a 6th-level spell by search, not only the low circles", async () => {
    render(<SpellsPage />);

    await waitFor(() => expect(screen.getByText("Цепная молния")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Поиск/), { target: { value: "цепная" } });

    await waitFor(() => expect(screen.queryByText("Свет")).not.toBeInTheDocument());
    expect(screen.getByText("Заклинания 6 круга")).toBeInTheDocument();
    // Единственное совпадение открывается само — заклинание видно текстом, а не только в списке.
    expect(screen.getByRole("heading", { name: "Цепная молния" })).toBeInTheDocument();
  });

  it("shows the SRD spellcasting rules topics and opens the first one by default", async () => {
    render(<SpellsPage />);

    await waitFor(() => expect(screen.getByText("Правила сотворения")).toBeInTheDocument());
    expect(screen.getByText("Школы магии")).toBeInTheDocument();
    // Настоящий текст правил, а не заглушка и не одно название темы в списке.
    expect(
      screen.getByText("Компоненты заклинания — это материальные требования"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Школы магии"));
    await waitFor(() =>
      expect(screen.getByText("Восемь категорий, называемых школами магии")).toBeInTheDocument(),
    );
  });

  it("keeps non-spellcasting rule topics out of the navigation", async () => {
    render(<SpellsPage />);

    await waitFor(() => expect(screen.getByText("Правила сотворения")).toBeInTheDocument());
    // «Волшебник» — тема класса, её место на вкладке «Правила»; здесь она
    // встречается только как подпись класса в открытом заклинании.
    expect(screen.queryByText("Класс волшебника")).not.toBeInTheDocument();
  });
});

describe("SpellsPage on the bundled SRD data", () => {
  beforeAll(() => {
    topicsSource = bundledTopics;
    spellsSource = bundledSpells;
  });
  afterAll(() => {
    topicsSource = topics;
    spellsSource = spells;
  });

  it("reaches every circle 0-9 and every bundled spell from the navigation", async () => {
    const { container } = render(<SpellsPage />);

    // Ждём именно подписи секций навигации: слово «Заговоры» встречается ещё и
    // заголовком внутри открытой по умолчанию темы правил.
    const navCategories = () => [...container.querySelectorAll(".rules-page__nav-category")];
    await waitFor(() => expect(navCategories().length).toBeGreaterThan(1));

    const sections = navCategories().map(
      (node) => node.textContent,
    );
    // Заговоры + круги 1-9. До этой карточки интерфейс показывал ровно две секции.
    expect(sections).toEqual([
      "Правила сотворения",
      "Заговоры",
      "Заклинания 1 круга",
      "Заклинания 2 круга",
      "Заклинания 3 круга",
      "Заклинания 4 круга",
      "Заклинания 5 круга",
      "Заклинания 6 круга",
      "Заклинания 7 круга",
      "Заклинания 8 круга",
      "Заклинания 9 круга",
    ]);

    const navItems = container.querySelectorAll(".rules-page__nav-item");
    const spellcastingTopics = bundledTopics.filter((t) => t.category === "spellcasting");
    expect(navItems.length).toBe(spellcastingTopics.length + bundledSpells.length);
  });
});
