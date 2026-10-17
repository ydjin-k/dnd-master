import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { getDialPositions, Launcher } from "./Launcher";
import type { CampaignSummary, CampaignState } from "../state/types";

const { audioInstances, AudioMock } = vi.hoisted(() => {
  const instances: Array<{ src: string; loop: boolean; muted: boolean; volume: number; currentTime: number; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }> = [];
  class Mock {
    src: string;
    loop = false;
    muted = false;
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
    case "create_campaign":
      summaries = [...summaries, { id: "new", name: String(args?.name ?? ""), characterCount: 0 }];
      return { id: "new", campaignName: args?.name ?? "" } as CampaignState;
    case "switch_campaign": return { id: args?.id, campaignName: "Старая кампания" } as CampaignState;
    case "delete_campaign":
      summaries = summaries.filter(({ id }) => id !== args?.id);
      return null;
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

  it("shows six dial positions, keeps the selected name visible, and opens the campaign", async () => {
    summaries = Array.from({ length: 3 }, (_, index) => ({ id: `c${index}`, name: `Хроника ${index + 1}`, characterCount: index + 1 }));
    const onEnter = vi.fn();
    render(<Launcher onEnter={onEnter} />);

    const dial = await screen.findByRole("region", { name: "Циферблат кампаний" });
    expect(within(dial).getAllByRole("button", { name: /Выбрать кампанию/ })).toHaveLength(3);
    expect(within(dial).getAllByRole("button", { name: /Свободное место/ })).toHaveLength(3);
    expect(screen.getByText("3 из 6 кампаний")).toBeInTheDocument();

    const selectedMarker = screen.getByRole("button", { name: "Выбрать кампанию Хроника 2" });
    fireEvent.click(selectedMarker);
    expect(selectedMarker).toHaveAttribute("aria-pressed", "true");
    expect(within(selectedMarker).getByText("Хроника 2")).toBeVisible();
    expect(screen.getByText("Выбранная кампания")).toBeInTheDocument();
    expect(screen.queryByText(/Героев:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(onEnter).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("switch_campaign", { id: "c1" });
  });

  it("places six equal positions around the dial with the first at the top", () => {
    const positions = getDialPositions(6);
    expect(positions).toHaveLength(6);
    expect(positions[0]).toMatchObject({ x: 50, y: 12, ring: 0 });
    expect(positions[3].x).toBeCloseTo(50);
    expect(positions[3].y).toBeCloseTo(88);
  });

  it("renders the empty dial with six plus buttons that focus the name field", async () => {
    summaries = [];
    render(<Launcher onEnter={() => {}} />);

    const emptySlots = await screen.findAllByRole("button", { name: /Свободное место/ });
    expect(emptySlots).toHaveLength(6);
    expect(screen.getByText("Начните первую историю")).toBeInTheDocument();
    expect(screen.getByText("0 из 6 кампаний")).toBeInTheDocument();

    fireEvent.click(emptySlots[4]);
    expect(screen.getByPlaceholderText("Название новой кампании")).toHaveFocus();
  });

  it("creates and selects a new campaign without entering it", async () => {
    const onEnter = vi.fn();
    render(<Launcher onEnter={onEnter} />);
    await screen.findByRole("button", { name: /Выбрать кампанию/ });
    const nameInput = screen.getByPlaceholderText("Название новой кампании");
    fireEvent.change(nameInput, { target: { value: "Новый поход" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));

    const newMarker = await screen.findByRole("button", { name: "Выбрать кампанию Новый поход" });
    expect(onEnter).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("list_campaigns");
    expect(nameInput).toHaveValue("");
    expect(newMarker).toHaveAttribute("aria-pressed", "true");
    expect(within(newMarker).getByText("Новый поход")).toBeVisible();
    const startButton = screen.getByRole("button", { name: "Начать" });
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();

    fireEvent.click(startButton);
    await waitFor(() => expect(onEnter).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("switch_campaign", { id: "new" });
  });

  it("blocks creation after six campaigns and explains the limit", async () => {
    summaries = Array.from({ length: 6 }, (_, index) => ({ id: `c${index}`, name: `Хроника ${index + 1}`, characterCount: index }));
    render(<Launcher onEnter={() => {}} />);

    const createButton = await screen.findByRole("button", { name: "Создать" });
    fireEvent.change(screen.getByPlaceholderText("Название новой кампании"), { target: { value: "Седьмая" } });

    expect(createButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Свободное место/ })).not.toBeInTheDocument();
    expect(screen.getByText("6 из 6 кампаний")).toBeInTheDocument();
    expect(screen.getByText("Достигнут предел в 6 кампаний")).toBeInTheDocument();
    fireEvent.submit(createButton.closest("form")!);
    expect(invoke).not.toHaveBeenCalledWith("create_campaign", expect.anything());
  });

  it("deletes the selected campaign after confirmation", async () => {
    render(<Launcher onEnter={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Выбрать кампанию Старая кампания" }));
    fireEvent.click(screen.getByText("Удалить"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("delete_campaign", { id: "c1" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Выбрать кампанию Старая кампания" })).not.toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: /Свободное место/ })).toHaveLength(6);
  });

  it("loops launcher music and stops it when the launcher closes", async () => {
    const { unmount } = render(<Launcher onEnter={() => {}} />);
    await screen.findByRole("button", { name: /Выбрать кампанию/ });
    expect(audioInstances[0]).toMatchObject({ src: "/audio/launcher-theme.mp3", loop: true, volume: 0.32 });
    expect(audioInstances[0].play).toHaveBeenCalledOnce();
    unmount();
    expect(audioInstances[0].pause).toHaveBeenCalledOnce();
    expect(audioInstances[0].currentTime).toBe(0);
  });

  it("mutes and unmutes launcher music from the sound button", async () => {
    render(<Launcher onEnter={() => {}} />);
    const muteButton = await screen.findByRole("button", { name: "Выключить музыку" });

    fireEvent.click(muteButton);
    expect(audioInstances[0].muted).toBe(true);
    expect(screen.getByRole("button", { name: "Включить музыку" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Включить музыку" }));
    expect(audioInstances[0].muted).toBe(false);
  });

  it("keeps launcher music muted after the launcher is remounted", async () => {
    const firstMount = render(<Launcher onEnter={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Выключить музыку" }));
    expect(audioInstances[0].muted).toBe(true);

    firstMount.unmount();
    render(<Launcher onEnter={() => {}} />);

    expect(await screen.findByRole("button", { name: "Включить музыку" })).toHaveAttribute("aria-pressed", "true");
    expect(audioInstances[1].muted).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Включить музыку" }));
  });

  it("renders the bundled video as a silent looping background", () => {
    const { container } = render(<Launcher onEnter={() => {}} />);
    const video = container.querySelector("video.launcher__background");
    expect(video).toHaveAttribute("src", "/video/launcher-background.mp4");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveAttribute("playsinline");
  });
});
