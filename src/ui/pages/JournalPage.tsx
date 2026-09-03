import { useEffect, useRef, useState } from "react";
import { useCampaign } from "../../state/CampaignContext";
import "./JournalPage.css";

export const JOURNAL_ENTRY_MAX_LENGTH = 200;

export function JournalPage() {
  const { state, addJournalEntry, removeJournalEntry } = useCampaign();
  const [text, setText] = useState("");
  const [spreadIndex, setSpreadIndex] = useState(0);
  const quillAudioRef = useRef<HTMLAudioElement | null>(null);
  const pageFlipAudioRef = useRef<HTMLAudioElement | null>(null);

  const entries = [...state.journal].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const spreadCount = Math.max(1, Math.ceil(entries.length / 6));
  const visibleEntries = entries.slice(spreadIndex * 6, spreadIndex * 6 + 6);

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
    setSpreadIndex(0);
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
          {[visibleEntries.slice(0, 3), visibleEntries.slice(3, 6)].map((column, columnIndex) => (
            <ul className="journal-page__column" key={columnIndex}>
              {column.map((entry) => (
                <li key={entry.id} className="journal-entry">
                  <div className="journal-entry__heading">
                    <div className="journal-entry__time">
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                    <button
                      className="journal-entry__remove"
                      type="button"
                      aria-label={`Удалить запись от ${new Date(entry.timestamp).toLocaleString()}`}
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

        {entries.length >= 6 && (
          <nav className="journal-page__pagination" aria-label="Листание дневника">
            <button
              type="button"
              aria-label="Предыдущий разворот"
              disabled={spreadIndex === 0}
              onClick={() => turnPage(spreadIndex - 1)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <span>{spreadIndex + 1} / {spreadCount}</span>
            <button
              type="button"
              aria-label="Следующий разворот"
              disabled={spreadIndex === spreadCount - 1}
              onClick={() => turnPage(spreadIndex + 1)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </nav>
        )}
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
        <button type="submit">Записать</button>
      </form>
    </section>
  );
}
