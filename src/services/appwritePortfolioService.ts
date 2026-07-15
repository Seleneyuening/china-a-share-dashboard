import { Client, Query, TablesDB, type Models } from "appwrite";

export type PortfolioStatus = "awaiting_market_credentials" | "active" | "paused" | "error";

export type LivePosition = {
  symbol: string;
  companyName: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  openedAt: string;
  reason: string;
};

export type LiveTrade = {
  id: string;
  side: "买入" | "卖出";
  symbol: string;
  companyName: string;
  quantity: number;
  price: number;
  fee: number;
  occurredAt: string;
  realizedPnl?: number;
  reason: string;
};

export type PortfolioSnapshot = {
  occurredAt: string;
  equity: number;
  cash: number;
  cumulativeReturn: number;
  drawdown: number;
};

export type AppwritePortfolioState = {
  status: PortfolioStatus;
  mode: "real_quotes_paper_funds";
  initialCapital: number;
  cash: number;
  equity: number;
  positions: LivePosition[];
  trades: LiveTrade[];
  snapshots: PortfolioSnapshot[];
  strategyVersion: number;
  message: string;
  updatedAt: string;
  lastMarketAt?: string;
};

type PortfolioRow = Models.Row & {
  record_type: string;
  occurred_at: string;
  payload: string;
};

// These values only identify the public Appwrite project and are not secrets.
const endpoint = "https://sgp.cloud.appwrite.io/v1";
const projectId = "6a570c13002358f469e1";
const databaseId = "a_share_trading";
const tableId = "portfolio_records";

const client = new Client().setEndpoint(endpoint).setProject(projectId);
const tables = new TablesDB(client);

export function emptyPortfolioState(message = "等待真实行情授权，未生成任何模拟收益"): AppwritePortfolioState {
  const now = new Date().toISOString();
  return {
    status: "awaiting_market_credentials",
    mode: "real_quotes_paper_funds",
    initialCapital: 1_000_000,
    cash: 1_000_000,
    equity: 1_000_000,
    positions: [],
    trades: [],
    snapshots: [{ occurredAt: now, equity: 1_000_000, cash: 1_000_000, cumulativeReturn: 0, drawdown: 0 }],
    strategyVersion: 1,
    message,
    updatedAt: now,
  };
}

function normalizeState(value: Partial<AppwritePortfolioState>, occurredAt: string): AppwritePortfolioState {
  const base = emptyPortfolioState();
  return {
    ...base,
    ...value,
    positions: Array.isArray(value.positions) ? value.positions : [],
    trades: Array.isArray(value.trades) ? value.trades : [],
    snapshots: Array.isArray(value.snapshots) && value.snapshots.length ? value.snapshots : base.snapshots,
    updatedAt: value.updatedAt || occurredAt,
  };
}

export async function loadPortfolioState(): Promise<AppwritePortfolioState> {
  try {
    const result = await tables.listRows<PortfolioRow>({
      databaseId,
      tableId,
      queries: [Query.equal("record_type", "account"), Query.orderDesc("occurred_at"), Query.limit(1)],
    });
    const row = result.rows[0];
    if (!row) return emptyPortfolioState();
    return normalizeState(JSON.parse(row.payload) as Partial<AppwritePortfolioState>, row.occurred_at);
  } catch (error) {
    console.error("Unable to load Appwrite portfolio state", error);
    return { ...emptyPortfolioState("Appwrite 账户暂时无法读取，请稍后刷新"), status: "error" };
  }
}
