import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { marketDataService } from "../services/marketDataService";
import { snapshotHistoryService } from "../services/snapshotHistoryService";
import { isPatternTriggeredToday, matchPattern } from "../services/patternLabService";
import { patternLabStorage } from "../services/patternLabStorage";
import { paperStrategyService } from "../services/paperStrategyService";
import type { DailySnapshotRow } from "../types/snapshotHistory";
import type { PatternCondition, PatternDefinition, PatternOperator } from "../types/patternLab";
import type { WatchlistGroup } from "../types/themeGroup";
import { formatSignedPct } from "../utils/format";

const holdDaysOptions = [1, 3, 5, 10];

const conditionLabels: Record<PatternCondition["kind"], string> = {
  group_rank: "主题组排名",
  group_rank_streak: "主题组连续排名",
  group_top50_count: "主题组 Top 50 入选数",
  group_concentration: "主题组资金集中度",
  stock_change_pct: "股票涨跌幅",
  stock_top50_rank: "股票 Top 50 排名",
  stock_rank_move: "股票排名变化",
  satellite_change_pct: "市场卫星涨跌幅",
};

const operatorLabels: Record<string, string> = { lte: "≤", gte: "≥", lt: "<", gt: ">", eq: "=", new: "新进" };
const operatorOptions: PatternOperator[] = ["lte", "gte", "lt", "gt", "eq"];
const satelliteSymbols = ["QQQ", "SPY", "SOXL", "UVXY", "SLV"];
const windows = [1, 3, 5, 10];

function defaultConditionForKind(kind: PatternCondition["kind"], groups: WatchlistGroup[]): PatternCondition {
  const groupId = groups.find((group) => !group.satelliteOnly)?.id ?? "";
  switch (kind) {
    case "group_rank": return { kind, groupId, operator: "lte", value: 3 };
    case "group_rank_streak": return { kind, groupId, rank: 1, minDays: 3 };
    case "group_top50_count": return { kind, groupId, operator: "gte", value: 8 };
    case "group_concentration": return { kind, groupId, operator: "lt", value: 65 };
    case "stock_change_pct": return { kind, symbol: "NVDA", operator: "gt", value: 2 };
    case "stock_top50_rank": return { kind, symbol: "NVDA", operator: "lte", value: 5 };
    case "stock_rank_move": return { kind, symbol: "NVDA", operator: "gte", value: 10 };
    case "satellite_change_pct": return { kind, symbol: "SOXL", operator: "gt", value: 2 };
  }
}

function ConditionInputs({ condition, groups, stockSymbols, onChange }: { condition: PatternCondition; groups: WatchlistGroup[]; stockSymbols: string[]; onChange: (next: PatternCondition) => void }) {
  switch (condition.kind) {
    case "group_rank":
    case "group_top50_count":
    case "group_concentration":
      return (
        <>
          <select value={condition.groupId} onChange={(event) => onChange({ ...condition, groupId: event.target.value })}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <select value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as PatternOperator })}>
            {operatorOptions.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
          </select>
          <input type="number" value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) })} />
        </>
      );
    case "group_rank_streak":
      return (
        <>
          <select value={condition.groupId} onChange={(event) => onChange({ ...condition, groupId: event.target.value })}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <span className="pattern-condition-label">连续排名 ≤ 第</span>
          <input type="number" value={condition.rank} onChange={(event) => onChange({ ...condition, rank: Number(event.target.value) })} />
          <span className="pattern-condition-label">名，至少</span>
          <input type="number" value={condition.minDays} onChange={(event) => onChange({ ...condition, minDays: Number(event.target.value) })} />
          <span className="pattern-condition-label">天</span>
        </>
      );
    case "stock_change_pct":
    case "stock_rank_move":
      return (
        <>
          <select value={condition.symbol} onChange={(event) => onChange({ ...condition, symbol: event.target.value })}>
            {stockSymbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
          </select>
          <select value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as PatternOperator })}>
            {operatorOptions.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
          </select>
          <input type="number" value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) })} />
        </>
      );
    case "stock_top50_rank":
      return (
        <>
          <select value={condition.symbol} onChange={(event) => onChange({ ...condition, symbol: event.target.value })}>
            {stockSymbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
          </select>
          <select value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as PatternOperator | "new" })}>
            <option value="new">新进</option>
            {operatorOptions.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
          </select>
          {condition.operator !== "new" && <input type="number" value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) })} />}
        </>
      );
    case "satellite_change_pct":
      return (
        <>
          <select value={condition.symbol} onChange={(event) => onChange({ ...condition, symbol: event.target.value })}>
            {satelliteSymbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
          </select>
          <select value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as PatternOperator })}>
            {operatorOptions.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
          </select>
          <input type="number" value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) })} />
        </>
      );
  }
}

function ForwardStatsTable({ focusSymbol, forwardStats }: { focusSymbol: string; forwardStats: ReturnType<typeof matchPattern>["forwardStats"] }) {
  return (
    <table className="stock-table">
      <thead>
        <tr>
          <th>观察窗口</th>
          <th>样本量</th>
          <th>{focusSymbol} 中位表现</th>
          <th>QQQ 中位表现</th>
          <th>最好 / 最差</th>
          <th>最大回撤</th>
        </tr>
      </thead>
      <tbody>
        {forwardStats.map((stat) => (
          <tr key={stat.window}>
            <td>{stat.window} 日后</td>
            <td><b>{stat.sampleSize}</b></td>
            <td>
              {stat.sampleSize ? (
                <span className={(stat.medianFocusReturnPct ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedPct(stat.medianFocusReturnPct ?? 0)}</span>
              ) : <span className="muted-note">暂无历史样本，无法判断</span>}
            </td>
            <td>
              {stat.medianBenchmarkReturnPct !== undefined ? (
                <span className={stat.medianBenchmarkReturnPct >= 0 ? "positive" : "negative"}>{formatSignedPct(stat.medianBenchmarkReturnPct)}</span>
              ) : "—"}
            </td>
            <td>{stat.sampleSize ? `${formatSignedPct(stat.bestCasePct ?? 0)} / ${formatSignedPct(stat.worstCasePct ?? 0)}` : "—"}</td>
            <td>{stat.maxDrawdownPct !== undefined ? formatSignedPct(stat.maxDrawdownPct) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PatternCard({ pattern, history, groups, onRemove }: { pattern: PatternDefinition; history: DailySnapshotRow[]; groups: WatchlistGroup[]; onRemove: () => void }) {
  const { triggered, latestDate } = useMemo(() => isPatternTriggeredToday(pattern.conditions, history, groups), [pattern, history, groups]);
  const matchResult = useMemo(() => matchPattern(pattern.conditions, pattern.focusSymbol, pattern.windows, history, groups), [pattern, history, groups]);
  const lastMatched = matchResult.matchedDates[matchResult.matchedDates.length - 1];

  const defaultGroupId = useMemo(() => {
    const conditionWithGroup = pattern.conditions.find((condition): condition is Extract<PatternCondition, { groupId: string }> => "groupId" in condition);
    return conditionWithGroup?.groupId ?? groups.find((group) => !group.satelliteOnly)?.id ?? "";
  }, [pattern.conditions, groups]);

  const [showStrategyForm, setShowStrategyForm] = useState(false);
  const [strategyName, setStrategyName] = useState(pattern.name);
  const [rankBy, setRankBy] = useState<"dollarVolume" | "changePct">("dollarVolume");
  const [top, setTop] = useState(3);
  const [requirePositiveChange, setRequirePositiveChange] = useState(true);
  const [holdDays, setHoldDays] = useState(5);
  const [maxPositions, setMaxPositions] = useState(3);
  const [allocationPct, setAllocationPct] = useState("");
  const [strategyStatus, setStrategyStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function createStrategy() {
    setStrategyStatus("saving");
    try {
      const allocation = Number(allocationPct);
      await paperStrategyService.createStrategy({
        name: strategyName.trim() || pattern.name,
        entry_conditions: pattern.conditions,
        selection_rule: { groupId: defaultGroupId, rankBy, top, requirePositiveChange },
        hold_days: holdDays,
        max_positions: maxPositions,
        allocation_pct: Number.isFinite(allocation) && allocation > 0 ? allocation : undefined,
      });
      setStrategyStatus("done");
    } catch {
      setStrategyStatus("error");
    }
  }

  return (
    <div className="pattern-card">
      <div className="pattern-card-head">
        <strong>{pattern.name}</strong>
        <span className={`tag ${triggered ? "green" : "red"}`}>{triggered ? "当前触发" : "未触发"}</span>
      </div>
      <small>截至：{latestDate ?? "—"} · 最近一次触发：{lastMatched ?? "—"}</small>
      <small>历史样本数：{matchResult.matchedDates.length}</small>
      <ul className="pattern-card-stats">
        {matchResult.forwardStats.slice(0, 3).map((stat) => (
          <li key={stat.window}>
            {stat.window} 日后 · 样本 {stat.sampleSize}
            {stat.sampleSize ? <> · 中位 <span className={(stat.medianFocusReturnPct ?? 0) >= 0 ? "positive" : "negative"}>{formatSignedPct(stat.medianFocusReturnPct ?? 0)}</span></> : ""}
          </li>
        ))}
      </ul>
      <div className="pattern-card-actions">
        <button className="ghost-button" onClick={onRemove}>删除模式</button>
        <button className="ghost-button" onClick={() => setShowStrategyForm((value) => !value)}>创建模拟策略</button>
      </div>
      {showStrategyForm && (
        <div className="pattern-strategy-form">
          <input value={strategyName} onChange={(event) => setStrategyName(event.target.value)} placeholder="策略名称" />
          <select value={rankBy} onChange={(event) => setRankBy(event.target.value as "dollarVolume" | "changePct")}>
            <option value="dollarVolume">按成交金额排名前 N</option>
            <option value="changePct">按涨跌幅排名前 N</option>
          </select>
          <input type="number" value={top} min={1} onChange={(event) => setTop(Number(event.target.value))} title="候选股票数量" />
          <label className="pattern-condition-label"><input type="checkbox" checked={requirePositiveChange} onChange={(event) => setRequirePositiveChange(event.target.checked)} /> 今日涨幅为正</label>
          <select value={holdDays} onChange={(event) => setHoldDays(Number(event.target.value))}>
            {holdDaysOptions.map((day) => <option key={day} value={day}>固定持有 {day} 个交易日</option>)}
          </select>
          <input type="number" value={maxPositions} min={1} onChange={(event) => setMaxPositions(Number(event.target.value))} title="最大持仓数" />
          <input type="number" value={allocationPct} min={1} max={100} placeholder="分配 %" onChange={(event) => setAllocationPct(event.target.value)} title="分配资金比例（留空为等分模式）" />
          <button className="ghost-button" disabled={strategyStatus === "saving"} onClick={createStrategy}>确认创建</button>
          {strategyStatus === "done" && <small className="positive">已创建，可在「策略实验室」查看</small>}
          {strategyStatus === "error" && <small className="negative">创建失败，请重试</small>}
        </div>
      )}
    </div>
  );
}

export function PatternLabPage() {
  const groups = useMemo(() => marketDataService.getWatchlistGroups(), []);
  const realGroups = useMemo(() => groups.filter((group) => !group.satelliteOnly), [groups]);
  const stockSymbols = useMemo(() => marketDataService.getStockQuotes().map((stock) => stock.symbol), []);
  const [history, setHistory] = useState<DailySnapshotRow[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [conditions, setConditions] = useState<PatternCondition[]>([{ kind: "group_rank", groupId: realGroups[0]?.id ?? "", operator: "lte", value: 3 }]);
  const [focusSymbol, setFocusSymbol] = useState("NVDA");
  const [patternName, setPatternName] = useState("");
  const [patterns, setPatterns] = useState<PatternDefinition[]>(() => patternLabStorage.getPatterns());

  useEffect(() => {
    const symbols = [...marketDataService.getStockQuotes().map((stock) => stock.symbol), ...satelliteSymbols];
    snapshotHistoryService.getSymbolHistory(symbols, 400)
      .then((rows) => {
        setHistory(rows);
        setHistoryStatus("ready");
      })
      .catch(() => setHistoryStatus("error"));
  }, []);

  const matchResult = useMemo(() => matchPattern(conditions, focusSymbol, windows, history, groups), [conditions, focusSymbol, history, groups]);

  function updateCondition(index: number, next: PatternCondition) {
    setConditions((current) => current.map((condition, i) => (i === index ? next : condition)));
  }
  function removeCondition(index: number) {
    setConditions((current) => current.filter((_, i) => i !== index));
  }
  function addCondition() {
    setConditions((current) => [...current, defaultConditionForKind("group_rank", groups)]);
  }
  function changeConditionKind(index: number, kind: PatternCondition["kind"]) {
    updateCondition(index, defaultConditionForKind(kind, groups));
  }

  function savePattern() {
    if (!patternName.trim() || !conditions.length) return;
    const pattern: PatternDefinition = {
      id: `pattern-${Date.now()}`,
      name: patternName.trim(),
      conditions,
      focusSymbol,
      windows,
      createdAt: new Date().toISOString(),
    };
    patternLabStorage.addPattern(pattern);
    setPatterns(patternLabStorage.getPatterns());
    setPatternName("");
  }

  function removePattern(id: string) {
    patternLabStorage.removePattern(id);
    setPatterns(patternLabStorage.getPatterns());
  }

  return (
    <section className="v2-page pattern-lab-page">
      <div className="v2-hero compact">
        <div>
          <h1>模式实验室</h1>
          <p>用历史成交金额、排名迁移与主题轮动数据验证市场模式，不构成投资建议</p>
        </div>
      </div>

      {historyStatus === "loading" && <p className="muted-note">历史数据加载中…</p>}
      {historyStatus === "error" && <p className="muted-note">历史数据加载失败，请稍后重试。</p>}

      <div className="pattern-lab-grid">
        <div className="v2-card pattern-builder">
          <div className="v2-card-head"><h2>条件构建器</h2></div>
          <p className="muted-note">全部条件（AND）· 事件条件（财报 / CPI / FOMC 等）暂不支持，需要历史事件数据</p>
          <ul className="pattern-condition-list">
            {conditions.map((condition, index) => (
              <li key={index} className="pattern-condition-row">
                <select value={condition.kind} onChange={(event) => changeConditionKind(index, event.target.value as PatternCondition["kind"])}>
                  {Object.entries(conditionLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                </select>
                <ConditionInputs condition={condition} groups={realGroups} stockSymbols={stockSymbols} onChange={(next) => updateCondition(index, next)} />
                <button className="icon-button" aria-label="删除条件" onClick={() => removeCondition(index)}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          <button className="ghost-button" onClick={addCondition}><Plus size={14} /> 添加条件</button>

          <div className="pattern-focus-row">
            <label>焦点股票（用于后续表现统计）</label>
            <select value={focusSymbol} onChange={(event) => setFocusSymbol(event.target.value)}>
              {stockSymbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
            </select>
          </div>

          <div className="pattern-save-row">
            <input placeholder="给这个模式起个名字…" value={patternName} onChange={(event) => setPatternName(event.target.value)} />
            <button className="ghost-button" disabled={!patternName.trim()} onClick={savePattern}>保存为模式</button>
          </div>
        </div>

        <div className="v2-card pattern-results">
          <div className="v2-card-head"><h2>匹配结果</h2></div>
          {matchResult.matchedDates.length ? (
            <p>历史出现 <b>{matchResult.matchedDates.length}</b> 次：{matchResult.matchedDates.join("、")}</p>
          ) : <p className="muted-note">当前条件在已有历史数据中暂无匹配。</p>}

          <div className="v2-card-head"><h2>后续表现统计</h2></div>
          <ForwardStatsTable focusSymbol={focusSymbol} forwardStats={matchResult.forwardStats} />
        </div>
      </div>

      <div className="v2-card">
        <div className="v2-card-head"><h2>模式卡片库</h2></div>
        {patterns.length ? (
          <div className="pattern-card-grid">
            {patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} history={history} groups={groups} onRemove={() => removePattern(pattern.id)} />
            ))}
          </div>
        ) : <p className="muted-note">还没有保存任何模式，先在上方构建条件并保存。</p>}
      </div>

      <p className="mock-note">模式实验室基于 Supabase 每日快照历史计算；样本量会随交易日积累而增加，当前历史天数较少，统计结果仅供参考，不构成投资建议。</p>
    </section>
  );
}
