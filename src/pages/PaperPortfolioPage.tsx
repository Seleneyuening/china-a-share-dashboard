import { useMemo, useState } from "react";
import { Bot, Play, RotateCcw, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { autonomousPortfolioService, type AutoPortfolioState } from "../services/autonomousPortfolioService";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

const baseGrid = { stroke: "#1d3044", strokeDasharray: "3 3" };

export function PaperPortfolioPage() {
  const [state, setState] = useState<AutoPortfolioState>(() => autonomousPortfolioService.getState());
  const [running, setRunning] = useState(false);
  const latest = state.snapshots[state.snapshots.length - 1];
  const universeSize = autonomousPortfolioService.getUniverseSize();
  const candidates = useMemo(() => autonomousPortfolioService.getRankedCandidates(state).slice(0, 10), [state]);
  const metrics = useMemo(() => autonomousPortfolioService.getPerformanceMetrics(state), [state]);
  const stressTests = useMemo(() => autonomousPortfolioService.runStressTests(state), [state]);
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
          <p>系统扫描沪深全市场候选池，自主完成选股、仓位分配和买卖，并每 20 个模拟交易日复盘、自我更新策略。</p>
        </div>
        <div className="auto-actions">
          <button className="status" disabled={running} onClick={() => run(1)}><Play size={16} /> 运行下一交易日</button>
          <button className="status" disabled={running} onClick={() => run(20)}><TrendingUp size={16} /> 连续测试 20 日</button>
          <button className="status" disabled={running} onClick={() => run(60)}><Bot size={16} /> 自主演化 60 日</button>
          <button className="ghost-button" onClick={reset}><RotateCcw size={15} /> 重置实验</button>
        </div>
      </div>

      <div className="auto-stat-grid">
        <div className="v2-card auto-stat"><Wallet /><span>虚拟总资产</span><strong>{formatCompactMoney(latest.equity)}</strong><small>初始 ¥100万</small></div>
        <div className="v2-card auto-stat"><TrendingUp /><span>累计收益</span><strong className={latest.cumulativeReturn >= 0 ? "positive" : "negative"}>{formatSignedPct(latest.cumulativeReturn)}</strong><small>基准 {formatSignedPct(latest.benchmarkReturn)}</small></div>
        <div className="v2-card auto-stat"><ShieldCheck /><span>当前回撤</span><strong className="negative">{formatSignedPct(latest.drawdown)}</strong><small>风控线 -5%</small></div>
        <div className="v2-card auto-stat"><Bot /><span>策略版本 V{state.strategy.version}</span><strong>{universeSize.toLocaleString()} 只</strong><small>现金 {formatCompactMoney(state.cash)} · 持仓 {formatCompactMoney(positionValue)}</small></div>
      </div>

      <div className="auto-main-grid">
        <div className="v2-card auto-chart-card">
          <div className="v2-card-head"><div><h2>资金曲线</h2><small>已模拟 {state.day} 个交易日 · 含佣金与卖出印花税</small></div></div>
          <ResponsiveContainer width="100%" height={310}>
            <ComposedChart data={state.snapshots}>
              <defs><linearGradient id="portfolioReturnFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2f83ff" stopOpacity={0.35} /><stop offset="95%" stopColor="#2f83ff" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid {...baseGrid} />
              <XAxis dataKey="day" stroke="#8ea0b4" tickFormatter={(value) => `D${value}`} />
              <YAxis stroke="#8ea0b4" domain={["auto", "auto"]} tickFormatter={(value) => `${value}%`} />
              <Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} />
              <Legend />
              <ReferenceLine y={0} stroke="#53677c" />
              <Area type="monotone" dataKey="cumulativeReturn" name="自主组合" stroke="#53a1ff" fill="url(#portfolioReturnFill)" strokeWidth={3} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="benchmarkReturn" name="等权基准" stroke="#ffd24a" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="v2-card auto-rules">
          <div className="v2-card-head"><h2>当前自主规则</h2></div>
          <ul>
            <li><b>目标：</b>在控制回撤的前提下提高虚拟资金净值</li>
            <li><b>选股：</b>扫描 {universeSize.toLocaleString()} 只沪深股票，不受榜单 50 限制</li>
            <li><b>策略：</b>动量权重 {state.strategy.momentumWeight}、热度权重 {state.strategy.heatWeight}、探索率 {Math.round(state.strategy.explorationRate * 100)}%</li>
            <li><b>最佳版本：</b>{state.bestStrategy.day ? `D${state.bestStrategy.day} · V${state.bestStrategy.config.version} · 质量分 ${state.bestStrategy.qualityScore}` : "等待首个 20 日评估周期"}</li>
            <li><b>仓位：</b>最多 {state.strategy.maxPositions} 只，目标投入 {Math.round(state.strategy.targetInvestedRatio * 100)}%，优先分散板块</li>
            <li><b>买入：</b>综合评分大于 1，按 100 股整手成交</li>
            <li><b>卖出：</b>-{state.strategy.stopLossPct}% 止损、+{state.strategy.takeProfitPct}% 止盈、评分转弱或持有 {state.strategy.maxHoldDays} 日</li>
            <li><b>制度：</b>按日模拟 T+1，买卖计佣金，卖出计印花税</li>
          </ul>
        </div>
      </div>

      <div className="strategy-metric-grid">
        <div className="v2-card mini-metric"><span>已完成交易</span><strong>{metrics.closedTrades} 笔</strong></div>
        <div className="v2-card mini-metric"><span>交易胜率</span><strong>{metrics.winRate.toFixed(1)}%</strong></div>
        <div className="v2-card mini-metric"><span>盈亏比</span><strong>{metrics.profitFactor >= 99 ? "无亏损" : metrics.profitFactor.toFixed(2)}</strong></div>
        <div className="v2-card mini-metric"><span>历史最大回撤</span><strong className="negative">{formatSignedPct(metrics.maxDrawdown)}</strong></div>
        <div className="v2-card mini-metric"><span>累计交易费用</span><strong>{formatCompactMoney(metrics.totalFees)}</strong><small>侵蚀本金 {metrics.feeDragPct.toFixed(2)}%</small></div>
        <div className="v2-card mini-metric"><span>累计换手</span><strong>{metrics.turnoverPct.toFixed(0)}%</strong></div>
      </div>

      <div className="v2-card stress-test-card">
        <div className="v2-card-head"><div><h2>多市场环境压力测试</h2><small>用当前策略参数估算未来 20 个模拟交易日；不影响账户资金</small></div></div>
        <div className="stress-test-grid">{stressTests.map((test) => <article key={test.id} className={`stress-result ${test.status === "危险" ? "danger" : test.status === "承压" ? "warning" : "pass"}`}>
          <div><strong>{test.name}</strong><span className="tag">{test.status}</span></div>
          <small>{test.description}</small>
          <p><span>预计收益 <b className={test.returnPct >= 0 ? "positive" : "negative"}>{formatSignedPct(test.returnPct)}</b></span><span>最大回撤 <b className="negative">{formatSignedPct(test.maxDrawdown)}</b></span></p>
        </article>)}</div>
      </div>

      <div className="v2-card">
        <div className="v2-card-head"><div><h2>当前持仓（{state.positions.length}/{state.strategy.maxPositions}）</h2><small>买卖与资金配置由模拟引擎自主决定</small></div></div>
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
          <div className="v2-card-head"><div><h2>全市场自主候选 Top 10</h2><small>从 {universeSize.toLocaleString()} 只候选中动态筛选，不是固定股票池</small></div></div>
          <table className="stock-table compact-table"><thead><tr><th>#</th><th>股票</th><th>主题</th><th>评分</th><th>依据</th></tr></thead>
            <tbody>{candidates.map((stock, index) => <tr key={stock.symbol}><td>{index + 1}</td><td><b>{stock.symbol}</b><small>{stock.companyName}</small></td><td>{stock.groupName}</td><td className={stock.score > 0 ? "positive" : "negative"}>{stock.score}</td><td>{stock.reason}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="v2-card">
          <div className="v2-card-head"><div><h2>最近交易</h2><small>每笔决策均保留理由</small></div></div>
          {state.trades.length ? <ul className="auto-trade-list">{state.trades.slice(0, 12).map((trade) => <li key={trade.id}><span className={`tag ${trade.side === "买入" ? "green" : "red"}`}>{trade.side}</span><b>D{trade.day} {trade.symbol} {trade.companyName}</b><span>{trade.quantity} 股 × ¥{trade.price.toFixed(2)}</span>{typeof trade.realizedPnl === "number" && <span className={trade.realizedPnl >= 0 ? "positive" : "negative"}>已实现 {formatCompactMoney(trade.realizedPnl)}</span>}<small>{trade.reason}</small></li>)}</ul> : <p className="muted-note">暂无交易记录。</p>}
        </div>
      </div>

      <div className="v2-card auto-strategy-log">
        <div className="v2-card-head"><div><h2>策略自我更新记录</h2><small>每 20 个模拟交易日比较组合与基准，再自动调整下一阶段参数</small></div></div>
        {state.strategyUpdates.length ? <div className="strategy-update-grid">{state.strategyUpdates.slice(0, 6).map((update) => {
          const relative = update.portfolioPeriodReturn - update.benchmarkPeriodReturn;
          return <article key={`${update.day}-${update.version}`}>
            <span className={`tag ${update.action === "回退" ? "red" : "green"}`}>{update.action} · V{update.version} · D{update.day}</span>
            <strong>{update.reason}</strong>
            <small>组合 {formatSignedPct(update.portfolioPeriodReturn)} · 基准 {formatSignedPct(update.benchmarkPeriodReturn)} · 相对 <span className={relative >= 0 ? "positive" : "negative"}>{formatSignedPct(relative)}</span></small>
            <p>{update.changes.join("、")}</p>
          </article>;
        })}</div> : <p className="muted-note">将在第 20 个模拟交易日完成第一次策略评估。你也可以点击“自主演化 60 日”直接观察三轮更新。</p>}
      </div>

      <p className="mock-note">这是虚拟资金实验，不连接券商、不下真实订单、不构成投资建议。模拟收益不能代表真实市场结果，也无法保证盈利。</p>
    </section>
  );
}
