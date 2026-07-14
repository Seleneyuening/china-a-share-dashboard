import { useMemo, useState } from "react";
import { Cpu, RefreshCw, Settings } from "lucide-react";
import { GroupSidebar } from "../components/monitoring/GroupSidebar";
import { GroupStockTable } from "../components/monitoring/GroupStockTable";
import { GroupSummaryPanel } from "../components/monitoring/GroupSummaryPanel";
import { StockQuickDrawer } from "../components/monitoring/StockQuickDrawer";
import { mockThemeSnapshotMeta } from "../data/mockThemeSnapshots";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";
import { useLiveStocks } from "../hooks/useLiveStocks";
import type { StockQuoteMock } from "../types/themeGroup";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

export function MonitoringGroupsPage() {
  const { stocks, source, ready, refresh } = useLiveStocks();
  const liveStatus = ready ? `${source} 成交金额` : "成交金额加载中";
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const { currentTop50, rows } = top50;
  const top50Symbols = useMemo(() => new Set(currentTop50.map((entry) => entry.symbol)), [currentTop50]);
  const summaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);
  const [selectedId, setSelectedId] = useState<string>(summaries[0].group.id);
  const [selectedStock, setSelectedStock] = useState<StockQuoteMock>();
  const selected = summaries.find((summary) => summary.group.id === selectedId) || summaries[0];
  const topRowsBySymbol = new Map(rows.map((row) => [row.symbol, row]));

  return (
    <section className="v2-page monitoring-page">
      <div className="v2-hero compact">
        <div>
          <h1>监控组</h1>
          <p>按自定义主题监控核心股票实时表现</p>
        </div>
        <div className="v2-toolbar">
          <span className="live-dot" /> A 股模拟盘
          <span>{mockThemeSnapshotMeta.updatedAt}</span>
          <span>{liveStatus}</span>
          <button className="icon-button" aria-label="刷新" onClick={() => refresh(true)}><RefreshCw size={16} /></button>
          <button className="status">组管理</button>
          <button className="icon-button" aria-label="设置"><Settings size={16} /></button>
        </div>
      </div>

      <div className="monitoring-grid">
        <GroupSidebar summaries={summaries} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="monitoring-main">
          <div className="v2-card selected-group-head">
            <div className="group-mark"><Cpu size={24} /></div>
            <h2>{selected.group.name}</h2>
            <div><b>{selected.stocks.length}</b><small>组内数量</small></div>
            <div><b>{formatCompactMoney(selected.dollarVolume)}</b><small>今日成交金额</small></div>
            <div><b className={selected.averageChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(selected.averageChangePct)}</b><small>平均涨跌幅</small></div>
            <div><b>{selected.top50Count} / {selected.stocks.length}</b><small>Top 50 入选</small></div>
          </div>
          <GroupStockTable stocks={selected.stocks} topRowsBySymbol={topRowsBySymbol} onSelect={setSelectedStock} />
        </div>
        <GroupSummaryPanel summary={selected} />
      </div>
      <p className="mock-note">本页使用本地 A 股模拟数据，不接入真实行情或线上密钥。</p>
      <StockQuickDrawer
        stock={selectedStock}
        topRow={selectedStock ? topRowsBySymbol.get(selectedStock.symbol) : undefined}
        groupSummary={selectedStock ? selected : undefined}
        onClose={() => setSelectedStock(undefined)}
      />
    </section>
  );
}
