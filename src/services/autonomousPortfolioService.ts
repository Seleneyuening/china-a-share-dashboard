import { aShareUniverseCatalog } from "../data/aShareUniverseCatalog";
import { stockQuoteMocks } from "../data/mockQuotes";
import type { StockQuoteMock } from "../types/themeGroup";

export type StrategyConfig = {
  version: number;
  momentumWeight: number;
  previousWeight: number;
  trendWeight: number;
  simulatedMomentumWeight: number;
  heatWeight: number;
  liquidityWeight: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxHoldDays: number;
  maxPositions: number;
  targetInvestedRatio: number;
  explorationRate: number;
};

export type StrategyUpdate = {
  day: number;
  version: number;
  portfolioPeriodReturn: number;
  benchmarkPeriodReturn: number;
  reason: string;
  changes: string[];
  action: "升级" | "调整" | "回退";
};

export type BestStrategyRecord = {
  config: StrategyConfig;
  day: number;
  qualityScore: number;
  portfolioPeriodReturn: number;
  benchmarkPeriodReturn: number;
};

export type PerformanceMetrics = {
  closedTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalFees: number;
  feeDragPct: number;
  turnoverPct: number;
};

export type StressTestResult = {
  id: "bull" | "range" | "bear" | "shock";
  name: string;
  description: string;
  returnPct: number;
  maxDrawdown: number;
  status: "通过" | "承压" | "危险";
};

export type AutoPosition = {
  symbol: string;
  companyName: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  openedDay: number;
  score: number;
  reason: string;
};

export type AutoTrade = {
  id: string;
  day: number;
  side: "买入" | "卖出";
  symbol: string;
  companyName: string;
  quantity: number;
  price: number;
  fee: number;
  realizedPnl?: number;
  reason: string;
};

export type AutoSnapshot = {
  day: number;
  equity: number;
  cash: number;
  cumulativeReturn: number;
  benchmarkReturn: number;
  drawdown: number;
};

export type AutoPortfolioState = {
  day: number;
  initialCapital: number;
  cash: number;
  peakEquity: number;
  prices: Record<string, number>;
  positions: AutoPosition[];
  trades: AutoTrade[];
  snapshots: AutoSnapshot[];
  strategy: StrategyConfig;
  strategyUpdates: StrategyUpdate[];
  bestStrategy: BestStrategyRecord;
};

export type RankedCandidate = StockQuoteMock & { score: number; reason: string; groupName: string };

const storageKey = "a-share-autonomous-portfolio-v2";
const initialCapital = 1_000_000;
const knownBySymbol = new Map(stockQuoteMocks.map((stock) => [stock.symbol, stock]));

function round(value: number) { return Number(value.toFixed(2)); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function symbolSeed(symbol: string) { return [...symbol].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 0); }
function feeFor(value: number, side: "买入" | "卖出") { return Math.max(5, value * 0.0003) + (side === "卖出" ? value * 0.0005 : 0); }
function marketSegment(symbol: string) {
  if (symbol.startsWith("688")) return "科创板";
  if (symbol.startsWith("300") || symbol.startsWith("301")) return "创业板";
  if (symbol.endsWith(".SH")) return "沪市主板";
  return "深市主板";
}

function makeVirtualStock(symbol: string, companyName: string): StockQuoteMock {
  const known = knownBySymbol.get(symbol);
  if (known) return known;
  const seed = symbolSeed(symbol);
  const price = round(4 + (seed % 26000) / 100);
  const dollarVolume = Math.round((0.25 + (seed % 130) / 10) * 1_000_000_000);
  const previousDollarVolume = Math.round(dollarVolume * (0.72 + (seed % 57) / 100));
  const changePct = round(clamp(Math.sin(seed * 0.017) * 3.4 + Math.cos(seed * 0.031) * 1.1, -7.5, 7.5));
  const previousChangePct = round(clamp(Math.sin(seed * 0.013 + 1.4) * 2.8, -6, 6));
  const sparkline = Array.from({ length: 7 }, (_, index) => round(35 + index * changePct * 0.7 + Math.sin(seed * 0.01 + index) * 3));
  return {
    symbol,
    companyName,
    price,
    volume: Math.round(dollarVolume / price),
    previousVolume: Math.round(previousDollarVolume / price),
    dollarVolume,
    previousDollarVolume,
    changePct,
    previousChangePct,
    sparkline,
    source: "mock",
  };
}

const universe = aShareUniverseCatalog
  .filter((entry) => !/ST|退/.test(entry.name))
  .map((entry) => makeVirtualStock(entry.symbol, entry.name));

const defaultStrategy: StrategyConfig = {
  version: 1,
  momentumWeight: 3.5,
  previousWeight: 1.2,
  trendWeight: 0.24,
  simulatedMomentumWeight: 1.4,
  heatWeight: 4,
  liquidityWeight: 1,
  stopLossPct: 5,
  takeProfitPct: 10,
  maxHoldDays: 7,
  maxPositions: 6,
  targetInvestedRatio: 0.88,
  explorationRate: 0.08,
};

function initialState(): AutoPortfolioState {
  return {
    day: 0,
    initialCapital,
    cash: initialCapital,
    peakEquity: initialCapital,
    prices: Object.fromEntries(universe.map((stock) => [stock.symbol, stock.price])),
    positions: [],
    trades: [],
    snapshots: [{ day: 0, equity: initialCapital, cash: initialCapital, cumulativeReturn: 0, benchmarkReturn: 0, drawdown: 0 }],
    strategy: { ...defaultStrategy },
    strategyUpdates: [],
    bestStrategy: { config: { ...defaultStrategy }, day: 0, qualityScore: -999, portfolioPeriodReturn: 0, benchmarkPeriodReturn: 0 },
  };
}

function readState(): AutoPortfolioState {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return initialState();
    const state = JSON.parse(value) as AutoPortfolioState;
    state.strategy ||= { ...defaultStrategy };
    state.strategyUpdates ||= [];
    state.bestStrategy ||= { config: { ...state.strategy }, day: 0, qualityScore: -999, portfolioPeriodReturn: 0, benchmarkPeriodReturn: 0 };
    for (const update of state.strategyUpdates) update.action ||= "升级";
    for (const stock of universe) state.prices[stock.symbol] ??= stock.price;
    return state;
  } catch {
    return initialState();
  }
}

function saveState(state: AutoPortfolioState) { localStorage.setItem(storageKey, JSON.stringify(state)); }

function simulatedReturn(stock: StockQuoteMock, day: number): number {
  const seed = symbolSeed(stock.symbol);
  const sparkTrend = (stock.sparkline[stock.sparkline.length - 1] - stock.sparkline[0]) / Math.max(stock.sparkline[0], 1) * 100;
  const persistentEdge = clamp(stock.changePct * 0.08 + stock.previousChangePct * 0.035 + sparkTrend * 0.02, -0.5, 0.75);
  const marketCycle = Math.sin(day * 0.19) * 0.45;
  const cycle = Math.sin(seed * 0.017 + day * 0.83) * 1.35;
  const noise = Math.cos(seed * 0.031 + day * 1.67) * 0.78;
  return clamp(persistentEdge + marketCycle + cycle + noise, -7.5, 7.5);
}

function scoreStock(stock: StockQuoteMock, state: AutoPortfolioState): RankedCandidate {
  const currentPrice = state.prices[stock.symbol] ?? stock.price;
  const simulatedMomentum = (currentPrice / stock.price - 1) * 100;
  const sparkTrend = (stock.sparkline[stock.sparkline.length - 1] - stock.sparkline[0]) / Math.max(stock.sparkline[0], 1) * 100;
  const heat = (stock.dollarVolume ?? 0) / Math.max(stock.previousDollarVolume ?? 1, 1);
  const liquidity = Math.log10(Math.max(stock.dollarVolume ?? 1, 1)) - 8;
  const strategy = state.strategy;
  const baseScore = stock.changePct * strategy.momentumWeight
    + stock.previousChangePct * strategy.previousWeight
    + sparkTrend * strategy.trendWeight
    + simulatedMomentum * strategy.simulatedMomentumWeight
    + (heat - 1) * strategy.heatWeight
    + liquidity * strategy.liquidityWeight;
  const exploration = Math.sin(symbolSeed(stock.symbol) * 0.11 + state.day * 1.37) * strategy.explorationRate * 14;
  const score = round(baseScore + exploration);
  const reason = `V${strategy.version} 动量 ${round(stock.changePct)}% · 热度 ${round(heat)}x · 趋势 ${round(simulatedMomentum)}%`;
  return { ...stock, price: currentPrice, score, reason, groupName: marketSegment(stock.symbol) };
}

function equityOf(state: AutoPortfolioState): number {
  return state.cash + state.positions.reduce((sum, position) => sum + position.quantity * (state.prices[position.symbol] ?? position.lastPrice), 0);
}

function optimizeStrategy(state: AutoPortfolioState) {
  if (state.day === 0 || state.day % 20 !== 0 || state.snapshots.length < 21) return;
  const start = state.snapshots[state.snapshots.length - 21];
  const end = state.snapshots[state.snapshots.length - 1];
  const portfolioPeriodReturn = round((end.equity / start.equity - 1) * 100);
  const benchmarkPeriodReturn = round((1 + end.benchmarkReturn / 100) / (1 + start.benchmarkReturn / 100) * 100 - 100);
  const relative = portfolioPeriodReturn - benchmarkPeriodReturn;
  const qualityScore = round(relative + portfolioPeriodReturn * 0.2 + end.drawdown * 0.35);
  const evaluatedStrategy = { ...state.strategy };
  const strategy = { ...state.strategy, version: state.strategy.version + 1 };
  const changes: string[] = [];
  let action: StrategyUpdate["action"] = "升级";

  const qualifiesAsBest = relative >= 0 && portfolioPeriodReturn > -1 && end.drawdown > -6;
  if (qualifiesAsBest && qualityScore > state.bestStrategy.qualityScore) {
    state.bestStrategy = { config: evaluatedStrategy, day: state.day, qualityScore, portfolioPeriodReturn, benchmarkPeriodReturn };
    changes.push(`保存 V${evaluatedStrategy.version} 为历史最佳策略`);
  }

  const shouldRollback = state.bestStrategy.day > 0
    && state.bestStrategy.config.version !== evaluatedStrategy.version
    && (relative < -2 || portfolioPeriodReturn < -3 || end.drawdown <= -6);

  if (shouldRollback) {
    state.strategy = { ...state.bestStrategy.config, version: strategy.version };
    action = "回退";
    changes.push(`挑战版本未通过，回退至 D${state.bestStrategy.day} 的最佳参数`);
    state.strategyUpdates.unshift({
      day: state.day,
      version: state.strategy.version,
      portfolioPeriodReturn,
      benchmarkPeriodReturn,
      reason: `挑战策略落后基准 ${round(Math.abs(relative))}%，已自动回退`,
      changes,
      action,
    });
    return;
  }

  if (relative >= 0) {
    strategy.momentumWeight = round(clamp(strategy.momentumWeight + 0.15, 2.5, 5));
    strategy.targetInvestedRatio = round(clamp(strategy.targetInvestedRatio + 0.01, 0.72, 0.94));
    strategy.explorationRate = round(clamp(strategy.explorationRate - 0.01, 0.03, 0.35));
    strategy.takeProfitPct = round(clamp(strategy.takeProfitPct + 0.5, 7, 15));
    if (relative > 2 && end.drawdown > -4) strategy.maxPositions = Math.min(8, strategy.maxPositions + 1);
    changes.push("提高动量权重", "增加目标投入", "降低随机探索", "放宽止盈空间");
  } else {
    action = "调整";
    strategy.heatWeight = round(clamp(strategy.heatWeight + 0.4, 2, 7));
    strategy.trendWeight = round(clamp(strategy.trendWeight + 0.03, 0.15, 0.5));
    strategy.explorationRate = round(clamp(strategy.explorationRate + 0.05, 0.03, 0.35));
    strategy.maxHoldDays = Math.max(4, strategy.maxHoldDays - 1);
    changes.push("提高成交热度权重", "提高趋势权重", "扩大候选探索", "缩短持有周期");
  }
  if (end.drawdown <= -4) {
    strategy.targetInvestedRatio = round(clamp(strategy.targetInvestedRatio - 0.06, 0.72, 0.94));
    strategy.stopLossPct = round(clamp(strategy.stopLossPct - 0.5, 3.5, 7));
    changes.push("因回撤降低仓位", "收紧止损");
  }

  state.strategy = strategy;
  state.strategyUpdates.unshift({
    day: state.day,
    version: strategy.version,
    portfolioPeriodReturn,
    benchmarkPeriodReturn,
    reason: relative >= 0 ? `最近 20 日跑赢基准 ${round(relative)}%` : `最近 20 日落后基准 ${round(Math.abs(relative))}%`,
    changes,
    action,
  });
}

function performanceMetrics(state: AutoPortfolioState): PerformanceMetrics {
  const closed = state.trades.filter((trade) => typeof trade.realizedPnl === "number");
  const wins = closed.filter((trade) => (trade.realizedPnl ?? 0) > 0);
  const grossProfit = wins.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
  const grossLoss = Math.abs(closed.filter((trade) => (trade.realizedPnl ?? 0) < 0).reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0));
  const totalFees = state.trades.reduce((sum, trade) => sum + trade.fee, 0);
  const turnover = state.trades.reduce((sum, trade) => sum + trade.quantity * trade.price, 0);
  const averageEquity = state.snapshots.reduce((sum, snapshot) => sum + snapshot.equity, 0) / Math.max(state.snapshots.length, 1);
  return {
    closedTrades: closed.length,
    winRate: round(closed.length ? wins.length / closed.length * 100 : 0),
    profitFactor: round(grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0),
    maxDrawdown: round(Math.min(...state.snapshots.map((snapshot) => snapshot.drawdown))),
    totalFees: round(totalFees),
    feeDragPct: round(totalFees / state.initialCapital * 100),
    turnoverPct: round(turnover / Math.max(averageEquity, 1) * 100),
  };
}

function stressTests(state: AutoPortfolioState): StressTestResult[] {
  const selected = universe.map((stock) => scoreStock(stock, state)).sort((a, b) => b.score - a.score).slice(0, state.strategy.maxPositions);
  const scenarios: Array<{ id: StressTestResult["id"]; name: string; description: string; adjust: (base: number, day: number) => number }> = [
    { id: "bull", name: "趋势上涨", description: "市场每日提供正向趋势", adjust: (base) => base * 0.85 + 0.45 },
    { id: "range", name: "横盘震荡", description: "趋势减弱并反复波动", adjust: (base, day) => base * 0.3 + Math.sin(day * 1.6) * 0.35 },
    { id: "bear", name: "持续下跌", description: "市场连续承受负向压力", adjust: (base) => base * 0.65 - 1.25 },
    { id: "shock", name: "突发下跌", description: "第 6 日出现单日急跌", adjust: (base, day) => day === 6 ? -7 : base * 0.75 + 0.05 },
  ];
  return scenarios.map((scenario) => {
    let equity = 100;
    let peak = 100;
    let maxDrawdown = 0;
    for (let day = 1; day <= 20; day += 1) {
      const rawReturn = selected.reduce((sum, stock) => sum + scenario.adjust(simulatedReturn(stock, state.day + day), day), 0) / Math.max(selected.length, 1);
      const controlledReturn = Math.max(rawReturn, -state.strategy.stopLossPct) * state.strategy.targetInvestedRatio;
      equity *= 1 + controlledReturn / 100;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.min(maxDrawdown, (equity / peak - 1) * 100);
    }
    const returnPct = round(equity - 100);
    const drawdown = round(maxDrawdown);
    const status: StressTestResult["status"] = drawdown <= -8 || returnPct <= -10 ? "危险" : drawdown <= -4 || returnPct < 0 ? "承压" : "通过";
    return { id: scenario.id, name: scenario.name, description: scenario.description, returnPct, maxDrawdown: drawdown, status };
  });
}

function runOneDay(current: AutoPortfolioState): AutoPortfolioState {
  const state: AutoPortfolioState = structuredClone(current);
  state.day += 1;
  for (const stock of universe) {
    const price = state.prices[stock.symbol] ?? stock.price;
    state.prices[stock.symbol] = round(price * (1 + simulatedReturn(stock, state.day) / 100));
  }

  const candidates = universe.map((stock) => scoreStock(stock, state)).sort((a, b) => b.score - a.score);
  const scoreBySymbol = new Map(candidates.map((stock) => [stock.symbol, stock.score]));
  const survivors: AutoPosition[] = [];
  for (const position of state.positions) {
    const price = state.prices[position.symbol];
    const returnPct = (price / position.averagePrice - 1) * 100;
    const heldDays = state.day - position.openedDay;
    const score = scoreBySymbol.get(position.symbol) ?? 0;
    const config = state.strategy;
    const sellReason = heldDays < 1 ? "" : returnPct <= -config.stopLossPct ? `触发 -${config.stopLossPct}% 风险止损` : returnPct >= config.takeProfitPct ? `达到 +${config.takeProfitPct}% 止盈` : heldDays >= config.maxHoldDays ? "持有周期到期再平衡" : score < 0 ? "综合评分转弱" : "";
    if (!sellReason) {
      survivors.push({ ...position, lastPrice: price, score });
      continue;
    }
    const gross = position.quantity * price;
    const fee = feeFor(gross, "卖出");
    const realizedPnl = gross - fee - position.quantity * position.averagePrice;
    state.cash += gross - fee;
    state.trades.unshift({ id: `${state.day}-${position.symbol}-sell`, day: state.day, side: "卖出", symbol: position.symbol, companyName: position.companyName, quantity: position.quantity, price, fee: round(fee), realizedPnl: round(realizedPnl), reason: sellReason });
  }
  state.positions = survivors;

  const equity = equityOf(state);
  const config = state.strategy;
  const targetPerPosition = equity * config.targetInvestedRatio / config.maxPositions;
  const heldSegments = new Set<string>(state.positions.map((position) => marketSegment(position.symbol)));
  for (const candidate of candidates) {
    if (state.positions.length >= config.maxPositions || candidate.score <= 1) break;
    if (state.positions.some((position) => position.symbol === candidate.symbol)) continue;
    if (heldSegments.has(candidate.groupName) && state.positions.length < Math.min(4, config.maxPositions)) continue;
    const available = Math.min(targetPerPosition, state.cash - equity * (1 - config.targetInvestedRatio));
    const quantity = Math.floor(available / candidate.price / 100) * 100;
    if (quantity < 100) continue;
    const gross = quantity * candidate.price;
    const fee = feeFor(gross, "买入");
    if (gross + fee > state.cash) continue;
    state.cash -= gross + fee;
    state.positions.push({ symbol: candidate.symbol, companyName: candidate.companyName, quantity, averagePrice: candidate.price, lastPrice: candidate.price, openedDay: state.day, score: candidate.score, reason: candidate.reason });
    state.trades.unshift({ id: `${state.day}-${candidate.symbol}-buy`, day: state.day, side: "买入", symbol: candidate.symbol, companyName: candidate.companyName, quantity, price: candidate.price, fee: round(fee), reason: `全市场自主评分 ${candidate.score}；${candidate.reason}` });
    heldSegments.add(candidate.groupName);
  }

  const finalEquity = round(equityOf(state));
  state.peakEquity = Math.max(state.peakEquity, finalEquity);
  const previousBenchmark = state.snapshots[state.snapshots.length - 1]?.benchmarkReturn ?? 0;
  const benchmarkDaily = universe.reduce((sum, stock) => sum + simulatedReturn(stock, state.day), 0) / universe.length;
  const benchmarkReturn = round((1 + previousBenchmark / 100) * (1 + benchmarkDaily / 100) * 100 - 100);
  state.snapshots.push({ day: state.day, equity: finalEquity, cash: round(state.cash), cumulativeReturn: round((finalEquity / state.initialCapital - 1) * 100), benchmarkReturn, drawdown: round((finalEquity / state.peakEquity - 1) * 100) });
  optimizeStrategy(state);
  return state;
}

export const autonomousPortfolioService = {
  getState: readState,
  getUniverseSize: () => universe.length,
  getRankedCandidates(state = readState()): RankedCandidate[] { return universe.map((stock) => scoreStock(stock, state)).sort((a, b) => b.score - a.score); },
  getPerformanceMetrics(state = readState()): PerformanceMetrics { return performanceMetrics(state); },
  runStressTests(state = readState()): StressTestResult[] { return stressTests(state); },
  runDays(days: number): AutoPortfolioState {
    let state = readState();
    for (let index = 0; index < days; index += 1) state = runOneDay(state);
    saveState(state);
    return state;
  },
  reset(): AutoPortfolioState { const state = initialState(); saveState(state); return state; },
};
