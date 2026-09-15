import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import type { Adventure, Likelihood, LikelihoodOption } from "../../state/types";
import "./AdventurePage.css";

const LOG_LABEL: Record<string, string> = {
  scene: "",
  choice: "Выбор:",
  roll: "Бросок:",
  custom: "Своё действие:",
  oracle: "Оракул:",
};

export function AdventurePage() {
  const { state, startAdventure, chooseOption, submitCustomAction, askOracle, adjustChaosFactor } =
    useCampaign();
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [customText, setCustomText] = useState("");
  const [likelihoods, setLikelihoods] = useState<LikelihoodOption[]>([]);
  const [oracleQuestion, setOracleQuestion] = useState("");
  const [oracleLikelihood, setOracleLikelihood] = useState<Likelihood>("even");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<Adventure | null>("get_adventure")
      .then(setAdventure)
      .catch((e) => setError(String(e)));
    // `?? []` — не догадка о бэкенде, а страховка перебора ниже: список
    // разворачивается через likelihoods.map, и пустой список здесь честнее,
    // чем взрыв в рендере, уносящий всё приложение в корневую заглушку.
    invoke<LikelihoodOption[] | null>("get_oracle_likelihoods")
      .then((options) => setLikelihoods(options ?? []))
      .catch((e) => setError(String(e)));
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

  async function handleOracleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!oracleQuestion.trim()) return;
    await askOracle(oracleQuestion.trim(), oracleLikelihood);
    setOracleQuestion("");
  }

  return (
    <div className="adventure-page">
      <h2>Приключение</h2>

      {error && <p className="adventure-page__error">Не удалось загрузить приключение: {error}</p>}

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

      <h3>Оракул</h3>
      <p className="adventure-page__hint dm-hint">
        Задай да/нет-вопрос, оцени его вероятность на глаз — дальше решает бросок.
      </p>
      <div className="adventure-page__chaos">
        Коэффициент хаоса: {state.chaosFactor}
        <button type="button" onClick={() => adjustChaosFactor(-1)} disabled={state.chaosFactor <= 1}>
          −
        </button>
        <button type="button" onClick={() => adjustChaosFactor(1)} disabled={state.chaosFactor >= 9}>
          +
        </button>
      </div>
      <form className="adventure-page__oracle-form" onSubmit={handleOracleSubmit}>
        <input
          placeholder="Например: прячется ли кто-то за дверью?"
          value={oracleQuestion}
          onChange={(e) => setOracleQuestion(e.currentTarget.value)}
        />
        <select
          value={oracleLikelihood}
          onChange={(e) => setOracleLikelihood(e.currentTarget.value as Likelihood)}
        >
          {likelihoods.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button type="submit" className="dm-button--primary">Спросить</button>
      </form>

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
