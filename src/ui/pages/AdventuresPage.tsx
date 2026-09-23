import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { playDiceRollSound } from "../../audio/uiSounds";
import { useCampaign } from "../../state/CampaignContext";
import { JOURNAL_ENTRY_MAX_LENGTH, clampToLength, rowGist } from "../journalEntryText";
import type { RollResult } from "../../state/types";
import {
  EVENT_TABLES,
  TABLE_GROUPS,
  findTable,
  rollExpression,
  rowForRoll,
  type EventTable,
  type EventTableRow,
} from "../eventTables";
import { ScenePage } from "./ScenePage";
import "./AdventuresPage.css";

/**
 * Раздел приключений из двух входов: «Вести сцену» (движок мастера, ADR 0001)
 * и «Сгенерировать события» (таблицы к100). Первый вход был оставлен
 * раскладкой и появился здесь вместе с ядром движка.
 *
 * Два входа — не два владельца: таблицы к100 дают описательную строку, которую
 * мастер читает за столом, движок — решение с машинными последствиями. Сливать
 * их нельзя (ADR раздел 9, пункт 14).
 */
type View = "menu" | "generator" | "scene";

/** Что показано игроку после броска. Держится до следующего броска. */
interface Outcome {
  table: EventTable;
  roll: number;
  row: EventTableRow;
}

/**
 * Текст записи дневника. Рождается здесь и только здесь: и кнопка «В дневник»,
 * и проба берут его отсюда, поэтому формат не разъезжается между ними.
 * Бросок в записи назван числом — за столом важно, что выпало, а не что
 * приложение показало.
 *
 * В дневник едет строка ЦЕЛИКОМ, а не её обрывок. Так стало можно после
 * того, как владелец 17.09.2026 переделал дневник: блок теперь не ячейка на
 * шесть записей в развороте, а целая страница, и строка в неё помещается —
 * у столкновений местности это 310-573 символа при страничном пределе 550.
 *
 * Обрезка остаётся только для того, что на страницу не влезет никогда:
 * зацепки приключений доходят до 3043 символов. Там берётся суть — заголовок
 * строки, если он есть, иначе первое предложение, — и если и она длиннее
 * страницы, режется по границе слова с многоточием. Многоточие обязательно:
 * молчаливое обрезание стилями было тем самым дефектом, который здесь чинят.
 */
export function journalTextFor({ table, roll, row }: Outcome): string {
  const prefix = `${table.name} (d${table.die}), выпало ${roll}: `;
  const room = JOURNAL_ENTRY_MAX_LENGTH - prefix.length;
  const body = row.text.length <= room ? row.text : rowGist(row.text);
  return prefix + clampToLength(body, room);
}

export function AdventuresPage() {
  const [view, setView] = useState<View>("menu");

  if (view === "menu") {
    return (
      <section className="adventures-page">
        <h2>Приключения</h2>
        <div className="adventures-page__entries">
          <button
            type="button"
            className="adventures-page__entry dm-button--primary"
            onClick={() => setView("scene")}
          >
            <span className="adventures-page__entry-title">Вести сцену</span>
            <span className="adventures-page__entry-hint">
              Место, цель и напряжение сцены, лог приключения
            </span>
          </button>
          <button
            type="button"
            className="adventures-page__entry dm-button--primary"
            onClick={() => setView("generator")}
          >
            <span className="adventures-page__entry-title">Сгенерировать события</span>
            <span className="adventures-page__entry-hint">
              Выберите таблицу — приложение бросит её кость и покажет выпавшее
            </span>
          </button>
        </div>
      </section>
    );
  }

  if (view === "scene") {
    return (
      <section className="adventures-page">
        <button type="button" onClick={() => setView("menu")}>
          ← К приключениям
        </button>
        <ScenePage />
      </section>
    );
  }

  return <EventGenerator onBack={() => setView("menu")} />;
}

function EventGenerator({ onBack }: { onBack: () => void }) {
  const { state, addJournalEntry } = useCampaign();
  const [tableId, setTableId] = useState(EVENT_TABLES[0].id);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  /** id записи, которую только что положили в дневник, — для подписи под ней. */
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);

  const table = findTable(tableId) ?? EVENT_TABLES[0];
  const savedNow = savedEntryId !== null && state.journal.some((e) => e.id === savedEntryId);

  async function roll() {
    if (isRolling) return;
    setIsRolling(true);
    setError(null);
    setSavedEntryId(null);
    const expression = rollExpression(table);
    try {
      const result = await invoke<RollResult>("roll_dice", { expression });
      const row = rowForRoll(table, result.total);
      if (!row) {
        // Дыру в диапазонах стережёт проба на покрытие кости; если она всё же
        // добралась до игрока — честнее сказать, чем показать пустоту.
        setError(`Таблица «${table.name}» не покрывает число ${result.total}`);
        setOutcome(null);
      } else {
        setOutcome({ table, roll: result.total, row });
      }
      playDiceRollSound();
    } catch (e) {
      setError(String(e));
      setOutcome(null);
    } finally {
      setIsRolling(false);
    }
  }

  /** Записывает только по нажатию: неудачный бросок игрок перебрасывает, не
   *  засоряя историю кампании. Автоматически не пишется ничего. */
  async function saveToJournal() {
    if (!outcome) return;
    const id = crypto.randomUUID();
    await addJournalEntry({
      id,
      timestamp: new Date().toISOString(),
      text: journalTextFor(outcome),
    });
    setSavedEntryId(id);
  }

  return (
    <section className="adventures-page">
      <div className="adventures-page__head">
        <button type="button" className="adventures-page__back" onClick={onBack}>
          ← Приключения
        </button>
        <h2>Генератор событий</h2>
      </div>

      <div className="adventures-page__generator">
        <label className="adventures-page__picker">
          Таблица
          <select
            aria-label="Таблица событий"
            value={tableId}
            onChange={(e) => {
              setTableId(e.currentTarget.value);
              setOutcome(null);
              setError(null);
              setSavedEntryId(null);
            }}
          >
            {TABLE_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {EVENT_TABLES.filter((t) => t.group === group).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (d{t.die})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <p className="adventures-page__die">
          Кость таблицы: <strong>d{table.die}</strong>, строк: {table.rows.length}
        </p>

        <button
          type="button"
          className="adventures-page__roll dm-button--primary"
          onClick={roll}
          disabled={isRolling}
        >
          Бросить
        </button>

        {error && <p className="adventures-page__error">{error}</p>}

        {outcome && (
          <article className="adventures-page__outcome">
            <p className="adventures-page__outcome-roll">
              <span className="adventures-page__outcome-number">{outcome.roll}</span>
              <span className="adventures-page__outcome-of">из d{outcome.table.die}</span>
            </p>
            <p className="adventures-page__outcome-text">{outcome.row.text}</p>
            <button type="button" className="adventures-page__save" onClick={saveToJournal}>
              В дневник
            </button>
            {savedNow && <span className="adventures-page__saved">Записано в дневник</span>}
          </article>
        )}

        {table.sourceNote && <p className="adventures-page__source">{table.sourceNote}</p>}
      </div>
    </section>
  );
}
