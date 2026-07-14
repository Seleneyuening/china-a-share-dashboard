export function formatCompactMoney(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toLocaleString("en-US")}`;
}

export function formatSignedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
