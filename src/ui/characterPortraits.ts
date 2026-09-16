const RACE_PORTRAIT_SLUGS = {
  Человек: "human",
  Эльф: "elf",
  Дварф: "dwarf",
  Гном: "gnome",
  Полурослик: "halfling",
  Полуэльф: "half-elf",
  Полуорк: "half-orc",
  Драконорождённый: "dragonborn",
  Тифлинг: "tiefling",
} as const;

export const CHARACTER_PORTRAIT_RACES = Object.keys(RACE_PORTRAIT_SLUGS);
export const CHARACTER_PORTRAIT_GENDERS = ["Мужской", "Женский"] as const;

/**
 * Единственный владелец имени файла портрета. Библиотека хранится по правилу
 * `<race-slug>-<male|female>.jpg`; старые и произвольные значения пола берут
 * мужской вариант. Неизвестная раса берёт человеческий портрет, сохраняя
 * распознанный женский пол; при двух неизвестных значениях fallback — human-male.
 */
export function characterPortraitUrl(race: string, gender: string): string {
  const raceSlug = RACE_PORTRAIT_SLUGS[race as keyof typeof RACE_PORTRAIT_SLUGS] ?? "human";
  const genderSlug = gender === "Женский" ? "female" : "male";
  return `/character-portraits/${raceSlug}-${genderSlug}.jpg`;
}
