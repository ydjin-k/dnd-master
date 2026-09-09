import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RulesPage } from "./RulesPage";
import type { RuleTopic, Spell } from "../../state/types";

const topics: RuleTopic[] = [
  { id: "races-human", category: "races", title: "Человек", sourceUrl: "https://example.test/human", blocks: [{ type: "paragraph", text: "Люди — самая распространённая раса." }] },
  { id: "classes-fighter", category: "classes", title: "Воин", sourceUrl: "https://example.test/fighter", blocks: [{ type: "heading", level: 1, text: "Воин" }] },
  { id: "spellcasting-casting", category: "spellcasting", title: "Сотворение заклинания", sourceUrl: "https://example.test/srd", blocks: [{ type: "paragraph", text: "Компоненты заклинания — это материальные требования" }] },
];

// Заклинания 0 и 1 круга — ровно те, что вкладка «Правила» показывала раньше.
// Если показ вернётся, эти имена снова появятся в разметке и проба покраснеет.
const spells: Spell[] = [
  {
    id: "light", name: "Свет", level: 0, school: "Воплощение", castingTime: "1 действие",
    range: "Касание", components: "В, М", duration: "1 час", concentration: false, ritual: false,
    classes: ["classes-wizard"], description: "Предмет начинает светиться", damageDice: null,
    damageType: null, attackRoll: false, savingThrow: null,
  },
  {
    id: "magic-missile", name: "Волшебная стрела", level: 1, school: "Воплощение", castingTime: "1 действие",
    range: "120 футов", components: "В, С", duration: "Мгновенная", concentration: false, ritual: false,
    classes: ["classes-wizard"], description: "Три светящихся дротика", damageDice: "1к4+1",
    damageType: "силовой", attackRoll: false, savingThrow: null,
  },
];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => (command === "get_spells" ? spells : topics)),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

describe("RulesPage", () => {
  it("loads topics, shows the first one by default, and switches on click without crashing", async () => {
    render(<RulesPage />);

    await waitFor(() => expect(screen.getByText(/Люди — самая распространённая раса/)).toBeInTheDocument());

    fireEvent.click(screen.getByText("Воин"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Воин" })).toBeInTheDocument());
  });

  it("filters the topic list by search input", async () => {
    render(<RulesPage />);

    await waitFor(() => expect(screen.getByText("Воин")).toBeInTheDocument());
    expect(screen.getByText("Человек")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Поиск/), { target: { value: "воин" } });

    await waitFor(() => expect(screen.queryByText("Человек")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Воин" })).toBeInTheDocument();
  });

  it("does not render spells at all — they live on the Spells tab now", async () => {
    render(<RulesPage />);

    await waitFor(() => expect(screen.getByText("Человек")).toBeInTheDocument());

    expect(screen.queryByText("Заговоры")).not.toBeInTheDocument();
    expect(screen.queryByText("Заклинания 1 уровня")).not.toBeInTheDocument();
    expect(screen.queryByText("Свет")).not.toBeInTheDocument();
    expect(screen.queryByText("Волшебная стрела")).not.toBeInTheDocument();

    // Поиск по названию заклинания тоже ничего здесь не находит.
    fireEvent.change(screen.getByPlaceholderText(/Поиск/), { target: { value: "волшебная стрела" } });
    await waitFor(() => expect(screen.queryByText("Человек")).not.toBeInTheDocument());
    expect(screen.queryByText("Волшебная стрела")).not.toBeInTheDocument();
  });

  it("does not render the spellcasting rule topics either — they belong to the Spells tab", async () => {
    render(<RulesPage />);

    await waitFor(() => expect(screen.getByText("Человек")).toBeInTheDocument());

    expect(screen.queryByText("Сотворение заклинания")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Компоненты заклинания — это материальные требования"),
    ).not.toBeInTheDocument();
  });
});
