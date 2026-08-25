type RgbTriplet = readonly [number, number, number];

type HeatmapStop = {
  value: number;
  color: RgbTriplet;
};

export type HeatmapMetric = "change" | "rsi" | "willr";

type HeatmapLegendMark = {
  label: string;
  value: number;
};

type HeatmapSemantics = {
  metric: HeatmapMetric;
  legendTitle: string;
  startLabel: string;
  midLabel: string;
  endLabel: string;
  legendHint: string;
  min: number;
  max: number;
  defaultValue: number;
  marks: HeatmapLegendMark[];
  stops: HeatmapStop[];
};

const HEATMAP_SEMANTICS: Record<HeatmapMetric, HeatmapSemantics> = {
  change: {
    metric: "change",
    legendTitle: "Percent change scale",
    startLabel: "Negative breadth",
    midLabel: "Near flat",
    endLabel: "Positive breadth",
    legendHint: "Percent change is clamped to a shared -2% to +2% range so weak, neutral, and strong breadth stay comparable.",
    min: -2,
    max: 2,
    defaultValue: 0,
    marks: [
      { label: "-2%", value: -2 },
      { label: "0%", value: 0 },
      { label: "+2%", value: 2 }
    ],
    stops: [
      { value: -2, color: [255, 23, 68] },
      { value: -1, color: [158, 12, 48] },
      { value: 0, color: [226, 232, 240] },
      { value: 1, color: [0, 155, 88] },
      { value: 2, color: [0, 230, 118] }
    ]
  },
  rsi: {
    metric: "rsi",
    legendTitle: "RSI scale",
    startLabel: "Washed out",
    midLabel: "Balance to trend",
    endLabel: "Extended strength",
    legendHint: "RSI uses the public threshold model: 20 black, 30 red, 40 yellow, 50 green, 70 dark green, 80 white.",
    min: 0,
    max: 100,
    defaultValue: 50,
    marks: [
      { label: "20", value: 20 },
      { label: "30", value: 30 },
      { label: "40", value: 40 },
      { label: "50", value: 50 },
      { label: "70", value: 70 },
      { label: "80", value: 80 }
    ],
    stops: [
      { value: 20, color: [100, 116, 139] },
      { value: 30, color: [255, 23, 68] },
      { value: 40, color: [212, 175, 55] },
      { value: 50, color: [0, 255, 102] },
      { value: 70, color: [0, 102, 41] },
      { value: 80, color: [255, 255, 255] }
    ]
  },
  willr: {
    metric: "willr",
    legendTitle: "WILLR scale",
    startLabel: "Bottom of range",
    midLabel: "Middle of range",
    endLabel: "Top of range",
    legendHint: "Williams %R uses the native range model: -100 black, -80 red, -50 yellow, -30 green, 0 white.",
    min: -100,
    max: 0,
    defaultValue: -50,
    marks: [
      { label: "-100", value: -100 },
      { label: "-80", value: -80 },
      { label: "-50", value: -50 },
      { label: "-30", value: -30 },
      { label: "0", value: 0 }
    ],
    stops: [
      { value: -100, color: [100, 116, 139] },
      { value: -80, color: [255, 23, 68] },
      { value: -50, color: [212, 175, 55] },
      { value: -30, color: [0, 255, 102] },
      { value: 0, color: [255, 255, 255] }
    ]
  }
};

function mix(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function toRgbString([r, g, b]: RgbTriplet) {
  return `rgb(${r} ${g} ${b})`;
}

export function getHeatmapSemantics(metric: HeatmapMetric) {
  return HEATMAP_SEMANTICS[metric];
}

export function getHeatmapColor(metric: HeatmapMetric, rawValue: number) {
  const semantics = HEATMAP_SEMANTICS[metric];
  const value = Math.max(semantics.min, Math.min(semantics.max, rawValue));
  const stops = semantics.stops;

  if (value <= stops[0]!.value) {
    return toRgbString(stops[0]!.color);
  }
  if (value >= stops[stops.length - 1]!.value) {
    return toRgbString(stops[stops.length - 1]!.color);
  }

  for (let index = 1; index < stops.length; index += 1) {
    const prev = stops[index - 1]!;
    const next = stops[index]!;
    if (value <= next.value) {
      const t = (value - prev.value) / (next.value - prev.value);
      const r = Math.round(mix(prev.color[0], next.color[0], t));
      const g = Math.round(mix(prev.color[1], next.color[1], t));
      const b = Math.round(mix(prev.color[2], next.color[2], t));
      return `rgb(${r} ${g} ${b})`;
    }
  }

  return "rgb(255 255 255)";
}

export function getHeatmapGradient(metric: HeatmapMetric) {
  const semantics = HEATMAP_SEMANTICS[metric];
  const spread = semantics.max - semantics.min || 1;
  const stops = semantics.stops
    .map((stop) => {
      const pct = ((stop.value - semantics.min) / spread) * 100;
      return `${toRgbString(stop.color)} ${pct.toFixed(2)}%`;
    })
    .join(", ");
  return `linear-gradient(90deg, ${stops})`;
}
