import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
  type IPriceLine,
} from "lightweight-charts";
import css from "./ScalperV2.module.css";

type Row = Record<string, unknown>;
const numeric = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const time = (value: unknown) => {
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) as UTCTimestamp : null;
};

export type ScalperV2Crosshair = { time: number; source: string } | null;

export function ScalperV2Chart({
  id,
  title,
  subtitle,
  bars,
  interval,
  height,
  externalCrosshair,
  onCrosshair,
  onTimeClick,
  rankLevels = [],
  oiProfile = [],
}: {
  id: string;
  title: string;
  subtitle: string;
  bars: Row[];
  interval: number;
  height: number;
  externalCrosshair: ScalperV2Crosshair;
  onCrosshair: (value: ScalperV2Crosshair) => void;
  onTimeClick?: (time: string) => void;
  rankLevels?: Array<{ side: "CE" | "PE"; rank: number; strike: number; currentOi: number }>;
  oiProfile?: Array<{ side: "CE" | "PE"; strike: number; currentOi: number }>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema = useRef<ISeriesApi<"Line"> | null>(null);
  const firstDataset = useRef(true);
  const rankLines = useRef<IPriceLine[]>([]);
  const profileRef = useRef(oiProfile);
  profileRef.current = oiProfile;
  const [profileGeometry, setProfileGeometry] = useState<Array<{ side: "CE" | "PE"; strike: number; currentOi: number; top: number; width: number }>>([]);
  const onCrosshairRef = useRef(onCrosshair);
  onCrosshairRef.current = onCrosshair;
  const onTimeClickRef = useRef(onTimeClick);
  onTimeClickRef.current = onTimeClick;
  const data = useMemo(() => bars.flatMap((bar): CandlestickData<Time>[] => {
    const t = time(bar.end), open = numeric(bar.open), high = numeric(bar.high), low = numeric(bar.low), close = numeric(bar.close);
    return bar.closed === true && t != null && open != null && high != null && low != null && close != null
      ? [{ time: t, open, high, low, close }]
      : [];
  }), [bars]);
  const emaData = useMemo(() => bars.flatMap((bar) => {
    const t = time(bar.end), value = numeric(bar.ema9);
    return t != null && value != null ? [{ time: t as Time, value }] : [];
  }), [bars]);

  useEffect(() => {
    if (!host.current) return;
    const instance = createChart(host.current, {
      width: host.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#526175", fontSize: 12 },
      grid: { vertLines: { color: "#edf1f6" }, horzLines: { color: "#edf1f6" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#d7e0eb", scaleMargins: { top: 0.12, bottom: 0.1 } },
      timeScale: { borderColor: "#d7e0eb", timeVisible: true, secondsVisible: false, barSpacing: 10, minBarSpacing: 3, rightOffset: 3 },
      handleScale: true,
      handleScroll: true,
    });
    const candleSeries = instance.addSeries(CandlestickSeries, {
      upColor: "#059669", downColor: "#dc2626", borderUpColor: "#059669", borderDownColor: "#dc2626",
      wickUpColor: "#059669", wickDownColor: "#dc2626", priceLineVisible: false,
    });
    const emaSeries = instance.addSeries(LineSeries, {
      color: "#d97706", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => null,
    });
    let frame = 0;
    const updateProfile = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rows = profileRef.current;
        const maximum = Math.max(0, ...rows.map((row) => row.currentOi));
        setProfileGeometry(rows.flatMap((row) => {
          const top = candleSeries.priceToCoordinate(row.strike);
          return top != null && maximum > 0 ? [{ ...row, top, width: Math.max(1, row.currentOi / maximum * 145) }] : [];
        }));
      });
    };
    instance.subscribeCrosshairMove((param) => {
      if (!param.time) return onCrosshairRef.current(null);
      onCrosshairRef.current({ time: Number(param.time), source: id });
      if (profileRef.current.length) updateProfile();
    });
    instance.subscribeClick((param) => {
      if (!param.time || !onTimeClickRef.current) return;
      onTimeClickRef.current(new Date(Number(param.time) * 1000).toISOString());
    });
    chart.current = instance;
    candles.current = candleSeries;
    ema.current = emaSeries;
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? 0);
      if (width > 0) { instance.resize(width, height); updateProfile(); }
    });
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      instance.remove();
      chart.current = null;
      candles.current = null;
      ema.current = null;
      firstDataset.current = true;
    };
  }, [height, id]);

  useEffect(() => {
    candles.current?.setData(data);
    ema.current?.setData(emaData);
    if (candles.current) {
      rankLines.current.forEach((line) => candles.current?.removePriceLine(line));
      rankLines.current = [];
      const lows = data.map((row) => row.low), highs = data.map((row) => row.high);
      const low = lows.length ? Math.min(...lows) : null, high = highs.length ? Math.max(...highs) : null;
      rankLines.current = rankLevels.filter((level) => low != null && high != null && level.strike >= low && level.strike <= high).map((level) => candles.current!.createPriceLine({
        price: level.strike,
        color: level.side === "CE" ? "#2563eb" : "#a86600",
        lineWidth: level.rank === 1 ? 2 : 1,
        lineStyle: level.rank === 1 ? 0 : 2,
        axisLabelVisible: false,
        title: `${level.side}${level.rank} ${level.strike.toLocaleString("en-IN")} · OI ${new Intl.NumberFormat("en-IN", { notation: "compact" }).format(level.currentOi)}`,
      }));
      requestAnimationFrame(() => {
        const maximum = Math.max(0, ...profileRef.current.map((row) => row.currentOi));
        setProfileGeometry(profileRef.current.flatMap((row) => {
          const top = candles.current?.priceToCoordinate(row.strike);
          return top != null && maximum > 0 ? [{ ...row, top, width: Math.max(1, row.currentOi / maximum * 145) }] : [];
        }));
      });
    }
    if (firstDataset.current && data.length) {
      firstDataset.current = false;
      chart.current?.timeScale().fitContent();
    }
  }, [data, emaData, rankLevels]);

  useEffect(() => {
    if (!externalCrosshair || externalCrosshair.source === id || !candles.current || !chart.current) return;
    const exact = data.find((row) => Number(row.time) === externalCrosshair.time);
    if (exact) chart.current.setCrosshairPosition(exact.close, exact.time, candles.current);
    else chart.current.clearCrosshairPosition();
  }, [data, externalCrosshair, id]);

  const latest = data.at(-1);
  return <section className={css.chartPanel} aria-label={`${title} ${interval} minute candlestick chart`}>
    <header className={css.chartHeader}>
      <span><strong>{title}</strong><small>{subtitle} · {interval}m</small></span>
      <span className={css.ohlc}>{latest ? `O ${latest.open.toFixed(2)}  H ${latest.high.toFixed(2)}  L ${latest.low.toFixed(2)}  C ${latest.close.toFixed(2)}` : "No completed candles"}</span>
    </header>
    <div ref={host} className={css.chartCanvas} style={{ height }} />
    {profileGeometry.length > 0 && <div className={css.oiProfile} aria-hidden="true"><span>OI PROFILE</span>{profileGeometry.map((row) => <i key={`${row.side}-${row.strike}`} className={row.side === "CE" ? css.profileCe : css.profilePe} style={{ top: 42 + row.top + (row.side === "CE" ? -4 : 3), width: row.width }} title={`${row.side} ${row.strike} OI ${row.currentOi}`} />)}</div>}
  </section>;
}
