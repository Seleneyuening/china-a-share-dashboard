import { alertStorage } from "./alertStorage";
import { calculateDollarVolume, calculateVolumeHeat } from "./calculations";
import type { AlertRule, AlertTrigger } from "../types/alerts";
import type { StockQuoteMock, ThemeGroupSummary } from "../types/themeGroup";
import type { TopVolumeComparisonRow } from "../types/topVolume";
import { formatCompactMoney, formatSignedPct } from "../utils/format";

export type AlertContext = {
  stocks: StockQuoteMock[];
  top50Rows: TopVolumeComparisonRow[];
  groupSummaries: ThemeGroupSummary[];
};

function findStock(ctx: AlertContext, symbol?: string): StockQuoteMock | undefined {
  return ctx.stocks.find((stock) => stock.symbol === symbol);
}

function findRow(ctx: AlertContext, symbol?: string): TopVolumeComparisonRow | undefined {
  return ctx.top50Rows.find((row) => row.symbol === symbol);
}

function findGroup(ctx: AlertContext, groupId?: string): ThemeGroupSummary | undefined {
  return ctx.groupSummaries.find((summary) => summary.group.id === groupId);
}

export function describeRule(rule: AlertRule): string {
  const threshold = rule.threshold ?? 0;
  switch (rule.type) {
    case "stock_rank_top_n":
      return `${rule.symbol} 进入成交金额 Top ${threshold}`;
    case "stock_new_top50":
      return `${rule.symbol} 新进 Top 50`;
    case "group_volume_above":
      return `所属组成交金额超过 ${formatCompactMoney(threshold)}`;
    case "stock_change_above":
      return `${rule.symbol} 涨幅超过 +${threshold}%`;
    case "stock_change_below":
      return `${rule.symbol} 跌幅超过 -${Math.abs(threshold)}%`;
    case "stock_heat_above":
      return `${rule.symbol} 成交热度超过 ${threshold}x`;
    default:
      return "自定义提醒";
  }
}

function evaluateRule(rule: AlertRule, ctx: AlertContext): { triggered: boolean; message: string } {
  const threshold = rule.threshold ?? 0;
  switch (rule.type) {
    case "stock_rank_top_n": {
      const row = findRow(ctx, rule.symbol);
      const rank = row?.currentRank;
      return { triggered: !!rank && rank <= threshold, message: `${rule.symbol} 当前排名 #${rank ?? "—"}，已进入 Top ${threshold}` };
    }
    case "stock_new_top50": {
      const row = findRow(ctx, rule.symbol);
      return { triggered: row?.status === "NEW", message: `${rule.symbol} 新进 Top 50，当前排名 #${row?.currentRank ?? "—"}` };
    }
    case "group_volume_above": {
      const summary = findGroup(ctx, rule.groupId);
      const triggered = !!summary && summary.dollarVolume >= threshold;
      return { triggered, message: `${summary?.group.name ?? "该组"} 成交金额 ${formatCompactMoney(summary?.dollarVolume ?? 0)}，超过 ${formatCompactMoney(threshold)}` };
    }
    case "stock_change_above": {
      const stock = findStock(ctx, rule.symbol);
      const triggered = !!stock && stock.changePct >= threshold;
      return { triggered, message: `${rule.symbol} 涨幅 ${formatSignedPct(stock?.changePct ?? 0)}，超过 +${threshold}%` };
    }
    case "stock_change_below": {
      const stock = findStock(ctx, rule.symbol);
      const triggered = !!stock && stock.changePct <= threshold;
      return { triggered, message: `${rule.symbol} 跌幅 ${formatSignedPct(stock?.changePct ?? 0)}，超过 -${Math.abs(threshold)}%` };
    }
    case "stock_heat_above": {
      const stock = findStock(ctx, rule.symbol);
      if (!stock) return { triggered: false, message: "" };
      const dollarVolume = stock.dollarVolume ?? calculateDollarVolume(stock.price, stock.volume);
      const previousDollarVolume = stock.previousDollarVolume ?? calculateDollarVolume(stock.price, stock.previousVolume);
      const heat = calculateVolumeHeat(dollarVolume, previousDollarVolume);
      return { triggered: heat.ratio >= threshold, message: `${rule.symbol} 成交热度 ${heat.ratio}x，超过 ${threshold}x` };
    }
    default:
      return { triggered: false, message: "" };
  }
}

export function runAlertEngine(rules: AlertRule[], ctx: AlertContext): { triggeredRuleIds: string[]; newTriggers: AlertTrigger[] } {
  const previousActive = new Set(alertStorage.getActiveRuleIds());
  const triggeredRuleIds: string[] = [];
  const newTriggers: AlertTrigger[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const { triggered, message } = evaluateRule(rule, ctx);
    if (!triggered) continue;
    triggeredRuleIds.push(rule.id);
    if (!previousActive.has(rule.id)) {
      newTriggers.push({
        id: `${rule.id}-${Date.now()}`,
        ruleId: rule.id,
        message,
        triggeredAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      });
    }
  }

  alertStorage.setActiveRuleIds(triggeredRuleIds);
  if (newTriggers.length) alertStorage.addTriggers(newTriggers);
  return { triggeredRuleIds, newTriggers };
}
