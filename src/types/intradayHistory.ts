export type IntradaySnapshotRow = {
  capturedAt: string;
  tradeDate: string;
  symbol: string;
  companyName?: string;
  price?: number;
  dollarVolume?: number;
  changePct?: number;
  top50Rank?: number;
  groupId?: string;
  source: string;
};

export type ReplayEvent = {
  capturedAt: string;
  label: string;
  detail: string;
};
