import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, type Time, type UTCTimestamp } from "lightweight-charts";
import { getJson } from "../lib/api";
import css from "./CryptoScalper.module.css";

type Candle = { openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volumeCoin: number; volumeUsdt: number; tradeCount: number };
type Market = { symbol: string; coin: string; name: string; state: string; error: string | null; missingIntervals: number; fetchedAt: string | null; bars: Candle[] };
type Snapshot = { source: string; generatedAt: string; nextRefreshAt: number; markets: Market[] };
type VolumeUnit = "coin" | "usdt";
const format = (value: number | undefined, digits = 8) => value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits });
const stamp = (time: number) => new Date(time).toISOString().replace("T", " ").slice(0, 16) + " UTC";

function CryptoChart({ market, unit, hours, now }: { market: Market; unit: VolumeUnit; hours: number; now: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [inspected, setInspected] = useState<Candle | null>(null);
  const rows = useRef(market.bars);
  rows.current = market.bars;
  const [chart, setChart] = useState<ReturnType<typeof createChart> | null>(null);
  const series = useRef<{
    candles: ReturnType<ReturnType<typeof createChart>["addSeries"]>;
    ema: ReturnType<ReturnType<typeof createChart>["addSeries"]>;
    volume: ReturnType<ReturnType<typeof createChart>["addSeries"]>;
  } | null>(null);
  const lastRange = useRef("");
  useEffect(() => {
    if (!host.current) return;
    const api = createChart(host.current, {
      autoSize: true, height: 330,
      layout: { background: { type: ColorType.Solid, color: "#091321" }, textColor: "#c5d4e5", fontFamily: "Inter, sans-serif" },
      grid: { vertLines: { color: "#192638" }, horzLines: { color: "#192638" } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#24354b", rightOffset: 2 },
      localization: { locale: "en-US", timeFormatter: (time: Time) => stamp(Number(time) * 1000) },
      rightPriceScale: { borderColor: "#24354b", scaleMargins: { top: .08, bottom: .3 } },
    });
    const candles = api.addSeries(CandlestickSeries, { upColor: "#37d8a3", downColor: "#ff7181", borderVisible: false, wickUpColor: "#37d8a3", wickDownColor: "#ff7181" });
    const ema = api.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const volume = api.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: .78, bottom: 0 } });
    series.current = { candles, ema, volume };
    api.subscribeCrosshairMove(event => setInspected(event.time == null ? null : rows.current.find(row => row.openTime === Number(event.time) * 1000) ?? null));
    setChart(api);
    return () => { series.current = null; api.remove(); };
  }, []);
  useEffect(() => {
    if (!chart || !series.current || !market.bars.length) return;
    const { candles, ema, volume } = series.current;
    const precision = market.bars.at(-1)!.close < 1 ? 6 : market.bars.at(-1)!.close < 10 ? 4 : 2;
    candles.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
    ema.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
    candles.setData(market.bars.map(bar => ({ time: bar.openTime / 1000 as UTCTimestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close })));
    let average = market.bars[0].close;
    ema.setData(market.bars.map((bar, index) => {
      // Restart after gaps; do not bridge missing five-minute observations.
      average = index === 0 || bar.openTime - market.bars[index - 1].openTime !== 300000 ? bar.close : average + .2 * (bar.close - average);
      return { time: bar.openTime / 1000 as UTCTimestamp, value: average };
    }));
    volume.setData(market.bars.map(bar => ({ time: bar.openTime / 1000 as UTCTimestamp, value: unit === "coin" ? bar.volumeCoin : bar.volumeUsdt, color: bar.close >= bar.open ? "#37d8a377" : "#ff718177" })));
    const rangeKey = `${market.symbol}:${hours}`;
    if (rangeKey !== lastRange.current) {
      const end = market.bars.at(-1)!.openTime / 1000;
      chart.timeScale().setVisibleRange({ from: Math.max(market.bars[0].openTime / 1000, end - hours * 3600) as UTCTimestamp, to: (end + 300) as UTCTimestamp });
      lastRange.current = rangeKey;
    }
  }, [chart, market.bars, market.symbol, unit, hours]);
  const latest = market.bars.at(-1);
  const row = inspected ?? latest;
  const state = latest && now - latest.closeTime > 360000 ? "STALE" : market.state;
  return <article className={css.card} data-testid={`crypto-${market.coin}`}>
    <header><div><h2>{market.name} <small>{market.symbol}</small></h2><strong>{format(latest?.close)} <small>USDT</small></strong></div><span className={state === "READY" ? css.ready : css.warning}>{state}</span></header>
    <p className={css.meta}>{latest ? `Last completed candle: ${stamp(latest.openTime)}` : "No completed candles available"}</p>
    {market.error && <p role="status" className={css.warning}>{market.error}</p>}
    {market.missingIntervals > 0 && <p className={css.warning}>{market.missingIntervals} missing intervals in the returned history.</p>}
    <div ref={host} className={css.chart} aria-label={`${market.name} five-minute candlesticks, EMA9 and actual volume`} />
    <p className={css.meta}>5m candles · <span className={css.ema}>EMA9</span> · Volume in {unit === "coin" ? market.coin : "USDT"} · Drag to pan / scroll to zoom</p>
    <div className={css.readout} aria-live="off">
      <span>{inspected ? "Inspected" : "Latest closed"}: {row ? stamp(row.openTime) : "—"}</span>
      <span>O {format(row?.open)} · H {format(row?.high)} · L {format(row?.low)} · C {format(row?.close)}</span>
      <span>Volume <b>{format(row?.volumeCoin)} {market.coin}</b> · <b>{format(row?.volumeUsdt, 2)} USDT</b> · Trades <b>{format(row?.tradeCount, 0)}</b></span>
    </div>
  </article>;
}

export function CryptoScalper() {
  const [unit, setUnit] = useState<VolumeUnit>("coin");
  const [hours, setHours] = useState(24);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const query = useQuery({
    queryKey: ["crypto-market"], queryFn: () => getJson<Snapshot>("/v1/crypto-market"),
    staleTime: 15000, retry: 1, refetchIntervalInBackground: false,
    refetchInterval: q => q.state.error || q.state.data?.markets.some(m => m.state !== "READY") ? 30000 : Math.max(1000, (q.state.data?.nextRefreshAt ?? Date.now() + 300000) - Date.now()),
  });
  const markets = query.data?.markets ?? [];
  const selected = markets.find(m => m.symbol === symbol);
  const table = useMemo(() => selected?.bars.slice(-24).reverse() ?? [], [selected]);
  function exportCsv() {
    const header = "open_time_utc,symbol,open_price,high_price,low_price,close_price,volume_coin,volume_usdt,trade_count";
    const rows = markets.flatMap(m => m.bars.map(b => [new Date(b.openTime).toISOString(), m.symbol, b.open, b.high, b.low, b.close, b.volumeCoin, b.volumeUsdt, b.tradeCount].join(",")));
    const url = URL.createObjectURL(new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "crypto-binance-spot-5m.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={css.page} data-testid="crypto-scalper" aria-label="Crypto Scalper workspace">
    <header className={css.toolbar}><div><h1>Crypto Scalper</h1><p>Binance spot · USDT pairs · Completed 5-minute candles · 24/7</p></div>
      <label>Chart range <select aria-label="Chart range" value={hours} onChange={e => setHours(Number(e.target.value))}><option value={4}>4 hours</option><option value={24}>24 hours</option><option value={84}>Available history</option></select></label>
      <label>Volume <select aria-label="Volume" value={unit} onChange={e => setUnit(e.target.value as VolumeUnit)}><option value="coin">Coin units</option><option value="usdt">USDT traded</option></select></label>
      <button disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Refreshing…" : "Refresh crypto"}</button>
      <button disabled={!markets.some(m => m.bars.length)} onClick={exportCsv}>Export CSV</button>
    </header>
    <p className={css.meta}>Prices are completed-candle closes. Volume is the amount actually traded on Binance in each selected spot pair during those five minutes. All timestamps use UTC.</p>
    <p className={css.meta}>Updates after each five-minute close · Last response {query.data ? stamp(Date.parse(query.data.generatedAt)) : "—"}{query.isFetching ? " · Refreshing" : ""}</p>
    {query.isError && <p role="alert" className={css.warning}>Crypto data could not be refreshed. Previously loaded candles may be stale. <button onClick={() => void query.refetch()}>Retry</button></p>}
    {query.isLoading && <p role="status">Loading Binance five-minute candles…</p>}
    <div className={css.grid}>{markets.map(m => <CryptoChart key={m.symbol} market={m} unit={unit} hours={hours} now={now} />)}</div>
    <details className={css.evidence}><summary>Completed candle data</summary>
      <label>Pair <select aria-label="Pair" value={symbol} onChange={e => setSymbol(e.target.value)}>{markets.map(m => <option key={m.symbol} value={m.symbol}>{m.symbol}</option>)}</select></label>
      <p>Latest 24 completed intervals; export includes up to 1,000 candles per pair from the current response.</p>
      <div className={css.tableScroll}><table><thead><tr>{["Open time UTC", "Open", "High", "Low", "Close", `Volume ${selected?.coin ?? "coin"}`, "Volume USDT", "Trades"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{table.map(b => <tr key={b.openTime}><td>{stamp(b.openTime)}</td>{[b.open, b.high, b.low, b.close, b.volumeCoin, b.volumeUsdt, b.tradeCount].map((v, i) => <td key={i}>{format(v, i === 6 ? 0 : 8)}</td>)}</tr>)}</tbody></table></div>
    </details>
    <details className={css.evidence}><summary>Source and calculations</summary><p>Binance public klines, interval 5m. Coin volume, quote volume in USDT, and trade counts come directly from each candle. Forming candles are excluded. The rolling history is retrieved again after a restart; this tab does not maintain a permanent archive. EMA9 uses close prices with α = 2 / 10, seeded with the first available close and restarted after any missing interval. These charts are market data for research.</p><a href="https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints#klinecandlestick-data" target="_blank" rel="noreferrer">Binance candle documentation</a></details>
  </section>;
}
