import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { playDiceRollSound } from "../../audio/uiSounds";
import type { RollResult } from "../../state/types";
import { DiceIcon, dieSidesFromExpression, type DieSides } from "../DiceIcon";
import "./DicePage.css";

const QUICK_DICE: { label: string; sides: DieSides }[] = [4, 6, 8, 10, 12, 20, 100].map((sides) => ({ label: `d${sides}`, sides: sides as DieSides }));

interface LogItem {
  id: string;
  label: string;
  result?: RollResult;
  error?: string;
  manual?: number;
}

export function DicePage() {
  const [expression, setExpression] = useState("d20");
  const [manualValue, setManualValue] = useState("");
  const [log, setLog] = useState<LogItem[]>([]);

  async function roll(expr: string) {
    try {
      const result = await invoke<RollResult>("roll_dice", { expression: expr });
      playDiceRollSound();
      setLog((prev) => [{ id: crypto.randomUUID(), label: expr, result }, ...prev]);
    } catch (e) {
      setLog((prev) => [{ id: crypto.randomUUID(), label: expr, error: String(e) }, ...prev]);
    }
  }

  function recordManual(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(manualValue);
    if (!Number.isFinite(value)) return;
    setLog((prev) => [
      { id: crypto.randomUUID(), label: "вручную", manual: value },
      ...prev,
    ]);
    setManualValue("");
  }

  return (
    <div className="dice-page">
      <h2>Кубики</h2>

      <div className="dice-page__quick">
        {QUICK_DICE.map((die) => (
          <button key={die.label} onClick={() => roll(die.label)}>
            <DiceIcon sides={die.sides} compact />
            <span>{die.label}</span>
          </button>
        ))}
      </div>

      <div className="dice-page__expression">
        <input
          value={expression}
          onChange={(e) => setExpression(e.currentTarget.value)}
          placeholder="например 2d6+3 или d20adv"
        />
        <button onClick={() => roll(expression)}>Бросить</button>
      </div>

      <form className="dice-page__manual" onSubmit={recordManual}>
        <input
          type="number"
          value={manualValue}
          onChange={(e) => setManualValue(e.currentTarget.value)}
          placeholder="результат броска в реальности"
        />
        <button type="submit">Записать вручную</button>
      </form>

      <ul className="dice-page__log">
        {log.map((item) => {
          const sides = item.result ? dieSidesFromExpression(item.label) : null;
          return <li key={item.id} className="dice-log-entry">
            {sides && <DiceIcon sides={sides} value={item.result?.total} />}
            <span className="dice-log-entry__expr">{item.label}</span>
            {item.result && (
              <>
                <span className="dice-log-entry__total">{item.result.total}</span>
                <span className="dice-log-entry__detail">
                  [{item.result.rolls.join(", ")}]
                  {item.result.modifier !== 0 &&
                    (item.result.modifier > 0
                      ? ` +${item.result.modifier}`
                      : ` ${item.result.modifier}`)}
                  {item.result.dropped && ` (отброшено: ${item.result.dropped.join(", ")})`}
                </span>
              </>
            )}
            {item.manual !== undefined && (
              <span className="dice-log-entry__total">{item.manual}</span>
            )}
            {item.error && <span className="dice-log-entry__error">{item.error}</span>}
          </li>;
        })}
      </ul>
    </div>
  );
}
