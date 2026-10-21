import { useState, type ReactNode } from "react";
import { useCampaign } from "../state/CampaignContext";
import { NowPlaying } from "./NowPlaying";
import { UIIcon } from "./UIIcon";
import "./AppShell.css";

export type Tab =
  | "adventures" | "dungeons" | "combat" | "dice" | "characters"
  | "journal" | "rules" | "spells" | "bestiary" | "soundboard";

export const TABS: { id: Tab; label: string }[] = [
  { id: "adventures", label: "Приключения" },
  { id: "dungeons", label: "Подземелья" },
  { id: "combat", label: "Бой" },
  { id: "dice", label: "Кубики" },
  { id: "characters", label: "Персонажи" },
  { id: "journal", label: "Дневник" },
  { id: "rules", label: "Правила" },
  { id: "spells", label: "Заклинания" },
  { id: "bestiary", label: "Бестиарий" },
  { id: "soundboard", label: "Саундборд" },
];

/** Золотой медальон с розой ветров слева от названия (референс владельца 21.10). */
function HeaderEmblem() {
  return (
    <svg className="app-shell__emblem" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="app-shell-emblem-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7dfa6" />
          <stop offset="0.5" stopColor="#c99a52" />
          <stop offset="1" stopColor="#7d5a26" />
        </linearGradient>
      </defs>
      <path className="app-shell__emblem-ticks" d="M32 1v9M32 54v9M1 32h9M54 32h9" />
      <circle className="app-shell__emblem-disc" cx="32" cy="32" r="21" />
      <circle className="app-shell__emblem-ring" cx="32" cy="32" r="17.5" />
      <path className="app-shell__emblem-star" d="m32 17 2.8 11.2L46 32l-11.2 2.8L32 46l-2.8-11.2L18 32l11.2-2.8Z" />
      <path className="app-shell__emblem-star app-shell__emblem-star--minor" d="m42 22-6.1 8.2-1.8-2.3Zm0 20-8.2-6.1 2.3-1.8Zm-20 0 6.1-8.2 1.8 2.3Zm0-20 8.2 6.1-2.3 1.8Z" />
      <circle className="app-shell__emblem-hub" cx="32" cy="32" r="2.4" />
    </svg>
  );
}

export function AppShell({
  children,
  onSwitchCampaign,
}: {
  children: (tab: Tab) => ReactNode;
  onSwitchCampaign: () => void;
}) {
  const [tab, setTab] = useState<Tab>("characters");
  const { state, setCampaignName } = useCampaign();

  return (
    <div className="app-shell" data-active-tab={tab}>
      <header className="app-shell__header">
        <span className="app-shell__title"><HeaderEmblem />D&amp;D Master</span>
        <span className="app-shell__title-divider" aria-hidden="true" />
        <span className="app-shell__campaign-frame">
          <input
            className="app-shell__campaign-name"
            value={state.campaignName}
            placeholder="Название кампании"
            onChange={(e) => setCampaignName(e.currentTarget.value)}
          />
        </span>
        <NowPlaying />
        <button className="app-shell__switch-campaign" onClick={onSwitchCampaign}>
          <UIIcon name="campaign" />Кампании
        </button>
        <span className="app-shell__header-rule" aria-hidden="true"><i /><i /><i /></span>
      </header>
      <nav className="app-shell__nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            data-tab={t.id}
            className={
              "app-shell__nav-item" +
              (t.id === tab ? " app-shell__nav-item--active" : "")
            }
            onClick={() => setTab(t.id)}
          >
            <UIIcon name={t.id} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <main className="app-shell__content">{children(tab)}</main>
    </div>
  );
}
