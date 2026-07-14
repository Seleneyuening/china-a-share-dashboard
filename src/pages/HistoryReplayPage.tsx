import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { SolarSystemCanvas } from "../components/solar-system/SolarSystemCanvas";
import { GroupStockTable } from "../components/monitoring/GroupStockTable";
import { Top50Table } from "../components/top50/Top50Table";
import { marketDataService } from "../services/marketDataService";
import {
  buildComparisonRows,
  buildDerivedEvents,
  buildGroupSummaries,
  buildSatelliteRows,
  buildStockQuoteMocks,
  buildTop50Entries,
  distinctTimestamps,
  getDayHistory,
} from "../services/intradayHistoryService";
import type { IntradaySnapshotRow, ReplayEvent } from "../types/intradayHistory";
import { formatSignedPct } from "../utils/format";

const speeds = [1, 2, 4] as const;
type Speed = typeof speeds[number];
const speedIntervalMs: Record<Speed, number> = { 1: 900, 2: 450, 4: 225 };

function todayEtDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function shiftDate(date: string, deltaDays: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  return parsed.toISOString().slice(0, 10);
}

function formatEtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function HistoryReplayPage() {
  const [date, setDate] = useState(todayEtDate);
  const [rows, setRows] = useState<IntradaySnapshotRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [timestampIndex, setTimestampIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const groups = useMemo(() => marketDataService.getWatchlistGroups().filter((group) => !group.satelliteOnly), []);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id ?? "");

  useEffect(() => {
    setStatus("loading");
    setPlaying(false);
    getDayHistory(date)
      .then((nextRows) => {
        setRows(nextRows);
        setStatus("ready");
        const timestamps = distinctTimestamps(nextRows);
        setTimestampIndex(Math.max(timestamps.length - 1, 0));
      })
      .catch(() => setStatus("error"));
  }, [date]);

  const timestamps = useMemo(() => distinctTimestamps(rows), [rows]);
  const events = useMemo(() => buildDerivedEvents(rows), [rows]);

  useEffect(() => {
    if (!playing || timestamps.length === 0) return;
    if (timestampIndex >= timestamps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setTimestampIndex((index) => Math.min(index + 1, timestamps.length - 1)), speedIntervalMs[speed]);
    return () => window.clearTimeout(timer);
  }, [playing, timestampIndex, timestamps.length, speed]);

  const capturedAt = timestamps[timestampIndex];
  const previousCapturedAt = timestampIndex > 0 ? timestamps[timestampIndex - 1] : undefined;

  const stocksAtTime = useMemo(() => (capturedAt ? buildStockQuoteMocks(rows, capturedAt, previousCapturedAt) : []), [rows, capturedAt, previousCapturedAt]);
  const top50EntriesAtTime = useMemo(() => (capturedAt ? buildTop50Entries(rows, capturedAt) : []), [rows, capturedAt]);
  const top50EntriesPrevious = useMemo(() => (previousCapturedAt ? buildTop50Entries(rows, previousCapturedAt) : []), [rows, previousCapturedAt]);
  const comparisonRows = useMemo(() => buildComparisonRows(top50EntriesPrevious, top50EntriesAtTime), [top50EntriesPrevious, top50EntriesAtTime]);
  const comparisonBySymbol = useMemo(() => new Map(comparisonRows.map((row) => [row.symbol, row])), [comparisonRows]);
  const top50SymbolsAtTime = useMemo(() => new Set(top50EntriesAtTime.map((entry) => entry.symbol)), [top50EntriesAtTime]);
  const groupSummariesAtTime = useMemo(() => buildGroupSummaries(stocksAtTime, top50SymbolsAtTime), [stocksAtTime, top50SymbolsAtTime]);
  const satellitesAtTime = useMemo(() => (capturedAt ? buildSatelliteRows(rows, capturedAt) : []), [rows, capturedAt]);
  const selectedGroupStocks = groupSummariesAtTime.find((summary) => summary.group.id === selectedGroupId)?.stocks ?? [];

  function jumpToEvent(event: ReplayEvent) {
    const index = timestamps.indexOf(event.capturedAt);
    if (index >= 0) {
      setPlaying(false);
      setTimestampIndex(index);
    }
  }

  return (
    <section className="v2-page history-replay-page">
      <div className="v2-hero compact">
        <div>
          <h1>历史回放</h1>
          <p>回放任意时间点的市场状态，观察资金流向与结构变化</p>
        </div>
        <div className="v2-toolbar">
          <button className="icon-button" aria-label="前一天" onClick={() => setDate((current) => shiftDate(current, -1))}><ChevronLeft size={16} /></button>
          <input type="date" value={date} max={todayEtDate()} onChange={(event) => setDate(event.target.value)} />
          <button className="icon-button" aria-label="后一天" disabled={date >= todayEtDate()} onClick={() => setDate((current) => shiftDate(current, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>

      {status === "loading" && <p className="muted-note">加载中…</p>}
      {status === "error" && <p className="muted-note">历史数据加载失败，请稍后重试。</p>}
      {status === "ready" && timestamps.length === 0 && (
        <p className="muted-note">该日期暂无盘中快照数据。V6 的每 5 分钟抓取需要外部定时器（GitHub Actions）触发，配置好并开始运行后，数据会逐步积累。</p>
      )}

      {status === "ready" && timestamps.length > 0 && (
        <>
          <div className="v2-card replay-scrubber">
            <div className="replay-time-label">{formatEtTime(capturedAt)} ET</div>
            <input
              type="range"
              min={0}
              max={timestamps.length - 1}
              value={timestampIndex}
              onChange={(event) => { setPlaying(false); setTimestampIndex(Number(event.target.value)); }}
            />
            <div className="replay-playback">
              <button className="icon-button" aria-label="上一步" onClick={() => { setPlaying(false); setTimestampIndex((index) => Math.max(index - 1, 0)); }}><SkipBack size={16} /></button>
              <button className="icon-button" aria-label={playing ? "暂停" : "播放"} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
              <button className="icon-button" aria-label="下一步" onClick={() => { setPlaying(false); setTimestampIndex((index) => Math.min(index + 1, timestamps.length - 1)); }}><SkipForward size={16} /></button>
              <button className="ghost-button" onClick={() => setSpeed((current) => speeds[(speeds.indexOf(current) + 1) % speeds.length])}>{speed}x</button>
              <button className="ghost-button" onClick={() => { setPlaying(false); setTimestampIndex(timestamps.length - 1); }}>LIVE</button>
            </div>
          </div>

          <div className="v2-card">
            <div className="v2-card-head">
              <h2>监控组快照（{formatEtTime(capturedAt)}）</h2>
              <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            {selectedGroupStocks.length ? (
              <GroupStockTable stocks={selectedGroupStocks} topRowsBySymbol={comparisonBySymbol} onSelect={() => {}} />
            ) : <p className="muted-note">该时间点没有这个主题组的快照数据。</p>}
          </div>

          <div className="v2-card">
            <div className="v2-card-head"><h2>主题太阳系快照</h2></div>
            {groupSummariesAtTime.length ? (
              <SolarSystemCanvas summaries={groupSummariesAtTime} updatedAt={`${formatEtTime(capturedAt)} ET`} quoteStatus="历史快照" />
            ) : <p className="muted-note">该时间点暂无主题组数据。</p>}
          </div>

          <div className="replay-two-col">
            <div className="v2-card">
              <div className="v2-card-head"><h2>成交金额 Top 50 快照</h2></div>
              {top50EntriesAtTime.length ? (
                <Top50Table title="Top 50" rows={top50EntriesAtTime} side="current" comparisonBySymbol={comparisonBySymbol} onHover={() => {}} showAll={false} />
              ) : <p className="muted-note">该时间点暂无 Top 50 数据。</p>}
            </div>
            <div className="v2-card">
              <div className="v2-card-head"><h2>市场卫星</h2></div>
              <div className="summary-grid">
                {satellitesAtTime.map((satellite) => (
                  <div key={satellite.symbol}><b className={satellite.changePct >= 0 ? "positive" : "negative"}>{formatSignedPct(satellite.changePct)}</b><span>{satellite.symbol}</span></div>
                ))}
                {!satellitesAtTime.length && <p className="muted-note">暂无市场卫星数据。</p>}
              </div>
              <div className="v2-card-head"><h2>当天异动时间线</h2></div>
              {events.length ? (
                <ul className="replay-event-list">
                  {events.slice(0, 20).map((event, index) => (
                    <li key={index}>
                      <button onClick={() => jumpToEvent(event)}>
                        <small>{formatEtTime(event.capturedAt)}</small>
                        <span>{event.label}</span>
                        <b>{event.detail}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted-note">当天暂无明显衍生事件。</p>}
            </div>
          </div>
        </>
      )}

      <p className="mock-note">
        历史回放基于每 5 分钟抓取一次的盘中快照（Supabase intraday_snapshots），由 GitHub Actions 定时触发；
        非交易时段不抓取。异动时间线为简化推导（Top 50 新进、主题组第一名易主、单点涨跌幅骤变），不等同于实时异动雷达。
      </p>
    </section>
  );
}
