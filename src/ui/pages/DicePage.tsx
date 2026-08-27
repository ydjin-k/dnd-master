import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RollResult } from "../../state/types";
import "./DicePage.css";

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

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
        {QUICK_DICE.map((d) => (
          <button key={d} onClick={() => roll(d)}>
            {d}
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
        {log.map((item) => (
          <li key={item.id} className="dice-log-entry">
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
          </li>
        ))}
      </ul>
    </div>
  );
}
