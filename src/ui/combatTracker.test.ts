import { describe, expect, it } from "vitest";
import type { Character, CombatState, Combatant, MonsterTemplate } from "../state/types";
import {
  combatantDeathSaves,
  combatantLabel,
  fallenFlags,
  initiativeModifierOf,
  isFallen,
  rollsDeathSaves,
  turnOrder,
} from "./combatTracker";

const wolfTemplate = {
  id: "wolf",
  name: "Волк",
  abilities: { strength: 12, dexterity: 15, constitution: 12, intelligence: 3, wisdom: 12, charisma: 6 },
} as MonsterTemplate;
const goblinTemplate = {
  id: "goblin",
  name: "Гоблин",
  abilities: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
} as MonsterTemplate;
const bestiary = [wolfTemplate, goblinTemplate];

/** Ловкость 10 (модификатор 0), а на листе инициатива +3 — числа нарочно разные. */
const hero = { id: "hero", name: "Герой", initiative: 3, abilities: { dexterity: 10 } } as Character;
const characters = [hero];

function wolf(number: number, d20: number | null): Combatant {
  return {
    id: `monster-wolf-${number}`,
    source: { kind: "monster", templateId: "wolf", number },
    maxHp: 11,
    currentHp: 11,
    initiativeRoll: d20 === null ? null : { d20, dexModifier: 2 },
    playerRules: false, deathSaveSuccesses: 0, deathSaveFailures: 0,
  };
}

function combatOf(combatants: Combatant[]): CombatState {
  return { combatants, currentTurnIndex: 0, round: 1 };
}

describe("трекер боя", () => {
  it("номер у существа виден, только когда этого вида в бою больше одного", () => {
    const one = combatOf([wolf(1, null)]);
    expect(combatantLabel(one.combatants[0], one, characters, bestiary)).toBe("Волк");

    const five = combatOf([1, 2, 3, 4, 5].map((n) => wolf(n, null)));
    expect(five.combatants.map((c) => combatantLabel(c, five, characters, bestiary))).toEqual([
      "Волк 1",
      "Волк 2",
      "Волк 3",
      "Волк 4",
      "Волк 5",
    ]);
  });

  /**
   * Модификатор персонажа — его `Character.initiative`, тот же, что на листе,
   * а не пересчёт из Ловкости: у героя Ловкость 10 (это дало бы 0), а на листе
   * +3. Отрицательная проба: считать `abilityMod(abilities.dexterity)` и для
   * персонажа — краснеет первая строка.
   */
  it("модификатор персонажа берётся с листа, существа — из Ловкости шаблона", () => {
    const combat = combatOf([
      {
        id: "hero",
        source: { kind: "character", characterId: "hero" },
        maxHp: 12,
        currentHp: 12,
        initiativeRoll: null,
        playerRules: false, deathSaveSuccesses: 0, deathSaveFailures: 0,
      },
      wolf(1, null),
    ]);
    expect(initiativeModifierOf(combat.combatants[0], characters, bestiary)).toBe(3);
    expect(initiativeModifierOf(combat.combatants[1], characters, bestiary)).toBe(2);
  });

  /**
   * Равные итоги разводятся правилом: больший модификатор Ловкости выше, при
   * равном — по подписи с числами по значению («Волк 2» выше «Волк 10»).
   * Порядок не зависит от того, в каком порядке бойцы лежат в сохранении —
   * иначе он ехал бы на каждом перечитывании.
   */
  it("порядок ходов воспроизводим и разводит равные итоги правилом", () => {
    const goblin: Combatant = {
      id: "monster-goblin-1",
      source: { kind: "monster", templateId: "goblin", number: 1 },
      maxHp: 7,
      currentHp: 7,
      // 17 + 1 = 18 — как у волков ниже, но модификатор меньше.
      initiativeRoll: { d20: 17, dexModifier: 1 },
      playerRules: false, deathSaveSuccesses: 0, deathSaveFailures: 0,
    };
    const wolves = [10, 2, 1].map((n) => wolf(n, 16)); // итог 18 у всех трёх
    const late = wolf(11, null); // добавлен после броска
    const top = wolf(3, 19); // итог 21

    const a = combatOf([goblin, ...wolves, late, top]);
    const b = combatOf([late, top, ...wolves].reverse().concat(goblin));
    const labels = (combat: CombatState) =>
      turnOrder(combat, characters, bestiary).map((c) => combatantLabel(c, combat, characters, bestiary));

    expect(labels(a)).toEqual(["Волк 3", "Волк 1", "Волк 2", "Волк 10", "Гоблин", "Волк 11"]);
    expect(labels(b)).toEqual(labels(a));
  });

  /**
   * Слово владельца 14.10.2026: чудовище на нуле пало и пропускается,
   * персонаж на нуле бросает спасброски, существо с переключателем — как
   * персонаж. Решают БОЕВЫЕ хиты: у героя на листе хитов нет вовсе (заготовка
   * выше), а в бою 0 — и он лежит.
   */
  it("кто пал, а кто бросает спасброски — по боевым хитам и переключателю", () => {
    const pcDown: Combatant = {
      id: "hero",
      source: { kind: "character", characterId: "hero" },
      maxHp: 12,
      currentHp: 0,
      initiativeRoll: null,
      playerRules: false,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
    };
    const wolfDown = { ...wolf(1, null), currentHp: 0 };
    const villainDown = { ...wolf(2, null), currentHp: 0, playerRules: true, deathSaveFailures: 9 };
    const wolfUp = wolf(3, null);

    expect(fallenFlags([pcDown, wolfDown, villainDown, wolfUp])).toEqual([false, true, false, false]);
    expect([pcDown, wolfDown, villainDown, wolfUp].map(rollsDeathSaves)).toEqual([true, false, true, false]);
    expect(isFallen({ ...wolfDown, playerRules: true })).toBe(false);

    // Счёт персонажа — с листа, существа — из бойца, с тем же пределом 0..3.
    const sheet = { ...hero, deathSaveSuccesses: 2, deathSaveFailures: 1 } as Character;
    expect(combatantDeathSaves(pcDown, [sheet])).toEqual({ successes: 2, failures: 1 });
    expect(combatantDeathSaves(pcDown, [])).toBeNull();
    expect(combatantDeathSaves(villainDown, [sheet])).toEqual({ successes: 0, failures: 3 });
  });
});
