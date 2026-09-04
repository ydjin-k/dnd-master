import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getDialPositions, Launcher } from "./Launcher";
import type { CampaignSummary, CampaignState } from "../state/types";

const { audioInstances, AudioMock } = vi.hoisted(() => {
  const instances: Array<{ src: string; loop: boolean; volume: number; currentTime: number; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }> = [];
  class Mock {
    src: string;
    loop = false;
    volume = 1;
    currentTime = 0;
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn();
    constructor(src: string) { this.src = src; instances.push(this); }
  }
  return { audioInstances: instances, AudioMock: Mock };
});

let summaries: CampaignSummary[];
const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  switch (cmd) {
    case "list_campaigns": return summaries;
    case "create_campaign": return { id: "new", campaignName: args?.name ?? "" } as CampaignState;
    case "switch_campaign": return { id: args?.id, campaignName: "Старая кампания" } as CampaignState;
    case "delete_campaign": return null;
    default: return null;
  }
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: [string, Record<string, unknown>?]) => invoke(...args) }));
vi.stubGlobal("Audio", AudioMock);

describe("Launcher", () => {
  beforeEach(() => {
    summaries = [{ id: "c1", name: "Старая кампания", characterCount: 2 }];
    invoke.mockClear();
    audioInstances.length = 0;
    window.confirm = vi.fn(() => true);
  });

  it("shows every campaign on the dial and opens the selected campaign panel", async () => {
    summaries = Array.from({ length: 10 }, (_, index) => ({ id: `c${index}`, name: `Хроника ${index + 1}`, characterCount: index }));
    const onEnter = vi.fn();
    render(<Launcher onEnter={onEnter} />);

    const markers = await screen.findAllByRole("button", { name: /Открыть кампанию/ });
    expect(markers).toHaveLength(10);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Открыть кампанию Хроника 8" }));
    expect(screen.getByRole("heading", { name: "Хроника 8" })).toBeInTheDocument();
    expect(screen.getByText("Героев: 7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(onEnter).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("switch_campaign", { id: "c7" });
  });

  it("places twelve labels on two separated, six-position rings", () => {
    const positions = getDialPositions(12);
    expect(positions).toHaveLength(12);
    expect(new Set(positions.map(({ ring }) => ring))).toEqual(new Set([0, 1]));

    for (let first = 0; first < positions.length; first += 1) {
      for (let second = first + 1; second < positions.length; second += 1) {
        const xDistance = Math.abs(positions[first].x - positions[second].x);
        const yDistance = Math.abs(positions[first].y - positions[second].y);
        expect(xDistance >= 12 || yDistance >= 7).toBe(true);
      }
    }
  });

  it("creates a new campaign from the separate form", async () => {
    const onEnter = vi.fn();
    render(<Launcher onEnter={onEnter} />);
    await screen.findByRole("button", { name: /Открыть кампанию/ });
    fireEvent.change(screen.getByPlaceholderText("Название новой кампании"), { target: { value: "Новый поход" } });
    fireEvent.click(screen.getByText("Новая кампания"));
    await waitFor(() => expect(onEnter).toHaveBeenCalled());
  });

  it("deletes the selected campaign after confirmation", async () => {
    render(<Launcher onEnter={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Открыть кампанию Старая кампания" }));
    fireEvent.click(screen.getByText("Удалить"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("delete_campaign", { id: "c1" }));
  });

  it("loops launcher music and stops it when the launcher closes", async () => {
    const { unmount } = render(<Launcher onEnter={() => {}} />);
    await screen.findByRole("button", { name: /Открыть кампанию/ });
    expect(audioInstances[0]).toMatchObject({ src: "/audio/launcher-theme.mp3", loop: true, volume: 0.32 });
    expect(audioInstances[0].play).toHaveBeenCalledOnce();
    unmount();
    expect(audioInstances[0].pause).toHaveBeenCalledOnce();
    expect(audioInstances[0].currentTime).toBe(0);
  });
});
