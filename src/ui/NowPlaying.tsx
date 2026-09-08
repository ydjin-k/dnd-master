import { useSoundtrack } from "../state/SoundtrackContext";
import { UIIcon } from "./UIIcon";

/**
 * Живёт в app-shell__header, то есть снаружи свитча вкладок: что играет и
 * кнопка «стоп» доступны с любой вкладки, не только со «Саундборда».
 */
export function NowPlaying() {
  const { playing, stopAll } = useSoundtrack();
  if (playing.length === 0) return null;

  const titles = playing.map((track) => track.title).join(" · ");
  return (
    <div className="now-playing" aria-live="polite">
      <UIIcon name="soundboard" />
      <span className="now-playing__titles" title={titles}>{titles}</span>
      <button
        type="button"
        className="now-playing__stop"
        aria-label="Остановить всё"
        title="Остановить всё"
        onClick={stopAll}
      >
        <span aria-hidden="true">■</span>
      </button>
    </div>
  );
}
