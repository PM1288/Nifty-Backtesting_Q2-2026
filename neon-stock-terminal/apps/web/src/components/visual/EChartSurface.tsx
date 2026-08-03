import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { CanvasRenderer } from "echarts/renderers";
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent
} from "echarts/components";
import type { EChartsOption, SetOptionOpts } from "echarts";
import { useI18n, useLocale } from "../../i18n/LocaleProvider";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer
]);

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isCompactViewport() {
  return typeof window !== "undefined" && window.innerWidth <= 480;
}

function maxNumeric(value: unknown, minimum: number) {
  return typeof value === "number" ? Math.max(value, minimum) : value;
}

function translateLegendData(data: unknown, translate: (value: string) => string) {
  return asArray<unknown>(data as unknown[]).map((entry) => {
    if (typeof entry === "string") return translate(entry);
    if (entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string") {
      return {
        ...(entry as Record<string, unknown>),
        name: translate((entry as { name: string }).name)
      };
    }
    return entry;
  }) as Array<string | Record<string, unknown>>;
}

function normalizeLegend(legend: unknown, translate: (value: string) => string, fontFamily: string) {
  const compact = isCompactViewport();
  return asArray<Record<string, unknown>>(legend as Record<string, unknown> | Record<string, unknown>[]).map((item) => {
    const translatedData = item.data ? translateLegendData(item.data, translate) : undefined;
    return {
      type: "scroll",
      ...(item.bottom != null
        ? { bottom: item.bottom as string | number, left: (item.left as string | number | undefined) ?? 8, right: (item.right as string | number | undefined) ?? 8 }
        : { top: (item.top as string | number | undefined) ?? 6, left: (item.left as string | number | undefined) ?? 8, right: (item.right as string | number | undefined) ?? 8 }),
      itemWidth: compact ? 10 : 14,
      itemHeight: 3,
      itemGap: compact ? 10 : 16,
      ...(translatedData ? { data: translatedData } : {}),
      textStyle: {
        color: "rgba(255, 255, 255, 0.78)",
        fontFamily,
        fontSize: compact ? 10 : 11,
        ...(item.textStyle as Record<string, unknown> | undefined)
      },
      ...item
    };
  });
}

function hasAxisName(axis: unknown) {
  return asArray<Record<string, unknown>>(axis as Record<string, unknown> | Record<string, unknown>[]).some((item) => {
    const name = item.name;
    return typeof name === "string" ? name.trim().length > 0 : false;
  });
}

function normalizeGrid(
  grid: unknown,
  legends: Record<string, unknown>[],
  xAxis: unknown,
  yAxis: unknown
) {
  const hasTopLegend = legends.some((item) => item.bottom == null);
  const hasBottomLegend = legends.some((item) => item.bottom != null);
  const compact = isCompactViewport();
  const hasXAxisName = hasAxisName(xAxis);
  const hasYAxisName = hasAxisName(yAxis);
  return asArray<Record<string, unknown>>(grid as Record<string, unknown> | Record<string, unknown>[]).map((item) => ({
    containLabel: true,
    top: hasTopLegend ? maxNumeric(item.top, compact ? 72 : 88) : item.top ?? (compact ? 18 : 24),
    left: item.left ?? (hasYAxisName ? (compact ? 86 : 124) : 18),
    right: item.right ?? 18,
    bottom: hasBottomLegend
      ? maxNumeric(item.bottom, hasXAxisName ? (compact ? 96 : 92) : compact ? 76 : 70)
      : item.bottom ?? (hasXAxisName ? (compact ? 60 : 66) : compact ? 38 : 44),
    ...item
  }));
}

function normalizeVisualMap(visualMap: unknown, translate: (value: string) => string, fontFamily: string) {
  const compact = isCompactViewport();
  return asArray<Record<string, unknown>>(visualMap as Record<string, unknown> | Record<string, unknown>[]).map((item) => ({
    orient: "horizontal",
    left: "center",
    bottom: maxNumeric(item.bottom, compact ? 8 : 10),
    calculable: false,
    itemWidth: compact ? 88 : 104,
    itemHeight: compact ? 8 : 9,
    text: Array.isArray(item.text) ? item.text.map((entry) => (typeof entry === "string" ? translate(entry) : entry)) : item.text,
    textStyle: {
      color: "rgba(255, 255, 255, 0.68)",
      fontFamily,
      fontSize: compact ? 9 : 10,
      ...(item.textStyle as Record<string, unknown> | undefined)
    },
    ...item
  }));
}

function normalizeCalendar(calendar: unknown, hasVisualMap: boolean) {
  return asArray<Record<string, unknown>>(calendar as Record<string, unknown> | Record<string, unknown>[]).map((item) => ({
    top: maxNumeric(item.top, 34),
    left: item.left ?? 18,
    right: item.right ?? 18,
    bottom: hasVisualMap ? maxNumeric(item.bottom, 88) : item.bottom ?? 44,
    cellSize: item.cellSize ?? ["auto", 18],
    dayLabel: {
      color: "rgba(255, 255, 255, 0.54)",
      ...((item.dayLabel as Record<string, unknown> | undefined) ?? {})
    },
    monthLabel: {
      color: "rgba(255, 255, 255, 0.78)",
      ...((item.monthLabel as Record<string, unknown> | undefined) ?? {})
    },
    ...item
  }));
}

function normalizeAxis(
  axis: unknown,
  isValueAxis: boolean,
  translate: (value: string) => string,
  fontFamily: string
) {
  const compact = isCompactViewport();
  const baseNameTextStyle = {
    color: "rgba(255, 255, 255, 0.72)",
    fontFamily,
    fontSize: compact ? 10 : 11,
    fontWeight: 600,
    align: isValueAxis ? "left" : "center",
    verticalAlign: isValueAxis ? "bottom" : "middle"
  };
  return asArray<Record<string, unknown>>(axis as Record<string, unknown> | Record<string, unknown>[]).map((item) => ({
    ...(typeof item.name === "string" ? { name: translate(item.name) } : {}),
    axisLabel: {
      color: "rgba(255, 255, 255, 0.68)",
      fontFamily,
      fontSize: compact ? 10 : 11,
      hideOverlap: true,
      margin: compact ? 10 : 12,
      ...(item.axisLabel as Record<string, unknown> | undefined)
    },
    axisLine: {
      show: !isValueAxis,
      lineStyle: {
        color: "rgba(255, 255, 255, 0.08)",
        ...((item.axisLine as { lineStyle?: Record<string, unknown> } | undefined)?.lineStyle ?? {})
      },
      ...(item.axisLine as Record<string, unknown> | undefined)
    },
    axisTick: {
      show: false,
      ...(item.axisTick as Record<string, unknown> | undefined)
    },
    splitLine: isValueAxis
      ? {
          lineStyle: {
            color: "rgba(255, 255, 255, 0.08)",
            ...((item.splitLine as { lineStyle?: Record<string, unknown> } | undefined)?.lineStyle ?? {})
          },
          ...(item.splitLine as Record<string, unknown> | undefined)
        }
      : item.splitLine,
    nameTextStyle: {
      ...baseNameTextStyle,
      ...(item.nameTextStyle as Record<string, unknown> | undefined)
    },
    nameLocation: (item.nameLocation as string | undefined) ?? (isValueAxis ? "end" : "middle"),
    nameGap: isValueAxis ? (compact ? 16 : 20) : (compact ? 32 : 40),
    ...(isValueAxis
      ? {
          nameRotate: (item.nameRotate as number | undefined) ?? 0,
          nameTruncate: item.nameTruncate ?? {
            maxWidth: compact ? 76 : 112
          }
        }
      : {}),
    ...item
  }));
}

function extractNumericValue(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractNumericValue(entry)).filter((entry) => Number.isFinite(entry));
  }
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return extractNumericValue((value as { value?: unknown }).value);
  }
  return [];
}

function extractSeriesAxisValues(series: Record<string, unknown>, axis: "x" | "y"): number[] {
  const axisIndex = axis === "x" ? 0 : 1;
  const seriesType = typeof series.type === "string" ? series.type : "";
  const data = asArray<unknown>(series.data as unknown[] | unknown);

  return data.flatMap((entry) => {
    const candidate = entry && typeof entry === "object" && "value" in (entry as Record<string, unknown>)
      ? (entry as { value?: unknown }).value
      : entry;

    if (Array.isArray(candidate)) {
      if ((seriesType === "scatter" || seriesType === "line") && typeof candidate[axisIndex] === "number" && Number.isFinite(candidate[axisIndex])) {
        return [candidate[axisIndex] as number];
      }
      if (axis === "y") {
        const tail = candidate[candidate.length - 1];
        return typeof tail === "number" && Number.isFinite(tail) ? [tail] : [];
      }
      const head = candidate[0];
      return typeof head === "number" && Number.isFinite(head) ? [head] : [];
    }

    return extractNumericValue(candidate);
  });
}

function normalizeSeries(series: unknown, translate: (value: string) => string) {
  return asArray<Record<string, unknown>>(series as Record<string, unknown> | Record<string, unknown>[]).map((item) => {
    const next: Record<string, unknown> = {
      ...item,
      ...(typeof item.name === "string" ? { name: translate(item.name) } : {})
    };
    const seriesType = typeof item.type === "string" ? item.type : "";

    if (seriesType === "bar") {
      next.itemStyle = {
        ...((item.itemStyle as Record<string, unknown> | undefined) ?? {}),
        borderRadius: 0
      };
      next.emphasis = {
        ...((item.emphasis as Record<string, unknown> | undefined) ?? {}),
        itemStyle: {
          ...(((item.emphasis as { itemStyle?: Record<string, unknown> } | undefined)?.itemStyle) ?? {}),
          borderRadius: 0
        }
      };
    }

    next.label = {
      show: false,
      hideOverlap: true,
      ...(item.label as Record<string, unknown> | undefined)
    };

    return next;
  });
}

function applyValueAxisExtents(option: EChartsOption): EChartsOption {
  const normalizedSeries = asArray<Record<string, unknown>>(option.series as Record<string, unknown> | Record<string, unknown>[] | undefined);
  if (!normalizedSeries.length || option.yAxis == null) return option;

  const yAxes = asArray<Record<string, unknown>>(option.yAxis as Record<string, unknown> | Record<string, unknown>[]);
  const nextAxes = yAxes.map((axis, axisIndex) => {
    if ((axis.type ?? "value") !== "value") return axis;
    if (axis.min != null || axis.max != null) return axis;

    const values = normalizedSeries
      .filter((series) => Number(series.yAxisIndex ?? 0) === axisIndex)
      .flatMap((series) => extractSeriesAxisValues(series, "y"))
      .filter((value) => Number.isFinite(value));

    if (!values.length) return axis;

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = rawMax - rawMin;
    const basePadding = span > 0 ? span * 0.12 : Math.max(Math.abs(rawMax || rawMin || 1) * 0.18, 1);
    const containsBar = normalizedSeries.some((series) => Number(series.yAxisIndex ?? 0) === axisIndex && series.type === "bar");
    const zeroMatters = containsBar || (rawMin < 0 && rawMax > 0);

    return {
      ...axis,
      min: zeroMatters ? Math.min(0, rawMin - basePadding) : rawMin - basePadding,
      max: zeroMatters ? Math.max(0, rawMax + basePadding) : rawMax + basePadding
    };
  });

  return {
    ...option,
    yAxis: Array.isArray(option.yAxis) ? nextAxes : nextAxes[0]
  };
}

function normalizeOption(
  option: EChartsOption,
  translate: (value: string) => string,
  fontFamily: string
): EChartsOption {
  const legends = option.legend != null
    ? normalizeLegend(option.legend, translate, fontFamily)
    : [];
  const hasVisualMap = option.visualMap != null;
  let nextOption: EChartsOption = {
    backgroundColor: "transparent",
    ...option,
    textStyle: {
      color: "rgba(255, 255, 255, 0.78)",
      fontFamily,
      ...(option.textStyle as Record<string, unknown> | undefined)
    },
    tooltip: option.tooltip
      ? {
        backgroundColor: "#000000",
        borderColor: "rgba(255, 255, 255, 0.08)",
        borderWidth: 1,
        textStyle: {
          color: "#ffffff",
          fontFamily,
          fontSize: 11,
            ...((option.tooltip as { textStyle?: Record<string, unknown> } | undefined)?.textStyle ?? {})
          },
          ...option.tooltip
        }
      : option.tooltip
  };

  if (option.title != null) {
    nextOption.title = asArray<Record<string, unknown>>(option.title as Record<string, unknown> | Record<string, unknown>[]).map((item) => ({
      left: 0,
      top: 0,
      ...(typeof item.text === "string" ? { text: translate(item.text) } : {}),
      ...(typeof item.subtext === "string" ? { subtext: translate(item.subtext) } : {}),
      textStyle: {
        color: "#ffffff",
        fontFamily,
        fontSize: 13,
        fontWeight: 700,
        ...(item.textStyle as Record<string, unknown> | undefined)
      },
      subtextStyle: {
        color: "rgba(255, 255, 255, 0.62)",
        fontFamily,
        fontSize: 11,
        lineHeight: 16,
        ...(item.subtextStyle as Record<string, unknown> | undefined)
      },
      ...item
    })) as EChartsOption["title"];
  }

  if (option.legend != null) {
    nextOption.legend = Array.isArray(option.legend) ? legends : legends[0];
  }

  if (option.grid != null) {
    const grid = normalizeGrid(option.grid, legends, option.xAxis, option.yAxis);
    nextOption.grid = (Array.isArray(option.grid) ? grid : grid[0]) as EChartsOption["grid"];
  }

  if (option.visualMap != null) {
    const visualMap = normalizeVisualMap(option.visualMap, translate, fontFamily);
    nextOption.visualMap = (Array.isArray(option.visualMap) ? visualMap : visualMap[0]) as EChartsOption["visualMap"];
  }

  if (option.calendar != null) {
    const calendar = normalizeCalendar(option.calendar, hasVisualMap);
    nextOption.calendar = (Array.isArray(option.calendar) ? calendar : calendar[0]) as EChartsOption["calendar"];
  }

  if (option.xAxis != null) {
    const xAxis = normalizeAxis(option.xAxis, false, translate, fontFamily);
    nextOption.xAxis = (Array.isArray(option.xAxis) ? xAxis : xAxis[0]) as EChartsOption["xAxis"];
  }

  if (option.yAxis != null) {
    const yAxis = normalizeAxis(option.yAxis, true, translate, fontFamily);
    nextOption.yAxis = (Array.isArray(option.yAxis) ? yAxis : yAxis[0]) as EChartsOption["yAxis"];
  }

  if (option.series != null) {
    const series = normalizeSeries(option.series, translate);
    nextOption.series = (Array.isArray(option.series) ? series : series[0]) as EChartsOption["series"];
  }

  nextOption = applyValueAxisExtents(nextOption);

  return nextOption;
}

export function EChartSurface({
  ariaLabel,
  className,
  option,
  setOptionOpts
}: {
  ariaLabel: string;
  className?: string;
  option: EChartsOption;
  setOptionOpts?: SetOptionOpts;
}) {
  const { tr } = useI18n();
  const { language, digits } = useLocale();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const fontFamily = useMemo(
    () =>
      digits === "deva" || language !== "en"
        ? "\"Hind\", \"Noto Sans Devanagari\", \"Inter Variable\", \"Inter\", sans-serif"
        : "\"Inter Variable\", \"Inter\", sans-serif",
    [digits, language]
  );
  const normalizedOption = useMemo(() => normalizeOption(option, tr, fontFamily), [fontFamily, option, tr]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = echarts.init(host, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const resize = () => {
      chart.resize();
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(host);
    }

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(normalizedOption, {
      notMerge: true,
      lazyUpdate: true,
      ...setOptionOpts
    });
  }, [normalizedOption, setOptionOpts]);

  return <div ref={hostRef} className={className} role="img" aria-label={tr(ariaLabel)} data-clarity-unmask="true" />;
}
