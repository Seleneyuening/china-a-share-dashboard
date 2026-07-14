export type NewsItem = {
  headline: string;
  source: string;
  url: string;
  datetime: number;
  summary?: string;
};

export type EarningsEvent = {
  date: string;
  quarter: number;
  year: number;
  epsEstimate?: number;
  revenueEstimate?: number;
} | null;

export type InsiderTransaction = {
  name: string;
  share: number;
  change: number;
  transactionDate: string;
  transactionCode: string;
  transactionPrice?: number;
};

export type RecommendationTrend = {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
};

export type StockIntel = {
  news: NewsItem[];
  earnings: EarningsEvent;
  insider: InsiderTransaction[];
  recommendation: RecommendationTrend[];
};

export type UpcomingEarnings = {
  symbol: string;
  date: string;
  quarter: number;
  year: number;
  epsEstimate?: number;
};
