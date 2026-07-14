import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Gauge } from "lucide-react";
import { marketDataService } from "../services/marketDataService";
import { snapshotHistoryService } from "../services/snapshotHistoryService";
import { buildStrategyStats, paperStrategyService } from "../services/paperStrategyService";
import {
  buildExposure,
  buildStrategyFit,
  buildStrategyHealth,
  calculateBenchmarkCorrelation,
  detectMarketRegime,
  runStressTest,
  stressPresets,
  type StressResult,
} from "../services/portfolioLabService";
import type { DailySnapshotRow } from "../types/snapshotHistory";
import type { PaperPortfolioSnapshot, PaperPosition, PaperStrategy } from "../types/paperStrategy";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

const satelliteSymbols = ["QQQ", "SPY", "SOXL", "UVXY", "SLV"];

function fitTone(score: number): "green" | "yellow" | "red" {
  if (score >= 70) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

function healthTone(status: string): "green" | "yellow" | "red" {
  if (status === "healthy") return "green";
  if (status === "degrading") return "red";
  return "yellow";
}

export function PortfolioCommandPage() {
  const groups = useMemo(() => marketDataService.getWatchlistGroups(), []);
  const [history, setHistory] = useState<DailySnapshotRow[]>([]);
  const [strategies, setStrategies] = useState<PaperStrategy[]>([]);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [snapshots, setSnapshots] = useState<PaperPortfolioSnapshot[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, string>>({});
  const [allocationSaveState, setAllocationSaveState] = useState<"idle" | "saving" | "done">("idle");
  const [activeStress, setActiveStress] = useState<StressResult>();

  function reloadPaperData() {
    return Promise.all([
      paperStrategyService.listStrategies(),
      paperStrategyService.listPositions(),
      paperStrategyService.listPortfolioSnapshots(),
    ]).then(([strategyRows, positionRows, snapshotRows]) => {
      setStrategies(strategyRows);
      setPositions(positionRows);
      setSnapshots(snapshotRows);
      setAllocationDrafts(Object.fromEntries(strategyRows.map((strategy) => [strategy.id, strategy.allocation_pct != null ? String(strategy.allocation_pct) : ""])));
    });
  }

  useEffect(() => {
    const symbols = [...marketDataService.getStockQuotes().map((stock) => stock.symbol), ...satelliteSymbols];
    Promise.all([
      snapshotHistoryService.getSymbolHistory(symbols, 30),
      reloadPaperData(),
    ])
      .then(([historyRows]) => {
        setHistory(historyRows);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regime = useMemo(() => detectMarketRegime(history, groups), [history, groups]);

  const latestPriceBySymbol = useMemo(() => {
    const dates = [...new Set(history.map((row) => row.date))].sort();
    const latestDate = dates[dates.length - 1];
    return new Map(history.filter((row) => row.date === latestDate && typeof row.price === "number").map((row) => [row.symbol, row.price as number]));
  }, [history]);

  const latestSnapshot = snapshots[snapshots.length - 1];
  const openPositions = useMemo(() => positions.filter((position) => position.status === "open"), [positions]);
  const equity = latestSnapshot?.equity ?? 100_000;
  const exposure = useMemo(() => buildExposure(openPositions, latestPriceBySymbol, groups, equity), [openPositions, latestPriceBySymbol, groups, equity]);
  const strategyNameById = useMemo(() => new Map(strategies.map((strategy) => [strategy.id, strategy.name])), [strategies]);
  const qqqCorrelation = useMemo(() => calculateBenchmarkCorrelation(snapshots, "qqq_cumulative_return"), [snapshots]);

  const allocationSum = strategies.reduce((sum, strategy) => {
    const draft = Number(allocationDrafts[strategy.id]);
    return sum + (Number.isFinite(draft) && draft > 0 ? draft : 0);
  }, 0);
  const cashRemainderPct = Math.max(0, 100 - allocationSum);

  async function saveAllocations() {
    setAllocationSaveState("saving");
    for (const strategy of strategies) {
      const raw = allocationDrafts[strategy.id];
      const value = Number(raw);
      const next = raw !== "" && Number.isFinite(value) && value > 0 ? value : null;
      if (next !== (strategy.allocation_pct ?? null)) {
        await paperStrategyService.setAllocation(strategy.id, next);
      }
    }
    await reloadPaperData();
    setAllocationSaveState("done");
    window.setTimeout(() => setAllocationSaveState("idle"), 2500);
  }

  return (
    <section className="v2-page portfolio-command-page">
      <div className="v2-hero compact">
        <div>
          <h1>组合指挥中心</h1>
          <p>动态资金配置、风险暴露与压力测试——全部基于虚拟资金，不构成投资建议</p>
        </div>
      </div>

      {status === "loading" && <p className="muted-note">加载中…</p>}
      {status === "error" && <p className="muted-note">数据加载失败，请刷新重试。</p>}

      {status === "ready" && (
        <>
          <div className="command-top-grid">
            <div className="v2-card portfolio-stats command-stats">
              <div><b>{formatCompactMoney(Math.round(equity))}</b><span>虚拟总资产</span></div>
              <div><b>{latestSnapshot ? formatCompactMoney(Math.round(latestSnapshot.cash)) : "—"}</b><span>现金（{latestSnapshot && latestSnapshot.equity ? ((latestSnapshot.cash / latestSnapshot.equity) * 100).toFixed(0) : "—"}%）</span></div>
              <div><b className={(latestSnapshot?.cumulative_return ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedPct(latestSnapshot?.cumulative_return ?? 0)}</b><span>累计变化</span></div>
              <div><b className="negative">{formatSignedPct(latestSnapshot?.drawdown ?? 0)}</b><span>最大回撤</span></div>
              <div><b>{latestSnapshot?.qqq_cumulative_return !== undefined ? formatSignedPct(latestSnapshot.qqq_cumulative_return) : "—"}</b><span>基准 QQQ</span></div>
              <div><b>{latestSnapshot?.spy_cumulative_return !== undefined ? formatSignedPct(latestSnapshot.spy_cumulative_return) : "—"}</b><span>基准 SPY</span></div>
            </div>
            <div className="v2-card regime-card">
              <div className="v2-card-head">
                <h2><Gauge size={16} /> 市场环境识别</h2>
                <span className="tag">{regime.latestDate ?? "—"}</span>
              </div>
              <div className="regime-state">
                <strong>{regime.stateLabel}</strong>
                <span className="muted-note">规则符合度 {regime.confidence}%（非涨跌预测概率）</span>
              </div>
              {regime.evidence.length > 0 && (
                <ul className="regime-evidence">
                  {regime.evidence.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              )}
              {regime.risks.map((risk, index) => (
                <p key={index} className="regime-risk"><AlertTriangle size={13} /> {risk}</p>
              ))}
            </div>
          </div>

          <div className="v2-card">
            <div className="v2-card-head">
              <h2>策略资金分配</h2>
              <div className="allocation-summary">
                <span className={cashRemainderPct < 10 ? "negative" : "muted-note"}>
                  已分配 {allocationSum.toFixed(0)}% · 现金 {cashRemainderPct.toFixed(0)}%{cashRemainderPct < 10 ? "（低于 10% 现金缓冲）" : ""}
                </span>
                <button className="ghost-button" disabled={allocationSaveState === "saving" || allocationSum > 100} onClick={saveAllocations}>
                  {allocationSaveState === "saving" ? "保存中…" : allocationSaveState === "done" ? "已保存" : "保存分配"}
                </button>
              </div>
            </div>
            {allocationSum > 100 && <p className="negative">分配比例合计超过 100%，请调整后再保存。</p>}
            {strategies.length ? (
              <table className="stock-table">
                <thead>
                  <tr><th>策略</th><th>状态</th><th>分配比例 %</th><th>对应资金</th><th>当前持仓</th><th>适配度（当前环境）</th><th>健康状态</th></tr>
                </thead>
                <tbody>
                  {strategies.map((strategy) => {
                    const strategyPositions = positions.filter((position) => position.strategy_id === strategy.id);
                    const openCount = strategyPositions.filter((position) => position.status === "open").length;
                    const stats = buildStrategyStats(strategyPositions);
                    const health = buildStrategyHealth(strategyPositions);
                    const fit = buildStrategyFit(strategy, regime);
                    const draft = allocationDrafts[strategy.id] ?? "";
                    const draftValue = Number(draft);
                    return (
                      <tr key={strategy.id}>
                        <td><b>{strategy.name}</b><small>持有 {strategy.hold_days} 日 · 最多 {strategy.max_positions} 仓 · 已完成 {stats.sampleSize} 笔</small></td>
                        <td><span className={`tag ${strategy.enabled ? "green" : "red"}`}>{strategy.enabled ? "运行中" : "已暂停"}</span></td>
                        <td>
                          <input
                            className="allocation-input"
                            type="number"
                            min={0}
                            max={100}
                            value={draft}
                            placeholder="未设置"
                            onChange={(event) => setAllocationDrafts((current) => ({ ...current, [strategy.id]: event.target.value }))}
                          />
                        </td>
                        <td>{Number.isFinite(draftValue) && draftValue > 0 ? formatCompactMoney(100_000 * (draftValue / 100)) : "等分模式"}</td>
                        <td>{openCount}</td>
                        <td><span className={`tag ${fitTone(fit)}`}>{fit}/100</span></td>
                        <td><span className={`tag ${healthTone(health.status)}`} title={health.detail}>{health.statusLabel}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="muted-note">还没有模拟策略——先在「模式实验室」创建，或让每日引擎自动运行后再回来。</p>}
          </div>

          <div className="command-two-col">
            <div className="v2-card">
              <div className="v2-card-head"><h2>组合暴露分析</h2></div>
              {openPositions.length ? (
                <>
                  <h3 className="exposure-heading">股票级</h3>
                  <ul className="exposure-list">
                    {exposure.bySymbol.map((entry) => (
                      <li key={entry.label}><span>{entry.label}</span><b>{entry.pctOfEquity}%</b><small>{formatCompactMoney(Math.round(entry.valueUsd))}</small></li>
                    ))}
                  </ul>
                  <h3 className="exposure-heading">主题级</h3>
                  <ul className="exposure-list">
                    {exposure.byTheme.map((entry) => (
                      <li key={entry.label}><span>{entry.label}</span><b>{entry.pctOfEquity}%</b><small>{formatCompactMoney(Math.round(entry.valueUsd))}</small></li>
                    ))}
                  </ul>
                  <h3 className="exposure-heading">因子级（简化）</h3>
                  <ul className="exposure-list">
                    {exposure.byFactor.map((entry) => (
                      <li key={entry.label}><span>{entry.label}</span><b>{entry.pctOfEquity}%</b><small>{formatCompactMoney(Math.round(entry.valueUsd))}</small></li>
                    ))}
                  </ul>
                  <div className="summary-grid">
                    <div><b>{exposure.top5ConcentrationPct}%</b><span>前 5 大持仓集中度</span></div>
                    <div><b>{qqqCorrelation !== undefined ? qqqCorrelation : "数据积累中"}</b><span>与 QQQ 相关性（≥10 个交易日后显示）</span></div>
                  </div>
                </>
              ) : <p className="muted-note">当前没有持仓，暴露分析将在策略建仓后显示。</p>}
            </div>

            <div className="v2-card">
              <div className="v2-card-head"><h2>压力测试</h2></div>
              <p className="muted-note">基于简化线性冲击假设对当前持仓的模拟，并非真实损失预测。</p>
              <div className="stress-preset-row">
                {stressPresets.map((preset) => (
                  <button
                    key={preset.id}
                    className={`ghost-button ${activeStress?.presetName === preset.name ? "active-stress" : ""}`}
                    title={preset.description}
                    onClick={() => setActiveStress(runStressTest(preset, openPositions, latestPriceBySymbol, groups, strategyNameById, equity))}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              {activeStress ? (
                openPositions.length ? (
                  <div className="stress-result">
                    <div className="summary-grid">
                      <div><b className="negative">{formatSignedPct(activeStress.portfolioImpactPct)}</b><span>组合预计变化</span></div>
                      <div><b className="negative">{formatCompactMoney(Math.abs(activeStress.portfolioImpactUsd))}</b><span>预计虚拟损失</span></div>
                    </div>
                    <h3 className="exposure-heading">最大损失来源（股票）</h3>
                    <ul className="exposure-list">
                      {activeStress.byStock.slice(0, 5).map((entry) => (
                        <li key={entry.label}><span>{entry.label}</span><b className="negative">{formatSignedPct(entry.lossPctOfEquity)}</b><small>{formatCompactMoney(Math.round(Math.abs(entry.lossUsd)))}</small></li>
                      ))}
                    </ul>
                    <h3 className="exposure-heading">受影响策略</h3>
                    <ul className="exposure-list">
                      {activeStress.byStrategy.map((entry) => (
                        <li key={entry.label}><span>{entry.label}</span><b className="negative">{formatSignedPct(entry.lossPctOfEquity)}</b><small>{formatCompactMoney(Math.round(Math.abs(entry.lossUsd)))}</small></li>
                      ))}
                    </ul>
                  </div>
                ) : <p className="muted-note">当前没有持仓，冲击对组合无影响（现金 100%）。</p>
              ) : <p className="muted-note">点击上方任意场景运行压力测试。</p>}
            </div>
          </div>
        </>
      )}

      <p className="mock-note">组合指挥中心基于虚拟资金与每日快照计算；市场环境「置信度」仅表示规则符合程度，压力测试基于简化假设，均不构成投资建议。</p>
    </section>
  );
}
