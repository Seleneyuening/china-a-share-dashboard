import { useEffect, useMemo, useState } from "react";
import { Bot, ChevronLeft, ChevronRight, Download, Flame, Rocket, Satellite, Send, Share2, Star, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";
import { snapshotHistoryService } from "../services/snapshotHistoryService";
import { useLiveStocks } from "../hooks/useLiveStocks";
import { useSatelliteStocks } from "../hooks/useSatelliteStocks";
import { buildGroupRotationSeries, classifyAnomalies } from "../services/snapshotAnalyticsService";
import { buildDailyBrief } from "../services/dailyBriefService";
import { answerJournalQuestion, buildDailyJournalEntry, buildThemePersistenceScores, buildWatchFollowUp } from "../services/marketJournalService";
import { journalStorage } from "../services/journalStorage";
import { watchObservationStorage } from "../services/watchObservationStorage";
import { alertStorage } from "../services/alertStorage";
import type { DailySnapshotRow } from "../types/snapshotHistory";
import type { WatchObservation } from "../types/marketJournal";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

const scoreWindows = [5, 10, 20, 60] as const;
type ScoreWindow = typeof scoreWindows[number];
type WatchTab = "active" | "ended" | "today";

const sampleQuestions = ["过去 5 天哪个主题最强？", "AI 组的资金集中度是不是太高？"];

const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function weekdayLabel(date: string): string {
  return weekdayNames[new Date(date).getDay()];
}

function scoreTone(score: number): "green" | "yellow" | "red" {
  if (score >= 70) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

function RankSparkline({ ranks }: { ranks: (number | null)[] }) {
  const known = ranks.filter((rank): rank is number => rank !== null);
  if (known.length < 2) return <span className="muted-note">数据不足</span>;
  const maxRank = Math.max(...known, 2);
  const data = ranks.map((rank, index) => ({ index, rank: rank ?? undefined }));
  return (
    <ResponsiveContainer width={110} height={32}>
      <LineChart data={data}>
        <YAxis hide reversed domain={[1, maxRank]} />
        <Line type="monotone" dataKey="rank" stroke="#f487a3" strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MarketJournalPage() {
  const { stocks, source, ready } = useLiveStocks();
  const satellites = useSatelliteStocks();
  const [history, setHistory] = useState<DailySnapshotRow[]>([]);
  const [entries, setEntries] = useState(() => journalStorage.getEntries());
  const [observations, setObservations] = useState<WatchObservation[]>(() => watchObservationStorage.getAll());
  const [watchTab, setWatchTab] = useState<WatchTab>("active");
  const [scoreWindow, setScoreWindow] = useState<ScoreWindow>(5);
  const [selectedDate, setSelectedDate] = useState<string>();
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addPickerSymbol, setAddPickerSymbol] = useState("");
  const [question, setQuestion] = useState("");
  const [qaLog, setQaLog] = useState<{ question: string; answer: string }[]>([]);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    const symbols = marketDataService.getStockQuotes().map((stock) => stock.symbol);
    snapshotHistoryService.getSymbolHistory(symbols, 60).then(setHistory).catch(() => {});
  }, []);

  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const top50Symbols = useMemo(() => new Set(top50.currentTop50.map((entry) => entry.symbol)), [top50.currentTop50]);
  const groupSummaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);
  const groups = useMemo(() => marketDataService.getWatchlistGroups(), []);
  const anomalyRows = useMemo(() => classifyAnomalies(stocks, top50.rows, groups), [stocks, top50.rows, groups]);
  const rotation = useMemo(() => buildGroupRotationSeries(history, groups), [history, groups]);
  const brief = useMemo(
    () => buildDailyBrief(groupSummaries, anomalyRows, rotation, satellites, top50.summary),
    [groupSummaries, anomalyRows, rotation, satellites, top50.summary],
  );
  const groupScores = useMemo(() => buildThemePersistenceScores(history, groups, scoreWindow), [history, groups, scoreWindow]);
  const groupScores5d = useMemo(() => buildThemePersistenceScores(history, groups, 5), [history, groups]);

  useEffect(() => {
    if (!ready || !brief.topGroup) return;
    setEntries((current) => {
      const existing = current.find((entry) => entry.date === todayKey);
      const entry = buildDailyJournalEntry(todayKey, brief, alertStorage.getActiveRuleIds().length, existing?.note ?? "");
      if (existing && existing.summaryLines.join("|") === entry.summaryLines.join("|")) return current;
      journalStorage.upsertEntry(entry);
      return journalStorage.getEntries();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, brief, todayKey]);

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const activeDate = selectedDate ?? sortedEntries[0]?.date ?? todayKey;
  const activeEntry = sortedEntries.find((entry) => entry.date === activeDate);
  const activeIndex = sortedEntries.findIndex((entry) => entry.date === activeDate);

  const topStreak = useMemo(() => {
    if (!brief.topGroup) return 0;
    const score = groupScores5d.find((item) => item.groupName === brief.topGroup!.name);
    if (!score) return 0;
    let streak = 0;
    for (let i = score.rankSeries.length - 1; i >= 0; i -= 1) {
      if (score.rankSeries[i] === 1) streak += 1;
      else break;
    }
    return streak;
  }, [brief.topGroup, groupScores5d]);

  const watchList = useMemo(() => {
    if (watchTab === "today") return observations.filter((item) => item.startDate === todayKey);
    return observations.filter((item) => item.status === watchTab);
  }, [observations, watchTab, todayKey]);

  const pickerCandidates = useMemo(() => top50.currentTop50.slice(0, 30), [top50.currentTop50]);

  function goToPreviousDay() {
    if (activeIndex < sortedEntries.length - 1) setSelectedDate(sortedEntries[activeIndex + 1].date);
  }

  function goToNextDay() {
    if (activeIndex > 0) setSelectedDate(sortedEntries[activeIndex - 1].date);
  }

  function addObservation(symbol: string) {
    const stock = stocks.find((item) => item.symbol === symbol);
    if (!stock) return;
    const row = top50.rows.find((item) => item.symbol === symbol);
    const summary = groupSummaries.find((item) => item.stocks.some((s) => s.symbol === symbol));
    const observation: WatchObservation = {
      id: `${symbol}-${Date.now()}`,
      symbol,
      companyName: stock.companyName,
      startDate: todayKey,
      startRank: row?.currentRank,
      startChangePct: stock.changePct,
      startDollarVolume: stock.dollarVolume,
      groupName: summary?.group.name,
      note: "",
      status: "active",
    };
    watchObservationStorage.add(observation);
    setObservations(watchObservationStorage.getAll());
    setShowAddPicker(false);
    setAddPickerSymbol("");
  }

  function endObservation(id: string) {
    watchObservationStorage.end(id);
    setObservations(watchObservationStorage.getAll());
  }

  function saveNote(date: string) {
    const note = noteDrafts[date];
    if (note === undefined) return;
    journalStorage.updateNote(date, note);
    setEntries(journalStorage.getEntries());
  }

  function askQuestion(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const answer = answerJournalQuestion(trimmed, { entries, groupScores, groupSummaries });
    setQaLog((current) => [...current, { question: trimmed, answer }]);
    setQuestion("");
  }

  function exportBrief() {
    if (!activeEntry) return;
    const text = [`# 市场日志 ${activeEntry.date}`, "", ...activeEntry.summaryLines, "", activeEntry.note ? `备注：${activeEntry.note}` : ""].join("\n");
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `market-journal-${activeEntry.date}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function shareBrief() {
    if (!activeEntry) return;
    const text = [`市场日志 ${activeEntry.date}`, ...activeEntry.summaryLines].join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  return (
    <section className="v2-page market-journal-page">
      <div className="v2-hero compact">
        <div>
          <h1>市场日志</h1>
          <p>记录每天的资金流、主题轮动和你关注过的股票 · {ready ? `数据源 ${source}` : "加载中"}</p>
        </div>
        <div className="v2-toolbar">
          <button className="icon-button" aria-label="前一天" onClick={goToPreviousDay} disabled={activeIndex >= sortedEntries.length - 1}><ChevronLeft size={16} /></button>
          <span>{activeDate}{activeDate === todayKey ? "（今日）" : ""}</span>
          <button className="icon-button" aria-label="后一天" onClick={goToNextDay} disabled={activeIndex <= 0}><ChevronRight size={16} /></button>
          <button className="ghost-button" onClick={exportBrief}><Download size={14} /> 导出简报</button>
          <button className="ghost-button" onClick={shareBrief}><Share2 size={14} /> 分享简报</button>
        </div>
      </div>

      <div className="journal-hero-grid">
        <div className="journal-hero-card">
          <span className="journal-hero-icon theme"><Flame size={16} /></span>
          <small>最强主题</small>
          {brief.topGroup ? (
            <>
              <strong>{brief.topGroup.name}</strong>
              <span>{formatCompactMoney(brief.topGroup.dollarVolume)}</span>
              {topStreak > 1 && <em>连续第 {topStreak} 天排名第 1</em>}
            </>
          ) : <span className="muted-note">加载中</span>}
        </div>
        <div className="journal-hero-card">
          <span className="journal-hero-icon mover"><Rocket size={16} /></span>
          <small>最强异动股票</small>
          {brief.topMovers[0] ? (
            <>
              <strong>{brief.topMovers[0].symbol}</strong>
              <span className={(brief.topMovers[0].changePct ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedPct(brief.topMovers[0].changePct ?? 0)}</span>
              {brief.topMovers[0].heatRatio && <em>成交热度 {brief.topMovers[0].heatRatio.toFixed(2)}x</em>}
            </>
          ) : <span className="muted-note">今日暂无明显异动</span>}
        </div>
        <div className="journal-hero-card">
          <span className="journal-hero-icon new"><Star size={16} /></span>
          <small>新进 Top 50</small>
          {brief.newTop50Highlight ? (
            <>
              <strong>{brief.newTop50Highlight.symbol} <span className="tag green">NEW</span></strong>
              <span>排名 #{brief.newTop50Highlight.rank}</span>
              <em>成交金额 {formatCompactMoney(brief.newTop50Highlight.dollarVolume)}</em>
            </>
          ) : <span className="muted-note">今日没有新进股票</span>}
        </div>
        <div className="journal-hero-card">
          <span className="journal-hero-icon rank"><TrendingUp size={16} /></span>
          <small>最大排名上升</small>
          {brief.biggestRankUpStock ? (
            <>
              <strong>{brief.biggestRankUpStock.symbol}</strong>
              <span>#{brief.biggestRankUpStock.fromRank} → #{brief.biggestRankUpStock.toRank}</span>
              <em>上升 {brief.biggestRankUpStock.fromRank - brief.biggestRankUpStock.toRank} 位</em>
            </>
          ) : <span className="muted-note">今日排名变化不大</span>}
        </div>
        <div className="journal-hero-card">
          <span className="journal-hero-icon satellite"><Satellite size={16} /></span>
          <small>市场卫星</small>
          {brief.satellites.slice(0, 2).map((sat) => (
            <span key={sat.symbol} className={sat.changePct >= 0 ? "positive" : "negative"}>{sat.symbol} {formatSignedPct(sat.changePct)}</span>
          ))}
          <em>{brief.satelliteNote}</em>
        </div>
      </div>

      <div className="journal-grid">
        <div className="journal-main">
          <div className="v2-card">
            <div className="v2-card-head"><h2>市场日志时间线</h2></div>
            {sortedEntries.length ? (
              <ul className="journal-timeline">
                {sortedEntries.slice(0, 20).map((entry) => {
                  const isExpanded = activeDate === entry.date;
                  return (
                    <li key={entry.date} className="journal-entry">
                      <button className="journal-entry-head" onClick={() => setSelectedDate(isExpanded ? undefined : entry.date)}>
                        <span className="journal-date">{entry.date} {weekdayLabel(entry.date)}</span>
                        <span>{entry.topGroupName || "—"}</span>
                        <span>{entry.topGroupDollarVolume ? formatCompactMoney(entry.topGroupDollarVolume) : "—"}</span>
                        <span>新进 {entry.newTop50.length} 只</span>
                        <span className={(entry.strongestMoverChangePct ?? 0) >= 0 ? "positive" : "negative"}>
                          {entry.strongestMoverSymbol ? `${entry.strongestMoverSymbol} ${formatSignedPct(entry.strongestMoverChangePct ?? 0)}` : "—"}
                        </span>
                        <ChevronRight size={16} className={isExpanded ? "rotated" : ""} />
                      </button>
                      {isExpanded && (
                        <div className="journal-entry-detail">
                          <ul>
                            {entry.summaryLines.map((line, index) => <li key={index}>{line}</li>)}
                            {entry.weakGroupName && <li>最弱主题：{entry.weakGroupName}</li>}
                            {entry.outTop50.length > 0 && <li>退出 Top 50：{entry.outTop50.join("、")}</li>}
                          </ul>
                          <textarea
                            placeholder="写下你的观察备注…"
                            value={noteDrafts[entry.date] ?? entry.note}
                            onChange={(event) => setNoteDrafts((current) => ({ ...current, [entry.date]: event.target.value }))}
                          />
                          <button className="ghost-button" onClick={() => saveNote(entry.date)}>保存今日复盘</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="muted-note">市场日志正在生成，请稍候刷新。</p>}
          </div>

          <div className="v2-card">
            <div className="v2-card-head">
              <h2>主题持续性排行</h2>
              <div className="segmented">
                {scoreWindows.map((window) => (
                  <button key={window} className={scoreWindow === window ? "active" : ""} onClick={() => setScoreWindow(window)}>{window} 天</button>
                ))}
              </div>
            </div>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>主题组</th>
                  <th>{scoreWindow} 日排名趋势</th>
                  <th>成交金额趋势</th>
                  <th>Top 50 入选数</th>
                  <th>持续性评分</th>
                </tr>
              </thead>
              <tbody>
                {groupScores.map((score, index) => {
                  const firstVolume = score.dollarVolumeSeries.find((value) => value > 0);
                  const lastVolume = [...score.dollarVolumeSeries].reverse().find((value) => value > 0);
                  const volumeTrendPct = firstVolume && lastVolume ? ((lastVolume - firstVolume) / firstVolume) * 100 : undefined;
                  return (
                    <tr key={score.groupId}>
                      <td><b>{index + 1}</b> {score.groupName}</td>
                      <td><RankSparkline ranks={score.rankSeries} /></td>
                      <td className={volumeTrendPct !== undefined ? (volumeTrendPct >= 0 ? "positive" : "negative") : ""}>
                        {volumeTrendPct !== undefined ? formatSignedPct(volumeTrendPct) : "—"}
                      </td>
                      <td>{score.top50CountSeries.join(" — ") || "—"}</td>
                      <td><span className={`tag ${scoreTone(score.score)}`}>{score.score}/100</span></td>
                    </tr>
                  );
                })}
                {!groupScores.length && <tr><td colSpan={5} className="muted-note">数据积累中，暂无法计算持续性评分。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="journal-sidebar">
          <div className="v2-card">
            <div className="v2-card-head">
              <h2>我的观察清单</h2>
              <button className="ghost-button" onClick={() => setShowAddPicker((value) => !value)}>+ 添加观察</button>
            </div>
            {showAddPicker && (
              <div className="watch-add-picker">
                <select value={addPickerSymbol} onChange={(event) => setAddPickerSymbol(event.target.value)}>
                  <option value="">选择股票…</option>
                  {pickerCandidates.map((entry) => <option key={entry.symbol} value={entry.symbol}>{entry.symbol} {entry.companyName}</option>)}
                </select>
                <button className="ghost-button" disabled={!addPickerSymbol} onClick={() => addObservation(addPickerSymbol)}>加入观察</button>
              </div>
            )}
            <div className="segmented watch-tabs">
              <button className={watchTab === "active" ? "active" : ""} onClick={() => setWatchTab("active")}>正在观察 ({observations.filter((o) => o.status === "active").length})</button>
              <button className={watchTab === "ended" ? "active" : ""} onClick={() => setWatchTab("ended")}>已结束 ({observations.filter((o) => o.status === "ended").length})</button>
              <button className={watchTab === "today" ? "active" : ""} onClick={() => setWatchTab("today")}>今日触发 ({observations.filter((o) => o.startDate === todayKey).length})</button>
            </div>
            <ul className="watch-list">
              {watchList.map((observation) => {
                const followUp = buildWatchFollowUp(observation, stocks, top50.rows);
                return (
                  <li key={observation.id} className="watch-row">
                    <div className="watch-row-head">
                      <b>{observation.symbol}</b>
                      <span className={followUp.currentChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(followUp.currentChangePct)}</span>
                    </div>
                    <small>{observation.startDate} 开始观察 · {observation.startRank ? `#${observation.startRank}` : "—"} → {followUp.currentRank ? `#${followUp.currentRank}` : "—"}</small>
                    <p className={followUp.tone}>{followUp.conclusion}</p>
                    {observation.status === "active" && <button className="ghost-button" onClick={() => endObservation(observation.id)}>结束观察</button>}
                  </li>
                );
              })}
              {!watchList.length && <li className="muted-note">这里暂时没有股票。</li>}
            </ul>
          </div>

          <div className="v2-card">
            <div className="v2-card-head"><h2><Bot size={16} /> AI 市场助手</h2><span className="tag">Beta</span></div>
            <p className="muted-note">基于你保存的市场日志本地规则匹配作答，暂未接入大模型。</p>
            <div className="qa-chips">
              {sampleQuestions.map((sample) => <button key={sample} className="ghost-button" onClick={() => askQuestion(sample)}>{sample}</button>)}
            </div>
            <ul className="qa-log">
              {qaLog.map((item, index) => (
                <li key={index}>
                  <span className="qa-question">{item.question}</span>
                  <span className="qa-answer">{item.answer}</span>
                </li>
              ))}
            </ul>
            <div className="qa-input">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="问问市场日志…"
                onKeyDown={(event) => event.key === "Enter" && askQuestion(question)}
              />
              <button className="icon-button" onClick={() => askQuestion(question)} aria-label="发送"><Send size={16} /></button>
            </div>
          </div>
        </div>
      </div>

      <p className="mock-note">市场日志由规则自动生成并保存在本地浏览器（localStorage），不使用大模型总结，不构成任何投资建议。</p>
    </section>
  );
}
