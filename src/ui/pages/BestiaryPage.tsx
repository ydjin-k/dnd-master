import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AbilityScores, MonsterTemplate } from "../../state/types";
import { ABILITY_LABELS, abilityMod, fmtMod } from "../characterCreationData";
import { EmphasizedText } from "../EmphasizedText";
import "./BestiaryPage.css";

// Русские подписи характеристик и счёт модификатора берутся у листа персонажа
// (characterCreationData), а не пишутся здесь заново: подпись «Ловкость» и
// формула (score - 10) / 2 — один факт на всё приложение.
const ABILITY_LABEL: Record<keyof AbilityScores, string> = Object.fromEntries(
  ABILITY_LABELS,
) as Record<keyof AbilityScores, string>;

/**
 * Строки шапки стат-блока, которых у существа может не быть.
 *
 * Собираются списком, а не десятком условий прямо в разметке, ради одного
 * правила на все: поле, которого у существа нет, не даёт СТРОКИ вовсе. Пустая
 * клетка на месте иммунитетов волка читалась бы как потерянные данные —
 * карточка `bestiary-record-full-stat-block` требует ровно обратного.
 */
function optionalStatRows(m: MonsterTemplate): [string, string][] {
  const rows: [string, string][] = [];
  const add = (label: string, value: string | null) => {
    if (value) rows.push([label, value]);
  };
  const list = (items: string[] | undefined) => (items?.length ? items.join(", ") : null);

  add(
    "Спасброски",
    list(m.savingThrows?.map((s) => `${ABILITY_LABEL[s.ability]} ${fmtMod(s.bonus)}`)),
  );
  add("Навыки", list(m.skills?.map((s) => `${s.skill} ${fmtMod(s.bonus)}`)));
  add("Уязвимость к урону", list(m.damageVulnerabilities));
  add("Сопротивление урону", list(m.damageResistances));
  add("Иммунитет к урону", list(m.damageImmunities));
  add("Иммунитет к состояниям", list(m.conditionImmunities));
  add("Чувства", list(m.senses?.map((s) => `${s.name} ${s.rangeFeet} футов`)));
  add("Языки", list(m.languages));
  return rows;
}

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

// Отступ вокруг видимой области списка, на который IntersectionObserver
// считает строку «достаточно близкой» и начинает грузить превью заранее —
// заметно меньше рывка при прокрутке, не наказывает при этом масштаб (300
// тварей всё равно не загружаются все разом, только видимые + запас).
const LIST_PREFETCH_MARGIN = "300px 0px";

export function BestiaryPage() {
  const [monsters, setMonsters] = useState<MonsterTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listImages, setListImages] = useState<Record<string, string>>({});
  const [detailImages, setDetailImages] = useState<Record<string, string>>({});

  const listRef = useRef<HTMLUListElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  // Кто уже запрошен — на ref, не на state: список из 200-300 тварей не должен
  // пересобирать IntersectionObserver и заново обходить все строки на каждую
  // догрузившуюся картинку.
  const requestedListImagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    invoke<MonsterTemplate[]>("get_bestiary")
      .then((loaded) => {
        setMonsters(loaded);
        if (loaded.length > 0) setSelectedId(loaded[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const query = search.trim().toLowerCase();
  // useMemo — не только для скорости сортировки: держит стабильную ссылку
  // между рендерами, вызванными приходом очередной картинки, чтобы эффект
  // IntersectionObserver ниже не пересоздавал наблюдатель на каждое такое
  // обновление state (при 200-300 тварях это давало бы квадратичную работу).
  const visible = useMemo(
    () =>
      (query ? monsters.filter((m) => m.name.toLowerCase().includes(query)) : monsters)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [monsters, query],
  );

  // Мелкие превью для списка — только для строк, реально видимых (+ запас
  // LIST_PREFETCH_MARGIN), не для всех тварей сразу по монтированию. При 50
  // тварях разница не критична, но при 200-300 (см. карточку
  // bestiary-thumbnail-loading-at-scale) запрос всех сразу пере-нагружал бы
  // бэкенд даже с дисковым кэшем и семафором — часть работы вообще не нужно
  // делать, если строка не на экране.
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;

    const requestListImage = (monster: MonsterTemplate) => {
      const asset = monster.imageAsset;
      if (!asset || requestedListImagesRef.current.has(asset)) return;
      requestedListImagesRef.current.add(asset);
      invoke<string>("get_bestiary_image", { imageAsset: asset, maxSize: LIST_THUMB_SIZE })
        .then((data) => setListImages((current) => ({ ...current, [asset]: data })))
        .catch(() => undefined);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const id = (entry.target as HTMLElement).dataset.monsterId;
          const monster = visible.find((m) => m.id === id);
          if (monster) requestListImage(monster);
        }
      },
      { root, rootMargin: LIST_PREFETCH_MARGIN },
    );

    for (const [id, el] of rowRefs.current) {
      if (visible.some((m) => m.id === id)) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [visible]);

  // Крупная картинка — только для выбранной твари, по требованию, не для
  // всех тварей сразу.
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

  const selected = monsters.find((m) => m.id === selectedId);

  return (
    <div className="bestiary-page">
      <nav className="bestiary-page__nav">
        <input
          type="text"
          className="bestiary-page__search dm-field--search"
          placeholder="Поиск по бестиарию..."
          aria-label="Поиск по бестиарию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {error && <p className="bestiary-page__error">Не удалось загрузить бестиарий: {error}</p>}

        <ul className="bestiary-page__list" ref={listRef}>
          {visible.map((m) => (
            <li
              key={m.id}
              data-monster-id={m.id}
              ref={(el) => {
                if (el) rowRefs.current.set(m.id, el);
                else rowRefs.current.delete(m.id);
              }}
            >
              <button
                className={
                  "bestiary-page__list-item dm-list-row" +
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
                <span className="bestiary-page__list-cr dm-chip">СЛ {m.challengeRating}</span>
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
            </dl>

            <dl className="bestiary-statblock__abilities">
              {ABILITY_LABELS.map(([key, label]) => (
                <div key={key} className="bestiary-statblock__ability">
                  <dt>{label}</dt>
                  <dd>
                    {selected.abilities[key]} ({fmtMod(abilityMod(selected.abilities[key]))})
                  </dd>
                </div>
              ))}
            </dl>

            <dl className="bestiary-statblock__stats">
              {optionalStatRows(selected).map(([label, value]) => (
                <Fragment key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </Fragment>
              ))}
              <dt>Пассивная внимательность</dt>
              <dd>{selected.passivePerception}</dd>
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

            {selected.reactions && selected.reactions.length > 0 && (
              <section>
                <h3>Реакции</h3>
                {selected.reactions.map((r, i) => (
                  <p key={i}><EmphasizedText>{r}</EmphasizedText></p>
                ))}
              </section>
            )}

            {selected.legendaryActions && selected.legendaryActions.length > 0 && (
              <section>
                <h3>Легендарные действия</h3>
                {selected.legendaryActions.map((a, i) => (
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
