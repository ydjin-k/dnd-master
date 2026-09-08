import { useSoundtrack } from "../state/SoundtrackContext";
import { UIIcon } from "./UIIcon";

/**
 * Живёт в app-shell__header, то есть снаружи свитча вкладок: что звучит,
 * пауза/продолжение каждого трека по отдельности и всего разом — доступны
 * с любой вкладки, без похода на «Саундборд».
 *
 * Две общие кнопки намеренно разные по смыслу: пауза сохраняет позицию и
 * оставляет панель на месте, сброс снимает треки совсем (позиция в 0, панель
 * исчезает) — то же самое, что «Остановить всё» на странице.
 */
export function NowPlaying() {
  const { active, anyPlaying, togglePause, togglePauseAll, stopAll } = useSoundtrack();
  if (active.length === 0) return null;

  const allLabel = anyPlaying ? "Пауза: всё" : "Продолжить: всё";
  return (
    <div className="now-playing" role="group" aria-label="Сейчас звучит" aria-live="polite">
      <UIIcon name="soundboard" />
      <button
        type="button"
        className="now-playing__all"
        aria-label={allLabel}
        title={allLabel}
        onClick={togglePauseAll}
        data-own-sound
      >
        <span aria-hidden="true">{anyPlaying ? "❚❚" : "▶"}</span>
      </button>
      <button
        type="button"
        className="now-playing__reset"
        aria-label="Сбросить всё"
        title="Сбросить всё — снять треки, следующий запуск с начала"
        onClick={stopAll}
        data-own-sound
      >
        <span aria-hidden="true">■</span>
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
