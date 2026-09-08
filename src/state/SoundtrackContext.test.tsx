import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MIN_VOLUME, SoundtrackProvider } from "./SoundtrackContext";
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

const instanceOf = (file: string) => audioInstances.find((audio) => audio.src.endsWith(file))!;

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
// Хедер отдельной группой: подписи «Пауза: X» есть и на странице, и в нём.
const header = () => within(screen.getByRole("group", { name: "Сейчас звучит" }));
const headerClick = (label: string) => fireEvent.click(header().getByRole("button", { name: label }));
const headerTitles = () =>
  header()
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".now-playing__title")?.textContent);

describe("Саундборд переживает переключение вкладки", () => {
  beforeEach(() => {
    audioInstances.length = 0;
  });

  it("не останавливает и не перезапускает музыку, когда страница размонтирована", () => {
    renderApp();
    openTab("Саундборд");
    play("Играть: Танец таверны");

    const music = instanceOf("tavern/taverns-dance.mp3");
    expect(music.play).toHaveBeenCalledTimes(1);
    expect(music.loop).toBe(true);

    // Уход на «Бой»: <main> подменяется, страница «Саундборд» демонтируется.
    openTab("Бой");
    // Слайдер громкости есть только на странице — его отсутствие и есть
    // доказательство, что страница демонтирована (кнопки хедера остаются).
    expect(screen.queryByLabelText("Громкость: Танец таверны")).not.toBeInTheDocument();

    // Звук не тронут: ни паузы, ни повторного play.
    expect(music.pause).not.toHaveBeenCalled();
    expect(music.play).toHaveBeenCalledTimes(1);
    expect(audioInstances).toHaveLength(1);
    expect(headerTitles()).toEqual(["Танец таверны"]);
  });

  it("накладывает эмбиент на музыку и держит громкости раздельными", () => {
    renderApp();
    openTab("Саундборд");
    play("Играть: Танец таверны");
    play("Играть: Костёр");
    play("Играть: Ливень");

    const music = instanceOf("tavern/taverns-dance.mp3");
    const campfire = instanceOf("campfire/campfire.mp3");
    const rain = instanceOf("rain/heavy-rain.mp3");
    expect([music, campfire, rain].every((audio) => audio.play.mock.calls.length === 1)).toBe(true);
    expect([music, campfire, rain].some((audio) => audio.pause.mock.calls.length > 0)).toBe(false);

    fireEvent.change(screen.getByLabelText("Громкость: Костёр"), { target: { value: "0.2" } });
    expect(campfire.volume).toBeCloseTo(0.2);
    expect(rain.volume).toBeCloseTo(0.6);
    expect(music.volume).toBeCloseTo(0.6);

    // Смена музыкальной темы гасит только предыдущую музыку, эмбиент цел.
    play("Играть: Битва");
    expect(music.pause).toHaveBeenCalledTimes(1);
    expect(instanceOf("battle/battle.mp3").play).toHaveBeenCalledTimes(1);
    expect(campfire.pause).not.toHaveBeenCalled();
    expect(rain.pause).not.toHaveBeenCalled();
  });

  it("не даёт слайдеру громкости увести звук в ноль", () => {
    renderApp();
    openTab("Саундборд");
    play("Играть: Костёр");
    const campfire = instanceOf("campfire/campfire.mp3");

    // Ползунок физически не доходит до нуля...
    const slider = screen.getByLabelText("Громкость: Костёр");
    expect(slider).toHaveAttribute("min", String(MIN_VOLUME));

    // ...и даже если значение придёт нулём, применяется пол, а не тишина.
    fireEvent.change(slider, { target: { value: "0" } });
    expect(campfire.volume).toBe(MIN_VOLUME);
    expect(campfire.volume).toBeGreaterThan(0);
  });
});

describe("Пауза из хедера, без похода на «Саундборд»", () => {
  beforeEach(() => {
    audioInstances.length = 0;
  });

  it("ставит на паузу и продолжает всё с той же позиции, находясь на чужой вкладке", () => {
    renderApp();
    openTab("Саундборд");
    play("Играть: Танец таверны");
    play("Играть: Костёр");
    openTab("Бой");

    const music = instanceOf("tavern/taverns-dance.mp3");
    const campfire = instanceOf("campfire/campfire.mp3");
    music.currentTime = 42;
    campfire.currentTime = 17;

    headerClick("Пауза: всё");
    expect(music.pause).toHaveBeenCalledTimes(1);
    expect(campfire.pause).toHaveBeenCalledTimes(1);
    // Пауза, а не стоп: позиция цела, элементы не пересозданы.
    expect(music.currentTime).toBe(42);
    expect(campfire.currentTime).toBe(17);
    expect(audioInstances).toHaveLength(2);
    // Список не исчезает — иначе продолжить было бы нечем.
    expect(headerTitles()).toEqual(["Танец таверны", "Костёр"]);

    headerClick("Продолжить: всё");
    expect(music.play).toHaveBeenCalledTimes(2);
    expect(campfire.play).toHaveBeenCalledTimes(2);
    expect(music.currentTime).toBe(42);
    expect(campfire.currentTime).toBe(17);
    expect(audioInstances).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Пауза: всё" })).toBeInTheDocument();
  });

  it("ставит на паузу один трек, не трогая остальные", () => {
    renderApp();
    openTab("Саундборд");
    play("Играть: Танец таверны");
    play("Играть: Костёр");
    play("Играть: Ливень");
    openTab("Бой");

    const music = instanceOf("tavern/taverns-dance.mp3");
    const campfire = instanceOf("campfire/campfire.mp3");
    const rain = instanceOf("rain/heavy-rain.mp3");
    campfire.currentTime = 8;

    headerClick("Пауза: Костёр");
    expect(campfire.pause).toHaveBeenCalledTimes(1);
    expect(music.pause).not.toHaveBeenCalled();
    expect(rain.pause).not.toHaveBeenCalled();
    expect(campfire.currentTime).toBe(8);

    headerClick("Продолжить: Костёр");
    expect(campfire.play).toHaveBeenCalledTimes(2);
    expect(campfire.currentTime).toBe(8);
    expect(music.play).toHaveBeenCalledTimes(1);
    expect(rain.play).toHaveBeenCalledTimes(1);
  });

  it("возвращает по «продолжить всё» только то, что звучало на момент паузы", () => {
    renderApp();
    openTab("Саундборд");
    play("Играть: Танец таверны");
    play("Играть: Костёр");
    play("Играть: Ливень");
    openTab("Бой");

    const music = instanceOf("tavern/taverns-dance.mp3");
    const campfire = instanceOf("campfire/campfire.mp3");
    const rain = instanceOf("rain/heavy-rain.mp3");

    // Костёр заглушили отдельно ДО общей паузы — он звучать не должен.
    headerClick("Пауза: Костёр");
    headerClick("Пауза: всё");
    headerClick("Продолжить: всё");

    expect(music.play).toHaveBeenCalledTimes(2);
    expect(rain.play).toHaveBeenCalledTimes(2);
    expect(campfire.play).toHaveBeenCalledTimes(1);
    expect(header().getByRole("button", { name: "Продолжить: Костёр" })).toBeInTheDocument();
  });

  it("возобновляет эмбиент с паузы кнопкой на самой странице, не сбрасывая позицию", () => {
    renderApp();
    openTab("Саундборд");
    play("Играть: Костёр");
    const campfire = instanceOf("campfire/campfire.mp3");
    campfire.currentTime = 5;

    headerClick("Пауза: Костёр");
    expect(campfire.currentTime).toBe(5);

    play("Играть: Костёр");
    expect(campfire.play).toHaveBeenCalledTimes(2);
    expect(campfire.currentTime).toBe(5);
    expect(audioInstances).toHaveLength(1);
  });
});
