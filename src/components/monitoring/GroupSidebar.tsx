import type { ThemeGroupSummary } from "../../types/themeGroup";
import { formatCompactMoney, formatSignedPct } from "../../utils/format";

export function GroupSidebar({ summaries, selectedId, onSelect }: { summaries: ThemeGroupSummary[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <aside className="v2-card group-sidebar">
      <div className="v2-card-head">
        <h2>主题组列表</h2>
        <button className="mini-button" aria-label="新增主题组">+</button>
      </div>
      {summaries.map((summary) => (
        <button key={summary.group.id} className={selectedId === summary.group.id ? "group-button active" : "group-button"} onClick={() => onSelect(summary.group.id)}>
          <span className="group-icon">{summary.group.icon.slice(0, 2)}</span>
          <strong>{summary.group.name}</strong>
          <small>{summary.stocks.length} 只</small>
          <b>{formatCompactMoney(summary.dollarVolume)}</b>
          <em className={summary.averageChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(summary.averageChangePct)}</em>
          <small>领涨：{summary.leader?.symbol} {formatSignedPct(summary.leader?.changePct || 0)}</small>
        </button>
      ))}
    </aside>
  );
}
