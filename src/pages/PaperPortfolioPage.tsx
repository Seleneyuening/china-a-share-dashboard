import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Clock3, RefreshCw, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { emptyPortfolioState, loadPortfolioState, type AppwritePortfolioState } from "../services/appwritePortfolioService";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

const baseGrid = { stroke: "#1d3044", strokeDasharray: "3 3" };

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未接收";
}

export function PaperPortfolioPage() {
  const [state, setState] = useState<AppwritePortfolioState>(() => emptyPortfolioState());
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setState(await loadPortfolioState());
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const positionValue = useMemo(() => state.positions.reduce((sum, item) => sum + item.quantity * item.lastPrice, 0), [state.positions]);
  const cumulativeReturn = (state.equity / state.initialCapital - 1) * 100;
  const latestDrawdown = state.snapshots[state.snapshots.length - 1]?.drawdown ?? 0;

  return (
    <section className="v2-page autonomous-portfolio-page">
      <div className="v2-hero autonomous-hero">
        <div>
          <span className="tag green"><Bot size={14} /> 真实行情 · 虚拟资金</span>
          <h1>A 股自主虚拟账户</h1>
          <p>系统按真实 A 股交易时间读取行情，自主选股、分配资金和记录虚拟成交；页面不会通过按钮生成未来收益。</p>
        </div>
        <div className="record-actions"><button className="status" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} /> {loading ? "读取中" : "刷新账户"}</button></div>
      </div>

      <div className="v2-card" style={{ marginBottom: 16 }}>
        <div className="v2-card-head"><div><h2>{state.status === "active" ? "账户运行中" : "账户准备中"}</h2><small>{state.message}</small></div><span className={`tag ${state.status === "error" ? "red" : "green"}`}>{state.status === "active" ? "自动运行" : state.status === "error" ? "读取异常" : "等待行情授权"}</span></div>
      </div>

      <div className="auto-stat-grid">
        <div className="v2-card auto-stat"><Wallet /><span>虚拟总资产</span><strong>{formatCompactMoney(state.equity)}</strong><small>初始 {formatCompactMoney(state.initialCapital)}</small></div>
        <div className="v2-card auto-stat"><TrendingUp /><span>累计收益</span><strong className={cumulativeReturn >= 0 ? "positive" : "negative"}>{formatSignedPct(cumulativeReturn)}</strong><small>仅由真实行情虚拟成交产生</small></div>
        <div className="v2-card auto-stat"><ShieldCheck /><span>当前回撤</span><strong className="negative">{formatSignedPct(latestDrawdown)}</strong><small>风控由后台策略执行</small></div>
        <div className="v2-card auto-stat"><Clock3 /><span>最近行情</span><strong>{state.strategyVersion ? `V${state.strategyVersion}` : "—"}</strong><small>{formatTime(state.lastMarketAt)}</small></div>
      </div>

      <div className="auto-main-grid">
        <div className="v2-card auto-chart-card">
          <div className="v2-card-head"><div><h2>真实时间资金曲线</h2><small>只保留压缩后的账户快照</small></div></div>
          <ResponsiveContainer width="100%" height={310}>
            <ComposedChart data={state.snapshots}>
              <defs><linearGradient id="portfolioReturnFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2f83ff" stopOpacity={0.35} /><stop offset="95%" stopColor="#2f83ff" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid {...baseGrid} /><XAxis dataKey="occurredAt" stroke="#8ea0b4" tickFormatter={(value) => new Date(value).toLocaleDateString("zh-CN")} /><YAxis stroke="#8ea0b4" tickFormatter={(value) => `${value}%`} /><Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} /><Area type="monotone" dataKey="cumulativeReturn" name="账户收益" stroke="#53a1ff" fill="url(#portfolioReturnFill)" strokeWidth={3} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="v2-card auto-rules"><div className="v2-card-head"><h2>低占用运行规则</h2></div><ul><li><b>行情：</b>不保存全市场逐笔历史，只在内存筛选</li><li><b>监控：</b>盘中仅跟踪持仓和小型候选池</li><li><b>记录：</b>只写账户、持仓、成交和压缩快照</li><li><b>时间：</b>仅在 A 股交易时段运行，其他时间立即退出</li><li><b>安全：</b>行情密钥只放 Appwrite 函数环境，不进入网页</li><li><b>当前：</b>现金 {formatCompactMoney(state.cash)} · 持仓 {formatCompactMoney(positionValue)}</li></ul></div>
      </div>

      <div className="v2-card">
        <div className="v2-card-head"><div><h2>当前持仓（{state.positions.length}）</h2><small>价格来自最近一次真实行情读取</small></div></div>
        {state.positions.length ? <div className="table-scroll"><table className="stock-table"><thead><tr><th>股票</th><th>数量</th><th>成本</th><th>现价</th><th>浮动收益</th><th>买入时间</th><th>理由</th></tr></thead><tbody>{state.positions.map((position) => { const pnl = (position.lastPrice / position.averagePrice - 1) * 100; return <tr key={position.symbol}><td><b>{position.symbol}</b><small>{position.companyName}</small></td><td>{position.quantity.toLocaleString("zh-CN")} 股</td><td>¥{position.averagePrice.toFixed(2)}</td><td>¥{position.lastPrice.toFixed(2)}</td><td className={pnl >= 0 ? "positive" : "negative"}>{formatSignedPct(pnl)}</td><td>{formatTime(position.openedAt)}</td><td>{position.reason}</td></tr>; })}</tbody></table></div> : <p className="muted-note">尚未产生真实行情虚拟成交。接入行情授权后，系统会在交易时段自主判断是否建仓。</p>}
      </div>

      <p className="mock-note">这是基于真实行情的虚拟资金账户，不连接券商、不下真实订单、不构成投资建议，也不保证盈利。</p>
    </section>
  );
}
