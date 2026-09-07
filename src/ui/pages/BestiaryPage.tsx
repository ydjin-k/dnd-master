import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MonsterTemplate } from "../../state/types";
import { EmphasizedText } from "../EmphasizedText";
import "./BestiaryPage.css";

function MonsterThumb({
  monster,
  className,
  src,
}: {
  monster: MonsterTemplate;
  className: string;
  src: string | null;
}) {
  if (!src) {
    return <div className={`${className} bestiary-thumb--empty`} aria-hidden="true" />;
  }
  return <img className={className} src={src} alt={monster.name} />;
}

// Длинная сторона превью в пикселях, отдаваемых Rust-стороной (`get_bestiary_image`,
// см. combat::load_bestiary_image) — сильно меньше оригиналов (~1122×1402px),
// байты по IPC вместо ~183 МБ на все 50 тварей одновременно.
const LIST_THUMB_SIZE = 160;
const DETAIL_THUMB_SIZE = 480;

export function BestiaryPage() {
  const [monsters, setMonsters] = useState<MonsterTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listImages, setListImages] = useState<Record<string, string>>({});
  const [detailImages, setDetailImages] = useState<Record<string, string>>({});

  useEffect(() => {
    invoke<MonsterTemplate[]>("get_bestiary")
      .then((loaded) => {
        setMonsters(loaded);
        if (loaded.length > 0) setSelectedId(loaded[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Мелкие превью для списка — нужны для всех тварей сразу, но каждая на
  // порядки легче оригинала, так что параллельная загрузка всех больше не
  // подвешивает вкладку.
  useEffect(() => {
    let cancelled = false;

    for (const monster of monsters) {
      if (!monster.imageAsset || listImages[monster.imageAsset]) continue;
      invoke<string>("get_bestiary_image", {
        imageAsset: monster.imageAsset,
        maxSize: LIST_THUMB_SIZE,
      })
        .then((data) => {
          if (!cancelled) {
            setListImages((current) => ({ ...current, [monster.imageAsset!]: data }));
          }
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [monsters]);

  // Крупная картинка — только для выбранной твари, по требованию, не для
  // всех 50 сразу.
  useEffect(() => {
    let cancelled = false;
    const monster = monsters.find((m) => m.id === selectedId);
    if (!monster?.imageAsset || detailImages[monster.imageAsset]) return;

    invoke<string>("get_bestiary_image", {
      imageAsset: monster.imageAsset,
      maxSize: DETAIL_THUMB_SIZE,
    })
      .then((data) => {
        if (!cancelled) {
          setDetailImages((current) => ({ ...current, [monster.imageAsset!]: data }));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedId, monsters]);

  const listImageFor = (monster: MonsterTemplate) =>
    monster.imageAsset ? listImages[monster.imageAsset] ?? null : null;
  const detailImageFor = (monster: MonsterTemplate) =>
    monster.imageAsset ? detailImages[monster.imageAsset] ?? null : null;

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
                <MonsterThumb
                  monster={m}
                  className="bestiary-thumb bestiary-thumb--list"
                  src={listImageFor(m)}
                />
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
            <MonsterThumb
              monster={selected}
              className="bestiary-thumb bestiary-thumb--detail"
              src={detailImageFor(selected)}
            />
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
