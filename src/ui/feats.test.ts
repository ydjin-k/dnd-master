import { describe, expect, it } from "vitest";
// Исходник сторожимого файла — строкой, через `?raw` сборщика. Не `node:fs`:
// типов Node в проекте нет, и тянуть их ради одной пробы дороже, чем взять то,
// что уже умеет Vite. Читается ровно тот же файл, который пойдёт в сборку.
import featsSource from "./feats.ts?raw";
import bundledRules from "../../src-tauri/rules/rules.json";
import { emptyAbilityScores, type Character, type RuleTopic } from "../state/types";
import {
  FEATS_TOPIC_ID,
  FEAT_ABILITY_CAP,
  OWN_FEATS,
  abilitiesWithFeat,
  allFeats,
  canTakeFeat,
  featsOf,
  firstFeatLevelHint,
  hasFeat,
  prerequisiteText,
  readSrdFeat,
  unmetPrerequisite,
  type Feat,
} from "./feats";

const srdTopics = bundledRules as unknown as RuleTopic[];

/** Персонаж-заготовка: ровно те поля, которые читают функции черт. */
function character(over: Partial<Character> = {}): Character {
  return {
    abilities: emptyAbilityScores(),
    armorProficiencies: [],
    knownCantrips: [],
    spellSlotsMax: [],
    feats: [],
    ...over,
  } as Character;
}

function ownFeat(id: string): Feat {
  const feat = OWN_FEATS.find((f) => f.id === id);
  if (!feat) throw new Error(`нет черты ${id}`);
  return feat;
}

describe("граница лицензии у черт", () => {
  /**
   * ГЛАВНЫЙ СТОРОЖ ФАЙЛА, и он не про совпадение с SRD, а про СЛОВА.
   *
   * Тот же приём, что у своих существ (`own_creatures_never_use_product_identity_names`
   * в `src-tauri/src/combat.rs`), перенесённый в свою зону: черты живут во
   * фронте, значит и сторож их имён — обычная проба рядом с `feats.ts`, а не
   * строка в `combat.rs` (бой к чертам не привязан вовсе, решение владельца
   * 27.09.2026).
   *
   * Стережётся именно отсутствие имени в SRD 5.1: в SRD вошла ровно одна черта
   * — «Борец», — а все остальные имена, которые игрок знает по книге, остались
   * за Wizards, как бы ни был написан текст вокруг. Поэтому запрещённого имени
   * в `rules.json` как раз и НЕТ, и никакой сторож «не совпадает с SRD» его бы
   * не поймал: оно приезжает из книги, мимо всех прежних сторожей.
   *
   * Стерегутся ОСНОВЫ, а не словоформы: русское имя склоняется («атлета»,
   * «дуэлянтом», «наблюдательного»), и точное сравнение обманулось бы первым
   * же падежом.
   *
   * Проба смотрит СЫРОЙ файл, а не разобранные записи: запрещённое имя
   * одинаково нельзя и в `name`, и в `id`, и в описании, и в комментарии, и в
   * поле, которого у `Feat` ещё нет.
   */
  it("own_feats_never_use_product_identity_names", () => {
    /**
     * Основы имён черт из книги владельца, которых в SRD 5.1 нет вовсе.
     *
     * Каждая проверена по данным перед тем, как стать основой: слова,
     * начинающегося на неё, в `feats.ts` нет ни одного (см. обратную пробу
     * ниже — она доказывает, что список вообще срабатывает).
     */
    const FORBIDDEN_STEMS = [
      "атлет",
      "актёр",
      "актер",
      "бдительн",
      "везуч",
      "дуэлянт",
      "целител",
      "лингвист",
      "наблюдательн",
      "подвижн",
      "мобильн",
      "стойк",
      "скрытник",
      "снайпер",
      "налётчик",
      "налетчик",
      "всадник",
      "стрелок",
      "драчун",
      "живуч",
      "адепт",
      "посвящённ",
      "посвященн",
      "знаток",
    ];

    // «Мастер», «страж», «крепкий», «умелый», «внимательность» в списке НЕТ, и
    // это проверка по данным, а не недосмотр: все пять — общие русские слова,
    // и основа покрасила бы законное вместо чужого. «Внимательность» и
    // «Анализ» — вообще имена навыков SRD, они стоят в описаниях «Цепкого
    // глаза» и «Кошачьей тишины» и обязаны там стоять. «Мастер» встречается в
    // тексте «Скверны» и в самом слове «Мастер» за столом. Ловушка того же
    // класса, что «отродье» и «тиран» у своих существ.

    const source = featsSource.toLowerCase();
    const found = source
      .split(/[^\p{L}]+/u)
      .filter((word: string) => word.length > 0)
      .filter((word: string) => FORBIDDEN_STEMS.some((stem) => word.startsWith(stem)));

    expect(found).toEqual([]);
  });

  /**
   * Обратная проба того же сторожа: доказывает, что список основ выше не
   * декорация. Без неё «ни одного совпадения» не отличить от «сторож ничего не
   * ищет» — ровно тот случай, когда проба сторожит строчки, а не дефект.
   *
   * Подставляется настоящее книжное имя — «Атлет», — и именно в той форме, в
   * которой его написал бы человек, добавляющий черту: с большой буквы и в
   * падеже.
   */
  it("сторож краснеет, если подставить книжное имя", () => {
    const FORBIDDEN_STEMS = ["атлет"];
    const withBookName = "{ id: \"feat-atlet\", name: \"Атлет\", description: \"Атлета не удержать…\" }".toLowerCase();

    const found = withBookName
      .split(/[^\p{L}]+/u)
      .filter((word) => word.length > 0)
      .filter((word) => FORBIDDEN_STEMS.some((stem) => word.startsWith(stem)));

    expect(found).toEqual(["атлет", "атлета"]);
  });

  it("ни одна наша черта не носит имени из rules.json", () => {
    const srdNames = new Set(
      srdTopics.flatMap((topic) =>
        topic.blocks.flatMap((block) => (block.type === "heading" ? [block.text.trim()] : [])),
      ),
    );

    for (const feat of OWN_FEATS) {
      expect(srdNames.has(feat.name)).toBe(false);
    }
  });

  it("в rules.json не добавлено ни одной нашей черты", () => {
    // Граница «всё, что из rules.json, — SRD»: раздел «Черты» обязан остаться
    // ровно таким, каким он приехал, — правило плюс единственная черта SRD.
    const topic = srdTopics.find((t) => t.id === FEATS_TOPIC_ID);
    const headings = topic?.blocks.filter((b) => b.type === "heading") ?? [];

    expect(headings).toHaveLength(2); // «Черты» и «Борец» — и ничего больше
    const raw = JSON.stringify(topic);
    for (const feat of OWN_FEATS) {
      expect(raw).not.toContain(feat.name);
    }
  });

  it("текст SRD-черты не скопирован в наш файл, а читается", () => {
    const srd = readSrdFeat(srdTopics);
    const source = featsSource;

    expect(srd).not.toBeNull();
    // Первые слова текста SRD достаточно характерны: окажись они в исходнике,
    // значит текст скопировали, а чтение оставили для вида.
    expect(source).not.toContain(srd!.description.slice(0, 40));
  });
});

describe("SRD-черта «Борец» читается из справочника", () => {
  it("имя, текст и требование приходят из rules.json", () => {
    const srd = readSrdFeat(srdTopics);

    expect(srd).not.toBeNull();
    expect(srd!.name).toBe("Борец");
    expect(srd!.origin).toBe("srd");
    expect(srd!.description.length).toBeGreaterThan(50);
    // Требование разобрано в ДАННЫЕ, и число 13 взято из текста SRD, а не
    // вписано у нас: у него один владелец — rules.json.
    expect(srd!.prerequisite).toEqual({ kind: "ability", ability: "strength", min: 13 });
  });

  it("требование не осталось абзацем внутри текста", () => {
    const srd = readSrdFeat(srdTopics);

    expect(srd!.description).not.toContain("Требование");
  });

  it("нет раздела — нет и SRD-черты, а наши остаются", () => {
    expect(readSrdFeat([])).toBeNull();
    expect(allFeats([])).toEqual([...OWN_FEATS]);
  });

  it("список черт — SRD-черта плюс наши, и «Борец» первым", () => {
    const feats = allFeats(srdTopics);

    expect(feats).toHaveLength(OWN_FEATS.length + 1);
    expect(feats[0].name).toBe("Борец");
    expect(feats.filter((f) => f.origin === "srd")).toHaveLength(1);
  });
});

describe("набор наших черт", () => {
  it("черт от десяти до двадцати", () => {
    expect(OWN_FEATS.length).toBeGreaterThanOrEqual(10);
    expect(OWN_FEATS.length).toBeLessThanOrEqual(20);
  });

  it("id уникальны, с префиксом, и имена не повторяются", () => {
    const ids = OWN_FEATS.map((f) => f.id);
    const names = OWN_FEATS.map((f) => f.name);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    for (const id of ids) expect(id.startsWith("feat-")).toBe(true);
  });

  it("у каждой черты есть имя и текст, и все помечены нашими", () => {
    for (const feat of OWN_FEATS) {
      expect(feat.name.trim().length).toBeGreaterThan(0);
      expect(feat.description.trim().length).toBeGreaterThan(40);
      expect(feat.origin).toBe("own");
    }
  });

  /**
   * Прибавка к характеристике обязана быть заявлена в тексте и лежать в данных
   * одновременно: данные без текста — прибавка, которой игрок не видит, текст
   * без данных — прибавка, которой нет в счёте. Второй случай и есть «игрок
   * видит одно, а считается другое» из карточки.
   */
  it("заявленная в тексте прибавка к характеристике лежит в данных", () => {
    const ABILITY_WORDS: [string, string][] = [
      ["strength", "Сила растёт на 1"],
      ["dexterity", "Ловкость растёт на 1"],
      ["constitution", "Телосложение растёт на 1"],
      ["intelligence", "Интеллект растёт на 1"],
      ["wisdom", "Мудрость растёт на 1"],
      ["charisma", "Харизма растёт на 1"],
    ];

    for (const feat of OWN_FEATS) {
      for (const [key, phrase] of ABILITY_WORDS) {
        const promised = feat.description.includes(phrase);
        const stored = (feat.abilityBonus?.[key as keyof typeof feat.abilityBonus] ?? 0) > 0;
        expect(stored, `${feat.name}: «${phrase}» в тексте — ${promised}, в данных — ${stored}`).toBe(
          promised,
        );
      }
    }
  });

  it("числом: сколько черт, сколько с требованиями, сколько меняют характеристику", () => {
    // Числа приёмки карточки, закреплённые пробой: изменится набор — изменится
    // и строка отчёта, а не только код.
    const feats = allFeats(srdTopics);

    expect(feats).toHaveLength(15); // 14 наших + «Борец» из SRD
    expect(feats.filter((f) => f.prerequisite)).toHaveLength(7);
    expect(feats.filter((f) => f.abilityBonus)).toHaveLength(6);
  });
});

describe("требования проверяются, а не висят текстом", () => {
  it("персонаж с Силой 10 не может взять черту с требованием Сила 13 — и видит, почему", () => {
    const grappler = readSrdFeat(srdTopics)!;
    const weak = character({ abilities: { ...emptyAbilityScores(), strength: 10 } });

    expect(canTakeFeat(grappler, weak)).toBe(false);
    expect(unmetPrerequisite(grappler, weak)).toBe("требуется Сила 13 или выше, у вас 10");
  });

  it("та же черта доступна, когда Сила дотянула до 13", () => {
    const grappler = readSrdFeat(srdTopics)!;
    const strong = character({ abilities: { ...emptyAbilityScores(), strength: 13 } });

    expect(unmetPrerequisite(grappler, strong)).toBeNull();
    expect(canTakeFeat(grappler, strong)).toBe(true);
  });

  it("требование владения доспехами смотрит на владения персонажа", () => {
    const anvil = ownFeat("feat-nakovalnya");
    const light = character({ armorProficiencies: ["light", "medium"] });
    const heavy = character({ armorProficiencies: ["heavy"] });

    expect(unmetPrerequisite(anvil, light)).toBe("требуется владение: тяжёлые доспехи");
    expect(unmetPrerequisite(anvil, heavy)).toBeNull();
  });

  it("требование заклинателя выполняет и ячейка, и один заговор", () => {
    const caster = ownFeat("feat-slovo-pod-udar");

    expect(unmetPrerequisite(caster, character())).toBe(
      "требуется способность творить хотя бы одно заклинание",
    );
    expect(unmetPrerequisite(caster, character({ knownCantrips: ["light"] }))).toBeNull();
    expect(unmetPrerequisite(caster, character({ spellSlotsMax: [2, 0] }))).toBeNull();
    // Нулевые ячейки — не способность: у не-заклинателя массив бывает заполнен нулями.
    expect(unmetPrerequisite(caster, character({ spellSlotsMax: [0, 0] }))).not.toBeNull();
  });

  it("черта без требования доступна всегда", () => {
    const wiry = ownFeat("feat-zhilisty");

    expect(wiry.prerequisite).toBeUndefined();
    expect(unmetPrerequisite(wiry, character())).toBeNull();
  });

  it("подпись требования выводится из данных, а не хранится второй строкой", () => {
    expect(prerequisiteText({ kind: "ability", ability: "dexterity", min: 13 })).toBe(
      "Ловкость 13 или выше",
    );
    expect(prerequisiteText({ kind: "armor", category: "heavy" })).toBe(
      "владение: тяжёлые доспехи",
    );
    expect(prerequisiteText({ kind: "spellcasting" })).toBe(
      "способность творить хотя бы одно заклинание",
    );
  });

  it("взятую черту второй раз не предлагают", () => {
    const wiry = ownFeat("feat-zhilisty");
    const taken = character({ feats: [wiry.id] });

    expect(hasFeat(taken, wiry.id)).toBe(true);
    expect(canTakeFeat(wiry, taken)).toBe(false);
    // Причина именно «уже взята», а не «требование»: требования у неё нет.
    expect(unmetPrerequisite(wiry, taken)).toBeNull();
  });
});

describe("прибавка черты к характеристике", () => {
  it("+1 действительно применяется", () => {
    const eye = ownFeat("feat-cepkiy-glaz");
    const before = { ...emptyAbilityScores(), wisdom: 14 };

    expect(abilitiesWithFeat(before, eye).wisdom).toBe(15);
  });

  it("потолок 20 — тот же, что у Улучшения характеристик", () => {
    const eye = ownFeat("feat-cepkiy-glaz");
    const capped = { ...emptyAbilityScores(), wisdom: FEAT_ABILITY_CAP };

    expect(abilitiesWithFeat(capped, eye).wisdom).toBe(FEAT_ABILITY_CAP);
  });

  it("черта без прибавки возвращает тот же объект", () => {
    const wiry = ownFeat("feat-zhilisty");
    const before = emptyAbilityScores();

    expect(abilitiesWithFeat(before, wiry)).toBe(before);
  });

  it("исходный набор не портится", () => {
    const anvil = ownFeat("feat-nakovalnya");
    const before = { ...emptyAbilityScores(), strength: 12 };

    abilitiesWithFeat(before, anvil);

    expect(before.strength).toBe(12);
  });
});

describe("показ черт персонажа", () => {
  it("черты берутся по id и в порядке набора, а не взятия", () => {
    const feats = allFeats(srdTopics);
    const taken = character({ feats: ["feat-pamyatlivy", "feat-zhilisty"] });

    expect(featsOf(taken, feats).map((f) => f.id)).toEqual(["feat-zhilisty", "feat-pamyatlivy"]);
  });

  it("старое сохранение с неизвестным id открывается, а не падает", () => {
    const feats = allFeats(srdTopics);
    const legacy = character({ feats: ["feat-udalyonnaya", "feat-zhilisty"] });

    expect(featsOf(legacy, feats).map((f) => f.id)).toEqual(["feat-zhilisty"]);
  });

  it("у кого черт нет — список пуст, как раньше", () => {
    expect(featsOf(character(), allFeats(srdTopics))).toEqual([]);
  });
});

describe("подпись на шаге «Итог» мастера", () => {
  it("называет и правило, и уровень первой точки выбора", () => {
    const hint = firstFeatLevelHint(4);

    expect(hint).toContain("Черт у персонажа 1 уровня нет");
    expect(hint).toContain("на 4 уровне");
  });

  it("класс не выбран — уровень не выдумывается", () => {
    const hint = firstFeatLevelHint(undefined);

    expect(hint).toContain("Черт у персонажа 1 уровня нет");
    expect(hint).not.toContain("уровне;");
  });
});
