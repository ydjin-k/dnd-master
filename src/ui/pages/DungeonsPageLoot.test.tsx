import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledRules from "../../../src-tauri/rules/rules.json";
import { CampaignProvider } from "../../state/CampaignContext";
import {
  emptyCampaignState,
  type CampaignState,
  type DungeonRecord,
  type RuleTopic,
} from "../../state/types";
import { generateDungeon, lineTitle, type DungeonPlan } from "../dungeons/dungeonGenerator";
import { readTrapNumbers } from "../dungeons/trapNumbers";
import { DungeonsPage } from "./DungeonsPage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound: vi.fn() }));

/**
 * Находка на живом экране: строка таблицы — и ни одного самопридуманного
 * содержимого.
 *
 * Решение владельца 22.10.2026: содержимое находки больше не бросается само.
 * Здесь проверяется ОБЕ половины этого: что строка таблицы на месте (она
 * говорит, где находка лежит) и что брошенное содержимое на экран не выходит —
 * ни у свежей схемы, где его больше нет вовсе, ни у записи, в которой оно
 * успело улечься до этой карточки. Выбор мастера, пришедший на его место,
 * проверяет `DungeonsPageLootChoice.test.tsx`.
 */

let disk: CampaignState;

beforeAll(() => {
  // Разовая цена первого getComputedStyle в jsdom — платит не первая проба.
  getComputedStyle(document.body);
});

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((command, args) => {
    switch (command) {
      case "load_active_campaign":
        return Promise.resolve(disk);
      case "save_campaign":
        disk = (args as { state: CampaignState }).state;
        return Promise.resolve(undefined);
      case "get_rules":
        return Promise.resolve(bundledRules);
      case "get_bestiary":
        return Promise.resolve(bundledBestiary.map((m) => ({ ...m, origin: "srd" })));
      case "roll_dice":
        return Promise.resolve({ total: 1 });
      default:
        return Promise.resolve(undefined);
    }
  });
});

const plan = (partyLevel: number): DungeonPlan =>
  generateDungeon({
    seed: 20261020,
    partyLevel,
    danger: "Опасная",
    numbers: readTrapNumbers(bundledRules as RuleTopic[])!,
    bestiary: bundledBestiary,
  });

function record(plan: DungeonPlan, partyLevel: number): DungeonRecord {
  return {
    id: "d-loot",
    name: "Проба находок",
    createdAt: "2026-10-20T10:00:00Z",
    seed: plan.seed,
    partyLevel,
    danger: "Опасная",
    plan,
    statuses: {},
  };
}

async function openFixture(dungeon: DungeonRecord) {
  disk = { ...emptyCampaignState(), id: "c1", campaignName: "Поход", dungeons: [dungeon] };
  render(
    <CampaignProvider>
      <DungeonsPage />
    </CampaignProvider>,
  );
  await screen.findByText("Собрать ловушку");
  fireEvent.click(screen.getByText("Подземелья кампании"));
  fireEvent.click(await screen.findByRole("button", { name: "Открыть" }));
  return await screen.findByRole("img", { name: /^Схема:/ });
}

/** Описание отметки, открытое щелчком по ней на схеме. */
function openMarker(map: HTMLElement, id: string): HTMLElement {
  fireEvent.click(map.querySelector(`[data-marker="${id}"]`)!);
  return screen.getByRole("article", { name: "Описание отметки" });
}

describe("вкладка «Подземелья»: находка без самодельного содержимого", () => {
  it("описание находки показывает строку таблицы и ни одной брошенной суммы", async () => {
    const made = plan(3);
    const map = await openFixture(record(made, 3));
    const finds = made.markers.filter((m) => m.kind === "loot");
    expect(finds.length).toBeGreaterThan(0);

    for (const find of finds) {
      const detail = openMarker(map, find.id);
      // Строка таблицы осталась на месте: она говорит, ГДЕ находка лежит.
      expect(within(detail).getByText(lineTitle(find.line!.text))).toBeInTheDocument();
      // Ни монет, ни камней, ни редкости: выдумывать содержимое больше нечем.
      expect(detail.textContent).not.toMatch(/\d+ (зм|см|мм|эм|пм)/);
      expect(detail.textContent).not.toMatch(/магический предмет, редкость/);
    }
  });

  it("содержимое, записанное в схему до этой карточки, на экран не выходит", async () => {
    // Отрицательная проба: запись, сделанная между 20.10 и 22.10.2026, несёт у
    // находок поле `contents` — показ обязан его не заметить. Верни на экран
    // строку «Внутри: …» из броска, и проба покраснеет на «40 зм».
    const made = plan(3);
    const stale: DungeonPlan = {
      ...made,
      markers: made.markers.map((m) =>
        m.kind === "loot"
          ? ({ ...m, contents: { kind: "coins", coins: { gold: 40 }, gems: ["аметист"] } } as typeof m)
          : m,
      ),
    };
    const map = await openFixture(record(stale, 3));
    const find = stale.markers.find((m) => m.kind === "loot")!;
    const detail = openMarker(map, find.id);
    expect(within(detail).getByText(lineTitle(find.line!.text))).toBeInTheDocument();
    expect(detail.textContent).not.toContain("40 зм");
    expect(detail.textContent).not.toContain("аметист");
    // Экран при этом цел: статус у находки по-прежнему меняется.
    expect(within(detail).getByText(/^Отметить:/)).toBeInTheDocument();
  });

  it("у отметки другого вида строки содержимого нет и не было", async () => {
    const made = plan(3);
    const map = await openFixture(record(made, 3));
    const other = made.markers.find((m) => m.kind === "door")!;
    const detail = openMarker(map, other.id);
    expect(detail.textContent).not.toMatch(/магический предмет, редкость/);
  });
});
