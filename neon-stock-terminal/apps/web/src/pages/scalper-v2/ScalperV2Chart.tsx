import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, LineSeries, createChart, createSeriesMarkers,
  type CandlestickData, type IChartApi, type IPriceLine, type ISeriesApi,
  type ISeriesMarkersPluginApi, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { levelInObservedSession, observedSessionBounds, paddedSessionBounds, profileWidth } from "../../lib/scalperV2Geometry";
import { istChartTimeLabel } from "../../lib/tradingAnalyticsTime";
import css from "./ScalperV2.module.css";

type Row = Record<string, unknown>;
const EMPTY_LEVELS: Array<{ side: "CE" | "PE"; rank: number; strike: number; currentOi: number }> = [];
const EMPTY_PROFILE: Array<{ side: "CE" | "PE"; strike: number; currentOi: number }> = [];
const EMPTY_SIGNALS: Array<{ direction: "CALL" | "PUT"; setupTime: string; state: string }> = [];
const EMPTY_MEASUREMENT: string[] = [];
const numeric = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const chartTime = (value: unknown) => {
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) as UTCTimestamp : null;
};
const format = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type ScalperV2Crosshair = { time: number; source: string; sequence: number } | null;
export type ScalperV2TimeRange = { from: number; to: number; source: string; sequence: number } | null;
export type ScalperV2InspectionMode = "latest" | "hover" | "locked";
type ProfileGeometry = { side: "CE" | "PE"; strike: number; currentOi: number; top: number; width: number; lane: number };

export function ScalperV2Chart({
  id, title, subtitle, bars, interval, externalCrosshair, externalRange, inspectionMode, inspectionTime,
  fitRequest, onCrosshair, onRangeChange, onTimeClick, rankLevels = EMPTY_LEVELS, oiProfile = EMPTY_PROFILE,
  signalEvents = EMPTY_SIGNALS, measurementTimes = EMPTY_MEASUREMENT, selectedStrike = null, hoveredStrike = null,
}: {
  id: "underlying" | "call" | "put"; title: string; subtitle: string; bars: Row[]; interval: number;
  externalCrosshair: ScalperV2Crosshair; externalRange: ScalperV2TimeRange;
  inspectionMode: ScalperV2InspectionMode; inspectionTime: number | null; fitRequest: number;
  onCrosshair: (value: ScalperV2Crosshair) => void; onRangeChange: (value: ScalperV2TimeRange) => void;
  onTimeClick?: (time: string) => void;
  rankLevels?: Array<{ side: "CE" | "PE"; rank: number; strike: number; currentOi: number }>;
  oiProfile?: Array<{ side: "CE" | "PE"; strike: number; currentOi: number }>;
  signalEvents?: Array<{ direction: "CALL" | "PUT"; setupTime: string; state: string }>;
  measurementTimes?: string[];
  selectedStrike?: number | null;
  hoveredStrike?: number | null;
}) {
  const bodyRef = useRef<HTMLDivElement>(null), hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null), emaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markerRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const rankLinesRef = useRef<IPriceLine[]>([]), measurementLinesRef = useRef<IPriceLine[]>([]), selectionLinesRef = useRef<IPriceLine[]>([]);
  const profileRowsRef = useRef(oiProfile), suppressCrosshairRef = useRef(0), suppressRangeRef = useRef(0);
  const pointerFrameRef = useRef(0), profileFrameRef = useRef(0), dimensionsRef = useRef({ width: 0, height: 0 });
  const callbacksRef = useRef({ onCrosshair, onRangeChange, onTimeClick });
  callbacksRef.current = { onCrosshair, onRangeChange, onTimeClick };
  profileRowsRef.current = oiProfile;
  const [profileGeometry, setProfileGeometry] = useState<ProfileGeometry[]>([]);

  const data = useMemo(() => bars.flatMap((bar): CandlestickData<Time>[] => {
    const time = chartTime(bar.end), open = numeric(bar.open), high = numeric(bar.high), low = numeric(bar.low), close = numeric(bar.close);
    return bar.closed === true && time != null && open != null && high != null && low != null && close != null ? [{ time, open, high, low, close }] : [];
  }), [bars]);
  const byTime = useMemo(() => new Map(data.map((bar) => [Number(bar.time), bar])), [data]);
  const emaData = useMemo(() => bars.flatMap((bar) => {
    const time = chartTime(bar.end), value = numeric(bar.ema9);
    return time != null && value != null ? [{ time: time as Time, value }] : [];
  }), [bars]);
  const emaByTime = useMemo(() => new Map(emaData.map((row) => [Number(row.time), row.value])), [emaData]);
  const sessionBounds = useMemo(() => observedSessionBounds(bars), [bars]);
  const renderBounds = useMemo(() => paddedSessionBounds(sessionBounds, 0.05), [sessionBounds]);
  const selected = inspectionTime == null ? data.at(-1) : byTime.get(inspectionTime);
  const selectedEma = selected ? emaByTime.get(Number(selected.time)) ?? null : null;
  const distance = selected && selectedEma != null ? selected.close - selectedEma : null;

  const scheduleProfile = () => {
    cancelAnimationFrame(profileFrameRef.current);
    profileFrameRef.current = requestAnimationFrame(() => {
      const candle = candleRef.current, chart = chartRef.current, body = bodyRef.current;
      if (!candle || !chart || !body) return;
      const plotWidth = chart.timeScale().width(), lane = Math.max(0, Math.min(180, plotWidth * 0.22));
      const maximum = Math.max(0, ...profileRowsRef.current.map((row) => row.currentOi));
      setProfileGeometry(profileRowsRef.current.flatMap((row) => {
        const top = candle.priceToCoordinate(row.strike), width = profileWidth(row.currentOi, maximum, lane);
        return top == null || width == null || width === 0 ? [] : [{ ...row, top, width, lane }];
      }));
      body.dataset.profileLaneWidth = String(Math.round(lane * 100) / 100);
      body.dataset.profileRows = String(profileRowsRef.current.length);
    });
  };

  useEffect(() => {
    const host = hostRef.current, body = bodyRef.current;
    if (!host || !body) return;
    const instance = createChart(host, {
      autoSize: false, width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight),
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#526175", fontSize: 12 },
      localization: { locale: "en-IN", timeFormatter: istChartTimeLabel },
      grid: { vertLines: { color: "#edf1f6" }, horzLines: { color: "#edf1f6" } }, crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#d7e0eb", scaleMargins: { top: 0, bottom: 0 } },
      timeScale: { borderColor: "#d7e0eb", timeVisible: true, secondsVisible: false, barSpacing: 8, minBarSpacing: 0.5, rightOffset: 1, tickMarkFormatter: istChartTimeLabel },
      handleScale: true, handleScroll: true,
    });
    const candle = instance.addSeries(CandlestickSeries, {
      upColor: "#059669", downColor: "#dc2626", borderUpColor: "#059669", borderDownColor: "#dc2626",
      wickUpColor: "#059669", wickDownColor: "#dc2626", priceLineVisible: false, lastValueVisible: true,
    });
    const ema = instance.addSeries(LineSeries, {
      color: "#d97706", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false, autoscaleInfoProvider: () => null,
    });
    const marker = createSeriesMarkers(candle, []);
    instance.subscribeCrosshairMove((param) => {
      if (suppressCrosshairRef.current > 0) return;
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = requestAnimationFrame(() => callbacksRef.current.onCrosshair(param.time == null ? null : { time: Number(param.time), source: id, sequence: performance.now() }));
    });
    instance.subscribeClick((param) => {
      if (param.time != null) callbacksRef.current.onTimeClick?.(new Date(Number(param.time) * 1000).toISOString());
    });
    const rangeHandler = (range: { from: Time; to: Time } | null) => {
      if (suppressRangeRef.current > 0 || !range) return;
      callbacksRef.current.onRangeChange({ from: Number(range.from), to: Number(range.to), source: id, sequence: performance.now() });
    };
    instance.timeScale().subscribeVisibleTimeRangeChange(rangeHandler);
    chartRef.current = instance; candleRef.current = candle; emaRef.current = ema; markerRef.current = marker;

    let resizeFrame = 0;
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const width = Math.round(host.clientWidth), height = Math.round(host.clientHeight);
        if (width <= 0 || height <= 0 || (width === dimensionsRef.current.width && height === dimensionsRef.current.height)) return;
        dimensionsRef.current = { width, height }; instance.resize(width, height);
        const nativeRect = instance.chartElement().getBoundingClientRect();
        host.dataset.hostWidth = String(width); host.dataset.hostHeight = String(height);
        host.dataset.nativeWidth = String(Math.round(nativeRect.width * 100) / 100); host.dataset.nativeHeight = String(Math.round(nativeRect.height * 100) / 100);
        host.dataset.timeScaleWidth = String(instance.timeScale().width()); host.dataset.timeScaleHeight = String(instance.timeScale().height());
        scheduleProfile();
      });
    };
    const observer = new ResizeObserver(resize); observer.observe(host);
    body.addEventListener("pointermove", scheduleProfile, { passive: true }); body.addEventListener("pointerup", scheduleProfile, { passive: true }); resize();
    return () => {
      observer.disconnect(); body.removeEventListener("pointermove", scheduleProfile); body.removeEventListener("pointerup", scheduleProfile);
      instance.timeScale().unsubscribeVisibleTimeRangeChange(rangeHandler); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(pointerFrameRef.current); cancelAnimationFrame(profileFrameRef.current);
      marker.detach(); instance.remove(); chartRef.current = null; candleRef.current = null; emaRef.current = null; markerRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    candleRef.current?.setData(data); emaRef.current?.setData(emaData);
    candleRef.current?.applyOptions({ autoscaleInfoProvider: renderBounds ? () => ({ priceRange: { minValue: renderBounds.low, maxValue: renderBounds.high } }) : undefined });
    scheduleProfile();
  }, [data, emaData, renderBounds]);

  useEffect(() => {
    const candle = candleRef.current; if (!candle) return;
    rankLinesRef.current.forEach((line) => candle.removePriceLine(line));
    rankLinesRef.current = rankLevels.filter((level) => levelInObservedSession(level.strike, sessionBounds)).map((level) => candle.createPriceLine({
      price: level.strike, color: level.side === "CE" ? "#2563eb" : "#a86600", lineWidth: level.rank === 1 ? 2 : 1,
      lineStyle: level.rank === 1 ? 0 : 2, axisLabelVisible: false, title: `${level.side}${level.rank}`,
    }));
  }, [rankLevels, sessionBounds]);

  useEffect(() => {
    const candle = candleRef.current; if (!candle || id !== "underlying") return;
    if (bodyRef.current) {
      bodyRef.current.dataset.selectedStrike = selectedStrike == null ? "" : String(selectedStrike);
      bodyRef.current.dataset.hoveredStrike = hoveredStrike == null ? "" : String(hoveredStrike);
    }
    selectionLinesRef.current.forEach((line) => candle.removePriceLine(line));
    selectionLinesRef.current = [
      selectedStrike != null && levelInObservedSession(selectedStrike, sessionBounds) ? { price: selectedStrike, title: "Selected", color: "#6651d9", lineWidth: 2 as const, lineStyle: 2 as const } : null,
      hoveredStrike != null && hoveredStrike !== selectedStrike && levelInObservedSession(hoveredStrike, sessionBounds) ? { price: hoveredStrike, title: "Hovered strike", color: "#0f766e", lineWidth: 1 as const, lineStyle: 3 as const } : null,
    ].flatMap((options) => options ? [candle.createPriceLine({ ...options, axisLabelVisible: true })] : []);
  }, [hoveredStrike, id, selectedStrike, sessionBounds]);

  useEffect(() => {
    markerRef.current?.setMarkers(signalEvents.flatMap((event) => {
      const time = chartTime(event.setupTime); if (time == null || !byTime.has(Number(time))) return [];
      return [{ time: time as Time, position: event.direction === "CALL" ? "belowBar" as const : "aboveBar" as const,
        color: event.direction === "CALL" ? "#2563eb" : "#a86600", shape: event.state === "RETROSPECTIVE_ENTRY_REFERENCE" ? "arrowUp" as const : "circle" as const,
        text: event.state === "RETROSPECTIVE_ENTRY_REFERENCE" ? "Entry ref" : "Setup" }];
    }));
  }, [byTime, signalEvents]);

  useEffect(() => {
    const candle = candleRef.current; if (!candle) return;
    measurementLinesRef.current.forEach((line) => candle.removePriceLine(line));
    measurementLinesRef.current = measurementTimes.flatMap((value, index) => {
      const row = byTime.get(Number(chartTime(value))); if (!row) return [];
      return [candle.createPriceLine({ price: index === 0 ? row.open : row.close, color: index === 0 ? "#6651d9" : "#0f766e", lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: index === 0 ? "A open" : "B close" })];
    });
  }, [byTime, measurementTimes]);

  useEffect(() => {
    const chart = chartRef.current; if (!chart || data.length === 0) return;
    suppressRangeRef.current += 1; chart.timeScale().setVisibleRange({ from: data[0].time, to: data[data.length - 1].time });
    requestAnimationFrame(() => { suppressRangeRef.current = Math.max(0, suppressRangeRef.current - 1); });
  }, [fitRequest, data]);

  useEffect(() => {
    const chart = chartRef.current; if (!chart || !externalRange || externalRange.source === id) return;
    suppressRangeRef.current += 1; chart.timeScale().setVisibleRange({ from: externalRange.from as UTCTimestamp, to: externalRange.to as UTCTimestamp });
    requestAnimationFrame(() => { suppressRangeRef.current = Math.max(0, suppressRangeRef.current - 1); });
  }, [externalRange, id]);

  useEffect(() => {
    const chart = chartRef.current, candle = candleRef.current; if (!chart || !candle) return;
    suppressCrosshairRef.current += 1;
    if (!externalCrosshair || externalCrosshair.source === id) {
      if (!externalCrosshair && inspectionMode !== "locked") chart.clearCrosshairPosition();
    } else {
      const exact = byTime.get(externalCrosshair.time); if (exact) chart.setCrosshairPosition(exact.close, exact.time, candle); else chart.clearCrosshairPosition();
    }
    requestAnimationFrame(() => { suppressCrosshairRef.current = Math.max(0, suppressCrosshairRef.current - 1); });
  }, [byTime, externalCrosshair, id, inspectionMode]);

  return <section className={css.chartPanel} data-testid={`v2-chart-panel-${id}`} aria-label={`${title} ${interval} minute candlestick chart`}>
    <header className={css.chartHeader}><span><strong>{title}</strong><small title={subtitle}>{subtitle} · {interval}m</small></span>
      <span className={css.ohlc} data-testid={`v2-chart-readout-${id}`}><b>{inspectionMode === "latest" ? "Latest" : inspectionMode === "locked" ? "Locked" : "At cursor"}</b>
        {selected ? <><span>O {format(selected.open)}</span><span>H {format(selected.high)}</span><span>L {format(selected.low)}</span><span>C {format(selected.close)}</span><span>EMA9 {format(selectedEma)}</span><span className={distance == null ? undefined : distance > 0 ? css.positive : distance < 0 ? css.negative : undefined}>C−EMA {distance == null ? "—" : `${distance > 0 ? "+" : ""}${format(distance)}`}</span></> : <span>No exact completed candle</span>}
      </span></header>
    <div ref={bodyRef} className={css.chartBody} data-testid={`v2-chart-body-${id}`}>
      <div ref={hostRef} className={css.chartCanvas} data-testid={`v2-chart-host-${id}`} />
      {id === "underlying" && profileGeometry.length > 0 && <div className={css.oiProfile} data-testid="v2-oi-profile" aria-hidden="true"><span>Current OI</span>{profileGeometry.map((row) => <i key={`${row.side}-${row.strike}`} className={row.side === "CE" ? css.profileCe : css.profilePe} style={{ top: row.top + (row.side === "CE" ? -5 : 2), width: row.width, maxWidth: row.lane }} title={`${row.side} ${row.strike} OI ${row.currentOi}`} />)}</div>}
    </div>
  </section>;
}
