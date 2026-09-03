import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../state/types";
import { packJournalEntries } from "./journalPagination";

function entry(id: string, length: number): JournalEntry {
  return { id, timestamp: "2026-01-01T00:00:00.000Z", text: "x".repeat(length) };
}

describe("packJournalEntries", () => {
  it("packs several short entries into each column", () => {
    const spreads = packJournalEntries(Array.from({ length: 8 }, (_, index) => entry(`${index}`, 10)), 450);

    expect(spreads).toHaveLength(1);
    expect(spreads[0].left).toHaveLength(4);
    expect(spreads[0].right).toHaveLength(4);
  });

  it("keeps an entry longer than a column atomic and alone", () => {
    const entries = [entry("short-before", 10), entry("long", 600), entry("short-after", 10)];
    const spreads = packJournalEntries(entries, 450);

    expect(spreads.flatMap(({ left, right }) => [left, right])).toContainEqual([entries[1]]);
  });

  it("preserves every entry exactly once across multiple spreads", () => {
    const entries = Array.from({ length: 11 }, (_, index) => entry(`${index}`, 40 + index * 35));
    const packed = packJournalEntries(entries, 450)
      .flatMap(({ left, right }) => [...left, ...right]);

    expect(packed.map(({ id }) => id)).toEqual(entries.map(({ id }) => id));
  });
});
