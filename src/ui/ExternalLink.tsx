import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Ссылка наружу: во встроенном webview обычный переход увёл бы само окно
 * приложения, поэтому клик перехватывается и адрес отдаётся системному
 * браузеру. Один владелец на все страницы справочника.
 */
export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href);
      }}
    >
      {children}
    </a>
  );
}
