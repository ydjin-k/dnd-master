import { doorToughness, type ObjectToughness } from "./doorToughness";

/**
 * «Выбить: КД 15, хиты 18 (4к8)» — строка в описании отметки двери: мастеру
 * сразу видно, можно ли дверь выбить.
 *
 * Числа считает `doorToughness.ts` по таблицам справочника, вещество берёт из
 * строки таблицы дверей. Здесь только подпись; ни одного числа этот файл не
 * знает. Таблицы ещё не прочитаны — строки нет вовсе, а не «КД —».
 */
export function DoorBreakLine({
  toughness,
  line,
  seed,
  markerId,
}: {
  toughness: ObjectToughness | null;
  /** Строка таблицы дверей — по ней узнаётся вещество. */
  line: string | null;
  seed: number;
  markerId: string;
}) {
  if (!toughness) return null;
  const door = doorToughness(toughness, line, seed, markerId);
  return (
    <p className="dungeons-page__door">
      <b>Выбить:</b> КД {door.armor}, хиты {door.hitPoints}{" "}
      <span className="dungeons-page__range">
        {door.material.toLowerCase()}, средний размер, крепкая
      </span>
    </p>
  );
}
