import { useEffect, useState } from "react";
import "./LoadingScreen.css";

/** Сколько заставка держится в любом случае (владелец 22.10.2026: «фиксировано 3 с»). */
export const LOADING_MIN_MS = 3000;
/** Сколько она растворяется, прежде чем уйти из разметки. */
const FADE_MS = 600;
/** Дольше видео не ждём: без фона главная всё равно рабочая. */
const VIDEO_WAIT_CAP_MS = 10000;

/**
 * Конец заставки для тех, кому до него рано звучать (музыка главной: под
 * заставкой — тишина, владелец 22.10). Обещание заводит заставка при первой
 * отрисовке; заставки нет вовсе (пробы, повторный вход на главную) — ждать
 * нечего.
 */
let loadingDone: Promise<void> | null = null;
let finishLoading: () => void = () => {};

export function whenLoadingDone(): Promise<void> {
  return loadingDone ?? Promise.resolve();
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Фоновое видео главной готово играть без остановки — или ждать его хватит. */
function launcherVideoReady(): Promise<void> {
  return new Promise((resolve) => {
    const video = document.querySelector<HTMLVideoElement>("video.launcher__background");
    if (!video || video.readyState >= 4) return resolve();
    const done = () => resolve();
    video.addEventListener("canplaythrough", done, { once: true });
    video.addEventListener("error", done, { once: true });
    setTimeout(done, VIDEO_WAIT_CAP_MS);
  });
}

/**
 * Заставка при запуске: тёмный экран, в правом нижнем углу «Загрузка» и
 * золотая точка, бегущая по кольцу. Главная монтируется ПОД ней и грузится
 * (видео, шрифты, список кампаний), поэтому из-под заставки она выходит уже
 * готовой. Держится LOADING_MIN_MS, но не меньше настоящей загрузки.
 */
export function LoadingScreen() {
  const [phase, setPhase] = useState<"shown" | "fading" | "gone">(() => {
    // Заводится при отрисовке, а не в эффекте: эффект главной, которая стоит
    // в дереве раньше заставки, срабатывает первым и обязан уже застать
    // обещание.
    if (!loadingDone) loadingDone = new Promise((resolve) => (finishLoading = resolve));
    return "shown";
  });

  // Пока заставка стоит, главная под ней ещё догружается и бывает выше экрана;
  // полоса прокрутки страницы рисуется поверх любого слоя и торчала бы сквозь
  // заставку. Прокрутка закрыта, пока заставка не ушла.
  useEffect(() => {
    if (phase === "gone") return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [phase === "gone"]);

  useEffect(() => {
    let alive = true;
    void Promise.all([delay(LOADING_MIN_MS), document.fonts?.ready, launcherVideoReady()]).then(async () => {
      if (!alive) return;
      setPhase("fading");
      finishLoading();
      await delay(FADE_MS);
      if (alive) setPhase("gone");
    });
    return () => {
      alive = false;
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div
      className={`loading-screen${phase === "fading" ? " loading-screen--fading" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="loading-screen__label">Загрузка</span>
      <svg className="loading-screen__orbit" viewBox="0 0 40 40" aria-hidden="true">
        <circle className="loading-screen__ring" cx="20" cy="20" r="15" />
        <g className="loading-screen__runner">
          <circle className="loading-screen__tail" cx="20" cy="20" r="15" />
          <circle className="loading-screen__dot" cx="20" cy="5" r="2.6" />
        </g>
      </svg>
    </div>
  );
}
