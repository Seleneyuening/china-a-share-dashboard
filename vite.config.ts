import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { stockQuoteMocks } from "./src/data/mockQuotes";
import { watchlistGroups } from "./src/data/watchlistGroups";
import { getWatchlistPayload } from "./api/watchlist/quotes";

function json(res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

const quoteCache = new Map<string, { expiresAt: number; value: unknown }>();
const topVolumeCache = new Map<string, { expiresAt: number; value: unknown }>();
const satelliteSymbols = new Set(watchlistGroups.find((group) => group.satelliteOnly)?.symbols || []);
const topVolumeSymbols = stockQuoteMocks.filter((stock) => !satelliteSymbols.has(stock.symbol)).slice(0, 50).map((stock) => stock.symbol);
const topVolumeCacheMs = 5 * 60 * 1000;
const fallbackTopVolumeCacheMs = 60 * 60 * 1000;
let longbridgeQuoteContextPromise: Promise<any> | undefined;

type TopVolumePayload = {
  source: "longbridge" | "yahoo" | "twelvedata" | "fmp" | "mock";
  updatedAt: string;
  items: Array<{ symbol: string; price?: number; volume?: number; dollarVolume?: number; changePct?: number; previousDollarVolume?: number; previousChangePct?: number }>;
};

async function proxyYahoo(req: { url?: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }) {
  try {
    const url = new URL(req.url || "", "http://localhost");
    const symbol = url.searchParams.get("symbol");
    const range = url.searchParams.get("range") || "1d";
    const interval = url.searchParams.get("interval") || "5m";
    if (!symbol) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Missing symbol" }));
      return;
    }
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
    const response = await fetch(yahooUrl, { headers: { "user-agent": "Mozilla/5.0" } });
    res.statusCode = response.status;
    res.setHeader("content-type", "application/json");
    res.end(await response.text());
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: String(error) }));
  }
}

async function proxyFinnhubQuote(req: { url?: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }) {
  try {
    const token = process.env.FINNHUB_API_KEY;
    const url = new URL(req.url || "", "http://localhost");
    const symbols = (url.searchParams.get("symbols") || "").split(",").map((symbol) => symbol.trim()).filter(Boolean);
    if (!token) {
      json(res, 500, { error: "Missing FINNHUB_API_KEY" });
      return;
    }
    if (!symbols.length) {
      json(res, 400, { error: "Missing symbols" });
      return;
    }
    const now = Date.now();
    const entries = await Promise.all(symbols.map(async (symbol) => {
      const cached = quoteCache.get(symbol);
      if (cached && cached.expiresAt > now) return [symbol, cached.value];
      const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`;
      const response = await fetch(finnhubUrl);
      const value = response.ok ? await response.json() : null;
      if (value) quoteCache.set(symbol, { value, expiresAt: now + 60_000 });
      return [symbol, value];
    }));
    json(res, 200, Object.fromEntries(entries));
  } catch (error) {
    json(res, 502, { error: String(error) });
  }
}

async function proxyWatchlistQuotes(_req: { url?: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }) {
  try {
    const payload = await getWatchlistPayload();
    json(res, payload.items.length ? 200 : 502, payload.items.length ? payload : { error: "行情源暂时不可用" });
  } catch (error) {
    json(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

function mockTopVolume() {
  return {
    source: "mock",
    updatedAt: new Date().toISOString(),
    items: stockQuoteMocks
      .filter((stock) => topVolumeSymbols.includes(stock.symbol))
      .map((stock) => ({
        symbol: stock.symbol,
        price: stock.price,
        volume: stock.volume,
        dollarVolume: stock.dollarVolume || stock.price * stock.volume,
        changePct: stock.changePct,
        previousDollarVolume: stock.previousDollarVolume || stock.price * stock.previousVolume,
        previousChangePct: stock.previousChangePct,
      })),
  };
}

async function proxyTopVolume(_req: { url?: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }) {
  const now = Date.now();
  const cached = topVolumeCache.get("top-volume");
  if (cached && cached.expiresAt > now) {
    json(res, 200, { ...(cached.value as object), cached: true });
    return;
  }
  try {
    const payload = await withTimeout(fetchLongbridgeTopVolume(), 28_000, "Longbridge timeout");
    topVolumeCache.set("top-volume", { value: payload, expiresAt: now + topVolumeCacheMs });
    json(res, 200, { ...payload, cached: false });
    return;
  } catch (error) {
    console.warn("[top-volume] Longbridge unavailable:", error instanceof Error ? error.message : String(error));
  }
  try {
    const payload = await withTimeout(fetchYahooTopVolume(), 20_000, "Yahoo timeout");
    topVolumeCache.set("top-volume", { value: payload, expiresAt: now + topVolumeCacheMs });
    json(res, 200, { ...payload, cached: false });
    return;
  } catch (error) {
    console.warn("[top-volume] Yahoo unavailable:", error instanceof Error ? error.message : String(error));
  }
  try {
    const token = process.env.TWELVE_DATA_API_KEY;
    if (!token) throw new Error("Missing TWELVE_DATA_API_KEY");
    const quotes = [];
    for (let index = 0; index < topVolumeSymbols.length; index += 5) {
      const chunk = topVolumeSymbols.slice(index, index + 5);
      const batch = await fetchTwelveQuotes(chunk, token);
      if (batch.length) {
        quotes.push(...batch);
      } else {
        for (const symbol of chunk) quotes.push(...await fetchTwelveQuotes([symbol], token));
      }
    }
    if (quotes.length < 30) throw new Error("Twelve Data returned too few symbols");
    const payload = {
      source: "twelvedata",
      updatedAt: new Date().toISOString(),
      items: quotes.map((quote: any) => {
        const price = Number(quote.close);
        const volume = Number(quote.volume);
        const previousPrice = Number(quote.previous_close);
        const averageVolume = Number(quote.average_volume);
        return { symbol: quote.symbol, price, volume, dollarVolume: price * volume, changePct: Number(quote.percent_change), previousDollarVolume: previousPrice * averageVolume };
      }).filter((item) => item.symbol && Number.isFinite(item.dollarVolume)),
    };
    topVolumeCache.set("top-volume", { value: payload, expiresAt: now + fallbackTopVolumeCacheMs });
    json(res, 200, { ...payload, cached: false });
  } catch {
    const fmpToken = process.env.FMP_API_KEY;
    if (fmpToken) {
      try {
        const body = [];
        for (let index = 0; index < topVolumeSymbols.length; index += 10) {
          body.push(...(await Promise.all(topVolumeSymbols.slice(index, index + 10).map((symbol) => fetchFmpProfile(symbol, fmpToken)))).flat());
        }
        if (body.length >= 30) {
          const payload = {
            source: "fmp",
            updatedAt: new Date().toISOString(),
            items: body.map((quote: any) => {
              const price = Number(quote.price);
              const volume = Number(quote.volume);
              const previousPrice = price - Number(quote.change || 0);
              const averageVolume = Number(quote.averageVolume || volume);
              return { symbol: quote.symbol, price, volume, dollarVolume: price * volume, changePct: Number(String(quote.changePercentage || "0").replace("%", "")), previousDollarVolume: previousPrice * averageVolume };
            }).filter((item) => item.symbol && Number.isFinite(item.dollarVolume)),
          };
          topVolumeCache.set("top-volume", { value: payload, expiresAt: now + fallbackTopVolumeCacheMs });
          json(res, 200, { ...payload, cached: false });
          return;
        }
      } catch {
        // fall through to mock
      }
    }
    const payload = mockTopVolume();
    json(res, 200, { ...payload, cached: false });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function getLongbridgeQuoteContext() {
  if (!longbridgeQuoteContextPromise) {
    longbridgeQuoteContextPromise = (async () => {
      const { Config, QuoteContext } = await import("longbridge");
      return QuoteContext.new(Config.fromApikeyEnv());
    })();
    longbridgeQuoteContextPromise.catch(() => {
      longbridgeQuoteContextPromise = undefined;
    });
  }
  return longbridgeQuoteContextPromise;
}

async function fetchLongbridgeTopVolume(): Promise<TopVolumePayload> {
  if (!process.env.LONGBRIDGE_APP_KEY || !process.env.LONGBRIDGE_APP_SECRET || !process.env.LONGBRIDGE_ACCESS_TOKEN) {
    throw new Error("Missing Longbridge env");
  }
  const ctx = await getLongbridgeQuoteContext();
  const [quotes, dailyBySymbol] = await Promise.all([
    ctx.quote(topVolumeSymbols),
    fetchLongbridgeDaily(ctx),
  ]);
  const items = quotes.map((quote: any) => {
    const symbol = String(quote.symbol || "");
    const price = Number(quote.lastDone);
    const prevClose = Number(quote.prevClose);
    const daily = dailyBySymbol.get(symbol);
    return {
      symbol,
      price,
      volume: Number(quote.volume),
      dollarVolume: Number(quote.turnover?.toString?.() || quote.turnover),
      changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : undefined,
      previousDollarVolume: daily?.previousDollarVolume,
      previousChangePct: daily?.previousChangePct,
    };
  }).filter((item: TopVolumePayload["items"][number]) => item.symbol && Number.isFinite(item.dollarVolume));
  if (items.length < 30) throw new Error("Longbridge returned too few symbols");
  return { source: "longbridge", updatedAt: new Date().toISOString(), items };
}

async function fetchLongbridgeDaily(ctx: any) {
  const pairs: Array<readonly [string, { previousDollarVolume?: number; previousChangePct?: number }]> = [];
  for (let index = 0; index < topVolumeSymbols.length; index += 10) {
    pairs.push(...await Promise.all(topVolumeSymbols.slice(index, index + 10).map(async (symbol) => {
      try {
        const rows = await ctx.candlesticks(symbol, 14, 3, 0, 0);
        const previous = rows[rows.length - 2] as any;
        const beforePrevious = rows[rows.length - 3] as any;
        const previousClose = Number(previous?.close);
        const beforePreviousClose = Number(beforePrevious?.close);
        return [symbol, {
          previousDollarVolume: Number(previous?.turnover?.toString?.() || previous?.turnover),
          previousChangePct: beforePreviousClose ? ((previousClose - beforePreviousClose) / beforePreviousClose) * 100 : undefined,
        }] as const;
      } catch {
        return [symbol, {}] as const;
      }
    })));
  }
  return new Map(pairs);
}

async function fetchYahooTopVolume(): Promise<TopVolumePayload> {
  const rows = await Promise.all(topVolumeSymbols.map((symbol) => fetchYahooQuote(symbol)));
  const items = rows.filter((row): row is NonNullable<typeof row> => row !== null);
  if (items.length < 30) throw new Error("Yahoo returned too few symbols");
  return { source: "yahoo", updatedAt: new Date().toISOString(), items };
}

async function fetchYahooQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!response.ok) return null;
    const body = await response.json();
    const result = body?.chart?.result?.[0];
    const meta = result?.meta;
    const quote = result?.indicators?.quote?.[0];
    const closes: number[] = quote?.close || [];
    const volumes: number[] = quote?.volume || [];
    const price = Number(meta?.regularMarketPrice);
    const volume = Number(meta?.regularMarketVolume);
    const previousVolume = Number(volumes[volumes.length - 2]);
    const previousClose2 = Number(closes[closes.length - 3]);
    const previousClose1 = Number(closes[closes.length - 2]);
    const previousClose = previousClose1;
    if (!meta?.symbol || !Number.isFinite(price) || !Number.isFinite(volume)) return null;
    return {
      symbol: meta.symbol,
      price,
      volume,
      dollarVolume: price * volume,
      changePct: previousClose ? ((price - previousClose) / previousClose) * 100 : undefined,
      previousDollarVolume: Number.isFinite(previousVolume) && Number.isFinite(previousClose1) ? previousVolume * previousClose1 : undefined,
      previousChangePct: previousClose2 ? ((previousClose1 - previousClose2) / previousClose2) * 100 : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchTwelveQuotes(symbols: string[], token: string) {
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(","))}&apikey=${encodeURIComponent(token)}`;
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body?.status === "error" || body?.code) return [];
  return body?.symbol ? [body] : Object.values(body).filter((quote: any) => quote?.symbol);
}

async function fetchFmpProfile(symbol: string, token: string) {
  const response = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(token)}`);
  const body = await response.json();
  return response.ok && Array.isArray(body) ? body : [];
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  process.env.FINNHUB_API_KEY ||= env.FINNHUB_API_KEY;
  process.env.TWELVE_DATA_API_KEY ||= env.TWELVE_DATA_API_KEY;
  process.env.FMP_API_KEY ||= env.FMP_API_KEY;
  process.env.LONGBRIDGE_APP_KEY ||= env.LONGBRIDGE_APP_KEY;
  process.env.LONGBRIDGE_APP_SECRET ||= env.LONGBRIDGE_APP_SECRET;
  process.env.LONGBRIDGE_ACCESS_TOKEN ||= env.LONGBRIDGE_ACCESS_TOKEN;
  process.env.LONGBRIDGE_PRINT_QUOTE_PACKAGES ||= "false";
  return {
  plugins: [
    react(),
    {
      name: "yahoo-local-proxy",
      configureServer(server) {
        server.middlewares.use("/api/yahoo/chart", proxyYahoo);
        server.middlewares.use("/api/finnhub/quote", proxyFinnhubQuote);
        server.middlewares.use("/api/top-volume", proxyTopVolume);
        server.middlewares.use("/api/watchlist/quotes", proxyWatchlistQuotes);
      },
      configurePreviewServer(server) {
        server.middlewares.use("/api/yahoo/chart", proxyYahoo);
        server.middlewares.use("/api/finnhub/quote", proxyFinnhubQuote);
        server.middlewares.use("/api/top-volume", proxyTopVolume);
        server.middlewares.use("/api/watchlist/quotes", proxyWatchlistQuotes);
      },
    },
  ],
  };
});
