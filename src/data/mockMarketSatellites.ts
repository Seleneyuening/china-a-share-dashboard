import { stockQuoteMocks } from "./mockQuotes";

export const mockMarketSatellites = stockQuoteMocks.filter((stock) => ["QQQ", "SOXL", "UVXY", "SLV"].includes(stock.symbol));
