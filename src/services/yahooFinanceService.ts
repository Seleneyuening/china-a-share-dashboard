import { indexes } from "../data/markets";
import { mockHistorical, mockIntraday } from "../data/mockSeries";
import { mockQuotes } from "../data/mockQuotes";
import type { MarketDataSnapshot, Point, Quote } from "../types";

const yahooSymbols: Record<string, string> = {
  "000001.SH": "000001.SS",
  "399001.SZ": "399001.SZ",
  "399006.SZ": "399006.SZ",
  "000300.SH": "000300.SS",
  "000905.SH": "000905.SS",
  "000852.SH": "000852.SS",
  "000688.SH": "000688.SS",
};

const fallbackBySymbol = Object.fromEntries(mockQuotes.map((quote) => [quote.symbol, quote]));

type YahooResult = {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    regularMarketTime?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      close?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      open?: Array<number | null>;
    }>;
  };
};

function formatShanghaiTime(epochSeconds?: number) {
  if (!epochSeconds) return "时间未知";
  return new Date(epochSeconds * 1000).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

function pointsFrom(result: YahooResult, format: "time" | "date" = "time"): Point[] {
  const closes = result.indicators?.quote?.[0]?.close || [];
  return (result.timestamp || [])
    .map((epochSeconds, index) => {
      const value = closes[index];
      if (typeof value !== "number") return undefined;
      const date = new Date(epochSeconds * 1000);
      const time = format === "date"
        ? date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", timeZone: "Asia/Shanghai" })
        : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" });
      return { time, value: Number(value.toFixed(2)) };
    })
    .filter((point): point is Point => Boolean(point));
}

function quoteFrom(symbol: string, result: YahooResult, intraday: Point[], provider: "longbridge" | "yahoo"): Quote {
  const fallback = fallbackBySymbol[symbol];
  const current = result.meta?.regularMarketPrice ?? intraday[intraday.length - 1]?.value;
  const previousClose = result.meta?.previousClose ?? result.meta?.chartPreviousClose;
  if (!fallback || typeof current !== "number" || typeof previousClose !== "number") {
    throw new Error(`Missing quote fields for ${symbol}`);
  }
  const quote = result.indicators?.quote?.[0];
  const highs = (quote?.high || []).filter((value): value is number => typeof value === "number");
  const lows = (quote?.low || []).filter((value): value is number => typeof value === "number");
  const opens = (quote?.open || []).filter((value): value is number => typeof value === "number");
  const change = current - previousClose;
  return {
    ...fallback,
    value: Number(current.toFixed(2)),
    change: Number(change.toFixed(2)),
    changePct: Number(((change / previousClose) * 100).toFixed(2)),
    open: Number((opens[0] ?? current).toFixed(2)),
    high: Number((highs.length ? Math.max(...highs) : current).toFixed(2)),
    low: Number((lows.length ? Math.min(...lows) : current).toFixed(2)),
    previousClose: Number(previousClose.toFixed(2)),
    updatedAt: `${formatShanghaiTime(result.meta?.regularMarketTime)} · ${provider === "longbridge" ? "长桥行情" : "Yahoo 延迟行情"}`,
  };
}

async function fetchChart(yahooSymbol: string, range: string, interval: string): Promise<{ result: YahooResult; provider: "longbridge" | "yahoo" }> {
  const response = await fetch(`/api/yahoo/chart?symbol=${encodeURIComponent(yahooSymbol)}&range=${range}&interval=${interval}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
  const body = await response.json();
  const result = body?.chart?.result?.[0] as YahooResult | undefined;
  if (!result) throw new Error(body?.chart?.error?.description || "Quote response is empty");
  return { result, provider: body?.provider === "longbridge" ? "longbridge" : "yahoo" };
}

export async function getYahooSnapshot(): Promise<MarketDataSnapshot> {
  const pairs = await Promise.all(indexes.map(async (index) => {
    const yahooSymbol = yahooSymbols[index.symbol];
    if (!yahooSymbol) throw new Error(`Missing Yahoo symbol mapping for ${index.symbol}`);
    const [oneDayResponse, oneYearResponse] = await Promise.all([
      fetchChart(yahooSymbol, "1d", "5m"),
      fetchChart(yahooSymbol, "1y", "1d"),
    ]);
    const oneDay = oneDayResponse.result;
    const oneYear = oneYearResponse.result;
    const intraday = pointsFrom(oneDay);
    if (!intraday.length) throw new Error(`No intraday points for ${index.symbol}`);
    const quote = quoteFrom(index.symbol, oneDay, intraday, oneDayResponse.provider);
    const historical = pointsFrom(oneYear, "date");
    return [index.symbol, {
      quote,
      intraday,
      historical: historical.length ? historical : mockHistorical[index.symbol] || [],
      provider: oneDayResponse.provider === "longbridge" && oneYearResponse.provider === "longbridge" ? "longbridge" as const : "yahoo" as const,
    }] as const;
  }));

  return {
    quotes: pairs.map(([, data]) => data.quote),
    intraday: Object.fromEntries(pairs.map(([symbol, data]) => [symbol, data.intraday])),
    historical: Object.fromEntries(pairs.map(([symbol, data]) => [symbol, data.historical])),
    source: pairs.every(([, data]) => data.provider === "longbridge") ? "longbridge" : "yahoo",
    fetchedAt: new Date().toISOString(),
  };
}
