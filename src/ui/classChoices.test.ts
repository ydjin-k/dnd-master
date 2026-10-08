import { describe, expect, it } from "vitest";
import {
  CLASS_CHOICES,
  chosenClassChoices,
  classChoiceKnownAt,
  classChoiceOptionsAt,
  classChoicesFor,
  pendingChoiceAmong,
  pendingClassChoice,
  type ClassChoice,
} from "./characterCreationData";

/**
 * Пробы ОБЩЕГО механизма классового выбора — того, что заводит карточка
 * `characters-class-blood-hunter` и что достанется Изобретателю (инфузии) и
 * Алхимику (формулы).
 *
 * ПОЧЕМУ НА ВЫДУМАННЫХ ДАННЫХ, а не на проклятьях крови. Механизм обязан быть
 * общим, и проба, написанная на проклятьях, сторожила бы проклятья. Здесь у
 * выборов свои ступени, свои требования уровня и два выбора у одного класса —
 * то есть ровно те случаи, которых у первого пользователя нет и которые иначе
 * никто не проверит до второй карточки. Сами проклятья проверяются отдельно
 * (`bloodHunterClass.test.ts`), и там же — что они подключены.
 */
const INFUSIONS: ClassChoice = {
  id: "test-infusions",
  name: "Инфузии",
  unit: "инфузию",
  // Лесенка «с какого уровня сколько ВСЕГО», с пропущенными уровнями между.
  knownByLevel: [
    [2, 4],
    [6, 5],
    [10, 6],
  ],
  options: [
    { id: "inf-a", name: "Усиленная защита", description: "Доспех даёт +1 к КД." },
    { id: "inf-b", name: "Возвращающееся оружие", description: "Брошенное оружие возвращается в руку." },
    { id: "inf-c", name: "Сумка хранения", description: "Вмещает больше, чем кажется." },
    { id: "inf-d", name: "Репульсивный щит", description: "Отталкивает атакующего.", minLevel: 6 },
    { id: "inf-e", name: "Зеркало прозрения", description: "Показывает скрытое.", minLevel: 10 },
    { id: "inf-f", name: "Броня магнитных сил", description: "Притягивает металл." },
  ],
};

const SECOND_CHOICE: ClassChoice = {
  id: "test-second",
  name: "Тайные секреты",
  unit: "секрет",
  knownByLevel: [[1, 1]],
  options: [
    { id: "sec-a", name: "Первый секрет", description: "Один." },
    { id: "sec-b", name: "Второй секрет", description: "Два." },
  ],
};

describe("classChoiceKnownAt — сколько вариантов открыто на уровне", () => {
  it("ниже первой ступени не открыто ничего: выбора ещё нет", () => {
    // Важный случай: выбор может начинаться не на 1 уровне, и мастер создания
    // обязан такой выбор НЕ спрашивать, а не спросить «ноль вариантов».
    expect(classChoiceKnownAt(INFUSIONS, 1)).toBe(0);
  });

  it("берётся последняя подошедшая ступень, а не первая и не следующая", () => {
    const byLevel = Array.from({ length: 12 }, (_, i) => classChoiceKnownAt(INFUSIONS, i + 1));

    expect(byLevel).toEqual([0, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6]);
  });

  it("выбор с одной ступенью открыт с первого же уровня и не растёт", () => {
    expect([1, 5, 12].map((level) => classChoiceKnownAt(SECOND_CHOICE, level))).toEqual([1, 1, 1]);
  });
});

describe("classChoiceOptionsAt — какие варианты доступны на уровне", () => {
  it("вариант с требованием уровня до него не показывается", () => {
    const at2 = classChoiceOptionsAt(INFUSIONS, 2).map((o) => o.id);
    const at6 = classChoiceOptionsAt(INFUSIONS, 6).map((o) => o.id);
    const at10 = classChoiceOptionsAt(INFUSIONS, 10).map((o) => o.id);

    expect(at2).toEqual(["inf-a", "inf-b", "inf-c", "inf-f"]);
    expect(at6).toContain("inf-d");
    expect(at6).not.toContain("inf-e");
    expect(at10).toContain("inf-e");
  });

  it("порядок списка сохраняется — он осмысленный, а не случайный", () => {
    expect(classChoiceOptionsAt(INFUSIONS, 12).map((o) => o.id)).toEqual(
      INFUSIONS.options.map((o) => o.id),
    );
  });
});

describe("pendingChoiceAmong — пора ли спрашивать", () => {
  /** Класс с ДВУМЯ выборами: среди подключённых такого ещё нет, и порядок опроса проверяется только здесь. */
  const both = [INFUSIONS, SECOND_CHOICE];

  it("молчит, когда выбрано столько же, сколько открыто", () => {
    const chosen = {
      "test-infusions": ["inf-a", "inf-b", "inf-c", "inf-f"],
      "test-second": ["sec-a"],
    };

    expect(pendingChoiceAmong(both, 2, chosen)).toBeUndefined();
  });

  it("называет недостачу числом, а не просто «надо спросить»", () => {
    // На 2 уровне открыто четыре инфузии, выбрана одна — не хватает трёх.
    const result = pendingChoiceAmong(both, 2, { "test-infusions": ["inf-a"], "test-second": ["sec-a"] });

    expect(result?.choice.id).toBe(INFUSIONS.id);
    expect(result?.missing).toBe(3);
  });

  it("спрашивает выборы по порядку списка, по одному за раз", () => {
    // Оба недобраны: сперва первый, и только после него второй. Иначе панель
    // левел-апа пришлось бы делать многостраничной.
    const first = pendingChoiceAmong(both, 2, {});
    expect(first?.choice.id).toBe(INFUSIONS.id);

    const second = pendingChoiceAmong(both, 2, { "test-infusions": ["inf-a", "inf-b", "inf-c", "inf-f"] });
    expect(second?.choice.id).toBe(SECOND_CHOICE.id);
    expect(second?.missing).toBe(1);
  });

  it("ниже первой ступени не спрашивает: на 1 уровне инфузий ещё нет", () => {
    expect(pendingChoiceAmong([INFUSIONS], 1, {})).toBeUndefined();
    expect(pendingChoiceAmong([INFUSIONS], 2, {})?.missing).toBe(4);
  });

  it("выбранного больше, чем открыто, — не спрашивает и в минус не уходит", () => {
    // Так выглядит персонаж, у которого потолок выбора когда-то срезали:
    // лишнее не отнимается молча, но и новых вопросов не появляется.
    const chosen = { "test-infusions": ["inf-a", "inf-b", "inf-c", "inf-f", "inf-d"] };
    expect(pendingChoiceAmong([INFUSIONS], 2, chosen)).toBeUndefined();
  });

  it("у класса то же правило читается из таблицы: без выборов — молчит", () => {
    expect(pendingClassChoice("classes-fighter", 12, {})).toBeUndefined();
    expect(pendingClassChoice(null, 12, {})).toBeUndefined();
    expect(pendingClassChoice("classes-unknown", 12, undefined)).toBeUndefined();
  });
});

describe("chosenClassChoices — показ выбранного", () => {
  it("отдаёт варианты целиком: имя и текст, а не id и не число", () => {
    const shown = chosenClassChoices(Object.keys(CLASS_CHOICES)[0], {
      [CLASS_CHOICES[Object.keys(CLASS_CHOICES)[0]][0].id]: [
        CLASS_CHOICES[Object.keys(CLASS_CHOICES)[0]][0].options[0].id,
      ],
    });

    expect(shown).toHaveLength(1);
    expect(shown[0].options[0].name.length).toBeGreaterThan(0);
    expect(shown[0].options[0].description.length).toBeGreaterThan(20);
  });

  it("неизвестный id молча пропускается, а не роняет показ", () => {
    // Вариант могли переименовать или убрать; ни шаг «Итог», ни лист не должны
    // падать на сохранении, которое его помнит.
    const classId = Object.keys(CLASS_CHOICES)[0];
    const choiceId = CLASS_CHOICES[classId][0].id;
    const realId = CLASS_CHOICES[classId][0].options[0].id;

    const shown = chosenClassChoices(classId, { [choiceId]: ["нет-такого", realId] });
    expect(shown[0].options.map((o) => o.id)).toEqual([realId]);
  });

  it("пустой выбор не создаёт пустой строки показа", () => {
    const classId = Object.keys(CLASS_CHOICES)[0];
    expect(chosenClassChoices(classId, {})).toEqual([]);
    expect(chosenClassChoices(classId, undefined)).toEqual([]);
  });

  it("класс без выборов не показывает ничего", () => {
    expect(chosenClassChoices("classes-fighter", { "что-то": ["иное"] })).toEqual([]);
    expect(classChoicesFor("classes-fighter")).toEqual([]);
  });
});

describe("CLASS_CHOICES — общая таблица", () => {
  it("у каждого выбора непустой список вариантов, уникальные id и непустые тексты", () => {
    for (const [classId, choices] of Object.entries(CLASS_CHOICES)) {
      for (const choice of choices) {
        expect(choice.options.length, `${classId} / ${choice.id}`).toBeGreaterThan(0);
        const ids = choice.options.map((o) => o.id);
        expect(new Set(ids).size, `${classId} / ${choice.id}: дубль id`).toBe(ids.length);
        const names = choice.options.map((o) => o.name);
        expect(new Set(names).size, `${classId} / ${choice.id}: дубль имени`).toBe(names.length);
        for (const option of choice.options) {
          expect(option.name.trim().length, `${classId} / ${option.id}`).toBeGreaterThan(0);
          expect(option.description.trim().length, `${classId} / ${option.id}`).toBeGreaterThan(40);
        }
      }
    }
  });

  it("вариантов хватает на все уровни, где растёт столбец известного", () => {
    // Иначе панель левел-апа однажды попросит выбрать больше, чем есть из чего.
    for (const [classId, choices] of Object.entries(CLASS_CHOICES)) {
      for (const choice of choices) {
        for (const [level] of choice.knownByLevel) {
          const need = classChoiceKnownAt(choice, level);
          const have = classChoiceOptionsAt(choice, level).length;
          expect(have, `${classId} / ${choice.id} ур. ${level}: ${have} вариантов на ${need}`).toBeGreaterThanOrEqual(
            need,
          );
        }
      }
    }
  });

  it("ступени идут по возрастанию уровня и по возрастанию числа", () => {
    for (const [classId, choices] of Object.entries(CLASS_CHOICES)) {
      for (const choice of choices) {
        const steps = choice.knownByLevel;
        for (let i = 1; i < steps.length; i++) {
          expect(steps[i][0], `${classId} / ${choice.id}`).toBeGreaterThan(steps[i - 1][0]);
          expect(steps[i][1], `${classId} / ${choice.id}`).toBeGreaterThan(steps[i - 1][1]);
        }
      }
    }
  });
});
