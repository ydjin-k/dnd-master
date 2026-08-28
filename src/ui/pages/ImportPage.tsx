import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import { emptyAbilityScores, type Character } from "../../state/types";
import "./ImportPage.css";

function firstLine(text: string): string {
  return text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}

export function ImportPage() {
  const { addCharacter } = useCampaign();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    setFileName(path.split(/[\\/]/).pop() ?? path);
    try {
      const extracted = await invoke<string>("import_character_sheet", { path });
      setText(extracted);
      setCharacterName(firstLine(extracted).slice(0, 60));
    } catch (e) {
      setError(String(e));
      setText("");
    } finally {
      setLoading(false);
    }
  }

  async function saveAsCharacter() {
    const character: Character = {
      id: crypto.randomUUID(),
      name: characterName.trim() || "Импортированный персонаж",
      race: "",
      class: "",
      background: "",
      alignment: "Нейтральный",
      gender: "Мужской",
      age: 30,
      languages: [],
      level: 1,
      abilities: emptyAbilityScores(),
      maxHp: 10,
      currentHp: 10,
      armorClass: 10,
      speedFeet: 30,
      initiative: 0,
      passivePerception: 10,
      conditions: [],
      inventory: [
        {
          id: crypto.randomUUID(),
          name: "Импортированный текст листа персонажа",
          quantity: 1,
          notes: text,
        },
      ],
      gold: 0,
      savingThrowProficiencies: [],
      skillProficiencies: [],
    };
    await addCharacter(character);
    setSaved(true);
  }

  return (
    <div className="import-page">
      <h2>Импорт листа персонажа</h2>
      <p className="import-page__hint">
        PDF, DOCX, TXT — читаются напрямую. Фото — офлайн-распознавание текста (надёжно на
        печатном тексте, ненадёжно на рукописном). Автоматического разбора по полям (раса, класс,
        характеристики) пока нет — распознанный текст целиком попадёт в инвентарь персонажа,
        остальные поля правишь во вкладке «Персонажи» руками.
      </p>

      <button onClick={pickFile} disabled={loading}>
        {loading ? "Распознаю…" : "Выбрать файл"}
      </button>

      {fileName && !loading && <p className="import-page__filename">{fileName}</p>}
      {error && <p className="import-page__error">Не удалось: {error}</p>}

      {text && (
        <>
          <textarea
            className="import-page__text"
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value);
              setSaved(false);
            }}
            rows={16}
          />
          <div className="import-page__save-row">
            <input
              placeholder="Имя персонажа"
              value={characterName}
              onChange={(e) => {
                setCharacterName(e.currentTarget.value);
                setSaved(false);
              }}
            />
            <button onClick={saveAsCharacter}>Сохранить как персонажа</button>
          </div>
          {saved && (
            <p className="import-page__saved">
              Сохранено как «{characterName.trim() || "Импортированный персонаж"}» — открой вкладку
              «Персонажи», чтобы дозаполнить остальное.
            </p>
          )}
        </>
      )}
    </div>
  );
}
