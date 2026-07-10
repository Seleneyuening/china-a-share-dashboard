export type AlertRuleType =
  | "stock_rank_top_n"
  | "stock_new_top50"
  | "group_volume_above"
  | "stock_change_above"
  | "stock_change_below"
  | "stock_heat_above";

export type AlertRule = {
  id: string;
  type: AlertRuleType;
  symbol?: string;
  groupId?: string;
  threshold?: number;
  enabled: boolean;
  createdAt: string;
  label: string;
};

export type AlertTrigger = {
  id: string;
  ruleId: string;
  message: string;
  triggeredAt: string;
};
