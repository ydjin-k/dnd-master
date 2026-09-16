import { describe, expect, it } from "vitest";
import {
  CHARACTER_PORTRAIT_GENDERS,
  CHARACTER_PORTRAIT_RACES,
  characterPortraitUrl,
} from "./characterPortraits";

describe("characterPortraitUrl", () => {
  it("выдаёт 18 уникальных имён для девяти рас и двух полов", () => {
    const urls = CHARACTER_PORTRAIT_RACES.flatMap((race) =>
      CHARACTER_PORTRAIT_GENDERS.map((gender) => characterPortraitUrl(race, gender)),
    );

    expect(urls).toHaveLength(18);
    expect(new Set(urls).size).toBe(18);
    expect(urls).toContain("/character-portraits/dragonborn-female.jpg");
    expect(urls).toContain("/character-portraits/half-orc-male.jpg");
  });

  it("для отсутствующего или произвольного пола предсказуемо берёт мужской вариант той же расы", () => {
    expect(characterPortraitUrl("Эльф", "")).toBe("/character-portraits/elf-male.jpg");
    expect(characterPortraitUrl("Тифлинг", "не указано")).toBe("/character-portraits/tiefling-male.jpg");
  });

  it("не оставляет пустого места для неизвестной расы", () => {
    expect(characterPortraitUrl("", "Женский")).toBe("/character-portraits/human-female.jpg");
    expect(characterPortraitUrl("Кастомная раса", "другое")).toBe("/character-portraits/human-male.jpg");
  });
});
