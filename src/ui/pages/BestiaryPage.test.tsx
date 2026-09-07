import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { BestiaryPage } from "./BestiaryPage";
import type { MonsterTemplate } from "../../state/types";

const invokeMock = vi.mocked(invoke);

const monsters: MonsterTemplate[] = [
  {
    id: "wolf",
    name: "Волк",
    maxHp: 11,
    armorClass: 13,
    speedFeet: 40,
    attackBonus: 4,
    damageDice: "2d4+2",
    challengeRating: "1/4",
    creatureType: "зверь",
    size: "Средний",
    description: "Средний зверь, без мировоззрения.",
    traits: ["Острый нюх."],
    actions: ["Укус. Попадание: 7 (2к4+2) колющего урона."],
    imageAsset: "images/wolf.jpg",
  },
  {
    id: "bandit",
    name: "Разбойник",
    maxHp: 11,
    armorClass: 12,
    speedFeet: 30,
    attackBonus: 3,
    damageDice: "1d6+1",
    challengeRating: "1/8",
    creatureType: "гуманоид",
    size: "Средний",
    description: "Средний гуманоид.",
    traits: [],
    actions: ["Скимитар. Попадание: 4 (1к6+1) рубящего урона."],
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

describe("BestiaryPage", () => {
  beforeEach(() => invokeMock.mockClear());

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

  it("preloads each available image once and shares it between the list and detail", async () => {
    render(<BestiaryPage />);

    const portraits = await screen.findAllByRole("img", { name: "Волк" });
    expect(portraits).toHaveLength(2);
    expect(portraits.every((portrait) => portrait.getAttribute("src")?.startsWith("data:image/"))).toBe(true);
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "get_bestiary_image"),
    ).toHaveLength(1);
  });
});
