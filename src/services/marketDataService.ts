import { mockEvents } from "../data/mockEvents";
import { mockHistorical, mockIntraday } from "../data/mockSeries";
import { markets } from "../data/markets";
import { mockMetrics, mockQuotes, stockQuoteMocks } from "../data/mockQuotes";
import { watchlistGroups } from "../data/watchlistGroups";
import { calculateDollarVolume, calculateThemeGroupTotals } from "./calculations";
import type { MarketDataSnapshot, RangeKey } from "../types";
import type { StockQuoteMock, ThemeGroupSummary } from "../types/themeGroup";

const rangeSize: Record<RangeKey, number> = {
  "1D": 42,
  "5D": 5,
  "1M": 22,
  "3M": 66,
  "6M": 132,
  YTD: 126,
  "1Y": 252,
};

export const marketDataService = {
  getSnapshot: (): MarketDataSnapshot => ({
    quotes: mockQuotes,
    intraday: mockIntraday,
    historical: mockHistorical,
    source: "mock",
    fetchedAt: "模拟盘 15:00 CST",
  }),
  getLatestQuotes: (snapshot?: MarketDataSnapshot) => snapshot?.quotes || mockQuotes,
  getIntradaySeries: (symbol: string, snapshot?: MarketDataSnapshot) => snapshot?.intraday[symbol] || mockIntraday[symbol] || [],
  getHistoricalSeries: (symbol: string, range: RangeKey = "YTD", snapshot?: MarketDataSnapshot) => (snapshot?.historical[symbol] || mockHistorical[symbol] || []).slice(-rangeSize[range]),
  getMarketCalendar: () => markets,
  getEconomicEvents: () => mockEvents,
  getMetrics: () => mockMetrics,
  getWatchlistGroups: () => watchlistGroups,
  getStockQuotes: (): StockQuoteMock[] => stockQuoteMocks,
  getStockBySymbol: (symbol: string): StockQuoteMock | undefined => stockQuoteMocks.find((stock) => stock.symbol === symbol),
  getThemeGroupSummaries: (top50Symbols = new Set<string>(), sourceStocks = stockQuoteMocks): ThemeGroupSummary[] => watchlistGroups.map((group) => {
    const stocks = group.symbols.map((symbol) => sourceStocks.find((stock) => stock.symbol === symbol)).filter(Boolean) as StockQuoteMock[];
    const totals = calculateThemeGroupTotals(stocks);
    const sorted = [...stocks].sort((a, b) => (b.dollarVolume ?? calculateDollarVolume(b.price, b.volume)) - (a.dollarVolume ?? calculateDollarVolume(a.price, a.volume)));
    return {
      group,
      stocks,
      ...totals,
      gainers: stocks.filter((stock) => stock.changePct >= 0).length,
      losers: stocks.filter((stock) => stock.changePct < 0).length,
      top50Count: stocks.filter((stock) => top50Symbols.has(stock.symbol)).length,
      concentration: Number(((sorted[0] ? sorted[0].dollarVolume ?? calculateDollarVolume(sorted[0].price, sorted[0].volume) : 0) / Math.max(totals.dollarVolume, 1) * 100).toFixed(1)),
      leader: [...stocks].sort((a, b) => b.changePct - a.changePct)[0],
      laggard: [...stocks].sort((a, b) => a.changePct - b.changePct)[0],
    };
  }),
};
