import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
import { generateDungeon, type DungeonPlan } from "../dungeons/dungeonGenerator";
import { readTrapNumbers } from "../dungeons/trapNumbers";
import { DungeonsPage } from "./DungeonsPage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../audio/uiSounds", () => ({ playDiceRollSound: vi.fn() }));

/**
 * Выбор лута мастером на живом экране: отметки видов, редкость, описание,
 * «Предложить» — и запись, которая всё это переживает.
 *
 * Сами правила выбора проверены своими пробами в `dungeonLootChoice.test.ts`;
 * здесь проверяется, что экран их зовёт, что выбор уезжает на диск тем же
 * ключом, что у отметки, и что подсказка ложится в поля мастера, НЕ сдвигая
 * схему.
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

const made: DungeonPlan = generateDungeon({
  seed: 20261022,
  partyLevel: 7,
  danger: "Опасная",
  numbers: readTrapNumbers(bundledRules as RuleTopic[])!,
  bestiary: bundledBestiary,
});

const record = (): DungeonRecord => ({
  id: "d-loot-choice",
  name: "Проба выбора лута",
  createdAt: "2026-10-22T10:00:00Z",
  seed: made.seed,
  partyLevel: 7,
  danger: "Опасная",
  plan: made,
  statuses: {},
});

const FIND = made.markers.find((m) => m.kind === "loot")!;
const OTHER_FIND = made.markers.filter((m) => m.kind === "loot")[1]!;

async function openFixture(dungeon: DungeonRecord = record()) {
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

/** Блок выбора лута в открытом описании находки. */
function lootBlock(detail: HTMLElement): HTMLElement {
  return within(detail).getByRole("group", { name: /^Лут находки/ });
}

/** Что лежит в записи кампании на «диске» у этой находки. */
const stored = (id: string) => disk.dungeons?.[0].loot?.[id];

describe("вкладка «Подземелья»: лут выбирает мастер", () => {
  it("пока ничего не выбрано — «Лут не выбран», и запись пуста", async () => {
    const map = await openFixture();
    const loot = lootBlock(openMarker(map, FIND.id));
    expect(loot).toHaveTextContent("Внутри: Лут не выбран");
    expect(disk.dungeons?.[0].loot ?? {}).toEqual({});
    // Все шесть видов — на месте, и ни один не отмечен.
    for (const label of [
      "Деньги",
      "Драгоценности",
      "Предмет",
      "Магический предмет",
      "Артефакт",
      "Другое",
    ]) {
      expect(within(loot).getByLabelText(label)).not.toBeChecked();
    }
  });

  it("отмеченные виды, редкость и описание видны в строке и уезжают в запись", async () => {
    const map = await openFixture();
    const loot = lootBlock(openMarker(map, FIND.id));

    fireEvent.click(within(loot).getByLabelText("Деньги"));
    fireEvent.click(within(loot).getByLabelText("Магический предмет"));
    // Редкость спрашивается только у видов, которым она положена.
    expect(within(loot).queryByLabelText("Редкость: Деньги")).toBeNull();
    fireEvent.change(within(loot).getByLabelText("Редкость: Магический предмет"), {
      target: { value: "редкий" },
    });
    fireEvent.change(within(loot).getByLabelText(/описание$/), {
      target: { value: "40 зм и кольчуга +1" },
    });

    expect(lootBlock(openMarker(map, FIND.id))).toHaveTextContent(
      "Внутри: Деньги, Магический предмет (редкий) — 40 зм и кольчуга +1",
    );
    expect(stored(FIND.id)).toEqual({
      kinds: ["money", "magic"],
      rarities: { magic: "редкий" },
      text: "40 зм и кольчуга +1",
    });
    // Выбор лежит под `id` отметки и только у неё: сосед не тронут.
    expect(stored(OTHER_FIND.id)).toBeUndefined();
  });

  it("выбор переживает перезапуск приложения", async () => {
    const map = await openFixture();
    const loot = lootBlock(openMarker(map, FIND.id));
    fireEvent.click(within(loot).getByLabelText("Артефакт"));
    fireEvent.change(within(loot).getByLabelText(/описание$/), {
      target: { value: "чаша из чёрного камня" },
    });
    expect(stored(FIND.id)?.kinds).toEqual(["artifact"]);

    // Перезапуск — это новое дерево React на той же записи с «диска».
    cleanup();
    const again = await openFixture(disk.dungeons![0]);
    const back = lootBlock(openMarker(again, FIND.id));
    expect(back).toHaveTextContent("Внутри: Артефакт — чаша из чёрного камня");
    expect(within(back).getByLabelText("Артефакт")).toBeChecked();
  });

  it("снятые отметки и стёртое описание убирают находку из записи", async () => {
    const map = await openFixture();
    const loot = lootBlock(openMarker(map, FIND.id));
    fireEvent.click(within(loot).getByLabelText("Предмет"));
    fireEvent.change(within(loot).getByLabelText(/описание$/), { target: { value: "кольчуга" } });
    expect(stored(FIND.id)).toBeDefined();

    fireEvent.click(within(loot).getByLabelText("Предмет"));
    fireEvent.change(within(loot).getByLabelText(/описание$/), { target: { value: "   " } });
    expect(stored(FIND.id), "пустой выбор остался в записи").toBeUndefined();
    expect(lootBlock(openMarker(map, FIND.id))).toHaveTextContent("Внутри: Лут не выбран");
  });

  it("«Предложить» заполняет поля, схемы не трогает, а мастер правит поверх", async () => {
    const map = await openFixture();
    const loot = lootBlock(openMarker(map, FIND.id));
    const planBefore = JSON.stringify(disk.dungeons![0].plan);

    fireEvent.click(within(loot).getByRole("button", { name: "Предложить" }));
    const suggested = stored(FIND.id)!;
    expect(suggested.kinds.length, "подсказка не отметила ни одного вида").toBeGreaterThan(0);
    expect(lootBlock(openMarker(map, FIND.id))).not.toHaveTextContent("Внутри: Лут не выбран");
    // Схема того же семени не сдвинулась ни на один бросок.
    expect(JSON.stringify(disk.dungeons![0].plan)).toBe(planBefore);
    expect(disk.dungeons![0].seed).toBe(made.seed);

    // Повторное нажатие предлагает заново: двадцать нажатий дают не одно и то
    // же. Своё семя, а не семя схемы, — иначе кнопка предлагала бы одно и то
    // же, сколько по ней ни бей.
    const seen = new Set<string>([JSON.stringify(suggested)]);
    for (let k = 0; k < 20; k += 1) {
      fireEvent.click(within(lootBlock(openMarker(map, FIND.id))).getByRole("button", { name: "Предложить" }));
      seen.add(JSON.stringify(stored(FIND.id)));
    }
    expect(seen.size, `двадцать нажатий дали ${[...seen][0]}`).toBeGreaterThan(1);

    // Подсказка — правка, которую мастер меняет: он дописывает своё.
    const after = lootBlock(openMarker(map, FIND.id));
    fireEvent.click(within(after).getByLabelText("Другое"));
    fireEvent.change(within(after).getByLabelText(/описание$/), {
      target: { value: "свиток на незнакомом языке" },
    });
    expect(stored(FIND.id)?.kinds).toContain("other");
    expect(stored(FIND.id)?.text).toBe("свиток на незнакомом языке");
  });

  it("«Предложить» не затирает набранное мастером описание (владелец 22.10)", async () => {
    const map = await openFixture();
    const loot = lootBlock(openMarker(map, FIND.id));
    fireEvent.change(within(loot).getByLabelText(/описание$/), { target: { value: "кольчуга +1" } });

    for (let k = 0; k < 10; k += 1) {
      fireEvent.click(within(lootBlock(openMarker(map, FIND.id))).getByRole("button", { name: "Предложить" }));
      expect(stored(FIND.id)?.text, `нажатие ${k + 1}`).toBe("кольчуга +1");
      expect(stored(FIND.id)?.kinds.length, "подсказка не отметила ни одного вида").toBeGreaterThan(0);
    }
  });

  it("у находки с выбранным лутом на схеме мастера появляется признак", async () => {
    const map = await openFixture();
    expect(map.querySelector(`[data-marker="${FIND.id}"]`)).not.toHaveAttribute("data-loot");
    const loot = lootBlock(openMarker(map, FIND.id));
    fireEvent.click(within(loot).getByLabelText("Драгоценности"));
    expect(map.querySelector(`[data-marker="${FIND.id}"]`)).toHaveAttribute("data-loot", "yes");
    expect(map.querySelector(`[data-marker="${OTHER_FIND.id}"]`)).not.toHaveAttribute("data-loot");
    // Снятый выбор уносит и признак.
    fireEvent.click(within(lootBlock(openMarker(map, FIND.id))).getByLabelText("Драгоценности"));
    expect(map.querySelector(`[data-marker="${FIND.id}"]`)).not.toHaveAttribute("data-loot");
  });

  it("у отметки другого вида выбора лута нет вовсе", async () => {
    const map = await openFixture();
    const door = made.markers.find((m) => m.kind === "door")!;
    const detail = openMarker(map, door.id);
    expect(within(detail).queryByRole("group", { name: /^Лут находки/ })).toBeNull();
    expect(detail.textContent).not.toContain("Лут не выбран");
  });

  it("«Пересобрать» называет потерю выбранного лута и уносит его", async () => {
    const map = await openFixture();
    const loot = lootBlock(openMarker(map, FIND.id));
    fireEvent.click(within(loot).getByLabelText("Деньги"));
    expect(stored(FIND.id)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Пересобрать" }));
    expect(screen.getByText(/Пропадёт:/)).toHaveTextContent("находок с выбранным лутом: 1");
    fireEvent.click(screen.getByRole("button", { name: "Да, пересобрать" }));
    expect(await screen.findByRole("img", { name: /^Схема:/ })).toBeInTheDocument();
    expect(disk.dungeons?.[0].loot ?? {}, "лут уехал в новую схему").toEqual({});
  });
});
