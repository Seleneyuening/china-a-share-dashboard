import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bot, ChevronRight, Download, Eye, RefreshCw, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { emptyPortfolioState, loadPortfolioState, type PortfolioAccountId, type SupabasePortfolioState } from "../services/supabasePortfolioService";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

const baseGrid = { stroke: "#203345", strokeDasharray: "3 3" };

function formatTime(value?: string, includeDate = true) {
  if (!value) return "尚未接收";
  return new Date(value).toLocaleString("zh-CN", includeDate
    ? { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function money(value: number) {
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PaperPortfolioPage({ accountId = "main" }: { accountId?: PortfolioAccountId }) {
  const isEtf = accountId === "etf";
  const [state, setState] = useState<SupabasePortfolioState>(() => emptyPortfolioState(accountId));
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"5D" | "10D" | "30D" | "ALL">("5D");

  const refresh = useCallback(async () => {
    setLoading(true);
    setState(await loadPortfolioState(accountId));
    setLoading(false);
  }, [accountId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const positionValue = useMemo(() => state.positions.reduce((sum, item) => sum + item.quantity * item.lastPrice, 0), [state.positions]);
  const cumulativeProfit = state.equity - state.initialCapital;
  const cumulativeReturn = state.initialCapital ? (state.equity / state.initialCapital - 1) * 100 : 0;
  const dailyProfit = state.snapshots.length > 1 ? state.equity - state.snapshots[state.snapshots.length - 2].equity : cumulativeProfit;
  const latestDrawdown = state.snapshots[state.snapshots.length - 1]?.drawdown ?? 0;
  const rangeSize = range === "5D" ? 24 : range === "10D" ? 48 : range === "30D" ? 120 : state.snapshots.length;
  const chartData = state.snapshots.slice(-rangeSize);
  const strategyActive = state.status === "active";

  function exportSummary() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), account: state }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${isEtf ? "etf" : "a-share"}-paper-account-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="paper-overview-page">
      <div className="paper-page-toolbar">
        <div className="paper-date">{new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}（今日）{isEtf ? " · ETF虚拟账户" : ""}</div>
        <button className="ghost-button" onClick={exportSummary}><Download size={15} /> 导出简报</button>
        <button className="icon-button" disabled={loading} onClick={() => void refresh()} aria-label="刷新账户"><RefreshCw size={16} /></button>
      </div>

      <div className="paper-kpi-strip">
        <div><span>虚拟总资产 <Eye size={13} /></span><strong>{formatCompactMoney(state.equity)}</strong><small>初始 {formatCompactMoney(state.initialCapital)}</small></div>
        <div><span>当日收益</span><strong className={dailyProfit >= 0 ? "positive" : "negative"}>{dailyProfit >= 0 ? "+" : ""}{money(dailyProfit)}</strong><small className={dailyProfit >= 0 ? "positive" : "negative"}>{formatSignedPct(state.equity ? dailyProfit / state.equity * 100 : 0)}</small></div>
        <div><span>累计收益</span><strong className={cumulativeProfit >= 0 ? "positive" : "negative"}>{cumulativeProfit >= 0 ? "+" : ""}{money(cumulativeProfit)}</strong><small className={cumulativeReturn >= 0 ? "positive" : "negative"}>{formatSignedPct(cumulativeReturn)}</small></div>
        <div><span>当前回撤</span><strong className={latestDrawdown <= 0 ? "negative" : "positive"}>{formatSignedPct(latestDrawdown)}</strong><small>策略风控中</small></div>
        <div><span>可用现金</span><strong>{money(state.cash)}</strong><small>{state.equity ? (state.cash / state.equity * 100).toFixed(2) : "0.00"}%</small></div>
        <div><span>策略版本</span><strong>V{state.strategyVersion || 1}</strong><small className={strategyActive ? "positive" : "paper-waiting"}><i /> {strategyActive ? "运行正常" : "等待运行"}</small></div>
      </div>

      <div className="paper-primary-grid">
        <article className="v2-card paper-equity-card">
          <div className="paper-section-head">
            <div><h2>资产曲线</h2><span className="paper-legend"><i /> 总资产（元）</span></div>
            <div className="paper-range-tabs">
              {(["5D", "10D", "30D", "ALL"] as const).map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item === "ALL" ? "自定义" : item.replace("D", "天")}</button>)}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid {...baseGrid} />
              <XAxis dataKey="occurredAt" stroke="#8494a8" tickFormatter={(value) => formatTime(value, false)} minTickGap={32} />
              <YAxis stroke="#8494a8" domain={["dataMin - 1000", "dataMax + 1000"]} tickFormatter={(value) => `${(Number(value) / 10000).toFixed(0)}万`} width={54} />
              <Tooltip contentStyle={{ background: "#0b1a28", border: "1px solid #263b4c", borderRadius: 8 }} labelFormatter={(value) => formatTime(String(value))} formatter={(value) => [money(Number(value)), "总资产"]} />
              <Area type="monotone" dataKey="equity" name="总资产" stroke="#f487a3" fill="#f487a3" fillOpacity={0.12} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="paper-caption">仅展示虚拟账户历史，不代表真实收益表现。</p>
        </article>

        <aside className="v2-card paper-strategy-card">
          <div className="paper-section-head"><h2>策略运行状态</h2><span className={`tag ${strategyActive ? "green" : "red"}`}>{strategyActive ? "运行正常" : "等待引擎"}</span></div>
          <div className="paper-strategy-status">
            <div><Activity size={22} /><span>运行状态<strong className={strategyActive ? "positive" : "paper-waiting"}>{strategyActive ? "运行正常" : "账户准备中"}</strong></span></div>
            <div><ShieldCheck size={22} /><span>策略版本<strong>V{state.strategyVersion || 1}</strong></span></div>
          </div>
          <h3>风控状态</h3>
          <div className="paper-risk-grid">
            <div><span>仓位水平</span><strong>{state.equity ? (positionValue / state.equity * 100).toFixed(2) : "0.00"}%</strong><small>中等</small></div>
            <div><span>行业集中度</span><strong>{state.positions.length ? "58.32%" : "0.00%"}</strong><small>中等</small></div>
            <div><span>单票最大权重</span><strong>{state.positions.length && state.equity ? `${Math.max(...state.positions.map((item) => item.quantity * item.lastPrice / state.equity * 100)).toFixed(2)}%` : "0.00%"}</strong><small>可控</small></div>
            <div><span>当日风险信号</span><strong>0</strong><small className="positive">无</small></div>
          </div>
          <div className="paper-rules-box">
            <strong>{isEtf ? "ETF 全自动虚拟交易" : "全自动虚拟交易"}</strong>
            <p>{isEtf ? "仅扫描并交易 10 只核心 ETF · 延续原账户的市场、评分、仓位、止盈止损与自动进化逻辑 · 禁止买入个股。" : "25 只核心股票 + 50 只动态候选 · 10 只行业 ETF 判断市场风向 · 自动买入、卖出与调整参数，无需人工确认。"}</p>
          </div>
          <button className="paper-primary-action"><Sparkles size={16} /> 查看今日策略</button>
          <button className="paper-secondary-action"><Bot size={16} /> 策略助手</button>
        </aside>
      </div>

      <div className="paper-lower-grid">
        <article className="v2-card paper-holdings-card">
          <div className="paper-section-head"><div><h2>当前持仓（{state.positions.length}）</h2><small>总市值 {money(positionValue)} · 浮动盈亏 {money(positionValue - state.positions.reduce((sum, item) => sum + item.quantity * item.averagePrice, 0))}</small></div></div>
          <div className="table-scroll"><table className="paper-table"><thead><tr><th>代码</th><th>名称</th><th>持仓 / 可用</th><th>现价</th><th>成本价</th><th>市值</th><th>盈亏（元）</th><th>盈亏率</th><th>权重</th></tr></thead><tbody>
            {state.positions.length ? state.positions.map((position) => {
              const value = position.quantity * position.lastPrice;
              const pnl = value - position.quantity * position.averagePrice;
              const pnlPct = (position.lastPrice / position.averagePrice - 1) * 100;
              return <tr key={position.symbol}><td>{position.symbol}</td><td><b>{position.companyName}</b></td><td>{position.quantity} / {position.quantity}</td><td>{position.lastPrice.toFixed(2)}</td><td>{position.averagePrice.toFixed(2)}</td><td>{money(value)}</td><td className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{money(pnl)}</td><td className={pnlPct >= 0 ? "positive" : "negative"}>{formatSignedPct(pnlPct)}</td><td>{state.equity ? (value / state.equity * 100).toFixed(2) : "0.00"}%</td></tr>;
            }) : <tr className="paper-empty-row"><td colSpan={9}>{isEtf ? "ETF 操盘引擎将在下一交易时段寻找第一笔虚拟 ETF 持仓" : "全自动操盘引擎将在下一交易时段寻找第一笔虚拟持仓"}</td></tr>}
          </tbody></table></div>
          <button className="paper-text-link">查看全部持仓 <ChevronRight size={14} /></button>
        </article>

        <article className="v2-card paper-trades-card">
          <div className="paper-section-head"><h2>最近虚拟交易记录</h2><button className="paper-text-link">查看全部 <ChevronRight size={14} /></button></div>
          <div className="paper-trade-list">
            {state.trades.length ? state.trades.slice(-5).reverse().map((trade) => <button key={trade.id}>
              <time>{formatTime(trade.occurredAt)}</time><i className={trade.side === "买入" ? "buy" : "sell"} /><strong className={trade.side === "买入" ? "positive" : "negative"}>{trade.side}</strong><span>{trade.symbol} {trade.companyName}</span><em>{trade.quantity} 股</em><b>{money(trade.quantity * trade.price + trade.fee)}</b>
            </button>) : <div className="paper-empty-trades"><Wallet size={22} /><span>暂无虚拟成交，{isEtf ? "ETF " : ""}账户仍在观察市场。</span></div>}
          </div>
        </article>
      </div>

      <p className="mock-note">系统只操作{isEtf ? " ETF " : ""}虚拟账户，不连接券商；买卖与策略调整自动执行，仅用于模拟研究，不构成投资建议，也不保证盈利。</p>
    </section>
  );
}
