export type ThemeGroupId =
  | "ai-semiconductors"
  | "cloud-ai-software"
  | "internet-attention"
  | "space-mobility"
  | "crypto-onchain"
  | "clean-energy-resources"
  | "healthcare-pharma"
  | "consumer-defensive"
  | "market-satellites";

export type WatchlistGroup = {
  id: ThemeGroupId;
  name: string;
  description: string;
  symbols: string[];
  icon: string;
  satelliteOnly?: boolean;
};

export type StockQuoteMock = {
  symbol: string;
  companyName: string;
  price: number;
  volume: number;
  previousVolume: number;
  dollarVolume?: number;
  previousDollarVolume?: number;
  changePct: number;
  previousChangePct: number;
  sparkline: number[];
  source?: "mock";
};

export type ThemeGroupSummary = {
  group: WatchlistGroup;
  stocks: StockQuoteMock[];
  dollarVolume: number;
  previousDollarVolume: number;
  averageChangePct: number;
  gainers: number;
  losers: number;
  top50Count: number;
  concentration: number;
  leader: StockQuoteMock;
  laggard: StockQuoteMock;
};
