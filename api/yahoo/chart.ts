const allowedSymbols = new Set([
  "000001.SS",
  "399001.SZ",
  "399006.SZ",
  "000300.SS",
  "000905.SS",
  "000852.SS",
  "000688.SS",
]);

export default async function handler(
  req: { url?: string },
  res: {
    status: (code: number) => typeof res;
    setHeader: (name: string, value: string) => void;
    send: (body: string) => void;
    json: (body: unknown) => void;
  },
) {
  try {
    const url = new URL(req.url || "", "https://china-a-share-dashboard.vercel.app");
    const symbol = url.searchParams.get("symbol") || "";
    const range = url.searchParams.get("range") === "1y" ? "1y" : "1d";
    const interval = range === "1y" ? "1d" : "5m";
    if (!allowedSymbols.has(symbol)) {
      res.status(400).json({ error: "Unsupported symbol" });
      return;
    }
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const response = await fetch(yahooUrl, { headers: { "user-agent": "Mozilla/5.0" } });
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", range === "1d" ? "s-maxage=60, stale-while-revalidate=180" : "s-maxage=21600, stale-while-revalidate=86400");
    res.status(response.status).send(await response.text());
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
