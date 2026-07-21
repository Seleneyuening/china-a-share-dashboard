declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
  arch: string;
};

let quoteContextPromise: Promise<any> | undefined;
// Keep SDK const-enum values local so Vercel's isolatedModules build does not
// access ambient const enums from longbridge/index.d.ts.
const PERIOD_MIN_5 = 2;
const PERIOD_DAY = 6;
const ADJUST_NONE = 0;
const ADJUST_FORWARD = 1;

function number(value: unknown): number {
  if (typeof value === "object" && value !== null && "toString" in value) {
    return Number((value as { toString(): string }).toString());
  }
  return Number(value);
}

function shanghaiDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function requireCredentials() {
  if (!process.env.LONGBRIDGE_APP_KEY || !process.env.LONGBRIDGE_APP_SECRET || !process.env.LONGBRIDGE_ACCESS_TOKEN) {
    throw new Error("Missing Longbridge env");
  }
}

async function getQuoteContext() {
  requireCredentials();
  if (!quoteContextPromise) {
    quoteContextPromise = (async () => {
      // Vercel needs the Linux native binding to be visible to dependency tracing.
      if (process.platform === "linux" && process.arch === "x64") {
        await import("longbridge-linux-x64-gnu");
      }
      const { Config, QuoteContext } = await import("longbridge");
      return QuoteContext.new(Config.fromEnv());
    })();
    quoteContextPromise.catch(() => {
      quoteContextPromise = undefined;
    });
  }
  return quoteContextPromise;
}

async function inBatches<T, R>(items: readonly T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(...await Promise.all(items.slice(index, index + size).map(worker)));
  }
  return output;
}

export type LongbridgeWatchlistItem = {
  symbol: string;
  price: number;
  volume: number;
  previousVolume: number;
  dollarVolume: number;
  previousDollarVolume: number;
  changePct: number;
  previousChangePct: number;
  sparkline: number[];
};

export async function fetchLongbridgeWatchlist(symbols: readonly string[]): Promise<{ updatedAt: string; items: LongbridgeWatchlistItem[] }> {
  const context = await getQuoteContext();
  const quotes = await context.quote([...symbols]);
  const quoteBySymbol = new Map(quotes.map((quote: any) => [String(quote.symbol), quote]));
  const items = await inBatches(symbols, 4, async (symbol) => {
    const quote = quoteBySymbol.get(symbol) as any;
    if (!quote) return null;
    const price = number(quote.lastDone);
    const previousClose = number(quote.prevClose);
    const volume = number(quote.volume);
    const dollarVolume = number(quote.turnover);
    if (![price, previousClose, volume, dollarVolume].every(Number.isFinite) || price <= 0 || previousClose <= 0) return null;

    const dailyRows = await context.candlesticks(symbol, PERIOD_DAY, 8, ADJUST_FORWARD);
    const quoteDate = shanghaiDate(quote.timestamp instanceof Date ? quote.timestamp : new Date());
    const completed = dailyRows.filter((row: any) => shanghaiDate(row.timestamp) !== quoteDate);
    const previous = completed.at(-1) as any;
    const beforePrevious = completed.at(-2) as any;
    const previousVolume = number(previous?.volume);
    const previousDollarVolume = number(previous?.turnover);
    const previousDayClose = number(previous?.close);
    const beforePreviousClose = number(beforePrevious?.close);
    if (![previousVolume, previousDollarVolume, previousDayClose, beforePreviousClose].every(Number.isFinite) || previousDayClose <= 0 || beforePreviousClose <= 0) return null;

    return {
      symbol,
      price: Number(price.toFixed(3)),
      volume,
      previousVolume,
      dollarVolume,
      previousDollarVolume,
      changePct: Number((((price - previousClose) / previousClose) * 100).toFixed(2)),
      previousChangePct: Number((((previousDayClose - beforePreviousClose) / beforePreviousClose) * 100).toFixed(2)),
      sparkline: [...completed.slice(-6).map((row: any) => number(row.close)), price]
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Number(value.toFixed(3))),
    } satisfies LongbridgeWatchlistItem;
  });
  const validItems = items.filter((item): item is LongbridgeWatchlistItem => item !== null);
  if (validItems.length < Math.max(1, Math.floor(symbols.length * 0.8))) {
    throw new Error(`Longbridge watchlist coverage incomplete: ${validItems.length}/${symbols.length}`);
  }
  const newestTimestamp = quotes.reduce((latest: number, quote: any) => {
    const timestamp = quote.timestamp instanceof Date ? quote.timestamp.getTime() : 0;
    return Math.max(latest, timestamp);
  }, 0);
  return { updatedAt: new Date(newestTimestamp || Date.now()).toISOString(), items: validItems };
}

function longbridgeSymbol(symbol: string): string {
  return symbol.endsWith(".SS") ? symbol.replace(/\.SS$/, ".SH") : symbol;
}

export async function fetchLongbridgeChart(symbol: string, range: "1d" | "1y") {
  const context = await getQuoteContext();
  const target = longbridgeSymbol(symbol);
  const [quote] = await context.quote([target]);
  if (!quote) throw new Error(`Longbridge quote missing: ${target}`);
  const rows = await context.candlesticks(
    target,
    range === "1y" ? PERIOD_DAY : PERIOD_MIN_5,
    range === "1y" ? 260 : 72,
    range === "1y" ? ADJUST_FORWARD : ADJUST_NONE,
  );
  const quoteDate = shanghaiDate(quote.timestamp instanceof Date ? quote.timestamp : new Date());
  const selectedRows = range === "1d"
    ? rows.filter((row: any) => shanghaiDate(row.timestamp) === quoteDate)
    : rows;
  const usableRows = selectedRows.length ? selectedRows : rows;
  if (!usableRows.length) throw new Error(`Longbridge candles missing: ${target}`);
  const price = number(quote.lastDone);
  const previousClose = number(quote.prevClose);
  return {
    provider: "longbridge" as const,
    chart: {
      result: [{
        meta: {
          symbol,
          regularMarketPrice: price,
          previousClose,
          chartPreviousClose: previousClose,
          regularMarketTime: Math.floor((quote.timestamp instanceof Date ? quote.timestamp.getTime() : Date.now()) / 1000),
        },
        timestamp: usableRows.map((row: any) => Math.floor(row.timestamp.getTime() / 1000)),
        indicators: {
          quote: [{
            open: usableRows.map((row: any) => number(row.open)),
            high: usableRows.map((row: any) => number(row.high)),
            low: usableRows.map((row: any) => number(row.low)),
            close: usableRows.map((row: any) => number(row.close)),
            volume: usableRows.map((row: any) => number(row.volume)),
          }],
        },
      }],
      error: null,
    },
  };
}
