const RACE_PORTRAIT_SLUGS = {
  Человек: { slug: "human" },
  Эльф: { slug: "elf" },
  "Эльф бездны": { slug: "abyss-elf" },
  Дварф: { slug: "dwarf" },
  Гном: { slug: "gnome" },
  Полурослик: { slug: "halfling" },
  Полуэльф: { slug: "half-elf" },
  Полуорк: { slug: "half-orc" },
  Драконорождённый: { slug: "dragonborn" },
  Тифлинг: { slug: "tiefling" },
  Голиаф: { slug: "goliath" },
  Дженази: { slug: "genasi", variants: 4 },
  Зайцегон: { slug: "harengon" },
  Гоблин: { slug: "goblin" },
  Серпенты: { slug: "serpent" },
  Аасимар: { slug: "aasimar" },
  Сатир: { slug: "satyr" },
  Табакси: { slug: "tabaxi" },
  Чейнджлинг: { slug: "changeling", variants: 1 },
  Фирболг: { slug: "firbolg" },
} as const;

export const CHARACTER_PORTRAIT_RACES = Object.keys(RACE_PORTRAIT_SLUGS);
export const CHARACTER_PORTRAIT_GENDERS = ["Мужской", "Женский"] as const;
const DEFAULT_PORTRAIT_VARIANT_COUNT = 3;
const ALL_PORTRAIT_VARIANTS = [1, 2, 3, 4] as const;

/** Число вариантов принадлежит конфигу расы; без явного лимита доступны три. */
export function characterPortraitVariants(race: string): readonly number[] {
  const config = RACE_PORTRAIT_SLUGS[race as keyof typeof RACE_PORTRAIT_SLUGS];
  const variantCount = config && "variants" in config
    ? config.variants
    : DEFAULT_PORTRAIT_VARIANT_COUNT;
  return ALL_PORTRAIT_VARIANTS.slice(0, variantCount);
}

/**
 * Единственный владелец имени файла портрета. Библиотека хранится по правилу
 * `<race-slug>-<male|female>-<variant>.jpg`; старые персонажи без номера берут
 * первый вариант, а номер за пределами расового диапазона обрезается до него.
 * Неизвестный пол берёт мужской вариант, неизвестная раса — человеческий
 * портрет с распознанным полом.
 */
export function characterPortraitUrl(race: string, gender: string, variant = 1): string {
  const config = RACE_PORTRAIT_SLUGS[race as keyof typeof RACE_PORTRAIT_SLUGS];
  const raceSlug = config?.slug ?? "human";
  const genderSlug = gender === "Женский" ? "female" : "male";
  const variantLimit = characterPortraitVariants(race).length;
  const requestedVariant = Number.isInteger(variant) ? variant : 1;
  const normalizedVariant = Math.min(Math.max(requestedVariant, 1), variantLimit);
  return `/character-portraits/${raceSlug}-${genderSlug}-${normalizedVariant}.jpg`;
}
