import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { CampaignProvider, useCampaign } from "../../state/CampaignContext";
import { emptyCampaignState, type CampaignState, type DungeonRecord } from "../../state/types";
import type { DungeonPlan } from "./dungeonGenerator";
import {
  isRoomKey,
  markerStatusOf,
  MARKER_STATUSES,
  nextMarkerStatus,
  roomKey,
  roomStatusOf,
  withMarkerAdvanced,
  withRoomAdvanced,
} from "./markerStatus";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const dungeon: DungeonRecord = {
  id: "d1",
  name: "Склеп старого рода",
  createdAt: "2026-10-18T10:00:00Z",
  seed: 7,
  partyLevel: 3,
  danger: "Опасная",
  plan: { markers: [] } as unknown as DungeonPlan,
  statuses: {},
};

describe("статус отметки", () => {
  it("ровно три и по кругу", () => {
    expect(MARKER_STATUSES).toEqual(["unexplored", "discovered", "explored"]);
    expect(nextMarkerStatus("unexplored")).toBe("discovered");
    expect(nextMarkerStatus("discovered")).toBe("explored");
    expect(nextMarkerStatus("explored")).toBe("unexplored");
  });

  it("без записи и с незнакомой строкой — «не исследовано»", () => {
    expect(markerStatusOf(dungeon, "trap-1")).toBe("unexplored");
    const odd = { ...dungeon, statuses: { "trap-1": "изучено" } } as unknown as DungeonRecord;
    expect(markerStatusOf(odd, "trap-1")).toBe("unexplored");
  });

  it("сдвиг одной отметки не трогает другие", () => {
    const moved = withMarkerAdvanced({ ...dungeon, statuses: { "door-1": "explored" } }, "trap-1");
    expect(moved.statuses).toEqual({ "door-1": "explored", "trap-1": "discovered" });
  });
});

describe("статус комнаты", () => {
  it("тот же круг и те же подписи, своего набора нет", () => {
    // Отдельного набора статусов у комнат нет: карточка требует именно этого.
    expect(roomStatusOf(dungeon, 3)).toBe("unexplored");
    const once = withRoomAdvanced(dungeon, 3);
    expect(roomStatusOf(once, 3)).toBe("discovered");
    const twice = withRoomAdvanced(once, 3);
    expect(roomStatusOf(twice, 3)).toBe("explored");
    expect(roomStatusOf(withRoomAdvanced(twice, 3), 3)).toBe("unexplored");
  });

  it("лежит в той же карте под ключом room-<номер>", () => {
    expect(roomKey(7)).toBe("room-7");
    expect(withRoomAdvanced(dungeon, 7).statuses).toEqual({ "room-7": "discovered" });
  });

  it("не пересекается с ключами отметок", () => {
    const both = withMarkerAdvanced(withRoomAdvanced(dungeon, 1), "trap-1");
    expect(both.statuses).toEqual({ "room-1": "discovered", "trap-1": "discovered" });
    expect(markerStatusOf(both, "trap-1")).toBe("discovered");
    expect(roomStatusOf(both, 1)).toBe("discovered");
    // Сдвиг комнаты не трогает отметку, и наоборот.
    expect(withRoomAdvanced(both, 1).statuses["trap-1"]).toBe("discovered");
    expect(withMarkerAdvanced(both, "trap-1").statuses["room-1"]).toBe("discovered");
  });

  it("ключ комнаты отличается от ключа отметки", () => {
    expect(isRoomKey("room-12")).toBe(true);
    expect(isRoomKey("trap-1")).toBe(false);
    expect(isRoomKey("door-3")).toBe(false);
    // Не «любой, начинающийся на room»: номер обязателен.
    expect(isRoomKey("roomy-1")).toBe(false);
    expect(isRoomKey("room-")).toBe(false);
  });
});

describe("статус отметки в кампании", () => {
  let disk: CampaignState;

  beforeEach(() => {
    disk = { ...emptyCampaignState(), id: "c1", campaignName: "Поход", dungeons: [dungeon] };
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation((command, args) => {
      if (command === "load_active_campaign") return Promise.resolve(disk);
      if (command === "save_campaign") disk = (args as { state: CampaignState }).state;
      return Promise.resolve(undefined);
    });
  });

  function mount() {
    const handle: { current: ReturnType<typeof useCampaign> | null } = { current: null };
    function Consumer() {
      const campaign = useCampaign();
      useEffect(() => {
        if (!campaign.loading) handle.current = campaign;
      }, [campaign]);
      return null;
    }
    const view = render(
      <CampaignProvider>
        <Consumer />
      </CampaignProvider>,
    );
    return { handle, view };
  }

  it("два щелчка подряд до перерисовки — оба доходят до записи и переживают перезагрузку", async () => {
    const { handle, view } = mount();
    await waitFor(() => expect(handle.current).not.toBeNull());
    const { setDungeons } = handle.current!;
    const advance = (list: DungeonRecord[]) => list.map((d) => withMarkerAdvanced(d, "trap-1"));
    await act(async () => {
      await Promise.all([setDungeons(advance), setDungeons(advance)]);
    });
    expect(disk.dungeons?.[0].statuses["trap-1"]).toBe("explored");

    // Перезагрузка окна: провайдер заново читает кампанию с «диска».
    view.unmount();
    const again = mount();
    await waitFor(() => expect(again.handle.current).not.toBeNull());
    expect(markerStatusOf(again.handle.current!.state.dungeons![0], "trap-1")).toBe("explored");
  });
});
