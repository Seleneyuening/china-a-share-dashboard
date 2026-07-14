import { buildDailyAggregates } from "./patternLabService";
import type { DailySnapshotRow } from "../types/snapshotHistory";
import type { WatchlistGroup } from "../types/themeGroup";
import type { PaperPosition, PaperPortfolioSnapshot, PaperStrategy } from "../types/paperStrategy";
import type { PatternCondition } from "../types/patternLab";

export type MarketRegimeState = "tech-risk-on" | "broad-risk-on" | "risk-off" | "volatility-expansion" | "defensive-rotation" | "mixed";

export type MarketRegime = {
  state: MarketRegimeState;
  stateLabel: string;
  confidence: number;
  evidence: string[];
  risks: string[];
  latestDate?: string;
};

const regimeLabels: Record<MarketRegimeState, string> = {
  "tech-risk-on": "科技主导型 Risk-On",
  "broad-risk-on": "普涨型 Risk-On",
  "risk-off": "Risk-Off 风险回避",
  "volatility-expansion": "波动率扩张",
  "defensive-rotation": "防御轮动",
  mixed: "混合 / 无明显方向",
};

function pct(value: number | undefined): string {
  if (typeof value !== "number") return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function detectMarketRegime(history: DailySnapshotRow[], groups: WatchlistGroup[]): MarketRegime {
  const aggregates = buildDailyAggregates(history, groups);
  const dates = [...aggregates.keys()].sort();
  const latestDate = dates[dates.length - 1];
  if (!latestDate) return { state: "mixed", stateLabel: regimeLabels.mixed, confidence: 0, evidence: [], risks: ["暂无历史数据"], latestDate };

  const latest = aggregates.get(latestDate)!;
  const sat = (symbol: string) => latest.stocks.get(symbol)?.changePct;
  const qqq = sat("QQQ");
  const spy = sat("SPY");
  const soxl = sat("SOXL");
  const uvxy = sat("UVXY");

  const rankedStocks = [...latest.stocks.entries()].filter(([, stock]) => typeof stock.top50Rank === "number");
  const breadth = rankedStocks.length ? rankedStocks.filter(([, stock]) => (stock.changePct ?? 0) > 0).length / rankedStocks.length : 0;

  const aiGroup = latest.groups.get("ai-semiconductors");
  let aiStreak = 0;
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    const rank = aggregates.get(dates[i])?.groups.get("ai-semiconductors")?.rank;
    if (rank !== 1) break;
    aiStreak += 1;
  }
  const defensiveRanks = ["healthcare-pharma", "consumer-defensive"].map((id) => latest.groups.get(id)?.rank).filter((rank): rank is number => typeof rank === "number");
  const defensiveStrong = defensiveRanks.some((rank) => rank <= 3);

  type Candidate = { state: MarketRegimeState; rules: Array<{ hit: boolean; text: string }> };
  const candidates: Candidate[] = [
    {
      state: "tech-risk-on",
      rules: [
        { hit: aiStreak >= 2, text: `AI 算力组连续 ${aiStreak} 天排名第一` },
        { hit: typeof soxl === "number" && soxl > 1, text: `SOXL ${pct(soxl)}` },
        { hit: typeof qqq === "number" && qqq > 0, text: `QQQ ${pct(qqq)}` },
        { hit: typeof uvxy === "number" && uvxy < 0, text: `UVXY ${pct(uvxy)}` },
        { hit: breadth > 0.5, text: `Top 50 上涨股票占比 ${(breadth * 100).toFixed(0)}%` },
      ],
    },
    {
      state: "broad-risk-on",
      rules: [
        { hit: breadth > 0.65, text: `Top 50 上涨股票占比 ${(breadth * 100).toFixed(0)}%` },
        { hit: typeof qqq === "number" && qqq > 0, text: `QQQ ${pct(qqq)}` },
        { hit: typeof spy === "number" && spy > 0, text: `SPY ${pct(spy)}` },
        { hit: typeof uvxy === "number" && uvxy < 0, text: `UVXY ${pct(uvxy)}` },
      ],
    },
    {
      state: "risk-off",
      rules: [
        { hit: typeof qqq === "number" && qqq < -0.5, text: `QQQ ${pct(qqq)}` },
        { hit: typeof spy === "number" && spy < -0.3, text: `SPY ${pct(spy)}` },
        { hit: typeof uvxy === "number" && uvxy > 2, text: `UVXY ${pct(uvxy)}` },
        { hit: breadth < 0.4, text: `Top 50 上涨股票占比仅 ${(breadth * 100).toFixed(0)}%` },
      ],
    },
    {
      state: "volatility-expansion",
      rules: [
        { hit: typeof uvxy === "number" && uvxy > 5, text: `UVXY ${pct(uvxy)}，波动率快速上升` },
        { hit: typeof soxl === "number" && Math.abs(soxl) > 8, text: `SOXL 单日振幅 ${pct(soxl)}` },
      ],
    },
    {
      state: "defensive-rotation",
      rules: [
        { hit: defensiveStrong, text: "医疗/消费防御组排名进入前 3" },
        { hit: typeof qqq === "number" && qqq < 0, text: `QQQ ${pct(qqq)}` },
        { hit: breadth < 0.5, text: `Top 50 上涨股票占比 ${(breadth * 100).toFixed(0)}%` },
      ],
    },
  ];

  let best: { candidate: Candidate; hits: number; ratio: number } | undefined;
  for (const candidate of candidates) {
    const hits = candidate.rules.filter((rule) => rule.hit).length;
    const ratio = hits / candidate.rules.length;
    if (hits >= 2 && (!best || ratio > best.ratio)) best = { candidate, hits, ratio };
  }

  if (!best) {
    return {
      state: "mixed",
      stateLabel: regimeLabels.mixed,
      confidence: 0,
      evidence: [`QQQ ${pct(qqq)} · SPY ${pct(spy)} · SOXL ${pct(soxl)} · UVXY ${pct(uvxy)}`, `Top 50 上涨占比 ${(breadth * 100).toFixed(0)}%`],
      risks: [],
      latestDate,
    };
  }

  const risks: string[] = [];
  if (aiGroup && aiGroup.concentration > 60) risks.push(`AI 组资金集中度 ${aiGroup.concentration}%，上涨集中度偏高`);
  if (typeof uvxy === "number" && uvxy > 0 && best.candidate.state.includes("risk-on")) risks.push(`UVXY ${pct(uvxy)} 未回落，与 Risk-On 状态存在分歧`);
  if (breadth < 0.45 && best.candidate.state === "tech-risk-on") risks.push(`市场广度不足（上涨占比 ${(breadth * 100).toFixed(0)}%），依赖少数股票`);

  return {
    state: best.candidate.state,
    stateLabel: regimeLabels[best.candidate.state],
    confidence: Math.round(best.ratio * 100),
    evidence: best.candidate.rules.filter((rule) => rule.hit).map((rule) => rule.text),
    risks,
    latestDate,
  };
}

function strategyTags(conditions: PatternCondition[]): Set<string> {
  const tags = new Set<string>();
  for (const condition of conditions) {
    if ("groupId" in condition) {
      if (condition.groupId === "ai-semiconductors") tags.add("tech");
      if (condition.groupId === "cloud-ai-software") tags.add("tech");
      if (condition.groupId === "crypto-onchain") tags.add("crypto");
      if (condition.groupId === "healthcare-pharma" || condition.groupId === "consumer-defensive") tags.add("defensive");
    }
    if (condition.kind === "satellite_change_pct") {
      if (condition.symbol === "SOXL") tags.add("tech");
      if (condition.symbol === "UVXY" && condition.operator === "gt") tags.add("defensive");
    }
  }
  if (!tags.size) tags.add("neutral");
  return tags;
}

const fitMatrix: Record<string, Record<MarketRegimeState, number>> = {
  tech: { "tech-risk-on": 88, "broad-risk-on": 72, "risk-off": 25, "volatility-expansion": 40, "defensive-rotation": 22, mixed: 50 },
  crypto: { "tech-risk-on": 62, "broad-risk-on": 74, "risk-off": 15, "volatility-expansion": 35, "defensive-rotation": 18, mixed: 45 },
  defensive: { "tech-risk-on": 28, "broad-risk-on": 35, "risk-off": 82, "volatility-expansion": 70, "defensive-rotation": 88, mixed: 50 },
  neutral: { "tech-risk-on": 55, "broad-risk-on": 60, "risk-off": 40, "volatility-expansion": 45, "defensive-rotation": 45, mixed: 50 },
};

export function buildStrategyFit(strategy: PaperStrategy, regime: MarketRegime): number {
  const tags = strategyTags(strategy.entry_conditions);
  const scores = [...tags].map((tag) => fitMatrix[tag]?.[regime.state] ?? 50);
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

const factorLabels: Record<string, string> = {
  "ai-semiconductors": "AI 与半导体",
  "cloud-ai-software": "大型科技 / 云软件",
  "internet-attention": "大型科技 / 互联网",
  "space-mobility": "高波动成长",
  "crypto-onchain": "加密相关",
  "clean-energy-resources": "高波动成长",
  "healthcare-pharma": "医疗防御",
  "consumer-defensive": "消费防御",
};

export type ExposureEntry = { label: string; valueUsd: number; pctOfEquity: number };

export type PortfolioExposure = {
  totalPositionValue: number;
  bySymbol: ExposureEntry[];
  byTheme: ExposureEntry[];
  byFactor: ExposureEntry[];
  top5ConcentrationPct: number;
};

export function buildExposure(openPositions: PaperPosition[], latestPriceBySymbol: Map<string, number>, groups: WatchlistGroup[], equity: number): PortfolioExposure {
  const groupBySymbol = new Map<string, WatchlistGroup>();
  for (const group of groups) {
    if (group.satelliteOnly) continue;
    for (const symbol of group.symbols) groupBySymbol.set(symbol, group);
  }

  const symbolValues = new Map<string, number>();
  for (const position of openPositions) {
    const price = latestPriceBySymbol.get(position.symbol) ?? position.entry_price;
    symbolValues.set(position.symbol, (symbolValues.get(position.symbol) ?? 0) + price * position.quantity);
  }
  const totalPositionValue = [...symbolValues.values()].reduce((sum, value) => sum + value, 0);
  const safeEquity = Math.max(equity, 1);

  const bySymbol = [...symbolValues.entries()]
    .map(([symbol, valueUsd]) => ({ label: symbol, valueUsd, pctOfEquity: Number(((valueUsd / safeEquity) * 100).toFixed(1)) }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const themeValues = new Map<string, number>();
  const factorValues = new Map<string, number>();
  for (const [symbol, value] of symbolValues) {
    const group = groupBySymbol.get(symbol);
    const themeName = group?.name ?? "其他";
    themeValues.set(themeName, (themeValues.get(themeName) ?? 0) + value);
    const factorName = group ? (factorLabels[group.id] ?? "其他") : "其他";
    factorValues.set(factorName, (factorValues.get(factorName) ?? 0) + value);
  }

  const toEntries = (map: Map<string, number>): ExposureEntry[] =>
    [...map.entries()]
      .map(([label, valueUsd]) => ({ label, valueUsd, pctOfEquity: Number(((valueUsd / safeEquity) * 100).toFixed(1)) }))
      .sort((a, b) => b.valueUsd - a.valueUsd);

  const top5 = bySymbol.slice(0, 5).reduce((sum, entry) => sum + entry.pctOfEquity, 0);

  return {
    totalPositionValue,
    bySymbol,
    byTheme: toEntries(themeValues),
    byFactor: toEntries(factorValues),
    top5ConcentrationPct: Number(top5.toFixed(1)),
  };
}

export function calculateBenchmarkCorrelation(snapshots: PaperPortfolioSnapshot[], benchmark: "qqq_cumulative_return" | "spy_cumulative_return"): number | undefined {
  if (snapshots.length < 10) return undefined;
  const portfolioReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i += 1) {
    const portfolioDelta = (snapshots[i].cumulative_return ?? 0) - (snapshots[i - 1].cumulative_return ?? 0);
    const previousBench = snapshots[i - 1][benchmark];
    const currentBench = snapshots[i][benchmark];
    if (typeof previousBench !== "number" || typeof currentBench !== "number") continue;
    portfolioReturns.push(portfolioDelta);
    benchmarkReturns.push(currentBench - previousBench);
  }
  if (portfolioReturns.length < 9) return undefined;
  const meanA = portfolioReturns.reduce((sum, value) => sum + value, 0) / portfolioReturns.length;
  const meanB = benchmarkReturns.reduce((sum, value) => sum + value, 0) / benchmarkReturns.length;
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < portfolioReturns.length; i += 1) {
    const da = portfolioReturns[i] - meanA;
    const db = benchmarkReturns[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  if (!denomA || !denomB) return undefined;
  return Number((numerator / Math.sqrt(denomA * denomB)).toFixed(2));
}

export type StressPreset = {
  id: string;
  name: string;
  description: string;
  groupShocks: Record<string, number>;
  defaultShock: number;
};

export const stressPresets: StressPreset[] = [
  {
    id: "tech-pullback",
    name: "科技股回撤",
    description: "QQQ -5% / SOXL -12% / UVXY +18%",
    groupShocks: { "ai-semiconductors": -8, "cloud-ai-software": -6, "internet-attention": -5, "space-mobility": -6, "crypto-onchain": -6, "clean-energy-resources": -4, "healthcare-pharma": -1, "consumer-defensive": -1 },
    defaultShock: -5,
  },
  {
    id: "ai-cooldown",
    name: "AI 泡沫降温",
    description: "AI 与半导体平均 -10%，云软件 -6%，其他 -2%",
    groupShocks: { "ai-semiconductors": -10, "cloud-ai-software": -6, "internet-attention": -3, "space-mobility": -4, "crypto-onchain": -4, "clean-energy-resources": -2, "healthcare-pharma": -1, "consumer-defensive": -1 },
    defaultShock: -2,
  },
  {
    id: "risk-collapse",
    name: "风险偏好崩塌",
    description: "QQQ -8% / 加密相关 -15% / UVXY +35%",
    groupShocks: { "ai-semiconductors": -9, "cloud-ai-software": -8, "internet-attention": -7, "space-mobility": -10, "crypto-onchain": -15, "clean-energy-resources": -6, "healthcare-pharma": -3, "consumer-defensive": -2 },
    defaultShock: -8,
  },
  {
    id: "rate-spike",
    name: "利率快速上升",
    description: "高估值科技 -7%，防御 -1%",
    groupShocks: { "ai-semiconductors": -7, "cloud-ai-software": -7, "internet-attention": -5, "space-mobility": -8, "crypto-onchain": -9, "clean-energy-resources": -4, "healthcare-pharma": -1, "consumer-defensive": -1 },
    defaultShock: -4,
  },
  {
    id: "broad-selloff",
    name: "美股全面调整",
    description: "SPY -5% / QQQ -7%，主题相关性上升",
    groupShocks: { "ai-semiconductors": -8, "cloud-ai-software": -7, "internet-attention": -7, "space-mobility": -8, "crypto-onchain": -9, "clean-energy-resources": -6, "healthcare-pharma": -4, "consumer-defensive": -3 },
    defaultShock: -6,
  },
];

export type StressContribution = { label: string; lossUsd: number; lossPctOfEquity: number };

export type StressResult = {
  presetName: string;
  portfolioImpactPct: number;
  portfolioImpactUsd: number;
  byStock: StressContribution[];
  byStrategy: StressContribution[];
};

export function runStressTest(
  preset: StressPreset,
  openPositions: PaperPosition[],
  latestPriceBySymbol: Map<string, number>,
  groups: WatchlistGroup[],
  strategyNameById: Map<string, string>,
  equity: number,
): StressResult {
  const groupIdBySymbol = new Map<string, string>();
  for (const group of groups) {
    if (group.satelliteOnly) continue;
    for (const symbol of group.symbols) groupIdBySymbol.set(symbol, group.id);
  }
  const safeEquity = Math.max(equity, 1);

  const stockLoss = new Map<string, number>();
  const strategyLoss = new Map<string, number>();
  let totalLoss = 0;

  for (const position of openPositions) {
    const price = latestPriceBySymbol.get(position.symbol) ?? position.entry_price;
    const value = price * position.quantity;
    const groupId = groupIdBySymbol.get(position.symbol);
    const shockPct = (groupId ? preset.groupShocks[groupId] : undefined) ?? preset.defaultShock;
    const loss = value * (shockPct / 100);
    totalLoss += loss;
    stockLoss.set(position.symbol, (stockLoss.get(position.symbol) ?? 0) + loss);
    const strategyName = strategyNameById.get(position.strategy_id) ?? "未知策略";
    strategyLoss.set(strategyName, (strategyLoss.get(strategyName) ?? 0) + loss);
  }

  const toContributions = (map: Map<string, number>): StressContribution[] =>
    [...map.entries()]
      .map(([label, lossUsd]) => ({ label, lossUsd: Number(lossUsd.toFixed(2)), lossPctOfEquity: Number(((lossUsd / safeEquity) * 100).toFixed(2)) }))
      .sort((a, b) => a.lossUsd - b.lossUsd);

  return {
    presetName: preset.name,
    portfolioImpactPct: Number(((totalLoss / safeEquity) * 100).toFixed(2)),
    portfolioImpactUsd: Number(totalLoss.toFixed(2)),
    byStock: toContributions(stockLoss),
    byStrategy: toContributions(strategyLoss),
  };
}

export type StrategyHealthStatus = "healthy" | "watch" | "degrading" | "insufficient-sample";

export type StrategyHealth = {
  status: StrategyHealthStatus;
  statusLabel: string;
  detail: string;
};

const healthLabels: Record<StrategyHealthStatus, string> = {
  healthy: "健康",
  watch: "观察",
  degrading: "衰退",
  "insufficient-sample": "样本不足",
};

export function buildStrategyHealth(closedPositions: PaperPosition[]): StrategyHealth {
  const closed = closedPositions
    .filter((position): position is PaperPosition & { exit_price: number } => position.status === "closed" && typeof position.exit_price === "number")
    .sort((a, b) => (a.closed_at ?? "").localeCompare(b.closed_at ?? ""));
  const returns = closed.map((position) => ((position.exit_price - position.entry_price) / position.entry_price) * 100);

  if (returns.length < 8) {
    return { status: "insufficient-sample", statusLabel: healthLabels["insufficient-sample"], detail: `已完成交易 ${returns.length} 笔，不足 8 笔，暂无法判断策略状态` };
  }

  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const allMedian = median(returns);
  const recent = returns.slice(-10);
  const recentMedian = median(recent);
  const gap = recentMedian - allMedian;

  if (gap < -1.5) {
    return { status: "degrading", statusLabel: healthLabels.degrading, detail: `最近 ${recent.length} 笔中位收益 ${recentMedian.toFixed(2)}%，明显低于历史中位 ${allMedian.toFixed(2)}%` };
  }
  if (gap < -0.5) {
    return { status: "watch", statusLabel: healthLabels.watch, detail: `最近 ${recent.length} 笔中位收益 ${recentMedian.toFixed(2)}%，略低于历史中位 ${allMedian.toFixed(2)}%` };
  }
  return { status: "healthy", statusLabel: healthLabels.healthy, detail: `最近表现（中位 ${recentMedian.toFixed(2)}%）接近或优于历史区间（中位 ${allMedian.toFixed(2)}%）` };
}
