import { Children, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDiceLog } from "../../state/DiceLogContext";
import type { RollResult } from "../../state/types";
import { DiceIcon, dieSidesFromExpression, type DieSides } from "../DiceIcon";
import { playCriticalFailSound, playCriticalSuccessSound, playDiceRollSound } from "../../audio/uiSounds";
import "./DicePage.css";

const DICE_SIDES: DieSides[] = [4, 6, 8, 10, 12, 20, 100];
const COUNTS = Array.from({ length: 100 }, (_, index) => index + 1);
const MODIFIERS = Array.from({ length: 21 }, (_, index) => index - 10);
const ROLL_ANIMATION_MS = 550;
type RollMode = "normal" | "adv" | "dis";
type SelectorName = "count" | "modifier" | "mode";

interface InlineSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  expanded: boolean;
  label: string;
  onCollapse: () => void;
  onExpand: () => void;
}

function InlineSelect({ children, expanded, label, onCollapse, onExpand, ...props }: InlineSelectProps) {
  return <label>{label}<select
    {...props}
    aria-label={props["aria-label"] ?? label}
    size={expanded ? Math.min(6, Children.count(children)) : 1}
    onBlur={(event) => { onCollapse(); props.onBlur?.(event); }}
    onFocus={(event) => { onExpand(); props.onFocus?.(event); }}
    onPointerDown={(event) => {
      if (!expanded) {
        event.preventDefault();
        const select = event.currentTarget;
        onExpand();
        window.requestAnimationFrame(() => select.focus());
      }
      props.onPointerDown?.(event);
    }}
  >{children}</select></label>;
}

function buildExpression(sides: DieSides, count: number, modifier: number, mode: RollMode) {
  return `${count === 1 ? "" : count}d${sides}${modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : modifier}${mode === "normal" ? "" : mode}`;
}

function buildDiceLabel(sides: DieSides, count: number) {
  return `${count === 1 ? "" : count}d${sides}`;
}

const waitForRollAnimation = () => new Promise<void>((resolve) => window.setTimeout(resolve, ROLL_ANIMATION_MS));

export function DicePage() {
  const [sides, setSides] = useState<DieSides>(20);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<RollMode>("normal");
  const [expandedSelector, setExpandedSelector] = useState<SelectorName | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const { log, recordRoll, recordRollError, recordManual, clearLog } = useDiceLog();

  async function roll() {
    if (isRolling) return;
    const expression = buildExpression(sides, count, modifier, mode);
    setIsRolling(true);
    try {
      const [result] = await Promise.all([invoke<RollResult>("roll_dice", { expression }), waitForRollAnimation()]);
      const entrySides = dieSidesFromExpression(expression);
      if (entrySides === 20 && result.rolls.length === 1 && result.rolls[0] === 20) playCriticalSuccessSound();
      else if (entrySides === 20 && result.rolls.length === 1 && result.rolls[0] === 1) playCriticalFailSound();
      else playDiceRollSound();
      recordRoll(expression, result);
    } catch (e) {
      recordRollError(expression, String(e));
    } finally {
      setIsRolling(false);
    }
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(manualValue);
    if (!Number.isFinite(value)) return;
    recordManual(`Вручную (${buildDiceLabel(sides, count)})`, value);
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
        <InlineSelect label="Количество" aria-label="Количество костей" expanded={expandedSelector === "count"} onExpand={() => setExpandedSelector("count")} onCollapse={() => setExpandedSelector(null)} value={count} onChange={(event) => { setCount(Number(event.currentTarget.value)); setExpandedSelector(null); }}>
          {COUNTS.map((value) => <option key={value} value={value}>{value}</option>)}
        </InlineSelect>
        <InlineSelect label="Модификатор" aria-label="Модификатор" expanded={expandedSelector === "modifier"} onExpand={() => setExpandedSelector("modifier")} onCollapse={() => setExpandedSelector(null)} value={modifier} onChange={(event) => { setModifier(Number(event.currentTarget.value)); setExpandedSelector(null); }}>
          {MODIFIERS.map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
        </InlineSelect>
        <InlineSelect label="Режим" aria-label="Преимущество или помеха" expanded={expandedSelector === "mode"} onExpand={() => setExpandedSelector("mode")} onCollapse={() => setExpandedSelector(null)} value={mode} onChange={(event) => { setMode(event.currentTarget.value as RollMode); setExpandedSelector(null); }}>
          <option value="normal">Обычный</option><option value="adv">Преимущество</option><option value="dis">Помеха</option>
        </InlineSelect>
      </div>
      <button className="dice-page__roll dm-button--primary" type="button" aria-label="Бросить" onClick={roll} disabled={isRolling} data-own-sound>
        <span className={`dice-page__rolling-icon${isRolling ? " is-rolling" : ""}`}><DiceIcon sides={sides} compact /></span>
        {isRolling ? "Катится…" : "Бросить"}
      </button>
    </div>
    <form className="dice-page__manual" onSubmit={submitManual}>
      <input aria-label="Результат ручного броска" type="number" value={manualValue} onChange={(event) => setManualValue(event.currentTarget.value)} placeholder="0" />
      <button type="submit">Записать вручную</button>
    </form>
    {log.length > 0 && <div className="dice-page__log-actions">
      <button type="button" onClick={clearLog}>Очистить историю</button>
    </div>}
    <ul className="dice-page__log">{log.map((item) => {
      const entrySides = item.result ? dieSidesFromExpression(item.label) : null;
      const showRollBreakdown = item.result && (item.result.rolls.length !== 1 || item.result.modifier !== 0);
      const showDetail = showRollBreakdown || Boolean(item.result?.dropped);
      return <li key={item.id} className="dice-log-entry">
        {entrySides && (item.result && item.result.rolls.length > 1
          ? <span className="dice-log-entry__icons">{item.result.rolls.map((roll, index) => <DiceIcon key={index} sides={entrySides} value={roll} log />)}</span>
          : <DiceIcon sides={entrySides} value={item.result?.total} log />)}
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
