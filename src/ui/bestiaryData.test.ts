import { describe, it, expect } from "vitest";
import bundledBestiary from "../../src-tauri/bestiary/bestiary.json";
import type { MonsterTemplate } from "../state/types";
import { ABILITY_LABELS, ALL_SKILLS } from "./characterCreationData";

/**
 * Сторожа данных бестиария со стороны фронта.
 *
 * Rust уже стережёт то, что видно ему самому (схема, ключи спасбросков,
 * пассивная внимательность — `combat.rs`). Здесь проверяется ровно то, чего он
 * знать не может: имена навыков и подписи характеристик живут списками во
 * фронте, и опечатка в данных не уронит разбор — она тихо напечатает в
 * карточке строку без значения.
 *
 * Пробы идут по НАСТОЯЩЕМУ `bestiary.json`, а не по фикстуре: беречь надо
 * привозимые данные, и следующая карточка привезёт их ещё на ~250 существ.
 */
const bestiary = bundledBestiary as MonsterTemplate[];
const ABILITY_KEYS = ABILITY_LABELS.map(([key]) => key);

describe("данные бестиария", () => {
  it("каждый навык существа есть в общем списке навыков", () => {
    const unknown = bestiary.flatMap((m) =>
      (m.skills ?? [])
        .filter((s) => !ALL_SKILLS.includes(s.skill))
        .map((s) => `${m.name}: ${s.skill}`),
    );
    expect(unknown).toEqual([]);
  });

  it("у каждого спасброска характеристика та, для которой есть подпись", () => {
    const unknown = bestiary.flatMap((m) =>
      (m.savingThrows ?? [])
        .filter((s) => !ABILITY_KEYS.includes(s.ability))
        .map((s) => `${m.name}: ${s.ability}`),
    );
    expect(unknown).toEqual([]);
  });

  it("у каждого существа шесть характеристик, и все в пределах стат-блока SRD", () => {
    const broken = bestiary.flatMap((m) =>
      ABILITY_KEYS.filter((key) => {
        const score = m.abilities?.[key];
        return typeof score !== "number" || score < 1 || score > 30;
      }).map((key) => `${m.name}: ${key}`),
    );
    expect(broken).toEqual([]);
  });

  it("у чувства есть имя и ненулевая дальность", () => {
    const broken = bestiary.flatMap((m) =>
      (m.senses ?? [])
        .filter((s) => !s.name.trim() || !(s.rangeFeet > 0))
        .map((s) => `${m.name}: ${JSON.stringify(s)}`),
    );
    expect(broken).toEqual([]);
  });

  it("ни одно необязательное поле не стоит пустым списком", () => {
    const keys = [
      "savingThrows",
      "skills",
      "damageVulnerabilities",
      "damageResistances",
      "damageImmunities",
      "conditionImmunities",
      "senses",
      "languages",
      "reactions",
      "legendaryActions",
    ] as const;
    const empty = bestiary.flatMap((m) =>
      keys.filter((key) => Array.isArray(m[key]) && m[key]!.length === 0).map((key) => `${m.name}: ${key}`),
    );
    expect(empty).toEqual([]);
  });
});
