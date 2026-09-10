import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { ScalperV2Drawing, ScalperV2DrawingAnchor } from "./scalperV2Drawings";

type Point = { x: number; y: number };

const dash = (style: ScalperV2Drawing["style"]["lineStyle"]) => style === "dashed" ? [7, 5] : style === "dotted" ? [2, 4] : [];
const rgba = (hex: string, alpha: number) => {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#6651d9";
  const value = Number.parseInt(normalized.slice(1), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${Math.max(0, Math.min(1, alpha))})`;
};

class DrawingRenderer implements IPrimitivePaneRenderer {
  constructor(private drawings: ScalperV2Drawing[], private points: Map<string, Point[]>, private selectedId: string | null) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.save();
      for (const drawing of this.drawings) {
        const points = this.points.get(drawing.id); if (!drawing.visible || !points?.length) continue;
        const [a, b, c] = points, style = drawing.style;
        context.strokeStyle = style.color; context.fillStyle = rgba(style.color, style.fillOpacity);
        context.lineWidth = style.lineWidth; context.setLineDash(dash(style.lineStyle)); context.lineCap = "round";
        context.beginPath();
        if (drawing.tool === "horizontal_line") { context.moveTo(0, a.y); context.lineTo(mediaSize.width, a.y); }
        else if (drawing.tool === "horizontal_ray") { context.moveTo(a.x, a.y); context.lineTo(mediaSize.width, a.y); }
        else if (drawing.tool === "vertical_line") { context.moveTo(a.x, 0); context.lineTo(a.x, mediaSize.height); }
        else if ((drawing.tool === "trend_line" || drawing.tool === "trend_ray") && b) {
          context.moveTo(a.x, a.y);
          if (drawing.tool === "trend_ray" && b.x !== a.x) {
            const endX = b.x >= a.x ? mediaSize.width : 0, endY = a.y + (b.y - a.y) * ((endX - a.x) / (b.x - a.x)); context.lineTo(endX, endY);
          } else context.lineTo(b.x, b.y);
        } else if (drawing.tool === "parallel_channel" && b && c) {
          const offsetX = c.x - a.x, offsetY = c.y - a.y;
          context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.moveTo(a.x + offsetX, a.y + offsetY); context.lineTo(b.x + offsetX, b.y + offsetY);
          context.moveTo(a.x, a.y); context.lineTo(a.x + offsetX, a.y + offsetY); context.moveTo(b.x, b.y); context.lineTo(b.x + offsetX, b.y + offsetY);
        } else if (drawing.tool === "rectangle" && b) {
          context.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); context.fill();
        } else if (drawing.tool === "fibonacci" && b) {
          for (const level of [0, .236, .382, .5, .618, 1]) {
            const y = a.y + (b.y - a.y) * level; context.moveTo(Math.min(a.x, b.x), y); context.lineTo(Math.max(a.x, b.x), y);
            context.fillStyle = style.color; context.font = "11px system-ui"; context.fillText(`${(level * 100).toFixed(level === 0 || level === 1 ? 0 : 1)}%`, Math.min(a.x, b.x) + 3, y - 3);
          }
        } else if ((drawing.tool === "measure" || drawing.tool === "long_position" || drawing.tool === "short_position") && b) {
          const left = Math.min(a.x, b.x), width = Math.max(1, Math.abs(b.x - a.x));
          if (drawing.tool === "measure") { context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); }
          else {
            context.fillStyle = rgba("#117a40", .16); context.fillRect(left, Math.min(a.y, b.y), width, Math.abs(b.y - a.y));
            if (c) { context.fillStyle = rgba("#c6283d", .16); context.fillRect(left, Math.min(a.y, c.y), width, Math.abs(c.y - a.y)); context.moveTo(left, c.y); context.lineTo(left + width, c.y); }
            context.moveTo(left, a.y); context.lineTo(left + width, a.y);
            const targetMove = Math.abs(drawing.anchors[1].price - drawing.anchors[0].price), stopMove = Math.abs((drawing.anchors[2]?.price ?? drawing.anchors[0].price) - drawing.anchors[0].price);
            context.fillStyle = "#14243a"; context.font = "600 11px system-ui"; context.fillText(`${drawing.tool === "long_position" ? "Long" : "Short"} plan · R:R ${stopMove > 0 ? (targetMove / stopMove).toFixed(2) : "—"}`, left + 4, a.y - 5);
          }
          const delta = drawing.anchors[1].price - drawing.anchors[0].price;
          context.fillStyle = "#14243a"; context.font = "12px system-ui"; context.fillText(`${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`, b.x + 5, b.y - 5);
        } else if (drawing.tool === "text") {
          context.fillStyle = style.color; context.font = "600 12px system-ui"; context.fillText(drawing.text || "Note", a.x + 5, a.y - 5);
        }
        context.stroke();
        if (this.selectedId === drawing.id) {
          context.setLineDash([]); context.fillStyle = "#fff"; context.strokeStyle = style.color; context.lineWidth = 2;
          for (const point of points) { context.beginPath(); context.arc(point.x, point.y, 4, 0, Math.PI * 2); context.fill(); context.stroke(); }
        }
      }
      context.restore();
    });
  }
}

class DrawingPaneView implements IPrimitivePaneView {
  private rendererValue: DrawingRenderer | null = null;
  set(drawings: ScalperV2Drawing[], points: Map<string, Point[]>, selectedId: string | null) { this.rendererValue = new DrawingRenderer(drawings, points, selectedId); }
  zOrder() { return "top" as const; }
  renderer() { return this.rendererValue; }
}

export class ScalperV2DrawingPrimitive implements ISeriesPrimitive<Time> {
  private attachedValue: SeriesAttachedParameter<Time> | null = null;
  private drawings: ScalperV2Drawing[] = [];
  private selectedId: string | null = null;
  private projected = new Map<string, Point[]>();
  private pane = new DrawingPaneView();

  attached(param: SeriesAttachedParameter<Time>) { this.attachedValue = param; this.updateAllViews(); }
  detached() { this.attachedValue = null; this.projected.clear(); }
  paneViews() { return [this.pane]; }
  autoscaleInfo() { return null; }
  setData(drawings: ScalperV2Drawing[], selectedId: string | null) { this.drawings = drawings; this.selectedId = selectedId; this.updateAllViews(); this.attachedValue?.requestUpdate(); }
  updateAllViews() {
    const attached = this.attachedValue; this.projected = new Map();
    if (attached) for (const drawing of this.drawings) {
      const points = drawing.anchors.flatMap((anchor): Point[] => {
        const x = attached.chart.timeScale().timeToCoordinate(anchor.time as UTCTimestamp), y = attached.series.priceToCoordinate(anchor.price);
        return x == null || y == null ? [] : [{ x, y }];
      });
      if (points.length === drawing.anchors.length) this.projected.set(drawing.id, points);
    }
    this.pane.set(this.drawings, this.projected, this.selectedId);
  }
  hitTest(x: number, y: number) {
    for (const drawing of [...this.drawings].reverse()) {
      if (!drawing.visible) continue;
      const points = this.projected.get(drawing.id) ?? [];
      const distance = Math.min(...points.map((point) => Math.hypot(point.x - x, point.y - y)), Number.POSITIVE_INFINITY);
      if (distance <= 8) return { externalId: drawing.id, zOrder: "top" as const, cursorStyle: drawing.locked ? "not-allowed" : "move", hitTestPriority: 2 };
    }
    return null;
  }
  findAnchor(x: number, y: number): { id: string; anchorIndex: number } | null {
    for (const drawing of [...this.drawings].reverse()) {
      if (!drawing.visible || drawing.locked) continue;
      const points = this.projected.get(drawing.id) ?? [];
      const anchorIndex = points.findIndex((point) => Math.hypot(point.x - x, point.y - y) <= 9);
      if (anchorIndex >= 0) return { id: drawing.id, anchorIndex };
    }
    return null;
  }
}

export function anchorFromChartPoint(param: { time?: Time; point?: Point }, coordinateToPrice: (coordinate: number) => number | null): ScalperV2DrawingAnchor | null {
  if (param.time == null || !param.point) return null;
  const price = coordinateToPrice(param.point.y);
  return price == null || !Number.isFinite(price) ? null : { time: Number(param.time), price };
}
