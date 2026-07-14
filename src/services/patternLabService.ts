import type { DailySnapshotRow } from "../types/snapshotHistory";
import type { WatchlistGroup } from "../types/themeGroup";
import type { PatternCondition, PatternForwardWindowStats, PatternMatchResult, PatternOperator } from "../types/patternLab";

type GroupDayAggregate = {
  rank?: number;
  dollarVolume: number;
  previousDollarVolume?: number;
  top50Count: number;
  concentration: number;
};

type StockDayAggregate = {
  changePct?: number;
  top50Rank?: number;
  price?: number;
  isNewTop50: boolean;
  rankMove?: number;
};

export type DayAggregate = {
  date: string;
  groups: Map<string, GroupDayAggregate>;
  stocks: Map<string, StockDayAggregate>;
};

function compare(actual: number, operator: PatternOperator, value: number): boolean {
  switch (operator) {
    case "lte": return actual <= value;
    case "gte": return actual >= value;
    case "lt": return actual < value;
    case "gt": return actual > value;
    case "eq": return actual === value;
  }
}

export function buildDailyAggregates(history: DailySnapshotRow[], groups: WatchlistGroup[]): Map<string, DayAggregate> {
  const realGroupIds = new Set<string>(groups.filter((group) => !group.satelliteOnly).map((group) => group.id));

  const byDate = new Map<string, DailySnapshotRow[]>();
  for (const row of history) {
    const rows = byDate.get(row.date) ?? [];
    rows.push(row);
    byDate.set(row.date, rows);
  }

  const dates = [...byDate.keys()].sort();
  const result = new Map<string, DayAggregate>();
  let previousGroupVolumes: Map<string, number> | undefined;
  let previousStockRanks = new Map<string, number>();

  for (const date of dates) {
    const rows = byDate.get(date)!;
    const groupVolumes = new Map<string, number>();
    const groupTop50Counts = new Map<string, number>();
    const groupStockVolumes = new Map<string, Array<{ symbol: string; dollarVolume: number }>>();
    const stocks = new Map<string, StockDayAggregate>();

    for (const row of rows) {
      if (row.groupId && realGroupIds.has(row.groupId)) {
        const dollarVolume = row.dollarVolume ?? 0;
        groupVolumes.set(row.groupId, (groupVolumes.get(row.groupId) ?? 0) + dollarVolume);
        if (typeof row.top50Rank === "number") groupTop50Counts.set(row.groupId, (groupTop50Counts.get(row.groupId) ?? 0) + 1);
        const list = groupStockVolumes.get(row.groupId) ?? [];
        list.push({ symbol: row.symbol, dollarVolume });
        groupStockVolumes.set(row.groupId, list);
      }
      const previousRank = previousStockRanks.get(row.symbol);
      stocks.set(row.symbol, {
        changePct: row.changePct,
        top50Rank: row.top50Rank,
        price: row.price,
        isNewTop50: typeof row.top50Rank === "number" && previousRank === undefined,
        rankMove: typeof previousRank === "number" && typeof row.top50Rank === "number" ? previousRank - row.top50Rank : undefined,
      });
    }

    const ranked = [...groupVolumes.entries()].sort((a, b) => b[1] - a[1]);
    const rankByGroup = new Map(ranked.map(([groupId], index) => [groupId, index + 1]));

    const groupAggregates = new Map<string, GroupDayAggregate>();
    for (const groupId of realGroupIds) {
      const dollarVolume = groupVolumes.get(groupId) ?? 0;
      const topStock = [...(groupStockVolumes.get(groupId) ?? [])].sort((a, b) => b.dollarVolume - a.dollarVolume)[0];
      const concentration = topStock && dollarVolume > 0 ? Number(((topStock.dollarVolume / dollarVolume) * 100).toFixed(1)) : 0;
      groupAggregates.set(groupId, {
        rank: rankByGroup.get(groupId),
        dollarVolume,
        previousDollarVolume: previousGroupVolumes?.get(groupId),
        top50Count: groupTop50Counts.get(groupId) ?? 0,
        concentration,
      });
    }

    result.set(date, { date, groups: groupAggregates, stocks });
    previousGroupVolumes = groupVolumes;
    const nextPreviousRanks = new Map<string, number>();
    for (const [symbol, aggregate] of stocks) {
      if (typeof aggregate.top50Rank === "number") nextPreviousRanks.set(symbol, aggregate.top50Rank);
    }
    previousStockRanks = nextPreviousRanks;
  }

  return result;
}

function evaluateCondition(condition: PatternCondition, date: string, dates: string[], aggregates: Map<string, DayAggregate>): boolean {
  const aggregate = aggregates.get(date);
  if (!aggregate) return false;

  switch (condition.kind) {
    case "group_rank": {
      const group = aggregate.groups.get(condition.groupId);
      return typeof group?.rank === "number" && compare(group.rank, condition.operator, condition.value);
    }
    case "group_rank_streak": {
      const dateIndex = dates.indexOf(date);
      let streak = 0;
      for (let i = dateIndex; i >= 0; i -= 1) {
        const group = aggregates.get(dates[i])?.groups.get(condition.groupId);
        if (!group?.rank || group.rank > condition.rank) break;
        streak += 1;
      }
      return streak >= condition.minDays;
    }
    case "group_top50_count": {
      const group = aggregate.groups.get(condition.groupId);
      return Boolean(group) && compare(group!.top50Count, condition.operator, condition.value);
    }
    case "group_concentration": {
      const group = aggregate.groups.get(condition.groupId);
      return Boolean(group) && compare(group!.concentration, condition.operator, condition.value);
    }
    case "stock_change_pct": {
      const stock = aggregate.stocks.get(condition.symbol);
      return typeof stock?.changePct === "number" && compare(stock.changePct, condition.operator, condition.value);
    }
    case "stock_top50_rank": {
      const stock = aggregate.stocks.get(condition.symbol);
      if (!stock) return false;
      if (condition.operator === "new") return stock.isNewTop50;
      return typeof stock.top50Rank === "number" && compare(stock.top50Rank, condition.operator, condition.value);
    }
    case "stock_rank_move": {
      const stock = aggregate.stocks.get(condition.symbol);
      return typeof stock?.rankMove === "number" && compare(stock.rankMove, condition.operator, condition.value);
    }
    case "satellite_change_pct": {
      const stock = aggregate.stocks.get(condition.symbol);
      return typeof stock?.changePct === "number" && compare(stock.changePct, condition.operator, condition.value);
    }
  }
}

function matchesAllConditions(conditions: PatternCondition[], date: string, dates: string[], aggregates: Map<string, DayAggregate>): boolean {
  return conditions.every((condition) => evaluateCondition(condition, date, dates, aggregates));
}

export function findMatchingDates(conditions: PatternCondition[], dates: string[], aggregates: Map<string, DayAggregate>): string[] {
  if (!conditions.length) return [];
  return dates.filter((date) => matchesAllConditions(conditions, date, dates, aggregates));
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Number((sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

function priceAt(aggregates: Map<string, DayAggregate>, dates: string[], index: number, symbol: string): number | undefined {
  return aggregates.get(dates[index])?.stocks.get(symbol)?.price;
}

function forwardReturnPct(aggregates: Map<string, DayAggregate>, dates: string[], startIndex: number, endIndex: number, symbol: string): number | undefined {
  const startPrice = priceAt(aggregates, dates, startIndex, symbol);
  const endPrice = priceAt(aggregates, dates, endIndex, symbol);
  if (!startPrice || !endPrice) return undefined;
  return Number((((endPrice - startPrice) / startPrice) * 100).toFixed(2));
}

function maxDrawdownPct(aggregates: Map<string, DayAggregate>, dates: string[], startIndex: number, endIndex: number, symbol: string): number | undefined {
  const prices: number[] = [];
  for (let i = startIndex; i <= endIndex; i += 1) {
    const price = priceAt(aggregates, dates, i, symbol);
    if (typeof price === "number") prices.push(price);
  }
  if (prices.length < 2) return undefined;
  let peak = prices[0];
  let maxDrawdown = 0;
  for (const price of prices) {
    peak = Math.max(peak, price);
    maxDrawdown = Math.min(maxDrawdown, ((price - peak) / peak) * 100);
  }
  return Number(maxDrawdown.toFixed(2));
}

export function buildForwardStats(matchedDates: string[], dates: string[], aggregates: Map<string, DayAggregate>, focusSymbol: string, windows: number[]): PatternForwardWindowStats[] {
  return windows.map((window) => {
    const focusReturns: number[] = [];
    const benchmarkReturns: number[] = [];
    const drawdowns: number[] = [];

    for (const date of matchedDates) {
      const startIndex = dates.indexOf(date);
      const endIndex = startIndex + window;
      if (startIndex < 0 || endIndex >= dates.length) continue;
      const focusReturn = forwardReturnPct(aggregates, dates, startIndex, endIndex, focusSymbol);
      if (focusReturn !== undefined) focusReturns.push(focusReturn);
      const benchmarkReturn = forwardReturnPct(aggregates, dates, startIndex, endIndex, "QQQ");
      if (benchmarkReturn !== undefined) benchmarkReturns.push(benchmarkReturn);
      const drawdown = maxDrawdownPct(aggregates, dates, startIndex, endIndex, focusSymbol);
      if (drawdown !== undefined) drawdowns.push(drawdown);
    }

    return {
      window,
      sampleSize: focusReturns.length,
      medianFocusReturnPct: median(focusReturns),
      medianBenchmarkReturnPct: median(benchmarkReturns),
      bestCasePct: focusReturns.length ? Math.max(...focusReturns) : undefined,
      worstCasePct: focusReturns.length ? Math.min(...focusReturns) : undefined,
      maxDrawdownPct: drawdowns.length ? Math.min(...drawdowns) : undefined,
    };
  });
}

export function matchPattern(conditions: PatternCondition[], focusSymbol: string, windows: number[], history: DailySnapshotRow[], groups: WatchlistGroup[]): PatternMatchResult {
  const aggregates = buildDailyAggregates(history, groups);
  const dates = [...aggregates.keys()].sort();
  const matchedDates = findMatchingDates(conditions, dates, aggregates);
  const forwardStats = buildForwardStats(matchedDates, dates, aggregates, focusSymbol, windows);
  return { matchedDates, forwardStats };
}

export function isPatternTriggeredToday(conditions: PatternCondition[], history: DailySnapshotRow[], groups: WatchlistGroup[]): { triggered: boolean; latestDate?: string } {
  const aggregates = buildDailyAggregates(history, groups);
  const dates = [...aggregates.keys()].sort();
  const latestDate = dates[dates.length - 1];
  if (!latestDate) return { triggered: false };
  return { triggered: matchesAllConditions(conditions, latestDate, dates, aggregates), latestDate };
}
