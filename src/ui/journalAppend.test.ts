import { describe, expect, it } from "vitest";
import { APPEND_SEPARATOR, JOURNAL_ENTRY_MAX_LENGTH, appendedText } from "./journalEntryText";

/**
 * Страница дневника — лист, на котором пишут дальше, а не ячейка под одну
 * запись. Владелец 17.09.2026: «я сделал пометку на 100, потом хочу ещё
 * дописать в этот же блок, но получается мне уже нужно заводить новый,
 * а это как-то не правильно».
 */
describe("дописывание в страницу дневника", () => {
  it("короткая пометка дописывается через пустую строку", () => {
    expect(appendedText("Вышли из города на рассвете.", "К полудню нашли брод.")).toBe(
      `Вышли из города на рассвете.${APPEND_SEPARATOR}К полудню нашли брод.`,
    );
  });

  it("место на странице расходуется до предела, а не по одной записи на лист", () => {
    // Ровно та потеря, на которую пожаловался владелец: пометка в 100 знаков
    // не должна съедать страницу целиком.
    const page = "п".repeat(100);
    const note = "н".repeat(100);

    const merged = appendedText(page, note);

    expect(merged).not.toBeNull();
    expect(merged).toHaveLength(100 + APPEND_SEPARATOR.length + 100);
  });

  it("страница заполняется до предела включительно", () => {
    const note = "н".repeat(50);
    const page = "п".repeat(JOURNAL_ENTRY_MAX_LENGTH - APPEND_SEPARATOR.length - note.length);

    const merged = appendedText(page, note);

    expect(merged).not.toBeNull();
    expect(merged).toHaveLength(JOURNAL_ENTRY_MAX_LENGTH);
  });

  it("если не влезает даже на знак — страница закончилась", () => {
    // null здесь значит «начинай новый лист», и это единственный способ его
    // начать: иначе страница молча потеряла бы хвост, как было до правки.
    const note = "н".repeat(50);
    const page = "п".repeat(JOURNAL_ENTRY_MAX_LENGTH - APPEND_SEPARATOR.length - note.length + 1);

    expect(appendedText(page, note)).toBeNull();
  });

  it("пустая страница не начинается с разделителя", () => {
    // Вырожденный случай: если лист пуст, дописывать не к чему.
    const merged = appendedText("", "Первая пометка.");

    expect(merged).toBe("Первая пометка.");
  });
});
