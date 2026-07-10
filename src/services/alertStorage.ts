import type { AlertRule, AlertTrigger } from "../types/alerts";

const rulesKey = "a-share-dashboard-alert-rules";
const triggersKey = "a-share-dashboard-alert-triggers";
const activeStateKey = "a-share-dashboard-alert-active-state";
const maxTriggers = 50;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export const alertStorage = {
  getRules(): AlertRule[] {
    return readJson<AlertRule[]>(rulesKey, []);
  },
  saveRules(rules: AlertRule[]): void {
    localStorage.setItem(rulesKey, JSON.stringify(rules));
  },
  addRule(rule: AlertRule): void {
    this.saveRules([...this.getRules(), rule]);
  },
  removeRule(id: string): void {
    this.saveRules(this.getRules().filter((rule) => rule.id !== id));
  },
  toggleRule(id: string): void {
    this.saveRules(this.getRules().map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule)));
  },
  getTriggers(): AlertTrigger[] {
    return readJson<AlertTrigger[]>(triggersKey, []);
  },
  addTriggers(newTriggers: AlertTrigger[]): void {
    if (!newTriggers.length) return;
    const merged = [...newTriggers, ...this.getTriggers()].slice(0, maxTriggers);
    localStorage.setItem(triggersKey, JSON.stringify(merged));
  },
  clearTriggers(): void {
    localStorage.setItem(triggersKey, JSON.stringify([]));
  },
  getActiveRuleIds(): string[] {
    return readJson<string[]>(activeStateKey, []);
  },
  setActiveRuleIds(ids: string[]): void {
    localStorage.setItem(activeStateKey, JSON.stringify(ids));
  },
};
