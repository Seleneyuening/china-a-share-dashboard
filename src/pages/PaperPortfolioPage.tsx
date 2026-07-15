import { useMemo, useState } from "react";
import { Bot, Play, RotateCcw, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { autonomousPortfolioService, type AutoPortfolioState } from "../services/autonomousPortfolioService";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

const baseGrid = { stroke: "#1d3044", strokeDasharray: "3 3" };

export function PaperPortfolioPage() {
  const [state, setState] = useState<AutoPortfolioState>(() => autonomousPortfolioService.getState());
  const [running, setRunning] = useState(false);
  const latest = state.snapshots[state.snapshots.length - 1];
  const candidates = useMemo(() => autonomousPortfolioService.getRankedCandidates(state).slice(0, 10), [state]);
  const positionValue = state.positions.reduce((sum, position) => sum + position.quantity * position.lastPrice, 0);

  function run(days: number) {
    setRunning(true);
    setState(autonomousPortfolioService.runDays(days));
    setRunning(false);
  }

  function reset() {
    if (window.confirm("确定重置全部虚拟资金、持仓和交易记录吗？")) setState(autonomousPortfolioService.reset());
  }

  return (
    <section className="v2-page autonomous-portfolio-page">
      <div className="v2-hero autonomous-hero">
        <div>
          <span className="tag green"><Bot size={14} /> 自主模拟引擎</span>
          <h1>A 股虚拟操盘实验台</h1>
          <p>系统自主完成选股、仓位分配、止盈止损和再平衡。所有资金与行情均为可重复的本地模拟。</p>
        </div>
        <div className="auto-actions">
          <button className="status" disabled={running} onClick={() => run(1)}><Play size={16} /> 运行下一交易日</button>
          <button className="status" disabled={running} onClick={() => run(20)}><TrendingUp size={16} /> 连续测试 20 日</button>
          <button className="ghost-button" onClick={reset}><RotateCcw size={15} /> 重置实验</button>
        </div>
      </div>

      <div className="auto-stat-grid">
        <div className="v2-card auto-stat"><Wallet /><span>虚拟总资产</span><strong>{formatCompactMoney(latest.equity)}</strong><small>初始 ¥100万</small></div>
        <div className="v2-card auto-stat"><TrendingUp /><span>累计收益</span><strong className={latest.cumulativeReturn >= 0 ? "positive" : "negative"}>{formatSignedPct(latest.cumulativeReturn)}</strong><small>基准 {formatSignedPct(latest.benchmarkReturn)}</small></div>
        <div className="v2-card auto-stat"><ShieldCheck /><span>当前回撤</span><strong className="negative">{formatSignedPct(latest.drawdown)}</strong><small>风控线 -5%</small></div>
        <div className="v2-card auto-stat"><Bot /><span>资金状态</span><strong>{formatCompactMoney(state.cash)}</strong><small>持仓 {formatCompactMoney(positionValue)}</small></div>
      </div>

      <div className="auto-main-grid">
        <div className="v2-card auto-chart-card">
          <div className="v2-card-head"><div><h2>资金曲线</h2><small>已模拟 {state.day} 个交易日 · 含佣金与卖出印花税</small></div></div>
          <ResponsiveContainer width="100%" height={310}>
            <LineChart data={state.snapshots}>
              <CartesianGrid {...baseGrid} />
              <XAxis dataKey="day" stroke="#8ea0b4" tickFormatter={(value) => `D${value}`} />
              <YAxis stroke="#8ea0b4" tickFormatter={(value) => `${value}%`} />
              <Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} />
              <Legend />
              <Line type="monotone" dataKey="cumulativeReturn" name="自主组合" stroke="#2f83ff" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="benchmarkReturn" name="等权基准" stroke="#ffd24a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="v2-card auto-rules">
          <div className="v2-card-head"><h2>当前自主规则</h2></div>
          <ul>
            <li><b>目标：</b>在控制回撤的前提下提高虚拟资金净值</li>
            <li><b>选股：</b>动量、成交热度、趋势和流动性综合评分</li>
            <li><b>仓位：</b>最多 6 只，目标投入 88%，早期优先分散主题</li>
            <li><b>买入：</b>综合评分大于 1，按 100 股整手成交</li>
            <li><b>卖出：</b>-5% 止损、+10% 止盈、评分转弱或持有 7 日</li>
            <li><b>制度：</b>按日模拟 T+1，买卖计佣金，卖出计印花税</li>
          </ul>
        </div>
      </div>

      <div className="v2-card">
        <div className="v2-card-head"><div><h2>当前持仓（{state.positions.length}/{6}）</h2><small>买卖由模拟引擎自主决定</small></div></div>
        {state.positions.length ? (
          <div className="table-scroll"><table className="stock-table">
            <thead><tr><th>股票</th><th>数量</th><th>成本</th><th>现价</th><th>浮动收益</th><th>评分</th><th>持仓理由</th></tr></thead>
            <tbody>{state.positions.map((position) => {
              const pnl = (position.lastPrice / position.averagePrice - 1) * 100;
              return <tr key={position.symbol}><td><b>{position.symbol}</b><small>{position.companyName}</small></td><td>{position.quantity}</td><td>¥{position.averagePrice.toFixed(2)}</td><td>¥{position.lastPrice.toFixed(2)}</td><td className={pnl >= 0 ? "positive" : "negative"}>{formatSignedPct(pnl)}</td><td>{position.score}</td><td>{position.reason}</td></tr>;
            })}</tbody>
          </table></div>
        ) : <p className="muted-note">尚未建仓。点击“运行下一交易日”，系统会完成第一次自主选股和资金配置。</p>}
      </div>

      <div className="two-col auto-bottom-grid">
        <div className="v2-card">
          <div className="v2-card-head"><div><h2>自主候选 Top 10</h2><small>这不是成交额榜，而是当前策略优先级</small></div></div>
          <table className="stock-table compact-table"><thead><tr><th>#</th><th>股票</th><th>主题</th><th>评分</th><th>依据</th></tr></thead>
            <tbody>{candidates.map((stock, index) => <tr key={stock.symbol}><td>{index + 1}</td><td><b>{stock.symbol}</b><small>{stock.companyName}</small></td><td>{stock.groupName}</td><td className={stock.score > 0 ? "positive" : "negative"}>{stock.score}</td><td>{stock.reason}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="v2-card">
          <div className="v2-card-head"><div><h2>最近交易</h2><small>每笔决策均保留理由</small></div></div>
          {state.trades.length ? <ul className="auto-trade-list">{state.trades.slice(0, 12).map((trade) => <li key={trade.id}><span className={`tag ${trade.side === "买入" ? "green" : "red"}`}>{trade.side}</span><b>D{trade.day} {trade.symbol} {trade.companyName}</b><span>{trade.quantity} 股 × ¥{trade.price.toFixed(2)}</span>{typeof trade.realizedPnl === "number" && <span className={trade.realizedPnl >= 0 ? "positive" : "negative"}>已实现 {formatCompactMoney(trade.realizedPnl)}</span>}<small>{trade.reason}</small></li>)}</ul> : <p className="muted-note">暂无交易记录。</p>}
        </div>
      </div>

      <p className="mock-note">这是虚拟资金实验，不连接券商、不下真实订单、不构成投资建议。模拟收益不能代表真实市场结果，也无法保证盈利。</p>
    </section>
  );
}
