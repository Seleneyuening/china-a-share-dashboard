import { createClient } from "@supabase/supabase-js";

export type PortfolioStatus = "awaiting_engine" | "active" | "paused" | "error";
export type PortfolioAccountId = "main" | "etf";
export type LivePosition = { symbol: string; companyName: string; quantity: number; averagePrice: number; lastPrice: number; openedAt: string; reason: string };
export type LiveTrade = { id: string; side: "买入" | "卖出"; symbol: string; companyName: string; quantity: number; price: number; fee: number; occurredAt: string; realizedPnl?: number; reason: string };
export type PortfolioSnapshot = { occurredAt: string; equity: number; cash: number; cumulativeReturn: number; drawdown: number };
export type StrategyEvolution = { status: "not_reviewed" | "waiting_for_sample" | "no_change" | "promoted" | "failed"; rationale: string; reviewedAt?: string; tradingDays: number; closedTrades: number; versionClosedTrades: number; versionAgeDays: number };
export type SupabasePortfolioState = { status: PortfolioStatus; mode: "real_quotes_paper_funds"; initialCapital: number; cash: number; equity: number; positions: LivePosition[]; trades: LiveTrade[]; snapshots: PortfolioSnapshot[]; strategyVersion: number; evolution: StrategyEvolution; message: string; updatedAt: string; lastMarketAt?: string };

const supabase = createClient("https://jmfuujyeodhjhgxezqpv.supabase.co", "sb_publishable_zDXnDnWE665dD9kMmSqxOQ_U0Y_V5ib", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

const accountNames: Record<PortfolioAccountId, string> = { main: "A 股账户", etf: "ETF 账户" };

export function emptyPortfolioState(accountId: PortfolioAccountId = "main", message = `Supabase ${accountNames[accountId]}已建立，等待自主操盘引擎首次运行`): SupabasePortfolioState {
  const now = new Date().toISOString();
  return { status: "awaiting_engine", mode: "real_quotes_paper_funds", initialCapital: 1_000_000, cash: 1_000_000, equity: 1_000_000, positions: [], trades: [], snapshots: [{ occurredAt: now, equity: 1_000_000, cash: 1_000_000, cumulativeReturn: 0, drawdown: 0 }], strategyVersion: 1, evolution: { status: "not_reviewed", rationale: "自动进化已启用，等待首次每日复盘。", tradingDays: 0, closedTrades: 0, versionClosedTrades: 0, versionAgeDays: 0 }, message, updatedAt: now };
}

export async function loadPortfolioState(accountId: PortfolioAccountId = "main"): Promise<SupabasePortfolioState> {
  const strategyTable = accountId === "etf" ? "cn_etf_strategy_versions" : "cn_strategy_versions";
  const reviewTable = accountId === "etf" ? "cn_etf_strategy_reviews" : "cn_strategy_reviews";
  try {
    const [accountResult, positionsResult, tradesResult, snapshotsResult, strategyResult, reviewResult] = await Promise.all([
      supabase.from("cn_portfolio_accounts").select("*").eq("account_id", accountId).single(),
      supabase.from("cn_portfolio_positions").select("*").eq("account_id", accountId).order("opened_at", { ascending: false }),
      supabase.from("cn_portfolio_trades").select("*").eq("account_id", accountId).order("occurred_at", { ascending: true }).limit(1000),
      supabase.from("cn_portfolio_snapshots").select("*").eq("account_id", accountId).order("captured_at", { ascending: true }).limit(500),
      supabase.from(strategyTable).select("strategy_version,rationale").eq("status", "active").single(),
      supabase.from(reviewTable).select("status,rationale,metrics,reviewed_at,current_version").order("reviewed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const error = accountResult.error || positionsResult.error || tradesResult.error || snapshotsResult.error || strategyResult.error || reviewResult.error;
    if (error || !accountResult.data) throw error || new Error("A 股账户不存在");
    const account = accountResult.data;
    const positions = (positionsResult.data || []).map((row) => ({ symbol: row.symbol, companyName: row.company_name, quantity: Number(row.quantity), averagePrice: Number(row.average_price), lastPrice: Number(row.last_price), openedAt: row.opened_at, reason: row.reason }));
    const trades = (tradesResult.data || []).map((row) => ({ id: row.trade_id, side: row.side as "买入" | "卖出", symbol: row.symbol, companyName: row.company_name, quantity: Number(row.quantity), price: Number(row.price), fee: Number(row.fee), occurredAt: row.occurred_at, realizedPnl: row.realized_pnl == null ? undefined : Number(row.realized_pnl), reason: row.reason }));
    const snapshots = (snapshotsResult.data || []).map((row) => ({ occurredAt: row.captured_at, equity: Number(row.equity), cash: Number(row.cash), cumulativeReturn: Number(row.cumulative_return), drawdown: Number(row.drawdown) }));
    const review = Number(reviewResult.data?.current_version) === Number(account.strategy_version) ? reviewResult.data : null;
    const metrics = review?.metrics || {};
    const evolution: StrategyEvolution = review ? { status: review.status, rationale: review.rationale, reviewedAt: review.reviewed_at, tradingDays: Number(metrics.tradingDays || 0), closedTrades: Number(metrics.closedTrades || 0), versionClosedTrades: Number(metrics.versionClosedTrades || 0), versionAgeDays: Number(metrics.versionAgeDays || 0) } : { status: "not_reviewed", rationale: strategyResult.data?.rationale || "自动进化已启用，等待首次每日复盘。", tradingDays: 0, closedTrades: 0, versionClosedTrades: 0, versionAgeDays: 0 };
    return { status: account.status, mode: account.mode, initialCapital: Number(account.initial_capital), cash: Number(account.cash), equity: Number(account.equity), positions, trades, snapshots: snapshots.length ? snapshots : emptyPortfolioState(accountId).snapshots, strategyVersion: Number(account.strategy_version), evolution, message: account.message, updatedAt: account.updated_at, lastMarketAt: account.last_market_at || undefined };
  } catch (error) {
    if (accountId === "etf") return emptyPortfolioState("etf", "ETF 虚拟账户将在数据库迁移后开始记录独立资金与交易");
    console.error("Unable to load Supabase portfolio state", error);
    return { ...emptyPortfolioState("main", "Supabase 账户暂时无法读取，请稍后刷新"), status: "error" };
  }
}
