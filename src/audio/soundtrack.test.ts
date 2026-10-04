import { describe, expect, it } from "vitest";
import { AMBIENT_CATEGORIES, MUSIC_CATEGORIES, findTrack } from "./soundtrack";

/**
 * Сторож соответствия «каталог ↔ файлы на диске».
 *
 * ЗАЧЕМ. `soundtrack.ts` — единственный владелец соответствия «путь на диске →
 * подпись в интерфейсе», но до этой пробы ничто не проверяло первую половину
 * этого соответствия: путь, которого на диске нет, давал молчащую кнопку в
 * «Саундборде» — `new Audio(src).play()` в `SoundtrackContext.tsx:93` падает в
 * отвергнутое обещание, которое там же и глотается (`.catch(() => undefined)`).
 *
 * Проба написана на переименовании: четыре фоновых лупа (`birdsong`, `stream`,
 * `morning-forest`, `wind`) перегнаны из WAV в OGG, и каталог правился руками.
 * Без этой пробы опечатка в любой из четырёх строк прошла бы все ворота.
 *
 * ПОЧЕМУ `import.meta.glob`, А НЕ СПИСОК ФАЙЛОВ ЗДЕСЬ. Список, записанный в
 * пробе, сделал бы её самоссылочной — ровно та ошибка, которую разбирает запись
 * 179: число, взятое из той же головы, что и код, не краснеет на сдвиге.
 * `import.meta.glob` спрашивает настоящий каталог `public/` у сборщика, то есть
 * проба читает диск, а не вторую копию наших же строк.
 *
 * ПОЧЕМУ НЕ `node:fs`. Типов Node в проекте нет — тот же довод, что в шапке
 * `feats.test.ts`.
 */

/** Настоящие файлы коллекции — ключи отдаёт сборщик, обойдя `public/`. */
const filesOnDisk = new Set(
  Object.keys(
    import.meta.glob("../../public/audio/soundtrack/**/*.{mp3,ogg,wav}", {
      eager: false,
    }),
  ).map((key) => key.replace("../../public", "")),
);

const allTracks = [...MUSIC_CATEGORIES, ...AMBIENT_CATEGORIES].flatMap((c) => c.tracks);

describe("каталог саундтрека", () => {
  it("коллекция на диске непуста — иначе проба ниже зелёная ни о чём", () => {
    expect(filesOnDisk.size).toBeGreaterThan(0);
  });

  it("у каждой записи каталога есть файл на диске", () => {
    const missing = allTracks.filter((t) => !filesOnDisk.has(t.src)).map((t) => t.src);
    expect(missing).toEqual([]);
  });

  it("каждый файл на диске назван в каталоге — иначе он недоступен игроку", () => {
    const listed = new Set(allTracks.map((t) => t.src));
    const orphans = [...filesOnDisk].filter((f) => !listed.has(f));
    expect(orphans).toEqual([]);
  });

  it("id трека не зависит от расширения — перегонка формата не ломает сохранения", () => {
    // Расширение отбрасывает `build()`; это и позволило сменить WAV на OGG,
    // не тронув ни одного сохранённого id.
    expect(findTrack("wind/wind")).not.toBeNull();
    expect(findTrack("forest/birdsong")).not.toBeNull();
    expect(allTracks.every((t) => !/\.(mp3|ogg|wav)$/.test(t.id))).toBe(true);
  });
});
