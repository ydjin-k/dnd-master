import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenePage } from "./ScenePage";
import type { CampaignState, EngineState } from "../../state/types";

const { gmCreateScene, gmEndScene } = vi.hoisted(() => ({
  gmCreateScene: vi.fn(),
  gmEndScene: vi.fn(),
}));

let mockState: CampaignState;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, gmCreateScene, gmEndScene }),
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
  };
}

beforeEach(() => {
  gmCreateScene.mockReset();
  gmEndScene.mockReset();
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
