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
  nextTables,
  rollExpression,
  rowForRoll,
  type EventTable,
  type EventTableRow,
} from "../eventTables";
import { ScenePage } from "./ScenePage";
import { TravelPage } from "./TravelPage";
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
type View = "menu" | "generator" | "scene" | "travel";

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
function journalTextWithin({ table, roll, row }: Outcome, limit: number): string {
  const prefix = `${table.name} (d${table.die}), выпало ${roll}: `;
  const room = limit - prefix.length;
  const body = row.text.length <= room ? row.text : rowGist(row.text);
  return prefix + clampToLength(body, room);
}

export function journalTextFor(outcome: Outcome): string {
  return journalTextWithin(outcome, JOURNAL_ENTRY_MAX_LENGTH);
}

/**
 * Запись дневника для цепочки результатов — распределитель Подземья на «и то,
 * и другое» даёт их два.
 *
 * Страница дневника одна на всю цепочку, поэтому бюджет делится поровну между
 * её звеньями, а не отдаётся первому целиком: иначе второе столкновение
 * приезжало бы в дневник обрубком или не приезжало вовсе. Одно звено — тот же
 * текст, что и раньше, до символа: цепочка из одного и есть обычный бросок.
 */
export function journalTextForChain(chain: readonly Outcome[]): string {
  if (chain.length === 0) return "";
  if (chain.length === 1) return journalTextFor(chain[0]);
  const separator = "\n";
  const room = Math.floor(
    (JOURNAL_ENTRY_MAX_LENGTH - separator.length * (chain.length - 1)) / chain.length,
  );
  return chain.map((outcome) => journalTextWithin(outcome, room)).join(separator);
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
          <button
            type="button"
            className="adventures-page__entry dm-button--primary"
            onClick={() => setView("travel")}
          >
            <span className="adventures-page__entry-title">Странствие</span>
            <span className="adventures-page__entry-hint">
              Темп отряда, счётчик пути, форсированный марш, еда и вода
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

  if (view === "travel") {
    return <TravelPage onBack={() => setView("menu")} />;
  }

  return <EventGenerator onBack={() => setView("menu")} />;
}

function EventGenerator({ onBack }: { onBack: () => void }) {
  const { state, addJournalEntry, startCombat } = useCampaign();
  const [tableId, setTableId] = useState(EVENT_TABLES[0].id);
  /**
   * Цепочка выпавшего: обычная таблица даёт одно звено, распределитель
   * Подземья на «и то, и другое» — три (он сам, местность, существа). Звенья
   * показаны по отдельности и не сливаются в один результат.
   */
  const [chain, setChain] = useState<readonly Outcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  /** id записи, которую только что положили в дневник, — для подписи под ней. */
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  /** Поднят ли бой с этого броска — для подписи под кнопкой. */
  const [combatRaised, setCombatRaised] = useState(false);

  const table = findTable(tableId) ?? EVENT_TABLES[0];
  const savedNow = savedEntryId !== null && state.journal.some((e) => e.id === savedEntryId);

  async function roll() {
    if (isRolling) return;
    setIsRolling(true);
    setError(null);
    setSavedEntryId(null);
    setCombatRaised(false);
    try {
      const found: Outcome[] = [];
      // Очередь, а не рекурсия: строка может послать сразу в две таблицы, и
      // порядок звеньев на экране должен повторять порядок в строке. Круга
      // здесь быть не может — его стережёт проба на ссылки между таблицами.
      const pending: EventTable[] = [table];
      while (pending.length > 0) {
        const next = pending.shift()!;
        const result = await invoke<RollResult>("roll_dice", {
          expression: rollExpression(next),
        });
        const row = rowForRoll(next, result.total);
        if (!row) {
          // Дыру в диапазонах стережёт проба на покрытие кости; если она всё же
          // добралась до игрока — честнее сказать, чем показать пустоту.
          setError(`Таблица «${next.name}» не покрывает число ${result.total}`);
          setChain([]);
          return;
        }
        found.push({ table: next, roll: result.total, row });
        pending.push(...nextTables(row));
      }
      setChain(found);
      playDiceRollSound();
    } catch (e) {
      setError(String(e));
      setChain([]);
    } finally {
      setIsRolling(false);
    }
  }

  /** Записывает только по нажатию: неудачный бросок игрок перебрасывает, не
   *  засоряя историю кампании. Автоматически не пишется ничего. */
  async function saveToJournal() {
    if (chain.length === 0) return;
    const id = crypto.randomUUID();
    await addJournalEntry({
      id,
      timestamp: new Date().toISOString(),
      text: journalTextForChain(chain),
    });
    setSavedEntryId(id);
  }

  /**
   * Поднимает бой прямо со строки — то, ради чего у строк вообще есть
   * `monsterIds`. Противники берутся у строки и только у неё: выдумывать за
   * таблицу, кто ещё вышел из темноты, приложение не вправе. Со стороны отряда
   * выходят все персонажи кампании — кого оставить в стороне, решают за столом,
   * состав боя правится на вкладке «Бой».
   */
  async function raiseCombat(monsterIds: readonly string[]) {
    setError(null);
    try {
      await startCombat([...monsterIds], state.characters.map((c) => c.id));
      setCombatRaised(true);
    } catch (e) {
      setError(String(e));
    }
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
              setChain([]);
              setError(null);
              setSavedEntryId(null);
              setCombatRaised(false);
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

        {chain.map((outcome, index) => (
          <article className="adventures-page__outcome" key={`${outcome.table.id}-${index}`}>
            <p className="adventures-page__outcome-roll">
              <span className="adventures-page__outcome-number">{outcome.roll}</span>
              <span className="adventures-page__outcome-of">из d{outcome.table.die}</span>
              {/* Имя таблицы у первого звена уже стоит в подписи выбора; у
                  остальных без него не понять, что именно бросили. */}
              {index > 0 && (
                <span className="adventures-page__outcome-table">{outcome.table.name}</span>
              )}
            </p>
            <p className="adventures-page__outcome-text">{outcome.row.text}</p>
            {outcome.row.monsterIds && outcome.row.monsterIds.length > 0 && (
              <button
                type="button"
                className="adventures-page__fight"
                disabled={state.characters.length === 0}
                onClick={() => raiseCombat(outcome.row.monsterIds!)}
              >
                Поднять бой
              </button>
            )}
          </article>
        ))}

        {chain.length > 0 && (
          <div className="adventures-page__outcome-actions">
            <button type="button" className="adventures-page__save" onClick={saveToJournal}>
              В дневник
            </button>
            {savedNow && <span className="adventures-page__saved">Записано в дневник</span>}
            {combatRaised && (
              <span className="adventures-page__fight-started">
                Бой начат — откройте вкладку «Бой»
              </span>
            )}
            {state.characters.length === 0 &&
              chain.some((o) => (o.row.monsterIds?.length ?? 0) > 0) && (
                <span className="adventures-page__fight-hint">
                  Бой поднимать некем: добавьте персонажей на вкладке «Персонажи».
                </span>
              )}
          </div>
        )}

        {table.sourceNote && <p className="adventures-page__source">{table.sourceNote}</p>}
      </div>
    </section>
  );
}
