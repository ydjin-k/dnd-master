import { useEffect, useRef, useState } from "react";
import { useCampaign } from "../../state/CampaignContext";
import { JOURNAL_ENTRY_MAX_LENGTH } from "../journalEntryText";
import "./JournalPage.css";

/** Предел переехал в `journalEntryText.ts` и проверяется в `addJournalEntry`:
 *  раньше он был атрибутом ЭТОЙ формы, и всякий, кто писал мимо неё, его не
 *  видел. Здесь остаётся ре-экспорт, чтобы не ломать чужие импорты, и
 *  `maxLength` ниже — как подсказка глазу, а не как правило. */
export { JOURNAL_ENTRY_MAX_LENGTH } from "../journalEntryText";

/** Записей на разворот: левая страница и правая. */
export const ENTRIES_PER_SPREAD = 2;

/** Записи, переехавшие из снесённого журнала приключения, времени не имели
 *  никогда, и в них `timestamp` пуст (см. `storage::migrate_legacy_adventure_log`).
 *  `new Date("")` дал бы «Invalid Date» — вместо выдуманной даты подписываем
 *  честно. Пустая строка сортируется ниже любой настоящей даты, поэтому такие
 *  записи ложатся в конец дневника сами, без отдельного правила. */
function entryTime(timestamp: string): string {
  return timestamp ? new Date(timestamp).toLocaleString() : "без даты";
}

export function JournalPage() {
  const { state, addJournalEntry, removeJournalEntry } = useCampaign();
  const [text, setText] = useState("");
  const [spreadIndex, setSpreadIndex] = useState(0);
  const quillAudioRef = useRef<HTMLAudioElement | null>(null);
  const pageFlipAudioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * Разворот держит ДВЕ записи: левая страница и правая, по одной на каждую.
   *
   * Решение владельца 17.09.2026. Раньше было шесть — две колонки по три, —
   * и запись любого размера в такую ячейку не влезала: стили обрезали её
   * молча по `overflow: hidden`. Теперь блок это целая страница, и в него
   * помещается столько, сколько страница держит (`JOURNAL_ENTRY_MAX_LENGTH`).
   * Перелистнуть можно, когда обе страницы заняты, — то есть когда записей
   * больше двух.
   */
  const entries = [...state.journal].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const spreadCount = Math.max(1, Math.ceil(entries.length / ENTRIES_PER_SPREAD));
  const visibleEntries = entries.slice(
    spreadIndex * ENTRIES_PER_SPREAD,
    spreadIndex * ENTRIES_PER_SPREAD + ENTRIES_PER_SPREAD,
  );

  useEffect(() => {
    setSpreadIndex((current) => Math.min(current, spreadCount - 1));
  }, [spreadCount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await addJournalEntry({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      text: text.trim(),
    });
    const audio = quillAudioRef.current ?? new Audio("/audio/quill-scratch.mp3");
    quillAudioRef.current = audio;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
    setText("");
  }

  function turnPage(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= spreadCount || nextIndex === spreadIndex) return;
    setSpreadIndex(nextIndex);
    const audio = pageFlipAudioRef.current ?? new Audio("/audio/page-flip.mp3");
    pageFlipAudioRef.current = audio;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  return (
    <section className="journal-page-layout">
      <h2>Дневник путешествий</h2>

      <div className="journal-page">
        <div className="journal-page__list">
          {[visibleEntries.slice(0, 1), visibleEntries.slice(1, 2)].map((column, columnIndex) => (
            <ul className="journal-page__column" key={columnIndex}>
              {column.map((entry) => (
                <li key={entry.id} className="journal-entry">
                  <div className="journal-entry__heading">
                    <div className="journal-entry__time">{entryTime(entry.timestamp)}</div>
                    <button
                      className="journal-entry__remove"
                      type="button"
                      aria-label={`Удалить запись от ${entryTime(entry.timestamp)}`}
                      title="Удалить запись"
                      onClick={() => void removeJournalEntry(entry.id)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                  <div className="journal-entry__text">{entry.text}</div>
                </li>
              ))}
            </ul>
          ))}
          {entries.length === 0 && (
            <p className="journal-page__empty">Записей пока нет.</p>
          )}
        </div>

        {entries.length > ENTRIES_PER_SPREAD && (
          <nav className="journal-page__pagination" aria-label="Листание дневника">
            <button
              type="button"
              className="journal-page__nav journal-page__nav--prev"
              aria-label="Предыдущий разворот"
              disabled={spreadIndex === 0}
              onClick={() => turnPage(spreadIndex - 1)}
              data-own-sound
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="journal-page__nav journal-page__nav--next"
              aria-label="Следующий разворот"
              disabled={spreadIndex === spreadCount - 1}
              onClick={() => turnPage(spreadIndex + 1)}
              data-own-sound
            >
              <span aria-hidden="true">›</span>
            </button>
          </nav>
        )}
      </div>

      <div className="journal-page__page-count">
        {spreadIndex + 1} / {spreadCount}
      </div>

      <form className="journal-page__form" onSubmit={handleSubmit}>
        <textarea
          rows={2}
          maxLength={JOURNAL_ENTRY_MAX_LENGTH}
          placeholder="Что произошло?"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          aria-describedby="journal-entry-limit"
        />
        <span className="journal-page__form-hint" id="journal-entry-limit">
          До {JOURNAL_ENTRY_MAX_LENGTH} символов.
        </span>
        <button type="submit" className="dm-button--primary" data-own-sound>Записать</button>
      </form>
    </section>
  );
}
