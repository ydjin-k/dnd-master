import { useState, type ReactNode } from "react";
import { useCampaign } from "../state/CampaignContext";
import { UIIcon } from "./UIIcon";
import "./AppShell.css";

export type Tab = "adventure" | "combat" | "dice" | "characters" | "journal" | "rules" | "bestiary";

const TABS: { id: Tab; label: string }[] = [
  { id: "adventure", label: "Приключение" },
  { id: "combat", label: "Бой" },
  { id: "dice", label: "Кубики" },
  { id: "characters", label: "Персонажи" },
  { id: "journal", label: "Дневник" },
  { id: "rules", label: "Правила" },
  { id: "bestiary", label: "Бестиарий" },
];

export function AppShell({
  children,
  onSwitchCampaign,
}: {
  children: (tab: Tab) => ReactNode;
  onSwitchCampaign: () => void;
}) {
  const [tab, setTab] = useState<Tab>("adventure");
  const { state, setCampaignName } = useCampaign();

  return (
    <div className="app-shell" data-active-tab={tab}>
      <header className="app-shell__header">
        <span className="app-shell__title"><UIIcon name="campaign" />D&amp;D Master</span>
        <input
          className="app-shell__campaign-name"
          value={state.campaignName}
          placeholder="Название кампании"
          onChange={(e) => setCampaignName(e.currentTarget.value)}
        />
        <button className="app-shell__switch-campaign" onClick={onSwitchCampaign}>
          <UIIcon name="campaign" />Кампании
        </button>
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
