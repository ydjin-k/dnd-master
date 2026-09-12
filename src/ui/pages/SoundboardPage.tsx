import { AMBIENT_CATEGORIES, MUSIC_CATEGORIES, type SoundtrackCategory } from "../../audio/soundtrack";
import { MIN_VOLUME, useSoundtrack } from "../../state/SoundtrackContext";
import { UIIcon } from "../UIIcon";
import "./SoundboardPage.css";

function TrackList({
  categories,
  isActive,
  actionLabel,
  onToggle,
}: {
  categories: SoundtrackCategory[];
  isActive: (trackId: string) => boolean;
  actionLabel: (active: boolean) => string;
  onToggle: (trackId: string) => void;
}) {
  const { volumeOf, setVolume } = useSoundtrack();

  return <div className="soundboard__categories">{categories.map((category) => (
    <section key={category.id} className="soundboard__category">
      <h3>{category.title}</h3>
      <ul className="soundboard__tracks">{category.tracks.map((track) => {
        const active = isActive(track.id);
        return <li key={track.id} className={"soundboard__track dm-list-row" + (active ? " is-active" : "")}>
          <button
            type="button"
            className="soundboard__toggle"
            aria-pressed={active}
            aria-label={`${actionLabel(active)}: ${track.title}`}
            onClick={() => onToggle(track.id)}
            data-own-sound
          >
            <span aria-hidden="true">{active ? "❚❚" : "▶"}</span>
          </button>
          <span className="soundboard__title">{track.title}</span>
          <input
            className="soundboard__volume"
            type="range"
            min={MIN_VOLUME}
            max={1}
            step={0.05}
            value={volumeOf(track.id)}
            aria-label={`Громкость: ${track.title}`}
            onChange={(event) => setVolume(track.id, Number(event.currentTarget.value))}
          />
        </li>;
      })}</ul>
    </section>
  ))}</div>;
}

export function SoundboardPage() {
  const { music, ambient, active, toggleMusic, toggleAmbient, stopAll } = useSoundtrack();

  return <div className="soundboard">
    <div className="soundboard__head dm-card-head">
      <UIIcon name="soundboard" />
      <h2>Саундборд</h2>
      <button className="dm-card-head__action" type="button" onClick={stopAll} disabled={active.length === 0}>Остановить всё</button>
    </div>

    <h2 className="soundboard__section">Музыка</h2>
    <p className="soundboard__hint dm-hint">Играет одна тема за раз — выбор другой останавливает предыдущую.</p>
    <TrackList
      categories={MUSIC_CATEGORIES}
      isActive={(trackId) => music?.trackId === trackId && !music.paused}
      actionLabel={(active) => (active ? "Пауза" : "Играть")}
      onToggle={toggleMusic}
    />

    <h2 className="soundboard__section">Эмбиент</h2>
    <p className="soundboard__hint dm-hint">Зациклены и накладываются друг на друга и на музыку.</p>
    <TrackList
      categories={AMBIENT_CATEGORIES}
      isActive={(trackId) => ambient.some((c) => c.trackId === trackId && !c.paused)}
      actionLabel={(active) => (active ? "Остановить" : "Играть")}
      onToggle={toggleAmbient}
    />
  </div>;
}
