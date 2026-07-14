import { useEffect, useMemo, useState } from "react";
import { AlertCenter } from "../components/alerts/AlertCenter";
import { AlertRuleForm } from "../components/alerts/AlertRuleForm";
import { AlertRuleList } from "../components/alerts/AlertRuleList";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";
import { getUpcomingEarnings } from "../services/stockIntelService";
import { useLiveStocks } from "../hooks/useLiveStocks";
import { useAlerts } from "../hooks/useAlerts";
import type { UpcomingEarnings } from "../types/stockIntel";

export function AlertsPage() {
  const { stocks, ready: liveDataReady } = useLiveStocks();
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const top50Symbols = useMemo(() => new Set(top50.currentTop50.map((entry) => entry.symbol)), [top50.currentTop50]);
  const groupSummaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);

  const { rules, triggeredRuleIds, triggerLog, createRule, toggleRule, removeRule, clearHistory } = useAlerts(liveDataReady, {
    stocks,
    top50Rows: top50.rows,
    groupSummaries,
  });

  const symbols = useMemo(() => stocks.map((stock) => stock.symbol), [stocks]);
  const groups = useMemo(() => marketDataService.getWatchlistGroups(), []);

  const [upcomingEarnings, setUpcomingEarnings] = useState<UpcomingEarnings[]>();
  const [earningsStatus, setEarningsStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    getUpcomingEarnings(15)
      .then((rows) => {
        setUpcomingEarnings(rows);
        setEarningsStatus("ready");
      })
      .catch(() => setEarningsStatus("error"));
  }, []);
  const companyNameBySymbol = useMemo(() => new Map(stocks.map((stock) => [stock.symbol, stock.companyName])), [stocks]);

  return (
    <section className="v2-page alerts-page">
      <div className="v2-hero compact">
        <div>
          <h1>自定义提醒</h1>
          <p>本地保存的提醒规则，条件触发时会在这里高亮，不需要登录或推送。</p>
        </div>
      </div>
      <div className="alerts-grid">
        <div className="alerts-main">
          <AlertRuleForm symbols={symbols} groups={groups} onCreate={createRule} />
          <AlertRuleList rules={rules} triggeredRuleIds={triggeredRuleIds} onToggle={toggleRule} onRemove={removeRule} />
          <div className="v2-card">
            <div className="v2-card-head">
              <h2>近期财报提醒（未来 15 天）</h2>
            </div>
            {earningsStatus === "loading" && <p className="muted-note">加载中…</p>}
            {earningsStatus === "error" && <p className="muted-note">财报日历加载失败。</p>}
            {earningsStatus === "ready" && (
              upcomingEarnings && upcomingEarnings.length ? (
                <ul className="alert-log-list">
                  {upcomingEarnings.map((row) => (
                    <li key={`${row.symbol}-${row.date}`}>
                      <span>{row.symbol} {companyNameBySymbol.get(row.symbol) ?? row.symbol}</span>
                      <b>{row.date}{typeof row.epsEstimate === "number" ? ` · EPS 预期 $${row.epsEstimate.toFixed(2)}` : ""}</b>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted-note">未来 15 天没有追踪股票的财报安排。</p>
            )}
          </div>
        </div>
        <AlertCenter rules={rules} triggeredRuleIds={triggeredRuleIds} triggerLog={triggerLog} onClearHistory={clearHistory} />
      </div>
      <p className="mock-note">提醒规则保存在本地浏览器（localStorage），换设备或清除浏览器数据后需要重新创建；仅供信息参考，不构成任何投资建议。</p>
    </section>
  );
}
