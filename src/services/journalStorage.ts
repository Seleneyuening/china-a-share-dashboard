import type { DailyJournalEntry } from "../types/marketJournal";

const entriesKey = "global-market-v5-journal";
const maxEntries = 90;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export const journalStorage = {
  getEntries(): DailyJournalEntry[] {
    return readJson<DailyJournalEntry[]>(entriesKey, []).sort((a, b) => a.date.localeCompare(b.date));
  },
  getEntry(date: string): DailyJournalEntry | undefined {
    return this.getEntries().find((entry) => entry.date === date);
  },
  upsertEntry(entry: DailyJournalEntry): void {
    const existing = this.getEntries().filter((row) => row.date !== entry.date);
    const merged = [...existing, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-maxEntries);
    localStorage.setItem(entriesKey, JSON.stringify(merged));
  },
  updateNote(date: string, note: string): void {
    const entries = this.getEntries().map((entry) => (entry.date === date ? { ...entry, note } : entry));
    localStorage.setItem(entriesKey, JSON.stringify(entries));
  },
};
