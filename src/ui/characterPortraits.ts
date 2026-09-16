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
export const CHARACTER_PORTRAIT_VARIANTS = [1, 2, 3] as const;

/**
 * Единственный владелец имени файла портрета. Библиотека хранится по правилу
 * `<race-slug>-<male|female>-<1|2|3>.jpg`; старые персонажи без номера и
 * произвольные номера берут первый вариант. Неизвестный пол берёт мужской
 * вариант, неизвестная раса — человеческий портрет с распознанным полом.
 */
export function characterPortraitUrl(race: string, gender: string, variant = 1): string {
  const raceSlug = RACE_PORTRAIT_SLUGS[race as keyof typeof RACE_PORTRAIT_SLUGS] ?? "human";
  const genderSlug = gender === "Женский" ? "female" : "male";
  const normalizedVariant = variant === 2 || variant === 3 ? variant : 1;
  return `/character-portraits/${raceSlug}-${genderSlug}-${normalizedVariant}.jpg`;
}
