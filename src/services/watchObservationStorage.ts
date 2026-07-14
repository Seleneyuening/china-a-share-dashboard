import type { WatchObservation } from "../types/marketJournal";

const storageKey = "global-market-v5-watch";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export const watchObservationStorage = {
  getAll(): WatchObservation[] {
    return readJson<WatchObservation[]>(storageKey, []);
  },
  save(observations: WatchObservation[]): void {
    localStorage.setItem(storageKey, JSON.stringify(observations));
  },
  add(observation: WatchObservation): void {
    this.save([observation, ...this.getAll()]);
  },
  end(id: string): void {
    const today = new Date().toISOString().slice(0, 10);
    this.save(this.getAll().map((row) => (row.id === id ? { ...row, status: "ended", endedAt: today } : row)));
  },
  updateNote(id: string, note: string): void {
    this.save(this.getAll().map((row) => (row.id === id ? { ...row, note } : row)));
  },
  remove(id: string): void {
    this.save(this.getAll().filter((row) => row.id !== id));
  },
};
