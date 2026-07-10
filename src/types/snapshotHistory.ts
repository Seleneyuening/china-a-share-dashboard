export type DailySnapshotRow = {
  date: string;
  symbol: string;
  companyName?: string;
  price?: number;
  dollarVolume?: number;
  changePct?: number;
  top50Rank?: number;
  groupId?: string;
  source: string;
};
