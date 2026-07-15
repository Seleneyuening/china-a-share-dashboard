export type MarketRegion = "CN";
export type RangeKey = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y";

export type Market = {
  id: MarketRegion;
  name: string;
  flag: string;
  timezone: string;
  openEt: string;
  closeEt: string;
  sessionLabel: string;
};

export type IndexMeta = {
  symbol: string;
  name: string;
  marketId: MarketRegion;
  color: string;
  featured?: boolean;
};

export type Quote = {
  symbol: string;
  value: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  updatedAt: string;
};

export type Point = {
  time: string;
  value: number;
};

export type EconomicEvent = {
  date: string;
  label: string;
  type: "FOMC" | "CPI" | "NFP" | "BOJ" | "CHINA_POLICY" | "DATA";
  color: string;
};

export type MetricRow = {
  symbol: string;
  pe: number;
  pb: number;
  dividend: number;
  volatility20d: number;
};

export type MarketDataSnapshot = {
  quotes: Quote[];
  intraday: Record<string, Point[]>;
  historical: Record<string, Point[]>;
  source: "mock" | "yahoo";
  fetchedAt: string;
};
