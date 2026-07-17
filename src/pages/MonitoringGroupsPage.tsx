import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Flame, ListFilter, RefreshCw, Save, Settings2, Star } from "lucide-react";
import { StockQuickDrawer } from "../components/monitoring/StockQuickDrawer";
import { StockStatusBadge } from "../components/monitoring/StockStatusBadge";
import { useLiveStocks } from "../hooks/useLiveStocks";
import { calculateDollarVolume, calculateVolumeHeat, signed } from "../services/calculations";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";
import { watchbookSnapshotStorage } from "../services/watchbookSnapshotStorage";
import type { StockQuoteMock, ThemeGroupSummary } from "../types/themeGroup";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

type ObservationTier = "必须关注" | "持续观察" | "暂时降温";
type SortKey = "symbol" | "changePct" | "dollarVolume" | "heat" | "rank";
type SortDirection = "asc" | "desc";

function tierFor(summary: ThemeGroupSummary): ObservationTier {
  const heat = summary.dollarVolume / Math.max(summary.previousDollarVolume, 1);
  if ((summary.averageChangePct >= 1 && heat >= 1.05) || heat >= 1.2 || (summary.concentration >= 28 && summary.averageChangePct > 0)) return "必须关注";
  if (summary.averageChangePct >= 0 || heat >= 0.95) return "持续观察";
  return "暂时降温";
}

function reasonFor(summary: ThemeGroupSummary, tier: ObservationTier) {
  const heat = summary.dollarVolume / Math.max(summary.previousDollarVolume, 1);
  if (tier === "必须关注") return heat >= 1.2 ? "成交显著放大，资金活跃" : summary.averageChangePct >= 1 ? "板块上涨且量能配合" : "资金集中度抬升";
  if (tier === "持续观察") return heat >= 0.95 ? "量能平稳，等待方向确认" : "趋势尚好，等待量能确认";
  return "热度回落，短期观望";
}

function tierForStock(stock: StockQuoteMock): ObservationTier {
  const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
  const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
  const heat = dollarVolume / Math.max(previousDollarVolume, 1);
  if ((stock.changePct >= 1 && heat >= 1.05) || heat >= 1.2) return "必须关注";
  if (stock.changePct >= 0 || heat >= 0.95) return "持续观察";
  return "暂时降温";
}

function reasonForStock(stock: StockQuoteMock, tier: ObservationTier) {
  const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
  const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
  const heat = dollarVolume / Math.max(previousDollarVolume, 1);
  if (tier === "必须关注") return heat >= 1.2 ? "成交显著放大，资金活跃" : "个股上涨且量能配合";
  if (tier === "持续观察") return heat >= 0.95 ? "量能平稳，等待方向确认" : "趋势尚好，等待量能确认";
  return "热度回落，短期观望";
}

function signalScore(summary: ThemeGroupSummary) {
  const heat = summary.dollarVolume / Math.max(summary.previousDollarVolume, 1);
  const top50Share = summary.top50Count / Math.max(summary.stocks.length, 1);
  return summary.averageChangePct * 35 + (heat - 1) * 60 + top50Share * 20 + summary.concentration * 0.2;
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replace(/\//g, "-");
}

function formatDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(date).replace(/\//g, "-").replace("周", " 周");
}

export function MonitoringGroupsPage() {
  const { stocks, source, updatedAt, ready, loading, error, refresh } = useLiveStocks();
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const top50Symbols = useMemo(() => new Set(top50.currentTop50.map((entry) => entry.symbol)), [top50.currentTop50]);
  const summaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockQuoteMock>();
  const [focusOnly, setFocusOnly] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: "changePct", direction: "desc" });
  const [savedAt, setSavedAt] = useState("尚未保存");
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(window.localStorage.getItem("china-a-share-watchbook-notes-v1") || "{}"); } catch { return {}; }
  });
  const [snapshotRevision, setSnapshotRevision] = useState(0);

  const selected = summaries.find((summary) => summary.group.id === selectedId) || summaries[0];
  const topRowsBySymbol = useMemo(() => new Map(top50.rows.map((row) => [row.symbol, row])), [top50.rows]);
  const observations = useMemo(() => summaries.map((summary) => {
    const tier = tierFor(summary);
    const stock = summary.leader;
    const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
    const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
    return { summary, stock, tier, reason: reasonFor(summary, tier), heat: calculateVolumeHeat(dollarVolume, previousDollarVolume), topRow: topRowsBySymbol.get(stock.symbol) };
  }), [summaries, topRowsBySymbol]);
  const previousStocks = useMemo(() => stocks.map((stock) => ({
    ...stock,
    volume: stock.previousVolume,
    dollarVolume: stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume),
    changePct: stock.previousChangePct,
  })), [stocks]);
  const previousTop50Symbols = useMemo(() => new Set(topVolumeService.getCurrentTop50(previousStocks).map((entry) => entry.symbol)), [previousStocks]);
  const previousSummaries = useMemo(() => marketDataService.getThemeGroupSummaries(previousTop50Symbols, previousStocks), [previousTop50Symbols, previousStocks]);
  const scopedObservations = useMemo(() => {
    if (!selectedId) return observations;
    const summary = summaries.find((item) => item.group.id === selectedId);
    if (!summary) return observations;
    return summary.stocks.map((stock) => {
      const tier = tierForStock(stock);
      const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
      const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
      return { summary, stock, tier, reason: reasonForStock(stock, tier), heat: calculateVolumeHeat(dollarVolume, previousDollarVolume), topRow: topRowsBySymbol.get(stock.symbol) };
    });
  }, [observations, selectedId, summaries, topRowsBySymbol]);
  const visibleObservations = focusOnly ? scopedObservations.filter((item) => item.tier === "必须关注") : scopedObservations;
  const strongest = [...observations].sort((a, b) => signalScore(b.summary) - signalScore(a.summary))[0];
  const tierCounts = (tier: ObservationTier) => observations.filter((item) => item.tier === tier).length;
  const previousTierCounts = (tier: ObservationTier) => previousSummaries.filter((summary) => tierFor(summary) === tier).length;
  const tierDelta = (tier: ObservationTier) => tierCounts(tier) - previousTierCounts(tier);

  useEffect(() => {
    if (!observations.length || !source.includes("Yahoo")) return;
    watchbookSnapshotStorage.save({
      date: formatDate(),
      updatedAt,
      rows: observations.map((item) => ({ groupId: item.summary.group.id, tier: item.tier, averageChangePct: item.summary.averageChangePct })),
    });
    setSnapshotRevision((value) => value + 1);
  }, [observations, source, updatedAt]);

  if (!selected || !strongest) return <section className="watchbook-page"><p className="muted-note">正在准备自选监控数据…</p></section>;

  function saveWatchbook() {
    window.localStorage.setItem("china-a-share-watchbook-notes-v1", JSON.stringify(notes));
    setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }));
  }

  const selectedHistory = useMemo(() => watchbookSnapshotStorage.getGroupHistory(selected.group.id, 5), [selected.group.id, snapshotRevision]);
  const dataStatus = loading ? "行情更新中" : error ? `${source} · ${error}` : `${source} · 已更新`;

  function toggleSort(key: SortKey) {
    setSortConfig((current) => current.key === key
      ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
      : { key, direction: key === "symbol" || key === "rank" ? "asc" : "desc" });
  }

  function sortHeader(label: string, key: SortKey) {
    const active = sortConfig.key === key;
    return <button type="button" className={active ? "active" : ""} onClick={() => toggleSort(key)} aria-label={`${label}，点击排序`}>{label}{active ? sortConfig.direction === "desc" ? <ArrowDown size={13} /> : <ArrowUp size={13} /> : null}</button>;
  }

  return (
    <section className="watchbook-page">
      <header className="watchbook-heading">
        <div><p>机会雷达 / 自选监控</p><h1>晨间观察册 <span>册</span></h1></div>
        <div><strong>{formatDateLabel()}（今日）</strong><small>更新 {updatedAt}</small></div>
      </header>

      <div className="watchbook-summary-strip">
        <div><Star size={22} /><span>数据总览<small>{ready ? dataStatus : "数据加载中"}</small></span></div>
        <div><span>必须关注</span><strong>{tierCounts("必须关注")}</strong><small>较昨日 <b className={tierDelta("必须关注") >= 0 ? "positive" : "negative"}>{signed(tierDelta("必须关注"), 0)}</b></small></div>
        <div><span>持续观察</span><strong>{tierCounts("持续观察")}</strong><small>较昨日 <b className={tierDelta("持续观察") >= 0 ? "positive" : "negative"}>{signed(tierDelta("持续观察"), 0)}</b></small></div>
        <div><span>暂时降温</span><strong>{tierCounts("暂时降温")}</strong><small>较昨日 <b className={tierDelta("暂时降温") <= 0 ? "positive" : "negative"}>{signed(tierDelta("暂时降温"), 0)}</b></small></div>
        <div className="watchbook-strongest"><Flame size={24} /><span>最强信号<strong>{strongest.stock.symbol}</strong><small>{strongest.summary.group.name}</small></span><b className="positive">{formatSignedPct(strongest.stock.changePct)}</b></div>
      </div>

      <div className="watchbook-layout">
        <aside className="watchbook-group-index">
          <div className="watchbook-panel-head"><h2>自选监控组</h2><button aria-label="刷新" disabled={loading} onClick={() => void refresh(true)}><RefreshCw size={15} /></button></div>
          <button className={!selectedId ? "active" : ""} onClick={() => setSelectedId("")}><span>全部观察</span><b>{summaries.length}</b></button>
          {summaries.map((summary) => <button key={summary.group.id} className={selectedId === summary.group.id ? "active" : ""} onClick={() => setSelectedId(summary.group.id)}><span>{summary.group.name}</span><b>{summary.stocks.length}</b></button>)}
          <button className="watchbook-new-group">＋ 新建分组</button>
          <div className="watchbook-index-actions"><button><Settings2 size={14} /> 管理</button><button disabled={loading} onClick={() => void refresh(true)}><RefreshCw size={14} /> {loading ? "更新中" : "刷新"}</button></div>
        </aside>

        <main className="watchbook-center">
          <div className="watchbook-panel-head"><div><h2>今日观察清单</h2><small>点击带箭头的表头即可排序</small></div><button onClick={() => setSortConfig({ key: "changePct", direction: "desc" })}><ListFilter size={15} /> 恢复默认排序</button></div>
          {(["必须关注", "持续观察", "暂时降温"] as ObservationTier[]).map((tier) => {
            const rows = visibleObservations.filter((item) => item.tier === tier);
            if (!rows.length) return null;
            const sortedRows = [...rows].sort((a, b) => {
              if (sortConfig.key === "symbol") {
                const value = a.stock.symbol.localeCompare(b.stock.symbol);
                return sortConfig.direction === "asc" ? value : -value;
              }
              if (sortConfig.key === "rank") {
                const aRank = a.topRow?.currentRank;
                const bRank = b.topRow?.currentRank;
                if (aRank == null && bRank != null) return 1;
                if (aRank != null && bRank == null) return -1;
                const value = (aRank || 0) - (bRank || 0);
                return sortConfig.direction === "asc" ? value : -value;
              }
              const aValue = sortConfig.key === "changePct" ? a.stock.changePct : sortConfig.key === "dollarVolume" ? (a.stock.dollarVolume ?? calculateDollarVolume(a.stock.price, a.stock.volume)) : a.heat.ratio;
              const bValue = sortConfig.key === "changePct" ? b.stock.changePct : sortConfig.key === "dollarVolume" ? (b.stock.dollarVolume ?? calculateDollarVolume(b.stock.price, b.stock.volume)) : b.heat.ratio;
              const value = aValue - bValue;
              return sortConfig.direction === "asc" ? value : -value;
            });
            return <section className={`watchbook-tier tier-${tier}`} key={tier}>
              <header><i /><h3>{tier}（{rows.length}）</h3><span>{tier === "必须关注" ? "信号最强，短线资金活跃" : tier === "持续观察" ? "趋势尚好，等待确认" : "热度回落，短期观望"}</span></header>
              <div className="watchbook-table-head"><span>{sortHeader("标的", "symbol")}</span><span>关注理由</span><span>{sortHeader("今日 / 昨日涨跌", "changePct")}</span><span>{sortHeader("成交额", "dollarVolume")}</span><span>{sortHeader("热度比例", "heat")}</span><span>{sortHeader("自选池排名", "rank")}</span><span>状态</span></div>
              {sortedRows.map(({ summary, stock, reason, heat, topRow }) => <div className="watchbook-row" role="button" tabIndex={0} key={`${summary.group.id}-${stock.symbol}`} onClick={() => { setSelectedId(summary.group.id); setSelectedStock(stock); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setSelectedId(summary.group.id); setSelectedStock(stock); } }}>
                <span className="watchbook-target"><Star size={14} /><b>{stock.symbol}</b><small>{stock.companyName}</small></span>
                <span>{reason}</span>
                <span><b className={stock.changePct >= 0 ? "positive" : "negative"}>{formatSignedPct(stock.changePct)}</b><small className={stock.previousChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(stock.previousChangePct)}</small></span>
                <span><b>{formatCompactMoney(stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume))}</b><small>个股口径</small></span>
                <span className={heat.ratio >= 1 ? "positive" : "negative"}>{heat.ratio.toFixed(2)}x</span>
                <span>{topRow?.currentRank ? `#${topRow.currentRank}` : "—"}<small className={(topRow?.rankChange || 0) >= 0 ? "positive" : "negative"}>{topRow?.rankChange ? signed(topRow.rankChange, 0) : "—"}</small></span>
                <span><StockStatusBadge stock={stock} top50Rank={topRow?.currentRank} /></span>
              </div>)}
            </section>;
          })}
          <footer className="watchbook-savebar"><button onClick={saveWatchbook}><Save size={16} /> 保存今日观察</button><span>上次保存：{savedAt}</span></footer>
        </main>

        <aside className="watchbook-dossier">
          <div className="watchbook-dossier-title"><span>{selected.group.name}</span><small>{selected.leader.symbol}</small><b className="positive">{formatSignedPct(selected.averageChangePct)}</b></div>
          <div className="watchbook-dossier-value">{formatCompactMoney(selected.dollarVolume)}</div>
          <div className="watchbook-dossier-metrics"><div><span>成交额</span><b>{formatCompactMoney(selected.dollarVolume)}</b></div><div><span>热度比例</span><b>{(selected.dollarVolume / selected.previousDollarVolume).toFixed(2)}x</b></div><div><span>Top50 入选</span><b>{selected.top50Count} / {selected.stocks.length}</b></div></div>
          <section><h3>强弱领跑</h3><p><span className="tag red">领涨</span><b>{selected.leader.symbol}</b>{selected.leader.companyName}<em className="positive">{formatSignedPct(selected.leader.changePct)}</em></p><p><span className="tag green">领跌</span><b>{selected.laggard.symbol}</b>{selected.laggard.companyName}<em className="negative">{formatSignedPct(selected.laggard.changePct)}</em></p></section>
          <section><h3>异动解读</h3><p>{reasonFor(selected, tierFor(selected))}。当前板块热度为 {(selected.dollarVolume / Math.max(selected.previousDollarVolume, 1)).toFixed(2)}x，集中度 {selected.concentration.toFixed(1)}%。</p></section>
          <section><div className="watchbook-note-title"><h3>观察笔记</h3><button>＋ 新建笔记</button></div>{notes[selected.group.id] ? <p className="watchbook-history">{notes[selected.group.id]}<small>— 本地保存</small></p> : <p className="watchbook-history">暂无观察笔记</p>}</section>
          <section><h3>历史记录（近5日）</h3>{selectedHistory.length ? <ul className="watchbook-history-list">{selectedHistory.map((item) => <li key={item.date}>{item.date.slice(5)} <span>{item.tier}</span><b className={item.averageChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(item.averageChangePct)}</b></li>)}</ul> : <p className="watchbook-history">今天开始积累每日快照。</p>}</section>
          <button className="watchbook-detail" onClick={() => setSelectedStock(selected.leader)}>查看详细分析 <ChevronRight size={15} /></button>
        </aside>
      </div>

      <div className="watchbook-footer-tools"><label><input type="checkbox" checked={focusOnly} onChange={(event) => setFocusOnly(event.target.checked)} /> 仅看重点</label><button><Settings2 size={14} /> 自定义列</button><button>批量管理</button></div>
      <p className="mock-note">{source}；每 5 分钟自动更新，单只股票缺失时不参与计算，整体更新失败时保留最近可用数据。本页仅供观察与研究，不构成投资建议。</p>
      <StockQuickDrawer stock={selectedStock} topRow={selectedStock ? topRowsBySymbol.get(selectedStock.symbol) : undefined} groupSummary={selectedStock ? selected : undefined} onClose={() => setSelectedStock(undefined)} />
    </section>
  );
}
