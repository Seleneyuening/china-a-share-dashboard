import { calculateDollarVolume } from "./calculations";
import type { DailyBrief } from "../types/dailyBrief";
import type { DailySnapshotRow } from "../types/snapshotHistory";
import type { StockQuoteMock, ThemeGroupSummary, WatchlistGroup } from "../types/themeGroup";
import type { TopVolumeComparisonRow } from "../types/topVolume";
import type { DailyJournalEntry, ThemePersistenceScore, WatchFollowUp, WatchObservation } from "../types/marketJournal";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function buildDailyJournalEntry(date: string, brief: DailyBrief, triggeredAlertCount: number, existingNote = ""): DailyJournalEntry {
  const summaryLines: string[] = [];
  if (brief.topGroup) summaryLines.push(`最强主题：${brief.topGroup.name}（成交金额 ${formatCompactMoney(brief.topGroup.dollarVolume)}，Top 50 入选 ${brief.topGroup.top50Count}/${brief.topGroup.groupSize}）`);
  if (brief.weakGroup) summaryLines.push(`最弱主题：${brief.weakGroup.name}（成交金额 ${formatCompactMoney(brief.weakGroup.dollarVolume)}）`);
  if (brief.newTop50Highlight) summaryLines.push(`新进 Top 50：${brief.newTop50Highlight.symbol}（排名 #${brief.newTop50Highlight.rank}）`);
  if (brief.biggestRankUpStock) summaryLines.push(`排名上升最多：${brief.biggestRankUpStock.symbol} #${brief.biggestRankUpStock.fromRank} → #${brief.biggestRankUpStock.toRank}`);
  if (brief.biggestRankDownStock) summaryLines.push(`排名下降最多：${brief.biggestRankDownStock.symbol} #${brief.biggestRankDownStock.fromRank} → #${brief.biggestRankDownStock.toRank}`);
  summaryLines.push(brief.satelliteNote);

  return {
    date,
    topGroupName: brief.topGroup?.name,
    topGroupDollarVolume: brief.topGroup?.dollarVolume,
    weakGroupName: brief.weakGroup?.name,
    newTop50: brief.newTop50Symbols,
    outTop50: brief.outTop50Symbols,
    biggestRankUp: brief.biggestRankUpStock ? { symbol: brief.biggestRankUpStock.symbol, companyName: brief.biggestRankUpStock.companyName, from: brief.biggestRankUpStock.fromRank, to: brief.biggestRankUpStock.toRank } : undefined,
    biggestRankDown: brief.biggestRankDownStock ? { symbol: brief.biggestRankDownStock.symbol, companyName: brief.biggestRankDownStock.companyName, from: brief.biggestRankDownStock.fromRank, to: brief.biggestRankDownStock.toRank } : undefined,
    strongestMoverSymbol: brief.topMovers[0]?.symbol,
    strongestMoverChangePct: brief.topMovers[0]?.changePct,
    triggeredAlertCount,
    note: existingNote,
    summaryLines,
    createdAt: new Date().toISOString(),
  };
}

function computePersistenceScore(rankSeries: (number | null)[], groupCount: number): number {
  const known = rankSeries.filter((rank): rank is number => rank !== null);
  if (!known.length) return 0;
  const avgRank = known.reduce((sum, rank) => sum + rank, 0) / known.length;
  const rankScore = clamp(100 - ((avgRank - 1) / Math.max(groupCount - 1, 1)) * 100, 0, 100);
  const variance = known.reduce((sum, rank) => sum + (rank - avgRank) ** 2, 0) / known.length;
  const stabilityScore = clamp(100 - Math.sqrt(variance) * 25, 0, 100);
  const trendDelta = known[0] - known[known.length - 1];
  const trendScore = clamp(50 + trendDelta * 8, 0, 100);
  return Math.round(rankScore * 0.4 + stabilityScore * 0.3 + trendScore * 0.3);
}

export function buildThemePersistenceScores(history: DailySnapshotRow[], groups: WatchlistGroup[], windowDays: number): ThemePersistenceScore[] {
  const realGroups = groups.filter((group) => !group.satelliteOnly);
  const realGroupIds = new Set<string>(realGroups.map((group) => group.id));
  const dates = [...new Set(history.map((row) => row.date))].sort();
  const windowDates = dates.slice(-windowDays);
  const windowSet = new Set(windowDates);

  const volumeByDateGroup = new Map<string, Map<string, number>>();
  const top50CountByDateGroup = new Map<string, Map<string, number>>();

  for (const row of history) {
    if (!row.groupId || !windowSet.has(row.date) || !realGroupIds.has(row.groupId)) continue;
    const volMap = volumeByDateGroup.get(row.date) ?? new Map<string, number>();
    volMap.set(row.groupId, (volMap.get(row.groupId) ?? 0) + (row.dollarVolume ?? 0));
    volumeByDateGroup.set(row.date, volMap);

    if (typeof row.top50Rank === "number") {
      const countMap = top50CountByDateGroup.get(row.date) ?? new Map<string, number>();
      countMap.set(row.groupId, (countMap.get(row.groupId) ?? 0) + 1);
      top50CountByDateGroup.set(row.date, countMap);
    }
  }

  const rankByDateGroup = new Map<string, Map<string, number>>();
  for (const date of windowDates) {
    const volMap = volumeByDateGroup.get(date);
    if (!volMap) continue;
    const ranked = [...volMap.entries()].sort((a, b) => b[1] - a[1]);
    const rankMap = new Map<string, number>();
    ranked.forEach(([groupId], index) => rankMap.set(groupId, index + 1));
    rankByDateGroup.set(date, rankMap);
  }

  return realGroups
    .map((group) => {
      const rankSeries = windowDates.map((date) => rankByDateGroup.get(date)?.get(group.id) ?? null);
      const dollarVolumeSeries = windowDates.map((date) => volumeByDateGroup.get(date)?.get(group.id) ?? 0);
      const top50CountSeries = windowDates.map((date) => top50CountByDateGroup.get(date)?.get(group.id) ?? 0);
      const knownRanks = rankSeries.filter((rank): rank is number => rank !== null);
      return {
        groupId: group.id,
        groupName: group.name,
        currentRank: knownRanks[knownRanks.length - 1],
        rankSeries,
        dollarVolumeSeries,
        top50CountSeries,
        score: computePersistenceScore(rankSeries, realGroups.length),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildWatchFollowUp(observation: WatchObservation, stocks: StockQuoteMock[], top50Rows: TopVolumeComparisonRow[]): WatchFollowUp {
  const stock = stocks.find((item) => item.symbol === observation.symbol);
  const row = top50Rows.find((item) => item.symbol === observation.symbol);
  const currentChangePct = stock?.changePct ?? 0;
  const currentRank = row?.currentRank;
  const currentDollarVolume = stock ? (stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume)) : undefined;
  const dollarVolumeRatio = observation.startDollarVolume && currentDollarVolume
    ? Number((currentDollarVolume / observation.startDollarVolume).toFixed(2))
    : undefined;

  const hasRankMove = observation.startRank !== undefined && currentRank !== undefined;
  const rankImproved = hasRankMove ? currentRank! < observation.startRank! : undefined;
  const rankWorsened = hasRankMove ? currentRank! > observation.startRank! : undefined;
  const heatUp = dollarVolumeRatio !== undefined && dollarVolumeRatio >= 1.1;
  const heatDown = dollarVolumeRatio !== undefined && dollarVolumeRatio <= 0.85;

  let conclusion: string;
  let tone: WatchFollowUp["tone"];
  if (rankImproved && heatUp) {
    conclusion = "热度延续，排名与成交同步走强";
    tone = "positive";
  } else if (rankImproved) {
    conclusion = "排名继续上升";
    tone = "positive";
  } else if (heatUp) {
    conclusion = "成交热度延续";
    tone = "positive";
  } else if (heatDown && rankWorsened) {
    conclusion = "热度减弱，排名回落";
    tone = "negative";
  } else if (heatDown) {
    conclusion = "成交热度减弱";
    tone = "negative";
  } else if (rankWorsened) {
    conclusion = "排名有所回落";
    tone = "negative";
  } else {
    conclusion = "走势与关注时基本持平";
    tone = "neutral";
  }

  return { currentRank, currentChangePct, dollarVolumeRatio, conclusion, tone };
}

type JournalQaContext = {
  entries: DailyJournalEntry[];
  groupScores: ThemePersistenceScore[];
  groupSummaries: ThemeGroupSummary[];
};

const groupKeywordAliases: Record<string, string[]> = {
  "ai-semiconductors": ["AI", "半导体", "芯片"],
  "cloud-ai-software": ["云计算", "云软件", "企业科技"],
  "internet-attention": ["互联网", "广告", "注意力经济"],
  "space-mobility": ["太空", "卫星", "自动驾驶"],
  "crypto-onchain": ["加密", "链上", "比特币"],
  "clean-energy-resources": ["清洁能源", "电力", "关键资源"],
  "healthcare-pharma": ["医疗", "制药"],
  "consumer-defensive": ["消费防御"],
};

function matchGroupByKeyword(question: string, groupSummaries: ThemeGroupSummary[]): ThemeGroupSummary | undefined {
  return groupSummaries.find((summary) => (groupKeywordAliases[summary.group.id] ?? []).some((keyword) => question.includes(keyword)));
}

export function answerJournalQuestion(question: string, ctx: JournalQaContext): string {
  const q = question.trim();
  const daysMatch = q.match(/(\d+)\s*天/);
  const days = daysMatch ? Number(daysMatch[1]) : 5;

  if (q.includes("主题") && (q.includes("最强") || q.includes("最好"))) {
    const top = ctx.groupScores[0];
    if (!top) return "暂无足够的主题持续性数据，可以再等待几个交易日累积市场日志。";
    const volume = ctx.entries.slice(-days).reduce((sum, entry) => sum + (entry.topGroupName === top.groupName ? (entry.topGroupDollarVolume ?? 0) : 0), 0);
    return `过去 ${days} 天，${top.groupName} 表现最强，持续性评分 ${top.score}/100${volume ? `，期间累计成交金额约 ${formatCompactMoney(volume)}` : ""}。`;
  }

  const symbolMatch = q.match(/[A-Z]{2,5}/);
  if (symbolMatch) {
    const symbol = symbolMatch[0];
    if (q.includes("Top 50") || q.includes("Top50") || q.includes("榜")) {
      const latest = ctx.entries[ctx.entries.length - 1];
      if (latest?.newTop50.includes(symbol)) return `${symbol} 今天是新进 Top 50。`;
      const recentlyNew = ctx.entries.slice(-days).some((entry) => entry.newTop50.includes(symbol));
      if (recentlyNew) return `${symbol} 在过去 ${days} 天内曾新进 Top 50，并非一直在榜。`;
      if (ctx.entries.length) return `${symbol} 在已保存的市场日志中未记录为新进，大概率已在 Top 50 持续一段时间。`;
      return `暂无 ${symbol} 的历史市场日志记录。`;
    }
    const summary = ctx.groupSummaries.find((item) => item.stocks.some((stock) => stock.symbol === symbol));
    if (summary) return `${symbol} 属于「${summary.group.name}」，该组今日资金集中度约 ${summary.concentration}%，龙头股为 ${summary.leader.symbol}（${formatSignedPct(summary.leader.changePct)}）。`;
  }

  if (q.includes("集中度")) {
    const named = matchGroupByKeyword(q, ctx.groupSummaries);
    if (named) return `${named.group.name} 当前资金集中度约 ${named.concentration}%，由 ${named.leader.symbol} 主导${named.concentration >= 60 ? "，集中度偏高" : "，集中度尚属正常"}。`;
    const top = [...ctx.groupSummaries].sort((a, b) => b.concentration - a.concentration)[0];
    if (top) return `${top.group.name} 当前资金集中度最高，约 ${top.concentration}%，由 ${top.leader.symbol} 主导。`;
  }

  return "这个问题暂时无法从已保存的市场日志数据中直接回答，可以换个问法，或等数据积累更多天再试。";
}
