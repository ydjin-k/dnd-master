import { describe, it, expect } from "vitest";
import bundledBestiary from "../../../src-tauri/bestiary/bestiary.json";
import bundledOwnCreatures from "../../../src-tauri/bestiary/own-creatures.json";
import bundledSpells from "../../../src-tauri/rules/spells.json";
import {
  EVENT_TABLES,
  OWNER_AUTHORED_EIGHT_THEMES,
  OWNER_SUPPLIED,
  TABLE_GROUPS,
  findCoverageGap,
  findTable,
  nextTables,
  rollExpression,
  rowForRoll,
  type EventTable,
} from "./index";

/** Копия таблицы с подменёнными строками — чтобы ломать её, не трогая данные. */
function withRows(table: EventTable, rows: EventTable["rows"]): EventTable {
  return { ...table, rows };
}

describe("таблицы генератора событий", () => {
  it("каждая таблица закрывает свою кость без дыр и нахлёстов", () => {
    const broken = EVENT_TABLES.map(findCoverageGap).filter((gap) => gap !== null);
    expect(broken).toEqual([]);
  });

  it("кость берётся у таблицы, а не у вызывающего кода", () => {
    // Разброс костей в переданных документах — это не догадка: он и есть
    // причина, по которой кость обязана жить в таблице.
    const dice = new Set(EVENT_TABLES.map((t) => t.die));
    expect(dice.size).toBeGreaterThan(1);
    expect(rollExpression(findTable("fey-marks")!)).toBe("1d8");
    expect(rollExpression(findTable("plot-twists")!)).toBe("1d150");
    expect(rollExpression(findTable("battle-11")!)).toBe("1d6");
  });

  it("у каждой таблицы записано происхождение, а id не повторяются", () => {
    const ids = EVENT_TABLES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const table of EVENT_TABLES) {
      expect(table.source).not.toBe("");
      expect(TABLE_GROUPS).toContain(table.group as (typeof TABLE_GROUPS)[number]);
    }
  });

  it("каждое число кости находит свою строку", () => {
    for (const table of EVENT_TABLES) {
      for (let n = 1; n <= table.die; n += 1) {
        expect(rowForRoll(table, n), `${table.id} → ${n}`).toBeDefined();
      }
    }
  });

  it("строка, ссылающаяся на заклинание, называет существующий id spells.json", () => {
    const known = new Set(bundledSpells.map((spell) => spell.id));
    for (const table of EVENT_TABLES) {
      for (const row of table.rows) {
        for (const id of row.spellIds ?? []) {
          expect(known.has(id), `${table.id} → ${row.from}: заклинание "${id}"`).toBe(true);
        }
      }
    }
  });

  // ── ссылки на бестиарий ───────────────────────────────────────────────────

  /**
   * Существа, на которые строка вправе сослаться: оба файла бестиария.
   *
   * Берутся настоящие файлы, а не фикстура. Ссылка со строки — это обещание
   * поднять с неё настоящий бой, и проверять его по выдуманному списку значило
   * бы проверять не то: ломается оно ровно тогда, когда из бестиария уезжает
   * существо, а строка про это не знает.
   */
  const KNOWN_MONSTERS = new Set(
    [...bundledBestiary, ...bundledOwnCreatures].map((monster) => monster.id),
  );

  /** Первая ссылка таблицы на несуществующее существо, иначе null. */
  function findUnknownMonster(table: EventTable): string | null {
    for (const row of table.rows) {
      for (const id of row.monsterIds ?? []) {
        if (!KNOWN_MONSTERS.has(id)) {
          return `${table.id} → строка ${row.from}: существа «${id}» в бестиарии нет`;
        }
      }
    }
    return null;
  }

  it("строка, ставящая существо на стол, называет существующий id бестиария", () => {
    const broken = EVENT_TABLES.map(findUnknownMonster).filter((hit) => hit !== null);
    expect(broken).toEqual([]);
  });

  it("ссылка на несуществующее существо краснеет и называет место", () => {
    // Отрицательная проба: без неё зелёный цвет предыдущей ничего не значит.
    const table = findTable("underdark-traders")!;
    const broken = withRows(
      table,
      table.rows.map((row) =>
        row.from === 4 ? { ...row, monsterIds: ["rybolyud-kotorogo-net"] } : row,
      ),
    );
    const hit = findUnknownMonster(broken);
    expect(hit).toContain("строка 4");
    expect(hit).toContain("rybolyud-kotorogo-net");
  });

  // ── распределитель: строка, посылающая бросок дальше ──────────────────────

  it("строка посылает бросок только в существующую таблицу", () => {
    for (const table of EVENT_TABLES) {
      for (const row of table.rows) {
        for (const id of row.rollTableIds ?? []) {
          expect(findTable(id), `${table.id} → строка ${row.from}: таблица "${id}"`).toBeDefined();
        }
        // Круг замкнул бы цепочку броска на себе и подвесил генератор.
        expect(row.rollTableIds ?? []).not.toContain(table.id);
      }
    }
  });

  it("распределитель Подземья шлёт в обе таблицы, и порядок звеньев — его", () => {
    const check = findTable("underdark-encounter-check")!;
    expect(check.die).toBe(20);
    expect(nextTables(rowForRoll(check, 1)!)).toEqual([]);
    expect(nextTables(rowForRoll(check, 14)!).map((t) => t.id)).toEqual([
      "underdark-terrain-encounters",
    ]);
    expect(nextTables(rowForRoll(check, 16)!).map((t) => t.id)).toEqual([
      "underdark-creature-encounters",
    ]);
    // «И то, и другое» — ДВА результата, местность первой: один смешанный
    // соврал бы про исходник, где столкновения тоже два.
    expect(nextTables(rowForRoll(check, 18)!).map((t) => t.id)).toEqual([
      "underdark-terrain-encounters",
      "underdark-creature-encounters",
    ]);
  });

  it("правило двух проверок в день видно игроку, а не спрятано в комментарии", () => {
    const check = findTable("underdark-encounter-check")!;
    expect(check.sourceNote).toContain("ДВЕ проверки");
    expect(check.sourceNote).toContain("привал");
  });

  // ── подпись происхождения восьми тем ──────────────────────────────────────

  /**
   * Разделы восьми тем — хвост `TABLE_GROUPS` после прежних пяти. Берутся
   * оттуда, а не переписываются списком: владелец порядка разделов один.
   */
  const EIGHT_THEME_GROUPS: readonly string[] = TABLE_GROUPS.slice(5);

  /**
   * Таблица восьми тем, подписанная чужой подписью, — иначе `null`.
   *
   * Подпись у этих 34 таблиц обязана отличаться от `OWNER_SUPPLIED`: та
   * говорит «пометок авторства в исходнике нет», а этот документ объявляет
   * авторство сам, первой страницей. Прежняя подпись на нём — не
   * неточность, а неправда игроку, поэтому у неё есть страж.
   */
  function findWrongProvenance(table: EventTable): string | null {
    if (!EIGHT_THEME_GROUPS.includes(table.group)) return null;
    if (table.source !== OWNER_AUTHORED_EIGHT_THEMES) {
      return `${table.id} → source: подпись не своя`;
    }
    if (table.sourceNote !== OWNER_AUTHORED_EIGHT_THEMES) {
      return `${table.id} → sourceNote: игрок не увидит подписи`;
    }
    return null;
  }

  it("все 34 таблицы восьми тем подписаны своей подписью, и она видна игроку", () => {
    const signed = EVENT_TABLES.filter((t) => EIGHT_THEME_GROUPS.includes(t.group));
    expect(signed).toHaveLength(34);
    expect(signed.map(findWrongProvenance).filter((hit) => hit !== null)).toEqual([]);
    // Подпись — текст на экране: она называет, ЧТО игрок держит в руках.
    expect(OWNER_AUTHORED_EIGHT_THEMES).toContain("Авторский сборник владельца");
    expect(OWNER_AUTHORED_EIGHT_THEMES).toContain("не перепечатка таблиц");
    expect(OWNER_AUTHORED_EIGHT_THEMES).not.toBe(OWNER_SUPPLIED);
  });

  it("ни один из восьми новых разделов не пуст", () => {
    // `AdventuresPage.tsx:257` рисует optgroup на КАЖДЫЙ раздел списка, даже
    // пустой: раздел без таблиц — пустой заголовок в выпадающем списке.
    for (const group of EIGHT_THEME_GROUPS) {
      const inGroup = EVENT_TABLES.filter((t) => t.group === group);
      expect(inGroup.length, `раздел «${group}»`).toBeGreaterThan(0);
    }
  });

  // ── отрицательные пробы: страж обязан краснеть, а не молчать ──────────────

  it("дыра в диапазонах краснеет и называет таблицу и незакрытое число", () => {
    const table = findTable("fey-marks")!;
    const holed = withRows(
      table,
      table.rows.filter((row) => row.from !== 5),
    );
    const gap = findCoverageGap(holed);
    expect(gap).toContain("Метки фей");
    expect(gap).toContain("5");
    expect(gap).toContain("d8");
  });

  it("дыра в слитой таблице грибов краснеет на числе из влитой части", () => {
    // Слияние тринадцати грибов Подземья в d100 первой волны сдвинуло кость до
    // d113. Дыру пробиваем в ВЛИТОЙ части: там ошибка нумерации и вероятна.
    const table = findTable("magic-mushrooms")!;
    expect(table.die).toBe(113);
    const holed = withRows(
      table,
      table.rows.filter((row) => row.from !== 107),
    );
    const gap = findCoverageGap(holed);
    expect(gap).toContain("Волшебные грибы");
    expect(gap).toContain("107");
    expect(gap).toContain("d113");
  });

  it("дыра в середине новой таблицы к6 краснеет и называет её кость", () => {
    // Восемь таблиц документа бросаются к6, остальные двадцать шесть — к8.
    // Дыру пробиваем в СЕРЕДИНЕ: у края её поймал бы и сдвиг нумерации.
    const table = findTable("chase-interference")!;
    expect(table.die).toBe(6);
    const holed = withRows(
      table,
      table.rows.filter((row) => row.from !== 3),
    );
    const gap = findCoverageGap(holed);
    expect(gap).toContain("Вмешательство");
    expect(gap).toContain("3");
    expect(gap).toContain("d6");
  });

  it("возврат прежней подписи на таблицу восьми тем краснеет", () => {
    // Снимаем починку: подписываем «Страну фей» прежней OWNER_SUPPLIED —
    // той самой строкой, которая для этого документа ложна.
    const table = findTable("planar-feywild")!;
    const reverted: EventTable = {
      ...table,
      source: OWNER_SUPPLIED,
      sourceNote: OWNER_SUPPLIED,
    };
    expect(findWrongProvenance(reverted)).toContain("source");
    // И отдельно — подпись, пропавшая с экрана, хотя в `source` она верна.
    expect(findWrongProvenance({ ...table, sourceNote: undefined })).toContain(
      "sourceNote",
    );
  });

  it("нахлёст диапазонов краснеет и называет таблицу и число", () => {
    const table = findTable("fey-marks")!;
    const overlapped = withRows(table, [
      ...table.rows,
      { from: 3, to: 3, text: "вторая строка на то же число" },
    ]);
    const gap = findCoverageGap(overlapped);
    expect(gap).toContain("Метки фей");
    expect(gap).toContain("3");
    expect(gap).toContain("2 строками");
  });

  it("строка за пределами кости краснеет", () => {
    const table = findTable("fey-marks")!;
    const overflowing = withRows(table, [
      ...table.rows,
      { from: 9, to: 9, text: "число, которого на кости нет" },
    ]);
    expect(findCoverageGap(overflowing)).toContain("9");
  });

  // ── сторож границы SRD ────────────────────────────────────────────────────

  /**
   * Чужие ярлыки, которых не должно быть в тексте, видимом игроку.
   *
   * **Чего этот сторож НЕ ловит.** Он ловит ВОЗВРАТ известного, а не появление
   * неизвестного: список ниже закрыт и выведен разбором 23–24.09.2026, новое
   * чужое имя он не опознает. Зелёная проба — не доказательство чистоты
   * таблиц, а доказательство того, что уже вычищенное не приехало обратно.
   * Нашёл новое слово, которого нет в SRD, — не чини молча: «нет в SRD» и
   * «принадлежит Wizards» это не одно и то же, решает владелец.
   *
   * **Проверено и ЗАКОННО, основой сюда не давать и в тексте не «чинить»:**
   * «Оркус» и «Мефистофель» (названы в тексте класса Колдун в `rules.json`),
   * «Дроу», «Мимик», «Дуэргар», «лютый волк», «свирфнеблин», «гримлок»,
   * «хобгоблин», «саламандра» (лежат в нашем бестиарии), «Девять Преисподних»
   * (в SRD есть; чужим было только слово «Баатор»), боги SRD из
   * `appendices-pantheons` — «Апеп», «Гермод», «Анубис».
   *
   * **Основой берётся ЧУЖОЕ слово, а не наше новое имя** — наши имена ловят
   * законные строки и красят сторож на собственном тексте студии:
   * «жук» — четыре строки об обычных жуках; «грабе» — «грабежей» и слово
   * ИГРАБЕЛЬНАЯ; «смотрящ» — авторская черта владельца «Смотрящий во Тьму»;
   * «наблюдат» — «одна звезда начинает двигаться к наблюдателю». По той же
   * причине основа «миконид» написана целиком, а не «микони»: иначе она ловит
   * гриб «Миконис Лакусти», а он — стиль документа владельца, не существо.
   *
   * **«Троглодит» сюда не входит намеренно** (решение владельца 24.09.2026):
   * слово собирательное, греческое «живущий в пещере», Wizards не принадлежит.
   * Тот же класс ложных попаданий, что 22 «страдания» против Страда.
   *
   * Сторож ходит ТОЛЬКО по видимому игроку тексту — строки, `sourceNote`
   * (он показывается, `AdventuresPage.tsx:197`) и имя таблицы. Комментарии
   * модулей он не читает намеренно: «бехолдер» в комментарии
   * `underdarkTerrainEncounters` описывает ещё не перенесённый раздел
   * исходника и игроку не показывается.
   */
  const FOREIGN_LABELS: ReadonlyArray<readonly [string, RegExp]> = [
    ["Баатор", /баатор/i],
    ["баатезу", /баатезу/i],
    ["иллитид", /иллитид/i],
    ["минд флаер", /минд[\s-]*флаер|mind[\s-]*flayer/i],
    ["пожиратель разума", /пожирател\S*\s+разума/i],
    ["Старший разум", /старш\S*\s+разум/i],
    ["улей мозга", /ул[ьие]\S*\s+мозга/i],
    ["рраккама", /рраккам/i],
    ["гитзераи", /гитзера|гитцера|githzerai/i],
    ["юань-ти", /юань-ти|юан-ти|yuan-?ti/i],
    ["драколич", /драколич/i],
    ["куо-тоа", /куо-тоа|куотоа|kuo-?toa/i],
    ["миконид", /миконид|myconid/i],
    ["умбер-халк", /умбер|халк|увален|umber[\s-]*hulk/i],
    ["слаад", /слаад|slaad/i],
    ["грелль", /грелл|grell/i],
    ["бехолдер", /бехолдер|злобоглаз|beholder|spectator/i],
    ["Тиамат", /тиамат|tiamat/i],
    ["Тимора", /тимора|tymora/i],
    ["Шаресс", /шаресс|sharess/i],
    ["табакси", /табакси|tabaxi/i],
    ["аасимар", /аасимар|aasimar/i],
    ["голиаф", /голиаф|goliath/i],
    ["фирболг", /фирболг|firbolg/i],
    ["тритон (морской народ)", /тритонск|тритоны/i],
    ["варфордж", /варфордж|warforged|эберрон|eberron/i],
    ["Spell plague", /spell\s*plague|спелл-?плаг|спеллплейг/i],
    ["System Shock", /system\s*shock/i],
    ["Circle Of Teleportation", /circle\s+of\s+teleportation/i],
    ["Dire wolves", /dire\s+wolves/i],
    ["Fool's Gold", /fool'?s\s+(gold|platina)/i],
    ["Drow (латиницей)", /\bDrow\b/],
  ];

  /** Первый чужой ярлык в видимом игроку тексте таблицы, иначе null. */
  function findForeignLabel(table: EventTable): string | null {
    const places: ReadonlyArray<readonly [string, string]> = [
      [`${table.id} → имя таблицы`, table.name],
      [`${table.id} → sourceNote`, table.sourceNote ?? ""],
      ...table.rows.map(
        (row) => [`${table.id} → строка ${row.from}`, row.text] as const,
      ),
    ];
    for (const [where, text] of places) {
      for (const [label, pattern] of FOREIGN_LABELS) {
        if (pattern.test(text)) return `${where}: чужой ярлык «${label}»`;
      }
    }
    return null;
  }

  it("в тексте, видимом игроку, нет чужих ярлыков", () => {
    const found = EVENT_TABLES.map(findForeignLabel).filter((hit) => hit !== null);
    expect(found).toEqual([]);
  });

  it("сторож краснеет на возврате чужого ярлыка в строку", () => {
    // Снимаем починку на одной строке — той самой, где «Куо-тоа» стали
    // «Рыболюдами», — и убеждаемся, что сторож это видит и называет место.
    const table = findTable("underdark-events")!;
    const returned = withRows(
      table,
      table.rows.map((row) =>
        row.from === 38
          ? { ...row, text: "Куо-тоа несут на носилках обычный камень." }
          : row,
      ),
    );
    const hit = findForeignLabel(returned);
    expect(hit).toContain("строка 38");
    expect(hit).toContain("куо-тоа");
  });

  it("сторож краснеет на возврате чужого ярлыка в sourceNote", () => {
    // `sourceNote` показывается игроку наравне со строками, и невод обязан
    // идти по нему так же — иначе ярлык прячется в заметке.
    const table = findTable("adventure-hooks")!;
    const returned: EventTable = {
      ...table,
      sourceNote: "Снято 5 пунктов про варфорджей (Эберрон, другой сеттинг).",
    };
    expect(findForeignLabel(returned)).toContain("sourceNote");
  });

  it("сторож молчит на законных словах, похожих на чужие", () => {
    // Ложные попадания, на которых он уже спотыкался бы, будь основы шире:
    // наши новые имена, авторская черта владельца и обычные слова языка.
    const table = findTable("fey-marks")!;
    const legal = withRows(table, [
      { from: 1, to: 8, text: [
        "Рыболюды молятся ржавой вилке, Миколюды несут споры, Бурый жук ломает стену.",
        "Личинки Красного Грабера попали в улов; в деле замешаны дроу и дуэргары.",
        "Культ бога воров живёт с грабежей. Сушёный жук с металлическим блеском.",
        "Черта «Смотрящий во Тьму»; фонарь показывает каждому смотрящему направление.",
        "Одна звезда начинает двигаться к наблюдателю. Троглодиты заняли склад.",
        "Руна Оркуса и общество Мефистофеля; сделка в Девяти Преисподних.",
        "Миконис Лакусти (Myconis Lacusti) — гриб, а не существо.",
        "Тролль, наполненный кровью огненного тритона. Мучительные страдания.",
      ].join(" ") },
    ]);
    expect(findForeignLabel(legal)).toBeNull();
  });
});
