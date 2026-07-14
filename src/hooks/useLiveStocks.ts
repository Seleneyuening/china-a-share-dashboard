import { useCallback, useState } from "react";
import { marketDataService } from "../services/marketDataService";
import type { StockQuoteMock } from "../types/themeGroup";

export function useLiveStocks() {
  const [stocks, setStocks] = useState<StockQuoteMock[]>(() => marketDataService.getStockQuotes());
  const source = "本地模拟数据";
  const updatedAt = "模拟盘 15:00 CST";
  const ready = true;

  const refresh = useCallback((_force?: boolean) => setStocks(marketDataService.getStockQuotes()), []);

  return { stocks, source, updatedAt, ready, refresh };
}
