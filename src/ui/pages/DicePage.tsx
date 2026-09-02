import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RollResult } from "../../state/types";
import { DiceIcon, dieSidesFromExpression, type DieSides } from "../DiceIcon";
import "./DicePage.css";

const DICE_SIDES: DieSides[] = [4, 6, 8, 10, 12, 20, 100];
const COUNTS = Array.from({ length: 100 }, (_, index) => index + 1);
const MODIFIERS = Array.from({ length: 41 }, (_, index) => index - 20);
const ROLL_ANIMATION_MS = 550;
type RollMode = "normal" | "adv" | "dis";

interface LogItem { id: string; label: string; result?: RollResult; error?: string; manual?: number; }

function buildExpression(sides: DieSides, count: number, modifier: number, mode: RollMode) {
  return `${count === 1 ? "" : count}d${sides}${modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : modifier}${mode === "normal" ? "" : mode}`;
}

const waitForRollAnimation = () => new Promise<void>((resolve) => window.setTimeout(resolve, ROLL_ANIMATION_MS));

export function DicePage() {
  const [sides, setSides] = useState<DieSides>(20);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<RollMode>("normal");
  const [isRolling, setIsRolling] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [log, setLog] = useState<LogItem[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function roll() {
    if (isRolling) return;
    const expression = buildExpression(sides, count, modifier, mode);
    setIsRolling(true);
    const audio = audioRef.current ?? new Audio("/audio/dice-roll.wav");
    audioRef.current = audio;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
    try {
      const [result] = await Promise.all([invoke<RollResult>("roll_dice", { expression }), waitForRollAnimation()]);
      setLog((prev) => [{ id: crypto.randomUUID(), label: expression, result }, ...prev]);
    } catch (e) {
      setLog((prev) => [{ id: crypto.randomUUID(), label: expression, error: String(e) }, ...prev]);
    } finally {
      setIsRolling(false);
    }
  }

  function recordManual(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(manualValue);
    if (!Number.isFinite(value)) return;
    setLog((prev) => [{ id: crypto.randomUUID(), label: "вручную", manual: value }, ...prev]);
    setManualValue("");
  }

  return <div className="dice-page">
    <h2>Кубики</h2>
    <div className="dice-page__roller">
      <fieldset className="dice-page__dice-picker">
        <legend>Кость</legend>
        {DICE_SIDES.map((dieSides) => <button key={dieSides} type="button" className={sides === dieSides ? "is-selected" : ""} aria-pressed={sides === dieSides} aria-label={`Выбрать d${dieSides}`} onClick={() => setSides(dieSides)}>
          <DiceIcon sides={dieSides} compact /><span>d{dieSides}</span>
        </button>)}
      </fieldset>
      <div className="dice-page__selectors">
        <label>Количество<select aria-label="Количество костей" value={count} onChange={(event) => setCount(Number(event.currentTarget.value))}>
          {COUNTS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>Модификатор<select aria-label="Модификатор" value={modifier} onChange={(event) => setModifier(Number(event.currentTarget.value))}>
          {MODIFIERS.map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
        </select></label>
        <label>Режим<select aria-label="Преимущество или помеха" value={mode} onChange={(event) => setMode(event.currentTarget.value as RollMode)}>
          <option value="normal">Обычный</option><option value="adv">Преимущество</option><option value="dis">Помеха</option>
        </select></label>
      </div>
      <button className="dice-page__roll" type="button" aria-label="Бросить" onClick={roll} disabled={isRolling}>
        <span className={`dice-page__rolling-icon${isRolling ? " is-rolling" : ""}`}><DiceIcon sides={sides} compact /></span>
        {isRolling ? "Катится…" : "Бросить"}
      </button>
    </div>
    <form className="dice-page__manual" onSubmit={recordManual}>
      <input aria-label="Результат ручного броска" type="number" value={manualValue} onChange={(event) => setManualValue(event.currentTarget.value)} placeholder="0" />
      <button type="submit">Записать вручную</button>
    </form>
    <ul className="dice-page__log">{log.map((item) => {
      const entrySides = item.result ? dieSidesFromExpression(item.label) : null;
      const showRollBreakdown = item.result && (item.result.rolls.length !== 1 || item.result.modifier !== 0);
      const showDetail = showRollBreakdown || Boolean(item.result?.dropped);
      return <li key={item.id} className="dice-log-entry">
        {entrySides && <DiceIcon sides={entrySides} value={item.result?.total} />}
        <span className="dice-log-entry__expr">{item.label}</span>
        {item.result && <><span className="dice-log-entry__total">{item.result.total}</span>{showDetail && <span className="dice-log-entry__detail">
          {showRollBreakdown && <>[{item.result.rolls.join(", ")}]
            {item.result.modifier !== 0 && (item.result.modifier > 0 ? ` +${item.result.modifier}` : ` ${item.result.modifier}`)}
          </>}
          {item.result.dropped && ` (отброшено: ${item.result.dropped.join(", ")})`}
        </span>}</>}
        {item.manual !== undefined && <span className="dice-log-entry__total">{item.manual}</span>}
        {item.error && <span className="dice-log-entry__error">{item.error}</span>}
      </li>;
    })}</ul>
  </div>;
}
