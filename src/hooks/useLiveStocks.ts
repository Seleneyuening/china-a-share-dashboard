import { useCallback, useEffect, useRef, useState } from "react";
import { marketDataService } from "../services/marketDataService";
import type { StockQuoteMock } from "../types/themeGroup";

type WatchlistPayload = {
  source: "yahoo";
  updatedAt: string;
  coverage: { received: number; expected: number };
  items: Array<Pick<StockQuoteMock, "symbol" | "price" | "volume" | "previousVolume" | "dollarVolume" | "previousDollarVolume" | "changePct" | "previousChangePct" | "sparkline">>;
};

const refreshIntervalMs = 5 * 60 * 1000;

export function useLiveStocks() {
  const [stocks, setStocks] = useState<StockQuoteMock[]>(() => marketDataService.getStockQuotes());
  const [source, setSource] = useState("本地模拟数据（等待行情）");
  const [updatedAt, setUpdatedAt] = useState("尚未连接");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const mounted = useRef(true);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/watchlist/quotes${force ? `?refresh=${Date.now()}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`行情请求失败（${response.status}）`);
      const payload = await response.json() as WatchlistPayload;
      const liveBySymbol = new Map(payload.items.map((item) => [item.symbol, item]));
      const merged = marketDataService.getStockQuotes().flatMap((fallback) => {
        const live = liveBySymbol.get(fallback.symbol);
        return live ? [{ ...fallback, ...live, source: "yahoo" as const }] : [];
      });
      if (!mounted.current) return;
      setStocks(merged);
      setSource(`Yahoo 延迟行情 · ${payload.coverage.received}/${payload.coverage.expected}`);
      setUpdatedAt(new Date(payload.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }));
      setError(payload.coverage.received < payload.coverage.expected ? `${payload.coverage.expected - payload.coverage.received} 只股票暂停或暂缺行情` : undefined);
    } catch (cause) {
      if (!mounted.current) return;
      setSource("本地模拟数据（行情连接失败）");
      setUpdatedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }));
      setError(cause instanceof Error ? cause.message : "行情暂时无法更新");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), refreshIntervalMs);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { stocks, source, updatedAt, ready: stocks.length > 0, loading, error, refresh };
}
