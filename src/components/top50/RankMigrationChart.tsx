import type { TopVolumeComparisonRow } from "../../types/topVolume";

export function RankMigrationChart({ rows, activeSymbol, onHover, showAll }: { rows: TopVolumeComparisonRow[]; activeSymbol?: string; onHover: (symbol?: string) => void; showAll: boolean }) {
  const visibleLimit = showAll ? 50 : 6;
  const shared = rows.filter((row) => row.previousRank && row.currentRank && row.previousRank <= visibleLimit && row.currentRank <= visibleLimit);
  const biggest = new Set([...shared].sort((a, b) => Math.abs(b.rankChange || 0) - Math.abs(a.rankChange || 0)).slice(0, 15).map((row) => row.symbol));
  const rowHeight = 42;
  const height = visibleLimit * rowHeight;
  const y = (rank: number) => rowHeight / 2 + (rank - 1) * rowHeight;
  return (
    <svg className="migration-chart" viewBox={`0 0 320 ${height}`} preserveAspectRatio="none">
      <defs>
        <filter id="migrationGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="migrationSoftGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {shared.map((row) => {
        const change = row.rankChange || 0;
        const important = biggest.has(row.symbol);
        const active = activeSymbol === row.symbol;
        const color = change > 0 ? "#ff6f82" : change < 0 ? "#4dcf9a" : "#718196";
        const opacity = active ? 1 : important ? 0.68 : 0.12;
        const startY = y(row.previousRank!);
        const endY = y(row.currentRank!);
        const curve = `M 8 ${startY} C 96 ${startY}, 224 ${endY}, 312 ${endY}`;
        const endpointRadius = active ? 3.6 : important ? 2.4 : 1.5;
        return (
          <g key={row.symbol} onMouseEnter={() => onHover(row.symbol)} onMouseLeave={() => onHover(undefined)}>
            <path d={curve} fill="none" stroke={color} strokeWidth={active ? 9 : important ? 6 : 3} opacity={opacity * 0.14} strokeLinecap="round" filter="url(#migrationSoftGlow)" />
            <path d={curve} fill="none" stroke={color} strokeWidth={active ? 5.5 : important ? 3.2 : 1.6} opacity={opacity * 0.28} strokeLinecap="round" filter="url(#migrationGlow)" />
            <path d={curve} fill="none" stroke={color} strokeWidth={active ? 3.2 : important ? 1.8 : 1} opacity={opacity} strokeLinecap="round" />
            <circle cx="8" cy={startY} r={endpointRadius} fill={color} opacity={opacity} />
            <circle cx="312" cy={endY} r={endpointRadius} fill={color} opacity={opacity} />
          </g>
        );
      })}
    </svg>
  );
}
