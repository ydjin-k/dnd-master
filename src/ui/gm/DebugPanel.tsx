import { useState } from "react";
import { useCampaign } from "../../state/CampaignContext";
import "./DebugPanel.css";

/**
 * Отладочный режим §38 — единственный способ проверить арифметику Оракула.
 *
 * **Экран ничего не вычисляет и ничего не восстанавливает.** Он показывает то,
 * что положил в `trace` решавший модуль, строка за строкой и в том же порядке.
 * Восстановление причины на стороне показа — ровно тот дефект, который на
 * пилоте назвал 29 мирных объектов из 51 «сюда пути нет», то есть соврал
 * игроку. Поэтому здесь нет ни одной арифметической операции над числами
 * движка: ни сложения модификатора, ни сравнения броска с вероятностью.
 *
 * Отсюда же и главная строка §6.3 — «ответ из факта, бросок не выполнялся»:
 * её пишет Оракул, а не угадывает экран по пустому списку бросков.
 *
 * `trace` в состоянии НЕ хранится (ADR раздел 3): он живёт один ответ. Владелец
 * последнего ответа один — провайдер кампании, туда он и приходит из `invoke`.
 * История решений §23 — это лог приключения и History Log, у них свои
 * владельцы, и сюда они не заглядывают.
 *
 * Своего `useState` на данные движка здесь нет: сид и число обращений читаются
 * из `state.engine`. Локальное состояние одно — видимость самой отладки, а это
 * не данные движка, а предпочтение смотрящего.
 */
export function DebugPanel() {
  const { state, lastResult } = useCampaign();
  const [shown, setShown] = useState(false);
  const engine = state.engine;

  return (
    <div className="debug-panel" data-panel="debug">
      <label className="debug-panel__toggle">
        <input
          type="checkbox"
          checked={shown}
          onChange={(e) => setShown(e.currentTarget.checked)}
        />
        Отладка движка (§38)
      </label>

      {shown && (
        <div className="debug-panel__body">
          <dl className="debug-panel__state">
            <dt>Сид кампании</dt>
            <dd data-field="seed">{engine?.seed ?? "—"}</dd>
            <dt>Обращений к ГСЧ</dt>
            <dd data-field="rngDraws">{engine?.rngDraws ?? "—"}</dd>
            <dt>Ход</dt>
            <dd data-field="turn">{engine?.turn ?? "—"}</dd>
          </dl>

          {lastResult === null ? (
            <p className="dm-hint">
              Движок в этой сессии ещё не отвечал — трассировке взяться неоткуда.
            </p>
          ) : (
            <>
              <p className="debug-panel__action">
                Действие → <span data-field="resultType">{lastResult.resultType}</span>
              </p>
              <ol className="debug-panel__trace">
                {lastResult.trace.map((line, at) => (
                  // Ключ по номеру строки: строки трассировки не переставляются
                  // и не удаляются — это неизменяемый список одного ответа.
                  <li key={at}>{line}</li>
                ))}
              </ol>
              <div className="debug-panel__rolls">
                Броски:{" "}
                {lastResult.rolls.length === 0 ? (
                  <span data-field="rolls">нет</span>
                ) : (
                  <ul>
                    {lastResult.rolls.map((roll, at) => (
                      <li key={at}>
                        {roll.die} → {roll.value}
                        {roll.target === null ? "" : ` (порог ${roll.target})`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
