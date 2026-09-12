import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, LineSeries, createChart, createSeriesMarkers,
  type CandlestickData, type IChartApi, type IPriceLine, type ISeriesApi,
  type ISeriesMarkersPluginApi, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { levelInObservedSession, maxPainOverlayState, observedSessionBounds, paddedSessionBounds } from "../../lib/scalperV2Geometry";
import { allProfileStrikeBounds, type ScalperV2ProfileMode, type ScalperV2ProfileRow } from "../../lib/scalperV2OiProfile";
import { mergeScalperV2Levels } from "../../lib/scalperV2Levels";
import { visibleScalperV2ReferenceLevels, type ScalperV2ReferenceLevel } from "../../lib/scalperV2ReferenceLevels";
import { scalperV2SeriesUpdatePlan } from "../../lib/scalperV2SeriesUpdate";
import { istChartTimeLabel } from "../../lib/tradingAnalyticsTime";
import { ScalperV2DrawingPrimitive } from "./ScalperV2DrawingPrimitive";
import { ScalperV2OiProfilePrimitive } from "./ScalperV2OiProfilePrimitive";
import { createScalperV2Drawing, drawingAnchorCount, type ScalperV2Drawing, type ScalperV2DrawingAnchor, type ScalperV2DrawingTool } from "./scalperV2Drawings";
import css from "./ScalperV2.module.css";

type Row = Record<string, unknown>;
const EMPTY_LEVELS: Array<{ side: "CE" | "PE"; rank: number; strike: number; currentOi: number }> = [];
const EMPTY_PROFILE: ScalperV2ProfileRow[] = [];
const EMPTY_REFERENCE_LEVELS: ScalperV2ReferenceLevel[] = [];
const EMPTY_SIGNALS: Array<{ direction: "CALL" | "PUT"; setupTime: string; state: string }> = [];
const EMPTY_MEASUREMENT: string[] = [];
const EMPTY_MAX_PAIN: number[] = [];
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

export function ScalperV2Chart({
  id, title, subtitle, bars, interval, externalCrosshair, externalRange, inspectionMode, inspectionTime,
  fitRequest, horizontalView, verticalView, yLocked, onCrosshair, onRangeChange, onTimeClick, rankLevels = EMPTY_LEVELS, oiProfile = EMPTY_PROFILE, profileMode = "change", profileLabel = "Change in OI",
  profileRangeExpanded = false,
  maxPainStrikes = EMPTY_MAX_PAIN,
  signalEvents = EMPTY_SIGNALS, measurementTimes = EMPTY_MEASUREMENT, selectedStrike = null, selectedPutStrike = null, hoveredStrike = null,
  referenceLevels = EMPTY_REFERENCE_LEVELS,
  drawingTool = "select", drawings = [], selectedDrawingId = null, onDrawingCreate, onDrawingUpdate, onDrawingSelect,
}: {
  id: "underlying" | "call" | "put"; title: string; subtitle: string; bars: Row[]; interval: number;
  externalCrosshair: ScalperV2Crosshair; externalRange: ScalperV2TimeRange;
  inspectionMode: ScalperV2InspectionMode; inspectionTime: number | null; fitRequest: number; horizontalView: ScalperV2HorizontalView;
  verticalView: ScalperV2VerticalView; yLocked: boolean;
  onCrosshair: (value: ScalperV2Crosshair) => void; onRangeChange: (value: ScalperV2TimeRange) => void;
  onTimeClick?: (time: string) => void;
  rankLevels?: Array<{ side: "CE" | "PE"; rank: number; strike: number; currentOi: number }>;
  oiProfile?: ScalperV2ProfileRow[];
  profileMode?: ScalperV2ProfileMode;
  profileLabel?: string;
  profileRangeExpanded?: boolean;
  maxPainStrikes?: number[];
  signalEvents?: Array<{ direction: "CALL" | "PUT"; setupTime: string; state: string }>;
  measurementTimes?: string[];
  selectedStrike?: number | null;
  selectedPutStrike?: number | null;
  hoveredStrike?: number | null;
  referenceLevels?: ScalperV2ReferenceLevel[];
  drawingTool?: ScalperV2DrawingTool;
  drawings?: ScalperV2Drawing[];
  selectedDrawingId?: string | null;
  onDrawingCreate?: (tool: Exclude<ScalperV2DrawingTool, "select">, paneRole: "underlying" | "call" | "put", anchors: ScalperV2DrawingAnchor[]) => void;
  onDrawingUpdate?: (drawing: ScalperV2Drawing) => void;
  onDrawingSelect?: (id: string | null) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null), hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null), emaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markerRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const drawingPrimitiveRef = useRef<ScalperV2DrawingPrimitive | null>(null);
  const profilePrimitiveRef = useRef<ScalperV2OiProfilePrimitive | null>(null);
  const semanticLinesRef = useRef<IPriceLine[]>([]), measurementLinesRef = useRef<IPriceLine[]>([]);
  const profileRowsRef = useRef(oiProfile), profileModeRef = useRef(profileMode), suppressCrosshairRef = useRef(0), suppressRangeRef = useRef(0);
  const yLockedRef = useRef(yLocked);
  const pointerFrameRef = useRef(0), profileFrameRef = useRef(0), dimensionsRef = useRef({ width: 0, height: 0 });
  const appliedFitRef = useRef<number | null>(null), setDataCountRef = useRef(0);
  const candleDataRef = useRef<CandlestickData<Time>[]>([]), emaDataRef = useRef<Array<{ time: Time; value: number }>>([]), updateCountRef = useRef(0);
  const cancelDrawingGestureRef = useRef<(() => void) | null>(null);
  const drawingsRef = useRef(drawings);
  const callbacksRef = useRef({ onCrosshair, onRangeChange, onTimeClick, onDrawingCreate, onDrawingUpdate, onDrawingSelect, drawingTool });
  callbacksRef.current = { onCrosshair, onRangeChange, onTimeClick, onDrawingCreate, onDrawingUpdate, onDrawingSelect, drawingTool };
  drawingsRef.current = drawings;
  profileRowsRef.current = oiProfile;
  profileModeRef.current = profileMode;
  yLockedRef.current = yLocked;
  const [drawingHint, setDrawingHint] = useState<string | null>(null);
  const [profileVisibility, setProfileVisibility] = useState({ visible: 0, total: 0, maximum: 0 });
  const profileVisibilityRef = useRef(profileVisibility);

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
  const profileBounds = useMemo(() => allProfileStrikeBounds(sessionBounds, oiProfile), [sessionBounds, oiProfile]);
  const maxPainOverlay = useMemo(
    () => maxPainOverlayState(maxPainStrikes, sessionBounds, profileBounds, profileRangeExpanded),
    [maxPainStrikes, profileBounds, profileRangeExpanded, sessionBounds],
  );
  const selected = inspectionTime == null ? data.at(-1) : byTime.get(inspectionTime);
  const selectedEma = selected ? emaByTime.get(Number(selected.time)) ?? null : null;
  const distance = selected && selectedEma != null ? selected.close - selectedEma : null;

  const scheduleProfile = () => {
    cancelAnimationFrame(profileFrameRef.current);
    profileFrameRef.current = requestAnimationFrame(() => {
      const primitive = profilePrimitiveRef.current, candle = candleRef.current, body = bodyRef.current;
      if (!primitive || !candle || !body) return;
      primitive.updateAllViews();
      const layout = primitive.getLayout();
      if (!layout) return;
      body.dataset.profileLaneWidth = String(Math.round(layout.laneWidth * 100) / 100);
      body.dataset.profileAnchorX = String(Math.round(layout.anchorX * 100) / 100);
      body.dataset.profileMaximum = String(layout.maximum);
      body.dataset.profileRows = String(profileRowsRef.current.length);
      body.dataset.profileVisibleStrikes = String(layout.visibleStrikes);
      body.dataset.profileTotalStrikes = String(layout.totalStrikes);
      if (profileVisibilityRef.current.visible !== layout.visibleStrikes || profileVisibilityRef.current.total !== layout.totalStrikes || profileVisibilityRef.current.maximum !== layout.maximum) {
        profileVisibilityRef.current = { visible: layout.visibleStrikes, total: layout.totalStrikes, maximum: layout.maximum };
        setProfileVisibility(profileVisibilityRef.current);
      }
      body.dataset.profileMaxAlignmentError = String(Math.max(0, ...layout.bars.map((row) => Math.abs(row.y - (candle.priceToCoordinate(row.strike) ?? Number.POSITIVE_INFINITY)))));
      body.dataset.profileGeometry = JSON.stringify(layout.bars.map((row) => ({
        side: row.side, strike: row.strike, coordinate: row.y, width: row.width, startX: row.startX, endX: row.endX,
        value: row.metric === "change" ? row.changeOi : row.currentOi,
        metric: row.metric, mode: profileModeRef.current, state: row.state,
      })));
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
      wickUpColor: "#059669", wickDownColor: "#dc2626", priceLineVisible: false, lastValueVisible: id !== "underlying",
    });
    const ema = instance.addSeries(LineSeries, {
      color: "#d97706", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false, autoscaleInfoProvider: () => null,
    });
    const marker = createSeriesMarkers(candle, []);
    const drawingPrimitive = new ScalperV2DrawingPrimitive();
    const profilePrimitive = new ScalperV2OiProfilePrimitive();
    candle.attachPrimitive(drawingPrimitive);
    if (id === "underlying") candle.attachPrimitive(profilePrimitive);
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
      body.dataset.lastDrawingClickResult = "owned-by-drawing-controller";
      return;
    });
    const rangeHandler = (range: { from: Time; to: Time } | null) => {
      if (suppressRangeRef.current > 0 || !range) return;
      host.dataset.visibleFrom = String(Number(range.from)); host.dataset.visibleTo = String(Number(range.to));
      callbacksRef.current.onRangeChange({ from: Number(range.from), to: Number(range.to), source: id, sequence: performance.now() });
    };
    instance.timeScale().subscribeVisibleTimeRangeChange(rangeHandler);
    chartRef.current = instance; candleRef.current = candle; emaRef.current = ema; markerRef.current = marker; drawingPrimitiveRef.current = drawingPrimitive; profilePrimitiveRef.current = id === "underlying" ? profilePrimitive : null;
    if (id === "underlying") profilePrimitive.setData(profileRowsRef.current, profileModeRef.current);
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
    let dragging: { id: string; anchorIndex: number | null; pointerId: number; original: ScalperV2Drawing; drawing: ScalperV2Drawing; start: { x: number; y: number }; points: Array<{ x: number; y: number }> } | null = null;
    let creating: { tool: Exclude<ScalperV2DrawingTool, "select">; anchors: ScalperV2DrawingAnchor[] } | null = null;
    const drawingAnchorAtPointer = (event: PointerEvent) => {
      const rect = body.getBoundingClientRect(), time = instance.timeScale().coordinateToTime(event.clientX - rect.left), price = candle.coordinateToPrice(event.clientY - rect.top);
      return time == null || price == null ? null : { time: Number(time), price };
    };
    const restoreChartInteraction = () => instance.applyOptions({
      handleScroll: true,
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: !yLockedRef.current }, axisDoubleClickReset: { time: true, price: !yLockedRef.current } },
    });
    const ownChartInteraction = () => instance.applyOptions({ handleScroll: false, handleScale: false });
    const cancelDrawingGesture = () => {
      creating = null; dragging = null; setDrawingHint(null);
      drawingPrimitive.setData(drawingsRef.current, null);
      restoreChartInteraction();
    };
    cancelDrawingGestureRef.current = cancelDrawingGesture;
    const previewCreation = (pointer: ScalperV2DrawingAnchor) => {
      if (!creating) return;
      const required = drawingAnchorCount(creating.tool);
      const anchors = [...creating.anchors, pointer];
      while (anchors.length < required) anchors.push({ ...pointer });
      const preview = createScalperV2Drawing({ id: "__scalper-v2-preview__", tool: creating.tool, paneRole: id, instrumentId: `preview:${id}`, anchors: anchors.slice(0, required) });
      drawingPrimitive.setData([...drawingsRef.current, preview], preview.id);
    };
    const drawingPointerDown = (event: PointerEvent) => {
      const activeTool = callbacksRef.current.drawingTool;
      if (activeTool !== "select") {
        const anchor = drawingAnchorAtPointer(event); if (!anchor) return;
        suppressNextChartClick = true;
        const required = drawingAnchorCount(activeTool);
        if (required === 1) callbacksRef.current.onDrawingCreate?.(activeTool, id, [anchor]);
        else if (!creating || creating.tool !== activeTool) {
          creating = { tool: activeTool, anchors: [anchor] }; ownChartInteraction();
          setDrawingHint(`1/${required} · move for preview, click next anchor · Esc cancels`);
        } else {
          const anchors = [...creating.anchors, anchor];
          if (anchors.length >= required) {
            const first = anchors[0], second = anchors[1];
            if (first.time === second.time && first.price === second.price) {
              setDrawingHint("Choose a different second anchor"); previewCreation(anchor);
            } else {
              callbacksRef.current.onDrawingCreate?.(activeTool, id, anchors); cancelDrawingGesture();
            }
          } else {
            creating = { ...creating, anchors };
            setDrawingHint(`${anchors.length}/${required} · move for preview, click next anchor · Esc cancels`);
          }
        }
        event.preventDefault(); event.stopPropagation(); return;
      }
      const rect = body.getBoundingClientRect(), point = { x: event.clientX - rect.left, y: event.clientY - rect.top }, hit = drawingPrimitive.findTarget(point.x, point.y);
      if (!hit) return;
      const drawing = drawingsRef.current.find((row) => row.id === hit.id); if (!drawing) return;
      callbacksRef.current.onDrawingSelect?.(drawing.id);
      if (drawing.locked) { event.preventDefault(); event.stopPropagation(); return; }
      dragging = { id: hit.id, anchorIndex: hit.anchorIndex, pointerId: event.pointerId, original: drawing, drawing, start: point, points: drawingPrimitive.pointsFor(hit.id) };
      body.setPointerCapture(event.pointerId); ownChartInteraction(); setDrawingHint(hit.kind === "anchor" ? `Moving anchor ${(hit.anchorIndex ?? 0) + 1}` : "Moving whole drawing");
      event.preventDefault(); event.stopPropagation();
    };
    const drawingPointerMove = (event: PointerEvent) => {
      if (creating) {
        const anchor = drawingAnchorAtPointer(event); if (anchor) previewCreation(anchor);
        event.preventDefault(); event.stopPropagation(); return;
      }
      if (!dragging || dragging.pointerId !== event.pointerId) return;
      const anchor = drawingAnchorAtPointer(event); if (!anchor) return;
      const rect = body.getBoundingClientRect(), current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      let anchors: ScalperV2DrawingAnchor[];
      if (dragging.anchorIndex != null) anchors = dragging.original.anchors.map((value, index) => index === dragging!.anchorIndex ? anchor : value);
      else {
        const dx = current.x - dragging.start.x, dy = current.y - dragging.start.y;
        anchors = dragging.points.flatMap((point) => {
          const time = instance.timeScale().coordinateToTime(point.x + dx), price = candle.coordinateToPrice(point.y + dy);
          return time == null || price == null ? [] : [{ time: Number(time), price }];
        });
        if (anchors.length !== dragging.original.anchors.length) return;
      }
      dragging = { ...dragging, drawing: { ...dragging.original, anchors, updatedAt: new Date().toISOString() } };
      drawingPrimitive.setData(drawingsRef.current.map((row) => row.id === dragging!.id ? dragging!.drawing : row), dragging.id);
      event.preventDefault(); event.stopPropagation();
    };
    const drawingPointerUp = (event: PointerEvent) => {
      if (!dragging || dragging.pointerId !== event.pointerId) return;
      const completed = dragging.drawing; dragging = null; body.releasePointerCapture(event.pointerId); callbacksRef.current.onDrawingUpdate?.(completed);
      setDrawingHint(null); restoreChartInteraction();
      event.preventDefault(); event.stopPropagation();
    };
    const drawingPointerCancel = (event: PointerEvent) => { if (dragging?.pointerId === event.pointerId || creating) cancelDrawingGesture(); };
    const drawingContextMenu = (event: MouseEvent) => { if (creating) { cancelDrawingGesture(); event.preventDefault(); } };
    const drawingKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && (creating || dragging)) cancelDrawingGesture(); };
    const drawingBlur = () => { if (creating || dragging) cancelDrawingGesture(); };
    body.addEventListener("pointerdown", drawingPointerDown, true); body.addEventListener("pointermove", drawingPointerMove, true); body.addEventListener("pointerup", drawingPointerUp, true);
    body.addEventListener("pointercancel", drawingPointerCancel, true); body.addEventListener("contextmenu", drawingContextMenu); window.addEventListener("keydown", drawingKeyDown); window.addEventListener("blur", drawingBlur);
    body.addEventListener("pointermove", scheduleProfile, { passive: true }); body.addEventListener("pointerup", scheduleProfile, { passive: true }); body.addEventListener("wheel", scheduleProfile, { passive: true }); resize();
    return () => {
      observer.disconnect(); body.removeEventListener("pointermove", scheduleProfile); body.removeEventListener("pointerup", scheduleProfile); body.removeEventListener("wheel", scheduleProfile);
      body.removeEventListener("pointerdown", drawingPointerDown, true); body.removeEventListener("pointermove", drawingPointerMove, true); body.removeEventListener("pointerup", drawingPointerUp, true);
      body.removeEventListener("pointercancel", drawingPointerCancel, true); body.removeEventListener("contextmenu", drawingContextMenu); window.removeEventListener("keydown", drawingKeyDown); window.removeEventListener("blur", drawingBlur);
      instance.timeScale().unsubscribeVisibleTimeRangeChange(rangeHandler); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(pointerFrameRef.current); cancelAnimationFrame(profileFrameRef.current);
      candle.detachPrimitive(drawingPrimitive); if (id === "underlying") candle.detachPrimitive(profilePrimitive); marker.detach(); instance.remove(); chartRef.current = null; candleRef.current = null; emaRef.current = null; markerRef.current = null; drawingPrimitiveRef.current = null; profilePrimitiveRef.current = null;
      cancelDrawingGestureRef.current = null;
    };
  }, [id]);

  useEffect(() => { drawingPrimitiveRef.current?.setData(drawings, selectedDrawingId); }, [drawings, selectedDrawingId]);
  useEffect(() => { cancelDrawingGestureRef.current?.(); }, [drawingTool]);
  useEffect(() => { profilePrimitiveRef.current?.setData(oiProfile, profileMode); scheduleProfile(); }, [oiProfile, profileMode]);

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
    const requestedBounds = id === "underlying" && profileRangeExpanded ? profileBounds : renderBounds;
    candleRef.current?.applyOptions({ autoscaleInfoProvider: verticalView === "session" && requestedBounds ? () => ({ priceRange: { minValue: requestedBounds.low, maxValue: requestedBounds.high } }) : undefined });
    chartRef.current?.priceScale("right").setAutoScale(verticalView !== "manual" && !yLocked);
    scheduleProfile();
  }, [data, emaData, id, profileBounds, profileRangeExpanded, renderBounds, verticalView, yLocked]);

  useEffect(() => {
    chartRef.current?.applyOptions({ handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: !yLocked }, axisDoubleClickReset: { time: true, price: !yLocked } } });
    if (bodyRef.current) { bodyRef.current.dataset.verticalView = verticalView; bodyRef.current.dataset.yLocked = String(yLocked); bodyRef.current.dataset.profileRangeExpanded = String(profileRangeExpanded); }
  }, [profileRangeExpanded, verticalView, yLocked]);

  useEffect(() => {
    const candle = candleRef.current; if (!candle || id !== "underlying") return;
    if (bodyRef.current) {
      bodyRef.current.dataset.selectedStrike = selectedStrike == null ? "" : String(selectedStrike);
      bodyRef.current.dataset.selectedCeStrike = selectedStrike == null ? "" : String(selectedStrike);
      bodyRef.current.dataset.selectedPeStrike = selectedPutStrike == null ? "" : String(selectedPutStrike);
      bodyRef.current.dataset.hoveredStrike = hoveredStrike == null ? "" : String(hoveredStrike);
    }
    semanticLinesRef.current.forEach((line) => candle.removePriceLine(line));
    const latestClose = data.at(-1)?.close;
    const visibleReferences = visibleScalperV2ReferenceLevels(referenceLevels, sessionBounds);
    const candidates = [
      ...(latestClose != null ? [{ price: latestClose, label: "NIFTY", priority: 100, color: "#0f766e" }] : []),
      ...(selectedStrike != null && levelInObservedSession(selectedStrike, sessionBounds) ? [{ price: selectedStrike, label: "SELECTED CE", priority: 90, color: "#2563eb" }] : []),
      ...(selectedPutStrike != null && levelInObservedSession(selectedPutStrike, sessionBounds) ? [{ price: selectedPutStrike, label: "SELECTED PE", priority: 90, color: "#a86600" }] : []),
      ...maxPainOverlay.visible.map((price) => ({ price, label: "MAX PAIN", priority: 70, color: "#7c3aed" })),
      ...rankLevels.filter((level) => level.rank <= 2 && levelInObservedSession(level.strike, sessionBounds)).map((level) => ({ price: level.strike, label: `${level.side}${level.rank}`, priority: level.rank === 1 ? 60 : 50, color: level.side === "CE" ? "#2563eb" : "#a86600" })),
      ...visibleReferences.map((level) => ({ price: level.value, label: level.shortLabel, priority: level.id === "today-open" || level.id === "previous-day-close" ? 45 : 35, color: level.id.includes("month") ? "#7c3aed" : level.id.includes("week") ? "#d97706" : level.id.includes("day") ? "#64748b" : "#0891b2" })),
      ...(hoveredStrike != null && levelInObservedSession(hoveredStrike, sessionBounds) ? [{ price: hoveredStrike, label: "HOVER", priority: 20, color: "#0f766e" }] : []),
    ];
    const collisionTolerance = sessionBounds && bodyRef.current
      ? Math.max(0.05, (sessionBounds.high - sessionBounds.low) / Math.max(1, bodyRef.current.clientHeight) * 18)
      : 0.05;
    semanticLinesRef.current = mergeScalperV2Levels(candidates, collisionTolerance).map((level) => candle.createPriceLine({ price: level.price, title: level.title, color: level.color, lineWidth: level.priority >= 70 ? 2 : 1, lineStyle: level.priority >= 90 ? 2 : 3, axisLabelVisible: true }));
    if (bodyRef.current) {
      bodyRef.current.dataset.sessionLow = sessionBounds == null ? "" : String(sessionBounds.low);
      bodyRef.current.dataset.sessionHigh = sessionBounds == null ? "" : String(sessionBounds.high);
      bodyRef.current.dataset.maxPainStrikes = maxPainOverlay.candidates.join(",");
      bodyRef.current.dataset.maxPainVisible = maxPainOverlay.visible.join(",");
      bodyRef.current.dataset.referenceLevelsVisible = visibleReferences.map((level) => level.id).join(",");
      bodyRef.current.dataset.referenceLevelsTotal = String(referenceLevels.length);
      bodyRef.current.dataset.maxPainStatus = maxPainOverlay.candidates.length === 0
        ? "unavailable"
        : maxPainOverlay.hidden.length === 0 ? "plotted" : "outside-active-y-range";
    }
  }, [data, hoveredStrike, id, maxPainOverlay, rankLevels, referenceLevels, selectedPutStrike, selectedStrike, sessionBounds]);

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
    const chart = chartRef.current;
    // An exact contract can be selectable before retained candles exist. Keep
    // that pane in its explicit empty state; Lightweight Charts cannot apply a
    // time range to a series with no time points.
    if (!chart || data.length === 0 || !externalRange || externalRange.source === id) return;
    if (hostRef.current) { hostRef.current.dataset.visibleFrom = String(externalRange.from); hostRef.current.dataset.visibleTo = String(externalRange.to); }
    suppressRangeRef.current += 1; chart.timeScale().setVisibleRange({ from: externalRange.from as UTCTimestamp, to: externalRange.to as UTCTimestamp });
    requestAnimationFrame(() => { suppressRangeRef.current = Math.max(0, suppressRangeRef.current - 1); });
  }, [data.length, externalRange, id]);

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
      {drawingTool !== "select" && <div className={css.drawingHint} aria-live="polite">{drawingHint ?? `${drawingAnchorCount(drawingTool)} anchor tool · click first anchor · Esc cancels`}</div>}
      {id === "underlying" && <div className={css.profileCaption} tabIndex={0} data-testid="v2-oi-profile" data-mode={profileMode} aria-label="Change in open interest by strike aligned to the underlying price axis"><div className={css.profileCaptionSummary}><b>ΔOI</b><span className={css.profileIdentity}><i className={css.profileCall} />CE <i className={css.profilePut} />PE</span></div><div className={css.profileCaptionDetails}><span><b>ΔOI by strike</b> · CE blue · PE yellow</span><span>Negative ← 0 → Positive</span><span>Change: green + · red −</span><span>{profileLabel}</span><span>{profileVisibility.visible}/{profileVisibility.total} strikes visible</span>{profileVisibility.total > profileVisibility.visible && <span>Use All strikes Y for off-screen strikes</span>}{maxPainOverlay.candidates.length > 0 && <span data-testid="v2-max-pain-chart-status">Max pain {maxPainOverlay.candidates.map((strike) => strike.toLocaleString("en-IN")).join(" / ")} · {maxPainOverlay.hidden.length === 0 ? "plotted" : "outside active Y range"}</span>}</div></div>}
    </div>
  </section>;
}
