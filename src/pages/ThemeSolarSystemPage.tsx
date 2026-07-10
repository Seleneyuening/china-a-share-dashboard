import { useMemo, useState } from "react";
import { SolarSystemCanvas } from "../components/solar-system/SolarSystemCanvas";
import { Top50Table } from "../components/top50/Top50Table";
import { RankMigrationChart } from "../components/top50/RankMigrationChart";
import { ChangeSummaryPanel } from "../components/top50/ChangeSummaryPanel";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";

const formatEtNow = () => "模拟盘 15:00 CST";

export function ThemeSolarSystemPage() {
  const [stocks] = useState(() => marketDataService.getStockQuotes());
  const [quoteStatus] = useState("模拟成交额");
  const [updatedAt] = useState(formatEtNow);
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const top50Symbols = useMemo(() => new Set(top50.currentTop50.map((entry) => entry.symbol)), [top50.currentTop50]);
  const summaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);

  return (
    <section className="v2-page solar-page">
      <div className="solar-layout">
        <SolarSystemCanvas summaries={summaries} updatedAt={updatedAt} quoteStatus={quoteStatus} />
      </div>
      <p className="mock-note">第一版全部使用本地模拟数据，不接入真实行情或线上密钥。</p>
    </section>
  );
}

export function ThemeTop50Page() {
  const [stocks] = useState(() => marketDataService.getStockQuotes());
  const [topVolumeSource] = useState("本地模拟数据");
  const [topVolumeUpdatedAt] = useState("15:00:00");
  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const comparisonBySymbol = useMemo(() => new Map(top50.rows.map((row) => [row.symbol, row])), [top50.rows]);
  const [activeSymbol, setActiveSymbol] = useState<string>();

  return (
    <section className="v2-page theme-top50-page">
      <div className="top50-area">
        <div className="top50-main v2-card">
          <div className="v2-card-head">
            <div>
              <h2>成交金额 Top 50 对比</h2>
              <small>数据源：{topVolumeSource}{topVolumeUpdatedAt ? `，更新 ${topVolumeUpdatedAt}` : ""}；NEW / OUT 表示榜单变化。</small>
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
      <p className="mock-note">本页为 A 股模拟成交额与榜单变化演示，仅供信息展示，不构成任何投资建议。</p>
    </section>
  );
}
