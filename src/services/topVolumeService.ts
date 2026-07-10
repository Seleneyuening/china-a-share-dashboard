import { stockQuoteMocks } from "../data/mockQuotes";
import { watchlistGroups } from "../data/watchlistGroups";
import { calculateDollarVolume, calculateRankingChange, calculateTop50RetentionRate } from "./calculations";
import type { StockQuoteMock } from "../types/themeGroup";
import type { Top50ChangeSummary, TopVolumeComparisonRow, TopVolumeEntry } from "../types/topVolume";

const satelliteSymbols = new Set(watchlistGroups.find((group) => group.satelliteOnly)?.symbols || []);

function toEntry(kind: "current" | "previous", limit = 50, stocks: StockQuoteMock[] = stockQuoteMocks): TopVolumeEntry[] {
  const topVolumeUniverse = stocks.filter((stock) => !satelliteSymbols.has(stock.symbol));
  return topVolumeUniverse
    .map((stock) => ({
      symbol: stock.symbol,
      companyName: stock.companyName,
      rank: 0,
      price: stock.price,
      dollarVolume: kind === "current" ? stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume) : stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume),
      changePct: kind === "current" ? stock.changePct : stock.previousChangePct,
    }))
    .sort((a, b) => b.dollarVolume - a.dollarVolume)
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function buildComparison(previousTop50: TopVolumeEntry[], currentTop50: TopVolumeEntry[]): TopVolumeComparisonRow[] {
  const previousBySymbol = new Map(previousTop50.map((entry) => [entry.symbol, entry]));
  const currentBySymbol = new Map(currentTop50.map((entry) => [entry.symbol, entry]));
  const symbols = [...new Set([...currentTop50.map((entry) => entry.symbol), ...previousTop50.map((entry) => entry.symbol)])];
  return symbols.map((symbol) => {
    const previous = previousBySymbol.get(symbol);
    const current = currentBySymbol.get(symbol);
    const rankChange = calculateRankingChange(previous?.rank, current?.rank);
    return {
      symbol,
      companyName: current?.companyName || previous?.companyName || symbol,
      currentRank: current?.rank,
      previousRank: previous?.rank,
      currentDollarVolume: current?.dollarVolume,
      previousDollarVolume: previous?.dollarVolume,
      currentChangePct: current?.changePct,
      previousChangePct: previous?.changePct,
      rankChange,
      status: !previous ? "NEW" : !current ? "OUT" : rankChange === 0 ? "UNCHANGED" : (rankChange || 0) > 0 ? "UP" : "DOWN",
    };
  });
}

export const topVolumeService = {
  getPreviousTop50: (stocks?: StockQuoteMock[]) => toEntry("previous", 50, stocks),
  getCurrentTop50: (stocks?: StockQuoteMock[]) => toEntry("current", 50, stocks),
  getComparison(stocks?: StockQuoteMock[]) {
    const previousTop50 = toEntry("previous", 50, stocks);
    const currentTop50 = toEntry("current", 50, stocks);
    const rows = buildComparison(previousTop50, currentTop50);
    const activeRows = rows.filter((row) => row.currentRank && row.previousRank);
    const movedRows = activeRows.filter((row) => row.rankChange);
    const summary: Top50ChangeSummary = {
      newCount: rows.filter((row) => row.status === "NEW").length,
      outCount: rows.filter((row) => row.status === "OUT").length,
      upCount: rows.filter((row) => (row.rankChange || 0) > 0).length,
      downCount: rows.filter((row) => (row.rankChange || 0) < 0).length,
      averageRankChange: Number((movedRows.reduce((sum, row) => sum + Math.abs(row.rankChange || 0), 0) / Math.max(movedRows.length, 1)).toFixed(1)),
      retentionRate: calculateTop50RetentionRate(previousTop50, currentTop50),
      biggestUp: [...activeRows].filter((row) => (row.rankChange || 0) > 0).sort((a, b) => (b.rankChange || 0) - (a.rankChange || 0)).slice(0, 3),
      biggestDown: [...activeRows].filter((row) => (row.rankChange || 0) < 0).sort((a, b) => (a.rankChange || 0) - (b.rankChange || 0)).slice(0, 3),
      newRows: rows.filter((row) => row.status === "NEW"),
      outRows: rows.filter((row) => row.status === "OUT"),
    };
    return { previousTop50, currentTop50, rows, summary };
  },
};
