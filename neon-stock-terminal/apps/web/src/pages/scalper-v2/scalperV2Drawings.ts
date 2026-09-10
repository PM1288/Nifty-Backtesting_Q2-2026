export type ScalperV2PaneRole = "underlying" | "call" | "put";

export type ScalperV2DrawingTool =
  | "select"
  | "horizontal_line"
  | "horizontal_ray"
  | "vertical_line"
  | "trend_line"
  | "trend_ray"
  | "parallel_channel"
  | "rectangle"
  | "fibonacci"
  | "text"
  | "measure"
  | "long_position"
  | "short_position";

export type ScalperV2DrawingAnchor = { time: number; price: number };

export type ScalperV2DrawingStyle = {
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: "solid" | "dashed" | "dotted";
  fillOpacity: number;
};

export type ScalperV2Drawing = {
  id: string;
  tool: Exclude<ScalperV2DrawingTool, "select">;
  paneRole: ScalperV2PaneRole;
  instrumentId: string;
  anchors: ScalperV2DrawingAnchor[];
  style: ScalperV2DrawingStyle;
  text: string;
  visible: boolean;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_DRAWING_STYLE: ScalperV2DrawingStyle = {
  color: "#6651d9",
  lineWidth: 2,
  lineStyle: "solid",
  fillOpacity: 0.12,
};

export const DRAWING_TOOLS: ReadonlyArray<{ tool: ScalperV2DrawingTool; short: string; label: string }> = [
  { tool: "select", short: "↖", label: "Select and move drawings" },
  { tool: "horizontal_line", short: "H", label: "Horizontal line" },
  { tool: "horizontal_ray", short: "H→", label: "Horizontal ray" },
  { tool: "vertical_line", short: "V", label: "Vertical line" },
  { tool: "trend_line", short: "／", label: "Trend line" },
  { tool: "trend_ray", short: "／→", label: "Trend ray" },
  { tool: "parallel_channel", short: "∥", label: "Parallel channel" },
  { tool: "rectangle", short: "□", label: "Rectangle" },
  { tool: "fibonacci", short: "Fib", label: "Fibonacci retracement" },
  { tool: "text", short: "T", label: "Text note" },
  { tool: "measure", short: "M", label: "Free measurement" },
  { tool: "long_position", short: "L", label: "Long risk and reward" },
  { tool: "short_position", short: "S", label: "Short risk and reward" },
];

export function drawingAnchorCount(tool: ScalperV2DrawingTool): number {
  if (tool === "select") return 0;
  if (tool === "parallel_channel" || tool === "long_position" || tool === "short_position") return 3;
  if (tool === "horizontal_line" || tool === "horizontal_ray" || tool === "vertical_line" || tool === "text") return 1;
  return 2;
}

export function createScalperV2Drawing(input: {
  id: string;
  tool: Exclude<ScalperV2DrawingTool, "select">;
  paneRole: ScalperV2PaneRole;
  instrumentId: string;
  anchors: ScalperV2DrawingAnchor[];
  style?: Partial<ScalperV2DrawingStyle>;
  text?: string;
  now?: string;
}): ScalperV2Drawing {
  if (input.anchors.length !== drawingAnchorCount(input.tool)) throw new Error(`Expected ${drawingAnchorCount(input.tool)} anchors for ${input.tool}`);
  if (!input.anchors.every((anchor) => Number.isFinite(anchor.time) && Number.isFinite(anchor.price))) throw new Error("Drawing anchors must contain finite time and price values");
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    tool: input.tool,
    paneRole: input.paneRole,
    instrumentId: input.instrumentId,
    anchors: input.anchors.map((anchor) => ({ ...anchor })),
    style: { ...DEFAULT_DRAWING_STYLE, ...input.style },
    text: input.text ?? (input.tool === "text" ? "Note" : ""),
    visible: true,
    locked: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateScalperV2Drawing(drawing: ScalperV2Drawing, id: string, now = new Date().toISOString()): ScalperV2Drawing {
  return {
    ...drawing,
    id,
    anchors: drawing.anchors.map((anchor) => ({ time: anchor.time, price: anchor.price })),
    text: drawing.text ? `${drawing.text} copy` : "",
    locked: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseScalperV2Drawings(value: string | null): ScalperV2Drawing[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const tools = new Set(DRAWING_TOOLS.map((entry) => entry.tool).filter((tool) => tool !== "select"));
    return parsed.flatMap((candidate): ScalperV2Drawing[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const row = candidate as Partial<ScalperV2Drawing>;
      if (!row.id || !row.tool || !tools.has(row.tool) || !["underlying", "call", "put"].includes(String(row.paneRole))) return [];
      if (!Array.isArray(row.anchors) || row.anchors.length !== drawingAnchorCount(row.tool)) return [];
      if (!row.anchors.every((anchor) => Number.isFinite(anchor?.time) && Number.isFinite(anchor?.price))) return [];
      return [{
        id: String(row.id), tool: row.tool, paneRole: row.paneRole as ScalperV2PaneRole,
        instrumentId: String(row.instrumentId ?? ""), anchors: row.anchors.map((anchor) => ({ time: Number(anchor.time), price: Number(anchor.price) })),
        style: { ...DEFAULT_DRAWING_STYLE, ...(row.style ?? {}) }, text: String(row.text ?? ""),
        visible: row.visible !== false, locked: row.locked === true,
        createdAt: String(row.createdAt ?? ""), updatedAt: String(row.updatedAt ?? ""),
      }];
    });
  } catch {
    return [];
  }
}

export function drawingStorageKey(symbol: string, workspace = "default"): string {
  return `trading-analytics:scalper-v2:drawings:v1:${workspace}:${symbol.toUpperCase()}`;
}
