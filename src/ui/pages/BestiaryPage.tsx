import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MonsterTemplate } from "../../state/types";
import { EmphasizedText } from "../EmphasizedText";
import "./BestiaryPage.css";

function MonsterThumb({ monster, className }: { monster: MonsterTemplate; className: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(null);
    if (!monster.imageAsset) return;
    let cancelled = false;
    invoke<string>("get_bestiary_image", { imageAsset: monster.imageAsset })
      .then((data) => {
        if (!cancelled) setSrc(data);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [monster.imageAsset]);

  if (!src) {
    return <div className={`${className} bestiary-thumb--empty`} aria-hidden="true" />;
  }
  return <img className={className} src={src} alt={monster.name} />;
}

export function BestiaryPage() {
  const [monsters, setMonsters] = useState<MonsterTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    invoke<MonsterTemplate[]>("get_bestiary")
      .then((loaded) => {
        setMonsters(loaded);
        if (loaded.length > 0) setSelectedId(loaded[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const query = search.trim().toLowerCase();
  const visible = (query ? monsters.filter((m) => m.name.toLowerCase().includes(query)) : monsters)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const selected = monsters.find((m) => m.id === selectedId);

  return (
    <div className="bestiary-page">
      <nav className="bestiary-page__nav">
        <input
          type="text"
          className="bestiary-page__search"
          placeholder="Поиск по бестиарию..."
          aria-label="Поиск по бестиарию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {error && <p className="bestiary-page__error">Не удалось загрузить бестиарий: {error}</p>}

        <ul className="bestiary-page__list">
          {visible.map((m) => (
            <li key={m.id}>
              <button
                className={
                  "bestiary-page__list-item" +
                  (m.id === selectedId ? " bestiary-page__list-item--active" : "")
                }
                onClick={() => setSelectedId(m.id)}
              >
                <MonsterThumb monster={m} className="bestiary-thumb bestiary-thumb--list" />
                <span className="bestiary-page__list-name">{m.name}</span>
                <span className="bestiary-page__list-cr">СЛ {m.challengeRating}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 && !error && <p className="bestiary-page__empty">Никого не нашлось.</p>}
        </ul>
      </nav>

      <div className="bestiary-page__content">
        {selected && (
          <article className="bestiary-statblock">
            <MonsterThumb monster={selected} className="bestiary-thumb bestiary-thumb--detail" />
            <h2 className="bestiary-statblock__name">{selected.name}</h2>
            <p className="bestiary-statblock__subtitle">
              {selected.size} {selected.creatureType}
            </p>
            {selected.description && <p className="bestiary-statblock__description">{selected.description}</p>}

            <dl className="bestiary-statblock__stats">
              <dt>Класс доспеха</dt>
              <dd>{selected.armorClass}</dd>
              <dt>Хиты</dt>
              <dd>{selected.maxHp}</dd>
              <dt>Скорость</dt>
              <dd>{selected.speedFeet} футов</dd>
              <dt>Опасность</dt>
              <dd>{selected.challengeRating}</dd>
            </dl>

            {selected.traits.length > 0 && (
              <section>
                <h3>Особые свойства</h3>
                {selected.traits.map((t, i) => (
                  <p key={i}><EmphasizedText>{t}</EmphasizedText></p>
                ))}
              </section>
            )}

            {selected.actions.length > 0 && (
              <section>
                <h3>Действия</h3>
                {selected.actions.map((a, i) => (
                  <p key={i}><EmphasizedText>{a}</EmphasizedText></p>
                ))}
              </section>
            )}

            {selected.imageAttribution && (
              <footer className="bestiary-statblock__attribution">
                Изображение: {selected.imageAttribution}
              </footer>
            )}
          </article>
        )}

        <footer className="bestiary-page__attribution">
          Стат-блоки — перевод официального System Reference Document 5.1 от Wizards of the Coast,
          распространяются по лицензии CC BY 4.0.
        </footer>
      </div>
    </div>
  );
}
