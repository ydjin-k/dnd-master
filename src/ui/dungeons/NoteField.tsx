/**
 * Поле свободного текста мастера — одно на приложение: заметка к отметке,
 * заметка в списке комнат и описание выбранного лута набираются одинаково,
 * подписью-подсказкой и двумя строками. Второго такого поля с другим
 * поведением в подземельях быть не должно: мастер пишет за столом, и поле,
 * которое где-то режет пробелы, а где-то нет, он заметит первым.
 *
 * Правил здесь нет вовсе. Чем заметка пуста и когда она исчезает из записи,
 * решает `dungeonNotes.ts`, чем пуст выбор лута — `dungeonLootChoice.ts`; поле
 * только отдаёт набранный текст наверх.
 */
export function NoteField({
  label,
  value,
  onChange,
  placeholder = "Заметка мастера",
}: {
  /** Имя поля для чтения с экрана: «Заметка к комнате 3». */
  label: string;
  value: string;
  onChange: (text: string) => void;
  /** Подсказка в пустом поле; у заметки — своя, у описания лута — своя. */
  placeholder?: string;
}) {
  return (
    <textarea
      className="dungeons-page__note"
      rows={2}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}
