import type { IndexMeta, Market, Point } from "../types";
import type { StockQuoteMock, ThemeGroupSummary } from "../types/themeGroup";
import type { TopVolumeEntry } from "../types/topVolume";

export function normalizeSeriesToBase100(series: Point[]): Point[] {
  const base = series[0]?.value || 1;
  return series.map((point) => ({ ...point, value: Number(((point.value / base) * 100).toFixed(2)) }));
}

export function calculateReturn(series: Point[]): number {
  if (series.length < 2) return 0;
  const first = series[0].value;
  const last = series[series.length - 1].value;
  return Number((((last - first) / first) * 100).toFixed(2));
}

export function calculateCorrelation(seriesA: Point[], seriesB: Point[]): number {
  const size = Math.min(seriesA.length, seriesB.length);
  if (size < 2) return 0;
  const a = seriesA.slice(-size).map((p) => p.value);
  const b = seriesB.slice(-size).map((p) => p.value);
  const meanA = a.reduce((sum, n) => sum + n, 0) / size;
  const meanB = b.reduce((sum, n) => sum + n, 0) / size;
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < size; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  return Number((numerator / Math.sqrt(denomA * denomB || 1)).toFixed(2));
}

export function calculateRelativeStrength(baseSeries: Point[], compareSeries: Point[]): number {
  return Number((calculateReturn(compareSeries) - calculateReturn(baseSeries)).toFixed(2));
}

export function calculateVolatility(series: Point[]): number {
  const returns = series.slice(1).map((point, i) => Math.log(point.value / series[i].value));
  if (!returns.length) return 0;
  const mean = returns.reduce((sum, n) => sum + n, 0) / returns.length;
  const variance = returns.reduce((sum, n) => sum + (n - mean) ** 2, 0) / returns.length;
  return Number((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1));
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return (hour * 60 + minute) % 1440;
}

export function getCurrentEt(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function getMarketStatus(market: Market, currentEt = getCurrentEt()): "交易中" | "已收盘" | "即将开盘" {
  const now = minutes(currentEt);
  const open = minutes(market.openEt);
  const close = minutes(market.closeEt);
  const isOvernight = close < open;
  const openNow = isOvernight ? now >= open || now <= close : now >= open && now <= close;
  if (openNow) return "交易中";
  const nextOpenDistance = open >= now ? open - now : open + 1440 - now;
  return nextOpenDistance <= 90 ? "即将开盘" : "已收盘";
}

export function signed(value: number, digits = 2): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function bySymbol<T extends { symbol: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.symbol, item]));
}

export function metaFor(symbol: string, indexes: IndexMeta[]): IndexMeta {
  return indexes.find((index) => index.symbol === symbol) || indexes[0];
}

export function calculateDollarVolume(price: number, volume: number): number {
  return Math.round(price * volume);
}

export function calculateThemeGroupTotals(groupStocks: StockQuoteMock[]) {
  const dollarVolume = groupStocks.reduce((sum, stock) => sum + (stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume)), 0);
  const previousDollarVolume = groupStocks.reduce((sum, stock) => sum + (stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume)), 0);
  const averageChangePct = groupStocks.length ? groupStocks.reduce((sum, stock) => sum + stock.changePct, 0) / groupStocks.length : 0;
  return {
    dollarVolume,
    previousDollarVolume,
    averageChangePct: Number(averageChangePct.toFixed(2)),
  };
}

export function calculateRankingChange(previousRank?: number, currentRank?: number): number | null {
  if (!previousRank || !currentRank) return null;
  return previousRank - currentRank;
}

export function calculateTop50RetentionRate(previousTop50: TopVolumeEntry[], currentTop50: TopVolumeEntry[]): number {
  const currentSymbols = new Set(currentTop50.map((entry) => entry.symbol));
  const retained = previousTop50.filter((entry) => currentSymbols.has(entry.symbol)).length;
  return Number(((retained / Math.max(previousTop50.length, 1)) * 100).toFixed(1));
}

export function calculateVolumeHeat(todayDollarVolume: number, previousDollarVolume: number): { ratio: number; label: string } {
  const ratio = Number((todayDollarVolume / Math.max(previousDollarVolume, 1)).toFixed(2));
  if (ratio >= 1.35) return { ratio, label: "HOT" };
  if (ratio <= 0.75) return { ratio, label: "COOL" };
  return { ratio, label: "NORMAL" };
}

export function getStockPriceMomentumState(todayChange: number, previousDayChange: number): "up-up" | "down-down" | "down-up" | "up-down" {
  if (previousDayChange >= 0 && todayChange >= 0) return "up-up";
  if (previousDayChange < 0 && todayChange < 0) return "down-down";
  if (previousDayChange < 0 && todayChange >= 0) return "down-up";
  return "up-down";
}

export function getGroupStanding(summary: ThemeGroupSummary, symbol: string): { share: number; volumeRank: number; changeRank: number; groupSize: number } {
  const byVolume = [...summary.stocks].sort((a, b) => (b.dollarVolume ?? calculateDollarVolume(b.price, b.volume)) - (a.dollarVolume ?? calculateDollarVolume(a.price, a.volume)));
  const byChange = [...summary.stocks].sort((a, b) => b.changePct - a.changePct);
  const stock = summary.stocks.find((item) => item.symbol === symbol);
  const dollarVolume = stock ? stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume) : 0;
  return {
    share: Number(((dollarVolume / Math.max(summary.dollarVolume, 1)) * 100).toFixed(1)),
    volumeRank: byVolume.findIndex((item) => item.symbol === symbol) + 1,
    changeRank: byChange.findIndex((item) => item.symbol === symbol) + 1,
    groupSize: summary.stocks.length,
  };
}
