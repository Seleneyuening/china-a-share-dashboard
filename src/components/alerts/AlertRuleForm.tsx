import { useState } from "react";
import type { AlertRule, AlertRuleType } from "../../types/alerts";
import type { WatchlistGroup } from "../../types/themeGroup";
import { ruleTypeMeta } from "./ruleTypeMeta";
import { describeRule } from "../../services/alertEngine";

export function AlertRuleForm({ symbols, groups, onCreate }: { symbols: string[]; groups: WatchlistGroup[]; onCreate: (rule: AlertRule) => void }) {
  const [type, setType] = useState<AlertRuleType>("stock_rank_top_n");
  const meta = ruleTypeMeta[type];
  const [symbol, setSymbol] = useState(symbols[0] || "");
  const [groupId, setGroupId] = useState<string>(groups[0]?.id || "");
  const [threshold, setThreshold] = useState(meta.thresholdDefault ?? 0);

  function handleTypeChange(nextType: AlertRuleType) {
    setType(nextType);
    setThreshold(ruleTypeMeta[nextType].thresholdDefault ?? 0);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const storedThreshold = meta.thresholdUnit === "money" ? threshold * 1_000_000_000 : meta.thresholdUnit === "percent" && type === "stock_change_below" ? -Math.abs(threshold) : threshold;
    const rule: AlertRule = {
      id: `rule-${Date.now()}`,
      type,
      symbol: meta.needsSymbol ? symbol : undefined,
      groupId: meta.needsGroup ? groupId : undefined,
      threshold: meta.needsThreshold ? storedThreshold : undefined,
      enabled: true,
      createdAt: new Date().toISOString(),
      label: "",
    };
    rule.label = describeRule(rule);
    onCreate(rule);
    setThreshold(meta.thresholdDefault ?? 0);
  }

  return (
    <form className="v2-card alert-form" onSubmit={handleSubmit}>
      <h2>新建提醒</h2>
      <div className="alert-form-row">
        <label>
          <span>条件类型</span>
          <select value={type} onChange={(event) => handleTypeChange(event.target.value as AlertRuleType)}>
            {Object.entries(ruleTypeMeta).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </select>
        </label>
        {meta.needsSymbol && (
          <label>
            <span>股票</span>
            <select value={symbol} onChange={(event) => setSymbol(event.target.value)}>
              {symbols.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        )}
        {meta.needsGroup && (
          <label>
            <span>主题组</span>
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
        )}
        {meta.needsThreshold && (
          <label>
            <span>{meta.thresholdLabel}</span>
            <input type="number" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
          </label>
        )}
      </div>
      <button className="status" type="submit">创建提醒</button>
    </form>
  );
}
