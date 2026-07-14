import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { calculateDollarVolume, calculateVolumeHeat, getGroupStanding, getStockPriceMomentumState, signed } from "../../services/calculations";
import { getStockIntel } from "../../services/stockIntelService";
import type { StockQuoteMock, ThemeGroupSummary } from "../../types/themeGroup";
import type { TopVolumeComparisonRow } from "../../types/topVolume";
import type { StockIntel } from "../../types/stockIntel";
import { formatCompactMoney, formatSignedPct } from "../../utils/format";

const momentumLabel: Record<string, string> = {
  "up-up": "连续上涨 ↑↑",
  "down-down": "连续下跌 ↓↓",
  "down-up": "由跌转涨 ↓↑",
  "up-down": "由涨转跌 ↑↓",
};

export function StockQuickDrawer({ stock, topRow, groupSummary, onClose }: { stock?: StockQuoteMock; topRow?: TopVolumeComparisonRow; groupSummary?: ThemeGroupSummary; onClose: () => void }) {
  const [intel, setIntel] = useState<StockIntel>();
  const [intelStatus, setIntelStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!stock) return;
    setIntel(undefined);
    setIntelStatus("loading");
    getStockIntel(stock.symbol)
      .then((value) => {
        setIntel(value);
        setIntelStatus("ready");
      })
      .catch(() => setIntelStatus("error"));
  }, [stock?.symbol]);

  if (!stock) return null;
  const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
  const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
  const heat = calculateVolumeHeat(dollarVolume, previousDollarVolume);
  const momentum = getStockPriceMomentumState(stock.changePct, stock.previousChangePct);
  const standing = groupSummary ? getGroupStanding(groupSummary, stock.symbol) : undefined;
  const latestRecommendation = intel?.recommendation[0];
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="stock-drawer" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button close-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        <small>{stock.source && stock.source !== "mock" ? `${stock.source} 数据` : "模拟数据"}</small>
        <h2>{stock.symbol} {stock.companyName}</h2>
        <div className="big-number">${stock.price.toFixed(2)}</div>
        <span className={`momentum-pill ${momentum}`}>{momentumLabel[momentum]}</span>

        <h3>价格表现</h3>
        <div className="summary-grid">
          <div><b className={stock.changePct >= 0 ? "positive" : "negative"}>{formatSignedPct(stock.changePct)}</b><span>今日涨跌</span></div>
          <div><b className={stock.previousChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(stock.previousChangePct)}</b><span>昨日涨跌</span></div>
        </div>

        <h3>成交热度</h3>
        <div className="summary-grid">
          <div><b>{formatCompactMoney(dollarVolume)}</b><span>今日成交金额</span></div>
          <div><b>{formatCompactMoney(previousDollarVolume)}</b><span>昨日同期</span></div>
          <div><b className={heat.ratio >= 1 ? "positive" : "negative"}>{heat.ratio.toFixed(2)}x</b><span>热度变化</span></div>
        </div>

        <h3>Top 50 排名</h3>
        {topRow?.currentRank || topRow?.previousRank ? (
          <div className="summary-grid">
            <div><b>{topRow.previousRank ? `#${topRow.previousRank}` : "未上榜"} → {topRow.currentRank ? `#${topRow.currentRank}` : "未上榜"}</b><span>{topRow.status === "NEW" ? "新进 Top 50" : topRow.status === "OUT" ? "退出 Top 50" : "排名变化"}</span></div>
            {topRow.rankChange ? <div><b className={topRow.rankChange >= 0 ? "positive" : "negative"}>{signed(topRow.rankChange, 0)}</b><span>较昨日</span></div> : null}
          </div>
        ) : (
          <p className="muted-note">不在 Top 50 追踪范围内</p>
        )}

        {groupSummary && standing ? (
          <>
            <h3>组内地位</h3>
            <div className="summary-grid">
              <div><b>{groupSummary.group.name}</b><span>所属组</span></div>
              <div><b>{standing.share}%</b><span>组内成交额占比</span></div>
              <div><b>#{standing.volumeRank} / {standing.groupSize}</b><span>组内成交额排名</span></div>
              <div><b>#{standing.changeRank} / {standing.groupSize}</b><span>组内涨幅排名</span></div>
            </div>
          </>
        ) : null}

        <h3>下一次财报</h3>
        {intelStatus === "loading" && <p className="muted-note">加载中…</p>}
        {intelStatus === "error" && <p className="muted-note">数据加载失败。</p>}
        {intelStatus === "ready" && (
          intel?.earnings ? (
            <div className="summary-grid">
              <div><b>{intel.earnings.date}</b><span>预计财报日</span></div>
              {typeof intel.earnings.epsEstimate === "number" && <div><b>${intel.earnings.epsEstimate.toFixed(2)}</b><span>EPS 预期</span></div>}
            </div>
          ) : <p className="muted-note">近期没有安排的财报日期。</p>
        )}

        <h3>分析师推荐趋势</h3>
        {intelStatus === "ready" && (
          latestRecommendation ? (
            <div className="summary-grid">
              <div><b className="positive">{latestRecommendation.strongBuy}</b><span>强烈买入</span></div>
              <div><b className="positive">{latestRecommendation.buy}</b><span>买入</span></div>
              <div><b>{latestRecommendation.hold}</b><span>持有</span></div>
              <div><b className="negative">{latestRecommendation.sell}</b><span>卖出</span></div>
              <div><b className="negative">{latestRecommendation.strongSell}</b><span>强烈卖出</span></div>
            </div>
          ) : <p className="muted-note">暂无分析师推荐数据。</p>
        )}

        <h3>内部人交易</h3>
        {intelStatus === "ready" && (
          intel && intel.insider.length ? (
            <ul className="alert-log-list">
              {intel.insider.slice(0, 5).map((row, index) => (
                <li key={`${row.name}-${row.transactionDate}-${index}`}>
                  <span>{row.name}</span>
                  <b className={row.change >= 0 ? "positive" : "negative"}>{row.change >= 0 ? "增持" : "减持"} {Math.abs(row.change).toLocaleString()} 股 · {row.transactionDate}</b>
                </li>
              ))}
            </ul>
          ) : <p className="muted-note">近期没有内部人交易记录。</p>
        )}

        <h3>最新新闻</h3>
        {intelStatus === "ready" && (
          intel && intel.news.length ? (
            <ul className="alert-log-list">
              {intel.news.slice(0, 3).map((item) => (
                <li key={item.url}>
                  <a href={item.url} target="_blank" rel="noreferrer">{item.headline}</a>
                  <small>{item.source} · {new Date(item.datetime * 1000).toLocaleDateString("zh-CN")}</small>
                </li>
              ))}
            </ul>
          ) : <p className="muted-note">最近 7 天没有相关新闻。</p>
        )}

        <p>NEW / OUT 表示榜单进入或退出；红绿颜色只表示股价涨跌。</p>
      </aside>
    </div>
  );
}
