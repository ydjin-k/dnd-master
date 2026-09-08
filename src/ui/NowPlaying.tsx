import { useSoundtrack } from "../state/SoundtrackContext";
import { UIIcon } from "./UIIcon";

/**
 * Живёт в app-shell__header, то есть снаружи свитча вкладок: что звучит,
 * пауза/продолжение каждого трека по отдельности и всего разом — доступны
 * с любой вкладки, без похода на «Саундборд». Пауза, а не стоп: позиция
 * сохраняется, повторный клик продолжает с того же места.
 */
export function NowPlaying() {
  const { active, anyPlaying, togglePause, togglePauseAll } = useSoundtrack();
  if (active.length === 0) return null;

  const allLabel = anyPlaying ? "Пауза: всё" : "Продолжить: всё";
  return (
    <div className="now-playing" role="group" aria-label="Сейчас звучит" aria-live="polite">
      <button
        type="button"
        className="now-playing__all"
        aria-label={allLabel}
        title={allLabel}
        onClick={togglePauseAll}
        data-own-sound
      >
        <UIIcon name="soundboard" />
        <span aria-hidden="true">{anyPlaying ? "❚❚" : "▶"}</span>
      </button>
      <ul className="now-playing__tracks">
        {active.map((track) => {
          const label = `${track.paused ? "Продолжить" : "Пауза"}: ${track.title}`;
          return (
            <li
              key={track.id}
              className={"now-playing__track" + (track.paused ? " is-paused" : "")}
            >
              <button
                type="button"
                className="now-playing__track-toggle"
                aria-label={label}
                title={label}
                onClick={() => togglePause(track.id)}
                data-own-sound
              >
                <span aria-hidden="true">{track.paused ? "▶" : "❚❚"}</span>
              </button>
              <span className="now-playing__title">{track.title}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
