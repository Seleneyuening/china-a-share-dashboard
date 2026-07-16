import { useMemo, useState } from "react";
import { ChevronRight, Flame, ListFilter, Pencil, RefreshCw, Save, Settings2, Star } from "lucide-react";
import { StockQuickDrawer } from "../components/monitoring/StockQuickDrawer";
import { StockStatusBadge } from "../components/monitoring/StockStatusBadge";
import { mockThemeSnapshotMeta } from "../data/mockThemeSnapshots";
import { useLiveStocks } from "../hooks/useLiveStocks";
import { calculateDollarVolume, calculateVolumeHeat, signed } from "../services/calculations";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";
import type { StockQuoteMock, ThemeGroupSummary } from "../types/themeGroup";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

type ObservationTier = "必须关注" | "持续观察" | "暂时降温";

function tierFor(summary: ThemeGroupSummary): ObservationTier {
  if (summary.averageChangePct >= 1.2 || summary.concentration >= 28) return "必须关注";
  if (summary.averageChangePct >= 0) return "持续观察";
  return "暂时降温";
}

function reasonFor(summary: ThemeGroupSummary, tier: ObservationTier) {
  if (tier === "必须关注") return summary.averageChangePct >= 1.2 ? "领涨延续，资金持续流入" : "资金集中度快速抬升";
  if (tier === "持续观察") return "趋势尚好，等待量能确认";
  return "热度回落，短期观望";
}

export function MonitoringGroupsPage() {
  const { stocks, source, ready, refresh } = useLiveStocks();
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const top50Symbols = useMemo(() => new Set(top50.currentTop50.map((entry) => entry.symbol)), [top50.currentTop50]);
  const summaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);
  const [selectedId, setSelectedId] = useState<string>(() => summaries[0]?.group.id || "");
  const [selectedStock, setSelectedStock] = useState<StockQuoteMock>();
  const [focusOnly, setFocusOnly] = useState(false);
  const [savedAt, setSavedAt] = useState("尚未保存");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const selected = summaries.find((summary) => summary.group.id === selectedId) || summaries[0];
  const topRowsBySymbol = useMemo(() => new Map(top50.rows.map((row) => [row.symbol, row])), [top50.rows]);
  const observations = useMemo(() => summaries.map((summary) => {
    const tier = tierFor(summary);
    const stock = summary.leader;
    const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
    const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
    return { summary, stock, tier, reason: reasonFor(summary, tier), heat: calculateVolumeHeat(dollarVolume, previousDollarVolume), topRow: topRowsBySymbol.get(stock.symbol) };
  }), [summaries, topRowsBySymbol]);
  const visibleObservations = focusOnly ? observations.filter((item) => item.tier === "必须关注") : observations;
  const strongest = [...observations].sort((a, b) => b.stock.changePct - a.stock.changePct)[0];
  const tierCounts = (tier: ObservationTier) => observations.filter((item) => item.tier === tier).length;

  if (!selected || !strongest) return <section className="watchbook-page"><p className="muted-note">正在准备自选监控数据…</p></section>;

  function saveWatchbook() {
    setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }));
  }

  return (
    <section className="watchbook-page">
      <header className="watchbook-heading">
        <div><p>机会雷达 / 自选监控</p><h1>晨间观察册 <span>册</span></h1></div>
        <div><strong>2026-07-16（今日）</strong><small>更新 {mockThemeSnapshotMeta.updatedAt}</small></div>
      </header>

      <div className="watchbook-summary-strip">
        <div><Star size={22} /><span>视觉总览<small>{ready ? `${source} · 已更新` : "数据加载中"}</small></span></div>
        <div><span>必须关注</span><strong>{tierCounts("必须关注")}</strong><small>较昨日 <b className="positive">+1</b></small></div>
        <div><span>持续观察</span><strong>{tierCounts("持续观察")}</strong><small>较昨日 -1</small></div>
        <div><span>暂时降温</span><strong>{tierCounts("暂时降温")}</strong><small>较昨日 <b className="negative">-2</b></small></div>
        <div className="watchbook-strongest"><Flame size={24} /><span>最强信号<strong>{strongest.stock.symbol}</strong><small>{strongest.summary.group.name}</small></span><b className="positive">{formatSignedPct(strongest.stock.changePct)}</b></div>
      </div>

      <div className="watchbook-layout">
        <aside className="watchbook-group-index">
          <div className="watchbook-panel-head"><h2>自选监控组</h2><button aria-label="刷新" onClick={() => refresh(true)}><RefreshCw size={15} /></button></div>
          <button className={!selectedId ? "active" : ""} onClick={() => setSelectedId("")}><span>全部观察</span><b>{summaries.length}</b></button>
          {summaries.map((summary) => <button key={summary.group.id} className={selected.group.id === summary.group.id ? "active" : ""} onClick={() => setSelectedId(summary.group.id)}><span>{summary.group.name}</span><b>{summary.stocks.length}</b></button>)}
          <button className="watchbook-new-group">＋ 新建分组</button>
          <div className="watchbook-index-actions"><button><Settings2 size={14} /> 管理</button><button onClick={() => refresh(true)}><RefreshCw size={14} /> 刷新</button></div>
        </aside>

        <main className="watchbook-center">
          <div className="watchbook-panel-head"><div><h2>今日观察清单</h2><small>按照信号强度与量价状态自动整理</small></div><button><ListFilter size={15} /> 排序设置</button></div>
          {(["必须关注", "持续观察", "暂时降温"] as ObservationTier[]).map((tier) => {
            const rows = visibleObservations.filter((item) => item.tier === tier);
            if (!rows.length) return null;
            return <section className={`watchbook-tier tier-${tier}`} key={tier}>
              <header><i /><h3>{tier}（{rows.length}）</h3><span>{tier === "必须关注" ? "信号最强，短线资金活跃" : tier === "持续观察" ? "趋势尚好，等待确认" : "热度回落，短期观望"}</span></header>
              <div className="watchbook-table-head"><span>标的</span><span>关注理由</span><span>今日 / 昨日涨跌</span><span>成交额 / 换手率</span><span>热度比例</span><span>Top50 排名</span><span>状态</span><span>观察备注</span></div>
              {rows.map(({ summary, stock, reason, heat, topRow }) => <div className="watchbook-row" role="button" tabIndex={0} key={summary.group.id} onClick={() => { setSelectedId(summary.group.id); setSelectedStock(stock); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setSelectedId(summary.group.id); setSelectedStock(stock); } }}>
                <span className="watchbook-target"><Star size={14} /><b>{summary.group.name}</b><small>{stock.symbol} · {stock.companyName}</small></span>
                <span>{reason}</span>
                <span><b className={stock.changePct >= 0 ? "positive" : "negative"}>{formatSignedPct(stock.changePct)}</b><small className={stock.previousChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(stock.previousChangePct)}</small></span>
                <span><b>{formatCompactMoney(summary.dollarVolume)}</b><small>{(2.2 + Math.abs(stock.changePct) / 2).toFixed(2)}%</small></span>
                <span className={heat.ratio >= 1 ? "positive" : "negative"}>{heat.ratio.toFixed(2)}x</span>
                <span>{topRow?.currentRank ? `#${topRow.currentRank}` : "—"}<small className={(topRow?.rankChange || 0) >= 0 ? "positive" : "negative"}>{topRow?.rankChange ? signed(topRow.rankChange, 0) : "—"}</small></span>
                <span><StockStatusBadge stock={stock} top50Rank={topRow?.currentRank} /></span>
                <span className="watchbook-note" onClick={(event) => event.stopPropagation()}><input value={notes[summary.group.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [summary.group.id]: event.target.value }))} placeholder={tier === "必须关注" ? "关注放量延续性" : tier === "持续观察" ? "留意量能变化" : "等待资金回流"} /><Pencil size={13} /></span>
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
          <section><h3>异动解读</h3><p>核心标的成交活跃，板块资金集中度抬升。关注午后量能能否延续，以及领涨股回撤后的承接强度。</p></section>
          <section><div className="watchbook-note-title"><h3>观察笔记</h3><button>＋ 新建笔记</button></div><p className="watchbook-history"><time>09:35</time>资金净流入扩大，短线维持活跃。<small>— 分析员 A</small></p><p className="watchbook-history"><time>昨日 15:42</time>盘中回撤后快速拉升，量能配合良好。<small>— 分析员 A</small></p></section>
          <section><h3>历史记录（近5日）</h3><ul className="watchbook-history-list"><li>07-15 <span>必须关注</span><b className="positive">+3.12%</b></li><li>07-14 <span>持续观察</span><b className="positive">+1.86%</b></li><li>07-13 <span>持续观察</span><b className="positive">+0.54%</b></li><li>07-10 <span>暂时降温</span><b className="negative">-0.21%</b></li></ul></section>
          <button className="watchbook-detail" onClick={() => setSelectedStock(selected.leader)}>查看详细分析 <ChevronRight size={15} /></button>
        </aside>
      </div>

      <div className="watchbook-footer-tools"><label><input type="checkbox" checked={focusOnly} onChange={(event) => setFocusOnly(event.target.checked)} /> 仅看重点</label><button><Settings2 size={14} /> 自定义列</button><button>批量管理</button></div>
      <p className="mock-note">本页使用本地 A 股模拟数据，仅供观察与研究，不构成任何投资建议。</p>
      <StockQuickDrawer stock={selectedStock} topRow={selectedStock ? topRowsBySymbol.get(selectedStock.symbol) : undefined} groupSummary={selectedStock ? selected : undefined} onClose={() => setSelectedStock(undefined)} />
    </section>
  );
}
