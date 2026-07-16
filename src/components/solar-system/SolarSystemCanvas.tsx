import type { ThemeGroupId, ThemeGroupSummary } from "../../types/themeGroup";
import { ThemePlanet } from "./ThemePlanet";

export function SolarSystemCanvas({ summaries, updatedAt, quoteStatus }: { summaries: ThemeGroupSummary[]; updatedAt: string; quoteStatus: string }) {
  const byId = new Map(summaries.map((summary) => [summary.group.id, summary]));
  const rankOrder: Array<[ThemeGroupId, number]> = [
    ["ai-semiconductors", 1],
    ["cloud-ai-software", 2],
    ["internet-attention", 3],
    ["crypto-onchain", 4],
    ["space-mobility", 5],
    ["clean-energy-resources", 6],
    ["healthcare-pharma", 7],
    ["consumer-defensive", 8],
  ];
  const ranked = rankOrder.map(([id, rank]) => ({ summary: byId.get(id), rank })).filter((item): item is { summary: ThemeGroupSummary; rank: number } => Boolean(item.summary));
  return (
    <div className="solar-canvas">
      <div className="solar-canvas-head">
        <div>
          <p>按自选池成交金额排序，缺失行情不参与计算 <span>ⓘ</span></p>
        </div>
        <div className="solar-live"><span className="live-dot" /> {quoteStatus} {updatedAt}</div>
        <div className="solar-mode"><button className="active">成交金额</button><button>平均涨跌幅</button></div>
      </div>
      <div className="theme-rank-grid">
        {ranked.map(({ summary, rank }) => <ThemePlanet key={summary.group.id} summary={summary} rank={rank} />)}
      </div>
    </div>
  );
}
