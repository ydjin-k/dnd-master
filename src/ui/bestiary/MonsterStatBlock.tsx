import { Fragment, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AbilityScores, MonsterOrigin, MonsterTemplate } from "../../state/types";
import { ABILITY_LABELS, abilityMod, fmtMod } from "../characterCreationData";
import { EmphasizedText } from "../EmphasizedText";
import "./MonsterStatBlock.css";

/**
 * Карточка существа — ОДНА на приложение.
 *
 * До 18.10.2026 стат-блок был нарисован прямо во вкладке «Бестиарий». Вкладке
 * «Подземелья» он нужен такой же: мастер жмёт имя обитателя комнаты и читает
 * те же числа. Второй копии разметки здесь быть не может — иначе у «того же,
 * что в бестиарии» стало бы два владельца, и строка, добавленная в одну
 * вкладку, молча не появилась бы в другой.
 *
 * Компонент только показывает. Где взять существо (список бестиария, обитатели
 * комнаты) и где поставить карточку — дело вкладки.
 */

// Русские подписи характеристик и счёт модификатора берутся у листа персонажа
// (characterCreationData), а не пишутся здесь заново: подпись «Ловкость» и
// формула (score - 10) / 2 — один факт на всё приложение.
const ABILITY_LABEL: Record<keyof AbilityScores, string> = Object.fromEntries(
  ABILITY_LABELS,
) as Record<keyof AbilityScores, string>;

/**
 * Подпись об источнике — ОДНА НА ПОКАЗАННОЕ СУЩЕСТВО, а не одна на вкладку.
 *
 * Раньше подвал стоял под списком и подписывал переводом SRD 5.1 всё, что во
 * вкладке видно. Пока в бестиарии лежал только SRD, это было правдой; с
 * появлением наших собственных существ (`bestiary/own-creatures.json`) тот же
 * подвал стал бы врать об источнике — ровно та ошибка, ради которой «Эльф
 * бездны» не лежит в `rules.json` (см. `abyssElfRace.ts`).
 *
 * Разведено по показанному существу, а не по двум спискам, потому что искать
 * существо игрок хочет по одному списку: наши твари стоят в бестиарии вперемешку
 * с SRD, находятся тем же поиском и уходят в тот же бой. Единственное, что
 * обязано различаться, — чей это контент; поэтому различается ровно подпись.
 *
 * Происхождение берётся у записи, а запись получает его от загрузчика по
 * файлу-источнику (`combat.rs`, `MonsterOrigin`) — показ его не выводит и не
 * угадывает. Текст подписи живёт здесь и только здесь. Переехав из вкладки в
 * карточку, подпись ездит теперь вместе с существом: в «Подземельях» под тем
 * же стат-блоком стоит та же строка, и забыть её там невозможно.
 */
const ATTRIBUTION: Record<MonsterOrigin, string | null> = {
  srd:
    "Стат-блок — перевод официального System Reference Document 5.1 от Wizards of the Coast, " +
    "распространяется по лицензии CC BY 4.0.",
  // До 15.10.2026 здесь стояло «Существо не входит в System Reference Document
  // 5.1: имя, описание, особые свойства и действия написаны для D&D Master,
  // лицензия CC BY 4.0 на него не распространяется». Владелец назвал метку
  // «не SRD» служебной: под своим существом подписи нет вовсе, а SRD-подпись
  // по-прежнему стоит только под SRD (`content-strip-provenance-notes`).
  own: null,
};

/**
 * Кости хитов хранятся латиницей, одной записью с `damageDice` («9d8+18»), —
 * так их отдаёт разборщик SRD и так их читает Rust. На экран они идут
 * кириллицей и с пробелами вокруг знака, как напечатано в книге: «9к8 + 18».
 * Запись без модификатора («3d8») остаётся без пробелов — их там неоткуда взять.
 */
export function formatHitDice(hitDice: string): string {
  return hitDice.replace("d", "к").replace(/([+-])/, " $1 ");
}

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

export function MonsterThumb({
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
export const LIST_THUMB_SIZE = 160;
export const DETAIL_THUMB_SIZE = 480;

/**
 * Крупная картинка показанного существа — по требованию, не для всех тварей
 * сразу, и с запоминанием уже пришедших: мастер листает тварей туда-обратно.
 *
 * Живёт рядом с карточкой, а не во вкладке, по той же причине, что и разметка:
 * размер детальной картинки и правило «одна картинка на показанное существо» —
 * один факт, и вкладка «Подземелья» не должна его повторять.
 */
export function useMonsterDetailImage(monster: MonsterTemplate | null | undefined): string | null {
  const [images, setImages] = useState<Record<string, string>>({});
  const asset = monster?.imageAsset ?? null;

  useEffect(() => {
    let cancelled = false;
    // `images` намеренно не в зависимостях: это защёлка «уже есть», а не
    // источник запроса. Попади она в зависимости, эффект пересоздавался бы на
    // каждую пришедшую картинку.
    if (!asset || images[asset]) return;
    invoke<string>("get_bestiary_image", { imageAsset: asset, maxSize: DETAIL_THUMB_SIZE })
      .then((data) => {
        if (!cancelled) setImages((current) => ({ ...current, [asset]: data }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [asset]);

  return asset ? images[asset] ?? null : null;
}

/**
 * Стат-блок существа и подпись об источнике под ним.
 *
 * Подвал — сосед статьи, а не её часть: внутри `article` он перестал бы быть
 * подвалом страницы для доступности, и пробы вкладки «Бестиарий», ищущие его
 * ролью `contentinfo`, искали бы его зря.
 */
export function MonsterStatBlock({
  monster,
  image,
}: {
  monster: MonsterTemplate;
  image: string | null;
}) {
  return (
    <>
      <article className="bestiary-statblock">
        <MonsterThumb monster={monster} className="bestiary-thumb bestiary-thumb--detail" src={image} />
        <h2 className="bestiary-statblock__name">{monster.name}</h2>
        <p className="bestiary-statblock__subtitle">
          {monster.size} {monster.creatureType}
        </p>
        {monster.description && <p className="bestiary-statblock__description">{monster.description}</p>}

        <dl className="bestiary-statblock__stats">
          <dt>Класс доспеха</dt>
          <dd>{monster.armorClass}</dd>
          <dt>Хиты</dt>
          <dd>
            {monster.maxHp} ({formatHitDice(monster.hitDice)})
          </dd>
          <dt>Скорость</dt>
          <dd>{monster.speedFeet} футов</dd>
        </dl>

        <dl className="bestiary-statblock__abilities">
          {ABILITY_LABELS.map(([key, label]) => (
            <div key={key} className="bestiary-statblock__ability">
              <dt>{label}</dt>
              <dd>
                {monster.abilities[key]} ({fmtMod(abilityMod(monster.abilities[key]))})
              </dd>
            </div>
          ))}
        </dl>

        <dl className="bestiary-statblock__stats">
          {optionalStatRows(monster).map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
          <dt>Пассивная внимательность</dt>
          <dd>{monster.passivePerception}</dd>
          <dt>Опасность</dt>
          <dd>{monster.challengeRating}</dd>
        </dl>

        {monster.traits.length > 0 && (
          <section>
            <h3>Особые свойства</h3>
            {monster.traits.map((t, i) => (
              <p key={i}><EmphasizedText>{t}</EmphasizedText></p>
            ))}
          </section>
        )}

        {monster.actions.length > 0 && (
          <section>
            <h3>Действия</h3>
            {monster.actions.map((a, i) => (
              <p key={i}><EmphasizedText>{a}</EmphasizedText></p>
            ))}
          </section>
        )}

        {monster.reactions && monster.reactions.length > 0 && (
          <section>
            <h3>Реакции</h3>
            {monster.reactions.map((r, i) => (
              <p key={i}><EmphasizedText>{r}</EmphasizedText></p>
            ))}
          </section>
        )}

        {monster.legendaryActions && monster.legendaryActions.length > 0 && (
          <section>
            <h3>Легендарные действия</h3>
            {monster.legendaryActions.map((a, i) => (
              <p key={i}><EmphasizedText>{a}</EmphasizedText></p>
            ))}
          </section>
        )}
      </article>

      {ATTRIBUTION[monster.origin] && (
        <footer className="bestiary-statblock__attribution">{ATTRIBUTION[monster.origin]}</footer>
      )}
    </>
  );
}
