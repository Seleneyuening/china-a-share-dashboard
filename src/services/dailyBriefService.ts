import type { AnomalyRow, GroupRotationSeries } from "../types/anomaly";
import type { DailyBrief, DailyBriefRotationMove } from "../types/dailyBrief";
import type { StockQuoteMock, ThemeGroupSummary } from "../types/themeGroup";
import type { Top50ChangeSummary } from "../types/topVolume";

function buildRotationMoves(rotation: GroupRotationSeries): { up?: DailyBriefRotationMove; down?: DailyBriefRotationMove } {
  if (rotation.data.length < 2) return {};
  const first = rotation.data[0];
  const last = rotation.data[rotation.data.length - 1];
  const moves = rotation.lines
    .map((line) => {
      const fromRank = first[line.id];
      const toRank = last[line.id];
      if (typeof fromRank !== "number" || typeof toRank !== "number") return null;
      return { groupName: line.name, fromRank, toRank, delta: fromRank - toRank };
    })
    .filter((move): move is NonNullable<typeof move> => move !== null);

  const up = [...moves].sort((a, b) => b.delta - a.delta)[0];
  const down = [...moves].sort((a, b) => a.delta - b.delta)[0];
  return {
    up: up && up.delta > 0 ? { groupName: up.groupName, fromRank: up.fromRank, toRank: up.toRank } : undefined,
    down: down && down.delta < 0 ? { groupName: down.groupName, fromRank: down.fromRank, toRank: down.toRank } : undefined,
  };
}

function buildSatelliteNote(satellites: StockQuoteMock[]): string {
  const uvxy = satellites.find((stock) => stock.symbol === "UVXY");
  const soxl = satellites.find((stock) => stock.symbol === "SOXL");
  const qqq = satellites.find((stock) => stock.symbol === "QQQ");
  if (!uvxy || !soxl || !qqq) return "市场卫星数据不完整。";
  const riskOff = uvxy.changePct > 3 && (soxl.changePct < 0 || qqq.changePct < 0);
  const riskOn = uvxy.changePct < -3 && soxl.changePct > 0 && qqq.changePct > 0;
  if (riskOff) return `UVXY ${uvxy.changePct >= 0 ? "+" : ""}${uvxy.changePct.toFixed(2)}%，SOXL/QQQ 走弱，市场风险偏好降温。`;
  if (riskOn) return `UVXY ${uvxy.changePct.toFixed(2)}%，SOXL/QQQ 走强，市场风险偏好回暖。`;
  return "市场卫星涨跌互现，没有明显的一致性信号。";
}

export function buildDailyBrief(
  groupSummaries: ThemeGroupSummary[],
  anomalyRows: AnomalyRow[],
  rotation: GroupRotationSeries,
  satellites: StockQuoteMock[],
  top50Summary?: Top50ChangeSummary,
): DailyBrief {
  const rankedGroups = [...groupSummaries].sort((a, b) => b.dollarVolume - a.dollarVolume);
  const topGroup = rankedGroups[0];
  const weakGroup = rankedGroups[rankedGroups.length - 1];
  const topMovers = [...anomalyRows]
    .sort((a, b) => Math.max(Math.abs(b.changePct ?? 0), b.heatRatio ?? 0) - Math.max(Math.abs(a.changePct ?? 0), a.heatRatio ?? 0))
    .slice(0, 3)
    .map((row) => ({
      symbol: row.symbol,
      companyName: row.companyName,
      typeLabel: row.typeLabel,
      changePct: row.changePct,
      heatRatio: row.heatRatio,
      currentRank: row.currentRank,
    }));
  const { up, down } = buildRotationMoves(rotation);

  const newTop50Rows = [...(top50Summary?.newRows ?? [])].sort((a, b) => (b.currentDollarVolume ?? 0) - (a.currentDollarVolume ?? 0));
  const newTop50Highlight = newTop50Rows[0] && newTop50Rows[0].currentRank !== undefined
    ? { symbol: newTop50Rows[0].symbol, companyName: newTop50Rows[0].companyName, rank: newTop50Rows[0].currentRank!, dollarVolume: newTop50Rows[0].currentDollarVolume ?? 0 }
    : undefined;

  const biggestUpRow = top50Summary?.biggestUp[0];
  const biggestRankUpStock = biggestUpRow && biggestUpRow.previousRank !== undefined && biggestUpRow.currentRank !== undefined
    ? { symbol: biggestUpRow.symbol, companyName: biggestUpRow.companyName, fromRank: biggestUpRow.previousRank!, toRank: biggestUpRow.currentRank! }
    : undefined;

  const biggestDownRow = top50Summary?.biggestDown[0];
  const biggestRankDownStock = biggestDownRow && biggestDownRow.previousRank !== undefined && biggestDownRow.currentRank !== undefined
    ? { symbol: biggestDownRow.symbol, companyName: biggestDownRow.companyName, fromRank: biggestDownRow.previousRank!, toRank: biggestDownRow.currentRank! }
    : undefined;

  return {
    topGroup: topGroup ? { name: topGroup.group.name, dollarVolume: topGroup.dollarVolume, top50Count: topGroup.top50Count, groupSize: topGroup.stocks.length } : undefined,
    weakGroup: weakGroup && weakGroup !== topGroup ? { name: weakGroup.group.name, dollarVolume: weakGroup.dollarVolume } : undefined,
    topMovers,
    newTop50Highlight,
    newTop50Symbols: (top50Summary?.newRows ?? []).map((row) => row.symbol),
    outTop50Symbols: (top50Summary?.outRows ?? []).map((row) => row.symbol),
    biggestRankUpStock,
    biggestRankDownStock,
    rotationUp: up,
    rotationDown: down,
    satellites: satellites.map((stock) => ({ symbol: stock.symbol, changePct: stock.changePct })),
    satelliteNote: buildSatelliteNote(satellites),
    watchSymbols: [...new Set(anomalyRows.slice(0, 4).map((row) => row.symbol))],
  };
}
