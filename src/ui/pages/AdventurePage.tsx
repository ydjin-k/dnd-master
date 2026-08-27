import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import type { Adventure } from "../../state/types";
import "./AdventurePage.css";

const LOG_LABEL: Record<string, string> = {
  scene: "",
  choice: "Выбор:",
  roll: "Бросок:",
  custom: "Своё действие:",
};

export function AdventurePage() {
  const { state, startAdventure, chooseOption, submitCustomAction } = useCampaign();
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [customText, setCustomText] = useState("");

  useEffect(() => {
    invoke<Adventure>("get_adventure").then(setAdventure);
  }, []);

  useEffect(() => {
    if (adventure && state.currentSceneId === null) {
      startAdventure();
    }
  }, [adventure, state.currentSceneId, startAdventure]);

  const scene = adventure?.scenes.find((s) => s.id === state.currentSceneId);

  async function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customText.trim()) return;
    await submitCustomAction(customText.trim());
    setCustomText("");
  }

  return (
    <div className="adventure-page">
      <h2>Приключение</h2>

      {!scene && <p>Загрузка сцены…</p>}

      {scene && (
        <div className="adventure-page__scene">
          <p className="adventure-page__scene-text">{scene.text}</p>
          <div className="adventure-page__options">
            {scene.options.map((opt) => (
              <button key={opt.id} onClick={() => chooseOption(opt.id)}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="adventure-page__custom-form" onSubmit={handleCustomSubmit}>
        <input
          placeholder="Свой вариант действия (заносится в журнал, движок его не разыгрывает)"
          value={customText}
          onChange={(e) => setCustomText(e.currentTarget.value)}
        />
        <button type="submit">Записать</button>
      </form>

      <h3>Журнал приключения</h3>
      <ul className="adventure-page__log">
        {state.adventureLog.map((entry, i) => (
          <li key={i} className={`adventure-log-entry adventure-log-entry--${entry.kind}`}>
            {LOG_LABEL[entry.kind] && (
              <span className="adventure-log-entry__label">{LOG_LABEL[entry.kind]} </span>
            )}
            {entry.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
