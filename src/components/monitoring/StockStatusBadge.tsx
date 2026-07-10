import { calculateVolumeHeat, getStockPriceMomentumState } from "../../services/calculations";
import type { StockQuoteMock } from "../../types/themeGroup";

export function StockStatusBadge({ stock, top50Rank }: { stock: StockQuoteMock; top50Rank?: number }) {
  const heat = calculateVolumeHeat(stock.price * stock.volume, stock.price * stock.previousVolume);
  const momentum = getStockPriceMomentumState(stock.changePct, stock.previousChangePct);
  return (
    <div className="status-badges">
      <span className={`momentum ${momentum}`}>{momentum === "up-up" ? "↑↑" : momentum === "down-down" ? "↓↓" : momentum === "down-up" ? "↓↑" : "↑↓"}</span>
      {top50Rank ? <span>Top {top50Rank}</span> : <span className="muted-pill">OUT</span>}
      {heat.label !== "NORMAL" && <span className={heat.label === "HOT" ? "hot" : "cool"}>{heat.label}</span>}
    </div>
  );
}
