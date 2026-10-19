/**
 * Поле заметки мастера — одно на приложение: описание отметки и список комнат
 * показывают заметку одинаково, подписью-подсказкой и двумя строками.
 *
 * Правил здесь нет вовсе. Чем заметка пуста и когда она исчезает из записи,
 * решает `dungeonNotes.ts`; поле только отдаёт набранный текст наверх.
 */
export function NoteField({
  label,
  value,
  onChange,
}: {
  /** Имя поля для чтения с экрана: «Заметка к комнате 3». */
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <textarea
      className="dungeons-page__note"
      rows={2}
      aria-label={label}
      placeholder="Заметка мастера"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}
