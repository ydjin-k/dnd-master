import { useState } from "react";
import { useCampaign } from "../../state/CampaignContext";
import "./JournalPage.css";

export function JournalPage() {
  const { state, addJournalEntry } = useCampaign();
  const [text, setText] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await addJournalEntry({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      text: text.trim(),
    });
    setText("");
  }

  const entries = [...state.journal].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div className="journal-page">
      <h2>Дневник путешествий</h2>

      <ul className="journal-page__list">
        {entries.map((entry) => (
          <li key={entry.id} className="journal-entry">
            <div className="journal-entry__time">
              {new Date(entry.timestamp).toLocaleString()}
            </div>
            <div className="journal-entry__text">{entry.text}</div>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="journal-page__empty">Записей пока нет.</li>
        )}
      </ul>

      <form className="journal-page__form" onSubmit={handleSubmit}>
        <textarea
          rows={3}
          placeholder="Что произошло?"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        <button type="submit">Записать</button>
      </form>
    </div>
  );
}
