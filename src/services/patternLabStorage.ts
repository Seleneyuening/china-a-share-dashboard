import type { PatternDefinition } from "../types/patternLab";

const patternsKey = "global-market-v6-patterns";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export const patternLabStorage = {
  getPatterns(): PatternDefinition[] {
    return readJson<PatternDefinition[]>(patternsKey, []);
  },
  savePatterns(patterns: PatternDefinition[]): void {
    localStorage.setItem(patternsKey, JSON.stringify(patterns));
  },
  addPattern(pattern: PatternDefinition): void {
    this.savePatterns([pattern, ...this.getPatterns()]);
  },
  removePattern(id: string): void {
    this.savePatterns(this.getPatterns().filter((pattern) => pattern.id !== id));
  },
};
