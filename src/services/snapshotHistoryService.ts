import { marketDataService } from "./marketDataService";
import type { DailySnapshotRow } from "../types/snapshotHistory";

type ApiRow = {
  date: string;
  symbol: string;
  company_name?: string;
  price?: number;
  dollar_volume?: number;
  change_pct?: number;
  top50_rank?: number;
  group_id?: string;
  source: string;
};

function fromApiRow(row: ApiRow): DailySnapshotRow {
  return {
    date: row.date,
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

function buildMockHistory(days: number): DailySnapshotRow[] {
  const groups = marketDataService.getWatchlistGroups();
  const groupBySymbol = new Map(groups.flatMap((group) => group.symbols.map((symbol) => [symbol, group.id] as const)));
  const stocks = marketDataService.getStockQuotes();
  const today = new Date(2026, 6, 15);
  return Array.from({ length: days }, (_, dayIndex) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - dayIndex - 1));
    const dateKey = date.toISOString().slice(0, 10);
    return stocks.map((stock, index) => ({
      date: dateKey,
      symbol: stock.symbol,
      companyName: stock.companyName,
      price: Number((stock.price * (0.96 + dayIndex * 0.0015 + (index % 5) * 0.002)).toFixed(2)),
      dollarVolume: Math.round((stock.dollarVolume ?? 0) * (0.82 + ((dayIndex + index) % 7) * 0.06)),
      changePct: Number((stock.changePct + Math.sin(dayIndex + index) * 0.8).toFixed(2)),
      top50Rank: index < 50 ? index + 1 : undefined,
      groupId: groupBySymbol.get(stock.symbol),
      source: "mock",
    }));
  }).flat();
}

export const snapshotHistoryService = {
  async getSymbolHistory(symbols: string[], days = 10): Promise<DailySnapshotRow[]> {
    return buildMockHistory(days).filter((row) => symbols.includes(row.symbol));
  },
  async getGroupHistory(groupId: string, days = 10): Promise<DailySnapshotRow[]> {
    return buildMockHistory(days).filter((row) => row.groupId === groupId);
  },
};
