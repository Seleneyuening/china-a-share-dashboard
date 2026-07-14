export type DailyJournalRankMove = { symbol: string; companyName: string; from: number; to: number };

export type DailyJournalEntry = {
  date: string;
  topGroupName?: string;
  topGroupDollarVolume?: number;
  weakGroupName?: string;
  newTop50: string[];
  outTop50: string[];
  biggestRankUp?: DailyJournalRankMove;
  biggestRankDown?: DailyJournalRankMove;
  strongestMoverSymbol?: string;
  strongestMoverChangePct?: number;
  triggeredAlertCount: number;
  note: string;
  summaryLines: string[];
  createdAt: string;
};

export type WatchObservationStatus = "active" | "ended";

export type WatchObservation = {
  id: string;
  symbol: string;
  companyName: string;
  startDate: string;
  startRank?: number;
  startChangePct: number;
  startDollarVolume?: number;
  groupName?: string;
  note: string;
  status: WatchObservationStatus;
  endedAt?: string;
};

export type WatchFollowUp = {
  currentRank?: number;
  currentChangePct: number;
  dollarVolumeRatio?: number;
  conclusion: string;
  tone: "positive" | "negative" | "neutral";
};

export type ThemePersistenceScore = {
  groupId: string;
  groupName: string;
  currentRank?: number;
  rankSeries: (number | null)[];
  dollarVolumeSeries: number[];
  top50CountSeries: number[];
  score: number;
};
