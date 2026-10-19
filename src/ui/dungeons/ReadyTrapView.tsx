import type { ReadyTrap } from "./readyTraps";

/**
 * Показ готовой ловушки: её текст из справочника целиком, абзац за абзацем —
 * как срабатывает, как обнаружить, как обезвредить, что делает эффект.
 *
 * Своими словами здесь не сказано ничего: абзацы приходят готовыми строками из
 * `rules.json` (`readyTraps.ts`), и ни одного числа этот файл не считает.
 * Числа у готовой ловушки свои, уровнем отряда и опасностью они не
 * масштабируются, и подставить их тут нечем.
 */
export function ReadyTrapView({ name, trap }: { name: string; trap: ReadyTrap | null }) {
  // Имя в записи есть, а ловушки в справочнике нет: правила могли смениться.
  // Молча пустое место хуже прямого «показать нечем».
  if (!trap) {
    return (
      <p className="dungeons-page__range">
        «{name}» — такой ловушки в справочнике больше нет, её текст показать нечем.
      </p>
    );
  }
  return (
    <div className="dungeons-page__ready">
      <h4>
        {trap.name}
        {trap.section !== null && (
          <span className="dungeons-page__range"> · {trap.section}</span>
        )}
        {trap.minPartyLevel > 1 && (
          <span className="dungeons-page__range"> · от {trap.minPartyLevel} уровня</span>
        )}
      </h4>
      {trap.sectionIntro.map((text, index) => (
        <p key={`intro-${index}`} className="dungeons-page__range">
          {text}
        </p>
      ))}
      {trap.paragraphs.map((text, index) => (
        <p key={index}>{text}</p>
      ))}
    </div>
  );
}

/**
 * Подпись ловушки в списке: имя и порог уровня, если он у неё есть, — «Сфера
 * аннигиляции · от 11 ур.». Порог здесь не считается, а берётся у самой
 * ловушки: его владелец — `readyTraps.ts`.
 */
export function readyTrapOptionLabel(trap: ReadyTrap): string {
  return trap.minPartyLevel > 1 ? `${trap.name} · от ${trap.minPartyLevel} ур.` : trap.name;
}

/**
 * Выбор готовой ловушки: любая из справочника или «Случайная» — тогда её
 * бросает кость. Своего списка имён здесь нет, он приходит из справочника.
 *
 * Порог уровня подписан, но ничего не запрещает: мастер вправе поставить
 * руками любую из одиннадцати, а отсекает порог только генератор схемы, где
 * уровень отряда есть. Выбирается ловушка по имени — подпись на это не влияет.
 */
export function ReadyTrapPicker({
  traps,
  name,
  onPick,
}: {
  traps: readonly ReadyTrap[];
  /** Выбранное имя или `null` — «Случайная». */
  name: string | null;
  onPick: (name: string | null) => void;
}) {
  return (
    <label className="dungeons-page__level">
      Готовая ловушка
      <select
        aria-label="Готовая ловушка"
        value={name ?? ""}
        onChange={(e) => onPick(e.currentTarget.value === "" ? null : e.currentTarget.value)}
      >
        <option value="">Случайная</option>
        {traps.map((trap) => (
          <option key={trap.name} value={trap.name}>
            {readyTrapOptionLabel(trap)}
          </option>
        ))}
      </select>
    </label>
  );
}
