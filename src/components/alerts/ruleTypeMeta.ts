import type { AlertRuleType } from "../../types/alerts";

export type ThresholdUnit = "count" | "percent" | "money" | "ratio";

export const ruleTypeMeta: Record<AlertRuleType, { label: string; needsSymbol: boolean; needsGroup: boolean; needsThreshold: boolean; thresholdLabel?: string; thresholdUnit?: ThresholdUnit; thresholdDefault?: number }> = {
  stock_rank_top_n: { label: "股票进入成交额 Top N", needsSymbol: true, needsGroup: false, needsThreshold: true, thresholdLabel: "Top 名次 N", thresholdUnit: "count", thresholdDefault: 3 },
  stock_new_top50: { label: "股票新进 Top 50", needsSymbol: true, needsGroup: false, needsThreshold: false },
  group_volume_above: { label: "主题组成交金额超过", needsSymbol: false, needsGroup: true, needsThreshold: true, thresholdLabel: "金额（十亿美元）", thresholdUnit: "money", thresholdDefault: 100 },
  stock_change_above: { label: "股票涨幅超过", needsSymbol: true, needsGroup: false, needsThreshold: true, thresholdLabel: "涨幅 %", thresholdUnit: "percent", thresholdDefault: 5 },
  stock_change_below: { label: "股票跌幅超过", needsSymbol: true, needsGroup: false, needsThreshold: true, thresholdLabel: "跌幅 %（填正数）", thresholdUnit: "percent", thresholdDefault: 5 },
  stock_heat_above: { label: "股票成交热度超过", needsSymbol: true, needsGroup: false, needsThreshold: true, thresholdLabel: "热度倍数 x", thresholdUnit: "ratio", thresholdDefault: 2 },
};
