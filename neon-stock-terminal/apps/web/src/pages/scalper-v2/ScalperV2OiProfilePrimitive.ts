import type { IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesPrimitive, SeriesAttachedParameter, Time } from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import { layoutScalperV2Profile, type ScalperV2ProfileLayout, type ScalperV2ProfileMode, type ScalperV2ProfileRow } from "../../lib/scalperV2OiProfile";

class ProfileRenderer implements IPrimitivePaneRenderer {
  constructor(private layout: ScalperV2ProfileLayout | null, private mode: ScalperV2ProfileMode) {}
  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const layout = this.layout;
      if (!layout || layout.laneWidth <= 0) return;
      context.save();
      context.beginPath(); context.rect(0, 0, mediaSize.width, mediaSize.height); context.clip();
      const laneLeft = layout.anchorX - layout.laneWidth;
      context.fillStyle = "rgba(71,85,105,.045)"; context.fillRect(laneLeft - 4, 0, layout.laneWidth + 8, mediaSize.height);
      context.strokeStyle = "rgba(71,85,105,.45)"; context.lineWidth = 1;
      context.beginPath(); context.moveTo(layout.anchorX, 0); context.lineTo(layout.anchorX, mediaSize.height); context.stroke();
      for (const bar of layout.bars) {
        const height = 5;
        if (bar.width == null) {
          context.strokeStyle = "#64748b"; context.setLineDash([2, 2]);
          context.strokeRect(layout.anchorX - 7, bar.centerY - height / 2, 7, height); context.setLineDash([]);
          continue;
        }
        if (bar.width === 0) {
          context.strokeStyle = "#64748b"; context.beginPath();
          context.moveTo(layout.anchorX, bar.centerY - height / 2); context.lineTo(layout.anchorX, bar.centerY + height / 2); context.stroke();
          continue;
        }
        const value = this.mode === "change" ? bar.changeOi : bar.currentOi;
        context.fillStyle = this.mode === "change" ? (Number(value) > 0 ? "#117a40" : "#c6283d") : (bar.side === "CE" ? "#2563eb" : "#eab308");
        context.globalAlpha = bar.side === "CE" ? .9 : .68;
        context.fillRect(layout.anchorX - bar.width, bar.centerY - height / 2, bar.width, height);
        context.globalAlpha = 1;
        context.strokeStyle = bar.side === "CE" ? "#1d4ed8" : "#8a6200";
        context.lineWidth = 1; context.setLineDash(bar.side === "PE" ? [3, 2] : []);
        context.strokeRect(layout.anchorX - bar.width, bar.centerY - height / 2, bar.width, height); context.setLineDash([]);
      }
      context.restore();
    });
  }
}

class ProfilePaneView implements IPrimitivePaneView {
  private rendererValue = new ProfileRenderer(null, "change");
  set(layout: ScalperV2ProfileLayout | null, mode: ScalperV2ProfileMode) { this.rendererValue = new ProfileRenderer(layout, mode); }
  zOrder() { return "top" as const; }
  renderer() { return this.rendererValue; }
}

export class ScalperV2OiProfilePrimitive implements ISeriesPrimitive<Time> {
  private attachedValue: SeriesAttachedParameter<Time> | null = null;
  private rows: ScalperV2ProfileRow[] = [];
  private mode: ScalperV2ProfileMode = "change";
  private pane = new ProfilePaneView();
  private layout: ScalperV2ProfileLayout | null = null;

  attached(param: SeriesAttachedParameter<Time>) { this.attachedValue = param; this.updateAllViews(); }
  detached() { this.attachedValue = null; this.layout = null; }
  paneViews() { return [this.pane]; }
  autoscaleInfo() { return null; }
  setData(rows: ScalperV2ProfileRow[], mode: ScalperV2ProfileMode) {
    this.rows = rows.map((row) => ({ ...row })); this.mode = mode;
    this.updateAllViews(); this.attachedValue?.requestUpdate();
  }
  updateAllViews() {
    const attached = this.attachedValue;
    if (!attached) { this.layout = null; this.pane.set(null, this.mode); return; }
    const width = attached.chart.timeScale().width();
    const height = attached.chart.timeScale().height() > 0
      ? Math.max(0, attached.chart.chartElement().clientHeight - attached.chart.timeScale().height())
      : attached.chart.chartElement().clientHeight;
    this.layout = layoutScalperV2Profile(this.rows, this.mode, width, height, (strike) => attached.series.priceToCoordinate(strike));
    this.pane.set(this.layout, this.mode);
  }
  getLayout() { return this.layout; }
}
