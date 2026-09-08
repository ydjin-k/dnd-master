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

export interface MusicState {
  trackId: string;
  paused: boolean;
}

interface SoundtrackContextValue {
  /** Один канал музыки: выбор другой темы останавливает предыдущую. */
  music: MusicState | null;
  /** Каналы эмбиента: звучат одновременно и с музыкой, и друг с другом. */
  ambient: string[];
  /** Что слышно прямо сейчас — общий источник для страницы и хедера. */
  playing: SoundtrackTrack[];
  volumeOf: (trackId: string) => number;
  toggleMusic: (trackId: string) => void;
  toggleAmbient: (trackId: string) => void;
  setVolume: (trackId: string, volume: number) => void;
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
  const [music, setMusic] = useState<MusicState | null>(null);
  const [ambient, setAmbient] = useState<string[]>([]);
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  useEffect(() => {
    const live = elements.current;
    return () => {
      live.forEach((element) => element.pause());
      live.clear();
    };
  }, []);

  const volumeOf = useCallback(
    (trackId: string) => volumes[trackId] ?? DEFAULT_VOLUME,
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
      element.volume = volumes[trackId] ?? DEFAULT_VOLUME;
      void element.play().catch(() => undefined);
      return true;
    },
    [volumes],
  );

  const stop = useCallback((trackId: string) => {
    const element = elements.current.get(trackId);
    if (!element) return;
    element.pause();
    element.currentTime = 0;
    elements.current.delete(trackId);
  }, []);

  const toggleMusic = useCallback(
    (trackId: string) => {
      if (music?.trackId === trackId) {
        if (music.paused) {
          if (!start(trackId)) return;
        } else {
          elements.current.get(trackId)?.pause();
        }
        setMusic({ trackId, paused: !music.paused });
        return;
      }
      if (music) stop(music.trackId);
      if (!start(trackId)) return;
      setMusic({ trackId, paused: false });
    },
    [music, start, stop],
  );

  const toggleAmbient = useCallback(
    (trackId: string) => {
      if (ambient.includes(trackId)) {
        stop(trackId);
        setAmbient((current) => current.filter((id) => id !== trackId));
        return;
      }
      if (!start(trackId)) return;
      setAmbient((current) => [...current, trackId]);
    },
    [ambient, start, stop],
  );

  const setVolume = useCallback((trackId: string, volume: number) => {
    setVolumes((current) => ({ ...current, [trackId]: volume }));
    const element = elements.current.get(trackId);
    if (element) element.volume = volume;
  }, []);

  const stopAll = useCallback(() => {
    [...elements.current.keys()].forEach(stop);
    setMusic(null);
    setAmbient([]);
  }, [stop]);

  const playing = useMemo(
    () =>
      [...(music && !music.paused ? [music.trackId] : []), ...ambient]
        .map(findTrack)
        .filter((track): track is SoundtrackTrack => track !== null),
    [music, ambient],
  );

  return (
    <SoundtrackContext.Provider
      value={{ music, ambient, playing, volumeOf, toggleMusic, toggleAmbient, setVolume, stopAll }}
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
