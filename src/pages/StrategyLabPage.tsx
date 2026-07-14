import { useEffect, useMemo, useState } from "react";
import { buildStrategyStats, paperStrategyService } from "../services/paperStrategyService";
import type { PaperPosition, PaperStrategy } from "../types/paperStrategy";
import type { PatternCondition } from "../types/patternLab";
import { formatSignedPct } from "../utils/format";

const operatorLabels: Record<string, string> = { lte: "≤", gte: "≥", lt: "<", gt: ">", eq: "=", new: "新进" };

function describeCondition(condition: PatternCondition): string {
  switch (condition.kind) {
    case "group_rank": return `主题组排名 ${operatorLabels[condition.operator]} ${condition.value}`;
    case "group_rank_streak": return `主题组连续 ${condition.minDays} 天排名 ≤ 第 ${condition.rank} 名`;
    case "group_top50_count": return `主题组 Top 50 入选数 ${operatorLabels[condition.operator]} ${condition.value}`;
    case "group_concentration": return `主题组资金集中度 ${operatorLabels[condition.operator]} ${condition.value}%`;
    case "stock_change_pct": return `${condition.symbol} 涨跌幅 ${operatorLabels[condition.operator]} ${condition.value}%`;
    case "stock_top50_rank": return condition.operator === "new" ? `${condition.symbol} 新进 Top 50` : `${condition.symbol} Top 50 排名 ${operatorLabels[condition.operator]} ${condition.value}`;
    case "stock_rank_move": return `${condition.symbol} 排名变化 ${operatorLabels[condition.operator]} ${condition.value}`;
    case "satellite_change_pct": return `${condition.symbol} 涨跌幅 ${operatorLabels[condition.operator]} ${condition.value}%`;
  }
}

function StrategyCard({ strategy, onToggle, onDelete }: { strategy: PaperStrategy; onToggle: (enabled: boolean) => void; onDelete: () => void }) {
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    paperStrategyService.listPositions(strategy.id)
      .then((rows) => {
        setPositions(rows);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [strategy.id]);

  const openPositions = positions.filter((position) => position.status === "open");
  const stats = useMemo(() => buildStrategyStats(positions), [positions]);

  return (
    <div className="v2-card strategy-card">
      <div className="v2-card-head">
        <h2>{strategy.name}</h2>
        <div className="strategy-card-actions">
          <span className={`tag ${strategy.enabled ? "green" : "red"}`}>{strategy.enabled ? "运行中" : "已暂停"}</span>
          <button className="ghost-button" onClick={() => onToggle(!strategy.enabled)}>{strategy.enabled ? "暂停" : "启用"}</button>
          <button className="ghost-button" onClick={onDelete}>删除</button>
        </div>
      </div>
      <ul className="strategy-condition-list">
        {strategy.entry_conditions.map((condition, index) => <li key={index}>{describeCondition(condition)}</li>)}
      </ul>
      <p className="muted-note">
        选股：{strategy.selection_rule.rankBy === "dollarVolume" ? "成交金额" : "涨跌幅"}前 {strategy.selection_rule.top} 名
        {strategy.selection_rule.requirePositiveChange ? "，今日涨幅为正" : ""} · 固定持有 {strategy.hold_days} 个交易日 · 最多 {strategy.max_positions} 个持仓
      </p>
      {status === "loading" && <p className="muted-note">加载中…</p>}
      {status === "error" && <p className="muted-note">持仓数据加载失败。</p>}
      {status === "ready" && (
        <div className="summary-grid">
          <div><b>{openPositions.length}</b><span>当前持仓</span></div>
          <div><b>{stats.sampleSize}</b><span>历史完成交易（样本量）</span></div>
          <div>
            {stats.sampleSize ? <b className={(stats.medianReturnPct ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedPct(stats.medianReturnPct ?? 0)}</b> : <b className="muted-note">暂无样本</b>}
            <span>中位表现</span>
          </div>
          <div><b>{stats.sampleSize ? `${stats.winRate}%` : "—"}</b><span>胜率</span></div>
          <div><b>{stats.sampleSize ? formatSignedPct(stats.maxDrawdownPct ?? 0) : "—"}</b><span>交易序列最大回撤</span></div>
        </div>
      )}
      {openPositions.length > 0 && (
        <table className="stock-table">
          <thead><tr><th>股票</th><th>建仓日</th><th>建仓价</th><th>数量</th></tr></thead>
          <tbody>
            {openPositions.map((position) => (
              <tr key={position.id}><td>{position.symbol}</td><td>{position.opened_at}</td><td>${position.entry_price.toFixed(2)}</td><td>{position.quantity}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function StrategyLabPage() {
  const [strategies, setStrategies] = useState<PaperStrategy[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  function reload() {
    setStatus("loading");
    paperStrategyService.listStrategies()
      .then((rows) => {
        setStrategies(rows);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    reload();
  }, []);

  async function toggleStrategy(id: string, enabled: boolean) {
    await paperStrategyService.toggleStrategy(id, enabled);
    reload();
  }

  async function deleteStrategy(id: string) {
    await paperStrategyService.deleteStrategy(id);
    reload();
  }

  return (
    <section className="v2-page strategy-lab-page">
      <div className="v2-hero compact">
        <div>
          <h1>策略实验室</h1>
          <p>从模式实验室创建的模拟策略在这里运行，使用虚拟资金，不构成投资建议</p>
        </div>
      </div>

      {status === "loading" && <p className="muted-note">加载中…</p>}
      {status === "error" && <p className="muted-note">策略数据加载失败。</p>}
      {status === "ready" && !strategies.length && <p className="muted-note">还没有模拟策略，先去「模式实验室」保存一个模式并点击「创建模拟策略」。</p>}

      <div className="strategy-list">
        {strategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            onToggle={(enabled) => toggleStrategy(strategy.id, enabled)}
            onDelete={() => deleteStrategy(strategy.id)}
          />
        ))}
      </div>

      <p className="mock-note">策略实验室基于虚拟资金每日自动模拟，不连接券商、不真实下单；样本量随策略运行天数积累，统计结果仅供参考，不构成投资建议。</p>
    </section>
  );
}
