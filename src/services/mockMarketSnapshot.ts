import { mockHistorical, mockIntraday } from "../data/mockSeries";
import { mockQuotes } from "../data/mockQuotes";
import type { MarketDataSnapshot } from "../types";

export async function getMockSnapshot(): Promise<MarketDataSnapshot> {
  return {
    quotes: mockQuotes,
    intraday: mockIntraday,
    historical: mockHistorical,
    source: "mock",
    fetchedAt: "模拟盘 15:00 CST",
  };
}
