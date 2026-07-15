import { useMemo, useState } from "react";
import { Banknote, BookOpenText, Download, RefreshCw, Search, TrendingUp, WalletCards } from "lucide-react";
import { autonomousPortfolioService, type AutoPortfolioState, type AutoTrade } from "../services/autonomousPortfolioService";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}¥${Math.abs(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function simulatedTime(day: number) {
  return `D${day} 收盘`;
}

type ClosedRecord = { buy: AutoTrade; sell: AutoTrade };

function buildClosedRecords(trades: AutoTrade[]): ClosedRecord[] {
  const openBuys = new Map<string, AutoTrade>();
  const closed: ClosedRecord[] = [];
  for (const trade of [...trades].sort((a, b) => a.day - b.day || (a.side === "卖出" ? -1 : 1))) {
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
  const [state, setState] = useState<AutoPortfolioState>(() => autonomousPortfolioService.getState());
  const [search, setSearch] = useState("");
  const [tradeSide, setTradeSide] = useState<"全部" | "买入" | "卖出">("全部");
  const [closedResult, setClosedResult] = useState<"全部" | "盈利" | "亏损">("全部");
  const latest = state.snapshots[state.snapshots.length - 1];
  const positionValue = state.positions.reduce((sum, position) => sum + position.quantity * position.lastPrice, 0);
  const positionCost = state.positions.reduce((sum, position) => sum + position.quantity * position.averagePrice, 0);
  const unrealizedPnl = positionValue - positionCost;
  const realizedPnl = state.trades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
  const closedRecords = useMemo(() => buildClosedRecords(state.trades), [state.trades]);
  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = (symbol: string, companyName: string) => !normalizedSearch || symbol.toLowerCase().includes(normalizedSearch) || companyName.toLowerCase().includes(normalizedSearch);
  const filteredPositions = state.positions.filter((position) => matchesSearch(position.symbol, position.companyName));
  const filteredClosedRecords = closedRecords.filter(({ sell }) => matchesSearch(sell.symbol, sell.companyName) && (closedResult === "全部" || (closedResult === "盈利" ? (sell.realizedPnl ?? 0) >= 0 : (sell.realizedPnl ?? 0) < 0)));
  const filteredTrades = state.trades.filter((trade) => matchesSearch(trade.symbol, trade.companyName) && (tradeSide === "全部" || trade.side === tradeSide));
  const latestBuyBySymbol = useMemo(() => {
    const result = new Map<string, AutoTrade>();
    for (const trade of [...state.trades].reverse()) if (trade.side === "买入") result.set(trade.symbol, trade);
    return result;
  }, [state.trades]);
  const dailyRecords = [...state.snapshots].reverse().slice(0, 30);

  function exportTrades() {
    const rows = [
      ["模拟时间", "操作", "股票代码", "股票名称", "数量", "成交价", "成交金额", "费用", "已实现盈亏", "决定依据"],
      ...state.trades.map((trade) => [`D${trade.day} 收盘`, trade.side, trade.symbol, trade.companyName, trade.quantity, trade.price, (trade.quantity * trade.price).toFixed(2), trade.fee, trade.realizedPnl ?? "", trade.reason]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `A股虚拟交易记录-D${state.day}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="v2-page portfolio-record-page">
      <div className="v2-hero record-hero">
        <div>
          <span className="tag green"><BookOpenText size={14} /> 虚拟账户记录</span>
          <h1>资金与交易记录</h1>
          <p>集中查看剩余资金、当前持仓、买入卖出时间、数量、金额、费用以及每笔交易的盈亏变化。</p>
        </div>
        <div className="record-actions"><button className="ghost-button" onClick={exportTrades}><Download size={16} /> 导出记录</button><button className="status" onClick={() => setState(autonomousPortfolioService.getState())}><RefreshCw size={16} /> 刷新记录</button></div>
      </div>

      <div className="v2-card record-filter-bar">
        <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索股票代码或名称" /></label>
        <label><span>资金流水</span><select value={tradeSide} onChange={(event) => setTradeSide(event.target.value as typeof tradeSide)}><option>全部</option><option>买入</option><option>卖出</option></select></label>
        <label><span>已完成交易</span><select value={closedResult} onChange={(event) => setClosedResult(event.target.value as typeof closedResult)}><option>全部</option><option>盈利</option><option>亏损</option></select></label>
      </div>

      <div className="record-stat-grid">
        <div className="v2-card auto-stat"><WalletCards /><span>当前总资产</span><strong>{formatCompactMoney(latest.equity)}</strong><small>累计 {formatSignedPct(latest.cumulativeReturn)}</small></div>
        <div className="v2-card auto-stat"><Banknote /><span>剩余可用资金</span><strong>{formatCompactMoney(state.cash)}</strong><small>资金占比 {latest.equity ? ((state.cash / latest.equity) * 100).toFixed(1) : "0.0"}%</small></div>
        <div className="v2-card auto-stat"><TrendingUp /><span>当前持仓市值</span><strong>{formatCompactMoney(positionValue)}</strong><small>{state.positions.length} 只股票</small></div>
        <div className="v2-card auto-stat"><BookOpenText /><span>累计总盈亏</span><strong className={latest.equity >= state.initialCapital ? "positive" : "negative"}>{formatCompactMoney(latest.equity - state.initialCapital)}</strong><small>已实现 {formatCompactMoney(realizedPnl)} · 浮盈亏 {formatCompactMoney(unrealizedPnl)}</small></div>
      </div>

      <div className="v2-card">
        <div className="v2-card-head"><div><h2>当前持仓</h2><small>当前价格和盈利情况随模拟交易日更新</small></div></div>
        {filteredPositions.length ? <div className="table-scroll"><table className="stock-table record-table">
          <thead><tr><th>股票</th><th>买入时间</th><th>数量</th><th>买入价</th><th>投入金额</th><th>当前价</th><th>当前市值</th><th>浮动盈亏</th><th>收益率</th></tr></thead>
          <tbody>{filteredPositions.map((position) => {
            const buy = latestBuyBySymbol.get(position.symbol);
            const cost = position.quantity * position.averagePrice;
            const value = position.quantity * position.lastPrice;
            const pnl = value - cost;
            const pnlPct = cost ? pnl / cost * 100 : 0;
            return <tr key={position.symbol}>
              <td><b>{position.symbol}</b><small>{position.companyName}</small></td>
              <td>{simulatedTime(buy?.day ?? position.openedDay)}</td><td>{position.quantity.toLocaleString("zh-CN")} 股</td>
              <td>{formatMoney(position.averagePrice)}</td><td>{formatMoney(cost)}</td><td>{formatMoney(position.lastPrice)}</td><td>{formatMoney(value)}</td>
              <td className={pnl >= 0 ? "positive" : "negative"}>{formatMoney(pnl)}</td><td className={pnlPct >= 0 ? "positive" : "negative"}>{formatSignedPct(pnlPct)}</td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="muted-note">当前没有持仓。自主操盘系统建仓后，记录会自动显示在这里。</p>}
      </div>

      <div className="v2-card">
        <div className="v2-card-head"><div><h2>已完成买卖</h2><small>一行对应一次完整的买入至卖出过程</small></div></div>
        {filteredClosedRecords.length ? <div className="table-scroll"><table className="stock-table record-table">
          <thead><tr><th>股票</th><th>买入时间</th><th>卖出时间</th><th>数量</th><th>买入金额</th><th>卖出金额</th><th>费用</th><th>已实现盈亏</th><th>卖出原因</th></tr></thead>
          <tbody>{filteredClosedRecords.map(({ buy, sell }) => {
            const pnl = sell.realizedPnl ?? 0;
            return <tr key={sell.id}><td><b>{sell.symbol}</b><small>{sell.companyName}</small></td><td>{simulatedTime(buy.day)}</td><td>{simulatedTime(sell.day)}</td><td>{sell.quantity.toLocaleString("zh-CN")} 股</td><td>{formatMoney(buy.quantity * buy.price)}</td><td>{formatMoney(sell.quantity * sell.price)}</td><td>{formatMoney(buy.fee + sell.fee)}</td><td className={pnl >= 0 ? "positive" : "negative"}>{formatMoney(pnl)}</td><td>{sell.reason}</td></tr>;
          })}</tbody>
        </table></div> : <p className="muted-note">还没有完成卖出的交易。</p>}
      </div>

      <div className="v2-card">
        <div className="v2-card-head"><div><h2>逐笔资金流水</h2><small>共 {state.trades.length} 笔，最新记录在前</small></div></div>
        {filteredTrades.length ? <div className="table-scroll"><table className="stock-table record-table">
          <thead><tr><th>时间</th><th>操作</th><th>股票</th><th>数量</th><th>成交价</th><th>成交金额</th><th>费用</th><th>资金变化</th><th>决定依据</th></tr></thead>
          <tbody>{filteredTrades.map((trade) => {
            const gross = trade.quantity * trade.price;
            const cashChange = trade.side === "买入" ? -(gross + trade.fee) : gross - trade.fee;
            return <tr key={trade.id}><td>{simulatedTime(trade.day)}</td><td><span className={`tag ${trade.side === "买入" ? "green" : "red"}`}>{trade.side}</span></td><td><b>{trade.symbol}</b><small>{trade.companyName}</small></td><td>{trade.quantity.toLocaleString("zh-CN")} 股</td><td>{formatMoney(trade.price)}</td><td>{formatMoney(gross)}</td><td>{formatMoney(trade.fee)}</td><td className={cashChange >= 0 ? "positive" : "negative"}>{cashChange >= 0 ? "+" : ""}{formatMoney(cashChange)}</td><td>{trade.reason}</td></tr>;
          })}</tbody>
        </table></div> : <p className="muted-note">暂无资金流水。</p>}
      </div>

      <div className="v2-card">
        <div className="v2-card-head"><div><h2>每日资产变化</h2><small>显示最近 30 个模拟交易日</small></div></div>
        <div className="table-scroll"><table className="stock-table record-table compact-table">
          <thead><tr><th>时间</th><th>总资产</th><th>剩余资金</th><th>持仓市值</th><th>当日变化</th><th>累计收益</th><th>回撤</th></tr></thead>
          <tbody>{dailyRecords.map((snapshot) => {
            const prior = state.snapshots.find((item) => item.day === snapshot.day - 1);
            const dailyChange = prior ? snapshot.equity - prior.equity : 0;
            return <tr key={snapshot.day}><td>D{snapshot.day}</td><td>{formatMoney(snapshot.equity)}</td><td>{formatMoney(snapshot.cash)}</td><td>{formatMoney(snapshot.equity - snapshot.cash)}</td><td className={dailyChange >= 0 ? "positive" : "negative"}>{dailyChange >= 0 ? "+" : ""}{formatMoney(dailyChange)}</td><td className={snapshot.cumulativeReturn >= 0 ? "positive" : "negative"}>{formatSignedPct(snapshot.cumulativeReturn)}</td><td className="negative">{formatSignedPct(snapshot.drawdown)}</td></tr>;
          })}</tbody>
        </table></div>
      </div>

      <p className="mock-note">所有时间均为模拟交易日，不对应真实日期；所有成交、资金和盈亏均为虚拟数据。</p>
    </section>
  );
}
