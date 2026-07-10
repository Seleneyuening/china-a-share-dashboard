import { mockMarketSatellites } from "../../data/mockMarketSatellites";
import { formatSignedPct } from "../../utils/format";

export function MarketSatellitesPanel() {
  return (
    <aside className="v2-card satellite-panel">
      <h2>市场卫星 <small>工具层</small></h2>
      {mockMarketSatellites.map((stock) => (
        <div key={stock.symbol} className="satellite-row">
          <span>{stock.symbol.slice(0, 1)}</span>
          <div>
            <b>{stock.symbol}</b>
            <small>{stock.companyName}</small>
            <em>${stock.price.toFixed(2)} <i className={stock.changePct >= 0 ? "positive" : "negative"}>{formatSignedPct(stock.changePct)}</i></em>
          </div>
          <svg viewBox="0 0 86 32">{stock.sparkline.map((value, index) => index ? null : null)}<polyline points={stock.sparkline.map((value, index) => `${(index / (stock.sparkline.length - 1)) * 86},${30 - ((value - Math.min(...stock.sparkline)) / Math.max(Math.max(...stock.sparkline) - Math.min(...stock.sparkline), 1)) * 26}`).join(" ")} fill="none" stroke={stock.changePct >= 0 ? "#20d17d" : "#ff594f"} strokeWidth="2" /></svg>
        </div>
      ))}
    </aside>
  );
}
