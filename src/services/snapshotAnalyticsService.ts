import { calculateDollarVolume, calculateRankingChange, calculateVolumeHeat } from "./calculations";
import type { StockQuoteMock, ThemeGroupSummary, WatchlistGroup } from "../types/themeGroup";
import type { DailySnapshotRow } from "../types/snapshotHistory";
import type { TopVolumeComparisonRow } from "../types/topVolume";
import type { AnomalyOverview, AnomalyOverviewMetric, AnomalyRow, AnomalyType, GroupRotationPoint, GroupRotationSeries, RankSwingRow, StreakLeaderRow } from "../types/anomaly";

const rankSwingThreshold = 5;
const priceMoveThreshold = 3;
const heatThreshold = 1.35;
const streakThreshold = 3;

const anomalyLabels: Record<AnomalyType, string> = {
  new_top50: "新进 Top 50",
  exit_top50: "退出 Top 50",
  rank_up: "排名上升",
  rank_down: "排名下降",
  volume_up: "放量上涨",
  volume_down: "放量下跌",
  streak_up: "连续上涨",
  streak_down: "连续下跌",
  price_move: "价格异动",
};

const positiveTypes = new Set<AnomalyType>(["new_top50", "rank_up", "volume_up", "streak_up"]);

const groupPalette: Record<string, string> = {
  "ai-semiconductors": "#2f83ff",
  "cloud-ai-software": "#18d49a",
  "internet-attention": "#ffd24a",
  "space-mobility": "#a670ff",
  "crypto-onchain": "#ff8a3d",
  "clean-energy-resources": "#4fd06f",
  "healthcare-pharma": "#ff5252",
  "consumer-defensive": "#5ec8ff",
};

export function buildSymbolGroupMap(groups: WatchlistGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups) {
    if (group.satelliteOnly) continue;
    for (const symbol of group.symbols) map.set(symbol, group.name);
  }
  return map;
}

type ClassificationInput = {
  isNew: boolean;
  isOut: boolean;
  rankChange: number | null;
  heatRatio?: number;
  changePct?: number;
  streakDirection?: "up" | "down";
  streakLength?: number;
};

function classify(input: ClassificationInput): AnomalyType | null {
  if (input.isNew) return "new_top50";
  if (input.isOut) return "exit_top50";
  if (input.rankChange !== null && input.rankChange >= rankSwingThreshold) return "rank_up";
  if (input.rankChange !== null && input.rankChange <= -rankSwingThreshold) return "rank_down";
  if (input.heatRatio !== undefined && input.heatRatio >= heatThreshold && (input.changePct ?? 0) >= 0) return "volume_up";
  if (input.heatRatio !== undefined && input.heatRatio >= heatThreshold && (input.changePct ?? 0) < 0) return "volume_down";
  if (input.streakDirection === "up" && (input.streakLength ?? 0) >= streakThreshold) return "streak_up";
  if (input.streakDirection === "down" && (input.streakLength ?? 0) >= streakThreshold) return "streak_down";
  if (input.changePct !== undefined && Math.abs(input.changePct) >= priceMoveThreshold) return "price_move";
  return null;
}

export function classifyAnomalies(stocks: StockQuoteMock[], top50Rows: TopVolumeComparisonRow[], groups: WatchlistGroup[]): AnomalyRow[] {
  const groupNameBySymbol = buildSymbolGroupMap(groups);
  const rowsBySymbol = new Map(top50Rows.map((row) => [row.symbol, row]));
  const rows: AnomalyRow[] = [];

  for (const stock of stocks) {
    const row = rowsBySymbol.get(stock.symbol);
    if (!row) continue;
    const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
    const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
    const heat = calculateVolumeHeat(dollarVolume, previousDollarVolume);
    const type = classify({
      isNew: row.status === "NEW",
      isOut: row.status === "OUT",
      rankChange: row.rankChange,
      heatRatio: heat.ratio,
      changePct: stock.changePct,
    });
    if (!type) continue;
    rows.push({
      symbol: stock.symbol,
      companyName: stock.companyName,
      groupName: groupNameBySymbol.get(stock.symbol),
      type,
      typeLabel: anomalyLabels[type],
      statusLabel: anomalyLabels[type],
      sentiment: positiveTypes.has(type) ? "positive" : "negative",
      changePct: stock.changePct,
      dollarVolume,
      heatRatio: heat.ratio,
      rankChange: row.rankChange,
      currentRank: row.currentRank,
      previousRank: row.previousRank,
    });
  }

  return rows.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
}

function classifyHistoryDate(history: DailySnapshotRow[], date: string, previousDate: string): AnomalyType[] {
  const rowsForDate = history.filter((row) => row.date === date);
  const previousBySymbol = new Map(history.filter((row) => row.date === previousDate).map((row) => [row.symbol, row]));
  const types: AnomalyType[] = [];
  for (const row of rowsForDate) {
    const previous = previousBySymbol.get(row.symbol);
    const rankChange = calculateRankingChange(previous?.top50Rank, row.top50Rank);
    const heat = previous?.dollarVolume ? calculateVolumeHeat(row.dollarVolume ?? 0, previous.dollarVolume) : undefined;
    const type = classify({
      isNew: !previous?.top50Rank && !!row.top50Rank,
      isOut: !!previous?.top50Rank && !row.top50Rank,
      rankChange,
      heatRatio: heat?.ratio,
      changePct: row.changePct,
    });
    if (type) types.push(type);
  }
  return types;
}

function countByTypes(types: AnomalyType[]) {
  const count = (matches: AnomalyType[]) => types.filter((type) => matches.includes(type)).length;
  return {
    total: types.length,
    newTop50: count(["new_top50"]),
    exitTop50: count(["exit_top50"]),
    volumeUp: count(["volume_up"]),
    volumeDown: count(["volume_down"]),
    rankUp: count(["rank_up"]),
    rankDown: count(["rank_down"]),
  };
}

export function buildAnomalyOverview(todayRows: AnomalyRow[], history: DailySnapshotRow[]): AnomalyOverview {
  const today = countByTypes(todayRows.map((row) => row.type));
  const dates = [...new Set(history.map((row) => row.date))].sort();
  const hasYesterday = dates.length >= 2;
  const yesterday = hasYesterday ? countByTypes(classifyHistoryDate(history, dates[dates.length - 1], dates[dates.length - 2])) : undefined;

  const metric = (key: keyof ReturnType<typeof countByTypes>): AnomalyOverviewMetric => ({
    count: today[key],
    delta: yesterday ? today[key] - yesterday[key] : null,
  });

  return {
    total: metric("total"),
    newTop50: metric("newTop50"),
    exitTop50: metric("exitTop50"),
    volumeUp: metric("volumeUp"),
    volumeDown: metric("volumeDown"),
    rankUp: metric("rankUp"),
    rankDown: metric("rankDown"),
  };
}

function groupBySymbol(history: DailySnapshotRow[]): Map<string, DailySnapshotRow[]> {
  const bySymbol = new Map<string, DailySnapshotRow[]>();
  for (const row of history) {
    const rows = bySymbol.get(row.symbol) ?? [];
    rows.push(row);
    bySymbol.set(row.symbol, rows);
  }
  for (const rows of bySymbol.values()) rows.sort((a, b) => a.date.localeCompare(b.date));
  return bySymbol;
}

export function calculateStreakLeaders(history: DailySnapshotRow[], limit = 5): StreakLeaderRow[] {
  const bySymbol = groupBySymbol(history);
  const rows: StreakLeaderRow[] = [];
  for (const [symbol, series] of bySymbol) {
    const withChange = series.filter((row) => typeof row.changePct === "number");
    if (!withChange.length) continue;
    const latest = withChange[withChange.length - 1];
    const direction: "up" | "down" = (latest.changePct ?? 0) >= 0 ? "up" : "down";
    let streakLength = 0;
    for (let i = withChange.length - 1; i >= 0; i -= 1) {
      const isUp = (withChange[i].changePct ?? 0) >= 0;
      if ((direction === "up") !== isUp) break;
      streakLength += 1;
    }
    rows.push({
      symbol,
      companyName: latest.companyName ?? symbol,
      streakLength,
      direction,
      latestChangePct: latest.changePct ?? 0,
    });
  }
  return rows.sort((a, b) => b.streakLength - a.streakLength).slice(0, limit);
}

export function calculateRankSwings(history: DailySnapshotRow[], limit = 5): RankSwingRow[] {
  const bySymbol = groupBySymbol(history);
  const rows: RankSwingRow[] = [];
  for (const [symbol, series] of bySymbol) {
    const withRank = series.filter((row) => typeof row.top50Rank === "number");
    if (withRank.length < 2) continue;
    const earliest = withRank[0];
    const latest = withRank[withRank.length - 1];
    const earliestRank = earliest.top50Rank as number;
    const latestRank = latest.top50Rank as number;
    rows.push({
      symbol,
      companyName: latest.companyName ?? symbol,
      earliestRank,
      latestRank,
      swing: earliestRank - latestRank,
      earliestDate: earliest.date,
      latestDate: latest.date,
    });
  }
  return rows.sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing)).slice(0, limit);
}

export function buildGroupRotationSeries(history: DailySnapshotRow[], groups: WatchlistGroup[]): GroupRotationSeries {
  const realGroups = groups.filter((group) => !group.satelliteOnly);
  const realGroupIds = new Set<string>(realGroups.map((group) => group.id));

  const volumeByDateAndGroup = new Map<string, Map<string, number>>();
  for (const row of history) {
    if (!row.groupId || !realGroupIds.has(row.groupId)) continue;
    const byGroup = volumeByDateAndGroup.get(row.date) ?? new Map<string, number>();
    byGroup.set(row.groupId, (byGroup.get(row.groupId) ?? 0) + (row.dollarVolume ?? 0));
    volumeByDateAndGroup.set(row.date, byGroup);
  }

  const dates = [...volumeByDateAndGroup.keys()].sort();
  const data = dates.map((date) => {
    const byGroup = volumeByDateAndGroup.get(date)!;
    const ranked = [...byGroup.entries()].sort((a, b) => b[1] - a[1]);
    const point: GroupRotationPoint = { date };
    ranked.forEach(([groupId], index) => {
      point[groupId] = index + 1;
    });
    return point;
  });

  const lines = realGroups
    .filter((group) => data.some((point) => typeof point[group.id] === "number"))
    .map((group) => ({ id: group.id, name: group.name, color: groupPalette[group.id] ?? "#8ea0b4" }));

  return { data, lines };
}

export function getDistinctDateCount(history: DailySnapshotRow[]): number {
  return new Set(history.map((row) => row.date)).size;
}

export function buildReasonCard(row: AnomalyRow, groupSummaries: ThemeGroupSummary[], allRows: AnomalyRow[]): string[] {
  const reasons: string[] = [];
  const groupSummary = groupSummaries.find((summary) => summary.group.name === row.groupName);

  if (row.type === "volume_up" || row.type === "volume_down") {
    reasons.push(`成交热度达到昨日同期 ${(row.heatRatio ?? 0).toFixed(2)}x`);
  }
  if (row.type === "rank_up" || row.type === "rank_down") {
    reasons.push(`Top 50 排名 #${row.previousRank ?? "—"} → #${row.currentRank ?? "—"}`);
  }
  if (row.type === "new_top50") {
    reasons.push(`今日新进 Top 50，当前排名 #${row.currentRank ?? "—"}`);
  }
  if (row.type === "exit_top50") {
    reasons.push(`已跌出 Top 50（此前排名 #${row.previousRank ?? "—"}）`);
  }
  if (row.type === "streak_up" || row.type === "streak_down") {
    reasons.push(`已连续${row.type === "streak_up" ? "上涨" : "下跌"}，非单日波动`);
  }
  if (row.type === "price_move") {
    reasons.push(`今日涨跌幅 ${formatPct(row.changePct ?? 0)}，超出常规波动范围`);
  }

  if (groupSummary) {
    if (groupSummary.leader.symbol === row.symbol) {
      reasons.push(`${groupSummary.group.name}今日领涨股`);
    }
    const groupRankByVolume = [...groupSummaries].sort((a, b) => b.dollarVolume - a.dollarVolume).findIndex((summary) => summary.group.id === groupSummary.group.id) + 1;
    if (groupRankByVolume === 1) {
      reasons.push(`${groupSummary.group.name}成交金额今日排名 #1`);
    }
    const groupMates = allRows.filter((other) => other.symbol !== row.symbol && other.groupName === row.groupName && other.sentiment === row.sentiment);
    if (groupMates.length) {
      reasons.push(`同组 ${groupMates.slice(0, 3).map((mate) => mate.symbol).join("、")} 同步${row.sentiment === "positive" ? "上涨" : "下跌"}`);
    }
  }

  return reasons;
}

function formatPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
