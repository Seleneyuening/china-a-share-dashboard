import type { Point } from "../types";
import { indexes } from "./markets";
import { mockQuotes } from "./mockQuotes";

const profile: Record<string, { drift: number; wobble: number; phase: number; dip?: number }> = {
  SPX: { drift: 0.00095, wobble: 0.003, phase: 0.2 },
  NDX: { drift: 0.00135, wobble: 0.004, phase: 0.9 },
  RUT: { drift: -0.00035, wobble: 0.004, phase: 1.4, dip: 0.012 },
  NKY: { drift: 0.0018, wobble: 0.004, phase: 1.7 },
  KOSPI: { drift: 0.0007, wobble: 0.0035, phase: 2.2 },
  CSI300: { drift: -0.00065, wobble: 0.004, phase: 2.6, dip: 0.018 },
  HSI: { drift: -0.00025, wobble: 0.004, phase: 3 },
  HSTECH: { drift: -0.00055, wobble: 0.005, phase: 3.4, dip: 0.015 },
  FTSE: { drift: 0.00038, wobble: 0.0025, phase: 3.9 },
};

const quoteBySymbol = Object.fromEntries(mockQuotes.map((quote) => [quote.symbol, quote]));

function makeSeries(symbol: string, points: number, startValue: number, minutes = 30): Point[] {
  const p = profile[symbol] || { drift: 0.00045, wobble: 0.0035, phase: symbol.length * 0.37 };
  const out: Point[] = [];
  let value = startValue;
  for (let i = 0; i < points; i += 1) {
    const cycle = Math.sin(i * 0.31 + p.phase) * p.wobble;
    const smaller = Math.cos(i * 0.13 + p.phase) * p.wobble * 0.45;
    const shock = p.dip && i > points * 0.6 ? -p.dip / points : 0;
    value *= 1 + p.drift + cycle + smaller + shock;
    const sessionMinute = minutes === 5
      ? i < 25 ? 9 * 60 + 30 + i * minutes : 13 * 60 + (i - 25) * minutes
      : 9 * 60 + 30 + i * minutes;
    const hour = Math.floor(sessionMinute / 60);
    const minute = sessionMinute % 60;
    out.push({ time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, value: Number(value.toFixed(2)) });
  }
  return out;
}

function makeHistoricalSeries(symbol: string, points: number, startValue: number): Point[] {
  const p = profile[symbol] || { drift: 0.00045, wobble: 0.0035, phase: symbol.length * 0.37 };
  const start = new Date(2026, 0, 2);
  const out: Point[] = [];
  let value = startValue;
  for (let i = 0; i < points; i += 1) {
    const cycle = Math.sin(i * 0.31 + p.phase) * p.wobble;
    const smaller = Math.cos(i * 0.13 + p.phase) * p.wobble * 0.45;
    const shock = p.dip && i > points * 0.6 ? -p.dip / points : 0;
    value *= 1 + p.drift + cycle + smaller + shock;
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    out.push({ time: `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`, value: Number(value.toFixed(2)) });
  }
  return out;
}

function fitLast(series: Point[], last: number): Point[] {
  const scale = last / series[series.length - 1].value;
  return series.map((point) => ({ ...point, value: Number((point.value * scale).toFixed(2)) }));
}

export const mockIntraday: Record<string, Point[]> = Object.fromEntries(
  indexes.map((index) => {
    const quote = quoteBySymbol[index.symbol];
    const start = quote.previousClose * (1 + quote.changePct / 100 * 0.35);
    return [index.symbol, fitLast(makeSeries(index.symbol, 50, start, 5), quote.value)];
  }),
);

export const mockHistorical: Record<string, Point[]> = Object.fromEntries(
  indexes.map((index) => {
    const quote = quoteBySymbol[index.symbol];
    return [index.symbol, fitLast(makeHistoricalSeries(index.symbol, 252, quote.value * 0.93), quote.value)];
  }),
);
