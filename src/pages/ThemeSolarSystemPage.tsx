import { useMemo, useState } from "react";
import { SolarSystemCanvas } from "../components/solar-system/SolarSystemCanvas";
import { Top50Table } from "../components/top50/Top50Table";
import { RankMigrationChart } from "../components/top50/RankMigrationChart";
import { ChangeSummaryPanel } from "../components/top50/ChangeSummaryPanel";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";
import { useLiveStocks } from "../hooks/useLiveStocks";

export function ThemeSolarSystemPage() {
  const { stocks, source, updatedAt, ready, loading, error } = useLiveStocks();
  const quoteStatus = loading ? "成交金额更新中" : error ? `${source} · ${error}` : ready ? `${source} 成交金额已更新` : "成交金额加载中";
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const top50Symbols = useMemo(() => new Set(top50.currentTop50.map((entry) => entry.symbol)), [top50.currentTop50]);
  const summaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);

  return (
    <section className="v2-page solar-page">
      <div className="solar-layout">
        <SolarSystemCanvas summaries={summaries} updatedAt={updatedAt} quoteStatus={quoteStatus} />
      </div>
      <p className="mock-note">{source}；缺失行情不参与主题排序。本页仅供观察与研究。</p>
    </section>
  );
}

export function ThemeTop50Page() {
  const { stocks, source, updatedAt, error } = useLiveStocks();
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const comparisonBySymbol = useMemo(() => new Map(top50.rows.map((row) => [row.symbol, row])), [top50.rows]);
  const [activeSymbol, setActiveSymbol] = useState<string>();

  return (
    <section className="v2-page theme-top50-page">
      <div className="top50-area">
        <div className="top50-main v2-card">
          <div className="v2-card-head">
            <div>
              <h2>自选池成交额 Top 50</h2>
              <small>当前自选股票池按人民币成交额排序；不是全 A 股市场排名，也不代表系统买入优先级。{source} · 更新 {updatedAt}{error ? ` · ${error}` : ""}</small>
            </div>
          </div>
          <div className="migration-layout">
            <Top50Table title="昨日自选池" rows={top50.previousTop50} side="previous" comparisonBySymbol={comparisonBySymbol} activeSymbol={activeSymbol} onHover={setActiveSymbol} showAll />
            <RankMigrationChart rows={top50.rows} activeSymbol={activeSymbol} onHover={setActiveSymbol} showAll />
            <Top50Table title="今日自选池" rows={top50.currentTop50} side="current" comparisonBySymbol={comparisonBySymbol} activeSymbol={activeSymbol} onHover={setActiveSymbol} showAll />
          </div>
        </div>
        <ChangeSummaryPanel summary={top50.summary} />
      </div>
      <p className="mock-note">本页只用于核对自选池股票的延迟成交额和排名变化，不代表全市场榜单。</p>
    </section>
  );
}
