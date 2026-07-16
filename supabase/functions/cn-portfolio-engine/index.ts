import { createClient } from "npm:@supabase/supabase-js@2";

type PoolRole = "core" | "dynamic" | "etf" | "held";
type Spot = { symbol: string; market: "SH" | "SZ" | "BJ"; name: string; price: number; changePct: number; volume: number; turnover: number; amplitude: number; turnoverRate: number; volumeRatio: number; fiveMinute: number; prevClose: number; marketCap: number; return60d: number; poolRole: PoolRole };
type StrategyParameters = {
  positiveRatioMin: number; averageChangeMin: number; minimumScore: number; maxPositions: number; maxExposure: number;
  positionEquityPct: number; cashBudgetPct: number; cooldownMinutes: number; stopLossPct: number; takeProfitPct: number;
  maxHoldDays: number; weakDayChangePct: number; changePctMin: number; changePctMax: number; turnoverRateMin: number;
  turnoverRateMax: number; volumeRatioMin: number; volumeRatioMax: number; fiveMinuteMin: number; return60dMin: number; return60dMax: number;
};

const CORE_SYMBOLS = [
  "600519", "000858", "000333", "000651", "300750", "002594", "601318", "600036", "601398", "601899",
  "600900", "300760", "600276", "600893", "600150", "000977", "002475", "300308", "300502", "688041",
  "603019", "300033", "601127", "300274", "601088",
];
const ETF_SYMBOLS = ["510300", "510500", "588000", "159915", "512480", "512660", "512010", "515790", "516160", "512880"];

const DEFAULT_PARAMETERS: StrategyParameters = {
  positiveRatioMin: 0.52, averageChangeMin: 0.15, minimumScore: 9.5, maxPositions: 4, maxExposure: 0.45,
  positionEquityPct: 0.10, cashBudgetPct: 0.14, cooldownMinutes: 20, stopLossPct: -4.5, takeProfitPct: 8,
  maxHoldDays: 8, weakDayChangePct: -3.5, changePctMin: 0.8, changePctMax: 8, turnoverRateMin: 0.8,
  turnoverRateMax: 18, volumeRatioMin: 0.95, volumeRatioMax: 5, fiveMinuteMin: -1.2, return60dMin: -15, return60dMax: 70,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const shanghaiParts = () => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((part) => [part.type, part.value]));

function isTradingWindow(parts: Record<string, string>) {
  if (["Sat", "Sun"].includes(parts.weekday)) return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return (minutes >= 9 * 60 + 35 && minutes <= 11 * 60 + 25) || (minutes >= 13 * 60 + 5 && minutes <= 14 * 60 + 50);
}

function secid(symbol: string) {
  return `${symbol.startsWith("6") || symbol.startsWith("5") ? 1 : 0}.${symbol}`;
}

function toSpot(row: Record<string, unknown>, poolRole: PoolRole): Spot {
  const symbol = String(row.f12 || "");
  return { symbol, market: Number(row.f13) === 1 ? "SH" : symbol.startsWith("8") || symbol.startsWith("4") ? "BJ" : "SZ", name: String(row.f14 || "").replace(/\s+/g, ""), price: number(row.f2), changePct: number(row.f3), volume: number(row.f5), turnover: number(row.f6), amplitude: number(row.f7), turnoverRate: number(row.f8), volumeRatio: number(row.f10), fiveMinute: number(row.f11), prevClose: number(row.f18), marketCap: number(row.f20), return60d: number(row.f24), poolRole };
}

async function fetchSymbols(symbols: string[], poolRole: PoolRole): Promise<Spot[]> {
  if (!symbols.length) return [];
  const query = new URLSearchParams({ fltt: "2", invt: "2", fields: "f2,f3,f5,f6,f7,f8,f10,f11,f12,f13,f14,f18,f20,f24", secids: symbols.map(secid).join(",") });
  const response = await fetch(`https://push2.eastmoney.com/api/qt/ulist.np/get?${query}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`fixed pool source ${response.status}`);
  const rows = (await response.json())?.data?.diff;
  if (!Array.isArray(rows)) throw new Error("fixed pool unavailable");
  return rows.map((row: Record<string, unknown>) => toSpot(row, poolRole)).filter((item: Spot) => item.symbol && item.price > 0 && item.prevClose > 0);
}

async function fetchDynamicPool(excluded: Set<string>): Promise<Spot[]> {
  const query = new URLSearchParams({ pn: "1", pz: "160", po: "1", np: "1", ut: "bd1d9ddb04089700cf9c27f6f7426281", fltt: "2", invt: "2", fid: "f6", fs: "m:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048", fields: "f2,f3,f5,f6,f7,f8,f10,f11,f12,f13,f14,f18,f20,f24" });
  const response = await fetch(`https://82.push2.eastmoney.com/api/qt/clist/get?${query}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`dynamic pool source ${response.status}`);
  const rows = (await response.json())?.data?.diff;
  if (!Array.isArray(rows) || rows.length < 80) throw new Error("dynamic pool incomplete");
  return rows.map((row: Record<string, unknown>) => toSpot(row, "dynamic")).filter((item: Spot) => item.symbol && item.price > 0 && item.prevClose > 0 && !excluded.has(item.symbol) && !/ST|退|N|C/.test(item.name)).slice(0, 50);
}

function score(item: Spot) {
  const coreBonus = item.poolRole === "core" ? 0.65 : 0;
  return item.changePct * 1.8 + Math.min(item.volumeRatio, 3) * 1.8 + item.fiveMinute * 1.2 + Math.min(item.turnoverRate, 12) * 0.18 + Math.max(-10, Math.min(item.return60d, 40)) * 0.04 - Math.max(0, item.amplitude - 8) * 0.8 + coreBonus;
}

function eligible(item: Spot, parameters: StrategyParameters) {
  return item.poolRole !== "etf" && !/ST|退|N|C/.test(item.name) && item.price >= 3 && item.price <= 1500 && item.marketCap >= 2_000_000_000 && item.changePct >= parameters.changePctMin && item.changePct <= parameters.changePctMax && item.turnoverRate >= parameters.turnoverRateMin && item.turnoverRate <= parameters.turnoverRateMax && item.volumeRatio >= parameters.volumeRatioMin && item.volumeRatio <= parameters.volumeRatioMax && item.fiveMinute > parameters.fiveMinuteMin && item.return60d > parameters.return60dMin && item.return60d < parameters.return60dMax;
}

function resolveParameters(value: unknown): StrategyParameters {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(DEFAULT_PARAMETERS).map(([key, fallback]) => {
    const candidate = Number(source[key]);
    return [key, Number.isFinite(candidate) ? candidate : fallback];
  })) as StrategyParameters;
}

function commission(gross: number, sell = false) {
  return Number((Math.max(5, gross * 0.0003) + (sell ? gross * 0.0005 : 0)).toFixed(2));
}

Deno.serve(async (req) => {
  const parts = shanghaiParts();
  const requestBody = await req.json().catch(() => ({})) as { dryRun?: boolean };
  const dryRun = requestBody.dryRun === true;
  if (!dryRun && !isTradingWindow(parts)) return json({ ok: true, skipped: "outside_trading_window" });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const [accountResult, positionsResult, recentTradesResult, strategyResult] = await Promise.all([
    supabase.from("cn_portfolio_accounts").select("*").eq("account_id", "main").single(),
    supabase.from("cn_portfolio_positions").select("*").eq("account_id", "main"),
    supabase.from("cn_portfolio_trades").select("side,occurred_at").eq("account_id", "main").order("occurred_at", { ascending: false }).limit(1),
    supabase.from("cn_strategy_versions").select("strategy_version,parameters").eq("status", "active").single(),
  ]);
  if (accountResult.error || !accountResult.data) return json({ ok: false, error: accountResult.error?.message || "account unavailable" }, 500);

  const positions = positionsResult.data || [];
  const fixedSet = new Set([...CORE_SYMBOLS, ...ETF_SYMBOLS]);
  try {
    const [core, dynamic, etfs] = await Promise.all([
      fetchSymbols(CORE_SYMBOLS, "core"),
      fetchDynamicPool(fixedSet),
      fetchSymbols(ETF_SYMBOLS, "etf"),
    ]);
    if (core.length !== 25 || dynamic.length !== 50 || etfs.length !== 10) throw new Error(`pool incomplete: ${core.length}+${dynamic.length}+${etfs.length}`);
    const pool = [...core, ...dynamic, ...etfs];
    const missingHeld = positions.map((position) => String(position.symbol)).filter((symbol) => !pool.some((item) => item.symbol === symbol));
    const heldQuotes = await fetchSymbols(missingHeld, "held");
    const quoteUniverse = [...pool, ...heldQuotes];
    const bySymbol = new Map(quoteUniverse.map((item) => [item.symbol, item]));
    const parameters = resolveParameters(strategyResult.data?.parameters);
    const strategyVersion = Number(strategyResult.data?.strategy_version || accountResult.data.strategy_version || 1);
    const stockPool = [...core, ...dynamic];
    const positiveRatio = stockPool.filter((item) => item.changePct > 0).length / stockPool.length;
    const averageChange = stockPool.reduce((sum, item) => sum + item.changePct, 0) / stockPool.length;
    const etfPositiveRatio = etfs.filter((item) => item.changePct > 0).length / etfs.length;
    const etfAverageChange = etfs.reduce((sum, item) => sum + item.changePct, 0) / etfs.length;
    const marketHealthy = positiveRatio >= parameters.positiveRatioMin && averageChange >= parameters.averageChangeMin && etfPositiveRatio >= 0.3;
    const candidates = stockPool.filter((item) => eligible(item, parameters)).sort((a, b) => score(b) - score(a));
    const poolMetrics = { core: core.length, dynamic: dynamic.length, etf: etfs.length, total: pool.length };

    if (dryRun) return json({ ok: true, dryRun: true, strategyVersion, pool: poolMetrics, market: { positiveRatio, averageChange, etfPositiveRatio, etfAverageChange, marketHealthy }, candidateCount: candidates.length, topCandidates: candidates.slice(0, 5).map((item) => ({ symbol: item.symbol, name: item.name, poolRole: item.poolRole, score: Number(score(item).toFixed(2)), changePct: item.changePct, volumeRatio: item.volumeRatio })) });

    const slotMinute = Math.floor(Number(parts.minute) / 5) * 5;
    const runSlot = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${String(slotMinute).padStart(2, "0")}:00+08:00`;
    const { data: run, error: runError } = await supabase.from("cn_engine_runs").insert({ run_slot: runSlot, status: "running", message: "扫描 25 核心 + 50 动态 + 10 行业 ETF" }).select("run_id").single();
    if (runError?.code === "23505") return json({ ok: true, skipped: "duplicate_slot" });
    if (runError || !run) return json({ ok: false, error: runError?.message || "run lock failed" }, 500);

    try {
      const account = accountResult.data;
      let actionCount = 0;
      let cash = number(account.cash);
      const soldSymbols = new Set<string>();

      for (const position of positions) {
        const quote = bySymbol.get(position.symbol);
        if (!quote) continue;
        await supabase.from("cn_portfolio_positions").update({ last_price: quote.price, last_marked_at: new Date().toISOString() }).eq("position_id", position.position_id);
        const pnlPct = (quote.price / number(position.average_price) - 1) * 100;
        const openedDate = new Date(position.opened_at).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
        const today = `${parts.year}-${parts.month}-${parts.day}`;
        const heldDays = Math.floor((Date.now() - new Date(position.opened_at).getTime()) / 86_400_000);
        const sellReason = openedDate < today && pnlPct <= parameters.stopLossPct ? `自动止损：浮亏 ${pnlPct.toFixed(2)}%` : openedDate < today && pnlPct >= parameters.takeProfitPct ? `自动止盈：浮盈 ${pnlPct.toFixed(2)}%` : openedDate < today && heldDays >= parameters.maxHoldDays ? `自动轮换：持有 ${heldDays} 天` : openedDate < today && quote.changePct <= parameters.weakDayChangePct ? `自动退出：当日走弱 ${quote.changePct.toFixed(2)}%` : "";
        if (sellReason) {
          const gross = number(position.quantity) * quote.price;
          const fee = commission(gross, true);
          const { error } = await supabase.rpc("cn_execute_virtual_trade", { p_side: "卖出", p_symbol: position.symbol, p_market: position.market, p_company_name: position.company_name, p_quantity: position.quantity, p_price: quote.price, p_fee: fee, p_reason: sellReason, p_strategy_version: strategyVersion });
          if (!error) { cash += gross - fee; actionCount += 1; soldSymbols.add(position.symbol); }
        }
      }

      const lastTradeAt = recentTradesResult.data?.[0]?.occurred_at ? new Date(recentTradesResult.data[0].occurred_at).getTime() : 0;
      const cooldownPassed = Date.now() - lastTradeAt >= parameters.cooldownMinutes * 60 * 1000;
      const heldSymbols = new Set(positions.filter((position) => !soldSymbols.has(position.symbol)).map((position) => position.symbol));
      const positionValue = positions.filter((position) => !soldSymbols.has(position.symbol)).reduce((sum, position) => sum + number(position.quantity) * (bySymbol.get(position.symbol)?.price || number(position.last_price)), 0);
      const equityBeforeBuy = cash + positionValue;
      const exposure = positionValue / Math.max(equityBeforeBuy, 1);
      const best = candidates.find((item) => !heldSymbols.has(item.symbol));

      if (marketHealthy && cooldownPassed && heldSymbols.size < parameters.maxPositions && exposure < parameters.maxExposure && best && score(best) >= parameters.minimumScore) {
        const budget = Math.min(cash * parameters.cashBudgetPct, equityBeforeBuy * parameters.positionEquityPct);
        const quantity = Math.floor(budget / best.price / 100) * 100;
        if (quantity >= 100) {
          const gross = quantity * best.price;
          const fee = commission(gross);
          const reason = `自动买入：${best.poolRole === "core" ? "核心池" : "动态池"}评分 ${score(best).toFixed(2)}；涨幅 ${best.changePct.toFixed(2)}%，量比 ${best.volumeRatio.toFixed(2)}，ETF 风向 ${(etfPositiveRatio * 100).toFixed(0)}% 向上`;
          const { error } = await supabase.rpc("cn_execute_virtual_trade", { p_side: "买入", p_symbol: best.symbol, p_market: best.market, p_company_name: best.name, p_quantity: quantity, p_price: best.price, p_fee: fee, p_reason: reason, p_strategy_version: strategyVersion });
          if (!error) actionCount += 1;
        }
      } else if (actionCount === 0) {
        await supabase.from("cn_strategy_decisions").insert({ account_id: "main", action: "HOLD_CASH", reason: marketHealthy ? "候选评分、仓位或冷却期暂未满足，系统自动等待下一轮" : `市场门槛未通过：股票上涨占比 ${(positiveRatio * 100).toFixed(1)}%，ETF 上涨占比 ${(etfPositiveRatio * 100).toFixed(1)}%`, market_state: { positiveRatio, averageChange, etfPositiveRatio, etfAverageChange, marketHealthy }, payload: { pool: poolMetrics, topCandidate: best ? { symbol: best.symbol, name: best.name, poolRole: best.poolRole, score: score(best) } : null, parameters }, strategy_version: strategyVersion });
      }

      const refreshedPositions = await supabase.from("cn_portfolio_positions").select("quantity,last_price").eq("account_id", "main");
      const refreshedAccount = await supabase.from("cn_portfolio_accounts").select("cash,initial_capital").eq("account_id", "main").single();
      const finalCash = number(refreshedAccount.data?.cash);
      const finalPositionValue = (refreshedPositions.data || []).reduce((sum, position) => sum + number(position.quantity) * number(position.last_price), 0);
      const equity = finalCash + finalPositionValue;
      const cumulativeReturn = (equity / number(refreshedAccount.data?.initial_capital) - 1) * 100;
      const peakSnapshot = await supabase.from("cn_portfolio_snapshots").select("equity").eq("account_id", "main").order("equity", { ascending: false }).limit(1).maybeSingle();
      const peakEquity = Math.max(equity, number(peakSnapshot.data?.equity));
      const drawdown = peakEquity > 0 ? (equity / peakEquity - 1) * 100 : 0;
      await Promise.all([
        supabase.from("cn_portfolio_accounts").update({ equity, strategy_version: strategyVersion, last_market_at: new Date().toISOString(), status: "active", message: actionCount ? `V${strategyVersion} 本轮自动完成 ${actionCount} 笔虚拟成交` : `V${strategyVersion} 本轮自动观察，暂无成交`, updated_at: new Date().toISOString() }).eq("account_id", "main"),
        supabase.from("cn_portfolio_snapshots").insert({ account_id: "main", captured_at: new Date().toISOString(), cash: finalCash, equity, cumulative_return: cumulativeReturn, drawdown }),
        supabase.from("cn_engine_runs").update({ finished_at: new Date().toISOString(), status: actionCount ? "succeeded" : "skipped", universe_size: pool.length, candidate_count: candidates.length, action_count: actionCount, message: actionCount ? `V${strategyVersion} 自动完成 ${actionCount} 笔虚拟成交` : `V${strategyVersion} 无满足门槛的交易`, metrics: { pool: poolMetrics, positiveRatio, averageChange, etfPositiveRatio, etfAverageChange, equity, drawdown, exposure, strategyVersion, parameters, topCandidate: best ? { symbol: best.symbol, name: best.name, poolRole: best.poolRole, score: score(best) } : null } }).eq("run_id", run.run_id),
      ]);
      return json({ ok: true, actionCount, pool: poolMetrics, candidateCount: candidates.length, marketHealthy, equity });
    } catch (error) {
      await supabase.from("cn_engine_runs").update({ finished_at: new Date().toISOString(), status: "failed", message: error instanceof Error ? error.message : String(error) }).eq("run_id", run.run_id);
      await supabase.from("cn_portfolio_accounts").update({ status: "error", message: "自动操盘引擎本轮失败，未执行不确定成交", updated_at: new Date().toISOString() }).eq("account_id", "main");
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
    }
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
