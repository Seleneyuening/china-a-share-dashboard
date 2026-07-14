import type { StockIntel, UpcomingEarnings } from "../types/stockIntel";

export async function getStockIntel(_symbol: string): Promise<StockIntel> {
  return { news: [], earnings: null, insider: [], recommendation: [] };
}

export async function getUpcomingEarnings(_days?: number): Promise<UpcomingEarnings[]> {
  return [];
}
