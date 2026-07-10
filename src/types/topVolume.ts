export type TopVolumeStatus = "NEW" | "OUT" | "UNCHANGED" | "UP" | "DOWN";

export type TopVolumeEntry = {
  symbol: string;
  companyName: string;
  rank: number;
  price: number;
  dollarVolume: number;
  changePct: number;
};

export type TopVolumeComparisonRow = {
  symbol: string;
  companyName: string;
  currentRank?: number;
  previousRank?: number;
  currentDollarVolume?: number;
  previousDollarVolume?: number;
  currentChangePct?: number;
  previousChangePct?: number;
  rankChange: number | null;
  status: TopVolumeStatus;
};

export type Top50ChangeSummary = {
  newCount: number;
  outCount: number;
  upCount: number;
  downCount: number;
  averageRankChange: number;
  retentionRate: number;
  biggestUp: TopVolumeComparisonRow[];
  biggestDown: TopVolumeComparisonRow[];
  newRows: TopVolumeComparisonRow[];
  outRows: TopVolumeComparisonRow[];
};
