import type { TopVolumeComparisonRow, TopVolumeEntry } from "../../types/topVolume";
import { Top50StockRow } from "./Top50StockRow";

export function Top50Table({ title, rows, side, comparisonBySymbol, activeSymbol, onHover, showAll }: { title: string; rows: TopVolumeEntry[]; side: "previous" | "current"; comparisonBySymbol: Map<string, TopVolumeComparisonRow>; activeSymbol?: string; onHover: (symbol?: string) => void; showAll: boolean }) {
  return (
    <div className={`top-table ${showAll ? "show-all" : ""}`}>
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>股票</th>
            <th>成交金额</th>
            <th>涨跌幅</th>
            {side === "current" && <><th>排名变化</th><th>状态</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, index) => <Top50StockRow key={entry.symbol} entry={entry} index={index} side={side} comparison={comparisonBySymbol.get(entry.symbol)} activeSymbol={activeSymbol} onHover={onHover} />)}
        </tbody>
      </table>
    </div>
  );
}
