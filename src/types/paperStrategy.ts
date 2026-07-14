import type { PatternCondition } from "./patternLab";

export type SelectionRule = {
  groupId: string;
  rankBy: "dollarVolume" | "changePct";
  top: number;
  requirePositiveChange?: boolean;
};

export type PaperStrategy = {
  id: string;
  name: string;
  entry_conditions: PatternCondition[];
  selection_rule: SelectionRule;
  hold_days: number;
  max_positions: number;
  allocation_pct?: number | null;
  enabled: boolean;
  created_at: string;
};

export type PaperTriggerSnapshot = {
  groupId?: string;
  groupRank?: number;
  groupDollarVolume?: number;
  satellites?: Record<string, number | undefined>;
};

export type PaperPosition = {
  id: string;
  strategy_id: string;
  symbol: string;
  opened_at: string;
  entry_price: number;
  quantity: number;
  closed_at?: string;
  exit_price?: number;
  status: "open" | "closed";
  trigger_snapshot?: PaperTriggerSnapshot;
  created_at: string;
};

export type PaperPortfolioSnapshot = {
  date: string;
  cash: number;
  equity: number;
  daily_return?: number;
  cumulative_return?: number;
  qqq_cumulative_return?: number;
  spy_cumulative_return?: number;
  drawdown?: number;
  created_at: string;
};
