import { useEffect, useMemo, useState } from "react";
import { SolarSystemCanvas } from "../components/solar-system/SolarSystemCanvas";
import { Top50Table } from "../components/top50/Top50Table";
import { RankMigrationChart } from "../components/top50/RankMigrationChart";
import { ChangeSummaryPanel } from "../components/top50/ChangeSummaryPanel";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";
import { useLiveStocks } from "../hooks/useLiveStocks";

function formatEtNow() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()).replace(",", "") + " ET";
}

export function ThemeSolarSystemPage() {
  const { stocks, source, ready } = useLiveStocks();
  const quoteStatus = ready ? `${source} 成交金额已更新` : "成交金额加载中";
  const [updatedAt, setUpdatedAt] = useState(formatEtNow);
  useEffect(() => {
    if (ready) setUpdatedAt(formatEtNow());
  }, [ready, stocks]);
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const top50Symbols = useMemo(() => new Set(top50.currentTop50.map((entry) => entry.symbol)), [top50.currentTop50]);
  const summaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);

  return (
    <section className="v2-page solar-page">
      <div className="solar-layout">
        <SolarSystemCanvas summaries={summaries} updatedAt={updatedAt} quoteStatus={quoteStatus} />
      </div>
      <p className="mock-note">本页使用本地 A 股模拟数据，不接入真实行情或线上密钥。</p>
    </section>
  );
}

export function ThemeTop50Page() {
  const { stocks } = useLiveStocks();
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const comparisonBySymbol = useMemo(() => new Map(top50.rows.map((row) => [row.symbol, row])), [top50.rows]);
  const [activeSymbol, setActiveSymbol] = useState<string>();

  return (
    <section className="v2-page theme-top50-page">
      <div className="top50-area">
        <div className="top50-main v2-card">
          <div className="v2-card-head">
            <div>
              <h2>A 股模拟流动性 Top 50</h2>
              <small>固定 50 只 A 股模拟股票池，按人民币成交额排序；本榜单只描述流动性，不代表系统买入优先级。</small>
            </div>
          </div>
          <div className="migration-layout">
            <Top50Table title="昨日 Top 50" rows={top50.previousTop50} side="previous" comparisonBySymbol={comparisonBySymbol} activeSymbol={activeSymbol} onHover={setActiveSymbol} showAll />
            <RankMigrationChart rows={top50.rows} activeSymbol={activeSymbol} onHover={setActiveSymbol} showAll />
            <Top50Table title="今日 Top 50" rows={top50.currentTop50} side="current" comparisonBySymbol={comparisonBySymbol} activeSymbol={activeSymbol} onHover={setActiveSymbol} showAll />
          </div>
        </div>
        <ChangeSummaryPanel summary={top50.summary} />
      </div>
      <p className="mock-note">自主选股请查看“自主操盘”页面；本页只用于核对 50 只股票的模拟成交额和排名变化。</p>
    </section>
  );
}
