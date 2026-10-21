import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DungeonMap } from "./dungeons/DungeonMap";
import {
  onPlayersMap,
  readPlayersMap,
  type PlayersMapView,
} from "./dungeons/playersMap";
import "./theme.css";
import "./PlayersWindow.css";

/**
 * Окно «для игроков»: его мастер выводит на второй монитор или телевизор у
 * стола. Видно в нём ровно одно — схема открытого подземелья, и только то,
 * что отряд уже обнаружил.
 *
 * Своего мнения о видимом у окна нет: оно рисует запись, которую прислал
 * мастер, а присылает он УЖЕ отредактированную копию (`playersRecord` в
 * `mapAudience.ts`) — ни описаний комнат, ни обитателей, ни чисел ловушек, ни
 * заметок, ни семени в ней нет вовсе. Отрисовка спрашивает те же правила
 * вторично (`audience="players"`), поэтому спрятать секрет здесь нужно дважды
 * забыть, а не один раз.
 *
 * Управления в окне нет: ни статусов, ни вкладок, ни выбора комнат. Единственная
 * кнопка — «во весь экран», она же F11: окно живёт на телевизоре, и дотянуться
 * до него мышью бывает неудобно.
 */
export function PlayersWindow() {
  const [view, setView] = useState<PlayersMapView | null>(null);
  const [full, setFull] = useState(false);
  /**
   * Пришло ли событие со схемой. Ящик в Rust спрашивается один раз при
   * открытии, и ответ на этот вопрос мог обогнать событие, отправленное уже
   * после него: тогда ответ ящика — вчерашняя схема, и накрывать им свежую
   * нельзя.
   */
  const live = useRef(false);

  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    // Подписка ПЕРВОЙ, вопрос ящику вторым: между ними мастер мог сменить
    // статус, и пропустить это событие окно не должно.
    onPlayersMap((next) => {
      live.current = true;
      if (alive) setView(next);
    })
      .then((unlisten) => {
        if (alive) off = unlisten;
        else unlisten();
      })
      .catch(() => undefined);
    readPlayersMap()
      .then((now) => {
        if (alive && !live.current) setView(now);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  /**
   * Во весь экран и обратно. Своё состояние окна не выдумывается, а
   * спрашивается у самого окна: на весь экран его мог отправить и человек —
   * мышью за заголовок или F11 — и выдуманный признак разошёлся бы с
   * настоящим на первом же таком разе.
   */
  const toggleFullscreen = async () => {
    try {
      const own = getCurrentWindow();
      const now = await own.isFullscreen();
      await own.setFullscreen(!now);
      setFull(!now);
    } catch {
      // Вне Tauri (вкладка браузера, пробы) полного экрана у окна нет.
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F11") {
        event.preventDefault();
        void toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="players-window">
      <div className="players-window__bar">
        <span className="players-window__title">{view ? view.title : "D&D Master"}</span>
        <button type="button" onClick={toggleFullscreen}>
          {full ? "Выйти из полного экрана" : "Во весь экран (F11)"}
        </button>
      </div>
      {view ? (
        <div className="players-window__map">
          {/* `paper={false}` — пергамента и сетки по всему полю нет: закрытая
              часть схемы это тёмный фон окна, то есть туман. `captions={false}`
              — у отметок только значок вида, без номера и описания (карточка:
              «значком вида, без текста»); номера комнат остаются. */}
          <DungeonMap
            dungeon={view.dungeon}
            selectedId={null}
            audience="players"
            paper={false}
            captions={false}
          />
        </div>
      ) : (
        <p className="players-window__idle" role="status">
          Мастер пока не вывел схему
        </p>
      )}
    </div>
  );
}
