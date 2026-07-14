export type StreakLeaderRow = { symbol: string; companyName: string; streakLength: number; direction: "up" | "down"; latestChangePct: number };

export type RankSwingRow = { symbol: string; companyName: string; earliestRank: number; latestRank: number; swing: number; earliestDate: string; latestDate: string };

export type GroupRotationPoint = { date: string; [groupId: string]: number | string };

export type GroupRotationLine = { id: string; name: string; color: string };

export type GroupRotationSeries = { data: GroupRotationPoint[]; lines: GroupRotationLine[] };

export type AnomalyType =
  | "new_top50"
  | "exit_top50"
  | "rank_up"
  | "rank_down"
  | "volume_up"
  | "volume_down"
  | "streak_up"
  | "streak_down"
  | "price_move";

export type AnomalyRow = {
  symbol: string;
  companyName: string;
  groupName?: string;
  type: AnomalyType;
  typeLabel: string;
  statusLabel: string;
  sentiment: "positive" | "negative";
  changePct?: number;
  dollarVolume?: number;
  heatRatio?: number;
  rankChange: number | null;
  currentRank?: number;
  previousRank?: number;
};

export type AnomalyOverviewMetric = { count: number; delta: number | null };

export type AnomalyOverview = {
  total: AnomalyOverviewMetric;
  newTop50: AnomalyOverviewMetric;
  exitTop50: AnomalyOverviewMetric;
  volumeUp: AnomalyOverviewMetric;
  volumeDown: AnomalyOverviewMetric;
  rankUp: AnomalyOverviewMetric;
  rankDown: AnomalyOverviewMetric;
};
