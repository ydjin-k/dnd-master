import { useState, type ReactNode } from "react";
import { useCampaign } from "../state/CampaignContext";
import "./AppShell.css";

export type Tab = "adventure" | "dice" | "characters" | "journal";

const TABS: { id: Tab; label: string }[] = [
  { id: "adventure", label: "Приключение" },
  { id: "dice", label: "Кубики" },
  { id: "characters", label: "Персонажи" },
  { id: "journal", label: "Дневник" },
];

export function AppShell({ children }: { children: (tab: Tab) => ReactNode }) {
  const [tab, setTab] = useState<Tab>("adventure");
  const { state, setCampaignName } = useCampaign();

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <span className="app-shell__title">D&amp;D Master</span>
        <input
          className="app-shell__campaign-name"
          value={state.campaignName}
          placeholder="Название кампании"
          onChange={(e) => setCampaignName(e.currentTarget.value)}
        />
      </header>
      <nav className="app-shell__nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={
              "app-shell__nav-item" +
              (t.id === tab ? " app-shell__nav-item--active" : "")
            }
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="app-shell__content">{children(tab)}</main>
    </div>
  );
}
