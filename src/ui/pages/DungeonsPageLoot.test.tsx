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
import { lootContentsLine } from "../dungeons/dungeonLoot";
import { readTrapNumbers } from "../dungeons/trapNumbers";
import { DungeonsPage } from "./DungeonsPage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound: vi.fn() }));

/**
 * Содержимое находки на живом экране: строка «Внутри: …» под строкой таблицы.
 *
 * Сами числа и строка проверены своими пробами в `dungeonLoot.test.ts`; здесь
 * проверяется, что экран их зовёт, что описание отметки показывает И где
 * находка лежит, И что внутри, и что подземелье, записанное ДО содержимого,
 * открывается по-прежнему.
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

describe("вкладка «Подземелья»: содержимое находки", () => {
  it("описание находки показывает и строку таблицы, и строку «Внутри»", async () => {
    const made = plan(3);
    const map = await openFixture(record(made, 3));
    const finds = made.markers.filter((m) => m.kind === "loot");
    expect(finds.length).toBeGreaterThan(0);

    for (const find of finds) {
      const detail = openMarker(map, find.id);
      // Строка таблицы осталась на месте: она говорит, ГДЕ находка лежит.
      expect(within(detail).getByText(lineTitle(find.line!.text))).toBeInTheDocument();
      expect(within(detail).getByText("Внутри:")).toBeInTheDocument();
      expect(detail).toHaveTextContent(`Внутри: ${lootContentsLine(find.contents!)}`);
      // Цены камня в описании нет — камень назван и только.
      expect(detail.textContent).not.toMatch(/\d+ зм за|стоит/);
    }
  });

  it("на 17–20 находка бывает магическим предметом с одной редкостью", async () => {
    const made = plan(19);
    const map = await openFixture(record(made, 19));
    const magic = made.markers.find((m) => m.kind === "loot" && m.contents?.kind === "magic");
    expect(magic, "на семени 20261020 ни одна находка не вышла магической").toBeDefined();
    const detail = openMarker(map, magic!.id);
    expect(detail).toHaveTextContent(/Внутри: магический предмет, редкость: (редкий|очень редкий|легендарный)/);
  });

  it("у отметки другого вида строки «Внутри» нет", async () => {
    const made = plan(3);
    const map = await openFixture(record(made, 3));
    const other = made.markers.find((m) => m.kind === "door")!;
    expect(within(openMarker(map, other.id)).queryByText("Внутри:")).toBeNull();
  });

  it("подземелье, записанное до содержимого, открывается находкой как раньше", async () => {
    // Запись старого вида: та же схема без поля `contents` у находок — ровно
    // то, что лежит в кампаниях, созданных до этой карточки.
    const made = plan(3);
    const old: DungeonPlan = {
      ...made,
      markers: made.markers.map(({ contents: _drop, ...rest }) => rest),
    };
    const map = await openFixture(record(old, 3));
    const find = old.markers.find((m) => m.kind === "loot")!;
    const detail = openMarker(map, find.id);
    expect(within(detail).getByText(lineTitle(find.line!.text))).toBeInTheDocument();
    expect(within(detail).queryByText("Внутри:")).toBeNull();
    // Экран при этом цел: статус у находки по-прежнему меняется.
    expect(within(detail).getByText(/^Отметить:/)).toBeInTheDocument();
  });
});
