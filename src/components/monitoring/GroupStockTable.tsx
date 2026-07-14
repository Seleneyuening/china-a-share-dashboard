import { useMemo, useState } from "react";
import { calculateDollarVolume, calculateVolumeHeat, signed } from "../../services/calculations";
import type { StockQuoteMock } from "../../types/themeGroup";
import type { TopVolumeComparisonRow } from "../../types/topVolume";
import { formatCompactMoney, formatSignedPct } from "../../utils/format";
import { StockStatusBadge } from "./StockStatusBadge";

type SortKey = "changePct" | "previousChangePct" | "dollarVolume" | "heat" | "top50Rank" | "rankChange";
type SortDirection = "asc" | "desc";
const defaultSortDirection: Record<SortKey, SortDirection> = {
  changePct: "desc",
  previousChangePct: "desc",
  dollarVolume: "desc",
  heat: "desc",
  top50Rank: "asc",
  rankChange: "asc",
};

export function GroupStockTable({ stocks, topRowsBySymbol, onSelect }: { stocks: StockQuoteMock[]; topRowsBySymbol: Map<string, TopVolumeComparisonRow>; onSelect: (stock: StockQuoteMock) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "dollarVolume", direction: "desc" });
  const sortedStocks = useMemo(() => [...stocks].sort((a, b) => {
    const valueFor = (stock: StockQuoteMock) => {
      const topRow = topRowsBySymbol.get(stock.symbol);
      const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
      const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
      if (sort.key === "changePct") return stock.changePct;
      if (sort.key === "previousChangePct") return stock.previousChangePct;
      if (sort.key === "dollarVolume") return dollarVolume;
      if (sort.key === "heat") return calculateVolumeHeat(dollarVolume, previousDollarVolume).ratio;
      if (sort.key === "top50Rank") return topRow?.currentRank ?? 999;
      return topRow?.rankChange ?? -999;
    };
    const diff = valueFor(a) - valueFor(b);
    return sort.direction === "asc" ? diff : -diff;
  }), [stocks, sort, topRowsBySymbol]);

  function sortBy(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key ? (current.direction === "asc" ? "desc" : "asc") : defaultSortDirection[key],
    }));
  }

  const sortArrow = (key: SortKey) => sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="v2-card stock-table-card">
      <table className="stock-table">
        <thead>
          <tr>
            <th>股票</th>
            <th>当前价格</th>
            <th><button className="sort-header" onClick={() => sortBy("changePct")}>今日涨跌{sortArrow("changePct")}</button></th>
            <th><button className="sort-header" onClick={() => sortBy("previousChangePct")}>昨日涨跌{sortArrow("previousChangePct")}</button></th>
            <th><button className="sort-header" onClick={() => sortBy("dollarVolume")}>成交金额{sortArrow("dollarVolume")}</button></th>
            <th><button className="sort-header" onClick={() => sortBy("heat")}>热度变化{sortArrow("heat")}</button></th>
            <th><button className="sort-header" onClick={() => sortBy("top50Rank")}>Top 50 排名{sortArrow("top50Rank")}</button></th>
            <th><button className="sort-header" onClick={() => sortBy("rankChange")}>排名变化{sortArrow("rankChange")}</button></th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {sortedStocks.map((stock) => {
            const topRow = topRowsBySymbol.get(stock.symbol);
            const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
            const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
            const heat = calculateVolumeHeat(dollarVolume, previousDollarVolume);
            return (
              <tr key={stock.symbol} onClick={() => onSelect(stock)}>
                <td><b>{stock.symbol}</b><small>{stock.companyName}</small></td>
                <td>¥{stock.price.toFixed(2)}</td>
                <td className={stock.changePct >= 0 ? "positive" : "negative"}>{formatSignedPct(stock.changePct)}</td>
                <td className={stock.previousChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(stock.previousChangePct)}</td>
                <td>{formatCompactMoney(dollarVolume)}</td>
                <td className={heat.ratio >= 1 ? "positive" : "negative"}>{heat.ratio.toFixed(2)}x</td>
                <td>{topRow?.currentRank ? topRow.currentRank : "—"}</td>
                <td className={(topRow?.rankChange || 0) >= 0 ? "positive" : "negative"}>{topRow?.rankChange ? signed(topRow.rankChange, 0) : "—"}</td>
                <td><StockStatusBadge stock={stock} top50Rank={topRow?.currentRank} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
