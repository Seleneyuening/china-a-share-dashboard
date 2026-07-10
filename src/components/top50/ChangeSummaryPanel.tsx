import type { Top50ChangeSummary } from "../../types/topVolume";

export function ChangeSummaryPanel({ summary }: { summary: Top50ChangeSummary }) {
  return (
    <aside className="v2-card change-panel">
      <h2>今日变化概览</h2>
      <dl>
        <div><dt>新进 Top 50</dt><dd>{summary.newCount} 只</dd></div>
        <div><dt>退出 Top 50</dt><dd>{summary.outCount} 只</dd></div>
        <div><dt>排名上升股票</dt><dd>{summary.upCount} 只</dd></div>
        <div><dt>排名下降股票</dt><dd>{summary.downCount} 只</dd></div>
        <div><dt>平均排名变化</dt><dd>↑ {summary.averageRankChange}</dd></div>
        <div><dt>Top 50 留存率</dt><dd>{summary.retentionRate}%</dd></div>
      </dl>
      <h3>最大的上升</h3>
      {summary.biggestUp.map((row) => <p key={row.symbol}><b className="positive">↑ {row.rankChange}</b> {row.symbol} {row.companyName}</p>)}
      <h3>最大的下降</h3>
      {summary.biggestDown.map((row) => <p key={row.symbol}><b className="negative">↓ {Math.abs(row.rankChange || 0)}</b> {row.symbol} {row.companyName}</p>)}
      <h3>新进股票</h3>
      {summary.newRows.map((row) => <p key={row.symbol}><b className="status-label new">NEW</b> {row.symbol} {row.companyName}</p>)}
      <h3>退出股票</h3>
      {summary.outRows.map((row) => <p key={row.symbol}><b className="status-label out">OUT</b> {row.symbol} {row.companyName}</p>)}
    </aside>
  );
}
