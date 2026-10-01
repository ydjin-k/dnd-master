import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TravelPage } from "./TravelPage";
import { exhaustionLevelName } from "../exhaustion";
import { emptyTravelState, travelledMiles } from "../travelPace";
import type { CampaignState, Character, TravelState } from "../../state/types";

const { invokeMock, setTravel, updateCharacter, recordRoll } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  setTravel: vi.fn(),
  updateCharacter: vi.fn(),
  recordRoll: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, setTravel, updateCharacter }),
}));
vi.mock("../../state/DiceLogContext", () => ({ useDiceLog: () => ({ recordRoll }) }));

/** Герой с теми полями, которые читает экран странствия. */
function hero(over: Partial<Character> = {}): Character {
  return {
    id: "ch1",
    name: "Тестовый герой",
    level: 1,
    abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    conditions: [],
    halfDaysWithoutFood: 0,
    savingThrowProficiencies: [],
    skillProficiencies: [],
    ...over,
  } as unknown as Character;
}

function stateWith(travel: TravelState | null, characters: Character[] = [hero()]): CampaignState {
  return { id: "c1", campaignName: "Тест", characters, journal: [], combat: null, engine: null, travel };
}

/** Кость движка, которая всегда даёт `total` (модификатор уже внутри). */
function rollsAlways(total: number) {
  invokeMock.mockImplementation(async (_cmd: string, args: { expression: string }) => ({
    expression: args.expression,
    rolls: [total],
    modifier: 0,
    total,
    dropped: null,
  }));
}

/**
 * Кость, которая отвечает по числу граней: `{ 20: 18, 6: 4 }` — проверке 18, а
 * выдаче 4. Нужна сбору еды, где за одно нажатие бросаются две разные кости.
 */
function rollsByDie(totals: Record<number, number>) {
  invokeMock.mockImplementation(async (_cmd: string, args: { expression: string }) => {
    const die = Number(/d(\d+)/.exec(args.expression)![1]);
    const total = totals[die];
    return { expression: args.expression, rolls: [total], modifier: 0, total, dropped: null };
  });
}

/** Что уехало в последний вызов `setTravel`, применённое к состоянию экрана. */
function lastTravel(from: TravelState): TravelState {
  const calls = setTravel.mock.calls;
  const updater = calls[calls.length - 1][0] as (current: TravelState) => TravelState;
  return updater(from);
}

/** Что уехало в последний вызов `updateCharacter`, применённое к персонажу. */
function lastCharacter(from: Character): Character {
  const calls = updateCharacter.mock.calls;
  const updater = calls[calls.length - 1][1] as (c: Character) => Character;
  return updater(from);
}

describe("Странствие", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    setTravel.mockReset();
    setTravel.mockResolvedValue(undefined);
    updateCharacter.mockReset();
    updateCharacter.mockResolvedValue(undefined);
    recordRoll.mockReset();
    mockState = stateWith(null);
  });

  it("кампания без счётчика открывается обычным темпом и нулями", () => {
    render(<TravelPage onBack={() => {}} />);

    expect((screen.getByRole("radio", { name: /Обычный/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Дней пути").nextSibling).toHaveTextContent("0");
    expect(screen.getByText("Пройдено миль").nextSibling).toHaveTextContent("0");
  });

  it("три строки темпа показаны числами SRD", () => {
    render(<TravelPage onBack={() => {}} />);

    expect(screen.getByText(/400 фт\/мин · 4 мили\/час · 30 миль\/день/)).toBeInTheDocument();
    expect(screen.getByText(/300 фт\/мин · 3 мили\/час · 24 миль\/день/)).toBeInTheDocument();
    expect(screen.getByText(/200 фт\/мин · 2 мили\/час · 18 миль\/день/)).toBeInTheDocument();
  });

  it("выбранный темп уезжает в кампанию, а не остаётся на экране", () => {
    render(<TravelPage onBack={() => {}} />);

    fireEvent.click(screen.getByRole("radio", { name: /Быстрый/ }));

    expect(lastTravel(emptyTravelState()).pace).toBe("fast");
  });

  it("труднопроходимая местность режет показанные числа вдвое", () => {
    mockState = stateWith({ ...emptyTravelState(), difficultTerrain: true });
    render(<TravelPage onBack={() => {}} />);

    expect(screen.getByText(/200 фт\/мин · 2 мили\/час · 15 миль\/день/)).toBeInTheDocument();
  });

  it("счётчик показывает мили, выведенные из темпа и часов", () => {
    const travel = { ...emptyTravelState(), pace: "fast" as const, dayMarches: 2, hoursToday: 3 };
    mockState = stateWith(travel);
    render(<TravelPage onBack={() => {}} />);

    // 2 × 30 + 3 × 4 = 72, и ровно это считает владелец числа.
    expect(travelledMiles(travel)).toBe(72);
    expect(screen.getByText("Пройдено миль").nextSibling).toHaveTextContent("72");
  });

  it("«прошли час» добавляет час, а не день", () => {
    render(<TravelPage onBack={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Прошли час" }));

    const next = lastTravel(emptyTravelState());
    expect(next.hoursToday).toBe(1);
    expect(next.dayMarches).toBe(0);
  });

  it("«темп вдвое» и «потерян день» двигают свои счётчики", () => {
    render(<TravelPage onBack={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Темп вдвое" }));
    expect(lastTravel(emptyTravelState()).halfDayMarches).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Потерян день" }));
    expect(lastTravel(emptyTravelState()).lostDays).toBe(1);
  });

  describe("форсированный марш", () => {
    it("до восьмого часа спасброска не просят", async () => {
      mockState = stateWith({ ...emptyTravelState(), hoursToday: 6 });
      render(<TravelPage onBack={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: "Прошли час" }));

      await waitFor(() => expect(setTravel).toHaveBeenCalled());
      expect(screen.queryByText(/Форсированный марш/)).not.toBeInTheDocument();
    });

    /** Критерий карточки: на 11-м часу требуется УС 13. */
    it("одиннадцатый час требует УС 13", async () => {
      mockState = stateWith({ ...emptyTravelState(), hoursToday: 10 });
      render(<TravelPage onBack={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: "Прошли час" }));

      expect(await screen.findByText(/11-й час — спасбросок Телосложения УС 13/)).toBeInTheDocument();
    });

    it("девятый час требует УС 11", async () => {
      mockState = stateWith({ ...emptyTravelState(), hoursToday: 8 });
      render(<TravelPage onBack={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: "Прошли час" }));

      expect(await screen.findByText(/9-й час — спасбросок Телосложения УС 11/)).toBeInTheDocument();
    });

    it("провал поднимает истощение на листе существующим механизмом состояний", async () => {
      mockState = stateWith({ ...emptyTravelState(), hoursToday: 10 });
      render(<TravelPage onBack={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Прошли час" }));
      rollsAlways(5);

      fireEvent.click(await screen.findByRole("button", { name: "Спасбросок" }));

      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
      expect(lastCharacter(hero()).conditions).toEqual([exhaustionLevelName(1)]);
    });

    it("второй провал даёт второй уровень, а не вторую строку", async () => {
      mockState = stateWith({ ...emptyTravelState(), hoursToday: 10 });
      render(<TravelPage onBack={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Прошли час" }));
      rollsAlways(5);

      fireEvent.click(await screen.findByRole("button", { name: "Спасбросок" }));
      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());

      // Второй бросок считается от персонажа, который уже истощён.
      expect(lastCharacter(hero({ conditions: [exhaustionLevelName(1)] })).conditions).toEqual([
        exhaustionLevelName(2),
      ]);
    });

    it("успех ничего не пишет в персонажа", async () => {
      mockState = stateWith({ ...emptyTravelState(), hoursToday: 10 });
      render(<TravelPage onBack={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Прошли час" }));
      rollsAlways(19);

      fireEvent.click(await screen.findByRole("button", { name: "Спасбросок" }));

      await waitFor(() => expect(recordRoll).toHaveBeenCalled());
      expect(updateCharacter).not.toHaveBeenCalled();
      expect(screen.getByText(/19 против УС 13 — успех/)).toBeInTheDocument();
    });

    it("бросок идёт костью движка и попадает в журнал бросков", async () => {
      mockState = stateWith({ ...emptyTravelState(), hoursToday: 10 }, [
        hero({ abilities: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 } }),
      ]);
      render(<TravelPage onBack={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Прошли час" }));
      rollsAlways(15);

      fireEvent.click(await screen.findByRole("button", { name: "Спасбросок" }));

      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("roll_dice", { expression: "1d20+2" }));
      expect(recordRoll).toHaveBeenCalledWith(expect.stringContaining("Форсированный марш"), expect.anything());
    });

    it("закрытый день убирает панель марша", async () => {
      mockState = stateWith({ ...emptyTravelState(), hoursToday: 10 });
      render(<TravelPage onBack={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Прошли час" }));
      expect(await screen.findByText(/11-й час/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Прошли день" }));

      await waitFor(() => expect(screen.queryByText(/11-й час/)).not.toBeInTheDocument());
    });
  });

  describe("привал: еда и вода", () => {
    it("счётчик голода показан вместе с пределом из Телосложения", () => {
      mockState = stateWith(null, [
        hero({
          halfDaysWithoutFood: 3,
          abilities: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        }),
      ]);
      render(<TravelPage onBack={() => {}} />);

      expect(screen.getByText("без еды 1.5 дн. из 5")).toBeInTheDocument();
    });

    it("полный рацион обнуляет счёт голода", async () => {
      render(<TravelPage onBack={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: "Полный рацион" }));

      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
      expect(lastCharacter(hero({ halfDaysWithoutFood: 5 })).halfDaysWithoutFood).toBe(0);
    });

    it("за пределом день без еды даёт степень истощения без всякого броска", async () => {
      render(<TravelPage onBack={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: "Не ел" }));

      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
      // Телосложение 10 → предел три дня: шесть полудней уже за ним.
      const starved = lastCharacter(hero({ halfDaysWithoutFood: 6 }));
      expect(starved.conditions).toEqual([exhaustionLevelName(1)]);
      expect(starved.halfDaysWithoutFood).toBe(8);
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it("половина нормы воды требует спасброска СЛ 15, и провал даёт истощение", async () => {
      render(<TravelPage onBack={() => {}} />);
      rollsAlways(9);

      fireEvent.click(screen.getByRole("button", { name: "Полнормы" }));

      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
      expect(screen.getByText(/Спасбросок 9 против СЛ 15 — истощение \+1/)).toBeInTheDocument();
      expect(lastCharacter(hero()).conditions).toEqual([exhaustionLevelName(1)]);
    });

    it("успешный спасбросок от жажды ничего не пишет", async () => {
      render(<TravelPage onBack={() => {}} />);
      rollsAlways(16);

      fireEvent.click(screen.getByRole("button", { name: "Полнормы" }));

      await waitFor(() => expect(screen.getByText(/16 против СЛ 15 — обошлось/)).toBeInTheDocument());
      expect(updateCharacter).not.toHaveBeenCalled();
    });

    it("меньше половины — истощение без броска, а уже истощённому сразу две степени", async () => {
      mockState = stateWith(null, [hero({ conditions: [exhaustionLevelName(1)] })]);
      render(<TravelPage onBack={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: "Меньше" }));

      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());
      expect(invokeMock).not.toHaveBeenCalled();
      expect(lastCharacter(hero({ conditions: [exhaustionLevelName(1)] })).conditions).toEqual([
        exhaustionLevelName(3),
      ]);
    });

    it("норма воды выпита — ничего не происходит", async () => {
      render(<TravelPage onBack={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: "Норма воды" }));

      await waitFor(() => expect(screen.getByText(/Норма воды выпита \(1 гал\.\)/)).toBeInTheDocument());
      expect(updateCharacter).not.toHaveBeenCalled();
    });

    it("в жару норма — два галлона", async () => {
      render(<TravelPage onBack={() => {}} />);
      fireEvent.click(screen.getByLabelText(/Жаркая погода/));

      fireEvent.click(screen.getByRole("button", { name: "Норма воды" }));

      await waitFor(() => expect(screen.getByText(/Норма воды выпита \(2 гал\.\)/)).toBeInTheDocument());
    });
  });

  describe("сбор еды", () => {
    it("ступени изобилия показаны со своими Сложностями", () => {
      render(<TravelPage onBack={() => {}} />);
      const zones = screen.getByLabelText("Изобилие зоны") as HTMLSelectElement;

      expect([...zones.options].map((o) => o.textContent)).toEqual([
        "Скудная — Сложность 20",
        "Обычная — Сложность 15",
        "Изобильная — Сложность 10",
      ]);
    });

    it("успех в изобильной зоне даёт фунты еды и столько же галлонов воды", async () => {
      mockState = stateWith(null, [
        hero({
          skillProficiencies: ["Выживание"],
          abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 14, charisma: 10 },
        }),
      ]);
      render(<TravelPage onBack={() => {}} />);
      fireEvent.change(screen.getByLabelText("Изобилие зоны"), { target: { value: "abundant" } });
      // Две кости за один сбор: проверка и выдача. Мок различает их выражением —
      // иначе выдача получила бы итог проверки и число в подписи ничего бы не значило.
      rollsByDie({ 20: 18, 6: 4 });

      fireEvent.click(screen.getByRole("button", { name: "Бросить проверку" }));

      // 1к6 = 4 плюс модификатор Мудрости +2 — шесть фунтов и шесть галлонов.
      expect(await screen.findByText(/18 против Сложности 10 — 6 фунт\(ов\) еды и 6 гал\. воды/)).toBeInTheDocument();
    });

    it("провал проверки не даёт ни еды, ни воды", async () => {
      render(<TravelPage onBack={() => {}} />);
      rollsByDie({ 20: 3, 6: 6 });

      fireEvent.click(screen.getByRole("button", { name: "Бросить проверку" }));

      expect(await screen.findByText(/3 против Сложности 15 — съедобного не нашлось/)).toBeInTheDocument();
    });

    it("проверка идёт с модификатором Мудрости и владением Выживанием", async () => {
      mockState = stateWith(null, [
        hero({
          skillProficiencies: ["Выживание"],
          abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 14, charisma: 10 },
        }),
      ]);
      render(<TravelPage onBack={() => {}} />);
      rollsAlways(12);

      fireEvent.click(screen.getByRole("button", { name: "Бросить проверку" }));

      // Мудрость 14 → +2, владение на 1 уровне → +2: итого 1d20+4.
      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("roll_dice", { expression: "1d20+4" }));
      // Выдача бросается своей костью — 1к6, без модификатора в выражении.
      expect(invokeMock).toHaveBeenCalledWith("roll_dice", { expression: "1d6" });
    });
  });

  it("пустая кампания не роняет экран и говорит, что людей нет", () => {
    mockState = stateWith(null, []);
    render(<TravelPage onBack={() => {}} />);

    expect(screen.getByText(/Кормить некого/)).toBeInTheDocument();
    expect(screen.getByText(/Собирать некому/)).toBeInTheDocument();
  });
});
