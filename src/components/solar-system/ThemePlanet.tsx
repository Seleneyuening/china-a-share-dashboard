import type { ThemeGroupSummary } from "../../types/themeGroup";
import { formatCompactMoney, formatSignedPct } from "../../utils/format";

export function ThemePlanet({
  summary,
  rank,
}: {
  summary: ThemeGroupSummary;
  rank: number;
}) {
  return (
    <article className={`theme-planet theme-rank-${rank}`}>
      <div className="planet-label">
        <span className="planet-rank">{rank}</span>
        <strong>{summary.group.name}</strong>
        <small>成交金额</small>
        <b>{formatCompactMoney(summary.dollarVolume)}</b>
        <em className={summary.averageChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(summary.averageChangePct)}</em>
      </div>
      <small className="planet-leader">领涨股：{summary.leader.symbol} {formatSignedPct(summary.leader.changePct)}</small>
      <div className="planet-detail">
        <span>{summary.group.description}</span>
        <span>自选池 Top 50 入选 {summary.top50Count} 只</span>
        <span>集中度 {summary.concentration}%</span>
        <span>领跌股 {summary.laggard.symbol} {formatSignedPct(summary.laggard.changePct)}</span>
      </div>
    </article>
  );
}
