export type PatternOperator = "lte" | "gte" | "lt" | "gt" | "eq";

export type PatternCondition =
  | { kind: "group_rank"; groupId: string; operator: PatternOperator; value: number }
  | { kind: "group_rank_streak"; groupId: string; rank: number; minDays: number }
  | { kind: "group_top50_count"; groupId: string; operator: PatternOperator; value: number }
  | { kind: "group_concentration"; groupId: string; operator: PatternOperator; value: number }
  | { kind: "stock_change_pct"; symbol: string; operator: PatternOperator; value: number }
  | { kind: "stock_top50_rank"; symbol: string; operator: PatternOperator | "new"; value: number }
  | { kind: "stock_rank_move"; symbol: string; operator: PatternOperator; value: number }
  | { kind: "satellite_change_pct"; symbol: string; operator: PatternOperator; value: number };

export type PatternDefinition = {
  id: string;
  name: string;
  conditions: PatternCondition[];
  focusSymbol: string;
  windows: number[];
  createdAt: string;
};

export type PatternForwardWindowStats = {
  window: number;
  sampleSize: number;
  medianFocusReturnPct?: number;
  medianBenchmarkReturnPct?: number;
  bestCasePct?: number;
  worstCasePct?: number;
  maxDrawdownPct?: number;
};

export type PatternMatchResult = {
  matchedDates: string[];
  forwardStats: PatternForwardWindowStats[];
};
