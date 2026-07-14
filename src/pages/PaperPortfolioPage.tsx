import { Fragment, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { paperStrategyService } from "../services/paperStrategyService";
import type { PaperPortfolioSnapshot, PaperPosition, PaperStrategy } from "../types/paperStrategy";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

const baseGrid = { stroke: "#1d3044", strokeDasharray: "3 3" };

export function PaperPortfolioPage() {
  const [snapshots, setSnapshots] = useState<PaperPortfolioSnapshot[]>([]);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [strategies, setStrategies] = useState<PaperStrategy[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [expandedId, setExpandedId] = useState<string>();

  useEffect(() => {
    Promise.all([
      paperStrategyService.listPortfolioSnapshots(),
      paperStrategyService.listPositions(),
      paperStrategyService.listStrategies(),
    ])
      .then(([snapshotRows, positionRows, strategyRows]) => {
        setSnapshots(snapshotRows);
        setPositions(positionRows);
        setStrategies(strategyRows);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const strategyNameById = useMemo(() => new Map(strategies.map((strategy) => [strategy.id, strategy.name])), [strategies]);
  const latest = snapshots[snapshots.length - 1];
  const openPositions = positions.filter((position) => position.status === "open");

  const chartData = snapshots.map((snapshot) => ({
    date: snapshot.date,
    strategy: snapshot.cumulative_return ?? 0,
    qqq: snapshot.qqq_cumulative_return,
    spy: snapshot.spy_cumulative_return,
  }));

  return (
    <section className="v2-page paper-portfolio-page">
      <div className="v2-hero compact">
        <div>
          <h1>虚拟组合</h1>
          <p>模拟策略共享的虚拟资金组合，仅供参考，不构成投资建议</p>
        </div>
      </div>

      {status === "loading" && <p className="muted-note">加载中…</p>}
      {status === "error" && <p className="muted-note">数据加载失败。</p>}

      {status === "ready" && !latest && (
        <p className="muted-note">还没有任何组合快照——先在「策略实验室」启用一个策略，等下一次每日收盘后自动运行，就会生成第一条记录。</p>
      )}

      {status === "ready" && latest && (
        <>
          <div className="v2-card portfolio-stats">
            <div><b>{formatCompactMoney(latest.equity)}</b><span>总资产</span></div>
            <div><b>{formatCompactMoney(latest.cash)}</b><span>现金（{latest.equity ? ((latest.cash / latest.equity) * 100).toFixed(0) : 0}%）</span></div>
            <div><b className={(latest.daily_return ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedPct(latest.daily_return ?? 0)}</b><span>今日变化</span></div>
            <div><b className={(latest.cumulative_return ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedPct(latest.cumulative_return ?? 0)}</b><span>累计变化</span></div>
            <div><b className={(latest.qqq_cumulative_return ?? 0) >= 0 ? "positive" : "negative"}>{latest.qqq_cumulative_return !== undefined ? formatSignedPct(latest.qqq_cumulative_return) : "—"}</b><span>基准 QQQ</span></div>
            <div><b className={(latest.spy_cumulative_return ?? 0) >= 0 ? "positive" : "negative"}>{latest.spy_cumulative_return !== undefined ? formatSignedPct(latest.spy_cumulative_return) : "—"}</b><span>基准 SPY</span></div>
            <div><b className="negative">{formatSignedPct(latest.drawdown ?? 0)}</b><span>最大回撤</span></div>
          </div>

          {chartData.length > 1 && (
            <div className="v2-card">
              <div className="v2-card-head"><h2>组合模拟表现</h2></div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid {...baseGrid} />
                  <XAxis dataKey="date" stroke="#8ea0b4" />
                  <YAxis stroke="#8ea0b4" tickFormatter={(value) => `${value}%`} />
                  <Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} />
                  <Line type="monotone" dataKey="strategy" name="虚拟组合" stroke="#2f83ff" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="qqq" name="QQQ" stroke="#4fd06f" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="spy" name="SPY" stroke="#ffd24a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="v2-card">
            <div className="v2-card-head"><h2>当前持仓（{openPositions.length}）</h2></div>
            {openPositions.length ? (
              <table className="stock-table">
                <thead>
                  <tr><th>股票</th><th>所属策略</th><th>建仓时间</th><th>建仓价格</th><th>数量</th><th></th></tr>
                </thead>
                <tbody>
                  {openPositions.map((position) => {
                    const isExpanded = expandedId === position.id;
                    return (
                      <Fragment key={position.id}>
                        <tr onClick={() => setExpandedId(isExpanded ? undefined : position.id)}>
                          <td><b>{position.symbol}</b></td>
                          <td>{strategyNameById.get(position.strategy_id) ?? "—"}</td>
                          <td>{position.opened_at}</td>
                          <td>${position.entry_price.toFixed(2)}</td>
                          <td>{position.quantity}</td>
                          <td>{isExpanded ? "收起" : "详情"}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="reason-row">
                            <td colSpan={6}>
                              <div className="reason-card">
                                <strong>触发时的市场环境</strong>
                                <ul>
                                  <li>所属主题组：{position.trigger_snapshot?.groupId ?? "—"}</li>
                                  <li>主题组当日排名：{position.trigger_snapshot?.groupRank ?? "—"}</li>
                                  <li>主题组成交金额：{position.trigger_snapshot?.groupDollarVolume ? formatCompactMoney(position.trigger_snapshot.groupDollarVolume) : "—"}</li>
                                  {position.trigger_snapshot?.satellites && Object.entries(position.trigger_snapshot.satellites).map(([symbol, value]) => (
                                    <li key={symbol}>{symbol}：{typeof value === "number" ? formatSignedPct(value) : "—"}</li>
                                  ))}
                                </ul>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="muted-note">当前没有持仓。</p>}
          </div>
        </>
      )}

      <p className="mock-note">虚拟组合基于模拟策略每日自动运行生成，初始资金 $100,000，不涉及真实资金，不构成投资建议。</p>
    </section>
  );
}
