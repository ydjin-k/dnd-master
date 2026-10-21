import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DungeonRecord } from "../../state/types";
import { playersRecord } from "./mapAudience";

/**
 * Дорога от схемы мастера до окна «для игроков»: имя окна, имя события и три
 * команды, которыми схема туда едет.
 *
 * Связь СОБЫТИЕМ, а не чтением кампании с диска. Статусы комнат и отметок
 * живут в состоянии экрана мастера и уезжают на диск отдельной записью
 * (`save_campaign`), поэтому окно, читающее кампанию по сигналу, показывало бы
 * игрокам то, что уже записалось, а не то, что мастер только что нажал, —
 * причём разницу видно глазами ровно в тот момент, когда она важнее всего.
 * Событие несёт саму схему, и показанное у стола отстаёт от щелчка мастера на
 * одну отрисовку.
 *
 * Последняя отданная схема при этом лежит в Rust (`players.rs`): окно,
 * открытое ПОСЛЕ смены статуса, спрашивает её сам (`readPlayersMap`) и не
 * ждёт, пока мастер нажмёт что-нибудь ещё.
 *
 * В окно уходит ОТРЕДАКТИРОВАННАЯ копия записи (`playersRecord`): описаний
 * комнат, обитателей, чисел ловушек, заметок и семени в ней нет вовсе. Окно не
 * прячет секреты — оно их не получает.
 */

/** Ярлык окна игроков. Та же строка, что `players::WINDOW_LABEL` в Rust. */
export const PLAYERS_WINDOW_LABEL = "players";

/** Имя события со схемой. Та же строка, что `players::MAP_EVENT` в Rust. */
export const PLAYERS_MAP_EVENT = "players-map";

/** Что показывает окно игроков. `null` — схема у мастера закрыта. */
export interface PlayersMapView {
  /** Заголовок листа: имя подземелья и номер этажа, если этажей больше одного. */
  readonly title: string;
  /** Запись подземелья без всего, чего игрокам видеть нельзя. */
  readonly dungeon: DungeonRecord;
}

/**
 * Это окно игроков?
 *
 * Спрашивается по ЯРЛЫКУ окна, а не по адресу страницы: ярлык окну даёт Rust
 * при создании, и подделать его разметкой нельзя, а оба окна грузят один и тот
 * же `index.html`. Ярлык лежит в метаданных окна и читается без обращения к
 * Rust — поэтому окну игроков не нужно на это никакого права.
 *
 * Вне Tauri (вкладка `vite dev`, пробы в jsdom) метаданных нет вовсе, и это
 * главное окно: приложение должно открываться в браузере как раньше.
 */
export function isPlayersWindow(): boolean {
  try {
    return getCurrentWindow().label === PLAYERS_WINDOW_LABEL;
  } catch {
    return false;
  }
}

/** Схема для игроков по записи мастера и открытому этажу. */
export function playersMapView(
  dungeon: DungeonRecord,
  floor: number,
  title: string,
): PlayersMapView {
  return { title, dungeon: playersRecord(dungeon, floor) };
}

/** Открыть окно игроков или вывести на передний план уже открытое. */
export function openPlayersWindow(): Promise<void> {
  return invoke("players_window_open");
}

/**
 * Очередь отправок. Каждая следующая уходит, только когда доехала предыдущая.
 *
 * Без очереди отправки обгоняют друг друга: они независимые вызовы, и порядок,
 * в котором их примет Rust, ничем не закреплён. Поймано живьём — мастер
 * закрыл схему и тут же открыл её снова, «схема закрыта» пришло ПОСЛЕ новой
 * схемы, и окно у стола осталось с заставкой при открытом подземелье. Очередь
 * закрепляет простое правило: в ящике лежит то, что мастер сделал последним.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Отдать окну схему. `null` — схема закрыта, и окно показывает заставку.
 *
 * Зовётся и когда окна нет: схема ложится в ящик и дождётся открытия. Поэтому
 * мастеру не нужно помнить, открыто ли окно, — а значит, не может и забыть.
 */
export function publishPlayersMap(view: PlayersMapView | null): Promise<void> {
  const sent = queue
    .catch(() => undefined)
    .then(() => invoke<void>("players_map_set", { view }));
  queue = sent;
  return sent;
}

/** Что показывать сейчас: этим окно игроков начинает работу. */
export function readPlayersMap(): Promise<PlayersMapView | null> {
  return invoke("players_map_get");
}

/** Подписка на схему. Возвращает отписку — её зовёт размонтирование окна. */
export function onPlayersMap(
  show: (view: PlayersMapView | null) => void,
): Promise<UnlistenFn> {
  return listen<PlayersMapView | null>(PLAYERS_MAP_EVENT, (event) => show(event.payload ?? null));
}
