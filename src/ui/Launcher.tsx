import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CampaignState, CampaignSummary } from "../state/types";
import "./Launcher.css";

const MAX_CAMPAIGNS = 6;
let isLauncherMusicMuted = false;

export type DialPosition = { x: number; y: number; ring: number };

export function getDialPositions(count: number): DialPosition[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return { x: 50 + Math.cos(angle) * 39, y: 50 + Math.sin(angle) * 39, ring: 0 };
  });
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg className="launcher__sound-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9.2h3.1L11 6v12l-3.9-3.2H4z" />
      {!muted && <><path d="M14.2 9.1a4.2 4.2 0 0 1 0 5.8" /><path d="M16.8 6.6a7.6 7.6 0 0 1 0 10.8" /></>}
      {muted && <path d="m15 9 5 6m0-6-5 6" />}
    </svg>
  );
}

function TitleOrnament() {
  return (
    <svg className="launcher__title-ornament" viewBox="0 0 320 28" aria-hidden="true">
      <path d="M8 14h126m52 0h126" />
      <path className="launcher__ornament-moon" d="M158 4a10 10 0 1 0 10 16 8.3 8.3 0 0 1-10-16Z" />
      <path className="launcher__ornament-star" d="m139 14 3-1 1-3 1 3 3 1-3 1-1 3-1-3Zm34 0 3-1 1-3 1 3 3 1-3 1-1 3-1-3Z" />
    </svg>
  );
}

function Astrolabe() {
  const spokes = getDialPositions(MAX_CAMPAIGNS);
  return (
    <svg className="launcher__astrolabe" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="launcher__astrolabe-shadow" cx="50" cy="50" r="45.5" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--outer" cx="50" cy="50" r="44.5" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--ticks" cx="50" cy="50" r="42" />
      <circle className="launcher__astrolabe-line" cx="50" cy="50" r="38" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--dashed" cx="50" cy="50" r="33.5" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--faint" cx="50" cy="50" r="27" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--dashed" cx="50" cy="50" r="19" />
      <ellipse className="launcher__astrolabe-orbit" cx="50" cy="50" rx="31" ry="15" transform="rotate(-24 50 50)" />
      <ellipse className="launcher__astrolabe-orbit" cx="50" cy="50" rx="29" ry="11" transform="rotate(31 50 50)" />
      {spokes.map((position, index) => <line key={index} className="launcher__astrolabe-spoke" x1="50" y1="50" x2={position.x} y2={position.y} />)}
      <path className="launcher__constellation" d="M21 42l6-8 5 6 7-13m35 2 6 8-4 8 8 5M27 68l7 5 7-4m22 7 8-7 7 4" />
      {["21,42", "27,34", "32,40", "39,27", "74,29", "80,37", "76,45", "84,50", "27,68", "34,73", "41,69", "63,76", "71,69", "78,73"].map((point) => {
        const [cx, cy] = point.split(",");
        return <circle key={point} className="launcher__star-point" cx={cx} cy={cy} r="0.72" />;
      })}
      <path className="launcher__cardinal-star" d="m50 5 1.1 3.4L54.5 10l-3.4 1.1L50 14.5l-1.1-3.4L45.5 10l3.4-1.6Z" />
    </svg>
  );
}

function MedallionStars() {
  return (
    <span className="launcher__medallion-stars" aria-hidden="true">
      <i className="launcher__medallion-star launcher__medallion-star--top" />
      <i className="launcher__medallion-star launcher__medallion-star--right" />
      <i className="launcher__medallion-star launcher__medallion-star--bottom" />
      <i className="launcher__medallion-star launcher__medallion-star--left" />
    </span>
  );
}

function CompassRose() {
  return (
    <svg className="launcher__compass" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="16" />
      <circle cx="32" cy="32" r="4" />
      <path d="m32 3 5 24 24 5-24 5-5 24-5-24-24-5 24-5Z" />
      <path d="m12 12 16 16m8 8 16 16m0-40L36 28m-8 8L12 52" />
    </svg>
  );
}

export function Launcher({ onEnter }: { onEnter: (state: CampaignState) => void }) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isMusicMuted, setIsMusicMuted] = useState(isLauncherMusicMuted);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const newNameRef = useRef<HTMLInputElement | null>(null);
  const positions = useMemo(() => getDialPositions(MAX_CAMPAIGNS), []);
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
      refresh();
      setNewName("");
      setSelectedId(state.id);
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

  function focusNewCampaign() {
    newNameRef.current?.focus();
  }

  return (
    <div className="launcher">
      <video className="launcher__background" src="/video/launcher-background.mp4" autoPlay loop muted playsInline aria-hidden="true" />
      <button type="button" className="launcher__music-toggle" aria-label={isMusicMuted ? "Включить музыку" : "Выключить музыку"} aria-pressed={isMusicMuted} title={isMusicMuted ? "Включить музыку" : "Выключить музыку"} onClick={toggleMusic}>
        <SoundIcon muted={isMusicMuted} />
      </button>

      <header className="launcher__masthead">
        <h1 className="launcher__title">D&amp;D Master</h1>
        <TitleOrnament />
      </header>

      {error && <p className="launcher__error">Ошибка: {error}</p>}
      {loading && <p className="launcher__loading">Загрузка…</p>}

      {!loading && (
        <main className="launcher__selector">
          <section className="launcher__dial" aria-label="Циферблат кампаний">
            <Astrolabe />
            {positions.map((position, index) => {
              const campaign = campaigns[index];
              const positionStyle = { left: `${position.x}%`, top: `${position.y}%` };
              if (campaign) {
                const isSelected = selectedId === campaign.id;
                return (
                  <button key={campaign.id} type="button" className={`launcher__campaign-marker${isSelected ? " is-selected" : ""}`} style={positionStyle} aria-label={`Выбрать кампанию ${campaign.name || "Без названия"}`} aria-pressed={isSelected} onClick={() => setSelectedId(campaign.id)}>
                    <MedallionStars />
                    <span className="launcher__campaign-name">{campaign.name || "Без названия"}</span>
                  </button>
                );
              }
              return (
                <button key={`empty-${index}`} type="button" className="launcher__campaign-marker launcher__campaign-marker--empty" style={positionStyle} aria-label={`Свободное место ${index + 1}: создать кампанию`} onClick={focusNewCampaign}>
                  <MedallionStars />
                  <span className="launcher__campaign-plus" aria-hidden="true" />
                </button>
              );
            })}

            <div className={`launcher__dial-center${selected ? " is-open" : ""}`} aria-live="polite">
              <span className="launcher__moon" aria-hidden="true" />
              <p className="launcher__selection-label">{selected ? "Выбранная кампания" : campaigns.length === 0 ? "Начните первую историю" : "Выберите кампанию"}</p>
              <span className="launcher__center-divider" aria-hidden="true"><i /></span>
              {selected && (
                <div className="launcher__campaign-actions">
                  <button className="launcher__continue" onClick={() => continueCampaign(selected.id)}>
                    {selected.characterCount === 0 ? "Начать" : "Продолжить"}<span aria-hidden="true">›</span>
                  </button>
                  <button className="launcher__portal-delete" onClick={() => deleteCampaign(selected.id, selected.name)}>Удалить</button>
                </div>
              )}
            </div>
          </section>
          <p className="launcher__campaign-count"><span aria-hidden="true" />{campaigns.length} из 6 кампаний<span aria-hidden="true" /></p>
        </main>
      )}

      <form className="launcher__new" onSubmit={createCampaign}>
        <CompassRose />
        <div className="launcher__new-content">
          <label htmlFor="launcher-new-name">Новая история</label>
          <div className="launcher__new-controls">
            <input ref={newNameRef} id="launcher-new-name" placeholder="Название новой кампании" value={newName} onChange={(e) => setNewName(e.currentTarget.value)} aria-describedby={campaignLimitReached ? "launcher-campaign-limit" : undefined} />
            <button type="submit" className="launcher__create" disabled={!newName.trim() || campaignLimitReached}>Создать</button>
          </div>
          {campaignLimitReached && <p id="launcher-campaign-limit" className="launcher__campaign-limit">Достигнут предел в 6 кампаний</p>}
        </div>
      </form>
    </div>
  );
}
