import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { findTrack, type SoundtrackTrack } from "../audio/soundtrack";

const DEFAULT_VOLUME = 0.6;

/**
 * Пол громкости: слайдер, доведённый до упора вниз, обязан оставлять самый
 * тихий, но слышимый звук — а не читаться как «выключил». Единственный владелец
 * этого числа: и предел ползунка на странице, и применяемая к элементу
 * громкость берутся отсюда.
 */
export const MIN_VOLUME = 0.05;

const clampVolume = (volume: number) => Math.min(1, Math.max(MIN_VOLUME, volume));

/** Канал: какой трек в нём заведён и стоит ли он на паузе. */
export interface ChannelState {
  trackId: string;
  paused: boolean;
}

export interface ActiveTrack extends SoundtrackTrack {
  paused: boolean;
}

interface SoundtrackContextValue {
  /** Один канал музыки: выбор другой темы останавливает предыдущую. */
  music: ChannelState | null;
  /** Каналы эмбиента: звучат одновременно и с музыкой, и друг с другом. */
  ambient: ChannelState[];
  /** Всё заведённое — и звучащее, и на паузе; музыка первой. Общий источник
   *  для страницы и хедера. */
  active: ActiveTrack[];
  anyPlaying: boolean;
  volumeOf: (trackId: string) => number;
  toggleMusic: (trackId: string) => void;
  toggleAmbient: (trackId: string) => void;
  setVolume: (trackId: string, volume: number) => void;
  /** Пауза/продолжение одного трека: позиция воспроизведения не сбрасывается. */
  togglePause: (trackId: string) => void;
  /** Пауза всего звучащего; повторный вызов возвращает ровно то, что заглушил. */
  togglePauseAll: () => void;
  stopAll: () => void;
}

const SoundtrackContext = createContext<SoundtrackContextValue | null>(null);

/**
 * Владеет живыми <audio>-элементами. Монтируется в App.tsx НАД AppShell —
 * тем же приёмом, что CampaignProvider, — поэтому переключение вкладки
 * (размонтирование страницы «Саундборд») не демонтирует элементы и не
 * обрывает звук.
 */
export function SoundtrackProvider({ children }: { children: ReactNode }) {
  const elements = useRef(new Map<string, HTMLAudioElement>());
  const [music, setMusic] = useState<ChannelState | null>(null);
  const [ambient, setAmbient] = useState<ChannelState[]>([]);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  // Что заглушила именно кнопка «пауза всё» — чтобы возобновление вернуло то,
  // что звучало в тот момент, а не всё, что успели поставить на паузу поштучно.
  const [suspended, setSuspended] = useState<string[]>([]);

  useEffect(() => {
    const live = elements.current;
    return () => {
      live.forEach((element) => element.pause());
      live.clear();
    };
  }, []);

  const volumeOf = useCallback(
    (trackId: string) => clampVolume(volumes[trackId] ?? DEFAULT_VOLUME),
    [volumes],
  );

  // Запуск через один вход: элемент создаётся лениво, всегда зациклен (фон
  // обязан звучать всю сессию, а не оборваться через три минуты).
  const start = useCallback(
    (trackId: string) => {
      let element = elements.current.get(trackId);
      if (!element) {
        const track = findTrack(trackId);
        if (!track) return false;
        element = new Audio(track.src);
        element.loop = true;
        elements.current.set(trackId, element);
      }
      element.volume = clampVolume(volumes[trackId] ?? DEFAULT_VOLUME);
      void element.play().catch(() => undefined);
      return true;
    },
    [volumes],
  );

  /** Полный демонтаж трека: в отличие от паузы сбрасывает позицию. */
  const stop = useCallback((trackId: string) => {
    const element = elements.current.get(trackId);
    if (element) {
      element.pause();
      element.currentTime = 0;
      elements.current.delete(trackId);
    }
    setSuspended((current) => current.filter((id) => id !== trackId));
  }, []);

  const markPaused = useCallback((trackIds: string[], paused: boolean) => {
    setMusic((current) =>
      current && trackIds.includes(current.trackId) ? { ...current, paused } : current,
    );
    setAmbient((current) =>
      current.map((channel) =>
        trackIds.includes(channel.trackId) ? { ...channel, paused } : channel,
      ),
    );
  }, []);

  const togglePause = useCallback(
    (trackId: string) => {
      const channel =
        music?.trackId === trackId ? music : ambient.find((c) => c.trackId === trackId);
      if (!channel) return;
      if (channel.paused) {
        if (!start(trackId)) return;
      } else {
        elements.current.get(trackId)?.pause();
      }
      markPaused([trackId], !channel.paused);
      setSuspended((current) => current.filter((id) => id !== trackId));
    },
    [music, ambient, start, markPaused],
  );

  const toggleMusic = useCallback(
    (trackId: string) => {
      if (music?.trackId === trackId) {
        togglePause(trackId);
        return;
      }
      if (music) stop(music.trackId);
      if (!start(trackId)) return;
      setMusic({ trackId, paused: false });
    },
    [music, togglePause, start, stop],
  );

  const toggleAmbient = useCallback(
    (trackId: string) => {
      const channel = ambient.find((c) => c.trackId === trackId);
      // С паузы — продолжить с той же позиции, а не выбросить канал.
      if (channel?.paused) {
        togglePause(trackId);
        return;
      }
      if (channel) {
        stop(trackId);
        setAmbient((current) => current.filter((c) => c.trackId !== trackId));
        return;
      }
      if (!start(trackId)) return;
      setAmbient((current) => [...current, { trackId, paused: false }]);
    },
    [ambient, togglePause, start, stop],
  );

  const setVolume = useCallback((trackId: string, volume: number) => {
    const next = clampVolume(volume);
    setVolumes((current) => ({ ...current, [trackId]: next }));
    const element = elements.current.get(trackId);
    if (element) element.volume = next;
  }, []);

  const stopAll = useCallback(() => {
    [...elements.current.keys()].forEach(stop);
    setMusic(null);
    setAmbient([]);
    setSuspended([]);
  }, [stop]);

  const active = useMemo<ActiveTrack[]>(
    () =>
      [...(music ? [music] : []), ...ambient].flatMap((channel) => {
        const track = findTrack(channel.trackId);
        return track ? [{ ...track, paused: channel.paused }] : [];
      }),
    [music, ambient],
  );

  const anyPlaying = active.some((track) => !track.paused);

  const togglePauseAll = useCallback(() => {
    if (anyPlaying) {
      const sounding = active.filter((track) => !track.paused).map((track) => track.id);
      sounding.forEach((trackId) => elements.current.get(trackId)?.pause());
      markPaused(sounding, true);
      setSuspended(sounding);
      return;
    }
    // Без своей записи (всё ставили на паузу поштучно) возвращаем все паузы —
    // иначе кнопка «продолжить всё» оказалась бы мёртвой.
    const restore = suspended.length > 0 ? suspended : active.map((track) => track.id);
    const resuming = active
      .filter((track) => track.paused && restore.includes(track.id))
      .map((track) => track.id);
    resuming.forEach(start);
    markPaused(resuming, false);
    setSuspended([]);
  }, [active, anyPlaying, suspended, start, markPaused]);

  return (
    <SoundtrackContext.Provider
      value={{
        music,
        ambient,
        active,
        anyPlaying,
        volumeOf,
        toggleMusic,
        toggleAmbient,
        setVolume,
        togglePause,
        togglePauseAll,
        stopAll,
      }}
    >
      {children}
    </SoundtrackContext.Provider>
  );
}

export function useSoundtrack(): SoundtrackContextValue {
  const ctx = useContext(SoundtrackContext);
  if (!ctx) throw new Error("useSoundtrack вызван вне SoundtrackProvider");
  return ctx;
}
