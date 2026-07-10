import { Trash2 } from "lucide-react";
import type { AlertRule } from "../../types/alerts";

export function AlertRuleList({ rules, triggeredRuleIds, onToggle, onRemove }: { rules: AlertRule[]; triggeredRuleIds: Set<string>; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  if (!rules.length) {
    return (
      <div className="v2-card">
        <h2>我的提醒规则</h2>
        <p className="muted-note">还没有创建提醒，先在上方新建一条吧。</p>
      </div>
    );
  }
  return (
    <div className="v2-card">
      <h2>我的提醒规则（{rules.length}）</h2>
      <ul className="alert-rule-list">
        {rules.map((rule) => {
          const active = triggeredRuleIds.has(rule.id);
          return (
            <li key={rule.id} className={rule.enabled ? "" : "disabled"}>
              <span className={`live-dot ${active ? "" : "idle"}`} />
              <span className="rule-label">{rule.label}</span>
              <label className="check">
                <input type="checkbox" checked={rule.enabled} onChange={() => onToggle(rule.id)} /> 启用
              </label>
              <button className="icon-button" aria-label="删除" onClick={() => onRemove(rule.id)}><Trash2 size={16} /></button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
