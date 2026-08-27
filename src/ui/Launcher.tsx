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
      <h1 className="launcher__title">D&amp;D Master</h1>

      {error && <p className="launcher__error">Ошибка: {error}</p>}

      <form className="launcher__new" onSubmit={createCampaign}>
        <input
          placeholder="Название новой кампании"
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
        />
        <button type="submit" disabled={!newName.trim()}>
          Новая кампания
        </button>
      </form>

      <h2 className="launcher__subtitle">Продолжить</h2>
      {loading && <p>Загрузка…</p>}
      {!loading && campaigns.length === 0 && (
        <p className="launcher__empty">Сохранённых кампаний пока нет — начни новую выше.</p>
      )}
      <ul className="launcher__list">
        {campaigns.map((c) => (
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
