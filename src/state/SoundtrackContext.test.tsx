import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SoundtrackProvider } from "./SoundtrackContext";
import { AppShell } from "../ui/AppShell";
import { SoundboardPage } from "../ui/pages/SoundboardPage";
import type { CampaignState } from "./types";

// jsdom не умеет настоящий HTMLAudioElement — подменяем конструктор так же,
// как это уже сделано для музыки лаунчера в Launcher.test.tsx.
const { audioInstances, AudioMock } = vi.hoisted(() => {
  const instances: Array<{
    src: string;
    loop: boolean;
    volume: number;
    currentTime: number;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
  }> = [];
  class Mock {
    src: string;
    loop = false;
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

vi.mock("../state/CampaignContext", () => ({
  useCampaign: () => ({ state: { campaignName: "Тест" } as CampaignState, setCampaignName: vi.fn() }),
}));
vi.stubGlobal("Audio", AudioMock);

const instanceOf = (file: string) => audioInstances.find((audio) => audio.src.endsWith(file));

/** Ровно то же дерево, что в App.tsx: провайдер НАД переключателем вкладок. */
function renderApp() {
  return render(
    <SoundtrackProvider>
      <AppShell onSwitchCampaign={() => {}}>
        {(tab) => (tab === "soundboard" ? <SoundboardPage /> : <div>Вкладка {tab}</div>)}
      </AppShell>
    </SoundtrackProvider>,
  );
}

// Именно кнопки: «Саундборд» и «Бой» есть и в нав-меню, и как заголовки на странице.
const openTab = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));
const play = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

describe("Саундборд переживает переключение вкладки", () => {
  beforeEach(() => {
    audioInstances.length = 0;
  });

  it("не останавливает и не перезапускает музыку, когда страница размонтирована", () => {
    renderApp();
    openTab("Саундборд");
    play("Играть: Танец таверны");

    const music = instanceOf("tavern/taverns-dance.mp3")!;
    expect(music.play).toHaveBeenCalledTimes(1);
    expect(music.loop).toBe(true);

    // Уход на «Бой»: <main> подменяется, страница «Саундборд» демонтируется.
    openTab("Бой");
    expect(screen.queryByRole("button", { name: /Танец таверны/ })).not.toBeInTheDocument();

    // Звук не тронут: ни паузы, ни повторного play.
    expect(music.pause).not.toHaveBeenCalled();
    expect(music.play).toHaveBeenCalledTimes(1);
    expect(audioInstances).toHaveLength(1);

    // Индикатор в хедере доступен с чужой вкладки — и останавливает оттуда же.
    expect(screen.getByText("Танец таверны")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Остановить всё" }));
    expect(music.pause).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Танец таверны")).not.toBeInTheDocument();
  });

  it("накладывает эмбиент на музыку и держит громкости раздельными", () => {
    renderApp();
    openTab("Саундборд");
    play("Играть: Танец таверны");
    play("Играть: Костёр");
    play("Играть: Ливень");

    const music = instanceOf("tavern/taverns-dance.mp3")!;
    const campfire = instanceOf("campfire/campfire.mp3")!;
    const rain = instanceOf("rain/heavy-rain.mp3")!;
    expect([music, campfire, rain].every((audio) => audio.play.mock.calls.length === 1)).toBe(true);
    expect([music, campfire, rain].some((audio) => audio.pause.mock.calls.length > 0)).toBe(false);

    fireEvent.change(screen.getByLabelText("Громкость: Костёр"), { target: { value: "0.2" } });
    expect(campfire.volume).toBeCloseTo(0.2);
    expect(rain.volume).toBeCloseTo(0.6);
    expect(music.volume).toBeCloseTo(0.6);

    // Смена музыкальной темы гасит только предыдущую музыку, эмбиент цел.
    play("Играть: Битва");
    expect(music.pause).toHaveBeenCalledTimes(1);
    expect(instanceOf("battle/battle.mp3")!.play).toHaveBeenCalledTimes(1);
    expect(campfire.pause).not.toHaveBeenCalled();
    expect(rain.pause).not.toHaveBeenCalled();
  });
});
