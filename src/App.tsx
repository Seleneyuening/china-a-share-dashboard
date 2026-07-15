import { Activity, BarChart3, Beaker, Bell, BookOpenText, Eye, FlaskConical, Gauge, Globe2, History, LayoutGrid, LineChart as LineIcon, Moon, Newspaper, RefreshCw, SlidersHorizontal, Star, Sun, Wallet } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { comparisonSymbols, indexes, mainSymbols, markets } from "./data/markets";
import { AlertsPage } from "./pages/AlertsPage";
import { AnomalyRadarPage } from "./pages/AnomalyRadarPage";
import { HistoryReplayPage } from "./pages/HistoryReplayPage";
import { MarketJournalPage } from "./pages/MarketJournalPage";
import { MonitoringGroupsPage } from "./pages/MonitoringGroupsPage";
import { PatternLabPage } from "./pages/PatternLabPage";
import { StrategyLabPage } from "./pages/StrategyLabPage";
import { PaperPortfolioPage } from "./pages/PaperPortfolioPage";
import { PortfolioCommandPage } from "./pages/PortfolioCommandPage";
import { PortfolioRecordPage } from "./pages/PortfolioRecordPage";
import { ThemeSolarSystemPage, ThemeTop50Page } from "./pages/ThemeSolarSystemPage";
import { marketDataService } from "./services/marketDataService";
import { getYahooSnapshot } from "./services/yahooFinanceService";
import { alertStorage } from "./services/alertStorage";
import { bySymbol, calculateCorrelation, calculateRelativeStrength, calculateReturn, getMarketStatus, metaFor, normalizeSeriesToBase100, signed } from "./services/calculations";
import type { IndexMeta, Point, RangeKey } from "./types";

type Page = "marketJournal" | "overview" | "intraday" | "overlay" | "compare" | "monitoringGroups" | "themeSolarSystem" | "themeTop50" | "anomalyRadar" | "historyReplay" | "patternLab" | "strategyLab" | "paperPortfolio" | "portfolioRecord" | "portfolioCommand" | "alerts";

const navItems: Array<{ id: Page; label: string; icon: typeof LayoutGrid; group: "市场观察" | "研究工具" | "虚拟账户" }> = [
  { id: "marketJournal", label: "市场日志", icon: Newspaper, group: "市场观察" },
  { id: "overview", label: "总览", icon: LayoutGrid, group: "市场观察" },
  { id: "intraday", label: "分时图", icon: LineIcon, group: "市场观察" },
  { id: "overlay", label: "叠加图", icon: BarChart3, group: "市场观察" },
  { id: "compare", label: "对比分析", icon: SlidersHorizontal, group: "市场观察" },
  { id: "monitoringGroups", label: "监控组", icon: Star, group: "市场观察" },
  { id: "themeSolarSystem", label: "主题", icon: Sun, group: "市场观察" },
  { id: "themeTop50", label: "榜单变化", icon: BarChart3, group: "市场观察" },
  { id: "anomalyRadar", label: "异动雷达", icon: Activity, group: "市场观察" },
  { id: "historyReplay", label: "历史回放", icon: History, group: "研究工具" },
  { id: "patternLab", label: "模式实验室", icon: FlaskConical, group: "研究工具" },
  { id: "strategyLab", label: "策略实验室", icon: Beaker, group: "研究工具" },
  { id: "paperPortfolio", label: "自主操盘", icon: Wallet, group: "虚拟账户" },
  { id: "portfolioRecord", label: "资金与交易记录", icon: BookOpenText, group: "虚拟账户" },
  { id: "portfolioCommand", label: "组合指挥中心", icon: Gauge, group: "虚拟账户" },
  { id: "alerts", label: "自定义提醒", icon: Bell, group: "虚拟账户" },
];

const alertPollIntervalMs = 30 * 1000;

const ranges: RangeKey[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y"];
const refreshIntervalMs = 2 * 60 * 1000;
let activeSnapshot = marketDataService.getSnapshot();
let quoteBySymbol = bySymbol(marketDataService.getLatestQuotes(activeSnapshot));
const marketById = Object.fromEntries(markets.map((market) => [market.id, market]));
const baseGrid = { stroke: "#1d3044", strokeDasharray: "3 3" };

function initialPage(): Page {
  const requested = new URLSearchParams(window.location.search).get("page") as Page | null;
  return requested && navItems.some((item) => item.id === requested) ? requested : "overview";
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function App() {
  const [snapshot, setSnapshot] = useState(() => marketDataService.getSnapshot());
  const [page, setPage] = useState<Page>(initialPage);
  const [selectedSymbol, setSelectedSymbol] = useState("000001.SH");
  const [range, setRange] = useState<RangeKey>("1D");
  const [showPrevClose, setShowPrevClose] = useState(true);
  const [visibleSymbols, setVisibleSymbols] = useState(() => new Set(comparisonSymbols));
  const [rankMode, setRankMode] = useState<"gain" | "loss">("gain");
  const [refreshedAt, setRefreshedAt] = useState("正在更新");
  const [triggeredAlertCount, setTriggeredAlertCount] = useState(() => alertStorage.getActiveRuleIds().length);
  activeSnapshot = snapshot;
  quoteBySymbol = bySymbol(snapshot.quotes);
  const aShareMarketStatus = getMarketStatus(marketById.CN);

  async function refreshMarketData() {
    try {
      const next = await getYahooSnapshot();
      setSnapshot(next);
      setRefreshedAt(new Date(next.fetchedAt).toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }));
    } catch {
      setRefreshedAt("更新失败");
    }
  }

  useEffect(() => {
    void refreshMarketData();
    const timer = window.setInterval(() => void refreshMarketData(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setTriggeredAlertCount(alertStorage.getActiveRuleIds().length);
    const timer = window.setInterval(() => setTriggeredAlertCount(alertStorage.getActiveRuleIds().length), alertPollIntervalMs);
    return () => window.clearInterval(timer);
  }, [page]);

  function openIntraday(symbol: string) {
    setSelectedSymbol(symbol);
    setPage("intraday");
  }

  function toggleVisible(symbol: string) {
    setVisibleSymbols((current) => {
      const next = new Set(current);
      next.has(symbol) ? next.delete(symbol) : next.add(symbol);
      return next;
    });
  }

  const pageTitle = navItems.find((item) => item.id === page)?.label || "总览";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Globe2 size={34} />
          <div>
            <strong>A 股市场看板</strong>
            <span>沪深指数实时监控</span>
          </div>
        </div>
        <nav>
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <Fragment key={item.id}>
                {(index === 0 || navItems[index - 1].group !== item.group) && <span className="nav-section-label">{item.group}</span>}
                <button className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              </Fragment>
            );
          })}
        </nav>
      </aside>

      <main>
        <header className="topbar">
          <div>
            {page !== "themeSolarSystem" && <p className="eyebrow">{pageTitle}</p>}
            <h1>A 股市场看板</h1>
          </div>
          <div className="top-actions">
            <Sun size={18} className="sun" />
            <Moon size={18} />
            <div className="clock">
              <strong>{refreshedAt}</strong>
            </div>
            <button className={`status ${aShareMarketStatus === "已收盘" ? "closed" : ""}`}><span /> A 股{aShareMarketStatus}</button>
            <button className="icon-button alert-bell" onClick={() => setPage("alerts")} aria-label="提醒">
              <Bell size={18} />
              {triggeredAlertCount > 0 && <span className="alert-dot">{triggeredAlertCount}</span>}
            </button>
            <button className="icon-button" onClick={refreshMarketData} aria-label="刷新">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {page === "marketJournal" && <MarketJournalPage />}
        {page === "overview" && <Overview rankMode={rankMode} setRankMode={setRankMode} openIntraday={openIntraday} />}
        {page === "intraday" && <Intraday selectedSymbol={selectedSymbol} setSelectedSymbol={setSelectedSymbol} showPrevClose={showPrevClose} setShowPrevClose={setShowPrevClose} />}
        {page === "overlay" && <Overlay range={range} setRange={setRange} visibleSymbols={visibleSymbols} toggleVisible={toggleVisible} snapshotSource={snapshot.source} />}
        {page === "compare" && <Compare />}
        {page === "monitoringGroups" && <MonitoringGroupsPage />}
        {page === "themeSolarSystem" && <ThemeSolarSystemPage />}
        {page === "themeTop50" && <ThemeTop50Page />}
        {page === "anomalyRadar" && <AnomalyRadarPage />}
        {page === "historyReplay" && <HistoryReplayPage />}
        {page === "patternLab" && <PatternLabPage />}
        {page === "strategyLab" && <StrategyLabPage />}
        {page === "paperPortfolio" && <PaperPortfolioPage />}
        {page === "portfolioRecord" && <PortfolioRecordPage />}
        {page === "portfolioCommand" && <PortfolioCommandPage />}
        {page === "alerts" && <AlertsPage />}

      </main>
    </div>
  );
}

function MarketName({ meta }: { meta: IndexMeta }) {
  const market = marketById[meta.marketId];
  return <>{market.flag} {meta.name}</>;
}

function MiniLine({ data, color }: { data: Point[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={54}>
      <LineChart data={smoothSeries(data)}>
        <Line type="basis" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Overview({ rankMode, setRankMode, openIntraday }: { rankMode: "gain" | "loss"; setRankMode: (mode: "gain" | "loss") => void; openIntraday: (symbol: string) => void }) {
  const quotes = marketDataService.getLatestQuotes(activeSnapshot);
  const rankings = [...quotes].sort((a, b) => rankMode === "gain" ? b.changePct - a.changePct : a.changePct - b.changePct);
  return (
    <section className="grid-page">
      <div className="market-strip">
        {mainSymbols.map((symbol) => {
          const quote = quoteBySymbol[symbol];
          const meta = metaFor(symbol, indexes);
          const market = marketById[meta.marketId];
          return (
            <button className={`quote-card ${meta.featured ? "featured" : ""}`} key={symbol} onClick={() => openIntraday(symbol)}>
              <div className="row">
                <span><MarketName meta={meta} /></span>
                <small>{getMarketStatus(market)}</small>
              </div>
              <strong>{formatNumber(quote.value)}</strong>
              <div className={quote.changePct >= 0 ? "positive" : "negative"}>{signed(quote.change)}　{signed(quote.changePct)}%</div>
              <MiniLine data={marketDataService.getIntradaySeries(symbol, activeSnapshot)} color={quote.changePct >= 0 ? "#4fd06f" : "#ff5252"} />
              <small>{quote.updatedAt}</small>
            </button>
          );
        })}
      </div>

      <div className="panel ranking">
        <div className="panel-head">
          <h2>今日表现排行榜</h2>
          <div className="segmented">
            <button className={rankMode === "gain" ? "active" : ""} onClick={() => setRankMode("gain")}>涨幅榜</button>
            <button className={rankMode === "loss" ? "active" : ""} onClick={() => setRankMode("loss")}>跌幅榜</button>
          </div>
        </div>
        {rankings.map((quote, index) => {
          const meta = metaFor(quote.symbol, indexes);
          return (
            <button key={quote.symbol} className="rank-row" onClick={() => openIntraday(quote.symbol)}>
              <span className="rank">{index + 1}</span>
              <span><MarketName meta={meta} /></span>
              <span>{formatNumber(quote.value)}</span>
              <b className={quote.changePct >= 0 ? "positive" : "negative"}>{signed(quote.changePct)}%</b>
            </button>
          );
        })}
      </div>

      <Timeline />
    </section>
  );
}

function Timeline() {
  return (
    <div className="panel timeline">
      <h2>全球交易时段</h2>
      <div className="time-scale"><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>24:00</span></div>
      <div className="sessions">
        {markets.map((market) => (
          <div key={market.id} className={`session ${getMarketStatus(market) === "交易中" ? "live" : ""}`} title={`${market.name}: ${market.openEt} - ${market.closeEt} ${market.timezone}`}>
            <span>{market.sessionLabel}</span>
            <small>{market.openEt} - {market.closeEt} {market.timezone}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Intraday({ selectedSymbol, setSelectedSymbol, showPrevClose, setShowPrevClose }: { selectedSymbol: string; setSelectedSymbol: (symbol: string) => void; showPrevClose: boolean; setShowPrevClose: (show: boolean) => void }) {
  const meta = metaFor(selectedSymbol, indexes);
  const quote = quoteBySymbol[selectedSymbol];
  const data = marketDataService.getIntradaySeries(selectedSymbol, activeSnapshot);
  const chartData = data.map((point) => ({
    ...point,
    pctFromPrevClose: Number((((point.value - quote.previousClose) / quote.previousClose) * 100).toFixed(2)),
  }));
  const pctValues = chartData.map((point) => point.pctFromPrevClose);
  const maxAbsPct = Math.max(0.2, ...pctValues.map(Math.abs));
  const pctDomain = [Number((-maxAbsPct * 1.15).toFixed(2)), Number((maxAbsPct * 1.15).toFixed(2))];
  const dataMax = Math.max(...pctValues);
  const dataMin = Math.min(...pctValues);
  const zeroOffset = dataMax <= 0 ? 0 : dataMin >= 0 ? 1 : dataMax / (dataMax - dataMin);
  return (
    <section className="stack">
      <div className="tabs wrap">
        {indexes.map((index) => <button key={index.symbol} className={selectedSymbol === index.symbol ? "active" : ""} onClick={() => setSelectedSymbol(index.symbol)}>{index.name}</button>)}
      </div>
      <div className="panel chart-panel">
        <div className="panel-head">
          <div>
            <h2><MarketName meta={meta} /></h2>
            <p className={quote.changePct >= 0 ? "positive" : "negative"}>{formatNumber(quote.value)}　{signed(quote.change)}　{signed(quote.changePct)}%</p>
          </div>
          <label className="check"><input type="checkbox" checked={showPrevClose} onChange={(event) => setShowPrevClose(event.target.checked)} /> 显示昨收基准</label>
        </div>
        <div className="stats">
          {[
            ["开盘价", quote.open],
            ["最高价", quote.high],
            ["最低价", quote.low],
            ["昨收价", quote.previousClose],
            ["状态", getMarketStatus(marketById[meta.marketId])],
            ["更新时间", quote.updatedAt],
          ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{typeof value === "number" ? formatNumber(value) : value}</strong></div>)}
        </div>
        <ResponsiveContainer width="100%" height={420}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="intradaySplit" x1="0" y1="0" x2="0" y2="1">
                <stop offset={zeroOffset} stopColor="#4fd06f" />
                <stop offset={zeroOffset} stopColor="#ff5252" />
              </linearGradient>
            </defs>
            <CartesianGrid {...baseGrid} />
            <XAxis dataKey="time" stroke="#8ea0b4" />
            <YAxis orientation="right" stroke="#8ea0b4" domain={pctDomain} tickFormatter={(value) => `${Number(value).toFixed(2)}%`} />
            <Tooltip
              contentStyle={{ background: "#091523", border: "1px solid #1d3044" }}
              formatter={(value, name, item) => {
                const pointValue = Number(item.payload.value);
                return [`${Number(item.payload.pctFromPrevClose).toFixed(2)}% / ${formatNumber(pointValue)}`, name];
              }}
            />
            {showPrevClose && <ReferenceLine y={0} stroke="#9aa6b2" strokeDasharray="4 4" label={{ value: "昨收 0%", fill: "#9aa6b2", position: "right" }} />}
            <Area type="monotone" dataKey="pctFromPrevClose" stroke="url(#intradaySplit)" fill="url(#intradaySplit)" fillOpacity={0.16} strokeWidth={2} name={meta.name} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function smoothSeries(series: Point[]): Point[] {
  return series.map((point, index) => {
    const window = series.slice(Math.max(0, index - 2), Math.min(series.length, index + 3));
    const mid = Math.floor(window.length / 2);
    const totalWeight = window.reduce((sum, _item, i) => sum + (i === mid ? 2 : 1), 0);
    const value = window.reduce((sum, item, i) => sum + item.value * (i === mid ? 2 : 1), 0) / totalWeight;
    return { ...point, value: Number(value.toFixed(2)) };
  });
}

function Overlay({ range, setRange, visibleSymbols, toggleVisible, snapshotSource }: { range: RangeKey; setRange: (range: RangeKey) => void; visibleSymbols: Set<string>; toggleVisible: (symbol: string) => void; snapshotSource: string }) {
  const data = useMemo(() => {
    const rows: Record<string, string | number>[] = [];
    comparisonSymbols.forEach((symbol) => {
      const series = range === "1D" ? marketDataService.getIntradaySeries(symbol, activeSnapshot) : marketDataService.getHistoricalSeries(symbol, range, activeSnapshot);
      smoothSeries(normalizeSeriesToBase100(series)).forEach((point, i) => {
        rows[i] = rows[i] || { time: point.time };
        rows[i][symbol] = point.value;
      });
    });
    return rows;
  }, [range, snapshotSource]);
  const lastChartDate = String(data[data.length - 1]?.time || "01-01");
  const events = marketDataService.getEconomicEvents()
    .filter((event) => event.date >= lastChartDate)
    .slice(0, 4);
  return (
    <section className="stack">
      <div className="panel chart-panel">
        <div className="panel-head">
          <div>
            <h2>{range === "1D" ? "A 股指数分时叠加图" : "A 股主要指数叠加图"}</h2>
            <p>{range === "1D" ? "按沪深 A 股交易时段展示：09:30–11:30，13:00–15:00。" : "将不同指数统一标准化，以比较相对表现。"}</p>
          </div>
          <div className="tabs">{ranges.map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>)}</div>
        </div>
        <div className="overlay-layout">
          <ResponsiveContainer width="100%" height={440}>
            <LineChart data={data}>
              <CartesianGrid {...baseGrid} />
              <XAxis dataKey="time" stroke="#8ea0b4" minTickGap={26} />
              <YAxis stroke="#8ea0b4" domain={[80, 125]} />
              <Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} />
              {comparisonSymbols.map((symbol) => visibleSymbols.has(symbol) && <Line key={symbol} type="basis" dataKey={symbol} stroke={metaFor(symbol, indexes).color} dot={false} strokeWidth={2} />)}
            </LineChart>
          </ResponsiveContainer>
          <div className="index-list">
            {comparisonSymbols.map((symbol) => {
              const meta = metaFor(symbol, indexes);
              const series = range === "1D" ? marketDataService.getIntradaySeries(symbol, activeSnapshot) : marketDataService.getHistoricalSeries(symbol, range, activeSnapshot);
              const normalized = normalizeSeriesToBase100(series);
              const normalizedValue = normalized[normalized.length - 1]?.value || 100;
              return (
                <button key={symbol} className={!visibleSymbols.has(symbol) ? "muted-row" : ""} onClick={() => toggleVisible(symbol)}>
                  <Eye size={16} />
                  <span className="dot" style={{ background: meta.color }} />
                  <span>{meta.name}</span>
                  <span>{normalizedValue.toFixed(2)}</span>
                  <b className={calculateReturn(series) >= 0 ? "positive" : "negative"}>{signed(calculateReturn(series))}%</b>
                </button>
              );
            })}
          </div>
        </div>
        <div className="event-track">{events.map((event) => <span key={event.date + event.label} style={{ borderColor: event.color }} title={event.label}>{event.date} {event.label}</span>)}</div>
      </div>
      <div className="two-col">
        <ReturnRanking range={range} />
        <CorrelationMatrix />
      </div>
    </section>
  );
}

function ReturnRanking({ range }: { range: RangeKey }) {
  return (
    <div className="panel">
      <h2>{range} 涨跌幅排名</h2>
      {comparisonSymbols
        .map((symbol) => ({ symbol, ret: calculateReturn(marketDataService.getHistoricalSeries(symbol, range, activeSnapshot)) }))
        .sort((a, b) => b.ret - a.ret)
        .map((row, i) => {
          const meta = metaFor(row.symbol, indexes);
          return <div key={row.symbol} className="rank-row"><span className="rank">{i + 1}</span><span><MarketName meta={meta} /></span><b className={row.ret >= 0 ? "positive" : "negative"}>{signed(row.ret)}%</b></div>;
        })}
    </div>
  );
}

function CorrelationMatrix() {
  const symbols = comparisonSymbols;
  return (
    <div className="panel heat-panel">
      <h2>主要 A 股指数相关性（近20日）</h2>
      <div className="heatmap" style={{ gridTemplateColumns: `110px repeat(${symbols.length}, 1fr)` }}>
        <span />
        {symbols.map((symbol) => <b key={symbol}>{metaFor(symbol, indexes).name}</b>)}
        {symbols.map((row) => (
          <Fragment key={row}>
            <b key={row + "-label"}>{metaFor(row, indexes).name}</b>
            {symbols.map((col) => {
              const value = row === col ? 1 : calculateCorrelation(marketDataService.getHistoricalSeries(row, "1M", activeSnapshot), marketDataService.getHistoricalSeries(col, "1M", activeSnapshot));
              const hue = value >= 0 ? "210" : "2";
              return <span key={row + col} style={{ background: `hsla(${hue}, 72%, 48%, ${0.18 + Math.abs(value) * 0.55})` }}>{value.toFixed(2)}</span>;
            })}
          </Fragment>
        ))}
      </div>
      <p>数值越接近 1，走势越同步；越接近 -1，走势越相反。</p>
    </div>
  );
}

function Compare() {
  const barData = comparisonSymbols.map((symbol) => ({ name: metaFor(symbol, indexes).name, value: quoteBySymbol[symbol].changePct, color: quoteBySymbol[symbol].changePct >= 0 ? "#4fd06f" : "#ff5252" }));
  const base = marketDataService.getHistoricalSeries("000001.SH", "1M", activeSnapshot);
  const strength = comparisonSymbols.filter((s) => s !== "000001.SH").map((symbol) => ({ name: metaFor(symbol, indexes).name, value: calculateRelativeStrength(base, marketDataService.getHistoricalSeries(symbol, "1M", activeSnapshot)) }));
  const radar = comparisonSymbols.slice(0, 6).map((symbol) => ({ market: metaFor(symbol, indexes).name, 涨跌幅: Math.max(10, quoteBySymbol[symbol].changePct * 22 + 50), 波动率: 70 - Math.abs(quoteBySymbol[symbol].changePct) * 8, 相对强弱: 50 + calculateRelativeStrength(base, marketDataService.getHistoricalSeries(symbol, "1M", activeSnapshot)) * 4 }));
  const pie = [{ name: "同向", value: 4, fill: "#4fd06f" }, { name: "反向", value: 2, fill: "#ff5252" }, { name: "弱相关", value: 1, fill: "#748094" }];
  return (
    <section className="stack">
      <div className="tabs wrap"><button className="active">市场总览</button><button>涨跌对比</button><button>相关性分析</button><button>强弱对比</button><button>波动率对比</button><button>资金与汇率影响</button></div>
      <div className="compare-grid">
        <div className="panel">
          <h2>今日市场表现对比</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData}>
              <CartesianGrid {...baseGrid} />
              <XAxis dataKey="name" stroke="#8ea0b4" />
              <YAxis stroke="#8ea0b4" />
              <Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} />
              <Bar dataKey="value">{barData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h2>市场相对强弱</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={strength} layout="vertical">
              <CartesianGrid {...baseGrid} />
              <XAxis type="number" stroke="#8ea0b4" />
              <YAxis type="category" dataKey="name" stroke="#8ea0b4" width={90} />
              <Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} />
              <Bar dataKey="value" fill="#4fd06f" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <MetricsTable />
        <CorrelationMatrix />
        <div className="panel">
          <h2>市场趋势一致性</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={pie} dataKey="value" innerRadius={58} outerRadius={92} paddingAngle={3}>{pie.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}</Pie><Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} /><Legend /></PieChart>
          </ResponsiveContainer>
          <strong className="score">市等偏强 62%</strong>
        </div>
        <div className="panel">
          <h2>市场分化雷达图</h2>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radar}>
              <PolarGrid stroke="#1d3044" />
              <PolarAngleAxis dataKey="market" stroke="#8ea0b4" />
              <Radar dataKey="涨跌幅" stroke="#2f83ff" fill="#2f83ff" fillOpacity={0.2} />
              <Radar dataKey="波动率" stroke="#ffd24a" fill="#ffd24a" fillOpacity={0.12} />
              <Radar dataKey="相对强弱" stroke="#4fd06f" fill="#4fd06f" fillOpacity={0.12} />
              <Tooltip contentStyle={{ background: "#091523", border: "1px solid #1d3044" }} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <SummaryCards />
    </section>
  );
}

function MetricsTable() {
  return (
    <div className="panel">
      <h2>关键指标对比</h2>
      <table>
        <thead><tr><th>市场</th><th>市盈率 TTM</th><th>市净率</th><th>股息率</th><th>20 日波动率</th></tr></thead>
        <tbody>
          {marketDataService.getMetrics().map((row) => <tr key={row.symbol}><td>{metaFor(row.symbol, indexes).name}</td><td>{row.pe}</td><td>{row.pb}</td><td>{row.dividend}%</td><td className="negative">{row.volatility20d}%</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCards() {
  const cards = [
    ["领涨指数", "科创 50", "+2.31%", "科创与成长板块近期相对强势。"],
    ["强势指数", "创业板指", "+1.76%", "新能源与科技成长方向带动市场。"],
    ["市场基准", "上证指数", "+0.82%", "大盘指数稳步运行，市场情绪偏暖。"],
    ["相对偏弱", "中证 500", "-0.46%", "中小盘出现分化，资金保持谨慎。"],
    ["核心资产", "沪深 300", "+0.65%", "核心资产表现平稳，关注成交量变化。"],
  ];
  return (
    <div className="summary-cards">
      {cards.map(([title, symbolName, value, text], index) => {
        const symbol = ["000688.SH", "399006.SZ", "000001.SH", "000905.SH", "000300.SH"][index];
        return <div className="panel summary" key={title}><h3>{title}</h3><b className={value.startsWith("+") ? "positive" : "negative"}>{symbolName} {value}</b><MiniLine data={marketDataService.getHistoricalSeries(symbol, "1M", activeSnapshot)} color={value.startsWith("+") ? "#4fd06f" : "#ff5252"} /><p>{text}</p></div>;
      })}
    </div>
  );
}

export default App;
