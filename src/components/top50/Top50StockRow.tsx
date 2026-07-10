import type { TopVolumeComparisonRow, TopVolumeEntry } from "../../types/topVolume";
import { formatCompactMoney, formatSignedPct } from "../../utils/format";

export function Top50StockRow({ entry, comparison, side, activeSymbol, onHover, index }: { entry: TopVolumeEntry; comparison?: TopVolumeComparisonRow; side: "previous" | "current"; activeSymbol?: string; onHover: (symbol?: string) => void; index: number }) {
  const rankChange = comparison?.rankChange;
  const isActive = activeSymbol === entry.symbol;
  return (
    <tr className={`${isActive ? "active" : ""} ${index >= 6 ? "mobile-top-extra" : ""}`} onMouseEnter={() => onHover(entry.symbol)} onMouseLeave={() => onHover(undefined)}>
      <td><span className="rank">{entry.rank}</span></td>
      <td><b>{entry.symbol}</b><small>{entry.companyName}</small></td>
      <td>{formatCompactMoney(entry.dollarVolume)}</td>
      <td className={entry.changePct >= 0 ? "positive" : "negative"}>{formatSignedPct(entry.changePct)}</td>
      {side === "current" && (
        <>
          <td className={(rankChange || 0) >= 0 ? "positive" : "negative"}>{rankChange ? `${rankChange > 0 ? "↑" : "↓"}${Math.abs(rankChange)}` : "—"}</td>
          <td><StatusLabel status={comparison?.status || "UNCHANGED"} /></td>
        </>
      )}
    </tr>
  );
}

function StatusLabel({ status }: { status: string }) {
  if (status === "NEW") return <span className="status-label new">NEW</span>;
  if (status === "OUT") return <span className="status-label out">OUT</span>;
  if (status === "UP") return <span className="status-label up">上升</span>;
  if (status === "DOWN") return <span className="status-label down">下降</span>;
  return <span className="status-label flat">持平</span>;
}
