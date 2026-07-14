import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, ChevronsDown, ChevronsUp, RefreshCw, Target, TrendingDown, TrendingUp } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCenter } from "../components/alerts/AlertCenter";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";
import { snapshotHistoryService } from "../services/snapshotHistoryService";
import { useLiveStocks } from "../hooks/useLiveStocks";
import { useAlerts } from "../hooks/useAlerts";
import {
  buildAnomalyOverview,
  buildGroupRotationSeries,
  buildReasonCard,
  calculateRankSwings,
  calculateStreakLeaders,
  classifyAnomalies,
  getDistinctDateCount,
} from "../services/snapshotAnalyticsService";
import type { AnomalyRow, AnomalyType } from "../types/anomaly";
import type { DailySnapshotRow } from "../types/snapshotHistory";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

const baseGrid = { stroke: "#1d3044", strokeDasharray: "3 3" };

type FilterTab = "all" | "new_exit" | "volume" | "rank" | "price";

const tabTypes: Record<FilterTab, AnomalyType[] | null> = {
  all: null,
  new_exit: ["new_top50", "exit_top50"],
  volume: ["volume_up", "volume_down"],
  rank: ["rank_up", "rank_down"],
  price: ["price_move", "streak_up", "streak_down"],
};

const tabLabels: Record<FilterTab, string> = {
  all: "全部",
  new_exit: "新进/退出",
  volume: "放量异动",
  rank: "排名变化",
  price: "价格异动",
};

function deltaLabel(delta: number | null) {
  if (delta === null) return "—";
  if (delta === 0) return "较昨日持平";
  return `较昨日 ${delta > 0 ? "+" : ""}${delta}`;
}

export function AnomalyRadarPage() {
  const { stocks, source, ready, refresh } = useLiveStocks();
  const liveStatus = ready ? `${source} 成交金额` : "成交金额加载中";
  const [history, setHistory] = useState<DailySnapshotRow[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<FilterTab>("all");
  const [expandedSymbol, setExpandedSymbol] = useState<string>();
  const groups = useMemo(() => marketDataService.getWatchlistGroups(), []);

  useEffect(() => {
    const symbols = marketDataService.getStockQuotes().map((stock) => stock.symbol);
    snapshotHistoryService
      .getSymbolHistory(symbols, 10)
      .then((rows) => {
        setHistory(rows);
        setHistoryStatus("ready");
      })
      .catch(() => setHistoryStatus("error"));
  }, []);

  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const top50Symbols = useMemo(() => new Set(top50.currentTop50.map((entry) => entry.symbol)), [top50.currentTop50]);
  const groupSummaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);
  const { rules, triggeredRuleIds, triggerLog, clearHistory } = useAlerts(ready, { stocks, top50Rows: top50.rows, groupSummaries });

  const distinctDays = useMemo(() => getDistinctDateCount(history), [history]);
  const anomalyRows: AnomalyRow[] = useMemo(() => classifyAnomalies(stocks, top50.rows, groups), [stocks, top50.rows, groups]);
  const overview = useMemo(() => buildAnomalyOverview(anomalyRows, history), [anomalyRows, history]);
  const rotation = useMemo(() => buildGroupRotationSeries(history, groups), [history, groups]);
  const streaks = useMemo(() => calculateStreakLeaders(history), [history]);
  const rankSwings = useMemo(() => calculateRankSwings(history), [history]);
  const hasHistoryDepth = historyStatus === "ready" && distinctDays >= 2;

  const filteredRows = useMemo(() => {
    const types = tabTypes[tab];
    return types ? anomalyRows.filter((row) => types.includes(row.type)) : anomalyRows;
  }, [anomalyRows, tab]);

  const tabCounts: Record<FilterTab, number> = {
    all: anomalyRows.length,
    new_exit: anomalyRows.filter((row) => tabTypes.new_exit!.includes(row.type)).length,
    volume: anomalyRows.filter((row) => tabTypes.volume!.includes(row.type)).length,
    rank: anomalyRows.filter((row) => tabTypes.rank!.includes(row.type)).length,
    price: anomalyRows.filter((row) => tabTypes.price!.includes(row.type)).length,
  };

  return (
    <section className="v2-page anomaly-radar-page">
      <div className="v2-hero compact">
        <div>
          <h1>今日异动雷达</h1>
          <p>无需配置，自动汇总今日异动股票与主题轮动</p>
        </div>
        <div className="v2-toolbar">
          <span className="live-dot" /> {liveStatus}
          <button className="icon-button" aria-label="刷新" onClick={() => refresh(true)}><RefreshCw size={16} /></button>
        </div>
      </div>

      <div className="v2-card anomaly-overview">
        <div className="anomaly-stat">
          <Target size={18} />
          <div><strong>{overview.total.count}</strong><small>异动股票（今日）</small></div>
          <span className="muted-note">{deltaLabel(overview.total.delta)}</span>
        </div>
        <div className="anomaly-stat">
          <ArrowUpCircle size={18} className="positive" />
          <div><strong>{overview.newTop50.count}</strong><small>新进 Top 50</small></div>
          <span className="muted-note">{deltaLabel(overview.newTop50.delta)}</span>
        </div>
        <div className="anomaly-stat">
          <ArrowDownCircle size={18} className="negative" />
          <div><strong>{overview.exitTop50.count}</strong><small>退出 Top 50</small></div>
          <span className="muted-note">{deltaLabel(overview.exitTop50.delta)}</span>
        </div>
        <div className="anomaly-stat">
          <TrendingUp size={18} className="positive" />
          <div><strong>{overview.volumeUp.count}</strong><small>放量上涨</small></div>
          <span className="muted-note">{deltaLabel(overview.volumeUp.delta)}</span>
        </div>
        <div className="anomaly-stat">
          <TrendingDown size={18} className="negative" />
          <div><strong>{overview.volumeDown.count}</strong><small>放量下跌</small></div>
          <span className="muted-note">{deltaLabel(overview.volumeDown.delta)}</span>
        </div>
        <div className="anomaly-stat">
          <ChevronsUp size={18} className="positive" />
          <div><strong>{overview.rankUp.count}</strong><small>排名大幅上升</small></div>
          <span className="muted-note">{deltaLabel(overview.rankUp.delta)}</span>
        </div>
        <div className="anomaly-stat">
          <ChevronsDown size={18} className="negative" />
          <div><strong>{overview.rankDown.count}</strong><small>排名大幅下降</small></div>
          <span className="muted-note">{deltaLabel(overview.rankDown.delta)}</span>
        </div>
      </div>

      <div className="anomaly-layout">
        <div className="v2-card">
          <div className="v2-card-head">
            <h2>今日异动股票</h2>
          </div>
          <div className="segmented anomaly-tabs">
            {(Object.keys(tabLabels) as FilterTab[]).map((key) => (
              <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
                {tabLabels[key]} {tabCounts[key]}
              </button>
            ))}
          </div>
          <table className="stock-table">
            <thead>
              <tr>
                <th>股票</th>
                <th>所属组</th>
                <th>异动类型</th>
                <th>今日涨跌</th>
                <th>成交金额</th>
                <th>热度变化</th>
                <th>Top 50 排名变化</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isExpanded = expandedSymbol === row.symbol;
                return (
                  <Fragment key={row.symbol}>
                    <tr onClick={() => setExpandedSymbol(isExpanded ? undefined : row.symbol)}>
                      <td><b>{row.symbol}</b><small>{row.companyName}</small></td>
                      <td>{row.groupName || "—"}</td>
                      <td><span className={`tag ${row.sentiment === "positive" ? "green" : "red"}`}>{row.typeLabel}</span></td>
                      <td className={(row.changePct ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedPct(row.changePct ?? 0)}</td>
                      <td>{formatCompactMoney(row.dollarVolume ?? 0)}</td>
                      <td className={(row.heatRatio ?? 0) >= 1 ? "positive" : "negative"}>{(row.heatRatio ?? 0).toFixed(2)}x</td>
                      <td>{row.previousRank ? `#${row.previousRank}` : "NEW"} → {row.currentRank ? `#${row.currentRank}` : "OUT"}</td>
                      <td className={row.sentiment === "positive" ? "positive" : "negative"}>● {row.statusLabel}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="reason-row">
                        <td colSpan={8}>
                          <div className="reason-card">
                            <strong>可能相关因素</strong>
                            <ul>
                              {buildReasonCard(row, groupSummaries, anomalyRows).map((reason, index) => <li key={index}>{reason}</li>)}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!filteredRows.length && (
                <tr><td colSpan={8} className="muted-note">这个分类下暂时没有异动。</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <AlertCenter rules={rules} triggeredRuleIds={triggeredRuleIds} triggerLog={triggerLog} onClearHistory={clearHistory} />
      </div>

      <div className="v2-card">
        <div className="v2-card-head">
          <h2>连续涨跌 / 排名变化（近 {distinctDays} 个交易日）</h2>
        </div>
        {historyStatus === "loading" && <p className="muted-note">历史数据加载中…</p>}
        {historyStatus === "error" && <p className="muted-note">历史数据加载失败。</p>}
        {historyStatus === "ready" && !hasHistoryDepth && (
          <p className="muted-note">历史数据积累中，暂无法计算连续涨跌/排名变化（当前仅 {distinctDays} 个交易日）。</p>
        )}
        {hasHistoryDepth && (
          <div className="two-col-lists">
            <div>
              <h3>连续涨跌榜</h3>
              <ul className="alert-log-list">
                {streaks.map((streak) => (
                  <li key={streak.symbol}>
                    <span>{streak.symbol} {streak.companyName}</span>
                    <b className={streak.direction === "up" ? "positive" : "negative"}>{streak.direction === "up" ? "连涨" : "连跌"} {streak.streakLength} 天</b>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>排名变化榜</h3>
              <ul className="alert-log-list">
                {rankSwings.map((swing) => (
                  <li key={swing.symbol}>
                    <span>{swing.symbol} {swing.companyName}</span>
                    <b className={swing.swing >= 0 ? "positive" : "negative"}>#{swing.earliestRank} → #{swing.latestRank}</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="v2-card">
        <div className="v2-card-head">
          <h2>主题轮动时间线（近 {distinctDays} 个交易日）</h2>
        </div>
        {hasHistoryDepth ? (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={rotation.data}>
              <CartesianGrid {...baseGrid} />
              <XAxis dataKey="date" stroke="#8ea0b4" />
              <YAxis stroke="#8ea0b4" reversed domain={[1, rotation.lines.length]} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} />
              <Legend />
              {rotation.lines.map((line) => (
                <Line key={line.id} type="monotone" dataKey={line.id} name={line.name} stroke={line.color} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted-note">
            {historyStatus === "loading" ? "加载中…" : `数据积累中（当前 ${distinctDays} 个交易日），排名走势暂不具参考意义`}
          </p>
        )}
      </div>

      <p className="mock-note">异动雷达基于当日实时行情与 Supabase 历史快照自动计算，不构成任何投资建议；历史区间随每日快照增加而延长。</p>
    </section>
  );
}
