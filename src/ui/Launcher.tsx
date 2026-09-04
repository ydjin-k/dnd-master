import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CampaignState, CampaignSummary } from "../state/types";
import "./Launcher.css";

export function Launcher({ onEnter }: { onEnter: (state: CampaignState) => void }) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    invoke<CampaignSummary[]>("list_campaigns")
      .then(setCampaigns)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const state = await invoke<CampaignState>("create_campaign", { name: newName.trim() });
      onEnter(state);
    } catch (e) {
      setError(String(e));
    }
  }

  async function continueCampaign(id: string) {
    try {
      const state = await invoke<CampaignState>("switch_campaign", { id });
      onEnter(state);
    } catch (e) {
      setError(String(e));
    }
  }

  async function deleteCampaign(id: string, name: string) {
    if (!window.confirm(`Удалить кампанию «${name}» без возможности восстановить?`)) return;
    try {
      await invoke("delete_campaign", { id });
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="launcher">
      <header className="launcher__masthead">
        <span className="launcher__eyebrow">Лунный арканум</span>
        <h1 className="launcher__title">D&amp;D Master</h1>
        <p className="launcher__tagline">Открой врата в свою следующую историю</p>
      </header>

      {error && <p className="launcher__error">Ошибка: {error}</p>}

      {loading && <p>Загрузка…</p>}
      {!loading && campaigns.length === 0 && (
        <section className="launcher__portal launcher__portal--empty">
          <div className="launcher__moon" aria-hidden="true" />
          <p className="launcher__portal-kicker">Врата ожидают</p>
          <h2>Начни первую историю</h2>
          <p className="launcher__empty">Дай кампании имя — её знак появится в астральном круге.</p>
        </section>
      )}

      {!loading && campaigns.length > 0 && (
        <section className="launcher__portal">
          <div className="launcher__orbit" aria-hidden="true" />
          <div className="launcher__moon" aria-hidden="true" />
          <p className="launcher__portal-kicker">Последняя кампания</p>
          <h2>{campaigns[0].name || "Без названия"}</h2>
          <p className="launcher__portal-meta">Героев: {campaigns[0].characterCount}</p>
          <button className="launcher__continue" onClick={() => continueCampaign(campaigns[0].id)}>
            Продолжить
          </button>
          <button
            className="launcher__portal-delete"
            onClick={() => deleteCampaign(campaigns[0].id, campaigns[0].name)}
          >
            Удалить
          </button>
        </section>
      )}

      <form className="launcher__new" onSubmit={createCampaign}>
        <label htmlFor="launcher-new-name">Новая история</label>
        <div className="launcher__new-controls">
          <input
            id="launcher-new-name"
            placeholder="Название новой кампании"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
          />
          <button type="submit" disabled={!newName.trim()}>
            Новая кампания
          </button>
        </div>
      </form>

      {campaigns.length > 1 && <h2 className="launcher__subtitle">Другие хроники</h2>}
      <ul className="launcher__list">
        {campaigns.slice(1).map((c) => (
          <li key={c.id} className="launcher__item">
            <div className="launcher__item-info">
              <span className="launcher__item-name">{c.name || "Без названия"}</span>
              <span className="launcher__item-meta">персонажей: {c.characterCount}</span>
            </div>
            <div className="launcher__item-actions">
              <button onClick={() => continueCampaign(c.id)}>Продолжить</button>
              <button className="launcher__delete" onClick={() => deleteCampaign(c.id, c.name)}>
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
