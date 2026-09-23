import type { IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesPrimitive, SeriesAttachedParameter, Time, UTCTimestamp } from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

export type ScalperV2TentativeMarker = {
  id: string;
  time: number;
  price: number;
  direction: "up" | "down";
  color: string;
  label: string;
};

type ProjectedMarker = ScalperV2TentativeMarker & { x: number; y: number };

class TentativeMarkerRenderer implements IPrimitivePaneRenderer {
  constructor(private markers: ProjectedMarker[]) {}
  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.save();
      context.beginPath(); context.rect(0, 0, mediaSize.width, mediaSize.height); context.clip();
      context.globalAlpha = 0.4; // 60% transparent, per the tentative-reference contract.
      context.lineWidth = 1.5;
      context.font = "600 10px Inter, sans-serif";
      for (const marker of this.markers) {
        const centerY = marker.y + (marker.direction === "up" ? 12 : -12);
        context.strokeStyle = marker.color;
        context.fillStyle = marker.color;
        context.beginPath();
        if (marker.direction === "up") {
          context.moveTo(marker.x, centerY - 6);
          context.lineTo(marker.x - 6, centerY + 5);
          context.lineTo(marker.x + 6, centerY + 5);
        } else {
          context.moveTo(marker.x, centerY + 6);
          context.lineTo(marker.x - 6, centerY - 5);
          context.lineTo(marker.x + 6, centerY - 5);
        }
        context.closePath();
        context.stroke();
        const labelWidth = context.measureText(marker.label).width;
        const labelY = marker.direction === "up" ? centerY + 17 : centerY - 10;
        context.fillText(marker.label, Math.max(2, Math.min(mediaSize.width - labelWidth - 2, marker.x - labelWidth / 2)), labelY);
      }
      context.restore();
    });
  }
}

class TentativeMarkerPaneView implements IPrimitivePaneView {
  private rendererValue = new TentativeMarkerRenderer([]);
  set(markers: ProjectedMarker[]) { this.rendererValue = new TentativeMarkerRenderer(markers); }
  zOrder() { return "top" as const; }
  renderer() { return this.rendererValue; }
}

export class ScalperV2TentativeMarkerPrimitive implements ISeriesPrimitive<Time> {
  private attachedValue: SeriesAttachedParameter<Time> | null = null;
  private markers: ScalperV2TentativeMarker[] = [];
  private pane = new TentativeMarkerPaneView();

  attached(param: SeriesAttachedParameter<Time>) { this.attachedValue = param; this.updateAllViews(); }
  detached() { this.attachedValue = null; this.pane.set([]); }
  paneViews() { return [this.pane]; }
  autoscaleInfo() { return null; }
  setData(markers: ScalperV2TentativeMarker[]) {
    this.markers = markers.map((marker) => ({ ...marker }));
    this.updateAllViews();
    this.attachedValue?.requestUpdate();
  }
  updateAllViews() {
    const attached = this.attachedValue;
    if (!attached) { this.pane.set([]); return; }
    const projected = this.markers.flatMap((marker): ProjectedMarker[] => {
      const x = attached.chart.timeScale().timeToCoordinate(marker.time as UTCTimestamp);
      const y = attached.series.priceToCoordinate(marker.price);
      return x == null || y == null ? [] : [{ ...marker, x, y }];
    });
    this.pane.set(projected);
  }
}
