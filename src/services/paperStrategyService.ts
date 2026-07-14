import type { PatternCondition } from "../types/patternLab";
import type { PaperPortfolioSnapshot, PaperPosition, PaperStrategy, SelectionRule } from "../types/paperStrategy";

export type NewPaperStrategyInput = { name: string; entry_conditions: PatternCondition[]; selection_rule: SelectionRule; hold_days: number; max_positions: number; allocation_pct?: number };
const key = "a-share-dashboard-paper-strategies";
const read = (): PaperStrategy[] => { try { return JSON.parse(localStorage.getItem(key) || "[]") as PaperStrategy[]; } catch { return []; } };
const save = (items: PaperStrategy[]) => localStorage.setItem(key, JSON.stringify(items));

export const paperStrategyService = {
  async listStrategies() { return read(); },
  async createStrategy(input: NewPaperStrategyInput) {
    const strategy: PaperStrategy = { ...input, id: crypto.randomUUID(), enabled: true, allocation_pct: input.allocation_pct ?? null, created_at: new Date().toISOString() };
    save([strategy, ...read()]); return strategy;
  },
  async toggleStrategy(id: string, enabled: boolean) { save(read().map((item) => item.id === id ? { ...item, enabled } : item)); },
  async deleteStrategy(id: string) { save(read().filter((item) => item.id !== id)); },
  async setAllocation(id: string, allocation_pct: number | null) { save(read().map((item) => item.id === id ? { ...item, allocation_pct } : item)); },
  async listPositions(_strategyId?: string): Promise<PaperPosition[]> { return []; },
  async listPortfolioSnapshots(): Promise<PaperPortfolioSnapshot[]> { return []; },
};

export type StrategyStats = { sampleSize: number; winRate?: number; medianReturnPct?: number; bestReturnPct?: number; worstReturnPct?: number; maxDrawdownPct?: number };
export function buildStrategyStats(positions: PaperPosition[]): StrategyStats {
  const returns = positions.filter((item): item is PaperPosition & { exit_price: number } => item.status === "closed" && typeof item.exit_price === "number").map((item) => (item.exit_price - item.entry_price) / item.entry_price * 100);
  if (!returns.length) return { sampleSize: 0 };
  const sorted = [...returns].sort((a, b) => a - b);
  return { sampleSize: returns.length, winRate: Number((returns.filter((value) => value > 0).length / returns.length * 100).toFixed(1)), medianReturnPct: sorted[Math.floor(sorted.length / 2)], bestReturnPct: sorted[sorted.length - 1], worstReturnPct: sorted[0], maxDrawdownPct: Math.min(...returns) };
}
