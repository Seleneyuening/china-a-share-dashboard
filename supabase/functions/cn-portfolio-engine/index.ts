import { createClient } from "npm:@supabase/supabase-js@2";

type Spot = { symbol: string; market: "SH" | "SZ" | "BJ"; name: string; price: number; changePct: number; volume: number; turnover: number; amplitude: number; turnoverRate: number; volumeRatio: number; fiveMinute: number; prevClose: number; marketCap: number; return60d: number };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const shanghaiParts = () => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((part) => [part.type, part.value]));

function isTradingWindow(parts: Record<string, string>) {
  if (["Sat", "Sun"].includes(parts.weekday)) return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return (minutes >= 9 * 60 + 35 && minutes <= 11 * 60 + 25) || (minutes >= 13 * 60 + 5 && minutes <= 14 * 60 + 50);
}

async function fetchLiquidUniverse(): Promise<Spot[]> {
  const query = new URLSearchParams({ pn: "1", pz: "100", po: "1", np: "1", ut: "bd1d9ddb04089700cf9c27f6f7426281", fltt: "2", invt: "2", fid: "f6", fs: "m:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048", fields: "f2,f3,f5,f6,f7,f8,f10,f11,f12,f13,f14,f18,f20,f24" });
  const response = await fetch(`https://82.push2.eastmoney.com/api/qt/clist/get?${query}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`market source ${response.status}`);
  const body = await response.json();
  const rows = body?.data?.diff;
  if (!Array.isArray(rows) || rows.length < 80) throw new Error("market universe incomplete");
  return rows.map((row: Record<string, unknown>) => ({ symbol: String(row.f12 || ""), market: Number(row.f13) === 1 ? "SH" : String(row.f12 || "").startsWith("8") || String(row.f12 || "").startsWith("4") ? "BJ" : "SZ", name: String(row.f14 || ""), price: number(row.f2), changePct: number(row.f3), volume: number(row.f5), turnover: number(row.f6), amplitude: number(row.f7), turnoverRate: number(row.f8), volumeRatio: number(row.f10), fiveMinute: number(row.f11), prevClose: number(row.f18), marketCap: number(row.f20), return60d: number(row.f24) })).filter((item: Spot) => item.symbol && item.price > 0 && item.prevClose > 0);
}

function score(item: Spot) {
  return item.changePct * 1.8 + Math.min(item.volumeRatio, 3) * 1.8 + item.fiveMinute * 1.2 + Math.min(item.turnoverRate, 12) * 0.18 + Math.max(-10, Math.min(item.return60d, 40)) * 0.04 - Math.max(0, item.amplitude - 8) * 0.8;
}

function eligible(item: Spot) {
  return !/ST|退|N|C/.test(item.name) && item.price >= 3 && item.price <= 200 && item.marketCap >= 2_000_000_000 && item.changePct >= 1.2 && item.changePct <= 7 && item.turnoverRate >= 1 && item.turnoverRate <= 15 && item.volumeRatio >= 1.05 && item.volumeRatio <= 4 && item.fiveMinute > -0.8 && item.return60d > -8 && item.return60d < 60;
}

function commission(gross: number, sell = false) {
  return Number((Math.max(5, gross * 0.0003) + (sell ? gross * 0.0005 : 0)).toFixed(2));
}

Deno.serve(async () => {
  const parts = shanghaiParts();
  if (!isTradingWindow(parts)) return json({ ok: true, skipped: "outside_trading_window" });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const slotMinute = Math.floor(Number(parts.minute) / 5) * 5;
  const runSlot = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${String(slotMinute).padStart(2, "0")}:00+08:00`;
  const { data: run, error: runError } = await supabase.from("cn_engine_runs").insert({ run_slot: runSlot, status: "running", message: "扫描沪深京全市场流动性候选" }).select("run_id").single();
  if (runError?.code === "23505") return json({ ok: true, skipped: "duplicate_slot" });
  if (runError || !run) return json({ ok: false, error: runError?.message || "run lock failed" }, 500);
  try {
    const [universe, accountResult, positionsResult, recentTradesResult] = await Promise.all([
      fetchLiquidUniverse(),
      supabase.from("cn_portfolio_accounts").select("*").eq("account_id", "main").single(),
      supabase.from("cn_portfolio_positions").select("*").eq("account_id", "main"),
      supabase.from("cn_portfolio_trades").select("side,occurred_at").eq("account_id", "main").order("occurred_at", { ascending: false }).limit(1),
    ]);
    if (accountResult.error || !accountResult.data) throw new Error(accountResult.error?.message || "account unavailable");
    const account = accountResult.data;
    const positions = positionsResult.data || [];
    const bySymbol = new Map(universe.map((item) => [item.symbol, item]));
    let actionCount = 0;
    let cash = number(account.cash);

    for (const position of positions) {
      const quote = bySymbol.get(position.symbol);
      if (!quote) continue;
      await supabase.from("cn_portfolio_positions").update({ last_price: quote.price, last_marked_at: new Date().toISOString() }).eq("position_id", position.position_id);
      const pnlPct = (quote.price / number(position.average_price) - 1) * 100;
      const openedDate = new Date(position.opened_at).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      const today = `${parts.year}-${parts.month}-${parts.day}`;
      const heldDays = Math.floor((Date.now() - new Date(position.opened_at).getTime()) / 86_400_000);
      const sellReason = openedDate < today && pnlPct <= -5 ? `止损：浮亏 ${pnlPct.toFixed(2)}%` : openedDate < today && pnlPct >= 10 ? `止盈：浮盈 ${pnlPct.toFixed(2)}%` : openedDate < today && heldDays >= 12 ? `持有 ${heldDays} 天，机会成本退出` : openedDate < today && quote.changePct <= -4 ? `当日走弱 ${quote.changePct.toFixed(2)}%` : "";
      if (sellReason) {
        const gross = number(position.quantity) * quote.price;
        const fee = commission(gross, true);
        const { error } = await supabase.rpc("cn_execute_virtual_trade", { p_side: "卖出", p_symbol: position.symbol, p_market: position.market, p_company_name: position.company_name, p_quantity: position.quantity, p_price: quote.price, p_fee: fee, p_reason: sellReason, p_strategy_version: account.strategy_version });
        if (!error) { cash += gross - fee; actionCount += 1; }
      }
    }

    const positiveRatio = universe.filter((item) => item.changePct > 0).length / Math.max(universe.length, 1);
    const averageChange = universe.reduce((sum, item) => sum + item.changePct, 0) / Math.max(universe.length, 1);
    const marketHealthy = positiveRatio >= 0.58 && averageChange >= 0.55;
    const candidates = universe.filter(eligible).sort((a, b) => score(b) - score(a));
    const lastTradeAt = recentTradesResult.data?.[0]?.occurred_at ? new Date(recentTradesResult.data[0].occurred_at).getTime() : 0;
    const cooldownPassed = Date.now() - lastTradeAt >= 30 * 60 * 1000;
    const heldSymbols = new Set(positions.map((position) => position.symbol));
    const positionValue = positions.reduce((sum, position) => sum + number(position.quantity) * (bySymbol.get(position.symbol)?.price || number(position.last_price)), 0);
    const equityBeforeBuy = cash + positionValue;
    const exposure = positionValue / Math.max(equityBeforeBuy, 1);
    const best = candidates.find((item) => !heldSymbols.has(item.symbol));

    if (marketHealthy && cooldownPassed && positions.length < 3 && exposure < 0.4 && best && score(best) >= 12) {
      const budget = Math.min(cash * 0.18, equityBeforeBuy * 0.12);
      const quantity = Math.floor(budget / best.price / 100) * 100;
      if (quantity >= 100) {
        const gross = quantity * best.price;
        const fee = commission(gross);
        const reason = `市场门槛通过，动态全市场候选评分 ${score(best).toFixed(2)}；涨幅 ${best.changePct.toFixed(2)}%，量比 ${best.volumeRatio.toFixed(2)}`;
        const { error } = await supabase.rpc("cn_execute_virtual_trade", { p_side: "买入", p_symbol: best.symbol, p_market: best.market, p_company_name: best.name, p_quantity: quantity, p_price: best.price, p_fee: fee, p_reason: reason, p_strategy_version: account.strategy_version });
        if (!error) actionCount += 1;
      }
    } else if (actionCount === 0) {
      await supabase.from("cn_strategy_decisions").insert({ account_id: "main", action: "HOLD_CASH", reason: marketHealthy ? "存在候选但信号强度、仓位或冷却期未满足，继续等待" : `市场门槛未通过：活跃股票上涨占比 ${(positiveRatio * 100).toFixed(1)}%，平均涨幅 ${averageChange.toFixed(2)}%`, market_state: { positiveRatio, averageChange, marketHealthy }, payload: { topCandidate: best ? { symbol: best.symbol, name: best.name, score: score(best) } : null }, strategy_version: account.strategy_version });
    }

    const refreshedPositions = await supabase.from("cn_portfolio_positions").select("quantity,last_price").eq("account_id", "main");
    const refreshedAccount = await supabase.from("cn_portfolio_accounts").select("cash,initial_capital").eq("account_id", "main").single();
    const finalCash = number(refreshedAccount.data?.cash);
    const finalPositionValue = (refreshedPositions.data || []).reduce((sum, position) => sum + number(position.quantity) * number(position.last_price), 0);
    const equity = finalCash + finalPositionValue;
    const cumulativeReturn = (equity / number(refreshedAccount.data?.initial_capital) - 1) * 100;
    await Promise.all([
      supabase.from("cn_portfolio_accounts").update({ equity, last_market_at: new Date().toISOString(), status: "active", message: actionCount ? `本轮完成 ${actionCount} 笔虚拟成交` : "本轮选择继续等待或持仓", updated_at: new Date().toISOString() }).eq("account_id", "main"),
      supabase.from("cn_portfolio_snapshots").insert({ account_id: "main", captured_at: new Date().toISOString(), cash: finalCash, equity, cumulative_return: cumulativeReturn, drawdown: 0 }),
      supabase.from("cn_engine_runs").update({ finished_at: new Date().toISOString(), status: actionCount ? "succeeded" : "skipped", universe_size: universe.length, candidate_count: candidates.length, action_count: actionCount, message: actionCount ? `完成 ${actionCount} 笔虚拟成交` : "无满足门槛的交易", metrics: { positiveRatio, averageChange, equity } }).eq("run_id", run.run_id),
    ]);
    return json({ ok: true, actionCount, universeSize: universe.length, candidateCount: candidates.length, marketHealthy, equity });
  } catch (error) {
    await supabase.from("cn_engine_runs").update({ finished_at: new Date().toISOString(), status: "failed", message: error instanceof Error ? error.message : String(error) }).eq("run_id", run.run_id);
    await supabase.from("cn_portfolio_accounts").update({ status: "error", message: "操盘引擎本轮失败，未执行不确定成交", updated_at: new Date().toISOString() }).eq("account_id", "main");
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
