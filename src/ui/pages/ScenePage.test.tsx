import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenePage } from "./ScenePage";
import type { CampaignState, EngineState } from "../../state/types";

const { gmCreateScene, gmEndScene, gmCreateFact, gmUpdateFact, gmAskOracle } = vi.hoisted(() => ({
  gmCreateScene: vi.fn(),
  gmEndScene: vi.fn(),
  gmCreateFact: vi.fn(),
  gmUpdateFact: vi.fn(),
  gmAskOracle: vi.fn(),
}));

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({
    state: mockState,
    // Отладочная панель живёт на этом же экране и читает последний ответ
    // движка. Здесь его нет: панель по умолчанию свёрнута, и проверяют её
    // свои пробы (`DebugPanel.test.tsx`).
    lastResult: null,
    gmCreateScene,
    gmEndScene,
    gmCreateFact,
    gmUpdateFact,
    gmAskOracle,
  }),
}));

function stateWith(engine: EngineState | null): CampaignState {
  return {
    id: "c1",
    campaignName: "Тест",
    characters: [],
    journal: [],
    combat: null,
    engine,
  };
}

function activeEngine(): EngineState {
  return {
    scene: {
      id: "scene-1",
      status: "active",
      location: "Подземный зал",
      objective: "Найти выход",
      tension: 4,
      participants: [],
      activeThreats: [],
      sceneTags: ["dark"],
      startedAtTurn: 1,
      resolvedConditions: [],
    },
    adventureLog: [
      {
        id: "log-1",
        turn: 1,
        line: {
          kind: "sceneStarted",
          location: "Подземный зал",
          objective: "Найти выход",
          tension: 4,
        },
      },
    ],
    history: [],
    turn: 1,
    facts: [],
    seed: "481922",
    rngState: "481922",
    rngDraws: "0",
  };
}

beforeEach(() => {
  gmCreateScene.mockReset();
  gmEndScene.mockReset();
  gmCreateFact.mockReset();
  gmUpdateFact.mockReset();
  gmAskOracle.mockReset();
  mockState = stateWith(null);
});

describe("экран сцены", () => {
  it("показывает место, цель и напряжение идущей сцены", () => {
    mockState = stateWith(activeEngine());
    render(<ScenePage />);

    expect(screen.getByText("Подземный зал")).toBeInTheDocument();
    expect(screen.getByText("Найти выход")).toBeInTheDocument();
    expect(screen.getByText("4 из 5")).toBeInTheDocument();
  });

  it("показывает лог приключения строкой, а не сырой записью", () => {
    mockState = stateWith(activeEngine());
    render(<ScenePage />);

    expect(
      screen.getByText(/Сцена началась: Подземный зал\. Цель: «Найти выход»\. Напряжение 4\./),
    ).toBeInTheDocument();
  });

  /**
   * Команда получает НАМЕРЕНИЕ, а не состояние: в аргументах место, цель,
   * участники и теги — и ни одного поля `state.engine`. Проба сторожит именно
   * это: снимка, которым можно затереть чужое, у фронта нет.
   */
  it("создание сцены отправляет намерение", () => {
    render(<ScenePage />);

    fireEvent.change(screen.getByLabelText("Место"), { target: { value: "Подземный зал" } });
    fireEvent.change(screen.getByLabelText("Цель"), { target: { value: "Найти выход" } });
    fireEvent.change(screen.getByLabelText("Теги через запятую"), {
      target: { value: "темнота, подземелье" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Начать сцену" }));

    expect(gmCreateScene).toHaveBeenCalledWith(
      "Подземный зал",
      "Найти выход",
      [],
      ["темнота", "подземелье"],
    );
  });

  it("завершение сцены отправляет исход, а не посчитанное напряжение", () => {
    mockState = stateWith(activeEngine());
    render(<ScenePage />);

    fireEvent.click(screen.getByRole("button", { name: "Положение ухудшилось" }));

    expect(gmEndScene).toHaveBeenCalledWith("worse");
    expect(gmEndScene).toHaveBeenCalledTimes(1);
  });

  it("у завершённой сцены снова предлагает начать новую, но лог держит", () => {
    const engine = activeEngine();
    engine.scene!.status = "resolved";
    mockState = stateWith(engine);
    render(<ScenePage />);

    expect(screen.getByRole("button", { name: "Начать сцену" })).toBeInTheDocument();
    expect(screen.getByText(/Сцена началась: Подземный зал/)).toBeInTheDocument();
  });

  it("без движка показывает форму и пустой лог", () => {
    render(<ScenePage />);

    expect(screen.getByRole("button", { name: "Начать сцену" })).toBeDisabled();
    expect(screen.getByText(/Пока пусто/)).toBeInTheDocument();
  });
});

describe("панель «Активно»", () => {
  function withFacts(): EngineState {
    const engine = activeEngine();
    engine.facts = [
      {
        id: "fact-1",
        subject: "door_03",
        predicate: "locked",
        value: true,
        source: "oracle",
        certainty: "confirmed",
      },
    ];
    return engine;
  }

  it("показывает факт строкой и называет его источник", () => {
    mockState = stateWith(withFacts());
    render(<ScenePage />);

    expect(screen.getByText("door_03.locked = да")).toBeInTheDocument();
    expect(screen.getByText("(Оракул)")).toBeInTheDocument();
  });

  it("пустая панель говорит, что фактов нет, а не молчит", () => {
    mockState = stateWith(activeEngine());
    render(<ScenePage />);

    expect(screen.getByText(/Фактов пока нет/)).toBeInTheDocument();
  });

  /**
   * Заявление факта — намерение: субъект, предикат и значение. Источника в
   * аргументах НЕТ, и это проверяется здесь: происхождение факта назначает
   * команда движка, фронт им не владеет.
   */
  it("форма заявляет факт намерением, без источника и без id", () => {
    mockState = stateWith(activeEngine());
    render(<ScenePage />);

    fireEvent.change(screen.getByLabelText("Субъект"), { target: { value: "door_03" } });
    fireEvent.change(screen.getByLabelText("Предикат"), { target: { value: "locked" } });
    fireEvent.click(screen.getByRole("button", { name: "Заявить факт" }));

    expect(gmCreateFact).toHaveBeenCalledWith("door_03", "locked", true);
  });

  it("изменение факта идёт отдельной командой и с противоположным значением", () => {
    mockState = stateWith(withFacts());
    render(<ScenePage />);

    fireEvent.click(screen.getByRole("button", { name: "Изменить на «нет»" }));

    expect(gmUpdateFact).toHaveBeenCalledWith("door_03", "locked", false);
    expect(gmCreateFact).not.toHaveBeenCalled();
  });
});

describe("форма Оракула", () => {
  /**
   * Вопрос уезжает намерением: текст, пара «субъект + предикат», вероятность
   * из шкалы §6.1 и модификатор §6.4. Ни исхода, ни броска, ни вероятности,
   * посчитанной на фронте, в аргументах нет — решает движок.
   */
  it("отправляет текст, пару, вероятность и модификатор", () => {
    mockState = stateWith(activeEngine());
    render(<ScenePage />);

    fireEvent.change(screen.getByLabelText("Вопрос"), { target: { value: "Дверь заперта?" } });
    fireEvent.change(screen.getByLabelText("Субъект вопроса"), { target: { value: "door_03" } });
    fireEvent.change(screen.getByLabelText("Предикат вопроса"), { target: { value: "locked" } });
    fireEvent.click(screen.getByLabelText("70 — вероятно"));
    fireEvent.change(screen.getByLabelText("Модификатор"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Бросить" }));

    expect(gmAskOracle).toHaveBeenCalledWith("Дверь заперта?", "door_03", "locked", 70, 1);
  });

  it("предлагает ровно пять вероятностей шкалы §6.1 и пять модификаторов §6.4", () => {
    mockState = stateWith(activeEngine());
    render(<ScenePage />);

    expect(screen.getAllByRole("radio")).toHaveLength(5);
    for (const percent of [10, 30, 50, 70, 90]) {
      expect(screen.getByRole("radio", { name: new RegExp(`^${percent} — `) })).toBeInTheDocument();
    }
    const modifiers = screen.getByLabelText("Модификатор") as HTMLSelectElement;
    expect(modifiers.options).toHaveLength(5);
    expect(modifiers.value).toBe("0");
  });

  it("показывает ответ Оракула строкой лога, а не своим состоянием", () => {
    const engine = activeEngine();
    engine.adventureLog = [
      {
        id: "log-oracle",
        turn: 2,
        line: {
          kind: "oracleAnswered",
          question: "Дверь заперта?",
          subject: "door_03",
          predicate: "locked",
          probability: 70,
          roll: null,
          outcome: "yes",
          value: true,
        },
      },
    ];
    mockState = stateWith(engine);
    render(<ScenePage />);

    expect(screen.getByText(/бросок не выполнялся/)).toBeInTheDocument();
  });
});
