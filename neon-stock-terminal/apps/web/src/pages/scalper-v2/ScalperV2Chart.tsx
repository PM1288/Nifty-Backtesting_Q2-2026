import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, LineSeries, createChart, createSeriesMarkers,
  type CandlestickData, type IChartApi, type IPriceLine, type ISeriesApi,
  type ISeriesMarkersPluginApi, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { levelInObservedSession, observedSessionBounds, paddedSessionBounds, profileWidth } from "../../lib/scalperV2Geometry";
import { scalperV2SeriesUpdatePlan } from "../../lib/scalperV2SeriesUpdate";
import { istChartTimeLabel } from "../../lib/tradingAnalyticsTime";
import { anchorFromChartPoint, ScalperV2DrawingPrimitive } from "./ScalperV2DrawingPrimitive";
import { drawingAnchorCount, type ScalperV2Drawing, type ScalperV2DrawingAnchor, type ScalperV2DrawingTool } from "./scalperV2Drawings";
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
export type ScalperV2HorizontalView = "day" | "last30" | "last60";
export type ScalperV2VerticalView = "session" | "visible" | "manual";
type ProfileGeometry = { side: "CE" | "PE"; strike: number; currentOi: number; top: number; width: number; lane: number };

export function ScalperV2Chart({
  id, title, subtitle, bars, interval, externalCrosshair, externalRange, inspectionMode, inspectionTime,
  fitRequest, horizontalView, verticalView, yLocked, onCrosshair, onRangeChange, onTimeClick, rankLevels = EMPTY_LEVELS, oiProfile = EMPTY_PROFILE,
  signalEvents = EMPTY_SIGNALS, measurementTimes = EMPTY_MEASUREMENT, selectedStrike = null, hoveredStrike = null,
  drawingTool = "select", pendingDrawingCount = 0, drawings = [], selectedDrawingId = null, onDrawingAnchor, onDrawingUpdate, onDrawingSelect,
}: {
  id: "underlying" | "call" | "put"; title: string; subtitle: string; bars: Row[]; interval: number;
  externalCrosshair: ScalperV2Crosshair; externalRange: ScalperV2TimeRange;
  inspectionMode: ScalperV2InspectionMode; inspectionTime: number | null; fitRequest: number; horizontalView: ScalperV2HorizontalView;
  verticalView: ScalperV2VerticalView; yLocked: boolean;
  onCrosshair: (value: ScalperV2Crosshair) => void; onRangeChange: (value: ScalperV2TimeRange) => void;
  onTimeClick?: (time: string) => void;
  rankLevels?: Array<{ side: "CE" | "PE"; rank: number; strike: number; currentOi: number }>;
  oiProfile?: Array<{ side: "CE" | "PE"; strike: number; currentOi: number }>;
  signalEvents?: Array<{ direction: "CALL" | "PUT"; setupTime: string; state: string }>;
  measurementTimes?: string[];
  selectedStrike?: number | null;
  hoveredStrike?: number | null;
  drawingTool?: ScalperV2DrawingTool;
  drawings?: ScalperV2Drawing[];
  selectedDrawingId?: string | null;
  pendingDrawingCount?: number;
  onDrawingAnchor?: (tool: Exclude<ScalperV2DrawingTool, "select">, paneRole: "underlying" | "call" | "put", anchor: ScalperV2DrawingAnchor) => void;
  onDrawingUpdate?: (drawing: ScalperV2Drawing) => void;
  onDrawingSelect?: (id: string | null) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null), hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null), emaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markerRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const drawingPrimitiveRef = useRef<ScalperV2DrawingPrimitive | null>(null);
  const rankLinesRef = useRef<IPriceLine[]>([]), measurementLinesRef = useRef<IPriceLine[]>([]), selectionLinesRef = useRef<IPriceLine[]>([]);
  const profileRowsRef = useRef(oiProfile), suppressCrosshairRef = useRef(0), suppressRangeRef = useRef(0);
  const pointerFrameRef = useRef(0), profileFrameRef = useRef(0), dimensionsRef = useRef({ width: 0, height: 0 });
  const appliedFitRef = useRef<number | null>(null), setDataCountRef = useRef(0);
  const candleDataRef = useRef<CandlestickData<Time>[]>([]), emaDataRef = useRef<Array<{ time: Time; value: number }>>([]), updateCountRef = useRef(0);
  const drawingsRef = useRef(drawings);
  const callbacksRef = useRef({ onCrosshair, onRangeChange, onTimeClick, onDrawingAnchor, onDrawingUpdate, onDrawingSelect, drawingTool });
  callbacksRef.current = { onCrosshair, onRangeChange, onTimeClick, onDrawingAnchor, onDrawingUpdate, onDrawingSelect, drawingTool };
  drawingsRef.current = drawings;
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
      body.dataset.profileGeometry = JSON.stringify(profileRowsRef.current.flatMap((row) => {
        const coordinate = candle.priceToCoordinate(row.strike), width = profileWidth(row.currentOi, maximum, lane);
        return coordinate == null || width == null ? [] : [{ side: row.side, strike: row.strike, coordinate, width }];
      }));
    });
  };

  useEffect(() => {
    const host = hostRef.current, body = bodyRef.current;
    if (!host || !body) return;
    candleDataRef.current = []; emaDataRef.current = [];
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
    const drawingPrimitive = new ScalperV2DrawingPrimitive();
    candle.attachPrimitive(drawingPrimitive);
    instance.subscribeCrosshairMove((param) => {
      if (suppressCrosshairRef.current > 0) return;
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = requestAnimationFrame(() => callbacksRef.current.onCrosshair(param.time == null ? null : { time: Number(param.time), source: id, sequence: performance.now() }));
    });
    let suppressNextChartClick = false;
    instance.subscribeClick((param) => {
      if (suppressNextChartClick) { suppressNextChartClick = false; return; }
      const activeTool = callbacksRef.current.drawingTool;
      body.dataset.lastDrawingClick = JSON.stringify({ tool: activeTool, time: param.time == null ? null : Number(param.time), hasPoint: Boolean(param.point) });
      if (activeTool === "select") {
        const hoveredId = typeof param.hoveredObjectId === "string" ? param.hoveredObjectId : null;
        if (hoveredId) { callbacksRef.current.onDrawingSelect?.(hoveredId); return; }
        callbacksRef.current.onDrawingSelect?.(null);
        if (param.time != null) callbacksRef.current.onTimeClick?.(new Date(Number(param.time) * 1000).toISOString());
        return;
      }
      const anchor = anchorFromChartPoint(param, (coordinate) => candle.coordinateToPrice(coordinate));
      if (!anchor) { body.dataset.lastDrawingClickResult = "no-market-anchor"; return; }
      callbacksRef.current.onDrawingAnchor?.(activeTool, id, anchor); body.dataset.lastDrawingClickResult = "published-market-anchor";
    });
    const rangeHandler = (range: { from: Time; to: Time } | null) => {
      if (suppressRangeRef.current > 0 || !range) return;
      host.dataset.visibleFrom = String(Number(range.from)); host.dataset.visibleTo = String(Number(range.to));
      callbacksRef.current.onRangeChange({ from: Number(range.from), to: Number(range.to), source: id, sequence: performance.now() });
    };
    instance.timeScale().subscribeVisibleTimeRangeChange(rangeHandler);
    chartRef.current = instance; candleRef.current = candle; emaRef.current = ema; markerRef.current = marker; drawingPrimitiveRef.current = drawingPrimitive;
    host.dataset.chartCreateCount = "1";

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
    let dragging: { id: string; anchorIndex: number; pointerId: number; drawing: ScalperV2Drawing } | null = null;
    let creating: { tool: Exclude<ScalperV2DrawingTool, "select">; pointerId: number; anchor: ScalperV2DrawingAnchor } | null = null;
    const drawingAnchorAtPointer = (event: PointerEvent) => {
      const rect = body.getBoundingClientRect(), time = instance.timeScale().coordinateToTime(event.clientX - rect.left), price = candle.coordinateToPrice(event.clientY - rect.top);
      return time == null || price == null ? null : { time: Number(time), price };
    };
    const drawingPointerDown = (event: PointerEvent) => {
      const activeTool = callbacksRef.current.drawingTool;
      if (activeTool !== "select") {
        const anchor = drawingAnchorAtPointer(event); if (!anchor) return;
        suppressNextChartClick = true;
        if (drawingAnchorCount(activeTool) === 1) callbacksRef.current.onDrawingAnchor?.(activeTool, id, anchor);
        else { creating = { tool: activeTool, pointerId: event.pointerId, anchor }; body.setPointerCapture(event.pointerId); }
        event.preventDefault(); event.stopPropagation(); return;
      }
      const rect = body.getBoundingClientRect(), hit = drawingPrimitive.findAnchor(event.clientX - rect.left, event.clientY - rect.top);
      if (!hit) return;
      const drawing = drawingsRef.current.find((row) => row.id === hit.id); if (!drawing || drawing.locked) return;
      dragging = { ...hit, pointerId: event.pointerId, drawing }; body.setPointerCapture(event.pointerId); callbacksRef.current.onDrawingSelect?.(drawing.id);
      event.preventDefault(); event.stopPropagation();
    };
    const drawingPointerMove = (event: PointerEvent) => {
      if (creating?.pointerId === event.pointerId) { event.preventDefault(); event.stopPropagation(); return; }
      if (!dragging || dragging.pointerId !== event.pointerId) return;
      const anchor = drawingAnchorAtPointer(event); if (!anchor) return;
      dragging = { ...dragging, drawing: { ...dragging.drawing, anchors: dragging.drawing.anchors.map((value, index) => index === dragging!.anchorIndex ? anchor : value) } };
      drawingPrimitive.setData(drawingsRef.current.map((row) => row.id === dragging!.id ? dragging!.drawing : row), dragging.id);
      event.preventDefault(); event.stopPropagation();
    };
    const drawingPointerUp = (event: PointerEvent) => {
      if (creating?.pointerId === event.pointerId) {
        const end = drawingAnchorAtPointer(event) ?? creating.anchor, start = creating.anchor, tool = creating.tool;
        callbacksRef.current.onDrawingAnchor?.(tool, id, start); callbacksRef.current.onDrawingAnchor?.(tool, id, end);
        if (drawingAnchorCount(tool) === 3) callbacksRef.current.onDrawingAnchor?.(tool, id, { time: end.time, price: tool === "parallel_channel" ? end.price + (end.price === start.price ? Math.max(Math.abs(end.price) * .02, .1) : (end.price - start.price) * .25) : start.price - (end.price === start.price ? Math.max(Math.abs(end.price) * .02, .1) : (end.price - start.price) * .5) });
        creating = null; body.releasePointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation(); return;
      }
      if (!dragging || dragging.pointerId !== event.pointerId) return;
      const completed = dragging.drawing; dragging = null; body.releasePointerCapture(event.pointerId); callbacksRef.current.onDrawingUpdate?.(completed);
      event.preventDefault(); event.stopPropagation();
    };
    body.addEventListener("pointerdown", drawingPointerDown, true); body.addEventListener("pointermove", drawingPointerMove, true); body.addEventListener("pointerup", drawingPointerUp, true);
    body.addEventListener("pointermove", scheduleProfile, { passive: true }); body.addEventListener("pointerup", scheduleProfile, { passive: true }); body.addEventListener("wheel", scheduleProfile, { passive: true }); resize();
    return () => {
      observer.disconnect(); body.removeEventListener("pointermove", scheduleProfile); body.removeEventListener("pointerup", scheduleProfile); body.removeEventListener("wheel", scheduleProfile);
      body.removeEventListener("pointerdown", drawingPointerDown, true); body.removeEventListener("pointermove", drawingPointerMove, true); body.removeEventListener("pointerup", drawingPointerUp, true);
      instance.timeScale().unsubscribeVisibleTimeRangeChange(rangeHandler); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(pointerFrameRef.current); cancelAnimationFrame(profileFrameRef.current);
      candle.detachPrimitive(drawingPrimitive); marker.detach(); instance.remove(); chartRef.current = null; candleRef.current = null; emaRef.current = null; markerRef.current = null; drawingPrimitiveRef.current = null;
    };
  }, [id]);

  useEffect(() => { drawingPrimitiveRef.current?.setData(drawings, selectedDrawingId); }, [drawings, selectedDrawingId]);

  useEffect(() => {
    const candle = candleRef.current, ema = emaRef.current;
    if (candle) {
      const plan = scalperV2SeriesUpdatePlan(candleDataRef.current, data);
      if (plan.kind === "replace") { candle.setData(plan.rows); setDataCountRef.current += 1; }
      else if (plan.kind === "update") { plan.rows.forEach((row) => candle.update(row)); updateCountRef.current += plan.rows.length; }
      candleDataRef.current = data;
    }
    if (ema) {
      const plan = scalperV2SeriesUpdatePlan(emaDataRef.current, emaData);
      if (plan.kind === "replace") ema.setData(plan.rows);
      else if (plan.kind === "update") plan.rows.forEach((row) => ema.update(row));
      emaDataRef.current = emaData;
    }
    if (hostRef.current) { hostRef.current.dataset.setDataCount = String(setDataCountRef.current); hostRef.current.dataset.updateCount = String(updateCountRef.current); }
    candleRef.current?.applyOptions({ autoscaleInfoProvider: verticalView === "session" && renderBounds ? () => ({ priceRange: { minValue: renderBounds.low, maxValue: renderBounds.high } }) : undefined });
    chartRef.current?.priceScale("right").setAutoScale(verticalView !== "manual" && !yLocked);
    scheduleProfile();
  }, [data, emaData, renderBounds, verticalView, yLocked]);

  useEffect(() => {
    chartRef.current?.applyOptions({ handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: !yLocked }, axisDoubleClickReset: { time: true, price: !yLocked } } });
    if (bodyRef.current) { bodyRef.current.dataset.verticalView = verticalView; bodyRef.current.dataset.yLocked = String(yLocked); }
  }, [verticalView, yLocked]);

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
    if (appliedFitRef.current === fitRequest) return;
    appliedFitRef.current = fitRequest;
    const count = horizontalView === "last30" ? 30 : horizontalView === "last60" ? 60 : data.length;
    const visible = data.slice(-count);
    if (hostRef.current) { hostRef.current.dataset.visibleFrom = String(Number(visible[0].time)); hostRef.current.dataset.visibleTo = String(Number(visible[visible.length - 1].time)); hostRef.current.dataset.horizontalView = horizontalView; }
    suppressRangeRef.current += 1; chart.timeScale().setVisibleRange({ from: visible[0].time, to: visible[visible.length - 1].time });
    requestAnimationFrame(() => { suppressRangeRef.current = Math.max(0, suppressRangeRef.current - 1); });
  }, [fitRequest, horizontalView, data]);

  useEffect(() => {
    const chart = chartRef.current; if (!chart || !externalRange || externalRange.source === id) return;
    if (hostRef.current) { hostRef.current.dataset.visibleFrom = String(externalRange.from); hostRef.current.dataset.visibleTo = String(externalRange.to); }
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
      {drawingTool !== "select" && <div className={css.drawingHint} aria-live="polite">{pendingDrawingCount + 1}/{drawingAnchorCount(drawingTool)} · click {pendingDrawingCount === 0 ? "first" : "next"} anchor</div>}
      {id === "underlying" && profileGeometry.length > 0 && <div className={css.oiProfile} data-testid="v2-oi-profile" aria-hidden="true"><span>Current OI</span>{profileGeometry.map((row) => <i key={`${row.side}-${row.strike}`} className={row.side === "CE" ? css.profileCe : css.profilePe} style={{ top: row.top + (row.side === "CE" ? -5 : 2), width: row.width, maxWidth: row.lane }} title={`${row.side} ${row.strike} OI ${row.currentOi}`} />)}</div>}
    </div>
  </section>;
}
