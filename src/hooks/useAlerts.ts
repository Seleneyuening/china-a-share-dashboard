import { useEffect, useState } from "react";
import { alertStorage } from "../services/alertStorage";
import { runAlertEngine } from "../services/alertEngine";
import type { AlertContext } from "../services/alertEngine";
import type { AlertRule, AlertTrigger } from "../types/alerts";

export function useAlerts(ready: boolean, ctx: AlertContext) {
  const [rules, setRules] = useState<AlertRule[]>(() => alertStorage.getRules());
  const [triggeredRuleIds, setTriggeredRuleIds] = useState<Set<string>>(() => new Set(alertStorage.getActiveRuleIds()));
  const [triggerLog, setTriggerLog] = useState<AlertTrigger[]>(() => alertStorage.getTriggers());

  useEffect(() => {
    if (!ready) return;
    const { triggeredRuleIds: nextTriggered, newTriggers } = runAlertEngine(rules, ctx);
    setTriggeredRuleIds(new Set(nextTriggered));
    if (newTriggers.length) setTriggerLog(alertStorage.getTriggers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rules, ctx.stocks, ctx.top50Rows, ctx.groupSummaries]);

  function createRule(rule: AlertRule) {
    alertStorage.addRule(rule);
    setRules(alertStorage.getRules());
  }

  function toggleRule(id: string) {
    alertStorage.toggleRule(id);
    setRules(alertStorage.getRules());
  }

  function removeRule(id: string) {
    alertStorage.removeRule(id);
    setRules(alertStorage.getRules());
  }

  function clearHistory() {
    alertStorage.clearTriggers();
    setTriggerLog([]);
  }

  return { rules, triggeredRuleIds, triggerLog, createRule, toggleRule, removeRule, clearHistory };
}
