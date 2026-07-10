import { useEffect, useMemo, useState } from "react";
import { AlertCenter } from "../components/alerts/AlertCenter";
import { AlertRuleForm } from "../components/alerts/AlertRuleForm";
import { AlertRuleList } from "../components/alerts/AlertRuleList";
import { marketDataService } from "../services/marketDataService";
import { topVolumeService } from "../services/topVolumeService";
import { alertStorage } from "../services/alertStorage";
import { runAlertEngine } from "../services/alertEngine";
import type { AlertRule, AlertTrigger } from "../types/alerts";

export function AlertsPage() {
  const [stocks] = useState(() => marketDataService.getStockQuotes());
  const [liveDataReady] = useState(true);
  const [rules, setRules] = useState<AlertRule[]>(() => alertStorage.getRules());
  const [triggeredRuleIds, setTriggeredRuleIds] = useState<Set<string>>(() => new Set(alertStorage.getActiveRuleIds()));
  const [triggerLog, setTriggerLog] = useState<AlertTrigger[]>(() => alertStorage.getTriggers());

  const top50 = useMemo(() => topVolumeService.getComparison(stocks), [stocks]);
  const top50Symbols = useMemo(() => new Set(top50.currentTop50.map((entry) => entry.symbol)), [top50.currentTop50]);
  const groupSummaries = useMemo(() => marketDataService.getThemeGroupSummaries(top50Symbols, stocks), [top50Symbols, stocks]);

  useEffect(() => {
    if (!liveDataReady) return;
    const { triggeredRuleIds: nextTriggered, newTriggers } = runAlertEngine(rules, { stocks, top50Rows: top50.rows, groupSummaries });
    setTriggeredRuleIds(new Set(nextTriggered));
    if (newTriggers.length) setTriggerLog(alertStorage.getTriggers());
  }, [liveDataReady, rules, stocks, top50.rows, groupSummaries]);

  function handleCreate(rule: AlertRule) {
    alertStorage.addRule(rule);
    setRules(alertStorage.getRules());
  }

  function handleToggle(id: string) {
    alertStorage.toggleRule(id);
    setRules(alertStorage.getRules());
  }

  function handleRemove(id: string) {
    alertStorage.removeRule(id);
    setRules(alertStorage.getRules());
  }

  function handleClearHistory() {
    alertStorage.clearTriggers();
    setTriggerLog([]);
  }

  const symbols = useMemo(() => stocks.map((stock) => stock.symbol), [stocks]);
  const groups = useMemo(() => marketDataService.getWatchlistGroups(), []);

  return (
    <section className="v2-page alerts-page">
      <div className="v2-hero compact">
        <div>
          <h1>自定义提醒</h1>
          <p>本地保存的提醒规则，条件触发时会在这里高亮，不需要登录或推送。</p>
        </div>
      </div>
      <div className="alerts-grid">
        <div className="alerts-main">
          <AlertRuleForm symbols={symbols} groups={groups} onCreate={handleCreate} />
          <AlertRuleList rules={rules} triggeredRuleIds={triggeredRuleIds} onToggle={handleToggle} onRemove={handleRemove} />
        </div>
        <AlertCenter rules={rules} triggeredRuleIds={triggeredRuleIds} triggerLog={triggerLog} onClearHistory={handleClearHistory} />
      </div>
      <p className="mock-note">提醒规则保存在本地浏览器（localStorage），换设备或清除浏览器数据后需要重新创建；仅供信息参考，不构成任何投资建议。</p>
    </section>
  );
}
