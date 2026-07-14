import { stockQuoteMocks } from "./mockQuotes";

export const mockMarketSatellites = stockQuoteMocks.filter((stock) => ["510300.SH", "510500.SH", "588000.SH"].includes(stock.symbol));
