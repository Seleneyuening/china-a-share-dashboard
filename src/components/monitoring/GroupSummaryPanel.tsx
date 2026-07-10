import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { calculateDollarVolume } from "../../services/calculations";
import type { ThemeGroupSummary } from "../../types/themeGroup";
import { formatCompactMoney, formatSignedPct } from "../../utils/format";

export function GroupSummaryPanel({ summary }: { summary: ThemeGroupSummary }) {
  const top3 = [...summary.stocks]
    .sort((a, b) => (b.dollarVolume ?? calculateDollarVolume(b.price, b.volume)) - (a.dollarVolume ?? calculateDollarVolume(a.price, a.volume)))
    .slice(0, 3)
    .map((stock) => ({ name: stock.symbol, value: Number(((stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume)) / 1_000_000_000).toFixed(2)) }));
  return (
    <aside className="v2-card summary-panel">
      <h2>组内概览</h2>
      <div className="big-number">{formatCompactMoney(summary.dollarVolume)}</div>
      <small>今日成交金额 <span className="positive">较昨日 {formatSignedPct(((summary.dollarVolume - summary.previousDollarVolume) / summary.previousDollarVolume) * 100)}</span></small>
      <div className="summary-grid">
        <div><b className={summary.averageChangePct >= 0 ? "positive" : "negative"}>{formatSignedPct(summary.averageChangePct)}</b><span>平均涨跌幅</span></div>
        <div><b>{summary.gainers} / <span className="negative">{summary.losers}</span></b><span>上涨 / 下跌</span></div>
        <div><b>{summary.top50Count} / {summary.stocks.length}</b><span>Top 50 入选</span></div>
        <div><b className="positive">{summary.concentration}%</b><span>资金集中度</span></div>
      </div>
      <h3>成交额 Top 3</h3>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={top3} layout="vertical">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={54} stroke="#9cabbc" />
          <Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} formatter={(value) => [`$${value}B`, "成交额"]} />
          <Bar dataKey="value" fill="#25d18c" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <h3>领涨 / 领跌</h3>
      <p><span className="tag green">领涨</span> {summary.leader.symbol} {summary.leader.companyName} <b className="positive">{formatSignedPct(summary.leader.changePct)}</b></p>
      <p><span className="tag red">领跌</span> {summary.laggard.symbol} {summary.laggard.companyName} <b className="negative">{formatSignedPct(summary.laggard.changePct)}</b></p>
    </aside>
  );
}
