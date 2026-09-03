import type { JournalEntry } from "../../state/types";

export const JOURNAL_COLUMN_BUDGET = 520;
export const JOURNAL_ENTRY_OVERHEAD = 100;

export interface JournalSpread {
  left: JournalEntry[];
  right: JournalEntry[];
}

function entryCost(entry: JournalEntry): number {
  const extraLineCost = (entry.text.match(/\n/g) ?? []).length * 28;
  return entry.text.length + extraLineCost + JOURNAL_ENTRY_OVERHEAD;
}

export function packJournalEntries(
  entries: JournalEntry[],
  columnBudget = JOURNAL_COLUMN_BUDGET,
): JournalSpread[] {
  if (entries.length === 0) return [];

  const columns: JournalEntry[][] = [];
  let currentColumn: JournalEntry[] = [];
  let currentCost = 0;

  for (const entry of entries) {
    const cost = entryCost(entry);
    if (currentColumn.length > 0 && currentCost + cost > columnBudget) {
      columns.push(currentColumn);
      currentColumn = [];
      currentCost = 0;
    }

    currentColumn.push(entry);
    currentCost += cost;

    if (cost > columnBudget) {
      columns.push(currentColumn);
      currentColumn = [];
      currentCost = 0;
    }
  }

  if (currentColumn.length > 0) columns.push(currentColumn);

  const spreads: JournalSpread[] = [];
  for (let index = 0; index < columns.length; index += 2) {
    spreads.push({ left: columns[index], right: columns[index + 1] ?? [] });
  }
  return spreads;
}
