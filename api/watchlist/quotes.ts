import { stockQuoteMocks } from "../../src/data/mockQuotes";

type YahooResult = {
  meta?: {
    regularMarketPrice?: number;
    regularMarketVolume?: number;
    previousClose?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
};

const toYahooSymbol = (symbol: string) => symbol.endsWith(".SH") ? symbol.replace(/\.SH$/, ".SS") : symbol;

async function fetchQuote(symbol: string) {
  const yahooSymbol = toYahooSymbol(symbol);
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1mo&interval=1d`, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error(`${symbol}: ${response.status}`);
  const body = await response.json();
  const result = body?.chart?.result?.[0] as YahooResult | undefined;
  if (!result) throw new Error(`${symbol}: empty result`);

  const quote = result.indicators?.quote?.[0];
  const bars = (result.timestamp || []).map((timestamp, index) => ({
    timestamp,
    close: quote?.close?.[index],
    volume: quote?.volume?.[index],
  })).filter((bar): bar is { timestamp: number; close: number; volume: number | null | undefined } => typeof bar.close === "number");
  const current = bars.at(-1);
  const previous = bars.at(-2);
  const beforePrevious = bars.at(-3);
  const price = result.meta?.regularMarketPrice ?? current?.close;
  const volume = result.meta?.regularMarketVolume ?? current?.volume;
  const previousClose = result.meta?.previousClose ?? previous?.close;
  if (typeof price !== "number" || typeof volume !== "number" || typeof previousClose !== "number") {
    throw new Error(`${symbol}: incomplete quote`);
  }
  const previousVolume = typeof previous?.volume === "number" ? previous.volume : volume;

  return {
    symbol,
    price: Number(price.toFixed(3)),
    volume,
    previousVolume,
    dollarVolume: Math.round(price * volume),
    previousDollarVolume: Math.round(previousClose * previousVolume),
    changePct: Number((((price - previousClose) / previousClose) * 100).toFixed(2)),
    previousChangePct: typeof beforePrevious?.close === "number"
      ? Number((((previousClose - beforePrevious.close) / beforePrevious.close) * 100).toFixed(2))
      : 0,
    sparkline: bars.slice(-7).map((bar) => Number(bar.close.toFixed(3))),
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export const config = { maxDuration: 60 };

export async function getWatchlistPayload() {
  const settled = await mapWithConcurrency(stockQuoteMocks, 8, (stock) => fetchQuote(stock.symbol));
  const items = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const receivedSymbols = new Set(items.map((item) => item.symbol));
  return {
    source: "yahoo" as const,
    updatedAt: new Date().toISOString(),
    coverage: { received: items.length, expected: stockQuoteMocks.length },
    missingSymbols: stockQuoteMocks.filter((stock) => !receivedSymbols.has(stock.symbol)).map((stock) => stock.symbol),
    items,
  };
}

export default async function handler(
  _req: { url?: string },
  res: {
    status: (code: number) => typeof res;
    setHeader: (name: string, value: string) => void;
    json: (body: unknown) => void;
  },
) {
  const payload = await getWatchlistPayload();
  if (!payload.items.length) {
    res.status(502).json({ error: "行情源暂时不可用" });
    return;
  }
  res.setHeader("cache-control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json(payload);
}
