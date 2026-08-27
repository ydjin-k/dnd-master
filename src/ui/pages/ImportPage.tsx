import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import "./ImportPage.css";

export function ImportPage() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickFile() {
    const path = await open({
      multiple: false,
      filters: [
        { name: "Лист персонажа", extensions: ["pdf", "docx", "txt", "png", "jpg", "jpeg", "bmp", "webp"] },
      ],
    });
    if (!path || Array.isArray(path)) return;

    setLoading(true);
    setError(null);
    setFileName(path.split(/[\\/]/).pop() ?? path);
    try {
      const extracted = await invoke<string>("import_character_sheet", { path });
      setText(extracted);
    } catch (e) {
      setError(String(e));
      setText("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="import-page">
      <h2>Импорт листа персонажа</h2>
      <p className="import-page__hint">
        PDF, DOCX, TXT — читаются напрямую. Фото — офлайн-распознавание текста (надёжно на
        печатном тексте, ненадёжно на рукописном). Автоматического заполнения полей персонажа
        пока нет — распознанный текст нужно перенести на вкладку «Персонажи» руками.
      </p>

      <button onClick={pickFile} disabled={loading}>
        {loading ? "Распознаю…" : "Выбрать файл"}
      </button>

      {fileName && !loading && <p className="import-page__filename">{fileName}</p>}
      {error && <p className="import-page__error">Не удалось: {error}</p>}

      {text && (
        <textarea
          className="import-page__text"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          rows={16}
        />
      )}
    </div>
  );
}
