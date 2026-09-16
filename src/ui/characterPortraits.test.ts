import { describe, expect, it } from "vitest";
import {
  CHARACTER_PORTRAIT_GENDERS,
  CHARACTER_PORTRAIT_RACES,
  CHARACTER_PORTRAIT_VARIANTS,
  characterPortraitUrl,
} from "./characterPortraits";

const bundledPortraits = import.meta.glob("/public/character-portraits/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});

describe("characterPortraitUrl", () => {
  it("выдаёт 60 уникальных имён и каждый ожидаемый файл есть в библиотеке", () => {
    const urls = CHARACTER_PORTRAIT_RACES.flatMap((race) =>
      CHARACTER_PORTRAIT_GENDERS.flatMap((gender) =>
        CHARACTER_PORTRAIT_VARIANTS.map((variant) => characterPortraitUrl(race, gender, variant)),
      ),
    );

    expect(urls).toHaveLength(60);
    expect(new Set(urls).size).toBe(60);
    expect(Object.keys(bundledPortraits).sort()).toEqual(urls.map((url) => `/public${url}`).sort());
    expect(urls).toContain("/character-portraits/dragonborn-female-3.jpg");
    expect(urls).toContain("/character-portraits/half-orc-male-2.jpg");
    expect(urls).toContain("/character-portraits/abyss-elf-female-3.jpg");
  });

  it("для отсутствующего или произвольного пола предсказуемо берёт мужской вариант той же расы", () => {
    expect(characterPortraitUrl("Эльф", "")).toBe("/character-portraits/elf-male-1.jpg");
    expect(characterPortraitUrl("Тифлинг", "не указано", 3)).toBe("/character-portraits/tiefling-male-3.jpg");
  });

  it("старого персонажа без варианта и неизвестную расу показывает первым портретом", () => {
    expect(characterPortraitUrl("", "Женский", 0)).toBe("/character-portraits/human-female-1.jpg");
    expect(characterPortraitUrl("Кастомная раса", "другое", Number.NaN)).toBe(
      "/character-portraits/human-male-1.jpg",
    );
  });
});
