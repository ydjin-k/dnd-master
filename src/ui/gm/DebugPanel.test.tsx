import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebugPanel } from "./DebugPanel";
import type { CampaignState, EngineState, ResultObject } from "../../state/types";

let mockState: CampaignState;
let mockLastResult: ResultObject | null;
vi.mock("../../state/CampaignContext", () => ({
  useCampaign: () => ({ state: mockState, lastResult: mockLastResult }),
}));

function engine(over: Partial<EngineState> = {}): EngineState {
  return {
    scene: null,
    adventureLog: [],
    history: [],
    turn: 14,
    facts: [],
    seed: "481922",
    rngState: "9007199254740993",
    rngDraws: "14",
    ...over,
  };
}

function stateWith(engineState: EngineState | null): CampaignState {
  return {
    travel: null,
    id: "c1",
    campaignName: "Тест",
    characters: [],
    journal: [],
    combat: null,
    engine: engineState,
  };
}

function result(over: Partial<ResultObject> = {}): ResultObject {
  return {
    success: true,
    resultType: "ORACLE",
    summaryKey: "oracle.rolled",
    rolls: [{ die: "1d100", value: 82, modifier: 0, total: 82, target: 70 }],
    stateChanges: [],
    generatedEvents: [],
    choices: [],
    trace: [
      "Action Router → ORACLE",
      "Вопрос → door_03.guard («Тут есть охрана?» — текст для журнала, в логике не участвует)",
      "Базовая → 50 (равные шансы)",
      "Модификатор → +1 (шаг категории §6.4) → 70",
      "Бросок → 82 (1d100, сид 481922, обращение №14)",
      "Исход → No (82 > 70)",
      "Факт → создан: door_03.guard = false (источник oracle)",
      "Лог → строка добавлена",
    ],
    ...over,
  };
}

beforeEach(() => {
  mockState = stateWith(engine());
  mockLastResult = result();
});

describe("отладочный экран движка (§38)", () => {
  it("по умолчанию выключен: игроку отладка не показывается", () => {
    render(<DebugPanel />);

    expect(screen.getByLabelText("Отладка движка (§38)")).not.toBeChecked();
    expect(screen.queryByText(/Базовая/)).not.toBeInTheDocument();
    expect(screen.queryByText("481922")).not.toBeInTheDocument();
  });

  it("переключатель открывает всю цепочку §38 по последнему действию", () => {
    render(<DebugPanel />);
    fireEvent.click(screen.getByLabelText("Отладка движка (§38)"));

    expect(screen.getByText("ORACLE")).toBeInTheDocument();
    expect(screen.getByText(/Базовая → 50/)).toBeInTheDocument();
    expect(screen.getByText(/Модификатор → \+1/)).toBeInTheDocument();
    expect(screen.getByText(/Бросок → 82/)).toBeInTheDocument();
    expect(screen.getByText(/Исход → No/)).toBeInTheDocument();
    expect(screen.getByText(/Факт → создан/)).toBeInTheDocument();
  });

  /**
   * Сид и номер обращения — то, чего нельзя узнать ниоткуда больше: без них
   * «тот же сид — тот же результат» (§44 шаг 11) нечем проверить руками.
   *
   * Состояние потока показывается СТРОКОЙ как пришло: 9007199254740993 больше
   * точного целого в JavaScript, и посчитай экран хоть что-нибудь над этим
   * числом — увидели бы 9007199254740992.
   */
  it("показывает сид кампании и число обращений к ГСЧ", () => {
    const { container } = render(<DebugPanel />);
    fireEvent.click(screen.getByLabelText("Отладка движка (§38)"));

    // По ячейкам, а не по тексту: «14» на экране встречается дважды — ходом и
    // числом обращений, — и проба обязана знать, где что.
    expect(container.querySelector('[data-field="seed"]')).toHaveTextContent("481922");
    expect(container.querySelector('[data-field="rngDraws"]')).toHaveTextContent("14");
    expect(container.querySelector('[data-field="turn"]')).toHaveTextContent("14");
  });

  /**
   * ОТРИЦАТЕЛЬНАЯ ПРОБА карточки: в трассировку подложена итоговая
   * вероятность, которой не может получиться ни из какого пересчёта, — 999 при
   * базовой 50 и модификаторе +1.
   *
   * Экран, который ПОКАЗЫВАЕТ `trace`, напечатает 999. Экран, который считает
   * сам (снятая починка: вывести итог из базовой и модификатора вместо строки
   * движка), напечатает 70 — и проба покраснеет на обеих строках сразу. Это и
   * есть разница между «показывает то, что решил решавший» и «догадывается».
   */
  it("печатает трассировку как есть и ничего в ней не пересчитывает", () => {
    mockLastResult = result({
      trace: [
        "Базовая → 50 (равные шансы)",
        "Модификатор → +1 (шаг категории §6.4) → 999",
        "Бросок → 82 (1d100, сид 481922, обращение №14)",
      ],
    });
    render(<DebugPanel />);
    fireEvent.click(screen.getByLabelText("Отладка движка (§38)"));

    expect(screen.getByText(/→ 999/)).toBeInTheDocument();
    expect(screen.queryByText(/→ 70$/)).not.toBeInTheDocument();
  });

  /**
   * §6.3 на экране — то, ради чего экран и нужен. Строку «БРОСОК НЕ
   * ВЫПОЛНЯЛСЯ» пишет Оракул, экран её показывает; список бросков при этом
   * пуст, и это видно отдельно.
   */
  it("случай «ответ из факта, броска не было» отличим от случая с броском", () => {
    mockLastResult = result({
      summaryKey: "oracle.fromFact",
      rolls: [],
      trace: [
        "Action Router → ORACLE",
        "Fact Store → door_03.locked = true (источник Master) — ОТВЕТ ИЗ ФАКТА, БРОСОК НЕ ВЫПОЛНЯЛСЯ (§6.3)",
        "ГСЧ не тронут: обращений было 14 и осталось 14",
        "Исход → Yes",
      ],
    });
    render(<DebugPanel />);
    fireEvent.click(screen.getByLabelText("Отладка движка (§38)"));

    expect(screen.getByText(/БРОСОК НЕ ВЫПОЛНЯЛСЯ/)).toBeInTheDocument();
    expect(screen.getByText(/ГСЧ не тронут/)).toBeInTheDocument();
    expect(screen.getByText("нет")).toBeInTheDocument();
    expect(screen.queryByText(/1d100/)).not.toBeInTheDocument();
  });

  it("до первого ответа движка говорит, что трассировке взяться неоткуда", () => {
    mockLastResult = null;
    render(<DebugPanel />);
    fireEvent.click(screen.getByLabelText("Отладка движка (§38)"));

    expect(screen.getByText(/ещё не отвечал/)).toBeInTheDocument();
  });

  it("у кампании без движка показывает прочерки, а не выдуманные числа", () => {
    mockState = stateWith(null);
    mockLastResult = null;
    render(<DebugPanel />);
    fireEvent.click(screen.getByLabelText("Отладка движка (§38)"));

    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
