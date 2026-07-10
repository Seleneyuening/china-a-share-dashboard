import { useState } from "react";
import type { AlertRule, AlertTrigger } from "../../types/alerts";

export function AlertCenter({ rules, triggeredRuleIds, triggerLog, onClearHistory }: { rules: AlertRule[]; triggeredRuleIds: Set<string>; triggerLog: AlertTrigger[]; onClearHistory: () => void }) {
  const [tab, setTab] = useState<"triggered" | "pending">("triggered");
  const pendingRules = rules.filter((rule) => rule.enabled && !triggeredRuleIds.has(rule.id));

  return (
    <aside className="v2-card alert-center">
      <div className="v2-card-head">
        <h2>提醒中心</h2>
        {tab === "triggered" && triggerLog.length > 0 && <button className="ghost-button" onClick={onClearHistory}>清空记录</button>}
      </div>
      <div className="segmented">
        <button className={tab === "triggered" ? "active" : ""} onClick={() => setTab("triggered")}>已触发 ({triggerLog.length})</button>
        <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>未触发 ({pendingRules.length})</button>
      </div>
      {tab === "triggered" ? (
        triggerLog.length ? (
          <ul className="alert-log-list">
            {triggerLog.map((trigger) => (
              <li key={trigger.id}>
                <span>{trigger.message}</span>
                <small>{trigger.triggeredAt}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-note">还没有触发记录。</p>
        )
      ) : pendingRules.length ? (
        <ul className="alert-log-list">
          {pendingRules.map((rule) => (
            <li key={rule.id}>
              <span>{rule.label}</span>
              <small>等待触发</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-note">所有启用的提醒都已触发。</p>
      )}
    </aside>
  );
}
