import type { IndexMeta, Market } from "../types";

export const markets: Market[] = [
  { id: "CN", name: "沪深 A 股", flag: "🇨🇳", timezone: "CST", openEt: "09:30", closeEt: "15:00", sessionLabel: "沪深 A 股" },
];

export const indexes: IndexMeta[] = [
  { symbol: "000001.SH", name: "上证指数", marketId: "CN", color: "#2f83ff", featured: true },
  { symbol: "399001.SZ", name: "深证成指", marketId: "CN", color: "#9b5cff", featured: true },
  { symbol: "399006.SZ", name: "创业板指", marketId: "CN", color: "#5aa7ff", featured: true },
  { symbol: "000300.SH", name: "沪深 300", marketId: "CN", color: "#4cc45b" },
  { symbol: "000905.SH", name: "中证 500", marketId: "CN", color: "#ff8a2a" },
  { symbol: "000852.SH", name: "中证 1000", marketId: "CN", color: "#4cc9f0" },
  { symbol: "000688.SH", name: "科创 50", marketId: "CN", color: "#ffd24a" },
];

export const mainSymbols = ["000001.SH", "399001.SZ", "399006.SZ", "000300.SH", "000905.SH", "000688.SH"];
export const comparisonSymbols = indexes.map((index) => index.symbol);
