import { calculateRankingChange, calculateThemeGroupTotals } from "./calculations";
import { marketDataService } from "./marketDataService";
import type { StockQuoteMock, ThemeGroupSummary } from "../types/themeGroup";
import type { TopVolumeComparisonRow, TopVolumeEntry } from "../types/topVolume";
import type { IntradaySnapshotRow, ReplayEvent } from "../types/intradayHistory";

type ApiRow = {
  captured_at: string;
  trade_date: string;
  symbol: string;
  company_name?: string;
  price?: number;
  dollar_volume?: number;
  change_pct?: number;
  top50_rank?: number;
  group_id?: string;
  source: string;
};

const satelliteGroupId = "market-satellites";

function fromApiRow(row: ApiRow): IntradaySnapshotRow {
  return {
    capturedAt: row.captured_at,
    tradeDate: row.trade_date,
    symbol: row.symbol,
    companyName: row.company_name,
    price: row.price,
    dollarVolume: row.dollar_volume,
    changePct: row.change_pct,
    top50Rank: row.top50_rank,
    groupId: row.group_id,
    source: row.source,
  };
}

export async function getDayHistory(date: string): Promise<IntradaySnapshotRow[]> {
  const groups = marketDataService.getWatchlistGroups();
  const groupBySymbol = new Map(groups.flatMap((group) => group.symbols.map((symbol) => [symbol, group.id] as const)));
  const stocks = marketDataService.getStockQuotes();
  const times = ["09:45:00", "10:30:00", "13:30:00", "15:00:00"];
  return times.flatMap((time, step) => stocks.map((stock, index) => ({
    capturedAt: `${date}T${time}+08:00`, tradeDate: date, symbol: stock.symbol, companyName: stock.companyName,
    price: Number((stock.price * (0.99 + step * 0.003)).toFixed(2)), dollarVolume: Math.round((stock.dollarVolume ?? 0) * (0.55 + step * 0.15)),
    changePct: Number((stock.changePct * (0.65 + step * 0.12)).toFixed(2)), top50Rank: index < 50 ? index + 1 : undefined,
    groupId: groupBySymbol.get(stock.symbol), source: "mock",
  })));
}

export function distinctTimestamps(rows: IntradaySnapshotRow[]): string[] {
  return [...new Set(rows.map((row) => row.capturedAt))].sort();
}

function rowsAt(rows: IntradaySnapshotRow[], capturedAt: string): IntradaySnapshotRow[] {
  return rows.filter((row) => row.capturedAt === capturedAt);
}

export function buildStockQuoteMocks(rows: IntradaySnapshotRow[], capturedAt: string, previousCapturedAt?: string): StockQuoteMock[] {
  const current = rowsAt(rows, capturedAt).filter((row) => row.groupId !== satelliteGroupId);
  const previousBySymbol = new Map(previousCapturedAt ? rowsAt(rows, previousCapturedAt).map((row) => [row.symbol, row]) : []);
  return current.map((row) => {
    const previous = previousBySymbol.get(row.symbol);
    return {
      symbol: row.symbol,
      companyName: row.companyName ?? row.symbol,
      price: row.price ?? 0,
      volume: 0,
      previousVolume: 0,
      dollarVolume: row.dollarVolume ?? 0,
      previousDollarVolume: previous?.dollarVolume ?? row.dollarVolume ?? 0,
      changePct: row.changePct ?? 0,
      previousChangePct: previous?.changePct ?? row.changePct ?? 0,
      sparkline: [],
      source: "mock",
    };
  });
}

export function buildTop50Entries(rows: IntradaySnapshotRow[], capturedAt: string): TopVolumeEntry[] {
  return rowsAt(rows, capturedAt)
    .filter((row) => typeof row.top50Rank === "number")
    .sort((a, b) => (a.top50Rank ?? 0) - (b.top50Rank ?? 0))
    .map((row) => ({
      symbol: row.symbol,
      companyName: row.companyName ?? row.symbol,
      rank: row.top50Rank ?? 0,
      price: row.price ?? 0,
      dollarVolume: row.dollarVolume ?? 0,
      changePct: row.changePct ?? 0,
    }));
}

export function buildComparisonRows(previousEntries: TopVolumeEntry[], currentEntries: TopVolumeEntry[]): TopVolumeComparisonRow[] {
  const previousBySymbol = new Map(previousEntries.map((entry) => [entry.symbol, entry]));
  const currentBySymbol = new Map(currentEntries.map((entry) => [entry.symbol, entry]));
  const symbols = [...new Set([...currentEntries.map((entry) => entry.symbol), ...previousEntries.map((entry) => entry.symbol)])];
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

export function buildGroupSummaries(stocksAtTime: StockQuoteMock[], top50SymbolsAtTime: Set<string>): ThemeGroupSummary[] {
  const groups = marketDataService.getWatchlistGroups().filter((group) => !group.satelliteOnly);
  return groups
    .map((group) => {
      const stocks = group.symbols
        .map((symbol) => stocksAtTime.find((stock) => stock.symbol === symbol))
        .filter((stock): stock is StockQuoteMock => stock !== undefined);
      if (!stocks.length) return null;
      const totals = calculateThemeGroupTotals(stocks);
      const sorted = [...stocks].sort((a, b) => (b.dollarVolume ?? 0) - (a.dollarVolume ?? 0));
      const summary: ThemeGroupSummary = {
        group,
        stocks,
        ...totals,
        gainers: stocks.filter((stock) => stock.changePct >= 0).length,
        losers: stocks.filter((stock) => stock.changePct < 0).length,
        top50Count: stocks.filter((stock) => top50SymbolsAtTime.has(stock.symbol)).length,
        concentration: Number(((sorted[0]?.dollarVolume ?? 0) / Math.max(totals.dollarVolume, 1) * 100).toFixed(1)),
        leader: [...stocks].sort((a, b) => b.changePct - a.changePct)[0],
        laggard: [...stocks].sort((a, b) => a.changePct - b.changePct)[0],
      };
      return summary;
    })
    .filter((summary): summary is ThemeGroupSummary => summary !== null);
}

export function buildSatelliteRows(rows: IntradaySnapshotRow[], capturedAt: string): Array<{ symbol: string; changePct: number }> {
  return rowsAt(rows, capturedAt)
    .filter((row) => row.groupId === satelliteGroupId)
    .map((row) => ({ symbol: row.symbol, changePct: row.changePct ?? 0 }));
}

export function buildDerivedEvents(rows: IntradaySnapshotRow[]): ReplayEvent[] {
  const groupNameById = new Map<string, string>(marketDataService.getWatchlistGroups().map((group) => [group.id, group.name]));
  const timestamps = distinctTimestamps(rows);
  const events: ReplayEvent[] = [];
  let previousTop50 = new Set<string>();
  let previousTopGroupId: string | undefined;
  const previousChangeBySymbol = new Map<string, number>();

  timestamps.forEach((timestamp, index) => {
    const current = rowsAt(rows, timestamp);
    const currentTop50 = new Set(current.filter((row) => typeof row.top50Rank === "number").map((row) => row.symbol));

    if (index > 0) {
      for (const symbol of currentTop50) {
        if (!previousTop50.has(symbol)) events.push({ capturedAt: timestamp, label: "新进 Top 50", detail: symbol });
      }
    }

    const volumeByGroup = new Map<string, number>();
    for (const row of current) {
      if (!row.groupId || row.groupId === satelliteGroupId) continue;
      volumeByGroup.set(row.groupId, (volumeByGroup.get(row.groupId) ?? 0) + (row.dollarVolume ?? 0));
    }
    const topGroupId = [...volumeByGroup.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (index > 0 && topGroupId && previousTopGroupId && topGroupId !== previousTopGroupId) {
      events.push({ capturedAt: timestamp, label: "主题组第一名易主", detail: groupNameById.get(topGroupId) ?? topGroupId });
    }
    if (topGroupId) previousTopGroupId = topGroupId;

    if (index > 0) {
      for (const row of current) {
        if (row.groupId === satelliteGroupId || row.changePct === undefined) continue;
        const prevChange = previousChangeBySymbol.get(row.symbol);
        if (prevChange !== undefined && Math.abs(row.changePct - prevChange) >= 3) {
          events.push({ capturedAt: timestamp, label: "涨跌幅骤变", detail: `${row.symbol} ${prevChange.toFixed(2)}% → ${row.changePct.toFixed(2)}%` });
        }
      }
    }
    for (const row of current) {
      if (row.changePct !== undefined) previousChangeBySymbol.set(row.symbol, row.changePct);
    }

    previousTop50 = currentTop50;
  });

  return events;
}
