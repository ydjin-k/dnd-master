import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CampaignState, CampaignSummary } from "../state/types";
import "./Launcher.css";

const CAMPAIGNS_PER_RING = 6;
const MAX_CAMPAIGNS = 6;
let isLauncherMusicMuted = false;

export type DialPosition = { x: number; y: number; ring: number };

export function getDialPositions(count: number): DialPosition[] {
  if (count <= 0) return [];
  const ringCount = Math.ceil(count / CAMPAIGNS_PER_RING);
  return Array.from({ length: count }, (_, index) => {
    const ring = Math.floor(index / CAMPAIGNS_PER_RING);
    const firstIndex = ring * CAMPAIGNS_PER_RING;
    const itemsOnRing = Math.min(CAMPAIGNS_PER_RING, count - firstIndex);
    const angle = -Math.PI / 2 + ((index - firstIndex) * Math.PI * 2) / itemsOnRing + (ring % 2) * (Math.PI / itemsOnRing);
    const xRadius = 43 - ring * (24 / Math.max(1, ringCount - 1));
    const yRadius = 38 - ring * (22 / Math.max(1, ringCount - 1));
    return { x: 50 + Math.cos(angle) * xRadius, y: 50 + Math.sin(angle) * yRadius, ring };
  });
}

export function Launcher({ onEnter }: { onEnter: (state: CampaignState) => void }) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isMusicMuted, setIsMusicMuted] = useState(isLauncherMusicMuted);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const positions = useMemo(() => getDialPositions(campaigns.length), [campaigns.length]);
  const selected = campaigns.find((campaign) => campaign.id === selectedId) ?? null;
  const campaignLimitReached = campaigns.length >= MAX_CAMPAIGNS;

  function refresh() {
    setLoading(true);
    invoke<CampaignSummary[]>("list_campaigns")
      .then((nextCampaigns) => {
        setCampaigns(nextCampaigns);
        setSelectedId((current) => nextCampaigns.some(({ id }) => id === current) ? current : null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  useEffect(() => {
    const music = new Audio("/audio/launcher-theme.mp3");
    music.loop = true;
    music.volume = 0.32;
    music.muted = isLauncherMusicMuted;
    musicRef.current = music;
    void music.play().catch(() => undefined);
    return () => {
      music.pause();
      music.currentTime = 0;
      musicRef.current = null;
    };
  }, []);

  function toggleMusic() {
    const nextMuted = !isMusicMuted;
    isLauncherMusicMuted = nextMuted;
    setIsMusicMuted(nextMuted);
    if (musicRef.current) musicRef.current.muted = nextMuted;
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || campaignLimitReached) return;
    try {
      const state = await invoke<CampaignState>("create_campaign", { name: newName.trim() });
      onEnter(state);
    } catch (e) { setError(String(e)); }
  }

  async function continueCampaign(id: string) {
    try {
      const state = await invoke<CampaignState>("switch_campaign", { id });
      onEnter(state);
    } catch (e) { setError(String(e)); }
  }

  async function deleteCampaign(id: string, name: string) {
    if (!window.confirm(`Удалить кампанию «${name}» без возможности восстановить?`)) return;
    try {
      await invoke("delete_campaign", { id });
      refresh();
    } catch (e) { setError(String(e)); }
  }

  return (
    <div className="launcher">
      <video className="launcher__background" src="/video/launcher-background.mp4" autoPlay loop muted playsInline aria-hidden="true" />
      <button
        type="button"
        className="launcher__music-toggle"
        aria-label={isMusicMuted ? "Включить музыку" : "Выключить музыку"}
        aria-pressed={isMusicMuted}
        title={isMusicMuted ? "Включить музыку" : "Выключить музыку"}
        onClick={toggleMusic}
      >
        <span aria-hidden="true">{isMusicMuted ? "🔇" : "🔊"}</span>
      </button>
      <header className="launcher__masthead">
        <span className="launcher__eyebrow">Лунный арканум</span>
        <h1 className="launcher__title">D&amp;D Master</h1>
        <p className="launcher__tagline">Выбери знак хроники на небесном циферблате</p>
      </header>

      {error && <p className="launcher__error">Ошибка: {error}</p>}
      {loading && <p className="launcher__loading">Загрузка…</p>}

      {!loading && campaigns.length === 0 && (
        <section className="launcher__portal launcher__portal--empty">
          <div className="launcher__moon" aria-hidden="true" />
          <p className="launcher__portal-kicker">Врата ожидают</p>
          <h2>Начни первую историю</h2>
          <p className="launcher__empty">Дай кампании имя — её знак появится в круге.</p>
        </section>
      )}

      {!loading && campaigns.length > 0 && (
        <section className="launcher__dial" aria-label="Циферблат кампаний">
          <div className="launcher__dial-plane" aria-hidden="true" />
          <svg className="launcher__hands" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {campaigns.map((campaign, index) => (
              <g key={campaign.id} className={selectedId === campaign.id ? "is-selected" : undefined}>
                <line x1="50" y1="50" x2={positions[index].x} y2={positions[index].y} />
                <circle cx={positions[index].x} cy={positions[index].y} r="1.15" />
              </g>
            ))}
          </svg>
          {campaigns.map((campaign, index) => (
            <button
              key={campaign.id}
              type="button"
              className={`launcher__campaign-marker${selectedId === campaign.id ? " is-selected" : ""}`}
              style={{ left: `${positions[index].x}%`, top: `${positions[index].y}%` }}
              aria-label={`Открыть кампанию ${campaign.name || "Без названия"}`}
              aria-pressed={selectedId === campaign.id}
              onClick={() => setSelectedId(campaign.id)}
            >
              <span>{campaign.name || "Без названия"}</span>
            </button>
          ))}
          <div className={`launcher__dial-center${selected ? " is-open" : ""}`} aria-live="polite">
            {selected ? (
              <>
                <p className="launcher__portal-kicker">Выбранная хроника</p>
                <h2 title={selected.name}>{selected.name || "Без названия"}</h2>
                <p className="launcher__portal-meta">Героев: {selected.characterCount}</p>
                <div className="launcher__campaign-actions">
                  <button className="launcher__continue" onClick={() => continueCampaign(selected.id)}>Продолжить</button>
                  <button className="launcher__portal-delete" onClick={() => deleteCampaign(selected.id, selected.name)}>Удалить</button>
                </div>
              </>
            ) : (
              <><span className="launcher__center-sigil" aria-hidden="true">✦</span><p>Коснись знака<br />на циферблате</p></>
            )}
          </div>
        </section>
      )}

      <form className="launcher__new" onSubmit={createCampaign}>
        <label htmlFor="launcher-new-name">Новая история</label>
        <div className="launcher__new-controls">
          <input id="launcher-new-name" placeholder="Название новой кампании" value={newName} onChange={(e) => setNewName(e.currentTarget.value)} aria-describedby={campaignLimitReached ? "launcher-campaign-limit" : undefined} />
          <button type="submit" disabled={!newName.trim() || campaignLimitReached}>Новая кампания</button>
        </div>
        {campaignLimitReached && <p id="launcher-campaign-limit" className="launcher__campaign-limit">Достигнут предел в 6 кампаний</p>}
      </form>
    </div>
  );
}
