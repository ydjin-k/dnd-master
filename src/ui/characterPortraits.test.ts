import { describe, expect, it } from "vitest";
import {
  CHARACTER_PORTRAIT_GENDERS,
  CHARACTER_PORTRAIT_RACES,
  characterPortraitUrl,
  characterPortraitVariants,
} from "./characterPortraits";

const bundledPortraits = import.meta.glob("/public/character-portraits/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});

describe("characterPortraitUrl", () => {
  it("выдаёт 122 уникальных имени и каждый ожидаемый файл есть в библиотеке", () => {
    const urls = CHARACTER_PORTRAIT_RACES.flatMap((race) =>
      CHARACTER_PORTRAIT_GENDERS.flatMap((gender) =>
        characterPortraitVariants(race).map((variant) => characterPortraitUrl(race, gender, variant)),
      ),
    );

    expect(urls).toHaveLength(122);
    expect(new Set(urls).size).toBe(122);
    expect(Object.keys(bundledPortraits).sort()).toEqual(urls.map((url) => `/public${url}`).sort());
    expect(urls).toContain("/character-portraits/dragonborn-female-3.jpg");
    expect(urls).toContain("/character-portraits/half-orc-male-2.jpg");
    expect(urls).toContain("/character-portraits/abyss-elf-female-3.jpg");
    expect(urls).toContain("/character-portraits/genasi-female-4.jpg");
  });

  it("оставляет четвёртый вариант Дженази и обрезает его до третьего у трёхвариантной расы", () => {
    expect(characterPortraitVariants("Дженази")).toEqual([1, 2, 3, 4]);
    expect(characterPortraitUrl("Дженази", "Женский", 4)).toBe(
      "/character-portraits/genasi-female-4.jpg",
    );
    expect(characterPortraitUrl("Голиаф", "Женский", 4)).toBe(
      "/character-portraits/goliath-female-3.jpg",
    );
  });

  it("для отсутствующего или произвольного пола предсказуемо берёт мужской вариант той же расы", () => {
    expect(characterPortraitUrl("Эльф", "")).toBe("/character-portraits/elf-male-1.jpg");
    expect(characterPortraitUrl("Тифлинг", "не указано", 3)).toBe("/character-portraits/tiefling-male-3.jpg");
  });

  it("эльф бездны без выбранного варианта берёт свой первый портрет, а не человеческий запасной", () => {
    // Отрицательная проба на строку «Эльф бездны» в RACE_PORTRAIT_SLUGS: убери
    // её — и раса молча свалится в человеческий запасной портрет, а не выдаст
    // ошибку. Проба называет расу, поэтому падение читается сразу.
    expect(characterPortraitUrl("Эльф бездны", "Мужской", 0)).toBe("/character-portraits/abyss-elf-male-1.jpg");
    expect(characterPortraitUrl("Эльф бездны", "Женский")).toBe("/character-portraits/abyss-elf-female-1.jpg");
    expect(characterPortraitUrl("Эльф бездны", "Женский", 3)).toBe("/character-portraits/abyss-elf-female-3.jpg");
  });

  it("старого персонажа без варианта и неизвестную расу показывает первым портретом", () => {
    expect(characterPortraitUrl("", "Женский", 0)).toBe("/character-portraits/human-female-1.jpg");
    expect(characterPortraitUrl("Кастомная раса", "другое", Number.NaN)).toBe(
      "/character-portraits/human-male-1.jpg",
    );
  });
});
