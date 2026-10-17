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
    return { x: 50 + Math.cos(angle) * 38, y: 50 + Math.sin(angle) * 38, ring: 0 };
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
    <svg className="launcher__title-ornament" viewBox="0 0 360 40" aria-hidden="true">
      <path className="launcher__ornament-rule" d="M8 20h132m80 0h132" />
      <circle className="launcher__ornament-halo" cx="180" cy="20" r="14" />
      <path className="launcher__ornament-moon" d="M176 5a15 15 0 1 0 15 27 12.4 12.4 0 0 1-15-27Z" />
      <path className="launcher__ornament-star" d="m150 20 4-1.4 1.4-4 1.4 4 4 1.4-4 1.4-1.4 4-1.4-4Zm49 0 4-1.4 1.4-4 1.4 4 4 1.4-4 1.4-1.4 4-1.4-4Z" />
    </svg>
  );
}

function Astrolabe() {
  const spokes = getDialPositions(MAX_CAMPAIGNS);
  const starPoints = [
    [18, 45], [20, 53], [22, 62], [24, 31], [26, 38], [27, 55], [29, 68], [30, 24],
    [31, 47], [32, 76], [34, 34], [35, 58], [37, 20], [38, 43], [39, 65], [41, 29],
    [42, 73], [44, 37], [45, 59], [47, 18], [48, 31], [49, 69], [52, 24], [53, 42],
    [54, 77], [56, 32], [57, 62], [59, 18], [60, 48], [61, 70], [63, 27], [64, 56],
    [66, 38], [67, 78], [69, 22], [70, 48], [72, 63], [74, 34], [76, 54], [77, 69],
    [79, 42], [81, 58], [28, 83], [36, 81], [47, 84], [58, 82], [69, 84], [23, 72],
  ];
  return (
    <svg className="launcher__astrolabe" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="launcher__astrolabe-shadow" cx="50" cy="50" r="45.5" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--outer" cx="50" cy="50" r="45" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--heavy" cx="50" cy="50" r="43.8" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--fine" cx="50" cy="50" r="42.7" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--heavy" cx="50" cy="50" r="40.9" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--medallion" cx="50" cy="50" r="38" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--dashed" cx="50" cy="50" r="35.2" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--fine" cx="50" cy="50" r="31.8" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--dashed" cx="50" cy="50" r="27.7" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--fine" cx="50" cy="50" r="23.5" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--dashed" cx="50" cy="50" r="18.2" />
      <circle className="launcher__astrolabe-line launcher__astrolabe-line--fine" cx="50" cy="50" r="13.8" />
      {Array.from({ length: 72 }, (_, index) => (
        <line
          key={`tick-${index}`}
          className={`launcher__astrolabe-tick${index % 6 === 0 ? " launcher__astrolabe-tick--major" : ""}`}
          x1="50"
          y1={index % 6 === 0 ? "5.1" : "5.8"}
          x2="50"
          y2={index % 6 === 0 ? "8.1" : "7.3"}
          transform={`rotate(${index * 5} 50 50)`}
        />
      ))}
      {Array.from({ length: 12 }, (_, index) => (
        <g key={`sign-${index}`} className="launcher__astrolabe-sign" transform={`rotate(${index * 30 + 15} 50 50)`}>
          {index % 3 === 0 && <path d="m48.9 9.6 1.1-1.5 1.1 1.5-1.1 1.5Z" />}
          {index % 3 === 1 && <path d="m48.6 10.6 1.4-2.4 1.4 2.4m-2.1-.8h1.4" />}
          {index % 3 === 2 && <path d="m48.7 8.5 2.6 2.1m0-2.1-2.6 2.1" />}
        </g>
      ))}
      <ellipse className="launcher__astrolabe-orbit launcher__astrolabe-orbit--gold" cx="50" cy="50" rx="32" ry="16" transform="rotate(-20 50 50)" />
      <ellipse className="launcher__astrolabe-orbit" cx="50" cy="50" rx="30" ry="11" transform="rotate(31 50 50)" />
      <ellipse className="launcher__astrolabe-orbit" cx="50" cy="50" rx="25" ry="19" transform="rotate(57 50 50)" />
      <ellipse className="launcher__astrolabe-orbit launcher__astrolabe-orbit--gold" cx="50" cy="50" rx="21" ry="8" transform="rotate(-53 50 50)" />
      {spokes.map((position, index) => <line key={index} className="launcher__astrolabe-spoke" x1="50" y1="50" x2={position.x} y2={position.y} />)}
      <path className="launcher__constellation" d="M18 45l8-7 8 4 7-13m27-7 6 12 7 8-5 12m-53 18 6-4 7 8 8-3m17 9 6-12 7 7 9-8" />
      <path className="launcher__constellation launcher__constellation--fine" d="M31 24l7-4 9-2 5 6 7-6 10 4M28 55l7 3 4 7 10 4 8-7 7-6 8 7" />
      {starPoints.map(([cx, cy], index) => <circle key={`${cx}-${cy}`} className="launcher__star-point" cx={cx} cy={cy} r={index % 7 === 0 ? "0.62" : index % 3 === 0 ? "0.42" : "0.27"} />)}
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
              <span className="launcher__moon" aria-hidden="true"><i /></span>
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
