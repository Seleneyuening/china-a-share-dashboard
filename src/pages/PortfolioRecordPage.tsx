import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, BookOpenText, Download, RefreshCw, Search, TrendingUp, WalletCards } from "lucide-react";
import { emptyPortfolioState, loadPortfolioState, type SupabasePortfolioState, type LiveTrade } from "../services/supabasePortfolioService";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}¥${Math.abs(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
}

type ClosedRecord = { buy: LiveTrade; sell: LiveTrade };

function buildClosedRecords(trades: LiveTrade[]): ClosedRecord[] {
  const openBuys = new Map<string, LiveTrade>();
  const closed: ClosedRecord[] = [];
  for (const trade of [...trades].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
    if (trade.side === "买入") openBuys.set(trade.symbol, trade);
    else {
      const buy = openBuys.get(trade.symbol);
      if (buy) closed.push({ buy, sell: trade });
      openBuys.delete(trade.symbol);
    }
  }
  return closed.reverse();
}

export function PortfolioRecordPage() {
  const [state, setState] = useState<SupabasePortfolioState>(() => emptyPortfolioState());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tradeSide, setTradeSide] = useState<"全部" | "买入" | "卖出">("全部");
  const refresh = useCallback(async () => { setLoading(true); setState(await loadPortfolioState()); setLoading(false); }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const positionValue = state.positions.reduce((sum, position) => sum + position.quantity * position.lastPrice, 0);
  const positionCost = state.positions.reduce((sum, position) => sum + position.quantity * position.averagePrice, 0);
  const unrealizedPnl = positionValue - positionCost;
  const realizedPnl = state.trades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
  const cumulativeReturn = (state.equity / state.initialCapital - 1) * 100;
  const closedRecords = useMemo(() => buildClosedRecords(state.trades), [state.trades]);
  const normalizedSearch = search.trim().toLowerCase();
  const matches = (symbol: string, name: string) => !normalizedSearch || symbol.toLowerCase().includes(normalizedSearch) || name.toLowerCase().includes(normalizedSearch);
  const positions = state.positions.filter((item) => matches(item.symbol, item.companyName));
  const trades = state.trades.filter((item) => matches(item.symbol, item.companyName) && (tradeSide === "全部" || item.side === tradeSide));

  function exportTrades() {
    const rows = [["时间", "操作", "股票代码", "股票名称", "数量", "成交价", "成交金额", "费用", "已实现盈亏", "决定依据"], ...state.trades.map((trade) => [formatTime(trade.occurredAt), trade.side, trade.symbol, trade.companyName, trade.quantity, trade.price, (trade.quantity * trade.price).toFixed(2), trade.fee, trade.realizedPnl ?? "", trade.reason])];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "A股真实行情虚拟交易记录.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <section className="v2-page portfolio-record-page">
    <div className="v2-hero record-hero"><div><span className="tag green"><BookOpenText size={14} /> Supabase 虚拟账户</span><h1>资金与交易记录</h1><p>记录真实时间下的虚拟资金、持仓、成交数量、金额、费用和盈亏，不再使用模拟交易日。</p></div><div className="record-actions"><button className="ghost-button" onClick={exportTrades}><Download size={16} /> 导出记录</button><button className="status" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} /> {loading ? "读取中" : "刷新记录"}</button></div></div>

    <div className="v2-card record-filter-bar"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索股票代码或名称" /></label><label><span>资金流水</span><select value={tradeSide} onChange={(event) => setTradeSide(event.target.value as typeof tradeSide)}><option>全部</option><option>买入</option><option>卖出</option></select></label></div>

    <div className="record-stat-grid">
      <div className="v2-card auto-stat"><WalletCards /><span>当前总资产</span><strong>{formatCompactMoney(state.equity)}</strong><small>累计 {formatSignedPct(cumulativeReturn)}</small></div>
      <div className="v2-card auto-stat"><Banknote /><span>剩余可用资金</span><strong>{formatCompactMoney(state.cash)}</strong><small>资金占比 {state.equity ? ((state.cash / state.equity) * 100).toFixed(1) : "0.0"}%</small></div>
      <div className="v2-card auto-stat"><TrendingUp /><span>当前持仓市值</span><strong>{formatCompactMoney(positionValue)}</strong><small>{state.positions.length} 只股票</small></div>
      <div className="v2-card auto-stat"><BookOpenText /><span>累计总盈亏</span><strong className={state.equity >= state.initialCapital ? "positive" : "negative"}>{formatCompactMoney(state.equity - state.initialCapital)}</strong><small>已实现 {formatCompactMoney(realizedPnl)} · 浮盈亏 {formatCompactMoney(unrealizedPnl)}</small></div>
    </div>

    <div className="v2-card" style={{ marginBottom: 16 }}>
      <div className="v2-card-head"><div><h2>策略自动进化 · V{state.strategyVersion}</h2><small>{state.evolution.rationale}</small></div><span className={`tag ${state.evolution.status === "failed" ? "red" : "green"}`}>{state.evolution.status === "promoted" ? "已升级" : state.evolution.status === "no_change" ? "本周保持" : state.evolution.status === "waiting_for_sample" ? "积累样本" : state.evolution.status === "failed" ? "复盘异常" : "等待首次复盘"}</span></div>
      <p className="muted-note">交易日 {state.evolution.tradingDays}/20 · 完整卖出 {state.evolution.closedTrades}/8 · 当前版本闭环 {state.evolution.versionClosedTrades}/6 · 版本运行 {state.evolution.versionAgeDays}/14 天。满足样本门槛后才允许生成下一版，避免因短期噪声频繁改策略。</p>
    </div>

    <div className="v2-card"><div className="v2-card-head"><div><h2>当前持仓</h2><small>最近更新 {formatTime(state.updatedAt)}</small></div></div>{positions.length ? <div className="table-scroll"><table className="stock-table record-table"><thead><tr><th>股票</th><th>买入时间</th><th>数量</th><th>买入价</th><th>投入金额</th><th>当前价</th><th>当前市值</th><th>浮动盈亏</th></tr></thead><tbody>{positions.map((position) => { const cost = position.quantity * position.averagePrice; const value = position.quantity * position.lastPrice; const pnl = value - cost; return <tr key={position.symbol}><td><b>{position.symbol}</b><small>{position.companyName}</small></td><td>{formatTime(position.openedAt)}</td><td>{position.quantity.toLocaleString("zh-CN")} 股</td><td>{formatMoney(position.averagePrice)}</td><td>{formatMoney(cost)}</td><td>{formatMoney(position.lastPrice)}</td><td>{formatMoney(value)}</td><td className={pnl >= 0 ? "positive" : "negative"}>{formatMoney(pnl)}</td></tr>; })}</tbody></table></div> : <p className="muted-note">{state.message}</p>}</div>

    <div className="v2-card"><div className="v2-card-head"><div><h2>已完成买卖</h2><small>一行对应一次真实时间下的完整虚拟交易</small></div></div>{closedRecords.length ? <div className="table-scroll"><table className="stock-table record-table"><thead><tr><th>股票</th><th>买入时间</th><th>卖出时间</th><th>数量</th><th>买入金额</th><th>卖出金额</th><th>已实现盈亏</th><th>卖出原因</th></tr></thead><tbody>{closedRecords.map(({ buy, sell }) => <tr key={sell.id}><td><b>{sell.symbol}</b><small>{sell.companyName}</small></td><td>{formatTime(buy.occurredAt)}</td><td>{formatTime(sell.occurredAt)}</td><td>{sell.quantity.toLocaleString("zh-CN")} 股</td><td>{formatMoney(buy.quantity * buy.price)}</td><td>{formatMoney(sell.quantity * sell.price)}</td><td className={(sell.realizedPnl ?? 0) >= 0 ? "positive" : "negative"}>{formatMoney(sell.realizedPnl ?? 0)}</td><td>{sell.reason}</td></tr>)}</tbody></table></div> : <p className="muted-note">还没有完成卖出的交易。</p>}</div>

    <div className="v2-card"><div className="v2-card-head"><div><h2>逐笔资金流水</h2><small>共 {state.trades.length} 笔，最新记录在前</small></div></div>{trades.length ? <div className="table-scroll"><table className="stock-table record-table"><thead><tr><th>时间</th><th>操作</th><th>股票</th><th>数量</th><th>成交价</th><th>成交金额</th><th>费用</th><th>决定依据</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td>{formatTime(trade.occurredAt)}</td><td><span className={`tag ${trade.side === "买入" ? "green" : "red"}`}>{trade.side}</span></td><td><b>{trade.symbol}</b><small>{trade.companyName}</small></td><td>{trade.quantity.toLocaleString("zh-CN")} 股</td><td>{formatMoney(trade.price)}</td><td>{formatMoney(trade.quantity * trade.price)}</td><td>{formatMoney(trade.fee)}</td><td>{trade.reason}</td></tr>)}</tbody></table></div> : <p className="muted-note">暂无资金流水。</p>}</div>
    <p className="mock-note">账户使用真实行情和真实时间，但所有资金及成交均为虚拟，不会向券商提交订单。</p>
  </section>;
}
