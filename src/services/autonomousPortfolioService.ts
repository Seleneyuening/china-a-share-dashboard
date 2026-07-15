import { stockQuoteMocks } from "../data/mockQuotes";
import { watchlistGroups } from "../data/watchlistGroups";
import type { StockQuoteMock } from "../types/themeGroup";

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
};

export type RankedCandidate = StockQuoteMock & { score: number; reason: string; groupName: string };

const storageKey = "a-share-autonomous-portfolio-v1";
const initialCapital = 1_000_000;
const maxPositions = 6;
const targetInvestedRatio = 0.88;

const universe = stockQuoteMocks.filter((stock) => !watchlistGroups.find((group) => group.satelliteOnly)?.symbols.includes(stock.symbol));
const groupBySymbol = new Map(watchlistGroups.flatMap((group) => group.satelliteOnly ? [] : group.symbols.map((symbol) => [symbol, group.name] as const)));

function round(value: number) { return Number(value.toFixed(2)); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function symbolSeed(symbol: string) { return [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0); }
function feeFor(value: number, side: "买入" | "卖出") { return Math.max(5, value * 0.0003) + (side === "卖出" ? value * 0.0005 : 0); }

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
  };
}

function readState(): AutoPortfolioState {
  try {
    const value = localStorage.getItem(storageKey);
    return value ? JSON.parse(value) as AutoPortfolioState : initialState();
  } catch {
    return initialState();
  }
}

function saveState(state: AutoPortfolioState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function simulatedReturn(stock: StockQuoteMock, day: number): number {
  const seed = symbolSeed(stock.symbol);
  const sparkTrend = (stock.sparkline[stock.sparkline.length - 1] - stock.sparkline[0]) / Math.max(stock.sparkline[0], 1) * 100;
  const persistentEdge = clamp(stock.changePct * 0.1 + stock.previousChangePct * 0.04 + sparkTrend * 0.025, -0.6, 0.9);
  const cycle = Math.sin(seed * 0.17 + day * 0.83) * 1.35;
  const noise = Math.cos(seed * 0.31 + day * 1.67) * 0.75;
  return clamp(persistentEdge + cycle + noise, -6.5, 6.5);
}

function scoreStock(stock: StockQuoteMock, state: AutoPortfolioState): RankedCandidate {
  const currentPrice = state.prices[stock.symbol] ?? stock.price;
  const simulatedMomentum = (currentPrice / stock.price - 1) * 100;
  const sparkTrend = (stock.sparkline[stock.sparkline.length - 1] - stock.sparkline[0]) / Math.max(stock.sparkline[0], 1) * 100;
  const heat = (stock.dollarVolume ?? 0) / Math.max(stock.previousDollarVolume ?? 1, 1);
  const liquidity = Math.log10(Math.max(stock.dollarVolume ?? 1, 1)) - 8;
  const score = round(stock.changePct * 4 + stock.previousChangePct * 1.5 + sparkTrend * 0.28 + simulatedMomentum * 1.8 + (heat - 1) * 5 + liquidity);
  const reason = `动量 ${round(stock.changePct)}% · 成交热度 ${round(heat)}x · 模拟趋势 ${round(simulatedMomentum)}%`;
  return { ...stock, price: currentPrice, score, reason, groupName: groupBySymbol.get(stock.symbol) ?? "其他" };
}

function equityOf(state: AutoPortfolioState): number {
  return state.cash + state.positions.reduce((sum, position) => sum + position.quantity * (state.prices[position.symbol] ?? position.lastPrice), 0);
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
    const sellReason = heldDays < 1 ? "" : returnPct <= -5 ? "触发 -5% 风险止损" : returnPct >= 10 ? "达到 +10% 分批止盈" : heldDays >= 7 ? "持有周期到期再平衡" : score < 0 ? "综合评分转弱" : "";
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

  const currentEquity = equityOf(state);
  const targetPerPosition = currentEquity * targetInvestedRatio / maxPositions;
  const heldGroups = new Set(state.positions.map((position) => groupBySymbol.get(position.symbol)));
  for (const candidate of candidates) {
    if (state.positions.length >= maxPositions || candidate.score <= 1) break;
    if (state.positions.some((position) => position.symbol === candidate.symbol)) continue;
    if (heldGroups.has(candidate.groupName) && state.positions.length < 4) continue;
    const available = Math.min(targetPerPosition, state.cash - currentEquity * (1 - targetInvestedRatio));
    const quantity = Math.floor(available / candidate.price / 100) * 100;
    if (quantity < 100) continue;
    const gross = quantity * candidate.price;
    const fee = feeFor(gross, "买入");
    if (gross + fee > state.cash) continue;
    state.cash -= gross + fee;
    state.positions.push({ symbol: candidate.symbol, companyName: candidate.companyName, quantity, averagePrice: candidate.price, lastPrice: candidate.price, openedDay: state.day, score: candidate.score, reason: candidate.reason });
    state.trades.unshift({ id: `${state.day}-${candidate.symbol}-buy`, day: state.day, side: "买入", symbol: candidate.symbol, companyName: candidate.companyName, quantity, price: candidate.price, fee: round(fee), reason: `自主评分 ${candidate.score}；${candidate.reason}` });
    heldGroups.add(candidate.groupName);
  }

  const equity = round(equityOf(state));
  state.peakEquity = Math.max(state.peakEquity, equity);
  const previousBenchmark = state.snapshots[state.snapshots.length - 1]?.benchmarkReturn ?? 0;
  const benchmarkDaily = universe.reduce((sum, stock) => sum + simulatedReturn(stock, state.day), 0) / universe.length;
  const benchmarkReturn = round((1 + previousBenchmark / 100) * (1 + benchmarkDaily / 100) * 100 - 100);
  state.snapshots.push({
    day: state.day,
    equity,
    cash: round(state.cash),
    cumulativeReturn: round((equity / state.initialCapital - 1) * 100),
    benchmarkReturn,
    drawdown: round((equity / state.peakEquity - 1) * 100),
  });
  return state;
}

export const autonomousPortfolioService = {
  getState: readState,
  getRankedCandidates(state = readState()): RankedCandidate[] {
    return universe.map((stock) => scoreStock(stock, state)).sort((a, b) => b.score - a.score);
  },
  runDays(days: number): AutoPortfolioState {
    let state = readState();
    for (let index = 0; index < days; index += 1) state = runOneDay(state);
    saveState(state);
    return state;
  },
  reset(): AutoPortfolioState {
    const state = initialState();
    saveState(state);
    return state;
  },
};
