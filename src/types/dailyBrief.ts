export type DailyBriefTopGroup = { name: string; dollarVolume: number; top50Count: number; groupSize: number };

export type DailyBriefWeakGroup = { name: string; dollarVolume: number };

export type DailyBriefMover = { symbol: string; companyName: string; typeLabel: string; changePct?: number; heatRatio?: number; currentRank?: number };

export type DailyBriefRotationMove = { groupName: string; fromRank: number; toRank: number };

export type DailyBriefStockRankMove = { symbol: string; companyName: string; fromRank: number; toRank: number };

export type DailyBriefNewTop50Entry = { symbol: string; companyName: string; rank: number; dollarVolume: number };

export type DailyBriefSatellite = { symbol: string; changePct: number };

export type DailyBrief = {
  topGroup?: DailyBriefTopGroup;
  weakGroup?: DailyBriefWeakGroup;
  topMovers: DailyBriefMover[];
  newTop50Highlight?: DailyBriefNewTop50Entry;
  newTop50Symbols: string[];
  outTop50Symbols: string[];
  biggestRankUpStock?: DailyBriefStockRankMove;
  biggestRankDownStock?: DailyBriefStockRankMove;
  rotationUp?: DailyBriefRotationMove;
  rotationDown?: DailyBriefRotationMove;
  satellites: DailyBriefSatellite[];
  satelliteNote: string;
  watchSymbols: string[];
};
