import { createClient } from "npm:@supabase/supabase-js@2";

type Parameters = Record<string, number>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const shanghaiDate = (value: string | Date) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });

function dailyReviewKey(version: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}-V${version}`;
}

function defensiveVersion(current: Parameters): Parameters {
  return {
    ...current,
    positiveRatioMin: clamp(number(current.positiveRatioMin) + 0.03, 0.52, 0.72),
    averageChangeMin: clamp(number(current.averageChangeMin) + 0.10, 0.15, 1.10),
    minimumScore: clamp(number(current.minimumScore) + 1, 9.5, 18),
    maxExposure: clamp(number(current.maxExposure) - 0.05, 0.20, 0.40),
    positionEquityPct: clamp(number(current.positionEquityPct) - 0.02, 0.06, 0.12),
    cashBudgetPct: clamp(number(current.cashBudgetPct) - 0.02, 0.10, 0.18),
  };
}

function cautiouslyExpand(current: Parameters): Parameters {
  return {
    ...current,
    positiveRatioMin: clamp(number(current.positiveRatioMin) - 0.01, 0.50, 0.62),
    averageChangeMin: clamp(number(current.averageChangeMin) - 0.05, 0.05, 0.55),
    minimumScore: clamp(number(current.minimumScore) - 0.5, 8, 14),
    maxExposure: clamp(number(current.maxExposure) + 0.03, 0.30, 0.50),
    positionEquityPct: clamp(number(current.positionEquityPct) + 0.01, 0.08, 0.15),
  };
}

function explorationVersion(current: Parameters): Parameters {
  return {
    ...current,
    positiveRatioMin: clamp(number(current.positiveRatioMin) - 0.02, 0.50, 0.60),
    averageChangeMin: clamp(number(current.averageChangeMin) - 0.05, 0.05, 0.50),
    minimumScore: clamp(number(current.minimumScore) - 0.75, 8, 12),
    changePctMin: clamp(number(current.changePctMin) - 0.15, 0.50, 1.20),
    volumeRatioMin: clamp(number(current.volumeRatioMin) - 0.05, 0.85, 1.10),
    maxPositions: clamp(number(current.maxPositions) + 1, 3, 5),
    maxExposure: clamp(number(current.maxExposure) + 0.03, 0.35, 0.50),
  };
}

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  try {
    const [accountResult, strategyResult, tradesResult, snapshotsResult, runsResult] = await Promise.all([
      supabase.from("cn_portfolio_accounts").select("initial_capital,equity,strategy_version").eq("account_id", "main").single(),
      supabase.from("cn_strategy_versions").select("strategy_version,parameters,promoted_at").eq("status", "active").single(),
      supabase.from("cn_portfolio_trades").select("side,realized_pnl,strategy_version,occurred_at").eq("account_id", "main").order("occurred_at", { ascending: true }).limit(1000),
      supabase.from("cn_portfolio_snapshots").select("captured_at,drawdown").eq("account_id", "main").order("captured_at", { ascending: true }).limit(2000),
      supabase.from("cn_engine_runs").select("started_at,status").order("started_at", { ascending: true }).limit(3000),
    ]);

    if (accountResult.error || !accountResult.data) throw new Error(accountResult.error?.message || "account unavailable");
    if (strategyResult.error || !strategyResult.data) throw new Error(strategyResult.error?.message || "active strategy unavailable");

    const account = accountResult.data;
    const strategy = strategyResult.data;
    const currentVersion = number(strategy.strategy_version);
    const reviewKey = dailyReviewKey(currentVersion);
    const existingReview = await supabase.from("cn_strategy_reviews").select("review_id,status,proposed_version").eq("review_key", reviewKey).maybeSingle();
    if (existingReview.data) return json({ ok: true, skipped: "already_reviewed", review: existingReview.data });

    const trades = tradesResult.data || [];
    const sellTrades = trades.filter((trade) => trade.side === "卖出");
    const versionSells = sellTrades.filter((trade) => number(trade.strategy_version) === currentVersion);
    const successfulRuns = (runsResult.data || []).filter((run) => run.status === "succeeded" || run.status === "skipped");
    const tradingDays = new Set(successfulRuns.map((run) => shanghaiDate(run.started_at))).size;
    const versionWins = versionSells.filter((trade) => number(trade.realized_pnl) > 0).length;
    const winRate = versionSells.length ? versionWins / versionSells.length : 0;
    const averageRealizedPnl = versionSells.length ? versionSells.reduce((sum, trade) => sum + number(trade.realized_pnl), 0) / versionSells.length : 0;
    const totalReturnPct = number(account.initial_capital) > 0 ? (number(account.equity) / number(account.initial_capital) - 1) * 100 : 0;
    const maxDrawdownPct = Math.abs(Math.min(0, ...(snapshotsResult.data || []).map((snapshot) => number(snapshot.drawdown))));
    const versionAgeDays = strategy.promoted_at ? Math.floor((Date.now() - new Date(strategy.promoted_at).getTime()) / 86_400_000) : 0;
    const metrics = { tradingDays, closedTrades: sellTrades.length, versionClosedTrades: versionSells.length, versionWins, winRate, averageRealizedPnl, totalReturnPct, maxDrawdownPct, versionAgeDays };
    const enoughSample = tradingDays >= 10 && sellTrades.length >= 6 && versionSells.length >= 4 && versionAgeDays >= 7;

    if (!enoughSample) {
      const versionBuys = trades.filter((trade) => trade.side === "买入" && number(trade.strategy_version) === currentVersion).length;
      if (tradingDays >= 2 && versionAgeDays >= 2 && versionBuys === 0) {
        const nextParameters = explorationVersion(strategy.parameters as Parameters);
        const rationale = `V${currentVersion} 连续 ${tradingDays} 个交易日仍无买入样本，自动小幅放宽市场、评分和量能门槛，以便虚拟账户获得可复盘样本。`;
        const promotion = await supabase.rpc("cn_promote_strategy", { p_expected_current_version: currentVersion, p_parameters: nextParameters, p_evaluation: { ...metrics, versionBuys }, p_rationale: rationale });
        if (promotion.error) throw new Error(promotion.error.message);
        const nextVersion = number(promotion.data);
        await supabase.from("cn_strategy_reviews").insert({ review_key: reviewKey, status: "promoted", current_version: currentVersion, proposed_version: nextVersion, metrics: { ...metrics, versionBuys }, rationale });
        return json({ ok: true, status: "promoted_for_exploration", previousVersion: currentVersion, currentVersion: nextVersion, metrics: { ...metrics, versionBuys }, rationale });
      }
      const rationale = `继续收集样本：需要至少 10 个交易日、6 次完整卖出、当前版本 4 次完整卖出且运行 7 天；目前为 ${tradingDays} 日、${sellTrades.length} 次、V${currentVersion} ${versionSells.length} 次、${versionAgeDays} 天。`;
      await supabase.from("cn_strategy_reviews").insert({ review_key: reviewKey, status: "waiting_for_sample", current_version: currentVersion, metrics, rationale });
      return json({ ok: true, status: "waiting_for_sample", currentVersion, metrics, rationale });
    }

    const currentParameters = strategy.parameters as Parameters;
    const shouldDefend = winRate < 0.38 || maxDrawdownPct >= 8 || totalReturnPct <= -3;
    const canExpand = winRate >= 0.58 && averageRealizedPnl > 0 && totalReturnPct >= 2 && maxDrawdownPct <= 5;

    if (!shouldDefend && !canExpand) {
      const rationale = `V${currentVersion} 的收益与风险尚未形成足够明确的改善方向，本周保持参数不变。`;
      await supabase.from("cn_strategy_reviews").insert({ review_key: reviewKey, status: "no_change", current_version: currentVersion, metrics, rationale });
      return json({ ok: true, status: "no_change", currentVersion, metrics, rationale });
    }

    const nextParameters = shouldDefend ? defensiveVersion(currentParameters) : cautiouslyExpand(currentParameters);
    const rationale = shouldDefend
      ? `V${currentVersion} 的胜率或回撤触发防守升级：提高市场与个股门槛，并降低最大仓位。`
      : `V${currentVersion} 在足够样本中保持正收益、较高胜率和低回撤：仅小幅扩大机会范围与仓位上限。`;
    const promotion = await supabase.rpc("cn_promote_strategy", { p_expected_current_version: currentVersion, p_parameters: nextParameters, p_evaluation: metrics, p_rationale: rationale });
    if (promotion.error) throw new Error(promotion.error.message);
    const nextVersion = number(promotion.data);
    await supabase.from("cn_strategy_reviews").insert({ review_key: reviewKey, status: "promoted", current_version: currentVersion, proposed_version: nextVersion, metrics, rationale });
    return json({ ok: true, status: "promoted", previousVersion: currentVersion, currentVersion: nextVersion, metrics, rationale });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
