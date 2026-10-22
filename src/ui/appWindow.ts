import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Окно мастера как у игры (владелец 22.10.2026): приложение стартует на весь
 * экран (`fullscreen` в `tauri.conf.json`), F11 переключает полный экран и
 * окно, а выходят кнопкой «Выйти» — крестика заголовка в полном экране нет.
 */

/** F11: на весь экран и обратно. Состояние спрашивается у самого окна. */
export async function toggleFullscreen(): Promise<void> {
  try {
    const own = getCurrentWindow();
    await own.setFullscreen(!(await own.isFullscreen()));
  } catch {
    // Вне Tauri (вкладка браузера, пробы) полного экрана у окна нет.
  }
}

/** Выход из приложения целиком — вместе с окном игроков, если оно открыто. */
export async function exitApp(): Promise<void> {
  try {
    await invoke("app_exit");
  } catch {
    // Вне Tauri выходить некуда.
  }
}

/** Вешает F11 на всё время жизни окна мастера. */
export function useFullscreenHotkey(): void {
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
}
