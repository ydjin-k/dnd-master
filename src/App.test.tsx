import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import type { CampaignState, CampaignSummary } from "./state/types";

/**
 * Сторож одного обещания: ПРИ ЗАПУСКЕ ВСЕГДА ПРИВЕТСТВЕННОЕ ОКНО.
 *
 * Просьба владельца 07.10.2026, проверенная на установленном приложении:
 * приложение подтягивало сохранение и само открывало последнюю кампанию.
 * Должно быть иначе — выбор хроники делает человек, даже если кампания на
 * диске одна и она активна.
 *
 * Проба бьёт ровно в это и ни во что больше: `load_active_campaign` отвечает
 * непустым состоянием (то есть «активная кампания есть»), а на экране обязан
 * оказаться Launcher. Отрицательная проверка сделана руками: возврат прежнего
 * `useEffect` в `App.tsx` роняет пробу — вместо циферблата приходит оболочка
 * кампании.
 */

const { audioInstances, AudioMock } = vi.hoisted(() => {
  const instances: Array<{ src: string }> = [];
  class Mock {
    src: string;
    loop = false;
    muted = false;
    volume = 1;
    currentTime = 0;
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn();
    constructor(src: string) {
      this.src = src;
      instances.push(this);
    }
  }
  return { audioInstances: instances, AudioMock: Mock };
});

const ACTIVE_CAMPAIGN = { id: "c1", campaignName: "Старая кампания" } as CampaignState;
const SUMMARIES: CampaignSummary[] = [{ id: "c1", name: "Старая кампания", characterCount: 3 }];

const invoke = vi.fn(async (cmd: string, _args?: Record<string, unknown>) => {
  switch (cmd) {
    case "load_active_campaign":
      return ACTIVE_CAMPAIGN;
    case "list_campaigns":
      return SUMMARIES;
    default:
      return null;
  }
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: [string, Record<string, unknown>?]) => invoke(...args),
}));
vi.stubGlobal("Audio", AudioMock);

describe("App", () => {
  beforeEach(() => {
    invoke.mockClear();
    audioInstances.length = 0;
  });

  it("открывает приветственное окно, даже когда активная кампания сохранена", async () => {
    render(<App />);

    // Циферблат кампаний — это Launcher и только он.
    expect(await screen.findByRole("button", { name: "Открыть кампанию Старая кампания" })).toBeInTheDocument();
    // Оболочки кампании на экране быть не должно: её вкладки пришли бы вместе с ней.
    expect(screen.queryByRole("button", { name: "Бестиарий" })).not.toBeInTheDocument();
  });

  it("не спрашивает активную кампанию при запуске", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Открыть кампанию Старая кампания" });

    // Указатель активной кампании никуда не делся — его читает CampaignProvider
    // после входа. Но САМ ЗАПУСК о нём больше не спрашивает: ответ всё равно
    // ничего не решает, а вопрос раньше и уводил игрока мимо приветствия.
    expect(invoke).not.toHaveBeenCalledWith("load_active_campaign", expect.anything());
    expect(invoke.mock.calls.map(([cmd]) => cmd)).not.toContain("load_active_campaign");
  });
});
